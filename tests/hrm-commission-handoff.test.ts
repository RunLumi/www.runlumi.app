import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./support/d1-sqlite.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import type { CrmActor } from "../src/lib/crm/access.ts";
import type { CommissionLine } from "../src/lib/crm/commission.ts";
import type { CommissionView } from "../src/lib/crm/commission-store.ts";
import { confirmHandoff, lineKey, selectHandoffLines, voidHandoff } from "../src/lib/crm/commission-handoff.ts";
import { approvePayrollRun, calculatePayrollRun, createPayrollRun, publishPayrollRun, reviewPayrollRun, setPayrollLine } from "../src/lib/hrm/payroll.ts";

let seq = 0;
const key = (label: string) => `TEST-${label}-${String(++seq).padStart(4, "0")}-key`;
const line = (values: Partial<CommissionLine> = {}): CommissionLine => ({ opportunity_id: "opp-1", title: "TEST customer", user_id: "TEST-seller", role: "seller", component: "trust_kit", amount: 40000, status: "earned", eligible_on: "2026-03-10", policy_id: "local-commission@2", simulated: false, ...values });
const actor = (id: string, finance = true): CrmActor => ({ id, name: id, email: `${id}@example.test`, manager: false, configure: false, finance, fulfillment: false, refer: false } as CrmActor);
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [k, v] of Object.entries(values)) data.set(k, v); return data; };
const hrmUser = (id: string, roles: Parameters<typeof makeUser>[2], admin = false) => ({ ...makeUser({ id, name: id, email: `${id}@example.test` }, admin, roles), hrmEnabled: true });

test("only earned, approved, unhanded lines that became eligible in the month are selected", () => {
  const lines = [line(), line({ opportunity_id: "opp-2", status: "holdback" }), line({ opportunity_id: "opp-3", simulated: true }), line({ opportunity_id: "opp-4", eligible_on: "2026-04-01" }),
    line({ opportunity_id: "opp-5", user_id: "TEST-other" }), line({ opportunity_id: "opp-6", status: "forfeited" }), line({ opportunity_id: "opp-7", component: "starter_live", amount: 120000 })];
  const taken = new Set([lineKey(line({ opportunity_id: "opp-7", component: "starter_live" }))]);
  assert.deepEqual(selectHandoffLines(lines, "TEST-seller", "2026-03", taken).map((item) => item.opportunity_id), ["opp-1"]);
});

function fixture() {
  const db = sqliteD1(), raw = db.raw, time = new Date().toISOString();
  raw.prepare("INSERT INTO crm_policies (id, policy_key, version, body, source_ref, effective_from, created_by, created_at) VALUES ('local-commission@2','local-commission',2,?,'TEST approval','2026-01-01','TEST-admin',?)")
    .run(JSON.stringify({ status: "approved", retention_days: 60, inbound_pct: 50, offers: { trust_kit: "local-trust-kit", starter: "local-starter", renewal: [] }, rates: {} }), time);
  raw.prepare("INSERT INTO crm_seller_terms (id,user_id,seller_type,effective_from,created_by,created_at) VALUES ('t1','TEST-seller','employee','2026-01-01','TEST-admin',?),('t2','TEST-partner','partner_seller','2026-01-01','TEST-admin',?)").run(time, time);
  const view = (lines: CommissionLine[]) => ({ versions: [{ id: "local-commission@2", version: 2, effective_from: "2026-01-01", source_ref: "TEST", body: { status: "approved" } }], lines } as unknown as CommissionView);
  // HRM: the seller is a linked employee paid in a one-month VND run.
  raw.prepare("UPDATE hrm_settings SET legal_entity='TEST entity',enabled=1,reviewed_by='TEST-owner',reviewed_at=? WHERE id=1").run(time);
  raw.prepare("INSERT INTO hrm_people(id,employee_code,user_id,legal_name,actor_id,created_at,updated_at) VALUES('p1','TEST-P1','TEST-seller','TEST seller','TEST-author',?,?),('p2','TEST-P2','TEST-other','TEST other','TEST-author',?,?)").run(time, time, time, time);
  raw.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,started_on,actor_id,created_at,updated_at) VALUES('p1-e','p1','TEST entity','active','2026-01-01','TEST-author',?,?),('p2-e','p2','TEST entity','active','2026-01-01','TEST-author',?,?)").run(time, time, time, time);
  raw.prepare("INSERT INTO hrm_time_periods(id,period_key,starts_on,ends_on,state,snapshot_json,snapshot_checksum,locked_at,opened_by,opened_at,actor_id,created_at,updated_at) VALUES('period','TEST-2026-03','2026-03-01','2026-03-31','locked','{}','TEST-time',?,'TEST-author',?,'TEST-author',?,?)").run(time, time, time, time);
  const components = JSON.stringify([{ code: "commission", title_en: "TEST commission", title_vi: "TEST hoa hồng", direction: "earning", required: true, source_kind: "crm_commission" }]);
  for (const [id, currency] of [["policy", "VND"], ["usd-policy", "USD"], ["second-policy", "VND"]]) {
    raw.prepare("INSERT INTO hrm_payroll_policy_versions(id,policy_key,revision,title_en,title_vi,legal_entity,currency,minor_unit_scale,components_json,state,created_by,created_at,actor_id,updated_at) VALUES(?,?,1,'TEST pay','TEST lương','TEST entity',?,0,?,'draft','TEST-author',?,'TEST-author',?)").run(id, `TEST-${id}`, currency, components, time, time);
    raw.prepare("UPDATE hrm_payroll_policy_versions SET state='reviewed',reviewed_by='TEST-reviewer' WHERE id=?").run(id);
    raw.prepare("UPDATE hrm_payroll_policy_versions SET state='active',activated_by='TEST-reviewer' WHERE id=?").run(id);
  }
  return { db, raw, view, finance: actor("TEST-finance"), payroll: hrmUser("TEST-payroll", ["payroll_officer"]), reviewer: hrmUser("TEST-reviewer", ["hrm_admin"]), system: hrmUser("TEST-system", [], true), close: () => raw.close() };
}

test("Finance confirms an employee's month once; payouts and handoffs exclude each other; an unused handoff can be voided", async () => {
  const f = fixture(); try {
    const lines = [line(), line({ opportunity_id: "opp-2", component: "starter_live", amount: 120000 })];
    await assert.rejects(confirmHandoff(f.db, f.db, actor("TEST-sales", false), form({ user_id: "TEST-seller", period: "2026-03", request_key: key("deny") }), f.view(lines)), { message: "forbidden" });
    await assert.rejects(confirmHandoff(f.db, f.db, f.finance, form({ user_id: "TEST-partner", period: "2026-03", request_key: key("partner") }), f.view([line({ user_id: "TEST-partner" })])), (error: Error & { fields?: Record<string, string> }) => error.fields?.user_id === "not_employee");
    await assert.rejects(confirmHandoff(f.db, f.db, actor("TEST-seller"), form({ user_id: "TEST-seller", period: "2026-03", request_key: key("self") }), f.view(lines)), { message: "forbidden" });
    const confirmKey = key("confirm"), id = await confirmHandoff(f.db, f.db, f.finance, form({ user_id: "TEST-seller", period: "2026-03", request_key: confirmKey }), f.view(lines));
    assert.equal(await confirmHandoff(f.db, f.db, f.finance, form({ user_id: "TEST-seller", period: "2026-03", request_key: confirmKey }), f.view(lines)), id, "a retry returns the first handoff");
    assert.deepEqual(f.raw.prepare("SELECT amount_vnd,line_count,state FROM crm_commission_handoffs").all().map((row) => ({ ...row })), [{ amount_vnd: 160000, line_count: 2, state: "confirmed" }]);
    await assert.rejects(confirmHandoff(f.db, f.db, f.finance, form({ user_id: "TEST-seller", period: "2026-03", request_key: key("again") }), f.view(lines)), (error: Error & { fields?: Record<string, string> }) => error.fields?.period === "nothing_earned", "each earned line is handed off once");
    assert.throws(() => f.raw.prepare("INSERT INTO crm_commission_payouts (id,user_id,period,amount_vnd,policy_id,evidence,recorded_by,created_at) VALUES ('pay','TEST-seller','2026-03',1,'local-commission@2','TEST','TEST-finance','x')").run(), /crm_commission_period_handed_off/);
    assert.throws(() => f.raw.prepare("UPDATE crm_commission_handoffs SET amount_vnd=1").run(), /immutable_history/);
    assert.throws(() => f.raw.prepare("UPDATE crm_commission_handoff_lines SET active=0").run(), /immutable_history/, "lines are released only by voiding");
    await voidHandoff(f.db, f.finance, form({ handoff_id: id, reason: "TEST wrong month", request_key: key("void") }));
    assert.equal(f.raw.prepare("SELECT COUNT(*) AS n FROM crm_commission_handoff_lines WHERE active=1").get()?.n, 0);
    f.raw.prepare("INSERT INTO crm_commission_payouts (id,user_id,period,amount_vnd,policy_id,evidence,recorded_by,created_at) VALUES ('pay','TEST-seller','2026-03',160000,'local-commission@2','TEST','TEST-finance','x')").run();
    await assert.rejects(confirmHandoff(f.db, f.db, f.finance, form({ user_id: "TEST-seller", period: "2026-03", request_key: key("paid") }), f.view(lines)), (error: Error & { fields?: Record<string, string> }) => error.fields?.period === "paid_out");
  } finally { f.close(); }
});

test("payroll imports a confirmed handoff once at its exact amount; a correction carries it forward; it cannot then be voided", async () => {
  const f = fixture(); try {
    const handoff = await confirmHandoff(f.db, f.db, f.finance, form({ user_id: "TEST-seller", period: "2026-03", request_key: key("confirm") }), f.view([line()]));
    const runId = await createPayrollRun(f.db, f.payroll, key("run"), "policy", "period");
    const version = (id = runId) => Number(f.raw.prepare("SELECT version FROM hrm_payroll_runs WHERE id=?").get(id)!.version);
    const set = (person: string, amount: string, source = handoff, run = runId) => setPayrollLine(f.db, f.payroll, key("line"), { runId: run, personId: person, expectedVersion: version(run), componentCode: "commission", amountMinor: amount, sourceKind: "crm_commission", sourceReference: source, zeroReason: "" });
    await assert.rejects(set("p2", "40000"), { message: "payroll_commission_missing" }, "another employee cannot take this handoff");
    await assert.rejects(set("p1", "40001"), { message: "payroll_commission_mismatch" });
    await set("p1", "40000");
    assert.throws(() => f.raw.prepare("UPDATE hrm_payroll_lines SET amount_minor=1 WHERE source_kind='crm_commission'").run(), /crm_commission_handoff_invalid/, "D1 also refuses a different amount");
    // A second regular run (another policy) cannot use the same handoff while the first is unpublished.
    const usd = await createPayrollRun(f.db, f.payroll, key("usd-run"), "usd-policy", "period");
    await assert.rejects(set("p1", "40000", handoff, usd), { message: "payroll_commission_currency" });
    // p2 has no handoff and leaves this run; the required commission line stays unknown, never zero.
    f.raw.exec("UPDATE hrm_employments SET status='ended',ended_on='2026-02-28',version=version+1 WHERE id='p2-e'");
    f.raw.exec(`DELETE FROM hrm_payroll_run_people WHERE run_id='${runId}' AND person_id='p2'`);
    await calculatePayrollRun(f.db, f.payroll, key("calc"), runId, version());
    await reviewPayrollRun(f.db, f.reviewer, key("review"), runId, version(), "TEST review");
    await approvePayrollRun(f.db, f.reviewer, key("approve"), runId, version(), "TEST approve");
    await publishPayrollRun(f.db, f.system, key("publish"), runId, version());
    const slip = f.raw.prepare("SELECT id FROM hrm_payslips WHERE run_id=?").get(runId)!.id as string;
    await assert.rejects(voidHandoff(f.db, f.finance, form({ handoff_id: handoff, reason: "TEST too late", request_key: key("void-late") })), (error: Error & { fields?: Record<string, string> }) => error.fields?.handoff_id === "in_payroll");
    // A linked correction may carry the same handoff; a fresh regular run may not.
    const correction = await createPayrollRun(f.db, f.payroll, key("correction"), "policy", "period", slip, "TEST correction");
    await set("p1", "40000", handoff, correction);
    await calculatePayrollRun(f.db, f.payroll, key("ccalc"), correction, version(correction));
    await reviewPayrollRun(f.db, f.reviewer, key("creview"), correction, version(correction), "TEST review");
    await approvePayrollRun(f.db, f.reviewer, key("capprove"), correction, version(correction), "TEST approve");
    await publishPayrollRun(f.db, f.system, key("cpublish"), correction, version(correction));
    assert.equal(f.raw.prepare("SELECT state FROM hrm_payslips WHERE id=?").get(slip)?.state, "superseded");
    assert.equal(f.raw.prepare("SELECT COUNT(*) AS n FROM hrm_payslips WHERE state='published'").get()?.n, 1, "the handoff sits on exactly one current payslip");
    const second = await createPayrollRun(f.db, f.payroll, key("second-run"), "second-policy", "period");
    await assert.rejects(set("p1", "40000", handoff, second), { message: "payroll_commission_already_used" }, "a separate regular run cannot pay the same handoff again");
    const snapshot = JSON.parse(String(f.raw.prepare("SELECT snapshot_json FROM hrm_payslips WHERE state='published'").get()!.snapshot_json));
    assert.deepEqual(Object.keys(snapshot).filter((k) => /customer|opportunit|ledger/i.test(k)), [], "no CRM customer data reaches the payslip");
  } finally { f.close(); }
});
