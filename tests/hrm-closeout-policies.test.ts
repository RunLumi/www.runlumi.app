import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./support/d1-sqlite.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { actOnCloseoutPolicy, createCloseoutPolicy, listCloseoutPolicies, parseCloseoutChecks, type CloseoutPolicyInput } from "../src/lib/hrm/closeout-policies.ts";
function fixture(){
 const db=sqliteD1(),content=sqliteD1("content"),time=new Date().toISOString(),checksum="a".repeat(64);
 const actor=(id:string,roles:Parameters<typeof makeUser>[2])=>({...makeUser({id,name:id,email:id+"@example.test"},false,roles),hrmEnabled:false});
 const author=actor("closeout_author",["hrm_admin"]),approver=actor("closeout_approver",["hrm_admin"]),officer=actor("closeout_officer",["hrm_officer"]),employee=actor("closeout_employee",["employee"]);
 for(const user of [author,approver,officer,employee]){
  db.raw.prepare("INSERT INTO workspace_members(user_id,granted_by,created_at,updated_at) VALUES(?,'test-owner',?,?)").run(user.id,time,time);
  for(const role of user.roles)db.raw.prepare("INSERT INTO workspace_roles(user_id,role,granted_by,granted_at) VALUES(?,?,'test-owner',?)").run(user.id,role,time);
  content.raw.prepare("INSERT INTO users(id,email,name) VALUES(?,?,?)").run(user.id,user.email,user.name);
 }
 db.raw.prepare("UPDATE hrm_settings SET legal_entity='TEST entity' WHERE id=1").run();
 db.raw.prepare("INSERT INTO hrm_legal_templates(id,document_key,document_type,title_en,title_vi,created_by,updated_by,actor_id,created_at,updated_at) VALUES('report_legal','TEST-REPORT','policy','TEST source','TEST nguồn',?,?,?,?,?)").run(author.id,author.id,author.id,time,time);
 db.raw.prepare(`INSERT INTO hrm_legal_files(id,object_key,kind,template_id,original_name,mime_type,size_bytes,checksum,state,uploaded_by,reviewed_by,reviewed_at,actor_id,created_at,updated_at)
 VALUES('report_docx','hrm/legal/TEST-report.docx','docx_source','report_legal','TEST.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',100,?,'reviewed',?,?,?,?,?,?)`).run(checksum,author.id,approver.id,time,approver.id,time,time);
 db.raw.prepare(`INSERT INTO hrm_legal_template_versions(id,template_id,version_number,source_file_id,source_checksum,language,legal_entity,purpose,audience_json,requires_ack,signing_mode,state,created_by,created_at,reviewed_by,reviewed_at,updated_by,updated_at)
 VALUES('report_source','report_legal',1,'report_docx',?,'bilingual','TEST entity','TEST synthetic policy','["active"]',1,'acknowledgement','reviewed',?,?,?,?,?,?)`).run(checksum,author.id,time,approver.id,time,approver.id,time);
 const checks=[{key:"TEST_REVIEW",title_en:"TEST review",title_vi:"TEST rà soát",instructions_en:"TEST inspect evidence",instructions_vi:"TEST xem chứng cứ",allow_not_applicable:false}];
 const input:CloseoutPolicyInput={policyKey:"TEST-CLOSEOUT",titleEn:"TEST final review",titleVi:"TEST quyết toán",purpose:"TEST synthetic review",jurisdiction:"TEST owner supplied scope",sourceVersionId:"report_source",checks,allowNoPayroll:false,noPayrollInstructions:null,effectiveFrom:"2026-01-01",effectiveUntil:"2030-12-31"};
 const row=(id:string)=>db.raw.prepare("SELECT * FROM hrm_closeout_policy_versions WHERE id=?").get(id)!;
 const create=(key="TEST-closeout-create",value=input)=>createCloseoutPolicy(db,content,author,key,value);
 const action=(id:string,action:"approve"|"reject"|"activate"|"retire",key="TEST-closeout-"+action,actor=approver,version=Number(row(id).version))=>actOnCloseoutPolicy(db,content,actor,key,{policyId:id,version,action,reason:"TEST independent decision"});
 return {db,content,author,approver,officer,employee,input,checks,row,create,action,close(){db.raw.close();content.raw.close()}};
}

test("closeout policy configuration stays closed and requires an independently reviewed DOCX before activation",async()=>{
 const f=fixture();try{
  const id=await f.create();assert.equal(await f.create(),id);assert.equal(f.row(id).state,"draft");
  await assert.rejects(f.action(id,"approve","TEST-closeout-self",f.author),{message:"self_approval"});
  await f.action(id,"approve");const input={policyId:id,version:2,action:"activate" as const,reason:"TEST independent decision"};
  await actOnCloseoutPolicy(f.db,f.content,f.approver,"TEST-closeout-activate",input);
  await actOnCloseoutPolicy(f.db,f.content,f.approver,"TEST-closeout-activate",input);
  assert.equal(f.row(id).state,"active");assert.equal(f.row(id).reviewed_by,f.approver.id);
  assert.equal(f.db.raw.prepare("SELECT enabled FROM hrm_settings").get()?.enabled,0);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_offboarding_tasks").get()?.n,0);
  assert.equal((await listCloseoutPolicies(f.db,f.author)).length,1);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_closeout_policy_events WHERE event_type='activate'").get()?.n,1);
 }finally{f.close()}
});

test("closeout checklists require unique bounded keys, both languages, explicit exemption choice and no executable extra fields",()=>{
 const f=fixture();try{
  assert.deepEqual(parseCloseoutChecks(f.checks),f.checks);
  for(const checks of [[],Array(31).fill(f.checks[0]),[f.checks[0],f.checks[0]],[{...f.checks[0],title_vi:""}],[{...f.checks[0],instructions_en:""}],[{...f.checks[0],allow_not_applicable:"false"}],[{...f.checks[0],sql:"SELECT 1"}],[{...f.checks[0],key:"unsafe()"}]])assert.throws(()=>parseCloseoutChecks(checks));
 }finally{f.close()}
});

test("missing or quarantined sources block approval; storage rejects self-review and checksum changes",async()=>{
 for(const mutation of ["UPDATE hrm_legal_files SET state='quarantined' WHERE id='report_docx'","UPDATE hrm_legal_files SET object_deleted_at='2026-01-01' WHERE id='report_docx'"]){
  const f=fixture();try{const id=await f.create();f.db.raw.exec(mutation);await assert.rejects(f.action(id,"approve"),{message:"closeout_policy_source_invalid"});assert.equal(f.row(id).state,"draft")}finally{f.close()}
 }
 const f=fixture();try{
  assert.throws(()=>f.db.raw.exec("UPDATE hrm_legal_files SET reviewed_by=uploaded_by WHERE id='report_docx'"),/CHECK constraint/);
  assert.throws(()=>f.db.raw.exec("UPDATE hrm_legal_files SET checksum='changed' WHERE id='report_docx'"),/immutable/);
  const missing=await f.create("TEST-closeout-nosource",{...f.input,sourceVersionId:null});await assert.rejects(f.action(missing,"approve"),{message:"closeout_policy_source_invalid"});
  await assert.rejects(f.create("TEST-closeout-badsource",{...f.input,sourceVersionId:"other-entity-source"}),{message:"closeout_policy_source_invalid"});
 }finally{f.close()}
});

test("no payroll is unknown: exemption permission requires instructions, never a seeded waiver",async()=>{
 const f=fixture();try{
  await assert.rejects(f.create("TEST-closeout-no-instructions",{...f.input,allowNoPayroll:true,noPayrollInstructions:null}),{message:"closeout_policy_invalid"});
  const id=await f.create();assert.equal(f.row(id).allow_no_payroll,0);assert.equal(f.row(id).no_payroll_instructions,null);
  const explicit=await f.create("TEST-closeout-explicit",{...f.input,allowNoPayroll:true,noPayrollInstructions:"TEST evidence required, independent review still mandatory"});
  assert.equal(f.row(explicit).allow_no_payroll,1);assert.equal(f.row(explicit).revision,2);
 }finally{f.close()}
});

test("policy definitions and decision history remain immutable across rollover",async()=>{
 const f=fixture();try{
  const a=await f.create();await f.action(a,"approve");await f.action(a,"activate");
  const b=await f.create("TEST-closeout-second",{...f.input,titleEn:"TEST revised terms"});await f.action(b,"approve","TEST-closeout-review-second");await f.action(b,"activate","TEST-closeout-activate-second");
  assert.equal(f.row(a).state,"retired");assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_closeout_policy_events WHERE policy_id=? AND event_type='retire'").get(a)?.n,1);assert.equal(f.row(b).state,"active");assert.equal(f.row(a).title_en,f.input.titleEn);
  for(const sql of ["UPDATE hrm_closeout_policy_versions SET checklist_json='[]' WHERE id=?","UPDATE hrm_closeout_policy_versions SET reviewed_by='other' WHERE id=?","DELETE FROM hrm_closeout_policy_versions WHERE id=?"])assert.throws(()=>f.db.raw.prepare(sql).run(a),/immutable_history/);
  assert.throws(()=>f.db.raw.exec("DELETE FROM hrm_closeout_policy_events"),/immutable_history/);
  await assert.rejects(f.action(a,"activate","TEST-closeout-reactivate",f.approver,3),{message:"conflict"});
 }finally{f.close()}
});

test("disabled EmDash accounts and revoked Workspace membership or roles cannot review",async()=>{
 for(const revoke of ["account","member","role"]){const f=fixture();try{
  const id=await f.create();
  if(revoke==="account")f.content.raw.prepare("UPDATE users SET disabled=1 WHERE id=?").run(f.approver.id);
  else if(revoke==="member")f.db.raw.prepare("UPDATE workspace_members SET enabled=0 WHERE user_id=?").run(f.approver.id);
  else f.db.raw.prepare("DELETE FROM workspace_roles WHERE user_id=?").run(f.approver.id);
  await assert.rejects(f.action(id,"approve"),{message:"closeout_account_unavailable"});assert.equal(f.row(id).state,"draft");
 }finally{f.close()}}
 const f=fixture();try{await assert.rejects(listCloseoutPolicies(f.db,f.officer),{message:"forbidden"});await assert.rejects(createCloseoutPolicy(f.db,f.content,f.employee,"TEST-closeout-forbidden",f.input),{message:"forbidden"})}finally{f.close()}
});

test("policy review atomically rechecks source evidence and current actor permissions",async()=>{
 for(const change of ["source","role"]){const f=fixture();try{
  const id=await f.create(),batch=f.db.batch.bind(f.db);
  f.db.batch=async statements=>{if(change==="source")f.db.raw.prepare("UPDATE hrm_legal_files SET state='quarantined' WHERE id='report_docx'").run();else f.db.raw.prepare("DELETE FROM workspace_roles WHERE user_id=?").run(f.approver.id);return batch(statements)};
  await assert.rejects(f.action(id,"approve"),{message:"conflict"});assert.equal(f.row(id).state,"draft");assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_closeout_policy_events WHERE event_type='approve'").get()?.n,0);
 }finally{f.close()}}
});


test("invalid or expired dates cannot approve terms and another legal entity cannot read or review them",async()=>{
 const f=fixture();try{
  for(const dates of [{effectiveFrom:"2026-02-30",effectiveUntil:"2026-03-01"},{effectiveFrom:"2026-04-01",effectiveUntil:"2026-03-01"}])await assert.rejects(f.create("TEST-closeout-bad-dates",{...f.input,...dates}));
  const expired=await f.create("TEST-closeout-expired",{...f.input,effectiveFrom:"2020-01-01",effectiveUntil:"2020-12-31"});await assert.rejects(f.action(expired,"approve"),{message:"closeout_policy_expired"});
  const id=await f.create();f.db.raw.exec("UPDATE hrm_settings SET legal_entity='TEST other entity',version=version+1 WHERE id=1");
  assert.equal((await listCloseoutPolicies(f.db,f.approver)).length,0);await assert.rejects(f.action(id,"approve"),{message:"not_found"});
 }finally{f.close()}
});


test("a source pending disposal cannot authorize closeout review",async()=>{
 const f=fixture();try{
  const id=await f.create(),time=new Date().toISOString();
  f.db.raw.prepare("INSERT INTO hrm_retention_policy_versions(id,version_number,rules_json,created_by,created_at,actor_id,updated_at) VALUES('TEST-retention',1,'[]',?,?,?,?)").run(f.author.id,time,f.author.id,time);
  f.db.raw.prepare(`INSERT INTO hrm_file_deletion_requests(id,source_table,source_file_id,category,object_key_snapshot,checksum_snapshot,file_version,policy_version_id,policy_version,retention_due_on,state,request_reason,requested_by,requested_at,actor_id,created_at,updated_at) VALUES('TEST-delete','hrm_legal_files','report_docx','legal_source','hrm/legal/TEST-report.docx',?,1,'TEST-retention',1,'2026-01-01','pending_review','TEST disposal',?,?,?,?,?)`).run("a".repeat(64),f.author.id,time,f.author.id,time,time);
  await assert.rejects(f.action(id,"approve"),{message:"closeout_policy_source_invalid"});assert.equal(f.row(id).state,"draft");
 }finally{f.close()}
});
