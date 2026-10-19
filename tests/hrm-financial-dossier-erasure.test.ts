import test from "node:test";
import assert from "node:assert/strict";
import { financialRetentionFixture } from "./support/financial-retention-fixture.ts";
import { createFinancialDispositionRequest, executeFinancialDossierDisposition, reviewFinancialDispositionRequest } from "../src/lib/hrm/financial-disposition.ts";
import { closeoutDossierControlTarget } from "../src/lib/hrm/closeout-dossiers.ts";
import { readFinancialControl } from "../src/lib/hrm/financial-control.ts";

async function fixture(){
 const f=await financialRetentionFixture();await f.dossier("dossier");f.approve();f.apply();
 const original={...f.row()},target=await closeoutDossierControlTarget(original);
 const requestId=await createFinancialDispositionRequest(f.db,f.content,f.bucket,f.author,"TEST-dossier-erasure-request",{caseId:f.caseId,targetKind:"dossier",targetId:"dossier",targetVersion:Number(original.version),policyId:f.policyId,reason:"TEST reviewed applicability",confirmed:true});
 await reviewFinancialDispositionRequest(f.db,f.content,f.bucket,f.reviewer,"TEST-dossier-erasure-review",{caseId:f.caseId,requestId,version:1,approve:true,reason:"TEST independent assessment",confirmed:true});
 const request=()=>f.db.raw.prepare("SELECT * FROM hrm_financial_disposition_requests WHERE id=?").get(requestId)!;
 const execute=(key="TEST-dossier-erasure-execute",user=f.executor,db:D1Database=f.db)=>executeFinancialDossierDisposition(db,f.content,f.bucket,user,key,{caseId:f.caseId,requestId,version:Number(request().version),confirmed:true});
 return {...f,original,target,requestId,request,execute};
}

test("dossier disposition removes private fields and exact reason copies while preserving historical approval",async()=>{
 const f=await fixture();try{
  const revision=f.source();await f.execute();const saved=f.row();
  assert.equal(saved.basis_json,"{}");assert.equal(saved.checks_json,"[]");assert.equal(saved.no_payroll_evidence_json,"[]");
  assert.equal(saved.review_reason,"Disposed under approved retention");assert.equal(saved.payload_disposition_state,"completed");
  assert.equal(saved.payload_disposed_checksum,f.request().target_checksum);assert.ok(saved.payload_disposed_at);
  for(const field of ["state","basis_checksum","prepared_by","prepared_at","reviewed_by","reviewed_at","applied_by","applied_at"] as const)assert.equal(saved[field],f.original[field],field);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM hrm_closeout_events WHERE dossier_id='dossier' AND event_type IN ('approved','rejected','applied') AND json_type(detail_json,'$.reason') IS NOT NULL").get()!.n,0);
  assert.equal(f.source(),revision);assert.equal(f.db.raw.prepare("SELECT state FROM hrm_offboarding_cases WHERE id=?").get(f.caseId)!.state,"completed");
  assert.equal(f.db.raw.prepare("SELECT enabled FROM workspace_members WHERE user_id='employee'").get()!.enabled,0);
  assert.equal((await readFinancialControl(f.bucket,f.target)).value.phase,"erased");
  assert.equal(f.objects.has(`hrm/closeout/${f.caseId}/proof`),true,"dossier expiry does not erase separately governed PDF");
  await f.execute("TEST-dossier-erasure-replay");assert.equal(f.request().state,"completed");
  assert.throws(()=>f.db.raw.exec("UPDATE hrm_closeout_dossiers SET basis_json='{\"restored\":true}' WHERE id='dossier'"),/immutable_history/);
  assert.throws(()=>f.db.raw.exec("UPDATE hrm_closeout_events SET detail_json='{}' WHERE dossier_id='dossier'"),/immutable_history/);
 }finally{f.close()}
});

test("failed D1 redaction remains retryable without a false erased control or lost approval",async()=>{
 const f=await fixture();try{
  let batches=0;const flaky={...f.db,async batch(statements:D1PreparedStatement[]){if(++batches===2)throw new Error("TEST D1 redaction unavailable");return f.db.batch(statements)}} as D1Database;
  await assert.rejects(f.execute("TEST-dossier-d1-failure",f.executor,flaky),{message:"financial_disposition_retryable"});
  assert.equal(f.row().basis_json,f.original.basis_json);assert.equal(f.row().state,"applied");assert.equal(f.row().payload_disposition_state,"deleting");
  assert.throws(()=>f.db.raw.exec("UPDATE hrm_closeout_dossiers SET state='applied' WHERE id='dossier'"),/financial_disposition_changed/);
  assert.equal(f.request().state,"retryable");assert.equal((await readFinancialControl(f.bucket,f.target)).value.phase,"erasing");
  await f.execute("TEST-dossier-d1-retry");assert.equal(f.row().basis_json,"{}");assert.equal(f.request().state,"completed");
 }finally{f.close()}
});

test("R2 completion outage after proven D1 redaction permits only control reconciliation while closed",async()=>{
 const f=await fixture();try{
  const put=f.bucket.put.bind(f.bucket);f.bucket.put=async(...args)=>{
   if(typeof args[1]==="string"&&JSON.parse(args[1]).phase==="erased")throw new Error("TEST control outage");return put(...args);
  };
  await assert.rejects(f.execute(),{message:"financial_disposition_retryable"});
  assert.equal(f.row().basis_json,"{}");assert.equal(f.request().state,"completed");assert.equal((await readFinancialControl(f.bucket,f.target)).value.phase,"erasing");
  f.bucket.put=put;f.db.raw.exec("UPDATE hrm_settings SET enabled=0,version=version+1");
  const version=f.row().version;await f.execute("TEST-dossier-control-settle",{...f.executor,hrmEnabled:false});
  assert.equal(f.row().version,version,"control-only retry cannot rewrite payload or historic metadata");
  assert.equal((await readFinancialControl(f.bucket,f.target)).value.phase,"erased");
 }finally{f.close()}
});

test("requester and reviewer promoted to System Admin cannot perform dossier redaction",async()=>{
 for(const who of ["author","reviewer"] as const){const f=await fixture();try{
  f.content.raw.prepare("UPDATE users SET role=50 WHERE id=?").run(f[who].id);
  await assert.rejects(f.execute("TEST-dossier-promoted-executor",f[who]),{message:"retention_executor_must_differ"});
  assert.equal(f.row().basis_json,f.original.basis_json);assert.equal(f.request().state,"approved");
  assert.equal((await readFinancialControl(f.bucket,f.target)).value.phase,"live");
 }finally{f.close()}}
});
