import { calculateVariance, formatMoneyInput, isMaterialVariance } from "./calculations";
import { csvCell } from "./csv";
import { FINANCE_CALCULATION_VERSION, FINANCE_METRIC_LABELS, FinanceValidationError, type FinanceFact, type FinanceLine, type FinanceReport } from "./model";
import { financeReportView } from "./reports";
import type { FinanceActualRevision, FinanceFrozenContext, FinanceReceipt, FinanceSelection, FinanceState } from "./store-types";

/** A downloaded report is built only from the immutable export receipt, including its clock. */
interface ExportManifest {
  state: FinanceState;
  selection: FinanceSelection;
  report: string;
  segmentCode: string;
  generatedAt: string;
  calculationVersion: string;
}
const COLUMNS = ["record_type", "dataset", "period", "version_id", "code", "label", "segment", "value_state", "value", "unit", "currency", "evidence_ref", "note", "source_as_of", "source_scope"];
const ratioKeys = new Set(["gross_margin", "operating_margin", "net_margin"]);
const pnlKeys = new Set(["revenue", "direct_costs", "gross_profit", "operating_expenses", "other_operating_income", "operating_profit", "finance_income", "finance_costs", "income_tax", "profit_before_tax", "net_profit", ...ratioKeys]);
const allowedReports = new Set(["overview", "plans", "actuals", "pnl", "cash-flow", "revenue", "costs", "working-capital", "position", "settings", "audit"]);
const lowerIsBetter = new Set(["direct_costs", "operating_expenses", "finance_costs", "income_tax"]);
const higherIsBetter = new Set(["revenue", "gross_profit", "operating_profit", "profit_before_tax", "net_profit", "other_operating_income", "finance_income", ...ratioKeys]);
function acceptsMetric(report: string, metric: string): boolean {
  if (["pnl", "revenue", "costs"].includes(report)) return pnlKeys.has(metric);
  if (report === "cash-flow") return metric.startsWith("cash_");
  if (report === "working-capital") return metric.startsWith("ar_") || metric.startsWith("ap_") || metric === "ap";
  if (report === "position") return ["assets", "liabilities", "equity", "ar_gross", "ar_allowance", "ar_net", "ap", "cash_closing", "position_reconciliation", "equity_opening", "equity_expected_closing", "equity_reconciliation"].includes(metric);
  return true;
}
function acceptsLine(report: string, line: FinanceLine): boolean {
  if (["pnl", "revenue", "costs"].includes(report)) return line.basis === "pnl";
  if (report === "cash-flow") return line.basis === "cash" || ["cash.opening", "forecast.restricted_cash"].includes(line.code);
  if (report === "working-capital") return line.code.startsWith("aging.") || ["position.ar_gross", "position.ar_allowance", "position.ap"].includes(line.code);
  if (report === "position") return ["position", "control"].includes(line.basis);
  return true;
}
function plainRatio(value: number): string {
  if (!Number.isFinite(value)) throw new FinanceValidationError("invalid_export_number", "A ratio in the saved export is not finite.", 503);
  // Ratio precision is explicit and separate from integer monetary precision.
  return value.toFixed(12).replace(/\.?0+$/, "") || "0";
}

/** Only registered ratios may be fractional. Unknown metrics must still obey exact-money rules. */
export function financeMetricCsvValue(code: string, value: number | null, precision: number): { text: string; unit: "fraction" | "major_currency" } {
  const ratio = ratioKeys.has(code);
  return { text: value === null ? "" : ratio ? plainRatio(value) : formatMoneyInput(value, precision), unit: ratio ? "fraction" : "major_currency" };
}

export function financeReportCsv(receipt: FinanceReceipt): { csv: string; filename: string } {
  const manifest = receipt.manifest as unknown as ExportManifest | undefined;
  if (!manifest?.state?.book || !manifest.selection || !manifest.generatedAt) throw new FinanceValidationError("invalid_export_snapshot", "The saved export snapshot is unavailable.", 503);
  if (manifest.calculationVersion !== FINANCE_CALCULATION_VERSION) throw new FinanceValidationError("unsupported_calculation_version", "This export requires an unavailable calculation version.", 503);
  if (!allowedReports.has(manifest.report)) throw new FinanceValidationError("invalid_export_report", "The saved report scope is invalid.", 503);
  const { state, selection, report: reportName, segmentCode, generatedAt } = manifest;
  const book = state.book!;
  const view = financeReportView(state, selection, { range: selection.range ?? "month", segmentCode, now: generatedAt, editor: reportName === "actuals" });
  const lines: string[] = [COLUMNS.map(value => csvCell(value)).join(",")];
  const append = (row: string[], numericValue = false) => {
    while (row.length < COLUMNS.length) row.push("");
    lines.push(row.map((value, index) => csvCell(value, index === 8 && numericValue)).join(","));
  };
  const meta = (code: string, value: string, dataset = "book", versionId = "") => append(["metadata", dataset, "", versionId, code, "", "", "", value]);
  meta("entity", book.entityName); meta("currency", book.currency); meta("precision", String(book.precision));
  meta("timezone", book.timezone); meta("fiscal_start_month", String(book.fiscalStartMonth)); meta("reporting_cutover", book.firstPeriod);
  meta("book_version", String(book.version)); meta("policy_note", book.policyNote);
  meta("variance_amount_threshold", book.varianceAmountThreshold == null ? "" : formatMoneyInput(book.varianceAmountThreshold, book.precision));
  meta("variance_percent_threshold_bps", book.variancePercentThresholdBps == null ? "" : String(book.variancePercentThresholdBps));
  meta("report", reportName); meta("range", view.range); meta("periods", view.comparisonPeriods.join(","));
  meta("comparison_scope", view.comparisonLabel); meta("segment", segmentCode);
  meta("generated_at", generatedAt); meta("calculation_version", manifest.calculationVersion); meta("operation_id", receipt.operationId);
  meta("monetary_unit", "Major currency units, exact to book precision. Ratios are fractions to 12 decimal places.");
  meta("missing_values", "Blank values are missing or not applicable; explicitly entered zero is 0.");
  const writeFrozen = (context: FinanceFrozenContext | null, dataset: string, versionId: string) => {
    if (!context) return;
    if (context.calculationVersion !== FINANCE_CALCULATION_VERSION) throw new FinanceValidationError("unsupported_calculation_version", "A pinned source requires an unavailable calculation version.", 503);
    meta("pinned_book_version", String(context.book.version), dataset, versionId);
    meta("pinned_entity", context.book.entityName, dataset, versionId);
    meta("pinned_currency", context.book.currency, dataset, versionId);
    meta("pinned_precision", String(context.book.precision), dataset, versionId);
    meta("pinned_timezone", context.book.timezone, dataset, versionId);
    meta("pinned_cash_floor", context.book.cashFloor === null ? "" : formatMoneyInput(context.book.cashFloor, context.book.precision), dataset, versionId);
    meta("pinned_variance_amount_threshold", context.book.varianceAmountThreshold == null ? "" : formatMoneyInput(context.book.varianceAmountThreshold, context.book.precision), dataset, versionId);
    meta("pinned_variance_percent_threshold_bps", context.book.variancePercentThresholdBps == null ? "" : String(context.book.variancePercentThresholdBps), dataset, versionId);
    meta("pinned_policy", context.book.policyNote, dataset, versionId);
    meta("pinned_calculation_version", context.calculationVersion, dataset, versionId);
    meta("context_captured_at", context.capturedAt, dataset, versionId);
  };
  const plan = state.plans.find(item => item.id === view.selectedPlanId);
  if (plan) {
    meta("label", plan.label, "plan", plan.id); meta("state", plan.state, "plan", plan.id); meta("kind", plan.kind, "plan", plan.id);
    meta("version", String(plan.version), "plan", plan.id); meta("definition_set", plan.definitionSetId, "plan", plan.id);
    meta("baseline", String(plan.baseline), "plan", plan.id); meta("stale", String(plan.stale), "plan", plan.id);
    meta("actual_cutoff", plan.actualCutoff ?? "", "plan", plan.id); meta("source_actuals", JSON.stringify(plan.sourceActuals), "plan", plan.id);
    meta("assumptions", plan.assumptions, "plan", plan.id);
    writeFrozen(plan.reportingSnapshot, "plan", plan.id);
  }
  const writeMetrics = (item: FinanceReport | undefined, dataset: string, versionId: string) => {
    if (!item) return;
    const period = item.periods?.join(",") ?? item.period;
    meta("complete", String(item.completeness.complete), `${dataset}:${period}`, versionId);
    meta("reconciled", String(item.reconciled), `${dataset}:${period}`, versionId);
    meta("stale", String(item.stale), `${dataset}:${period}`, versionId);
    for (const [code, value] of Object.entries(item.metrics)) {
      if (!acceptsMetric(reportName, code)) continue;
      const formatted = financeMetricCsvValue(code, value, book.precision);
      append(["metric", dataset, period, versionId, code, FINANCE_METRIC_LABELS[code]?.[0] ?? code.replaceAll("_", " "), item.segmentCode ?? "all", value === null ? "missing" : "calculated", formatted.text, formatted.unit, formatted.unit === "fraction" ? "" : book.currency], true);
    }
    for (const issue of item.issues) append(["validation", dataset, period, versionId, issue.code, issue.lineCode ?? issue.accountCode ?? "", issue.segmentCode ?? "", "", "", "", "", "", issue.message]);
  };
  writeMetrics(view.aggregateReport, "actual_summary", view.range === "month" ? view.selectedActualRevisionId ?? "" : "authoritative_by_month");
  writeMetrics(view.aggregatePlanReport, "plan_summary", plan?.id ?? "");
  const writeComparison = (actual: FinanceReport | undefined, planned: FinanceReport | undefined, dataset: string) => {
    if (!actual || !planned || !plan) return;
    const period = actual.periods?.join(",") ?? actual.period;
    const endingPeriod = actual.periods?.at(-1) ?? actual.period;
    const revisionId = dataset === "comparison_summary" && view.range === "month" ? view.selectedActualRevisionId : state.periods.find(item => item.period === endingPeriod)?.authoritativeClosedRevisionId;
    const policy = state.actualRevisions.find(item => item.id === revisionId)?.reportingSnapshot?.book ?? plan.reportingSnapshot?.book ?? book;
    meta("materiality_policy_book_version", String(policy.version), `${dataset}:${period}`, plan.id);
    meta("materiality_amount_threshold", policy.varianceAmountThreshold == null ? "" : formatMoneyInput(policy.varianceAmountThreshold, policy.precision), `${dataset}:${period}`, plan.id);
    meta("materiality_percent_threshold_bps", policy.variancePercentThresholdBps == null ? "" : String(policy.variancePercentThresholdBps), `${dataset}:${period}`, plan.id);
    for (const code of new Set([...Object.keys(actual.metrics), ...Object.keys(planned.metrics)])) {
      if (!acceptsMetric(reportName, code) || code.endsWith("_reconciliation")) continue;
      const ratio = ratioKeys.has(code), direction = lowerIsBetter.has(code) ? "lower" : higherIsBetter.has(code) ? "higher" : "neutral";
      const variance = calculateVariance(actual.metrics[code] ?? null, planned.metrics[code] ?? null, direction, ratio);
      const row = (type: string, value: number | null, unit: string) => append([type, dataset, period, plan.id, code, FINANCE_METRIC_LABELS[code]?.[0] ?? code, segmentCode, variance.state, value === null ? "" : unit === "major_currency" ? formatMoneyInput(value, book.precision) : plainRatio(value), unit, unit === "major_currency" ? book.currency : ""], true);
      if (ratio) row("variance_pp", variance.percentagePoints, "percentage_points");
      else { row("variance", variance.difference, "major_currency"); row("variance_fraction", variance.percentage, "fraction"); }
      append(["favorability", dataset, period, plan.id, code, "", segmentCode, variance.favorable === null ? "neutral_or_unavailable" : variance.favorable ? "favorable" : "adverse"]);
      if (!ratio) {
        const material = isMaterialVariance(actual.metrics[code] ?? null, planned.metrics[code] ?? null, policy.varianceAmountThreshold ?? null, policy.variancePercentThresholdBps ?? null);
        append(["materiality", dataset, period, plan.id, code, "", segmentCode, material === null ? "unavailable" : material ? "material" : "below_threshold"]);
      }
    }
  };
  writeComparison(view.aggregateReport, view.aggregatePlanReport, "comparison_summary");
  const writeFacts = (facts: FinanceFact[], dataset: string, period: string, versionId: string, definitions: readonly FinanceLine[]) => {
    for (const fact of facts) {
      const line = definitions.find(item => item.code === fact.lineCode);
      if (!line || !acceptsLine(reportName, line)) continue;
      if (line.basis === "pnl" && segmentCode !== "all" && fact.segmentCode !== segmentCode) continue;
      append(["input", dataset, period, versionId, fact.lineCode, line.labelEn, fact.segmentCode, fact.state,
        fact.amount === null ? "" : formatMoneyInput(fact.amount, book.precision), "major_currency", book.currency, fact.evidenceRef, fact.note], true);
    }
  };
  const writeRevision = (revision: FinanceActualRevision, dataset: string) => {
    meta("definition_set", revision.definitionSetId, `${dataset}:${revision.period}`, revision.id);
    meta("revision_version", String(revision.version), `${dataset}:${revision.period}`, revision.id);
    meta("revision_state", revision.state, `${dataset}:${revision.period}`, revision.id);
    meta("opening_source_revision", revision.openingSourceRevisionId ?? "", `${dataset}:${revision.period}`, revision.id);
    meta("supersedes_revision", revision.supersedesRevisionId ?? "", `${dataset}:${revision.period}`, revision.id);
    writeFrozen(revision.reportingSnapshot, `${dataset}:${revision.period}`, revision.id);
    const sources = revision.reportingSnapshot?.sources ?? revision.sources;
    for (const [basis, source] of Object.entries(sources.blocks)) append(["source", dataset, revision.period, revision.id, basis, "", "", "", "", "", "", source?.evidenceRef ?? "", source?.note ?? "", sources.sourceAsOf, sources.scope]);
    writeFacts(state.actualValues.filter(item => item.actualRevisionId === revision.id), dataset, revision.period, revision.id,
      revision.reportingSnapshot?.lines ?? state.definitions.find(item => item.id === revision.definitionSetId)?.lines ?? state.lines);
    if (["overview", "actuals", "plans", "cash-flow", "position"].includes(reportName)) for (const observation of state.observations.filter(item => item.actualRevisionId === revision.id)) {
      const account = (revision.reportingSnapshot?.cashAccounts ?? state.accounts).find(item => item.code === observation.accountCode);
      const label = `${account?.label ?? observation.accountCode} (${observation.kind})`;
      append(["bank_observation", dataset, revision.period, revision.id, observation.accountCode, label, "all", observation.amount === null ? "missing" : "entered", observation.amount === null ? "" : formatMoneyInput(observation.amount, book.precision), "major_currency", book.currency, observation.evidenceRef, observation.classification, observation.asOfDate], true);
      append(["restricted_balance", dataset, revision.period, revision.id, observation.accountCode, label, "all", observation.restrictedAmount === null ? "missing" : "entered", observation.restrictedAmount === null ? "" : formatMoneyInput(observation.restrictedAmount, book.precision), "major_currency", book.currency, observation.evidenceRef, "", observation.asOfDate], true);
    }
  };
  for (const period of view.comparisonPeriods) {
    const actualId = view.range === "month" ? view.selectedActualRevisionId : state.periods.find(item => item.period === period)?.authoritativeClosedRevisionId;
    const revision = state.actualRevisions.find(item => item.id === actualId);
    if (view.range !== "month") writeMetrics(view.reports.find(item => item.period === period), "actual_month", revision?.id ?? "");
    if (revision) writeRevision(revision, "actual");
    if (plan) {
      if (view.range !== "month") writeMetrics(view.planReports.find(item => item.period === period), "plan_month", plan.id);
      if (view.range !== "month") writeComparison(view.reports.find(item => item.period === period), view.planReports.find(item => item.period === period), "comparison_month");
      const isActualPrefix = !!plan.actualCutoff && period <= plan.actualCutoff;
      const pinned = isActualPrefix ? state.actualRevisions.find(item => item.id === plan.sourceActuals[period] && item.period === period && item.state === "closed") : undefined;
      if (pinned) writeRevision(pinned, "forecast_actual_source");
      else if (!isActualPrefix) writeFacts(state.planValues.filter(item => item.planId === plan.id && item.period === period), "plan", period, plan.id,
        plan.reportingSnapshot?.lines ?? state.definitions.find(item => item.id === plan.definitionSetId)?.lines ?? state.lines);
    }
  }
  return { csv: `${lines.join("\r\n")}\r\n`, filename: `lumi-finance-${reportName}-${view.fiscalYear}-${view.range}-${receipt.targetId}.csv` };
}
