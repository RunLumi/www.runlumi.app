import type { WorkspaceUser } from "../workspace/roles";
import { membersWithRolesFor } from "../workspace/members";
import { HrmError } from "./fields";
import { audit, command, enabled, guardBoolean, id, now, requirePermission, settings } from "./service";

export interface TrainingReminderPolicy {id:string;policy_ref:string;legal_entity:string;version_number:number;title_en:string;title_vi:string;days_before_due_json:string;state:"draft"|"reviewed"|"active"|"retired"|"rejected";created_by:string;created_at:string;reviewed_by:string|null;reviewed_at:string|null;review_reason:string|null;activated_by:string|null;activated_at:string|null;version:number;updated_at:string}
export interface TrainingReminder {reminder_ref:string;course_code:string;course_title:string;deadline_kind:"completion"|"renewal";due_on:string;days_before_due:number;state:"unread"|"read"|"resolved";version:number;created_at:string;read_at:string|null;employee_code?:string;employee_name?:string}
export interface TrainingReminderPage {reminders:TrainingReminder[];page:number;hasMore:boolean}

const clean=(value:string,max:number)=>{const result=value.trim();if(!result||result.length>max)throw new HrmError("invalid_field",400);return result};
const live=(user:WorkspaceUser)=>{if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503)};
const reminderReader=(user:WorkspaceUser)=>user.can("hrm.training.self")||user.can("hrm.training.manage");

export function parseTrainingReminderOffsets(value:string):number[]{
  const parts=value.split(",").map(part=>part.trim());
  if(!parts.length||parts.length>12||parts.some(part=>!/^[-]?(?:0|[1-9]\d*)$/.test(part)))throw new HrmError("training_reminder_offsets_invalid",400);
  const days=parts.map(Number);
  if(days.some(day=>!Number.isInteger(day)||day < -365||day > 365)||new Set(days).size!==days.length)throw new HrmError("training_reminder_offsets_invalid",400);
  return days.sort((a,b)=>b-a);
}
function storedOffsets(value:string):number[]{
  let parsed:unknown;try{parsed=JSON.parse(value)}catch{throw new HrmError("training_reminder_offsets_invalid",500)}
  if(!Array.isArray(parsed)||parsed.some(item=>typeof item!=="number"||!Number.isInteger(item)))throw new HrmError("training_reminder_offsets_invalid",500);
  return parseTrainingReminderOffsets(parsed.map(String).join(","));
}

export async function listTrainingReminderPolicies(db:D1Database,user:WorkspaceUser):Promise<TrainingReminderPolicy[]>{
  requirePermission(user,"hrm.training.reminders.manage");
  return (await db.prepare("SELECT * FROM hrm_training_reminder_policy_versions ORDER BY legal_entity,version_number DESC LIMIT 100").all<TrainingReminderPolicy>()).results;
}

export async function createTrainingReminderPolicy(db:D1Database,user:WorkspaceUser,key:string,input:{titleEn:string;titleVi:string;daysBeforeDue:string}):Promise<string>{
  requirePermission(user,"hrm.training.reminders.manage");
  const titleEn=clean(input.titleEn,120),titleVi=clean(input.titleVi,120),days=parseTrainingReminderOffsets(input.daysBeforeDue),config=await settings(db);
  if(!config.legal_entity.trim())throw new HrmError("legal_entity_unconfigured",409);
  const current=await db.prepare("SELECT COALESCE(MAX(version_number),0) AS version FROM hrm_training_reminder_policy_versions WHERE legal_entity=?").bind(config.legal_entity).first<{version:number}>();
  const versionNumber=(current?.version??0)+1,policyId=id("training_reminder_policy"),policyRef=`training-reminder-policy-${crypto.randomUUID()}`,time=now();
  return command(db,user,key,"hrm_training_reminder_policy_create",{legal_entity:config.legal_entity,title_en:titleEn,title_vi:titleVi,days_before_due:days},policyRef,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND legal_entity=? AND version=?) AND NOT EXISTS(SELECT 1 FROM hrm_training_reminder_policy_versions WHERE legal_entity=? AND version_number=?)",[config.legal_entity,config.version,config.legal_entity,versionNumber]),
  ],[
    db.prepare(`INSERT INTO hrm_training_reminder_policy_versions(id,policy_ref,legal_entity,version_number,title_en,title_vi,days_before_due_json,state,created_by,created_at,version,actor_id,updated_at)
      VALUES(?,?,?,?,?,?,?,'draft',?,?,1,?,?)`).bind(policyId,policyRef,config.legal_entity,versionNumber,titleEn,titleVi,JSON.stringify(days),user.id,time,user.id,time),
  ]);
}

async function policyFor(db:D1Database,policyRef:string):Promise<TrainingReminderPolicy>{
  const row=await db.prepare("SELECT * FROM hrm_training_reminder_policy_versions WHERE policy_ref=?").bind(clean(policyRef,120)).first<TrainingReminderPolicy>();
  if(!row)throw new HrmError("not_found",404);return row;
}
export async function reviewTrainingReminderPolicy(db:D1Database,user:WorkspaceUser,key:string,policyRef:string,version:number,decision:"approve"|"reject",reason:string):Promise<void>{
  requirePermission(user,"hrm.training.reminders.approve");const row=await policyFor(db,policyRef);
  if(row.created_by===user.id)throw new HrmError("training_reminder_policy_self_review",403);
  const reviewReason=clean(reason,500),next=decision==="approve"?"reviewed":"rejected",time=now(),payload={policyRef,version,decision,reason:reviewReason};
  await command(db,user,key,"hrm_training_reminder_policy_review",payload,row.id,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_training_reminder_policy_versions WHERE id=? AND version=? AND state='draft' AND created_by!=?)",[row.id,version,user.id]),
  ],[
    db.prepare("UPDATE hrm_training_reminder_policy_versions SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='draft'").bind(next,user.id,time,reviewReason,user.id,time,row.id,version),
  ]);
}
export async function activateTrainingReminderPolicy(db:D1Database,user:WorkspaceUser,key:string,policyRef:string,version:number):Promise<void>{
  requirePermission(user,"hrm.training.reminders.approve");live(user);const row=await policyFor(db,policyRef);
  if(row.created_by===user.id)throw new HrmError("training_reminder_policy_self_review",403);
  const time=now(),payload={policyRef,version};
  await command(db,user,key,"hrm_training_reminder_policy_activate",payload,row.id,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_training_reminder_policy_versions WHERE id=? AND version=? AND state='reviewed' AND created_by!=? AND reviewed_by IS NOT NULL AND reviewed_by!=created_by)",[row.id,version,user.id]),
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND enabled=1 AND reviewed_at IS NOT NULL AND legal_entity=? AND version=?)",[row.legal_entity,(await settings(db)).version]),
  ],[
    db.prepare("UPDATE hrm_training_reminder_policy_versions SET state='retired',version=version+1,actor_id=?,updated_at=? WHERE legal_entity=? AND state='active' AND id!=?").bind(user.id,time,row.legal_entity,row.id),
    db.prepare("UPDATE hrm_training_reminder_policy_versions SET state='active',activated_by=?,activated_at=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='reviewed'").bind(user.id,time,user.id,time,row.id,version),
  ]);
}

export async function listTrainingReminders(db:D1Database,user:WorkspaceUser,page=1):Promise<TrainingReminderPage>{
  if(!reminderReader(user))throw new HrmError("forbidden",403);live(user);
  const currentPage=Number.isFinite(page)?Math.max(1,Math.min(1000,Math.floor(page))):1,employeeDetails=user.can("hrm.training.manage");
  const identity=employeeDetails?"p.employee_code,COALESCE(NULLIF(p.preferred_name,''),p.legal_name) AS employee_name":"NULL AS employee_code,NULL AS employee_name";
  const rows=(await db.prepare(`SELECT r.reminder_ref,r.deadline_kind,r.due_on,r.days_before_due,r.state,r.version,r.created_at,r.read_at,a.course_code,c.title AS course_title,${identity}
    FROM hrm_training_reminders r JOIN hrm_training_assignments a ON a.id=r.assignment_id JOIN hrm_training_courses c ON c.id=a.course_version_id JOIN hrm_people p ON p.id=r.person_id
    WHERE r.recipient_user_id=? AND r.state='unread' AND a.state IN ('assigned','submitted','approved')
    ORDER BY r.due_on,r.created_at DESC,r.id LIMIT 51 OFFSET ?`).bind(user.id,(currentPage-1)*50).all<TrainingReminder>()).results;
  const reminders=rows.slice(0,50);await audit(db,user,"hrm_training_reminders_listed",null,user.id,{count:reminders.length,page:currentPage});
  return {reminders,page:currentPage,hasMore:rows.length>50};
}

export async function markTrainingReminderRead(db:D1Database,user:WorkspaceUser,key:string,reminderRef:string,version:number):Promise<void>{
  if(!reminderReader(user))throw new HrmError("forbidden",403);live(user);
  const ref=clean(reminderRef,120),row=await db.prepare("SELECT id FROM hrm_training_reminders WHERE reminder_ref=? AND recipient_user_id=?").bind(ref,user.id).first<{id:string}>();
  if(!row)throw new HrmError("not_found",404);
  const time=now(),payload={reminderRef:ref,version};
  await command(db,user,key,"hrm_training_reminder_read",payload,row.id,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_training_reminders WHERE id=? AND reminder_ref=? AND recipient_user_id=? AND version=? AND state='unread')",[row.id,ref,user.id,version]),
  ],[
    db.prepare("UPDATE hrm_training_reminders SET state='read',version=version+1,read_by=?,read_at=?,updated_at=? WHERE id=? AND recipient_user_id=? AND version=? AND state='unread'").bind(user.id,time,time,row.id,user.id,version),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'hrm_training_reminder_read',?,?,?)").bind(user.id,ref,JSON.stringify({}),time),
  ]);
}

function localDateAt(scheduledTime:number):string{return new Date(scheduledTime+7*60*60*1000).toISOString().slice(0,10)}
function dateOffset(date:string,offset:number):string{return new Date(Date.parse(`${date}T00:00:00.000Z`)+offset*86400000).toISOString().slice(0,10)}
interface ReminderAssignment {id:string;person_id:string;created_by:string;course_code:string;employee_user_id:string|null}
export async function runHrmTrainingReminderSweep(db:D1Database,contentDb:D1Database,liveFlag:string|undefined,scheduledTime:number):Promise<{created:number;skipped:boolean}>{
  const config=await settings(db);if(!enabled(config,liveFlag))return {created:0,skipped:true};
  const policies=(await db.prepare("SELECT * FROM hrm_training_reminder_policy_versions WHERE legal_entity=? AND state='active' ORDER BY version_number").bind(config.legal_entity).all<TrainingReminderPolicy>()).results;
  if(!policies.length)return {created:0,skipped:true};
  const today=localDateAt(scheduledTime);
  let created=0;
  for(const policy of policies){
    const offsets=storedOffsets(policy.days_before_due_json);
    for(const offset of offsets){
      const deadlineDate=dateOffset(today,offset);
      for(const deadlineKind of ["completion","renewal"] as const){
        let afterId="";
        while(true){
          const condition=deadlineKind==="completion"?"a.state IN ('assigned','submitted') AND a.due_on=?":"a.state='approved' AND a.renew_by=?";
          const assignments=(await db.prepare(`SELECT a.id,a.person_id,a.created_by,a.course_code,p.user_id AS employee_user_id
            FROM hrm_training_assignments a JOIN hrm_people p ON p.id=a.person_id JOIN hrm_employments e ON e.id=a.employment_id AND e.person_id=a.person_id
            WHERE a.legal_entity=? AND ${condition} AND a.id>?
              AND (?='completion' OR NOT EXISTS(SELECT 1 FROM hrm_training_assignments newer
                WHERE newer.person_id=a.person_id AND newer.course_code=a.course_code AND newer.legal_entity=a.legal_entity
                  AND newer.id!=a.id AND newer.state IN ('assigned','submitted')))
              AND e.status IN ('probation','active','notice') AND (e.started_on IS NULL OR e.started_on<=?) AND (e.ended_on IS NULL OR e.ended_on>?)
            ORDER BY a.id LIMIT 200`).bind(policy.legal_entity,deadlineDate,afterId,deadlineKind,today,today).all<ReminderAssignment>()).results;
          if(!assignments.length)break;afterId=assignments[assignments.length-1].id;
          const members=await membersWithRolesFor(db,contentDb,assignments.flatMap(assignment=>[assignment.employee_user_id??"",assignment.created_by]),["employee","hrm_officer","hrm_admin"]),employeeIds=new Set(members.filter(member=>member.roles.includes("employee")).map(member=>member.user_id)),hrIds=new Set(members.filter(member=>member.roles.includes("hrm_officer")||member.roles.includes("hrm_admin")).map(member=>member.user_id));
          const statements:D1PreparedStatement[]=[];
          for(const assignment of assignments){
            const recipients=new Set<string>();
            if(assignment.employee_user_id&&employeeIds.has(assignment.employee_user_id))recipients.add(assignment.employee_user_id);
            if(hrIds.has(assignment.created_by))recipients.add(assignment.created_by);
            for(const recipient of recipients){
              const timestamp=now(),eventKey=`training:${assignment.id}:${deadlineKind}:${deadlineDate}:${offset}:${recipient}`;
              statements.push(db.prepare(`INSERT INTO hrm_training_reminders(id,reminder_ref,assignment_id,person_id,recipient_user_id,policy_version_id,deadline_kind,due_on,days_before_due,event_key,state,version,created_by,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,'unread',1,'system:hrm_training_reminder',?,?)
                ON CONFLICT(assignment_id,recipient_user_id,deadline_kind,due_on,days_before_due) DO NOTHING RETURNING id`)
                .bind(id("trnrem"),`training-reminder-${crypto.randomUUID()}`,assignment.id,assignment.person_id,recipient,policy.id,deadlineKind,deadlineDate,offset,eventKey,timestamp,timestamp));
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
  }
  return {created,skipped:false};
}
