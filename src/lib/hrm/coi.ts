import type { WorkspaceUser } from "../workspace/roles";
import { membersWithRoles } from "../workspace/members";
import { date, HrmError } from "./fields";
import { command, digest, guard, id, now, own, personFor, requirePermission, type Person } from "./service";

export interface CoiAnswers {has_conflict:"yes"|"no";related_organization:string;relationship:string;description:string;impact:string;proposed_mitigation:string}
export interface CoiDeclaration {id:string;person_id:string;employment_id:string;supersedes_id:string|null;supersedes_version:number|null;declaration_no:number;answers_json:string;state:string;assigned_reviewer_id:string|null;submitted_by:string|null;submitted_at:string|null;reviewed_by:string|null;reviewed_at:string|null;review_reason:string|null;mitigation:string|null;followup_due:string|null;version:number;actor_id:string;created_at:string;updated_at:string}
export interface CoiListItem extends CoiDeclaration {employee_code:string;legal_name:string}

async function priorCommand(db:D1Database,user:WorkspaceUser,key:string,operation:string,payload:unknown):Promise<string|null>{
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new HrmError("invalid_request_key");
 const row=await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string;result_id:string}>();
 if(!row)return null;
 if(row.operation!==operation||row.payload_hash!==await digest(JSON.stringify(payload)))throw new HrmError("request_key_conflict",409);
 return row.result_id;
}

function normalizeAnswers(value:CoiAnswers):CoiAnswers{
 if(value.has_conflict!=="yes"&&value.has_conflict!=="no")throw new HrmError("invalid_field");
 const clean={has_conflict:value.has_conflict,related_organization:value.related_organization.trim(),relationship:value.relationship.trim(),description:value.description.trim(),impact:value.impact.trim(),proposed_mitigation:value.proposed_mitigation.trim()};
 for(const [key,item] of Object.entries(clean))if(item.length>(key==="description"||key==="impact"||key==="proposed_mitigation"?2000:300))throw new HrmError("invalid_field");
 if(clean.has_conflict==="yes"&&(!clean.related_organization||!clean.relationship||!clean.description))throw new HrmError("invalid_field");
 if(clean.has_conflict==="no"&&(clean.related_organization||clean.relationship||clean.description||clean.impact||clean.proposed_mitigation))throw new HrmError("invalid_field");
 return clean;
}
async function assignedReviewer(user:WorkspaceUser,declaration:CoiDeclaration):Promise<boolean>{
 if(user.can("hrm.configure"))return true;
 return user.can("hrm.coi.review")&&declaration.assigned_reviewer_id===user.id;
}
export async function listMyCoiDeclarations(db:D1Database,user:WorkspaceUser):Promise<CoiDeclaration[]>{
 requirePermission(user,"hrm.coi.self");const person=await personFor(db,user);
 return (await db.prepare("SELECT * FROM hrm_coi_declarations WHERE person_id=? ORDER BY declaration_no DESC LIMIT 100").bind(person.id).all<CoiDeclaration>()).results;
}
export async function listCoiReviewQueue(db:D1Database,user:WorkspaceUser):Promise<CoiListItem[]>{
 if(!user.can("hrm.coi.review")&&!user.can("hrm.configure"))throw new HrmError("forbidden",403);
 const all=user.can("hrm.configure");const rows=await db.prepare(`SELECT d.*,p.employee_code,p.legal_name FROM hrm_coi_declarations d JOIN hrm_people p ON p.id=d.person_id WHERE d.state NOT IN ('draft','closed','superseded') ${all?"":"AND d.assigned_reviewer_id=?"} ORDER BY CASE WHEN d.followup_due IS NULL THEN 1 ELSE 0 END,d.followup_due,d.updated_at DESC LIMIT 200`).bind(...(all?[]:[user.id])).all<CoiListItem>();
 return rows.results;
}
export async function getCoiDeclaration(db:D1Database,user:WorkspaceUser,declarationId:string):Promise<CoiDeclaration&{person:Person}>{
 const declaration=await db.prepare("SELECT * FROM hrm_coi_declarations WHERE id=?").bind(declarationId).first<CoiDeclaration>();if(!declaration)throw new HrmError("not_found",404);
 if(declaration.person_id=== (await db.prepare("SELECT id FROM hrm_people WHERE user_id=?").bind(user.id).first<{id:string}>())?.id&&user.can("hrm.coi.self")){
  const person=await personFor(db,user,declaration.person_id);return {...declaration,person};
 }
 if(!await assignedReviewer(user,declaration))throw new HrmError("not_found",404);
 const person=await db.prepare("SELECT p.id,e.id AS employment_id,p.employee_code,p.user_id,p.legal_name,p.preferred_name,p.version AS profile_version,p.actor_id,e.work_email,e.work_phone,e.department,e.job_title,e.legal_entity,e.location,e.manager_user_id,e.status,e.started_on,e.ended_on,e.version,e.actor_id AS employment_actor_id,e.created_at,e.updated_at FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id AND e.id=(SELECT e2.id FROM hrm_employments e2 WHERE e2.person_id=p.id ORDER BY CASE WHEN e2.status!='ended' THEN 0 ELSE 1 END,e2.started_on DESC,e2.created_at DESC LIMIT 1) WHERE p.id=?").bind(declaration.person_id).first<Person>();if(!person)throw new HrmError("not_found",404);
 return {...declaration,person};
}
export async function saveCoiDraft(db:D1Database,user:WorkspaceUser,key:string,declarationId:string|null,expectedVersion:number,answers:CoiAnswers,supersedesId:string|null=null):Promise<string>{
 requirePermission(user,"hrm.coi.self");const person=await personFor(db,user);if(!own(person,user))throw new HrmError("forbidden",403);const normalized=normalizeAnswers(answers),payload={person:person.id,employment:person.employment_id,answers:normalized,supersedesId};
 if(declarationId){
  const updatePayload={...payload,declarationId,expectedVersion},prior=await priorCommand(db,user,key,"coi_draft_update",updatePayload);if(prior)return prior;
  const previous=await db.prepare("SELECT person_id,employment_id,supersedes_id,state FROM hrm_coi_declarations WHERE id=?").bind(declarationId).first<{person_id:string;employment_id:string;supersedes_id:string|null;state:string}>();if(!previous||previous.person_id!==person.id||previous.employment_id!==person.employment_id||previous.state!=="draft")throw new HrmError("not_found",404);
  const guards=[guard(db,"EXISTS(SELECT 1 FROM hrm_coi_declarations WHERE id=? AND person_id=? AND version=? AND state='draft')",[declarationId,person.id,expectedVersion])];let replacementVersion:number|null=null;
  if(previous.supersedes_id){const replacement=await db.prepare("SELECT person_id,state,version FROM hrm_coi_declarations WHERE id=?").bind(previous.supersedes_id).first<{person_id:string;state:string;version:number}>();if(!replacement||replacement.person_id!==person.id||["draft","superseded"].includes(replacement.state))throw new HrmError("invalid_supersedes");replacementVersion=replacement.version;const pending=await db.prepare("SELECT 1 AS pending FROM hrm_legal_files WHERE coi_declaration_id=? AND state='quarantined' LIMIT 1").bind(previous.supersedes_id).first<{pending:number}>();if(pending)throw new HrmError("evidence_pending",409);guards.push(guard(db,"EXISTS(SELECT 1 FROM hrm_coi_declarations WHERE id=? AND person_id=? AND version=? AND state NOT IN ('draft','superseded')) AND NOT EXISTS(SELECT 1 FROM hrm_legal_files WHERE coi_declaration_id=? AND state='quarantined')",[previous.supersedes_id,person.id,replacementVersion,previous.supersedes_id]));}
  return command(db,user,key,"coi_draft_update",updatePayload,declarationId,guards,[db.prepare("UPDATE hrm_coi_declarations SET answers_json=?,supersedes_version=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='draft'").bind(JSON.stringify(normalized),replacementVersion,user.id,now(),declarationId,expectedVersion),db.prepare("DELETE FROM hrm_write_guards")]);
 }
 if(expectedVersion!==0)throw new HrmError("invalid_revision");
 const createPayload={...payload};const prior=await priorCommand(db,user,key,"coi_draft_create",createPayload);if(prior)return prior;
 let supersedesVersion:number|null=null;
 if(supersedesId){const previous=await db.prepare("SELECT person_id,state,version FROM hrm_coi_declarations WHERE id=?").bind(supersedesId).first<{person_id:string;state:string;version:number}>();if(!previous||previous.person_id!==person.id||["draft","superseded"].includes(previous.state))throw new HrmError("invalid_supersedes");supersedesVersion=previous.version;const pending=await db.prepare("SELECT 1 AS pending FROM hrm_legal_files WHERE coi_declaration_id=? AND state='quarantined' LIMIT 1").bind(supersedesId).first<{pending:number}>();if(pending)throw new HrmError("evidence_pending",409);const replacement=await db.prepare("SELECT 1 AS exists_row FROM hrm_coi_declarations WHERE supersedes_id=? LIMIT 1").bind(supersedesId).first<{exists_row:number}>();if(replacement)throw new HrmError("invalid_supersedes",409);}
 const latest=await db.prepare("SELECT COALESCE(MAX(declaration_no),0) AS n FROM hrm_coi_declarations WHERE person_id=?").bind(person.id).first<{n:number}>();const declarationNo=Number(latest?.n??0)+1,target=id("coi"),time=now();
 const guards=[guard(db,"EXISTS(SELECT 1 FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id WHERE p.id=? AND p.user_id=? AND e.id=? AND e.status!='ended')",[person.id,user.id,person.employment_id]),guard(db,"NOT EXISTS(SELECT 1 FROM hrm_coi_declarations WHERE person_id=? AND declaration_no=?)",[person.id,declarationNo])];
 if(supersedesId)guards.push(guard(db,"EXISTS(SELECT 1 FROM hrm_coi_declarations WHERE id=? AND person_id=? AND version=? AND state NOT IN ('draft','superseded')) AND NOT EXISTS(SELECT 1 FROM hrm_legal_files WHERE coi_declaration_id=? AND state='quarantined') AND NOT EXISTS(SELECT 1 FROM hrm_coi_declarations WHERE supersedes_id=?)",[supersedesId,person.id,supersedesVersion,supersedesId,supersedesId]));
 return command(db,user,key,"coi_draft_create",createPayload,target,guards,[db.prepare("INSERT INTO hrm_coi_declarations(id,person_id,employment_id,supersedes_id,supersedes_version,declaration_no,answers_json,state,actor_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'draft',?,?,?)").bind(target,person.id,person.employment_id,supersedesId,supersedesVersion,declarationNo,JSON.stringify(normalized),user.id,time,time),db.prepare("DELETE FROM hrm_write_guards")]);
}
export async function submitCoiDeclaration(db:D1Database,user:WorkspaceUser,key:string,declarationId:string,expectedVersion:number):Promise<void>{
 requirePermission(user,"hrm.coi.self");const person=await personFor(db,user);if(!own(person,user))throw new HrmError("forbidden",403);
 const declaration=await db.prepare("SELECT person_id,employment_id,supersedes_id,supersedes_version,state FROM hrm_coi_declarations WHERE id=?").bind(declarationId).first<{person_id:string;employment_id:string;supersedes_id:string|null;supersedes_version:number|null;state:string}>();if(!declaration||declaration.person_id!==person.id)throw new HrmError("not_found",404);
 const payload={declarationId,person:person.id,employment:person.employment_id,expectedVersion},prior=await priorCommand(db,user,key,"coi_submit",payload);if(prior)return;
 if(declaration.state!=="draft")throw new HrmError("not_found",404);
 const time=now(),guards=[guard(db,"EXISTS(SELECT 1 FROM hrm_coi_declarations WHERE id=? AND person_id=? AND employment_id=? AND version=? AND state='draft')",[declarationId,person.id,person.employment_id,expectedVersion])],writes:D1PreparedStatement[]=[];
 if(declaration.supersedes_id){
  guards.push(guard(db,"EXISTS(SELECT 1 FROM hrm_coi_declarations WHERE id=? AND person_id=? AND version=? AND state NOT IN ('draft','superseded')) AND NOT EXISTS(SELECT 1 FROM hrm_legal_files WHERE coi_declaration_id=? AND state='quarantined')",[declaration.supersedes_id,person.id,declaration.supersedes_version,declaration.supersedes_id]));
  writes.push(db.prepare("UPDATE hrm_coi_declarations SET state='superseded',version=version+1,actor_id=?,updated_at=? WHERE id=? AND person_id=? AND version=? AND state NOT IN ('draft','superseded')").bind(user.id,time,declaration.supersedes_id,person.id,declaration.supersedes_version));
 }
 writes.push(db.prepare("UPDATE hrm_coi_declarations SET state='submitted',submitted_by=?,submitted_at=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='draft'").bind(user.id,time,user.id,time,declarationId,expectedVersion),db.prepare("DELETE FROM hrm_write_guards"));
 await command(db,user,key,"coi_submit",payload,declarationId,guards,writes);
}
export async function assignCoiReviewer(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,declarationId:string,version:number,reviewerId:string|null):Promise<void>{
 requirePermission(user,"hrm.configure");const payload={declarationId,version,reviewerId},prior=await priorCommand(db,user,key,"coi_assign_reviewer",payload);if(prior)return;if(reviewerId){const reviewers=await membersWithRoles(db,content,["hrm_officer","hrm_admin"]);if(!reviewers.some(row=>row.user_id===reviewerId))throw new HrmError("invalid_reviewer")}
 const current=await db.prepare("SELECT state,submitted_by FROM hrm_coi_declarations WHERE id=?").bind(declarationId).first<{state:string;submitted_by:string|null}>();if(!current||["draft","closed","superseded"].includes(current.state))throw new HrmError("not_found",404);
 if(reviewerId&&reviewerId===current.submitted_by)throw new HrmError("self_approval",403);
 await command(db,user,key,"coi_assign_reviewer",payload,declarationId,[guard(db,"EXISTS(SELECT 1 FROM hrm_coi_declarations WHERE id=? AND version=? AND state NOT IN ('draft','closed','superseded'))",[declarationId,version])],[db.prepare("UPDATE hrm_coi_declarations SET assigned_reviewer_id=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=?").bind(reviewerId,user.id,now(),declarationId,version),db.prepare("DELETE FROM hrm_write_guards")]);
}
export async function listCoiReviewers(db:D1Database,content:D1Database,user:WorkspaceUser):Promise<Awaited<ReturnType<typeof membersWithRoles>>>{
 requirePermission(user,"hrm.configure");return membersWithRoles(db,content,["hrm_officer","hrm_admin"]);
}
export async function listCoiEvidence(db:D1Database,user:WorkspaceUser,declarationId:string):Promise<LegalCoiFile[]>{
 await getCoiDeclaration(db,user,declarationId);
 return (await db.prepare("SELECT id,object_key,kind,coi_declaration_id,person_id,original_name,mime_type,size_bytes,checksum,state,uploaded_by,reviewed_by,reviewed_at,version,created_at FROM hrm_legal_files WHERE coi_declaration_id=? ORDER BY created_at DESC LIMIT 50").bind(declarationId).all<LegalCoiFile>()).results;
}
export interface LegalCoiFile {id:string;object_key:string;kind:string;coi_declaration_id:string;person_id:string;original_name:string;mime_type:string;size_bytes:number;checksum:string;state:string;uploaded_by:string;reviewed_by:string|null;reviewed_at:string|null;version:number;created_at:string}
export async function startCoiReview(db:D1Database,user:WorkspaceUser,key:string,declarationId:string,version:number):Promise<void>{
 requirePermission(user,"hrm.coi.review");
 const payload={declarationId,version},prior=await priorCommand(db,user,key,"coi_start_review",payload);if(prior)return;
 const current=await db.prepare("SELECT state,submitted_by,assigned_reviewer_id FROM hrm_coi_declarations WHERE id=?").bind(declarationId).first<{state:string;submitted_by:string|null;assigned_reviewer_id:string|null}>();
 if(!current||!("submitted,clarification_needed,mitigation_required,escalated".split(",").includes(current.state)))throw new HrmError("not_found",404);
 if(!user.can("hrm.configure")&&current.assigned_reviewer_id!==user.id)throw new HrmError("forbidden",403);
 if(current.submitted_by===user.id)throw new HrmError("self_approval",403);
 const time=now();
 await command(db,user,key,"coi_start_review",payload,declarationId,[guard(db,"EXISTS(SELECT 1 FROM hrm_coi_declarations WHERE id=? AND version=? AND state IN ('submitted','clarification_needed','mitigation_required','escalated') AND submitted_by!=?)",[declarationId,version,user.id])],[db.prepare("UPDATE hrm_coi_declarations SET state='under_review',version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=?").bind(user.id,time,declarationId,version),db.prepare("DELETE FROM hrm_write_guards")]);
}
export async function reviewCoiDeclaration(db:D1Database,user:WorkspaceUser,key:string,declarationId:string,version:number,decision:"clarification_needed"|"cleared"|"mitigation_required"|"escalated"|"closed",reason:string,mitigation:string,followupDue:string|null):Promise<void>{
 requirePermission(user,"hrm.coi.review");if(!reason.trim()||reason.length>1000)throw new HrmError("reason_required");if(decision==="mitigation_required"&&(!mitigation.trim()||!followupDue))throw new HrmError("mitigation_required");if(followupDue)date(followupDue);
 const payload={declarationId,version,decision,reason:reason.trim(),mitigation:mitigation.trim(),followupDue},prior=await priorCommand(db,user,key,"coi_review",payload);if(prior)return;
 const declaration=await db.prepare("SELECT person_id,submitted_by,assigned_reviewer_id,state FROM hrm_coi_declarations WHERE id=?").bind(declarationId).first<{person_id:string;submitted_by:string|null;assigned_reviewer_id:string|null;state:string}>();if(!declaration||declaration.state==="draft"||declaration.state==="closed")throw new HrmError("not_found",404);
 if(!user.can("hrm.configure")&&declaration.assigned_reviewer_id!==user.id)throw new HrmError("forbidden",403);
 if(declaration.submitted_by===user.id)throw new HrmError("self_approval",403);
 if(decision==="closed"?!["cleared","mitigation_required","escalated"].includes(declaration.state):declaration.state!=="under_review")throw new HrmError("invalid_transition",409);
 if(decision==="closed"){const pending=await db.prepare("SELECT 1 AS pending FROM hrm_legal_files WHERE coi_declaration_id=? AND state='quarantined' LIMIT 1").bind(declarationId).first<{pending:number}>();if(pending)throw new HrmError("evidence_pending",409)}
 const expectedState=declaration.state,time=now();await command(db,user,key,"coi_review",payload,declarationId,[guard(db,"EXISTS(SELECT 1 FROM hrm_coi_declarations WHERE id=? AND version=? AND state=? AND submitted_by!=?)",[declarationId,version,expectedState,user.id])],[db.prepare("UPDATE hrm_coi_declarations SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,mitigation=?,followup_due=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state=?").bind(decision,user.id,time,reason.trim(),mitigation.trim()||null,followupDue,user.id,time,declarationId,version,expectedState),db.prepare("DELETE FROM hrm_write_guards")]);
}
