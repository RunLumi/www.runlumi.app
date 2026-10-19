import test from "node:test";
import assert from "node:assert/strict";
import { financialRetentionFixture } from "./support/financial-retention-fixture.ts";
import { financialRetentionPanel } from "../src/lib/hrm/financial-retention-pages.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { createFinancialDispositionRequest, executeFinancialDossierDisposition, reviewFinancialDispositionRequest } from "../src/lib/hrm/financial-disposition.ts";

test("general HR reviewers do not load any financial metadata",async()=>{
 const denied=new Proxy({},{get(){throw new Error("TEST financial query leaked")}}) as D1Database;
 const officer=makeUser({id:"TEST-officer",name:"TEST officer",email:"officer@example.test"},false,["hr_officer"]);
 assert.equal(await financialRetentionPanel(denied,denied,{} as R2Bucket,officer,new URL("https://example.test/hrm/retention")),null);
});

test("financial panel has bounded case/target cursors and cannot use a selected subject's own case",async()=>{
 const f=await financialRetentionFixture();try{
  await f.dossier("dossier");
  const url=new URL("https://example.test/hrm/retention");url.searchParams.set("financial_case",f.caseId);
  const page=await financialRetentionPanel(f.db,f.content,f.bucket,f.author,url);assert.ok(page);
  assert.equal(page.selected?.id,f.caseId);assert.deepEqual(page.targets.map(t=>[t.kind,t.control,t.eligible]),[["dossier","live",true],["file","live",true]]);
  assert.ok(page.activePolicies.some(p=>p.id===f.policyId));
  url.searchParams.set("financial_policy","TEST-DISP");assert.equal((await financialRetentionPanel(f.db,f.content,f.bucket,f.author,url))!.activePolicies.length,1);
  url.searchParams.set("financial_policy","%");assert.equal((await financialRetentionPanel(f.db,f.content,f.bucket,f.author,url))!.activePolicies.length,0,"policy wildcards are literal, not an unbounded search");
  url.searchParams.delete("financial_policy");
  url.searchParams.set("financial_targets_after","dossier:dossier");
  const next=await financialRetentionPanel(f.db,f.content,f.bucket,f.author,url);assert.deepEqual(next!.targets.map(t=>t.kind),["file"]);
  url.searchParams.set("financial_targets_after","bad:cursor");await assert.rejects(financialRetentionPanel(f.db,f.content,f.bucket,f.author,url),{message:"invalid_field"});
  url.searchParams.delete("financial_targets_after");f.db.raw.prepare("UPDATE hrm_people SET user_id=?,version=version+1 WHERE id='person'").run(f.author.id);
  await assert.rejects(financialRetentionPanel(f.db,f.content,f.bucket,f.author,url),{message:"report_account_unavailable"});
 }finally{f.close()}
});

test("closed financial panel shows policy configuration without loading employee cases",async()=>{
 const f=await financialRetentionFixture();try{
  f.db.raw.exec("UPDATE hrm_settings SET enabled=0,version=version+1");
  const user={...f.author,hrmEnabled:false},url=new URL("https://example.test/hrm/retention");
  const panel=await financialRetentionPanel(f.db,f.content,f.bucket,user,url);assert.ok(panel);assert.equal(panel.policies.length,1);assert.deepEqual(panel.cases,[]);assert.deepEqual(panel.targets,[]);
  url.searchParams.set("financial_case",f.caseId);await assert.rejects(financialRetentionPanel(f.db,f.content,f.bucket,user,url),{message:"hrm_closed"});
 }finally{f.close()}
});

test("dossier redaction queue reads the original independent control after private JSON has been cleared",async()=>{
 const f=await financialRetentionFixture();try{
  const dossier=await f.dossier("dossier");f.approve();f.apply();
  const requestId=await createFinancialDispositionRequest(f.db,f.content,f.bucket,f.author,"TEST-panel-dossier-request",{caseId:f.caseId,targetKind:"dossier",targetId:dossier.id,targetVersion:Number(f.row().version),policyId:f.policyId,reason:"TEST assessed scope",confirmed:true});
  await reviewFinancialDispositionRequest(f.db,f.content,f.bucket,f.reviewer,"TEST-panel-dossier-review",{caseId:f.caseId,requestId,version:1,approve:true,reason:"TEST assessment",confirmed:true});
  await executeFinancialDossierDisposition(f.db,f.content,f.bucket,f.executor,"TEST-panel-dossier-execute",{caseId:f.caseId,requestId,version:2,confirmed:true});
  const url=new URL("https://example.test/hrm/retention");url.searchParams.set("financial_case",f.caseId);
  const panel=await financialRetentionPanel(f.db,f.content,f.bucket,f.author,url);assert.ok(panel);
  assert.equal(panel.requests[0].control,"erased");assert.equal(panel.requests[0].state,"completed");assert.equal(panel.targets.find(t=>t.id==="dossier")?.eligible,false);
 }finally{f.close()}
});
