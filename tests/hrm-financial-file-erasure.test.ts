import test from "node:test";
import assert from "node:assert/strict";
import { financialRetentionFixture } from "./support/financial-retention-fixture.ts";
import { createFinancialDispositionRequest, executeFinancialFileDisposition, reviewFinancialDispositionRequest, type FinancialDispositionRequest } from "../src/lib/hrm/financial-disposition.ts";
import { actOnFinancialRetentionPolicy } from "../src/lib/hrm/financial-retention-policies.ts";
import { createLegalHold } from "../src/lib/hrm/retention.ts";
import { readFinancialControl, requireLiveFinancialControl } from "../src/lib/hrm/financial-control.ts";

async function fixture(applied=false){
 const f=await financialRetentionFixture();
 if(applied){await f.dossier("dossier");f.approve();f.apply()}
 const requestId=await createFinancialDispositionRequest(f.db,f.content,f.bucket,f.author,"TEST-file-erasure-request",{caseId:f.caseId,targetKind:"file",targetId:"proof",targetVersion:Number(f.file().version),policyId:f.policyId,reason:"TEST scope and applicability assessed",confirmed:true});
 await reviewFinancialDispositionRequest(f.db,f.content,f.bucket,f.reviewer,"TEST-file-erasure-review",{caseId:f.caseId,requestId,version:1,approve:true,reason:"TEST independent disposition assessment",confirmed:true});
 const request=()=>f.db.raw.prepare("SELECT * FROM hrm_financial_disposition_requests WHERE id=?").get(requestId)!;
 const execute=(key="TEST-file-erasure-execute",user=f.executor,db:D1Database=f.db)=>executeFinancialFileDisposition(db,f.content,f.bucket,user,key,{caseId:f.caseId,requestId,version:Number(request().version),confirmed:true});
 return {...f,requestId,request,execute};
}

test("authorized financial PDF expiry preserves an applied historical case and its revoked access",async()=>{
 const f=await fixture(true);try{
  const before={...f.row()},revision=f.source(),objectKey=String(f.file().object_key);
  await f.execute();assert.equal(f.objects.has(objectKey),false);assert.equal(f.request().state,"completed");
  assert.equal(f.request().completed_by,f.executor.id);assert.ok(f.file().object_deleted_at);
  assert.equal((await readFinancialControl(f.bucket,f.fileTarget)).value.phase,"erased");
  assert.equal(f.row().state,"applied");assert.equal(f.row().basis_json,before.basis_json);assert.equal(f.row().reviewed_at,before.reviewed_at);
  assert.equal(f.source(),revision,"governed historical evidence expiry is not a new monetary source");
  assert.equal(f.db.raw.prepare("SELECT state FROM hrm_offboarding_cases WHERE id=?").get(f.caseId)!.state,"completed");
  assert.equal(f.db.raw.prepare("SELECT enabled FROM workspace_members WHERE user_id='employee'").get()!.enabled,0);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM hrm_financial_disposition_execution_scope").get()!.n,0);
  await f.execute("TEST-file-erasure-replay");assert.equal(f.request().state,"completed");
 }finally{f.close()}
});

test("storage failure stays retryable and holds or policy retirement cannot overwrite a reserved erasure",async()=>{
 const f=await fixture();try{
  const remove=f.bucket.delete.bind(f.bucket);let calls=0;
  f.bucket.delete=async()=>{calls++;throw new Error("TEST storage unavailable")};
  await assert.rejects(f.execute(),{message:"financial_disposition_retryable"});
  assert.equal(calls,1);assert.equal(f.request().state,"retryable");assert.equal(f.file().disposition_state,"deleting");assert.equal(f.file().object_deleted_at,null);
  assert.equal((await readFinancialControl(f.bucket,f.fileTarget)).value.phase,"erasing");
  await assert.rejects(createLegalHold(f.db,f.author,"TEST-late-financial-person-hold",{scope_kind:"person",person_id:"person",category:"*",reason:"TEST late hold cannot be reported as applied"}),{message:"financial_disposition_in_progress"});
  const policy=f.db.raw.prepare("SELECT version FROM hrm_financial_retention_policy_versions WHERE id=?").get(f.policyId)!;
  await assert.rejects(actOnFinancialRetentionPolicy(f.db,f.content,f.bucket,f.reviewer,"TEST-policy-retire-during-erasure",{policyId:f.policyId,version:Number(policy.version),action:"retire",reason:"TEST cannot retire reserved policy"}),{message:"financial_disposition_in_progress"});
  f.bucket.delete=async key=>{calls++;await remove(key)};
  await f.execute("TEST-file-erasure-retry");assert.equal(calls,2);assert.equal(f.request().state,"completed");
 }finally{f.close()}
});

test("a promoted requester or reviewer is rejected before any financial payload delete",async()=>{
 for(const who of ["author","reviewer"] as const){const f=await fixture();try{
  f.content.raw.prepare("UPDATE users SET role=50 WHERE id=?").run(f[who].id);
  let calls=0;f.bucket.delete=async()=>{calls++};
  await assert.rejects(f.execute("TEST-promoted-file-erasure",f[who]),{message:"retention_executor_must_differ"});
  assert.equal(calls,0);assert.equal(f.request().state,"approved");assert.equal(f.file().object_deleted_at,null);
 }finally{f.close()}}
});

test("confirmed R2 erasure can settle its metadata after a D1 outage while HRM remains closed",async()=>{
 const f=await fixture();try{
  let batches=0;const flaky={...f.db,async batch(statements:D1PreparedStatement[]){if(++batches===2)throw new Error("TEST D1 completion unavailable");return f.db.batch(statements)}} as D1Database;
  await assert.rejects(f.execute("TEST-file-erasure-d1-failure",f.executor,flaky),{message:"financial_disposition_retryable"});
  assert.equal(f.request().state,"retryable");assert.equal(f.file().object_deleted_at,null);
  assert.equal((await readFinancialControl(f.bucket,f.fileTarget)).value.phase,"erased");
  f.db.raw.exec("UPDATE hrm_settings SET enabled=0,version=version+1");
  let deletes=0;f.bucket.delete=async()=>{deletes++;throw new Error("TEST no new deletion during settlement")};
  await f.execute("TEST-file-erasure-settle",{...f.executor,hrmEnabled:false});
  assert.equal(deletes,0);assert.equal(f.request().state,"completed");assert.ok(f.file().object_deleted_at);
  assert.equal(f.db.raw.prepare("SELECT enabled FROM hrm_settings WHERE id=1").get()!.enabled,0);
 }finally{f.close()}
});

test("a genuine financial identity change during erasure still reopens review without restoring access",async()=>{
 const f=await fixture(true);try{
  const remove=f.bucket.delete.bind(f.bucket);
  f.bucket.delete=async key=>{await remove(key);f.db.raw.prepare("UPDATE hrm_people SET legal_name='TEST corrected financial identity',version=version+1,actor_id=?,updated_at=? WHERE id='person'").run(f.reviewer.id,new Date().toISOString())};
  await f.execute();assert.equal(f.request().state,"completed");assert.equal(f.row().state,"invalidated");
  assert.equal(f.db.raw.prepare("SELECT state FROM hrm_offboarding_cases WHERE id=?").get(f.caseId)!.state,"open");
  assert.equal(f.db.raw.prepare("SELECT enabled FROM workspace_members WHERE user_id='employee'").get()!.enabled,0);
  await assert.rejects(requireLiveFinancialControl(f.bucket,f.fileTarget),{message:"financial_data_disposed"});
 }finally{f.close()}
});

test("an inconsistent completed request cannot stand in for a matching D1 file tombstone",async()=>{
 const f=await fixture();try{
  let batches=0;const flaky={...f.db,async batch(statements:D1PreparedStatement[]){if(++batches===2)throw new Error("TEST D1 completion unavailable");return f.db.batch(statements)}} as D1Database;
  await assert.rejects(f.execute("TEST-inconsistent-erasure-start",f.executor,flaky),{message:"financial_disposition_retryable"});
  const erased=(await readFinancialControl(f.bucket,f.fileTarget)).value.erasure!;
  assert.equal(f.file().object_deleted_at,null);
  // Model an inconsistent/selective restore. A completed request alone cannot
  // prove that the file metadata was reconciled with the irreversible R2 fact.
  f.db.raw.prepare("UPDATE hrm_financial_disposition_requests SET state='completed',completed_by=?,completed_at=?,version=version+1 WHERE id=?").run(erased.completedBy!,erased.completedAt!,f.requestId);
  let deletes=0;f.bucket.delete=async()=>{deletes++};
  await assert.rejects(f.execute("TEST-inconsistent-erasure-check"),{message:"financial_disposition_changed"});
  assert.equal(f.file().object_deleted_at,null);assert.equal(deletes,0);
 }finally{f.close()}
});

test("a lost D1 completion response settles only after readback proves both committed facts",async()=>{
 const f=await fixture();try{
  let batches=0;const ambiguous={...f.db,async batch(statements:D1PreparedStatement[]){const result=await f.db.batch(statements);if(++batches===2)throw new Error("TEST response lost after commit");return result}} as D1Database;
  await f.execute("TEST-erasure-ambiguous-commit",f.executor,ambiguous);
  const marker=(await readFinancialControl(f.bucket,f.fileTarget)).value;
  assert.equal(f.request().state,"completed");assert.equal(f.file().disposition_state,"completed");
  assert.equal(f.file().object_deleted_at,marker.erasure?.completedAt);assert.equal(f.request().completed_at,marker.erasure?.completedAt);
  assert.equal(f.objects.has(String(f.file().object_key)),false);
 }finally{f.close()}
});
