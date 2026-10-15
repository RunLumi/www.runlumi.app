import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeUser, ROLE_PERMISSIONS } from "../src/lib/workspace/roles.ts";
import { canReadRecord, own, type Person } from "../src/lib/hrm/service.ts";
import { modules, visibleLinks, visibleModules } from "../src/lib/workspace/nav.ts";
import { HrmError, readRecord, readableFileType } from "../src/lib/hrm/fields.ts";
import { isDocxPackage, readLegalForm } from "../src/lib/hrm/legal-files.ts";
import { validateOnboardingConfig } from "../src/lib/hrm/onboarding.ts";
const person=(user_id:string|null):Person=>({id:"person_test",employment_id:"employment_test",profile_version:1,employee_code:"E-001",user_id,legal_name:"Test Employee",preferred_name:"Test",work_email:"work@example.test",work_phone:"",department:"Ops",job_title:"Operator",legal_entity:"Test entity",location:"HCMC",manager_user_id:"manager",status:"active",started_on:"2026-01-01",ended_on:null,version:1,actor_id:"hr",created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z"});
const user=(id:string,granted:Parameters<typeof makeUser>[2])=>makeUser({id,name:id,email:id+"@example.test"},false,granted);
test("HRM grants are separate from ATS, CRM and user administration",()=>{
 assert.deepEqual(ROLE_PERMISSIONS.employee,["workspace.access","hrm.access","hrm.profile.self","hrm.legal.self","hrm.coi.self","hrm.onboarding.self","hrm.onboarding.tasks"]);
 const employee=user("employee",["employee"]);assert.equal(employee.can("hrm.legal.manage"),false);assert.equal(employee.can("hrm.onboarding.manage"),false);
 for(const role of ["hr","finance","sales_manager","partner"] as const)assert.equal(user(role,[role]).can("hrm.access"),false);
 const hrm=user("hrm",["hrm_admin"]);assert.equal(hrm.can("users.manage"),false);assert.equal(hrm.can("hiring.access"),false);assert.equal(hrm.can("crm.access"),false);assert.equal(hrm.can("hrm.legal.activate"),true);assert.equal(hrm.can("hrm.coi.review"),true);assert.equal(hrm.can("hrm.onboarding.manage"),true);assert.equal(hrm.can("hrm.retention.manage"),true);assert.equal(hrm.can("hrm.legalhold.manage"),true);
 const officer=user("officer",["hrm_officer"]);assert.equal(officer.can("hrm.legal.manage"),true);assert.equal(officer.can("hrm.legal.activate"),false);assert.equal(officer.can("hrm.coi.review"),true);assert.equal(officer.can("hrm.retention.review"),true);assert.equal(officer.can("hrm.retention.manage"),false);assert.equal(officer.can("users.manage"),false);
 assert.equal(makeUser({id:"system",name:"System",email:"system@example.test"},true,[]).can("hrm.configure"),true);
 const migration=readFileSync(new URL("../migrations/0014_hrm_records.sql",import.meta.url),"utf8");
 for(const role of ["employee","people_manager","hrm_officer","hrm_admin","hr","sales_manager","sales_executive","partner","finance","fulfillment"])assert.ok(migration.includes("'" + role + "'"));
});
test("managers cannot read identity, dependent, contact, banking or tax data for their reports",()=>{
 const manager=user("manager",["people_manager"]);const other=person("employee-b");assert.equal(own(other,manager),false);
 for(const kind of ["contact","personal","identity","dependent","bank","tax"] as const)assert.equal(canReadRecord(other,manager,kind),false,kind);
 const employee=user("employee-a",["employee"]);assert.equal(canReadRecord(person("employee-a"),employee,"bank"),true);
 const officer=user("officer",["hrm_officer"]);assert.equal(canReadRecord(other,officer,"identity"),true);assert.equal(canReadRecord(other,officer,"bank"),false);assert.equal(canReadRecord(other,officer,"tax"),false);
});
test("the production kill switch hides employee navigation but leaves available HRM configuration screens for admins",()=>{
 const ordinary=makeUser({id:"employee",name:"Employee",email:"e@example.test"},false,["employee"]);ordinary.hrmEnabled=false;assert.equal(visibleModules(ordinary).some(m=>m.key==="hrm"),false);
 const admin=makeUser({id:"hrm",name:"HRM",email:"h@example.test"},false,["hrm_admin"]);admin.hrmEnabled=false;const module=modules.find(m=>m.key==="hrm")!;assert.deepEqual(visibleLinks(admin,module).map(l=>l.key),["legal-documents","onboarding-manage","retention","settings"]);
});
test("profile validators reject malformed values and external states without evidence",()=>{
 assert.throws(()=>readRecord(new FormData(),"contact"),HrmError);
 const invalidDate=new FormData();invalidDate.set("birth_date","2026-02-31");assert.throws(()=>readRecord(invalidDate,"personal"),HrmError);
 const invalidEmail=new FormData();invalidEmail.set("email","not-an-email");assert.throws(()=>readRecord(invalidEmail,"contact"),HrmError);
 const dependent=new FormData();dependent.set("name","Child");dependent.set("relationship","child");dependent.set("registration_state","registered");assert.throws(()=>readRecord(dependent,"dependent"),HrmError);
 const tax=new FormData();tax.set("participation_state","registered");assert.throws(()=>readRecord(tax,"tax"),HrmError);
 const bank=new FormData();bank.set("bank","TEST");bank.set("account_number","123");bank.set("account_name","TEST USER");bank.set("currency","USD");assert.equal(readRecord(bank,"bank").currency,"USD");bank.set("currency","US");assert.throws(()=>readRecord(bank,"bank"),HrmError);
});
test("private file MIME is derived from file signatures",()=>{
 assert.equal(readableFileType(new Uint8Array([37,80,68,70,45,49,46,55])),"application/pdf");
 assert.equal(readableFileType(new Uint8Array([137,80,78,71,13,10,26,10])),"image/png");
 assert.equal(readableFileType(new Uint8Array([255,216,255,0])),"image/jpeg");
 assert.equal(readableFileType(new TextEncoder().encode("<svg onload=alert(1)>")),null);
});
test("DOCX source validation requires a bounded OOXML ZIP directory",()=>{
 const sample=readFileSync(new URL("./fixtures/hrm/test-policy.docx",import.meta.url));
 assert.equal(isDocxPackage(new Uint8Array(sample)),true);
 assert.equal(isDocxPackage(new TextEncoder().encode("PK\\x03\\x04 [Content_Types].xml word/document.xml")),false);
});
test("legal multipart uploads are capped even when the body is chunked",async()=>{
 const request=new Request("https://runlumi.test/api/hrm/legal/files/upload",{method:"POST",headers:{"content-type":"multipart/form-data; boundary=test"},body:new Uint8Array(65)});
 await assert.rejects(readLegalForm(request,64),error=>error instanceof HrmError&&error.status===413);
});
test("onboarding templates reject unsafe owners, unknown prerequisites and dependency cycles",()=>{
 const base={title_en:"TEST task",title_vi:"TEST todo",instructions_en:"",instructions_vi:"",milestone:"Before day one",assignee_kind:"employee",verifier_kind:"hrm_officer",due_offset_days:-2,required:true,allow_waive:false,dependencies:[],evidence_type:"text",action_key:"profile"};
 const valid=validateOnboardingConfig(JSON.stringify({employment_statuses:["preboarding","active"]}),JSON.stringify([{...base,key:"profile"},{...base,key:"verify_profile",assignee_kind:"hrm_officer",verifier_kind:"none",evidence_type:"none",dependencies:["profile"]}]));assert.equal(valid.tasks.length,2);
 assert.throws(()=>validateOnboardingConfig("{}",JSON.stringify([{...base,key:"a",dependencies:["missing"]}])),HrmError);
 assert.throws(()=>validateOnboardingConfig("{}",JSON.stringify([{...base,key:"aa",dependencies:["bb"]},{...base,key:"bb",dependencies:["aa"]}])),error=>error instanceof HrmError&&error.message==="onboarding_dependency_cycle");
 assert.throws(()=>validateOnboardingConfig("{}",JSON.stringify([{...base,key:"pdf",verifier_kind:"none",evidence_type:"pdf"}])),error=>error instanceof HrmError&&error.message==="onboarding_pdf_needs_reviewer");
});
