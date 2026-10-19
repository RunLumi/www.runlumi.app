// Synthetic policy configuration through the real Worker/D1/R2 boundary.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { BASE, jobs, q } from "./helpers.mjs";

export async function exerciseFinancialRetentionPolicy({author,reviewer,unauthorized,sourceVersionId,start,today,browser}) {
 const suffix=randomUUID().replaceAll("-",""),requestKey=()=>`financial_retention_${randomUUID().replaceAll("-","")}`;
 const fields={intent:"create_financial_policy",lang:"vi",policy_key:`TEST-FIN-${suffix.toUpperCase()}`,
  title_en:`TEST PRIVATE financial retention ${suffix}`,title_vi:`TEST lưu giữ tài chính riêng ${suffix}`,
  purpose:"TEST synthetic purpose only; no production legal policy",source_version_id:sourceVersionId,
  effective_from:start,effective_until:new Date(Date.parse(today+"T00:00:00Z")+365*86400000).toISOString().slice(0,10),
  file_days:"",file_anchor:"",file_basis:"TEST not scheduled; no default file duration",
  dossier_days:"",dossier_anchor:"",dossier_basis:"TEST not scheduled; no default dossier duration"};
 const post=async(actor,input)=>actor.post("/api/hrm/retention",{request_key:requestKey(),...input});
 const success=response=>{assert.equal(response.status,303);assert.equal(new URL(response.location,BASE).searchParams.get("error"),null);assert.equal(new URL(response.location,BASE).pathname,"/vi/hrm/retention");return response};
 const current=()=>{const row=jobs(`SELECT * FROM hrm_financial_retention_policy_versions WHERE policy_key=${q(fields.policy_key)} ORDER BY revision DESC LIMIT 1`)[0];assert.ok(row);return row};
 const denied=await post(unauthorized,fields);assert.equal(new URL(denied.location,BASE).searchParams.get("error"),"forbidden");assert.equal(jobs(`SELECT COUNT(*) n FROM hrm_financial_retention_policy_versions WHERE policy_key=${q(fields.policy_key)}`)[0].n,0);
 success(await post(author,fields));let policy=current();assert.equal(policy.state,"draft");assert.equal(policy.file_days,null);assert.equal(policy.file_anchor,null);assert.equal(policy.dossier_days,null);assert.equal(policy.dossier_anchor,null);
 const self=await post(author,{intent:"financial_policy_action",lang:"vi",policy_id:policy.id,version:policy.version,action:"approve",reason:"TEST self approval must fail"});assert.equal(new URL(self.location,BASE).searchParams.get("error"),"self_approval");
 const action=async(kind)=>{policy=current();success(await post(reviewer,{intent:"financial_policy_action",lang:"vi",policy_id:policy.id,version:policy.version,action:kind,reason:"TEST independent review of fake policy; no professional or legal approval"}));policy=current();return policy};
 await action("approve");await action("activate");const original={...policy};assert.equal(policy.state,"active");assert.notEqual(policy.reviewed_by,policy.created_by);assert.ok(policy.reviewed_at.endsWith("Z"));
 success(await post(author,{...fields,file_days:"1",file_anchor:"employment_ended",file_basis:"TEST explicit one-day synthetic eligibility, not a legal period",dossier_days:"1",dossier_anchor:"employment_ended",dossier_basis:"TEST explicit synthetic dossier rule"}));
 await action("approve");await action("activate");
 assert.equal(current().revision,2);assert.equal(current().file_days,1);assert.equal(current().file_anchor,"employment_ended");assert.equal(current().dossier_days,1);
 const old=jobs(`SELECT state,file_days,dossier_days FROM hrm_financial_retention_policy_versions WHERE id=${q(original.id)}`)[0];assert.deepEqual(old,{state:"retired",file_days:null,dossier_days:null});
 assert.equal(jobs(`SELECT COUNT(*) n FROM hrm_financial_retention_events WHERE policy_id=${q(original.id)} AND event_type='replaced'`)[0].n,1);
 for(const [prefix,language,title]of [["","en",fields.title_en],["/vi","vi",fields.title_vi]]){
  const page=await author.get(`${prefix}/hrm/retention`);assert.equal(page.status,200);assert.ok(page.html.includes(title));assert.equal(page.headers.get("cache-control"),"private, no-store");
  const hidden=await unauthorized.get(`${prefix}/hrm/retention`);assert.equal(hidden.status,200);assert.ok(!hidden.html.includes(fields.title_en)&&!hidden.html.includes(fields.title_vi));assert.ok(!hidden.html.includes('id="financial-retention"'));
  if(browser)console.log("Financial retention policy browser",language,JSON.stringify(await browser.auditPage(author,`${prefix}/hrm/retention`,{expectedText:title,artifactName:`financial-retention-policy-${language}`,widths:[320,430,1280,1920],formsRequired:true,revealSelector:"#financial-retention"})));
 }
 console.log("HRM financial retention policy HTTP passed: reviewed private DOCX, explicit nullable periods/anchors, independent review, immutable rollover and financial-only EN/VI metadata");
 return current();
}
