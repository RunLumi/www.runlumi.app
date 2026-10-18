import type { Permission, WorkspaceUser } from "../workspace/roles";
import { ROLE_PERMISSIONS } from "../workspace/roles";
import { HrmError, date } from "./fields";
import { audit, command, digest, guardBoolean, id, now, requirePermission } from "./service";

export const PERFORMANCE_STATES=["open","self_submitted","assessed","published","responded","closed","cancelled"] as const;
export type PerformanceState=typeof PERFORMANCE_STATES[number];
export interface PerformanceReview {
 id:string;person_id:string;employment_id:string;legal_entity:string;cycle_code:string;title:string;period_start:string;period_end:string;due_on:string;
 reviewer_user_id:string;objectives:string;evidence_instructions:string;state:PerformanceState;revision:number;
 self_assessment:string;self_evidence:string;assessment:string;assessment_evidence:string;development_plan:string;employee_feedback:string;acknowledged_at:string|null;
 assessed_by:string|null;assessed_at:string|null;published_by:string|null;published_at:string|null;closed_by:string|null;closed_at:string|null;
 created_by:string;created_at:string;actor_id:string;updated_at:string;employee_user_id:string|null;employee_code:string;display_name:string;
}
export interface PerformanceEvent {id:number;event_type:string;visibility:"shared"|"staff";revision:number;actor_id:string;created_at:string}
export interface PerformancePerson {id:string;employee_code:string;display_name:string;user_id:string;legal_entity:string}
export interface PerformanceReviewer {user_id:string}
const sharedStates=new Set<PerformanceState>(["published","responded","closed"]);
const live=(user:WorkspaceUser)=>{if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503)};
export function performanceText(value:string,max:number,required=true):string{const result=value.trim();if(result.length>max||(required&&!result))throw new HrmError("invalid_field");return result}
export function performanceDates(start:string,end:string,due:string):void{if(!date(start)||!date(end)||!date(due)||end<start||due<end)throw new HrmError("invalid_date")}
function authority(db:D1Database,user:WorkspaceUser,permission:Permission):D1PreparedStatement[]{
 requirePermission(user,permission);live(user);const gate=guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND enabled=1 AND reviewed_by IS NOT NULL)",[]);if(user.admin)return [gate];
 const roles=Object.entries(ROLE_PERMISSIONS).filter(([,permissions])=>permissions.includes(permission)).map(([role])=>role);
 return [gate,guardBoolean(db,`EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role IN (${roles.map(()=>"?").join(",")}))`,[user.id,...roles])];
}
async function activeReviewer(contentDb:D1Database,userId:string):Promise<void>{if(!await contentDb.prepare("SELECT 1 FROM users WHERE id=? AND disabled=0").bind(userId).first())throw new HrmError("invalid_account",409)}
const reviewerPredicate="EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role IN ('people_manager','hrm_officer','hrm_admin'))";
const selectReview=`SELECT r.*,p.user_id AS employee_user_id,p.employee_code,COALESCE(NULLIF(p.preferred_name,''),p.legal_name) AS display_name FROM hrm_performance_reviews r JOIN hrm_people p ON p.id=r.person_id`;
export function employeePerformanceView(row:PerformanceReview,userId:string):PerformanceReview{
 if(row.employee_user_id!==userId||sharedStates.has(row.state))return row;
 return {...row,state:row.state==="assessed"?"self_submitted":row.state,assessment:"",assessment_evidence:"",development_plan:"",assessed_by:null,assessed_at:null,published_by:null,published_at:null,closed_by:null,closed_at:null};
}
function allowed(user:WorkspaceUser,row:PerformanceReview):boolean{return user.can("hrm.performance.manage")||(user.can("hrm.performance.self")&&row.employee_user_id===user.id)||(user.can("hrm.performance.review")&&row.reviewer_user_id===user.id)}
async function rawReview(db:D1Database,user:WorkspaceUser,reviewId:string):Promise<PerformanceReview>{
 live(user);const row=await db.prepare(`${selectReview} WHERE r.id=?`).bind(reviewId).first<PerformanceReview>();if(!row||!allowed(user,row))throw new HrmError("not_found",404);return row;
}
export async function getPerformanceReview(db:D1Database,user:WorkspaceUser,reviewId:string):Promise<{review:PerformanceReview;events:PerformanceEvent[]}>{
 const row=await rawReview(db,user,reviewId),isSubject=row.employee_user_id===user.id;
 const events=(await db.prepare(`SELECT id,event_type,visibility,revision,actor_id,created_at FROM hrm_performance_events WHERE review_id=? ${isSubject||!user.can("hrm.performance.manage")?"AND visibility='shared'":""} ORDER BY id`).bind(reviewId).all<PerformanceEvent>()).results;
 await audit(db,user,"hrm_performance_opened",row.person_id,row.id,{state:employeePerformanceView(row,user.id).state});return {review:employeePerformanceView(row,user.id),events};
}
export async function listPerformanceReviews(db:D1Database,user:WorkspaceUser,mode:"self"|"team",page=1):Promise<{reviews:PerformanceReview[];page:number;hasMore:boolean}>{
 requirePermission(user,mode==="self"?"hrm.performance.self":user.can("hrm.performance.manage")?"hrm.performance.manage":"hrm.performance.review");live(user);
 const normalized=Math.max(1,Math.min(1000,Math.floor(Number.isFinite(page)?page:1))),scope=mode==="self"?"p.user_id=?":user.can("hrm.performance.manage")?"1=1":"r.reviewer_user_id=?",params=scope==="1=1"?[]:[user.id];
 const rows=(await db.prepare(`${selectReview} WHERE ${scope} ORDER BY r.period_end DESC,r.id LIMIT 26 OFFSET ?`).bind(...params,(normalized-1)*25).all<PerformanceReview>()).results;
 await audit(db,user,"hrm_performance_listed",null,"performance",{mode,page:normalized,count:Math.min(rows.length,25)});return {reviews:rows.slice(0,25).map(row=>employeePerformanceView(row,user.id)),page:normalized,hasMore:rows.length>25};
}
export async function performanceOptions(db:D1Database,user:WorkspaceUser):Promise<{people:PerformancePerson[];reviewers:PerformanceReviewer[]}>{
 requirePermission(user,"hrm.performance.manage");live(user);
 const [people,reviewers]=await Promise.all([
  db.prepare(`SELECT p.id,p.employee_code,COALESCE(NULLIF(p.preferred_name,''),p.legal_name) AS display_name,p.user_id,e.legal_entity FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id JOIN workspace_members m ON m.user_id=p.user_id AND m.enabled=1 JOIN workspace_roles role ON role.user_id=m.user_id AND role.role='employee' WHERE e.id=(SELECT e2.id FROM hrm_employments e2 WHERE e2.person_id=p.id ORDER BY CASE WHEN e2.status!='ended' THEN 0 ELSE 1 END,e2.started_on DESC,e2.created_at DESC LIMIT 1) AND e.status IN ('probation','active','notice') AND (e.started_on IS NULL OR e.started_on<=date('now','+7 hours')) AND (e.ended_on IS NULL OR e.ended_on>date('now','+7 hours')) ORDER BY p.employee_code LIMIT 500`).all<PerformancePerson>(),
  db.prepare("SELECT DISTINCT m.user_id FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.enabled=1 AND r.role IN ('people_manager','hrm_officer','hrm_admin') ORDER BY m.user_id LIMIT 500").all<PerformanceReviewer>(),
 ]);return {people:people.results,reviewers:reviewers.results};
}
export interface PerformanceInput {personId:string;cycleCode:string;title:string;periodStart:string;periodEnd:string;dueOn:string;reviewerId:string;objectives:string;evidenceInstructions:string}
export async function createPerformanceReview(db:D1Database,contentDb:D1Database,user:WorkspaceUser,key:string,input:PerformanceInput):Promise<string>{
 const guards=authority(db,user,"hrm.performance.manage");await activeReviewer(contentDb,input.reviewerId);performanceDates(input.periodStart,input.periodEnd,input.dueOn);
 const payload={...input,cycleCode:performanceText(input.cycleCode,48).toUpperCase(),title:performanceText(input.title,160),objectives:performanceText(input.objectives,4000),evidenceInstructions:performanceText(input.evidenceInstructions,2000)};
 if(!/^[A-Z0-9][A-Z0-9_-]{0,47}$/.test(payload.cycleCode))throw new HrmError("performance_cycle_invalid");
 const employee=await db.prepare(`SELECT p.user_id,e.id,e.version,e.legal_entity,e.started_on,e.ended_on FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id WHERE p.id=? AND e.id=(SELECT e2.id FROM hrm_employments e2 WHERE e2.person_id=p.id ORDER BY CASE WHEN e2.status!='ended' THEN 0 ELSE 1 END,e2.started_on DESC,e2.created_at DESC LIMIT 1) AND e.status IN ('probation','active','notice') AND (e.started_on IS NULL OR e.started_on<=date('now','+7 hours')) AND (e.ended_on IS NULL OR e.ended_on>date('now','+7 hours'))`).bind(input.personId).first<{user_id:string|null;id:string;version:number;legal_entity:string;started_on:string|null;ended_on:string|null}>();
 if(!employee?.user_id)throw new HrmError("not_found",404);if((employee.started_on&&input.periodStart<employee.started_on)||(employee.ended_on&&input.periodEnd>=employee.ended_on))throw new HrmError("invalid_date");if(employee.user_id===user.id||employee.user_id===input.reviewerId)throw new HrmError("performance_self_review",403);
 const reviewId=id("hrmperf"),time=now();
 return command(db,user,key,"hrm_performance_create",payload,reviewId,[...guards,
  guardBoolean(db,reviewerPredicate,[input.reviewerId]),
  guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND legal_entity=?)",[employee.legal_entity]),
  guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_employments e JOIN hrm_people p ON p.id=e.person_id JOIN workspace_members m ON m.user_id=p.user_id AND m.enabled=1 JOIN workspace_roles r ON r.user_id=m.user_id AND r.role='employee' WHERE e.id=? AND e.version=? AND p.id=? AND p.user_id=? AND e.status IN ('probation','active','notice') AND (e.started_on IS NULL OR e.started_on<=date('now','+7 hours')) AND (e.ended_on IS NULL OR e.ended_on>date('now','+7 hours')))",[employee.id,employee.version,input.personId,employee.user_id]),
 ],[
  db.prepare(`INSERT INTO hrm_performance_reviews(id,person_id,employment_id,legal_entity,cycle_code,title,period_start,period_end,due_on,reviewer_user_id,objectives,evidence_instructions,created_by,created_at,actor_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(reviewId,input.personId,employee.id,employee.legal_entity,payload.cycleCode,payload.title,input.periodStart,input.periodEnd,input.dueOn,input.reviewerId,payload.objectives,payload.evidenceInstructions,user.id,time,user.id,time),
  db.prepare("INSERT INTO hrm_performance_events(review_id,event_type,visibility,revision,snapshot_json,actor_id,created_at) VALUES(?,'created','shared',1,?, ?,?)").bind(reviewId,JSON.stringify(payload),user.id,time),
  db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'hrm_performance_created',?,?,?,?)").bind(user.id,input.personId,reviewId,JSON.stringify({cycle_code:payload.cycleCode}),time),
 ]);
}
export type PerformanceAction="submit_self"|"assess"|"request_changes"|"reassign"|"publish"|"respond"|"close"|"cancel";
export interface PerformanceActionInput {action:PerformanceAction;reviewId:string;revision:number;assessment?:string;evidence?:string;developmentPlan?:string;feedback?:string;acknowledged?:boolean;reviewerId?:string;reason?:string}
export async function actOnPerformanceReview(db:D1Database,contentDb:D1Database,user:WorkspaceUser,key:string,input:PerformanceActionInput):Promise<void>{
 const row=await rawReview(db,user,input.reviewId),subject=row.employee_user_id===user.id,time=now(),action=input.action;
 const prior=await db.prepare("SELECT operation,payload_hash FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string}>();
 if(prior){if(prior.operation!==`hrm_performance_${action}`||prior.payload_hash!==await digest(JSON.stringify(input)))throw new HrmError("request_key_conflict",409);return}

 let permission:Permission;let state:PerformanceState;const fields:Record<string,string|number|null>={};let visibility:"shared"|"staff"="shared";
 if(action==="submit_self"){
  permission="hrm.performance.self";if(!subject)throw new HrmError("not_found",404);if(row.state!=="open")throw new HrmError("invalid_transition",409);
  state="self_submitted";fields.self_assessment=performanceText(input.assessment??"",4000);fields.self_evidence=performanceText(input.evidence??"",4000);
 }else if(action==="assess"){
  permission="hrm.performance.review";if(subject)throw new HrmError("performance_self_review",403);if(row.reviewer_user_id!==user.id)throw new HrmError("not_found",404);if(row.state!=="self_submitted")throw new HrmError("invalid_transition",409);
  state="assessed";fields.assessment=performanceText(input.assessment??"",4000);fields.assessment_evidence=performanceText(input.evidence??"",4000);fields.development_plan=performanceText(input.developmentPlan??"",4000);fields.assessed_by=user.id;fields.assessed_at=time;visibility="staff";
 }else if(action==="respond"){
  permission="hrm.performance.self";if(!subject)throw new HrmError("not_found",404);if(row.state!=="published")throw new HrmError("invalid_transition",409);if(input.acknowledged!==true)throw new HrmError("acknowledgement_required");
  state="responded";fields.employee_feedback=performanceText(input.feedback??"",4000,false);fields.acknowledged_at=time;
 }else{
  if(subject)throw new HrmError("performance_self_review",403);
  permission=["publish","close","request_changes"].includes(action)?"hrm.performance.approve":"hrm.performance.manage";
  if(action==="publish"||action==="close"||action==="request_changes"){
   if(row.created_by===user.id||row.assessed_by===user.id)throw new HrmError("performance_self_review",403);
   performanceText(input.reason??"",1000);
   if(action==="publish"){if(row.state!=="assessed")throw new HrmError("invalid_transition",409);state="published";fields.published_by=user.id;fields.published_at=time}
   else if(action==="close"){if(row.state!=="responded")throw new HrmError("invalid_transition",409);state="closed";fields.closed_by=user.id;fields.closed_at=time}
   else{if(row.state!=="assessed")throw new HrmError("invalid_transition",409);state="self_submitted";for(const field of ["assessment","assessment_evidence","development_plan"])fields[field]="";fields.assessed_by=null;fields.assessed_at=null;visibility="staff"}
  }else if(action==="reassign"){
   if(!["open","self_submitted","assessed"].includes(row.state))throw new HrmError("invalid_transition",409);if(!input.reviewerId||input.reviewerId===row.employee_user_id)throw new HrmError("performance_self_review",403);performanceText(input.reason??"",1000);
   state=row.self_assessment?"self_submitted":"open";fields.reviewer_user_id=input.reviewerId;for(const field of ["assessment","assessment_evidence","development_plan"])fields[field]="";fields.assessed_by=null;fields.assessed_at=null;visibility="staff";
  }else if(action==="cancel"){
   if(!["open","self_submitted","assessed"].includes(row.state))throw new HrmError("invalid_transition",409);performanceText(input.reason??"",1000);state="cancelled";
  }else throw new HrmError("invalid_action",400);
 }
 const guards=authority(db,user,permission);
 if(action==="reassign"){await activeReviewer(contentDb,input.reviewerId!);guards.push(guardBoolean(db,reviewerPredicate,[input.reviewerId!]));}
 guards.push(guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND legal_entity=?)",[row.legal_entity]));
 guards.push(guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_performance_reviews r JOIN hrm_people p ON p.id=r.person_id WHERE r.id=? AND r.revision=? AND r.state=? AND r.reviewer_user_id=? AND p.user_id IS ?)",[row.id,input.revision,row.state,row.reviewer_user_id,row.employee_user_id]));
 const patch={...fields,state,revision:input.revision+1,actor_id:user.id,updated_at:time},keys=Object.keys(patch),payload={...input};
 await command(db,user,key,`hrm_performance_${action}`,payload,row.id,guards,[
  db.prepare(`UPDATE hrm_performance_reviews SET ${keys.map(field=>`${field}=?`).join(",")} WHERE id=? AND revision=?`).bind(...Object.values(patch),row.id,input.revision),
  db.prepare("INSERT INTO hrm_performance_events(review_id,event_type,visibility,revision,snapshot_json,actor_id,created_at) VALUES(?,?,?,?,?,?,?)").bind(row.id,action,visibility,input.revision+1,JSON.stringify({before:row,after:{...row,...patch},reason:input.reason??""}),user.id,time),
  db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,`hrm_performance_${action}`,row.person_id,row.id,JSON.stringify({revision:input.revision+1}),time),
 ]);
}
