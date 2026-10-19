import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./support/d1-sqlite.ts";
import { makeUser, type Role } from "../src/lib/workspace/roles.ts";
import { createCompensation, reviewCompensation, type CompensationInput } from "../src/lib/hrm/compensation.ts";
import { approvePayrollRun, calculatePayrollRun, createPayrollRun, publishPayrollRun, reviewPayrollRun, setPayrollLine } from "../src/lib/hrm/payroll.ts";

const user = (id: string, roles: Role[], admin = false) => ({ ...makeUser({ id, name: id, email: `${id}@example.test` }, admin, roles), hrmEnabled: true });
let keySeq = 0;
const key = (label: string) => `TEST-${label}-${String(++keySeq).padStart(4, "0")}-key`;

function fixture() {
  const db = sqliteD1(), time = new Date().toISOString(), raw = db.raw;
  raw.prepare("UPDATE hrm_settings SET legal_entity='TEST entity',enabled=1,reviewed_by='TEST-owner',reviewed_at=? WHERE id=1").run(time);
  for (const [person, userId, start] of [["p1", "TEST-employee", "2026-01-01"], ["p2", "TEST-admin-2", "2026-01-01"]] as const) {
    raw.prepare("INSERT INTO hrm_people(id,employee_code,user_id,legal_name,actor_id,created_at,updated_at) VALUES(?,?,?,?,'TEST-author',?,?)").run(person, `TEST-${person.toUpperCase()}`, userId, `TEST ${person}`, time, time);
    raw.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,started_on,actor_id,created_at,updated_at) VALUES(?,?,'TEST entity','active',?,'TEST-author',?,?)").run(`${person}-e`, person, start, time, time);
  }
  raw.prepare("INSERT INTO hrm_time_periods(id,period_key,starts_on,ends_on,state,snapshot_json,snapshot_checksum,locked_at,opened_by,opened_at,actor_id,created_at,updated_at) VALUES('period','TEST-2026-03','2026-03-01','2026-03-31','locked','{}','TEST-time',?,'TEST-author',?,'TEST-author',?,?)").run(time, time, time, time);
  const components = JSON.stringify([{ code: "base", title_en: "TEST base", title_vi: "TEST lương", direction: "earning", required: true, source_kind: "employment_record" }]);
  raw.prepare("INSERT INTO hrm_payroll_policy_versions(id,policy_key,revision,title_en,title_vi,legal_entity,currency,minor_unit_scale,components_json,state,created_by,created_at,reviewed_by,reviewed_at,activated_by,activated_at,actor_id,updated_at) VALUES('policy','TEST-PAY',1,'TEST pay','TEST lương','TEST entity','VND',0,?,'draft','TEST-author',?,NULL,NULL,NULL,NULL,'TEST-author',?)").run(components, time, time);
  raw.exec("UPDATE hrm_payroll_policy_versions SET state='reviewed',reviewed_by='TEST-reviewer' WHERE id='policy'");
  raw.exec("UPDATE hrm_payroll_policy_versions SET state='active',activated_by='TEST-reviewer' WHERE id='policy'");
  // A completed employment contract for p1 and an NDA that is not a pay source.
  raw.prepare("INSERT INTO hrm_legal_templates(id,document_key,document_type,title_en,title_vi,created_by,updated_by,actor_id,created_at,updated_at) VALUES('contract-t','TEST-CONTRACT','employment_contract','TEST contract','TEST hợp đồng','TEST-author','TEST-author','TEST-author',?,?),('nda-t','TEST-NDA','nda','TEST NDA','TEST NDA','TEST-author','TEST-author','TEST-author',?,?)").run(time, time, time, time);
  raw.prepare(`INSERT INTO hrm_legal_files(id,object_key,kind,template_id,original_name,mime_type,size_bytes,checksum,state,uploaded_by,reviewed_by,reviewed_at,actor_id,created_at,updated_at) VALUES('contract-f','hrm/legal/TEST-c.docx','docx_source','contract-t','TEST.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',1,'TEST-sum','reviewed','TEST-author','TEST-reviewer',?,'TEST-reviewer',?,?),('nda-f','hrm/legal/TEST-n.docx','docx_source','nda-t','TEST.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',1,'TEST-sum','reviewed','TEST-author','TEST-reviewer',?,'TEST-reviewer',?,?)`).run(time, time, time, time, time, time);
  for (const [version, template, file] of [["contract-v", "contract-t", "contract-f"], ["nda-v", "nda-t", "nda-f"]]) raw.prepare(`INSERT INTO hrm_legal_template_versions(id,template_id,version_number,source_file_id,source_checksum,language,legal_entity,purpose,audience_json,requires_ack,signing_mode,state,created_by,created_at,reviewed_by,reviewed_at,updated_by,updated_at) VALUES(?,?,1,?,'TEST-sum','bilingual','TEST entity','TEST','["active"]',0,'paper_scan','reviewed','TEST-author',?,'TEST-reviewer',?,'TEST-reviewer',?)`).run(version, template, file, time, time, time);
  for (const [issue, template, version] of [["contract-i", "contract-t", "contract-v"], ["nda-i", "nda-t", "nda-v"]]) raw.prepare("INSERT INTO hrm_legal_issues(id,template_id,template_version_id,person_id,employment_id,issue_no,snapshot_json,source_checksum,state,issued_by,issued_at,actor_id,created_at,updated_at) VALUES(?,?,?,'p1','p1-e',1,'{}','TEST-sum','completed','TEST-author',?,'TEST-author',?,?)").run(issue, template, version, time, time, time);
  const admin1 = user("TEST-admin-1", ["hrm_admin"]), admin2 = user("TEST-admin-2", ["hrm_admin"]), payroll = user("TEST-payroll", ["payroll_officer"]), system = user("TEST-system", [], true), employee = user("TEST-employee", ["employee"]);
  const input = (values: Partial<CompensationInput> = {}): CompensationInput => ({ employeeCode: "TEST-P1", componentCode: "base", currency: "VND", minorUnitScale: "0", amountMinor: "10000", effectiveFrom: "2026-01-01", effectiveUntil: "", sourceKind: "contract_issue", sourceReference: "contract-i", basisNote: "TEST synthetic contract amount", supersedesId: "", ...values });
  const row = (id: string) => raw.prepare("SELECT * FROM hrm_compensation_versions WHERE id=?").get(id) as Record<string, unknown>;
  const approve = async (id: string, reviewer = system) => reviewCompensation(db, reviewer, key("approve"), id, Number(row(id).version), "approve", "TEST checked against synthetic contract");
  return { db, raw, admin1, admin2, payroll, system, employee, input, row, approve, close: () => raw.close() };
}

test("compensation drafts need a completed contract or decision, an independent reviewer and nobody acting on their own pay", async () => {
  const f = fixture(); try {
    await assert.rejects(createCompensation(f.db, f.payroll, key("deny"), f.input()), { message: "forbidden" });
    await assert.rejects(createCompensation(f.db, f.admin1, key("nda"), f.input({ sourceReference: "nda-i" })), { message: "compensation_source_invalid" });
    await assert.rejects(createCompensation(f.db, f.admin2, key("own"), f.input({ employeeCode: "TEST-P2", sourceKind: "decision_reference", sourceReference: "TEST-DEC-1" })), { message: "self_approval" });
    const createKey = key("create"), id = await createCompensation(f.db, f.admin1, createKey, f.input());
    assert.equal(await createCompensation(f.db, f.admin1, createKey, f.input()), id, "a retry returns the first draft");
    assert.equal(f.raw.prepare("SELECT COUNT(*) AS n FROM hrm_compensation_versions").get()?.n, 1);
    await assert.rejects(f.approve(id, f.admin1), { message: "self_approval" });
    await assert.rejects(f.approve(id, f.employee), { message: "forbidden" });
    await f.approve(id, f.admin2);
    assert.equal(f.row(id).state, "approved"); assert.equal(f.row(id).reviewed_by, "TEST-admin-2");
    assert.throws(() => f.raw.prepare("UPDATE hrm_compensation_versions SET amount_minor=1 WHERE id=?").run(id), /immutable_history/);
    assert.throws(() => f.raw.prepare("DELETE FROM hrm_compensation_versions WHERE id=?").run(id), /immutable_history/);
    assert.throws(() => f.raw.prepare("UPDATE hrm_compensation_versions SET effective_until='2026-02-01' WHERE id=?").run(id), /hrm_compensation_end_date_invalid/, "an approved range cannot be shortened without a replacement");
  } finally { f.close(); }
});

test("approved versions never overlap; a replacement shortens or supersedes the prior version and must cover its tail", async () => {
  const f = fixture(); try {
    const first = await createCompensation(f.db, f.admin1, key("first"), f.input()); await f.approve(first);
    const overlap = await createCompensation(f.db, f.admin1, key("overlap"), f.input({ effectiveFrom: "2026-03-01", amountMinor: "12000" }));
    await assert.rejects(f.approve(overlap), { message: "compensation_overlap" });
    assert.equal(f.row(overlap).state, "draft");
    await assert.rejects(createCompensation(f.db, f.admin1, key("gap"), f.input({ effectiveFrom: "2026-04-01", effectiveUntil: "2026-04-30", supersedesId: first })), { message: "compensation_supersede_invalid" }, "a bounded replacement would drop the open-ended tail");
    const raise = await createCompensation(f.db, f.admin1, key("raise"), f.input({ effectiveFrom: "2026-04-01", amountMinor: "12000", supersedesId: first }));
    await f.approve(raise);
    assert.equal(f.row(first).effective_until, "2026-03-31"); assert.equal(f.row(first).state, "approved"); assert.equal(f.row(raise).state, "approved");
    const retro = await createCompensation(f.db, f.admin1, key("retro"), f.input({ effectiveFrom: "2026-04-01", amountMinor: "12500", supersedesId: raise }));
    await f.approve(retro);
    assert.equal(f.row(raise).state, "superseded", "a replacement from the same start supersedes the version in full");
    assert.equal(f.row(raise).amount_minor, 12000, "the superseded version keeps its original content");
  } finally { f.close(); }
});

async function preparedRun(f: ReturnType<typeof fixture>) {
  const runId = await createPayrollRun(f.db, f.payroll, key("run"), "policy", "period");
  const people = f.raw.prepare("SELECT person_id FROM hrm_payroll_run_people WHERE run_id=? ORDER BY person_id").all(runId).map(row => String(row.person_id));
  const version = () => Number(f.raw.prepare("SELECT version FROM hrm_payroll_runs WHERE id=?").get(runId)!.version);
  const line = (actor: ReturnType<typeof user>, personId: string, amount: string, source: string) => setPayrollLine(f.db, actor, key("line"), { runId, personId, expectedVersion: version(), componentCode: "base", amountMinor: amount, sourceKind: "employment_record", sourceReference: source, zeroReason: "" });
  return { runId, people, version, line };
}

test("employment_record lines trace to the approved version covering the whole period at its exact amount", async () => {
  const f = fixture(); try {
    const run = await preparedRun(f);
    assert.deepEqual(run.people, ["p1", "p2"]);
    await assert.rejects(run.line(f.payroll, "p1", "10000", "p1-e"), { message: "payroll_compensation_missing" }, "an employment ID alone is no longer a pay source");
    const partial = await createCompensation(f.db, f.admin1, key("partial"), f.input({ effectiveFrom: "2026-03-10" })); await f.approve(partial);
    await assert.rejects(run.line(f.payroll, "p1", "10000", partial), { message: "payroll_compensation_partial_period" }, "a mid-period start has no proration rule");
    const p2 = await createCompensation(f.db, f.admin1, key("p2"), f.input({ employeeCode: "TEST-P2", sourceKind: "decision_reference", sourceReference: "TEST-DEC-2" })); await f.approve(p2);
    const full = await createCompensation(f.db, f.admin1, key("full"), f.input({ effectiveUntil: "2026-03-09", amountMinor: "9000", sourceKind: "decision_reference", sourceReference: "TEST-DEC-3" }));
    await f.approve(full);
    await assert.rejects(run.line(f.payroll, "p1", "9000", full), { message: "payroll_compensation_partial_period" }, "two versions inside one period stay blocked");
    await assert.rejects(run.line(f.payroll, "p2", "9999", p2), { message: "payroll_compensation_mismatch" });
    await run.line(f.payroll, "p2", "10000", p2);
    assert.equal(f.raw.prepare("SELECT source_reference FROM hrm_payroll_lines").get()?.source_reference, p2);
  } finally { f.close(); }
});

test("calculation snapshots the compensation version and later changes block calculation, review and publish", async () => {
  const f = fixture(); try {
    f.raw.exec("UPDATE hrm_employments SET status='ended',ended_on='2026-02-28',version=version+1 WHERE id='p2-e'");
    const run = await preparedRun(f);
    assert.deepEqual(run.people, ["p1"]);
    const v1 = await createCompensation(f.db, f.admin1, key("v1"), f.input()); await f.approve(v1);
    await run.line(f.payroll, "p1", "10000", v1);
    await calculatePayrollRun(f.db, f.payroll, key("calc"), run.runId, run.version());
    const snapshot = JSON.parse(String(f.raw.prepare("SELECT snapshot_json FROM hrm_payroll_runs WHERE id=?").get(run.runId)!.snapshot_json));
    assert.deepEqual(snapshot.people[0].compensation, [{ component_code: "base", version_id: v1, effective_from: "2026-01-01", effective_until: null, source_kind: "contract_issue" }]);
    // A retroactive replacement after calculation: the run cannot move forward on stale pay.
    const v2 = await createCompensation(f.db, f.admin2, key("v2"), f.input({ amountMinor: "11000", supersedesId: v1 })); await f.approve(v2, f.admin1);
    await assert.rejects(reviewPayrollRun(f.db, f.system, key("review-stale"), run.runId, run.version(), "TEST stale"), { message: "conflict" });
    assert.equal(f.raw.prepare("SELECT state FROM hrm_payroll_runs WHERE id=?").get(run.runId)?.state, "calculated");
    await run.line(f.payroll, "p1", "11000", v2);
    await calculatePayrollRun(f.db, f.payroll, key("recalc"), run.runId, run.version());
    // Input authors: the line author, the compensation author and the paid employee never review or approve.
    await assert.rejects(reviewPayrollRun(f.db, f.admin2, key("comp-author"), run.runId, run.version(), "TEST author"), { message: "payroll_input_author" });
    const payrollAdmin = user("TEST-payroll-admin", ["hrm_admin"]);
    await reviewPayrollRun(f.db, f.system, key("review"), run.runId, run.version(), "TEST independent review");
    f.raw.exec("UPDATE hrm_people SET user_id='TEST-payroll-admin',version=version+1 WHERE id='p1'");
    await assert.rejects(approvePayrollRun(f.db, payrollAdmin, key("own-pay"), run.runId, run.version(), "TEST own pay"), { message: "payroll_input_author" });
    f.raw.exec("UPDATE hrm_people SET user_id='TEST-employee',version=version+1 WHERE id='p1'");
    await approvePayrollRun(f.db, payrollAdmin, key("approve"), run.runId, run.version(), "TEST independent approval");
    await publishPayrollRun(f.db, f.system, key("publish"), run.runId, run.version());
    const slip = JSON.parse(String(f.raw.prepare("SELECT snapshot_json FROM hrm_payslips WHERE run_id=?").get(run.runId)!.snapshot_json));
    assert.equal(slip.net_minor, 11000); assert.equal(slip.lines[0].source_reference, v2);
    assert.equal(slip.compensation, undefined, "the employee copy carries the issued lines only");
  } finally { f.close(); }
});

test("a payroll operator who entered a line cannot review the run even with an added admin role", async () => {
  const f = fixture(); try {
    f.raw.exec("UPDATE hrm_employments SET status='ended',ended_on='2026-02-28',version=version+1 WHERE id='p2-e'");
    const run = await preparedRun(f), v1 = await createCompensation(f.db, f.admin1, key("v1"), f.input()); await f.approve(v1);
    const combined = user("TEST-combined", ["payroll_officer", "hrm_admin"]);
    await run.line(combined, "p1", "10000", v1);
    await calculatePayrollRun(f.db, f.payroll, key("calc"), run.runId, run.version());
    await assert.rejects(reviewPayrollRun(f.db, combined, key("review"), run.runId, run.version(), "TEST own input"), { message: "payroll_input_author" });
    assert.equal(f.raw.prepare("SELECT state FROM hrm_payroll_runs WHERE id=?").get(run.runId)?.state, "calculated");
  } finally { f.close(); }
});

test("the closed HRM gate, direct inserts, duplicate replacements and ended employments fail closed", async () => {
  const f = fixture(); try {
    await assert.rejects(createCompensation(f.db, { ...f.admin1, hrmEnabled: false }, key("closed"), f.input()), { message: "payroll_closed" });
    const now = new Date().toISOString();
    assert.throws(() => f.raw.prepare("INSERT INTO hrm_compensation_versions(id,person_id,employment_id,legal_entity,component_code,currency,minor_unit_scale,amount_minor,effective_from,source_kind,source_reference,basis_note,state,created_by,created_at,reviewed_by,reviewed_at,review_reason,actor_id,updated_at) VALUES('direct','p1','p1-e','TEST entity','base','VND',0,1,'2026-01-01','decision_reference','TEST','TEST','approved','TEST-x',?,'TEST-y',?,'TEST','TEST-x',?)").run(now, now, now), /immutable_history/, "a direct approved insert bypasses nothing");
    const first = await createCompensation(f.db, f.admin1, key("first"), f.input()); await f.approve(first);
    await createCompensation(f.db, f.admin1, key("repl-1"), f.input({ effectiveFrom: "2026-05-01", amountMinor: "11000", supersedesId: first }));
    await assert.rejects(createCompensation(f.db, f.admin1, key("repl-2"), f.input({ effectiveFrom: "2026-06-01", amountMinor: "12000", supersedesId: first })), { message: "compensation_replacement_pending" });
    const draft = await createCompensation(f.db, f.admin1, key("ending"), f.input({ employeeCode: "TEST-P2", sourceKind: "decision_reference", sourceReference: "TEST-DEC-9" }));
    f.raw.exec("UPDATE hrm_employments SET status='ended',ended_on='2026-02-28',version=version+1 WHERE id='p2-e'");
    await assert.rejects(f.approve(draft), { message: "compensation_outside_employment" }, "an open-ended draft cannot be approved after the employment ended");
  } finally { f.close(); }
});

test("an explicit employment period serves a rehire; other people's periods are refused", async () => {
  const f = fixture(); try {
    const time = new Date().toISOString();
    f.raw.exec("UPDATE hrm_employments SET status='ended',ended_on='2026-03-31',version=version+1 WHERE id='p1-e'");
    f.raw.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,started_on,actor_id,created_at,updated_at) VALUES('p1-rehire','p1','TEST entity','active','2026-06-01','TEST-author',?,?)").run(time, time);
    const decision = { sourceKind: "decision_reference", sourceReference: "TEST-DEC-OLD" };
    await assert.rejects(createCompensation(f.db, f.admin1, key("default"), f.input({ ...decision, effectiveUntil: "2026-03-31" })), { message: "compensation_outside_employment" }, "the default is the current rehire period");
    const old = await createCompensation(f.db, f.admin1, key("old"), f.input({ ...decision, effectiveUntil: "2026-03-31", employmentId: "p1-e" }));
    assert.equal(f.row(old).employment_id, "p1-e");
    await assert.rejects(createCompensation(f.db, f.admin1, key("foreign"), f.input({ ...decision, employmentId: "p2-e" })), { message: "not_found" });
  } finally { f.close(); }
});
