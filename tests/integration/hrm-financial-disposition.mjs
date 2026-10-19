import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { BASE,jobs,q } from "./helpers.mjs";
import { syntheticR2Request } from "./hrm-recovery-drill.mjs";

export async function exerciseFinancialDisposition({author,reviewer,executor,executorId,unauthorized,policy,caseId,personId,fileId,dossierId,browser}){
 assert.ok(typeof executorId==="string"&&executorId.length>0,"the exact current System Admin identity is required");
 const key=()=>`financial_disposition_${randomUUID().replaceAll("-","")}`;
 const post=(actor,fields)=>actor.post("/api/hrm/retention",{lang:"vi",case_id:caseId,request_key:key(),...fields});
 const success=response=>{assert.equal(response.status,303);const url=new URL(response.location,BASE);assert.equal(url.searchParams.get("error"),null,`financial disposition: ${url.searchParams.get("error")}`);assert.equal(url.pathname,"/vi/hrm/retention");assert.equal(url.searchParams.get("financial_case"),caseId);return response};
 const row=(table,id)=>{const value=jobs(`SELECT * FROM ${table} WHERE id=${q(id)}`)[0];assert.ok(value);return value};
 const file=row("hrm_closeout_files",fileId),dossier=row("hrm_closeout_dossiers",dossierId),caseBefore=row("hrm_offboarding_cases",caseId),source=jobs(`SELECT revision FROM hrm_closeout_sources WHERE case_id=${q(caseId)}`)[0].revision;
 const requestFields=kind=>({intent:"request_financial_disposition",target_kind:kind,target_id:kind==="file"?fileId:dossierId,version:row(kind==="file"?"hrm_closeout_files":"hrm_closeout_dossiers",kind==="file"?fileId:dossierId).version,policy_id:policy.id,reason:"TEST synthetic explicit scope and applicability assessment",confirmed:"yes"});
 const blocked=await post(author,requestFields("file"));assert.equal(new URL(blocked.location,BASE).searchParams.get("error"),"legal_hold_active");
 const forbidden=await post(unauthorized,requestFields("file"));assert.equal(new URL(forbidden.location,BASE).searchParams.get("error"),"forbidden");
 // These synthetic matters are independently closed after the restore drill.
 for(const hold of jobs(`SELECT id,version FROM hrm_legal_holds WHERE person_id=${q(personId)} AND category='*' AND state='active'`))success(await post(reviewer,{intent:"release_hold",hold_id:hold.id,version:hold.version,reason:"TEST independent completion of disposable preservation matter"}));
 for(const hold of jobs(`SELECT id,version,placed_by FROM hrm_closeout_file_holds WHERE file_id=${q(fileId)} AND state='active'`)){
  const response=await author.post("/api/hrm/closeout",{intent:"release_file_hold",case_id:caseId,hold_id:hold.id,version:hold.version,lang:"vi",reason:"TEST independent closure of synthetic file matter",request_key:key()});
  assert.equal(new URL(response.location,BASE).searchParams.get("error"),null);
 }
 for(const kind of ["file","dossier"]){
  success(await post(author,requestFields(kind)));
  let request=jobs(`SELECT * FROM hrm_financial_disposition_requests WHERE case_id=${q(caseId)} AND target_kind=${q(kind)} ORDER BY requested_at DESC LIMIT 1`)[0];assert.ok(request);assert.equal(request.state,"pending_review");
  const self=await post(author,{intent:"review_financial_disposition",request_id:request.id,version:request.version,decision:"approve",reason:"TEST self review denied",confirmed:"yes"});assert.equal(new URL(self.location,BASE).searchParams.get("error"),"self_approval");
  success(await post(reviewer,{intent:"review_financial_disposition",request_id:request.id,version:request.version,decision:"approve",reason:"TEST independent synthetic disposition assessment",confirmed:"yes"}));request=row("hrm_financial_disposition_requests",request.id);assert.equal(request.reviewed_by,reviewer.id);
  if(browser)for(const [prefix,lang,text]of [["","en","Disposition of due records"],["/vi","vi","Xử lý dữ liệu đến hạn"]])console.log("Financial disposition browser",kind,lang,JSON.stringify(await browser.auditPage(executor,`${prefix}/hrm/retention?financial_case=${encodeURIComponent(caseId)}`,{expectedText:text,artifactName:`financial-disposition-${kind}-${lang}`,widths:[320,430,1280,1920],formsRequired:true,revealSelector:"#financial-disposition"})));
  success(await post(executor,{intent:kind==="file"?"execute_financial_file":"execute_financial_dossier",request_id:request.id,version:request.version,confirmed:"yes"}));request=row("hrm_financial_disposition_requests",request.id);assert.equal(request.state,"completed");assert.equal(request.completed_by,executorId);
  const controlKey=`hrm-privacy/v1/financial/${kind}/${caseId}/${kind==="file"?fileId:dossierId}.json`,controlResponse=await syntheticR2Request(BASE,"GET",controlKey);assert.equal(controlResponse.status,200);const control=await controlResponse.json();assert.equal(control.phase,"erased");assert.equal(control.erasure.requestId,request.id);
 }
 assert.equal((await syntheticR2Request(BASE,"GET",file.object_key)).status,404,"real local R2 payload is absent");
 const downloaded=await author.get(`/api/hrm/closeout/files/${fileId}?case_id=${caseId}`);assert.notEqual(downloaded.status,200);
 const after=row("hrm_closeout_dossiers",dossierId);assert.equal(after.basis_json,"{}");assert.equal(after.checks_json,"[]");assert.equal(after.no_payroll_evidence_json,"[]");assert.equal(after.review_reason,"Disposed under approved retention");
 for(const field of ["state","prepared_by","prepared_at","reviewed_by","reviewed_at","applied_by","applied_at","basis_checksum"])assert.equal(after[field],dossier[field]);
 assert.equal(jobs(`SELECT COUNT(*) n FROM hrm_closeout_events WHERE dossier_id=${q(dossierId)} AND event_type IN ('approved','rejected','applied') AND json_type(detail_json,'$.reason') IS NOT NULL`)[0].n,0);
 assert.equal(row("hrm_offboarding_cases",caseId).state,caseBefore.state);assert.equal(jobs(`SELECT revision FROM hrm_closeout_sources WHERE case_id=${q(caseId)}`)[0].revision,source);
 assert.equal(jobs(`SELECT COUNT(*) n FROM hrm_financial_disposition_execution_scope`)[0].n,0);
 const membership=jobs(`SELECT enabled FROM workspace_members WHERE user_id=${q(caseBefore.employee_user_id)}`)[0];assert.equal(membership.enabled,0);
 console.log("HRM financial disposition HTTP passed: independent three-person approval, hold blocking/release, native EN/VI, real R2 removal/control, atomic dossier/event redaction and historical closure without access resurrection");
}
