import test from "node:test";
import assert from "node:assert/strict";
import { closeoutFixture } from "./support/hrm-closeout-fixture.ts";
import { sqliteD1 } from "./support/d1-sqlite.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { actOnOffboardingTask } from "../src/lib/hrm/offboarding.ts";
import { command } from "../src/lib/hrm/service.ts";
import { downloadCloseoutFile, prepareCloseoutApplication, prepareCloseoutDossier, reviewCloseoutDossier, reopenCloseoutReview, reviewCloseoutFile, uploadCloseoutFile } from "../src/lib/hrm/closeout-dossiers.ts";

function fixture(){
 const f=closeoutFixture(),content=sqliteD1("content");
 const actor=(id:string)=>({...makeUser({id,name:id,email:id+"@example.test"},false,["hrm_admin"]),hrmEnabled:true});
 const author=actor("TEST-author"),reviewer=actor("TEST-reviewer");
 for(const user of [author,reviewer]){
  content.raw.prepare("INSERT INTO users(id,email,name) VALUES(?,?,?)").run(user.id,user.email,user.name);
  f.db.raw.prepare("INSERT INTO workspace_members(user_id,granted_by,created_at,updated_at) VALUES(?,'TEST-owner',?,?)").run(user.id,f.time,f.time);
  f.db.raw.prepare("INSERT INTO workspace_roles(user_id,role,granted_by,granted_at) VALUES(?,'hrm_admin','TEST-owner',?)").run(user.id,f.time);
 }
 f.db.raw.prepare("UPDATE hrm_settings SET enabled=1,legal_entity='TEST entity',purpose='TEST only',retention_policy='TEST only',policy_reference='TEST only',reviewed_by='TEST-owner',reviewed_at=? WHERE id=1").run(f.time);
 type Stored={bytes:Uint8Array;customMetadata:Record<string,string>};const objects=new Map<string,Stored>();
 const sourceKey="hrm/legal/TEST-closeout-source.docx",proofKey=`hrm/closeout/${f.caseId}/proof`;
 objects.set(sourceKey,{bytes:f.sourceBytes,customMetadata:{sha256:f.sourceHash}});objects.set(proofKey,{bytes:f.evidenceBytes,customMetadata:{checksum:f.hash,case_id:f.caseId}});
 const bucket={
  async head(key:string){const item=objects.get(key);return item?{size:item.bytes.byteLength,customMetadata:{...item.customMetadata}}:null},
  async get(key:string){const item=objects.get(key);return item?{size:item.bytes.byteLength,customMetadata:{...item.customMetadata},body:new Response(item.bytes).body}:null},
  async put(key:string,data:ArrayBuffer,options:{customMetadata:Record<string,string>}){objects.set(key,{bytes:new Uint8Array(data.slice(0)),customMetadata:{...options.customMetadata}});return {key}},
  async delete(key:string){objects.delete(key)},
 } as unknown as R2Bucket;
 const input=()=>({caseId:f.caseId,policyId:"policy",sourceRevision:f.source(),checks:[{key:"TEST_CHECK",outcome:"verified",reason:"TEST independent financial source inspection",file_ids:["proof"]}],noPayrollEvidence:["proof"]});
 const prepare=(key="TEST-dossier-prepare",value=input())=>prepareCloseoutDossier(f.db,content,bucket,author,key,value);
 const row=(id:string)=>f.db.raw.prepare("SELECT * FROM hrm_closeout_dossiers WHERE id=?").get(id)!;
 const review=(id:string,who=reviewer,key="TEST-dossier-review")=>reviewCloseoutDossier(f.db,content,bucket,who,key,{caseId:f.caseId,dossierId:id,version:Number(row(id).version),decision:"approve",reason:"TEST independent review of current sources",confirmed:true});
 return {...f,content,author,reviewer,bucket,objects,sourceKey,proofKey,input,prepare,row,review,close(){f.close();content.raw.close()}};
}

test("independent dossier review and application freeze real source references without silently restoring access",async()=>{
 const f=fixture();try{
  const id=await f.prepare();assert.equal(await f.prepare(),id);assert.equal(f.row(id).state,"prepared");
  await assert.rejects(f.review(id,f.author),{message:"self_approval"});await f.review(id);assert.equal(f.row(id).state,"approved");
  await assert.rejects(prepareCloseoutApplication(f.db,f.content,f.bucket,f.author,f.caseId,id,true),{message:"closeout_approval_required"});
  await assert.rejects(prepareCloseoutApplication(f.db,f.content,f.bucket,f.reviewer,f.caseId,id,false),{message:"confirmation_required"});
  const plan=await prepareCloseoutApplication(f.db,f.content,f.bucket,f.reviewer,f.caseId,id,true);
  await command(f.db,f.reviewer,"TEST-apply-closeout-plan","TEST_unit_apply",{id},id,plan.guards,plan.writes);
  assert.equal(f.row(id).state,"applied");assert.equal(f.row(id).applied_by,f.reviewer.id);assert.equal(f.db.raw.prepare("SELECT enabled FROM workspace_members WHERE user_id='employee'").get()?.enabled,0);
  assert.equal(f.db.raw.prepare("SELECT state FROM hrm_offboarding_cases WHERE id=?").get(f.caseId)?.state,"open","standalone plan application is not claimed to complete the real offboarding command");
 }finally{f.close()}
});

test("missing R2 policy/proof objects, a stale source or unavailable EmDash actor cannot approve",async()=>{
 for(const kind of ["source","proof","actor","revision"]){const f=fixture();try{
  const id=await f.prepare();
  if(kind==="source")f.objects.delete(f.sourceKey);if(kind==="proof")f.objects.delete(f.proofKey);
  if(kind==="actor")f.content.raw.prepare("UPDATE users SET disabled=1 WHERE id=?").run(f.reviewer.id);
  if(kind==="revision")f.db.raw.exec("UPDATE hrm_people SET legal_name='TEST corrected',version=version+1 WHERE id='person'");
  await assert.rejects(f.review(id));assert.notEqual(f.row(id).state,"approved");
 }finally{f.close()}}
});

test("an inquiry or pending bank change cannot be waived with no-payroll evidence",async()=>{
 const f=fixture();try{
  f.db.raw.prepare("INSERT INTO hrm_change_requests(id,person_id,record_id,kind,data,expected_version,state,submitted_by,actor_id,created_at,updated_at) VALUES('bank-change','person','','bank','{}',0,'submitted','employee','employee',?,?)").run(f.time,f.time);
  const id=await f.prepare();await assert.rejects(f.review(id),{message:"closeout_sources_unreconciled"});assert.equal(f.row(id).state,"prepared");
 }finally{f.close()}
});

test("current D1 membership is rechecked in the application transaction after preflight",async()=>{
 const f=fixture();try{
  const id=await f.prepare();await f.review(id);const plan=await prepareCloseoutApplication(f.db,f.content,f.bucket,f.reviewer,f.caseId,id,true);
  f.db.raw.prepare("UPDATE workspace_members SET enabled=0 WHERE user_id=?").run(f.reviewer.id);
  await assert.rejects(command(f.db,f.reviewer,"TEST-apply-revoked-actor","TEST_unit_apply",{id},id,plan.guards,plan.writes),{message:"conflict"});assert.equal(f.row(id).state,"approved");
 }finally{f.close()}
});

test("a source change after application preflight rejects the stale plan and retains the invalidation history",async()=>{
 const f=fixture();try{
  const id=await f.prepare();await f.review(id);const plan=await prepareCloseoutApplication(f.db,f.content,f.bucket,f.reviewer,f.caseId,id,true),original=f.row(id).basis_checksum;
  f.db.raw.exec("UPDATE hrm_employments SET location='TEST changed scope',version=version+1 WHERE id='person-employment'");
  await assert.rejects(command(f.db,f.reviewer,"TEST-apply-changed-source","TEST_unit_apply",{id},id,plan.guards,plan.writes),{message:"conflict"});assert.equal(f.row(id).state,"invalidated");assert.equal(f.row(id).basis_checksum,original);
 }finally{f.close()}
});

test("staff-only PDF upload requires independent review and delivers private/no-store bytes",async()=>{
 const f=fixture();try{
  const file=new File([f.evidenceBytes],"TEST real local bytes.pdf",{type:"application/pdf"});
  const id=await uploadCloseoutFile(f.db,f.content,f.bucket,f.author,"TEST-upload-financial-proof",f.caseId,file);assert.equal(await uploadCloseoutFile(f.db,f.content,f.bucket,f.author,"TEST-upload-financial-proof",f.caseId,file),id);
  const input={caseId:f.caseId,fileId:id,version:1,decision:"reviewed" as const,reason:"TEST human inspected synthetic PDF"};
  await assert.rejects(reviewCloseoutFile(f.db,f.content,f.bucket,f.author,"TEST-own-proof-review",input),{message:"self_approval"});
  await reviewCloseoutFile(f.db,f.content,f.bucket,f.reviewer,"TEST-independent-proof-review",input);
  const response=await downloadCloseoutFile(f.db,f.content,f.bucket,f.reviewer,f.caseId,id);assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(response.headers.get("content-type"),"application/pdf");assert.equal(response.headers.get("content-security-policy"),"sandbox");assert.deepEqual(new Uint8Array(await response.arrayBuffer()),f.evidenceBytes);
  const employee={...makeUser({id:"employee",name:"TEST Employee",email:"employee@example.test"},false,["employee"]),hrmEnabled:true};await assert.rejects(downloadCloseoutFile(f.db,f.content,f.bucket,employee,f.caseId,id),{message:"forbidden"});
 }finally{f.close()}
});

test("pending disposition, missing source coverage and another case's PDF cannot enter an approved dossier",async()=>{
 const f=fixture();try{
  f.file("other-proof",f.otherCase);const wrong={...f.input(),checks:[{key:"TEST_CHECK",outcome:"verified",reason:"TEST wrong scope",file_ids:["other-proof"]}]};await assert.rejects(f.prepare("TEST-prepare-other-proof",wrong),{message:"closeout_evidence_invalid"});
  f.db.raw.exec("UPDATE hrm_closeout_files SET disposition_state='pending_review' WHERE id='proof'");await assert.rejects(f.prepare(),{message:"closeout_evidence_invalid"});
 }finally{f.close()}
});


test("an explicit fresh-review request preserves historical approval and permits a replacement dossier without changing access",async()=>{
 const f=fixture();try{
  const id=await f.prepare();await f.review(id);const before={...f.row(id)},input={caseId:f.caseId,dossierId:id,version:Number(before.version),reason:"TEST newly discovered external evidence requires fresh review",confirmed:true};
  await reopenCloseoutReview(f.db,f.content,f.reviewer,"TEST-reopen-financial-review",input);await reopenCloseoutReview(f.db,f.content,f.reviewer,"TEST-reopen-financial-review",input);
  assert.equal(f.row(id).state,"invalidated");assert.equal(f.row(id).reviewed_at,before.reviewed_at);assert.equal(f.row(id).review_reason,before.review_reason);assert.equal(f.row(id).basis_json,before.basis_json);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_closeout_source_events WHERE source_kind='manual_review_reopened'").get()?.n,1);
  const event=f.db.raw.prepare("SELECT detail_json FROM hrm_closeout_events WHERE dossier_id=? AND event_type='invalidated'").get(id)!;assert.equal(JSON.parse(String(event.detail_json)).source_detail.reason,input.reason);
  const replacement=await f.prepare("TEST-prepare-fresh-dossier");await f.review(replacement,f.reviewer,"TEST-review-fresh-dossier");assert.equal(f.row(replacement).state,"approved");assert.equal(f.db.raw.prepare("SELECT enabled FROM workspace_members WHERE user_id='employee'").get()?.enabled,0);
 }finally{f.close()}
});


async function completeOtherTasks(f:ReturnType<typeof fixture>){
 const tasks=f.db.raw.prepare("SELECT * FROM hrm_offboarding_tasks WHERE case_id=? AND task_key!='payroll_closeout' AND state IN ('pending','blocked')").all(f.caseId);
 for(const task of tasks)await actOnOffboardingTask(f.db,f.content,f.author,"TEST-complete-"+String(task.task_key),f.caseId,String(task.id),Number(task.version),"complete","TEST verified nonfinancial handover and record custody",true);
 return f.db.raw.prepare("SELECT * FROM hrm_offboarding_tasks WHERE case_id=? AND task_key='payroll_closeout'").get(f.caseId)!;
}

test("the real offboarding command applies the approved dossier and closes the final case in one transaction",async()=>{
 const f=fixture();try{
  const id=await f.prepare();await f.review(id);const task=await completeOtherTasks(f);
  await actOnOffboardingTask(f.db,f.content,f.reviewer,"TEST-complete-financial-task",f.caseId,String(task.id),Number(task.version),"complete","TEST independently reviewed final financial dossier",true,{dossierId:id,bucket:f.bucket});
  assert.equal(f.row(id).state,"applied");assert.equal(f.db.raw.prepare("SELECT state FROM hrm_offboarding_cases WHERE id=?").get(f.caseId)?.state,"completed");assert.equal(f.db.raw.prepare("SELECT enabled FROM workspace_members WHERE user_id='employee'").get()?.enabled,0);
  f.db.raw.exec("UPDATE hrm_people SET legal_name='TEST corrected identity',version=version+1 WHERE id='person'");assert.equal(f.row(id).state,"invalidated");assert.equal(f.db.raw.prepare("SELECT state FROM hrm_offboarding_cases WHERE id=?").get(f.caseId)?.state,"open");assert.equal(f.db.raw.prepare("SELECT enabled FROM workspace_members WHERE user_id='employee'").get()?.enabled,0);
 }finally{f.close()}
});

test("failure after dossier application rolls it back with financial task and case closure",async()=>{
 const f=fixture();try{
  const id=await f.prepare();await f.review(id);const task=await completeOtherTasks(f);
  f.db.raw.exec("CREATE TRIGGER TEST_failure_after_dossier_write BEFORE UPDATE OF state ON hrm_offboarding_tasks WHEN NEW.task_key='payroll_closeout' AND NEW.state='completed' BEGIN SELECT RAISE(ABORT,'TEST_abort_final_task'); END");
  await assert.rejects(actOnOffboardingTask(f.db,f.content,f.reviewer,"TEST-failed-final-financial-task",f.caseId,String(task.id),Number(task.version),"complete","TEST atomic completion failure",true,{dossierId:id,bucket:f.bucket}),/TEST_abort_final_task/);
  assert.equal(f.row(id).state,"approved");assert.equal(f.row(id).applied_at,null);assert.equal(f.db.raw.prepare("SELECT state FROM hrm_offboarding_cases WHERE id=?").get(f.caseId)?.state,"open");assert.equal(f.db.raw.prepare("SELECT state FROM hrm_offboarding_tasks WHERE id=?").get(task.id)?.state,"blocked");assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_closeout_events WHERE event_type='applied'").get()?.n,0);
 }finally{f.close()}
});

test("EmDash revocation during evidence inspection is rechecked before approval",async()=>{
 const f=fixture();try{
  const id=await f.prepare(),head=f.bucket.head.bind(f.bucket);let revoked=false;
  f.bucket.head=async key=>{const result=await head(key);if(key===f.proofKey){revoked=true;f.content.raw.prepare("UPDATE users SET disabled=1 WHERE id=?").run(f.reviewer.id)}return result};
  await assert.rejects(f.review(id),{message:"closeout_account_unavailable"});assert.equal(revoked,true);assert.equal(f.row(id).state,"prepared");
 }finally{f.close()}
});

test("an upload whose actor is revoked before the metadata transaction cleans up its unused private R2 object",async()=>{
 const f=fixture();try{
  const put=f.bucket.put.bind(f.bucket),keys=[...f.objects.keys()].sort();
  f.bucket.put=async (...args)=>{const result=await put(...args);f.content.raw.prepare("UPDATE users SET disabled=1 WHERE id=?").run(f.author.id);return result};
  await assert.rejects(uploadCloseoutFile(f.db,f.content,f.bucket,f.author,"TEST-revoked-mid-upload",f.caseId,new File([f.evidenceBytes],"TEST.pdf",{type:"application/pdf"})),{message:"closeout_account_unavailable"});
  assert.deepEqual([...f.objects.keys()].sort(),keys);assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_closeout_files").get()?.n,1);
 }finally{f.close()}
});
