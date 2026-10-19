import test from "node:test";
import assert from "node:assert/strict";
import { closeoutFixture } from "./support/hrm-closeout-fixture.ts";
import { sqliteD1 } from "./support/d1-sqlite.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { actOnFinancialRetentionPolicy, createFinancialRetentionPolicy, listFinancialRetentionPolicies, parseFinancialRetentionPolicy, type FinancialRetentionPolicyInput } from "../src/lib/hrm/financial-retention-policies.ts";

function fixture() {
  const f=closeoutFixture(),content=sqliteD1("content");
  const actor=(id:string,role:"hrm_admin"|"hrm_officer"="hrm_admin")=>({...makeUser({id,name:id,email:id+"@example.test"},false,[role]),hrmEnabled:false});
  const author=actor("TEST-retention-author"),reviewer=actor("TEST-retention-reviewer"),officer=actor("TEST-retention-officer","hrm_officer");
  for(const user of [author,reviewer,officer]){
    content.raw.prepare("INSERT INTO users(id,email,name) VALUES(?,?,?)").run(user.id,user.email,user.name);
    f.db.raw.prepare("INSERT INTO workspace_members(user_id,enabled,granted_by,created_at,updated_at) VALUES(?,1,'TEST-owner',?,?)").run(user.id,f.time,f.time);
    f.db.raw.prepare("INSERT INTO workspace_roles(user_id,role,granted_by,granted_at) VALUES(?,?,'TEST-owner',?)").run(user.id,[...user.roles][0],f.time);
  }
  f.db.raw.exec("UPDATE hrm_settings SET legal_entity='TEST entity',enabled=0");
  const bucket={async head(){return {size:f.sourceBytes.byteLength,customMetadata:{sha256:f.sourceHash}}}} as unknown as R2Bucket;
  const input:FinancialRetentionPolicyInput={policyKey:"TEST-RETENTION",titleEn:"TEST retention",titleVi:"TEST lưu trữ",purpose:"TEST synthetic policy only",sourceVersionId:"source-version",effectiveFrom:"2020-01-01",effectiveUntil:"2030-12-31",fileDays:null,fileAnchor:null,fileBasis:"TEST unconfigured; no scheduled file eligibility",dossierDays:null,dossierAnchor:null,dossierBasis:"TEST unconfigured; no scheduled dossier eligibility"};
  const create=(key="TEST-financial-policy-create",value=input)=>createFinancialRetentionPolicy(f.db,content,bucket,author,key,value);
  const row=(id:string)=>f.db.raw.prepare("SELECT * FROM hrm_financial_retention_policy_versions WHERE id=?").get(id)!;
  const act=(id:string,action:"approve"|"reject"|"activate"|"retire",who=reviewer,key=`TEST-financial-policy-${action}`)=>actOnFinancialRetentionPolicy(f.db,content,bucket,who,key,{policyId:id,version:Number(row(id).version),action,reason:"TEST independent policy decision"});
  return {...f,content,author,reviewer,officer,bucket,input,create,row,act,close(){f.close();content.raw.close()}};
}

test("financial policy configuration works while production is closed, never supplies a duration and needs an independent reviewer",async()=>{
  const f=fixture();try{
    const id=await f.create();assert.equal(await f.create(),id);assert.equal(f.row(id).file_days,null);assert.equal(f.row(id).dossier_days,null);
    await assert.rejects(f.act(id,"approve",f.author),{message:"self_approval"});
    await f.act(id,"approve");await f.act(id,"activate");assert.equal(f.row(id).state,"active");
    assert.equal(f.row(id).reviewed_by,f.reviewer.id);assert.ok(String(f.row(id).reviewed_at).endsWith("Z"));
    assert.equal(f.db.raw.prepare("SELECT enabled FROM hrm_settings WHERE id=1").get()!.enabled,0);
    assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM hrm_financial_disposition_requests").get()!.n,0);
    assert.equal((await listFinancialRetentionPolicies(f.db,f.content,f.reviewer)).items.length,1);
    await assert.rejects(listFinancialRetentionPolicies(f.db,f.content,f.officer),{message:"forbidden"});
    assert.throws(()=>f.db.raw.prepare("UPDATE hrm_financial_retention_policy_versions SET file_days=1,file_anchor='file_created' WHERE id=?").run(id),/immutable_history/);
  }finally{f.close()}
});

test("explicit anchors, dates and reviewed DOCX are required instead of invented applicability or defaults",async()=>{
  const f=fixture();try{
    assert.throws(()=>parseFinancialRetentionPolicy({...f.input,fileDays:1,fileAnchor:null}),{message:"financial_retention_invalid"});
    assert.throws(()=>parseFinancialRetentionPolicy({...f.input,fileDays:null,fileAnchor:"employment_ended"}),{message:"financial_retention_invalid"});
    assert.throws(()=>parseFinancialRetentionPolicy({...f.input,dossierDays:0,dossierAnchor:"dossier_prepared"}),{message:"financial_retention_invalid"});
    assert.throws(()=>parseFinancialRetentionPolicy({...f.input,effectiveFrom:"2030-01-01",effectiveUntil:"2029-12-31"}),{message:"financial_retention_invalid"});
    f.bucket.head=async()=>null;
    await assert.rejects(f.create(),{message:"financial_retention_source_required"});
    assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM hrm_financial_retention_policy_versions").get()!.n,0);
  }finally{f.close()}
});

test("policy rollover retains the old immutable definition and retirement event",async()=>{
  const f=fixture();try{
    const first=await f.create();await f.act(first,"approve");await f.act(first,"activate");
    const second=await f.create("TEST-financial-policy-second",{...f.input,fileDays:1,fileAnchor:"employment_ended",fileBasis:"TEST explicit synthetic period, not a legal duration"});
    await f.act(second,"approve",f.reviewer,"TEST-second-policy-review");await f.act(second,"activate",f.reviewer,"TEST-second-policy-activate");
    assert.equal(f.row(first).state,"retired");assert.equal(f.row(first).file_days,null);assert.equal(f.row(second).state,"active");
    const event=f.db.raw.prepare("SELECT detail_json FROM hrm_financial_retention_events WHERE policy_id=? AND event_type='replaced'").get(first)!;
    assert.equal(JSON.parse(String(event.detail_json)).replacementPolicyId,second);
    await assert.rejects(f.act(first,"approve",f.reviewer,"TEST-no-old-policy-revive"),{message:"conflict"});
  }finally{f.close()}
});

test("revoked identity during source inspection prevents policy creation despite a stale caller object",async()=>{
  const f=fixture();try{
    f.bucket.head=async()=>{f.content.raw.prepare("UPDATE users SET disabled=1 WHERE id=?").run(f.author.id);return {size:f.sourceBytes.byteLength,customMetadata:{sha256:f.sourceHash}} as R2Object};
    await assert.rejects(f.create(),{message:"report_account_unavailable"});
    assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM hrm_financial_retention_policy_versions").get()!.n,0);
  }finally{f.close()}
});
