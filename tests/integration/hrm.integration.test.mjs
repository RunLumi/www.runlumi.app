// HRM against an isolated Astro Worker, EmDash, D1 and local R2. Synthetic identities/files only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE, adminSession, content, jobs, q, userSession } from "./helpers.mjs";

const run=Date.now().toString(36);const S={};const P={};
const grant=(user,role)=>S.system.post("/workspace/users",{intent:"grant",email:user.email,roles:[role]});
const createPerson=async({user,code,name,manager="",status="active"})=>{
 const result=await S.hrm.post("/hrm/people/new",{request_key:`person_${code}_${run}`,employee_code:code,account_email:user?.email??"",legal_name:name,preferred_name:name,work_email:`${code.toLowerCase()}@work.example.test`,work_phone:"0900000000",department:"TEST Operations",job_title:"TEST Analyst",legal_entity:"TEST Local entity",location:"Ho Chi Minh City",manager_user_id:manager,status,started_on:"2026-10-13"});
 assert.equal(result.status,303,result.html);const row=jobs(`SELECT id FROM hrm_people WHERE employee_code=${q(code)}`)[0];assert.ok(row);return row.id;
};
async function multipart(session,path,fields,file){const form=new FormData();for(const [key,value] of Object.entries(fields))form.set(key,String(value));form.set("file",file);const response=await fetch(BASE+path,{method:"POST",body:form,headers:{cookie:session.header(),origin:BASE},redirect:"manual"});session.absorb(response);return {status:response.status,location:response.headers.get("location"),body:await response.text(),headers:response.headers};}

test("HRM P1 uses EmDash sessions, isolated HRM grants, scoped records, D1 history and private R2 files",async()=>{
 S.system=await adminSession();
 S.hrm=await userSession(S.system,{email:`test-hrm-admin-${run}@example.test`,name:`TEST HRM Admin ${run}`});
 S.hr=await userSession(S.system,{email:`test-hrm-officer-${run}@example.test`,name:`TEST HRM Officer ${run}`});
 S.manager=await userSession(S.system,{email:`test-hrm-manager-${run}@example.test`,name:`TEST Manager ${run}`});
 S.employeeA=await userSession(S.system,{email:`test-employee-a-${run}@example.test`,name:`TEST Employee A ${run}`});
 S.employeeB=await userSession(S.system,{email:`test-employee-b-${run}@example.test`,name:`TEST Employee B ${run}`});
 S.finance=await userSession(S.system,{email:`test-hrm-finance-${run}@example.test`,name:`TEST Finance ${run}`});
 for(const [user,role] of [[S.hrm,"hrm_admin"],[S.hr,"hrm_officer"],[S.manager,"people_manager"],[S.employeeA,"employee"],[S.employeeB,"employee"],[S.finance,"finance"]])assert.equal((await grant(user,role)).status,303);
 assert.equal((await S.finance.get("/hrm")).status,403,"CRM Finance is not HRM access");
 assert.equal((await S.hr.get("/workspace/users")).status,403,"HRM Officer cannot manage accounts");
 assert.equal((await S.employeeA.get("/hrm")).status,503,"the database policy readiness gate remains closed until HRM Admin configures and reviews it");
 assert.equal((await S.hrm.get("/hrm/settings")).status,200,"HRM Admin can configure while the employee module remains unavailable");
 assert.equal((await S.hrm.post("/hrm/settings",{request_key:`policy_${run}`,version:1,legal_entity:"TEST Local entity",purpose:"Synthetic test only",retention_policy:"Synthetic records deleted with test state",policy_reference:"TEST-only synthetic policy",reviewed:"1",enabled:"1"})).status,303);
 assert.equal((await S.employeeA.get("/hrm")).status,200);
 P.a=await createPerson({user:S.employeeA,code:`TEST-A-${run}`,name:"TEST Employee A"});
 P.b=await createPerson({user:S.employeeB,code:`TEST-B-${run}`,name:"TEST Employee B",manager:S.manager.id});
 assert.equal((await S.employeeA.get("/hrm/me?section=bank")).status,200);
 assert.equal((await S.employeeA.get(`/hrm/people/${P.b}/profile?section=identity`)).status,404,"employees cannot open another employee's records");
 assert.equal((await S.hrm.get(`/hrm/people/${P.b}/profile?section=bank`)).status,200);
 assert.equal((await S.hr.get(`/hrm/people/${P.b}/profile?section=identity`)).status,200);
 assert.equal((await S.hr.get(`/hrm/people/${P.b}/profile?section=bank`)).status,404,"HRM Officer has no bank access");
 const team=await S.manager.get("/hrm/people");assert.equal(team.status,200);assert.ok(team.html.includes("TEST Employee B"));assert.ok(!team.html.includes("account_number"));
 assert.equal((await S.manager.get(`/hrm/people/${P.b}/profile?section=identity`)).status,404,"manager gets work scope only");
 const csrf=await S.employeeA.post("/hrm/me?section=identity",{intent:"submit",section:"identity",request_key:`csrf_${run}`,record_id:"",expected_version:"0",document_type:"CCCD",document_number:"TEST-IDENTITY-001",issued_on:"2020-01-01"},{origin:"https://attacker.example"});assert.equal(csrf.status,400);
 const submitted=await S.employeeA.post("/hrm/me?section=identity",{intent:"submit",section:"identity",request_key:`identity_${run}`,record_id:"",expected_version:"0",document_type:"CCCD",document_number:"TEST-IDENTITY-001",issued_on:"2020-01-01",issued_by:"TEST issuer"});assert.equal(submitted.status,303);
 let pending=jobs(`SELECT id,version,state FROM hrm_change_requests WHERE person_id=${q(P.a)} AND kind='identity'`)[0];assert.equal(pending.state,"submitted");
 const approve=await S.hrm.post(`/hrm/people/${P.a}/profile?section=identity`,{intent:"review",section:"identity",request_key:`approve_${run}`,change_id:pending.id,version:pending.version,decision:"approved",reason:"TEST checked synthetic document"});assert.equal(approve.status,303);
 assert.equal(jobs(`SELECT state FROM hrm_records WHERE person_id=${q(P.a)} AND kind='identity'`)[0].state,"verified");
 // Competing bank submissions are both preserved, but only the first current revision can be approved.
 for(const suffix of ["one","two"])assert.equal((await S.employeeA.post("/hrm/me?section=bank",{intent:"submit",section:"bank",request_key:`bank_${suffix}_${run}`,record_id:"",expected_version:"0",bank:"TEST BANK",account_number:`TEST-${suffix}`,account_name:"TEST EMPLOYEE",currency:"VND"})).status,303);
 const bankRequests=jobs(`SELECT id,version FROM hrm_change_requests WHERE person_id=${q(P.a)} AND kind='bank' ORDER BY created_at`);assert.equal(bankRequests.length,2);
 const bankApprove=await S.hrm.post(`/hrm/people/${P.a}/profile?section=bank`,{intent:"review",section:"bank",request_key:`bank_review_1_${run}`,change_id:bankRequests[0].id,version:1,decision:"approved",reason:"TEST approves first snapshot"});assert.equal(bankApprove.status,303);
 const stale=await S.hrm.post(`/hrm/people/${P.a}/profile?section=bank`,{intent:"review",section:"bank",request_key:`bank_review_2_${run}`,change_id:bankRequests[1].id,version:1,decision:"approved",reason:"TEST stale revision must fail"});assert.equal(stale.status,409,"stale approval returns a conflict without applying it");
 assert.equal(jobs(`SELECT state FROM hrm_change_requests WHERE id=${q(bankRequests[1].id)}`)[0].state,"submitted","stale review does not overwrite or approve the second request");
 const fakePdf=new File([new Uint8Array([37,80,68,70,45,49,46,55,10,84,69,83,84])],"TEST-id.pdf",{type:"application/pdf"});
 const uploaded=await multipart(S.employeeA,"/api/hrm/files/upload",{person_id:P.a,kind:"identity",record_id:jobs(`SELECT id FROM hrm_records WHERE person_id=${q(P.a)} AND kind='identity'`)[0].id,request_key:`file_${run}`,return_to:"/hrm/me"},fakePdf);assert.equal(uploaded.status,303,uploaded.body);
 const meta=jobs(`SELECT id,object_key,state,checksum FROM hrm_files WHERE person_id=${q(P.a)} AND kind='identity'`)[0];assert.ok(meta.object_key.startsWith("hrm/"));assert.equal(meta.state,"quarantined");
 assert.equal((await S.employeeB.get(`/api/hrm/files/${meta.id}`)).status,404,"different employee cannot fetch the R2 object");
 const review=await S.hrm.post(`/api/hrm/files/${meta.id}`,{intent:"reviewed",person_id:P.a,version:1,request_key:`file_review_${run}`,reason:"TEST reviewed synthetic bytes",return_to:"/hrm/people/"+P.a,section:"identity"});assert.equal(review.status,303);
 assert.equal(jobs(`SELECT state FROM hrm_files WHERE id=${q(meta.id)}`)[0].state,"reviewed");
 const download=await S.employeeA.get(`/api/hrm/files/${meta.id}`);assert.equal(download.status,200);assert.equal(download.headers.get("cache-control"),"private, no-store");assert.match(download.headers.get("content-disposition"),/attachment/);assert.match(download.html,/TEST/);
 assert.ok(jobs(`SELECT COUNT(*) AS n FROM hrm_audit WHERE person_id=${q(P.a)} AND action='file_downloaded'`)[0].n>=1);
 assert.equal((await S.system.post("/workspace/users",{intent:"update",user_id:S.employeeA.id,roles:["employee"],enabled:"0"})).status,303);
 assert.equal((await S.employeeA.get("/hrm")).status,403,"revocation applies on the next EmDash-backed request");
});
