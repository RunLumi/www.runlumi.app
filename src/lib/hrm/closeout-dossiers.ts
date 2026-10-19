import type { WorkspaceUser } from "../workspace/roles";
import { HrmError, readableFileType } from "./fields";
import { audit, command, digest, guardBoolean, id, localDate, now, settings } from "./service";
import { reportAccount, reportAuthority } from "./report-governance";
import { closeoutPolicySourceSql, parseCloseoutChecks, type CloseoutPolicy } from "./closeout-policies";
import { readCloseoutBasis, requireCloseout, type CloseoutBasisResult } from "./closeout-basis";

import type { CloseoutFileHold } from "./closeout-holds";
import { abandonStagedFinancialControl, publishFinancialControl, readFinancialControl, readFinancialFilePayload, requireLiveFinancialControl, stageFinancialControl, stageFinancialFilePayload, type FinancialControl, type FinancialControlTarget } from "./financial-control";

export interface CloseoutOutcome {key:string;outcome:"verified"|"not_applicable";reason:string;file_ids:string[]}
export interface CloseoutDossier {
 id:string;case_id:string;person_id:string;employment_id:string;employee_user_id:string|null;policy_id:string;source_revision:number;
 basis_json:string;basis_checksum:string;checks_json:string;no_payroll_evidence_json:string;state:"prepared"|"approved"|"rejected"|"applied"|"invalidated";
 prepared_by:string;prepared_at:string;reviewed_by:string|null;reviewed_at:string|null;review_reason:string|null;applied_by:string|null;applied_at:string|null;
 payload_disposition_state:"none"|"deleting"|"completed";payload_disposed_at:string|null;payload_disposed_checksum:string|null;disposition_request_id:string|null;
 version:number;actor_id:string;updated_at:string;
}
export interface CloseoutFile {
 id:string;case_id:string;object_key:string;original_name:string;size_bytes:number;checksum:string;state:string;uploaded_by:string;
 created_at:string;reviewed_by:string|null;reviewed_at:string|null;review_reason:string|null;object_deleted_at:string|null;
 disposition_state:string;legal_hold:number;version:number;actor_id:string;updated_at:string;
}
export function closeoutFileControlTarget(file:Pick<CloseoutFile,"id"|"case_id"|"checksum"|"size_bytes">,scope:{person_id:string;employment_id:string}):FinancialControlTarget{
 return {kind:"file",id:file.id,caseId:file.case_id,personId:scope.person_id,employmentId:scope.employment_id,checksum:file.checksum,sizeBytes:file.size_bytes};
}
export async function closeoutDossierControlTarget(row:Pick<CloseoutDossier,"id"|"case_id"|"person_id"|"employment_id"|"basis_checksum"|"checks_json"|"no_payroll_evidence_json">):Promise<FinancialControlTarget>{
 const metadata=JSON.stringify({basis_checksum:row.basis_checksum,checks_json:row.checks_json,no_payroll_evidence_json:row.no_payroll_evidence_json});
 return {kind:"dossier",id:row.id,caseId:row.case_id,personId:row.person_id,employmentId:row.employment_id,checksum:await digest(metadata),sizeBytes:new TextEncoder().encode(metadata).byteLength};
}
const text=(value:unknown,max:number)=>{if(typeof value!=="string")throw new HrmError("closeout_invalid",400);const result=value.trim();if(!result||result.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result))throw new HrmError("closeout_invalid",400);return result};
const ref=(value:unknown)=>{const result=text(value,120);if(!/^[A-Za-z0-9_-]+$/.test(result))throw new HrmError("closeout_invalid",400);return result};
function refs(value:unknown,min=0,max=5):string[]{if(!Array.isArray(value)||value.length<min||value.length>max)throw new HrmError("closeout_evidence_invalid",400);const ids=value.map(ref);if(new Set(ids).size!==ids.length)throw new HrmError("closeout_evidence_invalid",400);return ids.sort()}
async function account(db:D1Database,content:D1Database,user:WorkspaceUser){
 requireCloseout(user);try{const active=await reportAccount(db,content,user.id,"hrm.payroll.approve");if(!active.can("hrm.offboarding.manage"))throw new HrmError("closeout_account_unavailable",409)}
 catch(error){if(error instanceof HrmError&&error.message==="report_account_unavailable")throw new HrmError("closeout_account_unavailable",409);throw error}
}
async function authority(db:D1Database,user:WorkspaceUser,entity:string){
 const config=await settings(db);
 return [...reportAuthority(db,user,"hrm.payroll.approve"),...reportAuthority(db,user,"hrm.offboarding.manage"),guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND enabled=1 AND reviewed_by IS NOT NULL AND legal_entity=? AND version=?)",[entity,config.version])];
}
async function replay(db:D1Database,user:WorkspaceUser,key:string,operation:string,payload:unknown):Promise<string|null>{
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new HrmError("invalid_request_key");
 const row=await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string;result_id:string}>();
 if(!row)return null;if(row.operation!==operation||row.payload_hash!==await digest(JSON.stringify(payload)))throw new HrmError("request_key_conflict",409);return row.result_id;
}
async function currentCase(db:D1Database,user:WorkspaceUser,caseId:string){
 const result=await readCloseoutBasis(db,user,ref(caseId));if(result.basis.case.employee_user_id===user.id)throw new HrmError("self_approval",403);return result;
}
async function policy(db:D1Database,bucket:R2Bucket,policyId:string,basis:CloseoutBasisResult):Promise<CloseoutPolicy>{
 const row=await db.prepare(`SELECT p.* FROM hrm_closeout_policy_versions p WHERE p.id=? AND p.legal_entity=? AND p.state='active' AND ${closeoutPolicySourceSql}`).bind(ref(policyId),String(basis.basis.employment.legal_entity)).first<CloseoutPolicy>();
 if(!row||row.effective_from>localDate()||row.effective_until<localDate()||row.effective_from>basis.basis.case.ended_on||row.effective_until<basis.basis.case.ended_on)throw new HrmError("closeout_policy_required",409);
 const source=await db.prepare("SELECT f.object_key,f.size_bytes FROM hrm_legal_template_versions v JOIN hrm_legal_files f ON f.id=v.source_file_id WHERE v.id=?").bind(row.source_version_id).first<{object_key:string;size_bytes:number}>();
 const object=source?await bucket.head(source.object_key):null;
 if(!object||object.size!==source?.size_bytes||object.customMetadata?.sha256!==row.source_checksum)throw new HrmError("closeout_policy_source_invalid",409);return row;
}
function policyGuard(db:D1Database,row:CloseoutPolicy,caseId:string){
 return guardBoolean(db,`EXISTS(SELECT 1 FROM hrm_closeout_policy_versions p JOIN hrm_offboarding_cases c ON c.id=? WHERE p.id=? AND p.version=? AND p.state='active' AND p.effective_from<=? AND p.effective_until>=? AND c.ended_on BETWEEN p.effective_from AND p.effective_until AND ${closeoutPolicySourceSql})`,[caseId,row.id,row.version,localDate(),localDate()]);
}
export function parseCloseoutOutcomes(value:unknown,policyRow:CloseoutPolicy):CloseoutOutcome[]{
 const required=parseCloseoutChecks(JSON.parse(policyRow.checklist_json));
 if(!Array.isArray(value)||value.length!==required.length)throw new HrmError("closeout_checks_required",400);
 const map=new Map<string,CloseoutOutcome>();for(const item of value){
  if(!item||typeof item!=="object"||Array.isArray(item)||Object.keys(item).some(k=>!["key","outcome","reason","file_ids"].includes(k)))throw new HrmError("closeout_checks_required",400);
  const key=ref(item.key),check=required.find(c=>c.key===key);
  if(!check||map.has(key)||item.outcome!=="verified"&&(item.outcome!=="not_applicable"||!check.allow_not_applicable))throw new HrmError("closeout_checks_required",400);
  map.set(key,{key,outcome:item.outcome,reason:text(item.reason,1000),file_ids:refs(item.file_ids,1)});
 }
 return required.map(check=>map.get(check.key)!);
}
async function evidence(db:D1Database,bucket:R2Bucket,caseId:string,fileIds:string[]):Promise<CloseoutFile[]>{
 const unique=[...new Set(fileIds)].sort();if(unique.length<1||unique.length>155)throw new HrmError("closeout_evidence_invalid",400);
 const result=await db.prepare("SELECT f.* FROM hrm_closeout_files f JOIN json_each(?) refs ON refs.value=f.id WHERE f.case_id=? ORDER BY f.id").bind(JSON.stringify(unique),caseId).all<CloseoutFile>();
 if(result.results.length!==unique.length)throw new HrmError("closeout_evidence_invalid",409);
 const scope=await db.prepare("SELECT person_id,employment_id FROM hrm_offboarding_cases WHERE id=?").bind(caseId).first<{person_id:string;employment_id:string}>();if(!scope)throw new HrmError("not_found",404);
 for(const file of result.results){
  if(file.state!=="reviewed"||!file.reviewed_by||file.reviewed_by===file.uploaded_by||file.object_deleted_at||!["none","rejected","blocked"].includes(file.disposition_state))throw new HrmError("closeout_evidence_invalid",409);
  await requireLiveFinancialControl(bucket,closeoutFileControlTarget(file,scope));
  const object=await bucket.head(file.object_key);if(!object||object.size!==file.size_bytes||object.customMetadata?.checksum!==file.checksum||object.customMetadata?.case_id!==caseId)throw new HrmError("closeout_evidence_invalid",409);
 }
 return result.results;
}
function fileGuards(db:D1Database,files:CloseoutFile[]){
 // One JSON input keeps the batch below D1's per-statement parameter cap.
 return guardBoolean(db,`NOT EXISTS(SELECT 1 FROM json_each(?) expected WHERE NOT EXISTS(SELECT 1 FROM hrm_closeout_files f WHERE f.id=json_extract(expected.value,'$.id') AND f.case_id=json_extract(expected.value,'$.case_id') AND f.version=json_extract(expected.value,'$.version') AND f.checksum=json_extract(expected.value,'$.checksum') AND f.state='reviewed' AND f.reviewed_by!=f.uploaded_by AND f.object_deleted_at IS NULL AND f.disposition_state IN ('none','rejected','blocked')))`,[JSON.stringify(files.map(f=>({id:f.id,case_id:f.case_id,version:f.version,checksum:f.checksum})))]);
}
const sourceGuard=(db:D1Database,basis:CloseoutBasisResult)=>guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_closeout_sources r JOIN hrm_offboarding_cases c ON c.id=r.case_id JOIN hrm_employments e ON e.id=c.employment_id JOIN hrm_people p ON p.id=c.person_id WHERE r.case_id=? AND r.revision=? AND c.state='open' AND e.status='ended' AND e.ended_on=c.ended_on AND p.user_id IS c.employee_user_id AND e.legal_entity=?)",[basis.basis.case.id,basis.basis.source_revision,String(basis.basis.employment.legal_entity)]);
function requireReady(basis:CloseoutBasisResult,policyRow:CloseoutPolicy,noPayrollProof:string[]){
 const blockers=basis.blockers.filter(b=>!(b==="no_payroll_recorded"&&policyRow.allow_no_payroll===1&&noPayrollProof.length>0&&!!policyRow.no_payroll_instructions));
 if(blockers.length)throw new HrmError("closeout_sources_unreconciled",409);
 if(basis.hasPayroll&&noPayrollProof.length)throw new HrmError("closeout_evidence_invalid",400);
}
export async function prepareCloseoutDossier(db:D1Database,content:D1Database,bucket:R2Bucket,user:WorkspaceUser,key:string,input:{caseId:string;policyId:string;sourceRevision:number;checks:unknown;noPayrollEvidence:unknown}):Promise<string>{
 await account(db,content,user);const operationHash=await digest(JSON.stringify(input));
 const finishReceipt=async(dossierId:string)=>{
  const saved=await dossierFor(db,input.caseId,dossierId);if(saved.prepared_by!==user.id)throw new HrmError("conflict",409);
  await currentCase(db,user,input.caseId);await account(db,content,user);
  await publishFinancialControl(bucket,await closeoutDossierControlTarget(saved),operationHash);return dossierId;
 };
 const prior=await replay(db,user,key,"closeout_dossier_prepare",input);if(prior)return finishReceipt(prior);
 const basis=await currentCase(db,user,input.caseId),policyRow=await policy(db,bucket,input.policyId,basis);
 if(basis.caseState!=="open"||basis.basis.source_revision!==input.sourceRevision)throw new HrmError("closeout_source_changed",409);
 const checks=parseCloseoutOutcomes(input.checks,policyRow),exemption=refs(input.noPayrollEvidence),files=await evidence(db,bucket,input.caseId,[...checks.flatMap(c=>c.file_ids),...exemption]);
 // Preparation records a source snapshot even if further source work is needed;
 // approval and application always recompute all blockers against current data.
 const dossierId=id("closeout"),time=now();
 const expected=await closeoutDossierControlTarget({id:dossierId,case_id:input.caseId,person_id:basis.basis.case.person_id,employment_id:basis.basis.case.employment_id,basis_checksum:basis.checksum,checks_json:JSON.stringify(checks),no_payroll_evidence_json:JSON.stringify(exemption)});
 await account(db,content,user);await stageFinancialControl(bucket,expected,operationHash,user.id);
 const guards=[...await authority(db,user,String(basis.basis.employment.legal_entity)),sourceGuard(db,basis),policyGuard(db,policyRow,input.caseId),fileGuards(db,files)];
 await account(db,content,user);
 const result=await command(db,user,key,"closeout_dossier_prepare",input,dossierId,guards,[
  db.prepare(`INSERT INTO hrm_closeout_dossiers(id,case_id,person_id,employment_id,employee_user_id,policy_id,source_revision,basis_json,basis_checksum,checks_json,no_payroll_evidence_json,prepared_by,prepared_at,actor_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(dossierId,input.caseId,basis.basis.case.person_id,basis.basis.case.employment_id,basis.basis.case.employee_user_id,policyRow.id,basis.basis.source_revision,JSON.stringify(basis.basis),basis.checksum,JSON.stringify(checks),JSON.stringify(exemption),user.id,time,user.id,time),
  db.prepare("INSERT INTO hrm_closeout_dossier_files(dossier_id,file_id,checksum) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.checksum') FROM json_each(?)").bind(dossierId,JSON.stringify(files.map(f=>({id:f.id,checksum:f.checksum})))),
 ]);
 if(result!==dossierId){await abandonStagedFinancialControl(bucket,expected,operationHash,"system:hrm-dossier-duplicate");return finishReceipt(result)}
 await account(db,content,user);await publishFinancialControl(bucket,expected,operationHash);return result;
}
async function dossierFor(db:D1Database,caseId:string,dossierId:string){
 const row=await db.prepare("SELECT * FROM hrm_closeout_dossiers WHERE id=? AND case_id=?").bind(ref(dossierId),ref(caseId)).first<CloseoutDossier>();if(!row)throw new HrmError("not_found",404);return row;
}
export async function reviewCloseoutDossier(db:D1Database,content:D1Database,bucket:R2Bucket,user:WorkspaceUser,key:string,input:{caseId:string;dossierId:string;version:number;decision:"approve"|"reject";reason:string;confirmed:boolean}):Promise<void>{
 await account(db,content,user);if(await replay(db,user,key,"closeout_dossier_review",input))return;
 const row=await dossierFor(db,input.caseId,input.dossierId),reason=text(input.reason,1000);
 if(!["approve","reject"].includes(input.decision))throw new HrmError("closeout_invalid",400);
 if(row.prepared_by===user.id||row.employee_user_id===user.id)throw new HrmError("self_approval",403);
 if(row.payload_disposition_state!=="none"||row.state!=="prepared"||row.version!==input.version)throw new HrmError("closeout_source_changed",409);
 await requireLiveFinancialControl(bucket,await closeoutDossierControlTarget(row));
 const basis=await currentCase(db,user,input.caseId),guards=[...await authority(db,user,String(basis.basis.employment.legal_entity)),sourceGuard(db,basis),guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_closeout_dossiers WHERE id=? AND version=? AND state='prepared' AND payload_disposition_state='none' AND prepared_by!=? AND employee_user_id IS NOT ?)",[row.id,input.version,user.id,user.id])];
 if(input.decision==="approve"){
  if(!input.confirmed)throw new HrmError("confirmation_required",400);
  if(row.source_revision!==basis.basis.source_revision||row.basis_checksum!==basis.checksum)throw new HrmError("closeout_source_changed",409);
  const policyRow=await policy(db,bucket,row.policy_id,basis),exemption=refs(JSON.parse(row.no_payroll_evidence_json)),checks=parseCloseoutOutcomes(JSON.parse(row.checks_json),policyRow),files=await evidence(db,bucket,row.case_id,[...checks.flatMap(c=>c.file_ids),...exemption]);
  requireReady(basis,policyRow,exemption);guards.push(policyGuard(db,policyRow,row.case_id),fileGuards(db,files));
 }
 await account(db,content,user);const time=now();await command(db,user,key,"closeout_dossier_review",input,row.id,guards,[db.prepare("UPDATE hrm_closeout_dossiers SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='prepared'").bind(input.decision==="approve"?"approved":"rejected",user.id,time,reason,user.id,time,row.id,input.version)]);
}
/** Called by the existing offboarding command, so application and task/case
 * closure share one D1 transaction rather than two independently successful writes. */
export async function prepareCloseoutApplication(db:D1Database,content:D1Database,bucket:R2Bucket,user:WorkspaceUser,caseId:string,dossierId:string,confirmed:boolean):Promise<{guards:D1PreparedStatement[];writes:D1PreparedStatement[]}>{
 await account(db,content,user);if(!confirmed)throw new HrmError("confirmation_required",400);
 const row=await dossierFor(db,caseId,dossierId);if(row.payload_disposition_state!=="none"||row.state!=="approved"||row.reviewed_by!==user.id||row.prepared_by===user.id||row.employee_user_id===user.id)throw new HrmError("closeout_approval_required",409);
 await requireLiveFinancialControl(bucket,await closeoutDossierControlTarget(row));
 const basis=await currentCase(db,user,caseId);if(row.source_revision!==basis.basis.source_revision||row.basis_checksum!==basis.checksum)throw new HrmError("closeout_source_changed",409);
 const policyRow=await policy(db,bucket,row.policy_id,basis),checks=parseCloseoutOutcomes(JSON.parse(row.checks_json),policyRow),exemption=refs(JSON.parse(row.no_payroll_evidence_json)),files=await evidence(db,bucket,caseId,[...checks.flatMap(c=>c.file_ids),...exemption]);requireReady(basis,policyRow,exemption);
 const guards=[...await authority(db,user,String(basis.basis.employment.legal_entity)),sourceGuard(db,basis),policyGuard(db,policyRow,caseId),fileGuards(db,files),guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_closeout_dossiers WHERE id=? AND version=? AND state='approved' AND payload_disposition_state='none' AND reviewed_by=? AND prepared_by!=? AND employee_user_id IS NOT ?)",[row.id,row.version,user.id,user.id,user.id])];
 await account(db,content,user);const time=now();return {guards,writes:[db.prepare("UPDATE hrm_closeout_dossiers SET state='applied',applied_by=?,applied_at=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='approved'").bind(user.id,time,user.id,time,row.id,row.version)]};
}

/** Reopening preserves the prior approval and evidence, journals the human
 * reason, and uses the same no-access-resurrection invalidation path. */
export async function reopenCloseoutReview(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,input:{caseId:string;dossierId:string;version:number;reason:string;confirmed:boolean}):Promise<void>{
 await account(db,content,user);if(await replay(db,user,key,"closeout_review_reopen",input))return;
 if(!input.confirmed)throw new HrmError("confirmation_required",400);
 const reason=text(input.reason,1000),row=await dossierFor(db,input.caseId,input.dossierId),basis=await currentCase(db,user,input.caseId);
 if(!["prepared","approved","applied"].includes(row.state)||row.version!==input.version||!["open","completed"].includes(basis.caseState))throw new HrmError("closeout_source_changed",409);
 await account(db,content,user);await command(db,user,key,"closeout_review_reopen",input,row.id,[...await authority(db,user,String(basis.basis.employment.legal_entity)),guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_closeout_dossiers d JOIN hrm_closeout_sources r ON r.case_id=d.case_id JOIN hrm_offboarding_cases c ON c.id=d.case_id JOIN hrm_people p ON p.id=c.person_id WHERE d.id=? AND d.case_id=? AND d.version=? AND d.state IN ('prepared','approved','applied') AND r.revision=? AND c.state IN ('open','completed') AND c.employee_user_id IS p.user_id AND c.employee_user_id IS NOT ?)",[row.id,row.case_id,input.version,basis.basis.source_revision,user.id])],[
  db.prepare("INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id,detail_json,created_at) VALUES(?,'manual_review_reopened',?,?,?,?)").bind(row.case_id,row.id,user.id,JSON.stringify({reason}),now()),
 ]);
}

export async function uploadCloseoutFile(db:D1Database,content:D1Database,bucket:R2Bucket,user:WorkspaceUser,key:string,caseId:string,file:File):Promise<string>{
 await account(db,content,user);const basis=await currentCase(db,user,caseId);
 if(file.size<1||file.size>5*1024*1024)throw new HrmError("file_size",400);const bytes=await file.arrayBuffer();
 if(file.type!=="application/pdf"||readableFileType(new Uint8Array(bytes))!=="application/pdf")throw new HrmError("closeout_pdf_required",400);
 const name=file.name.replace(/[\x00-\x1f\x7f"\\/]/g,"_").slice(0,160)||"evidence.pdf",checksum=await digest(bytes),payload={caseId,name,checksum,size:file.size},operationHash=await digest(JSON.stringify(payload));
 const finishReceipt=async(fileId:string)=>{
  const saved=await db.prepare("SELECT * FROM hrm_closeout_files WHERE id=? AND case_id=?").bind(fileId,caseId).first<CloseoutFile>();if(!saved||saved.uploaded_by!==user.id||saved.checksum!==checksum||saved.size_bytes!==file.size)throw new HrmError("conflict",409);
  const expected=closeoutFileControlTarget(saved,basis.basis.case);
  await stageFinancialFilePayload(bucket,expected,operationHash,user.id,bytes,()=>account(db,content,user));
  await account(db,content,user);await publishFinancialControl(bucket,expected,operationHash);return fileId;
 };
 const prior=await replay(db,user,key,"closeout_file_upload",payload);if(prior)return finishReceipt(prior);
 if(basis.caseState!=="open")throw new HrmError("offboarding_case_inactive",409);
 const fileId=id("closeout_file"),objectKey=`hrm/closeout/${caseId}/${fileId}`,expected=closeoutFileControlTarget({id:fileId,case_id:caseId,checksum,size_bytes:file.size},basis.basis.case);
 let metadataAttempted=false;
 try{
  const staged=await stageFinancialFilePayload(bucket,expected,operationHash,user.id,bytes,()=>account(db,content,user)),time=staged.value.registeredAt;
  const guards=[...await authority(db,user,String(basis.basis.employment.legal_entity)),guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_offboarding_cases WHERE id=? AND state='open')",[caseId])];await account(db,content,user);
  metadataAttempted=true;
  const result=await command(db,user,key,"closeout_file_upload",payload,fileId,guards,[db.prepare("INSERT INTO hrm_closeout_files(id,case_id,object_key,original_name,size_bytes,checksum,uploaded_by,created_at,actor_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(fileId,caseId,objectKey,name,file.size,checksum,user.id,time,user.id,time)]);
  if(result!==fileId){
   // The committed receipt definitively belongs to another target. Fence this
   // duplicate before removing its own transient bytes, never the winner's.
   await abandonStagedFinancialControl(bucket,expected,operationHash,"system:hrm-upload-duplicate");await bucket.delete(objectKey);return finishReceipt(result);
  }
  await account(db,content,user);await publishFinancialControl(bucket,expected,operationHash);return result;
 }catch(error){
  // Once a D1 write was attempted, a negative read cannot prove it failed.
  // Preserve uncertain registrations quarantined for receipt reconciliation.
  if(!metadataAttempted){try{await abandonStagedFinancialControl(bucket,expected,operationHash,"system:hrm-upload-abort");await bucket.delete(objectKey)}catch{/* Unknown external outcomes remain fenced/quarantined. */}}
  throw error;
 }
}
export async function reviewCloseoutFile(db:D1Database,content:D1Database,bucket:R2Bucket,user:WorkspaceUser,key:string,input:{caseId:string;fileId:string;version:number;decision:"reviewed"|"rejected";reason:string}):Promise<void>{
 await account(db,content,user);if(await replay(db,user,key,"closeout_file_review",input))return;
 const basis=await currentCase(db,user,input.caseId),file=await db.prepare("SELECT * FROM hrm_closeout_files WHERE id=? AND case_id=?").bind(ref(input.fileId),input.caseId).first<CloseoutFile>();
 if(!file)throw new HrmError("not_found",404);if(file.uploaded_by===user.id)throw new HrmError("self_approval",403);
 if(!["reviewed","rejected"].includes(input.decision)||file.state!=="quarantined"||file.version!==input.version)throw new HrmError("conflict",409);
 await readFinancialFilePayload(bucket,closeoutFileControlTarget(file,basis.basis.case));
 await account(db,content,user);const reason=text(input.reason,1000),time=now();await command(db,user,key,"closeout_file_review",input,file.id,[...await authority(db,user,String(basis.basis.employment.legal_entity)),guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_closeout_files WHERE id=? AND case_id=? AND version=? AND state='quarantined' AND uploaded_by!=? AND object_deleted_at IS NULL AND disposition_state IN ('none','rejected','blocked'))",[file.id,input.caseId,input.version,user.id])],[db.prepare("UPDATE hrm_closeout_files SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=?").bind(input.decision,user.id,time,reason,user.id,time,file.id,input.version)]);
}
export async function downloadCloseoutFile(db:D1Database,content:D1Database,bucket:R2Bucket,user:WorkspaceUser,caseId:string,fileId:string):Promise<Response>{
 await account(db,content,user);const basis=await currentCase(db,user,caseId);
 const file=await db.prepare("SELECT * FROM hrm_closeout_files WHERE id=? AND case_id=? AND object_deleted_at IS NULL AND disposition_state NOT IN ('deleting','completed')").bind(ref(fileId),ref(caseId)).first<CloseoutFile>();if(!file)throw new HrmError("not_found",404);
 const bytes=await readFinancialFilePayload(bucket,closeoutFileControlTarget(file,basis.basis.case));
 await account(db,content,user);
 if(!await db.prepare("SELECT 1 FROM hrm_closeout_files WHERE id=? AND case_id=? AND object_deleted_at IS NULL AND disposition_state NOT IN ('deleting','completed')").bind(file.id,caseId).first())throw new HrmError("file_unavailable",404);
 await audit(db,user,"closeout_file_read",null,file.id,{case_id:caseId,state:file.state});
 return new Response(bytes,{headers:{"Content-Type":"application/pdf","Content-Length":String(file.size_bytes),"Content-Disposition":`attachment; filename="financial-evidence.pdf"; filename*=UTF-8''${encodeURIComponent(file.original_name).replaceAll("'","%27")}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox","Referrer-Policy":"no-referrer"}});
}

type CloseoutDossierMetadata=Omit<CloseoutDossier,"basis_json">;
export type CloseoutDossierSummary=CloseoutDossierMetadata&{payload_state:FinancialControl["phase"]|"unavailable"};
type CloseoutFileMetadata=Omit<CloseoutFile,"object_key">;
export type CloseoutFileSummary=CloseoutFileMetadata&{control_state:FinancialControl["phase"]|"unavailable"};
export async function closeoutDesk(db:D1Database,content:D1Database,bucket:R2Bucket,user:WorkspaceUser,caseId:string,policyId:string|null){
 requireCloseout(user);const basis=await currentCase(db,user,caseId);
 const [policyRows,dossierRows,fileRows,events,holds]=await Promise.all([
  db.prepare(`SELECT p.*,v.source_file_id FROM hrm_closeout_policy_versions p LEFT JOIN hrm_legal_template_versions v ON v.id=p.source_version_id WHERE p.legal_entity=? AND (p.state='active' OR EXISTS(SELECT 1 FROM hrm_closeout_dossiers d WHERE d.case_id=? AND d.policy_id=p.id)) ORDER BY p.created_at DESC,p.id LIMIT 101`).bind(String(basis.basis.employment.legal_entity),caseId).all<CloseoutPolicy&{source_file_id:string|null}>(),
  db.prepare("SELECT id,case_id,person_id,employment_id,employee_user_id,policy_id,source_revision,basis_checksum,checks_json,no_payroll_evidence_json,state,prepared_by,prepared_at,reviewed_by,reviewed_at,review_reason,applied_by,applied_at,payload_disposition_state,payload_disposed_at,payload_disposed_checksum,disposition_request_id,version,actor_id,updated_at FROM hrm_closeout_dossiers WHERE case_id=? ORDER BY prepared_at DESC,id DESC LIMIT 101").bind(caseId).all<CloseoutDossierMetadata>(),
  db.prepare("SELECT id,case_id,original_name,size_bytes,checksum,state,uploaded_by,created_at,reviewed_by,reviewed_at,review_reason,object_deleted_at,disposition_state,legal_hold,version,actor_id,updated_at FROM hrm_closeout_files WHERE case_id=? ORDER BY created_at DESC,id DESC LIMIT 201").bind(caseId).all<CloseoutFileMetadata>(),
  db.prepare("SELECT id,dossier_id,event_type,detail_json,actor_id,created_at FROM hrm_closeout_events WHERE case_id=? ORDER BY id DESC LIMIT 100").bind(caseId).all<{id:number;dossier_id:string|null;event_type:string;detail_json:string;actor_id:string|null;created_at:string}>(),
  db.prepare("SELECT * FROM hrm_closeout_file_holds WHERE case_id=? ORDER BY placed_at DESC,id DESC LIMIT 501").bind(caseId).all<CloseoutFileHold>(),
 ]);
 if(policyRows.results.length>100||dossierRows.results.length>100||fileRows.results.length>200||holds.results.length>500)throw new HrmError("closeout_source_limit",409);
 const files:CloseoutFileSummary[]=await Promise.all(fileRows.results.map(async file=>{
  let control_state:CloseoutFileSummary["control_state"]="unavailable";
  try{control_state=(await readFinancialControl(bucket,closeoutFileControlTarget(file,basis.basis.case))).value.phase}catch{/* Missing or inconsistent control never makes old restored metadata usable. */}
  return {...file,control_state};
 }));
 const dossiers:CloseoutDossierSummary[]=await Promise.all(dossierRows.results.map(async row=>{
  let payload_state:CloseoutDossierSummary["payload_state"]="unavailable";
  try{if(row.payload_disposition_state!=="none")throw new Error("Disposed or reserved payload");payload_state=(await readFinancialControl(bucket,await closeoutDossierControlTarget(row))).value.phase}catch{/* An old DB payload cannot override absent/current privacy controls. */}
  return {...row,payload_state,...(payload_state!=="live"?{checks_json:"[]",no_payroll_evidence_json:"[]",review_reason:null}:{})};
 }));
 const hidden=new Set(dossiers.filter(row=>row.payload_state!=="live").map(row=>row.id));
 const visibleEvents=events.results.map(event=>{
  if(!event.dossier_id||!hidden.has(event.dossier_id)||!["approved","rejected","applied"].includes(event.event_type))return event;
  let detail:Record<string,unknown>={};try{const parsed=JSON.parse(event.detail_json);if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))detail=parsed}catch{/* Do not expose an unverified reason copy. */}
  delete detail.reason;return {...event,detail_json:JSON.stringify(detail)};
 });
 const actorIds=[...new Set([...dossierRows.results.flatMap(d=>[d.prepared_by,d.reviewed_by,d.applied_by]),...fileRows.results.flatMap(f=>[f.uploaded_by,f.reviewed_by]),...events.results.map(e=>e.actor_id),...holds.results.flatMap(h=>[h.placed_by,h.released_by])].filter((id):id is string=>!!id))];
 const actors=actorIds.length?(await content.prepare("SELECT id,COALESCE(NULLIF(name,''),'Account') AS name FROM users WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(actorIds)).all<{id:string;name:string}>()).results:[];
 const actorLabels=Object.fromEntries(actors.map(a=>[a.id,a.name]));
 const selectedPolicy=policyId?policyRows.results.find(p=>p.id===policyId&&p.state==='active')??null:null;
 return {basis,policies:policyRows.results,selectedPolicy,actorLabels,dossiers,files,events:visibleEvents,fileHolds:holds.results};
}
