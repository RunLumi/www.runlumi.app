import type { WorkspaceUser } from "../workspace/roles";
import { HrmError, date } from "./fields";
import { command, digest, guardBoolean, id, localDate, now, settings } from "./service";
import { closeoutPolicySourceSql } from "./closeout-policies";
import { closeoutDossierControlTarget, closeoutFileControlTarget, type CloseoutDossier, type CloseoutFile } from "./closeout-dossiers";
import { beginFinancialErasure, completeFinancialErasure, financialFilePayloadKey, readFinancialControl, requireLiveFinancialControl, type FinancialControlTarget, type FinancialErasureAuthorization, type StoredFinancialControl } from "./financial-control";
import { activeFinancialRetentionPolicy, financialPolicyActor, financialPolicyAuthority, verifyFinancialRetentionSource, type FinancialRetentionPolicy } from "./financial-retention-policies";

export type FinancialDispositionKind="file"|"dossier";
export interface FinancialDispositionRequest {
 id:string;target_kind:FinancialDispositionKind;case_id:string;file_id:string|null;dossier_id:string|null;
 policy_id:string;policy_revision:number;policy_version:number;target_version:number;case_version:number;
 target_checksum:string;control_checksum:string;target_size_bytes:number;object_key_snapshot:string|null;anchor_snapshot:string;due_on:string;
 state:"pending_review"|"approved"|"rejected"|"blocked"|"deleting"|"retryable"|"completed";
 request_reason:string;requested_by:string;requested_at:string;reviewed_by:string|null;reviewed_at:string|null;review_reason:string|null;
 started_by:string|null;started_at:string|null;completed_by:string|null;completed_at:string|null;completion_detail:string|null;block_reason:string|null;
 version:number;actor_id:string;updated_at:string;
}
interface FinancialCase {id:string;person_id:string;employment_id:string;employee_user_id:string|null;person_user_id:string|null;ended_on:string;employment_ended_on:string|null;completed_at:string|null;state:string;version:number;legal_entity:string}
interface Target {version:number;checksum:string;objectKey:string|null;createdAt:string;appliedAt:string|null;control:FinancialControlTarget;file:CloseoutFile|null;dossier:CloseoutDossier|null}
const ref=(value:string)=>{if(!/^[A-Za-z0-9_-]{1,120}$/.test(value))throw new HrmError("financial_retention_invalid",400);return value};
const reason=(value:string)=>{const result=value.trim();if(!result||result.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result))throw new HrmError("reason_required",400);return result};
async function receipt(db:D1Database,user:WorkspaceUser,key:string,operation:string,payload:unknown){
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new HrmError("invalid_request_key");
 const row=await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string;result_id:string}>();
 if(!row)return null;if(row.operation!==operation||row.payload_hash!==await digest(JSON.stringify(payload)))throw new HrmError("request_key_conflict",409);return row.result_id;
}
async function context(db:D1Database,content:D1Database,user:WorkspaceUser,caseId:string,permission:"hrm.retention.manage"|"hrm.retention.review"|"hrm.retention.activate",ready=true){
 const current=await financialPolicyActor(db,content,user,permission),config=await settings(db);
 if(ready&&(user.hrmEnabled!==true||config.enabled!==1||!config.reviewed_by))throw new HrmError("hrm_closed",503);
 const value=await db.prepare(`SELECT c.id,c.person_id,c.employment_id,c.employee_user_id,p.user_id AS person_user_id,c.ended_on,e.ended_on AS employment_ended_on,c.completed_at,c.state,c.version,e.legal_entity
 FROM hrm_offboarding_cases c JOIN hrm_people p ON p.id=c.person_id JOIN hrm_employments e ON e.id=c.employment_id AND e.person_id=c.person_id WHERE c.id=?`).bind(ref(caseId)).first<FinancialCase>();
 if(!value)throw new HrmError("not_found",404);
 if(value.employee_user_id===user.id||value.person_user_id===user.id)throw new HrmError("self_approval",403);
 if(ready&&(value.legal_entity!==config.legal_entity||value.ended_on!==value.employment_ended_on))throw new HrmError("financial_disposition_changed",409);
 return {current,config,value};
}

function erasureDecision(row:FinancialDispositionRequest):FinancialErasureAuthorization{
 if(!row.reviewed_by||!row.reviewed_at||!row.started_by||!row.started_at)throw new HrmError("financial_disposition_changed",409);
 return {requestId:row.id,policyId:row.policy_id,policyRevision:row.policy_revision,requestedBy:row.requested_by,requestedAt:row.requested_at,
  reviewedBy:row.reviewed_by,reviewedAt:row.reviewed_at,authorizedBy:row.started_by,authorizedAt:row.started_at,completedBy:null,completedAt:null};
}
function fileRequestControl(row:FinancialDispositionRequest,scope:FinancialCase):FinancialControlTarget{
 if(row.target_kind!=="file"||!row.file_id||row.target_checksum!==row.control_checksum)throw new HrmError("financial_disposition_changed",409);
 return {kind:"file",id:row.file_id,caseId:row.case_id,personId:scope.person_id,employmentId:scope.employment_id,checksum:row.control_checksum,sizeBytes:row.target_size_bytes};
}
async function dispositionRow(db:D1Database,caseId:string,requestId:string):Promise<FinancialDispositionRequest>{
 const row=await db.prepare("SELECT * FROM hrm_financial_disposition_requests WHERE id=? AND case_id=?").bind(requestId,caseId).first<FinancialDispositionRequest>();
 if(!row)throw new HrmError("not_found",404);return row;
}
async function settleFileDisposition(db:D1Database,scope:FinancialCase,current:WorkspaceUser,row:FinancialDispositionRequest,marker:StoredFinancialControl):Promise<void>{
 const decision=marker.value.erasure;
 if(marker.value.phase!=="erased"||!decision?.completedBy||!decision.completedAt||decision.requestId!==row.id||decision.policyId!==row.policy_id||decision.policyRevision!==row.policy_revision
  ||decision.requestedBy!==row.requested_by||decision.reviewedBy!==row.reviewed_by)throw new HrmError("financial_disposition_changed",409);
 const settled=async(request:FinancialDispositionRequest)=>{
  const saved=await db.prepare("SELECT object_deleted_at,disposition_state,checksum,object_key FROM hrm_closeout_files WHERE id=? AND case_id=?").bind(request.file_id,scope.id).first<{object_deleted_at:string|null;disposition_state:string;checksum:string;object_key:string}>();
  return request.state==="completed"&&request.completed_by===decision.completedBy&&request.completed_at===decision.completedAt
   &&saved?.object_deleted_at===decision.completedAt&&saved.disposition_state==="completed"&&saved.checksum===request.target_checksum&&saved.object_key===request.object_key_snapshot;
 };
 if(row.state==="completed"){
  if(await settled(row))return;
  throw new HrmError("financial_disposition_changed",409);
 }
 const time=now();
 try{
  await db.batch([
   guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_financial_disposition_requests WHERE id=? AND state IN ('deleting','retryable') AND requested_by!=? AND reviewed_by IS NOT NULL AND reviewed_by!=?)",[row.id,current.id,current.id]),
   holdGuard(db,scope,"file",row.file_id!),
   guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_closeout_files WHERE id=? AND case_id=? AND version=? AND checksum=? AND object_key=? AND object_deleted_at IS NULL AND disposition_state='deleting')",[row.file_id,scope.id,row.target_version+1,row.target_checksum,row.object_key_snapshot]),
   db.prepare("INSERT INTO hrm_financial_disposition_execution_scope(request_id,phase,actor_id,created_at) VALUES(?,'complete',?,?)").bind(row.id,current.id,time),
   db.prepare("UPDATE hrm_closeout_files SET object_deleted_at=?,disposition_state='completed',version=version+1,actor_id=?,updated_at=? WHERE id=? AND case_id=?").bind(decision.completedAt,current.id,time,row.file_id,scope.id),
   db.prepare("UPDATE hrm_financial_disposition_requests SET state='completed',completed_by=?,completed_at=?,completion_detail='Financial payload erasure confirmed; original checksum and decision references retained.',version=version+1,actor_id=?,updated_at=? WHERE id=? AND state IN ('deleting','retryable')").bind(decision.completedBy,decision.completedAt,current.id,time,row.id),
   db.prepare("INSERT INTO hrm_financial_retention_events(request_id,event_type,detail_json,actor_id,created_at) VALUES(?,'tombstone_recorded',?,?,?)").bind(row.id,JSON.stringify({erasedBy:decision.completedBy,erasedAt:decision.completedAt,checksum:row.target_checksum}),current.id,time),
   db.prepare("DELETE FROM hrm_financial_disposition_execution_scope WHERE request_id=?").bind(row.id),
   db.prepare("DELETE FROM hrm_write_guards"),
  ]);
 }catch(error){
  const latest=await dispositionRow(db,row.case_id,row.id);
  if(!await settled(latest))throw error;
 }
}
/** Caller-facing file operation. Dossier payload execution uses its own
 * controlled redaction path, never a simulated R2 file deletion. */
export async function executeFinancialFileDisposition(db:D1Database,content:D1Database,bucket:R2Bucket,user:WorkspaceUser,key:string,input:{caseId:string;requestId:string;version:number;confirmed:boolean}):Promise<void>{
 if(!input.confirmed)throw new HrmError("confirmation_required",400);
 if(!Number.isSafeInteger(input.version)||input.version<1)throw new HrmError("financial_retention_invalid",400);
 const payload={...input,caseId:ref(input.caseId),requestId:ref(input.requestId)},initial=await context(db,content,user,payload.caseId,"hrm.retention.activate",false);
 if(!initial.current.admin)throw new HrmError("retention_execution_system_admin_only",403);
 let row=await dispositionRow(db,payload.caseId,payload.requestId);
 if(row.requested_by===user.id||row.reviewed_by===user.id)throw new HrmError("retention_executor_must_differ",403);
 const expected=fileRequestControl(row,initial.value),prior=await receipt(db,initial.current,key,"financial_disposition_execute",payload);
 let marker=await readFinancialControl(bucket,expected);
 if(marker.value.phase==="erased"){
  if(!["deleting","retryable","completed"].includes(row.state))throw new HrmError("financial_disposition_changed",409);
  await settleFileDisposition(db,initial.value,initial.current,row,marker);return;
 }
 if(row.state==="completed"||!["approved","deleting","retryable"].includes(row.state))throw new HrmError("financial_disposition_changed",409);
 if(!prior&&input.version!==row.version)throw new HrmError("financial_disposition_changed",409);
 const ctx=await context(db,content,user,payload.caseId,"hrm.retention.activate");
 let policy:FinancialRetentionPolicy,loaded:Target;
 const starting=row.state==="approved";
 if(starting){
  loaded=await financialDispositionTarget(db,ctx.value,"file",row.file_id!);
  policy=await activeFinancialRetentionPolicy(db,bucket,row.policy_id,ctx.value.legal_entity);
  const due=financialDispositionDue(policy,"file",ctx.value,loaded);
  if(loaded.version!==row.target_version||loaded.checksum!==row.target_checksum||ctx.value.version!==row.case_version
   ||due.dueOn!==row.due_on||due.anchorSnapshot!==row.anchor_snapshot||row.due_on>localDate())throw new HrmError("financial_disposition_changed",409);
  await requireLiveFinancialControl(bucket,expected);
 }else{
  const value=await db.prepare("SELECT * FROM hrm_financial_retention_policy_versions WHERE id=? AND legal_entity=? AND state='active'").bind(row.policy_id,ctx.value.legal_entity).first<FinancialRetentionPolicy>();
  if(!value||!row.started_at)throw new HrmError("financial_disposition_changed",409);policy=value;
  const authorizedDay=calendarDay(row.started_at);if(authorizedDay<policy.effective_from||authorizedDay>policy.effective_until)throw new HrmError("financial_disposition_changed",409);
  await verifyFinancialRetentionSource(db,bucket,policy);
  const file=await db.prepare("SELECT * FROM hrm_closeout_files WHERE id=? AND case_id=? AND disposition_state='deleting' AND object_deleted_at IS NULL").bind(row.file_id,ctx.value.id).first<CloseoutFile>();
  if(!file||file.version!==row.target_version+1||file.checksum!==row.target_checksum||file.object_key!==row.object_key_snapshot)throw new HrmError("financial_disposition_changed",409);
  loaded={version:file.version,checksum:file.checksum,objectKey:file.object_key,createdAt:file.created_at,appliedAt:null,control:expected,file,dossier:null};
 }
 if(policy.version!==row.policy_version||policy.revision!==row.policy_revision||financialFilePayloadKey(expected)!==row.object_key_snapshot)throw new HrmError("financial_disposition_changed",409);
 if(await held(db,ctx.value,"file",row.file_id!))throw new HrmError("legal_hold_active",409);
 const object=await bucket.head(row.object_key_snapshot!);
 if(object&&(object.size!==expected.sizeBytes||object.customMetadata?.checksum!==expected.checksum||object.customMetadata?.case_id!==expected.caseId))throw new HrmError("financial_payload_unavailable",503);
 const current=await financialPolicyActor(db,content,user,"hrm.retention.activate");if(!current.admin)throw new HrmError("retention_execution_system_admin_only",403);
 const time=now(),guards=[...financialPolicyAuthority(db,current,"hrm.retention.activate"),caseGuard(db,ctx.value,current,ctx.config.version),holdGuard(db,ctx.value,"file",row.file_id!),
  guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_financial_disposition_requests WHERE id=? AND version=? AND state=? AND requested_by!=? AND reviewed_by IS NOT NULL AND reviewed_by!=?)",[row.id,row.version,row.state,current.id,current.id]),
  guardBoolean(db,`EXISTS(SELECT 1 FROM hrm_financial_retention_policy_versions p WHERE p.id=? AND p.state='active' AND p.version=? AND p.revision=? AND ${closeoutPolicySourceSql})`,[policy.id,row.policy_version,row.policy_revision])];
 guards.push(starting?targetGuard(db,ctx.value,"file",row.file_id!,loaded):guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_closeout_files WHERE id=? AND case_id=? AND version=? AND object_deleted_at IS NULL AND disposition_state='deleting')",[row.file_id,ctx.value.id,row.target_version+1]));
 const writes:D1PreparedStatement[]=[db.prepare(`UPDATE hrm_financial_disposition_requests SET state='deleting',version=version+1,actor_id=?,updated_at=?${starting?",started_by=?,started_at=?":""} WHERE id=? AND version=?`).bind(current.id,time,...(starting?[current.id,time]:[]),row.id,row.version)];
 if(starting)writes.push(
  db.prepare("INSERT INTO hrm_financial_disposition_execution_scope(request_id,phase,actor_id,created_at) VALUES(?,'reserve',?,?)").bind(row.id,current.id,time),
  db.prepare("UPDATE hrm_closeout_files SET disposition_state='deleting',version=version+1,actor_id=?,updated_at=? WHERE id=? AND case_id=? AND version=?").bind(current.id,time,row.file_id,ctx.value.id,row.target_version),
  db.prepare("DELETE FROM hrm_financial_disposition_execution_scope WHERE request_id=?").bind(row.id));
 writes.push(db.prepare("INSERT INTO hrm_financial_retention_events(request_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,?,?,?)").bind(row.id,starting?"execution_reserved":"execution_resumed",JSON.stringify({policyRevision:row.policy_revision}),current.id,time));
 if(!prior)await command(db,current,key,"financial_disposition_execute",payload,row.id,guards,writes);
 row=await dispositionRow(db,row.case_id,row.id);
 try{
  const decision=erasureDecision(row);marker=await beginFinancialErasure(bucket,expected,decision);
  if(marker.value.phase!=="erased"){
   const active=await financialPolicyActor(db,content,user,"hrm.retention.activate"),config=await settings(db);
   if(!active.admin)throw new HrmError("retention_execution_system_admin_only",403);
   if(user.hrmEnabled!==true||config.enabled!==1||!config.reviewed_by)throw new HrmError("hrm_closed",503);
   await bucket.delete(row.object_key_snapshot!);
   marker=await completeFinancialErasure(bucket,expected,decision,active.id);
  }
  await settleFileDisposition(db,ctx.value,current,row,marker);
 }catch(error){
  await db.prepare("UPDATE hrm_financial_disposition_requests SET state='retryable',completion_detail='Execution requires reconciliation before completion.',version=version+1,actor_id='system:hrm-financial-reconcile',updated_at=? WHERE id=? AND state='deleting'").bind(now(),row.id).run().catch(()=>{});
  if(error instanceof HrmError)throw error;throw new HrmError("financial_disposition_retryable",503);
 }
}
export async function financialDispositionTarget(db:D1Database,scope:FinancialCase,kind:FinancialDispositionKind,targetId:string):Promise<Target>{
 if(kind==="file"){
  const row=await db.prepare("SELECT * FROM hrm_closeout_files WHERE id=? AND case_id=?").bind(ref(targetId),scope.id).first<CloseoutFile>();
  if(!row)throw new HrmError("not_found",404);
  if(row.object_deleted_at||!["none","rejected","blocked"].includes(row.disposition_state))throw new HrmError("financial_disposition_changed",409);
  if(row.state==="quarantined"||!row.reviewed_by||row.reviewed_by===row.uploaded_by)throw new HrmError("retention_file_unreviewed",409);
  return {version:row.version,checksum:row.checksum,objectKey:row.object_key,createdAt:row.created_at,appliedAt:null,control:closeoutFileControlTarget(row,scope),file:row,dossier:null};
 }
 if(kind!=="dossier")throw new HrmError("financial_retention_invalid",400);
 const row=await db.prepare("SELECT * FROM hrm_closeout_dossiers WHERE id=? AND case_id=?").bind(ref(targetId),scope.id).first<CloseoutDossier>();
 if(!row)throw new HrmError("not_found",404);
 if(row.payload_disposition_state!=="none")throw new HrmError("financial_disposition_changed",409);
 const checksum=await digest(JSON.stringify({basis_json:row.basis_json,checks_json:row.checks_json,no_payroll_evidence_json:row.no_payroll_evidence_json,review_reason:row.review_reason}));
 return {version:row.version,checksum,objectKey:null,createdAt:row.prepared_at,appliedAt:row.applied_at,control:await closeoutDossierControlTarget(row),file:null,dossier:row};
}
function calendarDay(value:string):string{
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)){const valid=date(value);if(valid)return valid;}
 const at=Date.parse(value);if(!Number.isFinite(at)||!/(?:Z|[+-]\d\d:\d\d)$/.test(value))throw new HrmError("financial_retention_anchor_unavailable",409);
 return new Date(at+7*3600000).toISOString().slice(0,10);
}
export function financialDispositionDue(policy:FinancialRetentionPolicy,kind:FinancialDispositionKind,scope:{ended_on:string;completed_at:string|null},target:{createdAt:string;appliedAt:string|null}){
 const days=kind==="file"?policy.file_days:policy.dossier_days,anchor=kind==="file"?policy.file_anchor:policy.dossier_anchor;
 if(days===null||anchor===null)throw new HrmError("financial_retention_manual",409);
 const value=anchor==="employment_ended"?scope.ended_on:anchor==="case_completed"?scope.completed_at:anchor==="dossier_applied"?target.appliedAt:target.createdAt;
 if(!value)throw new HrmError("financial_retention_anchor_unavailable",409);
 const day=calendarDay(value),dueOn=new Date(Date.parse(day+"T00:00:00Z")+days*86400000).toISOString().slice(0,10);
 return {anchorSnapshot:value,dueOn};
}
function holdGuard(db:D1Database,scope:FinancialCase,kind:FinancialDispositionKind,targetId:string){
 return guardBoolean(db,`NOT EXISTS(SELECT 1 FROM hrm_legal_holds WHERE state='active' AND scope_kind='person' AND person_id=? AND category='*')
 AND NOT EXISTS(SELECT 1 FROM hrm_closeout_file_holds WHERE state='active' AND ?='file' AND file_id=?)`,[scope.person_id,kind,targetId]);
}
async function held(db:D1Database,scope:FinancialCase,kind:FinancialDispositionKind,targetId:string):Promise<boolean>{
 return !!await db.prepare(`SELECT 1 WHERE EXISTS(SELECT 1 FROM hrm_legal_holds WHERE state='active' AND scope_kind='person' AND person_id=? AND category='*')
 OR EXISTS(SELECT 1 FROM hrm_closeout_file_holds WHERE state='active' AND ?='file' AND file_id=?)`).bind(scope.person_id,kind,targetId).first();
}
function caseGuard(db:D1Database,scope:FinancialCase,user:WorkspaceUser,configVersion:number){
 return guardBoolean(db,`EXISTS(SELECT 1 FROM hrm_offboarding_cases c JOIN hrm_people p ON p.id=c.person_id JOIN hrm_employments e ON e.id=c.employment_id
 JOIN hrm_settings s ON s.id=1 WHERE c.id=? AND c.version=? AND c.employee_user_id IS NOT ? AND p.user_id IS NOT ?
 AND c.ended_on=e.ended_on AND e.legal_entity=? AND s.legal_entity=e.legal_entity AND s.enabled=1 AND s.reviewed_by IS NOT NULL AND s.version=?)`,[scope.id,scope.version,user.id,user.id,scope.legal_entity,configVersion]);
}
function policyGuard(db:D1Database,policy:FinancialRetentionPolicy){
 return guardBoolean(db,`EXISTS(SELECT 1 FROM hrm_financial_retention_policy_versions p WHERE p.id=? AND p.version=? AND p.revision=? AND p.state='active'
 AND p.effective_from<=? AND p.effective_until>=? AND ${closeoutPolicySourceSql})`,[policy.id,policy.version,policy.revision,localDate(),localDate()]);
}
function targetGuard(db:D1Database,scope:FinancialCase,kind:FinancialDispositionKind,targetId:string,loaded:Target){
 return kind==="file"?guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_closeout_files WHERE id=? AND case_id=? AND version=? AND checksum=? AND object_key=? AND object_deleted_at IS NULL AND disposition_state IN ('none','rejected','blocked') AND state!='quarantined' AND reviewed_by IS NOT NULL AND reviewed_by!=uploaded_by)",[targetId,scope.id,loaded.version,loaded.checksum,loaded.objectKey])
 :guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_closeout_dossiers WHERE id=? AND case_id=? AND version=? AND payload_disposition_state='none')",[targetId,scope.id,loaded.version]);
}
export async function createFinancialDispositionRequest(db:D1Database,content:D1Database,bucket:R2Bucket,user:WorkspaceUser,key:string,input:{caseId:string;targetKind:FinancialDispositionKind;targetId:string;targetVersion:number;policyId:string;reason:string;confirmed:boolean}):Promise<string>{
 if(!input.confirmed)throw new HrmError("confirmation_required",400);
 if(!["file","dossier"].includes(input.targetKind)||!Number.isSafeInteger(input.targetVersion)||input.targetVersion<1)throw new HrmError("financial_retention_invalid",400);
 const payload={...input,caseId:ref(input.caseId),targetId:ref(input.targetId),policyId:ref(input.policyId),reason:reason(input.reason)};
 const ctx=await context(db,content,user,payload.caseId,"hrm.retention.manage");
 const prior=await receipt(db,ctx.current,key,"financial_disposition_request",payload);if(prior)return prior;
 const loaded=await financialDispositionTarget(db,ctx.value,payload.targetKind,payload.targetId);
 if(loaded.version!==payload.targetVersion)throw new HrmError("financial_disposition_changed",409);
 const policy=await activeFinancialRetentionPolicy(db,bucket,payload.policyId,ctx.value.legal_entity),due=financialDispositionDue(policy,payload.targetKind,ctx.value,loaded);
 if(due.dueOn>localDate())throw new HrmError("retention_not_due",409);
 if(await held(db,ctx.value,payload.targetKind,payload.targetId))throw new HrmError("legal_hold_active",409);
 await requireLiveFinancialControl(bucket,loaded.control);
 const current=await financialPolicyActor(db,content,user,"hrm.retention.manage"),requestId=id("financial_disposition"),time=now();
 await command(db,current,key,"financial_disposition_request",payload,requestId,[...financialPolicyAuthority(db,current,"hrm.retention.manage"),caseGuard(db,ctx.value,current,ctx.config.version),policyGuard(db,policy),holdGuard(db,ctx.value,payload.targetKind,payload.targetId),targetGuard(db,ctx.value,payload.targetKind,payload.targetId,loaded)],[
  db.prepare(`INSERT INTO hrm_financial_disposition_requests(id,target_kind,case_id,file_id,dossier_id,policy_id,policy_revision,policy_version,target_version,case_version,target_checksum,control_checksum,target_size_bytes,object_key_snapshot,anchor_snapshot,due_on,request_reason,requested_by,requested_at,actor_id,updated_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(requestId,payload.targetKind,ctx.value.id,payload.targetKind==="file"?payload.targetId:null,payload.targetKind==="dossier"?payload.targetId:null,policy.id,policy.revision,policy.version,loaded.version,ctx.value.version,loaded.checksum,loaded.control.checksum,loaded.control.sizeBytes,loaded.objectKey,due.anchorSnapshot,due.dueOn,payload.reason,current.id,time,current.id,time),
  db.prepare("INSERT INTO hrm_financial_retention_events(request_id,event_type,detail_json,actor_id,created_at) VALUES(?,'requested',?,?,?)").bind(requestId,JSON.stringify({targetKind:payload.targetKind,dueOn:due.dueOn,policyRevision:policy.revision}),current.id,time),
 ]);return requestId;
}
export async function reviewFinancialDispositionRequest(db:D1Database,content:D1Database,bucket:R2Bucket,user:WorkspaceUser,key:string,input:{caseId:string;requestId:string;version:number;approve:boolean;reason:string;confirmed:boolean}):Promise<void>{
 if(!input.confirmed)throw new HrmError("confirmation_required",400);
 if(typeof input.approve!=="boolean"||!Number.isSafeInteger(input.version)||input.version<1)throw new HrmError("financial_retention_invalid",400);
 const payload={...input,caseId:ref(input.caseId),requestId:ref(input.requestId),reason:reason(input.reason)},ctx=await context(db,content,user,payload.caseId,"hrm.retention.review");
 if(await receipt(db,ctx.current,key,"financial_disposition_review",payload))return;
 const row=await db.prepare("SELECT * FROM hrm_financial_disposition_requests WHERE id=? AND case_id=?").bind(payload.requestId,payload.caseId).first<FinancialDispositionRequest>();
 if(!row)throw new HrmError("not_found",404);if(row.requested_by===user.id)throw new HrmError("self_approval",403);
 if(row.state!=="pending_review"||row.version!==input.version)throw new HrmError("financial_disposition_changed",409);
 if(!input.approve){
  const current=await financialPolicyActor(db,content,user,"hrm.retention.review"),time=now();
  await command(db,current,key,"financial_disposition_review",payload,row.id,[...financialPolicyAuthority(db,current,"hrm.retention.review"),caseGuard(db,ctx.value,current,ctx.config.version),
   guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_financial_disposition_requests WHERE id=? AND version=? AND state='pending_review' AND requested_by!=?)",[row.id,input.version,current.id])],[
   db.prepare("UPDATE hrm_financial_disposition_requests SET state='rejected',reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='pending_review'").bind(current.id,time,payload.reason,current.id,time,row.id,input.version),
   db.prepare("INSERT INTO hrm_financial_retention_events(request_id,event_type,detail_json,actor_id,created_at) VALUES(?,'rejected',?,?,?)").bind(row.id,JSON.stringify({targetKind:row.target_kind}),current.id,time),
  ]);return;
 }
 const targetId=row.file_id??row.dossier_id!,loaded=await financialDispositionTarget(db,ctx.value,row.target_kind,targetId);
 if(loaded.version!==row.target_version||loaded.checksum!==row.target_checksum||ctx.value.version!==row.case_version)throw new HrmError("financial_disposition_changed",409);
 const policy=await activeFinancialRetentionPolicy(db,bucket,row.policy_id,ctx.value.legal_entity),due=financialDispositionDue(policy,row.target_kind,ctx.value,loaded);
 if(policy.version!==row.policy_version||policy.revision!==row.policy_revision||due.dueOn!==row.due_on||due.anchorSnapshot!==row.anchor_snapshot)throw new HrmError("financial_disposition_changed",409);
 if(row.due_on>localDate())throw new HrmError("retention_not_due",409);
 if(await held(db,ctx.value,row.target_kind,targetId))throw new HrmError("legal_hold_active",409);
 await requireLiveFinancialControl(bucket,loaded.control);
 const current=await financialPolicyActor(db,content,user,"hrm.retention.review"),time=now();
 await command(db,current,key,"financial_disposition_review",payload,row.id,[...financialPolicyAuthority(db,current,"hrm.retention.review"),caseGuard(db,ctx.value,current,ctx.config.version),
  guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_financial_disposition_requests WHERE id=? AND version=? AND state='pending_review' AND requested_by!=?)",[row.id,input.version,current.id]),
  ...(input.approve?[policyGuard(db,policy),holdGuard(db,ctx.value,row.target_kind,targetId),targetGuard(db,ctx.value,row.target_kind,targetId,loaded)]:[])],[
  db.prepare("UPDATE hrm_financial_disposition_requests SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='pending_review'").bind(input.approve?"approved":"rejected",current.id,time,payload.reason,current.id,time,row.id,input.version),
  db.prepare("INSERT INTO hrm_financial_retention_events(request_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,?,?,?)").bind(row.id,input.approve?"approved":"rejected",JSON.stringify({targetKind:row.target_kind,policyRevision:row.policy_revision}),current.id,time),
 ]);
}

function dossierRequestControl(row:FinancialDispositionRequest,scope:FinancialCase):FinancialControlTarget{
 if(row.target_kind!=="dossier"||!row.dossier_id||row.object_key_snapshot!==null)throw new HrmError("financial_disposition_changed",409);
 return {kind:"dossier",id:row.dossier_id,caseId:row.case_id,personId:scope.person_id,employmentId:scope.employment_id,checksum:row.control_checksum,sizeBytes:row.target_size_bytes};
}
function isDisposedDossier(row:CloseoutDossier,request:FinancialDispositionRequest):boolean{
 return row.payload_disposition_state==="completed"&&!!row.payload_disposed_at&&row.payload_disposed_checksum===request.target_checksum
  &&row.disposition_request_id===request.id&&row.basis_json==="{}"&&row.checks_json==="[]"&&row.no_payroll_evidence_json==="[]"
  &&row.review_reason==="Disposed under approved retention";
}
/** D1 private fields and their direct event copies are redacted atomically.
 * Only after a readback proves that commit may the independent control close.
 * A retry after that commit only reconciles the control; it never revives data. */
export async function executeFinancialDossierDisposition(db:D1Database,content:D1Database,bucket:R2Bucket,user:WorkspaceUser,key:string,input:{caseId:string;requestId:string;version:number;confirmed:boolean}):Promise<void>{
 if(!input.confirmed)throw new HrmError("confirmation_required",400);
 if(!Number.isSafeInteger(input.version)||input.version<1)throw new HrmError("financial_retention_invalid",400);
 const payload={...input,caseId:ref(input.caseId),requestId:ref(input.requestId)},initial=await context(db,content,user,payload.caseId,"hrm.retention.activate",false);
 if(!initial.current.admin)throw new HrmError("retention_execution_system_admin_only",403);
 let row=await dispositionRow(db,payload.caseId,payload.requestId);
 if(row.requested_by===initial.current.id||row.reviewed_by===initial.current.id)throw new HrmError("retention_executor_must_differ",403);
 const expected=dossierRequestControl(row,initial.value),prior=await receipt(db,initial.current,key,"financial_dossier_disposition_execute",payload);
 const readDossier=async()=>{
  const value=await db.prepare("SELECT * FROM hrm_closeout_dossiers WHERE id=? AND case_id=?").bind(row.dossier_id,row.case_id).first<CloseoutDossier>();
  if(!value)throw new HrmError("financial_disposition_changed",409);return value;
 };
 const confirmControl=async()=>{
  const saved=await readDossier();
  if(row.state!=="completed"||!isDisposedDossier(saved,row))throw new HrmError("financial_disposition_changed",409);
  const copied=await db.prepare("SELECT 1 FROM hrm_closeout_events WHERE dossier_id=? AND event_type IN ('approved','rejected','applied') AND json_type(detail_json,'$.reason') IS NOT NULL LIMIT 1").bind(row.dossier_id).first();
  if(copied)throw new HrmError("financial_disposition_changed",409);
  const active=await financialPolicyActor(db,content,user,"hrm.retention.activate");
  if(!active.admin)throw new HrmError("retention_execution_system_admin_only",403);
  await completeFinancialErasure(bucket,expected,erasureDecision(row),active.id);
 };
 const marker=await readFinancialControl(bucket,expected);
 if(row.state==="completed"){await confirmControl();return;}
 if(marker.value.phase==="erased"||!["approved","deleting","retryable"].includes(row.state))throw new HrmError("financial_disposition_changed",409);
 if(!prior&&row.version!==input.version)throw new HrmError("financial_disposition_changed",409);
 const ctx=await context(db,content,user,payload.caseId,"hrm.retention.activate"),starting=row.state==="approved";
 let policy:FinancialRetentionPolicy;
 const loaded=await readDossier();
 if(starting){
  const target=await financialDispositionTarget(db,ctx.value,"dossier",row.dossier_id!);
  policy=await activeFinancialRetentionPolicy(db,bucket,row.policy_id,ctx.value.legal_entity);
  const due=financialDispositionDue(policy,"dossier",ctx.value,target);
  if(target.version!==row.target_version||target.checksum!==row.target_checksum||ctx.value.version!==row.case_version
   ||due.dueOn!==row.due_on||due.anchorSnapshot!==row.anchor_snapshot||row.due_on>localDate())throw new HrmError("financial_disposition_changed",409);
  await requireLiveFinancialControl(bucket,expected);
 }else{
  const value=await db.prepare("SELECT * FROM hrm_financial_retention_policy_versions WHERE id=? AND legal_entity=? AND state='active'").bind(row.policy_id,ctx.value.legal_entity).first<FinancialRetentionPolicy>();
  if(!value||!row.started_at||calendarDay(row.started_at)<value.effective_from||calendarDay(row.started_at)>value.effective_until)throw new HrmError("financial_disposition_changed",409);
  policy=value;await verifyFinancialRetentionSource(db,bucket,policy);
  if(loaded.payload_disposition_state!=="deleting"||loaded.disposition_request_id!==row.id||loaded.payload_disposed_at!==null||loaded.version!==row.target_version+1)throw new HrmError("financial_disposition_changed",409);
 }
 if(policy.version!==row.policy_version||policy.revision!==row.policy_revision)throw new HrmError("financial_disposition_changed",409);
 if(await held(db,ctx.value,"dossier",row.dossier_id!))throw new HrmError("legal_hold_active",409);
 const current=await financialPolicyActor(db,content,user,"hrm.retention.activate");if(!current.admin)throw new HrmError("retention_execution_system_admin_only",403);
 const time=now(),guards=[...financialPolicyAuthority(db,current,"hrm.retention.activate"),caseGuard(db,ctx.value,current,ctx.config.version),holdGuard(db,ctx.value,"dossier",row.dossier_id!),
  guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_financial_disposition_requests WHERE id=? AND version=? AND state=? AND requested_by!=? AND reviewed_by!=?)",[row.id,row.version,row.state,current.id,current.id]),
  guardBoolean(db,`EXISTS(SELECT 1 FROM hrm_financial_retention_policy_versions p WHERE p.id=? AND p.state='active' AND p.version=? AND p.revision=? AND ${closeoutPolicySourceSql})`,[policy.id,row.policy_version,row.policy_revision]),
  guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_closeout_dossiers WHERE id=? AND case_id=? AND version=? AND payload_disposition_state=?)",[row.dossier_id,row.case_id,starting?row.target_version:row.target_version+1,starting?"none":"deleting"])];
 const writes:D1PreparedStatement[]=[db.prepare(`UPDATE hrm_financial_disposition_requests SET state='deleting',version=version+1,actor_id=?,updated_at=?${starting?",started_by=?,started_at=?":""} WHERE id=? AND version=?`).bind(current.id,time,...(starting?[current.id,time]:[]),row.id,row.version)];
 if(starting)writes.push(
  db.prepare("INSERT INTO hrm_financial_disposition_execution_scope(request_id,phase,actor_id,created_at) VALUES(?,'reserve',?,?)").bind(row.id,current.id,time),
  db.prepare("UPDATE hrm_closeout_dossiers SET payload_disposition_state='deleting',disposition_request_id=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=?").bind(row.id,current.id,time,row.dossier_id,row.target_version),
  db.prepare("DELETE FROM hrm_financial_disposition_execution_scope WHERE request_id=?").bind(row.id));
 writes.push(db.prepare("INSERT INTO hrm_financial_retention_events(request_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,?,?,?)").bind(row.id,starting?"execution_reserved":"execution_resumed",JSON.stringify({policyRevision:row.policy_revision}),current.id,time));
 if(!prior)await command(db,current,key,"financial_dossier_disposition_execute",payload,row.id,guards,writes);
 row=await dispositionRow(db,row.case_id,row.id);
 try{
  await beginFinancialErasure(bucket,expected,erasureDecision(row));
  const active=await financialPolicyActor(db,content,user,"hrm.retention.activate"),config=await settings(db);
  if(!active.admin)throw new HrmError("retention_execution_system_admin_only",403);
  if(user.hrmEnabled!==true||config.enabled!==1||!config.reviewed_by)throw new HrmError("hrm_closed",503);
  const disposedAt=now();
  await db.batch([
   ...financialPolicyAuthority(db,active,"hrm.retention.activate"),caseGuard(db,ctx.value,active,config.version),holdGuard(db,ctx.value,"dossier",row.dossier_id!),
   guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_financial_disposition_requests WHERE id=? AND state IN ('deleting','retryable') AND requested_by!=? AND reviewed_by!=?)",[row.id,active.id,active.id]),
   guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_closeout_dossiers WHERE id=? AND case_id=? AND version=? AND payload_disposition_state='deleting' AND disposition_request_id=? AND payload_disposed_at IS NULL)",[row.dossier_id,row.case_id,row.target_version+1,row.id]),
   db.prepare("INSERT INTO hrm_financial_disposition_execution_scope(request_id,phase,actor_id,created_at) VALUES(?,'complete',?,?)").bind(row.id,active.id,disposedAt),
   // Do not write state=state: historical approval triggers require an open case.
   db.prepare("UPDATE hrm_closeout_dossiers SET basis_json='{}',checks_json='[]',no_payroll_evidence_json='[]',review_reason='Disposed under approved retention',payload_disposition_state='completed',payload_disposed_at=?,payload_disposed_checksum=?,version=version+1,actor_id=?,updated_at=? WHERE id=?").bind(disposedAt,row.target_checksum,active.id,disposedAt,row.dossier_id),
   db.prepare("UPDATE hrm_closeout_events SET detail_json=json_remove(detail_json,'$.reason') WHERE dossier_id=? AND event_type IN ('approved','rejected','applied') AND json_type(detail_json,'$.reason') IS NOT NULL").bind(row.dossier_id),
   db.prepare("UPDATE hrm_financial_disposition_requests SET state='completed',completed_by=?,completed_at=?,completion_detail='Dossier private fields and direct review-reason copies redacted; independent control confirmation required.',version=version+1,actor_id=?,updated_at=? WHERE id=? AND state IN ('deleting','retryable')").bind(active.id,disposedAt,active.id,disposedAt,row.id),
   db.prepare("INSERT INTO hrm_financial_retention_events(request_id,event_type,detail_json,actor_id,created_at) VALUES(?,'dossier_payload_redacted',?,?,?)").bind(row.id,JSON.stringify({checksum:row.target_checksum}),active.id,disposedAt),
   db.prepare("DELETE FROM hrm_financial_disposition_execution_scope WHERE request_id=?").bind(row.id),db.prepare("DELETE FROM hrm_write_guards"),
  ]);
  row=await dispositionRow(db,row.case_id,row.id);await confirmControl();
 }catch(error){
  await db.prepare("UPDATE hrm_financial_disposition_requests SET state='retryable',completion_detail='Execution requires reconciliation before completion.',version=version+1,actor_id='system:hrm-financial-reconcile',updated_at=? WHERE id=? AND state='deleting'").bind(now(),row.id).run().catch(()=>{});
  if(error instanceof HrmError)throw error;throw new HrmError("financial_disposition_retryable",503);
 }
}
