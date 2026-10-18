import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateReports, allocateAnnual, buildFinanceOutlook, calculateReport, calculateRunway, calculateVariance,
  currentPeriod, defaultExpectedInputs, expectedInputsFor, fiscalPeriods, fiscalYearForPeriod, formatMoneyInput,
  parseMinorUnits, parseMoney, periodBounds, sumMoney, validateFinanceSnapshot, isMaterialVariance,
} from "../src/lib/finance/calculations.ts";
import { DEFAULT_FINANCE_LINES, type FinanceBook, type FinanceCalculationContext, type FinanceFact, type FinanceReport, type FinanceSnapshot } from "../src/lib/finance/model.ts";

const book: FinanceBook = { id: "synthetic", entityName: "Synthetic fixture", currency: "VND", precision: 0, fiscalStartMonth: 1, timezone: "Asia/Ho_Chi_Minh", firstPeriod: "2026-01", cashFloor: 20 };
function context(kind: FinanceCalculationContext["kind"] = "actual", overrides: Partial<FinanceCalculationContext> = {}): FinanceCalculationContext {
  return { book, kind, lines: DEFAULT_FINANCE_LINES, expectedInputs: defaultExpectedInputs(2026, 1, DEFAULT_FINANCE_LINES, { firstPeriod: book.firstPeriod }), cashAccounts: [{ code: "bank", label: "Synthetic bank", activeFrom: "2026-01" }], now: "2026-10-18T00:00:00Z", ...overrides };
}
function fixture(period = "2026-01", ctx = context()): FinanceSnapshot {
  return { period, revisionId: `revision-${period}`, state: "draft", values: expectedInputsFor(ctx, period).map(input => ({ lineCode: input.lineCode, segmentCode: input.segmentCode, state: "entered", amount: 0, note: "", evidenceRef: input.lineCode === "equity.opening" ? "synthetic-opening-equity-source" : "" })), cashObservations: ctx.kind === "actual" ? [
    ...(period === ctx.book.firstPeriod ? [{ accountCode: "bank", kind: "opening" as const, amount: 0, restrictedAmount: 0, classification: "cash" as const, evidenceRef: "synthetic-statement", asOfDate: periodBounds(period).start }] : []),
    { accountCode: "bank", kind: "closing", amount: 0, restrictedAmount: 0, classification: "cash", evidenceRef: "synthetic-statement", asOfDate: periodBounds(period).end },
  ] : [] };
}
function set(snapshot: FinanceSnapshot, values: Record<string, number>): void {
  for (const [code, amount] of Object.entries(values)) {
    const fact = snapshot.values.find(value => value.lineCode === code);
    assert.ok(fact, `Fixture line ${code} exists`); fact.amount = amount;
    if (amount < 0 || DEFAULT_FINANCE_LINES.find(line => line.code === code)?.requireNote) fact.note = "Synthetic explanation";
    if (code.startsWith("equity.") && amount !== 0) fact.evidenceRef = "synthetic-equity-evidence";
  }
}
function closed(snapshot: FinanceSnapshot): FinanceSnapshot { return { ...snapshot, state: "closed" }; }
function assertCloses(snapshot: FinanceSnapshot, ctx = context()): FinanceReport {
  const result = validateFinanceSnapshot(snapshot, ctx, "close");
  assert.equal(result.valid, true, JSON.stringify(result.issues));
  return result.report;
}

test("major/minor decimal conversion never loses money precision", () => {
  assert.equal(parseMoney("1234567890123.45", 2), 123456789012345);
  assert.equal(parseMoney("-0.01", 2), -1);
  assert.equal(formatMoneyInput(-1001, 2), "-10.01");
  assert.equal(formatMoneyInput(Number.MAX_SAFE_INTEGER, 6), "9007199254.740991");
  assert.equal(parseMoney("9007199254.740991", 6), Number.MAX_SAFE_INTEGER);
  assert.equal(parseMinorUnits("9007199254740991"), Number.MAX_SAFE_INTEGER);
  assert.equal(sumMoney([Number.MAX_SAFE_INTEGER, 5, -5]), Number.MAX_SAFE_INTEGER);
  for (const input of ["", " ", " 1", "1 ", "1,000", "1.000,00", "1e3", "+1", "01", "Infinity", "NaN", "0.001"]) assert.throws(() => parseMoney(input, 2));
  for (const input of ["9007199254740992", "1.0", "1e2", "01", " 1"]) assert.throws(() => parseMinorUnits(input));
  assert.throws(() => parseMoney("9007199254.740992", 6));
  assert.throws(() => sumMoney([Number.MAX_SAFE_INTEGER, 1]));
});

test("fiscal months, leap boundaries and local close calendar are exact", () => {
  assert.deepEqual(fiscalPeriods(2026, 10), ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07", "2027-08", "2027-09"]);
  assert.equal(fiscalYearForPeriod("2027-09", 10), 2026);
  assert.equal(fiscalYearForPeriod("2027-10", 10), 2027);
  assert.deepEqual(periodBounds("2028-02"), { start: "2028-02-01", end: "2028-02-29" });
  assert.equal(periodBounds("2100-02").end, "2100-02-28");
  assert.equal(currentPeriod("Asia/Ho_Chi_Minh", "2026-01-31T17:00:00Z"), "2026-02");
  assert.equal(currentPeriod("America/Los_Angeles", "2026-02-01T00:00:00Z"), "2026-01");
  assert.throws(() => fiscalPeriods(2026, 13)); assert.throws(() => periodBounds("2026-00"));
  assert.throws(() => currentPeriod("Not/A_Timezone", "2026-01-01"));
});

test("annual allocation preserves signed total with stable rational remainder ties", () => {
  assert.deepEqual(allocateAnnual(100), [9, 9, 9, 9, 8, 8, 8, 8, 8, 8, 8, 8]);
  assert.deepEqual(allocateAnnual(-100), [-9, -9, -9, -9, -8, -8, -8, -8, -8, -8, -8, -8]);
  assert.deepEqual(allocateAnnual(3, ["0.1", "0.2", "0.3", ...Array(9).fill("0")]), [1, 1, 1, ...Array(9).fill(0)]);
  assert.deepEqual(allocateAnnual(7, ["0", "0", "1", ...Array(9).fill("0")]), [0, 0, 7, ...Array(9).fill(0)]);
  assert.equal(sumMoney(allocateAnnual(Number.MAX_SAFE_INTEGER, ["1.123456789012345678", ...Array(11).fill("3.456")])), Number.MAX_SAFE_INTEGER);
  for (let total = -71; total <= 71; total++) assert.equal(sumMoney(allocateAnnual(total)), total);
  assert.throws(() => allocateAnnual(1, Array(12).fill(0)));
  assert.throws(() => allocateAnnual(1, [-1, ...Array(11).fill(1)]));
  assert.throws(() => allocateAnnual(1, Array(11).fill(1)));
  assert.throws(() => allocateAnnual(1, ["NaN", ...Array(11).fill("1")]));
});

test("default manifests are intentional coordinates and distinguish actual from plan controls", () => {
  const ctx = context(), actual = expectedInputsFor(ctx, "2026-01"), plan = expectedInputsFor({ ...ctx, kind: "budget" }, "2026-01");
  assert.ok(actual.filter(item => item.lineCode.startsWith("pnl.")).every(item => item.segmentCode === "unallocated"));
  assert.equal(actual.some(item => item.lineCode === "forecast.restricted_cash"), false);
  assert.equal(actual.some(item => item.lineCode === "cash.opening"), false);
  assert.equal(plan.some(item => item.lineCode === "equity.opening"), false);
  assert.equal(plan.some(item => item.lineCode === "cash.opening"), true);
  assert.equal(plan.some(item => item.lineCode.startsWith("aging.")), false);
  assert.equal(expectedInputsFor(ctx, "2026-02").some(item => item.lineCode === "equity.opening"), false);
  assert.equal(expectedInputsFor({ ...ctx, kind: "budget" }, "2026-02").some(item => item.lineCode === "cash.opening"), false);
});

test("explicit all-zero monthly close is complete; blanks cannot silently become zero", () => {
  const snapshot = fixture();
  const good = assertCloses(snapshot);
  assert.equal(good.metrics.net_profit, 0); assert.equal(good.metrics.cash_closing, 0); assert.equal(good.metrics.net_margin, null);
  set(snapshot, { "pnl.projects": 100, "pnl.shared_payroll": 20 });
  snapshot.values.find(value => value.lineCode === "pnl.subcontractors")!.state = "missing";
  snapshot.values.find(value => value.lineCode === "pnl.subcontractors")!.amount = null;
  const missing = calculateReport(snapshot, context());
  assert.equal(missing.metrics.revenue, 100); assert.equal(missing.metrics.gross_profit, null); assert.equal(missing.metrics.net_profit, null);
  assert.equal(missing.completeness.complete, false); assert.equal(missing.canClose, false);
  assert.equal(validateFinanceSnapshot(snapshot, context(), "draft").valid, true);
  snapshot.values.find(value => value.lineCode === "pnl.subcontractors")!.state = "entered";
  snapshot.values.find(value => value.lineCode === "pnl.subcontractors")!.amount = 0;
  assert.equal(calculateReport(snapshot, context()).metrics.operating_profit, 80);
});

test("N/A must be pinned and explained; zeros for cash controls are mandatory", () => {
  const snapshot = fixture(), ctx = context();
  const revenue = snapshot.values.find(value => value.lineCode === "pnl.products")!;
  Object.assign(revenue, { state: "not_applicable", amount: null, note: "No product line in this period." });
  assertCloses(snapshot, ctx);
  revenue.note = ""; assert.equal(validateFinanceSnapshot(snapshot, ctx, "draft").valid, false);
  revenue.note = "Explained";
  ctx.expectedInputs = ctx.expectedInputs.map(item => item.lineCode === "pnl.products" ? { ...item, allowNa: false } : item);
  assert.ok(calculateReport(snapshot, ctx).issues.some(issue => issue.code === "NA_NOT_ALLOWED"));
  Object.assign(snapshot.values.find(value => value.lineCode === "cash.customer_receipts")!, { state: "not_applicable", amount: null, note: "No activity" });
  assert.ok(calculateReport(snapshot, ctx).issues.some(issue => issue.code === "NA_NOT_ALLOWED" && issue.lineCode === "cash.customer_receipts"));
});

test("optional policy flags cannot make absent applicable inputs count as complete", () => {
  for (const kind of ["actual", "budget"] as const) {
    const ctx = context(kind);
    ctx.lines = ctx.lines.map(line => line.code === "pnl.products" ? { ...line, required: false } : line);
    ctx.expectedInputs = ctx.expectedInputs.map(item => item.lineCode === "pnl.products" ? { ...item, required: false } : item);
    const snapshot = fixture("2026-01", ctx);
    snapshot.values = snapshot.values.filter(fact => fact.lineCode !== "pnl.products");
    const result = validateFinanceSnapshot(snapshot, ctx, kind === "actual" ? "close" : "publish");
    assert.equal(result.valid, false); assert.equal(result.report.completeness.complete, false);
    assert.equal(result.report.metrics.revenue, null);
    assert.ok(result.issues.some(issue => issue.code === "MISSING_INPUT" && issue.lineCode === "pnl.products"));
    assert.equal(validateFinanceSnapshot(snapshot, ctx, "draft").valid, true);
  }
});

test("unknown, derived, duplicate, unsafe and unexplained facts reject draft saves", () => {
  const invalidFacts: FinanceFact[] = [
    { lineCode: "unknown", segmentCode: "all", state: "entered", amount: 0, note: "", evidenceRef: "" },
    { lineCode: "position.cash", segmentCode: "all", state: "entered", amount: 5, note: "", evidenceRef: "" },
    { lineCode: "pnl.projects", segmentCode: "other", state: "entered", amount: 5, note: "", evidenceRef: "" },
  ];
  for (const fact of invalidFacts) { const snapshot = fixture(); snapshot.values.push(fact); assert.equal(validateFinanceSnapshot(snapshot, context(), "draft").valid, false); }
  const duplicate = fixture(); duplicate.values.push({ ...duplicate.values[0] }); assert.ok(calculateReport(duplicate, context()).issues.some(issue => issue.code === "DUPLICATE_COORDINATE"));
  for (const [code, amount] of [["pnl.projects", -1], ["pnl.other_revenue", 1], ["position.ar_gross", -1], ["pnl.projects", Number.MAX_SAFE_INTEGER + 1]] as const) {
    const snapshot = fixture(); snapshot.values.find(value => value.lineCode === code)!.amount = amount;
    assert.equal(validateFinanceSnapshot(snapshot, context(), "draft").valid, false);
  }
});

test("recognized profit, customer cash, borrowing and capex reconcile independently", () => {
  const snapshot = fixture();
  set(snapshot, { "pnl.projects": 10, "pnl.shared_payroll": 4, "cash.customer_receipts": 120, "cash.operating_payments": 4, "cash.loan_draws": 30, "cash.asset_purchases": 24, "equity.opening": 50, "position.fixed_assets": 24, "position.debt": 30, "position.deferred_revenue": 110, "position.share_capital": 50, "position.current_earnings": 6 });
  snapshot.cashObservations[0].amount = 50; snapshot.cashObservations[1].amount = 172;
  const report = assertCloses(snapshot);
  assert.equal(report.metrics.net_profit, 6); assert.equal(report.metrics.cash_operating, 116);
  assert.equal(report.metrics.cash_investing, -24); assert.equal(report.metrics.cash_financing, 30);
  assert.equal(report.metrics.cash_closing, 172); assert.equal(report.metrics.assets, 196);
  assert.equal(report.metrics.equity, 56); assert.equal(report.metrics.equity_reconciliation, 0);
});

test("overdraft bridge requires one explicit financing draw and excludes debt from eligible cash", () => {
  const snapshot = fixture();
  set(snapshot, { "pnl.shared_payroll": 15, "cash.payroll_payments": 15, "cash.loan_draws": 10, "equity.opening": 5, "position.share_capital": 5, "position.current_earnings": -15, "position.debt": 10 });
  snapshot.cashObservations[0].amount = 5;
  Object.assign(snapshot.cashObservations[1], { amount: -10, classification: "borrowing" });
  const report = assertCloses(snapshot);
  assert.equal(report.metrics.cash_opening, 5); assert.equal(report.metrics.cash_operating, -15); assert.equal(report.metrics.cash_financing, 10);
  assert.equal(report.metrics.cash_closing, 0); assert.equal(report.metrics.cash_available, 0); assert.equal(report.metrics.cash_borrowing, 10);
  set(snapshot, { "cash.loan_draws": 0 }); assert.ok(calculateReport(snapshot, context()).issues.some(issue => issue.code === "CASH_RECONCILIATION"));
  set(snapshot, { "cash.loan_draws": 10, "position.debt": 0 }); assert.ok(calculateReport(snapshot, context()).issues.some(issue => issue.code === "BORROWING_RECONCILIATION"));
  snapshot.cashObservations[1].classification = "cash"; assert.ok(calculateReport(snapshot, context()).issues.some(issue => issue.code === "INVALID_OBSERVATION"));
});

test("gross aging, allowance and net AR do not double-count assets", () => {
  const snapshot = fixture();
  set(snapshot, { "pnl.projects": 100, "pnl.bad_debt": 10, "position.ar_gross": 100, "position.ar_allowance": 10, "position.current_earnings": 90, "aging.ar_current": 100, "aging.ar_control": 100 });
  const report = assertCloses(snapshot);
  assert.equal(report.metrics.ar_gross, 100); assert.equal(report.metrics.ar_net, 90); assert.equal(report.metrics.assets, 90); assert.equal(report.metrics.ar_aging_total, 100);
  set(snapshot, { "aging.ar_current": 90 }); assert.ok(calculateReport(snapshot, context()).issues.some(issue => issue.code === "AR_RECONCILIATION"));
  set(snapshot, { "position.ar_allowance": 101 }); assert.ok(calculateReport(snapshot, context()).issues.some(issue => issue.code === "INVALID_ALLOWANCE"));
});

test("pass-through tax cash and noncash capital remain outside recognized revenue/financing", () => {
  const tax = fixture();
  set(tax, { "pnl.projects": 100, "cash.customer_receipts": 110, "position.tax_payable": 10, "position.current_earnings": 100 }); tax.cashObservations[1].amount = 110;
  const report = assertCloses(tax);
  assert.equal(report.metrics.revenue, 100); assert.equal(report.metrics.cash_operating, 110); assert.equal(report.metrics.income_tax, 0);
  const capital = fixture();
  set(capital, { "equity.noncash_contributions": 50, "position.fixed_assets": 50, "position.share_capital": 50 });
  const contribution = assertCloses(capital); assert.equal(contribution.metrics.cash_financing, 0); assert.equal(contribution.metrics.equity, 50);
});

test("cash observations require all active accounts, exact boundary, evidence and restricted bounds", () => {
  for (const mutation of [
    (snapshot: FinanceSnapshot) => { snapshot.cashObservations.pop(); },
    (snapshot: FinanceSnapshot) => { snapshot.cashObservations[1].restrictedAmount = 1; },
    (snapshot: FinanceSnapshot) => { snapshot.cashObservations[1].evidenceRef = ""; },
    (snapshot: FinanceSnapshot) => { snapshot.cashObservations[1].asOfDate = "2026-01-30"; },
    (snapshot: FinanceSnapshot) => { snapshot.cashObservations.push({ ...snapshot.cashObservations[1] }); },
  ]) { const snapshot = fixture(); mutation(snapshot); assert.equal(validateFinanceSnapshot(snapshot, context(), "close").valid, false); }
});

test("cutover and noncash equity need individual evidence before close, while drafts remain editable", () => {
  const snapshot = fixture(); snapshot.values.find(value => value.lineCode === "equity.opening")!.evidenceRef = "";
  assert.equal(validateFinanceSnapshot(snapshot, context(), "draft").valid, true);
  assert.equal(validateFinanceSnapshot(snapshot, context(), "close").valid, false);
  assert.ok(calculateReport(snapshot, context()).issues.some(issue => issue.code === "MISSING_EVIDENCE" && issue.lineCode === "equity.opening"));
  snapshot.values.find(value => value.lineCode === "equity.opening")!.evidenceRef = "synthetic-opening-source";
  set(snapshot, { "equity.noncash_contributions": 50, "position.fixed_assets": 50, "position.share_capital": 50 });
  snapshot.values.find(value => value.lineCode === "equity.noncash_contributions")!.evidenceRef = "";
  assert.equal(validateFinanceSnapshot(snapshot, context(), "close").valid, false);
  assert.ok(calculateReport(snapshot, context()).issues.some(issue => issue.code === "MISSING_EVIDENCE" && issue.lineCode === "equity.noncash_contributions"));
});

test("closed source chain pins previous cash roster and equity; stale revisions cannot close", () => {
  const january = fixture(); set(january, { "cash.owner_contributions": 10, "position.share_capital": 10 }); january.cashObservations[1].amount = 10;
  const prior = closed(january);
  const ctx = context("actual", { previous: prior, previousCashAccounts: [{ code: "bank", label: "Retired bank", activeFrom: "2026-01", activeTo: "2026-01" }], cashAccounts: [{ code: "newbank", label: "New bank", activeFrom: "2026-02" }] });
  const february = fixture("2026-02", ctx); february.openingSourceRevisionId = prior.revisionId;
  february.cashObservations[0].accountCode = "newbank"; february.cashObservations[0].amount = 10; set(february, { "position.share_capital": 10 });
  const report = assertCloses(february, ctx); assert.equal(report.metrics.cash_opening, 10); assert.equal(report.metrics.equity_opening, 10);
  february.openingSourceRevisionId = "old-revision"; assert.ok(calculateReport(february, ctx).issues.some(issue => issue.code === "OPENING_SOURCE_MISMATCH"));
  february.openingSourceRevisionId = prior.revisionId; ctx.previous = { ...prior, stale: true }; assert.equal(calculateReport(february, ctx).canClose, false);
});

test("current local month can remain draft; future actuals reject and month-end close waits", () => {
  const ctx = context("actual", { now: "2026-01-31T16:59:59Z" });
  assert.equal(validateFinanceSnapshot(fixture(), ctx, "draft").valid, true);
  assert.equal(validateFinanceSnapshot(fixture(), ctx, "close").valid, false);
  assert.equal(validateFinanceSnapshot(fixture(), { ...ctx, now: "2026-01-31T17:00:00Z" }, "close").valid, true);
  assert.equal(validateFinanceSnapshot(fixture("2026-02"), ctx, "draft").valid, false);
});

test("deliberate segment splits sum once and leave shared unallocated payroll separate", () => {
  const ctx = context();
  ctx.expectedInputs = ctx.expectedInputs.flatMap(item => item.period === "2026-01" && item.lineCode === "pnl.projects" ? [{ ...item, segmentCode: "a" }, { ...item, segmentCode: "b" }] : [item]);
  const snapshot = fixture("2026-01", ctx);
  snapshot.values.find(value => value.lineCode === "pnl.projects" && value.segmentCode === "a")!.amount = 40;
  snapshot.values.find(value => value.lineCode === "pnl.projects" && value.segmentCode === "b")!.amount = 60;
  set(snapshot, { "pnl.shared_payroll": 20 });
  const total = calculateReport(snapshot, ctx); assert.equal(total.metrics.revenue, 100); assert.equal(total.metrics.operating_profit, 80);
  const segment = calculateReport(snapshot, { ...ctx, segmentCode: "a" });
  assert.equal(segment.metrics.revenue, 40); assert.equal(segment.metrics.operating_expenses, 0); assert.equal(segment.metrics.operating_profit, 40);
  assert.equal(segment.metrics.equity_reconciliation, null); assert.equal(segment.canClose, false);
  const unallocated = calculateReport(snapshot, { ...ctx, segmentCode: "unallocated" }); assert.equal(unallocated.metrics.operating_expenses, 20);
});

test("plan publishing uses direct cash anchors, not bank observations or optional actual position blocks", () => {
  const ctx = context("budget"), snapshot = fixture("2026-01", ctx);
  set(snapshot, { "cash.opening": 100, "pnl.projects": 80, "cash.customer_receipts": 100, "cash.operating_payments": 20 });
  const result = validateFinanceSnapshot(snapshot, ctx, "publish"); assert.equal(result.valid, true, JSON.stringify(result.issues));
  assert.equal(result.report.metrics.cash_closing, 180); assert.equal(result.report.metrics.assets, null);
  const february = fixture("2026-02", ctx);
  set(february, { "cash.operating_payments": 200 });
  const next = calculateReport(february, { ...ctx, openingCash: result.report.metrics.cash_closing });
  assert.equal(next.metrics.cash_closing, -20); assert.equal(next.metrics.cash_available, -20);
  assert.equal(validateFinanceSnapshot(february, { ...ctx, openingCash: 180 }, "publish").valid, true);
  assert.equal(calculateReport(february, ctx).metrics.cash_closing, null);
});

test("variance handles zero, absent, negative and margin baselines without invented percentages", () => {
  assert.deepEqual(calculateVariance(12, 0, "lower"), { difference: 12, percentage: null, percentagePoints: null, favorable: false, state: "unbudgeted" });
  assert.equal(calculateVariance(0, 0).state, "zero_baseline");
  assert.equal(calculateVariance(12, null).state, "no_comparison");
  assert.deepEqual(calculateVariance(-10, -20, "higher"), { difference: 10, percentage: .5, percentagePoints: null, favorable: true, state: "compared" });
  assert.equal(calculateVariance(110, 100, "lower").favorable, false);
  assert.ok(Math.abs(calculateVariance(.25, .2, "higher", true).percentagePoints! - 5) < 1e-10);
  assert.equal(calculateVariance(.25, .2, "higher", true).percentage, null);
  assert.throws(() => calculateVariance(Number.MAX_SAFE_INTEGER, -1));
});

test("material variance uses exact inclusive thresholds, OR policy and meaningful denominators", () => {
  assert.equal(isMaterialVariance(105, 100, null, 500), true);
  assert.equal(isMaterialVariance(104, 100, null, 500), false);
  assert.equal(isMaterialVariance(-105, -100, null, 500), true);
  assert.equal(isMaterialVariance(106, 100, 10, 500), true);
  assert.equal(isMaterialVariance(110, 100, 10, 5000), true);
  assert.equal(isMaterialVariance(5, 0, null, 500), null);
  assert.equal(isMaterialVariance(5, 0, 5, 500), true);
  assert.equal(isMaterialVariance(4, 0, 5, 500), false);
  assert.equal(isMaterialVariance(100, null, 1, 1), null);
  assert.equal(isMaterialVariance(100, 100, null, null), null);
  assert.equal(isMaterialVariance(100, 100, 0, null), true);
  assert.equal(isMaterialVariance(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1, null, 1), false);
  assert.equal(isMaterialVariance(Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, null), true);
  assert.throws(() => isMaterialVariance(1, 1, -1, null), { code: "INVALID_THRESHOLD" });
  assert.throws(() => isMaterialVariance(1, 1, null, 1.5));
});

test("aggregation sums flows, uses endpoint stocks and recomputes weighted margins", () => {
  const ctx = context("budget"), january = fixture("2026-01", ctx), february = fixture("2026-02", ctx);
  set(january, { "cash.opening": 100, "pnl.projects": 100, "pnl.shared_payroll": 50 });
  set(february, { "cash.customer_receipts": 10, "pnl.projects": 300, "pnl.shared_payroll": 50 });
  const a = calculateReport(january, ctx), b = calculateReport(february, { ...ctx, openingCash: 100 });
  const total = aggregateReports([b, a], ["2026-01", "2026-02"]);
  assert.equal(total.metrics.cash_closing, 110); assert.equal(total.metrics.cash_opening, 100);
  assert.equal(total.metrics.revenue, 400); assert.equal(total.metrics.net_profit, 300); assert.equal(total.metrics.net_margin, .75);
  assert.equal(total.lineValues["position.cash"], 110);
  assert.equal(aggregateReports([a], ["2026-01", "2026-02"]).metrics.cash_closing, null);
  assert.equal(aggregateReports([a], ["2026-01", "2026-02"]).metrics.revenue, null);
  const missingEndpoint = { ...b, metrics: { ...b.metrics, cash_closing: null } };
  assert.equal(aggregateReports([a, missingEndpoint]).metrics.cash_closing, null);
  const inconsistent = [{ ...a, metrics: { ...a.metrics, cash_reconciliation: 1 }, reconciled: false }, { ...b, metrics: { ...b.metrics, cash_reconciliation: -1 }, reconciled: false }];
  assert.equal(aggregateReports(inconsistent).metrics.cash_reconciliation, null);
});

test("unsafe subtotals become explicit errors rather than rounded report values", () => {
  const snapshot = fixture(); set(snapshot, { "pnl.projects": Number.MAX_SAFE_INTEGER, "pnl.maintenance": 1 });
  const report = calculateReport(snapshot, context()); assert.equal(report.metrics.revenue, null);
  assert.ok(report.issues.some(issue => issue.code === "UNSAFE_AMOUNT")); assert.equal(report.canClose, false);
});

test("cash runway uses strict threshold and a contiguous verified forecast chain", () => {
  const ctx = context("forecast"), periods = ["2026-01", "2026-02", "2026-03"], balances = [35, 20, 19];
  let opening = 40;
  const reports = periods.map((period, index) => {
    const snapshot = fixture(period, ctx); if (index === 0) set(snapshot, { "cash.opening": opening });
    set(snapshot, { "cash.operating_payments": opening - balances[index] });
    const report = calculateReport(snapshot, { ...ctx, openingCash: opening }); opening = balances[index]; return report;
  });
  assert.deepEqual(calculateRunway(reports, 20), { status: "breach", breachPeriod: "2026-03", monthsUntilBreach: 3, horizonMonths: 3, cashFloor: 20 });
  assert.equal(calculateRunway(reports.slice(0, 2), 20).status, "no_breach");
  assert.equal(calculateRunway(reports, null).status, "no_floor");
  assert.equal(calculateRunway([reports[0], reports[2]], 20, periods).status, "incomplete");
  assert.equal(calculateRunway([{ ...reports[0], stale: true }, ...reports.slice(1)], 20).status, "incomplete");
  assert.equal(calculateRunway([{ ...reports[0], metrics: { ...reports[0].metrics, cash_closing: 999 } }, ...reports.slice(1)], 20).status, "incomplete");
});

test("midyear cutover supports cash forecasts but never fabricates missing fiscal-year actuals", () => {
  const cutoverBook = { ...book, firstPeriod: "2026-06" }, ctx = context("actual", { book: cutoverBook, expectedInputs: defaultExpectedInputs(2026, 1, DEFAULT_FINANCE_LINES, { firstPeriod: "2026-06" }) });
  const june = fixture("2026-06", ctx); const juneReport = calculateReport(closed(june), ctx); assert.equal(juneReport.canClose, true);
  const forecastCtx = { ...ctx, kind: "forecast" as const, openingCash: 0 }, july = fixture("2026-07", forecastCtx);
  const julyReport = calculateReport(july, forecastCtx);
  const outlook = buildFinanceOutlook(fiscalPeriods(2026, 1), [juneReport], [julyReport], "2026-06");
  assert.equal(outlook.completeness.complete, false); assert.equal(outlook.metrics.revenue, null);
  assert.equal(aggregateReports([juneReport], ["2026-06"]).metrics.cash_closing, 0);
  assert.equal(buildFinanceOutlook(["2026-06", "2026-07"], [{ ...juneReport, sourceState: "draft" }], [julyReport], "2026-06").completeness.complete, false);
});
