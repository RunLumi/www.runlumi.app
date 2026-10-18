import test from "node:test";
import assert from "node:assert/strict";
import { defaultExpectedInputs, expectedInputsFor, fiscalPeriods, periodBounds } from "../src/lib/finance/calculations.ts";
import { financeMetricCsvValue, financeReportCsv } from "../src/lib/finance/exports.ts";
import { DEFAULT_FINANCE_LINES, type FinanceFact } from "../src/lib/finance/model.ts";
import type { FinanceActualRevision, FinanceFrozenContext, FinanceReceipt, FinanceSelection, FinanceState } from "../src/lib/finance/store-types.ts";

const generatedAt = "2026-10-18T00:00:00Z";
function fixture(): FinanceState {
  const book = { id: "main", entityName: "Synthetic export fixture", currency: "VND", precision: 0, fiscalStartMonth: 1, timezone: "Asia/Ho_Chi_Minh", firstPeriod: "2026-01", cashFloor: 20, version: 1, enabled: true, policyNote: "Synthetic recognition policy", createdAt: generatedAt, updatedAt: generatedAt };
  const lines = structuredClone(DEFAULT_FINANCE_LINES) as typeof DEFAULT_FINANCE_LINES[number][];
  const segments = [{ code: "all", labelEn: "All", labelVi: "Tất cả", activeFrom: "2026-01", activeTo: null }, { code: "unallocated", labelEn: "Unallocated", labelVi: "Chưa phân bổ", activeFrom: "2026-01", activeTo: null }];
  return { book, definitions: [{ id: "def-2026", fiscalYear: 2026, state: "published", version: 1, calculationVersion: "finance-v1", lines, expectedInputs: defaultExpectedInputs(2026, 1), segments, createdAt: generatedAt, publishedAt: generatedAt }], lines, segments, accounts: [{ id: "bank-id", code: "bank", label: "Pinned bank label", activeFrom: "2026-01", activeTo: null, version: 1 }], periods: [], plans: [], planValues: [], actualRevisions: [], actualValues: [], observations: [], imports: [], audit: [], selectedFiscalYear: 2026 };
}
function frozen(state: FinanceState): FinanceFrozenContext {
  return structuredClone({ book: state.book!, lines: state.lines, expectedInputs: state.definitions[0].expectedInputs, segments: state.segments, cashAccounts: state.accounts, calculationVersion: "finance-v1", sources: { sourceAsOf: "2026-01-31", scope: "Synthetic only", blocks: Object.fromEntries(["pnl", "cash", "aging", "position"].map(basis => [basis, { evidenceRef: "statement-source" }])) }, capturedAt: generatedAt });
}
function zeroRows(state: FinanceState, period: string, kind: "actual" | "budget" | "forecast"): FinanceFact[] {
  return expectedInputsFor({ lines: state.lines, expectedInputs: state.definitions[0].expectedInputs, kind }, period).map(item => ({ lineCode: item.lineCode, segmentCode: item.segmentCode, state: "entered", amount: 0, evidenceRef: item.lineCode === "equity.opening" ? "specific-opening-equity-source" : "", note: "" }));
}
function actual(state: FinanceState, period: string, revenue: number, cost: number): FinanceActualRevision {
  const prior = state.actualRevisions.at(-1), opening = prior ? state.observations.find(item => item.actualRevisionId === prior.id && item.kind === "closing")!.amount! : 0;
  const revision: FinanceActualRevision = { id: `actual-${period}`, period, version: 1, state: "closed", definitionSetId: "def-2026", openingSourceRevisionId: prior?.id ?? null, supersedesRevisionId: null, sources: frozen(state).sources, reportingSnapshot: frozen(state), reason: "", createdAt: generatedAt, closedAt: generatedAt, stale: false };
  const values = zeroRows(state, period, "actual");
  for (const [code, amount] of Object.entries({ "pnl.projects": revenue, "pnl.delivery_payroll": cost, "cash.customer_receipts": revenue, "cash.payroll_payments": cost, "position.current_earnings": opening + revenue - cost })) values.find(item => item.lineCode === code)!.amount = amount;
  state.actualRevisions.push(revision); state.actualValues.push(...values.map(value => ({ ...value, actualRevisionId: revision.id, sourceOperationId: "synthetic" })));
  state.periods.push({ period, version: 1, definitionSetId: "def-2026", authoritativeClosedRevisionId: revision.id, workingRevisionId: null });
  if (period === "2026-01") state.observations.push({ actualRevisionId: revision.id, sourceOperationId: "synthetic", accountCode: "bank", kind: "opening", amount: 0, restrictedAmount: 0, classification: "cash", evidenceRef: "opening-bank-source", asOfDate: periodBounds(period).start });
  state.observations.push({ actualRevisionId: revision.id, sourceOperationId: "synthetic", accountCode: "bank", kind: "closing", amount: opening + revenue - cost, restrictedAmount: 0, classification: "cash", evidenceRef: "closing-bank-source", asOfDate: periodBounds(period).end });
  return revision;
}
function plan(state: FinanceState, kind: "budget" | "forecast" = "budget", cutoff: string | null = null): void {
  state.plans.push({ id: "plan", label: "Synthetic plan", fiscalYear: 2026, kind, state: "published", version: 1, definitionSetId: "def-2026", baseline: kind === "budget", assumptions: "Synthetic assumptions", sourcePlanId: null, actualCutoff: cutoff, sourceActuals: Object.fromEntries(state.actualRevisions.filter(item => cutoff && item.period <= cutoff).map(item => [item.period, item.id])), reportingSnapshot: frozen(state), createdAt: generatedAt, publishedAt: generatedAt, stale: false });
  for (const period of fiscalPeriods(2026, 1)) {
    const rows = zeroRows(state, period, kind);
    for (const [code, amount] of Object.entries({ "pnl.projects": 80, "pnl.delivery_payroll": 30, "cash.customer_receipts": 80, "cash.payroll_payments": 30 })) rows.find(item => item.lineCode === code)!.amount = amount;
    state.planValues.push(...rows.map(row => ({ ...row, period, planId: "plan", sourceOperationId: "synthetic" })));
  }
}
function receipt(state: FinanceState, report = "pnl", selection: FinanceSelection = { fiscalYear: 2026, period: "2026-01", planId: "plan", range: "month" }, segmentCode = "all"): FinanceReceipt {
  return { operationId: "export-operation", action: "report.export", targetId: "export-id", version: 1, manifest: { state: structuredClone(state), selection, report, segmentCode, generatedAt, calculationVersion: "finance-v1" } };
}
function readCsv(csv: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];
    if (char === '"') { if (quoted && csv[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted; }
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if (char === "\n" && !quoted) { row.push(cell.endsWith("\r") ? cell.slice(0, -1) : cell); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  const headers = rows.shift()!;
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index]])));
}
function metric(rows: Record<string, string>[], dataset: string, code: string): Record<string, string> { const item = rows.find(row => row.record_type === "metric" && row.dataset === dataset && row.code === code); assert.ok(item, `${dataset}.${code}`); return item; }

test("monthly export includes exact actual, plan, variance, fractions and percentage points", () => {
  const state = fixture(); actual(state, "2026-01", 100, 60); plan(state);
  const output = financeReportCsv(receipt(state)); const rows = readCsv(output.csv);
  assert.equal(output.filename, "lumi-finance-pnl-2026-month-export-id.csv");
  assert.equal(metric(rows, "actual_summary", "revenue").value, "100"); assert.equal(metric(rows, "plan_summary", "revenue").value, "80");
  assert.equal(metric(rows, "actual_summary", "gross_margin").unit, "fraction"); assert.equal(metric(rows, "actual_summary", "gross_margin").value, "0.4");
  assert.equal(rows.find(row => row.record_type === "variance" && row.code === "revenue")?.value, "20");
  assert.equal(rows.find(row => row.record_type === "variance_fraction" && row.code === "revenue")?.value, "0.25");
  assert.equal(rows.find(row => row.record_type === "variance_pp" && row.code === "gross_margin")?.value, "-22.5");
  assert.equal(rows.find(row => row.record_type === "favorability" && row.code === "direct_costs")?.value_state, "adverse");
  assert.ok(rows.filter(row => row.record_type === "input").every(row => row.code.startsWith("pnl.")));
});

test("YTD report exports only its identical closed-month scope and endpoint cash", () => {
  const state = fixture(); actual(state, "2026-01", 100, 60); actual(state, "2026-02", 200, 100); actual(state, "2026-03", 999, 0); plan(state);
  const rows = readCsv(financeReportCsv(receipt(state, "overview", { fiscalYear: 2026, period: "2026-02", planId: "plan", range: "ytd" })).csv);
  assert.equal(metric(rows, "actual_summary", "revenue").value, "300"); assert.equal(metric(rows, "plan_summary", "revenue").value, "160");
  assert.equal(metric(rows, "actual_summary", "cash_closing").value, "140");
  assert.ok(rows.filter(row => ["input", "bank_observation", "source"].includes(row.record_type)).every(row => ["2026-01", "2026-02"].includes(row.period)));
  assert.equal(rows.some(row => row.record_type === "input" && row.value === "999"), false);
});

test("cash, position and working-capital exports retain their reconciliation source controls", () => {
  const state = fixture(); actual(state, "2026-01", 100, 60); plan(state);
  const cash = readCsv(financeReportCsv(receipt(state, "cash-flow")).csv);
  assert.ok(cash.some(row => row.record_type === "input" && row.dataset === "plan" && row.code === "cash.opening"));
  assert.ok(cash.some(row => row.record_type === "input" && row.code === "forecast.restricted_cash"));
  assert.equal(cash.find(row => row.record_type === "bank_observation" && row.label.includes("closing"))?.label, "Pinned bank label (closing)");
  const position = readCsv(financeReportCsv(receipt(state, "position")).csv);
  assert.equal(metric(position, "actual_summary", "position_reconciliation").value, "0"); assert.equal(metric(position, "actual_summary", "equity_reconciliation").value, "0");
  const working = readCsv(financeReportCsv(receipt(state, "working-capital")).csv);
  assert.equal(metric(working, "actual_summary", "ap_aging_total").value, "0");
  assert.ok(working.some(row => row.record_type === "input" && row.code === "aging.ap_control"));
  assert.ok(working.some(row => row.record_type === "input" && row.code === "aging.ar_control"));
});

test("a saved export replays frozen state, historical labels, notes and clock after live mutation", () => {
  const state = fixture(); const january = actual(state, "2026-01", 100, 60); plan(state);
  state.actualValues.find(row => row.actualRevisionId === january.id && row.lineCode === "pnl.projects")!.note = "Frozen input explanation";
  const saved = receipt(state, "overview"), first = financeReportCsv(saved).csv;
  state.book!.cashFloor = 999; state.book!.policyNote = "Later policy"; state.lines.find(line => line.code === "pnl.projects")!.labelEn = "Current alias";
  state.actualValues.find(row => row.actualRevisionId === january.id && row.lineCode === "pnl.projects")!.amount = 500;
  january.stale = true; state.plans[0].stale = true;
  assert.equal(financeReportCsv(saved).csv, first);
  const rows = readCsv(first);
  assert.ok(rows.some(row => row.record_type === "input" && row.label === "Project revenue" && row.note === "Frozen input explanation"));
  assert.ok(rows.some(row => row.code === "pinned_cash_floor" && row.value === "20"));
  assert.ok(rows.some(row => row.code === "generated_at" && row.value === generatedAt));
});

test("historical monthly revision selection excludes current-revision values and preserves source identity", () => {
  const state = fixture(); const january = actual(state, "2026-01", 100, 60); plan(state);
  const replacement = { ...structuredClone(january), id: "replacement", version: 2, supersedesRevisionId: january.id };
  state.actualRevisions.push(replacement); state.periods[0].authoritativeClosedRevisionId = replacement.id;
  state.actualValues.push(...state.actualValues.filter(row => row.actualRevisionId === january.id).map(row => ({ ...row, actualRevisionId: replacement.id, amount: row.lineCode === "pnl.projects" ? 999 : row.amount })));
  const rows = readCsv(financeReportCsv(receipt(state, "pnl", { fiscalYear: 2026, period: "2026-01", planId: "plan", actualRevisionId: january.id, range: "month" })).csv);
  assert.equal(metric(rows, "actual_summary", "revenue").value, "100"); assert.equal(metric(rows, "actual_summary", "revenue").version_id, january.id);
  assert.equal(rows.some(row => row.record_type === "input" && row.version_id === replacement.id), false);
});

test("missing actual forecast prefix never exports copied plan facts as a past alternative", () => {
  const state = fixture(); actual(state, "2026-01", 100, 60); plan(state, "forecast", "2026-01");
  state.plans[0].sourceActuals = {};
  const rows = readCsv(financeReportCsv(receipt(state)).csv);
  assert.equal(metric(rows, "plan_summary", "revenue").value_state, "missing");
  assert.equal(rows.some(row => row.record_type === "input" && row.dataset === "plan"), false);
  assert.equal(rows.find(row => row.record_type === "variance" && row.code === "revenue")?.value_state, "no_comparison");
});

test("zero baseline is unbudgeted, with no invented percentage", () => {
  const state = fixture(); actual(state, "2026-01", 100, 60); plan(state);
  state.planValues.find(row => row.period === "2026-01" && row.lineCode === "pnl.projects")!.amount = 0;
  const rows = readCsv(financeReportCsv(receipt(state)).csv);
  assert.equal(rows.find(row => row.record_type === "variance" && row.code === "revenue")?.value_state, "unbudgeted");
  assert.equal(rows.find(row => row.record_type === "variance_fraction" && row.code === "revenue")?.value, "");
});

test("export materiality follows the pinned actual policy instead of changed current settings", () => {
  const state = fixture();
  state.book!.varianceAmountThreshold = 30; state.book!.variancePercentThresholdBps = 500;
  actual(state, "2026-01", 100, 60); plan(state);
  state.book!.varianceAmountThreshold = 1000; state.book!.variancePercentThresholdBps = 100000;
  const rows = readCsv(financeReportCsv(receipt(state)).csv);
  assert.equal(rows.find(row => row.record_type === "materiality" && row.code === "revenue")?.value_state, "material");
  assert.equal(rows.find(row => row.code === "materiality_amount_threshold")?.value, "30");
  assert.equal(rows.find(row => row.code === "materiality_percent_threshold_bps")?.value, "500");
  assert.equal(rows.some(row => row.record_type === "materiality" && row.code === "gross_margin"), false);
});

test("only registered ratios accept fractions; corrupted amounts and unsupported calculation versions fail closed", () => {
  assert.deepEqual(financeMetricCsvValue("net_margin", 1 / 3, 0), { text: "0.333333333333", unit: "fraction" });
  assert.deepEqual(financeMetricCsvValue("revenue", 12345, 2), { text: "123.45", unit: "major_currency" });
  assert.throws(() => financeMetricCsvValue("unknown_metric", .25, 0), { code: "UNSAFE_AMOUNT" });
  assert.throws(() => financeMetricCsvValue("net_margin", Infinity, 0), { code: "invalid_export_number" });
  const state = fixture(); actual(state, "2026-01", 100, 60); plan(state);
  state.actualValues.find(row => row.lineCode === "pnl.projects")!.amount = .25;
  assert.throws(() => financeReportCsv(receipt(state)), { code: "UNSAFE_AMOUNT" });
  const unsupported = receipt(state); unsupported.manifest!.calculationVersion = "finance-v999";
  assert.throws(() => financeReportCsv(unsupported), { code: "unsupported_calculation_version" });
});

test("all exported free text is formula-safe while negative numeric variances stay numeric", () => {
  const state = fixture(); actual(state, "2026-01", 100, 60); plan(state);
  state.actualValues.find(row => row.lineCode === "pnl.projects")!.note = '=HYPERLINK("bad")';
  state.book!.entityName = "\t=bad";
  const rows = readCsv(financeReportCsv(receipt(state)).csv);
  assert.equal(rows.find(row => row.code === "entity")?.value, "'\t=bad");
  assert.ok(rows.some(row => row.note === "'=HYPERLINK(\"bad\")"));
  assert.equal(rows.find(row => row.record_type === "variance" && row.code === "net_profit")?.value, "-10");
});
