import type { WorkspaceUser } from "../workspace/roles";
import { command, digest, guard, id, localDate, now, requirePermission } from "./service";
import { HrmError } from "./fields";

export const RETENTION_CATEGORIES=["profile_photo","identity","dependent","banking","tax","personal","legal_source","legal_evidence","coi_evidence","onboarding_evidence","leave_evidence"] as const;
export type RetentionCategory=typeof RETENTION_CATEGORIES[number];
export type RetentionSource="hrm_files"|"hrm_legal_files";
export interface RetentionRule {category:RetentionCategory;retention_days:number|null;basis:string}
export interface RetentionPolicyVersion {id:string;version_number:number;rules_json:string;state:string;created_by:string;created_at:string;reviewed_by:string|null;reviewed_at:string|null;review_reason:string|null;activated_by:string|null;activated_at:string|null;version:number;actor_id:string;updated_at:string}
export interface LegalHold {id:string;scope_kind:"person"|"file";person_id:string|null;category:string|null;source_table:string|null;target_file_id:string|null;state:string;reason:string;placed_by:string;placed_at:string;released_by:string|null;released_at:string|null;release_reason:string|null;version:number;actor_id:string;created_at:string;updated_at:string}
export interface RetentionFile {source_table:RetentionSource;file_id:string;person_id:string|null;employee_code:string|null;category:RetentionCategory;kind:string;state:string;original_name:string;object_key:string;size_bytes:number;checksum:string;legal_hold:number;created_at:string;expires_on:string|null;object_deleted_at:string|null;file_version:number;retention_due_on:string|null;policy_configured:boolean;held:boolean;deletion_request_id:string|null;deletion_state:string|null;deletion_requested_at:string|null}
export interface FileDeletionRequest {id:string;source_table:RetentionSource;source_file_id:string;person_id:string|null;category:string;object_key_snapshot:string;checksum_snapshot:string;file_version:number;policy_version_id:string;policy_version:number;retention_due_on:string;state:string;request_reason:string;requested_by:string;requested_at:string;reviewed_by:string|null;reviewed_at:string|null;review_reason:string|null;completed_by:string|null;completed_at:string|null;completion_detail:string|null;block_reason:string|null;version:number;actor_id:string;created_at:string;updated_at:string;employee_code?:string|null;original_name?:string}

export const retentionCategoryForHrm=(kind:string):RetentionCategory=>({avatar:"profile_photo",identity:"identity",dependent:"dependent",bank:"banking",tax:"tax",personal:"personal",leave_evidence:"leave_evidence"}[kind] as RetentionCategory);
export const retentionCategoryForLegal=(row:{kind:string;coi_declaration_id:string|null;onboarding_task_id:string|null}):RetentionCategory=>row.kind==="docx_source"?"legal_source":row.coi_declaration_id?"coi_evidence":row.onboarding_task_id?"onboarding_evidence":"legal_evidence";
function categorySqlForHrm(alias:string):string{return `CASE ${alias}.kind WHEN 'avatar' THEN 'profile_photo' WHEN 'identity' THEN 'identity' WHEN 'dependent' THEN 'dependent' WHEN 'bank' THEN 'banking' WHEN 'tax' THEN 'tax' WHEN 'leave_evidence' THEN 'leave_evidence' ELSE 'personal' END`}
function categorySqlForLegal(alias:string):string{return `CASE WHEN ${alias}.kind='docx_source' THEN 'legal_source' WHEN ${alias}.coi_declaration_id IS NOT NULL THEN 'coi_evidence' WHEN ${alias}.onboarding_task_id IS NOT NULL THEN 'onboarding_evidence' ELSE 'legal_evidence' END`}
function fileScopeSql(source:RetentionSource,scopeKind:"person"|"file"):string{
 if(scopeKind==="file")return "id=?";
 return source==="hrm_files"?`person_id=? AND (?='*' OR ${categorySqlForHrm("hrm_files")} = ?)`:`person_id=? AND (?='*' OR ${categorySqlForLegal("hrm_legal_files")} = ?)`;
}
function requestScopeSql(scopeKind:"person"|"file"):string{return scopeKind==="person"?"person_id=? AND (?='*' OR category=?)":"source_table=? AND source_file_id=?"}
const personScopeParams=(personId:string,category:string)=>([personId,category,category]);
function requireRetention(user:WorkspaceUser,permission:"hrm.retention.manage"|"hrm.retention.review"|"hrm.retention.activate"|"hrm.legalhold.manage"):void{
 requirePermission(user,permission);
}
function requireRetentionLive(user:WorkspaceUser):void{if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503)}
function parseRules(value:string):RetentionRule[]{
 let parsed:unknown;try{parsed=JSON.parse(value)}catch{throw new HrmError("retention_policy_invalid")}
 const legacyCategories=RETENTION_CATEGORIES.filter(category=>category!=="leave_evidence");
 if(!Array.isArray(parsed)||(parsed.length!==legacyCategories.length&&parsed.length!==RETENTION_CATEGORIES.length))throw new HrmError("retention_policy_invalid");
 const rules=parsed.map((entry):RetentionRule=>{
  if(!entry||typeof entry!=="object")throw new HrmError("retention_policy_invalid");
  const row=entry as Record<string,unknown>;
  if(!RETENTION_CATEGORIES.includes(row.category as RetentionCategory)||!(row.retention_days===null||Number.isInteger(row.retention_days)&&Number(row.retention_days)>=1&&Number(row.retention_days)<=36500)||typeof row.basis!=="string"||!row.basis.trim()||row.basis.trim().length>1000)throw new HrmError("retention_policy_invalid");
  return {category:row.category as RetentionCategory,retention_days:row.retention_days as number|null,basis:row.basis.trim()};
 });
 const categories=parsed.length===legacyCategories.length?legacyCategories:RETENTION_CATEGORIES;
 if(new Set(rules.map(rule=>rule.category)).size!==categories.length||categories.some(category=>!rules.some(rule=>rule.category===category)))throw new HrmError("retention_policy_invalid");
 return rules;
}
function retentionDue(createdAt:string,days:number):string{
 const time=Date.parse(createdAt);if(!Number.isFinite(time))throw new HrmError("retention_file_date_invalid");
 const due=new Date(time+days*86400000+7*3600000).toISOString().slice(0,10);
 return due;
}
async function currentPolicy(db:D1Database):Promise<RetentionPolicyVersion|null>{
 const row=await db.prepare("SELECT * FROM hrm_retention_policy_versions WHERE state='active' LIMIT 1").first<RetentionPolicyVersion>();
 if(row)parseRules(row.rules_json);return row;
}
async function previous(db:D1Database,user:WorkspaceUser,key:string,operation:string,payload:unknown):Promise<string|null>{
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new HrmError("invalid_request_key");
 const row=await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string;result_id:string}>();
 if(!row)return null;if(row.operation!==operation||row.payload_hash!==await digest(JSON.stringify(payload)))throw new HrmError("request_key_conflict",409);return row.result_id;
}
export async function listRetentionPolicies(db:D1Database,user:WorkspaceUser):Promise<RetentionPolicyVersion[]>{
 if(!user.can("hrm.retention.manage")&&!user.can("hrm.retention.review"))throw new HrmError("forbidden",403);return (await db.prepare("SELECT * FROM hrm_retention_policy_versions ORDER BY version_number DESC LIMIT 100").all<RetentionPolicyVersion>()).results;
}
export async function createRetentionPolicy(db:D1Database,user:WorkspaceUser,key:string,rulesJson:string):Promise<string>{
 requireRetention(user,"hrm.retention.manage");const rules=parseRules(rulesJson);if(rules.length!==RETENTION_CATEGORIES.length)throw new HrmError("retention_policy_invalid");const payload={rules};const existing=await previous(db,user,key,"retention_policy_create",payload);if(existing)return existing;
 const latest=await db.prepare("SELECT COALESCE(MAX(version_number),0) AS version_number FROM hrm_retention_policy_versions").first<{version_number:number}>();
 const versionNumber=(latest?.version_number??0)+1,policyId=id("retention_policy"),time=now();
 await command(db,user,key,"retention_policy_create",payload,policyId,[guard(db,"NOT EXISTS(SELECT 1 FROM hrm_retention_policy_versions WHERE version_number=?)",[versionNumber])],[
  db.prepare("INSERT INTO hrm_retention_policy_versions(id,version_number,rules_json,state,created_by,created_at,version,actor_id,updated_at) VALUES(?,?,?,'draft',?,?,1,?,?)")
   .bind(policyId,versionNumber,JSON.stringify(rules),user.id,time,user.id,time),db.prepare("DELETE FROM hrm_write_guards")]);
 return policyId;
}
export async function reviewRetentionPolicy(db:D1Database,user:WorkspaceUser,key:string,policyId:string,version:number,approve:boolean,reason:string):Promise<void>{
 requireRetention(user,"hrm.retention.review");if(!reason.trim()||reason.length>500)throw new HrmError("reason_required");
 const row=await db.prepare("SELECT id,state,version,created_by FROM hrm_retention_policy_versions WHERE id=?").bind(policyId).first<{id:string;state:string;version:number;created_by:string}>();if(!row)throw new HrmError("not_found",404);if(row.created_by===user.id)throw new HrmError("self_approval",403);
 const payload={policyId,version,approve,reason:reason.trim()},prior=await previous(db,user,key,"retention_policy_review",payload);if(prior)return;
 const time=now(),state=approve?"reviewed":"rejected";
 await command(db,user,key,"retention_policy_review",payload,policyId,[guard(db,"EXISTS(SELECT 1 FROM hrm_retention_policy_versions WHERE id=? AND version=? AND state='draft' AND created_by!=?)",[policyId,version,user.id])],[
  db.prepare("UPDATE hrm_retention_policy_versions SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='draft'").bind(state,user.id,time,reason.trim(),user.id,time,policyId,version),db.prepare("DELETE FROM hrm_write_guards")]);
}
export async function activateRetentionPolicy(db:D1Database,user:WorkspaceUser,key:string,policyId:string,version:number):Promise<void>{
 requireRetention(user,"hrm.retention.activate");const row=await db.prepare("SELECT id,state,version,created_by,reviewed_by,rules_json FROM hrm_retention_policy_versions WHERE id=?").bind(policyId).first<{id:string;state:string;version:number;created_by:string;reviewed_by:string|null;rules_json:string}>();
 if(!row)throw new HrmError("not_found",404);if(parseRules(row.rules_json).length!==RETENTION_CATEGORIES.length)throw new HrmError("retention_policy_invalid",409);if(row.state!=="reviewed"||!row.reviewed_by||row.created_by===user.id)throw new HrmError("retention_policy_review_required",403);
 const payload={policyId,version},prior=await previous(db,user,key,"retention_policy_activate",payload);if(prior)return;
 const time=now(),active=await currentPolicy(db);const statements:D1PreparedStatement[]=[];
 if(active){
  if(await db.prepare("SELECT 1 FROM hrm_file_deletion_requests WHERE policy_version_id=? AND state IN ('deleting','retryable') LIMIT 1").bind(active.id).first())throw new HrmError("retention_deletion_in_progress",409);
  statements.push(db.prepare("UPDATE hrm_retention_policy_versions SET state='retired',version=version+1,actor_id=?,updated_at=? WHERE id=? AND state='active'").bind(user.id,time,active.id));
  statements.push(db.prepare("UPDATE hrm_file_deletion_requests SET state='blocked',block_reason='Retention policy version changed; create a new request under the active policy.',version=version+1,actor_id=?,updated_at=? WHERE policy_version_id=? AND state IN ('pending_review','approved')").bind(user.id,time,active.id));
 }
 statements.push(db.prepare("UPDATE hrm_retention_policy_versions SET state='active',activated_by=?,activated_at=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='reviewed'" ).bind(user.id,time,user.id,time,policyId,version));
 await command(db,user,key,"retention_policy_activate",payload,policyId,[guard(db,"EXISTS(SELECT 1 FROM hrm_retention_policy_versions WHERE id=? AND version=? AND state='reviewed' AND reviewed_by!=?)",[policyId,version,user.id]),...(active?[guard(db,"NOT EXISTS(SELECT 1 FROM hrm_file_deletion_requests WHERE policy_version_id=? AND state IN ('deleting','retryable'))",[active.id])]:[])],[...statements,db.prepare("DELETE FROM hrm_write_guards")]);
}

interface SourceFileRow {id:string;person_id:string|null;kind:string;coi_declaration_id:string|null;onboarding_task_id:string|null;state:string;original_name:string;object_key:string;size_bytes:number;checksum:string;legal_hold:number;created_at:string;expires_on:string|null;object_deleted_at:string|null;version:number;employee_code?:string|null}
async function sourceFile(db:D1Database,source:RetentionSource,fileId:string):Promise<SourceFileRow|null>{
 if(source==="hrm_files")return db.prepare("SELECT f.id,f.person_id,f.kind,NULL AS coi_declaration_id,NULL AS onboarding_task_id,f.state,f.original_name,f.object_key,f.size_bytes,f.checksum,f.legal_hold,f.created_at,f.expires_on,f.object_deleted_at,f.version,p.employee_code FROM hrm_files f LEFT JOIN hrm_people p ON p.id=f.person_id WHERE f.id=?").bind(fileId).first<SourceFileRow>();
 return db.prepare("SELECT f.id,f.person_id,f.kind,f.coi_declaration_id,f.onboarding_task_id,f.state,f.original_name,f.object_key,f.size_bytes,f.checksum,f.legal_hold,f.created_at,NULL AS expires_on,f.object_deleted_at,f.version,p.employee_code FROM hrm_legal_files f LEFT JOIN hrm_people p ON p.id=f.person_id WHERE f.id=?").bind(fileId).first<SourceFileRow>();
}
function hasHold(holds:LegalHold[],source:RetentionSource,fileId:string,personId:string|null,category:RetentionCategory):boolean{
 return holds.some(hold=>hold.state==="active"&&(hold.scope_kind==="file"?hold.source_table===source&&hold.target_file_id===fileId:hold.person_id===personId&&(hold.category===category||hold.category==="*")));
}
export async function isPersonCategoryHeld(db:D1Database,personId:string|null,category:RetentionCategory):Promise<boolean>{
 if(!personId)return false;
 return !!(await db.prepare("SELECT 1 FROM hrm_legal_holds WHERE scope_kind='person' AND state='active' AND person_id=? AND category IN (?, '*') LIMIT 1").bind(personId,category).first());
}
export async function listRetentionFiles(db:D1Database,user:WorkspaceUser):Promise<RetentionFile[]>{
 if(!user.can("hrm.retention.manage")&&!user.can("hrm.retention.review"))throw new HrmError("forbidden",403);
 const [policy,hrmRows,legalRows,holds,requests]=await Promise.all([
  currentPolicy(db),
  db.prepare("SELECT f.id,f.person_id,f.kind,NULL AS coi_declaration_id,NULL AS onboarding_task_id,f.state,f.original_name,f.object_key,f.size_bytes,f.checksum,f.legal_hold,f.created_at,f.expires_on,f.object_deleted_at,f.version,p.employee_code FROM hrm_files f LEFT JOIN hrm_people p ON p.id=f.person_id ORDER BY f.created_at DESC LIMIT 500").all<SourceFileRow>(),
  db.prepare("SELECT f.id,f.person_id,f.kind,f.coi_declaration_id,f.onboarding_task_id,f.state,f.original_name,f.object_key,f.size_bytes,f.checksum,f.legal_hold,f.created_at,NULL AS expires_on,f.object_deleted_at,f.version,p.employee_code FROM hrm_legal_files f LEFT JOIN hrm_people p ON p.id=f.person_id ORDER BY f.created_at DESC LIMIT 500").all<SourceFileRow>(),
  db.prepare("SELECT id,scope_kind,person_id,category,source_table,target_file_id,state FROM hrm_legal_holds WHERE state='active'").all<Pick<LegalHold,"id"|"scope_kind"|"person_id"|"category"|"source_table"|"target_file_id"|"state">>(),
  db.prepare("SELECT id,source_table,source_file_id,state,requested_at FROM hrm_file_deletion_requests ORDER BY created_at DESC LIMIT 1000").all<Pick<FileDeletionRequest,"id"|"source_table"|"source_file_id"|"state"|"requested_at">>(),
 ]);
 const rules=policy?parseRules(policy.rules_json):[],ruleMap=new Map(rules.map(rule=>[rule.category,rule]));
 const requestMap=new Map<string,typeof requests.results[number]>();for(const request of requests.results){const key=`${request.source_table}:${request.source_file_id}`;if(!requestMap.has(key))requestMap.set(key,request)}
 return [
  ...hrmRows.results.map(row=>({source:"hrm_files" as const,row,category:retentionCategoryForHrm(row.kind)})),
  ...legalRows.results.map(row=>({source:"hrm_legal_files" as const,row,category:retentionCategoryForLegal(row)})),
 ].map(({source,row,category})=>{
  const rule=ruleMap.get(category),request=requestMap.get(`${source}:${row.id}`),due=rule?.retention_days===null||rule?.retention_days===undefined?null:retentionDue(row.created_at,rule.retention_days);
  return {source_table:source,file_id:row.id,person_id:row.person_id,employee_code:row.employee_code??null,category,kind:row.kind,state:row.state,original_name:row.original_name,object_key:row.object_key,size_bytes:row.size_bytes,checksum:row.checksum,legal_hold:row.legal_hold,created_at:row.created_at,expires_on:row.expires_on,object_deleted_at:row.object_deleted_at,file_version:row.version,retention_due_on:due,policy_configured:rule!==undefined,held:row.legal_hold===1||hasHold(holds.results as LegalHold[],source,row.id,row.person_id,category),deletion_request_id:request?.id??null,deletion_state:request?.state??null,deletion_requested_at:request?.requested_at??null};
 });
}

export async function listLegalHolds(db:D1Database,user:WorkspaceUser):Promise<LegalHold[]>{if(!user.can("hrm.legalhold.manage")&&!user.can("hrm.retention.review"))throw new HrmError("forbidden",403);return (await db.prepare("SELECT * FROM hrm_legal_holds ORDER BY placed_at DESC LIMIT 500").all<LegalHold>()).results}
export async function listDeletionRequests(db:D1Database,user:WorkspaceUser):Promise<FileDeletionRequest[]>{if(!user.can("hrm.retention.manage")&&!user.can("hrm.retention.review"))throw new HrmError("forbidden",403);return (await db.prepare(`SELECT r.*,p.employee_code,COALESCE(h.original_name,l.original_name) AS original_name
 FROM hrm_file_deletion_requests r LEFT JOIN hrm_people p ON p.id=r.person_id LEFT JOIN hrm_files h ON r.source_table='hrm_files' AND h.id=r.source_file_id LEFT JOIN hrm_legal_files l ON r.source_table='hrm_legal_files' AND l.id=r.source_file_id ORDER BY r.created_at DESC LIMIT 500`).all<FileDeletionRequest>()).results}

export async function createLegalHold(db:D1Database,user:WorkspaceUser,key:string,input:{scope_kind:"person"|"file";person_id:string;category:string;source_table?:RetentionSource;target_file_id?:string;reason:string}):Promise<string>{
 requireRetention(user,"hrm.legalhold.manage");if(!input.reason.trim()||input.reason.length>1000)throw new HrmError("reason_required");
 if(input.scope_kind==="person"){
  if(!(RETENTION_CATEGORIES as readonly string[]).includes(input.category)&&input.category!=="*"||!input.person_id)throw new HrmError("legal_hold_scope_invalid");
  const exists=await db.prepare("SELECT 1 FROM hrm_people WHERE id=?").bind(input.person_id).first();if(!exists)throw new HrmError("not_found",404);
 }else{
  if(!input.source_table||!input.target_file_id||input.person_id||input.category)throw new HrmError("legal_hold_scope_invalid");
  const file=await sourceFile(db,input.source_table,input.target_file_id);if(!file||file.object_deleted_at)throw new HrmError("not_found",404);
  input.person_id=file.person_id??"";input.category=input.source_table==="hrm_files"?retentionCategoryForHrm(file.kind):retentionCategoryForLegal(file);
 }
 const payload={...input,reason:input.reason.trim()},prior=await previous(db,user,key,"legal_hold_create",payload);if(prior)return prior;
 const holdId=id("legal_hold"),time=now(),scopeParams=input.scope_kind==="person"?personScopeParams(input.person_id,input.category):[input.source_table!,input.target_file_id!];
 const existingDeletionScope=requestScopeSql(input.scope_kind),fileHoldScope=fileScopeSql("hrm_files",input.scope_kind),legalHoldScope=fileScopeSql("hrm_legal_files",input.scope_kind);
 if(await db.prepare(`SELECT 1 FROM hrm_file_deletion_requests WHERE state IN ('deleting','retryable') AND ${existingDeletionScope} LIMIT 1`).bind(...scopeParams).first())throw new HrmError("retention_hold_deletion_in_progress",409);
 await command(db,user,key,"legal_hold_create",payload,holdId,[
  guard(db,"NOT EXISTS(SELECT 1 FROM hrm_legal_holds WHERE state='active' AND scope_kind=? AND ((scope_kind='person' AND person_id=? AND category=?) OR (scope_kind='file' AND source_table=? AND target_file_id=?)))",[input.scope_kind,input.person_id,input.category,input.source_table??null,input.target_file_id??null]),
  guard(db,`NOT EXISTS(SELECT 1 FROM hrm_file_deletion_requests WHERE state IN ('deleting','retryable') AND ${existingDeletionScope})`,scopeParams),
 ],[
  db.prepare("INSERT INTO hrm_legal_holds(id,scope_kind,person_id,category,source_table,target_file_id,state,reason,placed_by,placed_at,version,actor_id,created_at,updated_at) VALUES(?,?,?,?,?,?,'active',?,?,?,1,?,?,?)")
   .bind(holdId,input.scope_kind,input.scope_kind==="person"?input.person_id:null,input.scope_kind==="person"?input.category:null,input.scope_kind==="file"?input.source_table:null,input.scope_kind==="file"?input.target_file_id:null,input.reason.trim(),user.id,time,user.id,time,time),
  db.prepare(`UPDATE hrm_files SET legal_hold=1,retention_actor_id=?,version=version+1,updated_at=? WHERE ${fileHoldScope}`).bind(user.id,time,...(input.scope_kind==="person"?personScopeParams(input.person_id,input.category):[input.target_file_id!])),
  db.prepare(`UPDATE hrm_legal_files SET legal_hold=1,actor_id=?,version=version+1,updated_at=? WHERE ${legalHoldScope}`).bind(user.id,time,...(input.scope_kind==="person"?personScopeParams(input.person_id,input.category):[input.target_file_id!])),
  db.prepare(`UPDATE hrm_file_deletion_requests SET state='blocked',block_reason='Blocked by a newly placed legal hold.',version=version+1,actor_id=?,updated_at=? WHERE state IN ('pending_review','approved') AND ${existingDeletionScope}`).bind(user.id,time,...scopeParams),
  db.prepare("DELETE FROM hrm_write_guards"),
 ]);
 return holdId;
}

export async function releaseLegalHold(db:D1Database,user:WorkspaceUser,key:string,holdId:string,version:number,reason:string):Promise<void>{
 requireRetention(user,"hrm.retention.review");if(!reason.trim()||reason.length>1000)throw new HrmError("reason_required");
 const hold=await db.prepare("SELECT * FROM hrm_legal_holds WHERE id=?").bind(holdId).first<LegalHold>();if(!hold)throw new HrmError("not_found",404);if(hold.placed_by===user.id)throw new HrmError("self_approval",403);
 const payload={holdId,version,reason:reason.trim()},prior=await previous(db,user,key,"legal_hold_release",payload);if(prior)return;const time=now();
 const scopeParams=hold.scope_kind==="person"?personScopeParams(hold.person_id!,hold.category!):[hold.source_table!,hold.target_file_id!];
 const deletionScope=requestScopeSql(hold.scope_kind),hrmFileScope=fileScopeSql("hrm_files",hold.scope_kind),legalFileScope=fileScopeSql("hrm_legal_files",hold.scope_kind);
 const syncHold=`EXISTS(SELECT 1 FROM hrm_legal_holds h WHERE h.state='active' AND ((h.scope_kind='file' AND h.source_table='hrm_files' AND h.target_file_id=hrm_files.id) OR (h.scope_kind='person' AND h.person_id=hrm_files.person_id AND h.category IN (${categorySqlForHrm('hrm_files')}))))`;
 const syncLegal=`EXISTS(SELECT 1 FROM hrm_legal_holds h WHERE h.state='active' AND ((h.scope_kind='file' AND h.source_table='hrm_legal_files' AND h.target_file_id=hrm_legal_files.id) OR (h.scope_kind='person' AND h.person_id=hrm_legal_files.person_id AND h.category IN (${categorySqlForLegal('hrm_legal_files')}))))`;
 const writes:D1PreparedStatement[]=[
  db.prepare("UPDATE hrm_legal_holds SET state='released',released_by=?,released_at=?,release_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='active'").bind(user.id,time,reason.trim(),user.id,time,holdId,version),
  db.prepare(`UPDATE hrm_files SET legal_hold=CASE WHEN ${syncHold} THEN 1 ELSE 0 END,retention_actor_id=?,version=version+1,updated_at=? WHERE ${hrmFileScope}`).bind(user.id,time,...(hold.scope_kind==="person"?personScopeParams(hold.person_id!,hold.category!):[hold.target_file_id!])),
  db.prepare(`UPDATE hrm_legal_files SET legal_hold=CASE WHEN ${syncLegal} THEN 1 ELSE 0 END,actor_id=?,version=version+1,updated_at=? WHERE ${legalFileScope}`).bind(user.id,time,...(hold.scope_kind==="person"?personScopeParams(hold.person_id!,hold.category!):[hold.target_file_id!])),
  db.prepare("DELETE FROM hrm_write_guards"),
 ];
 await command(db,user,key,"legal_hold_release",payload,holdId,[guard(db,"EXISTS(SELECT 1 FROM hrm_legal_holds WHERE id=? AND version=? AND state='active' AND placed_by!=?)",[holdId,version,user.id]),guard(db,`NOT EXISTS(SELECT 1 FROM hrm_file_deletion_requests WHERE state IN ('deleting','retryable') AND ${deletionScope})`,scopeParams)],writes);
}

async function activeHoldsForFile(db:D1Database,source:RetentionSource,file:SourceFileRow,category:RetentionCategory):Promise<boolean>{
 if(file.legal_hold===1)return true;
 return !!(await db.prepare(`SELECT 1 FROM hrm_legal_holds WHERE state='active' AND
   ((scope_kind='file' AND source_table=? AND target_file_id=?) OR
    (scope_kind='person' AND person_id IS ? AND category IN (?, '*'))) LIMIT 1`)
   .bind(source,file.id,file.person_id,category).first());
}
function dueForFile(policy:RetentionPolicyVersion,category:RetentionCategory,file:SourceFileRow):string{
 const rule=parseRules(policy.rules_json).find(item=>item.category===category);if(!rule)throw new HrmError("retention_category_unconfigured",409);
 if(rule.retention_days===null)throw new HrmError("retention_category_manual_review",409);
 return retentionDue(file.created_at,rule.retention_days);
}
export async function createFileDeletionRequest(db:D1Database,user:WorkspaceUser,key:string,source:RetentionSource,fileId:string,reason:string):Promise<string>{
 requireRetention(user,"hrm.retention.manage");requireRetentionLive(user);if(user.admin)throw new HrmError("retention_request_system_admin_not_needed",403);if(!reason.trim()||reason.length>500)throw new HrmError("reason_required");
 const policy=await currentPolicy(db);if(!policy)throw new HrmError("retention_policy_missing",409);
 const file=await sourceFile(db,source,fileId);if(!file||file.object_deleted_at)throw new HrmError("not_found",404);
 if(file.state==="quarantined")throw new HrmError("retention_file_unreviewed",409);
 const category=source==="hrm_files"?retentionCategoryForHrm(file.kind):retentionCategoryForLegal(file);
 const due=dueForFile(policy,category,file);if(due>localDate())throw new HrmError("retention_not_due",409);
 if(await activeHoldsForFile(db,source,file,category))throw new HrmError("legal_hold_active",409);
 const payload={source,fileId,policyId:policy.id,policyVersion:policy.version_number,fileVersion:file.version,reason:reason.trim()};
 const prior=await previous(db,user,key,"file_deletion_request",payload);if(prior)return prior;
 const requestId=id("file_delete"),time=now(),scope=source==="hrm_files"?"hrm_files":"hrm_legal_files";
 await command(db,user,key,"file_deletion_request",payload,requestId,[
  guard(db,`EXISTS(SELECT 1 FROM ${scope} WHERE id=? AND version=? AND object_deleted_at IS NULL AND state!='quarantined')`,[fileId,file.version]),
  guard(db,"EXISTS(SELECT 1 FROM hrm_retention_policy_versions WHERE id=? AND state='active')",[policy.id]),
  guard(db,"NOT EXISTS(SELECT 1 FROM hrm_legal_holds WHERE state='active' AND ((scope_kind='file' AND source_table=? AND target_file_id=?) OR (scope_kind='person' AND person_id IS ? AND category IN (?, '*'))))",[source,fileId,file.person_id,category]),
  guard(db,"NOT EXISTS(SELECT 1 FROM hrm_file_deletion_requests WHERE source_table=? AND source_file_id=? AND state IN ('pending_review','approved','deleting','retryable','completed'))",[source,fileId]),
 ],[
  db.prepare(`INSERT INTO hrm_file_deletion_requests(id,source_table,source_file_id,person_id,category,object_key_snapshot,checksum_snapshot,file_version,policy_version_id,policy_version,retention_due_on,state,request_reason,requested_by,requested_at,version,actor_id,created_at,updated_at)
   VALUES(?,?,?,?,?,?,?,?,?, ?,?,'pending_review',?,?,?,1,?,?,?)`).bind(requestId,source,fileId,file.person_id,category,file.object_key,file.checksum,file.version,policy.id,policy.version_number,due,reason.trim(),user.id,time,user.id,time,time),
  db.prepare("DELETE FROM hrm_write_guards"),
 ]);
 return requestId;
}
export async function reviewFileDeletion(db:D1Database,user:WorkspaceUser,key:string,requestId:string,version:number,approve:boolean,reason:string):Promise<void>{
 requireRetention(user,"hrm.retention.review");requireRetentionLive(user);if(!reason.trim()||reason.length>500)throw new HrmError("reason_required");
 const request=await db.prepare("SELECT * FROM hrm_file_deletion_requests WHERE id=?").bind(requestId).first<FileDeletionRequest>();if(!request)throw new HrmError("not_found",404);
 if(request.requested_by===user.id)throw new HrmError("self_approval",403);
 const policy=approve?await currentPolicy(db):null;if(approve&&(!policy||policy.id!==request.policy_version_id||policy.version_number!==request.policy_version))throw new HrmError("retention_policy_changed",409);
 const file=await sourceFile(db,request.source_table,request.source_file_id);if(!file||file.object_deleted_at||file.object_key!==request.object_key_snapshot||file.checksum!==request.checksum_snapshot||file.version!==request.file_version)throw new HrmError("retention_file_changed",409);
 if(approve&&await activeHoldsForFile(db,request.source_table,file,request.category as RetentionCategory))throw new HrmError("legal_hold_active",409);
 if(approve&&request.retention_due_on>localDate())throw new HrmError("retention_not_due",409);
 const payload={requestId,version,approve,reason:reason.trim()},prior=await previous(db,user,key,"file_deletion_review",payload);if(prior)return;
 const next=approve?"approved":"rejected",time=now();
 await command(db,user,key,"file_deletion_review",payload,requestId,[
  guard(db,"EXISTS(SELECT 1 FROM hrm_file_deletion_requests WHERE id=? AND version=? AND state='pending_review' AND requested_by!=?)",[requestId,version,user.id]),
  ...(approve?[guard(db,"EXISTS(SELECT 1 FROM hrm_retention_policy_versions WHERE id=? AND version_number=? AND state='active')",[request.policy_version_id,request.policy_version]),guard(db,"NOT EXISTS(SELECT 1 FROM hrm_legal_holds WHERE state='active' AND ((scope_kind='file' AND source_table=? AND target_file_id=?) OR (scope_kind='person' AND person_id IS ? AND category IN (?, '*'))))",[request.source_table,request.source_file_id,file.person_id,request.category])]:[]),
 ],[
  db.prepare("UPDATE hrm_file_deletion_requests SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,block_reason=NULL,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='pending_review'").bind(next,user.id,time,reason.trim(),user.id,time,requestId,version),
  db.prepare("DELETE FROM hrm_write_guards"),
 ]);
}
export async function executeFileDeletion(db:D1Database,bucket:R2Bucket,user:WorkspaceUser,key:string,requestId:string,version:number):Promise<void>{
 if(!user.admin)throw new HrmError("retention_execution_system_admin_only",403);requireRetentionLive(user);
 const request=await db.prepare("SELECT * FROM hrm_file_deletion_requests WHERE id=?").bind(requestId).first<FileDeletionRequest>();if(!request)throw new HrmError("not_found",404);
 const retry=request.state==="deleting"||request.state==="retryable";
 if(!retry&&(request.state!=="approved"||request.version!==version))throw new HrmError("invalid_transition",409);
 if(!request.reviewed_by||request.reviewed_by===user.id)throw new HrmError("retention_executor_must_differ",403);
 const policy=await currentPolicy(db);if(!policy||policy.id!==request.policy_version_id||policy.version_number!==request.policy_version)throw new HrmError("retention_policy_changed",409);
 const file=await sourceFile(db,request.source_table,request.source_file_id);if(!file||file.object_deleted_at||file.object_key!==request.object_key_snapshot||file.checksum!==request.checksum_snapshot||file.version!==request.file_version)throw new HrmError("retention_file_changed",409);
 if(await activeHoldsForFile(db,request.source_table,file,request.category as RetentionCategory))throw new HrmError("legal_hold_active",409);
 if(request.retention_due_on>localDate())throw new HrmError("retention_not_due",409);
 const payload={requestId,version,source:request.source_table,fileId:request.source_file_id,checksum:request.checksum_snapshot};
 if(!retry){
  const prior=await previous(db,user,key,"file_deletion_start",payload);if(prior&&prior!==requestId)throw new HrmError("request_key_conflict",409);
  const time=now();await command(db,user,key,"file_deletion_start",payload,requestId,[
   guard(db,"EXISTS(SELECT 1 FROM hrm_file_deletion_requests WHERE id=? AND version=? AND state='approved')",[requestId,version]),
   guard(db,"NOT EXISTS(SELECT 1 FROM hrm_legal_holds WHERE state='active' AND ((scope_kind='file' AND source_table=? AND target_file_id=?) OR (scope_kind='person' AND person_id IS ? AND category IN (?, '*'))))",[request.source_table,request.source_file_id,file.person_id,request.category]),
  ],[db.prepare("UPDATE hrm_file_deletion_requests SET state='deleting',version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='approved'").bind(user.id,time,requestId,version),db.prepare("DELETE FROM hrm_write_guards")]);
 }
 try{await bucket.delete(request.object_key_snapshot)}catch(error){
  const detail=error instanceof Error?`R2 delete failed: ${error.name}`:"R2 delete failed.";const time=now();
  await db.prepare("UPDATE hrm_file_deletion_requests SET state='retryable',completion_detail=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND state='deleting'").bind(detail,user.id,time,requestId).run().catch(()=>{});
  throw new HrmError("retention_delete_failed",503);
 }
 const time=now(),source=request.source_table==="hrm_files"?"hrm_files":"hrm_legal_files";
 try{
  await db.batch([
   guard(db,"EXISTS(SELECT 1 FROM hrm_file_deletion_requests WHERE id=? AND state='deleting' AND object_key_snapshot=? AND checksum_snapshot=?)",[requestId,request.object_key_snapshot,request.checksum_snapshot]),
   guard(db,"NOT EXISTS(SELECT 1 FROM hrm_legal_holds WHERE state='active' AND ((scope_kind='file' AND source_table=? AND target_file_id=?) OR (scope_kind='person' AND person_id IS ? AND category IN (?, '*'))))",[request.source_table,request.source_file_id,file.person_id,request.category]),
   guard(db,`EXISTS(SELECT 1 FROM ${source} WHERE id=? AND version=? AND checksum=? AND object_deleted_at IS NULL)`,[request.source_file_id,request.file_version,request.checksum_snapshot]),
   db.prepare(`UPDATE ${source} SET object_deleted_at=?,${source==="hrm_files"?"retention_actor_id=?":"actor_id=?"},version=version+1,updated_at=? WHERE id=? AND version=? AND checksum=? AND object_deleted_at IS NULL`).bind(time,user.id,time,request.source_file_id,request.file_version,request.checksum_snapshot),
   db.prepare("UPDATE hrm_file_deletion_requests SET state='completed',completed_by=?,completed_at=?,completion_detail='R2 object deleted; metadata tombstone retained for audit and references.',version=version+1,actor_id=?,updated_at=? WHERE id=? AND state='deleting'").bind(user.id,time,user.id,time,requestId),
   db.prepare("DELETE FROM hrm_write_guards"),
  ]);
 }catch(error){
  const detail=error instanceof Error?`R2 delete attempted; D1 finalization needs retry: ${error.name}`:"R2 delete attempted; D1 finalization needs retry.";const failedAt=now();
  await db.prepare("UPDATE hrm_file_deletion_requests SET state='retryable',completion_detail=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND state='deleting'").bind(detail,user.id,failedAt,requestId).run().catch(()=>{});
  throw new HrmError("retention_delete_failed",503);
 }
}
