// Required policy configuration exercised through real HTTP/Worker/D1/R2.
// SQL is used for readback only. No employee clearance or policy values are seeded.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash,randomUUID} from "node:crypto";
import {BASE,content,jobs,localFetch,q} from "./helpers.mjs";
export async function exerciseCloseoutPolicy({author,approver,unauthorized,entity,start,today,browser}){
 const approverId=approver.id??(()=>{const admins=content("SELECT id FROM users WHERE role=50 AND disabled=0");assert.equal(admins.length,1,"synthetic dev-bypass admin must be unambiguous");return admins[0].id})();
 const suffix=randomUUID().replaceAll("-",""),reason="TEST synthetic independent closeout review; no professional approval";
 const requestKey=()=>`closeout_${randomUUID().replaceAll("-","")}`;
 const ok=response=>{assert.equal(response.status,303,response.html?.slice(0,500));assert.equal(new URL(response.location,BASE).searchParams.get("error"),null);return response};
 const post=(actor,path,fields)=>actor.post(path,{request_key:requestKey(),...fields}).then(ok);
 const row=sql=>{const result=jobs(sql)[0];assert.ok(result);return result};
 const documentKey=`test-closeout-${suffix}`;
 await post(author,"/hrm/documents",{intent:"create_template",document_key:documentKey,document_type:"policy",title_en:"TEST closeout source",title_vi:"TEST nguồn quyết toán"});
 const template=row(`SELECT * FROM hrm_legal_templates WHERE document_key=${q(documentKey)}`);
 const form=new FormData();for(const [name,value]of Object.entries({request_key:requestKey(),kind:"docx_source",template_id:template.id,return_to:"/hrm/documents"}))form.set(name,value);
 form.set("file",new File([readFileSync(new URL("../fixtures/hrm/test-policy.docx",import.meta.url))],"TEST-closeout.docx",{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}));
 const upload=await localFetch(BASE+"/api/hrm/legal/files/upload",{method:"POST",headers:{cookie:author.header(),origin:BASE},body:form,redirect:"manual"});ok({status:upload.status,location:upload.headers.get("location")});
 const file=row(`SELECT * FROM hrm_legal_files WHERE template_id=${q(template.id)}`);
 await post(approver,`/api/hrm/legal/files/${file.id}`,{intent:"review",decision:"reviewed",version:file.version,reason,return_to:"/hrm/documents"});
 const downloaded=await localFetch(`${BASE}/api/hrm/legal/files/${file.id}`,{headers:{cookie:author.header()}});assert.equal(downloaded.status,200);assert.ok(downloaded.headers.get("cache-control")?.includes("no-store"));assert.equal(createHash("sha256").update(Buffer.from(await downloaded.arrayBuffer())).digest("hex"),file.checksum);
 if(unauthorized){const denied=await unauthorized.get(`/api/hrm/legal/files/${file.id}`);assert.ok([403,404].includes(denied.status),"payroll preparation does not grant access to private policy source files")}
 await post(author,"/hrm/documents",{intent:"create_version",template_id:template.id,source_file_id:file.id,language:"bilingual",legal_entity:entity,purpose:"TEST financial review instructions",effective_on:start,due_days:"30",signing_mode:"acknowledgement",requires_ack:"1",audience_status:["active"]});
 let source=row(`SELECT * FROM hrm_legal_template_versions WHERE template_id=${q(template.id)}`);
 await post(approver,"/hrm/documents",{intent:"review_version",template_id:template.id,version_id:source.id,version:source.version,decision:"approve",reason});source=row(`SELECT * FROM hrm_legal_template_versions WHERE id=${q(source.id)}`);
 const fields={intent:"create_closeout_policy",return_to:"/hrm/payroll",policy_key:`TEST-CLOSEOUT-${suffix.toUpperCase()}`,title_en:"TEST independent final review",title_vi:"TEST rà soát quyết toán độc lập",purpose:"TEST synthetic review only",jurisdiction:"TEST owner supplied scope",source_version_id:source.id,effective_from:start,effective_until:new Date(Date.parse(today+"T00:00:00Z")+365*86400000).toISOString().slice(0,10),check_0_key:"TEST_REVIEW",check_0_title_en:"TEST source review",check_0_title_vi:"TEST kiểm tra nguồn",check_0_instructions_en:"TEST inspect evidence; no statutory compliance claimed",check_0_instructions_vi:"TEST xem chứng cứ; không xác nhận tuân thủ pháp luật"};
 for(const [extra,error]of [[{check_30_key:"TEST_EXCESS"},"closeout_checklist_invalid"],[{allow_no_payroll:["0","1"]},"invalid_field"]]){
  const result=await author.post("/api/hrm/payroll",{...fields,request_key:requestKey(),...extra});assert.equal(new URL(result.location,BASE).searchParams.get("error"),error);
 }
 if(unauthorized){const denied=await unauthorized.post("/api/hrm/payroll",{...fields,request_key:requestKey()});assert.equal(new URL(denied.location,BASE).searchParams.get("error"),"forbidden")}
 const key=requestKey();await post(author,"/api/hrm/payroll",{...fields,request_key:key});await post(author,"/api/hrm/payroll",{...fields,request_key:key});
 let policy=row(`SELECT * FROM hrm_closeout_policy_versions WHERE policy_key=${q(fields.policy_key)}`);assert.equal(policy.state,"draft");assert.equal(policy.allow_no_payroll,0);assert.equal(policy.source_checksum,file.checksum);
 const self=await author.post("/api/hrm/payroll",{intent:"closeout_policy_action",return_to:"/hrm/payroll",request_key:requestKey(),policy_id:policy.id,version:policy.version,action:"approve",reason});assert.equal(new URL(self.location,BASE).searchParams.get("error"),"self_approval");
 for(const action of ["approve","activate"]){const input={intent:"closeout_policy_action",return_to:"/hrm/payroll",request_key:requestKey(),policy_id:policy.id,version:policy.version,action,reason};await post(approver,"/api/hrm/payroll",input);await post(approver,"/api/hrm/payroll",input);policy=row(`SELECT * FROM hrm_closeout_policy_versions WHERE id=${q(policy.id)}`)}
 assert.equal(policy.state,"active");assert.equal(policy.reviewed_by,approverId);
 assert.equal(row(`SELECT COUNT(*) AS n FROM hrm_closeout_policy_versions WHERE policy_key=${q(fields.policy_key)}`).n,1);
 for(const locale of ["","/vi"]){const page=await author.get(`${locale}/hrm/payroll`);assert.equal(page.status,200);assert.ok(page.html.includes(locale?fields.title_vi:fields.title_en));assert.ok(page.html.includes(file.checksum));if(browser)console.log("HRM closeout policy browser",JSON.stringify(await browser.auditPage(author,`${locale}/hrm/payroll`,{expectedText:locale?"Chính sách quyết toán khi nghỉ việc":"Offboarding financial review policies",artifactName:`closeout-policy-${locale?"vi":"en"}`,formsRequired:true,widths:[320,430,1280,1920],revealSelector:"#closeout-policies"})))}
 if(browser)for(const locale of ["","/vi"])console.log("HRM closeout draft browser",JSON.stringify(await browser.auditPage(author,`${locale}/hrm/payroll`,{expectedText:locale?"Tạo phiên bản chính sách quyết toán":"Create a financial review policy version",artifactName:`closeout-draft-${locale?"vi":"en"}`,formsRequired:true,widths:[320,430,1280,1920],revealSelector:"#closeout-policies > details"})));
 console.log("HRM closeout policy HTTP passed: private DOCX, independent review, EN/VI terms, no implicit exemption");
 return {policy,source};
}
