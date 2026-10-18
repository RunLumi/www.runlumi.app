import test from "node:test";
import assert from "node:assert/strict";
import { employeePerformanceView, performanceDates, performanceText, type PerformanceReview } from "../src/lib/hrm/performance.ts";
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
