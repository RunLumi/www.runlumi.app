import type { WorkspaceUser } from "../workspace/roles";
import type { PerformanceReview } from "./performance";
import { HrmError } from "./fields";
import { activeReviewer, allowed, authority, employeeRoles, live, marks, performanceDates, performanceText, rawReview, readScope, reviewerPredicate, reviewerRoles, sharedStates, subjectOfPerformance } from "./performance-access";
import { command, digest, guardBoolean, id, now, requirePermission } from "./service";

export type CorrectionSelfMode="carry_forward"|"new_submission";
export interface PerformanceCorrectionInput {sourceId:string;sourceRevision:number;cycleCode:string;title:string;periodStart:string;periodEnd:string;dueOn:string;reviewerId:string;objectives:string;evidenceInstructions:string;reason:string;selfMode:string}
interface Correction {id:string;root_review_id:string;source_review_id:string;replacement_review_id:string;attempt_no:number;source_revision_at_creation:number;employment_revision:number;source_publication_event_id:number;source_publication_checksum:string;subject_user_id:string;self_mode:CorrectionSelfMode;self_origin_event_id:number|null;reason:string;created_by:string;created_at:string}
interface SourceEvent {id:number;review_id:string;event_type:string;revision:number;snapshot_json:string;actor_id:string;created_at:string}
const afterSnapshot=(event:SourceEvent):Record<string,unknown>=>{
 try{const value:unknown=JSON.parse(event.snapshot_json);if(typeof value!=="object"||value===null||!("after" in value)||typeof value.after!=="object"||value.after===null||Array.isArray(value.after))throw new Error();return value.after as Record<string,unknown>}
 catch{throw new HrmError("performance_correction_source_invalid",409)}
};
async function publishedEvent(db:D1Database,row:PerformanceReview):Promise<{event:SourceEvent;subjectId:string}>{
 const event=await db.prepare("SELECT * FROM hrm_performance_events WHERE review_id=? AND event_type='publish' ORDER BY revision DESC LIMIT 1").bind(row.id).first<SourceEvent>();
 if(!event)throw new HrmError("performance_correction_source_invalid",409);const after=afterSnapshot(event),subjectId=after.employee_user_id;
 const contentFields=["id","person_id","employment_id","legal_entity","cycle_code","title","period_start","period_end","due_on","reviewer_user_id","objectives","evidence_instructions","self_assessment","self_evidence","assessment","assessment_evidence","development_plan","assessed_by","assessed_at","published_by","published_at","created_by","created_at"] as const;
 if(typeof subjectId!=="string"||!subjectId||after.state!=="published"||after.revision!==event.revision||event.actor_id!==row.published_by||contentFields.some(field=>after[field]!==row[field]))throw new HrmError("performance_correction_source_invalid",409);
 return {event,subjectId};
}
async function selfOrigin(db:D1Database,source:PerformanceReview,subjectId:string,link:Correction|null):Promise<SourceEvent>{
 let event=await db.prepare("SELECT * FROM hrm_performance_events WHERE review_id=? AND event_type='submit_self' ORDER BY revision DESC LIMIT 1").bind(source.id).first<SourceEvent>();
 if(!event&&link?.self_origin_event_id)event=await db.prepare("SELECT * FROM hrm_performance_events WHERE id=?").bind(link.self_origin_event_id).first<SourceEvent>();
 if(!event||event.event_type!=="submit_self"||event.actor_id!==subjectId)throw new HrmError("performance_correction_source_invalid",409);
 const origin=afterSnapshot(event);
 if(origin.state!=="self_submitted"||origin.employee_user_id!==subjectId||origin.person_id!==source.person_id||origin.employment_id!==source.employment_id||origin.self_assessment!==source.self_assessment||origin.self_evidence!==source.self_evidence||typeof origin.period_start!=="string"||typeof origin.period_end!=="string"||typeof origin.objectives!=="string"||!origin.objectives||typeof origin.evidence_instructions!=="string")throw new HrmError("performance_correction_source_invalid",409);
 return event;
}
async function correctionEmployment(db:D1Database,row:PerformanceReview,start:string,end:string):Promise<{version:number}>{
 const employment=await db.prepare("SELECT person_id,legal_entity,started_on,ended_on,version FROM hrm_employments WHERE id=?").bind(row.employment_id).first<{person_id:string;legal_entity:string;started_on:string|null;ended_on:string|null;version:number}>();
 if(!employment||employment.person_id!==row.person_id||employment.legal_entity!==row.legal_entity)throw new HrmError("performance_correction_source_invalid",409);
 if((employment.started_on&&start<employment.started_on)||(employment.ended_on&&end>=employment.ended_on))throw new HrmError("invalid_date");return employment;
}
function employmentGuard(db:D1Database,row:PerformanceReview,version:number,start:string,end:string):D1PreparedStatement{return guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_employments WHERE id=? AND person_id=? AND version=? AND legal_entity=? AND (started_on IS NULL OR started_on<=?) AND (ended_on IS NULL OR ended_on>?))",[row.employment_id,row.person_id,version,row.legal_entity,start,end])}
export async function createPerformanceCorrection(db:D1Database,contentDb:D1Database,user:WorkspaceUser,key:string,input:PerformanceCorrectionInput):Promise<string>{
 const guards=authority(db,user,"hrm.performance.manage"),source=await rawReview(db,user,input.sourceId);
 const payload={...input,cycleCode:performanceText(input.cycleCode,48).toUpperCase(),title:performanceText(input.title,160),objectives:performanceText(input.objectives,4000),evidenceInstructions:performanceText(input.evidenceInstructions,2000),reason:performanceText(input.reason,1000)};
 if(!/^[A-Z0-9][A-Z0-9_-]{0,47}$/.test(payload.cycleCode))throw new HrmError("performance_cycle_invalid");
 if(!["carry_forward","new_submission"].includes(input.selfMode))throw new HrmError("performance_correction_self_mode_required");
 const prior=await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string;result_id:string}>();
 if(prior){if(prior.operation!=="hrm_performance_correction_create"||prior.payload_hash!==await digest(JSON.stringify(payload)))throw new HrmError("request_key_conflict",409);return prior.result_id}
 if(source.superseded)throw new HrmError("performance_review_superseded",409);
 if(!sharedStates.has(source.state)||source.pending_correction)throw new HrmError("performance_correction_conflict",409);
 performanceDates(input.periodStart,input.periodEnd,input.dueOn);
 const employment=await correctionEmployment(db,source,input.periodStart,input.periodEnd);
 const publication=await publishedEvent(db,source);
 if(publication.subjectId===user.id||source.employee_user_id===user.id||input.reviewerId===publication.subjectId)throw new HrmError("performance_self_review",403);
 if(source.employee_user_id!==publication.subjectId)throw new HrmError("performance_correction_source_invalid",409);
 await activeReviewer(contentDb,input.reviewerId);
 const parent=await db.prepare("SELECT * FROM hrm_performance_corrections WHERE replacement_review_id=?").bind(source.id).first<Correction>(),rootId=parent?.root_review_id??source.id;
 const origin=input.selfMode==="carry_forward"?await selfOrigin(db,source,publication.subjectId,parent):null;
 if(input.selfMode==="new_submission"){
  const employee=await contentDb.prepare("SELECT role FROM users WHERE id=? AND disabled=0").bind(publication.subjectId).first<{role:number}>();if(!employee)throw new HrmError("invalid_account",409);
  if(employee.role!==50)guards.push(guardBoolean(db,`EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role IN (${marks(employeeRoles)}))`,[publication.subjectId,...employeeRoles]));
 }
 const sequence=await db.prepare("SELECT COALESCE(MAX(attempt_no),0)+1 AS next FROM hrm_performance_corrections WHERE root_review_id=?").bind(rootId).first<{next:number}>(),attempt=sequence?.next??1;
 const correctionId=id("hrmperfcorr"),reviewId=id("hrmperf"),time=now(),checksum=await digest(publication.event.snapshot_json),carry=input.selfMode==="carry_forward";
 guards.push(
  guardBoolean(db,reviewerPredicate,[input.reviewerId,...reviewerRoles]),
  employmentGuard(db,source,employment.version,input.periodStart,input.periodEnd),
  guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND legal_entity=?)",[source.legal_entity]),
  guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_performance_reviews s JOIN hrm_people p ON p.id=s.person_id WHERE s.id=? AND s.revision=? AND s.state IN ('published','responded','closed') AND p.user_id=?)",[source.id,input.sourceRevision,publication.subjectId]),
  guardBoolean(db,"NOT EXISTS(SELECT 1 FROM hrm_performance_corrections c JOIN hrm_performance_reviews n ON n.id=c.replacement_review_id WHERE c.source_review_id=? AND n.state!='cancelled')",[source.id]),
 );
 return command(db,user,key,"hrm_performance_correction_create",payload,reviewId,guards,[
  db.prepare(`INSERT INTO hrm_performance_reviews(id,person_id,employment_id,legal_entity,cycle_code,title,period_start,period_end,due_on,reviewer_user_id,objectives,evidence_instructions,state,self_assessment,self_evidence,created_by,created_at,actor_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(reviewId,source.person_id,source.employment_id,source.legal_entity,payload.cycleCode,payload.title,input.periodStart,input.periodEnd,input.dueOn,input.reviewerId,payload.objectives,payload.evidenceInstructions,carry?"self_submitted":"open",carry?source.self_assessment:"",carry?source.self_evidence:"",user.id,time,user.id,time),
  db.prepare(`INSERT INTO hrm_performance_corrections(id,root_review_id,source_review_id,replacement_review_id,attempt_no,source_revision_at_creation,employment_revision,source_publication_event_id,source_publication_checksum,subject_user_id,self_mode,self_origin_event_id,reason,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(correctionId,rootId,source.id,reviewId,attempt,input.sourceRevision,employment.version,publication.event.id,checksum,publication.subjectId,input.selfMode,origin?.id??null,payload.reason,user.id,time),
  db.prepare("INSERT INTO hrm_performance_events(review_id,event_type,visibility,revision,snapshot_json,actor_id,created_at) VALUES(?,'correction_opened','shared',1,?,?,?)").bind(reviewId,JSON.stringify({source_review_id:source.id,source_revision:input.sourceRevision,source_publication_checksum:checksum,self_mode:input.selfMode,self_origin_event_id:origin?.id??null,reason:payload.reason}),user.id,time),
  db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'hrm_performance_correction_created',?,?,?,?)").bind(user.id,source.person_id,reviewId,JSON.stringify({root_review_id:rootId,source_review_id:source.id,attempt_no:attempt,self_mode:input.selfMode}),time),
 ]);
}
export async function prepareCorrectionPublication(db:D1Database,user:WorkspaceUser,row:PerformanceReview,sourceRevision:number|undefined,sourceReviewed:boolean,time:string):Promise<{guards:D1PreparedStatement[];writes:D1PreparedStatement[]}>{
 requirePermission(user,"hrm.performance.approve");live(user);
 const link=await db.prepare("SELECT * FROM hrm_performance_corrections WHERE replacement_review_id=?").bind(row.id).first<Correction>();if(!link)return {guards:[],writes:[]};
 if(!sourceReviewed||!Number.isSafeInteger(sourceRevision)||!sourceRevision||sourceRevision<1)throw new HrmError("performance_correction_source_review_required",409);
 const source=await rawReview(db,user,link.source_review_id);if(source.employee_user_id!==link.subject_user_id||!sharedStates.has(source.state)||source.superseded)throw new HrmError("performance_correction_conflict",409);
 const event=await db.prepare("SELECT * FROM hrm_performance_events WHERE review_id=? AND revision=?").bind(source.id,sourceRevision).first<SourceEvent>();
 const employment=await correctionEmployment(db,row,row.period_start,row.period_end);
 const publication=await publishedEvent(db,source);if(publication.event.id!==link.source_publication_event_id||await digest(publication.event.snapshot_json)!==link.source_publication_checksum)throw new HrmError("performance_correction_source_invalid",409);
 if(source.revision!==sourceRevision||!event)throw new HrmError("performance_correction_conflict",409);
 return {
  guards:[employmentGuard(db,row,employment.version,row.period_start,row.period_end),guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_performance_reviews s JOIN hrm_people p ON p.id=s.person_id WHERE s.id=? AND s.revision=? AND s.state IN ('published','responded','closed') AND p.user_id=?)",[source.id,sourceRevision,link.subject_user_id])],
  writes:[db.prepare("INSERT INTO hrm_performance_correction_publications(correction_id,source_event_id,source_revision,employment_revision,source_checksum,approved_by,approved_at) VALUES(?,?,?,?,?,?,?)").bind(link.id,event.id,sourceRevision,employment.version,await digest(event.snapshot_json),user.id,time)],
 };
}
export interface PerformanceReference {id:string;title:string;cycle_code:string;state:string;revision:number}
interface ReferenceRow extends PerformanceReference {reviewer_user_id:string;employee_user_id:string|null;correction_subject_user_id?:string|null}
export interface PerformanceLineage {
 identity_aligned:boolean;superseded:boolean;pending:boolean;current:PerformanceReference|null;
 correction?:{attempt_no:number;reason:string;self_mode:CorrectionSelfMode;source_revision_at_creation:number;source_publication_revision:number|null;source_publication_checksum:string|null;self_submitted_at:string|null;self_origin_period_start:string|null;self_origin_period_end:string|null;self_origin_objectives:string|null;self_origin_evidence_instructions:string|null;root:PerformanceReference|null;source:PerformanceReference|null;source_context:PerformanceReview|null};
 related:(PerformanceReference&{attempt_no:number;reason:string;self_mode:CorrectionSelfMode})[];page:number;hasMore:boolean;
}
const reference=(row:ReferenceRow,user:WorkspaceUser):PerformanceReference=>({id:row.id,title:row.title,cycle_code:row.cycle_code,state:subjectOfPerformance(row,user.id)&&row.state==="assessed"?"self_submitted":row.state,revision:row.revision});
const refSelect="SELECT r.id,r.title,r.cycle_code,r.state,r.revision,r.reviewer_user_id,p.user_id AS employee_user_id,(SELECT c.subject_user_id FROM hrm_performance_corrections c WHERE c.replacement_review_id=r.id) AS correction_subject_user_id FROM hrm_performance_reviews r JOIN hrm_people p ON p.id=r.person_id";
export async function performanceLineage(db:D1Database,user:WorkspaceUser,row:PerformanceReview,requestedPage=1):Promise<PerformanceLineage>{
 live(user);if(!allowed(user,row))throw new HrmError("not_found",404);
 const identityAligned=!row.correction_subject_user_id||row.correction_subject_user_id===row.employee_user_id;
 const link=await db.prepare("SELECT * FROM hrm_performance_corrections WHERE replacement_review_id=?").bind(row.id).first<Correction>(),rootId=link?.root_review_id??row.id,scope=readScope(user);
 const references=new Map<string,PerformanceReference|null>([[row.id,reference(row,user)]]);
 const ref=async(reviewId:string):Promise<PerformanceReference|null>=>{if(references.has(reviewId))return references.get(reviewId)??null;const found=await db.prepare(`${refSelect} WHERE r.id=? AND ${scope.sql}`).bind(reviewId,...scope.params).first<ReferenceRow>(),value=found?reference(found,user):null;references.set(reviewId,value);return value};
 const effective=await db.prepare("SELECT c.replacement_review_id FROM hrm_performance_corrections c JOIN hrm_performance_reviews n ON n.id=c.replacement_review_id WHERE c.root_review_id=? AND n.state IN ('published','responded','closed') ORDER BY c.attempt_no DESC LIMIT 1").bind(rootId).first<{replacement_review_id:string}>();
 const page=Math.max(1,Math.min(1000,Math.floor(Number.isFinite(requestedPage)?requestedPage:1)));
 const related=(await db.prepare(`SELECT r.id,r.title,r.cycle_code,r.state,r.revision,r.reviewer_user_id,p.user_id AS employee_user_id,c.attempt_no,c.reason,c.self_mode FROM hrm_performance_corrections c JOIN hrm_performance_reviews r ON r.id=c.replacement_review_id JOIN hrm_people p ON p.id=r.person_id WHERE c.source_review_id=? AND ${scope.sql} ORDER BY c.attempt_no DESC LIMIT 26 OFFSET ?`).bind(row.id,...scope.params,(page-1)*25).all<ReferenceRow&{attempt_no:number;reason:string;self_mode:CorrectionSelfMode}>()).results;
 let correction:PerformanceLineage["correction"];
 if(link){
  const [root,source,origin,publication]=await Promise.all([ref(rootId),ref(link.source_review_id),link.self_origin_event_id?db.prepare("SELECT * FROM hrm_performance_events WHERE id=?").bind(link.self_origin_event_id).first<SourceEvent>():null,db.prepare("SELECT revision FROM hrm_performance_events WHERE id=?").bind(link.source_publication_event_id).first<{revision:number}>()]);
  const eligibleApprover=identityAligned&&user.can("hrm.performance.approve")&&!subjectOfPerformance(row,user.id)&&row.created_by!==user.id&&row.assessed_by!==user.id;
  const original=origin?afterSnapshot(origin):null;
  correction={attempt_no:link.attempt_no,reason:link.reason,self_mode:link.self_mode,source_revision_at_creation:link.source_revision_at_creation,source_publication_revision:publication?.revision??null,source_publication_checksum:source?link.source_publication_checksum:null,self_submitted_at:origin?.created_at??null,self_origin_period_start:typeof original?.period_start==="string"?original.period_start:null,self_origin_period_end:typeof original?.period_end==="string"?original.period_end:null,self_origin_objectives:typeof original?.objectives==="string"?original.objectives:null,self_origin_evidence_instructions:typeof original?.evidence_instructions==="string"?original.evidence_instructions:null,root,source,source_context:eligibleApprover&&source?await rawReview(db,user,link.source_review_id):null};
 }
 return {identity_aligned:identityAligned,superseded:Boolean(row.superseded),pending:Boolean(row.pending_correction),current:await ref(effective?.replacement_review_id??rootId),correction,related:related.slice(0,25).map(item=>({...reference(item,user),attempt_no:item.attempt_no,reason:item.reason,self_mode:item.self_mode})),page,hasMore:related.length>25};
}
