import { FinanceValidationError, type FinanceCashObservation, type FinanceFact } from "./model";
import { parseMoney } from "./calculations";
import type { FinanceCommand, FinanceSelection, FinanceSourceContext, FinanceState } from "./store-types";
import { financePrivate } from "./access";

export const FINANCE_PAGE_KEYS = ["overview", "plans", "actuals", "pnl", "cash-flow", "revenue", "costs", "working-capital", "position", "settings", "audit"] as const;
export const FINANCE_BODY_LIMIT = 1024 * 1024;
const failure = (code: string, status = 422): never => { throw new FinanceValidationError(code, code, status); };
export type FinanceFields = Record<string, string>;

/** Count streamed bytes as well as the untrusted Content-Length header. */
export async function readFinanceText(request: Request, limit = FINANCE_BODY_LIMIT): Promise<string> {
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) failure("request_too_large", 413);
  const reader = request.body?.getReader();
  if (!reader) return failure("empty_request", 400);
  const parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) { await reader.cancel(); failure("request_too_large", 413); }
      parts.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof FinanceValidationError) throw error;
    return failure("invalid_body", 400);
  }
}

export async function readFinanceForm(request: Request): Promise<FinanceFields> {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") failure("unsupported_body", 415);
  const params = new URLSearchParams(await readFinanceText(request));
  const fields: FinanceFields = Object.create(null);
  for (const [name, value] of params) {
    if (name.length > 200 || Object.hasOwn(fields, name)) failure("duplicate_or_invalid_field", 400);
    fields[name] = value;
  }
  if (Object.keys(fields).length > 2000) failure("too_many_fields", 413);
  return fields;
}

export function financeText(fields: FinanceFields, name: string, limit = 500, required = false): string {
  const value = (fields[name] ?? "").trim();
  if (value.length > limit || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value) || required && !value) failure(`invalid_${name.replace(/[^a-z_]/gi, "")}`);
  return value;
}
export function financeInteger(value: string | undefined, fallback?: number): number {
  if ((value === undefined || value === "") && fallback !== undefined) return fallback;
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return failure("invalid_integer");
  return Number(value);
}
const checked = (value: string | undefined) => value === "true" || value === "1" || value === "on";
const code = (value: string) => /^[a-z][a-z0-9_.-]{0,63}$/.test(value) ? value : failure("invalid_code");
const simpleCode = (value: string) => /^[a-z][a-z0-9_-]{0,63}$/.test(value) ? value : failure("invalid_code");

export function financeReturnTo(value: string | undefined, requestUrl: URL): string {
  if (!value) return requestUrl.pathname.startsWith("/vi/") ? "/vi/finance" : "/finance";
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20]/.test(value)) failure("invalid_return", 400);
  const url = new URL(value, requestUrl);
  const path = url.pathname.replace(/^\/vi(?=\/)/, "").replace(/\/$/, "");
  const tail = path === "/finance" ? "overview" : path.startsWith("/finance/") ? path.slice(9) : "";
  if (url.origin !== requestUrl.origin || !FINANCE_PAGE_KEYS.includes(tail as typeof FINANCE_PAGE_KEYS[number])) failure("invalid_return", 400);
  return url.pathname + url.search;
}

export function financeSelection(url: URL): FinanceSelection {
  const get = (name: string) => url.searchParams.get(name) || undefined;
  const year = get("year");
  if (year && (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > 2200)) failure("invalid_year");
  const period = get("period");
  if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) failure("invalid_period");
  for (const field of ["plan", "revision"]) if (get(field) && !/^[A-Za-z0-9_-]{1,100}$/.test(get(field)!)) failure("invalid_id");
  const auditBefore = get("before");
  if (auditBefore && (auditBefore.length > 100 || /[\x00-\x20]/.test(auditBefore))) failure("invalid_cursor");
  const range = get("range");
  if (range && !["month", "quarter", "ytd", "year"].includes(range)) failure("invalid_range");
  const auditAction = get("action"), auditActor = get("actor");
  if (auditAction && !/^[a-z][a-z0-9_.-]{0,79}$/.test(auditAction)) failure("invalid_audit_action");
  if (auditActor && !/^[A-Za-z0-9_-]{1,100}$/.test(auditActor)) failure("invalid_audit_actor");
  return { fiscalYear: year ? Number(year) : undefined, period, planId: get("plan"), actualRevisionId: get("revision"), auditBefore, range: range as FinanceSelection["range"], auditAction, auditActor };
}

function allowedFields(fields: FinanceFields, names: string[], prefixes: string[] = []): void {
  const common = new Set(["intent", "request_key", "return_to", ...names]);
  for (const name of Object.keys(fields)) if (!common.has(name) && !prefixes.some(prefix => name.startsWith(prefix))) failure("unexpected_field");
}

function parseFacts(fields: FinanceFields, precision: number): FinanceFact[] {
  const cells = new Map<string, Record<string, string>>();
  for (const [key, value] of Object.entries(fields)) {
    if (!key.startsWith("value.")) continue;
    const parts = key.split("."); const field = parts.pop()!, segmentCode = parts.pop()!, lineCode = parts.slice(1).join(".");
    if (!["amount", "state", "note", "evidence"].includes(field)) failure("unexpected_fact_field");
    code(lineCode); simpleCode(segmentCode);
    const cellKey = lineCode + "/" + segmentCode;
    const cell = cells.get(cellKey) ?? { lineCode, segmentCode };
    cell[field] = value; cells.set(cellKey, cell);
  }
  if (cells.size > 200) failure("too_many_facts", 413);
  return [...cells.values()].map(cell => {
    const raw = (cell.amount ?? "").trim();
    const state = cell.state || (raw ? "entered" : "missing");
    if (!["entered", "missing", "not_applicable"].includes(state)) failure("invalid_value_state");
    if (state === "not_applicable" && raw) failure("amount_state_mismatch");
    return { lineCode: cell.lineCode, segmentCode: cell.segmentCode,
      state: state === "entered" && !raw ? "missing" : state as FinanceFact["state"],
      amount: state === "entered" && raw ? parseMoney(raw, precision) : null,
      note: financeText(cell, "note", 1000), evidenceRef: financeText(cell, "evidence", 300) };
  });
}

function parseObservations(fields: FinanceFields, precision: number): FinanceCashObservation[] {
  const rows = new Map<string, Record<string, string>>();
  for (const [key, value] of Object.entries(fields)) {
    if (!key.startsWith("balance.")) continue;
    const parts = key.split("."); const field = parts.pop()!, kind = parts.pop()!, accountCode = parts.slice(1).join(".");
    if (!["opening", "closing"].includes(kind) || !["amount", "restricted", "classification", "evidence", "as_of"].includes(field)) failure("unexpected_balance_field");
    simpleCode(accountCode);
    const rowKey = accountCode + "/" + kind, row = rows.get(rowKey) ?? { accountCode, kind };
    row[field] = value; rows.set(rowKey, row);
  }
  if (rows.size > 40) failure("too_many_observations", 413);
  return [...rows.values()].map(row => {
    const raw = financeText(row, "amount", 32), restricted = financeText(row, "restricted", 32);
    const classification = row.classification || "cash";
    if (classification !== "cash" && classification !== "borrowing") failure("invalid_cash_classification");
    return { accountCode: row.accountCode, kind: row.kind as "opening" | "closing", amount: raw ? parseMoney(raw, precision) : null,
      restrictedAmount: restricted ? parseMoney(restricted, precision) : null, classification: classification as "cash" | "borrowing",
      evidenceRef: financeText(row, "evidence", 300), asOfDate: financeText(row, "as_of", 10) };
  });
}

function parseSources(fields: FinanceFields): FinanceSourceContext {
  const blocks: FinanceSourceContext["blocks"] = {};
  for (const block of ["pnl", "cash", "aging", "position"] as const) {
    const evidenceRef = financeText(fields, `source.${block}.evidence`, 300), note = financeText(fields, `source.${block}.note`, 1000);
    if (evidenceRef || note) blocks[block] = { evidenceRef, note };
  }
  return { sourceAsOf: financeText(fields, "source_as_of", 10), scope: financeText(fields, "source_scope", 500), blocks };
}

export function financeSpread(fields: FinanceFields, precision: number) {
  const weightsText = financeText(fields, "spread_weights", 300);
  const weights = weightsText ? weightsText.split(",").map(value => value.trim()) : Array<string>(12).fill("1");
  if (weights.length !== 12 || weights.some(value => !/^(0|[1-9]\d{0,17})(\.\d{1,18})?$/.test(value)) || !weights.some(value => /[1-9]/.test(value))) failure("invalid_weights");
  return { lineCode: code(financeText(fields, "spread_line", 64, true)), segmentCode: simpleCode(financeText(fields, "spread_segment", 64) || "unallocated"),
    annualAmount: parseMoney(financeText(fields, "spread_amount", 32, true), precision), weights,
    note: financeText(fields, "spread_note", 1000), evidenceRef: financeText(fields, "spread_evidence", 300) };
}

export function financeFormCommand(fields: FinanceFields, state: FinanceState): FinanceCommand {
  const action = financeText(fields, "intent", 40, true), precision = state.book?.precision ?? financeInteger(fields.precision, 0);
  const version = () => financeInteger(fields.expected_version);
  const periodVersion = () => financeInteger(fields.expected_period_version);
  const id = (name: string) => financeText(fields, name, 100, true);
  const year = () => financeInteger(fields.fiscal_year, state.selectedFiscalYear);
  switch (action) {
    case "book.save": {
      allowedFields(fields, ["expected_version", "legal_entity", "currency", "precision", "fiscal_start_month", "timezone", "first_period", "cash_floor", "variance_amount_threshold", "variance_percent_threshold", "policy_note", "enabled"]);
      const scale = financeInteger(fields.precision, 0), floor = financeText(fields, "cash_floor", 32);
      const threshold = financeText(fields, "variance_amount_threshold", 32), percentage = financeText(fields, "variance_percent_threshold", 12);
      return { action, expected_version: version(), legal_entity: financeText(fields, "legal_entity", 200, true), currency: financeText(fields, "currency", 3, true), precision: scale,
        fiscal_start_month: financeInteger(fields.fiscal_start_month), timezone: financeText(fields, "timezone", 80, true), first_period: financeText(fields, "first_period", 7, true),
        cash_floor: floor ? parseMoney(floor, scale) : null, policy_note: financeText(fields, "policy_note", 4000, true), enabled: checked(fields.enabled),
        ...(fields.variance_amount_threshold !== undefined ? { variance_amount_threshold: threshold ? parseMoney(threshold, scale) : null } : {}),
        ...(fields.variance_percent_threshold !== undefined ? { variance_percent_threshold_bps: percentage ? parseMoney(percentage, 2) : null } : {}) };
    }
    case "account.save":
      allowedFields(fields, ["expected_version", "account_code", "label", "active_from", "active_to"]);
      return { action, expected_version: version(), account_code: simpleCode(id("account_code")), label: financeText(fields, "label", 100, true), active_from: financeText(fields, "active_from", 7, true), active_to: financeText(fields, "active_to", 7) || null };
    case "definition.save": {
      allowedFields(fields, ["fiscal_year", "expected_version", "new_segment_code", "new_segment_name_en", "new_segment_name_vi", "new_segment_active_from", "new_segment_active_to", "coordinate_line", "coordinate_segments", "coordinate_from", "coordinate_to"], ["line.", "segment."]);
      const definition = state.definitions.find(item => item.fiscalYear === year());
      const lines = structuredClone(definition?.lines ?? state.lines), segments = structuredClone(definition?.segments ?? state.segments);
      for (const name of Object.keys(fields)) {
        if (name.startsWith("line.")) {
          const parts = name.split("."), field = parts.pop(), lineCode = parts.slice(1).join(".");
          if (!lines.some(line => line.code === lineCode) || !["label_en", "label_vi", "required", "allow_na", "cost_behavior"].includes(field!)) failure("unexpected_line_field");
        }
        if (name.startsWith("segment.")) {
          const parts = name.split("."), field = parts.pop(), segmentCode = parts.slice(1).join(".");
          if (!segments.some(segment => segment.code === segmentCode) || !["label_en", "label_vi", "active_from", "active_to"].includes(field!)) failure("unexpected_segment_field");
        }
      }
      for (const line of lines) {
        const prefix = `line.${line.code}.`;
        if (fields[prefix + "label_en"] !== undefined) line.labelEn = financeText(fields, prefix + "label_en", 120, true);
        if (fields[prefix + "label_vi"] !== undefined) line.labelVi = financeText(fields, prefix + "label_vi", 120, true);
        if (fields[prefix + "required"] !== undefined) line.required = checked(fields[prefix + "required"]);
        if (fields[prefix + "allow_na"] !== undefined) line.allowNa = checked(fields[prefix + "allow_na"]);
        if (fields[prefix + "cost_behavior"] !== undefined) {
          const behavior = financeText(fields, prefix + "cost_behavior", 20);
          if (!(["fixed", "variable", "mixed", "unspecified"] as string[]).includes(behavior) || line.basis !== "pnl" || !["direct_cost", "operating_expense", "finance_cost", "income_tax"].includes(line.group)) failure("invalid_cost_behavior");
          line.costBehavior = behavior as NonNullable<typeof line.costBehavior>;
        }
        if (line.basis !== "pnl" && (fields[prefix + "required"] !== undefined || fields[prefix + "allow_na"] !== undefined)) failure("core_control_is_required");
      }
      for (const segment of segments) {
        const prefix = `segment.${segment.code}.`;
        if (fields[prefix + "label_en"] !== undefined) segment.labelEn = financeText(fields, prefix + "label_en", 100, true);
        if (fields[prefix + "label_vi"] !== undefined) segment.labelVi = financeText(fields, prefix + "label_vi", 100, true);
        if (fields[prefix + "active_from"] !== undefined) segment.activeFrom = financeText(fields, prefix + "active_from", 7, true);
        if (fields[prefix + "active_to"] !== undefined) segment.activeTo = financeText(fields, prefix + "active_to", 7) || null;
      }
      const newCode = financeText(fields, "new_segment_code", 64);
      if (newCode) segments.push({ code: simpleCode(newCode), labelEn: financeText(fields, "new_segment_name_en", 100, true), labelVi: financeText(fields, "new_segment_name_vi", 100, true), activeFrom: financeText(fields, "new_segment_active_from", 7) || state.book!.firstPeriod, activeTo: financeText(fields, "new_segment_active_to", 7) || null });
      let expectedInputs = structuredClone(definition?.expectedInputs ?? []);
      expectedInputs = expectedInputs.map(input => {
        const line = lines.find(item => item.code === input.lineCode);
        return line ? { ...input, required: line.required, allowNa: line.allowNa } : input;
      });
      const splitLine = financeText(fields, "coordinate_line", 64);
      if (splitLine) {
        const sourceLine = lines.find(line => line.code === splitLine && line.basis === "pnl" && line.kind === "input");
        if (!sourceLine) failure("invalid_coordinate_line");
        const selected = financeText(fields, "coordinate_segments", 2000, true).split(",").map(value => simpleCode(value.trim()));
        if (new Set(selected).size !== selected.length || selected.some(item => !segments.some(segment => segment.code === item))) failure("invalid_segments");
        const from = financeText(fields, "coordinate_from", 7, true), to = financeText(fields, "coordinate_to", 7, true);
        const periods = [...new Set(expectedInputs.filter(input => input.period >= from && input.period <= to).map(input => input.period))];
        if (!periods.length) failure("invalid_coordinate_period");
        expectedInputs = expectedInputs.filter(input => input.lineCode !== splitLine || !periods.includes(input.period));
        for (const period of periods) for (const segmentCode of selected) expectedInputs.push({ period, lineCode: splitLine, segmentCode, required: sourceLine!.required, allowNa: sourceLine!.allowNa });
      }
      return { action, fiscal_year: year(), expected_version: version(), ...(lines.length ? { lines } : {}), ...(segments.length ? { segments } : {}), ...(expectedInputs.length ? { expected_inputs: expectedInputs } : {}) };
    }
    case "plan.create": {
      allowedFields(fields, ["fiscal_year", "label", "kind", "assumptions", "source_plan_id", "actual_cutoff"]);
      const kind = financeText(fields, "kind", 10, true);
      if (!["budget", "forecast", "scenario"].includes(kind)) failure("invalid_plan_kind");
      return { action, fiscal_year: year(), label: financeText(fields, "label", 160, true), kind: kind as "budget" | "forecast" | "scenario", assumptions: financeText(fields, "assumptions", 4000), source_plan_id: financeText(fields, "source_plan_id", 100) || undefined, actual_cutoff: financeText(fields, "actual_cutoff", 7) || undefined };
    }
    case "plan.save": {
      allowedFields(fields, ["plan_id", "expected_version", "period", "label", "assumptions", "copy_from_period", "spread_line", "spread_segment", "spread_amount", "spread_weights", "spread_note", "spread_evidence"], ["value."]);
      const values = parseFacts(fields, precision);
      return { action, plan_id: id("plan_id"), expected_version: version(), period: financeText(fields, "period", 7) || undefined,
        ...(values.length ? { values } : {}), ...(fields.label !== undefined ? { label: financeText(fields, "label", 160, true) } : {}), ...(fields.assumptions !== undefined ? { assumptions: financeText(fields, "assumptions", 4000) } : {}),
        copy_from_period: financeText(fields, "copy_from_period", 7) || undefined, ...(fields.spread_amount ? { spread: financeSpread(fields, precision) } : {}) };
    }
    case "plan.publish":
      allowedFields(fields, ["plan_id", "expected_version", "baseline"]);
      return { action, plan_id: id("plan_id"), expected_version: version(), baseline: checked(fields.baseline) };
    case "actual.open":
      allowedFields(fields, ["period", "expected_period_version"]);
      return { action, period: financeText(fields, "period", 7, true), expected_period_version: periodVersion() };
    case "actual.save":
      allowedFields(fields, ["actual_revision_id", "expected_version", "expected_period_version", "source_as_of", "source_scope"], ["value.", "balance.", "source."]);
      return { action, actual_revision_id: id("actual_revision_id"), expected_version: version(), expected_period_version: periodVersion(), values: parseFacts(fields, precision), observations: parseObservations(fields, precision), sources: parseSources(fields) };
    case "actual.close":
      allowedFields(fields, ["actual_revision_id", "expected_version", "expected_period_version"]);
      return { action, actual_revision_id: id("actual_revision_id"), expected_version: version(), expected_period_version: periodVersion() };
    case "actual.reopen":
      allowedFields(fields, ["period", "expected_period_version", "reason"]);
      return { action, period: financeText(fields, "period", 7, true), expected_period_version: periodVersion(), reason: financeText(fields, "reason", 1000, true) };
    case "import.preview": {
      allowedFields(fields, ["kind", "plan_id", "fiscal_year", "csv", "source_as_of", "source_scope"], ["source.", "expected."]);
      const kind = fields.kind;
      if (kind !== "plan" && kind !== "actual") failure("invalid_import_kind");
      const expected_versions: Extract<FinanceCommand, { action: "import.preview" }>["expected_versions"] = {};
      for (const [field, value] of Object.entries(fields)) {
        const match = /^expected\.(\d{4}-\d{2})\.(version|period_version|actual_revision_id)$/.exec(field);
        if (!match) continue;
        const target = expected_versions[match[1]] ?? { version: -1 };
        if (match[2] === "actual_revision_id") target.actual_revision_id = value;
        else target[match[2] as "version" | "period_version"] = financeInteger(value);
        expected_versions[match[1]] = target;
      }
      const sources: Record<string, FinanceSourceContext> = {};
      for (const period of Object.keys(expected_versions)) sources[period] = parseSources(fields);
      return { action, kind: kind as "plan" | "actual", plan_id: financeText(fields, "plan_id", 100) || undefined, fiscal_year: year(), csv: fields.csv ?? "", expected_versions, sources };
    }
    case "import.commit":
      allowedFields(fields, ["import_id", "expected_version", "period"]);
      return { action, import_id: id("import_id"), expected_version: version(), period: financeText(fields, "period", 7, true) };
    case "import.discard":
      allowedFields(fields, ["import_id", "expected_version"]);
      return { action, import_id: id("import_id"), expected_version: version() };
    case "annotation.add":
      allowedFields(fields, ["baseline_id", "actual_revision_id", "period", "line_code", "segment_code", "cause", "next_action", "review"]);
      return { action, baseline_id: financeText(fields, "baseline_id", 100) || undefined, actual_revision_id: financeText(fields, "actual_revision_id", 100) || undefined, period: financeText(fields, "period", 7, true), line_code: financeText(fields, "line_code", 64) || undefined, segment_code: financeText(fields, "segment_code", 64) || undefined, cause: financeText(fields, "cause", 2000, true), next_action: financeText(fields, "next_action", 2000), review: financeText(fields, "review", 2000) };
    default: return failure("unknown_action", 400);
  }
}

const commandKeys: Record<FinanceCommand["action"], string[]> = {
  "book.save": ["expected_version", "legal_entity", "currency", "precision", "fiscal_start_month", "timezone", "first_period", "cash_floor", "policy_note", "enabled", "variance_amount_threshold", "variance_percent_threshold_bps"],
  "definition.save": ["fiscal_year", "expected_version", "lines", "segments", "expected_inputs"],
  "account.save": ["account_code", "expected_version", "label", "active_from", "active_to"],
  "plan.create": ["fiscal_year", "label", "kind", "assumptions", "source_plan_id", "actual_cutoff"],
  "plan.save": ["plan_id", "expected_version", "period", "values", "label", "assumptions", "copy_from_period", "spread"],
  "plan.publish": ["plan_id", "expected_version", "baseline"],
  "actual.open": ["period", "expected_period_version"],
  "actual.save": ["actual_revision_id", "expected_version", "expected_period_version", "values", "observations", "sources"],
  "actual.close": ["actual_revision_id", "expected_version", "expected_period_version"],
  "actual.reopen": ["period", "expected_period_version", "reason"],
  "import.preview": ["kind", "plan_id", "fiscal_year", "csv", "expected_versions", "sources"],
  "import.commit": ["import_id", "expected_version", "period"],
  "import.discard": ["import_id", "expected_version"],
  "annotation.add": ["baseline_id", "actual_revision_id", "period", "line_code", "segment_code", "cause", "next_action", "review"],
  "report.export": ["selection", "report", "segment_code"],
};

/** Money at JSON boundaries is an exact integer-minor-unit string, never a floating number. */
export function financeJsonCommand(value: unknown): FinanceCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) failure("invalid_command", 400);
  const record = value as Record<string, unknown>, action = String(record.action ?? "") as FinanceCommand["action"];
  if (!Object.hasOwn(commandKeys, action)) failure("unknown_action", 400);
  for (const key of Object.keys(record)) if (key !== "action" && !commandKeys[action].includes(key)) failure("unexpected_field");
  const moneyKeys = new Set(["amount", "restrictedAmount", "annualAmount", "cash_floor", "variance_amount_threshold"]);
  const normalize = (input: unknown, name = "", depth = 0): unknown => {
    if (depth > 12) failure("invalid_command_depth");
    if (moneyKeys.has(name)) {
      if (input === null) return null;
      if (typeof input !== "string" || !/^-?(0|[1-9]\d{0,15})$/.test(input)) failure("money_must_be_integer_string", 400);
      const amount = Number(input);
      if (!Number.isSafeInteger(amount)) failure("money_out_of_range");
      return amount;
    }
    if (Array.isArray(input)) {
      if (input.length > 2400) failure("too_many_items", 413);
      return input.map(item => normalize(item, "", depth + 1));
    }
    if (input && typeof input === "object") {
      const result: Record<string, unknown> = Object.create(null);
      for (const [key, item] of Object.entries(input)) {
        if (["__proto__", "constructor", "prototype"].includes(key)) failure("unexpected_field");
        result[key] = normalize(item, key, depth + 1);
      }
      return result;
    }
    return input;
  };
  const normalized = normalize(record) as Record<string, unknown>;
  validateJsonShape(normalized, action);
  return normalized as unknown as FinanceCommand;
}

/** Reject malformed nested commands before a store function can interpret omitted fields as edits. */
function validateJsonShape(command: Record<string, unknown>, action: FinanceCommand["action"]): void {
  const bad = (): never => failure("invalid_command_shape", 400);
  const object = (value: unknown, allowed: string[], required: string[] = []): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return bad();
    const row = value as Record<string, unknown>;
    if (Object.keys(row).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(row, key))) return bad();
    return row;
  };
  const text = (value: unknown, max = 2000, required = false) => { if (typeof value !== "string" || value.length > max || required && !value.trim()) bad(); };
  const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) bad(); };
  const bool = (value: unknown) => { if (typeof value !== "boolean") bad(); };
  const enumeration = (value: unknown, values: readonly unknown[]) => { if (!values.includes(value)) bad(); };
  const money = (value: unknown, nullable = false) => { if (value === null && nullable) return; integer(value, -Number.MAX_SAFE_INTEGER); };
  const id = (value: unknown) => { if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) bad(); };
  const month = (value: unknown) => { if (typeof value !== "string" || !/^(19|20|21|22)\d{2}-(0[1-9]|1[0-2])$/.test(value)) bad(); };
  const array = (value: unknown, max: number, validate: (item: unknown) => void) => {
    if (!Array.isArray(value) || value.length > max) return bad();
    value.forEach(validate);
  };
  const source = (value: unknown) => {
    const row = object(value, ["sourceAsOf", "scope", "blocks"], ["sourceAsOf", "scope", "blocks"]);
    text(row.sourceAsOf, 10); text(row.scope, 2000);
    const blocks = object(row.blocks, ["pnl", "cash", "aging", "position"]);
    for (const block of Object.values(blocks)) { const item = object(block, ["evidenceRef", "note"], ["evidenceRef"]); text(item.evidenceRef, 1000); if (item.note !== undefined) text(item.note, 2000); }
  };
  const fact = (value: unknown) => {
    const names = ["lineCode", "segmentCode", "state", "amount", "note", "evidenceRef"];
    const row = object(value, names, names);
    if (typeof row.lineCode !== "string" || typeof row.segmentCode !== "string") return bad();
    code(row.lineCode); simpleCode(row.segmentCode);
    enumeration(row.state, ["entered", "missing", "not_applicable"]); money(row.amount, true); text(row.note); text(row.evidenceRef, 1000);
    if ((row.state === "entered") !== (row.amount !== null)) bad();
  };
  const observation = (value: unknown) => {
    const names = ["accountCode", "kind", "amount", "restrictedAmount", "classification", "evidenceRef", "asOfDate"];
    const row = object(value, names, names);
    if (typeof row.accountCode !== "string") return bad(); simpleCode(row.accountCode);
    enumeration(row.kind, ["opening", "closing"]); enumeration(row.classification, ["cash", "borrowing"]);
    money(row.amount, true); money(row.restrictedAmount, true); text(row.evidenceRef, 1000); text(row.asOfDate, 10);
  };
  const line = (value: unknown) => {
    const required = ["code", "basis", "group", "labelEn", "labelVi", "kind", "sign", "required", "allowNa", "aggregation"];
    const row = object(value, [...required, "requireNote", "nonnegative", "costBehavior"], required);
    if (typeof row.code !== "string") return bad(); code(row.code);
    enumeration(row.basis, ["pnl", "cash", "position", "aging", "control"]); enumeration(row.kind, ["input", "derived"]);
    enumeration(row.sign, [-1, 1]); enumeration(row.aggregation, ["flow", "stock"]);
    text(row.group, 80, true); text(row.labelEn, 200, true); text(row.labelVi, 200, true); bool(row.required); bool(row.allowNa);
    if (row.requireNote !== undefined) bool(row.requireNote); if (row.nonnegative !== undefined) bool(row.nonnegative);
    if (row.costBehavior !== undefined) enumeration(row.costBehavior, ["fixed", "variable", "mixed", "unspecified"]);
  };
  const segment = (value: unknown) => {
    const names = ["code", "labelEn", "labelVi", "activeFrom", "activeTo"], row = object(value, names, names);
    if (typeof row.code !== "string") return bad(); simpleCode(row.code);
    text(row.labelEn, 200, true); text(row.labelVi, 200, true); month(row.activeFrom); if (row.activeTo !== null) month(row.activeTo);
  };
  const expectedInput = (value: unknown) => {
    const names = ["period", "lineCode", "segmentCode", "required", "allowNa"], row = object(value, [...names, "kinds"], names);
    month(row.period); if (typeof row.lineCode !== "string" || typeof row.segmentCode !== "string") return bad(); code(row.lineCode); simpleCode(row.segmentCode);
    bool(row.required); bool(row.allowNa);
    if (row.kinds !== undefined) { array(row.kinds, 4, kind => enumeration(kind, ["actual", "budget", "forecast", "scenario"])); if (!(row.kinds as unknown[]).length) bad(); }
  };
  const required: Record<FinanceCommand["action"], string[]> = {
    "book.save": commandKeys["book.save"].filter(key => !key.startsWith("variance_")), "definition.save": ["fiscal_year", "expected_version"],
    "account.save": ["account_code", "expected_version", "label", "active_from"],
    "plan.create": ["fiscal_year", "label", "kind"], "plan.save": ["plan_id", "expected_version"],
    "plan.publish": ["plan_id", "expected_version"], "actual.open": ["period", "expected_period_version"],
    "actual.save": ["actual_revision_id", "expected_version", "expected_period_version"],
    "actual.close": ["actual_revision_id", "expected_version", "expected_period_version"],
    "actual.reopen": ["period", "expected_period_version", "reason"],
    "import.preview": ["kind", "fiscal_year", "csv", "expected_versions", "sources"],
    "import.commit": ["import_id", "expected_version", "period"], "import.discard": ["import_id", "expected_version"],
    "annotation.add": ["period", "cause", "next_action", "review"], "report.export": ["selection", "report"],
  };
  object(command, ["action", ...commandKeys[action]], ["action", ...required[action]]);
  for (const field of ["expected_version", "expected_period_version"]) if (command[field] !== undefined) integer(command[field]);
  if (command.fiscal_year !== undefined) integer(command.fiscal_year, 1900, 2200);
  for (const field of ["plan_id", "actual_revision_id", "source_plan_id", "baseline_id", "import_id"]) if (command[field] !== undefined) id(command[field]);
  for (const field of ["period", "actual_cutoff", "copy_from_period", "first_period", "active_from"]) if (command[field] !== undefined) month(command[field]);
  if (command.active_to !== undefined && command.active_to !== null) month(command.active_to);
  if (command.values !== undefined) array(command.values, 200, fact);
  if (command.observations !== undefined) array(command.observations, 40, observation);
  switch (action) {
    case "book.save":
      text(command.legal_entity, 200, true); text(command.currency, 3, true); integer(command.precision, 0, 6); integer(command.fiscal_start_month, 1, 12); text(command.timezone, 80, true);
      money(command.cash_floor, true); text(command.policy_note, 5000); bool(command.enabled);
      if (command.variance_amount_threshold !== undefined) { money(command.variance_amount_threshold, true); if (typeof command.variance_amount_threshold === "number" && command.variance_amount_threshold < 0) bad(); }
      if (command.variance_percent_threshold_bps !== undefined && command.variance_percent_threshold_bps !== null) integer(command.variance_percent_threshold_bps, 0, 10000);
      break;
    case "definition.save":
      if (command.lines !== undefined) array(command.lines, 200, line); if (command.segments !== undefined) array(command.segments, 100, segment); if (command.expected_inputs !== undefined) array(command.expected_inputs, 2400, expectedInput); break;
    case "account.save": if (typeof command.account_code !== "string") return bad(); simpleCode(command.account_code); text(command.label, 200, true); break;
    case "plan.create":
      enumeration(command.kind, ["budget", "forecast", "scenario"]); text(command.label, 200, true); if (command.assumptions !== undefined) text(command.assumptions, 5000);
      if (command.kind === "forecast" && command.actual_cutoff === undefined) bad(); break;
    case "plan.save": {
      if (!["values", "copy_from_period", "spread", "label", "assumptions"].some(field => Object.hasOwn(command, field))) bad();
      if ((command.values !== undefined || command.copy_from_period !== undefined) && command.period === undefined) bad();
      if (command.label !== undefined) text(command.label, 200, true); if (command.assumptions !== undefined) text(command.assumptions, 5000);
      if (command.spread !== undefined) {
        const names = ["lineCode", "segmentCode", "annualAmount", "note", "evidenceRef"], row = object(command.spread, [...names, "weights"], names);
        if (typeof row.lineCode !== "string" || typeof row.segmentCode !== "string") return bad(); code(row.lineCode); simpleCode(row.segmentCode); money(row.annualAmount); text(row.note); text(row.evidenceRef, 1000);
        if (row.weights !== undefined) {
          array(row.weights, 12, item => {
            if (typeof item === "number") { if (!Number.isFinite(item) || item < 0) bad(); }
            else if (typeof item !== "string") bad();
            if (!/^(0|[1-9]\d{0,17})(\.\d{1,18})?$/.test(String(item))) bad();
          });
          if ((row.weights as unknown[]).length !== 12) bad();
        }
      }
      break;
    }
    case "plan.publish": if (command.baseline !== undefined) bool(command.baseline); break;
    case "actual.save":
      if (!["values", "observations", "sources"].some(field => Object.hasOwn(command, field))) bad(); if (command.sources !== undefined) source(command.sources); break;
    case "actual.reopen": text(command.reason, 2000, true); break;
    case "import.preview": {
      enumeration(command.kind, ["plan", "actual"]); if (command.kind === "plan" && command.plan_id === undefined) bad(); if (command.kind === "actual" && command.plan_id !== undefined) bad(); text(command.csv, 256 * 1024, true);
      if (!command.expected_versions || typeof command.expected_versions !== "object" || Array.isArray(command.expected_versions) || Object.keys(command.expected_versions).length > 12) bad();
      for (const [period, value] of Object.entries(command.expected_versions as Record<string, unknown>)) {
        month(period); const row = object(value, ["version", "period_version", "actual_revision_id"], command.kind === "actual" ? ["version", "period_version"] : ["version"]);
        integer(row.version); if (row.period_version !== undefined) integer(row.period_version); if (row.actual_revision_id !== undefined) id(row.actual_revision_id);
      }
      if (!command.sources || typeof command.sources !== "object" || Array.isArray(command.sources) || Object.keys(command.sources).length > 12) bad();
      for (const [period, value] of Object.entries(command.sources as Record<string, unknown>)) { month(period); source(value); }
      break;
    }
    case "annotation.add":
      if (!command.baseline_id && !command.actual_revision_id) bad();
      if (command.line_code !== undefined) { if (typeof command.line_code !== "string") return bad(); code(command.line_code); }
      if (command.segment_code !== undefined) { if (typeof command.segment_code !== "string") return bad(); simpleCode(command.segment_code); }
      text(command.cause, 2000, true); text(command.next_action); text(command.review); break;
    case "report.export": {
      const row = object(command.selection, ["fiscalYear", "period", "planId", "actualRevisionId", "range", "includeAudit", "includeImports", "auditBefore", "auditAction", "auditActor"]);
      if (row.fiscalYear !== undefined) integer(row.fiscalYear, 1900, 2200); if (row.period !== undefined) month(row.period); if (row.planId !== undefined) id(row.planId); if (row.actualRevisionId !== undefined) id(row.actualRevisionId);
      if (row.range !== undefined) enumeration(row.range, ["month", "quarter", "ytd", "year"]);
      for (const field of ["includeAudit", "includeImports"]) if (row[field] !== undefined) bool(row[field]);
      for (const field of ["auditBefore", "auditAction", "auditActor"]) if (row[field] !== undefined) text(row[field], 100);
      text(command.report, 80, true); if (command.segment_code !== undefined) { if (typeof command.segment_code !== "string") return bad(); simpleCode(command.segment_code); }
      break;
    }
  }
}

export function financeJson(value: unknown, status = 200): Response {
  const body = JSON.stringify(value, (key, item) => {
    if (typeof item === "number" && ["amount", "restrictedAmount", "cashFloor", "cash_floor", "annualAmount", "varianceAmountThreshold", "variance_amount_threshold"].includes(key)) return String(item);
    if (["metrics", "lineValues"].includes(key) && item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([name, amount]) => [name, typeof amount === "number" ? String(amount) : amount]));
    return item;
  });
  return financePrivate(new Response(body, { status, headers: { "Content-Type": "application/json; charset=utf-8" } }));
}
