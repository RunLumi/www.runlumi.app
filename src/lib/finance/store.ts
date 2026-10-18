import type { Permission, WorkspaceUser } from "../workspace/roles";
import { DEFAULT_FINANCE_LINES, FINANCE_CALCULATION_VERSION, type FinanceCalculationContext, type FinanceCashObservation, type FinanceExpectedInput, type FinanceFact, type FinanceLine, type FinanceSnapshot, type FinanceVersionKind } from "./model";
import { allocateAnnual, defaultExpectedInputs, fiscalPeriods, validateFinanceSnapshot } from "./calculations";
import { parseFinanceCsv } from "./csv";
import { financeReportView } from "./reports";
import type { FinanceAccount, FinanceActualRevision, FinanceAuditEvent, FinanceBookState, FinanceCommand, FinanceDefinitionSet, FinanceFrozenContext, FinanceImportBatch, FinanceImportMonth, FinanceObservation, FinancePeriod, FinancePlan, FinancePlanValue, FinanceReceipt, FinanceSegment, FinanceSelection, FinanceSourceContext, FinanceState } from "./store-types";
import { revisionSnapshot } from "./store-types";
export * from "./store-types";

type Row = Record<string, string | number | null>;
type Bind = string | number | null;
const MAX_FACTS = 200;
const MAX_ACCOUNTS = 20;
const MAX_MONTH_BYTES = 512 * 1024;
const EMPTY_SOURCES: FinanceSourceContext = { sourceAsOf: "", scope: "", blocks: {} };
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
const timestamp = () => new Date().toISOString();
const encode = (value: unknown) => JSON.stringify(value);
const decode = <T>(value: unknown, fallback: T): T => typeof value === "string" ? JSON.parse(value) as T : fallback;
const string = (value: unknown) => typeof value === "string" ? value : "";
const integer = (value: unknown) => { if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new FinanceError("invalid_integer", 400); return value; };
const amount = (value: unknown) => value === null ? null : integer(value);

export class FinanceError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(code: string, status = 400, details?: unknown) {
    super(code); this.name = "FinanceError"; this.code = code; this.status = status; this.details = details;
  }
}

function authorize(user: WorkspaceUser, permission: Permission = "finance.access"): void {
  if (!user?.admin || !user.can("finance.access") || !user.can(permission)) throw new FinanceError("forbidden", 403);
}
function ready(user: WorkspaceUser, book: FinanceBookState | null): asserts book is FinanceBookState {
  if (user.financeDeploymentEnabled !== true || !book?.enabled || !book.policyNote || !book.entityName) throw new FinanceError("finance_not_ready", 503);
}
function bookFrom(row: Row | undefined): FinanceBookState | null {
  return row ? { id: string(row.id), entityName: string(row.entity_name), currency: string(row.currency), precision: Number(row.precision), fiscalStartMonth: Number(row.fiscal_start_month), timezone: string(row.timezone), firstPeriod: string(row.first_period), cashFloor: amount(row.cash_floor), varianceAmountThreshold: amount(row.variance_amount_threshold), variancePercentThresholdBps: amount(row.variance_percent_threshold_bps), version: Number(row.version), enabled: row.enabled === 1, policyNote: string(row.policy_note), createdAt: string(row.created_at), updatedAt: string(row.updated_at) } : null;
}
async function getBook(db: D1Database): Promise<FinanceBookState | null> { return bookFrom(await db.prepare("SELECT * FROM finance_books WHERE id='main'").first<Row>() ?? undefined); }
export async function getFinanceReadiness(db: D1Database): Promise<{ configured: boolean; enabled: boolean; version: number; bookId: string | null }> {
  const book = await getBook(db);
  return { configured: !!book, enabled: !!book?.enabled && !!book.policyNote && !!book.entityName, version: book?.version ?? 0, bookId: book?.id ?? null };
}

function textField(value: unknown, name: string, max = 2000, required = false): string {
  if (typeof value !== "string") throw new FinanceError(`invalid_${name}`);
  const result = value.trim();
  if (result.length > max || (required && !result) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) throw new FinanceError(`invalid_${name}`);
  return result;
}
function code(value: unknown, name = "code"): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_.-]{0,63}$/.test(value)) throw new FinanceError(`invalid_${name}`);
  return value;
}
function simpleCode(value: unknown, name: string): string { const result = code(value, name); if (!/^[a-z][a-z0-9_-]{0,63}$/.test(result)) throw new FinanceError(`invalid_${name}`); return result; }
function period(value: unknown): string {
  if (typeof value !== "string" || !/^(19|20|21|22)\d{2}-(0[1-9]|1[0-2])$/.test(value)) throw new FinanceError("invalid_period");
  return value;
}
function fiscalYear(value: unknown): number { const year = integer(value); if (year < 1900 || year > 2200) throw new FinanceError("invalid_fiscal_year"); return year; }
function yearFor(value: string, start: number): number { return Number(value.slice(0, 4)) - (Number(value.slice(5)) < start ? 1 : 0); }
function previousPeriod(value: string): string { const date = new Date(`${period(value)}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - 1); return date.toISOString().slice(0, 7); }
function localDate(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return `${parts.find(item => item.type === "year")?.value}-${parts.find(item => item.type === "month")?.value}-${parts.find(item => item.type === "day")?.value}`;
}
function periodEnd(value: string): string { const date = new Date(`${value}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1, 0); return date.toISOString().slice(0, 10); }
function actualPeriod(value: unknown, book: FinanceBookState): string {
  const result = period(value); if (result < book.firstPeriod) throw new FinanceError("before_reporting_cutover");
  if (result > localDate(book.timezone).slice(0, 7)) throw new FinanceError("future_actual_period"); return result;
}
function checkVersion(value: unknown): number { const version = integer(value); if (version < 0) throw new FinanceError("invalid_version"); return version; }
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}
async function digest(value: unknown): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encode(stable(value)))))].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function lineFrom(row: Row): FinanceLine { return { code: string(row.line_code), basis: row.basis as FinanceLine["basis"], group: string(row.line_group), labelEn: string(row.label_en), labelVi: string(row.label_vi), kind: row.kind as FinanceLine["kind"], sign: Number(row.sign) as 1 | -1, required: row.required === 1, allowNa: row.allow_na === 1, requireNote: row.require_note === 1, nonnegative: row.nonnegative === 1, aggregation: row.aggregation as FinanceLine["aggregation"], costBehavior: (row.cost_behavior ?? "unspecified") as FinanceLine["costBehavior"] }; }
function segmentFrom(row: Row): FinanceSegment { return { code: string(row.segment_code), labelEn: string(row.label_en), labelVi: string(row.label_vi), activeFrom: string(row.active_from), activeTo: row.active_to as string | null }; }
function accountFrom(row: Row): FinanceAccount { return { id: string(row.id), code: string(row.account_code), label: string(row.label), activeFrom: string(row.active_from), activeTo: row.active_to as string | null, version: Number(row.version) }; }
function factFrom(row: Row): FinanceFact { return { lineCode: string(row.line_code), segmentCode: string(row.segment_code), state: row.value_state as FinanceFact["state"], amount: amount(row.amount), note: string(row.note), evidenceRef: string(row.evidence_ref) }; }
function periodFrom(row: Row): FinancePeriod { return { period: string(row.period), version: Number(row.version), definitionSetId: string(row.definition_set_id), authoritativeClosedRevisionId: row.authoritative_closed_revision_id as string | null, workingRevisionId: row.working_revision_id as string | null }; }
function revisionFrom(row: Row): FinanceActualRevision { return { id: string(row.id), period: string(row.period), version: Number(row.version), state: row.state as FinanceActualRevision["state"], definitionSetId: string(row.definition_set_id), openingSourceRevisionId: row.opening_source_revision_id as string | null, supersedesRevisionId: row.supersedes_revision_id as string | null, sources: decode(row.sources, EMPTY_SOURCES), reportingSnapshot: decode(row.reporting_snapshot, null), reason: string(row.reason), createdAt: string(row.created_at), closedAt: row.closed_at as string | null, stale: false }; }
function planFrom(row: Row): FinancePlan { return { id: string(row.id), label: string(row.label), fiscalYear: Number(row.fiscal_year), kind: row.kind as FinancePlan["kind"], state: row.state as FinancePlan["state"], version: Number(row.version), definitionSetId: string(row.definition_set_id), baseline: row.is_baseline === 1, assumptions: string(row.assumptions), sourcePlanId: row.source_plan_id as string | null, actualCutoff: row.actual_cutoff as string | null, sourceActuals: decode(row.source_actuals, {}), reportingSnapshot: decode(row.reporting_snapshot, null), createdAt: string(row.created_at), publishedAt: row.published_at as string | null, stale: false }; }
function observationFrom(row: Row): FinanceObservation { return { actualRevisionId: string(row.actual_revision_id), accountCode: string(row.account_code), kind: row.observation_kind as FinanceObservation["kind"], amount: amount(row.amount), restrictedAmount: amount(row.restricted_amount), classification: row.classification as FinanceObservation["classification"], evidenceRef: string(row.evidence_ref), asOfDate: string(row.as_of_date), sourceOperationId: string(row.source_operation_id) }; }
function importFrom(row: Row): FinanceImportBatch { return { id: string(row.id), version: Number(row.version), kind: row.kind as FinanceImportBatch["kind"], planId: row.plan_id as string | null, fiscalYear: Number(row.fiscal_year), definitionSetId: string(row.definition_set_id), definitionVersion: Number(row.definition_version), bookVersion: Number(row.book_version), status: row.status as FinanceImportBatch["status"], contentHash: string(row.content_hash), months: decode(row.months, []), createdAt: string(row.created_at), expiresAt: string(row.expires_at) }; }
function auditFrom(row: Row): FinanceAuditEvent { return { id: string(row.id), action: string(row.action), actorId: string(row.actor_id), actorName: string(row.actor_name), targetId: string(row.target_id), period: row.period as string | null, operationId: string(row.operation_id), detail: decode(row.detail, {}), createdAt: string(row.created_at) }; }

/** All report inputs are read in one primary D1 batch, whose snapshot cannot mix concurrent revisions. */
export async function loadFinance(db: D1Database, user: WorkspaceUser, selection: FinanceSelection = {}): Promise<FinanceState> {
  authorize(user);
  if (selection.includeAudit) authorize(user, "finance.audit.read");
  const initial = await getBook(db);
  const year = fiscalYear(selection.fiscalYear ?? (selection.period ? yearFor(period(selection.period), initial?.fiscalStartMonth ?? 1) : yearFor(localDate(initial?.timezone ?? "Asia/Ho_Chi_Minh").slice(0, 7), initial?.fiscalStartMonth ?? 1)));
  const months = fiscalPeriods(year, initial?.fiscalStartMonth ?? 1);
  const first = previousPeriod(months[0]), last = months[11];
  const [auditTime = "", auditId = ""] = (selection.auditBefore ?? "").split("|", 2);
  const selectedPlan = selection.planId ?? "";
  const planScope = "SELECT id FROM finance_plan_versions WHERE fiscal_year=? AND (id=? OR is_baseline=1 OR id=(SELECT id FROM finance_plan_versions WHERE fiscal_year=? AND kind='forecast' AND state='published' ORDER BY created_at DESC,id DESC LIMIT 1) OR (?='' AND id=(SELECT id FROM finance_plan_versions WHERE fiscal_year=? ORDER BY created_at DESC,id DESC LIMIT 1)))";
  const planArgs: Bind[] = [year, selectedPlan, year, selectedPlan, year];
  const currentIds = "SELECT authoritative_closed_revision_id FROM finance_periods WHERE period BETWEEN ? AND ? UNION SELECT working_revision_id FROM finance_periods WHERE period BETWEEN ? AND ?";
  const sourceIds = `SELECT j.value FROM finance_plan_versions p,json_each(p.source_actuals) j WHERE p.id IN (${planScope})`;
  const ids = `SELECT id FROM finance_actual_revisions WHERE id IN (${currentIds}) OR id IN (SELECT opening_source_revision_id FROM finance_actual_revisions WHERE id IN (${currentIds})) OR id=? OR id IN (${sourceIds}) OR id IN (SELECT opening_source_revision_id FROM finance_actual_revisions WHERE id=? OR id IN (${sourceIds}))`;
  const actualArgs: Bind[] = [first, last, first, last, first, last, first, last, selection.actualRevisionId ?? "", ...planArgs, selection.actualRevisionId ?? "", ...planArgs];
  const results = await db.batch([
    db.prepare("SELECT * FROM finance_books WHERE id='main'"),
    db.prepare("SELECT * FROM finance_definition_sets WHERE fiscal_year BETWEEN ? AND ? ORDER BY fiscal_year").bind(year - 1, year),
    db.prepare("SELECT l.* FROM finance_lines l JOIN finance_definition_sets d ON d.id=l.definition_set_id WHERE d.fiscal_year BETWEEN ? AND ? ORDER BY l.rowid").bind(year - 1, year),
    db.prepare("SELECT s.* FROM finance_segments s JOIN finance_definition_sets d ON d.id=s.definition_set_id WHERE d.fiscal_year BETWEEN ? AND ? ORDER BY s.segment_code").bind(year - 1, year),
    db.prepare("SELECT * FROM finance_cash_accounts ORDER BY account_code"),
    db.prepare("SELECT p.*,r.opening_source_revision_id AS authoritative_opening_source_revision_id FROM finance_periods p LEFT JOIN finance_actual_revisions r ON r.id=p.authoritative_closed_revision_id ORDER BY p.period"),
    db.prepare(`SELECT * FROM finance_plan_versions WHERE id IN (SELECT id FROM finance_plan_versions WHERE fiscal_year=? ORDER BY created_at DESC,id DESC LIMIT 100) OR id IN (${planScope}) ORDER BY created_at DESC,id DESC`).bind(year, ...planArgs),
    db.prepare(`SELECT * FROM finance_plan_values WHERE plan_id IN (${planScope}) ORDER BY period,line_code,segment_code`).bind(...planArgs),
    db.prepare(`SELECT id,period,definition_set_id,state,version,opening_source_revision_id,supersedes_revision_id,sources,reporting_snapshot,reason,created_at,closed_at FROM finance_actual_revisions WHERE id IN (${ids}) UNION ALL SELECT id,period,definition_set_id,state,version,opening_source_revision_id,supersedes_revision_id,'{"sourceAsOf":"","scope":"","blocks":{}}',NULL,reason,created_at,closed_at FROM finance_actual_revisions WHERE id IN (SELECT id FROM finance_actual_revisions WHERE period=? ORDER BY created_at DESC,id DESC LIMIT 100) AND id NOT IN (${ids}) ORDER BY period,created_at`).bind(...actualArgs, selection.period ?? "", ...actualArgs),
    db.prepare(`SELECT * FROM finance_actual_values WHERE actual_revision_id IN (${ids}) ORDER BY line_code,segment_code`).bind(...actualArgs),
    db.prepare(`SELECT * FROM finance_balance_observations WHERE actual_revision_id IN (${ids}) ORDER BY account_code,observation_kind`).bind(...actualArgs),
    db.prepare("SELECT * FROM finance_import_batches WHERE fiscal_year=? AND ?=1 ORDER BY created_at DESC,id DESC LIMIT 30").bind(year, selection.includeImports ? 1 : 0),
    db.prepare("SELECT * FROM finance_audit_events WHERE ?=1 AND action!='report.export.chunk' AND (?='' OR created_at<? OR (created_at=? AND id<?)) AND (?='' OR action=?) AND (?='' OR actor_id=?) ORDER BY created_at DESC,id DESC LIMIT 100").bind(selection.includeAudit ? 1 : 0, auditTime, auditTime, auditTime, auditId, selection.auditAction ?? "", selection.auditAction ?? "", selection.auditActor ?? "", selection.auditActor ?? ""),
  ]);
  const rows = (index: number) => (results[index].results ?? []) as Row[];
  const book = bookFrom(rows(0)[0]);
  if ((initial?.version ?? 0) !== (book?.version ?? 0)) throw new FinanceError("finance_read_changed", 409);
  const definitions: FinanceDefinitionSet[] = rows(1).map(row => ({ id: string(row.id), fiscalYear: Number(row.fiscal_year), state: row.state as FinanceDefinitionSet["state"], version: Number(row.version), calculationVersion: string(row.calculation_version), expectedInputs: decode(row.expected_inputs, []), lines: rows(2).filter(line => line.definition_set_id === row.id).map(lineFrom), segments: rows(3).filter(segment => segment.definition_set_id === row.id).map(segmentFrom), createdAt: string(row.created_at), publishedAt: row.published_at as string | null }));
  const definition = definitions.find(item => item.fiscalYear === year);
  const operational = user.financeDeploymentEnabled === true && !!book?.enabled && !!book.policyNote;
  const state: FinanceState = { book, selectedFiscalYear: year, definitions, lines: definition?.lines ?? [...DEFAULT_FINANCE_LINES], segments: definition?.segments ?? [], accounts: rows(4).map(accountFrom), periods: operational ? rows(5).map(periodFrom) : [], plans: operational ? rows(6).map(planFrom) : [], planValues: operational ? rows(7).map(row => ({ ...factFrom(row), planId: string(row.plan_id), period: string(row.period), sourceOperationId: string(row.source_operation_id) })) : [], actualRevisions: operational ? rows(8).map(revisionFrom) : [], actualValues: operational ? rows(9).map(row => ({ ...factFrom(row), actualRevisionId: string(row.actual_revision_id), sourceOperationId: string(row.source_operation_id) })) : [], observations: operational ? rows(10).map(observationFrom) : [], imports: operational ? rows(11).map(importFrom) : [], audit: operational ? rows(12).map(auditFrom) : [] };
  const periodMap = new Map(state.periods.map(item => [item.period, item]));
  const metadata = new Map(state.actualRevisions.map(item => [item.id, item]));
  const stalePeriods = new Map<string, boolean>();
  for (const row of rows(5)) {
    const month = string(row.period), prior = previousPeriod(month);
    stalePeriods.set(month, month !== book?.firstPeriod && (!row.authoritative_opening_source_revision_id || row.authoritative_opening_source_revision_id !== periodMap.get(prior)?.authoritativeClosedRevisionId || !!stalePeriods.get(prior)));
  }
  const staleRevision = (revision: FinanceActualRevision, seen = new Set<string>()): boolean => {
    if (seen.has(revision.id)) return true; seen.add(revision.id);
    if (book && revision.period === book.firstPeriod) return false;
    const prior = periodMap.get(previousPeriod(revision.period));
    if (!revision.openingSourceRevisionId || prior?.authoritativeClosedRevisionId !== revision.openingSourceRevisionId) return true;
    const source = metadata.get(revision.openingSourceRevisionId);
    return !!stalePeriods.get(previousPeriod(revision.period)) || (source ? staleRevision(source, seen) : false);
  };
  for (const revision of state.actualRevisions) revision.stale = staleRevision(revision);
  for (const plan of state.plans) plan.stale = Object.entries(plan.sourceActuals).some(([month, id]) => periodMap.get(month)?.authoritativeClosedRevisionId !== id || !!metadata.get(id)?.stale);
  return state;
}

interface MutationContext { db: D1Database; user: WorkspaceUser; book: FinanceBookState | null; command: FinanceCommand; key: string; hash: string; operationId: string; time: string; configuration: boolean }
function guard(db: D1Database, predicate: string, params: Bind[] = []): D1PreparedStatement {
  return db.prepare(`INSERT INTO finance_write_guards(id,valid) SELECT ?,CASE WHEN (${predicate}) THEN 1 ELSE 0 END`).bind(makeId("guard"), ...params);
}
function bookGuard(ctx: MutationContext): D1PreparedStatement {
  return ctx.book ? guard(ctx.db, `EXISTS(SELECT 1 FROM finance_books WHERE id='main' AND version=?${ctx.configuration ? "" : " AND enabled=1"})`, [ctx.book.version]) : guard(ctx.db, "NOT EXISTS(SELECT 1 FROM finance_books)");
}
function definitionGuard(db: D1Database, definition: FinanceDefinitionSet): D1PreparedStatement { return guard(db, "EXISTS(SELECT 1 FROM finance_definition_sets WHERE id=? AND version=?)", [definition.id, definition.version]); }
async function previousOperation(ctx: MutationContext): Promise<FinanceReceipt | null> {
  const row = await ctx.db.prepare("SELECT payload_hash,receipt FROM finance_write_operations WHERE actor_id=? AND request_key=?").bind(ctx.user.id, ctx.key).first<Row>();
  if (!row) return null;
  if (row.payload_hash !== ctx.hash) throw new FinanceError("request_key_conflict", 409);
  return hydrateReceipt(ctx.db, { ...decode<FinanceReceipt>(row.receipt, {} as FinanceReceipt), replayed: true });
}
async function hydrateReceipt(db: D1Database, receipt: FinanceReceipt): Promise<FinanceReceipt> {
  if (!Array.isArray(receipt.manifest?.snapshotChunks)) return receipt;
  const ids = receipt.manifest.snapshotChunks as string[];
  const result = await db.prepare("SELECT id,detail FROM finance_audit_events WHERE operation_id=? AND action='report.export.chunk'").bind(receipt.operationId).all<Row>();
  const rows = new Map(result.results.map(row => [string(row.id), decode<{ data: string }>(row.detail, { data: "" }).data]));
  if (ids.some(id => !rows.has(id))) throw new FinanceError("export_snapshot_unavailable", 503);
  return { ...receipt, manifest: JSON.parse(ids.map(id => rows.get(id)).join("")) as Record<string, unknown> };
}
async function commit(ctx: MutationContext, target: string, version: number, guards: D1PreparedStatement[], writes: D1PreparedStatement[], detail: Record<string, unknown>, extra: { period?: string; fingerprint?: string; manifest?: Record<string, unknown> } = {}): Promise<FinanceReceipt> {
  const receipt: FinanceReceipt = { operationId: ctx.operationId, action: ctx.command.action, targetId: target, version, ...(extra.period ? { period: extra.period } : {}), ...(extra.manifest ? { manifest: extra.manifest } : {}) };
  try {
    await ctx.db.batch([
      bookGuard(ctx), ...guards,
      ctx.db.prepare("INSERT INTO finance_write_operations(id,actor_id,request_key,action,target_id,payload_hash,content_fingerprint,receipt,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(ctx.operationId, ctx.user.id, ctx.key, ctx.command.action, target, ctx.hash, extra.fingerprint ?? null, encode(receipt), ctx.time),
      ...writes,
      ctx.db.prepare("INSERT INTO finance_audit_events(id,actor_id,actor_name,action,target_id,period,operation_id,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(makeId("faudit"), ctx.user.id, ctx.user.name, ctx.command.action, target, extra.period ?? null, ctx.operationId, encode(detail), ctx.time),
      ctx.db.prepare("DELETE FROM finance_write_guards"),
    ]);
  } catch (error) {
    if (!ctx.configuration) ready(ctx.user, await getBook(ctx.db));
    const replay = await previousOperation(ctx); if (replay) return replay;
    const message = error instanceof Error ? error.message : "";
    if (/finance_import_fingerprint|finance_write_operations.action, finance_write_operations.target_id/.test(message)) throw new FinanceError("import_already_committed", 409);
    if (/constraint failed|finance_.*immutable|finance_.*invalid|finance_.*locked/.test(message)) throw new FinanceError("finance_conflict", 409);
    throw error;
  }
  return hydrateReceipt(ctx.db, receipt);
}

async function definitionFor(db: D1Database, year: number): Promise<FinanceDefinitionSet | null> {
  const results = await db.batch([
    db.prepare("SELECT * FROM finance_definition_sets WHERE fiscal_year=?").bind(year),
    db.prepare("SELECT l.* FROM finance_lines l JOIN finance_definition_sets d ON d.id=l.definition_set_id WHERE d.fiscal_year=? ORDER BY l.rowid").bind(year),
    db.prepare("SELECT s.* FROM finance_segments s JOIN finance_definition_sets d ON d.id=s.definition_set_id WHERE d.fiscal_year=? ORDER BY s.segment_code").bind(year),
  ]);
  const row = results[0].results?.[0] as Row | undefined; if (!row) return null;
  return { id: string(row.id), fiscalYear: Number(row.fiscal_year), state: row.state as FinanceDefinitionSet["state"], version: Number(row.version), calculationVersion: string(row.calculation_version), expectedInputs: decode(row.expected_inputs, []), lines: (results[1].results as Row[]).map(lineFrom), segments: (results[2].results as Row[]).map(segmentFrom), createdAt: string(row.created_at), publishedAt: row.published_at as string | null };
}
function initialDefinition(book: FinanceBookState, year: number, time: string): FinanceDefinitionSet {
  const months = fiscalPeriods(year, book.fiscalStartMonth);
  return { id: makeId("fdef"), fiscalYear: year, state: "draft", version: 1, calculationVersion: FINANCE_CALCULATION_VERSION, lines: [...DEFAULT_FINANCE_LINES], expectedInputs: defaultExpectedInputs(year, book.fiscalStartMonth, DEFAULT_FINANCE_LINES, { firstPeriod: book.firstPeriod }), segments: [{ code: "unallocated", labelEn: "Unallocated", labelVi: "Chưa phân bổ", activeFrom: months[0], activeTo: null }, { code: "all", labelEn: "All", labelVi: "Tất cả", activeFrom: months[0], activeTo: null }], createdAt: time, publishedAt: null };
}
function lineWrites(db: D1Database, definition: FinanceDefinitionSet): D1PreparedStatement[] {
  return [
    db.prepare("INSERT INTO finance_lines(definition_set_id,line_code,basis,line_group,label_en,label_vi,kind,sign,required,allow_na,require_note,nonnegative,aggregation,cost_behavior) SELECT ?,json_extract(value,'$.code'),json_extract(value,'$.basis'),json_extract(value,'$.group'),json_extract(value,'$.labelEn'),json_extract(value,'$.labelVi'),json_extract(value,'$.kind'),json_extract(value,'$.sign'),json_extract(value,'$.required'),json_extract(value,'$.allowNa'),COALESCE(json_extract(value,'$.requireNote'),0),COALESCE(json_extract(value,'$.nonnegative'),0),json_extract(value,'$.aggregation'),COALESCE(json_extract(value,'$.costBehavior'),'unspecified') FROM json_each(?) WHERE 1 ON CONFLICT(definition_set_id,line_code) DO UPDATE SET basis=excluded.basis,line_group=excluded.line_group,label_en=excluded.label_en,label_vi=excluded.label_vi,kind=excluded.kind,sign=excluded.sign,required=excluded.required,allow_na=excluded.allow_na,require_note=excluded.require_note,nonnegative=excluded.nonnegative,aggregation=excluded.aggregation,cost_behavior=excluded.cost_behavior").bind(definition.id, encode(definition.lines)),
    db.prepare("INSERT INTO finance_segments(definition_set_id,segment_code,label_en,label_vi,active_from,active_to) SELECT ?,json_extract(value,'$.code'),json_extract(value,'$.labelEn'),json_extract(value,'$.labelVi'),json_extract(value,'$.activeFrom'),json_extract(value,'$.activeTo') FROM json_each(?) WHERE 1 ON CONFLICT(definition_set_id,segment_code) DO UPDATE SET label_en=excluded.label_en,label_vi=excluded.label_vi,active_from=excluded.active_from,active_to=excluded.active_to").bind(definition.id, encode(definition.segments)),
  ];
}
function definitionInsert(db: D1Database, definition: FinanceDefinitionSet): D1PreparedStatement[] {
  return [db.prepare("INSERT INTO finance_definition_sets(id,book_id,fiscal_year,calculation_version,expected_inputs,created_at) VALUES(?,'main',?,?,?,?)").bind(definition.id, definition.fiscalYear, definition.calculationVersion, encode(definition.expectedInputs), definition.createdAt), ...lineWrites(db, definition)];
}
function permittedInputs(definition: FinanceDefinitionSet, month: string, kind: FinanceVersionKind): FinanceExpectedInput[] {
  return definition.expectedInputs.filter(item => item.period === month && (!(item as FinanceExpectedInput & { kinds?: FinanceVersionKind[] }).kinds || (item as FinanceExpectedInput & { kinds?: FinanceVersionKind[] }).kinds?.includes(kind)));
}
function normalizeFacts(values: FinanceFact[], definition: FinanceDefinitionSet, month: string, kind: FinanceVersionKind): FinanceFact[] {
  if (!Array.isArray(values) || values.length > MAX_FACTS) throw new FinanceError("too_many_facts");
  const allowed = new Map(permittedInputs(definition, month, kind).map(item => [`${item.lineCode}|${item.segmentCode}`, item]));
  const lines = new Map(definition.lines.map(item => [item.code, item]));
  const seen = new Set<string>();
  return values.map(value => {
    if (!value || typeof value !== "object") throw new FinanceError("invalid_fact");
    const key = `${code(value.lineCode)}|${simpleCode(value.segmentCode, "segment_code")}`;
    const input = allowed.get(key), line = lines.get(value.lineCode);
    if (seen.has(key)) throw new FinanceError("duplicate_coordinate"); seen.add(key);
    if (!input || line?.kind !== "input") throw new FinanceError("invalid_coordinate", 400, key);
    if (!["entered", "missing", "not_applicable"].includes(value.state)) throw new FinanceError("invalid_value_state");
    const result: FinanceFact = { lineCode: value.lineCode, segmentCode: value.segmentCode, state: value.state, amount: amount(value.amount), note: textField(value.note ?? "", "note"), evidenceRef: textField(value.evidenceRef ?? "", "evidence_ref", 1000) };
    if ((result.state === "entered") !== (result.amount !== null)) throw new FinanceError("value_state_amount_mismatch");
    if (result.state === "not_applicable" && (!input.allowNa || !line.allowNa || line.basis !== "pnl")) throw new FinanceError("not_applicable_forbidden");
    if (result.state !== "missing" && (result.state === "not_applicable" || (result.amount ?? 0) < 0 || line.requireNote) && !result.note) throw new FinanceError("note_required", 400, key);
    if (line.nonnegative && result.amount !== null && result.amount < 0) throw new FinanceError("negative_control", 400, key);
    return result;
  }).sort((a, b) => `${a.lineCode}|${a.segmentCode}`.localeCompare(`${b.lineCode}|${b.segmentCode}`));
}
function normalizeSources(value: FinanceSourceContext, book: FinanceBookState, month: string, closing = false): FinanceSourceContext {
  if (!value || typeof value !== "object" || !value.blocks || typeof value.blocks !== "object") throw new FinanceError("invalid_source_context");
  const sourceAsOf = textField(value.sourceAsOf ?? "", "source_as_of", 10);
  if (sourceAsOf && (!/^\d{4}-\d{2}-\d{2}$/.test(sourceAsOf) || !Number.isFinite(Date.parse(`${sourceAsOf}T00:00:00Z`)) || new Date(`${sourceAsOf}T00:00:00Z`).toISOString().slice(0, 10) !== sourceAsOf || sourceAsOf > localDate(book.timezone))) throw new FinanceError("invalid_source_as_of");
  const scope = textField(value.scope ?? "", "reporting_scope", 2000);
  const blocks: FinanceSourceContext["blocks"] = {};
  for (const key of ["pnl", "cash", "aging", "position"] as const) {
    const block = value.blocks?.[key];
    if (block) blocks[key] = { evidenceRef: textField(block.evidenceRef ?? "", "block_evidence", 1000), note: textField(block.note ?? "", "block_note", 2000) };
    if (closing && !blocks[key]?.evidenceRef) throw new FinanceError("block_evidence_required", 400, key);
  }
  if (closing && (!scope || !sourceAsOf || sourceAsOf < periodEnd(month))) throw new FinanceError("closing_source_context_required");
  return { sourceAsOf, scope, blocks };
}
function planFactWrites(ctx: MutationContext, plan: FinancePlan, month: string, values: FinanceFact[]): D1PreparedStatement[] {
  const payload = encode(values);
  return [
    ctx.db.prepare("DELETE FROM finance_plan_values WHERE plan_id=? AND period=? AND EXISTS(SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.state')='missing' AND json_extract(j.value,'$.lineCode')=line_code AND json_extract(j.value,'$.segmentCode')=segment_code)").bind(plan.id, month, payload),
    ctx.db.prepare("INSERT INTO finance_plan_values(plan_id,definition_set_id,period,line_code,segment_code,value_state,amount,note,evidence_ref,source_operation_id) SELECT ?,?,?,json_extract(value,'$.lineCode'),json_extract(value,'$.segmentCode'),json_extract(value,'$.state'),json_extract(value,'$.amount'),json_extract(value,'$.note'),json_extract(value,'$.evidenceRef'),? FROM json_each(?) WHERE json_extract(value,'$.state')!='missing' ON CONFLICT(plan_id,period,line_code,segment_code) DO UPDATE SET value_state=excluded.value_state,amount=excluded.amount,note=excluded.note,evidence_ref=excluded.evidence_ref,source_operation_id=excluded.source_operation_id").bind(plan.id, plan.definitionSetId, month, ctx.operationId, payload),
  ];
}
function actualFactWrites(ctx: MutationContext, revision: FinanceActualRevision, values: FinanceFact[]): D1PreparedStatement[] {
  const payload = encode(values);
  return [
    ctx.db.prepare("DELETE FROM finance_actual_values WHERE actual_revision_id=? AND EXISTS(SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.state')='missing' AND json_extract(j.value,'$.lineCode')=line_code AND json_extract(j.value,'$.segmentCode')=segment_code)").bind(revision.id, payload),
    ctx.db.prepare("INSERT INTO finance_actual_values(actual_revision_id,definition_set_id,line_code,segment_code,value_state,amount,note,evidence_ref,source_operation_id) SELECT ?,?,json_extract(value,'$.lineCode'),json_extract(value,'$.segmentCode'),json_extract(value,'$.state'),json_extract(value,'$.amount'),json_extract(value,'$.note'),json_extract(value,'$.evidenceRef'),? FROM json_each(?) WHERE json_extract(value,'$.state')!='missing' ON CONFLICT(actual_revision_id,line_code,segment_code) DO UPDATE SET value_state=excluded.value_state,amount=excluded.amount,note=excluded.note,evidence_ref=excluded.evidence_ref,source_operation_id=excluded.source_operation_id").bind(revision.id, revision.definitionSetId, ctx.operationId, payload),
  ];
}
function planGuard(ctx: MutationContext, plan: FinancePlan, expected: number): D1PreparedStatement { return guard(ctx.db, "EXISTS(SELECT 1 FROM finance_plan_versions WHERE id=? AND version=? AND state='draft' AND definition_set_id=?)", [plan.id, checkVersion(expected), plan.definitionSetId]); }
function actualGuard(ctx: MutationContext, revision: FinanceActualRevision, expected: number, periodVersion: number): D1PreparedStatement { return guard(ctx.db, "EXISTS(SELECT 1 FROM finance_actual_revisions r JOIN finance_periods p ON p.period=r.period WHERE r.id=? AND r.version=? AND r.state='draft' AND p.working_revision_id=r.id AND p.version=? AND p.definition_set_id=r.definition_set_id)", [revision.id, checkVersion(expected), checkVersion(periodVersion)]); }
async function requirePlan(db: D1Database, id: string): Promise<FinancePlan> { const row = await db.prepare("SELECT * FROM finance_plan_versions WHERE id=?").bind(id).first<Row>(); if (!row) throw new FinanceError("plan_not_found", 404); return planFrom(row); }
async function requireRevision(db: D1Database, id: string): Promise<FinanceActualRevision> { const row = await db.prepare("SELECT * FROM finance_actual_revisions WHERE id=?").bind(id).first<Row>(); if (!row) throw new FinanceError("actual_revision_not_found", 404); return revisionFrom(row); }
async function allPlanValues(db: D1Database, id: string): Promise<FinancePlanValue[]> { return (await db.prepare("SELECT * FROM finance_plan_values WHERE plan_id=? ORDER BY period,line_code,segment_code").bind(id).all<Row>()).results.map(row => ({ ...factFrom(row), planId: id, period: string(row.period), sourceOperationId: string(row.source_operation_id) })); }
async function actualSnapshot(db: D1Database, revision: FinanceActualRevision): Promise<FinanceSnapshot> {
  const results = await db.batch([db.prepare("SELECT * FROM finance_actual_values WHERE actual_revision_id=? ORDER BY line_code,segment_code").bind(revision.id), db.prepare("SELECT * FROM finance_balance_observations WHERE actual_revision_id=? ORDER BY account_code,observation_kind").bind(revision.id)]);
  return { period: revision.period, revisionId: revision.id, state: revision.state, openingSourceRevisionId: revision.openingSourceRevisionId, values: (results[0].results as Row[]).map(factFrom), cashObservations: (results[1].results as Row[]).map(observationFrom) };
}
function mergedFacts(previous: FinanceFact[], patch: FinanceFact[]): FinanceFact[] {
  const values = new Map(previous.map(item => [`${item.lineCode}|${item.segmentCode}`, item]));
  for (const item of patch) item.state === "missing" ? values.delete(`${item.lineCode}|${item.segmentCode}`) : values.set(`${item.lineCode}|${item.segmentCode}`, item);
  return [...values.values()];
}
function mergedObservations(previous: FinanceCashObservation[], patch: FinanceCashObservation[]): FinanceCashObservation[] {
  const values = new Map(previous.map(item => [`${item.accountCode}|${item.kind}`, item]));
  for (const item of patch) values.set(`${item.accountCode}|${item.kind}`, item);
  return [...values.values()];
}
function assertMonthSize(values: FinanceFact[], observations: FinanceCashObservation[] = [], sources: FinanceSourceContext = EMPTY_SOURCES): void {
  if (new TextEncoder().encode(encode({ values, observations, sources })).byteLength > MAX_MONTH_BYTES) throw new FinanceError("month_payload_too_large", 413);
}
function frozenContext(book: FinanceBookState, definition: FinanceDefinitionSet, accounts: FinanceAccount[], sources: FinanceSourceContext, time: string): FinanceFrozenContext { return { book, lines: definition.lines, expectedInputs: definition.expectedInputs, segments: definition.segments, cashAccounts: accounts.map(({ code, label, activeFrom, activeTo }) => ({ code, label, activeFrom, activeTo })), calculationVersion: definition.calculationVersion, sources, capturedAt: time }; }
async function allAccounts(db: D1Database): Promise<FinanceAccount[]> { return (await db.prepare("SELECT * FROM finance_cash_accounts ORDER BY account_code").all<Row>()).results.map(accountFrom); }

function validateDefinition(definition: FinanceDefinitionSet, book: FinanceBookState): void {
  const months = new Set(fiscalPeriods(definition.fiscalYear, book.fiscalStartMonth));
  if (definition.lines.length > 200 || definition.segments.length > 100) throw new FinanceError("definition_too_large");
  const lines = new Map<string, FinanceLine>(), segments = new Map<string, FinanceSegment>();
  for (const line of definition.lines) {
    if (!line || typeof line !== "object") throw new FinanceError("invalid_line_definition");
    code(line.code, "line_code"); if (lines.has(line.code)) throw new FinanceError("duplicate_line_code");
    textField(line.labelEn, "line_label", 200, true); textField(line.labelVi, "line_label", 200, true);
    if (!["pnl", "cash", "position", "aging", "control"].includes(line.basis) || !["input", "derived"].includes(line.kind) || ![-1, 1].includes(line.sign) || !["flow", "stock"].includes(line.aggregation)) throw new FinanceError("invalid_line_definition");
    if (line.allowNa && line.basis !== "pnl") throw new FinanceError("core_na_forbidden");
    const seed = DEFAULT_FINANCE_LINES.find(item => item.code === line.code);
    if (line.basis !== "pnl" && (!seed || ["basis", "group", "kind", "sign", "aggregation"].some(key => line[key as keyof FinanceLine] !== seed[key as keyof FinanceLine]) || !!line.nonnegative !== !!seed.nonnegative)) throw new FinanceError("unsupported_calculation_definition");
    if (line.basis !== "pnl" && seed && (line.required !== seed.required || !!line.requireNote !== !!seed.requireNote)) throw new FinanceError("mandatory_control_relaxed");
    if (typeof line.required !== "boolean" || typeof line.allowNa !== "boolean") throw new FinanceError("invalid_line_flags");
    if (line.costBehavior && (!["fixed", "variable", "mixed", "unspecified"].includes(line.costBehavior) || (line.costBehavior !== "unspecified" && !(line.basis === "pnl" && line.kind === "input" && ["direct_cost", "operating_expense", "finance_cost", "income_tax"].includes(line.group))))) throw new FinanceError("invalid_cost_behavior");
    if (line.basis === "pnl" && (line.kind !== "input" || !["revenue", "direct_cost", "operating_expense", "other_operating_income", "finance_income", "finance_cost", "income_tax"].includes(line.group))) throw new FinanceError("invalid_pnl_group");
    lines.set(line.code, line);
  }
  for (const seed of DEFAULT_FINANCE_LINES.filter(item => item.basis !== "pnl" || item.code.includes("other_revenue") || item.code.includes("other_direct_cost") || item.code.includes("other_operating_expense"))) if (!lines.has(seed.code)) throw new FinanceError("required_definition_missing", 400, seed.code);
  for (const segment of definition.segments) {
    if (!segment || typeof segment !== "object") throw new FinanceError("invalid_segment_definition");
    simpleCode(segment.code, "segment_code"); if (segments.has(segment.code)) throw new FinanceError("duplicate_segment_code");
    textField(segment.labelEn, "segment_label", 200, true); textField(segment.labelVi, "segment_label", 200, true);
    period(segment.activeFrom); if (segment.activeTo && period(segment.activeTo) < segment.activeFrom) throw new FinanceError("invalid_segment_dates");
    segments.set(segment.code, segment);
  }
  if (!segments.has("all") || !segments.has("unallocated")) throw new FinanceError("reserved_segments_required");
  const seen = new Set<string>(), counts = new Map<string, number>();
  for (const input of definition.expectedInputs) {
    if (!input || typeof input !== "object") throw new FinanceError("invalid_expected_input");
    const line = lines.get(input.lineCode), segment = segments.get(input.segmentCode), key = `${input.period}|${input.lineCode}|${input.segmentCode}`;
    if (!months.has(input.period) || line?.kind !== "input" || !segment || input.period < segment.activeFrom || (segment.activeTo && input.period > segment.activeTo)) throw new FinanceError("invalid_expected_coordinate", 400, key);
    if (seen.has(key)) throw new FinanceError("duplicate_expected_coordinate"); seen.add(key);
    if (typeof input.required !== "boolean" || typeof input.allowNa !== "boolean") throw new FinanceError("invalid_input_flags");
    if ((line.basis === "pnl") === (input.segmentCode === "all") || (line.basis !== "pnl" && input.segmentCode !== "all")) throw new FinanceError("invalid_segment_basis");
    if (input.allowNa && (!line.allowNa || line.basis !== "pnl")) throw new FinanceError("core_na_forbidden");
    const kinds = (input as FinanceExpectedInput & { kinds?: FinanceVersionKind[] }).kinds;
    if (kinds && (!kinds.length || kinds.some(kind => !["actual", "budget", "forecast", "scenario"].includes(kind)))) throw new FinanceError("invalid_input_kinds");
    counts.set(input.period, (counts.get(input.period) ?? 0) + 1);
  }
  if ([...counts.values()].some(count => count > MAX_FACTS)) throw new FinanceError("too_many_expected_coordinates");
  const defaults = defaultExpectedInputs(definition.fiscalYear, book.fiscalStartMonth, definition.lines, { firstPeriod: book.firstPeriod });
  for (const input of defaults) {
    const line = lines.get(input.lineCode)!;
    const applicable = definition.expectedInputs.filter(item => item.period === input.period && item.lineCode === input.lineCode);
    if (!applicable.length || (input.required && !applicable.some(item => item.required))) throw new FinanceError("mandatory_input_removed", 400, `${input.period}|${input.lineCode}`);
    if (line.basis !== "pnl" && applicable.some(item => item.allowNa || (input.required && !item.required))) throw new FinanceError("mandatory_control_relaxed");
    const mandatoryKinds = input.kinds ?? ["actual", "budget", "forecast", "scenario"];
    if (input.required && mandatoryKinds.some(kind => !applicable.some(item => !item.kinds || item.kinds.includes(kind)))) throw new FinanceError("mandatory_input_kind_removed");
  }
}

async function saveBook(ctx: MutationContext, command: Extract<FinanceCommand, { action: "book.save" }>): Promise<FinanceReceipt> {
  checkVersion(command.expected_version);
  const entity = textField(command.legal_entity, "legal_entity", 200, true), policy = textField(command.policy_note, "policy_note", 5000, command.enabled);
  if (!/^[A-Z]{3}$/.test(command.currency) || !Number.isInteger(command.precision) || command.precision < 0 || command.precision > 6 || !Number.isInteger(command.fiscal_start_month) || command.fiscal_start_month < 1 || command.fiscal_start_month > 12 || typeof command.enabled !== "boolean") throw new FinanceError("invalid_book_configuration");
  try { new Intl.DateTimeFormat("en", { timeZone: command.timezone }).format(); } catch { throw new FinanceError("invalid_timezone"); }
  const first = period(command.first_period), floor = amount(command.cash_floor); if (floor !== null && floor < 0) throw new FinanceError("invalid_cash_floor");
  const varianceAmount = command.variance_amount_threshold === undefined ? ctx.book?.varianceAmountThreshold ?? null : amount(command.variance_amount_threshold);
  const variancePercent = command.variance_percent_threshold_bps === undefined ? ctx.book?.variancePercentThresholdBps ?? null : amount(command.variance_percent_threshold_bps);
  if (varianceAmount !== null && varianceAmount < 0 || variancePercent !== null && (variancePercent < 0 || variancePercent > 10000)) throw new FinanceError("invalid_variance_threshold");
  const next: FinanceBookState = { id: "main", entityName: entity, currency: command.currency, precision: command.precision, fiscalStartMonth: command.fiscal_start_month, timezone: command.timezone, firstPeriod: first, cashFloor: floor, varianceAmountThreshold: varianceAmount, variancePercentThresholdBps: variancePercent, enabled: command.enabled, policyNote: policy, version: command.expected_version + 1, createdAt: ctx.book?.createdAt ?? ctx.time, updatedAt: ctx.time };
  if (!ctx.book) {
    if (command.expected_version !== 0) throw new FinanceError("finance_conflict", 409);
    const definition = initialDefinition(next, yearFor(first, next.fiscalStartMonth), ctx.time);
    return commit(ctx, "main", 1, [], [
      ctx.db.prepare("INSERT INTO finance_books(id,entity_name,currency,precision,fiscal_start_month,timezone,first_period,cash_floor,variance_amount_threshold,variance_percent_threshold_bps,policy_note,enabled,created_at,updated_at,updated_by) VALUES('main',?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(entity, next.currency, next.precision, next.fiscalStartMonth, next.timezone, first, floor, varianceAmount, variancePercent, policy, command.enabled ? 1 : 0, ctx.time, ctx.time, ctx.user.id),
      ...definitionInsert(ctx.db, definition),
    ], { before: null, after: next });
  }
  if (ctx.book.version !== command.expected_version) throw new FinanceError("finance_conflict", 409);
  const calendarChanged = ctx.book.fiscalStartMonth !== next.fiscalStartMonth || ctx.book.firstPeriod !== next.firstPeriod || ctx.book.timezone !== next.timezone;
  const guards = [guard(ctx.db, "EXISTS(SELECT 1 FROM finance_books WHERE id='main' AND version=?)", [command.expected_version])];
  if (calendarChanged) guards.push(guard(ctx.db, "NOT EXISTS(SELECT 1 FROM finance_plan_versions) AND NOT EXISTS(SELECT 1 FROM finance_periods) AND NOT EXISTS(SELECT 1 FROM finance_import_batches)"));
  const writes = [ctx.db.prepare("UPDATE finance_books SET entity_name=?,currency=?,precision=?,fiscal_start_month=?,timezone=?,first_period=?,cash_floor=?,variance_amount_threshold=?,variance_percent_threshold_bps=?,policy_note=?,enabled=?,version=version+1,updated_at=?,updated_by=? WHERE id='main'").bind(entity, next.currency, next.precision, next.fiscalStartMonth, next.timezone, first, floor, varianceAmount, variancePercent, policy, command.enabled ? 1 : 0, ctx.time, ctx.user.id)];
  if (calendarChanged) {
    const definitions = (await ctx.db.prepare("SELECT fiscal_year FROM finance_definition_sets ORDER BY fiscal_year").all<Row>()).results;
    for (const item of definitions) {
      const definition = await definitionFor(ctx.db, Number(item.fiscal_year)); if (!definition) continue;
      if (definition.state !== "draft" || definition.segments.some(segment => !["all", "unallocated"].includes(segment.code))) throw new FinanceError("calendar_mapping_required", 409);
      definition.expectedInputs = defaultExpectedInputs(definition.fiscalYear, next.fiscalStartMonth, definition.lines, { firstPeriod: next.firstPeriod });
      guards.push(definitionGuard(ctx.db, definition));
      writes.push(ctx.db.prepare("UPDATE finance_definition_sets SET expected_inputs=?,version=version+1 WHERE id=?").bind(encode(definition.expectedInputs), definition.id));
      writes.push(ctx.db.prepare("UPDATE finance_segments SET active_from=? WHERE definition_set_id=?").bind(fiscalPeriods(definition.fiscalYear, next.fiscalStartMonth)[0], definition.id));
    }
  }
  return commit(ctx, "main", next.version, guards, writes, { before: ctx.book, after: next });
}

async function saveDefinition(ctx: MutationContext, command: Extract<FinanceCommand, { action: "definition.save" }>): Promise<FinanceReceipt> {
  if (!ctx.book) throw new FinanceError("book_required", 409);
  const year = fiscalYear(command.fiscal_year), current = await definitionFor(ctx.db, year), version = checkVersion(command.expected_version);
  if ((current?.version ?? 0) !== version || current?.state === "published") throw new FinanceError("definition_locked_or_changed", 409);
  const definition = current ?? initialDefinition(ctx.book, year, ctx.time);
  definition.lines = command.lines ? structuredClone(command.lines) : definition.lines;
  definition.segments = command.segments ? structuredClone(command.segments) : definition.segments;
  definition.expectedInputs = command.expected_inputs ? structuredClone(command.expected_inputs) : command.lines ? defaultExpectedInputs(year, ctx.book.fiscalStartMonth, definition.lines, { firstPeriod: ctx.book.firstPeriod }) : definition.expectedInputs;
  validateDefinition(definition, ctx.book);
  const guards = current ? [definitionGuard(ctx.db, current), guard(ctx.db, "NOT EXISTS(SELECT 1 FROM finance_plan_values WHERE definition_set_id=?) AND NOT EXISTS(SELECT 1 FROM finance_actual_values WHERE definition_set_id=?)", [definition.id, definition.id])] : [guard(ctx.db, "NOT EXISTS(SELECT 1 FROM finance_definition_sets WHERE fiscal_year=?)", [year])];
  const writes = current ? [ctx.db.prepare("DELETE FROM finance_lines WHERE definition_set_id=?").bind(definition.id), ctx.db.prepare("DELETE FROM finance_segments WHERE definition_set_id=?").bind(definition.id), ...lineWrites(ctx.db, definition), ctx.db.prepare("UPDATE finance_definition_sets SET expected_inputs=?,version=version+1 WHERE id=?").bind(encode(definition.expectedInputs), definition.id)] : definitionInsert(ctx.db, definition);
  writes.push(ctx.db.prepare("UPDATE finance_books SET version=version+1,updated_at=?,updated_by=? WHERE id='main'").bind(ctx.time, ctx.user.id));
  return commit(ctx, definition.id, version + 1, guards, writes, { fiscalYear: year, definition });
}

async function saveAccount(ctx: MutationContext, command: Extract<FinanceCommand, { action: "account.save" }>): Promise<FinanceReceipt> {
  if (!ctx.book) throw new FinanceError("book_required", 409);
  const accountCode = simpleCode(command.account_code, "account_code"), version = checkVersion(command.expected_version), from = period(command.active_from), to = command.active_to ? period(command.active_to) : null;
  if (to && to < from) throw new FinanceError("invalid_account_dates");
  const label = textField(command.label, "account_label", 200, true), accounts = await allAccounts(ctx.db), old = accounts.find(item => item.code === accountCode);
  if ((old?.version ?? 0) !== version) throw new FinanceError("finance_conflict", 409);
  const next = { id: old?.id ?? makeId("faccount"), code: accountCode, label, activeFrom: from, activeTo: to, version: version + 1 };
  const roster = [...accounts.filter(item => item.code !== accountCode), next];
  for (const start of roster.map(item => item.activeFrom)) if (roster.filter(item => item.activeFrom <= start && (!item.activeTo || item.activeTo >= start)).length > MAX_ACCOUNTS) throw new FinanceError("too_many_cash_accounts");
  const guards = [old ? guard(ctx.db, "EXISTS(SELECT 1 FROM finance_cash_accounts WHERE account_code=? AND version=?)", [accountCode, version]) : guard(ctx.db, "NOT EXISTS(SELECT 1 FROM finance_cash_accounts WHERE account_code=?)", [accountCode])];
  if (old && (old.activeFrom !== from || old.activeTo !== to)) guards.push(guard(ctx.db, "NOT EXISTS(SELECT 1 FROM finance_balance_observations o JOIN finance_actual_revisions r ON r.id=o.actual_revision_id WHERE o.account_code=? AND r.state='closed' AND (r.period<? OR (? IS NOT NULL AND r.period>?)))", [accountCode, from, to, to]));
  const writes = old ? [ctx.db.prepare("UPDATE finance_cash_accounts SET label=?,active_from=?,active_to=?,version=version+1 WHERE account_code=?").bind(label, from, to, accountCode)] : [ctx.db.prepare("INSERT INTO finance_cash_accounts(id,book_id,account_code,label,active_from,active_to) VALUES(?,'main',?,?,?,?)").bind(next.id, accountCode, label, from, to)];
  writes.push(ctx.db.prepare("UPDATE finance_books SET version=version+1,updated_at=?,updated_by=? WHERE id='main'").bind(ctx.time, ctx.user.id));
  return commit(ctx, next.id, next.version, guards, writes, { before: old ?? null, after: next });
}

async function targetDefinition(ctx: MutationContext, year: number, source?: FinanceDefinitionSet | null): Promise<{ definition: FinanceDefinitionSet; guards: D1PreparedStatement[]; writes: D1PreparedStatement[] }> {
  const existing = await definitionFor(ctx.db, year);
  if (existing) return { definition: existing, guards: [definitionGuard(ctx.db, existing)], writes: [] };
  if (!ctx.book) throw new FinanceError("book_required", 409);
  if (!source) {
    const previous = await ctx.db.prepare("SELECT fiscal_year FROM finance_definition_sets WHERE fiscal_year<? ORDER BY fiscal_year DESC LIMIT 1").bind(year).first<Row>();
    if (previous) source = await definitionFor(ctx.db, Number(previous.fiscal_year));
  }
  const definition = initialDefinition(ctx.book, year, ctx.time);
  if (source) {
    const sourceMonths = fiscalPeriods(source.fiscalYear, ctx.book.fiscalStartMonth), targetMonths = fiscalPeriods(year, ctx.book.fiscalStartMonth);
    definition.lines = structuredClone(source.lines);
    definition.segments = source.segments.map(segment => ({ ...segment, activeFrom: targetMonths[Math.max(0, sourceMonths.indexOf(segment.activeFrom))] ?? targetMonths[0], activeTo: segment.activeTo ? targetMonths[Math.max(0, sourceMonths.indexOf(segment.activeTo))] ?? targetMonths[11] : null }));
    definition.expectedInputs = source.expectedInputs.map(input => ({ ...input, period: targetMonths[sourceMonths.indexOf(input.period)] }));
    // Opening controls exist only where the target calendar needs an explicit anchor.
    // An optional historical opening cell would still mean missing input, never zero.
    const defaults = defaultExpectedInputs(year, ctx.book.fiscalStartMonth, definition.lines, { firstPeriod: ctx.book.firstPeriod });
    const opening = new Set(["equity.opening", "cash.opening"]);
    definition.expectedInputs = [...definition.expectedInputs.filter(input => !opening.has(input.lineCode)), ...defaults.filter(input => opening.has(input.lineCode))];
  }
  validateDefinition(definition, ctx.book);
  return { definition, guards: [guard(ctx.db, "NOT EXISTS(SELECT 1 FROM finance_definition_sets WHERE fiscal_year=?)", [year]), ...(source ? [definitionGuard(ctx.db, source)] : [])], writes: definitionInsert(ctx.db, definition) };
}
function compatibleDefinitions(source: FinanceDefinitionSet, target: FinanceDefinitionSet, values: FinanceFact[]): void {
  for (const value of values) {
    const from = source.lines.find(line => line.code === value.lineCode), to = target.lines.find(line => line.code === value.lineCode);
    if (!from || !to || ["basis", "kind", "group", "sign", "aggregation"].some(key => from[key as keyof FinanceLine] !== to[key as keyof FinanceLine])) throw new FinanceError("definition_mapping_required", 409, value.lineCode);
  }
}
async function createPlan(ctx: MutationContext, command: Extract<FinanceCommand, { action: "plan.create" }>): Promise<FinanceReceipt> {
  const book = ctx.book!;
  const year = fiscalYear(command.fiscal_year), label = textField(command.label, "plan_label", 200, true), assumptions = textField(command.assumptions ?? "", "assumptions", 5000);
  if (!["budget", "forecast", "scenario"].includes(command.kind)) throw new FinanceError("invalid_plan_kind");
  const source = command.source_plan_id ? await requirePlan(ctx.db, command.source_plan_id) : null;
  const sourceDefinition = source ? await definitionFor(ctx.db, source.fiscalYear) : null;
  const setup = await targetDefinition(ctx, year, sourceDefinition), definition = setup.definition;
  const months = fiscalPeriods(year, book.fiscalStartMonth), sourceActuals: Record<string, string> = {};
  const actualCutoff = command.kind === "forecast" ? period(command.actual_cutoff) : null;
  if (command.kind !== "forecast" && command.actual_cutoff) throw new FinanceError("cutoff_requires_forecast");
  if (actualCutoff && (!months.includes(actualCutoff) || actualCutoff < book.firstPeriod)) throw new FinanceError("invalid_forecast_cutoff");
  const guards = [...setup.guards];
  if (source) guards.push(guard(ctx.db, "EXISTS(SELECT 1 FROM finance_plan_versions WHERE id=? AND version=?)", [source.id, source.version]));
  if (sourceDefinition && sourceDefinition.id !== definition.id) guards.push(definitionGuard(ctx.db, sourceDefinition));
  if (actualCutoff) {
    const state = await loadFinance(ctx.db, ctx.user, { fiscalYear: year });
    for (const month of months.filter(item => item >= book.firstPeriod && item <= actualCutoff)) {
      const owner = state.periods.find(item => item.period === month), revision = state.actualRevisions.find(item => item.id === owner?.authoritativeClosedRevisionId);
      if (!revision || revision.stale || revision.state !== "closed") throw new FinanceError("forecast_requires_closed_actual_prefix", 409, month);
      sourceActuals[month] = revision.id;
      guards.push(guard(ctx.db, "EXISTS(SELECT 1 FROM finance_periods WHERE period=? AND authoritative_closed_revision_id=? AND version=?)", [month, revision.id, owner!.version]));
    }
  }
  const plan: FinancePlan = { id: makeId("fplan"), label, fiscalYear: year, kind: command.kind, state: "draft", version: 1, definitionSetId: definition.id, baseline: false, assumptions, sourcePlanId: source?.id ?? null, actualCutoff, sourceActuals, reportingSnapshot: null, createdAt: ctx.time, publishedAt: null, stale: false };
  const writes = [...setup.writes, ctx.db.prepare("INSERT INTO finance_plan_versions(id,book_id,fiscal_year,definition_set_id,label,kind,assumptions,source_plan_id,actual_cutoff,source_actuals,created_at) VALUES(?,'main',?,?,?,?,?,?,?,?,?)").bind(plan.id, year, definition.id, label, command.kind, assumptions, source?.id ?? null, actualCutoff, encode(sourceActuals), ctx.time)];
  if (source && sourceDefinition) {
    const values = await allPlanValues(ctx.db, source.id), oldMonths = fiscalPeriods(source.fiscalYear, book.fiscalStartMonth);
    compatibleDefinitions(sourceDefinition, definition, values);
    for (let index = 0; index < months.length; index++) {
      if (actualCutoff && months[index] <= actualCutoff) continue;
      const current = values.filter(value => value.period === oldMonths[index]);
      if (current.length) { const normalized = normalizeFacts(current, definition, months[index], plan.kind); assertMonthSize(normalized); writes.push(...planFactWrites(ctx, plan, months[index], normalized)); }
    }
  }
  return commit(ctx, plan.id, 1, guards, writes, { plan, sourcePlanVersion: source?.version ?? null });
}

async function savePlan(ctx: MutationContext, command: Extract<FinanceCommand, { action: "plan.save" }>): Promise<FinanceReceipt> {
  const plan = await requirePlan(ctx.db, command.plan_id), definition = await definitionFor(ctx.db, plan.fiscalYear);
  if (!definition || plan.state !== "draft" || plan.version !== checkVersion(command.expected_version)) throw new FinanceError("plan_locked_or_changed", 409);
  const months = fiscalPeriods(plan.fiscalYear, ctx.book!.fiscalStartMonth), all = await allPlanValues(ctx.db, plan.id), patches = new Map<string, FinanceFact[]>();
  const modes = Number(command.values !== undefined) + Number(command.copy_from_period !== undefined) + Number(command.spread !== undefined);
  if (modes > 1) throw new FinanceError("ambiguous_plan_edit");
  if (command.values !== undefined || command.copy_from_period !== undefined) {
    const month = period(command.period);
    if (!months.includes(month) || (plan.actualCutoff && month <= plan.actualCutoff)) throw new FinanceError("actual_prefix_locked");
    if (command.copy_from_period) {
      const from = period(command.copy_from_period); if (!months.includes(from)) throw new FinanceError("copy_period_outside_plan");
      const targetCoordinates = new Set(permittedInputs(definition, month, plan.kind).map(item => `${item.lineCode}|${item.segmentCode}`));
      const pinned = plan.sourceActuals[from] ? await requireRevision(ctx.db, plan.sourceActuals[from]) : null;
      const candidates = pinned ? (await actualSnapshot(ctx.db, pinned)).values : all.filter(item => item.period === from);
      const source = candidates.filter(item => targetCoordinates.has(`${item.lineCode}|${item.segmentCode}`));
      if (!source.length) throw new FinanceError("copy_source_empty");
      patches.set(month, normalizeFacts(source, definition, month, plan.kind));
    } else patches.set(month, normalizeFacts(command.values ?? [], definition, month, plan.kind));
  }
  if (command.spread) {
    const spread = command.spread, eligible = months.filter(month => !plan.actualCutoff || month > plan.actualCutoff);
    const line = definition.lines.find(item => item.code === spread.lineCode);
    if (!line || line.aggregation !== "flow" || !["pnl", "cash"].includes(line.basis)) throw new FinanceError("annual_split_requires_flow");
    if (plan.actualCutoff) throw new FinanceError("annual_split_requires_full_year_draft");
    if (spread.weights && spread.weights.length !== eligible.length) throw new FinanceError("invalid_split_weights");
    const distributed = allocateAnnual(integer(spread.annualAmount), spread.weights);
    for (let index = 0; index < eligible.length; index++) patches.set(eligible[index], normalizeFacts([{ lineCode: spread.lineCode, segmentCode: spread.segmentCode, state: "entered", amount: distributed[index], note: spread.note, evidenceRef: spread.evidenceRef }], definition, eligible[index], plan.kind));
  }
  const label = command.label === undefined ? plan.label : textField(command.label, "plan_label", 200, true), assumptions = command.assumptions === undefined ? plan.assumptions : textField(command.assumptions, "assumptions", 5000);
  const writes: D1PreparedStatement[] = [];
  for (const [month, values] of patches) { assertMonthSize(mergedFacts(all.filter(value => value.period === month), values)); writes.push(...planFactWrites(ctx, plan, month, values)); }
  writes.push(ctx.db.prepare("UPDATE finance_plan_versions SET label=?,assumptions=?,version=version+1 WHERE id=?").bind(label, assumptions, plan.id));
  return commit(ctx, plan.id, plan.version + 1, [planGuard(ctx, plan, command.expected_version), definitionGuard(ctx.db, definition)], writes, { fiscalYear: plan.fiscalYear, before: { label: plan.label, assumptions: plan.assumptions, values: all.filter(value => patches.get(value.period)?.some(patch => patch.lineCode === value.lineCode && patch.segmentCode === value.segmentCode)) }, after: { label, assumptions, months: Object.fromEntries(patches) } }, command.period ? { period: command.period } : {});
}

async function publishPlan(ctx: MutationContext, command: Extract<FinanceCommand, { action: "plan.publish" }>): Promise<FinanceReceipt> {
  const plan = await requirePlan(ctx.db, command.plan_id), definition = await definitionFor(ctx.db, plan.fiscalYear), book = ctx.book!;
  if (!definition || plan.state !== "draft" || plan.version !== checkVersion(command.expected_version)) throw new FinanceError("plan_locked_or_changed", 409);
  if (command.baseline && plan.kind !== "budget") throw new FinanceError("baseline_requires_budget");
  const values = await allPlanValues(ctx.db, plan.id), accounts = await allAccounts(ctx.db), months = fiscalPeriods(plan.fiscalYear, book.fiscalStartMonth);
  const guards = [planGuard(ctx, plan, command.expected_version), definitionGuard(ctx.db, definition)];
  let openingCash: number | undefined, openingEquity: number | undefined;
  if (plan.actualCutoff) {
    const state = await loadFinance(ctx.db, ctx.user, { fiscalYear: plan.fiscalYear, planId: plan.id });
    const cutoffId = plan.sourceActuals[plan.actualCutoff], revision = state.actualRevisions.find(item => item.id === cutoffId);
    if (!revision || plan.stale || Object.entries(plan.sourceActuals).some(([month, id]) => state.periods.find(item => item.period === month)?.authoritativeClosedRevisionId !== id || state.actualRevisions.find(item => item.id === id)?.stale)) throw new FinanceError("forecast_actuals_stale", 409);
    const snapshot = revisionSnapshot(state, revision), previous = revision.openingSourceRevisionId ? state.actualRevisions.find(item => item.id === revision.openingSourceRevisionId) : null;
    const captured = revision.reportingSnapshot!;
    const report = validateFinanceSnapshot(snapshot, { book: captured.book, lines: captured.lines, expectedInputs: captured.expectedInputs, cashAccounts: captured.cashAccounts, kind: "actual", previous: previous ? revisionSnapshot(state, previous) : null, previousCashAccounts: previous?.reportingSnapshot?.cashAccounts, previousLines: previous?.reportingSnapshot?.lines }, "close");
    if (!report.valid || report.report.metrics.cash_closing === null) throw new FinanceError("forecast_anchor_unreconciled", 409, report.issues);
    openingCash = report.report.metrics.cash_closing;
    openingEquity = report.report.metrics.equity ?? undefined;
    for (const [month, id] of Object.entries(plan.sourceActuals)) guards.push(guard(ctx.db, "EXISTS(SELECT 1 FROM finance_periods WHERE period=? AND authoritative_closed_revision_id=?)", [month, id]));
  }
  const reports: Record<string, unknown> = {};
  for (const month of months) {
    if (plan.actualCutoff && month <= plan.actualCutoff) continue;
    const snapshot: FinanceSnapshot = { period: month, state: "draft", values: values.filter(value => value.period === month), cashObservations: [] };
    assertMonthSize(snapshot.values);
    const context: FinanceCalculationContext = { book, lines: definition.lines, expectedInputs: definition.expectedInputs, cashAccounts: accounts, kind: plan.kind, openingCash, openingEquity };
    const result = validateFinanceSnapshot(snapshot, context, "publish");
    if (!result.valid) throw new FinanceError("plan_incomplete", 400, { period: month, issues: result.issues });
    openingCash = result.report.metrics.cash_closing ?? undefined; openingEquity = result.report.metrics.equity ?? openingEquity;
    reports[month] = { cashClosing: openingCash ?? null, complete: result.report.completeness.complete };
  }
  const frozen = frozenContext(book, definition, accounts, EMPTY_SOURCES, ctx.time);
  const writes = [ctx.db.prepare("UPDATE finance_plan_versions SET state='published',is_baseline=?,reporting_snapshot=?,published_at=?,version=version+1 WHERE id=?").bind(command.baseline ? 1 : 0, encode(frozen), ctx.time, plan.id)];
  if (definition.state === "draft") writes.push(ctx.db.prepare("UPDATE finance_definition_sets SET state='published',published_at=?,version=version+1 WHERE id=?").bind(ctx.time, definition.id));
  if (command.baseline) guards.push(guard(ctx.db, "NOT EXISTS(SELECT 1 FROM finance_plan_versions WHERE fiscal_year=? AND is_baseline=1)", [plan.fiscalYear]));
  return commit(ctx, plan.id, plan.version + 1, guards, writes, { fiscalYear: plan.fiscalYear, baseline: !!command.baseline, sourceActuals: plan.sourceActuals, reportingSnapshot: frozen, months: reports });
}

async function currentPeriod(db: D1Database, month: string): Promise<FinancePeriod | null> {
  const row = await db.prepare("SELECT * FROM finance_periods WHERE period=?").bind(month).first<Row>(); return row ? periodFrom(row) : null;
}
function openingGuard(ctx: MutationContext, month: string, sourceId: string | null): D1PreparedStatement {
  if (month === ctx.book!.firstPeriod) return guard(ctx.db, "? IS NULL", [sourceId]);
  return guard(ctx.db, "(SELECT authoritative_closed_revision_id FROM finance_periods WHERE period=?) IS ?", [previousPeriod(month), sourceId]);
}
function coherentOpeningChain(ctx: MutationContext, month: string): D1PreparedStatement {
  return guard(ctx.db, "NOT EXISTS(SELECT 1 FROM finance_periods p JOIN finance_actual_revisions r ON r.id=p.authoritative_closed_revision_id WHERE p.period>? AND p.period<? AND (r.opening_source_revision_id IS NULL OR r.opening_source_revision_id IS NOT (SELECT prior.authoritative_closed_revision_id FROM finance_periods prior WHERE prior.period=strftime('%Y-%m',date(p.period||'-01','-1 month')))))", [ctx.book!.firstPeriod, month]);
}
async function openActual(ctx: MutationContext, command: Extract<FinanceCommand, { action: "actual.open" }>): Promise<FinanceReceipt> {
  const book = ctx.book!, month = actualPeriod(command.period, book), expected = checkVersion(command.expected_period_version), owner = await currentPeriod(ctx.db, month);
  if ((owner?.version ?? 0) !== expected || owner?.workingRevisionId || owner?.authoritativeClosedRevisionId) throw new FinanceError("period_already_open_or_changed", 409);
  const setup = await targetDefinition(ctx, yearFor(month, book.fiscalStartMonth));
  const prior = month === book.firstPeriod ? null : await currentPeriod(ctx.db, previousPeriod(month));
  const openingId = prior?.authoritativeClosedRevisionId ?? null, revisionId = makeId("factual");
  const guards = [...setup.guards, owner ? guard(ctx.db, "EXISTS(SELECT 1 FROM finance_periods WHERE period=? AND version=? AND working_revision_id IS NULL AND authoritative_closed_revision_id IS NULL)", [month, expected]) : guard(ctx.db, "NOT EXISTS(SELECT 1 FROM finance_periods WHERE period=?)", [month]), openingGuard(ctx, month, openingId)];
  const writes = [...setup.writes];
  if (!owner) writes.push(ctx.db.prepare("INSERT INTO finance_periods(period,book_id,definition_set_id) VALUES(?,'main',?)").bind(month, setup.definition.id));
  writes.push(ctx.db.prepare("INSERT INTO finance_actual_revisions(id,period,definition_set_id,opening_source_revision_id,sources,created_at) VALUES(?,?,?,?,?,?)").bind(revisionId, month, setup.definition.id, openingId, encode(EMPTY_SOURCES), ctx.time));
  writes.push(ctx.db.prepare("UPDATE finance_periods SET working_revision_id=?,version=? WHERE period=?").bind(revisionId, expected + 1, month));
  return commit(ctx, revisionId, 1, guards, writes, { period: month, openingSourceRevisionId: openingId }, { period: month, manifest: { periodVersion: expected + 1 } });
}

function normalizeObservations(values: FinanceCashObservation[], book: FinanceBookState, month: string, accounts: FinanceAccount[]): FinanceCashObservation[] {
  if (!Array.isArray(values) || values.length > MAX_ACCOUNTS * 2) throw new FinanceError("too_many_cash_observations");
  const seen = new Set<string>(), today = localDate(book.timezone);
  return values.map(value => {
    if (!value || typeof value !== "object") throw new FinanceError("invalid_cash_observation");
    const accountCode = simpleCode(value.accountCode, "account_code"), account = accounts.find(item => item.code === accountCode);
    if (!account || account.activeFrom > month || (account.activeTo && account.activeTo < month)) throw new FinanceError("inactive_cash_account");
    if (!["opening", "closing"].includes(value.kind) || !["cash", "borrowing"].includes(value.classification)) throw new FinanceError("invalid_cash_observation");
    if (value.kind === "opening" && month !== book.firstPeriod) throw new FinanceError("opening_derived_from_prior_close");
    const key = `${accountCode}|${value.kind}`; if (seen.has(key)) throw new FinanceError("duplicate_cash_observation"); seen.add(key);
    const sourceAmount = amount(value.amount), restricted = amount(value.restrictedAmount), asOfDate = textField(value.asOfDate ?? "", "observation_date", 10);
    if (restricted !== null && restricted < 0) throw new FinanceError("invalid_restricted_cash");
    if (asOfDate && (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) || !Number.isFinite(Date.parse(`${asOfDate}T00:00:00Z`)) || new Date(`${asOfDate}T00:00:00Z`).toISOString().slice(0, 10) !== asOfDate || asOfDate > today)) throw new FinanceError("invalid_observation_date");
    return { accountCode, kind: value.kind, amount: sourceAmount, restrictedAmount: restricted, classification: value.classification, evidenceRef: textField(value.evidenceRef ?? "", "evidence_ref", 1000), asOfDate };
  });
}
function observationWrites(ctx: MutationContext, revision: FinanceActualRevision, observations: FinanceCashObservation[]): D1PreparedStatement[] {
  return [ctx.db.prepare("INSERT INTO finance_balance_observations(actual_revision_id,account_code,observation_kind,amount,restricted_amount,classification,evidence_ref,as_of_date,source_operation_id) SELECT ?,json_extract(value,'$.accountCode'),json_extract(value,'$.kind'),json_extract(value,'$.amount'),json_extract(value,'$.restrictedAmount'),json_extract(value,'$.classification'),json_extract(value,'$.evidenceRef'),json_extract(value,'$.asOfDate'),? FROM json_each(?) WHERE 1 ON CONFLICT(actual_revision_id,account_code,observation_kind) DO UPDATE SET amount=excluded.amount,restricted_amount=excluded.restricted_amount,classification=excluded.classification,evidence_ref=excluded.evidence_ref,as_of_date=excluded.as_of_date,source_operation_id=excluded.source_operation_id").bind(revision.id, ctx.operationId, encode(observations))];
}
async function saveActual(ctx: MutationContext, command: Extract<FinanceCommand, { action: "actual.save" }>): Promise<FinanceReceipt> {
  const revision = await requireRevision(ctx.db, command.actual_revision_id), book = ctx.book!;
  actualPeriod(revision.period, book);
  const definition = await definitionFor(ctx.db, yearFor(revision.period, book.fiscalStartMonth));
  if (!definition || revision.state !== "draft" || revision.version !== checkVersion(command.expected_version)) throw new FinanceError("actual_locked_or_changed", 409);
  const previous = await actualSnapshot(ctx.db, revision), values = normalizeFacts(command.values ?? [], definition, revision.period, "actual"), accounts = await allAccounts(ctx.db);
  const observations = normalizeObservations(command.observations ?? [], book, revision.period, accounts);
  const sources = command.sources ? normalizeSources(command.sources, book, revision.period) : revision.sources;
  assertMonthSize(mergedFacts(previous.values, values), mergedObservations(previous.cashObservations, observations), sources);
  const prior = revision.period === book.firstPeriod ? null : await currentPeriod(ctx.db, previousPeriod(revision.period));
  const openingId = prior?.authoritativeClosedRevisionId ?? null;
  const writes = [...actualFactWrites(ctx, revision, values), ...observationWrites(ctx, revision, observations), ctx.db.prepare("UPDATE finance_actual_revisions SET sources=?,opening_source_revision_id=?,version=version+1 WHERE id=?").bind(encode(sources), openingId, revision.id), ctx.db.prepare("UPDATE finance_periods SET version=version+1 WHERE period=?").bind(revision.period)];
  return commit(ctx, revision.id, revision.version + 1, [actualGuard(ctx, revision, command.expected_version, command.expected_period_version), definitionGuard(ctx.db, definition), openingGuard(ctx, revision.period, openingId)], writes, { before: { values: previous.values, observations: previous.cashObservations, sources: revision.sources, openingSourceRevisionId: revision.openingSourceRevisionId }, after: { values, observations, sources, openingSourceRevisionId: openingId } }, { period: revision.period, manifest: { periodVersion: command.expected_period_version + 1 } });
}

async function closeActual(ctx: MutationContext, command: Extract<FinanceCommand, { action: "actual.close" }>): Promise<FinanceReceipt> {
  const revision = await requireRevision(ctx.db, command.actual_revision_id), book = ctx.book!, month = actualPeriod(revision.period, book);
  if (month >= localDate(book.timezone).slice(0, 7)) throw new FinanceError("period_not_ended");
  const definition = await definitionFor(ctx.db, yearFor(month, book.fiscalStartMonth));
  if (!definition || revision.state !== "draft" || revision.version !== checkVersion(command.expected_version)) throw new FinanceError("actual_locked_or_changed", 409);
  const sources = normalizeSources(revision.sources, book, month, true);
  const state = await loadFinance(ctx.db, ctx.user, { fiscalYear: definition.fiscalYear, period: month, actualRevisionId: revision.id });
  const current = state.actualRevisions.find(item => item.id === revision.id)!;
  if (current.stale) throw new FinanceError("opening_chain_stale", 409);
  const snapshot = revisionSnapshot(state, current), prior = revision.openingSourceRevisionId ? state.actualRevisions.find(item => item.id === revision.openingSourceRevisionId) : null;
  assertMonthSize(snapshot.values, snapshot.cashObservations, sources);
  if (month !== book.firstPeriod && (!prior || prior.state !== "closed" || prior.stale)) throw new FinanceError("prior_close_required", 409);
  const accounts = state.accounts.filter(account => account.activeFrom <= month && (!account.activeTo || account.activeTo >= month));
  if (!accounts.length) throw new FinanceError("cash_account_required");
  const result = validateFinanceSnapshot(snapshot, { book, lines: definition.lines, expectedInputs: definition.expectedInputs, cashAccounts: accounts, kind: "actual", previous: prior ? revisionSnapshot(state, prior) : null, previousCashAccounts: prior?.reportingSnapshot?.cashAccounts, previousLines: prior?.reportingSnapshot?.lines, stale: current.stale }, "close");
  if (!result.valid || !result.report.canClose) throw new FinanceError("month_incomplete_or_unreconciled", 400, result.issues);
  const frozen = frozenContext(book, definition, accounts, sources, ctx.time);
  frozen.expectedInputs = frozen.expectedInputs.filter(input => input.period === month);
  const writes = [ctx.db.prepare("UPDATE finance_actual_revisions SET state='closed',reporting_snapshot=?,closed_at=?,version=version+1 WHERE id=?").bind(encode(frozen), ctx.time, revision.id), ctx.db.prepare("UPDATE finance_periods SET authoritative_closed_revision_id=?,working_revision_id=NULL,version=version+1 WHERE period=?").bind(revision.id, month)];
  if (definition.state === "draft") writes.push(ctx.db.prepare("UPDATE finance_definition_sets SET state='published',published_at=?,version=version+1 WHERE id=?").bind(ctx.time, definition.id));
  return commit(ctx, revision.id, revision.version + 1, [actualGuard(ctx, revision, command.expected_version, command.expected_period_version), definitionGuard(ctx.db, definition), openingGuard(ctx, month, revision.openingSourceRevisionId), coherentOpeningChain(ctx, month)], writes, { supersedesRevisionId: revision.supersedesRevisionId, metrics: result.report.metrics, reportingSnapshot: frozen }, { period: month, manifest: { periodVersion: command.expected_period_version + 1 } });
}

async function reopenActual(ctx: MutationContext, command: Extract<FinanceCommand, { action: "actual.reopen" }>): Promise<FinanceReceipt> {
  const book = ctx.book!, month = actualPeriod(command.period, book), expected = checkVersion(command.expected_period_version), owner = await currentPeriod(ctx.db, month), reason = textField(command.reason, "reopen_reason", 2000, true);
  if (!owner?.authoritativeClosedRevisionId || owner.workingRevisionId || owner.version !== expected) throw new FinanceError("period_not_closed_or_changed", 409);
  const source = await requireRevision(ctx.db, owner.authoritativeClosedRevisionId), prior = month === book.firstPeriod ? null : await currentPeriod(ctx.db, previousPeriod(month));
  const sourceSnapshot = await actualSnapshot(ctx.db, source); assertMonthSize(sourceSnapshot.values, sourceSnapshot.cashObservations, source.sources);
  const openingId = prior?.authoritativeClosedRevisionId ?? null, revisionId = makeId("factual");
  return commit(ctx, revisionId, 1, [guard(ctx.db, "EXISTS(SELECT 1 FROM finance_periods WHERE period=? AND version=? AND authoritative_closed_revision_id=? AND working_revision_id IS NULL)", [month, expected, source.id]), openingGuard(ctx, month, openingId)], [
    ctx.db.prepare("INSERT INTO finance_actual_revisions(id,period,definition_set_id,opening_source_revision_id,supersedes_revision_id,sources,reason,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(revisionId, month, source.definitionSetId, openingId, source.id, encode(source.sources), reason, ctx.time),
    ctx.db.prepare("INSERT INTO finance_actual_values(actual_revision_id,definition_set_id,line_code,segment_code,value_state,amount,note,evidence_ref,source_operation_id) SELECT ?,definition_set_id,line_code,segment_code,value_state,amount,note,evidence_ref,source_operation_id FROM finance_actual_values WHERE actual_revision_id=?").bind(revisionId, source.id),
    ctx.db.prepare("INSERT INTO finance_balance_observations(actual_revision_id,account_code,observation_kind,amount,restricted_amount,classification,evidence_ref,as_of_date,source_operation_id) SELECT ?,account_code,observation_kind,amount,restricted_amount,classification,evidence_ref,as_of_date,source_operation_id FROM finance_balance_observations WHERE actual_revision_id=?").bind(revisionId, source.id),
    ctx.db.prepare("UPDATE finance_periods SET working_revision_id=?,version=version+1 WHERE period=?").bind(revisionId, month),
  ], { reason, supersedesRevisionId: source.id, openingSourceRevisionId: openingId }, { period: month, manifest: { periodVersion: expected + 1 } });
}

function relevantBlock(line: FinanceLine): "pnl" | "cash" | "aging" | "position" {
  if (line.basis !== "control") return line.basis;
  return line.code.startsWith("aging.") ? "aging" : line.code.startsWith("cash.") || line.code.startsWith("forecast.") ? "cash" : "position";
}
async function previewImport(ctx: MutationContext, command: Extract<FinanceCommand, { action: "import.preview" }>): Promise<FinanceReceipt> {
  const book = ctx.book!, year = fiscalYear(command.fiscal_year);
  if (!["plan", "actual"].includes(command.kind)) throw new FinanceError("invalid_import_kind");
  const plan = command.kind === "plan" ? await requirePlan(ctx.db, command.plan_id ?? "") : null;
  if (plan && (plan.fiscalYear !== year || plan.state !== "draft")) throw new FinanceError("import_target_locked", 409);
  const definition = await definitionFor(ctx.db, year); if (!definition) throw new FinanceError("definition_required", 409);
  const rows = parseFinanceCsv(command.csv, { currency: book.currency, precision: book.precision, lines: definition.lines, expectedInputs: definition.expectedInputs, fiscalYear: year, fiscalStartMonth: book.fiscalStartMonth, kind: plan?.kind ?? "actual", timezone: book.timezone });
  if (!rows.length) throw new FinanceError("empty_import");
  const monthKeys = [...new Set(rows.map(row => row.period))].sort(), months: FinanceImportMonth[] = [], guards = [definitionGuard(ctx.db, definition)];
  const currentPlanValues = plan ? await allPlanValues(ctx.db, plan.id) : [];
  const encodedMonths = encode(monthKeys);
  const actualRows = plan ? [] : await ctx.db.batch([
    ctx.db.prepare("SELECT * FROM finance_periods WHERE period IN (SELECT value FROM json_each(?))").bind(encodedMonths),
    ctx.db.prepare("SELECT r.* FROM finance_actual_revisions r JOIN finance_periods p ON p.working_revision_id=r.id WHERE p.period IN (SELECT value FROM json_each(?))").bind(encodedMonths),
    ctx.db.prepare("SELECT v.* FROM finance_actual_values v JOIN finance_periods p ON p.working_revision_id=v.actual_revision_id WHERE p.period IN (SELECT value FROM json_each(?))").bind(encodedMonths),
    ctx.db.prepare("SELECT o.* FROM finance_balance_observations o JOIN finance_periods p ON p.working_revision_id=o.actual_revision_id WHERE p.period IN (SELECT value FROM json_each(?))").bind(encodedMonths),
  ]);
  const currentPeriods = plan ? [] : (actualRows[0].results as Row[]).map(periodFrom);
  const currentRevisions = plan ? [] : (actualRows[1].results as Row[]).map(revisionFrom);
  const currentActualValues = plan ? [] : actualRows[2].results as Row[];
  const currentObservations = plan ? [] : actualRows[3].results as Row[];
  const fingerprints: { target: string; fingerprint: string; period: string }[] = [];
  for (const month of monthKeys) {
    if (plan?.actualCutoff && month <= plan.actualCutoff) throw new FinanceError("actual_prefix_locked");
    if (!plan) actualPeriod(month, book);
    const expected = command.expected_versions?.[month]; if (!expected) throw new FinanceError("import_expected_version_required", 400, month);
    const values = normalizeFacts(rows.filter(row => row.period === month), definition, month, plan?.kind ?? "actual");
    const sources = normalizeSources(command.sources?.[month] ?? EMPTY_SOURCES, book, month);
    if (!sources.sourceAsOf || !sources.scope) throw new FinanceError("import_source_context_required", 400, month);
    for (const fact of values) { const block = relevantBlock(definition.lines.find(line => line.code === fact.lineCode)!); if (!sources.blocks[block]?.evidenceRef) throw new FinanceError("import_block_evidence_required", 400, { period: month, block }); }
    let targetId = plan?.id ?? "", actualRevisionId: string | null = null, periodVersion: number | null = null;
    if (plan) {
      if (checkVersion(expected.version) !== plan.version) throw new FinanceError("import_target_changed", 409);
      assertMonthSize(mergedFacts(currentPlanValues.filter(value => value.period === month), values));
      guards.push(planGuard(ctx, plan, expected.version));
    } else {
      const owner = currentPeriods.find(item => item.period === month);
      periodVersion = checkVersion(expected.period_version ?? 0);
      if ((owner?.version ?? 0) !== periodVersion || (owner?.authoritativeClosedRevisionId && !owner.workingRevisionId)) throw new FinanceError("import_target_locked_or_changed", 409);
      if (owner?.workingRevisionId) {
        const revision = currentRevisions.find(item => item.id === owner.workingRevisionId);
        if (!revision) throw new FinanceError("import_target_changed", 409);
        if (expected.actual_revision_id !== revision.id || checkVersion(expected.version) !== revision.version || revision.state !== "draft") throw new FinanceError("import_target_changed", 409);
        actualRevisionId = revision.id; guards.push(actualGuard(ctx, revision, expected.version, periodVersion));
        const previousValues = currentActualValues.filter(row => row.actual_revision_id === revision.id).map(factFrom), observations = currentObservations.filter(row => row.actual_revision_id === revision.id).map(observationFrom);
        assertMonthSize(mergedFacts(previousValues, values), observations, { ...revision.sources, ...sources, blocks: { ...revision.sources.blocks, ...sources.blocks } });
      } else {
        if (expected.actual_revision_id || expected.version !== 0 || owner) throw new FinanceError("import_target_changed", 409);
        actualRevisionId = makeId("factual"); guards.push(guard(ctx.db, "NOT EXISTS(SELECT 1 FROM finance_periods WHERE period=?)", [month]));
        assertMonthSize(values, [], sources);
      }
      targetId = actualRevisionId;
    }
    const fingerprint = await digest({ targetId, period: month, definitionSetId: definition.id, currency: book.currency, values, sources });
    fingerprints.push({ target: targetId, fingerprint, period: month });
    months.push({ period: month, status: "pending", expectedVersion: checkVersion(expected.version), expectedPeriodVersion: periodVersion, actualRevisionId, values, sources, fingerprint, receipt: null });
  }
  const duplicate = await ctx.db.prepare("SELECT w.id FROM finance_write_operations w WHERE w.action='import.commit' AND EXISTS(SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.target')=w.target_id AND json_extract(j.value,'$.fingerprint')=w.content_fingerprint) LIMIT 1").bind(encode(fingerprints)).first();
  if (duplicate) throw new FinanceError("import_already_committed", 409);
  const importId = makeId("fimport"), contentHash = await digest({ rows, sources: command.sources, kind: command.kind, planId: plan?.id ?? null });
  const expiresAt = new Date(Date.parse(ctx.time) + 7 * 86400000).toISOString();
  return commit(ctx, importId, 1, guards, [ctx.db.prepare("INSERT INTO finance_import_batches(id,book_id,kind,plan_id,fiscal_year,definition_set_id,definition_version,book_version,status,content_hash,months,created_at,expires_at) VALUES(?,'main',?,?,?,?,?,?,'preview',?,?,?,?)").bind(importId, command.kind, plan?.id ?? null, year, definition.id, definition.version, book.version, contentHash, encode(months), ctx.time, expiresAt)], { contentHash, rows: rows.length, months: monthKeys, definitionSetId: definition.id }, { manifest: { importId, contentHash, months: monthKeys, rows: rows.length } });
}
async function requireImport(db: D1Database, id: string): Promise<FinanceImportBatch> { const row = await db.prepare("SELECT * FROM finance_import_batches WHERE id=?").bind(id).first<Row>(); if (!row) throw new FinanceError("import_not_found", 404); return importFrom(row); }
function importGuard(ctx: MutationContext, batch: FinanceImportBatch, expected: number): D1PreparedStatement { return guard(ctx.db, "EXISTS(SELECT 1 FROM finance_import_batches WHERE id=? AND version=? AND status IN ('preview','partial'))", [batch.id, checkVersion(expected)]); }

async function commitImport(ctx: MutationContext, command: Extract<FinanceCommand, { action: "import.commit" }>): Promise<FinanceReceipt> {
  const batch = await requireImport(ctx.db, command.import_id), book = ctx.book!, month = period(command.period), entry = batch.months.find(item => item.period === month);
  if (batch.version !== checkVersion(command.expected_version) || !["preview", "partial"].includes(batch.status) || !entry || entry.status !== "pending") throw new FinanceError("import_manifest_changed", 409);
  if (batch.expiresAt <= ctx.time) throw new FinanceError("import_preview_expired", 409);
  if (batch.bookVersion !== book.version) throw new FinanceError("import_settings_changed", 409);
  const definition = await definitionFor(ctx.db, batch.fiscalYear);
  if (!definition || definition.id !== batch.definitionSetId || definition.version !== batch.definitionVersion) throw new FinanceError("import_definition_changed", 409);
  const guards = [importGuard(ctx, batch, command.expected_version), definitionGuard(ctx.db, definition)], writes: D1PreparedStatement[] = [];
  let target: string, version: number;
  let before: unknown = null;
  if (batch.kind === "plan") {
    const plan = await requirePlan(ctx.db, batch.planId!);
    if (plan.state !== "draft" || plan.version !== entry.expectedVersion || (plan.actualCutoff && month <= plan.actualCutoff)) throw new FinanceError("import_target_changed", 409);
    const values = normalizeFacts(entry.values, definition, month, plan.kind);
    const current = (await allPlanValues(ctx.db, plan.id)).filter(item => item.period === month); before = current;
    assertMonthSize(mergedFacts(current, values));
    guards.push(planGuard(ctx, plan, entry.expectedVersion));
    writes.push(...planFactWrites(ctx, plan, month, values), ctx.db.prepare("UPDATE finance_plan_versions SET version=version+1 WHERE id=?").bind(plan.id));
    target = plan.id; version = plan.version + 1;
    // Only this manifest's successful preceding commit may advance remaining expected global plan versions.
    for (const pending of batch.months.filter(item => item.status === "pending" && item.period !== month)) {
      if (pending.expectedVersion !== plan.version) throw new FinanceError("import_target_changed", 409);
      pending.expectedVersion = version;
    }
  } else {
    actualPeriod(month, book);
    const owner = await currentPeriod(ctx.db, month), prior = month === book.firstPeriod ? null : await currentPeriod(ctx.db, previousPeriod(month)), openingId = prior?.authoritativeClosedRevisionId ?? null;
    let revision: FinanceActualRevision;
    if (entry.expectedVersion === 0) {
      if (owner || entry.expectedPeriodVersion !== 0) throw new FinanceError("import_target_changed", 409);
      target = entry.actualRevisionId!; version = 1;
      revision = { id: target, period: month, version: 0, state: "draft", definitionSetId: definition.id, openingSourceRevisionId: openingId, supersedesRevisionId: null, sources: entry.sources, reportingSnapshot: null, reason: "", createdAt: ctx.time, closedAt: null, stale: false };
      assertMonthSize(entry.values, [], entry.sources);
      guards.push(guard(ctx.db, "NOT EXISTS(SELECT 1 FROM finance_periods WHERE period=?)", [month]));
      writes.push(ctx.db.prepare("INSERT INTO finance_periods(period,book_id,definition_set_id) VALUES(?,'main',?)").bind(month, definition.id), ctx.db.prepare("INSERT INTO finance_actual_revisions(id,period,definition_set_id,opening_source_revision_id,sources,created_at) VALUES(?,?,?,?,?,?)").bind(target, month, definition.id, openingId, encode(entry.sources), ctx.time));
      writes.push(...actualFactWrites(ctx, revision, normalizeFacts(entry.values, definition, month, "actual")), ctx.db.prepare("UPDATE finance_periods SET working_revision_id=? WHERE period=?").bind(target, month));
    } else {
      revision = await requireRevision(ctx.db, entry.actualRevisionId!);
      if (owner?.workingRevisionId !== revision.id || owner.version !== entry.expectedPeriodVersion || revision.version !== entry.expectedVersion || revision.state !== "draft") throw new FinanceError("import_target_changed", 409);
      const snapshot = await actualSnapshot(ctx.db, revision); before = snapshot;
      guards.push(actualGuard(ctx, revision, entry.expectedVersion, entry.expectedPeriodVersion!));
      const sources = { ...revision.sources, ...entry.sources, blocks: { ...revision.sources.blocks, ...entry.sources.blocks } };
      assertMonthSize(mergedFacts(snapshot.values, entry.values), snapshot.cashObservations, sources);
      writes.push(...actualFactWrites(ctx, revision, normalizeFacts(entry.values, definition, month, "actual")), ctx.db.prepare("UPDATE finance_actual_revisions SET sources=?,opening_source_revision_id=?,version=version+1 WHERE id=?").bind(encode(sources), openingId, revision.id), ctx.db.prepare("UPDATE finance_periods SET version=version+1 WHERE period=?").bind(month));
      target = revision.id; version = revision.version + 1;
    }
    guards.push(openingGuard(ctx, month, openingId));
  }
  entry.status = "committed";
  entry.receipt = { operationId: ctx.operationId, action: "import.commit", targetId: target, version, period: month };
  batch.status = batch.months.every(item => item.status === "committed") ? "committed" : "partial";
  writes.push(ctx.db.prepare("UPDATE finance_import_batches SET months=?,status=?,version=version+1 WHERE id=?").bind(encode(batch.months), batch.status, batch.id));
  return commit(ctx, target, version, guards, writes, { importId: batch.id, contentHash: batch.contentHash, fingerprint: entry.fingerprint, before, after: { values: entry.values, sources: entry.sources }, manifestVersion: batch.version + 1 }, { period: month, fingerprint: entry.fingerprint, manifest: { importId: batch.id, importVersion: batch.version + 1, status: batch.status } });
}

async function discardImport(ctx: MutationContext, command: Extract<FinanceCommand, { action: "import.discard" }>): Promise<FinanceReceipt> {
  const batch = await requireImport(ctx.db, command.import_id);
  if (batch.version !== checkVersion(command.expected_version) || !["preview", "partial"].includes(batch.status)) throw new FinanceError("import_manifest_changed", 409);
  const discarded = batch.months.filter(item => item.status === "pending").map(item => item.period);
  for (const entry of batch.months) if (entry.status === "pending") { entry.status = "discarded"; entry.values = []; entry.sources = EMPTY_SOURCES; }
  return commit(ctx, batch.id, batch.version + 1, [importGuard(ctx, batch, command.expected_version)], [ctx.db.prepare("UPDATE finance_import_batches SET months=?,status='discarded',version=version+1 WHERE id=?").bind(encode(batch.months), batch.id)], { discarded, retainedCommitted: batch.months.filter(item => item.status === "committed").map(item => ({ period: item.period, receipt: item.receipt, fingerprint: item.fingerprint })) });
}

async function addAnnotation(ctx: MutationContext, command: Extract<FinanceCommand, { action: "annotation.add" }>): Promise<FinanceReceipt> {
  const month = period(command.period), book = ctx.book!, year = yearFor(month, book.fiscalStartMonth), definition = await definitionFor(ctx.db, year);
  if (!definition || (!command.baseline_id && !command.actual_revision_id)) throw new FinanceError("annotation_target_required");
  const baseline = command.baseline_id ? await requirePlan(ctx.db, command.baseline_id) : null;
  if (baseline && (!baseline.baseline || baseline.state !== "published" || baseline.fiscalYear !== year)) throw new FinanceError("invalid_annotation_baseline");
  const revision = command.actual_revision_id ? await requireRevision(ctx.db, command.actual_revision_id) : null;
  if (revision && revision.period !== month) throw new FinanceError("annotation_period_mismatch");
  const lineCode = command.line_code ? code(command.line_code, "line_code") : null;
  const segmentCode = command.segment_code ? simpleCode(command.segment_code, "segment_code") : null;
  if (segmentCode && !definition.segments.some(segment => segment.code === segmentCode)) throw new FinanceError("annotation_segment_unknown");
  const cause = textField(command.cause, "annotation_cause", 2000, true), nextAction = textField(command.next_action, "annotation_next_action", 2000), review = textField(command.review, "annotation_review", 2000);
  const target = revision?.id ?? baseline!.id;
  return commit(ctx, target, revision?.version ?? baseline!.version, [definitionGuard(ctx.db, definition)], [], { baselineId: baseline?.id ?? null, actualRevisionId: revision?.id ?? null, actualRevisionVersion: revision?.version ?? null, period: month, lineCode, segmentCode, cause, nextAction, review }, { period: month });
}

async function exportReport(ctx: MutationContext, command: Extract<FinanceCommand, { action: "report.export" }>): Promise<FinanceReceipt> {
  const report = textField(command.report, "report", 80, true);
  if (!["overview", "plans", "actuals", "pnl", "cash-flow", "revenue", "costs", "working-capital", "position"].includes(report)) throw new FinanceError("invalid_export_report");
  const selection: FinanceSelection = { ...command.selection, includeAudit: false, includeImports: false };
  if (selection.range && !["month", "quarter", "ytd", "year"].includes(selection.range)) throw new FinanceError("invalid_range");
  const state = await loadFinance(ctx.db, ctx.user, selection);
  ready(ctx.user, state.book);
  if (state.book.version !== ctx.book!.version) throw new FinanceError("finance_conflict", 409);
  const segmentCode = command.segment_code ? simpleCode(command.segment_code, "segment_code") : "all";
  if (segmentCode !== "all" && !state.segments.some(item => item.code === segmentCode)) throw new FinanceError("unknown_segment");
  if (segmentCode !== "all" && !["overview", "pnl", "revenue", "costs"].includes(report)) throw new FinanceError("segment_not_supported_for_report");
  const view = financeReportView(state, selection, { editor: report === "actuals", range: selection.range, segmentCode, now: ctx.time });
  selection.fiscalYear = state.selectedFiscalYear;
  selection.period = view.period;
  if (view.selectedPlanId) selection.planId = view.selectedPlanId;
  if (view.selectedActualRevisionId) selection.actualRevisionId = view.selectedActualRevisionId;
  const usedPlans = new Set(state.planValues.map(value => value.planId));
  if (selection.planId) usedPlans.add(selection.planId);
  state.plans = state.plans.filter(plan => usedPlans.has(plan.id));
  // History navigation metadata carries no facts; it is not a report input snapshot.
  const usedRevisions = new Set([...state.actualValues.map(value => value.actualRevisionId), ...state.observations.map(value => value.actualRevisionId)]);
  if (selection.actualRevisionId) usedRevisions.add(selection.actualRevisionId);
  state.actualRevisions = state.actualRevisions.filter(revision => usedRevisions.has(revision.id));
  const manifest: Record<string, unknown> = { state, selection, report, segmentCode, generatedAt: ctx.time, calculationVersion: FINANCE_CALCULATION_VERSION };
  const serialized = encode(manifest), byteLength = new TextEncoder().encode(serialized).byteLength;
  if (byteLength > 16 * 1024 * 1024) throw new FinanceError("export_too_large", 413);
  // Audit chunks keep a year of bounded input rows reproducible without exceeding D1's per-row size.
  // They are internal append-only evidence; ordinary audit pages show the single export event.
  const chunks: { id: string; data: string; ordinal: number }[] = [];
  for (let offset = 0; offset < serialized.length; offset += 128 * 1024) chunks.push({ id: makeId("fexport"), data: serialized.slice(offset, offset + 128 * 1024), ordinal: chunks.length });
  const groups: typeof chunks[] = []; let group: typeof chunks = [];
  for (const chunk of chunks) {
    if (group.length && new TextEncoder().encode(encode([...group, chunk])).byteLength > 1024 * 1024) { groups.push(group); group = []; }
    group.push(chunk);
  }
  if (group.length) groups.push(group);
  if (groups.length > 24) throw new FinanceError("export_too_large", 413);
  const target = makeId("freport"), writes = groups.map(items => ctx.db.prepare("INSERT INTO finance_audit_events(id,actor_id,actor_name,action,target_id,period,operation_id,detail,created_at) SELECT json_extract(value,'$.id'),?,?,'report.export.chunk',?,?,?,json_object('ordinal',json_extract(value,'$.ordinal'),'data',json_extract(value,'$.data')),? FROM json_each(?)").bind(ctx.user.id, ctx.user.name, target, selection.period ?? null, ctx.operationId, ctx.time, encode(items)));
  return commit(ctx, target, 1, [], writes, { report, selection, segmentCode, generatedAt: ctx.time, bytes: byteLength, snapshotHash: await digest(manifest), snapshotChunks: chunks.map(item => item.id) }, { period: selection.period, manifest: { snapshotChunks: chunks.map(item => item.id) } });
}

/** Current authority/readiness precede replay; fresh version/state tests follow a successful replay lookup. */
export async function executeFinanceCommand(db: D1Database, user: WorkspaceUser, idempotencyKey: string, command: FinanceCommand): Promise<FinanceReceipt> {
  authorize(user);
  if (!command || typeof command !== "object" || typeof command.action !== "string") throw new FinanceError("invalid_command");
  const permissions: Record<FinanceCommand["action"], Permission> = {
    "book.save": "finance.configure", "definition.save": "finance.configure", "account.save": "finance.configure",
    "plan.create": "finance.plan.manage", "plan.save": "finance.plan.manage", "plan.publish": "finance.plan.manage",
    "actual.open": "finance.actuals.manage", "actual.save": "finance.actuals.manage", "actual.close": "finance.period.close", "actual.reopen": "finance.period.reopen",
    "import.preview": command.action === "import.preview" && command.kind === "plan" ? "finance.plan.manage" : "finance.actuals.manage",
    "import.commit": "finance.actuals.manage", "import.discard": "finance.actuals.manage", "annotation.add": "finance.actuals.manage", "report.export": "finance.export",
  };
  const permission = permissions[command.action]; if (!permission) throw new FinanceError("invalid_command"); authorize(user, permission);
  if (["import.commit", "import.discard"].includes(command.action)) authorize(user, "finance.plan.manage");
  if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) throw new FinanceError("invalid_request_key");
  const configuration = ["book.save", "definition.save", "account.save"].includes(command.action), book = await getBook(db);
  if (!configuration) ready(user, book);
  const ctx: MutationContext = { db, user, book, command, key: idempotencyKey, hash: await digest(command), operationId: makeId("fop"), time: timestamp(), configuration };
  const replay = await previousOperation(ctx); if (replay) return replay;
  switch (command.action) {
    case "book.save": return saveBook(ctx, command);
    case "definition.save": return saveDefinition(ctx, command);
    case "account.save": return saveAccount(ctx, command);
    case "plan.create": return createPlan(ctx, command);
    case "plan.save": return savePlan(ctx, command);
    case "plan.publish": return publishPlan(ctx, command);
    case "actual.open": return openActual(ctx, command);
    case "actual.save": return saveActual(ctx, command);
    case "actual.close": return closeActual(ctx, command);
    case "actual.reopen": return reopenActual(ctx, command);
    case "import.preview": return previewImport(ctx, command);
    case "import.commit": return commitImport(ctx, command);
    case "import.discard": return discardImport(ctx, command);
    case "annotation.add": return addAnnotation(ctx, command);
    case "report.export": return exportReport(ctx, command);
  }
}
