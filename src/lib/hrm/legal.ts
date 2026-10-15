import type { WorkspaceUser } from "../workspace/roles";
import { date, HrmError } from "./fields";
import { command, digest, guard, id, localDate, now, own, personFor, requirePermission, settings } from "./service";
import { DOCX_MIME, readLegalUpload } from "./legal-files";
import { getCoiDeclaration } from "./coi";
import { onboardingPdfUploadTarget, onboardingTaskForEvidenceViewer, reviewOnboardingEvidence } from "./onboarding";
import { retentionCategoryForLegal } from "./retention";

export type LegalDocumentType="policy"|"nda"|"employment_contract"|"contract_addendum"|"code_of_conduct"|"privacy"|"equipment"|"handover"|"other";
export type LegalSigningMode="acknowledgement"|"paper_scan";
export interface LegalTemplate {id:string;document_key:string;document_type:LegalDocumentType;title_en:string;title_vi:string;state:string;current_version_id:string|null;version:number;created_by:string;created_at:string;updated_at:string}
export interface LegalVersion {id:string;template_id:string;version_number:number;source_file_id:string;source_checksum:string;language:"en"|"vi"|"bilingual";legal_entity:string;purpose:string;audience_json:string;requires_ack:number;signing_mode:LegalSigningMode;required_parties_json:string;effective_on:string|null;due_days:number;state:string;created_by:string;created_at:string;reviewed_by:string|null;reviewed_at:string|null;review_reason:string|null;activated_by:string|null;activated_at:string|null;version:number}
export interface LegalFile {id:string;object_key:string;kind:"docx_source"|"pdf_evidence";template_id:string|null;template_version_id:string|null;issue_id:string|null;coi_declaration_id:string|null;onboarding_task_id:string|null;person_id:string|null;original_name:string;mime_type:string;size_bytes:number;checksum:string;state:string;uploaded_by:string;reviewed_by:string|null;reviewed_at:string|null;review_reason:string|null;legal_hold:number;object_deleted_at:string|null;version:number;created_at:string}
export interface LegalIssue {id:string;template_id:string;template_version_id:string;person_id:string;employment_id:string;issue_no:number;snapshot_json:string;source_checksum:string;state:string;issued_by:string;issued_at:string;due_at:string|null;supersedes_id:string|null;version:number;created_at:string;updated_at:string}
export interface LegalParty {id:string;issue_id:string;party_key:string;party_kind:string;user_id:string|null;display_name:string;required:number;state:string;evidence_file_id:string|null;signed_at:string|null;verified_by:string|null;verified_at:string|null;review_reason:string|null;version:number;created_at:string;updated_at:string}
interface RequiredParty {party_key:string;party_kind:"employee"|"company"|"other";display_name:string;required:boolean;user_id?:string|null}
const DOC_TYPES:readonly string[]=["policy","nda","employment_contract","contract_addendum","code_of_conduct","privacy","equipment","handover","other"];
const EMPLOYMENT_AUDIENCES=new Set(["preboarding","probation","active","notice"]);
const requestKeyPattern=/^[A-Za-z0-9_-]{16,100}$/;
const safeName=(name:string)=>name.replace(/[\x00-\x1f\x7f"\\/]/g,"_").slice(0,160)||"document";
const parseArray=(value:string):unknown[]=>{try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed}catch{}throw new HrmError("invalid_document_config")};
const validParties=(value:string):RequiredParty[]=>{
 const raw=parseArray(value);if(raw.length>8)throw new HrmError("invalid_document_config");
 const parties=raw.map(item=>{
  if(!item||typeof item!=="object")throw new HrmError("invalid_document_config");
  const p=item as Record<string,unknown>;
  if(typeof p.party_key!=="string"||!/^[a-z0-9_-]{1,40}$/.test(p.party_key)||!(["employee","company","other"] as unknown[]).includes(p.party_kind)||typeof p.display_name!=="string"||!p.display_name.trim()||p.display_name.length>160||typeof p.required!=="boolean"||(p.user_id!==undefined&&p.user_id!==null&&typeof p.user_id!=="string"))throw new HrmError("invalid_document_config");
  return {party_key:p.party_key,party_kind:p.party_kind as RequiredParty["party_kind"],display_name:p.display_name.trim(),required:p.required,user_id:p.user_id as string|null|undefined};
 });
 if(new Set(parties.map(p=>p.party_key)).size!==parties.length)throw new HrmError("invalid_document_config");
 return parties;
};
async function previousCommand(db:D1Database,user:WorkspaceUser,key:string,operation:string,payload:unknown):Promise<string|null>{
 if(!requestKeyPattern.test(key))throw new HrmError("invalid_request_key");
 const row=await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string;result_id:string}>();
 if(!row)return null;
 if(row.operation!==operation||row.payload_hash!==await digest(JSON.stringify(payload)))throw new HrmError("request_key_conflict",409);
 return row.result_id;
}

export async function listLegalTemplates(db:D1Database,user:WorkspaceUser):Promise<(LegalTemplate&{latest_version:number|null;source_state:string|null})[]>{
 requirePermission(user,"hrm.legal.manage");
 return (await db.prepare(`SELECT t.*,v.version_number AS latest_version,f.state AS source_state FROM hrm_legal_templates t LEFT JOIN hrm_legal_template_versions v ON v.id=t.current_version_id LEFT JOIN hrm_legal_files f ON f.id=v.source_file_id ORDER BY t.document_type,t.title_en LIMIT 200`).all<LegalTemplate&{latest_version:number|null;source_state:string|null}>()).results;
}
export async function listLegalSourceFiles(db:D1Database,user:WorkspaceUser):Promise<LegalFile[]>{
 requirePermission(user,"hrm.legal.manage");
 return (await db.prepare("SELECT * FROM hrm_legal_files WHERE kind='docx_source' ORDER BY created_at DESC LIMIT 200").all<LegalFile>()).results;
}
export async function listLegalTemplateVersions(db:D1Database,user:WorkspaceUser,templateId:string):Promise<(LegalVersion&{source_name:string;source_state:string})[]>{
 requirePermission(user,"hrm.legal.manage");
 return (await db.prepare("SELECT v.*,f.original_name AS source_name,f.state AS source_state FROM hrm_legal_template_versions v JOIN hrm_legal_files f ON f.id=v.source_file_id WHERE v.template_id=? ORDER BY v.version_number DESC LIMIT 50").bind(templateId).all<LegalVersion&{source_name:string;source_state:string}>()).results;
}
export async function listIssueTargets(db:D1Database,user:WorkspaceUser):Promise<{id:string;employee_code:string;legal_name:string;status:string}[]>{
 requirePermission(user,"hrm.legal.manage");
 return (await db.prepare("SELECT p.id,p.employee_code,p.legal_name,e.status FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id AND e.id=(SELECT e2.id FROM hrm_employments e2 WHERE e2.person_id=p.id ORDER BY CASE WHEN e2.status!='ended' THEN 0 ELSE 1 END,e2.started_on DESC,e2.created_at DESC LIMIT 1) WHERE p.user_id IS NOT NULL AND e.status!='ended' AND (e.ended_on IS NULL OR e.ended_on>date('now','+7 hours')) ORDER BY p.legal_name,p.id LIMIT 500").all<{id:string;employee_code:string;legal_name:string;status:string}>()).results;
}
export async function listLegalIssues(db:D1Database,user:WorkspaceUser):Promise<(LegalIssue&{employee_code:string;legal_name:string;document_type:string;title_en:string;version_number:number})[]>{
 requirePermission(user,"hrm.legal.manage");
 return (await db.prepare(`SELECT i.*,p.employee_code,p.legal_name,t.document_type,t.title_en,v.version_number FROM hrm_legal_issues i JOIN hrm_people p ON p.id=i.person_id JOIN hrm_legal_templates t ON t.id=i.template_id JOIN hrm_legal_template_versions v ON v.id=i.template_version_id ORDER BY i.issued_at DESC LIMIT 200`).all<LegalIssue&{employee_code:string;legal_name:string;document_type:string;title_en:string;version_number:number}>()).results;
}
export async function listMyLegalIssues(db:D1Database,user:WorkspaceUser):Promise<(LegalIssue&{document_type:string;title_en:string;title_vi:string;version_number:number;language:string;signing_mode:string;acknowledged_at:string|null})[]>{
 requirePermission(user,"hrm.legal.self");const person=await personFor(db,user);
 return (await db.prepare(`SELECT i.*,t.document_type,t.title_en,t.title_vi,v.version_number,v.language,v.signing_mode,a.acknowledged_at FROM hrm_legal_issues i JOIN hrm_legal_templates t ON t.id=i.template_id JOIN hrm_legal_template_versions v ON v.id=i.template_version_id LEFT JOIN hrm_policy_acknowledgements a ON a.issue_id=i.id WHERE i.person_id=? ORDER BY i.issued_at DESC LIMIT 200`).bind(person.id).all<LegalIssue&{document_type:string;title_en:string;title_vi:string;version_number:number;language:string;signing_mode:string;acknowledged_at:string|null}>()).results;
}
export async function createLegalTemplate(db:D1Database,user:WorkspaceUser,key:string,input:{document_key:string;document_type:LegalDocumentType;title_en:string;title_vi:string}):Promise<string>{
 requirePermission(user,"hrm.legal.manage");
 if(!/^[a-z0-9][a-z0-9_-]{2,79}$/.test(input.document_key)||!(DOC_TYPES as readonly string[]).includes(input.document_type)||!input.title_en.trim()||!input.title_vi.trim()||input.title_en.length>200||input.title_vi.length>200)throw new HrmError("invalid_document_config");
 const payload={...input,title_en:input.title_en.trim(),title_vi:input.title_vi.trim()},templateId=id("legal_template"),time=now();
 const existing=await previousCommand(db,user,key,"legal_template_create",payload);if(existing)return existing;
 await db.batch([
  guard(db,"NOT EXISTS(SELECT 1 FROM hrm_legal_templates WHERE document_key=?)",[input.document_key]),
  db.prepare("INSERT INTO hrm_legal_templates(id,document_key,document_type,title_en,title_vi,state,current_version_id,version,actor_id,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,'draft',NULL,1,?,?,?,?,?)").bind(templateId,input.document_key,input.document_type,payload.title_en,payload.title_vi,user.id,user.id,user.id,time,time),
  db.prepare("INSERT INTO hrm_commands(actor_id,request_key,operation,payload_hash,result_id,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,key,"legal_template_create",await digest(JSON.stringify(payload)),templateId,time),
  db.prepare("DELETE FROM hrm_write_guards"),
 ]);
 return templateId;
}
export interface LegalVersionInput {language:"en"|"vi"|"bilingual";legal_entity:string;purpose:string;audience_json:string;requires_ack:boolean;signing_mode:LegalSigningMode;required_parties_json:string;effective_on:string|null;due_days:number}
export async function createLegalVersion(db:D1Database,user:WorkspaceUser,key:string,templateId:string,fileId:string,input:LegalVersionInput):Promise<string>{
 requirePermission(user,"hrm.legal.manage");
 const audience=parseArray(input.audience_json);
 if(!(["en","vi","bilingual"] as unknown[]).includes(input.language)||!input.legal_entity.trim()||!input.purpose.trim()||input.legal_entity.length>200||input.purpose.length>1000||!Number.isInteger(input.due_days)||input.due_days<0||input.due_days>3650||audience.length===0||audience.some(value=>typeof value!=="string"||!EMPLOYMENT_AUDIENCES.has(value))||new Set(audience).size!==audience.length)throw new HrmError("invalid_document_config");
 if(input.effective_on)date(input.effective_on);
 const parties=validParties(input.required_parties_json);
 if(input.signing_mode==="paper_scan"&&(!parties.some(p=>p.required&&p.party_kind==="employee")||!parties.some(p=>p.required&&p.party_kind==="company")))throw new HrmError("required_parties_missing");
 if(input.signing_mode==="acknowledgement"&&(!input.requires_ack||parties.length>0))throw new HrmError("invalid_document_config");
 const template=await db.prepare("SELECT id,state,version,document_type FROM hrm_legal_templates WHERE id=?").bind(templateId).first<{id:string;state:string;version:number;document_type:LegalDocumentType}>();if(!template||template.state==="retired")throw new HrmError("not_found",404);
 if(template.document_type==="policy"&&(input.signing_mode!=="acknowledgement"||!input.requires_ack))throw new HrmError("policy_ack_required");
 const file=await db.prepare("SELECT id,kind,state,checksum FROM hrm_legal_files WHERE id=? AND template_id=?").bind(fileId,templateId).first<{id:string;kind:string;state:string;checksum:string}>();if(!file||file.kind!=="docx_source"||file.state!=="reviewed")throw new HrmError("source_review_required");
 const payload={templateId,fileId,input:{...input,legal_entity:input.legal_entity.trim(),purpose:input.purpose.trim()}};const existing=await previousCommand(db,user,key,"legal_version_create",payload);if(existing)return existing;
 const latest=await db.prepare("SELECT COALESCE(MAX(version_number),0) AS n FROM hrm_legal_template_versions WHERE template_id=?").bind(templateId).first<{n:number}>();const versionNumber=Number(latest?.n??0)+1;const versionId=id("legal_version"),time=now();
 await db.batch([
  guard(db,"EXISTS(SELECT 1 FROM hrm_legal_templates WHERE id=? AND version=? AND state!='retired')",[templateId,template.version]),
  guard(db,"EXISTS(SELECT 1 FROM hrm_legal_files WHERE id=? AND kind='docx_source' AND state='reviewed' AND checksum=?)",[fileId,file.checksum]),
  guard(db,"NOT EXISTS(SELECT 1 FROM hrm_legal_template_versions WHERE template_id=? AND version_number=?)",[templateId,versionNumber]),
  db.prepare("INSERT INTO hrm_legal_template_versions(id,template_id,version_number,source_file_id,source_checksum,language,legal_entity,purpose,audience_json,requires_ack,signing_mode,required_parties_json,effective_on,due_days,state,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)").bind(versionId,templateId,versionNumber,fileId,file.checksum,input.language,input.legal_entity.trim(),input.purpose.trim(),input.audience_json,input.requires_ack?1:0,input.signing_mode,input.required_parties_json,input.effective_on,input.due_days,user.id,time,user.id,time),
  db.prepare("UPDATE hrm_legal_templates SET version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=?").bind(user.id,time,templateId,template.version),
  db.prepare("INSERT INTO hrm_commands(actor_id,request_key,operation,payload_hash,result_id,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,key,"legal_version_create",await digest(JSON.stringify(payload)),versionId,time),
  db.prepare("DELETE FROM hrm_write_guards"),
 ]);
 return versionId;
}
export async function reviewLegalVersion(db:D1Database,user:WorkspaceUser,key:string,versionId:string,expectedVersion:number,approve:boolean,reason:string):Promise<void>{
 requirePermission(user,"hrm.legal.review");if(!reason.trim()||reason.length>500)throw new HrmError("reason_required");
 const current=await db.prepare("SELECT id,template_id,version_number,state,created_by FROM hrm_legal_template_versions WHERE id=?").bind(versionId).first<{id:string;template_id:string;version_number:number;state:string;created_by:string}>();if(!current)throw new HrmError("not_found",404);if(current.created_by===user.id)throw new HrmError("self_approval",403);
 const nextState=approve?"reviewed":"rejected",payload={versionId,expectedVersion,decision:nextState,reason:reason.trim()};const existing=await previousCommand(db,user,key,"legal_version_review",payload);if(existing)return;
 const time=now();await db.batch([
  guard(db,"EXISTS(SELECT 1 FROM hrm_legal_template_versions WHERE id=? AND version=? AND state='draft' AND created_by!=?)",[versionId,expectedVersion,user.id]),
  db.prepare("UPDATE hrm_legal_template_versions SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=? AND state='draft'").bind(nextState,user.id,time,reason.trim(),user.id,time,versionId,expectedVersion),
  db.prepare("INSERT INTO hrm_commands(actor_id,request_key,operation,payload_hash,result_id,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,key,"legal_version_review",await digest(JSON.stringify(payload)),versionId,time),
  db.prepare("DELETE FROM hrm_write_guards"),
 ]);
}
export async function activateLegalVersion(db:D1Database,user:WorkspaceUser,key:string,versionId:string,expectedVersion:number):Promise<void>{
 requirePermission(user,"hrm.legal.activate");
 const row=await db.prepare(`SELECT v.*,t.version AS template_revision,t.document_type,t.current_version_id FROM hrm_legal_template_versions v JOIN hrm_legal_templates t ON t.id=v.template_id WHERE v.id=?`).bind(versionId).first<LegalVersion&{template_revision:number;document_type:LegalDocumentType;current_version_id:string|null}>();if(!row)throw new HrmError("not_found",404);if(row.created_by===user.id||!row.reviewed_by)throw new HrmError("self_approval",403);
 const config=await settings(db);if(!config.legal_entity||row.legal_entity!==config.legal_entity)throw new HrmError("legal_entity_unconfigured");
 const file=await db.prepare("SELECT state,checksum FROM hrm_legal_files WHERE id=?").bind(row.source_file_id).first<{state:string;checksum:string}>();if(file?.state!=="reviewed"||file.checksum!==row.source_checksum)throw new HrmError("source_review_required");
 const parties=validParties(row.required_parties_json);if(row.signing_mode==="paper_scan"&&(!parties.some(p=>p.required&&p.party_kind==="employee")||!parties.some(p=>p.required&&p.party_kind==="company")))throw new HrmError("required_parties_missing");
 const payload={versionId,expectedVersion,templateId:row.template_id,templateRevision:row.template_revision},existing=await previousCommand(db,user,key,"legal_version_activate",payload);if(existing)return;
 const time=now(),writes:D1PreparedStatement[]=[];
 if(row.current_version_id&&row.current_version_id!==versionId)writes.push(db.prepare("UPDATE hrm_legal_template_versions SET state='retired',version=version+1,updated_by=?,updated_at=? WHERE id=? AND state='active'").bind(user.id,time,row.current_version_id));
 writes.push(
  db.prepare("UPDATE hrm_legal_template_versions SET state='active',activated_by=?,activated_at=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=? AND state='reviewed'").bind(user.id,time,user.id,time,versionId,expectedVersion),
  db.prepare("UPDATE hrm_legal_templates SET state='active',current_version_id=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=? AND state!='retired'").bind(versionId,user.id,time,row.template_id,row.template_revision),
  db.prepare("INSERT INTO hrm_commands(actor_id,request_key,operation,payload_hash,result_id,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,key,"legal_version_activate",await digest(JSON.stringify(payload)),versionId,time),
  db.prepare("DELETE FROM hrm_write_guards"),
 );
 await db.batch([guard(db,"EXISTS(SELECT 1 FROM hrm_legal_template_versions WHERE id=? AND version=? AND state='reviewed' AND created_by!=?)",[versionId,expectedVersion,user.id]),guard(db,"EXISTS(SELECT 1 FROM hrm_legal_files WHERE id=? AND state='reviewed' AND checksum=?)",[row.source_file_id,row.source_checksum]),guard(db,"EXISTS(SELECT 1 FROM hrm_legal_templates WHERE id=? AND version=? AND current_version_id IS ? AND state!='retired')",[row.template_id,row.template_revision,row.current_version_id]),...writes]);
}
export async function retireLegalTemplate(db:D1Database,user:WorkspaceUser,key:string,templateId:string,expectedVersion:number,reason:string):Promise<void>{
 requirePermission(user,"hrm.legal.activate");if(!reason.trim()||reason.length>500)throw new HrmError("reason_required");
 const template=await db.prepare("SELECT id,current_version_id,version,state FROM hrm_legal_templates WHERE id=?").bind(templateId).first<{id:string;current_version_id:string|null;version:number;state:string}>();if(!template)throw new HrmError("not_found",404);
 const payload={templateId,expectedVersion,reason:reason.trim()},prior=await previousCommand(db,user,key,"legal_template_retire",payload);if(prior)return;
 const time=now(),writes:D1PreparedStatement[]=[];
 if(template.current_version_id)writes.push(db.prepare("UPDATE hrm_legal_template_versions SET state='retired',version=version+1,updated_by=?,updated_at=? WHERE id=? AND state='active'").bind(user.id,time,template.current_version_id));
 writes.push(db.prepare("UPDATE hrm_legal_templates SET state='retired',current_version_id=NULL,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=? AND state!='retired'").bind(user.id,time,templateId,expectedVersion),db.prepare("INSERT INTO hrm_commands(actor_id,request_key,operation,payload_hash,result_id,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,key,"legal_template_retire",await digest(JSON.stringify(payload)),templateId,time),db.prepare("DELETE FROM hrm_write_guards"));
 await db.batch([guard(db,"EXISTS(SELECT 1 FROM hrm_legal_templates WHERE id=? AND version=? AND state!='retired')",[templateId,expectedVersion]),...writes]);
}

export async function issueLegalDocument(db:D1Database,user:WorkspaceUser,key:string,templateId:string,personId:string,supersedesId:string|null=null):Promise<string>{
 requirePermission(user,"hrm.legal.manage");const person=await personFor(db,user,personId);if(person.status==="ended"||!person.user_id)throw new HrmError("not_found",404);
 const version=await db.prepare(`SELECT v.*,t.document_type,t.title_en,t.title_vi,t.state AS template_state FROM hrm_legal_templates t JOIN hrm_legal_template_versions v ON v.id=t.current_version_id WHERE t.id=?`).bind(templateId).first<LegalVersion&{document_type:LegalDocumentType;title_en:string;title_vi:string;template_state:string}>();if(!version||version.state!=="active"||version.template_state!=="active")throw new HrmError("document_not_active");
 if(!parseArray(version.audience_json).includes(person.status))throw new HrmError("document_audience_mismatch",409);
 if(version.effective_on&&version.effective_on>localDate())throw new HrmError("document_not_effective");
 const file=await db.prepare("SELECT state,checksum FROM hrm_legal_files WHERE id=?").bind(version.source_file_id).first<{state:string;checksum:string}>();if(file?.state!=="reviewed"||file.checksum!==version.source_checksum)throw new HrmError("source_review_required");
 const partySpecs=version.signing_mode==="acknowledgement"?[{party_key:"employee",party_kind:"employee" as const,display_name:person.legal_name,required:true,user_id:person.user_id}]:validParties(version.required_parties_json).map(p=>p.party_kind==="employee"?{...p,display_name:person.legal_name,user_id:person.user_id}:p);
 if(!partySpecs.some(p=>p.party_kind==="employee"&&p.required))throw new HrmError("required_parties_missing");
 const payload={templateId,personId,employmentId:person.employment_id,templateVersionId:version.id,checksum:version.source_checksum,supersedesId};const existing=await previousCommand(db,user,key,"legal_issue",payload);if(existing)return existing;
 const oldIssue=await db.prepare("SELECT id,issue_no FROM hrm_legal_issues WHERE template_version_id=? AND person_id=?").bind(version.id,person.id).first<{id:string;issue_no:number}>();if(oldIssue)return oldIssue.id;
 const latest=await db.prepare("SELECT COALESCE(MAX(issue_no),0) AS n FROM hrm_legal_issues WHERE template_id=? AND person_id=?").bind(templateId,person.id).first<{n:number}>();const issueNo=Number(latest?.n??0)+1,issueId=id("legal_issue"),time=now(),dueAt=version.due_days?new Date(Date.now()+version.due_days*86400000).toISOString():null;
 const snapshot={document_type:version.document_type,title_en:version.title_en,title_vi:version.title_vi,version:version.version_number,language:version.language,legal_entity:version.legal_entity,purpose:version.purpose,effective_on:version.effective_on,source_checksum:version.source_checksum,signing_mode:version.signing_mode,requires_ack:version.requires_ack===1,required_parties:partySpecs.map(p=>({party_key:p.party_key,party_kind:p.party_kind,display_name:p.display_name,required:p.required}))};
 const partyRows=partySpecs.map(p=>({id:id("legal_party"),party:p}));
 const writes:D1PreparedStatement[]=[db.prepare("INSERT INTO hrm_legal_issues(id,template_id,template_version_id,person_id,employment_id,issue_no,snapshot_json,source_checksum,state,issued_by,issued_at,due_at,supersedes_id,actor_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(issueId,templateId,version.id,person.id,person.employment_id,issueNo,JSON.stringify(snapshot),version.source_checksum,version.signing_mode==="acknowledgement"?"issued":"awaiting_action",user.id,time,dueAt,supersedesId,user.id,time,time)];
 for(const item of partyRows)writes.push(db.prepare("INSERT INTO hrm_legal_parties(id,issue_id,party_key,party_kind,user_id,display_name,required,state,version,actor_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'pending',1,?,?,?)").bind(item.id,issueId,item.party.party_key,item.party.party_kind,item.party.user_id??null,item.party.display_name,item.party.required?1:0,user.id,time,time));
 writes.push(db.prepare("INSERT INTO hrm_commands(actor_id,request_key,operation,payload_hash,result_id,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,key,"legal_issue",await digest(JSON.stringify(payload)),issueId,time));
 writes.push(db.prepare("DELETE FROM hrm_write_guards"));
 await db.batch([guard(db,"EXISTS(SELECT 1 FROM hrm_legal_templates WHERE id=? AND current_version_id=? AND state='active')",[templateId,version.id]),guard(db,"EXISTS(SELECT 1 FROM hrm_employments WHERE id=? AND person_id=? AND version=? AND status!='ended')",[person.employment_id,person.id,person.version]),guard(db,"NOT EXISTS(SELECT 1 FROM hrm_legal_issues WHERE template_version_id=? AND person_id=?)",[version.id,person.id]),...writes]);
 return issueId;
}

export async function uploadLegalFile(db:D1Database,bucket:R2Bucket,user:WorkspaceUser,key:string,file:File,input:{kind:"docx_source";templateId:string}|{kind:"pdf_evidence";issueId:string}|{kind:"pdf_evidence";coiDeclarationId:string}|{kind:"pdf_evidence";onboardingTaskId:string}):Promise<string>{
 if(input.kind==="docx_source")requirePermission(user,"hrm.legal.manage");
 let templateId:string|null=null,issueId:string|null=null,coiDeclarationId:string|null=null,onboardingTaskId:string|null=null,personId:string|null=null;
 if(input.kind==="docx_source"){
  const template=await db.prepare("SELECT id,state FROM hrm_legal_templates WHERE id=?").bind(input.templateId).first<{id:string;state:string}>();if(!template||template.state==="retired")throw new HrmError("not_found",404);templateId=template.id;
 }else if("issueId" in input){
  const issue=await db.prepare("SELECT id,person_id,state FROM hrm_legal_issues WHERE id=?").bind(input.issueId).first<{id:string;person_id:string;state:string}>();if(!issue||!["issued","viewed","awaiting_action"].includes(issue.state))throw new HrmError("not_found",404);
  const person=await personFor(db,user,issue.person_id);const self=own(person,user)&&user.can("hrm.legal.self");if(!self&&!user.can("hrm.legal.manage"))throw new HrmError("not_found",404);issueId=issue.id;personId=person.id;
 }else if("coiDeclarationId" in input){
  const declaration=await getCoiDeclaration(db,user,input.coiDeclarationId);if(["closed","superseded"].includes(declaration.state))throw new HrmError("not_found",404);coiDeclarationId=declaration.id;personId=declaration.person_id;
 }else{
  const task=await onboardingTaskForEvidenceViewer(db,user,input.onboardingTaskId);onboardingTaskId=task.id;personId=task.person_id;
 }
 const loaded=await readLegalUpload(file,input.kind),originalName=safeName(file.name),checksum=await digest(loaded.bytes),fileId=id("legal_file");
 const payload={kind:input.kind,templateId,issueId,coiDeclarationId,onboardingTaskId,personId,checksum,originalName,size:file.size};const prior=await previousCommand(db,user,key,"legal_file_upload",payload);if(prior)return prior;
 const onboardingTask=onboardingTaskId?await onboardingPdfUploadTarget(db,user,onboardingTaskId):null;
 const category=retentionCategoryForLegal({kind:input.kind,coi_declaration_id:coiDeclarationId,onboarding_task_id:onboardingTaskId});
 const objectKey=input.kind==="docx_source"?`hrm/legal/source/${fileId}`:onboardingTaskId?`hrm/onboarding/evidence/${personId}/${fileId}`:`hrm/legal/evidence/${personId}/${fileId}`,time=now();
 await bucket.put(objectKey,loaded.bytes,{httpMetadata:{contentType:loaded.mimeType},customMetadata:{sha256:checksum,kind:input.kind}});
 try{
  const guards:D1PreparedStatement[]=[],writes:D1PreparedStatement[]=[db.prepare(`INSERT INTO hrm_legal_files(id,object_key,kind,template_id,template_version_id,issue_id,coi_declaration_id,onboarding_task_id,person_id,original_name,mime_type,size_bytes,checksum,state,uploaded_by,legal_hold,version,actor_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'quarantined',?,CASE WHEN EXISTS(SELECT 1 FROM hrm_legal_holds WHERE scope_kind='person' AND state='active' AND person_id=? AND category IN (?, '*')) THEN 1 ELSE 0 END,1,?,?,?)`)
    .bind(fileId,objectKey,input.kind,templateId,null,issueId,coiDeclarationId,onboardingTaskId,personId,originalName,loaded.mimeType,file.size,checksum,user.id,personId,category,user.id,time,time)];
  if(templateId)guards.push(guard(db,"EXISTS(SELECT 1 FROM hrm_legal_templates WHERE id=? AND state!='retired')",[templateId]));
  if(issueId&&personId){
   guards.push(guard(db,"EXISTS(SELECT 1 FROM hrm_legal_issues WHERE id=? AND person_id=? AND state IN ('issued','viewed','awaiting_action'))",[issueId,personId]));
   writes.push(db.prepare("UPDATE hrm_legal_parties SET state='paper_signed_pending',evidence_file_id=?,version=version+1,actor_id=?,updated_at=? WHERE issue_id=? AND party_kind='employee' AND user_id=? AND state IN ('pending','viewed') AND EXISTS(SELECT 1 FROM hrm_legal_issues i JOIN hrm_legal_template_versions v ON v.id=i.template_version_id WHERE i.id=hrm_legal_parties.issue_id AND v.signing_mode='paper_scan')").bind(fileId,user.id,time,issueId,user.id));
  }
  if(coiDeclarationId&&personId)guards.push(guard(db,"EXISTS(SELECT 1 FROM hrm_coi_declarations WHERE id=? AND person_id=? AND state!='closed')",[coiDeclarationId,personId]));
  if(onboardingTaskId&&personId){
   const task=onboardingTask!,submission=id("onb_submission"),actorIsManager=user.can("hrm.onboarding.manage");
   guards.push(guard(db,`EXISTS(SELECT 1 FROM hrm_onboarding_tasks t JOIN hrm_onboarding_plans p ON p.id=t.plan_id WHERE t.id=? AND t.plan_id=? AND t.version=? AND t.state='in_progress' AND t.evidence_type='pdf' AND t.assignee_user_id${actorIsManager?" IS NOT NULL":"=?"} AND p.state='active')`,actorIsManager?[onboardingTaskId,task.plan_id,task.version]:[onboardingTaskId,task.plan_id,task.version,user.id]),guard(db,"NOT EXISTS(SELECT 1 FROM hrm_legal_files WHERE onboarding_task_id=? AND state='quarantined')",[onboardingTaskId]));
   writes.push(db.prepare("INSERT INTO hrm_onboarding_submissions(id,task_id,submitted_by,submitted_at,evidence_type,evidence_text,evidence_file_id,state,actor_id,created_at,updated_at) VALUES(?,?,?,?, 'pdf',NULL,?,'pending_review',?,?,?)").bind(submission,onboardingTaskId,user.id,time,fileId,user.id,time,time));
   writes.push(db.prepare("UPDATE hrm_onboarding_tasks SET state='submitted',current_submission_id=?,evidence_file_id=?,submission_text=NULL,submitted_by=?,submitted_at=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='in_progress'").bind(submission,fileId,user.id,time,user.id,time,onboardingTaskId,task.version));
  }
  const result=await command(db,user,key,"legal_file_upload",payload,fileId,guards,[...writes,db.prepare("DELETE FROM hrm_write_guards")]);
  if(result!==fileId)await bucket.delete(objectKey);return result;
 }catch(error){await bucket.delete(objectKey).catch(()=>{});throw error}
}

export async function reviewLegalFile(db:D1Database,user:WorkspaceUser,key:string,fileId:string,version:number,decision:"reviewed"|"rejected",reason:string):Promise<void>{
 const file=await db.prepare("SELECT id,kind,issue_id,coi_declaration_id,onboarding_task_id,person_id,uploaded_by,state,version FROM hrm_legal_files WHERE id=?").bind(fileId).first<Pick<LegalFile,"id"|"kind"|"issue_id"|"coi_declaration_id"|"onboarding_task_id"|"person_id"|"uploaded_by"|"state"|"version">>();if(!file)throw new HrmError("not_found",404);
 if(file.onboarding_task_id){await reviewOnboardingEvidence(db,user,key,fileId,version,decision,reason);return;}
 if(file.state!=="quarantined")throw new HrmError("not_found",404);if(file.uploaded_by===user.id)throw new HrmError("self_approval",403);
 requirePermission(user,"hrm.legal.review");if(!reason.trim()||reason.length>500)throw new HrmError("reason_required");
 if(file.coi_declaration_id){
  const declaration=await db.prepare("SELECT assigned_reviewer_id,state FROM hrm_coi_declarations WHERE id=?").bind(file.coi_declaration_id).first<{assigned_reviewer_id:string|null;state:string}>();
  if(!declaration||["closed","superseded"].includes(declaration.state)||!user.can("hrm.configure")&&(!user.can("hrm.coi.review")||declaration.assigned_reviewer_id!==user.id))throw new HrmError("not_found",404);
 }
 if(file.person_id){const person=await personFor(db,user,file.person_id);if(own(person,user))throw new HrmError("self_approval",403)}
 const payload={fileId,version,decision,reason:reason.trim()},prior=await previousCommand(db,user,key,"legal_file_review",payload);if(prior)return;
 const time=now();await command(db,user,key,"legal_file_review",payload,fileId,[guard(db,"EXISTS(SELECT 1 FROM hrm_legal_files WHERE id=? AND version=? AND state='quarantined' AND uploaded_by!=?)",[fileId,version,user.id])],[db.prepare("UPDATE hrm_legal_files SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='quarantined'").bind(decision,user.id,time,reason.trim(),user.id,time,fileId,version),db.prepare("DELETE FROM hrm_write_guards")]);
}

async function issueForViewer(db:D1Database,user:WorkspaceUser,issueId:string):Promise<LegalIssue>{
 const issue=await db.prepare("SELECT * FROM hrm_legal_issues WHERE id=?").bind(issueId).first<LegalIssue>();if(!issue)throw new HrmError("not_found",404);
 if(user.can("hrm.legal.manage"))return issue;
 if(!user.can("hrm.legal.self"))throw new HrmError("not_found",404);
 const party=await db.prepare("SELECT id FROM hrm_legal_parties WHERE issue_id=? AND user_id=?").bind(issueId,user.id).first<{id:string}>();if(party)return issue;
 const person=await personFor(db,user,issue.person_id);if(!own(person,user))throw new HrmError("not_found",404);return issue;
}
export async function getLegalIssue(db:D1Database,user:WorkspaceUser,issueId:string):Promise<LegalIssue&{document_type:string;title_en:string;title_vi:string;version_number:number;language:string;signing_mode:LegalSigningMode;requires_ack:number;source_file_id:string;acknowledged_at:string|null;files:LegalFile[];parties:LegalParty[]}>{
 let issue=await issueForViewer(db,user,issueId);
 if(issue.state==="issued"){
  const time=now();await db.batch([db.prepare("UPDATE hrm_legal_issues SET state='viewed',version=version+1,actor_id=?,updated_at=? WHERE id=? AND state='issued'").bind(user.id,time,issueId),db.prepare("UPDATE hrm_legal_parties SET state='viewed',version=version+1,actor_id=?,updated_at=? WHERE issue_id=? AND user_id=? AND state='pending'").bind(user.id,time,issueId,user.id)]);
  issue=await db.prepare("SELECT * FROM hrm_legal_issues WHERE id=?").bind(issueId).first<LegalIssue>()??issue;
 }
 const version=await db.prepare("SELECT v.version_number,v.language,v.signing_mode,v.requires_ack,v.source_file_id,t.document_type,t.title_en,t.title_vi FROM hrm_legal_template_versions v JOIN hrm_legal_templates t ON t.id=v.template_id WHERE v.id=?").bind(issue.template_version_id).first<{version_number:number;language:string;signing_mode:LegalSigningMode;requires_ack:number;source_file_id:string;document_type:string;title_en:string;title_vi:string}>();if(!version)throw new HrmError("not_found",404);
 const ack=await db.prepare("SELECT acknowledged_at FROM hrm_policy_acknowledgements WHERE issue_id=?").bind(issueId).first<{acknowledged_at:string}>();
 const files=(await db.prepare("SELECT * FROM hrm_legal_files WHERE issue_id=? ORDER BY created_at DESC LIMIT 50").bind(issueId).all<LegalFile>()).results;
 const parties=(await db.prepare("SELECT * FROM hrm_legal_parties WHERE issue_id=? ORDER BY created_at").bind(issueId).all<LegalParty>()).results;
 return {...issue,...version,acknowledged_at:ack?.acknowledged_at??null,files,parties};
}
export async function acknowledgePolicy(db:D1Database,user:WorkspaceUser,key:string,issueId:string,expectedChecksum:string,affirmed:boolean):Promise<string>{
 requirePermission(user,"hrm.legal.self");if(!affirmed)throw new HrmError("acknowledgement_required");
 const issue=await db.prepare("SELECT * FROM hrm_legal_issues WHERE id=?").bind(issueId).first<LegalIssue>();if(!issue)throw new HrmError("not_found",404);
 const person=await personFor(db,user,issue.person_id);if(!own(person,user))throw new HrmError("not_found",404);
 const version=await db.prepare("SELECT signing_mode,requires_ack,source_checksum FROM hrm_legal_template_versions WHERE id=?").bind(issue.template_version_id).first<{signing_mode:string;requires_ack:number;source_checksum:string}>();if(!version||version.signing_mode!=="acknowledgement"||version.requires_ack!==1||version.source_checksum!==expectedChecksum||issue.source_checksum!==expectedChecksum)throw new HrmError("document_version_conflict",409);
 const old=await db.prepare("SELECT id,actor_id,source_checksum FROM hrm_policy_acknowledgements WHERE issue_id=?").bind(issueId).first<{id:string;actor_id:string;source_checksum:string}>();if(old){if(old.actor_id!==user.id||old.source_checksum!==expectedChecksum)throw new HrmError("document_version_conflict",409);return old.id}
 if(!["issued","viewed","awaiting_action"].includes(issue.state))throw new HrmError("document_not_actionable",409);
 const payload={issueId,personId:person.id,versionId:issue.template_version_id,checksum:expectedChecksum,affirmed:true};const prior=await previousCommand(db,user,key,"policy_acknowledgement",payload);if(prior)return prior;
 const acknowledgement=id("legal_ack"),time=now(),party=await db.prepare("SELECT id,version FROM hrm_legal_parties WHERE issue_id=? AND party_kind='employee' AND user_id=?").bind(issueId,user.id).first<{id:string;version:number}>();if(!party)throw new HrmError("not_found",404);
 await command(db,user,key,"policy_acknowledgement",payload,acknowledgement,[guard(db,"EXISTS(SELECT 1 FROM hrm_legal_issues WHERE id=? AND person_id=? AND state IN ('issued','viewed','awaiting_action') AND source_checksum=? AND template_version_id=?)",[issueId,person.id,expectedChecksum,issue.template_version_id]),guard(db,"EXISTS(SELECT 1 FROM hrm_legal_parties WHERE id=? AND issue_id=? AND user_id=? AND version=? AND required=1 AND state IN ('pending','viewed') AND party_kind='employee')",[party.id,issueId,user.id,party.version])],[
  db.prepare("INSERT INTO hrm_policy_acknowledgements(id,issue_id,person_id,actor_id,template_version_id,source_checksum,acknowledged_at,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(acknowledgement,issueId,person.id,user.id,issue.template_version_id,expectedChecksum,time,time),
  db.prepare("UPDATE hrm_legal_parties SET state='acknowledged',signed_at=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=?").bind(time,user.id,time,party.id,party.version),
  db.prepare("UPDATE hrm_legal_issues SET state='completed',version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=?").bind(user.id,time,issueId,issue.version),
  db.prepare("DELETE FROM hrm_write_guards"),
 ]);
 return acknowledgement;
}

export async function downloadLegalFile(db:D1Database,bucket:R2Bucket,user:WorkspaceUser,fileId:string):Promise<Response>{
 const file=await db.prepare("SELECT * FROM hrm_legal_files WHERE id=?").bind(fileId).first<LegalFile>();if(!file)throw new HrmError("not_found",404);
 if(file.object_deleted_at)throw new HrmError("file_unavailable",404);
 let allowed=false,canReviewQuarantine=false;
 if(file.onboarding_task_id){
  const task=await onboardingTaskForEvidenceViewer(db,user,file.onboarding_task_id).catch(()=>null);
  if(task){canReviewQuarantine=task.verifier_user_id===user.id&&user.can("hrm.onboarding.tasks")||user.can("hrm.onboarding.manage");allowed=task.assignee_user_id===user.id&&user.can("hrm.onboarding.tasks")||task.person_user_id===user.id&&user.can("hrm.onboarding.self")||canReviewQuarantine;}
 }else if(file.coi_declaration_id){
  const declaration=await db.prepare("SELECT person_id,assigned_reviewer_id,state FROM hrm_coi_declarations WHERE id=?").bind(file.coi_declaration_id).first<{person_id:string;assigned_reviewer_id:string|null;state:string}>();
  if(declaration){
   canReviewQuarantine=user.can("hrm.configure")||user.can("hrm.coi.review")&&declaration.assigned_reviewer_id===user.id;
   if(canReviewQuarantine)allowed=true;
   else if(user.can("hrm.coi.self")){const person=await personFor(db,user,declaration.person_id);allowed=own(person,user)}
  }
 }else{allowed=user.can("hrm.legal.manage")||user.can("hrm.legal.review");canReviewQuarantine=user.can("hrm.legal.review")||user.can("hrm.configure")}
 if(!allowed&&file.issue_id&&user.can("hrm.legal.self")){
  const issue=await db.prepare("SELECT person_id,template_version_id FROM hrm_legal_issues WHERE id=?").bind(file.issue_id).first<{person_id:string;template_version_id:string}>();
  if(issue){const person=await personFor(db,user,issue.person_id);allowed=own(person,user)&&!!(await db.prepare("SELECT id FROM hrm_legal_parties WHERE issue_id=? AND user_id=?").bind(file.issue_id,user.id).first<{id:string}>())}
 }
 if(!allowed&&file.kind==="docx_source"&&user.can("hrm.legal.self")){
  allowed=!!(await db.prepare(`SELECT 1 AS allowed FROM hrm_legal_issues i
   JOIN hrm_legal_template_versions v ON v.id=i.template_version_id
   JOIN hrm_people p ON p.id=i.person_id AND p.user_id=?
   JOIN hrm_legal_parties party ON party.issue_id=i.id AND party.user_id=?
   JOIN hrm_employments e ON e.id=i.employment_id AND e.person_id=p.id AND e.status!='ended'
   WHERE v.source_file_id=? AND i.state NOT IN ('cancelled','superseded') LIMIT 1`).bind(user.id,user.id,file.id).first<{allowed:number}>());
 }
 if(!allowed||file.state!=="reviewed"&&file.uploaded_by!==user.id&&!canReviewQuarantine)throw new HrmError("not_found",404);
 const object=await bucket.get(file.object_key);if(!object)throw new HrmError("file_unavailable",404);
 await db.prepare("INSERT INTO hrm_legal_events(actor_id,action,template_id,template_version_id,issue_id,person_id,target_id,detail,created_at) VALUES(?,'file_downloaded',?,?,?,?,?,?,?)").bind(user.id,file.kind==="docx_source"?file.template_id:null,file.template_version_id,file.issue_id,file.person_id,file.id,JSON.stringify({kind:file.kind,state:file.state,coi_declaration_id:file.coi_declaration_id}),now()).run();
 const extension=file.mime_type===DOCX_MIME?"docx":"pdf";
 return new Response(object.body,{headers:{"Content-Type":file.mime_type,"Content-Length":String(file.size_bytes),"Content-Disposition":`attachment; filename="document.${extension}"; filename*=UTF-8''${encodeURIComponent(file.original_name).replaceAll("'","%27")}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox","Referrer-Policy":"no-referrer"}});
}

export async function verifyPaperParty(db:D1Database,user:WorkspaceUser,key:string,issueId:string,partyId:string,partyVersion:number,fileId:string,signedOn:string|null,reason:string):Promise<void>{
 requirePermission(user,"hrm.legal.review");if(!reason.trim()||reason.length>500)throw new HrmError("reason_required");if(signedOn)date(signedOn);
 const issue=await db.prepare("SELECT person_id,state FROM hrm_legal_issues WHERE id=?").bind(issueId).first<{person_id:string;state:string}>();if(!issue)throw new HrmError("not_found",404);
 const person=await personFor(db,user,issue.person_id);if(own(person,user))throw new HrmError("self_approval",403);
 const file=await db.prepare("SELECT id,issue_id,person_id,state,uploaded_by FROM hrm_legal_files WHERE id=?").bind(fileId).first<{id:string;issue_id:string|null;person_id:string|null;state:string;uploaded_by:string}>();if(!file||file.issue_id!==issueId||file.person_id!==person.id||file.state!=="reviewed"||file.uploaded_by===user.id)throw new HrmError("evidence_required",409);
 const party=await db.prepare("SELECT party_kind,required,user_id,state FROM hrm_legal_parties WHERE id=? AND issue_id=? AND version=?").bind(partyId,issueId,partyVersion).first<{party_kind:string;required:number;user_id:string|null;state:string}>();if(!party||!party.required||party.party_kind!=="employee"&&party.party_kind!=="company"||!["pending","viewed","paper_signed_pending"].includes(party.state))throw new HrmError("not_found",404);
 const payload={issueId,partyId,partyVersion,fileId,signedOn,reason:reason.trim()};const prior=await previousCommand(db,user,key,"legal_party_paper_verified",payload);if(prior)return;
 const time=now();await command(db,user,key,"legal_party_paper_verified",payload,partyId,[guard(db,"EXISTS(SELECT 1 FROM hrm_legal_parties WHERE id=? AND issue_id=? AND version=? AND required=1 AND state IN ('pending','viewed','paper_signed_pending'))",[partyId,issueId,partyVersion]),guard(db,"EXISTS(SELECT 1 FROM hrm_legal_files WHERE id=? AND issue_id=? AND person_id=? AND state='reviewed' AND uploaded_by!=?)",[fileId,issueId,person.id,user.id])],[
  db.prepare("UPDATE hrm_legal_parties SET state='paper_signed_verified',evidence_file_id=?,signed_at=?,declared_signed_on=?,verified_by=?,verified_at=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=?").bind(fileId,time,signedOn,user.id,time,reason.trim(),user.id,time,partyId,partyVersion),
  db.prepare("UPDATE hrm_legal_issues SET state='completed',version=version+1,actor_id=?,updated_at=? WHERE id=? AND state='awaiting_action' AND NOT EXISTS(SELECT 1 FROM hrm_legal_parties WHERE issue_id=? AND required=1 AND state NOT IN ('paper_signed_verified','acknowledged'))").bind(user.id,time,issueId,issueId),
  db.prepare("DELETE FROM hrm_write_guards"),
 ]);
}
