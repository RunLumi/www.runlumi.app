import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeUser, ROLE_PERMISSIONS } from "../src/lib/workspace/roles.ts";
import { canReadRecord, own, type Person } from "../src/lib/hrm/service.ts";
import { modules, visibleLinks, visibleModules } from "../src/lib/workspace/nav.ts";
import { HrmError, readRecord, readableFileType } from "../src/lib/hrm/fields.ts";
const person=(user_id:string|null):Person=>({id:"person_test",employment_id:"employment_test",profile_version:1,employee_code:"E-001",user_id,legal_name:"Test Employee",preferred_name:"Test",work_email:"work@example.test",work_phone:"",department:"Ops",job_title:"Operator",legal_entity:"Test entity",location:"HCMC",manager_user_id:"manager",status:"active",started_on:"2026-01-01",ended_on:null,version:1,actor_id:"hr",created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z"});
const user=(id:string,granted:Parameters<typeof makeUser>[2])=>makeUser({id,name:id,email:id+"@example.test"},false,granted);
test("HRM grants are separate from ATS, CRM and user administration",()=>{
 assert.deepEqual(ROLE_PERMISSIONS.employee,["workspace.access","hrm.access","hrm.profile.self"]);
 for(const role of ["hr","finance","sales_manager","partner"] as const)assert.equal(user(role,[role]).can("hrm.access"),false);
 const hrm=user("hrm",["hrm_admin"]);assert.equal(hrm.can("users.manage"),false);assert.equal(hrm.can("hiring.access"),false);assert.equal(hrm.can("crm.access"),false);
 assert.equal(makeUser({id:"system",name:"System",email:"system@example.test"},true,[]).can("hrm.configure"),true);
 const migration=readFileSync(new URL("../migrations/0012_hrm_records.sql",import.meta.url),"utf8");
 for(const role of ["employee","people_manager","hrm_officer","hrm_admin","hr","sales_manager","sales_executive","partner","finance","fulfillment"])assert.ok(migration.includes("'" + role + "'"));
});
test("managers cannot read identity, dependent, contact, banking or tax data for their reports",()=>{
 const manager=user("manager",["people_manager"]);const other=person("employee-b");assert.equal(own(other,manager),false);
 for(const kind of ["contact","personal","identity","dependent","bank","tax"] as const)assert.equal(canReadRecord(other,manager,kind),false,kind);
 const employee=user("employee-a",["employee"]);assert.equal(canReadRecord(person("employee-a"),employee,"bank"),true);
 const officer=user("officer",["hrm_officer"]);assert.equal(canReadRecord(other,officer,"identity"),true);assert.equal(canReadRecord(other,officer,"bank"),false);assert.equal(canReadRecord(other,officer,"tax"),false);
});
test("the production kill switch hides employee navigation and only exposes HRM settings to HRM admins",()=>{
 const ordinary=makeUser({id:"employee",name:"Employee",email:"e@example.test"},false,["employee"]);ordinary.hrmEnabled=false;assert.equal(visibleModules(ordinary).some(m=>m.key==="hrm"),false);
 const admin=makeUser({id:"hrm",name:"HRM",email:"h@example.test"},false,["hrm_admin"]);admin.hrmEnabled=false;const module=modules.find(m=>m.key==="hrm")!;assert.deepEqual(visibleLinks(admin,module).map(l=>l.key),["settings"]);
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
