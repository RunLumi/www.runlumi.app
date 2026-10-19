import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./support/d1-sqlite.ts";
import { makeUser, type Role } from "../src/lib/workspace/roles.ts";
import { approvePayrollRun, calculatePayrollRun, createFinalPayrollRun, createPayrollRun, publishPayrollRun, removeEndedRunPerson, reviewPayrollRun, setPayrollLine } from "../src/lib/hrm/payroll.ts";

let seq = 0;
const key = (label: string) => `TEST-${label}-${String(++seq).padStart(4, "0")}-key`;
const user = (id: string, roles: Role[], admin = false) => ({ ...makeUser({ id, name: id, email: `${id}@example.test` }, admin, roles), hrmEnabled: true });

function fixture() {
  const db = sqliteD1(), raw = db.raw, time = new Date().toISOString();
  raw.prepare("UPDATE hrm_settings SET legal_entity='TEST entity',enabled=1,reviewed_by='TEST-owner',reviewed_at=? WHERE id=1").run(time);
  for (const person of ["p1", "p2"]) {
    raw.prepare("INSERT INTO hrm_people(id,employee_code,user_id,legal_name,actor_id,created_at,updated_at) VALUES(?,?,?,?,'TEST-author',?,?)").run(person, `TEST-${person.toUpperCase()}`, `TEST-user-${person}`, `TEST ${person}`, time, time);
    raw.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,started_on,actor_id,created_at,updated_at) VALUES(?,?,'TEST entity','active','2026-01-01','TEST-author',?,?)").run(`${person}-e`, person, time, time);
  }
  raw.prepare("INSERT INTO hrm_time_periods(id,period_key,starts_on,ends_on,state,snapshot_json,snapshot_checksum,locked_at,opened_by,opened_at,actor_id,created_at,updated_at) VALUES('period','TEST-2026-03','2026-03-01','2026-03-31','locked','{}','TEST-time',?,'TEST-author',?,'TEST-author',?,?)").run(time, time, time, time);
  // Owner-defined final settlement is an evidenced manual component: partial periods have no proration rule.
  const components = JSON.stringify([{ code: "settlement", title_en: "TEST final settlement", title_vi: "TEST quyết toán", direction: "earning", required: true, source_kind: "manual_evidence" }]);
  for (const id of ["policy", "other-policy"]) {
    raw.prepare("INSERT INTO hrm_payroll_policy_versions(id,policy_key,revision,title_en,title_vi,legal_entity,currency,minor_unit_scale,components_json,state,created_by,created_at,actor_id,updated_at) VALUES(?,?,1,'TEST pay','TEST lương','TEST entity','VND',0,?,'draft','TEST-author',?,'TEST-author',?)").run(id, `TEST-${id}`, components, time, time);
    raw.prepare("UPDATE hrm_payroll_policy_versions SET state='reviewed',reviewed_by='TEST-reviewer' WHERE id=?").run(id);
    raw.prepare("UPDATE hrm_payroll_policy_versions SET state='active',activated_by='TEST-reviewer' WHERE id=?").run(id);
  }
  const end = (person: string, on: string) => raw.prepare("UPDATE hrm_employments SET status='ended',ended_on=?,version=version+1 WHERE id=?").run(on, `${person}-e`);
  const version = (runId: string) => Number(raw.prepare("SELECT version FROM hrm_payroll_runs WHERE id=?").get(runId)!.version);
  const payroll = user("TEST-payroll", ["payroll_officer"]), payroll2 = user("TEST-payroll-2", ["payroll_officer"]), reviewer = user("TEST-reviewer", ["hrm_admin"]), system = user("TEST-system", [], true);
  const line = (runId: string, person: string, amount = "5000", actor = payroll) => setPayrollLine(db, actor, key("line"), { runId, personId: person, expectedVersion: version(runId), componentCode: "settlement", amountMinor: amount, sourceKind: "manual_evidence", sourceReference: `TEST-evidence-${person}`, zeroReason: "" });
  const issue = async (runId: string) => {
    await calculatePayrollRun(db, payroll, key("calc"), runId, version(runId));
    await reviewPayrollRun(db, reviewer, key("review"), runId, version(runId), "TEST independent review");
    await approvePayrollRun(db, reviewer, key("approve"), runId, version(runId), "TEST independent approval");
    await publishPayrollRun(db, system, key("publish"), runId, version(runId));
  };
  return { db, raw, end, version, payroll, payroll2, reviewer, system, line, issue, close: () => raw.close() };
}

test("an ended person no longer blocks the regular run: they are removed with an audit trail and the remover cannot approve", async () => {
  const f = fixture(); try {
    const regular = await createPayrollRun(f.db, f.payroll, key("run"), "policy", "period");
    await f.line(regular, "p1"); await f.line(regular, "p2");
    f.end("p1", "2026-03-15");
    await f.issue(regular).then(() => assert.fail("publish must refuse ended staff"), (error: Error) => assert.equal(error.message, "conflict"));
    await assert.rejects(removeEndedRunPerson(f.db, f.payroll2, key("remove-active"), { runId: regular, personId: "p2", expectedVersion: f.version(regular), reason: "TEST" }), { message: "payroll_run_person_not_removable" }, "active staff stay in the run");
    const remover = user("TEST-hr-remover", ["hrm_admin"]);
    await removeEndedRunPerson(f.db, remover, key("remove"), { runId: regular, personId: "p1", expectedVersion: f.version(regular), reason: "TEST left mid-month; pay through a final run" });
    assert.equal(f.raw.prepare("SELECT COUNT(*) AS n FROM hrm_payroll_run_people WHERE run_id=?").get(regular)?.n, 1);
    assert.equal(f.raw.prepare("SELECT state FROM hrm_payroll_runs WHERE id=?").get(regular)?.state, "draft", "removal invalidates calculation and approvals");
    await calculatePayrollRun(f.db, f.payroll, key("recalc"), regular, f.version(regular));
    await assert.rejects(reviewPayrollRun(f.db, remover, key("remover-review"), regular, f.version(regular), "TEST"), { message: "payroll_input_author" });
    await reviewPayrollRun(f.db, f.reviewer, key("review"), regular, f.version(regular), "TEST review");
    await approvePayrollRun(f.db, f.reviewer, key("approve"), regular, f.version(regular), "TEST approve");
    await publishPayrollRun(f.db, f.system, key("publish"), regular, f.version(regular));
    assert.deepEqual(f.raw.prepare("SELECT person_id FROM hrm_payslips WHERE run_id=?").all(regular).map((row) => row.person_id), ["p2"]);
  } finally { f.close(); }
});

test("a final run pays exactly one ended employment once per period under the normal controls", async () => {
  const f = fixture(); try {
    f.end("p1", "2026-03-15");
    await assert.rejects(createFinalPayrollRun(f.db, f.payroll, key("active"), { policyVersionId: "policy", periodId: "period", employeeCode: "TEST-P2", employmentId: "", reason: "TEST" }), { message: "payroll_final_employment_invalid" }, "active staff use the regular run");
    f.end("p2", "2026-02-27");
    await assert.rejects(createFinalPayrollRun(f.db, f.payroll, key("before"), { policyVersionId: "policy", periodId: "period", employeeCode: "TEST-P2", employmentId: "", reason: "TEST" }), { message: "payroll_final_employment_invalid" }, "the employment must overlap the period");
    const createKey = key("final");
    const finalRun = await createFinalPayrollRun(f.db, f.payroll, createKey, { policyVersionId: "policy", periodId: "period", employeeCode: "test-p1", employmentId: "", reason: "TEST final pay after leaving on 15 March" });
    assert.equal(await createFinalPayrollRun(f.db, f.payroll, createKey, { policyVersionId: "policy", periodId: "period", employeeCode: "test-p1", employmentId: "", reason: "TEST final pay after leaving on 15 March" }), finalRun, "a retry returns the same run");
    await assert.rejects(createFinalPayrollRun(f.db, f.payroll, key("second"), { policyVersionId: "other-policy", periodId: "period", employeeCode: "TEST-P1", employmentId: "", reason: "TEST" }), { message: "payroll_final_already_paid" }, "an open final run already covers the period");
    assert.throws(() => f.raw.prepare("INSERT INTO hrm_payroll_run_people(id,run_id,person_id,employment_id,employee_code_snapshot,display_name_snapshot) VALUES('extra',?,'p2','p2-e','TEST','TEST')").run(finalRun), /hrm_final_payroll_roster/, "a final run carries only its employment");
    await f.line(finalRun, "p1", "7000");
    await f.issue(finalRun);
    const slip = f.raw.prepare("SELECT person_id,state,json_extract(snapshot_json,'$.net_minor') AS net FROM hrm_payslips WHERE run_id=?").get(finalRun) as Record<string, unknown>;
    assert.deepEqual({ ...slip }, { person_id: "p1", state: "published", net: 7000 });
    await assert.rejects(createFinalPayrollRun(f.db, f.payroll, key("after"), { policyVersionId: "other-policy", periodId: "period", employeeCode: "TEST-P1", employmentId: "", reason: "TEST" }), { message: "payroll_final_already_paid" }, "a published final payslip blocks a second final pay; corrections are the way to change it");
    const slipId = String(f.raw.prepare("SELECT id FROM hrm_payslips WHERE run_id=?").get(finalRun)!.id);
    const correction = await createPayrollRun(f.db, f.payroll, key("correction"), "policy", "period", slipId, "TEST final settlement corrected");
    await f.line(correction, "p1", "7500");
    await f.issue(correction);
    assert.equal(f.raw.prepare("SELECT state FROM hrm_payslips WHERE id=?").get(slipId)?.state, "superseded", "a linked correction supersedes the final payslip");
    assert.throws(() => f.raw.prepare("UPDATE hrm_payroll_runs SET final_employment_id=NULL WHERE id=?").run(finalRun), /immutable_history/);
  } finally { f.close(); }
});

test("a final run is refused when a regular payslip already pays that employment for the period", async () => {
  const f = fixture(); try {
    const regular = await createPayrollRun(f.db, f.payroll, key("run"), "policy", "period");
    await f.line(regular, "p1"); await f.line(regular, "p2"); await f.issue(regular);
    f.end("p1", "2026-03-31");
    await assert.rejects(createFinalPayrollRun(f.db, f.payroll, key("double"), { policyVersionId: "other-policy", periodId: "period", employeeCode: "TEST-P1", employmentId: "", reason: "TEST" }), { message: "payroll_final_already_paid" });
  } finally { f.close(); }
});
