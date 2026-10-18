import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./support/d1-sqlite.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { executeFinanceCommand, FinanceError, getFinanceReadiness, loadFinance, type FinanceCommand, type FinanceSourceContext, type FinanceState } from "../src/lib/finance/store.ts";
import { fiscalPeriods, periodBounds } from "../src/lib/finance/calculations.ts";
import type { FinanceFact, FinanceVersionKind } from "../src/lib/finance/model.ts";

const admin = () => ({ ...makeUser({ id: "finance-test-admin", name: "Finance test administrator", email: "finance@example.invalid" }, true, []), financeDeploymentEnabled: true, financeEnabled: true });
const key = () => `finance_${crypto.randomUUID().replaceAll("-", "")}`;
const bookInput = { legal_entity: "Synthetic test book", currency: "VND", precision: 0, fiscal_start_month: 1, timezone: "Asia/Ho_Chi_Minh", first_period: "2025-01", cash_floor: 0, policy_note: "Synthetic management reporting policy", enabled: true };
async function setup(enabled = true) {
  const db = sqliteD1(), user = admin();
  await executeFinanceCommand(db, user, key(), { action: "book.save", expected_version: 0, ...bookInput, enabled });
  await executeFinanceCommand(db, user, key(), { action: "account.save", account_code: "bank", expected_version: 0, label: "Synthetic cash", active_from: "2025-01" });
  return { db, user, run: (command: FinanceCommand, requestKey = key()) => executeFinanceCommand(db, user, requestKey, command) };
}
function facts(state: FinanceState, month: string, kind: FinanceVersionKind): FinanceFact[] {
  const definition = state.definitions.find(item => item.fiscalYear === state.selectedFiscalYear)!;
  return definition.expectedInputs.filter(item => item.period === month && (!item.kinds || item.kinds.includes(kind))).map(item => ({ lineCode: item.lineCode, segmentCode: item.segmentCode, state: "entered", amount: 0, note: "Explicit no activity in synthetic test", evidenceRef: "synthetic-source" }));
}
function sources(month: string): FinanceSourceContext { return { sourceAsOf: periodBounds(month).end, scope: "Synthetic management book, all activity", blocks: Object.fromEntries(["pnl", "cash", "aging", "position"].map(basis => [basis, { evidenceRef: "synthetic-source", note: "No activity" }])) }; }
async function savedActual(ctx: Awaited<ReturnType<typeof setup>>, month = "2025-01") {
  const opened = await ctx.run({ action: "actual.open", period: month, expected_period_version: 0 });
  const state = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025, period: month });
  const bounds = periodBounds(month);
  const command: FinanceCommand = { action: "actual.save", actual_revision_id: opened.targetId, expected_version: 1, expected_period_version: 1, values: facts(state, month, "actual"), sources: sources(month), observations: [
    ...(month === bookInput.first_period ? [{ accountCode: "bank", kind: "opening" as const, amount: 0, restrictedAmount: 0, classification: "cash" as const, evidenceRef: "synthetic-opening", asOfDate: bounds.start }] : []),
    { accountCode: "bank", kind: "closing", amount: 0, restrictedAmount: 0, classification: "cash", evidenceRef: "synthetic-closing", asOfDate: bounds.end },
  ] };
  const requestKey = key(), saved = await ctx.run(command, requestKey);
  return { id: opened.targetId, command, requestKey, saved };
}
async function closedActual(ctx: Awaited<ReturnType<typeof setup>>, month = "2025-01") {
  const draft = await savedActual(ctx, month);
  await ctx.run({ action: "actual.close", actual_revision_id: draft.id, expected_version: 2, expected_period_version: 2 });
  return draft;
}
function codeIs(code: string) { return (error: unknown) => error instanceof FinanceError && error.code === code; }

test("Finance migration is empty and services demand both Super Admin and finance permission", async () => {
  const db = sqliteD1(), user = admin();
  assert.deepEqual(await getFinanceReadiness(db), { configured: false, enabled: false, version: 0, bookId: null });
  assert.equal((await loadFinance(db, user, { fiscalYear: 2025 })).book, null);
  const finance = makeUser({ id: "finance-role", name: "Finance role", email: "crm-finance@example.invalid" }, false, ["finance"]);
  await assert.rejects(loadFinance(db, finance), codeIs("forbidden"));
  await assert.rejects(loadFinance(db, { ...user, admin: false, can: () => true }), codeIs("forbidden"));
  await assert.rejects(loadFinance(db, { ...user, can: () => false }), codeIs("forbidden"));
});

test("Settings setup works while disabled; readiness blocks ordinary commands and cached success replay", async () => {
  const ctx = await setup();
  const command: FinanceCommand = { action: "plan.create", fiscal_year: 2025, label: "Budget", kind: "budget" }, requestKey = key();
  const result = await ctx.run(command, requestKey);
  assert.equal((await ctx.run(command, requestKey)).targetId, result.targetId);
  const book = (await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025 })).book!;
  await ctx.run({ action: "book.save", ...bookInput, enabled: false, expected_version: book.version });
  await assert.rejects(ctx.run(command, requestKey), codeIs("finance_not_ready"));
  const state = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025, includeAudit: true });
  assert.equal(state.book?.enabled, false); assert.equal(state.plans.length, 0); assert.deepEqual(state.audit, []);
  await assert.rejects(ctx.run({ action: "plan.create", fiscal_year: 2025, label: "Denied", kind: "budget" }), codeIs("finance_not_ready"));
});

test("Version assertion fails inside the transaction and rolls back facts, operation and audit", async () => {
  const ctx = await setup(), created = await ctx.run({ action: "plan.create", fiscal_year: 2025, label: "Concurrency", kind: "budget" });
  const beforeOps = ctx.db.raw.prepare("SELECT count(*) AS n FROM finance_write_operations").get()!.n;
  let injected = false;
  const db = { prepare: ctx.db.prepare.bind(ctx.db), batch: async (statements: D1PreparedStatement[]) => {
    if (!injected && (statements[0] as unknown as { sql: string }).sql.includes("INSERT INTO finance_write_guards")) {
      injected = true; ctx.db.raw.prepare("UPDATE finance_plan_versions SET version=version+1 WHERE id=?").run(created.targetId);
    }
    return ctx.db.batch(statements);
  } } as D1Database;
  await assert.rejects(executeFinanceCommand(db, ctx.user, key(), { action: "plan.save", plan_id: created.targetId, expected_version: 1, period: "2025-01", values: [{ lineCode: "pnl.projects", segmentCode: "unallocated", state: "entered", amount: 10, note: "", evidenceRef: "source" }] }), codeIs("finance_conflict"));
  assert.ok(injected);
  assert.equal(ctx.db.raw.prepare("SELECT count(*) AS n FROM finance_plan_values").get()!.n, 0);
  assert.equal(ctx.db.raw.prepare("SELECT count(*) AS n FROM finance_write_operations").get()!.n, beforeOps);
  assert.equal(ctx.db.raw.prepare("SELECT count(*) AS n FROM finance_write_guards").get()!.n, 0);
});

test("Plan annual allocation, full publication and official baseline are immutable", async () => {
  const ctx = await setup(), created = await ctx.run({ action: "plan.create", fiscal_year: 2025, label: "Official budget", kind: "budget" });
  let version = 1;
  const state = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025, planId: created.targetId });
  for (const month of fiscalPeriods(2025, 1)) { await ctx.run({ action: "plan.save", plan_id: created.targetId, expected_version: version++, period: month, values: facts(state, month, "budget") }); }
  await ctx.run({ action: "plan.save", plan_id: created.targetId, expected_version: version++, spread: { lineCode: "pnl.projects", segmentCode: "unallocated", annualAmount: 13, note: "Annual allocation", evidenceRef: "synthetic" } });
  const amounts = ctx.db.raw.prepare("SELECT amount FROM finance_plan_values WHERE plan_id=? AND line_code='pnl.projects' ORDER BY period").all(created.targetId).map(row => Number(row.amount));
  assert.equal(amounts.reduce((total, value) => total + value, 0), 13); assert.equal(Math.max(...amounts) - Math.min(...amounts), 1);
  await ctx.run({ action: "plan.publish", plan_id: created.targetId, expected_version: version, baseline: true });
  assert.throws(() => ctx.db.raw.prepare("UPDATE finance_plan_values SET amount=1 WHERE plan_id=?").run(created.targetId), /finance/);
  const clone = await ctx.run({ action: "plan.create", fiscal_year: 2025, label: "Second budget", kind: "budget", source_plan_id: created.targetId });
  await assert.rejects(ctx.run({ action: "plan.publish", plan_id: clone.targetId, expected_version: 1, baseline: true }), codeIs("finance_conflict"));
  assert.equal(ctx.db.raw.prepare("SELECT state FROM finance_plan_versions WHERE id=?").get(clone.targetId)!.state, "draft");
  const insert = ctx.db.raw.prepare("INSERT INTO finance_plan_versions(id,book_id,fiscal_year,definition_set_id,label,kind,created_at) VALUES(?,'main',2025,?,'Catalog test draft','scenario','2099-01-01T00:00:00.000Z')");
  for (let index = 0; index < 101; index++) insert.run(`catalog_test_${index}`, state.definitions.find(item => item.fiscalYear === 2025)!.id);
  const older = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025, planId: clone.targetId });
  assert.ok(older.plans.some(item => item.id === created.targetId && item.baseline));
  assert.ok(older.plans.some(item => item.id === clone.targetId));
  assert.equal(older.plans.length, 102);
});

test("Month copy filters opening controls and next-year cloning retains classifications with the new calendar", async () => {
  const ctx = await setup(), initial = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025 });
  const definition = initial.definitions.find(item => item.fiscalYear === 2025)!;
  await ctx.run({ action: "definition.save", fiscal_year: 2025, expected_version: definition.version, lines: definition.lines.map(line => line.code === "pnl.rent" ? { ...line, costBehavior: "fixed" } : line) });
  const plan = await ctx.run({ action: "plan.create", fiscal_year: 2025, label: "Copy source", kind: "budget" });
  await ctx.run({ action: "plan.save", plan_id: plan.targetId, expected_version: 1, period: "2025-01", values: [
    { lineCode: "cash.opening", segmentCode: "all", state: "entered", amount: 100, note: "Opening anchor", evidenceRef: "synthetic" },
    { lineCode: "pnl.projects", segmentCode: "unallocated", state: "entered", amount: 40, note: "January source", evidenceRef: "synthetic" },
  ] });
  await ctx.run({ action: "plan.save", plan_id: plan.targetId, expected_version: 2, period: "2025-02", copy_from_period: "2025-01" });
  assert.equal(ctx.db.raw.prepare("SELECT count(*) AS n FROM finance_plan_values WHERE plan_id=? AND period='2025-02' AND line_code='cash.opening'").get(plan.targetId)!.n, 0);
  assert.equal(ctx.db.raw.prepare("SELECT amount FROM finance_plan_values WHERE plan_id=? AND period='2025-02' AND line_code='pnl.projects'").get(plan.targetId)!.amount, 40);
  const copied = await ctx.run({ action: "plan.create", fiscal_year: 2026, label: "Next year", kind: "scenario", source_plan_id: plan.targetId });
  const state = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2026, planId: copied.targetId }), target = state.definitions.find(item => item.fiscalYear === 2026)!;
  assert.equal(target.lines.find(line => line.code === "pnl.rent")?.costBehavior, "fixed");
  assert.equal(target.expectedInputs.some(item => item.lineCode === "equity.opening"), false);
  assert.deepEqual(target.expectedInputs.filter(item => item.lineCode === "cash.opening").map(item => item.period), ["2026-01"]);
  assert.equal(state.planValues.find(value => value.period === "2026-02" && value.lineCode === "pnl.projects")?.amount, 40);
  await assert.rejects(ctx.run({ action: "plan.save", plan_id: copied.targetId, expected_version: 1, spread: { lineCode: "forecast.restricted_cash", segmentCode: "all", annualAmount: 120, note: "A stock is not an annual flow", evidenceRef: "synthetic" } }), codeIs("annual_split_requires_flow"));
});

test("Full close freezes every actual source; reopen creates new revision and reclose marks dependents stale", async () => {
  const ctx = await setup(), january = await closedActual(ctx), february = await closedActual(ctx, "2025-02");
  assert.throws(() => ctx.db.raw.prepare("UPDATE finance_actual_values SET amount=1 WHERE actual_revision_id=?").run(january.id), /finance/);
  const replay = await ctx.run(january.command, january.requestKey);
  assert.equal(replay.targetId, january.id); assert.equal(replay.version, 2); assert.equal(replay.replayed, true);
  const reopened = await ctx.run({ action: "actual.reopen", period: "2025-01", expected_period_version: 3, reason: "Restatement test" });
  assert.notEqual(reopened.targetId, january.id);
  await ctx.run({ action: "actual.close", actual_revision_id: reopened.targetId, expected_version: 1, expected_period_version: 4 });
  const state = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025, period: "2025-02" });
  assert.equal(state.actualRevisions.find(item => item.id === february.id)?.stale, true);
  assert.equal(ctx.db.raw.prepare("SELECT state FROM finance_actual_revisions WHERE id=?").get(january.id)!.state, "closed");
  const history = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025, period: "2025-01" });
  assert.ok(history.actualRevisions.some(item => item.id === january.id));
  assert.ok(history.actualRevisions.some(item => item.id === reopened.targetId));
  assert.throws(() => ctx.db.raw.exec("DELETE FROM finance_audit_events"), /finance_history_immutable/);
});

test("Forecast copies its immutable actual prefix and becomes stale after an authoritative restatement", async () => {
  const ctx = await setup(), draft = await savedActual(ctx);
  await ctx.run({ action: "actual.save", actual_revision_id: draft.id, expected_version: 2, expected_period_version: 2, values: ["pnl.projects", "cash.customer_receipts", "position.current_earnings"].map(lineCode => ({ lineCode, segmentCode: lineCode.startsWith("pnl.") ? "unallocated" : "all", state: "entered", amount: 70, note: "Synthetic earned and collected revenue", evidenceRef: "synthetic" })), observations: [{ accountCode: "bank", kind: "closing", amount: 70, restrictedAmount: 0, classification: "cash", evidenceRef: "synthetic", asOfDate: "2025-01-31" }] });
  await ctx.run({ action: "actual.close", actual_revision_id: draft.id, expected_version: 3, expected_period_version: 3 });
  const plan = await ctx.run({ action: "plan.create", fiscal_year: 2025, label: "Rolling forecast", kind: "forecast", actual_cutoff: "2025-01" });
  let version = 1;
  const initial = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025, planId: plan.targetId });
  for (const month of fiscalPeriods(2025, 1).slice(1)) await ctx.run({ action: "plan.save", plan_id: plan.targetId, expected_version: version++, period: month, values: facts(initial, month, "forecast") });
  await ctx.run({ action: "plan.save", plan_id: plan.targetId, expected_version: version++, period: "2025-02", copy_from_period: "2025-01" });
  assert.equal(ctx.db.raw.prepare("SELECT amount FROM finance_plan_values WHERE plan_id=? AND period='2025-02' AND line_code='pnl.projects'").get(plan.targetId)!.amount, 70);
  assert.equal(ctx.db.raw.prepare("SELECT count(*) AS n FROM finance_plan_values WHERE plan_id=? AND period='2025-01'").get(plan.targetId)!.n, 0);
  await ctx.run({ action: "plan.publish", plan_id: plan.targetId, expected_version: version });
  const reopened = await ctx.run({ action: "actual.reopen", period: "2025-01", expected_period_version: 4, reason: "Synthetic restatement" });
  await ctx.run({ action: "actual.close", actual_revision_id: reopened.targetId, expected_version: 1, expected_period_version: 5 });
  const changed = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025, planId: plan.targetId }), forecast = changed.plans.find(item => item.id === plan.targetId)!;
  assert.equal(forecast.sourceActuals["2025-01"], draft.id); assert.equal(forecast.stale, true);
});

test("Variance settings preserve omitted values, validate limits and freeze into closed source snapshots", async () => {
  const ctx = await setup(), initial = (await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025 })).book!;
  await ctx.run({ action: "book.save", ...bookInput, expected_version: initial.version, variance_amount_threshold: 1250, variance_percent_threshold_bps: 500 });
  const closed = await closedActual(ctx), state = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025 });
  assert.equal(state.book?.varianceAmountThreshold, 1250); assert.equal(state.book?.variancePercentThresholdBps, 500);
  const frozen = state.actualRevisions.find(item => item.id === closed.id)!.reportingSnapshot!;
  assert.equal(frozen.book.varianceAmountThreshold, 1250); assert.equal(frozen.book.variancePercentThresholdBps, 500);
  const updated = await ctx.run({ action: "book.save", ...bookInput, expected_version: state.book!.version, cash_floor: 100 });
  assert.equal((await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025 })).book?.varianceAmountThreshold, 1250);
  await assert.rejects(ctx.run({ action: "book.save", ...bookInput, expected_version: updated.version, variance_percent_threshold_bps: 10001 }), codeIs("invalid_variance_threshold"));
  await ctx.run({ action: "book.save", ...bookInput, expected_version: updated.version, variance_amount_threshold: null, variance_percent_threshold_bps: null });
  const current = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025 });
  assert.equal(current.book?.varianceAmountThreshold, null);
  assert.equal(current.actualRevisions.find(item => item.id === closed.id)?.reportingSnapshot?.book.varianceAmountThreshold, 1250);
});

test("Partial actuals cannot close and future actuals never create periods", async () => {
  const ctx = await setup(), opened = await ctx.run({ action: "actual.open", period: "2025-01", expected_period_version: 0 });
  await assert.rejects(ctx.run({ action: "actual.close", actual_revision_id: opened.targetId, expected_version: 1, expected_period_version: 1 }), codeIs("block_evidence_required"));
  await assert.rejects(ctx.run({ action: "actual.open", period: "2199-01", expected_period_version: 0 }), codeIs("future_actual_period"));
  assert.equal(ctx.db.raw.prepare("SELECT count(*) AS n FROM finance_periods").get()!.n, 1);
});

test("Clear removes only a draft fact while its source operation and before-value audit survive", async () => {
  const ctx = await setup(), draft = await savedActual(ctx);
  const beforeCount = ctx.db.raw.prepare("SELECT count(*) AS n FROM finance_actual_values WHERE actual_revision_id=?").get(draft.id)!.n as number;
  await ctx.run({ action: "actual.save", actual_revision_id: draft.id, expected_version: 2, expected_period_version: 2, values: [{ lineCode: "pnl.projects", segmentCode: "unallocated", state: "missing", amount: null, note: "Clear correction", evidenceRef: "" }] });
  assert.equal(ctx.db.raw.prepare("SELECT count(*) AS n FROM finance_actual_values WHERE actual_revision_id=?").get(draft.id)!.n, beforeCount - 1);
  const event = ctx.db.raw.prepare("SELECT detail FROM finance_audit_events WHERE action='actual.save' ORDER BY rowid DESC LIMIT 1").get()!;
  assert.ok(JSON.parse(String(event.detail)).before.values.some((value: FinanceFact) => value.lineCode === "pnl.projects"));
  assert.ok(ctx.db.raw.prepare("SELECT id FROM finance_write_operations WHERE id=?").get(draft.saved.operationId));
});

test("Complete-month UTF-8 byte cap prevents small patches accumulating an oversized audited record", async () => {
  const ctx = await setup(), draft = await ctx.run({ action: "actual.open", period: "2025-01", expected_period_version: 0 });
  const state = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025 });
  const values = facts(state, "2025-01", "actual").map(value => ({ ...value, note: "界".repeat(2000), evidenceRef: "源".repeat(1000) }));
  const middle = Math.floor(values.length / 2), first = values.slice(0, middle), second = values.slice(middle);
  assert.ok(new TextEncoder().encode(JSON.stringify(first)).byteLength < 512 * 1024);
  assert.ok(new TextEncoder().encode(JSON.stringify(second)).byteLength < 512 * 1024);
  assert.ok(new TextEncoder().encode(JSON.stringify(values)).byteLength > 512 * 1024);
  await ctx.run({ action: "actual.save", actual_revision_id: draft.targetId, expected_version: 1, expected_period_version: 1, values: first });
  const beforeAudit = ctx.db.raw.prepare("SELECT count(*) AS n FROM finance_audit_events").get()!.n;
  await assert.rejects(ctx.run({ action: "actual.save", actual_revision_id: draft.targetId, expected_version: 2, expected_period_version: 2, values: second }), error => error instanceof FinanceError && error.status === 413 && error.code === "month_payload_too_large");
  assert.equal(ctx.db.raw.prepare("SELECT count(*) AS n FROM finance_actual_values WHERE actual_revision_id=?").get(draft.targetId)!.n, first.length);
  assert.equal(ctx.db.raw.prepare("SELECT version FROM finance_actual_revisions WHERE id=?").get(draft.targetId)!.version, 2);
  assert.equal(ctx.db.raw.prepare("SELECT count(*) AS n FROM finance_audit_events").get()!.n, beforeAudit);
});

test("Manual and definition commands reject derived writes, invalid grain and relaxed core controls", async () => {
  const ctx = await setup(), plan = await ctx.run({ action: "plan.create", fiscal_year: 2025, label: "Validation", kind: "budget" });
  for (const value of [
    { lineCode: "position.cash", segmentCode: "all", state: "entered", amount: 0, note: "", evidenceRef: "" },
    { lineCode: "pnl.projects", segmentCode: "all", state: "entered", amount: 0, note: "", evidenceRef: "" },
    { lineCode: "cash.customer_receipts", segmentCode: "all", state: "not_applicable", amount: null, note: "No", evidenceRef: "" },
    { lineCode: "pnl.projects", segmentCode: "unallocated", state: "entered", amount: Number.MAX_SAFE_INTEGER + 1, note: "", evidenceRef: "" },
  ] as FinanceFact[]) await assert.rejects(ctx.run({ action: "plan.save", plan_id: plan.targetId, expected_version: 1, period: "2025-01", values: [value] }));
  const state = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025 }), definition = state.definitions.find(item => item.fiscalYear === 2025)!;
  const lines = definition.lines.map(line => line.code === "position.ap" ? { ...line, required: false } : line);
  await assert.rejects(ctx.run({ action: "definition.save", fiscal_year: 2025, expected_version: definition.version, lines }), codeIs("mandatory_control_relaxed"));
  const inputs = definition.expectedInputs.filter(input => input.lineCode !== "aging.ar_control");
  await assert.rejects(ctx.run({ action: "definition.save", fiscal_year: 2025, expected_version: definition.version, expected_inputs: inputs }), codeIs("mandatory_input_removed"));
});

const csv = (months: string[]) => "period,line_code,segment_code,value_state,amount,currency,evidence_ref,note\n" + months.map(month => `${month},pnl.projects,unallocated,entered,7,VND,synthetic,`).join("\n");
test("CSV multi-month plan preview advances only its own preceding global version", async () => {
  const ctx = await setup(), plan = await ctx.run({ action: "plan.create", fiscal_year: 2025, label: "Import", kind: "budget" });
  const preview = await ctx.run({ action: "import.preview", kind: "plan", plan_id: plan.targetId, fiscal_year: 2025, csv: csv(["2025-01", "2025-02"]), expected_versions: { "2025-01": { version: 1 }, "2025-02": { version: 1 } }, sources: { "2025-01": sources("2025-01"), "2025-02": sources("2025-02") } });
  assert.equal(ctx.db.raw.prepare("SELECT count(*) AS n FROM finance_plan_values").get()!.n, 0);
  await ctx.run({ action: "import.commit", import_id: preview.targetId, expected_version: 1, period: "2025-01" });
  const middle = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025, includeImports: true });
  assert.equal(middle.imports[0].months[1].expectedVersion, 2);
  await ctx.run({ action: "import.commit", import_id: preview.targetId, expected_version: 2, period: "2025-02" });
  assert.equal(ctx.db.raw.prepare("SELECT version FROM finance_plan_versions WHERE id=?").get(plan.targetId)!.version, 3);
  await assert.rejects(ctx.run({ action: "import.preview", kind: "plan", plan_id: plan.targetId, fiscal_year: 2025, csv: csv(["2025-01"]), expected_versions: { "2025-01": { version: 3 } }, sources: { "2025-01": sources("2025-01") } }), codeIs("import_already_committed"));
});

test("CSV external conflicts do not write a partial month; discard preserves committed evidence", async () => {
  const ctx = await setup(), plan = await ctx.run({ action: "plan.create", fiscal_year: 2025, label: "Conflicting import", kind: "budget" });
  const preview = await ctx.run({ action: "import.preview", kind: "plan", plan_id: plan.targetId, fiscal_year: 2025, csv: csv(["2025-01", "2025-02"]), expected_versions: { "2025-01": { version: 1 }, "2025-02": { version: 1 } }, sources: { "2025-01": sources("2025-01"), "2025-02": sources("2025-02") } });
  await ctx.run({ action: "import.commit", import_id: preview.targetId, expected_version: 1, period: "2025-01" });
  await ctx.run({ action: "plan.save", plan_id: plan.targetId, expected_version: 2, period: "2025-02", values: [{ lineCode: "pnl.projects", segmentCode: "unallocated", state: "entered", amount: 99, note: "External edit", evidenceRef: "manual" }] });
  await assert.rejects(ctx.run({ action: "import.commit", import_id: preview.targetId, expected_version: 2, period: "2025-02" }), codeIs("import_target_changed"));
  await ctx.run({ action: "import.discard", import_id: preview.targetId, expected_version: 2 });
  const state = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025, includeImports: true }), batch = state.imports[0];
  assert.equal(batch.status, "discarded"); assert.equal(batch.months[0].status, "committed"); assert.ok(batch.months[0].receipt); assert.equal(batch.months[0].values.length, 1);
  assert.equal(batch.months[1].status, "discarded"); assert.deepEqual(batch.months[1].values, []);
  assert.equal(ctx.db.raw.prepare("SELECT amount FROM finance_plan_values WHERE plan_id=? AND period='2025-02'").get(plan.targetId)!.amount, 99);
});

test("CSV can stage absent actual months without facts, then atomically create one draft", async () => {
  const ctx = await setup();
  const preview = await ctx.run({ action: "import.preview", kind: "actual", fiscal_year: 2025, csv: csv(["2025-01"]), expected_versions: { "2025-01": { version: 0, period_version: 0 } }, sources: { "2025-01": sources("2025-01") } });
  assert.equal(ctx.db.raw.prepare("SELECT count(*) AS n FROM finance_periods").get()!.n, 0);
  const requestKey = key(), command: FinanceCommand = { action: "import.commit", import_id: preview.targetId, expected_version: 1, period: "2025-01" };
  const committed = await ctx.run(command, requestKey), replay = await ctx.run(command, requestKey);
  assert.equal(replay.targetId, committed.targetId); assert.equal(replay.replayed, true);
  assert.equal(ctx.db.raw.prepare("SELECT count(*) AS n FROM finance_actual_values").get()!.n, 1);
  assert.equal(ctx.db.raw.prepare("SELECT working_revision_id FROM finance_periods WHERE period='2025-01'").get()!.working_revision_id, committed.targetId);
});

test("Export snapshot chunks replay the exact captured settings, sources and amounts after changes", async () => {
  const ctx = await setup(), draft = await savedActual(ctx);
  const initial = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025 });
  await ctx.run({ action: "actual.save", actual_revision_id: draft.id, expected_version: 2, expected_period_version: 2, values: facts(initial, "2025-01", "actual").map(value => ({ ...value, note: "n".repeat(2000), evidenceRef: "e".repeat(1000) })) });
  const command: FinanceCommand = { action: "report.export", report: "actuals", selection: { fiscalYear: 2025, period: "2025-01", actualRevisionId: draft.id, range: "month" }, segment_code: "all" }, requestKey = key();
  const exported = await ctx.run(command, requestKey);
  assert.ok(exported.manifest?.state); assert.ok(exported.manifest?.generatedAt);
  assert.ok(Number(ctx.db.raw.prepare("SELECT count(*) AS n FROM finance_audit_events WHERE action='report.export.chunk'").get()!.n) > 1);
  await ctx.run({ action: "actual.save", actual_revision_id: draft.id, expected_version: 3, expected_period_version: 3, values: [{ lineCode: "pnl.projects", segmentCode: "unallocated", state: "entered", amount: 101, note: "Changed after export", evidenceRef: "later" }] });
  await ctx.run({ action: "book.save", ...bookInput, expected_version: initial.book!.version, variance_amount_threshold: 9000, variance_percent_threshold_bps: 750 });
  const replay = await ctx.run(command, requestKey);
  assert.deepEqual(replay.manifest, exported.manifest);
  const state = await loadFinance(ctx.db, ctx.user, { fiscalYear: 2025, includeAudit: true });
  assert.ok(state.audit.some(event => event.action === "report.export")); assert.ok(state.audit.every(event => event.action !== "report.export.chunk"));
  const nonAdmin = { ...ctx.user, admin: false, can: () => true };
  await assert.rejects(executeFinanceCommand(ctx.db, nonAdmin, requestKey, command), codeIs("forbidden"));
});
