import test from "node:test";
import assert from "node:assert/strict";
import { HrmError } from "../src/lib/hrm/fields.ts";
import { exportOwnHrmProfile } from "../src/lib/hrm/profile-export.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { sqliteD1 } from "./support/d1-sqlite.ts";

test("HRM self export includes only the linked employee's attendance, leave and evidence metadata",async()=>{
 const db=sqliteD1(),time=new Date().toISOString();
 const employee={...makeUser({id:"time_leave_export_employee",name:"TEST employee",email:"employee@example.test"},false,["employee"]),hrmEnabled:true};
 const other={...makeUser({id:"time_leave_export_other",name:"TEST other",email:"other@example.test"},false,["employee"]),hrmEnabled:true};
 try{
  for(const [personId,employmentId,user,code,name] of [["time_leave_export_person","time_leave_export_employment",employee,"TEST-TIME-001","TEST Export Employee"],["time_leave_export_other_person","time_leave_export_other_employment",other,"TEST-TIME-002","TEST Other Employee"]] as const){
   db.raw.prepare("INSERT INTO hrm_people(id,employee_code,user_id,legal_name,actor_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(personId,code,user.id,name,"hr",time,time);
   db.raw.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,started_on,actor_id,created_at,updated_at) VALUES(?,?,'TEST entity','active','2026-01-01','hr',?,?)").run(employmentId,personId,time,time);
  }
  db.raw.prepare(`INSERT INTO hrm_work_calendar_versions(id,calendar_key,version_number,title_en,title_vi,legal_entity,timezone,schedule_json,state,created_by,created_at,version,actor_id,updated_at)
   VALUES('time_leave_export_calendar','test-export',1,'TEST calendar','TEST lịch','TEST entity','Asia/Ho_Chi_Minh','{}','active','hr',?,1,'hr',?)`).run(time,time);
  for(const [personId,employmentId,assignmentId] of [["time_leave_export_person","time_leave_export_employment","time_leave_export_assignment"],["time_leave_export_other_person","time_leave_export_other_employment","time_leave_export_other_assignment"]] as const){
   db.raw.prepare(`INSERT INTO hrm_work_assignments(id,person_id,employment_id,calendar_version_id,effective_from,assigned_by,assigned_at,actor_id,created_at,updated_at)
    VALUES(?,?,?,'time_leave_export_calendar','2026-01-01','hr',?,'hr',?,?)`).run(assignmentId,personId,employmentId,time,time,time);
  }
  db.raw.prepare(`INSERT INTO hrm_time_periods(id,period_key,starts_on,ends_on,state,opened_by,opened_at,version,actor_id,created_at,updated_at)
   VALUES('time_leave_export_period','TEST-PERIOD','2026-10-15','2026-10-15','open','hr',?,1,'hr',?,?)`).run(time,time,time);
  const addEntry=db.raw.prepare(`INSERT INTO hrm_time_entries(id,period_id,person_id,employment_id,assignment_id,calendar_version_id,work_date,shift_key,planned_minutes,check_in_utc,check_out_utc,break_minutes,worked_minutes,overtime_minutes,overtime_state,overtime_reason,source,state,submitted_by,submitted_at,reviewed_by,reviewed_at,review_reason,version,actor_id,created_at,updated_at)
   VALUES(?,'time_leave_export_period',?,?,?,'time_leave_export_calendar','2026-10-15','day',540,'2026-10-15T02:00:00Z','2026-10-15T11:00:00Z',60,480,0,'none',?,'employee','approved',?,?,?,? ,?,1,?,?,?)`);
  addEntry.run("time_leave_export_entry","time_leave_export_person","time_leave_export_employment","time_leave_export_assignment","TEST-PRIVATE-OT-REVIEW","time_leave_export_employee",time,"TEST-REVIEWER-IDENTITY",time,"TEST-EMPLOYEE-READABLE-TIME-REASON","time_leave_export_reviewer",time,time);
  addEntry.run("time_leave_export_other_entry","time_leave_export_other_person","time_leave_export_other_employment","time_leave_export_other_assignment","TEST-OTHER-TIME-SECRET","time_leave_export_other",time,"TEST-OTHER-REVIEWER",time,"TEST-OTHER-TIME-SECRET","time_leave_export_other_reviewer",time,time);
  const addAdjustment=db.raw.prepare(`INSERT INTO hrm_time_adjustments(id,entry_id,expected_entry_version,old_check_in_utc,old_check_out_utc,old_break_minutes,proposed_check_in_utc,proposed_check_out_utc,proposed_break_minutes,proposed_worked_minutes,reason,state,submitted_by,submitted_at,reviewed_by,reviewed_at,review_reason,version,actor_id,created_at,updated_at)
   VALUES(?,?,1,'2026-10-15T02:00:00Z','2026-10-15T11:00:00Z',60,'2026-10-15T02:05:00Z','2026-10-15T11:00:00Z',60,475,?,'approved',?,?,?, ?,?,1,?,?,?)`);
  addAdjustment.run("time_leave_export_adjustment","time_leave_export_entry","TEST-OWN-TIME-ADJUSTMENT-REASON",employee.id,time,"TEST-REVIEWER-IDENTITY",time,"TEST-INTERNAL-TIME-REVIEW",employee.id,time,time);
  addAdjustment.run("time_leave_export_other_adjustment","time_leave_export_other_entry","TEST-OTHER-TIME-SECRET",other.id,time,"TEST-OTHER-REVIEWER",time,"TEST-OTHER-TIME-SECRET",other.id,time,time);

  const rules=[
   {key:"annual",title_en:"Annual leave",title_vi:"Nghỉ phép năm",paid:true,annual_grant_minutes:2880,monthly_accrual_minutes:0,prorate_on_start:false,carryover_limit_minutes:0,max_negative_minutes:0,evidence_required:false,exclude_holidays:false,basis:"TEST approved basis"},
   {key:"sick",title_en:"Sick leave",title_vi:"Nghỉ ốm",paid:false,annual_grant_minutes:0,monthly_accrual_minutes:0,prorate_on_start:false,carryover_limit_minutes:0,max_negative_minutes:0,evidence_required:true,exclude_holidays:false,basis:"TEST evidence basis"},
  ];
  db.raw.prepare(`INSERT INTO hrm_leave_policy_versions(id,policy_key,version_number,title_en,title_vi,rules_json,state,created_by,created_at,reviewed_by,reviewed_at,activated_by,activated_at,version,actor_id,updated_at)
   VALUES('time_leave_export_policy','test-export-policy',1,'TEST leave policy','TEST chính sách nghỉ',?,'active','hr',?,'reviewer',?,'reviewer',?,1,'reviewer',?)`).run(JSON.stringify(rules),time,time,time,time);
  for(const [personId,employmentId,assignmentId] of [["time_leave_export_person","time_leave_export_employment","time_leave_export_leave_assignment"],["time_leave_export_other_person","time_leave_export_other_employment","time_leave_export_other_leave_assignment"]] as const){
   db.raw.prepare(`INSERT INTO hrm_leave_policy_assignments(id,person_id,employment_id,policy_version_id,effective_from,assigned_by,assigned_at,version,actor_id,created_at,updated_at)
    VALUES(?,?,?,'time_leave_export_policy','2026-01-01','hr',?,1,'hr',?,?)`).run(assignmentId,personId,employmentId,time,time,time);
  }
  const addRequest=db.raw.prepare(`INSERT INTO hrm_leave_requests(id,person_id,employment_id,assignment_id,policy_version_id,leave_type_key,starts_on,ends_on,portion,requested_minutes,calculation_json,private_reason,cancellation_reason,handoff_note,state,submitted_by,submitted_at,reviewed_by,reviewed_at,review_reason,version,actor_id,created_at,updated_at)
   VALUES(?,?,?,?, 'time_leave_export_policy',?,'2026-10-20','2026-10-20','full',?,'{}',?,NULL,? ,?, ?,?, ?,?, ?,1,?,?,?)`);
  addRequest.run("time_leave_export_annual_pending","time_leave_export_person","time_leave_export_employment","time_leave_export_leave_assignment","annual",240,"TEST-OWN-PRIVATE-LEAVE-REASON","TEST-OWN-HANDOFF","pending_approval",employee.id,time,null,null,null,employee.id,time,time);
  addRequest.run("time_leave_export_annual_approved","time_leave_export_person","time_leave_export_employment","time_leave_export_leave_assignment","annual",480,"","","approved",employee.id,time,"TEST-REVIEWER-IDENTITY",time,"TEST-EMPLOYEE-READABLE-LEAVE-DECISION",employee.id,time,time);
  addRequest.run("time_leave_export_sick_pending","time_leave_export_person","time_leave_export_employment","time_leave_export_leave_assignment","sick",120,"","","pending_approval",employee.id,time,null,null,null,employee.id,time,time);
  addRequest.run("time_leave_export_other_request","time_leave_export_other_person","time_leave_export_other_employment","time_leave_export_other_leave_assignment","annual",600,"TEST-OTHER-LEAVE-SECRET","","pending_approval",other.id,time,null,null,null,other.id,time,time);
  db.raw.prepare(`INSERT INTO hrm_leave_ledger(id,person_id,employment_id,assignment_id,policy_version_id,leave_type_key,event_kind,minutes,period_key,reference_id,reason,actor_id,created_at)
   VALUES('time_leave_export_ledger','time_leave_export_person','time_leave_export_employment','time_leave_export_leave_assignment','time_leave_export_policy','annual','manual_adjustment',2880,'2026','time_leave_export_ledger','TEST-INTERNAL-LEDGER-REASON','hr',?)`).run(time);
  db.raw.prepare(`INSERT INTO hrm_leave_ledger(id,person_id,employment_id,assignment_id,policy_version_id,leave_type_key,event_kind,minutes,period_key,reference_id,reason,actor_id,created_at)
   VALUES('time_leave_export_other_ledger','time_leave_export_other_person','time_leave_export_other_employment','time_leave_export_other_leave_assignment','time_leave_export_policy','annual','manual_adjustment',50000,'2026','time_leave_export_other_ledger','TEST-OTHER-LEAVE-SECRET','hr',?)`).run(time);
  db.raw.prepare(`INSERT INTO hrm_files(id,person_id,kind,object_key,original_name,mime_type,size_bytes,checksum,state,uploaded_by,reviewed_by,reviewed_at,review_reason,version,created_at,updated_at)
   VALUES('time_leave_export_evidence','time_leave_export_person','leave_evidence','hrm/time_leave_export_person/leave-evidence/time_leave_export_evidence','TEST own leave.pdf','application/pdf',21,'TEST-LEAVE-CHECKSUM','quarantined',?,'TEST-REVIEWER-IDENTITY',?, 'TEST-INTERNAL-EVIDENCE-REVIEW',1,?,?)`).run(employee.id,time,time,time);
  db.raw.prepare(`INSERT INTO hrm_leave_evidence_links(id,leave_request_id,file_id,revision_no,person_id,uploaded_by,actor_id,created_at)
   VALUES('time_leave_export_evidence_link','time_leave_export_sick_pending','time_leave_export_evidence',1,'time_leave_export_person',?, ?,?)`).run(employee.id,employee.id,time);
  db.raw.prepare(`INSERT INTO hrm_leave_events(id,leave_request_id,action,actor_id,detail_json,created_at)
   VALUES('time_leave_export_internal_event','time_leave_export_annual_approved','reviewed','TEST-REVIEWER-IDENTITY',?,?)`).run(JSON.stringify({reason:"TEST-INTERNAL-LEAVE-EVENT"}),time);

  const result=await exportOwnHrmProfile(db,employee),bundle=JSON.parse(result.body) as {
   schema_version:number;export_scope:string;time_entries:Array<Record<string,unknown>>;time_adjustments:Array<Record<string,unknown>>;leave_requests:Array<Record<string,unknown>>;leave_balances:Array<Record<string,unknown>>;included:string[];excluded:string[];
  };
  assert.equal(bundle.schema_version,5);assert.equal(bundle.export_scope,"self_profile_legal_coi_requests_onboarding_time_leave_snapshot");
  assert.equal(bundle.time_entries.length,1);assert.equal(bundle.time_entries[0].work_date,"2026-10-15");assert.equal(bundle.time_entries[0].period_key,"TEST-PERIOD");assert.equal(bundle.time_entries[0].review_reason,"TEST-EMPLOYEE-READABLE-TIME-REASON");assert.ok(!("id" in bundle.time_entries[0]));assert.ok(!("reviewed_by" in bundle.time_entries[0]));assert.ok(!("overtime_reason" in bundle.time_entries[0]));
  assert.equal(bundle.time_adjustments.length,1);assert.equal(bundle.time_adjustments[0].reason,"TEST-OWN-TIME-ADJUSTMENT-REASON");assert.equal(bundle.time_adjustments[0].entry_ref,bundle.time_entries[0].entry_ref);assert.ok(!("id" in bundle.time_adjustments[0]));assert.ok(!("reviewed_by" in bundle.time_adjustments[0]));assert.ok(!("review_reason" in bundle.time_adjustments[0]));
  const pendingLeave=bundle.leave_requests.find(row=>row.leave_type_key==="annual"&&row.state==="pending_approval"),approvedLeave=bundle.leave_requests.find(row=>row.leave_type_key==="annual"&&row.state==="approved"),sickLeave=bundle.leave_requests.find(row=>row.leave_type_key==="sick");
  assert.ok(pendingLeave);assert.equal(pendingLeave.private_reason,"TEST-OWN-PRIVATE-LEAVE-REASON");assert.equal(pendingLeave.handoff_note,"TEST-OWN-HANDOFF");assert.ok(!("id" in pendingLeave));
  assert.ok(approvedLeave);assert.equal(approvedLeave.review_reason,"TEST-EMPLOYEE-READABLE-LEAVE-DECISION");assert.equal(approvedLeave.leave_title_vi,"Nghỉ phép năm");
  assert.ok(sickLeave);assert.deepEqual(sickLeave.evidence,{status:"quarantined",reviewed_at:null,file:{original_name:"TEST own leave.pdf",mime_type:"application/pdf",size_bytes:21,checksum:"TEST-LEAVE-CHECKSUM",created_at:time,object_available:true}});
  assert.deepEqual(bundle.leave_balances,[{leave_type_key:"annual",balance_minutes:2880,pending_minutes:240,available_minutes:2640},{leave_type_key:"sick",balance_minutes:0,pending_minutes:120,available_minutes:-120}]);
  for(const secret of ["TEST-OTHER-TIME-SECRET","TEST-OTHER-LEAVE-SECRET","TEST-INTERNAL-TIME-REVIEW","TEST-INTERNAL-EVIDENCE-REVIEW","TEST-INTERNAL-LEAVE-EVENT","TEST-INTERNAL-LEDGER-REASON","TEST-REVIEWER-IDENTITY","time_leave_export_person/leave-evidence/"]){assert.ok(!result.body.includes(secret),`export leaked ${secret}`)}
  assert.ok(bundle.included.includes("attendance_entries")&&bundle.included.includes("leave_requests")&&bundle.included.includes("leave_balance_summary"));assert.ok(bundle.excluded.includes("file_contents")&&bundle.excluded.includes("reviewer_identity"));assert.ok(!bundle.excluded.includes("attendance")&&!bundle.excluded.includes("leave"));
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_audit WHERE actor_id=? AND person_id='time_leave_export_person' AND action='employee_profile_exported'").get(employee.id)?.n,1);
  const timeDenied={...employee,can:(permission:Parameters<typeof employee.can>[0])=>permission!=="hrm.time.self"&&employee.can(permission)};
  const leaveDenied={...employee,can:(permission:Parameters<typeof employee.can>[0])=>permission!=="hrm.leave.self"&&employee.can(permission)};
  await assert.rejects(exportOwnHrmProfile(db,timeDenied),error=>error instanceof HrmError&&error.message==="forbidden");
  await assert.rejects(exportOwnHrmProfile(db,leaveDenied),error=>error instanceof HrmError&&error.message==="forbidden");
 }finally{db.raw.close()}
});
