import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { sqliteD1 } from "./d1-sqlite.ts";

export function closeoutFixture(){
 const db=sqliteD1(),time=new Date().toISOString(),sourceBytes=readFileSync(new URL("../fixtures/hrm/test-policy.docx",import.meta.url)),evidenceBytes=new TextEncoder().encode("%PDF-1.4\nTEST synthetic closeout evidence\n%%EOF"),sourceHash=createHash("sha256").update(sourceBytes).digest("hex"),hash=createHash("sha256").update(evidenceBytes).digest("hex");
 db.raw.prepare("INSERT INTO workspace_members(user_id,enabled,granted_by,created_at,updated_at) VALUES('employee',0,'TEST-owner',?,?)").run(time,time);
 function person(id:string){
  db.raw.prepare("INSERT INTO hrm_people(id,employee_code,user_id,legal_name,actor_id,created_at,updated_at) VALUES(?,?,?,'TEST Employee','TEST-author',?,?)").run(id,"TEST-"+id,id==="person"?"employee":null,time,time);
  db.raw.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,started_on,ended_on,actor_id,created_at,updated_at) VALUES(?,?,'TEST entity','ended','2026-01-01','2026-01-31','TEST-author',?,?)").run(id+"-employment",id,time,time);
  return String(db.raw.prepare("SELECT id FROM hrm_offboarding_cases WHERE person_id=?").get(id)!.id);
 }
 const caseId=person("person"),otherCase=person("other");
 db.raw.prepare("INSERT INTO hrm_legal_templates(id,document_key,document_type,title_en,title_vi,created_by,updated_by,actor_id,created_at,updated_at) VALUES('source-template','TEST-CLOSEOUT-SOURCE','policy','TEST source','TEST nguồn','TEST-author','TEST-author','TEST-author',?,?)").run(time,time);
 db.raw.prepare(`INSERT INTO hrm_legal_files(id,object_key,kind,template_id,original_name,mime_type,size_bytes,checksum,state,uploaded_by,reviewed_by,reviewed_at,actor_id,created_at,updated_at) VALUES('source-file','hrm/legal/TEST-closeout-source.docx','docx_source','source-template','TEST.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',?,?,'reviewed','TEST-author','TEST-reviewer',?,'TEST-reviewer',?,?)`).run(sourceBytes.byteLength,sourceHash,time,time,time);
 db.raw.prepare(`INSERT INTO hrm_legal_template_versions(id,template_id,version_number,source_file_id,source_checksum,language,legal_entity,purpose,audience_json,requires_ack,signing_mode,state,created_by,created_at,reviewed_by,reviewed_at,updated_by,updated_at) VALUES('source-version','source-template',1,'source-file',?,'bilingual','TEST entity','TEST source','["active"]',1,'acknowledgement','reviewed','TEST-author',?,'TEST-reviewer',?,'TEST-reviewer',?)`).run(sourceHash,time,time,time);
 const checklist=[{key:"TEST_CHECK",title_en:"TEST check",title_vi:"TEST rà soát",instructions_en:"TEST inspect evidence",instructions_vi:"TEST xem chứng cứ",allow_not_applicable:false}];
 db.raw.prepare(`INSERT INTO hrm_closeout_policy_versions(id,policy_key,legal_entity,revision,title_en,title_vi,purpose,jurisdiction,source_version_id,source_checksum,checklist_json,allow_no_payroll,no_payroll_instructions,effective_from,effective_until,created_by,created_at,actor_id,updated_at) VALUES('policy','TEST-CLOSEOUT','TEST entity',1,'TEST closeout','TEST quyết toán','TEST only','TEST jurisdiction','source-version',?,?,1,'TEST independently reviewed no-payroll exemption requires proof','2020-01-01','2030-12-31','TEST-author',?,'TEST-author',?)`).run(sourceHash,JSON.stringify(checklist),time,time);
 db.raw.prepare("UPDATE hrm_closeout_policy_versions SET state='reviewed',reviewed_by='TEST-reviewer',reviewed_at=?,review_reason='TEST independent policy review' WHERE id='policy'").run(time);
 db.raw.prepare("UPDATE hrm_closeout_policy_versions SET state='active',activated_by='TEST-reviewer',activated_at=? WHERE id='policy'").run(time);
 function file(id="proof",scope=caseId,state="reviewed"){
  db.raw.prepare(`INSERT INTO hrm_closeout_files(id,case_id,object_key,original_name,size_bytes,checksum,state,uploaded_by,created_at,reviewed_by,reviewed_at,review_reason,actor_id,updated_at) VALUES(?,?,?,'TEST synthetic.pdf',?,?,?,'TEST-author',?,?,?,?, 'TEST-reviewer',?)`).run(id,scope,"hrm/closeout/"+scope+"/"+id,evidenceBytes.byteLength,hash,state,time,state==="reviewed"?"TEST-reviewer":null,state==="reviewed"?time:null,state==="reviewed"?"TEST independent PDF inspection":null,time);
 }
 file();
 const source=()=>Number(db.raw.prepare("SELECT revision FROM hrm_closeout_sources WHERE case_id=?").get(caseId)!.revision);
 const dossier=(id="dossier",revision=source(),checks=[{key:"TEST_CHECK",outcome:"verified",reason:"TEST inspected synthetic evidence",file_ids:["proof"]}],noPayrollEvidence=["proof"])=>{
  db.raw.prepare(`INSERT INTO hrm_closeout_dossiers(id,case_id,person_id,employment_id,employee_user_id,policy_id,source_revision,basis_json,basis_checksum,checks_json,no_payroll_evidence_json,prepared_by,prepared_at,actor_id,updated_at) VALUES(?,?,'person','person-employment','employee','policy',?,'{"TEST":"frozen basis"}',?,?,?,'TEST-author',?,'TEST-author',?)`).run(id,caseId,revision,hash,JSON.stringify(checks),JSON.stringify(noPayrollEvidence),time,time);
 };
 const link=(fileId="proof",id="dossier",checksum=hash)=>db.raw.prepare("INSERT INTO hrm_closeout_dossier_files(dossier_id,file_id,checksum) VALUES(?,?,?)").run(id,fileId,checksum);
 const row=(id="dossier")=>db.raw.prepare("SELECT * FROM hrm_closeout_dossiers WHERE id=?").get(id)!;
 const approve=(id="dossier",reviewer="TEST-reviewer")=>db.raw.prepare("UPDATE hrm_closeout_dossiers SET state='approved',reviewed_by=?,reviewed_at=?,review_reason='TEST independent review',actor_id=?,updated_at=?,version=version+1 WHERE id=?").run(reviewer,time,reviewer,time,id);
 function apply(){
  db.raw.prepare("UPDATE hrm_closeout_dossiers SET state='applied',applied_by='TEST-reviewer',applied_at=?,actor_id='TEST-reviewer',updated_at=?,version=version+1 WHERE id='dossier'").run(time,time);
  db.raw.prepare("UPDATE hrm_offboarding_tasks SET state='completed',completion_note='TEST completed',completed_by='TEST-reviewer',completed_at=?,version=version+1 WHERE case_id=?").run(time,caseId);
  db.raw.prepare("UPDATE hrm_offboarding_cases SET state='completed',completed_by='TEST-reviewer',completed_at=?,version=version+1 WHERE id=?").run(time,caseId);
 }
 return {db,time,hash,sourceHash,sourceBytes,evidenceBytes,caseId,otherCase,source,dossier,link,row,approve,apply,file,close(){db.raw.close()}};
}
