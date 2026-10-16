import type { WorkspaceUser } from "../workspace/roles";
import { HrmError, date } from "./fields";
import { readLegalUpload } from "./legal-files";
import { audit, command, digest, guardBoolean, id, localDate, now, requirePermission } from "./service";

export const HRM_TRAINING_CATEGORIES=["compliance","role","professional","development","certification","other"] as const;
export type HrmTrainingCategory=typeof HRM_TRAINING_CATEGORIES[number];
export type HrmTrainingCourseState="draft"|"active"|"retired";
export type HrmTrainingAssignmentState="assigned"|"submitted"|"approved"|"declined"|"cancelled";

export interface HrmTrainingCourse {
  id:string;course_code:string;version_no:number;legal_entity:string;category:HrmTrainingCategory;title:string;description:string;
  evidence_required:number;renewal_days:number|null;state:HrmTrainingCourseState;revision:number;created_by:string;created_at:string;
  reviewed_by:string|null;reviewed_at:string|null;updated_by:string;updated_at:string;
}
export interface HrmTrainingAssignment {
  id:string;course_version_id:string;course_code:string;course_version_no:number;legal_entity:string;category:HrmTrainingCategory;
  evidence_required:number;renewal_days:number|null;person_id:string;employment_id:string;due_on:string|null;renew_by:string|null;
  state:HrmTrainingAssignmentState;employee_note:string;submitted_at:string|null;created_by:string;created_at:string;reviewed_by:string|null;
  reviewed_at:string|null;review_reason:string;revision:number;actor_id:string;updated_at:string;employee_code?:string;display_name?:string;course_title?:string;
}
export interface HrmTrainingEvidence {
  id:string;assignment_id:string;file_id:string;person_id:string;uploaded_by:string;created_at:string;original_name:string;mime_type:string;
  size_bytes:number;checksum:string;state:"quarantined"|"reviewed"|"rejected";version:number;reviewed_by:string|null;reviewed_at:string|null;
  review_reason:string|null;object_deleted_at:string|null;
}
export interface HrmTrainingPerson {id:string;employee_code:string;display_name:string;legal_entity:string;department:string;job_title:string;user_id:string}
export interface HrmTrainingDashboard {courses:HrmTrainingCourse[];assignments:HrmTrainingAssignment[];evidence:Record<string,HrmTrainingEvidence[]>;people?:HrmTrainingPerson[]}

const live=(user:WorkspaceUser)=>{if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503)};
const clean=(value:string,max:number,required=true)=>{const result=value.trim();if(result.length>max||(required&&!result))throw new HrmError("invalid_field");return result};
function category(value:string):HrmTrainingCategory{if(!(HRM_TRAINING_CATEGORIES as readonly string[]).includes(value))throw new HrmError("training_category_invalid");return value as HrmTrainingCategory}
function evidenceMap(rows:HrmTrainingEvidence[]):Record<string,HrmTrainingEvidence[]>{const result:Record<string,HrmTrainingEvidence[]>={};for(const row of rows)(result[row.assignment_id]??=[]).push(row);return result}
async function evidenceForAssignments(db:D1Database,assignments:HrmTrainingAssignment[]):Promise<Record<string,HrmTrainingEvidence[]>>{
  if(!assignments.length)return {};
  const ids=assignments.map(row=>row.id),marks=ids.map(()=>"?").join(",");
  const rows=(await db.prepare(`SELECT l.id,l.assignment_id,l.file_id,l.person_id,l.uploaded_by,l.created_at,f.original_name,f.mime_type,f.size_bytes,f.checksum,f.state,f.version,f.reviewed_by,f.reviewed_at,f.review_reason,f.object_deleted_at
    FROM hrm_training_evidence_links l JOIN hrm_files f ON f.id=l.file_id WHERE l.assignment_id IN (${marks}) ORDER BY l.created_at,l.id`)
    .bind(...ids).all<HrmTrainingEvidence>()).results;
  return evidenceMap(rows);
}
async function currentEmployee(db:D1Database,user:WorkspaceUser):Promise<{person_id:string;employment_id:string;legal_entity:string}>{
  const row=await db.prepare(`SELECT p.id AS person_id,e.id AS employment_id,e.legal_entity FROM hrm_people p
    JOIN hrm_employments e ON e.person_id=p.id AND e.id=(SELECT e2.id FROM hrm_employments e2 WHERE e2.person_id=p.id ORDER BY CASE WHEN e2.status!='ended' THEN 0 ELSE 1 END,e2.started_on DESC,e2.created_at DESC LIMIT 1)
    JOIN workspace_members m ON m.user_id=p.user_id AND m.enabled=1 JOIN workspace_roles r ON r.user_id=m.user_id AND r.role='employee'
    WHERE p.user_id=? AND e.status IN ('probation','active','notice') AND (e.started_on IS NULL OR e.started_on<=date('now','+7 hours')) AND (e.ended_on IS NULL OR e.ended_on>date('now','+7 hours')) LIMIT 1`)
    .bind(user.id).first<{person_id:string;employment_id:string;legal_entity:string}>();
  if(!row)throw new HrmError("not_found",404);return row;
}
async function assignmentFor(db:D1Database,user:WorkspaceUser,assignmentId:string):Promise<HrmTrainingAssignment&{employee_user_id:string|null}>{
  const row=await db.prepare(`SELECT a.*,c.title AS course_title,p.employee_code,COALESCE(NULLIF(p.preferred_name,''),p.legal_name) AS display_name,p.user_id AS employee_user_id
    FROM hrm_training_assignments a JOIN hrm_training_courses c ON c.id=a.course_version_id JOIN hrm_people p ON p.id=a.person_id WHERE a.id=?`).bind(assignmentId)
    .first<HrmTrainingAssignment&{employee_user_id:string|null}>();
  if(!row)throw new HrmError("not_found",404);
  if(!user.can("hrm.training.manage")&&!(user.can("hrm.training.self")&&row.employee_user_id===user.id))throw new HrmError("not_found",404);
  live(user);return row;
}

async function listTrainingPeople(db:D1Database):Promise<HrmTrainingPerson[]>{
  return (await db.prepare(`SELECT p.id,p.employee_code,COALESCE(NULLIF(p.preferred_name,''),p.legal_name) AS display_name,e.legal_entity,e.department,e.job_title,p.user_id
    FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id AND e.id=(SELECT e2.id FROM hrm_employments e2 WHERE e2.person_id=p.id ORDER BY CASE WHEN e2.status!='ended' THEN 0 ELSE 1 END,e2.started_on DESC,e2.created_at DESC LIMIT 1)
    JOIN workspace_members m ON m.user_id=p.user_id AND m.enabled=1 JOIN workspace_roles r ON r.user_id=m.user_id AND r.role='employee'
    WHERE e.status IN ('probation','active','notice') AND (e.started_on IS NULL OR e.started_on<=date('now','+7 hours')) AND (e.ended_on IS NULL OR e.ended_on>date('now','+7 hours'))
    ORDER BY e.legal_entity,p.employee_code LIMIT 500`).all<HrmTrainingPerson>()).results;
}

export async function listManagedTraining(db:D1Database,user:WorkspaceUser):Promise<HrmTrainingDashboard>{
  requirePermission(user,"hrm.training.manage");live(user);
  const [courses,assignments,people]=await Promise.all([
    db.prepare("SELECT * FROM hrm_training_courses ORDER BY legal_entity,course_code,version_no DESC LIMIT 300").all<HrmTrainingCourse>(),
    db.prepare(`SELECT a.*,c.title AS course_title,p.employee_code,COALESCE(NULLIF(p.preferred_name,''),p.legal_name) AS display_name
      FROM hrm_training_assignments a JOIN hrm_training_courses c ON c.id=a.course_version_id JOIN hrm_people p ON p.id=a.person_id
      ORDER BY CASE a.state WHEN 'submitted' THEN 0 WHEN 'assigned' THEN 1 ELSE 2 END,a.due_on,a.created_at DESC LIMIT 300`).all<HrmTrainingAssignment>(),
    listTrainingPeople(db),
  ]);
  const rows=assignments.results,evidence=await evidenceForAssignments(db,rows);
  await audit(db,user,"hrm_training_management_listed",null,"training",{course_count:courses.results.length,assignment_count:rows.length});
  return {courses:courses.results,assignments:rows,evidence,people};
}

export async function listMyTraining(db:D1Database,user:WorkspaceUser):Promise<HrmTrainingDashboard>{
  requirePermission(user,"hrm.training.self");live(user);const employee=await currentEmployee(db,user);
  const assignments=(await db.prepare(`SELECT a.*,c.title AS course_title,p.employee_code,COALESCE(NULLIF(p.preferred_name,''),'Employee') AS display_name
    FROM hrm_training_assignments a JOIN hrm_training_courses c ON c.id=a.course_version_id JOIN hrm_people p ON p.id=a.person_id
    WHERE a.person_id=? ORDER BY CASE a.state WHEN 'submitted' THEN 0 WHEN 'assigned' THEN 1 ELSE 2 END,a.due_on,a.created_at DESC LIMIT 100`)
    .bind(employee.person_id).all<HrmTrainingAssignment>()).results;
  const evidence=await evidenceForAssignments(db,assignments);
  await audit(db,user,"hrm_training_self_listed",employee.person_id,user.id,{assignment_count:assignments.length});
  return {courses:[],assignments,evidence};
}

export async function createTrainingCourse(db:D1Database,user:WorkspaceUser,key:string,input:{courseCode:string;legalEntity:string;category:string;title:string;description:string;evidenceRequired:boolean;renewalDays:string}):Promise<string>{
  requirePermission(user,"hrm.training.manage");live(user);
  const courseCode=clean(input.courseCode,48).toUpperCase(),legalEntity=clean(input.legalEntity,200),kind=category(input.category),title=clean(input.title,160),description=clean(input.description,2000);
  if(!/^[A-Z0-9][A-Z0-9._-]{1,47}$/.test(courseCode))throw new HrmError("training_course_code_invalid");
  const renewalDays=input.renewalDays?Number(input.renewalDays):null;if(renewalDays!==null&&(!Number.isInteger(renewalDays)||renewalDays<1||renewalDays>36500))throw new HrmError("training_renewal_invalid");
  const settings=await db.prepare("SELECT legal_entity FROM hrm_settings WHERE id=1").first<{legal_entity:string|null}>();if(!settings?.legal_entity||settings.legal_entity!==legalEntity)throw new HrmError("hrm_entity_unconfigured",409);
  const last=await db.prepare("SELECT COALESCE(MAX(version_no),0) AS version_no FROM hrm_training_courses WHERE legal_entity=? AND course_code=?").bind(legalEntity,courseCode).first<{version_no:number}>();
  const versionNo=(last?.version_no??0)+1,courseId=id("training_course"),time=now(),payload={courseCode,versionNo,legalEntity,category:kind,title,description,evidenceRequired:input.evidenceRequired,renewalDays};
  return command(db,user,key,"hrm_training_course_create",payload,courseId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND legal_entity=?)",[legalEntity]),
    guardBoolean(db,"COALESCE((SELECT MAX(version_no)+1 FROM hrm_training_courses WHERE legal_entity=? AND course_code=?),1)=?",[legalEntity,courseCode,versionNo]),
    guardBoolean(db,"?=1 OR EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role IN ('hrm_officer','hrm_admin'))",[user.admin?1:0,user.id]),
  ],[
    db.prepare(`INSERT INTO hrm_training_courses(id,course_code,version_no,legal_entity,category,title,description,evidence_required,renewal_days,state,revision,created_by,created_at,updated_by,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,'draft',1,?,?,?,?)`).bind(courseId,courseCode,versionNo,legalEntity,kind,title,description,input.evidenceRequired?1:0,renewalDays,user.id,time,user.id,time),
    db.prepare("INSERT INTO hrm_training_events(id,course_version_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,'course_created',?,?,?)").bind(id("trainingev"),courseId,JSON.stringify({course_code:courseCode,version_no:versionNo,legal_entity:legalEntity}),user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'hrm_training_course_created',?,?,?)").bind(user.id,courseId,JSON.stringify({course_code:courseCode,version_no:versionNo}),time),
  ]);
}

export async function activateTrainingCourse(db:D1Database,user:WorkspaceUser,key:string,courseId:string,expectedRevision:number,reason:string):Promise<void>{
  requirePermission(user,"hrm.training.approve");live(user);
  const row=await db.prepare("SELECT * FROM hrm_training_courses WHERE id=?").bind(courseId).first<HrmTrainingCourse>();if(!row)throw new HrmError("not_found",404);
  if(row.created_by===user.id)throw new HrmError("training_self_review",403);if(row.state!=="draft"||row.revision!==expectedRevision)throw new HrmError("conflict",409);
  const cleanReason=clean(reason,1000),time=now(),payload={courseId,expectedRevision,reason:cleanReason},prior=await db.prepare("SELECT id,revision FROM hrm_training_courses WHERE legal_entity=? AND course_code=? AND state='active' LIMIT 1").bind(row.legal_entity,row.course_code).first<{id:string;revision:number}>(),writes:D1PreparedStatement[]=[];
  if(prior){
    writes.push(db.prepare("UPDATE hrm_training_courses SET state='retired',revision=revision+1,updated_by=?,updated_at=? WHERE id=? AND state='active' AND revision=?").bind(user.id,time,prior.id,prior.revision));
    writes.push(db.prepare("INSERT INTO hrm_training_events(id,course_version_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,'course_retired',?,?,?)").bind(id("trainingev"),prior.id,JSON.stringify({replacement_course_id:courseId}),user.id,time));
  }
  writes.push(
    db.prepare("UPDATE hrm_training_courses SET state='active',revision=revision+1,reviewed_by=?,reviewed_at=?,updated_by=?,updated_at=? WHERE id=? AND state='draft' AND revision=?").bind(user.id,time,user.id,time,courseId,expectedRevision),
    db.prepare("INSERT INTO hrm_training_events(id,course_version_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,'course_activated',?,?,?)").bind(id("trainingev"),courseId,JSON.stringify({reason:cleanReason,previous_course_id:prior?.id??null}),user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'hrm_training_course_activated',?,?,?)").bind(user.id,courseId,JSON.stringify({previous_course_id:prior?.id??null,reason_recorded:true}),time),
  );
  await command(db,user,key,"hrm_training_course_activate",payload,courseId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_training_courses WHERE id=? AND state='draft' AND revision=? AND created_by!=?)",[courseId,expectedRevision,user.id]),
    guardBoolean(db,"NOT EXISTS(SELECT 1 FROM hrm_training_assignments a JOIN hrm_training_courses c ON c.id=a.course_version_id WHERE c.legal_entity=? AND c.course_code=? AND c.state='active' AND a.state IN ('assigned','submitted'))",[row.legal_entity,row.course_code]),
    guardBoolean(db,"?=1 OR EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role='hrm_admin')",[user.admin?1:0,user.id]),
  ],writes);
}

export async function assignTraining(db:D1Database,user:WorkspaceUser,key:string,input:{courseId:string;personId:string;dueOn:string}):Promise<string>{
  requirePermission(user,"hrm.training.manage");live(user);const dueOn=date(input.dueOn),course=await db.prepare("SELECT * FROM hrm_training_courses WHERE id=?").bind(input.courseId).first<HrmTrainingCourse>();
  if(!course||course.state!=="active")throw new HrmError("training_course_inactive",409);
  const person=await db.prepare(`SELECT p.id,p.user_id,e.id AS employment_id,e.legal_entity,e.status,e.started_on,e.ended_on
    FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id AND e.id=(SELECT e2.id FROM hrm_employments e2 WHERE e2.person_id=p.id ORDER BY CASE WHEN e2.status!='ended' THEN 0 ELSE 1 END,e2.started_on DESC,e2.created_at DESC LIMIT 1)
    WHERE p.id=?`).bind(input.personId).first<{id:string;user_id:string|null;employment_id:string;legal_entity:string;status:string;started_on:string|null;ended_on:string|null}>();
  const today=localDate();if(!person||!person.user_id||person.legal_entity!==course.legal_entity||!("probation active notice".split(" ").includes(person.status))||(person.ended_on&&person.ended_on<=today)||(person.started_on&&person.started_on>today))throw new HrmError("training_employee_invalid",409);
  if(person.user_id===user.id)throw new HrmError("training_self_assignment",403);
  const assignmentId=id("training_assignment"),time=now(),payload={courseId:course.id,personId:person.id,employmentId:person.employment_id,dueOn};
  return command(db,user,key,"hrm_training_assignment_create",payload,assignmentId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_training_courses WHERE id=? AND state='active')",[course.id]),
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id JOIN workspace_members m ON m.user_id=p.user_id AND m.enabled=1 JOIN workspace_roles r ON r.user_id=m.user_id AND r.role='employee' WHERE p.id=? AND p.user_id=? AND e.id=? AND e.legal_entity=? AND e.status IN ('probation','active','notice') AND (e.started_on IS NULL OR e.started_on<=?) AND (e.ended_on IS NULL OR e.ended_on>?))",[person.id,person.user_id,person.employment_id,course.legal_entity,today,today]),
    guardBoolean(db,"NOT EXISTS(SELECT 1 FROM hrm_training_assignments WHERE person_id=? AND course_code=? AND state IN ('assigned','submitted'))",[person.id,course.course_code]),
    guardBoolean(db,"?=1 OR EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role IN ('hrm_officer','hrm_admin'))",[user.admin?1:0,user.id]),
  ],[
    db.prepare(`INSERT INTO hrm_training_assignments(id,course_version_id,course_code,course_version_no,legal_entity,category,evidence_required,renewal_days,person_id,employment_id,due_on,state,created_by,created_at,revision,actor_id,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,'assigned',?,?,1,?,?)`).bind(assignmentId,course.id,course.course_code,course.version_no,course.legal_entity,course.category,course.evidence_required,course.renewal_days,person.id,person.employment_id,dueOn,user.id,time,user.id,time),
    db.prepare("INSERT INTO hrm_training_events(id,course_version_id,assignment_id,person_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,?,?,'assignment_created',?,?,?)").bind(id("trainingev"),course.id,assignmentId,person.id,JSON.stringify({due_on:dueOn}),user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'hrm_training_assigned',?,?,?,?)").bind(user.id,person.id,assignmentId,JSON.stringify({course_code:course.course_code,course_version:course.version_no}),time),
  ]);
}

export async function submitTrainingCompletion(db:D1Database,user:WorkspaceUser,key:string,assignmentId:string,expectedRevision:number,note:string):Promise<void>{
  requirePermission(user,"hrm.training.self");live(user);const row=await assignmentFor(db,user,assignmentId);if(row.employee_user_id!==user.id)throw new HrmError("not_found",404);
  if(row.state!=="assigned"||row.revision!==expectedRevision)throw new HrmError("conflict",409);
  if(row.evidence_required&&!await db.prepare("SELECT 1 FROM hrm_training_evidence_links l JOIN hrm_files f ON f.id=l.file_id WHERE l.assignment_id=? AND f.state='reviewed' AND f.object_deleted_at IS NULL LIMIT 1").bind(assignmentId).first())throw new HrmError("training_evidence_required",409);
  const employeeNote=clean(note,1000,false),time=now(),payload={assignmentId,expectedRevision,note:employeeNote};
  await command(db,user,key,"hrm_training_completion_submit",payload,assignmentId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_training_assignments a JOIN hrm_people p ON p.id=a.person_id JOIN workspace_members m ON m.user_id=p.user_id AND m.enabled=1 JOIN workspace_roles r ON r.user_id=m.user_id AND r.role='employee' WHERE a.id=? AND a.revision=? AND a.state='assigned' AND p.user_id=? AND a.employment_id IN (SELECT e.id FROM hrm_employments e WHERE e.person_id=p.id AND e.status IN ('probation','active','notice') AND (e.started_on IS NULL OR e.started_on<=date('now','+7 hours')) AND (e.ended_on IS NULL OR e.ended_on>date('now','+7 hours'))))",[assignmentId,expectedRevision,user.id]),
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_training_assignments WHERE id=? AND evidence_required=0) OR EXISTS(SELECT 1 FROM hrm_training_assignments a JOIN hrm_training_evidence_links l ON l.assignment_id=a.id JOIN hrm_files f ON f.id=l.file_id WHERE a.id=? AND f.state='reviewed' AND f.object_deleted_at IS NULL)",[assignmentId,assignmentId]),
  ],[
    db.prepare("UPDATE hrm_training_assignments SET state='submitted',employee_note=?,submitted_at=?,revision=revision+1,actor_id=?,updated_at=? WHERE id=? AND revision=? AND state='assigned'").bind(employeeNote,time,user.id,time,assignmentId,expectedRevision),
    db.prepare("INSERT INTO hrm_training_events(id,course_version_id,assignment_id,person_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,?,?,'assignment_submitted',?,?,?)").bind(id("trainingev"),row.course_version_id,assignmentId,row.person_id,JSON.stringify({evidence_required:row.evidence_required}),user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'hrm_training_completion_submitted',?,?,?,?)").bind(user.id,row.person_id,assignmentId,JSON.stringify({course_code:row.course_code}),time),
  ]);
}

export async function decideTrainingCompletion(db:D1Database,user:WorkspaceUser,key:string,assignmentId:string,expectedRevision:number,decision:string,reason:string):Promise<void>{
  requirePermission(user,"hrm.training.approve");live(user);if(decision!=="approve"&&decision!=="decline")throw new HrmError("invalid_action",400);
  const row=await assignmentFor(db,user,assignmentId);if(row.created_by===user.id||row.actor_id===user.id)throw new HrmError("training_self_review",403);
  if(row.state!=="submitted"||row.revision!==expectedRevision)throw new HrmError("conflict",409);
  if(decision==="approve"&&row.evidence_required&&!await db.prepare("SELECT 1 FROM hrm_training_evidence_links l JOIN hrm_files f ON f.id=l.file_id WHERE l.assignment_id=? AND f.state='reviewed' AND f.object_deleted_at IS NULL LIMIT 1").bind(assignmentId).first())throw new HrmError("training_evidence_required",409);
  const cleanReason=clean(reason,1000),next=decision==="approve"?"approved":"declined",time=now();
  const renewal=next==="approved"&&row.renewal_days!==null?new Date(Date.parse(`${localDate()}T00:00:00Z`)+row.renewal_days*86400000).toISOString().slice(0,10):null;
  await command(db,user,key,"hrm_training_completion_decide",{assignmentId,expectedRevision,decision,reason:cleanReason},assignmentId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_training_assignments WHERE id=? AND revision=? AND state='submitted' AND created_by!=? AND actor_id!=?)",[assignmentId,expectedRevision,user.id,user.id]),
    guardBoolean(db,"?=1 OR EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role='hrm_admin')",[user.admin?1:0,user.id]),
    ...(next==="approved"?[guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_training_assignments a JOIN hrm_training_evidence_links l ON l.assignment_id=a.id JOIN hrm_files f ON f.id=l.file_id WHERE a.id=? AND (a.evidence_required=0 OR f.state='reviewed' AND f.object_deleted_at IS NULL))",[assignmentId])]:[]),
    ...(next==="approved"?[guardBoolean(db,"NOT EXISTS(SELECT 1 FROM hrm_training_evidence_links l JOIN hrm_files f ON f.id=l.file_id WHERE l.assignment_id=? AND (l.uploaded_by=? OR EXISTS(SELECT 1 FROM hrm_training_assignments a WHERE a.id=l.assignment_id AND a.created_by=?)))",[assignmentId,user.id,user.id])]:[]),
  ],[
    db.prepare("UPDATE hrm_training_assignments SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,renew_by=?,revision=revision+1,actor_id=?,updated_at=? WHERE id=? AND revision=? AND state='submitted'").bind(next,user.id,time,cleanReason,renewal,user.id,time,assignmentId,expectedRevision),
    db.prepare("INSERT INTO hrm_training_events(id,course_version_id,assignment_id,person_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id("trainingev"),row.course_version_id,assignmentId,row.person_id,`assignment_${next}`,JSON.stringify({reason:cleanReason,renew_by:renewal}),user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,`hrm_training_completion_${next}`,row.person_id,assignmentId,JSON.stringify({course_code:row.course_code,reason_recorded:true}),time),
  ]);
}

export async function cancelTrainingAssignment(db:D1Database,user:WorkspaceUser,key:string,assignmentId:string,expectedRevision:number,reason:string):Promise<void>{
  requirePermission(user,"hrm.training.manage");live(user);const row=await assignmentFor(db,user,assignmentId);if(row.state!=="assigned"||row.revision!==expectedRevision)throw new HrmError("conflict",409);
  const cleanReason=clean(reason,1000),time=now(),payload={assignmentId,expectedRevision,reason:cleanReason};
  await command(db,user,key,"hrm_training_assignment_cancel",payload,assignmentId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_training_assignments WHERE id=? AND revision=? AND state='assigned')",[assignmentId,expectedRevision]),
    guardBoolean(db,"?=1 OR EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role IN ('hrm_officer','hrm_admin'))",[user.admin?1:0,user.id]),
  ],[
    db.prepare("UPDATE hrm_training_assignments SET state='cancelled',review_reason=?,revision=revision+1,actor_id=?,updated_at=? WHERE id=? AND revision=? AND state='assigned'").bind(cleanReason,user.id,time,assignmentId,expectedRevision),
    db.prepare("INSERT INTO hrm_training_events(id,course_version_id,assignment_id,person_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,?,?,'assignment_cancelled',?,?,?)").bind(id("trainingev"),row.course_version_id,assignmentId,row.person_id,JSON.stringify({reason:cleanReason}),user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'hrm_training_assignment_cancelled',?,?,?,?)").bind(user.id,row.person_id,assignmentId,JSON.stringify({reason_recorded:true}),time),
  ]);
}

export async function listTrainingEvidence(db:D1Database,user:WorkspaceUser,assignmentId:string):Promise<HrmTrainingEvidence[]>{
  const row=await assignmentFor(db,user,assignmentId);
  const evidence=(await db.prepare(`SELECT l.id,l.assignment_id,l.file_id,l.person_id,l.uploaded_by,l.created_at,f.original_name,f.mime_type,f.size_bytes,f.checksum,f.state,f.version,f.reviewed_by,f.reviewed_at,f.review_reason,f.object_deleted_at
    FROM hrm_training_evidence_links l JOIN hrm_files f ON f.id=l.file_id WHERE l.assignment_id=? ORDER BY l.created_at DESC LIMIT 20`).bind(assignmentId).all<HrmTrainingEvidence>()).results;
  await audit(db,user,"hrm_training_evidence_listed",row.person_id,assignmentId,{count:evidence.length});return evidence;
}

export async function uploadTrainingEvidence(db:D1Database,bucket:R2Bucket,user:WorkspaceUser,key:string,assignmentId:string,file:File):Promise<string>{
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new HrmError("invalid_request_key");
  const assignment=await assignmentFor(db,user,assignmentId);
  if(!["assigned","submitted"].includes(assignment.state))throw new HrmError("training_assignment_inactive",409);
  const self=user.can("hrm.training.self")&&assignment.employee_user_id===user.id,manager=user.can("hrm.training.manage");if(!self&&!manager)throw new HrmError("not_found",404);
  const uploaded=await readLegalUpload(file,"pdf_evidence"),name=file.name.replace(/[\u0000-\u001f\u007f"\\/]/g,"_").slice(0,160)||"training-certificate.pdf",checksum=await digest(uploaded.bytes),fileId=id("training_file"),linkId=id("training_evidence_link"),time=now();
  const payload={assignmentId,assignmentRevision:assignment.revision,checksum,size:file.size,name};
  const payloadHash=await digest(JSON.stringify(payload)),previous=await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string;result_id:string}>();
  if(previous){if(previous.operation!=="hrm_training_evidence_upload"||previous.payload_hash!==payloadHash)throw new HrmError("request_key_conflict",409);return previous.result_id}
  const objectKey=`hrm/${assignment.person_id}/training-evidence/${fileId}`;
  await bucket.put(objectKey,uploaded.bytes,{httpMetadata:{contentType:"application/pdf"},customMetadata:{checksum,assignment_id:assignmentId,kind:"training_evidence"}});
  try{
    const committed=await command(db,user,key,"hrm_training_evidence_upload",payload,linkId,[
      guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_training_assignments a JOIN hrm_people p ON p.id=a.person_id WHERE a.id=? AND a.revision=? AND a.state IN ('assigned','submitted') AND (?=1 OR EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role IN ('hrm_officer','hrm_admin')) OR (p.user_id=? AND EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role='employee'))))",[assignmentId,assignment.revision,user.admin?1:0,user.id,user.id,user.id]),
      guardBoolean(db,"NOT EXISTS(SELECT 1 FROM hrm_training_evidence_links WHERE file_id=?)",[fileId]),
    ],[
      db.prepare(`INSERT INTO hrm_files(id,person_id,record_id,kind,object_key,original_name,mime_type,size_bytes,checksum,state,uploaded_by,expires_on,legal_hold,retention_actor_id,created_at,updated_at)
        VALUES(?,?,NULL,'training_evidence',?,?, 'application/pdf',?,?,'quarantined',?,NULL,
          CASE WHEN EXISTS(SELECT 1 FROM hrm_legal_holds WHERE scope_kind='person' AND state='active' AND person_id=? AND category IN ('training_evidence','*')) THEN 1 ELSE 0 END,
          CASE WHEN EXISTS(SELECT 1 FROM hrm_legal_holds WHERE scope_kind='person' AND state='active' AND person_id=? AND category IN ('training_evidence','*')) THEN ? ELSE NULL END,?,?)`)
        .bind(fileId,assignment.person_id,objectKey,name,file.size,checksum,user.id,assignment.person_id,assignment.person_id,user.id,time,time),
      db.prepare("INSERT INTO hrm_training_evidence_links(id,assignment_id,file_id,person_id,uploaded_by,created_at) VALUES(?,?,?,?,?,?)").bind(linkId,assignmentId,fileId,assignment.person_id,user.id,time),
      db.prepare("INSERT INTO hrm_training_events(id,course_version_id,assignment_id,evidence_id,person_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,?,?,?,'evidence_uploaded',?,?,?)").bind(id("trainingev"),assignment.course_version_id,assignmentId,linkId,assignment.person_id,JSON.stringify({file_id:fileId,checksum,size_bytes:file.size}),user.id,time),
      db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'hrm_training_evidence_uploaded',?,?,?,?)").bind(user.id,assignment.person_id,linkId,JSON.stringify({file_id:fileId,checksum,size_bytes:file.size}),time),
      db.prepare("DELETE FROM hrm_write_guards"),
    ]);
    if(committed!==linkId){await bucket.delete(objectKey).catch(()=>{});return committed}return linkId;
  }catch(error){await bucket.delete(objectKey).catch(()=>{});throw error}
}

export async function reviewTrainingEvidence(db:D1Database,user:WorkspaceUser,key:string,evidenceId:string,fileVersion:number,decision:string,reason:string):Promise<void>{
  requirePermission(user,"hrm.training.approve");live(user);if(decision!=="approve"&&decision!=="reject")throw new HrmError("invalid_action",400);
  const row=await db.prepare(`SELECT l.id,l.assignment_id,l.file_id,l.person_id,l.uploaded_by,a.created_by,a.state AS assignment_state,f.state,f.version,f.object_deleted_at
    FROM hrm_training_evidence_links l JOIN hrm_training_assignments a ON a.id=l.assignment_id JOIN hrm_files f ON f.id=l.file_id WHERE l.id=?`).bind(evidenceId)
    .first<{id:string;assignment_id:string;file_id:string;person_id:string;uploaded_by:string;created_by:string;assignment_state:string;state:string;version:number;object_deleted_at:string|null}>();
  if(!row||row.object_deleted_at)throw new HrmError("not_found",404);
  if(row.created_by===user.id||row.uploaded_by===user.id)throw new HrmError("training_self_review",403);
  if(row.state!=="quarantined"||row.version!==fileVersion||!["assigned","submitted"].includes(row.assignment_state))throw new HrmError("conflict",409);
  const cleanReason=clean(reason,1000),next=decision==="approve"?"reviewed":"rejected",time=now(),payload={evidenceId,fileVersion,decision,reason:cleanReason};
  await command(db,user,key,"hrm_training_evidence_review",payload,evidenceId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_training_evidence_links l JOIN hrm_training_assignments a ON a.id=l.assignment_id JOIN hrm_files f ON f.id=l.file_id WHERE l.id=? AND a.created_by!=? AND l.uploaded_by!=? AND a.state IN ('assigned','submitted') AND f.state='quarantined' AND f.version=? AND f.object_deleted_at IS NULL)",[evidenceId,user.id,user.id,fileVersion]),
    guardBoolean(db,"?=1 OR EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role='hrm_admin')",[user.admin?1:0,user.id]),
  ],[
    db.prepare("UPDATE hrm_files SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,updated_at=? WHERE id=? AND version=? AND state='quarantined'").bind(next,user.id,time,cleanReason,time,row.file_id,fileVersion),
    db.prepare("INSERT INTO hrm_training_events(id,course_version_id,assignment_id,evidence_id,person_id,event_type,detail_json,actor_id,created_at) SELECT ?,course_version_id,?,?,?,'evidence_reviewed',?,?,? FROM hrm_training_assignments WHERE id=?").bind(id("trainingev"),row.assignment_id,evidenceId,row.person_id,JSON.stringify({file_id:row.file_id,state:next}),user.id,time,row.assignment_id),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,`hrm_training_evidence_${next}`,row.person_id,evidenceId,JSON.stringify({file_id:row.file_id,reason_recorded:true}),time),
  ]);
}

export async function downloadTrainingEvidence(db:D1Database,bucket:R2Bucket,user:WorkspaceUser,evidenceId:string):Promise<Response>{
  live(user);const row=await db.prepare(`SELECT l.id,l.assignment_id,l.person_id,l.uploaded_by,p.user_id AS employee_user_id,f.original_name,f.mime_type,f.size_bytes,f.checksum,f.state,f.object_key,f.object_deleted_at
    FROM hrm_training_evidence_links l JOIN hrm_training_assignments a ON a.id=l.assignment_id JOIN hrm_people p ON p.id=l.person_id JOIN hrm_files f ON f.id=l.file_id WHERE l.id=?`).bind(evidenceId)
    .first<{id:string;assignment_id:string;person_id:string;uploaded_by:string;employee_user_id:string|null;original_name:string;mime_type:string;size_bytes:number;checksum:string;state:string;object_key:string;object_deleted_at:string|null}>();
  if(!row||row.object_deleted_at)throw new HrmError("not_found",404);
  const self=user.can("hrm.training.self")&&row.employee_user_id===user.id,manage=user.can("hrm.training.manage");if(!self&&!manage)throw new HrmError("not_found",404);
  if(row.state!=="reviewed"&&row.uploaded_by!==user.id&&!manage)throw new HrmError("not_found",404);
  const object=await bucket.get(row.object_key);if(!object)throw new HrmError("file_unavailable",404);
  await audit(db,user,"hrm_training_evidence_downloaded",row.person_id,row.id,{assignment_id:row.assignment_id,checksum:row.checksum});
  const filename=row.original_name.replace(/[\u0000-\u001f\u007f"\\/]/g,"_").slice(0,160)||"training-certificate.pdf";
  return new Response(object.body,{headers:{"Content-Type":"application/pdf","Content-Length":String(row.size_bytes),"Content-Disposition":`attachment; filename="training-certificate.pdf"; filename*=UTF-8''${encodeURIComponent(filename).replaceAll("'","%27")}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox","Referrer-Policy":"no-referrer"}});
}
