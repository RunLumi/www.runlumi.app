import { HrmError } from "./fields";

export const TIME_IMPORT_MAX_BYTES = 512 * 1024;
export const TIME_IMPORT_MAX_ROWS = 100;
export const TIME_IMPORT_HEADERS = ["employee_code", "work_date", "shift_key", "check_in_local", "check_out_local", "break_minutes"] as const;
export type AttendanceCsvRow = Record<(typeof TIME_IMPORT_HEADERS)[number], string>;

/** Small RFC 4180 reader with bounded input/rows and no implicit column coercion. */
export function parseAttendanceCsv(bytes: ArrayBuffer): AttendanceCsvRow[] {
  if (bytes.byteLength === 0 || bytes.byteLength > TIME_IMPORT_MAX_BYTES) throw new HrmError("time_import_size", 413);
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new HrmError("time_import_encoding", 422); }
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);
  const records: string[][] = [];
  let row: string[] = [], field = "", quoted = false, afterQuote = false;
  const pushField = () => { row.push(field); field = ""; afterQuote = false; };
  const pushRecord = () => { pushField(); if (row.some(value => value.trim() !== "")) records.push(row); row = []; if (records.length > TIME_IMPORT_MAX_ROWS + 1) throw new HrmError("time_import_rows", 422); };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; afterQuote = true; }
      else field += char;
    } else if (char === ",") pushField();
    else if (char === "\r" || char === "\n") { if (char === "\r" && source[i + 1] === "\n") i++; pushRecord(); }
    else if (char === '"') { if (field !== "" || afterQuote) throw new HrmError("time_import_csv", 422); quoted = true; }
    else { if (afterQuote) throw new HrmError("time_import_csv", 422); field += char; }
    if (field.length > 1000) throw new HrmError("time_import_cell_size", 422);
  }
  if (quoted) throw new HrmError("time_import_csv", 422);
  if (field !== "" || row.length) pushRecord();
  if (records.length < 2) throw new HrmError("time_import_empty", 422);
  const header = records.shift()!.map(value => value.trim());
  if (header.length !== TIME_IMPORT_HEADERS.length || header.some((value, index) => value !== TIME_IMPORT_HEADERS[index])) throw new HrmError("time_import_headers", 422);
  if (records.length > TIME_IMPORT_MAX_ROWS) throw new HrmError("time_import_rows", 422);
  return records.map(values => {
    if (values.length !== TIME_IMPORT_HEADERS.length) throw new HrmError("time_import_columns", 422);
    return Object.fromEntries(TIME_IMPORT_HEADERS.map((key, index) => [key, values[index].trim()])) as AttendanceCsvRow;
  });
}
