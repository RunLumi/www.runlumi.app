import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FINANCE_LINES, type FinanceCsvOptions, type FinanceCsvRow, type FinanceExpectedInput } from "../src/lib/finance/model.ts";
import { defaultExpectedInputs } from "../src/lib/finance/calculations.ts";
import { csvCell, exportFinanceCsv, financeCsvTemplate, FINANCE_CSV_COLUMNS, FINANCE_CSV_MAX_BYTES, parseFinanceCsv, protectCsvText, serializeCsv } from "../src/lib/finance/csv.ts";

const header = FINANCE_CSV_COLUMNS.join(",");
const options: FinanceCsvOptions = { currency: "VND", precision: 0, lines: DEFAULT_FINANCE_LINES, expectedInputs: defaultExpectedInputs(2026, 1), fiscalYear: 2026, fiscalStartMonth: 1, kind: "actual", timezone: "Asia/Ho_Chi_Minh", now: "2026-10-18T00:00:00Z" };
const row = (value: Partial<FinanceCsvRow> = {}): FinanceCsvRow => ({ period: "2026-01", lineCode: "pnl.projects", segmentCode: "unallocated", state: "entered", amount: 0, currency: "VND", evidenceRef: "", note: "", ...value });
const raw = (line: string) => `${header}\n${line}\n`;

test("CSV parses exact zero, decimal amounts, BOM, quoted commas and multiline evidence", () => {
  const input = '\uFEFF' + raw('2026-01,pnl.projects,unallocated,entered,0,VND,"source, 1","Line 1\nLine ""2"""');
  assert.deepEqual(parseFinanceCsv(input, options), [row({ evidenceRef: "source, 1", note: 'Line 1\nLine "2"' })]);
  const decimal = raw("2026-01,pnl.projects,unallocated,entered,1234567890123.45,USD,,");
  assert.equal(parseFinanceCsv(decimal, { ...options, currency: "USD", precision: 2 })[0].amount, 123456789012345);
  assert.equal(parseFinanceCsv(raw("2026-01,pnl.projects,unallocated,entered,-5,VND,,Correction"), options)[0].amount, -5);
});

test("CSV blanks and N/A retain different meanings and explanations", () => {
  assert.throws(() => parseFinanceCsv(raw("2026-01,pnl.projects,unallocated,entered,,VND,,"), options), { code: "INVALID_MONEY" });
  assert.throws(() => parseFinanceCsv(raw("2026-01,pnl.projects,unallocated,missing,,VND,,"), options), { code: "INVALID_CSV" });
  assert.equal(parseFinanceCsv(raw("2026-01,pnl.projects,unallocated,not_applicable,,VND,,No project activity applicable"), options)[0].amount, null);
  assert.throws(() => parseFinanceCsv(raw("2026-01,pnl.projects,unallocated,not_applicable,,VND,,"), options), { code: "NOTE_REQUIRED" });
  assert.throws(() => parseFinanceCsv(raw("2026-01,pnl.projects,unallocated,not_applicable,0,VND,,Explained"), options), { code: "INVALID_CSV" });
  assert.throws(() => parseFinanceCsv(raw("2026-01,cash.customer_receipts,all,not_applicable,,VND,,No activity"), options), { code: "NA_NOT_ALLOWED" });
  const restricted = { ...options, expectedInputs: options.expectedInputs.map(item => ({ ...item, allowNa: false })) };
  assert.throws(() => parseFinanceCsv(raw("2026-01,pnl.projects,unallocated,not_applicable,,VND,,Explained"), restricted), { code: "NA_NOT_ALLOWED" });
});

test("CSV rejects wrong headers, malformed quotes and ambiguous amounts", () => {
  for (const text of ["", `${header}\n`, `${header},surprise\n`, raw('2026-01,pnl.projects,unallocated,entered,0,VND,,"open'), raw('2026-01,pnl.projects,unallocated,entered,0,VND,,"closed"x'), raw('2026-01,pnl.projects,unallocated,entered,0,VND,,unquoted"quote'), raw("2026-01,pnl.projects,unallocated,entered,0,VND,,nul\0"), `${header}\r2026-01,pnl.projects,unallocated,entered,0,VND,,`]) assert.throws(() => parseFinanceCsv(text, options));
  for (const amount of ["1e3", "+5", " 1", "1 ", "1.1", "01", "NaN", '"1,000"', "9007199254740992"]) assert.throws(() => parseFinanceCsv(raw(`2026-01,pnl.projects,unallocated,entered,${amount},VND,,`), options));
  const unknownHeader = header.replace("note", "comment"); assert.throws(() => parseFinanceCsv(`${unknownHeader}\n2026-01,pnl.projects,unallocated,entered,0,VND,,`, options));
});

test("CSV enforces coordinates, dataset masks, one currency and one fiscal year", () => {
  const duplicate = `${header}\n2026-01,pnl.projects,unallocated,entered,0,VND,,\n2026-01,pnl.projects,unallocated,entered,1,VND,,\n`;
  assert.throws(() => parseFinanceCsv(duplicate, options), { code: "DUPLICATE_COORDINATE" });
  assert.throws(() => parseFinanceCsv(raw("2026-01,pnl.unknown,unallocated,entered,0,VND,,"), options), { code: "UNKNOWN_LINE" });
  assert.throws(() => parseFinanceCsv(raw("2026-01,position.cash,all,entered,0,VND,,"), options), { code: "DERIVED_INPUT" });
  assert.throws(() => parseFinanceCsv(raw("2026-01,pnl.projects,another,entered,0,VND,,"), options), { code: "UNEXPECTED_COORDINATE" });
  assert.throws(() => parseFinanceCsv(raw("2026-01,forecast.restricted_cash,all,entered,0,VND,,"), options), { code: "UNEXPECTED_COORDINATE" });
  assert.throws(() => parseFinanceCsv(raw("2026-01,pnl.projects,unallocated,entered,0,USD,,"), options));
  assert.throws(() => parseFinanceCsv(raw("2027-01,pnl.projects,unallocated,entered,0,VND,,"), { ...options, kind: "budget" }));
  assert.throws(() => parseFinanceCsv(raw("2026-00,pnl.projects,unallocated,entered,0,VND,,"), options));
  const mixed = `${header}\n2026-01,pnl.projects,unallocated,entered,0,VND,,\n2027-01,pnl.projects,unallocated,entered,0,VND,,`;
  assert.throws(() => parseFinanceCsv(mixed, { ...options, kind: "budget", fiscalYear: undefined, expectedInputs: [...options.expectedInputs, ...defaultExpectedInputs(2027, 1)] }));
});

test("CSV actual month limit uses the book timezone while future plans remain valid", () => {
  const month = raw("2026-02,pnl.projects,unallocated,entered,0,VND,,");
  const before = { ...options, now: "2026-01-31T16:59:59Z" };
  assert.throws(() => parseFinanceCsv(month, before), { code: "FUTURE_ACTUAL" });
  assert.equal(parseFinanceCsv(month, { ...before, now: "2026-01-31T17:00:00Z" }).length, 1);
  assert.equal(parseFinanceCsv(month, { ...before, kind: "budget" }).length, 1);
});

test("CSV requires reversal and Other notes and rejects negative age buckets", () => {
  assert.throws(() => parseFinanceCsv(raw("2026-01,pnl.projects,unallocated,entered,-1,VND,,"), options), { code: "NOTE_REQUIRED" });
  assert.throws(() => parseFinanceCsv(raw("2026-01,pnl.other_revenue,unallocated,entered,1,VND,,"), options), { code: "NOTE_REQUIRED" });
  assert.equal(parseFinanceCsv(raw("2026-01,pnl.other_revenue,unallocated,entered,0,VND,,"), options).length, 1);
  assert.throws(() => parseFinanceCsv(raw("2026-01,aging.ar_current,all,entered,-1,VND,,Correction"), options), { code: "NEGATIVE_AMOUNT" });
});

test("CSV byte and row bounds apply to decoded UTF-8 and every monthly chunk", () => {
  assert.throws(() => parseFinanceCsv(raw(`2026-01,pnl.projects,unallocated,entered,0,VND,,${"ế".repeat(FINANCE_CSV_MAX_BYTES / 2)}`), options), { code: "CSV_TOO_LARGE" });
  const manifest: FinanceExpectedInput[] = Array.from({ length: 201 }, (_, i) => ({ period: "2026-01", lineCode: "pnl.projects", segmentCode: `s${i}`, required: true, allowNa: false }));
  const monthly = `${header}\n${manifest.map(item => `2026-01,pnl.projects,${item.segmentCode},entered,0,VND,,`).join("\n")}`;
  assert.throws(() => parseFinanceCsv(monthly, { ...options, expectedInputs: manifest }), { code: "CSV_MONTH_TOO_LARGE" });
  const excessive = `${header}\n${Array(2401).fill("2026-01,pnl.projects,unallocated,entered,0,VND,,").join("\n")}`;
  assert.throws(() => parseFinanceCsv(excessive, options), { code: "CSV_TOO_MANY_ROWS" });
});

test("export round-trips ordinary exact values, quoting and Vietnamese notes", () => {
  const rows = [row({ amount: 42, evidenceRef: 'ref,"quoted"', note: "Đã đối chiếu\nTháng 1" }), row({ lineCode: "pnl.maintenance", amount: -5, note: "Reversal explanation" })];
  const text = exportFinanceCsv(rows, 0);
  assert.ok(text.includes("\r\n")); assert.deepEqual(parseFinanceCsv(text, options), rows);
  const template = financeCsvTemplate(options.expectedInputs.filter(item => item.period === "2026-01" && item.lineCode === "pnl.projects"), "VND", "actual");
  assert.ok(template.includes("entered,,VND")); assert.throws(() => parseFinanceCsv(template, options), { code: "INVALID_MONEY" });
});

test("formula injection is neutralized for text without altering legitimate numeric negatives", () => {
  for (const value of ["=1+1", "+SUM(A1)", "-cmd", "@SUM(A1)", "  =SUM(A1)", "\t=1", "\r=1", "\n=1", "\uFEFF=1"]) assert.equal(protectCsvText(value), `'${value}`);
  assert.equal(csvCell("-123.45", true), "-123.45");
  assert.equal(csvCell("-123.45"), "'-123.45");
  assert.throws(() => csvCell("=1+1", true));
  assert.equal(serializeCsv([["=1", "-10"], ["plain", "0"]], [1]), "'=1,-10\r\nplain,0\r\n");
  const exported = exportFinanceCsv([row({ amount: -5, note: '=HYPERLINK("bad")', evidenceRef: "@trigger" })], 0);
  assert.ok(exported.includes(",entered,-5,VND,'@trigger,"));
  assert.ok(exported.includes("'=HYPERLINK"));
});
