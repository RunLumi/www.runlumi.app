import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./support/d1-sqlite.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { assignWorkCalendar } from "../src/lib/hrm/time-leave.ts";
function fixture(periodState="locked"){
 const db=sqliteD1(),time=new Date().toISOString(),user={...makeUser({id:"TEST-hr",name:"TEST HR",email:"hr@example.test"},false,["hrm_admin"]),hrmEnabled:true};
 db.raw.prepare("INSERT INTO hrm_people(id,employee_code,legal_name,actor_id,created_at,updated_at) VALUES('TEST-person','TEST-BOUNDED','TEST Employee','TEST-hr',?,?)").run(time,time);
 db.raw.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,started_on,actor_id,created_at,updated_at) VALUES('TEST-employment','TEST-person','TEST entity','active','2026-01-01','TEST-hr',?,?)").run(time,time);
 db.raw.prepare(`INSERT INTO hrm_work_calendar_versions(id,calendar_key,version_number,title_en,title_vi,legal_entity,timezone,schedule_json,state,created_by,created_at,actor_id,updated_at) VALUES('TEST-calendar','TEST-BOUNDED',1,'TEST calendar','TEST lịch','TEST entity','Asia/Ho_Chi_Minh','{}','active','TEST-author',?,'TEST-author',?)`).run(time,time);
 db.raw.prepare("INSERT INTO hrm_time_periods(id,period_key,starts_on,ends_on,state,snapshot_json,snapshot_checksum,locked_at,opened_by,opened_at,actor_id,created_at,updated_at) VALUES('TEST-period','TEST-LOCKED','2026-02-01','2026-02-28',?,'{}','TEST-hash',?,'TEST-hr',?,'TEST-hr',?,?)").run(periodState,time,time,time,time);
 return {db,user};
}
test("bounded historical creation ends before an existing locked period and stays idempotent",async()=>{
 const f=fixture();try{
  const id=await assignWorkCalendar(f.db,f.user,"TEST-historical-calendar","TEST-person","TEST-calendar","2026-01-01","2026-01-02");assert.equal(await assignWorkCalendar(f.db,f.user,"TEST-historical-calendar","TEST-person","TEST-calendar","2026-01-01","2026-01-02"),id);assert.equal(f.db.raw.prepare("SELECT effective_to FROM hrm_work_assignments WHERE id=?").get(id)?.effective_to,"2026-01-02");
  await assert.rejects(assignWorkCalendar(f.db,f.user,"TEST-overlapping-calendar","TEST-person","TEST-calendar","2026-01-02","2026-01-03"),{message:"conflict"});
 }finally{f.db.raw.close()}
});
test("unbounded and bounded calendar assignments still cannot alter reviewing, locked or reopen-requested periods",async()=>{
 for(const state of ["reviewing","locked","reopen_requested"]){const f=fixture(state);try{
  await assert.rejects(assignWorkCalendar(f.db,f.user,"TEST-unbounded-calendar","TEST-person","TEST-calendar","2026-01-01"),{message:"time_period_locked"});
  await assert.rejects(assignWorkCalendar(f.db,f.user,"TEST-bounded-crossing-calendar","TEST-person","TEST-calendar","2026-01-01","2026-02-01"),{message:"time_period_locked"});
  await assert.rejects(assignWorkCalendar(f.db,f.user,"TEST-reversed-calendar","TEST-person","TEST-calendar","2026-01-02","2026-01-01"),{message:"invalid_date"});assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_work_assignments").get()?.n,0);
 }finally{f.db.raw.close()}}
});

test("a bounded historical leave policy grants once and stays outside unrelated protected periods",async()=>{
 const {assignLeavePolicy}=await import("../src/lib/hrm/time-leave.ts");
 for(const state of ["reviewing","locked","reopen_requested","reopened"]){const f=fixture(state);try{
  const time=new Date().toISOString(),rules=[{key:"annual",title_en:"TEST annual",title_vi:"TEST phép",paid:true,annual_grant_minutes:960,monthly_accrual_minutes:0,prorate_on_start:false,carryover_limit_minutes:0,max_negative_minutes:0,evidence_required:false,exclude_holidays:true,basis:"TEST configured synthetic entitlement"}];
  f.db.raw.prepare("INSERT INTO hrm_leave_policy_versions(id,policy_key,version_number,title_en,title_vi,rules_json,state,created_by,created_at,actor_id,updated_at) VALUES('TEST-leave','TEST-leave',1,'TEST','TEST',?,'active','TEST-owner',?,'TEST-owner',?)").run(JSON.stringify(rules),time,time);
  await assert.rejects(assignLeavePolicy(f.db,f.user,"TEST-unbounded-leave","TEST-person","TEST-leave","2026-01-01"),{message:"conflict"});
  await assert.rejects(assignLeavePolicy(f.db,f.user,"TEST-crossing-leave","TEST-person","TEST-leave","2026-01-01","2026-02-01"),{message:"conflict"});
  const id=await assignLeavePolicy(f.db,f.user,"TEST-bounded-leave","TEST-person","TEST-leave","2026-01-01","2026-01-02");assert.equal(await assignLeavePolicy(f.db,f.user,"TEST-bounded-leave","TEST-person","TEST-leave","2026-01-01","2026-01-02"),id);
  assert.equal(f.db.raw.prepare("SELECT effective_to FROM hrm_leave_policy_assignments WHERE id=?").get(id)?.effective_to,"2026-01-02");assert.equal(f.db.raw.prepare("SELECT SUM(minutes) AS minutes FROM hrm_leave_ledger WHERE assignment_id=?").get(id)?.minutes,960);
 }finally{f.db.raw.close()}}
});
