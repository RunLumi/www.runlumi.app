import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./support/d1-sqlite.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { closePayrollRun, payrollRunSettled } from "../src/lib/hrm/payroll.ts";

function fixture(snapshot:Record<string,unknown>={net_minor:1000},amount=1000){
 const db=sqliteD1(),time=new Date().toISOString();
 const user={...makeUser({id:"reviewer",name:"TEST Reviewer",email:"reviewer@example.test"},false,["hrm_admin"]),hrmEnabled:true};
 db.raw.prepare("INSERT INTO hrm_people(id,employee_code,legal_name,actor_id,created_at,updated_at) VALUES('person','TEST-1','TEST Employee','author',?,?)").run(time,time);
 db.raw.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,actor_id,created_at,updated_at) VALUES('employment','person','TEST entity','active','author',?,?)").run(time,time);
 db.raw.prepare("INSERT INTO hrm_time_periods(id,period_key,starts_on,ends_on,state,opened_by,opened_at,actor_id,created_at,updated_at) VALUES('period','TEST-2026-01','2026-01-01','2026-01-31','open','author',?,'author',?,?)").run(time,time,time);
 db.raw.prepare(`INSERT INTO hrm_payroll_policy_versions(id,policy_key,revision,title_en,title_vi,legal_entity,currency,minor_unit_scale,components_json,state,created_by,created_at,actor_id,updated_at)
 VALUES('policy','TEST-policy',1,'TEST','TEST','TEST entity','VND',0,'[]','draft','author',?,'author',?)`).run(time,time);
 function addRun(id:string,previous:string|null=null){
  db.raw.prepare(`INSERT INTO hrm_payroll_runs(id,period_key,period_id,starts_on,ends_on,policy_version_id,adjustment_of_payslip_id,state,snapshot_json,snapshot_checksum,created_by,created_at,actor_id,updated_at)
   VALUES(?,'TEST-2026-01','period','2026-01-01','2026-01-31','policy',?,'draft',NULL,NULL,'author',?,'author',?)`).run(id,previous,time,time);
  db.raw.prepare("INSERT INTO hrm_payroll_run_people(id,run_id,person_id,employment_id,employee_code_snapshot,display_name_snapshot) VALUES(?,?,'person','employment','TEST-1','TEST Employee')").run(id+"-person",id);
  for(const state of ["calculated","reviewed","approved","published"]){
   if(state==="calculated")db.raw.prepare("UPDATE hrm_payroll_runs SET state=?,snapshot_json='{}',snapshot_checksum='TEST' WHERE id=?").run(state,id);
   else db.raw.prepare("UPDATE hrm_payroll_runs SET state=? WHERE id=?").run(state,id);
  }
 }
 function slip(id:string,run:string,value:Record<string,unknown>,previous:string|null=null){
  db.raw.prepare("INSERT INTO hrm_payslips(id,run_id,run_person_id,person_id,supersedes_payslip_id,state,snapshot_json,snapshot_checksum,issued_by,issued_at) VALUES(?,?,?,'person',?,'published',?,'TEST','author',?)").run(id,run,run+"-person",previous,JSON.stringify(value),time);
  if(previous)db.raw.prepare("UPDATE hrm_payslips SET state='superseded' WHERE id=?").run(previous);
 }
 function payment(id:string,target:string,paid:number){
  db.raw.prepare("INSERT INTO hrm_payroll_payments(id,payslip_id,amount_minor,paid_on,payment_reference,evidence_reference,confirmed_by,confirmed_at,request_key) VALUES(?,?,?,'2026-01-31','TEST receipt','TEST reviewed evidence','reviewer',?,?)").run(id,target,paid,time,id);
 }
 addRun("run");slip("slip","run",snapshot);if(amount>0)payment("payment","slip",amount);
 const settled=(run="run")=>payrollRunSettled(db,user,run);
 const close=(key="TEST-close-payroll-run",run="run")=>closePayrollRun(db,user,key,run,1,"TEST independent reconciliation");
 return {db,user,addRun,slip,payment,settled,close};
}

test("closing requires exact reconciliation: both underpayment and overpayment remain open without audit or command",async()=>{
 for(const paid of [999,1001]){
  const f=fixture({net_minor:1000},paid);try{
   assert.equal(await f.settled(),false);
   await assert.rejects(f.close(),{message:"payroll_payment_unreconciled",status:409});
   assert.equal(f.db.raw.prepare("SELECT state FROM hrm_payroll_runs").get()?.state,"published");
   assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_commands").get()?.n,0);
   assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_audit WHERE action='payroll_run_closed'").get()?.n,0);
  }finally{f.db.raw.close()}
 }
 const f=fixture();try{
  assert.equal(await f.settled(),true);await f.close();await f.close();
  assert.equal(f.db.raw.prepare("SELECT state FROM hrm_payroll_runs").get()?.state,"closed");
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_audit WHERE action='payroll_run_closed'").get()?.n,1);
 }finally{f.db.raw.close()}
});

test("unknown, malformed and empty payroll never becomes a settled zero; explicit integer zero can reconcile",async()=>{
 for(const snapshot of [{},{net_minor:null},{net_minor:"0"},{net_minor:-1},{net_minor:0.5},{net_minor:9007199254740992},{net_minor:0,paid_carryover_minor:null},{net_minor:0,paid_carryover_minor:"0"},{net_minor:0,paid_carryover_minor:-1}]){
  const f=fixture(snapshot,0);try{assert.equal(await f.settled(),false,JSON.stringify(snapshot))}finally{f.db.raw.close()}
 }
 const f=fixture({net_minor:0},0);try{
  assert.equal(await f.settled(),true);assert.equal(await f.settled("missing"),false);
  f.addRun("empty","slip");assert.equal(await f.settled("empty"),false);
  await assert.rejects(f.close("TEST-empty-run-close","empty"),{message:"payroll_payment_unreconciled"});
 }finally{f.db.raw.close()}
});

test("successive corrections reconcile original and intermediate runs against the latest leaf, counting carryover once",async()=>{
 const f=fixture({net_minor:1000},300);try{
  f.addRun("correction","slip");f.slip("corrected","correction",{net_minor:1200,paid_carryover_minor:300},"slip");f.payment("payment-two","corrected",400);
  f.addRun("final","corrected");f.slip("final-slip","final",{net_minor:1500,paid_carryover_minor:700},"corrected");
  for(const run of ["run","correction","final"])assert.equal(await f.settled(run),false);
  f.payment("payment-three","final-slip",800);
  for(const run of ["run","correction","final"]){assert.equal(await f.settled(run),true);await f.close("TEST-close-"+run+"-key",run)}
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_payroll_runs WHERE state='closed'").get()?.n,3);
 }finally{f.db.raw.close()}
});

test("an overpaid correction leaf blocks closing its source run too",async()=>{
 const f=fixture({net_minor:1000},1000);try{
  f.addRun("correction","slip");f.slip("corrected","correction",{net_minor:900,paid_carryover_minor:1000},"slip");
  assert.equal(await f.settled(),false);assert.equal(await f.settled("correction"),false);
  await assert.rejects(f.close(),{message:"payroll_payment_unreconciled"});
 }finally{f.db.raw.close()}
});

test("the transaction rechecks reconciliation when another receipt arrives after preflight",async()=>{
 const f=fixture();try{
  const batch=f.db.batch.bind(f.db);let injected=false;
  f.db.batch=async statements=>{
   if(!injected){injected=true;f.payment("concurrent-payment","slip",1)}
   return batch(statements);
  };
  await assert.rejects(f.close(),{message:"conflict",status:409});
  assert.equal(injected,true);assert.equal(await f.settled(),false);
  assert.equal(f.db.raw.prepare("SELECT state FROM hrm_payroll_runs").get()?.state,"published");
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_audit WHERE action='payroll_run_closed'").get()?.n,0);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_commands").get()?.n,0);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_write_guards").get()?.n,0);
 }finally{f.db.raw.close()}
});
