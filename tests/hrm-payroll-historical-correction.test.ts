import test from "node:test";
import assert from "node:assert/strict";
import { closeoutFixture } from "./support/hrm-closeout-fixture.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { digest } from "../src/lib/hrm/service.ts";
import { listPayrollDisputes, publishPayrollRun } from "../src/lib/hrm/payroll.ts";

async function fixture(){
 const f=closeoutFixture(),user={...makeUser({id:"TEST-reviewer",name:"TEST Reviewer",email:"reviewer@example.test"},false,["hrm_admin"]),hrmEnabled:true};
 f.db.raw.prepare(`INSERT INTO hrm_time_periods(id,period_key,starts_on,ends_on,state,snapshot_json,snapshot_checksum,locked_at,opened_by,opened_at,actor_id,created_at,updated_at) VALUES('period','TEST-FINAL','2026-01-01','2026-01-31','locked','{}','TEST-time',?,'TEST-author',?,'TEST-author',?,?)`).run(f.time,f.time,f.time,f.time);
 f.db.raw.prepare(`INSERT INTO hrm_payroll_policy_versions(id,policy_key,revision,title_en,title_vi,legal_entity,currency,minor_unit_scale,components_json,state,created_by,created_at,actor_id,updated_at) VALUES('pay-policy','TEST-PAY',1,'TEST pay','TEST lương','TEST entity','VND',0,'[]','draft','TEST-author',?,'TEST-author',?)`).run(f.time,f.time);
 const person={person_id:"person",employment_id:"person-employment",employee_code:"TEST-person",display_name:"TEST Employee",lines:[{component_code:"base",title_en:"TEST base",title_vi:"TEST lương",direction:"earning",amount_minor:1000,source_kind:"employment_record",source_reference:"person-employment",zero_reason:""}],gross_minor:1000,deductions_minor:0,net_minor:1000};
 async function run(id:string,previous:string|null=null){
  f.db.raw.prepare(`INSERT INTO hrm_payroll_runs(id,period_key,period_id,starts_on,ends_on,policy_version_id,adjustment_of_payslip_id,state,created_by,created_at,actor_id,updated_at) VALUES(?,'TEST-FINAL','period','2026-01-01','2026-01-31','pay-policy',?,'draft','TEST-author',?,'TEST-author',?)`).run(id,previous,f.time,f.time);
  f.db.raw.prepare("INSERT INTO hrm_payroll_run_people(id,run_id,person_id,employment_id,employee_code_snapshot,display_name_snapshot,gross_minor,deductions_minor,net_minor) VALUES(?,?,'person','person-employment','TEST-person','TEST Employee',1000,0,1000)").run(id+"-person",id);
  const json=JSON.stringify({version:1,time_snapshot_checksum:"TEST-time",people:[person]});
  for(const state of ["calculated","reviewed","approved"]){if(state==="calculated")f.db.raw.prepare("UPDATE hrm_payroll_runs SET state=?,snapshot_json=?,snapshot_checksum=? WHERE id=?").run(state,json,await digest(json),id);else f.db.raw.prepare("UPDATE hrm_payroll_runs SET state=?,approved_by='TEST-reviewer' WHERE id=?").run(state,id)}
 }
 await run("source");f.db.raw.exec("UPDATE hrm_payroll_runs SET state='published' WHERE id='source'");
 const json=JSON.stringify({version:1,policy:{legal_entity:"TEST entity",currency:"VND",minor_unit_scale:0},employee_code:"TEST-issued-code",display_name:"TEST issued display name",paid_carryover_minor:0,net_minor:1000});
 f.db.raw.prepare("INSERT INTO hrm_payslips(id,run_id,run_person_id,person_id,state,snapshot_json,snapshot_checksum,issued_by,issued_at) VALUES('old-slip','source','source-person','person','published',?,?,'TEST-reviewer',?)").run(json,await digest(json),f.time);
 f.db.raw.prepare("INSERT INTO hrm_payroll_payments(id,payslip_id,amount_minor,paid_on,payment_reference,evidence_reference,confirmed_by,confirmed_at,request_key) VALUES('old-payment','old-slip',1000,'2026-01-31','TEST settled','TEST proof','TEST-reviewer',?,'TEST-old-payment-key')").run(f.time);
 return {...f,user,run};
}

test("an independently approved correction can publish for the original ended employment without changing access or old issued data",async()=>{
 const f=await fixture();try{
  const original=f.db.raw.prepare("SELECT snapshot_json FROM hrm_payslips WHERE id='old-slip'").get()?.snapshot_json;await f.run("correction","old-slip");
  await publishPayrollRun(f.db,f.user,"TEST-historical-correction-publish","correction",1);const slip=f.db.raw.prepare("SELECT * FROM hrm_payslips WHERE run_id='correction'").get()!;
  assert.equal(JSON.parse(String(slip.snapshot_json)).paid_carryover_minor,1000);assert.equal(slip.person_id,"person");assert.equal(f.db.raw.prepare("SELECT employment_id FROM hrm_payroll_run_people WHERE run_id='correction'").get()?.employment_id,"person-employment");
  assert.equal(f.db.raw.prepare("SELECT snapshot_json FROM hrm_payslips WHERE id='old-slip'").get()?.snapshot_json,original);assert.equal(f.db.raw.prepare("SELECT status FROM hrm_employments WHERE id='person-employment'").get()?.status,"ended");assert.equal(f.db.raw.prepare("SELECT enabled FROM workspace_members WHERE user_id='employee'").get()?.enabled,0);
 }finally{f.close()}
});

test("a regular run still cannot publish for an ended employee",async()=>{
 const f=await fixture();try{
  // The unique regular-run key already belongs to source; a distinct policy
  // version represents an independently prepared regular run, not a correction.
  f.db.raw.prepare(`INSERT INTO hrm_payroll_policy_versions(id,policy_key,revision,title_en,title_vi,legal_entity,currency,minor_unit_scale,components_json,state,created_by,created_at,actor_id,updated_at) VALUES('other-policy','TEST-OTHER',1,'TEST','TEST','TEST entity','VND',0,'[]','draft','TEST-author',?,'TEST-author',?)`).run(f.time,f.time);
  // A regular run has no correction pointer; its ended participant remains blocked.
  const db=f.db;
  db.raw.prepare("INSERT INTO hrm_payroll_runs(id,period_key,period_id,starts_on,ends_on,policy_version_id,state,snapshot_json,snapshot_checksum,created_by,created_at,approved_by,actor_id,updated_at) SELECT 'regular','TEST-FINAL','period','2026-01-01','2026-01-31','other-policy','approved',snapshot_json,snapshot_checksum,'TEST-author',?,'TEST-reviewer','TEST-author',? FROM hrm_payroll_runs WHERE id='source'").run(f.time,f.time);
  db.raw.exec("INSERT INTO hrm_payroll_run_people(id,run_id,person_id,employment_id,employee_code_snapshot,display_name_snapshot,gross_minor,deductions_minor,net_minor) VALUES('regular-person','regular','person','person-employment','TEST-person','TEST Employee',1000,0,1000)");
  await assert.rejects(publishPayrollRun(db,f.user,"TEST-ended-regular-publish","regular",1),{message:"conflict"});assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_payslips WHERE run_id='regular'").get()?.n,0);
 }finally{f.close()}
});


test("the staff inquiry queue uses the issued employee identity rather than exposing a database ID as its main label",async()=>{
 const f=await fixture();try{
  f.db.raw.prepare("INSERT INTO hrm_payroll_disputes(id,payslip_id,person_id,state,opened_by,created_at,updated_at) VALUES('TEST-long-inquiry-reference','old-slip','person','submitted','employee',?,?)").run(f.time,f.time);
  const rows=await listPayrollDisputes(f.db,f.user);assert.equal(rows.length,1);assert.equal(rows[0].employee_code,"TEST-issued-code");assert.equal(rows[0].display_name_snapshot,"TEST issued display name");assert.equal(rows[0].id,"TEST-long-inquiry-reference");
 }finally{f.close()}
});
