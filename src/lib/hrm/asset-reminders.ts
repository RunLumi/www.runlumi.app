import type { WorkspaceUser } from "../workspace/roles";
import { membersWithRoles } from "../workspace/members";
import { HrmError } from "./fields";
import { command, enabled, guardBoolean, id, now, requirePermission, settings } from "./service";

export interface AssetReminderPolicy {
  id:string;legal_entity:string;version_number:number;title_en:string;title_vi:string;days_before_due_json:string;state:string;
  created_by:string;created_at:string;reviewed_by:string|null;reviewed_at:string|null;review_reason:string|null;
  activated_by:string|null;activated_at:string|null;version:number;updated_at:string;
}
export interface AssetReminder {
  id:string;assignment_id:string;asset_tag:string;description:string;assignment_state:string;due_on:string;
  days_before_due:number;state:"unread"|"read"|"resolved";version:number;created_at:string;read_at:string|null;
}
export interface AssetReminderPage {reminders:AssetReminder[];page:number;hasMore:boolean}

export const HRM_ASSET_REMINDER_CRON="40 1 * * *";
const live=(user:WorkspaceUser)=>{if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503)};
const clean=(value:string,max:number)=>{const result=value.trim();if(!result||result.length>max)throw new HrmError("invalid_field");return result};

export function parseAssetReminderOffsets(value:string):number[]{
  const parts=value.split(",").map(item=>item.trim());
  if(!parts.length||parts.length>12||parts.some(item=>!/^[-]?(?:0|[1-9]\d*)$/.test(item)))throw new HrmError("asset_reminder_days_invalid");
  const days=parts.map(Number);
  if(days.some(day=>!Number.isInteger(day)||day < -365||day > 365)||new Set(days).size!==days.length)throw new HrmError("asset_reminder_days_invalid");
  return days.sort((a,b)=>b-a);
}
function storedOffsets(value:string):number[]{
  let parsed:unknown;try{parsed=JSON.parse(value)}catch{throw new HrmError("asset_reminder_days_invalid")}
  if(!Array.isArray(parsed)||parsed.some(item=>typeof item!=="number"||!Number.isInteger(item)))throw new HrmError("asset_reminder_days_invalid");
  return parseAssetReminderOffsets(parsed.map(String).join(","));
}

export async function listAssetReminderPolicies(db:D1Database,user:WorkspaceUser):Promise<AssetReminderPolicy[]>{
  requirePermission(user,"hrm.assets.reminders.manage");
  return (await db.prepare("SELECT * FROM hrm_asset_reminder_policy_versions ORDER BY legal_entity,version_number DESC LIMIT 100").all<AssetReminderPolicy>()).results;
}

export async function createAssetReminderPolicy(db:D1Database,user:WorkspaceUser,key:string,input:{titleEn:string;titleVi:string;daysBeforeDue:string}):Promise<string>{
  requirePermission(user,"hrm.assets.reminders.manage");
  const titleEn=clean(input.titleEn,120),titleVi=clean(input.titleVi,120),days=parseAssetReminderOffsets(input.daysBeforeDue);
  const config=await settings(db);if(!config.legal_entity.trim())throw new HrmError("legal_entity_unconfigured");
  const current=await db.prepare("SELECT COALESCE(MAX(version_number),0) AS version FROM hrm_asset_reminder_policy_versions WHERE legal_entity=?").bind(config.legal_entity).first<{version:number}>();
  const versionNumber=(current?.version??0)+1,policyId=id("asset_reminder_policy"),time=now();
  await command(db,user,key,"hrm_asset_reminder_policy_create",{legalEntity:config.legal_entity,versionNumber,titleEn,titleVi,days},policyId,[
    guardBoolean(db,"NOT EXISTS(SELECT 1 FROM hrm_asset_reminder_policy_versions WHERE legal_entity=? AND version_number=?)",[config.legal_entity,versionNumber]),
  ],[
    db.prepare(`INSERT INTO hrm_asset_reminder_policy_versions(id,legal_entity,version_number,title_en,title_vi,days_before_due_json,state,created_by,created_at,version,actor_id,updated_at)
      VALUES(?,?,?,?,?,?,'draft',?,?,1,?,?)`).bind(policyId,config.legal_entity,versionNumber,titleEn,titleVi,JSON.stringify(days),user.id,time,user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'asset_reminder_policy_created',?,?,?)")
      .bind(user.id,policyId,JSON.stringify({legal_entity:config.legal_entity,version_number:versionNumber,days_before_due:days}),time),
  ]);
  return policyId;
}

export async function reviewAssetReminderPolicy(db:D1Database,user:WorkspaceUser,key:string,policyId:string,version:number,decision:"approve"|"reject",reason:string):Promise<void>{
  requirePermission(user,"hrm.assets.reminders.approve");
  const cleanReason=clean(reason,500),row=await db.prepare("SELECT * FROM hrm_asset_reminder_policy_versions WHERE id=?").bind(policyId).first<AssetReminderPolicy>();
  if(!row)throw new HrmError("not_found",404);
  if(row.created_by===user.id)throw new HrmError("asset_reminder_policy_self_review",403);
  if(row.state!=="draft"||row.version!==version)throw new HrmError("conflict",409);
  const time=now(),next=decision==="approve"?"reviewed":"rejected",payload={policyId,version,decision,reason:cleanReason};
  await command(db,user,key,"hrm_asset_reminder_policy_review",payload,policyId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_asset_reminder_policy_versions WHERE id=? AND version=? AND state='draft' AND created_by!=?)",[policyId,version,user.id]),
  ],[
    db.prepare("UPDATE hrm_asset_reminder_policy_versions SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='draft'")
      .bind(next,user.id,time,cleanReason,user.id,time,policyId,version),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,?,?,?,?)")
      .bind(user.id,`asset_reminder_policy_${next}`,policyId,JSON.stringify({reason_recorded:true}),time),
  ]);
}

export async function activateAssetReminderPolicy(db:D1Database,user:WorkspaceUser,key:string,policyId:string,version:number):Promise<void>{
  requirePermission(user,"hrm.assets.reminders.approve");
  const row=await db.prepare("SELECT * FROM hrm_asset_reminder_policy_versions WHERE id=?").bind(policyId).first<AssetReminderPolicy>();
  if(!row)throw new HrmError("not_found",404);
  if(row.created_by===user.id)throw new HrmError("asset_reminder_policy_self_review",403);
  if(row.state!=="reviewed"||row.version!==version||!row.reviewed_by||row.reviewed_by===row.created_by)throw new HrmError("asset_reminder_policy_not_reviewed",409);
  const time=now(),payload={policyId,version};
  await command(db,user,key,"hrm_asset_reminder_policy_activate",payload,policyId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_asset_reminder_policy_versions WHERE id=? AND version=? AND state='reviewed' AND created_by!=? AND reviewed_by IS NOT NULL)",[policyId,version,user.id]),
  ],[
    db.prepare("UPDATE hrm_asset_reminder_policy_versions SET state='retired',version=version+1,actor_id=?,updated_at=? WHERE legal_entity=? AND state='active' AND id!=?").bind(user.id,time,row.legal_entity,policyId),
    db.prepare("UPDATE hrm_asset_reminder_policy_versions SET state='active',activated_by=?,activated_at=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='reviewed'").bind(user.id,time,user.id,time,policyId,version),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'asset_reminder_policy_activated',?,?,?)").bind(user.id,policyId,JSON.stringify({legal_entity:row.legal_entity,version_number:row.version_number}),time),
  ]);
}

export async function listAssetReminders(db:D1Database,user:WorkspaceUser,page=1):Promise<AssetReminderPage>{
  live(user);
  if(!user.can("hrm.assets.self")&&!user.can("hrm.assets.manage"))throw new HrmError("forbidden",403);
  const requested=Number(page),currentPage=Number.isFinite(requested)?Math.max(1,Math.min(400,Math.floor(requested))):1;
  const rows=(await db.prepare(`SELECT n.id,n.assignment_id,a.asset_tag,a.description,x.state AS assignment_state,n.due_on,n.days_before_due,n.state,n.version,n.created_at,n.read_at
    FROM hrm_asset_reminders n JOIN hrm_asset_assignments x ON x.id=n.assignment_id JOIN hrm_assets a ON a.id=x.asset_id
    WHERE n.recipient_user_id=? AND n.state='unread' AND x.state IN ('assigned','return_requested')
    ORDER BY n.due_on,n.created_at,n.id LIMIT 51 OFFSET ?`).bind(user.id,(currentPage-1)*50).all<AssetReminder>()).results;
  return {reminders:rows.slice(0,50),page:currentPage,hasMore:rows.length>50};
}

export async function markAssetReminderRead(db:D1Database,user:WorkspaceUser,key:string,reminderId:string,version:number):Promise<void>{
  live(user);
  const row=await db.prepare("SELECT id,version,state FROM hrm_asset_reminders WHERE id=? AND recipient_user_id=?").bind(reminderId,user.id).first<{id:string;version:number;state:string}>();
  if(!row)throw new HrmError("not_found",404);
  if(row.state!=="unread"||row.version!==version)throw new HrmError("conflict",409);
  const time=now(),payload={reminderId,version};
  await command(db,user,key,"hrm_asset_reminder_read",payload,reminderId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_asset_reminders WHERE id=? AND recipient_user_id=? AND version=? AND state='unread')",[reminderId,user.id,version]),
  ],[
    db.prepare("UPDATE hrm_asset_reminders SET state='read',version=version+1,read_by=?,read_at=?,updated_at=? WHERE id=? AND recipient_user_id=? AND version=? AND state='unread'").bind(user.id,time,time,reminderId,user.id,version),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'hrm_asset_reminder_read',?,?,?)").bind(user.id,reminderId,JSON.stringify({}),time),
  ]);
}

function localDateAt(scheduledTime:number):string{return new Date(scheduledTime+7*60*60*1000).toISOString().slice(0,10)}

/** Creates in-app reminders only for a reviewed/active, owner-configured schedule. */
export async function runHrmAssetReminderSweep(db:D1Database,contentDb:D1Database,liveFlag:string|undefined,scheduledTime:number):Promise<{created:number;skipped:boolean}>{
  const config=await settings(db);if(!enabled(config,liveFlag))return {created:0,skipped:true};
  const today=localDateAt(scheduledTime),policies=(await db.prepare("SELECT * FROM hrm_asset_reminder_policy_versions WHERE state='active' ORDER BY legal_entity").all<AssetReminderPolicy>()).results;
  if(!policies.length)return {created:0,skipped:true};
  const recipients=await membersWithRoles(db,contentDb,["employee","hrm_officer","hrm_admin"]),employeeIds=new Set(recipients.filter(m=>m.roles.includes("employee")).map(m=>m.user_id)),hrIds=new Set(recipients.filter(m=>m.roles.includes("hrm_officer")||m.roles.includes("hrm_admin")).map(m=>m.user_id));
  let created=0;
  for(const policy of policies){
    const offsets=storedOffsets(policy.days_before_due_json);
    for(const offset of offsets){
      const dueDate=new Date(Date.parse(`${today}T00:00:00Z`)+offset*86_400_000).toISOString().slice(0,10);
      let afterId="";
      while(true){
        const assignments=(await db.prepare(`SELECT x.id,x.asset_id,x.person_id,x.expected_return_on,x.offered_by,p.user_id AS employee_user_id
          FROM hrm_asset_assignments x JOIN hrm_assets a ON a.id=x.asset_id JOIN hrm_people p ON p.id=x.person_id
          WHERE a.legal_entity=? AND x.state IN ('assigned','return_requested') AND x.expected_return_on=? AND x.id>?
          ORDER BY x.id LIMIT 200`)
          .bind(policy.legal_entity,dueDate,afterId).all<{id:string;asset_id:string;person_id:string;expected_return_on:string;offered_by:string;employee_user_id:string|null}>()).results;
        if(!assignments.length)break;
        afterId=assignments[assignments.length-1].id;
        const statements:D1PreparedStatement[]=[];
        for(const assignment of assignments){
          const targets=new Set<string>();
          if(assignment.employee_user_id&&employeeIds.has(assignment.employee_user_id))targets.add(assignment.employee_user_id);
          if(hrIds.has(assignment.offered_by))targets.add(assignment.offered_by);
          for(const recipient of targets){
            const eventKey=`asset:${assignment.id}:${assignment.expected_return_on}:${offset}:${recipient}`,timestamp=now();
            statements.push(db.prepare(`INSERT INTO hrm_asset_reminders(id,assignment_id,asset_id,person_id,recipient_user_id,policy_version_id,due_on,days_before_due,event_key,state,version,created_by,created_at,updated_at)
              VALUES(?,?,?,?,?,?,?,?,?,'unread',1,'system:hrm_asset_reminder',?,?) ON CONFLICT(assignment_id,recipient_user_id,due_on,days_before_due) DO NOTHING RETURNING id`)
              .bind(id("assetrem"),assignment.id,assignment.asset_id,assignment.person_id,recipient,policy.id,assignment.expected_return_on,offset,eventKey,timestamp,timestamp));
          }
        }
        for(let index=0;index<statements.length;index+=50){
          const result=await db.batch(statements.slice(index,index+50));
          created+=result.reduce((sum,item)=>sum+(Array.isArray(item.results)?item.results.length:Number(item.meta?.changes??0)),0);
        }
        if(assignments.length<200)break;
      }
    }
  }
  return {created,skipped:false};
}
