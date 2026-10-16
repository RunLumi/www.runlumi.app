import type { WorkspaceUser } from "../workspace/roles";
import { AccessError, prepareMemberDisableForOffboarding, workspaceMembers, type MemberRow } from "../workspace/members";
import { HrmError } from "./fields";
import { command, digest, guard, now, requirePermission } from "./service";

export interface OffboardingCase {
  id:string; person_id:string; employment_id:string; employee_user_id:string|null; manager_user_id:string|null;
  ended_on:string; state:string; version:number; actor_id:string; created_at:string; updated_at:string;
  employee_code:string; employee_name:string; department:string; job_title:string;
}
export interface OffboardingTask {
  id:string; case_id:string; task_key:string; assignee_kind:string; assignee_user_id:string|null; state:string;
  required:number; completion_note:string|null; blocked_reason:string|null; completed_by:string|null; completed_at:string|null;
  version:number; actor_id:string; created_at:string; updated_at:string;
}

const canManage=(user:WorkspaceUser)=>user.can("hrm.offboarding.manage")||user.can("users.manage");
function requireOffboarding(user:WorkspaceUser):void{
  if(!canManage(user)&&!user.can("hrm.offboarding.tasks"))throw new HrmError("forbidden",403);
  if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
}

export async function listOffboardingCases(db:D1Database,user:WorkspaceUser):Promise<(OffboardingCase&{task_count:number;open_tasks:number})[]>{
  requireOffboarding(user);
  const managerScope=!canManage(user);
  const name=managerScope?"COALESCE(NULLIF(p.preferred_name,''),'Employee')":"p.legal_name";
  const scope=managerScope?"AND EXISTS(SELECT 1 FROM hrm_offboarding_tasks mine WHERE mine.case_id=c.id AND mine.assignee_user_id=?)":"";
  const params=managerScope?[user.id]:[];
  return (await db.prepare(`SELECT c.*,p.employee_code,${name} AS employee_name,e.department,e.job_title,
      (SELECT COUNT(*) FROM hrm_offboarding_tasks t WHERE t.case_id=c.id) AS task_count,
      (SELECT COUNT(*) FROM hrm_offboarding_tasks t WHERE t.case_id=c.id AND t.state IN ('pending','blocked')) AS open_tasks
    FROM hrm_offboarding_cases c JOIN hrm_people p ON p.id=c.person_id JOIN hrm_employments e ON e.id=c.employment_id
    WHERE 1=1 ${scope} ORDER BY c.ended_on DESC,c.created_at DESC LIMIT 300`).bind(...params).all<OffboardingCase&{task_count:number;open_tasks:number}>()).results;
}

export async function getOffboardingCase(db:D1Database,contentDb:D1Database,user:WorkspaceUser,caseId:string):Promise<{offboarding:OffboardingCase;tasks:OffboardingTask[];member:MemberRow|null}>{
  requireOffboarding(user);
  const managerScope=!canManage(user);
  const name=managerScope?"COALESCE(NULLIF(p.preferred_name,''),'Employee')":"p.legal_name";
  const row=await db.prepare(`SELECT c.*,p.employee_code,${name} AS employee_name,e.department,e.job_title
    FROM hrm_offboarding_cases c JOIN hrm_people p ON p.id=c.person_id JOIN hrm_employments e ON e.id=c.employment_id WHERE c.id=?`).bind(caseId).first<OffboardingCase>();
  if(!row)throw new HrmError("not_found",404);
  if(managerScope){
    const assigned=await db.prepare("SELECT 1 FROM hrm_offboarding_tasks WHERE case_id=? AND assignee_user_id=? LIMIT 1").bind(caseId,user.id).first();
    if(!assigned)throw new HrmError("not_found",404);
  }
  const taskScope=managerScope?" AND assignee_user_id=?":"";
  const taskParams=managerScope?[caseId,user.id]:[caseId];
  const tasks=(await db.prepare(`SELECT * FROM hrm_offboarding_tasks WHERE case_id=?${taskScope} ORDER BY task_key`).bind(...taskParams).all<OffboardingTask>()).results;
  let member:MemberRow|null=null;
  if(user.can("users.manage")&&row.employee_user_id){member=(await workspaceMembers(db,contentDb)).find(item=>item.user_id===row.employee_user_id)??null}
  return {offboarding:row,tasks,member};
}

async function previousCommand(db:D1Database,user:WorkspaceUser,key:string,payload:unknown,operation:string):Promise<string|null>{
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new HrmError("invalid_request_key");
  const row=await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string;result_id:string}>();
  if(!row)return null;
  if(row.operation!==operation||row.payload_hash!==await digest(JSON.stringify(payload)))throw new HrmError("request_key_conflict",409);
  return row.result_id;
}

type OffboardingAction="complete"|"not_required"|"block"|"unblock"|"revoke_access";
export async function actOnOffboardingTask(
  db:D1Database,contentDb:D1Database,user:WorkspaceUser,key:string,caseId:string,taskId:string,expectedVersion:number,action:OffboardingAction,reason:string,confirmed:boolean,
):Promise<void>{
  requireOffboarding(user);
  if(!reason.trim()||reason.length>500)throw new HrmError("reason_required");
  const operation="offboarding_task_action",payload={caseId,taskId,expectedVersion,action,reason:reason.trim(),confirmed};
  const prior=await previousCommand(db,user,key,payload,operation);if(prior)return;
  const task=await db.prepare(`SELECT t.*,c.person_id,c.employment_id,c.employee_user_id,c.manager_user_id,c.state AS case_state,c.version AS case_version
    FROM hrm_offboarding_tasks t JOIN hrm_offboarding_cases c ON c.id=t.case_id WHERE t.id=? AND c.id=?`).bind(taskId,caseId)
    .first<OffboardingTask&{person_id:string;employment_id:string;employee_user_id:string|null;manager_user_id:string|null;case_state:string;case_version:number}>();
  if(!task)throw new HrmError("not_found",404);
  if(task.case_state!=="open")throw new HrmError("offboarding_case_inactive",409);
  if(task.version!==expectedVersion)throw new HrmError("conflict",409);
  if(task.task_key==="payroll_closeout")throw new HrmError("offboarding_payroll_blocked",409);
  if(task.task_key==="workspace_access"&&action!=="revoke_access")throw new HrmError("invalid_action");
  if(task.task_key!=="workspace_access"&&action==="revoke_access")throw new HrmError("invalid_action");
  if(action==="not_required")requirePermission(user,"hrm.offboarding.manage");
  if(action==="revoke_access"){
    requirePermission(user,"users.manage");
    if(!confirmed)throw new HrmError("confirmation_required");
  }else if(task.task_key==="manager_handover"){
    if(task.assignee_user_id!==user.id&&!user.can("hrm.offboarding.manage"))throw new HrmError("offboarding_not_assigned",403);
  }else requirePermission(user,"hrm.offboarding.manage");
  if(!["pending","blocked"].includes(task.state))throw new HrmError("invalid_transition",409);
  if(action==="not_required"&&!(["manager_handover","asset_return"].includes(task.task_key)))throw new HrmError("offboarding_not_waivable",403);
  if(action==="block"&&task.state!=="pending")throw new HrmError("invalid_transition",409);
  if(action==="unblock"&&task.state!=="blocked")throw new HrmError("invalid_transition",409);
  if(task.task_key==="asset_return"&&(action==="complete"||action==="not_required")){
    const openAssets=await db.prepare("SELECT 1 FROM hrm_asset_assignments WHERE person_id=? AND employment_id=? AND state IN ('offered','assigned','return_requested') LIMIT 1")
      .bind(task.person_id,task.employment_id).first();
    if(openAssets)throw new HrmError("offboarding_assets_pending",409);
  }

  let finalState:"completed"|"not_required"|"blocked"|"pending"=action==="not_required"?"not_required":action==="block"?"blocked":action==="unblock"?"pending":"completed";
  let finalNote=reason.trim(),finalBlock:string|null=action==="block"?reason.trim():null;
  let memberDisable:{alreadyDisabled:boolean;guards:{condition:string;params:(string|number|null)[]}[];writes:D1PreparedStatement[]}|null=null;
  if(action==="revoke_access"){
    if(!task.employee_user_id){finalState="not_required";finalNote="No EmDash account was linked to this employment period."}
    else {
      const member=(await workspaceMembers(db,contentDb)).find(item=>item.user_id===task.employee_user_id)??null;
      if(!member||!member.enabled){finalState="not_required";finalNote="Workspace membership was already disabled or absent; no roles were granted."}
      else if(member.admin)throw new HrmError("offboarding_system_admin_protected",403);
      else {
        try{memberDisable=await prepareMemberDisableForOffboarding(db,contentDb,user,member.user_id,reason)}
        catch(error){if(error instanceof AccessError){if(error.message==="already_admin")throw new HrmError("offboarding_system_admin_protected",403);if(error.message==="self")throw new HrmError("offboarding_self_revoke",403);if(error.message==="forbidden")throw new HrmError("forbidden",403)}throw error}
        if(memberDisable.alreadyDisabled){finalState="not_required";finalNote="Workspace membership was already disabled; role grants remain recorded for audit."}
        else
        finalNote=`Workspace membership disabled by System Super Admin. Prior role grants were preserved by the shared Workspace audit contract. Reason: ${reason.trim()}`;
      }
    }
  }
  const time=now();
  const nextCaseStateSql=`CASE WHEN NOT EXISTS(SELECT 1 FROM hrm_offboarding_tasks required WHERE required.case_id=? AND required.required=1 AND required.state NOT IN ('completed','not_required','superseded')) THEN 'completed' ELSE 'open' END`;
  await command(db,user,key,operation,payload,task.case_id,[
    guard(db,"EXISTS(SELECT 1 FROM hrm_offboarding_cases WHERE id=? AND version=? AND state='open')",[task.case_id,task.case_version]),
    guard(db,"EXISTS(SELECT 1 FROM hrm_offboarding_tasks WHERE id=? AND case_id=? AND version=? AND state IN ('pending','blocked'))",[taskId,caseId,expectedVersion]),
    ...(memberDisable&&!memberDisable.alreadyDisabled?memberDisable.guards.map(item=>guard(db,item.condition,item.params)):[]),
  ],[
    ...(memberDisable&&!memberDisable.alreadyDisabled?memberDisable.writes:[]),
    db.prepare("UPDATE hrm_offboarding_tasks SET state=?,completion_note=?,blocked_reason=?,completed_by=?,completed_at=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND case_id=? AND version=?")
      .bind(finalState,finalState==="blocked"?null:finalNote,finalBlock,finalState==="completed"||finalState==="not_required"?user.id:null,finalState==="completed"||finalState==="not_required"?time:null,user.id,time,taskId,caseId,expectedVersion),
    db.prepare(`UPDATE hrm_offboarding_cases SET state=${nextCaseStateSql},version=version+1,actor_id=?,updated_at=?,completed_by=CASE WHEN ${nextCaseStateSql}='completed' THEN ? ELSE completed_by END,completed_at=CASE WHEN ${nextCaseStateSql}='completed' THEN ? ELSE completed_at END WHERE id=? AND state='open' AND version=?`)
      .bind(task.case_id,user.id,time,task.case_id,user.id,task.case_id,time,task.case_id,task.case_version),
    db.prepare("DELETE FROM hrm_write_guards"),
  ]);
}
