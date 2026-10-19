import test from "node:test";
import assert from "node:assert/strict";
import { financialRetentionFixture } from "./support/financial-retention-fixture.ts";
import { createFinancialDispositionRequest, reviewFinancialDispositionRequest } from "../src/lib/hrm/financial-disposition.ts";
import { createLegalHold, releaseLegalHold } from "../src/lib/hrm/retention.ts";
import { financialControlKey } from "../src/lib/hrm/financial-control.ts";

test("financial file disposition freezes exact target/policy/context and requires another financial reviewer",async()=>{
 const f=await financialRetentionFixture();try{
  const input={caseId:f.caseId,targetKind:"file" as const,targetId:"proof",targetVersion:Number(f.file().version),policyId:f.policyId,reason:"TEST assessed scope and policy applicability",confirmed:true};
  const id=await createFinancialDispositionRequest(f.db,f.content,f.bucket,f.author,"TEST-disposition-file-create",input);
  assert.equal(await createFinancialDispositionRequest(f.db,f.content,f.bucket,f.author,"TEST-disposition-file-create",input),id);
  const before=f.db.raw.prepare("SELECT * FROM hrm_financial_disposition_requests WHERE id=?").get(id)!;
  assert.equal(before.state,"pending_review");assert.equal(before.target_checksum,f.hash);assert.equal(before.control_checksum,f.hash);assert.equal(before.object_key_snapshot,`hrm/closeout/${f.caseId}/proof`);
  const review={caseId:f.caseId,requestId:id,version:Number(before.version),approve:true,reason:"TEST independent assessment",confirmed:true};
  await assert.rejects(reviewFinancialDispositionRequest(f.db,f.content,f.bucket,f.author,"TEST-disposition-self-review",review),{message:"self_approval"});
  await reviewFinancialDispositionRequest(f.db,f.content,f.bucket,f.reviewer,"TEST-disposition-file-review",review);
  const approved=f.db.raw.prepare("SELECT state,reviewed_by,started_by FROM hrm_financial_disposition_requests WHERE id=?").get(id)!;
  assert.deepEqual({...approved},{state:"approved",reviewed_by:f.reviewer.id,started_by:null});
  assert.ok(f.objects.has(`hrm/closeout/${f.caseId}/proof`),"request and review do not erase bytes");
 }finally{f.close()}
});

test("a newly placed hold blocks a queued request and releasing it requires a fresh target decision",async()=>{
 const f=await financialRetentionFixture();try{
  const input={caseId:f.caseId,targetKind:"file" as const,targetId:"proof",targetVersion:Number(f.file().version),policyId:f.policyId,reason:"TEST requested disposition",confirmed:true};
  const id=await createFinancialDispositionRequest(f.db,f.content,f.bucket,f.author,"TEST-disposition-held-create",input);
  const hold=await createLegalHold(f.db,f.author,"TEST-disposition-person-hold",{scope_kind:"person",person_id:"person",category:"*",reason:"TEST active preservation matter"});
  assert.equal(f.db.raw.prepare("SELECT state FROM hrm_financial_disposition_requests WHERE id=?").get(id)!.state,"blocked");
  await assert.rejects(createFinancialDispositionRequest(f.db,f.content,f.bucket,f.author,"TEST-disposition-held-again",{...input,targetVersion:Number(f.file().version)}),{message:"legal_hold_active"});
  await releaseLegalHold(f.db,f.reviewer,"TEST-disposition-hold-release",hold,1,"TEST independent release");
  assert.equal(f.db.raw.prepare("SELECT state FROM hrm_financial_disposition_requests WHERE id=?").get(id)!.state,"blocked");
  const fresh=await createFinancialDispositionRequest(f.db,f.content,f.bucket,f.author,"TEST-disposition-after-hold",{...input,targetVersion:Number(f.file().version)});assert.notEqual(fresh,id);
 }finally{f.close()}
});

test("dossier edits invalidate queued disposition and rejection does not require a missing source blob",async()=>{
 const f=await financialRetentionFixture();try{
  const row=await f.dossier(),input={caseId:f.caseId,targetKind:"dossier" as const,targetId:row.id,targetVersion:row.version,policyId:f.policyId,reason:"TEST dossier scope",confirmed:true};
  const id=await createFinancialDispositionRequest(f.db,f.content,f.bucket,f.author,"TEST-disposition-dossier-create",input);
  f.approve(row.id);
  assert.equal(f.db.raw.prepare("SELECT state FROM hrm_financial_disposition_requests WHERE id=?").get(id)!.state,"blocked");
  const fresh=await createFinancialDispositionRequest(f.db,f.content,f.bucket,f.author,"TEST-disposition-dossier-fresh",{...input,targetVersion:Number(f.row(row.id).version)});
  f.objects.delete("hrm/legal/TEST-closeout-source.docx");
  await reviewFinancialDispositionRequest(f.db,f.content,f.bucket,f.reviewer,"TEST-disposition-reject-no-source",{caseId:f.caseId,requestId:fresh,version:1,approve:false,reason:"TEST cannot establish applicability",confirmed:true});
  assert.equal(f.db.raw.prepare("SELECT state FROM hrm_financial_disposition_requests WHERE id=?").get(fresh)!.state,"rejected");
 }finally{f.close()}
});

test("late EmDash revocation during current control inspection prevents a queued request",async()=>{
 const f=await financialRetentionFixture();try{
  const get=f.bucket.get.bind(f.bucket),controlKey=financialControlKey("file",f.caseId,"proof");
  f.bucket.get=async(...args)=>{const result=await get(...args);if(args[0]===controlKey)f.content.raw.prepare("UPDATE users SET disabled=1 WHERE id=?").run(f.author.id);return result};
  await assert.rejects(createFinancialDispositionRequest(f.db,f.content,f.bucket,f.author,"TEST-disposition-revoked-create",{caseId:f.caseId,targetKind:"file",targetId:"proof",targetVersion:Number(f.file().version),policyId:f.policyId,reason:"TEST scope",confirmed:true}),{message:"report_account_unavailable"});
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM hrm_financial_disposition_requests").get()!.n,0);
 }finally{f.close()}
});
