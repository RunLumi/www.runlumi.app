import test from "node:test";
import assert from "node:assert/strict";
import { defaultExpectedInputs, expectedInputsFor, fiscalPeriods, periodBounds } from "../src/lib/finance/calculations.ts";
import { DEFAULT_FINANCE_LINES, type FinanceCalculationContext, type FinanceFact } from "../src/lib/finance/model.ts";
import { financeClosedPrefix, financePlanReports, financeReportView, financeRevisionContext } from "../src/lib/finance/reports.ts";
import type { FinanceActualRevision, FinanceFrozenContext, FinancePlan, FinanceState } from "../src/lib/finance/store-types.ts";

const now = "2026-10-18T00:00:00Z";
function state(firstPeriod = "2026-01", fiscalStartMonth = 1, fiscalYear = 2026): FinanceState {
  const book = { id: "main", entityName: "Synthetic report fixture", currency: "VND", precision: 0, fiscalStartMonth, timezone: "Asia/Ho_Chi_Minh", firstPeriod, cashFloor: 20, version: 1, enabled: true, policyNote: "Synthetic fixture policy", createdAt: now, updatedAt: now };
  const months = fiscalPeriods(fiscalYear, fiscalStartMonth);
  const segments = [{ code: "all", labelEn: "All", labelVi: "Tất cả", activeFrom: months[0], activeTo: null }, { code: "unallocated", labelEn: "Unallocated", labelVi: "Chưa phân bổ", activeFrom: months[0], activeTo: null }];
  const lines = structuredClone(DEFAULT_FINANCE_LINES) as typeof DEFAULT_FINANCE_LINES[number][];
  const definitions = [{ id: `definition-${fiscalYear}`, fiscalYear, state: "published" as const, version: 1, calculationVersion: "finance-v1", lines, expectedInputs: defaultExpectedInputs(fiscalYear, fiscalStartMonth, lines, { firstPeriod }), segments, createdAt: now, publishedAt: now }];
  return { book, definitions, lines, segments, accounts: [{ id: "account-bank", code: "bank", label: "Synthetic bank", activeFrom: months[0], activeTo: null, version: 1 }], periods: [], plans: [], planValues: [], actualRevisions: [], actualValues: [], observations: [], imports: [], audit: [], selectedFiscalYear: fiscalYear };
}
function frozen(value: FinanceState): FinanceFrozenContext {
  return structuredClone({ book: value.book!, lines: value.lines, expectedInputs: value.definitions[0].expectedInputs, segments: value.segments, cashAccounts: value.accounts, calculationVersion: "finance-v1", sources: { sourceAsOf: "2026-01-31", scope: "Synthetic fixture", blocks: Object.fromEntries(["pnl", "cash", "position", "aging"].map(block => [block, { evidenceRef: "synthetic-evidence" }])) }, capturedAt: now });
}
function facts(value: FinanceState, period: string, kind: FinanceCalculationContext["kind"]): FinanceFact[] {
  return expectedInputsFor({ lines: value.lines, expectedInputs: value.definitions[0].expectedInputs, kind }, period).map(item => ({ lineCode: item.lineCode, segmentCode: item.segmentCode, state: "entered", amount: 0, note: "", evidenceRef: item.lineCode === "equity.opening" ? "synthetic-opening-equity-source" : "" }));
}
function put(rows: FinanceFact[], code: string, amount: number): void { const row = rows.find(item => item.lineCode === code); assert.ok(row, code); row.amount = amount; }
function actual(value: FinanceState, period: string, revenue = 10): FinanceActualRevision {
  const previous = [...value.actualRevisions].filter(item => item.period < period && item.state === "closed").sort((a, b) => b.period.localeCompare(a.period))[0];
  const opening = previous ? value.observations.find(item => item.actualRevisionId === previous.id && item.kind === "closing")!.amount! : 0;
  const revision: FinanceActualRevision = { id: `actual-${period}`, period, version: 1, state: "closed", definitionSetId: value.definitions[0].id, openingSourceRevisionId: previous?.id ?? null, supersedesRevisionId: null, sources: frozen(value).sources, reportingSnapshot: frozen(value), reason: "", createdAt: now, closedAt: now, stale: false };
  const rows = facts(value, period, "actual"); put(rows, "pnl.projects", revenue); put(rows, "cash.customer_receipts", revenue); put(rows, "position.current_earnings", opening + revenue);
  value.actualRevisions.push(revision);
  value.actualValues.push(...rows.map(row => ({ ...row, actualRevisionId: revision.id, sourceOperationId: "synthetic-operation" })));
  value.periods.push({ period, version: 1, definitionSetId: revision.definitionSetId, authoritativeClosedRevisionId: revision.id, workingRevisionId: null });
  if (period === value.book!.firstPeriod) value.observations.push({ actualRevisionId: revision.id, sourceOperationId: "synthetic-operation", accountCode: "bank", kind: "opening", amount: 0, restrictedAmount: 0, classification: "cash", evidenceRef: "synthetic-opening", asOfDate: periodBounds(period).start });
  value.observations.push({ actualRevisionId: revision.id, sourceOperationId: "synthetic-operation", accountCode: "bank", kind: "closing", amount: opening + revenue, restrictedAmount: 0, classification: "cash", evidenceRef: "synthetic-closing", asOfDate: periodBounds(period).end });
  return revision;
}
function plan(value: FinanceState, kind: "budget" | "forecast" = "budget", cutoff: string | null = null, monthly = 20): FinancePlan {
  const result: FinancePlan = { id: `plan-${kind}`, label: "Synthetic plan", fiscalYear: value.selectedFiscalYear, kind, state: "published", version: 1, definitionSetId: value.definitions[0].id, baseline: kind === "budget", assumptions: "Synthetic assumptions", sourcePlanId: null, actualCutoff: cutoff, sourceActuals: Object.fromEntries(value.actualRevisions.filter(revision => cutoff && revision.period <= cutoff).map(revision => [revision.period, revision.id])), reportingSnapshot: frozen(value), createdAt: now, publishedAt: now, stale: false };
  value.plans.push(result);
  for (const period of fiscalPeriods(result.fiscalYear, value.book!.fiscalStartMonth)) {
    const rows = facts(value, period, kind); put(rows, "pnl.projects", monthly); put(rows, "cash.customer_receipts", monthly);
    value.planValues.push(...rows.map(row => ({ ...row, period, planId: result.id, sourceOperationId: "synthetic-operation" })));
  }
  return result;
}

test("default all-book report includes P&L and keeps actual and baseline separate", () => {
  const value = state(); actual(value, "2026-01", 10); plan(value);
  const view = financeReportView(value, { fiscalYear: 2026, period: "2026-01" }, { now });
  assert.equal(view.report?.metrics.revenue, 10); assert.equal(view.report?.metrics.net_profit, 10);
  assert.equal(view.report?.metrics.equity_reconciliation, 0); assert.equal(view.report?.reconciled, true);
  assert.equal(view.planReport?.metrics.revenue, 20); assert.equal(view.reports.length, 12);
});

test("YTD starts at fiscal-year start, compares identical closed months and stops before reopening", () => {
  const value = state(); actual(value, "2026-01", 10); actual(value, "2026-02", 30); actual(value, "2026-03", 50); plan(value);
  const view = financeReportView(value, { fiscalYear: 2026, period: "2026-03" }, { range: "ytd", now });
  assert.deepEqual(view.comparisonPeriods, ["2026-01", "2026-02", "2026-03"]);
  assert.equal(view.aggregateReport?.metrics.revenue, 90); assert.equal(view.aggregatePlanReport?.metrics.revenue, 60);
  assert.equal(view.aggregateReport?.metrics.cash_closing, 90);
  value.periods.find(item => item.period === "2026-02")!.workingRevisionId = "restatement-in-progress";
  const reopened = financeReportView(value, { fiscalYear: 2026, period: "2026-03" }, { range: "ytd", now });
  assert.deepEqual(reopened.comparisonPeriods, ["2026-01"]); assert.equal(reopened.aggregateReport?.metrics.revenue, 10);
  value.periods.find(item => item.period === "2026-01")!.authoritativeClosedRevisionId = null;
  assert.deepEqual(financeClosedPrefix(value, fiscalPeriods(2026, 1), "2026-03", now), []);
});

test("a genuine midyear cutover has an honest partial-year prefix and incomplete annual outlook", () => {
  const value = state("2026-06"); actual(value, "2026-06", 10); actual(value, "2026-07", 20); const forecast = plan(value, "forecast", "2026-07", 5);
  const view = financeReportView(value, { fiscalYear: 2026, period: "2026-08", planId: forecast.id }, { range: "ytd", now });
  assert.deepEqual(view.comparisonPeriods, ["2026-06", "2026-07"]); assert.match(view.comparisonLabel, /partial year/);
  assert.equal(view.aggregateReport?.metrics.revenue, 30);
  assert.equal(view.planReports.find(report => report.period === "2026-01")?.metrics.revenue, null);
  assert.equal(view.planReports.find(report => report.period === "2026-08")?.metrics.cash_opening, 30);
  assert.equal(view.planReports.find(report => report.period === "2026-08")?.metrics.cash_closing, 35);
  const annual = financeReportView(value, { fiscalYear: 2026, period: "2026-08", planId: forecast.id }, { range: "year", now });
  assert.equal(annual.aggregatePlanReport?.completeness.complete, false); assert.equal(annual.aggregatePlanReport?.metrics.revenue, null);
});

test("forecast prefix cannot use copied plan values when its actual source is absent or not closed", () => {
  const value = state(); actual(value, "2026-01", 10); actual(value, "2026-02", 20); const forecast = plan(value, "forecast", "2026-02", 99);
  delete forecast.sourceActuals["2026-02"];
  const reports = financePlanReports(value, forecast, fiscalPeriods(2026, 1), "all", now);
  assert.equal(reports[1].kind, "actual"); assert.equal(reports[1].metrics.revenue, null);
  assert.equal(reports[2].metrics.cash_opening, null); assert.equal(reports[2].metrics.cash_closing, null);
  forecast.sourceActuals["2026-02"] = "actual-2026-02";
  value.actualRevisions.find(item => item.period === "2026-02")!.state = "draft";
  assert.equal(financePlanReports(value, forecast, fiscalPeriods(2026, 1), "all", now)[1].metrics.revenue, null);
});

test("stale or unreconciled actual anchors cannot seed a healthy forecast cash path", () => {
  const value = state(); const january = actual(value, "2026-01", 10); const forecast = plan(value, "forecast", "2026-01", 5);
  january.stale = true;
  let reports = financePlanReports(value, forecast, fiscalPeriods(2026, 1), "all", now);
  assert.equal(reports[1].metrics.cash_closing, null); assert.equal(reports[1].reconciled, false);
  january.stale = false; forecast.stale = true;
  reports = financePlanReports(value, forecast, fiscalPeriods(2026, 1), "all", now);
  assert.equal(reports[0].stale, true); assert.equal(reports[0].reconciled, false); assert.equal(reports[1].metrics.cash_closing, null);
  forecast.stale = false;
  value.observations.find(item => item.actualRevisionId === january.id && item.kind === "closing")!.amount = 11;
  assert.equal(financePlanReports(value, forecast, fiscalPeriods(2026, 1), "all", now)[1].metrics.cash_closing, null);
});

test("segment YTD uses book close eligibility while preserving unallocated costs and whole-book cash", () => {
  const value = state();
  value.segments.push({ code: "product", labelEn: "Product", labelVi: "Sản phẩm", activeFrom: "2026-01", activeTo: null });
  value.definitions[0].expectedInputs = value.definitions[0].expectedInputs.map(item => item.lineCode === "pnl.projects" ? { ...item, segmentCode: "product" } : item);
  actual(value, "2026-01", 10); actual(value, "2026-02", 20); const forecast = plan(value, "forecast", "2026-02", 5);
  const view = financeReportView(value, { fiscalYear: 2026, period: "2026-03", planId: forecast.id }, { range: "ytd", segmentCode: "product", now });
  assert.deepEqual(view.comparisonPeriods, ["2026-01", "2026-02"]); assert.equal(view.aggregateReport?.metrics.revenue, 30);
  assert.equal(view.reports[0].metrics.equity_reconciliation, null); assert.equal(view.reports[0].metrics.cash_closing, 10);
  assert.equal(view.planReports[2].metrics.cash_opening, 30); assert.equal(view.planReports[2].metrics.cash_closing, 35);
});

test("frozen actual and plan contexts reproduce money, labels and floor despite later settings", () => {
  const value = state(); const january = actual(value, "2026-01", 10); const budget = plan(value);
  const original = financeReportView(value, { fiscalYear: 2026, period: "2026-01", planId: budget.id }, { now });
  value.book!.cashFloor = 999; value.book!.entityName = "Later alias";
  value.lines.find(line => line.code === "pnl.projects")!.sign = -1;
  value.lines.find(line => line.code === "pnl.projects")!.labelEn = "Later label";
  value.accounts[0].label = "Later bank alias";
  const repeated = financeReportView(value, { fiscalYear: 2026, period: "2026-01", planId: budget.id }, { now });
  assert.deepEqual(repeated.report, original.report); assert.deepEqual(repeated.planReport, original.planReport);
  const pinned = financeRevisionContext(value, january, "all", now);
  assert.equal(pinned.book.cashFloor, 20); assert.equal(pinned.lines.find(line => line.code === "pnl.projects")!.labelEn, "Project revenue");
  assert.equal(pinned.cashAccounts[0].label, "Synthetic bank");
});

test("quarter ranges follow fiscal order and historical revisions remain month-specific", () => {
  const value = state("2026-10", 10); plan(value);
  const quarter = financeReportView(value, { fiscalYear: 2026, period: "2027-01" }, { range: "quarter", now });
  assert.deepEqual(quarter.comparisonPeriods, ["2027-01", "2027-02", "2027-03"]);
  const regular = state(); const revision = actual(regular, "2026-01", 10);
  regular.periods[0].authoritativeClosedRevisionId = "another-revision";
  assert.throws(() => financeReportView(regular, { fiscalYear: 2026, period: "2026-01", actualRevisionId: revision.id }, { range: "ytd", now }), { code: "historical_revision_requires_month" });
  assert.equal(financeReportView(regular, { fiscalYear: 2026, period: "2026-01", actualRevisionId: revision.id }, { now }).report?.metrics.revenue, 10);
  assert.throws(() => financeReportView(regular, { fiscalYear: 2026, period: "2026-02", actualRevisionId: revision.id }, { now }), { code: "actual_revision_not_found" });
});
