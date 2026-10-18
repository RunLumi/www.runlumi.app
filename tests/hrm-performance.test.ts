import test from "node:test";
import assert from "node:assert/strict";
import { actOnPerformanceReview, createPerformanceReview, employeePerformanceView, getPerformanceReview, performanceDates, performanceOptions, performanceText, type PerformanceReview } from "../src/lib/hrm/performance.ts";
import { sqliteD1 } from "./support/d1-sqlite.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
const row:PerformanceReview={id:"test-review",person_id:"person",employment_id:"employment",legal_entity:"TEST entity",cycle_code:"TEST",title:"TEST review",period_start:"2026-01-01",period_end:"2026-03-31",due_on:"2026-04-15",reviewer_user_id:"manager",objectives:"TEST objectives",evidence_instructions:"TEST evidence requirements",state:"assessed",revision:3,self_assessment:"TEST self-assessment",self_evidence:"TEST self-evidence",assessment:"TEST confidential assessment",assessment_evidence:"TEST staff evidence",development_plan:"TEST private plan",employee_feedback:"",acknowledged_at:null,assessed_by:"manager",assessed_at:"2026-04-01T00:00:00Z",published_by:null,published_at:null,closed_by:null,closed_at:null,created_by:"hr",created_at:"2026-01-01T00:00:00Z",actor_id:"manager",updated_at:"2026-04-01T00:00:00Z",employee_user_id:"employee",employee_code:"TEST-1",display_name:"TEST employee"};
test("unpublished assessments stay private to the subject regardless of combined roles",()=>{
 const subject=makeUser({id:"employee",name:"TEST employee",email:"test@example.test"},false,["employee","hrm_admin"]);assert.equal(subject.can("hrm.performance.manage"),true);
 const safe=employeePerformanceView(row,subject.id);assert.equal(safe.state,"self_submitted");assert.equal(safe.assessment,"");assert.equal(safe.assessment_evidence,"");assert.equal(safe.development_plan,"");assert.equal(safe.assessed_by,null);assert.equal(safe.assessed_at,null);assert.equal(safe.self_assessment,row.self_assessment);assert.equal(row.assessment,"TEST confidential assessment","masking must not mutate the source row");
 for(const state of ["published","responded","closed"] as const)assert.equal(employeePerformanceView({...row,state},subject.id).assessment,row.assessment);
 assert.equal(employeePerformanceView(row,"hr").assessment,row.assessment);
});
test("performance roles remain independent and have no implicit payroll/access authority",()=>{
 const make=(role:Parameters<typeof makeUser>[2])=>makeUser({id:"test",name:"TEST",email:"test@example.test"},false,role);
 const employee=make(["employee"]),manager=make(["people_manager"]),officer=make(["hrm_officer"]),admin=make(["hrm_admin"]);
 assert.equal(employee.can("hrm.performance.self"),true);assert.equal(employee.can("hrm.performance.review"),false);assert.equal(manager.can("hrm.performance.review"),true);assert.equal(manager.can("hrm.performance.manage"),false);assert.equal(manager.can("hrm.performance.approve"),false);assert.equal(officer.can("hrm.performance.manage"),true);assert.equal(officer.can("hrm.performance.approve"),false);assert.equal(admin.can("hrm.performance.approve"),true);assert.equal(admin.can("users.manage"),false);
 for(const role of ["hr","finance","payroll_officer","sales_manager","partner"] as const)for(const permission of ["hrm.performance.self","hrm.performance.review","hrm.performance.manage","hrm.performance.approve"] as const)assert.equal(make([role]).can(permission),false);
});
test("review dates reject impossible calendars and due dates before the period ends",()=>{
 assert.doesNotThrow(()=>performanceDates("2024-02-01","2024-02-29","2024-03-15"));
 for(const dates of [["2026-02-29","2026-03-31","2026-04-15"],["2026-04-01","2026-03-31","2026-04-15"],["2026-01-01","2026-03-31","2026-03-30"],["","2026-03-31","2026-04-15"]])assert.throws(()=>performanceDates(...dates as [string,string,string]));
 assert.throws(()=>performanceText(" ",4000));assert.throws(()=>performanceText("x".repeat(4001),4000));assert.equal(performanceText("  facts  ",4000),"facts");
});

test("real SQL guards reject revoked authority, preserve retry semantics and freeze published content",async()=>{
 const db=sqliteD1(),content=sqliteD1("content"),time=new Date().toISOString();
 const account=(id:string,role:Parameters<typeof makeUser>[2])=>({...makeUser({id,name:id,email:id+"@example.test"},false,role),hrmEnabled:true});
 const hr=account("perf_hr",["hrm_officer"]),employee=account("perf_employee",["employee"]),reviewer=account("perf_manager",["people_manager"]),approver=account("perf_admin",["hrm_admin"]);
 try{
  for(const [user,role] of [[hr,"hrm_officer"],[employee,"employee"],[reviewer,"people_manager"],[approver,"hrm_admin"]] as const){
   db.raw.prepare("INSERT INTO workspace_members(user_id,granted_by,created_at,updated_at) VALUES(?,'test-owner',?,?)").run(user.id,time,time);
   db.raw.prepare("INSERT INTO workspace_roles(user_id,role,granted_by,granted_at) VALUES(?,?,'test-owner',?)").run(user.id,role,time);
   content.raw.prepare("INSERT INTO users(id,email,name) VALUES(?,?,?)").run(user.id,user.email,user.name);
  }
  db.raw.prepare("UPDATE hrm_settings SET enabled=1,legal_entity='TEST entity',purpose='TEST only',retention_policy='TEST only',policy_reference='TEST only',reviewed_by='test-owner',reviewed_at=? WHERE id=1").run(time);
  db.raw.prepare("INSERT INTO hrm_people(id,employee_code,user_id,legal_name,actor_id,created_at,updated_at) VALUES('perf_person','TEST-PERF',?,'TEST Employee',?,?,?)").run(employee.id,hr.id,time,time);
  db.raw.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,started_on,actor_id,created_at,updated_at) VALUES('perf_employment','perf_person','TEST entity','active','2026-01-01',?,?,?)").run(hr.id,time,time);
  const input={personId:"perf_person",cycleCode:"TEST-Q1",title:"TEST review",periodStart:"2026-01-01",periodEnd:"2026-03-31",dueOn:"2026-04-15",reviewerId:reviewer.id,objectives:"TEST measurable objective",evidenceInstructions:"TEST facts with dates"};
  const reviewId=await createPerformanceReview(db,content,hr,"test_perf_create_key",input);assert.equal(await createPerformanceReview(db,content,hr,"test_perf_create_key",input),reviewId);
  const options=await performanceOptions(db,hr);assert.equal(options.people.length,1);assert.equal(options.reviewers.some(row=>row.user_id===employee.id),false);assert.equal(options.reviewers.some(row=>row.user_id===reviewer.id),true);
  content.raw.prepare("UPDATE users SET disabled=1 WHERE id=?").run(reviewer.id);
  await assert.rejects(createPerformanceReview(db,content,hr,"test_perf_disabled_account",{...input,cycleCode:"TEST-Q2"}),{message:"invalid_account"});content.raw.prepare("UPDATE users SET disabled=0 WHERE id=?").run(reviewer.id);
  await actOnPerformanceReview(db,content,employee,"test_perf_self_key",{action:"submit_self",reviewId,revision:1,assessment:"TEST self assessment",evidence:"TEST dated evidence"});
  const assessment={action:"assess" as const,reviewId,revision:2,assessment:"TEST private staff assessment",evidence:"TEST private staff evidence",developmentPlan:"TEST employee action, manager support, due date and evidence"};
  db.raw.prepare("UPDATE workspace_members SET enabled=0 WHERE user_id=?").run(reviewer.id);
  await assert.rejects(actOnPerformanceReview(db,content,reviewer,"test_perf_assessment_key",assessment),{message:"conflict"});
  assert.equal(db.raw.prepare("SELECT state FROM hrm_performance_reviews WHERE id=?").get(reviewId)?.state,"self_submitted");assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_performance_events WHERE review_id=?").get(reviewId)?.n,2);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_commands WHERE actor_id=? AND request_key='test_perf_assessment_key'").get(reviewer.id)?.n,0);
  db.raw.prepare("UPDATE workspace_members SET enabled=1 WHERE user_id=?").run(reviewer.id);
  await actOnPerformanceReview(db,content,reviewer,"test_perf_assessment_key",assessment);await actOnPerformanceReview(db,content,reviewer,"test_perf_assessment_key",assessment);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_audit WHERE action='hrm_performance_assess' AND target_id=?").get(reviewId)?.n,1);
  const privateView=await getPerformanceReview(db,employee,reviewId);assert.equal(privateView.review.assessment,"");assert.ok(privateView.events.every(event=>event.event_type!=="assess"));
  await assert.rejects(actOnPerformanceReview(db,content,reviewer,"test_perf_self_publish",{action:"publish",reviewId,revision:3,reason:"TEST self approval"}),{message:"performance_self_review"});
  await actOnPerformanceReview(db,content,approver,"test_perf_publish_key",{action:"publish",reviewId,revision:3,reason:"TEST independent review"});
  assert.throws(()=>db.raw.prepare("UPDATE hrm_performance_reviews SET state='responded',acknowledged_at=?,revision=revision+1,assessment='TEST tampered' WHERE id=?").run(time,reviewId),/immutable_history/);
  await actOnPerformanceReview(db,content,employee,"test_perf_response_key",{action:"respond",reviewId,revision:4,acknowledged:true,feedback:"TEST I disagree and request coaching"});
  const response=db.raw.prepare("SELECT acknowledged_at,employee_feedback FROM hrm_performance_reviews WHERE id=?").get(reviewId);
  await actOnPerformanceReview(db,content,approver,"test_perf_close_key",{action:"close",reviewId,revision:5,reason:"TEST close preserving feedback"});assert.deepEqual(db.raw.prepare("SELECT acknowledged_at,employee_feedback FROM hrm_performance_reviews WHERE id=?").get(reviewId),response);
  assert.throws(()=>db.raw.prepare("DELETE FROM hrm_performance_events WHERE review_id=?").run(reviewId),/immutable_history/);
 }finally{db.raw.close();content.raw.close()}
});
