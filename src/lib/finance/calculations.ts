import {
  DEFAULT_FINANCE_LINES, FINANCE_ALL, FINANCE_UNALLOCATED, FinanceValidationError,
  type FinanceCalculationContext, type FinanceCashAccount, type FinanceCashObservation,
  type FinanceExpectedInput, type FinanceFact, type FinanceIssue, type FinanceLine,
  type FinanceReport, type FinanceSnapshot, type FinanceValidationResult, type FinanceVersionKind,
} from "./model";

export const FINANCE_ERROR_CODES = {
  INVALID_MONEY: "INVALID_MONEY", UNSAFE_AMOUNT: "UNSAFE_AMOUNT", INVALID_PERIOD: "INVALID_PERIOD",
  INVALID_WEIGHT: "INVALID_WEIGHT", INVALID_DEFINITION: "INVALID_DEFINITION", INVALID_MANIFEST: "INVALID_MANIFEST",
  UNKNOWN_LINE: "UNKNOWN_LINE", UNEXPECTED_COORDINATE: "UNEXPECTED_COORDINATE", DUPLICATE_COORDINATE: "DUPLICATE_COORDINATE",
  DERIVED_INPUT: "DERIVED_INPUT", INVALID_VALUE: "INVALID_VALUE", NEGATIVE_AMOUNT: "NEGATIVE_AMOUNT", NOTE_REQUIRED: "NOTE_REQUIRED",
  NA_NOT_ALLOWED: "NA_NOT_ALLOWED", MISSING_INPUT: "MISSING_INPUT", MISSING_BLOCK: "MISSING_BLOCK",
  FUTURE_ACTUAL: "FUTURE_ACTUAL", PERIOD_NOT_ENDED: "PERIOD_NOT_ENDED", STALE_SOURCE: "STALE_SOURCE",
  MISSING_OPENING: "MISSING_OPENING", OPENING_SOURCE_MISMATCH: "OPENING_SOURCE_MISMATCH",
  MISSING_OBSERVATION: "MISSING_OBSERVATION", INVALID_OBSERVATION: "INVALID_OBSERVATION",
  CASH_RECONCILIATION: "CASH_RECONCILIATION", POSITION_RECONCILIATION: "POSITION_RECONCILIATION",
  EQUITY_RECONCILIATION: "EQUITY_RECONCILIATION", AR_RECONCILIATION: "AR_RECONCILIATION", AP_RECONCILIATION: "AP_RECONCILIATION",
  INVALID_ALLOWANCE: "INVALID_ALLOWANCE", BORROWING_RECONCILIATION: "BORROWING_RECONCILIATION",
  REPORT_GAP: "REPORT_GAP", INVALID_CLOCK: "INVALID_CLOCK",
  MISSING_EVIDENCE: "MISSING_EVIDENCE",
} as const;

const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const PLAN_KINDS: readonly FinanceVersionKind[] = ["budget", "forecast", "scenario"];
const ACTUAL_KIND: readonly FinanceVersionKind[] = ["actual"];
const CODE = /^[a-z][a-z0-9_.-]{0,79}$/;
const GROUPS: Readonly<Record<string, readonly string[]>> = {
  pnl: ["revenue", "direct_cost", "operating_expense", "other_operating_income", "finance_income", "finance_cost", "income_tax"],
  cash: ["operating", "investing", "financing"], position: ["asset", "liability", "equity"],
  aging: ["ar", "ap"], control: ["ar_control", "ap_control", "opening_cash", "opening_equity", "noncash_contribution", "noncash_distribution", "other_equity_movement", "restricted_cash"],
};

export function assertMinorAmount(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new FinanceValidationError("UNSAFE_AMOUNT", "Amount must be a safe integer in minor units.");
}
function integer(value: bigint): number {
  if (value > SAFE || value < -SAFE) throw new FinanceValidationError("UNSAFE_AMOUNT", "The calculation exceeds the exact amount range.");
  return Number(value);
}
function precisionValue(precision: number): void {
  if (!Number.isInteger(precision) || precision < 0 || precision > 6) throw new FinanceValidationError("INVALID_MONEY", "Currency precision must be an integer from 0 to 6.");
}
export function parseMinorUnits(input: string): number {
  if (typeof input !== "string" || input.length > 32 || !/^-?(0|[1-9]\d*)$/.test(input)) throw new FinanceValidationError("INVALID_MONEY", "Use a canonical integer string in minor units.");
  return integer(BigInt(input));
}
/** Accept canonical major-unit decimal input; never parse through floating-point arithmetic. */
export function parseMoney(input: string, precision: number): number {
  precisionValue(precision);
  if (typeof input !== "string" || input.length > 64 || !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(input)) throw new FinanceValidationError("INVALID_MONEY", "Use a decimal amount without grouping, signs other than minus, or exponent notation.");
  const negative = input.startsWith("-");
  const [whole, fraction = ""] = (negative ? input.slice(1) : input).split(".");
  if (fraction.length > precision) throw new FinanceValidationError("INVALID_MONEY", "The amount has too many decimal places for this currency.");
  const magnitude = BigInt(whole) * (10n ** BigInt(precision)) + BigInt(fraction.padEnd(precision, "0") || "0");
  return integer(negative ? -magnitude : magnitude);
}
export function formatMoneyInput(amount: number, precision: number): string {
  assertMinorAmount(amount); precisionValue(precision);
  const magnitude = BigInt(amount < 0 ? -amount : amount).toString().padStart(precision + 1, "0");
  return `${amount < 0 ? "-" : ""}${precision ? `${magnitude.slice(0, -precision)}.${magnitude.slice(-precision)}` : magnitude}`;
}
export function sumMoney(values: readonly number[]): number {
  return integer(values.reduce((sum, value) => { assertMinorAmount(value); return sum + BigInt(value); }, 0n));
}

export function periodIndex(period: string): number {
  if (typeof period !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || Number(period.slice(0, 4)) < 1) throw new FinanceValidationError("INVALID_PERIOD", "Use a real calendar month in YYYY-MM format.");
  return Number(period.slice(0, 4)) * 12 + Number(period.slice(5)) - 1;
}
function fromIndex(index: number): string {
  const year = Math.floor(index / 12), month = index % 12 + 1;
  if (year < 1 || year > 9999) throw new FinanceValidationError("INVALID_PERIOD", "The fiscal year is outside the supported calendar.");
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}
export function nextPeriod(period: string): string { return fromIndex(periodIndex(period) + 1); }
export function fiscalPeriods(fiscalYear: number, fiscalStartMonth: number): string[] {
  if (!Number.isInteger(fiscalYear) || fiscalYear < 1 || fiscalYear > 9999 || !Number.isInteger(fiscalStartMonth) || fiscalStartMonth < 1 || fiscalStartMonth > 12) throw new FinanceValidationError("INVALID_PERIOD", "Fiscal year and start month are invalid.");
  return Array.from({ length: 12 }, (_, index) => fromIndex(fiscalYear * 12 + fiscalStartMonth - 1 + index));
}
export const fiscalMonths = fiscalPeriods;
export function fiscalYearForPeriod(period: string, fiscalStartMonth: number): number {
  periodIndex(period);
  if (!Number.isInteger(fiscalStartMonth) || fiscalStartMonth < 1 || fiscalStartMonth > 12) throw new FinanceValidationError("INVALID_PERIOD", "Invalid fiscal start month.");
  return Number(period.slice(0, 4)) - (Number(period.slice(5)) < fiscalStartMonth ? 1 : 0);
}
export function currentPeriod(timezone: string, now: Date | string = new Date()): string {
  try {
    const date = now instanceof Date ? now : new Date(now);
    if (!Number.isFinite(date.getTime())) throw new Error("clock");
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", calendar: "gregory", numberingSystem: "latn" }).formatToParts(date);
    const period = `${parts.find(part => part.type === "year")!.value.padStart(4, "0")}-${parts.find(part => part.type === "month")!.value}`;
    periodIndex(period); return period;
  } catch { throw new FinanceValidationError("INVALID_CLOCK", "The reporting clock or book timezone is invalid."); }
}
export function periodBounds(period: string): { start: string; end: string } {
  periodIndex(period);
  const year = Number(period.slice(0, 4)), month = Number(period.slice(5));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return { start: `${period}-01`, end: `${period}-${days}` };
}

export interface FinanceManifestOptions { firstPeriod?: string; startPeriod?: string }
export function defaultExpectedInputs(fiscalYear: number, fiscalStartMonth: number, lines: readonly FinanceLine[] = DEFAULT_FINANCE_LINES, options: FinanceManifestOptions = {}): FinanceExpectedInput[] {
  const periods = fiscalPeriods(fiscalYear, fiscalStartMonth);
  if (options.firstPeriod) periodIndex(options.firstPeriod);
  if (options.startPeriod) periodIndex(options.startPeriod);
  return periods.flatMap(period => lines.filter(line => line.kind === "input").flatMap(line => {
    if (line.code === "cash.opening" && period !== (options.startPeriod ?? periods[0])) return [];
    if (line.code === "equity.opening" && period !== (options.firstPeriod ?? periods[0])) return [];
    const kinds = line.basis === "pnl" || line.basis === "cash" ? undefined
      : line.code === "cash.opening" || line.code === "forecast.restricted_cash" ? PLAN_KINDS : ACTUAL_KIND;
    return [{ period, lineCode: line.code, segmentCode: line.basis === "pnl" ? FINANCE_UNALLOCATED : FINANCE_ALL, required: line.required, allowNa: line.allowNa, ...(kinds ? { kinds } : {}) }];
  }));
}
export function expectedInputsFor(context: Pick<FinanceCalculationContext, "expectedInputs" | "kind" | "segmentCode" | "lines">, period: string): FinanceExpectedInput[] {
  const pnl = new Set(context.lines.filter(line => line.basis === "pnl").map(line => line.code));
  return context.expectedInputs.filter(item => item.period === period && (!item.kinds || item.kinds.includes(context.kind)) && (!context.segmentCode || context.segmentCode === FINANCE_ALL || !pnl.has(item.lineCode) || item.segmentCode === context.segmentCode));
}

/** Largest-remainder allocation uses exact decimal rational weights and stable fiscal-month ties. */
export function allocateAnnual(totalMinor: number, weights: readonly (string | number)[] = Array(12).fill("1")): number[] {
  assertMinorAmount(totalMinor);
  if (weights.length !== 12) throw new FinanceValidationError("INVALID_WEIGHT", "Annual allocation needs exactly twelve monthly weights.");
  const parsed = weights.map(weight => {
    const text = String(weight);
    if (text.length > 64 || !/^(0|[1-9]\d*)(\.\d+)?$/.test(text)) throw new FinanceValidationError("INVALID_WEIGHT", "Weights must be finite, nonnegative decimal numbers.");
    const [whole, decimal = ""] = text.split(".");
    if (decimal.length > 18) throw new FinanceValidationError("INVALID_WEIGHT", "Weights support at most eighteen decimal places.");
    return { value: BigInt(whole + decimal), scale: decimal.length };
  });
  const scale = Math.max(...parsed.map(weight => weight.scale));
  const units = parsed.map(weight => weight.value * 10n ** BigInt(scale - weight.scale));
  const denominator = units.reduce((sum, weight) => sum + weight, 0n);
  if (denominator === 0n) throw new FinanceValidationError("INVALID_WEIGHT", "At least one monthly weight must be greater than zero.");
  const magnitude = BigInt(Math.abs(totalMinor));
  const portions = units.map((weight, index) => ({ index, amount: magnitude * weight / denominator, remainder: magnitude * weight % denominator }));
  let remaining = magnitude - portions.reduce((sum, part) => sum + part.amount, 0n);
  const rank = [...portions].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const part of rank) { if (remaining === 0n) break; part.amount += 1n; remaining -= 1n; }
  return portions.map(part => integer(totalMinor < 0 ? -part.amount : part.amount));
}

const coordinate = (lineCode: string, segmentCode: string): string => `${lineCode}\u001f${segmentCode}`;
const present = (value: number | null | undefined): value is number => typeof value === "number";
const textPresent = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const requiredIssueCodes = new Set(["MISSING_INPUT", "MISSING_BLOCK", "MISSING_OPENING", "MISSING_OBSERVATION", "MISSING_EVIDENCE", "PERIOD_NOT_ENDED", "STALE_SOURCE", "CASH_RECONCILIATION", "POSITION_RECONCILIATION", "EQUITY_RECONCILIATION", "AR_RECONCILIATION", "AP_RECONCILIATION", "BORROWING_RECONCILIATION", "OPENING_SOURCE_MISMATCH"]);

export function validateFinanceFact(fact: FinanceFact, line: FinanceLine, expected: FinanceExpectedInput): FinanceIssue[] {
  const issues: FinanceIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message, lineCode: fact.lineCode, segmentCode: fact.segmentCode });
  if (line.kind !== "input") add("DERIVED_INPUT", "Derived totals cannot be entered.");
  if (!["entered", "missing", "not_applicable"].includes(fact.state)) { add("INVALID_VALUE", "The value state is invalid."); return issues; }
  if (typeof fact.note !== "string" || fact.note.length > 2000 || typeof fact.evidenceRef !== "string" || fact.evidenceRef.length > 1000) add("INVALID_VALUE", "Notes and evidence references must be bounded text.");
  if (fact.state !== "entered") {
    if (fact.amount !== null) add("INVALID_VALUE", "Missing and not-applicable inputs must have a null amount.");
    if (fact.state === "not_applicable") {
      if (!expected.allowNa || !line.allowNa || line.basis !== "pnl") add("NA_NOT_ALLOWED", "Not applicable is not permitted for this pinned input.");
      if (!textPresent(fact.note)) add("NOTE_REQUIRED", "Explain why this input is not applicable.");
    }
    return issues;
  }
  if (!Number.isSafeInteger(fact.amount)) { add("UNSAFE_AMOUNT", "Enter a safe integer number of minor units."); return issues; }
  const amount = fact.amount!;
  if (line.nonnegative && amount < 0) add("NEGATIVE_AMOUNT", "This input cannot be negative.");
  if ((amount < 0 && ["pnl", "cash"].includes(line.basis) || line.requireNote && amount !== 0) && !textPresent(fact.note)) add("NOTE_REQUIRED", "Explain the reversal or other movement.");
  return issues;
}

interface CashSummary { closing: number | null; restricted: number | null; borrowing: number | null; valid: boolean }
function cashSummary(observations: readonly FinanceCashObservation[], accounts: readonly FinanceCashAccount[], period: string, kind: "opening" | "closing", add: (issue: FinanceIssue) => void): CashSummary {
  const active = accounts.filter(account => account.activeFrom <= period && (!account.activeTo || account.activeTo >= period));
  const byAccount = new Map<string, FinanceCashObservation>();
  let valid = true;
  const fail = (code: string, message: string, accountCode?: string) => { valid = false; add({ code, message, accountCode }); };
  for (const observation of observations.filter(item => item.kind === kind)) {
    if (!active.some(account => account.code === observation.accountCode)) { fail("INVALID_OBSERVATION", "The cash account is not active in this period.", observation.accountCode); continue; }
    if (byAccount.has(observation.accountCode)) { fail("INVALID_OBSERVATION", "Cash observations cannot repeat an account and boundary.", observation.accountCode); continue; }
    byAccount.set(observation.accountCode, observation);
  }
  if (!active.length) fail("MISSING_OBSERVATION", "At least one active cash account and an explicit zero or observed balance are required.");
  const balances: number[] = [], restricted: number[] = [], borrowing: number[] = [];
  for (const account of active) {
    const value = byAccount.get(account.code);
    if (!value || value.amount === null || value.restrictedAmount === null) { fail("MISSING_OBSERVATION", `The ${kind} cash observation is missing.`, account.code); continue; }
    if (!Number.isSafeInteger(value.amount) || !Number.isSafeInteger(value.restrictedAmount)) { fail("INVALID_OBSERVATION", "Cash observations must be safe integer amounts.", account.code); continue; }
    const eligible = value.classification === "borrowing" ? 0 : value.amount;
    if (!["cash", "borrowing"].includes(value.classification) || value.classification === "cash" && value.amount < 0 || value.classification === "borrowing" && value.amount >= 0) fail("INVALID_OBSERVATION", "Negative balances require explicit borrowing classification; other balances are cash.", account.code);
    if (value.restrictedAmount < 0 || value.restrictedAmount > eligible) fail("INVALID_OBSERVATION", "Restricted cash must lie between zero and the eligible cash balance.", account.code);
    if (!textPresent(value.evidenceRef) || value.evidenceRef.length > 1000 || value.asOfDate !== periodBounds(period)[kind === "opening" ? "start" : "end"]) fail("INVALID_OBSERVATION", "Cash evidence must identify the source at the exact reporting boundary.", account.code);
    balances.push(eligible); restricted.push(value.restrictedAmount); borrowing.push(value.classification === "borrowing" ? -value.amount : 0);
  }
  if (!valid) return { closing: null, restricted: null, borrowing: null, valid: false };
  try { return { closing: sumMoney(balances), restricted: sumMoney(restricted), borrowing: sumMoney(borrowing), valid: true }; }
  catch { fail("UNSAFE_AMOUNT", "Observed account balances exceed the exact amount range."); return { closing: null, restricted: null, borrowing: null, valid: false }; }
}

/** Pure reproducible calculation over a pinned definition/input manifest and snapshot. */
export function calculateFinanceSnapshot(snapshot: FinanceSnapshot, context: FinanceCalculationContext): FinanceReport {
  if (context.segmentCode === FINANCE_ALL) context = { ...context, segmentCode: undefined };
  const issues: FinanceIssue[] = [];
  const add = (issue: FinanceIssue) => { if (!issues.some(existing => existing.code === issue.code && existing.lineCode === issue.lineCode && existing.segmentCode === issue.segmentCode && existing.accountCode === issue.accountCode && existing.message === issue.message)) issues.push(issue); };
  const metrics: Record<string, number | null> = {};
  const lineValues: Record<string, number | null> = {};
  const stale = !!(snapshot.stale || context.stale || context.previous?.stale);
  const report: FinanceReport = { period: snapshot.period, kind: context.kind, metrics, lineValues, issues, stale, reconciled: false, canClose: false, sourceState: snapshot.state, segmentCode: context.segmentCode,
    completeness: { expected: 0, entered: 0, notApplicable: 0, missing: [], complete: false }, lineAggregation: {} };
  let current: string;
  try { periodIndex(snapshot.period); periodIndex(context.book.firstPeriod); current = currentPeriod(context.book.timezone, context.now); precisionValue(context.book.precision); }
  catch (error) { add({ code: error instanceof FinanceValidationError ? error.code : "INVALID_PERIOD", message: error instanceof Error ? error.message : "Invalid reporting context." }); return report; }
  if (context.kind === "actual" && snapshot.period > current) add({ code: "FUTURE_ACTUAL", message: "Actuals cannot be entered for a future local calendar month." });
  if (context.kind === "actual" && snapshot.period >= current) add({ code: "PERIOD_NOT_ENDED", message: "Close becomes available after the local calendar month ends." });
  if (stale) add({ code: "STALE_SOURCE", message: "A source revision was restated; rebase the dependent reporting chain." });
  const lines = new Map<string, FinanceLine>();
  for (const line of context.lines) {
    if (!CODE.test(line.code) || lines.has(line.code) || !["input", "derived"].includes(line.kind) || ![1, -1].includes(line.sign) || !["flow", "stock"].includes(line.aggregation) || line.kind === "input" && !GROUPS[line.basis]?.includes(line.group)) add({ code: "INVALID_DEFINITION", message: "The pinned line definitions contain an invalid or duplicate semantic code.", lineCode: line.code });
    lines.set(line.code, line); report.lineAggregation![line.code] = line.aggregation;
  }
  const expected = expectedInputsFor(context, snapshot.period), manifests = new Map<string, FinanceExpectedInput>();
  for (const item of expected) {
    const line = lines.get(item.lineCode), key = coordinate(item.lineCode, item.segmentCode);
    if (!line || line.kind !== "input" || manifests.has(key) || !CODE.test(item.segmentCode) || line.basis !== "pnl" && item.segmentCode !== FINANCE_ALL || line.basis === "pnl" && item.segmentCode === FINANCE_ALL || item.allowNa && (!line.allowNa || line.basis !== "pnl")) add({ code: "INVALID_MANIFEST", message: "The expected-input manifest has an invalid or duplicate coordinate.", lineCode: item.lineCode, segmentCode: item.segmentCode });
    manifests.set(key, item);
  }
  const facts = new Map<string, FinanceFact>(), seen = new Set<string>();
  for (const fact of snapshot.values) {
    const line = lines.get(fact.lineCode);
    if (context.segmentCode && line?.basis === "pnl" && fact.segmentCode !== context.segmentCode) continue;
    const key = coordinate(fact.lineCode, fact.segmentCode);
    if (seen.has(key)) { add({ code: "DUPLICATE_COORDINATE", message: "Each line and segment can have only one monthly value.", lineCode: fact.lineCode, segmentCode: fact.segmentCode }); facts.delete(key); continue; }
    seen.add(key);
    const manifest = manifests.get(key);
    if (!line) { add({ code: "UNKNOWN_LINE", message: "The line is not in this pinned definition set.", lineCode: fact.lineCode }); continue; }
    if (line.kind === "derived") { add({ code: "DERIVED_INPUT", message: "Derived totals cannot be entered.", lineCode: fact.lineCode }); continue; }
    if (!manifest) { add({ code: "UNEXPECTED_COORDINATE", message: "The line and segment are not applicable to this dataset and month.", lineCode: fact.lineCode, segmentCode: fact.segmentCode }); continue; }
    const invalid = validateFinanceFact(fact, line, manifest); invalid.forEach(add);
    if (!invalid.length) facts.set(key, fact);
  }
  // An optional policy flag does not make an applicable but absent amount zero.
  // Every active dependency is needed for a complete, reproducible statement.
  report.completeness.expected = expected.length;
  for (const item of expected) {
    const fact = facts.get(coordinate(item.lineCode, item.segmentCode));
    if (fact?.state === "entered") report.completeness.entered++;
    else if (fact?.state === "not_applicable") report.completeness.notApplicable++;
    else report.completeness.missing.push(item);
  }
  report.completeness.complete = expected.length > 0 && report.completeness.missing.length === 0;
  for (const item of report.completeness.missing) add({ code: "MISSING_INPUT", message: "Enter a value, including explicit zero when there was no activity.", lineCode: item.lineCode, segmentCode: item.segmentCode });
  const exact = (parts: readonly (number | null | undefined)[], signs?: readonly number[]): number | null => {
    if (parts.some(value => !present(value))) return null;
    try { return integer(parts.reduce<bigint>((sum, value, index) => { assertMinorAmount(value); return sum + BigInt(value) * BigInt(signs?.[index] ?? 1); }, 0n)); }
    catch { add({ code: "UNSAFE_AMOUNT", message: "A subtotal exceeds the exact minor-unit range." }); return null; }
  };
  const basisActive = (basis: string): boolean => expected.some(item => lines.get(item.lineCode)?.basis === basis);
  for (const line of context.lines) {
    const coordinates = expected.filter(item => item.lineCode === line.code);
    lineValues[line.code] = !coordinates.length ? null : exact(coordinates.map(item => {
      const fact = facts.get(coordinate(item.lineCode, item.segmentCode));
      return fact?.state === "entered" ? fact.amount : fact?.state === "not_applicable" ? 0 : null;
    }));
  }
  const group = (basis: string, name: string): number | null => {
    if (!basisActive(basis)) return null;
    const groupLines = context.lines.filter(line => line.kind === "input" && line.basis === basis && line.group === name && expected.some(item => item.lineCode === line.code));
    return exact(groupLines.map(line => lineValues[line.code]), groupLines.map(line => line.sign));
  };
  const value = (code: string): number | null => lineValues[code] ?? null;
  if (context.kind === "actual") for (const fact of facts.values()) {
    const needsSource = fact.lineCode === "equity.opening" || ["equity.noncash_contributions", "equity.noncash_distributions", "equity.other_movements"].includes(fact.lineCode) && fact.amount !== 0;
    if (needsSource && fact.state === "entered" && !textPresent(fact.evidenceRef)) add({ code: "MISSING_EVIDENCE", message: "Identify the specific opening or noncash equity source before closing.", lineCode: fact.lineCode, segmentCode: fact.segmentCode });
  }
  metrics.revenue = group("pnl", "revenue"); metrics.direct_costs = group("pnl", "direct_cost");
  metrics.gross_profit = exact([metrics.revenue, metrics.direct_costs], [1, -1]);
  metrics.operating_expenses = group("pnl", "operating_expense"); metrics.other_operating_income = group("pnl", "other_operating_income");
  metrics.operating_profit = exact([metrics.gross_profit, metrics.operating_expenses, metrics.other_operating_income], [1, -1, 1]);
  metrics.finance_income = group("pnl", "finance_income"); metrics.finance_costs = group("pnl", "finance_cost");
  metrics.profit_before_tax = exact([metrics.operating_profit, metrics.finance_income, metrics.finance_costs], [1, 1, -1]);
  metrics.income_tax = group("pnl", "income_tax"); metrics.net_profit = exact([metrics.profit_before_tax, metrics.income_tax], [1, -1]);
  for (const [ratio, numerator] of [["gross_margin", "gross_profit"], ["operating_margin", "operating_profit"], ["net_margin", "net_profit"]]) metrics[ratio] = present(metrics[numerator]) && present(metrics.revenue) && metrics.revenue > 0 ? metrics[numerator]! / metrics.revenue : null;
  metrics.cash_operating = group("cash", "operating"); metrics.cash_investing = group("cash", "investing"); metrics.cash_financing = group("cash", "financing");
  let opening: number | null = null, closing: number | null = null, restricted: number | null = null, observedBorrowing: number | null = null;
  let openingEquity: number | null = context.openingEquity !== undefined ? context.openingEquity : value("equity.opening");
  if (context.kind === "actual") {
    for (const observation of snapshot.cashObservations) if (!["opening", "closing"].includes(observation.kind)) add({ code: "INVALID_OBSERVATION", message: "Cash observation boundary is invalid.", accountCode: observation.accountCode });
    const observed = cashSummary(snapshot.cashObservations, context.cashAccounts, snapshot.period, "closing", add);
    closing = observed.closing; restricted = observed.restricted; observedBorrowing = observed.borrowing;
    if (snapshot.period === context.book.firstPeriod) {
      opening = cashSummary(snapshot.cashObservations, context.cashAccounts, snapshot.period, "opening", add).closing;
      if (snapshot.openingSourceRevisionId) add({ code: "OPENING_SOURCE_MISMATCH", message: "Cutover opening comes from its evidenced starting boundary, not a prior revision." });
    } else if (context.previous?.state === "closed" && periodIndex(context.previous.period) + 1 === periodIndex(snapshot.period)) {
      const previous = context.previous;
      if (previous.revisionId && snapshot.openingSourceRevisionId !== previous.revisionId) add({ code: "OPENING_SOURCE_MISMATCH", message: "The opening balance must pin the current authoritative previous revision." });
      opening = cashSummary(previous.cashObservations, context.previousCashAccounts ?? context.cashAccounts, previous.period, "closing", add).closing;
      const priorLines = context.previousLines ?? context.lines;
      const equityLines = priorLines.filter(line => line.kind === "input" && line.basis === "position" && line.group === "equity");
      const priorEquity = exact(equityLines.map(line => {
        const rows = previous.values.filter(fact => fact.lineCode === line.code);
        return rows.length === 1 && rows[0].state === "entered" ? rows[0].amount : null;
      }), equityLines.map(line => line.sign));
      if (present(value("equity.opening")) && present(priorEquity) && value("equity.opening") !== priorEquity) add({ code: "OPENING_SOURCE_MISMATCH", message: "Entered opening equity differs from the previous closed position." });
      openingEquity = priorEquity;
      if (snapshot.cashObservations.some(observation => observation.kind === "opening")) add({ code: "INVALID_OBSERVATION", message: "After cutover, opening cash is carried from the pinned prior close." });
    } else add({ code: "MISSING_OPENING", message: "A contiguous authoritative prior close or explicit cutover opening is required." });
  } else {
    if (snapshot.cashObservations.length) add({ code: "INVALID_OBSERVATION", message: "Plan cash uses planned external flows; bank observations belong to actual revisions." });
    opening = context.openingCash !== undefined ? context.openingCash : value("cash.opening");
    if (present(context.openingCash) && present(value("cash.opening")) && context.openingCash !== value("cash.opening")) add({ code: "OPENING_SOURCE_MISMATCH", message: "Entered planned opening cash differs from its carried source." });
    if (opening === null) add({ code: "MISSING_OPENING", message: "Supply a plan opening anchor or the preceding projected closing cash." });
    restricted = value("forecast.restricted_cash");
  }
  metrics.cash_opening = opening;
  metrics.cash_expected_closing = exact([opening, metrics.cash_operating, metrics.cash_investing, metrics.cash_financing]);
  if (context.kind !== "actual") closing = metrics.cash_expected_closing;
  metrics.cash_closing = closing; metrics.cash_restricted = restricted; metrics.cash_available = exact([closing, restricted], [1, -1]);
  metrics.cash_reconciliation = exact([closing, metrics.cash_expected_closing], [1, -1]);
  metrics.cash_borrowing = observedBorrowing;
  lineValues["position.cash"] = closing;
  metrics.ar_gross = value("position.ar_gross"); metrics.ar_allowance = value("position.ar_allowance");
  metrics.ar_net = exact([metrics.ar_gross, metrics.ar_allowance], [1, -1]); lineValues["position.ar_net"] = metrics.ar_net;
  metrics.ap = value("position.ap"); metrics.ar_aging_total = group("aging", "ar"); metrics.ap_aging_total = group("aging", "ap");
  metrics.assets = exact([closing, group("position", "asset")]); metrics.liabilities = group("position", "liability"); metrics.equity = group("position", "equity");
  metrics.position_reconciliation = exact([metrics.assets, metrics.liabilities, metrics.equity], [1, -1, -1]);
  metrics.equity_opening = openingEquity;
  metrics.equity_expected_closing = context.segmentCode ? null : exact([openingEquity, metrics.net_profit, value("cash.owner_contributions"), value("equity.noncash_contributions"), value("cash.owner_distributions"), value("equity.noncash_distributions"), value("equity.other_movements")], [1, 1, 1, 1, -1, -1, 1]);
  metrics.equity_reconciliation = exact([metrics.equity, metrics.equity_expected_closing], [1, -1]);
  const reconcile = (metric: string, code: string, label: string) => { if (present(metrics[metric]) && metrics[metric] !== 0) add({ code, message: `${label} must reconcile exactly to zero.` }); };
  reconcile("cash_reconciliation", "CASH_RECONCILIATION", "Cash"); reconcile("position_reconciliation", "POSITION_RECONCILIATION", "Position"); reconcile("equity_reconciliation", "EQUITY_RECONCILIATION", "Equity movements");
  for (const side of ["ar", "ap"] as const) {
    const control = value(`aging.${side}_control`), age = metrics[`${side}_aging_total`], position = side === "ar" ? metrics.ar_gross : metrics.ap;
    metrics[`${side}_aging_reconciliation`] = exact([age, control], [1, -1]);
    metrics[`${side}_position_reconciliation`] = exact([position, control], [1, -1]);
    reconcile(`${side}_aging_reconciliation`, `${side.toUpperCase()}_RECONCILIATION`, `${side.toUpperCase()} source and aging`);
    reconcile(`${side}_position_reconciliation`, `${side.toUpperCase()}_RECONCILIATION`, `${side.toUpperCase()} source and position`);
  }
  if (present(metrics.ar_gross) && present(metrics.ar_allowance) && metrics.ar_allowance > metrics.ar_gross) add({ code: "INVALID_ALLOWANCE", message: "Receivables allowance cannot exceed gross receivables.", lineCode: "position.ar_allowance" });
  if (present(observedBorrowing) && present(value("position.debt")) && observedBorrowing > value("position.debt")!) add({ code: "BORROWING_RECONCILIATION", message: "Position debt must include every observed borrowing balance." });
  const neededBases = context.kind === "actual" ? ["pnl", "cash", "position", "aging"] : ["pnl", "cash"];
  for (const basis of neededBases) if (!basisActive(basis)) add({ code: "MISSING_BLOCK", message: `The ${basis} block has no applicable input manifest.` });
  const checks = ["cash_reconciliation", ...(context.kind === "actual" ? ["position_reconciliation", "equity_reconciliation", "ar_aging_reconciliation", "ar_position_reconciliation", "ap_aging_reconciliation", "ap_position_reconciliation"] : [])];
  const structuralIssues = issues.filter(issue => !requiredIssueCodes.has(issue.code));
  report.reconciled = !stale && !context.segmentCode && structuralIssues.length === 0 && report.completeness.complete && present(metrics.net_profit) && present(metrics.cash_restricted) && checks.every(metric => metrics[metric] === 0) && !issues.some(issue => !["PERIOD_NOT_ENDED"].includes(issue.code));
  report.canClose = context.kind === "actual" && snapshot.period < current && report.reconciled;
  return report;
}
export const calculateReport = calculateFinanceSnapshot;

export function validateFinanceSnapshot(snapshot: FinanceSnapshot, context: FinanceCalculationContext, mode: "draft" | "close" | "publish" = "draft"): FinanceValidationResult {
  const report = calculateFinanceSnapshot(snapshot, context);
  const issues = mode === "draft" ? report.issues.filter(issue => !requiredIssueCodes.has(issue.code)) : report.issues;
  let valid = mode === "draft" ? issues.length === 0 : mode === "close" ? report.canClose : context.kind !== "actual" && report.completeness.complete && report.reconciled;
  if (mode === "close" && context.kind !== "actual" || mode === "publish" && context.kind === "actual") valid = false;
  return { valid, issues, report };
}

export interface FinanceVariance {
  difference: number | null; percentage: number | null; percentagePoints: number | null;
  favorable: boolean | null; state: "compared" | "unbudgeted" | "no_comparison" | "zero_baseline";
}
export function calculateVariance(actual: number | null, plan: number | null, direction: "higher" | "lower" | "neutral" = "neutral", isRatio = false): FinanceVariance {
  if (actual === null || plan === null) return { difference: null, percentage: null, percentagePoints: null, favorable: null, state: "no_comparison" };
  if (!Number.isFinite(actual) || !Number.isFinite(plan)) throw new FinanceValidationError("INVALID_VALUE", "Comparison values must be finite.");
  const difference = isRatio ? actual - plan : sumMoney([actual, -plan]);
  return { difference, percentage: isRatio || plan === 0 ? null : difference / Math.abs(plan), percentagePoints: isRatio ? difference * 100 : null,
    favorable: direction === "neutral" || difference === 0 ? null : direction === "higher" ? difference > 0 : difference < 0,
    state: plan === 0 ? actual === 0 ? "zero_baseline" : "unbudgeted" : "compared" };
}

/** Compare threshold cross-products exactly; a percentage has no denominator at a zero plan. */
export function isMaterialVariance(actual: number | null, plan: number | null, amountThreshold: number | null, bpsThreshold: number | null): boolean | null {
  for (const threshold of [amountThreshold, bpsThreshold]) if (threshold !== null) {
    assertMinorAmount(threshold);
    if (threshold < 0) throw new FinanceValidationError("INVALID_THRESHOLD", "Variance thresholds cannot be negative.");
  }
  if (actual === null || plan === null || amountThreshold === null && bpsThreshold === null) return null;
  assertMinorAmount(actual); assertMinorAmount(plan);
  const delta = BigInt(actual) - BigInt(plan), magnitude = delta < 0n ? -delta : delta;
  const comparisons: boolean[] = [];
  if (amountThreshold !== null) comparisons.push(magnitude >= BigInt(amountThreshold));
  if (bpsThreshold !== null && plan !== 0) comparisons.push(magnitude * 10000n >= BigInt(bpsThreshold) * (BigInt(plan) < 0n ? -BigInt(plan) : BigInt(plan)));
  return comparisons.length ? comparisons.some(Boolean) : null;
}

const STOCK_METRICS = new Set(["cash_expected_closing", "cash_closing", "cash_restricted", "cash_available", "cash_borrowing", "assets", "liabilities", "equity", "equity_expected_closing", "ar_gross", "ar_allowance", "ar_net", "ap", "ar_aging_total", "ap_aging_total"]);
const OPENING_METRICS = new Set(["cash_opening", "equity_opening"]);
const RATIOS: Readonly<Record<string, string>> = { gross_margin: "gross_profit", operating_margin: "operating_profit", net_margin: "net_profit" };
/** Expected periods make omissions explicit; flow sums, endpoint stocks, and ratios have distinct semantics. */
export function aggregateFinanceReports(reports: readonly FinanceReport[], expectedPeriods?: readonly string[]): FinanceReport {
  const periods = [...(expectedPeriods ?? reports.map(report => report.period))].sort((a, b) => periodIndex(a) - periodIndex(b));
  const byPeriod = new Map(reports.map(report => [report.period, report]));
  const duplicate = byPeriod.size !== reports.length || new Set(periods).size !== periods.length;
  const selected = periods.map(period => byPeriod.get(period));
  const gap = !periods.length || duplicate || selected.some(report => !report) || periods.some((period, index) => index > 0 && periodIndex(period) !== periodIndex(periods[index - 1]) + 1);
  const chosen = selected.filter((report): report is FinanceReport => !!report);
  const issues = chosen.flatMap(report => report.issues);
  if (gap) issues.push({ code: "REPORT_GAP", message: "The requested range contains an absent, duplicate, or noncontiguous month." });
  const metrics: Record<string, number | null> = {}, lineValues: Record<string, number | null> = {};
  const combine = (values: (number | null | undefined)[]): number | null => {
    if (gap || values.some(value => !present(value))) return null;
    try { return sumMoney(values as number[]); } catch { issues.push({ code: "UNSAFE_AMOUNT", message: "The aggregate exceeds the exact minor-unit range." }); return null; }
  };
  const keys = new Set(chosen.flatMap(report => Object.keys(report.metrics)));
  for (const key of keys) {
    if (key in RATIOS) continue;
    if (key.endsWith("_reconciliation")) metrics[key] = !gap && chosen.every(report => report.metrics[key] === 0) ? 0 : null;
    else if (STOCK_METRICS.has(key)) metrics[key] = gap || !selected.at(-1)?.completeness.complete ? null : selected.at(-1)?.metrics[key] ?? null;
    else if (OPENING_METRICS.has(key)) metrics[key] = gap ? null : selected[0]?.metrics[key] ?? null;
    else metrics[key] = combine(selected.map(report => report?.metrics[key]));
  }
  for (const [ratio, numerator] of Object.entries(RATIOS)) metrics[ratio] = present(metrics[numerator]) && present(metrics.revenue) && metrics.revenue > 0 ? metrics[numerator]! / metrics.revenue : null;
  const aggregations: Record<string, "flow" | "stock"> = Object.assign({}, ...chosen.map(report => report.lineAggregation ?? {}));
  for (const key of new Set(chosen.flatMap(report => Object.keys(report.lineValues)))) {
    lineValues[key] = key === "cash.opening" || key === "equity.opening" ? gap ? null : selected[0]?.lineValues[key] ?? null
      : aggregations[key] === "stock" ? gap || !selected.at(-1)?.completeness.complete ? null : selected.at(-1)?.lineValues[key] ?? null : combine(selected.map(report => report?.lineValues[key]));
  }
  const completeness = { expected: chosen.reduce((total, report) => total + report.completeness.expected, 0), entered: chosen.reduce((total, report) => total + report.completeness.entered, 0), notApplicable: chosen.reduce((total, report) => total + report.completeness.notApplicable, 0), missing: chosen.flatMap(report => report.completeness.missing), complete: !gap && chosen.every(report => report.completeness.complete) };
  return { period: periods.length ? `${periods[0]}…${periods.at(-1)}` : "", periods, kind: chosen[0]?.kind ?? "actual", metrics, lineValues, lineAggregation: aggregations, completeness, issues,
    reconciled: !gap && chosen.every(report => report.reconciled), stale: chosen.some(report => report.stale), canClose: false, segmentCode: chosen[0]?.segmentCode };
}
export const aggregateReports = aggregateFinanceReports;

export interface FinanceRunway { status: "breach" | "no_breach" | "incomplete" | "no_floor"; breachPeriod: string | null; monthsUntilBreach: number | null; horizonMonths: number; cashFloor: number | null }
export function calculateRunway(reports: readonly FinanceReport[], cashFloor: number | null, expectedPeriods?: readonly string[]): FinanceRunway {
  const base = { breachPeriod: null, monthsUntilBreach: null, horizonMonths: reports.length, cashFloor };
  if (cashFloor === null) return { ...base, status: "no_floor" };
  assertMinorAmount(cashFloor);
  if (cashFloor < 0) throw new FinanceValidationError("INVALID_VALUE", "The cash floor cannot be negative.");
  const periods = [...(expectedPeriods ?? reports.map(report => report.period))].sort();
  const byPeriod = new Map(reports.map(report => [report.period, report]));
  if (!periods.length || byPeriod.size !== reports.length || new Set(periods).size !== periods.length) return { ...base, status: "incomplete" };
  for (let index = 0; index < periods.length; index++) {
    const report = byPeriod.get(periods[index]);
    if (!report || report.stale || !report.reconciled || !report.completeness.complete || !present(report.metrics.cash_available) || !present(report.metrics.cash_opening) || index > 0 && periodIndex(periods[index - 1]) + 1 !== periodIndex(periods[index]) || index > 0 && report.metrics.cash_opening !== byPeriod.get(periods[index - 1])?.metrics.cash_closing) return { ...base, status: "incomplete" };
    if (report.metrics.cash_available < cashFloor) return { ...base, status: "breach", breachPeriod: periods[index], monthsUntilBreach: index + 1, horizonMonths: periods.length };
  }
  return { ...base, status: "no_breach", horizonMonths: periods.length };
}

export function buildFinanceOutlook(periods: readonly string[], actualReports: readonly FinanceReport[], forecastReports: readonly FinanceReport[], cutoff: string | null): FinanceReport {
  const actual = new Map(actualReports.map(report => [report.period, report])), forecast = new Map(forecastReports.map(report => [report.period, report]));
  const selected: FinanceReport[] = [];
  for (const period of periods) {
    const report = cutoff && period <= cutoff ? actual.get(period) : forecast.get(period);
    if (report && (!(cutoff && period <= cutoff) || report.sourceState === "closed") && !(report.kind === "actual" && (!cutoff || period > cutoff))) selected.push(report);
  }
  const result = aggregateFinanceReports(selected, periods);
  result.kind = "forecast";
  return result;
}
