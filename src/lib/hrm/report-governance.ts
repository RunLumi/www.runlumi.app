import { ROLE_PERMISSIONS, workspaceUserFor, type Permission, type WorkspaceUser } from "../workspace/roles";
import { HrmError, date } from "./fields";
import { command, guardBoolean, id, localDate, now, requirePermission, settings } from "./service";

export interface ReportPolicy {
 id:string;policy_ref:string;legal_entity:string;class_code:string;capture_kind:"manual"|"daily"|"weekly"|"monthly";
 department:string|null;title_en:string;title_vi:string;purpose:string;jurisdiction:string;
 source_version_id:string|null;source_checksum:string|null;owner_user_id:string;retention_days:number;
 effective_from:string;effective_until:string;version_number:number;state:"draft"|"reviewed"|"active"|"retired"|"rejected";
 created_by:string;created_at:string;reviewed_by:string|null;reviewed_at:string|null;review_reason:string|null;
 activated_by:string|null;activated_at:string|null;version:number;actor_id:string;updated_at:string;
}
export interface ReportPolicyInput {
 classCode:string;captureKind:string;department?:string|null;titleEn:string;titleVi:string;purpose:string;jurisdiction:string;
 sourceVersionId?:string|null;ownerUserId:string;retentionDays:number;effectiveFrom:string;effectiveUntil:string;
}
export interface ReportHold {
 id:string;hold_ref:string;legal_entity:string;scope_kind:"entity"|"class"|"snapshot"|"schedule";class_code:string|null;
 snapshot_id:string|null;schedule_id:string|null;period:string|null;department_mode:"all"|"exact";department:string|null;
 reason:string;state:"active"|"released";placed_by:string;placed_at:string;released_by:string|null;released_at:string|null;
 release_reason:string|null;version:number;
}
const text=(value:string,max:number)=>{const result=value.trim();if(!result||result.length>max||/[\u0000-\u001f\u007f]/u.test(result))throw new HrmError("invalid_field",400);return result};
const optional=(value:string|null|undefined,max:number)=>value?.trim()?text(value,max):null;
const rolesFor=(permission:Permission)=>Object.entries(ROLE_PERMISSIONS).filter(([,p])=>p.includes(permission)).map(([role])=>role);
const employmentPredicate=`(NOT EXISTS(SELECT 1 FROM hrm_people WHERE user_id=?) OR EXISTS(SELECT 1 FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id WHERE p.user_id=? AND e.status!='ended' AND (e.started_on IS NULL OR e.started_on<=?) AND (e.ended_on IS NULL OR e.ended_on>?) AND e.id=(SELECT latest.id FROM hrm_employments latest WHERE latest.person_id=p.id ORDER BY CASE WHEN latest.status!='ended' THEN 0 ELSE 1 END,latest.started_on DESC,latest.created_at DESC,latest.id DESC LIMIT 1)))`;
const employmentParams=(userId:string)=>[userId,userId,localDate(),localDate()];
/** D1 membership and capabilities are checked again in the mutation transaction. EmDash status is checked immediately beforehand. */
export function reportAuthority(db:D1Database,user:WorkspaceUser,permission:Permission):D1PreparedStatement[]{
 requirePermission(user,permission);const employment=guardBoolean(db,employmentPredicate,employmentParams(user.id));if(user.admin)return [employment];
 const roles=rolesFor(permission);
 return [employment,guardBoolean(db,`EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role IN (${roles.map(()=>"?").join(",")}))`,[user.id,...roles])];
}
export async function reportAccount(db:D1Database,content:D1Database,userId:string,permission:Permission):Promise<WorkspaceUser>{
 const account=await content.prepare("SELECT id,name,email,role FROM users WHERE id=? AND disabled=0").bind(userId).first<{id:string;name:string|null;email:string;role:number}>();
 const user=account?await workspaceUserFor(db,account):null;
 if(!user?.can(permission)||!await db.prepare(`SELECT 1 WHERE ${employmentPredicate}`).bind(...employmentParams(userId)).first())throw new HrmError("report_account_unavailable",409);return user;
}
function event(db:D1Database,user:WorkspaceUser,ref:string,action:string,detail:unknown,time:string):D1PreparedStatement{
 return db.prepare("INSERT INTO hrm_report_governance_events(target_ref,event_type,detail_json,actor_id,created_at) VALUES(?,?,?,?,?)").bind(ref,action,JSON.stringify(detail),user.id,time);
}
async function policyFor(db:D1Database,ref:string,entity:string):Promise<ReportPolicy>{
 const row=await db.prepare("SELECT * FROM hrm_report_policy_versions WHERE policy_ref=? AND legal_entity=?").bind(text(ref,120),entity).first<ReportPolicy>();
 if(!row)throw new HrmError("not_found",404);return row;
}
const sourcePredicate=`EXISTS(SELECT 1 FROM hrm_legal_template_versions v JOIN hrm_legal_files f ON f.id=v.source_file_id
 WHERE v.id=p.source_version_id AND v.legal_entity=p.legal_entity AND v.source_checksum=p.source_checksum
 AND v.state IN ('reviewed','active','retired') AND v.reviewed_by IS NOT NULL AND v.reviewed_by!=v.created_by
 AND f.state='reviewed' AND f.kind='docx_source' AND f.checksum=v.source_checksum AND f.object_deleted_at IS NULL)`;

export async function listReportPolicies(db:D1Database,user:WorkspaceUser):Promise<ReportPolicy[]>{
 requirePermission(user,"hrm.reports.manage");const config=await settings(db);
 return (await db.prepare("SELECT * FROM hrm_report_policy_versions WHERE legal_entity=? ORDER BY created_at DESC,id DESC LIMIT 100").bind(config.legal_entity).all<ReportPolicy>()).results;
}
export async function createReportPolicy(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,input:ReportPolicyInput):Promise<string>{
 requirePermission(user,"hrm.reports.manage");await reportAccount(db,content,user.id,"hrm.reports.manage");
 const config=await settings(db);if(!config.legal_entity.trim())throw new HrmError("hrm_entity_unconfigured",409);
 const classCode=text(input.classCode,48),captureKind=input.captureKind,department=optional(input.department,120);
 if(!/^[A-Z0-9][A-Z0-9_-]*$/.test(classCode)||!["manual","daily","weekly","monthly"].includes(captureKind))throw new HrmError("report_policy_invalid",400);
 if(!Number.isInteger(input.retentionDays)||input.retentionDays<1||input.retentionDays>36500)throw new HrmError("report_retention_invalid",400);
 if(!date(input.effectiveFrom)||!date(input.effectiveUntil)||input.effectiveUntil<input.effectiveFrom)throw new HrmError("invalid_date",400);
 const owner=await reportAccount(db,content,text(input.ownerUserId,120),"hrm.reports.read");
 const sourceId=optional(input.sourceVersionId,120);
 const source=sourceId?await db.prepare("SELECT source_checksum FROM hrm_legal_template_versions WHERE id=? AND legal_entity=?").bind(sourceId,config.legal_entity).first<{source_checksum:string}>():null;
 if(sourceId&&!source)throw new HrmError("report_policy_source_invalid",409);
 const values={legal_entity:config.legal_entity,class_code:classCode,capture_kind:captureKind,department,title_en:text(input.titleEn,120),title_vi:text(input.titleVi,120),purpose:text(input.purpose,1000),jurisdiction:text(input.jurisdiction,300),source_version_id:sourceId,source_checksum:source?.source_checksum??null,owner_user_id:owner.id,retention_days:input.retentionDays,effective_from:input.effectiveFrom,effective_until:input.effectiveUntil};
 const current=await db.prepare("SELECT COALESCE(MAX(version_number),0) AS n FROM hrm_report_policy_versions WHERE legal_entity=? AND class_code=? AND capture_kind=? AND department IS ?").bind(config.legal_entity,classCode,captureKind,department).first<{n:number}>();
 const version=(current?.n??0)+1,ref=`report-policy-${crypto.randomUUID()}`,time=now();
 return command(db,user,key,"hrm_report_policy_create",values,ref,[...reportAuthority(db,user,"hrm.reports.manage"),...reportAuthority(db,owner,"hrm.reports.read"),guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND legal_entity=? AND version=?)",[config.legal_entity,config.version])],[
  db.prepare(`INSERT INTO hrm_report_policy_versions(id,policy_ref,legal_entity,class_code,capture_kind,department,title_en,title_vi,purpose,jurisdiction,source_version_id,source_checksum,owner_user_id,retention_days,effective_from,effective_until,version_number,created_by,created_at,actor_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id("report_policy"),ref,...Object.values(values),version,user.id,time,user.id,time),
  event(db,user,ref,"policy_created",{version_number:version},time),
 ]);
}
export async function actOnReportPolicy(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,input:{policyRef:string;version:number;action:"approve"|"reject"|"activate"|"retire";reason:string}):Promise<void>{
 requirePermission(user,"hrm.reports.policy.approve");await reportAccount(db,content,user.id,"hrm.reports.policy.approve");
 const config=await settings(db),row=await policyFor(db,input.policyRef,config.legal_entity),reason=text(input.reason,500),time=now();
 if(!["approve","reject","activate","retire"].includes(input.action)||!Number.isSafeInteger(input.version)||input.version<1)throw new HrmError("invalid_field",400);
 if(row.created_by===user.id)throw new HrmError("report_policy_self_review",403);
 const expected=input.action==="approve"||input.action==="reject"?"draft":input.action==="activate"?"reviewed":"active";
 const next=input.action==="approve"?"reviewed":input.action==="reject"?"rejected":input.action==="activate"?"active":"retired";
 const guards=[...reportAuthority(db,user,"hrm.reports.policy.approve"),guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND legal_entity=? AND version=?)",[row.legal_entity,config.version]),guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_report_policy_versions WHERE id=? AND version=? AND state=? AND created_by!=?)",[row.id,input.version,expected,user.id])];
 if(input.action==="approve"||input.action==="activate"){
  const owner=await reportAccount(db,content,row.owner_user_id,"hrm.reports.read");guards.push(...reportAuthority(db,owner,"hrm.reports.read"),guardBoolean(db,`EXISTS(SELECT 1 FROM hrm_report_policy_versions p WHERE p.id=? AND ${sourcePredicate})`,[row.id]));
 }
 if(input.action==="activate"&&row.effective_until<localDate())throw new HrmError("report_policy_expired",409);
 const writes:D1PreparedStatement[]=[];
 if(input.action==="activate")writes.push(db.prepare("UPDATE hrm_report_policy_versions SET state='retired',version=version+1,actor_id=?,updated_at=? WHERE legal_entity=? AND class_code=? AND capture_kind=? AND department IS ? AND state='active' AND id!=?").bind(user.id,time,row.legal_entity,row.class_code,row.capture_kind,row.department,row.id));
 const review=input.action==="approve"||input.action==="reject",activate=input.action==="activate";
 writes.push(db.prepare(`UPDATE hrm_report_policy_versions SET state=?,version=version+1,actor_id=?,updated_at=?${review?",reviewed_by=?,reviewed_at=?,review_reason=?":""}${activate?",activated_by=?,activated_at=?":""} WHERE id=? AND version=? AND state=?`).bind(next,user.id,time,...(review?[user.id,time,reason]:[]),...(activate?[user.id,time]:[]),row.id,input.version,expected),event(db,user,row.policy_ref,`policy_${input.action}`,{reason},time));
 await command(db,user,key,"hrm_report_policy_action",input,row.policy_ref,guards,writes);
}
export async function listReportHolds(db:D1Database,user:WorkspaceUser):Promise<ReportHold[]>{
 requirePermission(user,"hrm.reports.holds.manage");const config=await settings(db);
 return (await db.prepare("SELECT * FROM hrm_report_holds WHERE legal_entity=? ORDER BY placed_at DESC,id DESC LIMIT 100").bind(config.legal_entity).all<ReportHold>()).results;
}
export interface ReportHoldInput {scopeKind:"entity"|"class"|"snapshot"|"schedule";targetRef?:string;period?:string|null;departmentMode:"all"|"exact";department?:string|null;reason:string}
export async function placeReportHold(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,input:ReportHoldInput):Promise<string>{
 requirePermission(user,"hrm.reports.holds.manage");await reportAccount(db,content,user.id,"hrm.reports.holds.manage");
 const config=await settings(db);if(!config.legal_entity.trim())throw new HrmError("hrm_entity_unconfigured",409);
 if(!["entity","class","snapshot","schedule"].includes(input.scopeKind)||!["all","exact"].includes(input.departmentMode))throw new HrmError("report_hold_invalid",400);
 const period=optional(input.period,7),department=optional(input.department,120),reason=text(input.reason,1000);
 if(period&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||input.departmentMode==="all"&&department)throw new HrmError("report_hold_invalid",400);
 let target:string|null=null;
 if(input.scopeKind==="snapshot"||input.scopeKind==="schedule"){
  const snapshot=input.scopeKind==="snapshot",table=snapshot?"hrm_report_snapshots":"hrm_report_schedules",ref=snapshot?"snapshot_ref":"schedule_ref";
  const row=await db.prepare(`SELECT id FROM ${table} WHERE ${ref}=? AND legal_entity=?${snapshot?" AND state='active'":""}`).bind(text(input.targetRef??"",120),config.legal_entity).first<{id:string}>();
  if(!row)throw new HrmError("not_found",404);target=row.id;
 }else if(input.scopeKind==="class"){target=text(input.targetRef??"",48);if(!/^[A-Z0-9][A-Z0-9_-]*$/.test(target))throw new HrmError("report_hold_invalid",400)}
 else if(input.targetRef?.trim())throw new HrmError("report_hold_invalid",400);
 const ref=`report-hold-${crypto.randomUUID()}`,time=now();
 return command(db,user,key,"hrm_report_hold_place",{...input,legal_entity:config.legal_entity},ref,[...reportAuthority(db,user,"hrm.reports.holds.manage"),guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND legal_entity=? AND version=?)",[config.legal_entity,config.version])],[
  db.prepare("INSERT INTO hrm_report_holds(id,hold_ref,legal_entity,scope_kind,class_code,snapshot_id,schedule_id,period,department_mode,department,reason,placed_by,placed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id("report_hold"),ref,config.legal_entity,input.scopeKind,input.scopeKind==="class"?target:null,input.scopeKind==="snapshot"?target:null,input.scopeKind==="schedule"?target:null,period,input.departmentMode,department,reason,user.id,time),event(db,user,ref,"hold_placed",{scope_kind:input.scopeKind},time),
 ]);
}
export async function releaseReportHold(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,input:{holdRef:string;version:number;reason:string}):Promise<void>{
 requirePermission(user,"hrm.reports.holds.release");await reportAccount(db,content,user.id,"hrm.reports.holds.release");
 const config=await settings(db),row=await db.prepare("SELECT * FROM hrm_report_holds WHERE hold_ref=? AND legal_entity=?").bind(text(input.holdRef,120),config.legal_entity).first<ReportHold>();if(!row)throw new HrmError("not_found",404);
 if(row.placed_by===user.id)throw new HrmError("report_hold_self_release",403);
 const reason=text(input.reason,500),time=now();
 await command(db,user,key,"hrm_report_hold_release",input,row.hold_ref,[...reportAuthority(db,user,"hrm.reports.holds.release"),guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND legal_entity=? AND version=?)",[config.legal_entity,config.version]),guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_report_holds WHERE id=? AND version=? AND state='active' AND placed_by!=?)",[row.id,input.version,user.id])],[
  db.prepare("UPDATE hrm_report_holds SET state='released',released_by=?,released_at=?,release_reason=?,version=version+1 WHERE id=? AND version=? AND state='active'").bind(user.id,time,reason,row.id,input.version),event(db,user,row.hold_ref,"hold_released",{},time),
 ]);
}

/** Resolve approved terms before capture; the database trigger rechecks state, scope and dates on insertion. */
export async function reportPolicyForCapture(db:D1Database,content:D1Database,ref:string,entity:string,kind:string,department:string|null):Promise<{policy:ReportPolicy;owner:WorkspaceUser}>{
 const policy=await policyFor(db,ref,entity),today=localDate();
 if(policy.state!=="active"||policy.capture_kind!==kind||(policy.department!==null&&policy.department!==department)||today<policy.effective_from||today>policy.effective_until)throw new HrmError("report_policy_required",409);
 const owner=await reportAccount(db,content,policy.owner_user_id,"hrm.reports.read");return {policy,owner};
}
