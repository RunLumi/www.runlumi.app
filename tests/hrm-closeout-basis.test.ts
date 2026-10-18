import test from "node:test";
import assert from "node:assert/strict";
import { closeoutFixture } from "./support/hrm-closeout-fixture.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { digest } from "../src/lib/hrm/service.ts";
import { readCloseoutBasis } from "../src/lib/hrm/closeout-basis.ts";
const admin={...makeUser({id:"TEST-author",name:"TEST Author",email:"author@example.test"},false,["hrm_admin"]),hrmEnabled:true};
type Fixture=ReturnType<typeof closeoutFixture>;
async function payroll(f:Fixture,{id="run",net=1000,paid=1000,carry=0,previous=null,issuedTime="TEST-current-time",endsOn="2026-01-31",snapshotOverride={}}:{id?:string;net?:number;paid?:number;carry?:number;previous?:string|null;issuedTime?:string;endsOn?:string;snapshotOverride?:Record<string,unknown>}={}){
 if(!f.db.raw.prepare("SELECT 1 FROM hrm_time_periods WHERE id='period'").get()){
  f.db.raw.prepare(`INSERT INTO hrm_time_periods(id,period_key,starts_on,ends_on,state,snapshot_json,snapshot_checksum,locked_at,opened_by,opened_at,actor_id,created_at,updated_at) VALUES('period','TEST-FINAL','2026-01-01',?,'locked','{}','TEST-current-time',?,'TEST-author',?,'TEST-author',?,?)`).run(endsOn,f.time,f.time,f.time,f.time);
  f.db.raw.prepare(`INSERT INTO hrm_payroll_policy_versions(id,policy_key,revision,title_en,title_vi,legal_entity,currency,minor_unit_scale,components_json,state,created_by,created_at,actor_id,updated_at) VALUES('pay-policy','TEST-PAY',1,'TEST pay','TEST lương','TEST entity','VND',0,'[]','draft','TEST-author',?,'TEST-author',?)`).run(f.time,f.time);
 }
 f.db.raw.prepare(`INSERT INTO hrm_payroll_runs(id,period_key,period_id,starts_on,ends_on,policy_version_id,adjustment_of_payslip_id,state,created_by,created_at,actor_id,updated_at) VALUES(?,'TEST-FINAL','period','2026-01-01',?,'pay-policy',?,'draft','TEST-author',?,'TEST-author',?)`).run(id,endsOn,previous,f.time,f.time);
 f.db.raw.prepare("INSERT INTO hrm_payroll_run_people(id,run_id,person_id,employment_id,employee_code_snapshot,display_name_snapshot,gross_minor,deductions_minor,net_minor) VALUES(?,?,'person','person-employment','TEST-person','TEST Employee',?,0,?)").run(id+"-person",id,net,net);
 const issuedRun=JSON.stringify({version:1,time_snapshot_checksum:issuedTime,people:[{person_id:"TEST-OTHER-PERSON-NEVER-EXPORT",net_minor:999999}]});
 for(const state of ["calculated","reviewed","approved","published","closed"]){
  if(state==="calculated")f.db.raw.prepare("UPDATE hrm_payroll_runs SET state=?,snapshot_json=?,snapshot_checksum=? WHERE id=?").run(state,issuedRun,await digest(issuedRun),id);
  else f.db.raw.prepare("UPDATE hrm_payroll_runs SET state=? WHERE id=?").run(state,id);
 }
 const snapshot=JSON.stringify({version:1,policy:{id:"pay-policy",legal_entity:"TEST entity",currency:"VND",minor_unit_scale:0},employee_code:"TEST-person",display_name:"TEST Employee",correction_of_payslip_id:previous,paid_carryover_minor:carry,lines:[{direction:"earning",amount_minor:net,zero_reason:net===0?"TEST explicit zero":""}],gross_minor:net,deductions_minor:0,net_minor:net,...snapshotOverride});
 f.db.raw.prepare("INSERT INTO hrm_payslips(id,run_id,run_person_id,person_id,supersedes_payslip_id,state,snapshot_json,snapshot_checksum,issued_by,issued_at) VALUES(?,?,?,'person',?,'published',?,?,'TEST-reviewer',?)").run(id+"-slip",id,id+"-person",previous,snapshot,await digest(snapshot),f.time);
 if(previous)f.db.raw.prepare("UPDATE hrm_payslips SET state='superseded' WHERE id=?").run(previous);
 if(paid>0)f.db.raw.prepare("INSERT INTO hrm_payroll_payments(id,payslip_id,amount_minor,paid_on,payment_reference,evidence_reference,confirmed_by,confirmed_at,request_key) VALUES(?,?,?,'2026-01-31','TEST cash reference','TEST inspected evidence','TEST-reviewer',?,?)").run(id+"-payment",id+"-slip",paid,f.time,id+"-payment-request");
 return id+"-slip";
}

test("empty recorded payroll stays unknown; coherent snapshots omit private record values and other employees' run payloads",async()=>{
 const f=closeoutFixture();try{
  let result=await readCloseoutBasis(f.db,admin,f.caseId);assert.deepEqual(result.blockers,["no_payroll_recorded"]);assert.equal(result.hasPayroll,false);
  f.db.raw.prepare("INSERT INTO hrm_records(id,person_id,kind,data,state,actor_id,created_at,updated_at) VALUES('bank','person','bank','{\"account\":\"TEST-PRIVATE-BANK-NEVER-EXPORT\"}','verified','TEST-author',?,?)").run(f.time,f.time);
  await payroll(f);result=await readCloseoutBasis(f.db,admin,f.caseId);assert.deepEqual(result.blockers,[]);assert.equal(result.hasPayroll,true);
  const data=JSON.stringify(result.basis);assert.ok(!data.includes("TEST-PRIVATE-BANK-NEVER-EXPORT"));assert.ok(!data.includes("TEST-OTHER-PERSON-NEVER-EXPORT"));assert.ok(!data.includes("object_key"));assert.equal(result.basis.records.length,1);
  assert.equal((await readCloseoutBasis(f.db,admin,f.caseId)).checksum,result.checksum,"read-audit writes do not alter the financial fingerprint");
 }finally{f.close()}
});

test("both underpayment and overpayment block the own-employment financial basis",async()=>{
 for(const [paid,blocker]of [[999,"underpaid"],[1001,"overpaid"]] as const){const f=closeoutFixture();try{await payroll(f,{paid});assert.ok((await readCloseoutBasis(f.db,admin,f.caseId)).blockers.includes(blocker))}finally{f.close()}}
});

test("a malformed issued amount and missing final-period coverage never become zero or a completed review",async()=>{
 const f=closeoutFixture();try{
  await payroll(f,{endsOn:"2026-01-30",snapshotOverride:{net_minor:null}});const result=await readCloseoutBasis(f.db,admin,f.caseId);
  for(const blocker of ["issued_amount_unknown","issued_snapshot_invalid","payroll_amounts_unknown","final_period_missing"])assert.ok(result.blockers.includes(blocker),blocker);
 }finally{f.close()}
});

test("latest correction uses current locked time and carries actual ancestor receipts once, preserving historical snapshots",async()=>{
 const f=closeoutFixture();try{
  const original=await payroll(f,{paid:300,issuedTime:"TEST-old-time"});const middle=await payroll(f,{id:"middle",net:1200,paid:400,carry:300,previous:original,issuedTime:"TEST-old-time"});await payroll(f,{id:"final",net:1500,paid:800,carry:700,previous:middle});
  const result=await readCloseoutBasis(f.db,admin,f.caseId);assert.deepEqual(result.blockers,[]);assert.equal(result.basis.payslips.length,3);assert.equal(result.basis.payments.length,3);
  const old=result.basis.payslips.find(s=>s.id===original)!;assert.equal(old.state,"superseded");assert.equal(JSON.parse(String(old.snapshot_json)).net_minor,1000);
 }finally{f.close()}
});

test("invented correction carryover or stale latest time is refused",async()=>{
 const f=closeoutFixture();try{
  const original=await payroll(f,{paid:300});await payroll(f,{id:"correction",net:1200,paid:800,carry:400,previous:original,issuedTime:"TEST-stale-time"});
  const result=await readCloseoutBasis(f.db,admin,f.caseId);assert.ok(result.blockers.includes("carryover_unreconciled"));assert.ok(result.blockers.includes("time_source_changed"));
 }finally{f.close()}
});

test("an answered inquiry and a pending financial profile change block clearance without exposing their private text",async()=>{
 const f=closeoutFixture();try{
  const slip=await payroll(f);
  f.db.raw.prepare("INSERT INTO hrm_payroll_disputes(id,payslip_id,person_id,state,opened_by,created_at,updated_at) VALUES('claim',?,'person','answered','employee',?,?)").run(slip,f.time,f.time);
  f.db.raw.prepare("INSERT INTO hrm_change_requests(id,person_id,record_id,kind,data,expected_version,state,submitted_by,actor_id,created_at,updated_at) VALUES('change','person','','bank','{\"account\":\"TEST-PRIVATE-CHANGE-NEVER-EXPORT\"}',0,'submitted','employee','employee',?,?)").run(f.time,f.time);
  const result=await readCloseoutBasis(f.db,admin,f.caseId);assert.ok(result.blockers.includes("claim_unresolved"));assert.ok(result.blockers.includes("profile_change_pending"));assert.ok(!JSON.stringify(result.basis).includes("TEST-PRIVATE-CHANGE-NEVER-EXPORT"));
 }finally{f.close()}
});

test("a later receipt changes the revision/fingerprint and turns a previously balanced basis into overpayment",async()=>{
 const f=closeoutFixture();try{
  const slip=await payroll(f),before=await readCloseoutBasis(f.db,admin,f.caseId);assert.deepEqual(before.blockers,[]);
  f.db.raw.prepare("INSERT INTO hrm_payroll_payments(id,payslip_id,amount_minor,paid_on,payment_reference,evidence_reference,confirmed_by,confirmed_at,request_key) VALUES('later',?,1,'2026-01-31','TEST later receipt','TEST evidence','TEST-reviewer',?,'TEST-later-receipt-key')").run(slip,f.time);
  const after=await readCloseoutBasis(f.db,admin,f.caseId);assert.ok(after.blockers.includes("overpaid"));assert.ok(after.basis.source_revision>before.basis.source_revision);assert.notEqual(after.checksum,before.checksum);assert.equal(before.basis.payments.length,1);
 }finally{f.close()}
});

test("HR-only and payroll-preparation roles cannot read internal closeout bases; closed HRM stays closed",async()=>{
 const f=closeoutFixture();try{
  for(const role of ["employee","hrm_officer","people_manager","payroll_officer"] as const){const actor={...makeUser({id:role,name:role,email:role+"@example.test"},false,[role]),hrmEnabled:true};await assert.rejects(readCloseoutBasis(f.db,actor,f.caseId),{message:"forbidden"})}
  await assert.rejects(readCloseoutBasis(f.db,{...admin,hrmEnabled:false},f.caseId),{message:"hrm_closed"});await assert.rejects(readCloseoutBasis(f.db,admin,"missing-case"),{message:"not_found"});
 }finally{f.close()}
});

test("contact-only saves do not invalidate financial review or change its fingerprint",async()=>{
 const f=closeoutFixture();try{
  await payroll(f);const before=await readCloseoutBasis(f.db,admin,f.caseId);
  f.db.raw.exec("UPDATE hrm_employments SET work_phone='TEST new contact',status=status,legal_entity=legal_entity,version=version+1 WHERE id='person-employment'");
  f.db.raw.exec("UPDATE hrm_people SET preferred_name='TEST preferred name',legal_name=legal_name,employee_code=employee_code,user_id=user_id,version=version+1 WHERE id='person'");
  const after=await readCloseoutBasis(f.db,admin,f.caseId);assert.equal(after.basis.source_revision,before.basis.source_revision);assert.equal(after.checksum,before.checksum);assert.deepEqual(after.blockers,[]);
 }finally{f.close()}
});
