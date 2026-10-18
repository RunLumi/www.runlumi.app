import { aggregateReports, calculateReport, currentPeriod, fiscalPeriods, fiscalYearForPeriod } from "./calculations";
import type { FinanceCalculationContext, FinanceReport, FinanceSnapshot } from "./model";
import { FinanceValidationError } from "./model";
import { revisionSnapshot, type FinanceActualRevision, type FinancePlan, type FinanceSelection, type FinanceState } from "./store-types";

export type FinanceRange = "month" | "quarter" | "ytd" | "year";
export function financeFiscalYear(period: string, fiscalStart: number): number {
  return fiscalYearForPeriod(period, fiscalStart);
}

export function financeRevisionContext(state: FinanceState, revision: FinanceActualRevision, segmentCode = "all", now?: string | Date): FinanceCalculationContext {
  const definition = state.definitions.find(item => item.id === revision.definitionSetId), frozen = revision.reportingSnapshot;
  const previous = state.actualRevisions.find(item => item.id === revision.openingSourceRevisionId);
  return { book: frozen?.book ?? state.book!, lines: frozen?.lines ?? definition?.lines ?? state.lines,
    expectedInputs: frozen?.expectedInputs ?? definition?.expectedInputs ?? [], cashAccounts: frozen?.cashAccounts ?? state.accounts,
    kind: "actual", previous: previous ? revisionSnapshot(state, previous) : null,
    previousLines: previous?.reportingSnapshot?.lines ?? state.definitions.find(item => item.id === previous?.definitionSetId)?.lines,
    previousCashAccounts: previous?.reportingSnapshot?.cashAccounts ?? state.accounts,
    stale: revision.stale, segmentCode, now };
}

function actualReport(state: FinanceState, revision: FinanceActualRevision, segmentCode: string, now?: string | Date): FinanceReport {
  return calculateReport(revisionSnapshot(state, revision), financeRevisionContext(state, revision, segmentCode, now));
}

function staleReport(report: FinanceReport): FinanceReport {
  return { ...report, stale: true, reconciled: false, canClose: false,
    issues: report.issues.some(issue => issue.code === "STALE_SOURCE") ? report.issues : [...report.issues, { code: "STALE_SOURCE", message: "The report depends on a superseded source revision." }] };
}

export function financePlanReports(state: FinanceState, plan: FinancePlan, months: string[], segmentCode = "all", now?: string | Date): FinanceReport[] {
  const definition = state.definitions.find(item => item.id === plan.definitionSetId), frozen = plan.reportingSnapshot;
  const book = frozen?.book ?? state.book!;
  const canonicalMonths = fiscalPeriods(plan.fiscalYear, book.fiscalStartMonth);
  if (new Set(months).size !== months.length || months.some(month => !canonicalMonths.includes(month))) throw new FinanceValidationError("period_outside_year", "Plan report months must be unique months in its fiscal year.", 422);
  const reports: FinanceReport[] = [];
  let previous: FinanceSnapshot | null = null, openingCash: number | null | undefined, openingEquity: number | null | undefined;
  let previousLines: FinanceCalculationContext["previousLines"], previousCashAccounts: FinanceCalculationContext["previousCashAccounts"];
  for (const period of canonicalMonths.filter(month => months.includes(month))) {
    const pinnedId = plan.sourceActuals[period];
    const pinned = state.actualRevisions.find(item => item.id === pinnedId && item.period === period && item.state === "closed");
    if (plan.actualCutoff && period <= plan.actualCutoff) {
      if (!pinned) {
        // Never substitute copied plan values for an absent past actual revision.
        const missing = calculateReport({ period, state: "draft", values: [], cashObservations: [] }, {
          book, lines: frozen?.lines ?? definition?.lines ?? state.lines, expectedInputs: frozen?.expectedInputs ?? definition?.expectedInputs ?? [],
          cashAccounts: frozen?.cashAccounts ?? state.accounts, kind: "actual", segmentCode, now,
        });
        reports.push(plan.stale ? staleReport(missing) : missing);
        previous = null; openingCash = null; openingEquity = null;
        continue;
      }
      const report = actualReport(state, pinned, segmentCode, now);
      const bookReport = segmentCode === "all" ? report : actualReport(state, pinned, "all", now);
      reports.push(plan.stale ? staleReport(report) : report);
      previous = revisionSnapshot(state, pinned);
      openingCash = bookReport.reconciled && !plan.stale ? bookReport.metrics.cash_closing : null;
      openingEquity = bookReport.reconciled && !plan.stale ? bookReport.metrics.equity : null;
      previousLines = pinned.reportingSnapshot?.lines ?? state.definitions.find(item => item.id === pinned.definitionSetId)?.lines;
      previousCashAccounts = pinned.reportingSnapshot?.cashAccounts ?? state.accounts;
      continue;
    }
    const snapshot: FinanceSnapshot = { period, state: plan.state, values: state.planValues.filter(value => value.planId === plan.id && value.period === period), cashObservations: [], stale: plan.stale };
    const context: FinanceCalculationContext = { book, lines: frozen?.lines ?? definition?.lines ?? state.lines,
      expectedInputs: frozen?.expectedInputs ?? definition?.expectedInputs ?? [], cashAccounts: frozen?.cashAccounts ?? state.accounts,
      kind: plan.kind, previous, previousLines, previousCashAccounts, openingCash, openingEquity, segmentCode, stale: plan.stale, now };
    const report = calculateReport(snapshot, context);
    reports.push(report); previous = snapshot; openingCash = report.metrics.cash_closing; openingEquity = report.metrics.equity;
    previousLines = context.lines; previousCashAccounts = context.cashAccounts;
  }
  return reports;
}

/** Closed eligibility is book-wide even when the rendered P&L is scoped to a segment. */
export function financeClosedPrefix(state: FinanceState, months: readonly string[], through: string, now?: string | Date): string[] {
  if (!state.book || !months.length) return [];
  const beginning = state.book.firstPeriod > months[0] ? months.indexOf(state.book.firstPeriod) : 0;
  if (beginning < 0) return [];
  const prefix: string[] = [];
  for (const month of months.slice(beginning)) {
    if (month > through) break;
    const owner = state.periods.find(item => item.period === month);
    const revision = state.actualRevisions.find(item => item.id === owner?.authoritativeClosedRevisionId && item.period === month && item.state === "closed");
    if (!revision || owner?.workingRevisionId || revision.stale || !actualReport(state, revision, "all", now).reconciled) break;
    prefix.push(month);
  }
  return prefix;
}

export interface FinanceReportView {
  period: string; currentPeriod: string; fiscalYear: number; months: string[];
  selectedPlanId?: string; selectedActualRevisionId?: string;
  report?: FinanceReport; planReport?: FinanceReport; reports: FinanceReport[]; planReports: FinanceReport[];
  aggregateReport?: FinanceReport; aggregatePlanReport?: FinanceReport;
  range: FinanceRange; segmentCode: string; comparisonPeriods: string[]; comparisonLabel: string;
}

export function financeReportView(state: FinanceState, selection: FinanceSelection, options: { lang?: "en" | "vi"; editor?: boolean; range?: FinanceRange; segmentCode?: string; now?: string | Date } = {}): FinanceReportView {
  const book = state.book, vi = options.lang === "vi", current = currentPeriod(book?.timezone ?? "Asia/Ho_Chi_Minh", options.now);
  const year = selection.fiscalYear ?? state.selectedFiscalYear ?? financeFiscalYear(current, book?.fiscalStartMonth ?? 1);
  const months = fiscalPeriods(year, book?.fiscalStartMonth ?? 1);
  const period = selection.period ?? (months.includes(current) ? current : months[0]);
  if (!months.includes(period)) throw new FinanceValidationError("period_outside_year", "Choose a month within the selected fiscal year.", 422);
  const range = options.range ?? selection.range ?? "month", segmentCode = options.segmentCode ?? "all";
  if (!["month", "quarter", "ytd", "year"].includes(range)) throw new FinanceValidationError("invalid_range", "Choose month, quarter, YTD or year.", 422);
  if (segmentCode !== "all" && !state.segments.some(segment => segment.code === segmentCode)) throw new FinanceValidationError("invalid_segment", "Unknown reporting segment.", 422);
  const view: FinanceReportView = { period, currentPeriod: current, fiscalYear: year, months, reports: [], planReports: [], range, segmentCode, comparisonPeriods: [], comparisonLabel: "" };
  if (!book) return view;
  const definition = state.definitions.find(item => item.fiscalYear === year);
  const byMonth = new Map(state.periods.map(item => [item.period, item]));
  for (const month of months) {
    const id = byMonth.get(month)?.authoritativeClosedRevisionId;
    const revision = state.actualRevisions.find(item => item.id === id && item.period === month && item.state === "closed");
    if (revision) view.reports.push(actualReport(state, revision, segmentCode, options.now));
    else view.reports.push(calculateReport({ period: month, values: [], cashObservations: [], state: "draft" }, {
      book, lines: definition?.lines ?? state.lines, expectedInputs: definition?.expectedInputs ?? [], cashAccounts: state.accounts, kind: "actual", segmentCode, now: options.now,
    }));
  }
  const selectedPeriod = byMonth.get(period);
  const selectedId = selection.actualRevisionId ?? (options.editor ? selectedPeriod?.workingRevisionId ?? selectedPeriod?.authoritativeClosedRevisionId : selectedPeriod?.authoritativeClosedRevisionId);
  const selected = state.actualRevisions.find(revision => revision.id === selectedId);
  if (selection.actualRevisionId && (!selected || selected.period !== period)) throw new FinanceValidationError("actual_revision_not_found", "This revision does not belong to the selected month.", 404);
  if (range !== "month" && selection.actualRevisionId && selected?.id !== selectedPeriod?.authoritativeClosedRevisionId) throw new FinanceValidationError("historical_revision_requires_month", "Choose a monthly range to view a draft or superseded actual revision.", 422);
  view.selectedActualRevisionId = selected?.id;
  view.report = selected ? actualReport(state, selected, segmentCode, options.now) : view.reports.find(report => report.period === period);
  const plan = state.plans.find(item => item.id === selection.planId)
    ?? (!selection.planId ? state.plans.find(item => item.baseline && item.fiscalYear === year) : undefined);
  if (selection.planId && (!plan || plan.fiscalYear !== year)) throw new FinanceValidationError("plan_not_found", "This plan does not belong to the selected fiscal year.", 404);
  view.selectedPlanId = plan?.id;
  if (plan) {
    view.planReports = financePlanReports(state, plan, months, segmentCode, options.now);
    view.planReport = view.planReports.find(report => report.period === period);
  }
  const position = months.indexOf(period);
  let comparison = range === "month" ? [period] : range === "quarter" ? months.slice(Math.floor(position / 3) * 3, Math.floor(position / 3) * 3 + 3) : range === "year" ? [...months] : [];
  if (range === "ytd") {
    // A declared midyear cutover may show a named partial range. A missing/open
    // month never starts a second YTD prefix later in the same fiscal year.
    comparison = financeClosedPrefix(state, months, period, options.now);
  }
  view.comparisonPeriods = comparison;
  const partial = range === "ytd" && book.firstPeriod > months[0];
  view.comparisonLabel = comparison.length
    ? `${partial ? (vi ? "Từ kỳ bắt đầu báo cáo — một phần năm: " : "Since reporting start — partial year: ") : ""}${comparison[0]}${comparison.length > 1 ? ` — ${comparison.at(-1)}` : ""}`
    : vi ? "Chưa có chuỗi tháng đã chốt đủ điều kiện để đối chiếu" : "No contiguous closed period is available for comparison";
  if (range === "month") {
    view.aggregateReport = view.report; view.aggregatePlanReport = view.planReport;
  } else if (comparison.length) {
    view.aggregateReport = aggregateReports(view.reports.filter(report => comparison.includes(report.period)), comparison);
    view.aggregatePlanReport = view.planReports.length ? aggregateReports(view.planReports.filter(report => comparison.includes(report.period)), comparison) : undefined;
  }
  return view;
}
