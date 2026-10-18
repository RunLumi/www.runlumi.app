import type { WorkspaceUser } from "../workspace/roles";
import { date, HrmError } from "./fields";
import { command, digest, guardBoolean, id, localDate, now, requirePermission, settings } from "./service";
import { reportAccount, reportAuthority } from "./report-governance";

export interface CloseoutCheck {
 key:string; title_en:string; title_vi:string; instructions_en:string; instructions_vi:string; allow_not_applicable:boolean;
}
export interface CloseoutPolicyInput {
 policyKey:string; titleEn:string; titleVi:string; purpose:string; jurisdiction:string;
 sourceVersionId:string|null; checks:unknown; allowNoPayroll:boolean; noPayrollInstructions:string|null;
 effectiveFrom:string; effectiveUntil:string;
}
export interface CloseoutPolicy {
 id:string;policy_key:string;legal_entity:string;revision:number;title_en:string;title_vi:string;purpose:string;jurisdiction:string;
 source_version_id:string|null;source_checksum:string|null;checklist_json:string;allow_no_payroll:number;no_payroll_instructions:string|null;
 effective_from:string;effective_until:string;state:"draft"|"reviewed"|"active"|"retired"|"rejected";
 created_by:string;created_at:string;reviewed_by:string|null;reviewed_at:string|null;review_reason:string|null;
 activated_by:string|null;activated_at:string|null;version:number;actor_id:string;updated_at:string;
}
const clean=(value:unknown,max:number):string=>{
 if(typeof value!=="string")throw new HrmError("closeout_policy_invalid",400);
 const result=value.trim();if(!result||result.length>max||/[\u0000-\u001f\u007f]/u.test(result))throw new HrmError("closeout_policy_invalid",400);return result;
};
export function parseCloseoutChecks(value:unknown):CloseoutCheck[]{
 if(!Array.isArray(value)||value.length<1||value.length>30)throw new HrmError("closeout_checklist_invalid",400);
 const keys=new Set<string>();return value.map(item=>{
  if(!item||typeof item!=="object"||Array.isArray(item))throw new HrmError("closeout_checklist_invalid",400);
  const fields=["key","title_en","title_vi","instructions_en","instructions_vi","allow_not_applicable"];
  if(Object.keys(item).some(key=>!fields.includes(key)))throw new HrmError("closeout_checklist_invalid",400);
  const key=clean(item.key,48);if(!/^[A-Z][A-Z0-9_-]*$/.test(key)||keys.has(key)||typeof item.allow_not_applicable!=="boolean")throw new HrmError("closeout_checklist_invalid",400);
  keys.add(key);return {key,title_en:clean(item.title_en,120),title_vi:clean(item.title_vi,120),instructions_en:clean(item.instructions_en,1000),instructions_vi:clean(item.instructions_vi,1000),allow_not_applicable:item.allow_not_applicable};
 });
}
function authorize(user:WorkspaceUser){requirePermission(user,"hrm.payroll.configure");requirePermission(user,"hrm.offboarding.manage")}
async function account(db:D1Database,content:D1Database,user:WorkspaceUser){
 authorize(user);
 try{
  await reportAccount(db,content,user.id,"hrm.payroll.configure");
  await reportAccount(db,content,user.id,"hrm.offboarding.manage");
 }catch(error){if(error instanceof HrmError&&error.message==="report_account_unavailable")throw new HrmError("closeout_account_unavailable",409);throw error}
}
function authority(db:D1Database,user:WorkspaceUser){
 return [...reportAuthority(db,user,"hrm.payroll.configure"),...reportAuthority(db,user,"hrm.offboarding.manage")];
}
const reviewedSource=`EXISTS(SELECT 1 FROM hrm_legal_template_versions v
 JOIN hrm_legal_templates t ON t.id=v.template_id JOIN hrm_legal_files f ON f.id=v.source_file_id
 WHERE v.id=p.source_version_id AND v.legal_entity=p.legal_entity AND v.source_checksum=p.source_checksum
 AND t.document_type='policy' AND v.state IN ('reviewed','active','retired')
 AND v.reviewed_by IS NOT NULL AND v.reviewed_by!=v.created_by
 AND f.kind='docx_source' AND f.state='reviewed' AND f.checksum=p.source_checksum
 AND f.reviewed_by IS NOT NULL AND f.reviewed_by!=f.uploaded_by AND f.object_deleted_at IS NULL
 AND NOT EXISTS(SELECT 1 FROM hrm_file_deletion_requests d WHERE d.source_table='hrm_legal_files' AND d.source_file_id=f.id AND d.state IN ('pending_review','approved','deleting','retryable','completed')))`;
function event(db:D1Database,user:WorkspaceUser,policyId:string,action:string,reason:string,time:string){
 return db.prepare("INSERT INTO hrm_closeout_policy_events(policy_id,event_type,reason,actor_id,created_at) VALUES(?,?,?,?,?)").bind(policyId,action,reason,user.id,time);
}
export async function listCloseoutPolicies(db:D1Database,user:WorkspaceUser):Promise<CloseoutPolicy[]>{
 authorize(user);const config=await settings(db);
 return (await db.prepare("SELECT * FROM hrm_closeout_policy_versions WHERE legal_entity=? ORDER BY created_at DESC,id DESC LIMIT 100").bind(config.legal_entity).all<CloseoutPolicy>()).results;
}
/** Configuration is possible while HRM is closed. This creates no employee
 * approval, payment, statutory rule or global activation. Definitions are frozen. */
export async function createCloseoutPolicy(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,input:CloseoutPolicyInput):Promise<string>{
 await account(db,content,user);const config=await settings(db);if(!config.legal_entity.trim())throw new HrmError("hrm_entity_unconfigured",409);
 const policyKey=clean(input.policyKey,48);if(!/^[A-Z][A-Z0-9_-]*$/.test(policyKey)||typeof input.allowNoPayroll!=="boolean")throw new HrmError("closeout_policy_invalid",400);
 if(!date(input.effectiveFrom)||!date(input.effectiveUntil)||input.effectiveUntil<input.effectiveFrom)throw new HrmError("invalid_date",400);
 const sourceId=input.sourceVersionId===null?null:clean(input.sourceVersionId,120);
 const source=sourceId?await db.prepare("SELECT source_checksum FROM hrm_legal_template_versions WHERE id=? AND legal_entity=?").bind(sourceId,config.legal_entity).first<{source_checksum:string}>():null;
 if(sourceId&&!source)throw new HrmError("closeout_policy_source_invalid",409);
 const values={policy_key:policyKey,legal_entity:config.legal_entity,title_en:clean(input.titleEn,120),title_vi:clean(input.titleVi,120),purpose:clean(input.purpose,1000),jurisdiction:clean(input.jurisdiction,300),source_version_id:sourceId,source_checksum:source?.source_checksum??null,checklist_json:JSON.stringify(parseCloseoutChecks(input.checks)),allow_no_payroll:Number(input.allowNoPayroll),no_payroll_instructions:input.allowNoPayroll?clean(input.noPayrollInstructions,1000):null,effective_from:input.effectiveFrom,effective_until:input.effectiveUntil};
 const current=await db.prepare("SELECT COALESCE(MAX(revision),0) AS n FROM hrm_closeout_policy_versions WHERE legal_entity=? AND policy_key=?").bind(config.legal_entity,policyKey).first<{n:number}>();
 const revision=(current?.n??0)+1,policyId=id("closeout_policy"),time=now();
 return command(db,user,key,"closeout_policy_create",values,policyId,[...authority(db,user),guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND legal_entity=? AND version=?)",[config.legal_entity,config.version])],[
  db.prepare(`INSERT INTO hrm_closeout_policy_versions(id,policy_key,legal_entity,revision,title_en,title_vi,purpose,jurisdiction,source_version_id,source_checksum,checklist_json,allow_no_payroll,no_payroll_instructions,effective_from,effective_until,created_by,created_at,actor_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(policyId,values.policy_key,values.legal_entity,revision,values.title_en,values.title_vi,values.purpose,values.jurisdiction,values.source_version_id,values.source_checksum,values.checklist_json,values.allow_no_payroll,values.no_payroll_instructions,values.effective_from,values.effective_until,user.id,time,user.id,time),
  event(db,user,policyId,"created","Definition recorded; not an employee clearance.",time),
 ]);
}
export async function actOnCloseoutPolicy(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,input:{policyId:string;version:number;action:"approve"|"reject"|"activate"|"retire";reason:string}):Promise<void>{
 await account(db,content,user);
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new HrmError("invalid_request_key");
 const prior=await db.prepare("SELECT operation,payload_hash FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string}>();
 if(prior){if(prior.operation!=="closeout_policy_action"||prior.payload_hash!==await digest(JSON.stringify(input)))throw new HrmError("request_key_conflict",409);return}
 const config=await settings(db),reason=clean(input.reason,500),time=now();
 if(!["approve","reject","activate","retire"].includes(input.action)||!Number.isSafeInteger(input.version)||input.version<1)throw new HrmError("closeout_policy_invalid",400);
 const row=await db.prepare("SELECT * FROM hrm_closeout_policy_versions WHERE id=? AND legal_entity=?").bind(clean(input.policyId,120),config.legal_entity).first<CloseoutPolicy>();
 if(!row)throw new HrmError("not_found",404);
 if(row.created_by===user.id)throw new HrmError("self_approval",403);
 const reviewing=input.action==="approve"||input.action==="reject",activating=input.action==="activate";
 const expected=reviewing?"draft":activating?"reviewed":"active",next=input.action==="approve"?"reviewed":input.action==="reject"?"rejected":activating?"active":"retired";
 if((activating||input.action==="approve")&&row.effective_until<localDate())throw new HrmError("closeout_policy_expired",409);
 const guards=[...authority(db,user),guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND legal_entity=? AND version=?)",[config.legal_entity,config.version]),guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_closeout_policy_versions WHERE id=? AND version=? AND state=? AND created_by!=?)",[row.id,input.version,expected,user.id])];
 if(activating||input.action==="approve"){
  const source=await db.prepare(`SELECT 1 FROM hrm_closeout_policy_versions p WHERE p.id=? AND ${reviewedSource}`).bind(row.id).first();
  if(!source)throw new HrmError("closeout_policy_source_invalid",409);
  guards.push(guardBoolean(db,`EXISTS(SELECT 1 FROM hrm_closeout_policy_versions p WHERE p.id=? AND ${reviewedSource})`,[row.id]));
 }
 const writes:D1PreparedStatement[]=[];
 if(activating)writes.push(
  db.prepare("INSERT INTO hrm_closeout_policy_events(policy_id,event_type,reason,actor_id,created_at) SELECT id,'retire',?,?,? FROM hrm_closeout_policy_versions WHERE legal_entity=? AND policy_key=? AND state='active' AND id!=?").bind(`Replaced by ${row.id}. ${reason}`,user.id,time,row.legal_entity,row.policy_key,row.id),
  db.prepare("UPDATE hrm_closeout_policy_versions SET state='retired',version=version+1,actor_id=?,updated_at=? WHERE legal_entity=? AND policy_key=? AND state='active' AND id!=?").bind(user.id,time,row.legal_entity,row.policy_key,row.id));
 writes.push(db.prepare(`UPDATE hrm_closeout_policy_versions SET state=?,version=version+1,actor_id=?,updated_at=?${reviewing?",reviewed_by=?,reviewed_at=?,review_reason=?":""}${activating?",activated_by=?,activated_at=?":""} WHERE id=? AND version=? AND state=?`).bind(next,user.id,time,...(reviewing?[user.id,time,reason]:[]),...(activating?[user.id,time]:[]),row.id,input.version,expected),event(db,user,row.id,input.action,reason,time));
 await command(db,user,key,"closeout_policy_action",input,row.id,guards,writes);
}
