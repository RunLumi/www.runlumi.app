import { FinanceValidationError, type FinanceCsvOptions, type FinanceCsvRow, type FinanceExpectedInput } from "./model";
import { currentPeriod, fiscalPeriods, fiscalYearForPeriod, formatMoneyInput, parseMoney, periodIndex, validateFinanceFact } from "./calculations";

export const FINANCE_CSV_COLUMNS = ["period", "line_code", "segment_code", "value_state", "amount", "currency", "evidence_ref", "note"] as const;
export const FINANCE_CSV_MAX_BYTES = 256 * 1024;
export const FINANCE_CSV_MAX_ROWS = 2400;
export const FINANCE_CSV_MAX_MONTH_ROWS = 200;

function csvError(message: string, row?: number): never {
  throw new FinanceValidationError("INVALID_CSV", `${row ? `Row ${row}: ` : ""}${message}`);
}

/** Bounded RFC-style quoted fields; quotes inside quoted fields must be doubled. */
function records(text: string): string[][] {
  if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > FINANCE_CSV_MAX_BYTES) throw new FinanceValidationError("CSV_TOO_LARGE", "CSV files are limited to 256 KiB of UTF-8 text.");
  if (text.startsWith("\uFEFF")) text = text.slice(1);
  if (!text || text.includes("\0")) csvError("The CSV is empty or contains a NUL character.");
  const rows: string[][] = [];
  let row: string[] = [], cell = "", state: "start" | "plain" | "quoted" | "ended" = "start";
  let touched = false;
  const field = () => { row.push(cell); cell = ""; state = "start"; };
  const record = () => { field(); rows.push(row); row = []; touched = false; if (rows.length > FINANCE_CSV_MAX_ROWS + 1) throw new FinanceValidationError("CSV_TOO_MANY_ROWS", "CSV files are limited to 2,400 data rows."); };
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (state === "quoted") {
      if (character === '"') {
        if (text[index + 1] === '"') { cell += '"'; index++; }
        else state = "ended";
      } else cell += character;
      touched = true;
      continue;
    }
    if (character === "\n" || character === "\r") {
      if (character === "\r") { if (text[index + 1] !== "\n") csvError("Line endings must be LF or CRLF.", rows.length + 1); index++; }
      record(); continue;
    }
    if (character === ",") { field(); touched = true; continue; }
    if (state === "ended") csvError("Only a comma or line ending may follow a closing quote.", rows.length + 1);
    if (character === '"') {
      if (state !== "start") csvError("A quote inside an unquoted field must be quoted and doubled.", rows.length + 1);
      state = "quoted"; touched = true; continue;
    }
    cell += character; state = "plain"; touched = true;
  }
  if (state === "quoted") csvError("The last quoted field is not closed.", rows.length + 1);
  if (touched || row.length || cell.length) record();
  return rows;
}

export function parseFinanceCsv(text: string, options: FinanceCsvOptions): FinanceCsvRow[] {
  const data = records(text);
  if (data[0]?.length !== FINANCE_CSV_COLUMNS.length || data[0].some((column, index) => column !== FINANCE_CSV_COLUMNS[index])) csvError(`Columns must be exactly: ${FINANCE_CSV_COLUMNS.join(",")}.`);
  if (data.length < 2) csvError("Supply at least one data row.");
  if (!/^[A-Z]{3}$/.test(options.currency)) csvError("The book currency is invalid.");
  const definitions = new Map(options.lines.map(line => [line.code, line]));
  const coordinates = new Map<string, FinanceExpectedInput>();
  for (const item of options.expectedInputs) if (!options.kind || !item.kinds || item.kinds.includes(options.kind)) coordinates.set(`${item.period}\u001f${item.lineCode}\u001f${item.segmentCode}`, item);
  const allowed = options.fiscalYear === undefined ? null : new Set(fiscalPeriods(options.fiscalYear, options.fiscalStartMonth ?? 1));
  const seen = new Set<string>(), monthlyRows = new Map<string, number>(), fiscalYears = new Set<number>();
  const today = options.kind === "actual" ? currentPeriod(options.timezone ?? "UTC", options.now) : null;
  return data.slice(1).map((cells, index) => {
    const rowNumber = index + 2;
    if (cells.length !== FINANCE_CSV_COLUMNS.length) csvError("The row must contain exactly eight fields.", rowNumber);
    const [period, lineCode, segmentCode, state, amountText, currency, evidenceRef, note] = cells;
    try { periodIndex(period); } catch { csvError("Period must be a calendar month in YYYY-MM format.", rowNumber); }
    if (allowed && !allowed.has(period)) csvError("The period is outside the selected fiscal year.", rowNumber);
    fiscalYears.add(fiscalYearForPeriod(period, options.fiscalStartMonth ?? 1));
    if (fiscalYears.size > 1) csvError("One import may contain months from only one fiscal year.", rowNumber);
    if (today && period > today) throw new FinanceValidationError("FUTURE_ACTUAL", `Row ${rowNumber}: Actual entries cannot be imported into a future local calendar month.`);
    if (currency !== options.currency) csvError("Every row must use the book's exact base currency.", rowNumber);
    if (state !== "entered" && state !== "not_applicable") csvError("value_state must be entered or not_applicable; blank is never zero.", rowNumber);
    const key = `${period}\u001f${lineCode}\u001f${segmentCode}`;
    if (seen.has(key)) throw new FinanceValidationError("DUPLICATE_COORDINATE", `Row ${rowNumber}: The period, line and segment coordinate is duplicated.`);
    seen.add(key);
    const count = (monthlyRows.get(period) ?? 0) + 1;
    monthlyRows.set(period, count);
    if (count > FINANCE_CSV_MAX_MONTH_ROWS) throw new FinanceValidationError("CSV_MONTH_TOO_LARGE", `Row ${rowNumber}: A monthly import may contain at most 200 facts.`);
    if (monthlyRows.size > 12) csvError("An import may contain at most twelve months.", rowNumber);
    const line = definitions.get(lineCode), expected = coordinates.get(key);
    if (!line) throw new FinanceValidationError("UNKNOWN_LINE", `Row ${rowNumber}: Unknown line code.`);
    if (line.kind !== "input") throw new FinanceValidationError("DERIVED_INPUT", `Row ${rowNumber}: Derived totals cannot be imported.`);
    if (!expected) throw new FinanceValidationError("UNEXPECTED_COORDINATE", `Row ${rowNumber}: This line and segment are not applicable to the dataset and month.`);
    if (state === "not_applicable" && amountText !== "") csvError("Not-applicable amounts must be blank.", rowNumber);
    let amount: number | null = null;
    if (state === "entered") {
      try { amount = parseMoney(amountText, options.precision); }
      catch (error) { throw new FinanceValidationError(error instanceof FinanceValidationError ? error.code : "INVALID_MONEY", `Row ${rowNumber}: Enter an exact amount; missing text is not zero.`); }
    }
    const result: FinanceCsvRow = { period, lineCode, segmentCode, state, amount, currency, evidenceRef, note };
    const invalid = validateFinanceFact(result, line, expected);
    if (invalid.length) throw new FinanceValidationError(invalid[0].code, `Row ${rowNumber}: ${invalid[0].message}`);
    return result;
  });
}

/** Prefix formula-looking text before CSV quoting; numeric amount cells remain exact numbers. */
export function protectCsvText(value: string): string {
  return /^[\t\r\n]/.test(value) || /^[\s\uFEFF]*[=+\-@]/u.test(value) ? `'${value}` : value;
}
function quote(value: string): string { return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value; }
export function csvCell(value: string, isNumeric = false): string {
  if (isNumeric && value !== "" && !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) throw new FinanceValidationError("INVALID_CSV", "Numeric exports must contain canonical decimal values.");
  return quote(isNumeric ? value : protectCsvText(value));
}
export function serializeCsv(rows: readonly (readonly string[])[], numericColumns: readonly number[] = []): string {
  return `${rows.map(row => row.map((cell, index) => csvCell(cell, numericColumns.includes(index))).join(",")).join("\r\n")}\r\n`;
}
export function exportFinanceCsv(rows: readonly FinanceCsvRow[], precision: number): string {
  const lines = [FINANCE_CSV_COLUMNS.join(",")];
  for (const row of rows) {
    const text = [row.period, row.lineCode, row.segmentCode, row.state];
    const amount = row.state === "entered" && row.amount !== null ? formatMoneyInput(row.amount, precision) : "";
    lines.push([...text.map(value => quote(protectCsvText(value))), quote(amount), ...[row.currency, row.evidenceRef, row.note].map(value => quote(protectCsvText(value)))].join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** A blank template deliberately requires the owner to supply every amount before importing. */
export function financeCsvTemplate(expected: readonly FinanceExpectedInput[], currency: string, kind: FinanceCsvOptions["kind"]): string {
  const rows = expected.filter(item => !kind || !item.kinds || item.kinds.includes(kind)).map(item => ({ period: item.period, lineCode: item.lineCode, segmentCode: item.segmentCode, state: "entered" as const, amount: null, currency, evidenceRef: "", note: "" }));
  return exportFinanceCsv(rows, 0);
}
