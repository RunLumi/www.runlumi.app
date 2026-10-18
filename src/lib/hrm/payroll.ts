import type { WorkspaceUser } from "../workspace/roles";
import { date, HrmError } from "./fields";
import { audit, command, digest, guardBoolean, id, localDate, now, requirePermission, settings } from "./service";

export const PAYROLL_SOURCE_KINDS = ["employment_record", "locked_time", "approved_adjustment", "manual_evidence"] as const;
export type PayrollSourceKind = typeof PAYROLL_SOURCE_KINDS[number];
export interface PayrollComponent {
  code: string;
  title_en: string;
  title_vi: string;
  direction: "earning" | "deduction";
  required: boolean;
  source_kind: PayrollSourceKind;
}
export interface PayrollLine {
  id: string;
  component_code: string;
  title_en: string;
  title_vi: string;
  direction: "earning" | "deduction";
  amount_minor: number;
  source_kind: PayrollSourceKind;
  source_reference: string;
  zero_reason: string;
}
export interface PayrollRun {
  id: string; period_key: string; period_id: string; starts_on: string; ends_on: string;
  policy_version_id: string; adjustment_of_payslip_id: string | null; reason: string;
  state: string; input_revision: number; snapshot_json: string | null; snapshot_checksum: string | null;
  version: number; created_by: string; created_at: string; reviewed_by: string | null; reviewed_at: string | null;
  review_reason: string | null; approved_by: string | null; approved_at: string | null; approval_reason: string | null;
  published_by: string | null; published_at: string | null; closed_by: string | null; closed_at: string | null;
  actor_id: string; updated_at: string;
}
export interface PayrollPerson {
  id: string; run_id: string; person_id: string; employment_id: string;
  employee_code_snapshot: string; display_name_snapshot: string;
  gross_minor: number | null; deductions_minor: number | null; net_minor: number | null;
  lines: PayrollLine[];
}
export interface PayrollPolicy {
  id: string; policy_key: string; revision: number; title_en: string; title_vi: string;
  legal_entity: string; currency: string; minor_unit_scale: number; components_json: string; rounding_policy: string;
  state: string; created_by: string; created_at: string; reviewed_by: string | null;
  reviewed_at: string | null; review_reason: string | null; activated_by: string | null;
  activated_at: string | null; version: number; actor_id: string; updated_at: string;
}
export interface PayrollSlip {
  id: string; run_id: string; run_person_id: string; person_id: string;
  supersedes_payslip_id: string | null; state: "published" | "superseded";
  snapshot_json: string; snapshot_checksum: string; issued_by: string; issued_at: string;
  paid_minor: number;
}
export interface PayrollPayment {
  id: string; payslip_id: string; amount_minor: number; paid_on: string; payment_reference: string;
  evidence_reference: string; confirmed_by: string; confirmed_at: string; request_key: string;
}
export interface PayrollDispute {
  id: string; payslip_id: string; person_id: string; component_code: string | null;
  state: "submitted" | "investigating" | "answered" | "resolved" | "reopened";
  version: number; opened_by: string; created_at: string; updated_at: string;
  last_event: string; last_event_at: string; employee_code?:string|null; display_name_snapshot?:string|null;
}
export interface PayrollDisputeEvent { id: string; dispute_id: string; event_type: string; body: string; actor_id: string; created_at: string }

const MAX_MINOR = Number.MAX_SAFE_INTEGER;
const live = (user: WorkspaceUser) => { if (user.hrmEnabled !== true) throw new HrmError("payroll_closed", 503); };
async function replayCommand(db: D1Database, user: WorkspaceUser, key: string, operation: string, payload: unknown): Promise<string | null> {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new HrmError("invalid_request_key");
  const previous = await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id, key).first<{ operation: string; payload_hash: string; result_id: string }>();
  if (!previous) return null;
  if (previous.operation !== operation || previous.payload_hash !== await digest(JSON.stringify(payload))) throw new HrmError("request_key_conflict", 409);
  return previous.result_id;
}
const safeText = (value: string, max: number, required = true) => {
  const clean = value.trim();
  if (clean.length > max || (required && !clean)) throw new HrmError("invalid_field");
  return clean;
};

/** Payroll rules are declarative component lists only. No SQL, expression, percentage or code execution is accepted. */
export function parsePayrollComponents(value: string): PayrollComponent[] {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new HrmError("payroll_components_invalid"); }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 40) throw new HrmError("payroll_components_invalid");
  const seen = new Set<string>();
  const components = parsed.map((raw): PayrollComponent => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HrmError("payroll_components_invalid");
    const entry = raw as Record<string, unknown>;
    const allowed = ["code", "title_en", "title_vi", "direction", "required", "source_kind"];
    if (Object.keys(entry).some(key => !allowed.includes(key)) || allowed.some(key => !(key in entry))) throw new HrmError("payroll_components_invalid");
    if (typeof entry.code !== "string" || !/^[a-z][a-z0-9_]{0,39}$/.test(entry.code) || seen.has(entry.code)) throw new HrmError("payroll_components_invalid");
    if (typeof entry.title_en !== "string" || !entry.title_en.trim() || entry.title_en.length > 100 || typeof entry.title_vi !== "string" || !entry.title_vi.trim() || entry.title_vi.length > 100) throw new HrmError("payroll_components_invalid");
    if (entry.direction !== "earning" && entry.direction !== "deduction") throw new HrmError("payroll_components_invalid");
    if (typeof entry.required !== "boolean" || typeof entry.source_kind !== "string" || !(PAYROLL_SOURCE_KINDS as readonly string[]).includes(entry.source_kind)) throw new HrmError("payroll_components_invalid");
    seen.add(entry.code);
    return { code: entry.code, title_en: entry.title_en.trim(), title_vi: entry.title_vi.trim(), direction: entry.direction, required: entry.required, source_kind: entry.source_kind as PayrollSourceKind };
  });
  if (!components.some(component => component.required && component.direction === "earning")) throw new HrmError("payroll_required_earning_missing");
  return components;
}

export function parseMinorAmount(value: string): number {
  if (!/^\d{1,16}$/.test(value)) throw new HrmError("payroll_amount_invalid");
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount > MAX_MINOR) throw new HrmError("payroll_amount_invalid");
  return amount;
}

export function calculatePayrollTotals(lines: Array<Pick<PayrollLine, "amount_minor" | "direction">>): { gross_minor: number; deductions_minor: number; net_minor: number } {
  let gross = 0n, deductions = 0n;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.amount_minor) || line.amount_minor < 0 || line.amount_minor > MAX_MINOR) throw new HrmError("payroll_amount_invalid");
    if (line.direction === "earning") gross += BigInt(line.amount_minor);
    else if (line.direction === "deduction") deductions += BigInt(line.amount_minor);
    else throw new HrmError("payroll_components_invalid");
  }
  const net = gross - deductions;
  if (gross > BigInt(MAX_MINOR) || deductions > BigInt(MAX_MINOR) || net < 0n || net > BigInt(MAX_MINOR)) throw new HrmError("payroll_totals_invalid");
  return { gross_minor: Number(gross), deductions_minor: Number(deductions), net_minor: Number(net) };
}

function validatePolicyInput(input: { policy_key: string; title_en: string; title_vi: string; legal_entity: string; currency: string; minor_unit_scale: number; components_json: string }) {
  const policyKey = safeText(input.policy_key, 60).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,59}$/.test(policyKey)) throw new HrmError("payroll_policy_invalid");
  const titleEn = safeText(input.title_en, 100), titleVi = safeText(input.title_vi, 100);
  const entity = safeText(input.legal_entity, 200);
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new HrmError("invalid_currency");
  if (!Number.isInteger(input.minor_unit_scale) || input.minor_unit_scale < 0 || input.minor_unit_scale > 3) throw new HrmError("payroll_policy_invalid");
  const components = parsePayrollComponents(input.components_json);
  return { policyKey, titleEn, titleVi, entity, currency, minorUnitScale: input.minor_unit_scale, components, componentsJson: JSON.stringify(components) };
}

export async function createPayrollPolicy(db: D1Database, user: WorkspaceUser, key: string, input: Parameters<typeof validatePolicyInput>[0]): Promise<string> {
  requirePermission(user, "hrm.payroll.configure");
  const config = await settings(db), values = validatePolicyInput(input);
  const payload = { ...values };
  const replay = await replayCommand(db, user, key, "payroll_policy_create", payload);
  if (replay) return replay;
  if (!config.legal_entity || values.entity !== config.legal_entity) throw new HrmError("hrm_entity_unconfigured", 409);
  const latest = await db.prepare("SELECT MAX(revision) AS revision FROM hrm_payroll_policy_versions WHERE policy_key=?").bind(values.policyKey).first<{ revision: number | null }>();
  const revision = (latest?.revision ?? 0) + 1, policyId = id("paypolicy"), time = now();
  return command(db, user, key, "payroll_policy_create", payload, policyId, [
    guardBoolean(db, "NOT EXISTS (SELECT 1 FROM hrm_payroll_policy_versions WHERE policy_key=? AND revision=?)", [values.policyKey, revision]),
    guardBoolean(db, "EXISTS (SELECT 1 FROM hrm_settings WHERE id=1 AND legal_entity=?)", [values.entity]),
  ], [
    db.prepare("INSERT INTO hrm_payroll_policy_versions(id,policy_key,revision,title_en,title_vi,legal_entity,currency,minor_unit_scale,components_json,state,created_by,created_at,version,actor_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'draft',?,?,1,?,?)").bind(policyId, values.policyKey, revision, values.titleEn, values.titleVi, values.entity, values.currency, values.minorUnitScale, values.componentsJson, user.id, time, user.id, time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'payroll_policy_created',?,?,?)").bind(user.id, policyId, JSON.stringify({ policy_key: values.policyKey, revision, component_count: values.components.length, currency: values.currency }), time),
  ]);
}

export async function reviewPayrollPolicy(db: D1Database, user: WorkspaceUser, key: string, policyId: string, expectedVersion: number, approve: boolean, reason: string): Promise<void> {
  requirePermission(user, "hrm.payroll.review");
  const cleanReason = safeText(reason, 500), row = await db.prepare("SELECT id,version,state,created_by FROM hrm_payroll_policy_versions WHERE id=?").bind(policyId).first<{ id: string; version: number; state: string; created_by: string }>();
  if (!row) throw new HrmError("not_found", 404);
  if (row.created_by === user.id) throw new HrmError("self_approval", 403);
  const next = approve ? "reviewed" : "rejected", time = now(), payload = { policyId, expectedVersion, approve, reason: cleanReason };
  await command(db, user, key, "payroll_policy_review", payload, policyId, [
    guardBoolean(db, "EXISTS (SELECT 1 FROM hrm_payroll_policy_versions WHERE id=? AND version=? AND state='draft' AND created_by!=?)", [policyId, expectedVersion, user.id]),
  ], [
    db.prepare("UPDATE hrm_payroll_policy_versions SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='draft'").bind(next, user.id, time, cleanReason, user.id, time, policyId, expectedVersion),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,?,?,?,?)").bind(user.id, approve ? "payroll_policy_reviewed" : "payroll_policy_rejected", policyId, JSON.stringify({ reason_recorded: true }), time),
  ]);
}

export async function activatePayrollPolicy(db: D1Database, user: WorkspaceUser, key: string, policyId: string, expectedVersion: number): Promise<void> {
  requirePermission(user, "hrm.payroll.approve");
  live(user);
  const row = await db.prepare("SELECT id,policy_key,version,state,created_by,reviewed_by FROM hrm_payroll_policy_versions WHERE id=?").bind(policyId).first<Pick<PayrollPolicy, "id" | "policy_key" | "version" | "state" | "created_by" | "reviewed_by">>();
  if (!row) throw new HrmError("not_found", 404);
  if (row.created_by === user.id || !row.reviewed_by) throw new HrmError("payroll_policy_review_required", 403);
  const time = now(), payload = { policyId, expectedVersion, policyKey: row.policy_key };
  if (await replayCommand(db, user, key, "payroll_policy_activate", payload)) return;
  const old = await db.prepare("SELECT id FROM hrm_payroll_policy_versions WHERE policy_key=? AND state='active' AND id!=?").bind(row.policy_key, policyId).first<{ id: string }>();
  const writes: D1PreparedStatement[] = [];
  if (old) writes.push(db.prepare("UPDATE hrm_payroll_policy_versions SET state='retired',version=version+1,actor_id=?,updated_at=? WHERE id=? AND state='active'").bind(user.id, time, old.id));
  writes.push(
    db.prepare("UPDATE hrm_payroll_policy_versions SET state='active',activated_by=?,activated_at=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='reviewed'").bind(user.id, time, user.id, time, policyId, expectedVersion),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'payroll_policy_activated',?,?,?)").bind(user.id, policyId, JSON.stringify({ policy_key: row.policy_key }), time),
  );
  await command(db, user, key, "payroll_policy_activate", payload, policyId, [
    guardBoolean(db, "EXISTS (SELECT 1 FROM hrm_payroll_policy_versions WHERE id=? AND version=? AND state='reviewed' AND created_by!=?)", [policyId, expectedVersion, user.id]),
    guardBoolean(db, "EXISTS (SELECT 1 FROM hrm_settings WHERE id=1 AND enabled=1 AND reviewed_by IS NOT NULL)", []),
  ], writes);
}

export async function listPayrollPolicies(db: D1Database, user: WorkspaceUser): Promise<PayrollPolicy[]> {
  if (!user.can("hrm.payroll.read") && !user.can("hrm.payroll.configure")) throw new HrmError("forbidden", 403);
  return (await db.prepare("SELECT * FROM hrm_payroll_policy_versions ORDER BY policy_key,revision DESC LIMIT 100").all<PayrollPolicy>()).results;
}

export async function listLockedPayrollPeriods(db: D1Database, user: WorkspaceUser) {
  requirePermission(user, "hrm.payroll.prepare"); live(user);
  return (await db.prepare("SELECT id,period_key,starts_on,ends_on,snapshot_checksum,version FROM hrm_time_periods WHERE state='locked' ORDER BY starts_on DESC LIMIT 36").all<{ id: string; period_key: string; starts_on: string; ends_on: string; snapshot_checksum: string; version: number }>()).results;
}

export async function createPayrollRun(db: D1Database, user: WorkspaceUser, key: string, policyVersionId: string, periodId: string, correctionOfSlipId = "", reason = ""): Promise<string> {
  requirePermission(user, "hrm.payroll.prepare"); live(user);
  const cleanReason = correctionOfSlipId ? safeText(reason, 500) : "";
  const payload = { policyVersionId, periodId, correctionOfSlipId: correctionOfSlipId || null, reason: cleanReason };
  const replay = await replayCommand(db, user, key, "payroll_run_create", payload);
  if (replay) return replay;
  const policy = await db.prepare("SELECT * FROM hrm_payroll_policy_versions WHERE id=? AND state IN ('active','retired')").bind(policyVersionId).first<PayrollPolicy>();
  if (!policy) throw new HrmError("payroll_policy_not_active", 409);
  const config = await settings(db);
  if (!config.legal_entity || config.legal_entity !== policy.legal_entity) throw new HrmError("hrm_entity_unconfigured", 409);
  const period = await db.prepare("SELECT id,period_key,starts_on,ends_on,state,snapshot_checksum FROM hrm_time_periods WHERE id=?").bind(periodId).first<{ id: string; period_key: string; starts_on: string; ends_on: string; state: string; snapshot_checksum: string | null }>();
  if (!period || period.state !== "locked" || !period.snapshot_checksum) throw new HrmError("payroll_time_period_not_locked", 409);
  type CorrectionSource = { id: string; state: string; person_id: string; run_id: string; policy_version_id: string; period_id: string };
  let correction: CorrectionSource | null = null;
  if (correctionOfSlipId) {
    correction = await db.prepare("SELECT s.id,s.state,s.person_id,s.run_id,r.policy_version_id,r.period_id FROM hrm_payslips s JOIN hrm_payroll_runs r ON r.id=s.run_id WHERE s.id=?").bind(correctionOfSlipId).first<CorrectionSource>();
    if (!correction || correction.state !== "published" || correction.policy_version_id !== policyVersionId || correction.period_id !== periodId) throw new HrmError("payroll_correction_source_invalid", 409);
  } else if (policy.state !== "active") throw new HrmError("payroll_policy_not_active", 409);
  const runId = id("payrun"), time = now();
  const writes: D1PreparedStatement[] = [
    db.prepare("INSERT INTO hrm_payroll_runs(id,period_key,period_id,starts_on,ends_on,policy_version_id,adjustment_of_payslip_id,reason,state,version,created_by,created_at,actor_id,updated_at) VALUES(?,?,?,?,?,?,?,?, 'draft',1,?,?,?,?)").bind(runId, period.period_key, period.id, period.starts_on, period.ends_on, policy.id, correctionOfSlipId || null, cleanReason, user.id, time, user.id, time),
  ];
  if (correction) {
    writes.push(db.prepare("INSERT INTO hrm_payroll_run_people(id,run_id,person_id,employment_id,employee_code_snapshot,display_name_snapshot) SELECT 'prp_'||lower(hex(randomblob(16))),?,rp.person_id,rp.employment_id,rp.employee_code_snapshot,rp.display_name_snapshot FROM hrm_payslips s JOIN hrm_payroll_run_people rp ON rp.id=s.run_person_id WHERE s.id=?").bind(runId, correction.id));
  } else {
    writes.push(db.prepare("INSERT INTO hrm_payroll_run_people(id,run_id,person_id,employment_id,employee_code_snapshot,display_name_snapshot) SELECT 'prp_'||lower(hex(randomblob(16))),?,p.id,e.id,p.employee_code,COALESCE(NULLIF(p.preferred_name,''),p.legal_name) FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id WHERE e.legal_entity=? AND e.status IN ('probation','active','notice') AND (e.started_on IS NULL OR e.started_on<=?) AND (e.ended_on IS NULL OR e.ended_on>=?) AND NOT EXISTS(SELECT 1 FROM hrm_employments newer WHERE newer.person_id=p.id AND newer.started_on>e.started_on AND newer.started_on<=?)").bind(runId, policy.legal_entity, period.ends_on, period.starts_on, period.ends_on));
  }
  writes.push(db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'payroll_run_created',?,?,?)").bind(user.id, runId, JSON.stringify({ period_key: period.period_key, policy_version_id: policy.id, correction: Boolean(correction) }), time));
  const rosterGuard = correction
    ? guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_payslips s JOIN hrm_payroll_runs r ON r.id=s.run_id WHERE s.id=? AND s.state='published' AND r.period_id=? AND r.policy_version_id=?)", [correction.id, periodId, policy.id])
    : guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_employments e WHERE e.legal_entity=? AND e.status IN ('probation','active','notice') AND (e.started_on IS NULL OR e.started_on<=?) AND (e.ended_on IS NULL OR e.ended_on>=?))", [policy.legal_entity, period.ends_on, period.starts_on]);
  return command(db, user, key, "payroll_run_create", payload, runId, [
    guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_time_periods WHERE id=? AND state='locked' AND snapshot_checksum IS NOT NULL)", [periodId]),
    rosterGuard,
    correction ? guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_payslips WHERE id=? AND state='published')", [correction.id]) : guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_payroll_policy_versions WHERE id=? AND state='active')", [policy.id]),
  ], writes);
}

async function loadRun(db: D1Database, runId: string) {
  const run = await db.prepare("SELECT * FROM hrm_payroll_runs WHERE id=?").bind(runId).first<PayrollRun>();
  if (!run) throw new HrmError("not_found", 404);
  const policy = await db.prepare("SELECT * FROM hrm_payroll_policy_versions WHERE id=?").bind(run.policy_version_id).first<PayrollPolicy>();
  if (!policy) throw new HrmError("payroll_policy_missing", 409);
  const people = (await db.prepare("SELECT * FROM hrm_payroll_run_people WHERE run_id=? ORDER BY employee_code_snapshot,person_id").bind(runId).all<Omit<PayrollPerson, "lines">>()).results;
  const lines = (await db.prepare("SELECT l.*,rp.person_id FROM hrm_payroll_lines l JOIN hrm_payroll_run_people rp ON rp.id=l.run_person_id WHERE rp.run_id=? ORDER BY rp.employee_code_snapshot,l.component_code").bind(runId).all<PayrollLine & { person_id: string }>()).results;
  return { run, policy, people: people.map(person => ({ ...person, lines: lines.filter(line => line.person_id === person.person_id).map(({ person_id: _personId, ...line }) => line) })) };
}

export async function payrollRun(db: D1Database, user: WorkspaceUser, runId: string) {
  requirePermission(user, "hrm.payroll.read"); live(user);
  const result = await loadRun(db, runId);
  await audit(db, user, "payroll_run_read", null, runId, { state: result.run.state, input_revision: result.run.input_revision, employee_count: result.people.length });
  return result;
}

export async function listPayrollRuns(db: D1Database, user: WorkspaceUser): Promise<Array<PayrollRun & { employee_count: number }>> {
  requirePermission(user, "hrm.payroll.read"); live(user);
  const runs = (await db.prepare("SELECT r.*,COUNT(p.id) AS employee_count FROM hrm_payroll_runs r LEFT JOIN hrm_payroll_run_people p ON p.run_id=r.id GROUP BY r.id ORDER BY r.created_at DESC LIMIT 50").all<PayrollRun & { employee_count: number }>()).results;
  await audit(db, user, "payroll_runs_listed", null, user.id, { count: runs.length });
  return runs;
}

export async function setPayrollLine(db: D1Database, user: WorkspaceUser, key: string, input: { runId: string; personId: string; expectedVersion: number; componentCode: string; amountMinor: string; sourceKind: PayrollSourceKind; sourceReference: string; zeroReason: string }): Promise<string> {
  requirePermission(user, "hrm.payroll.prepare"); live(user);
  const { run, policy, people } = await loadRun(db, input.runId);
  if (["published", "closed"].includes(run.state)) throw new HrmError("payroll_run_immutable", 409);
  const person = people.find(row => row.person_id === input.personId);
  if (!person) throw new HrmError("not_found", 404);
  const components = parsePayrollComponents(policy.components_json), component = components.find(value => value.code === input.componentCode);
  if (!component || component.source_kind !== input.sourceKind) throw new HrmError("payroll_component_invalid", 422);
  const amount = parseMinorAmount(input.amountMinor), sourceReference = safeText(input.sourceReference, 200), zeroReason = safeText(input.zeroReason, 300, false);
  if (amount === 0 && !zeroReason) throw new HrmError("payroll_zero_reason_required");
  if (input.sourceKind === "employment_record" && sourceReference !== person.employment_id) throw new HrmError("payroll_source_reference_invalid", 409);
  if (input.sourceKind === "locked_time" && sourceReference !== run.period_id) throw new HrmError("payroll_source_reference_invalid", 409);
  if (input.sourceKind === "approved_adjustment") {
    const source = await db.prepare("SELECT a.id FROM hrm_time_adjustments a JOIN hrm_time_entries e ON e.id=a.entry_id WHERE a.id=? AND a.state='approved' AND e.person_id=? AND e.period_id=?").bind(sourceReference, person.person_id, run.period_id).first<{ id: string }>();
    if (!source) throw new HrmError("payroll_source_reference_invalid", 409);
  }
  const existing = person.lines.find(line => line.component_code === component.code), lineId = existing?.id ?? id("payline"), time = now();
  const payload = { runId: run.id, personId: person.person_id, expectedVersion: input.expectedVersion, component, amount, sourceReference, zeroReason };
  const replay = await replayCommand(db, user, key, "payroll_line_set", payload);
  if (replay) return replay;
  if (run.version !== input.expectedVersion) throw new HrmError("conflict", 409);
  await command(db, user, key, "payroll_line_set", payload, lineId, [
    guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_payroll_runs WHERE id=? AND version=? AND state NOT IN ('published','closed'))", [run.id, input.expectedVersion]),
    guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_payroll_run_people WHERE run_id=? AND person_id=?)", [run.id, person.person_id]),
  ], [
    db.prepare("UPDATE hrm_payroll_runs SET state='draft',input_revision=input_revision+1,snapshot_json=NULL,snapshot_checksum=NULL,version=version+1,reviewed_by=NULL,reviewed_at=NULL,review_reason=NULL,approved_by=NULL,approved_at=NULL,approval_reason=NULL,actor_id=?,updated_at=? WHERE id=? AND version=? AND state NOT IN ('published','closed')").bind(user.id, time, run.id, input.expectedVersion),
    db.prepare("UPDATE hrm_payroll_run_people SET gross_minor=NULL,deductions_minor=NULL,net_minor=NULL WHERE run_id=?").bind(run.id),
    db.prepare("INSERT INTO hrm_payroll_lines(id,run_person_id,component_code,title_en,title_vi,direction,amount_minor,source_kind,source_reference,zero_reason,actor_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(run_person_id,component_code) DO UPDATE SET title_en=excluded.title_en,title_vi=excluded.title_vi,direction=excluded.direction,amount_minor=excluded.amount_minor,source_kind=excluded.source_kind,source_reference=excluded.source_reference,zero_reason=excluded.zero_reason,actor_id=excluded.actor_id,updated_at=excluded.updated_at").bind(lineId, person.id, component.code, component.title_en, component.title_vi, component.direction, amount, component.source_kind, sourceReference, zeroReason, user.id, time, time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'payroll_input_changed',?,?,?,?)").bind(user.id, person.person_id, run.id, JSON.stringify({ component_code: component.code, direction: component.direction, source_kind: component.source_kind }), time),
  ]);
  return lineId;
}

export async function calculatePayrollRun(db: D1Database, user: WorkspaceUser, key: string, runId: string, expectedVersion: number): Promise<void> {
  requirePermission(user, "hrm.payroll.prepare"); live(user);
  const { run, policy, people } = await loadRun(db, runId);
  const priorSnapshot = run.snapshot_checksum;
  if (priorSnapshot) {
    const replay = await replayCommand(db, user, key, "payroll_run_calculate", { runId, expectedVersion, checksum: priorSnapshot });
    if (replay) return;
  }
  if (run.state !== "draft" || run.version !== expectedVersion) throw new HrmError("conflict", 409);
  const period = await db.prepare("SELECT state,snapshot_checksum FROM hrm_time_periods WHERE id=?").bind(run.period_id).first<{ state: string; snapshot_checksum: string | null }>();
  if (!period || period.state !== "locked" || !period.snapshot_checksum) throw new HrmError("payroll_time_period_not_locked", 409);
  const components = parsePayrollComponents(policy.components_json), componentMap = new Map(components.map(component => [component.code, component]));
  if (people.length < 1) throw new HrmError("payroll_roster_empty", 409);
  const snapshots: Array<Record<string, unknown>> = [], writes: D1PreparedStatement[] = [];
  for (const person of people) {
    const lineCodes = new Set(person.lines.map(line => line.component_code));
    for (const component of components) if (component.required && !lineCodes.has(component.code)) throw new HrmError("payroll_inputs_incomplete", 409);
    for (const line of person.lines) {
      const component = componentMap.get(line.component_code);
      if (!component || component.direction !== line.direction || component.source_kind !== line.source_kind || line.amount_minor === 0 && !line.zero_reason.trim()) throw new HrmError("payroll_inputs_invalid", 409);
    }
    const totals = calculatePayrollTotals(person.lines);
    snapshots.push({ person_id: person.person_id, employment_id: person.employment_id, employee_code: person.employee_code_snapshot, display_name: person.display_name_snapshot, lines: person.lines.map(line => ({ component_code: line.component_code, title_en: line.title_en, title_vi: line.title_vi, direction: line.direction, amount_minor: line.amount_minor, source_kind: line.source_kind, source_reference: line.source_reference, zero_reason: line.zero_reason })), ...totals });
    writes.push(db.prepare("UPDATE hrm_payroll_run_people SET gross_minor=?,deductions_minor=?,net_minor=? WHERE id=? AND run_id=?").bind(totals.gross_minor, totals.deductions_minor, totals.net_minor, person.id, run.id));
  }
  const snapshot = { version: 1, run_id: run.id, period_key: run.period_key, period_id: run.period_id, starts_on: run.starts_on, ends_on: run.ends_on, time_snapshot_checksum: period.snapshot_checksum, policy: { id: policy.id, key: policy.policy_key, revision: policy.revision, title_en: policy.title_en, title_vi: policy.title_vi, legal_entity: policy.legal_entity, currency: policy.currency, minor_unit_scale: policy.minor_unit_scale, rounding_policy: policy.rounding_policy, components }, correction_of_payslip_id: run.adjustment_of_payslip_id, reason: run.reason, people: snapshots };
  const snapshotJson = JSON.stringify(snapshot), checksum = await digest(snapshotJson), time = now(), payload = { runId, expectedVersion, checksum };
  writes.push(
    db.prepare("UPDATE hrm_payroll_runs SET state='calculated',snapshot_json=?,snapshot_checksum=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='draft'").bind(snapshotJson, checksum, user.id, time, run.id, expectedVersion),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'payroll_run_calculated',?,?,?)").bind(user.id, run.id, JSON.stringify({ checksum, employee_count: people.length, policy_version_id: policy.id, time_snapshot_checksum: period.snapshot_checksum }), time),
  );
  await command(db, user, key, "payroll_run_calculate", payload, run.id, [
    guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_payroll_runs WHERE id=? AND version=? AND state='draft')", [run.id, expectedVersion]),
    guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_time_periods WHERE id=? AND state='locked' AND snapshot_checksum=?)", [run.period_id, period.snapshot_checksum]),
  ], writes);
}

async function transitionRun(db: D1Database, user: WorkspaceUser, key: string, runId: string, expectedVersion: number, stage: "review" | "approve", reason: string): Promise<void> {
  const permission = stage === "review" ? "hrm.payroll.review" : "hrm.payroll.approve";
  requirePermission(user, permission); live(user);
  const cleanReason = safeText(reason, 500), { run } = await loadRun(db, runId);
  const time = now(), state = stage === "review" ? "reviewed" : "approved", field = stage === "review" ? "reviewed" : "approved", reasonField = stage === "review" ? "review_reason" : "approval_reason";
  const payload = { runId, expectedVersion, stage, reason: cleanReason };
  if (await replayCommand(db, user, key, `payroll_run_${stage}`, payload)) return;
  if (run.version !== expectedVersion || stage === "review" && run.state !== "calculated" || stage === "approve" && (run.state !== "reviewed" || !run.reviewed_by)) throw new HrmError("conflict", 409);
  if (run.created_by === user.id) throw new HrmError("self_approval", 403);
  await command(db, user, key, `payroll_run_${stage}`, payload, run.id, [
    guardBoolean(db, `EXISTS(SELECT 1 FROM hrm_payroll_runs WHERE id=? AND version=? AND state='${stage === "review" ? "calculated" : "reviewed"}' AND created_by!=? AND snapshot_checksum IS NOT NULL)`, [run.id, expectedVersion, user.id]),
  ], [
    db.prepare(`UPDATE hrm_payroll_runs SET state=?,${field}_by=?,${field}_at=?,${reasonField}=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=?`).bind(state, user.id, time, cleanReason, user.id, time, run.id, expectedVersion),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,?,?, ?,?)").bind(user.id, `payroll_run_${stage}`, run.id, JSON.stringify({ reason_recorded: true }), time),
  ]);
}
export const reviewPayrollRun = (db: D1Database, user: WorkspaceUser, key: string, runId: string, expectedVersion: number, reason: string) => transitionRun(db, user, key, runId, expectedVersion, "review", reason);
export const approvePayrollRun = (db: D1Database, user: WorkspaceUser, key: string, runId: string, expectedVersion: number, reason: string) => transitionRun(db, user, key, runId, expectedVersion, "approve", reason);

export async function publishPayrollRun(db: D1Database, user: WorkspaceUser, key: string, runId: string, expectedVersion: number): Promise<void> {
  requirePermission(user, "hrm.payroll.publish"); live(user);
  const { run, policy, people } = await loadRun(db, runId);
  const stablePayload = { runId, expectedVersion, checksum: run.snapshot_checksum };
  if (run.snapshot_checksum && await replayCommand(db, user, key, "payroll_run_publish", stablePayload)) return;
  if (run.state !== "approved" || run.version !== expectedVersion || !run.approved_by || run.approved_by === run.created_by || !run.snapshot_json || !run.snapshot_checksum) throw new HrmError("payroll_publish_blocked", 409);
  const parsed = JSON.parse(run.snapshot_json) as { people: Array<Record<string, unknown>>; time_snapshot_checksum: string };
  const lockedTime = await db.prepare("SELECT state,snapshot_checksum FROM hrm_time_periods WHERE id=?").bind(run.period_id).first<{ state: string; snapshot_checksum: string | null }>();
  if (!lockedTime || lockedTime.state !== "locked" || lockedTime.snapshot_checksum !== parsed.time_snapshot_checksum) throw new HrmError("payroll_time_period_not_locked", 409);
  if (parsed.people.length !== people.length) throw new HrmError("payroll_snapshot_invalid", 409);
  const previous: string | null = run.adjustment_of_payslip_id;
  let paidCarryover = 0;
  if (previous) {
    const original = await db.prepare("SELECT state,person_id,snapshot_json FROM hrm_payslips WHERE id=?").bind(previous).first<{ state: string; person_id: string; snapshot_json: string }>();
    if (!original || original.state !== "published" || people.length !== 1 || people[0].person_id !== original.person_id) throw new HrmError("payroll_correction_source_invalid", 409);
    const originalSnapshot = JSON.parse(original.snapshot_json) as { paid_carryover_minor?: number };
    const originalPayments = await db.prepare("SELECT COALESCE(SUM(amount_minor),0) AS amount FROM hrm_payroll_payments WHERE payslip_id=?").bind(previous).first<{ amount: number }>();
    paidCarryover = (originalSnapshot.paid_carryover_minor ?? 0) + (originalPayments?.amount ?? 0);
    if (!Number.isSafeInteger(paidCarryover) || paidCarryover < 0) throw new HrmError("payroll_snapshot_invalid", 409);
  }
  const time = now(), slips = [] as Array<{ id: string; run_id: string; run_person_id: string; person_id: string; supersedes_payslip_id: string | null; state: string; snapshot_json: string; snapshot_checksum: string; issued_by: string; issued_at: string }>;
  for (const person of people) {
    const item = parsed.people.find(value => value.person_id === person.person_id);
    if (!item) throw new HrmError("payroll_snapshot_invalid", 409);
    const priorPaid = previous ? paidCarryover : 0;
    if (priorPaid > Number(item.net_minor)) throw new HrmError("payroll_correction_paid_exceeds_net", 409);
    const snapshotJson = JSON.stringify({ version: 1, policy: { id: policy.id, title_en: policy.title_en, title_vi: policy.title_vi, legal_entity: policy.legal_entity, currency: policy.currency, minor_unit_scale: policy.minor_unit_scale, revision: policy.revision }, period_key: run.period_key, starts_on: run.starts_on, ends_on: run.ends_on, employee_code: person.employee_code_snapshot, display_name: person.display_name_snapshot, correction_of_payslip_id: previous, paid_carryover_minor: priorPaid, lines: item.lines, gross_minor: item.gross_minor, deductions_minor: item.deductions_minor, net_minor: item.net_minor });
    slips.push({ id: id("payslip"), run_id: run.id, run_person_id: person.id, person_id: person.person_id, supersedes_payslip_id: previous, state: "published", snapshot_json: snapshotJson, snapshot_checksum: await digest(snapshotJson), issued_by: user.id, issued_at: time });
  }
  const payload = stablePayload, json = JSON.stringify(slips);
  const writes: D1PreparedStatement[] = [];
  if (previous) writes.push(db.prepare("UPDATE hrm_payslips SET state='superseded' WHERE id=? AND state='published'").bind(previous));
  writes.push(
    db.prepare("INSERT INTO hrm_payslips(id,run_id,run_person_id,person_id,supersedes_payslip_id,state,snapshot_json,snapshot_checksum,issued_by,issued_at) SELECT json_extract(value,'$.id'),json_extract(value,'$.run_id'),json_extract(value,'$.run_person_id'),json_extract(value,'$.person_id'),json_extract(value,'$.supersedes_payslip_id'),json_extract(value,'$.state'),json_extract(value,'$.snapshot_json'),json_extract(value,'$.snapshot_checksum'),json_extract(value,'$.issued_by'),json_extract(value,'$.issued_at') FROM json_each(?)").bind(json),
    db.prepare("UPDATE hrm_payroll_runs SET state='published',published_by=?,published_at=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='approved'").bind(user.id, time, user.id, time, run.id, expectedVersion),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'payslips_published',?,?,?)").bind(user.id, run.id, JSON.stringify({ count: slips.length, correction_of: previous }), time),
  );
  await command(db, user, key, "payroll_run_publish", payload, run.id, [
    guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_payroll_runs r JOIN hrm_time_periods t ON t.id=r.period_id WHERE r.id=? AND r.version=? AND r.state='approved' AND r.approved_by IS NOT NULL AND r.approved_by!=r.created_by AND r.snapshot_checksum=? AND t.state='locked' AND t.snapshot_checksum=json_extract(r.snapshot_json,'$.time_snapshot_checksum'))", [run.id, expectedVersion, run.snapshot_checksum]),
    // A historical correction retains the issued source's exact person,
    // employment, policy and period. It never enrolls ended staff into a
    // regular run or restores their Workspace/self-service access.
    previous ? guardBoolean(db, `EXISTS(SELECT 1 FROM hrm_payslips original
      JOIN hrm_payroll_run_people source ON source.id=original.run_person_id
      JOIN hrm_payroll_runs source_run ON source_run.id=original.run_id
      JOIN hrm_payroll_run_people target ON target.run_id=? AND target.person_id=source.person_id AND target.employment_id=source.employment_id
      WHERE original.id=? AND original.state='published' AND source_run.period_id=? AND source_run.policy_version_id=?
      AND (SELECT COUNT(*) FROM hrm_payroll_run_people WHERE run_id=?)=1)`,[run.id,previous,run.period_id,run.policy_version_id,run.id])
      : guardBoolean(db, "NOT EXISTS(SELECT 1 FROM hrm_payroll_run_people rp JOIN hrm_employments e ON e.id=rp.employment_id WHERE rp.run_id=? AND e.status='ended')", [run.id]),
    ...(previous ? [
      guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_payslips WHERE id=? AND state='published')", [previous]),
      // The payment total was read before the publish batch. Assert it is still
      // the observed total in the same transaction that supersedes the source
      // slip, so a concurrent payment is either carried forward or rejected.
      guardBoolean(db, "COALESCE(CAST(json_extract((SELECT snapshot_json FROM hrm_payslips WHERE id=?),'$.paid_carryover_minor') AS INTEGER),0)+COALESCE((SELECT SUM(amount_minor) FROM hrm_payroll_payments WHERE payslip_id=?),0)=?", [previous, previous, paidCarryover]),
    ] : []),
  ], writes);
}

export async function confirmPayrollPayment(db: D1Database, user: WorkspaceUser, key: string, input: { payslipId: string; amountMinor: string; paidOn: string; paymentReference: string; evidenceReference: string }): Promise<string> {
  requirePermission(user, "hrm.payroll.payment.confirm"); live(user);
  const amount = parseMinorAmount(input.amountMinor), paidOn = safeText(input.paidOn, 10), reference = safeText(input.paymentReference, 200), evidence = safeText(input.evidenceReference, 200);
  date(paidOn);
  if (paidOn > localDate()) throw new HrmError("payroll_payment_date_future", 422);
  if (amount <= 0) throw new HrmError("payroll_amount_invalid");
  const slip = await db.prepare("SELECT s.id,s.state,s.person_id,s.snapshot_json,r.created_by FROM hrm_payslips s JOIN hrm_payroll_runs r ON r.id=s.run_id WHERE s.id=?").bind(input.payslipId).first<{ id: string; state: string; person_id: string; snapshot_json: string; created_by: string }>();
  if (!slip) throw new HrmError("not_found", 404);
  if (slip.created_by === user.id) throw new HrmError("self_approval", 403);
  const snapshot = JSON.parse(slip.snapshot_json) as { policy: { currency: string }; net_minor: number; paid_carryover_minor?: number };
  const paymentId = id("paypayment"), time = now(), payload = { payslipId: slip.id, amount, paidOn, reference, evidence, currency: snapshot.policy.currency };
  const replay = await replayCommand(db, user, key, "payroll_payment_confirm", payload);
  if (replay) return replay;
  if (slip.state !== "published") throw new HrmError("not_found", 404);
  const paid = await db.prepare("SELECT COALESCE(SUM(amount_minor),0) AS amount FROM hrm_payroll_payments WHERE payslip_id=?").bind(slip.id).first<{ amount: number }>();
  const paidToDate = (snapshot.paid_carryover_minor ?? 0) + (paid?.amount ?? 0);
  if (!Number.isSafeInteger(paidToDate) || paidToDate + amount > snapshot.net_minor) throw new HrmError("payroll_payment_exceeds_balance", 409);
  return command(db, user, key, "payroll_payment_confirm", payload, paymentId, [
    guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_payslips s JOIN hrm_payroll_runs r ON r.id=s.run_id WHERE s.id=? AND s.state='published' AND r.created_by!=?)", [slip.id, user.id]),
    guardBoolean(db, "(SELECT COALESCE(SUM(amount_minor),0)+COALESCE(CAST(json_extract((SELECT snapshot_json FROM hrm_payslips WHERE id=?),'$.paid_carryover_minor') AS INTEGER),0)+? FROM hrm_payroll_payments WHERE payslip_id=?) <= CAST(json_extract((SELECT snapshot_json FROM hrm_payslips WHERE id=?),'$.net_minor') AS INTEGER)", [slip.id, amount, slip.id, slip.id]),
  ], [
    db.prepare("INSERT INTO hrm_payroll_payments(id,payslip_id,amount_minor,paid_on,payment_reference,evidence_reference,confirmed_by,confirmed_at,request_key) VALUES(?,?,?,?,?,?,?,?,?)").bind(paymentId, slip.id, amount, paidOn, reference, evidence, user.id, time, key),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'payroll_payment_confirmed',?,?,?)").bind(user.id, slip.id, JSON.stringify({ evidence_reference_recorded: true }), time),
  ]);
}

/** One predicate serves the UI and the atomic close command. Missing issued
 * amounts are unknown; correction carryover counts once, on the latest leaf. */
const reconciledRunSql = `WITH RECURSIVE target AS (
  SELECT id FROM hrm_payroll_runs WHERE id=? AND state IN ('published','closed')
), chain(root_id,slip_id) AS (
  SELECT s.id,s.id FROM hrm_payslips s JOIN target ON target.id=s.run_id
  UNION ALL
  SELECT chain.root_id,child.id FROM hrm_payslips child JOIN chain ON child.supersedes_payslip_id=chain.slip_id
), leaf AS (
  SELECT chain.slip_id FROM chain WHERE NOT EXISTS(SELECT 1 FROM hrm_payslips child WHERE child.supersedes_payslip_id=chain.slip_id)
)
SELECT CASE WHEN EXISTS(SELECT 1 FROM target)
  AND EXISTS(SELECT 1 FROM chain)
  AND NOT EXISTS(SELECT 1 FROM hrm_payroll_run_people rp JOIN target ON target.id=rp.run_id
    WHERE NOT EXISTS(SELECT 1 FROM hrm_payslips s WHERE s.run_person_id=rp.id AND s.run_id=rp.run_id AND s.person_id=rp.person_id))
  AND NOT EXISTS(SELECT 1 FROM leaf JOIN hrm_payslips s ON s.id=leaf.slip_id
    WHERE s.state!='published'
    OR json_type(s.snapshot_json,'$.net_minor') IS NOT 'integer'
    OR json_extract(s.snapshot_json,'$.net_minor') NOT BETWEEN 0 AND 9007199254740991
    OR (json_type(s.snapshot_json,'$.paid_carryover_minor') IS NOT NULL AND (
      json_type(s.snapshot_json,'$.paid_carryover_minor') IS NOT 'integer'
      OR json_extract(s.snapshot_json,'$.paid_carryover_minor') NOT BETWEEN 0 AND 9007199254740991))
    OR COALESCE((SELECT SUM(amount_minor) FROM hrm_payroll_payments p WHERE p.payslip_id=s.id),0)
      +COALESCE(json_extract(s.snapshot_json,'$.paid_carryover_minor'),0)!=json_extract(s.snapshot_json,'$.net_minor'))
  THEN 1 ELSE 0 END AS ready`;

export async function closePayrollRun(db: D1Database, user: WorkspaceUser, key: string, runId: string, expectedVersion: number, reason: string): Promise<void> {
  requirePermission(user, "hrm.payroll.approve"); live(user);
  const cleanReason = safeText(reason, 500), { run } = await loadRun(db, runId);
  const payload = { runId, expectedVersion, reason: cleanReason };
  if (await replayCommand(db, user, key, "payroll_run_close", payload)) return;
  if (run.state !== "published" || run.version !== expectedVersion) throw new HrmError("conflict", 409);
  if (!await payrollRunSettled(db, user, run.id)) throw new HrmError("payroll_payment_unreconciled", 409);
  const time = now();
  await command(db, user, key, "payroll_run_close", payload, run.id, [
    guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_payroll_runs WHERE id=? AND version=? AND state='published')", [run.id, expectedVersion]),
    guardBoolean(db, `(${reconciledRunSql})=1`, [run.id]),
  ], [
    db.prepare("UPDATE hrm_payroll_runs SET state='closed',closed_by=?,closed_at=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=?").bind(user.id, time, user.id, time, run.id, expectedVersion),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'payroll_run_closed',?,?,?)").bind(user.id, run.id, JSON.stringify({ reason_recorded: true }), time),
  ]);
}

export async function payrollRunSettled(db: D1Database, user: WorkspaceUser, runId: string): Promise<boolean> {
  requirePermission(user, "hrm.payroll.read"); live(user);
  const result = await db.prepare(reconciledRunSql).bind(runId).first<{ ready: number }>();
  return result?.ready === 1;
}

export async function listMyPayslips(db: D1Database, user: WorkspaceUser): Promise<PayrollSlip[]> {
  requirePermission(user, "hrm.payroll.self"); live(user);
  const slips = (await db.prepare("SELECT s.*,COALESCE((SELECT SUM(p.amount_minor) FROM hrm_payroll_payments p WHERE p.payslip_id=s.id),0)+COALESCE(CAST(json_extract(s.snapshot_json,'$.paid_carryover_minor') AS INTEGER),0) AS paid_minor FROM hrm_payslips s JOIN hrm_people p ON p.id=s.person_id WHERE p.user_id=? ORDER BY s.issued_at DESC LIMIT 50").bind(user.id).all<PayrollSlip>()).results;
  await audit(db, user, "my_payslips_listed", null, user.id, { count: slips.length });
  return slips;
}

export async function getPayrollSlip(db: D1Database, user: WorkspaceUser, payslipId: string) {
  const ownOnly = user.can("hrm.payroll.self") && !user.can("hrm.payroll.read");
  if (ownOnly) live(user); else { requirePermission(user, "hrm.payroll.read"); live(user); }
  const row = await db.prepare(`SELECT s.*,p.user_id,COALESCE((SELECT SUM(amount_minor) FROM hrm_payroll_payments pp WHERE pp.payslip_id=s.id),0)+COALESCE(CAST(json_extract(s.snapshot_json,'$.paid_carryover_minor') AS INTEGER),0) AS paid_minor FROM hrm_payslips s JOIN hrm_people p ON p.id=s.person_id WHERE s.id=? ${ownOnly ? "AND p.user_id=?" : ""}`).bind(...(ownOnly ? [payslipId, user.id] : [payslipId])).first<PayrollSlip & { user_id: string | null }>();
  if (!row) throw new HrmError("not_found", 404);
  await audit(db, user, "payslip_read", row.person_id, row.id, { checksum: row.snapshot_checksum });
  return row;
}

export async function createPayrollDispute(db: D1Database, user: WorkspaceUser, key: string, payslipId: string, componentCode: string, body: string): Promise<string> {
  requirePermission(user, "hrm.payroll.dispute"); live(user);
  const message = safeText(body, 2000), slip = await getPayrollSlip(db, user, payslipId), snapshot = JSON.parse(slip.snapshot_json) as { lines: Array<{ component_code: string }> };
  const component = safeText(componentCode, 40, false) || null;
  if (component && !snapshot.lines.some(line => line.component_code === component)) throw new HrmError("payroll_component_invalid", 422);
  const disputeId = id("paydispute"), eventId = id("payeve"), time = now(), payload = { payslipId, component, message };
  const replay = await replayCommand(db, user, key, "payroll_dispute_create", payload);
  if (replay) return replay;
  return command(db, user, key, "payroll_dispute_create", payload, disputeId, [
    guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_payslips s JOIN hrm_people p ON p.id=s.person_id WHERE s.id=? AND p.user_id=?)", [payslipId, user.id]),
  ], [
    db.prepare("INSERT INTO hrm_payroll_disputes(id,payslip_id,person_id,component_code,state,version,opened_by,created_at,updated_at) VALUES(?,?,?,?,'submitted',1,?,?,?)").bind(disputeId, payslipId, slip.person_id, component, user.id, time, time),
    db.prepare("INSERT INTO hrm_payroll_dispute_events(id,dispute_id,event_type,body,actor_id,created_at) VALUES(?,?,'submitted',?,?,?)").bind(eventId, disputeId, message, user.id, time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'payroll_dispute_submitted',?,?,?,?)").bind(user.id, slip.person_id, disputeId, JSON.stringify({ payslip_id: payslipId, component_code: component }), time),
  ]);
}

export async function transitionPayrollDispute(db: D1Database, user: WorkspaceUser, key: string, disputeId: string, expectedVersion: number, nextState: PayrollDispute["state"], body: string): Promise<void> {
  const message = safeText(body, 2000), row = await db.prepare("SELECT * FROM hrm_payroll_disputes WHERE id=?").bind(disputeId).first<PayrollDispute>();
  if (!row) throw new HrmError("not_found", 404);
  const payload = { disputeId, expectedVersion, nextState, message };
  const replay = await replayCommand(db, user, key, "payroll_dispute_transition", payload);
  if (replay) return;
  const employeeOwn = user.can("hrm.payroll.dispute") && !user.can("hrm.payroll.dispute.manage");
  if (employeeOwn) {
    live(user);
    const owned = await db.prepare("SELECT 1 AS ok FROM hrm_people WHERE id=? AND user_id=?").bind(row.person_id, user.id).first();
    if (!owned) throw new HrmError("not_found", 404);
    if (nextState !== "reopened" || !["resolved", "answered"].includes(row.state)) throw new HrmError("payroll_dispute_transition_invalid", 409);
  } else {
    requirePermission(user, "hrm.payroll.dispute.manage"); live(user);
    if (row.opened_by === user.id) throw new HrmError("payroll_dispute_self_review", 403);
    const allowed: Record<string, string[]> = { submitted: ["investigating"], reopened: ["investigating"], investigating: ["answered", "resolved"], answered: ["resolved"] };
    if (!(allowed[row.state] ?? []).includes(nextState) || nextState === "reopened") throw new HrmError("payroll_dispute_transition_invalid", 409);
  }
  if (row.version !== expectedVersion) throw new HrmError("conflict", 409);
  const time = now(), eventId = id("payeve");
  await command(db, user, key, "payroll_dispute_transition", payload, disputeId, [
    guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_payroll_disputes WHERE id=? AND version=? AND state=?)", [disputeId, expectedVersion, row.state]),
  ], [
    db.prepare("UPDATE hrm_payroll_disputes SET state=?,version=version+1,updated_at=? WHERE id=? AND version=?").bind(nextState, time, disputeId, expectedVersion),
    db.prepare("INSERT INTO hrm_payroll_dispute_events(id,dispute_id,event_type,body,actor_id,created_at) VALUES(?,?,?,?,?,?)").bind(eventId, disputeId, nextState, message, user.id, time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,?,?,?,?,?)").bind(user.id, `payroll_dispute_${nextState}`, row.person_id, disputeId, JSON.stringify({ previous_state: row.state }), time),
  ]);
}

export async function listPayrollDisputes(db: D1Database, user: WorkspaceUser): Promise<PayrollDispute[]> {
  if (user.can("hrm.payroll.dispute.manage")) {
    live(user);
    const disputes = (await db.prepare("SELECT d.*,CASE WHEN json_type(s.snapshot_json,'$.employee_code')='text' THEN json_extract(s.snapshot_json,'$.employee_code') END AS employee_code,CASE WHEN json_type(s.snapshot_json,'$.display_name')='text' THEN json_extract(s.snapshot_json,'$.display_name') END AS display_name_snapshot,(SELECT event_type FROM hrm_payroll_dispute_events e WHERE e.dispute_id=d.id ORDER BY created_at DESC,id DESC LIMIT 1) AS last_event,(SELECT created_at FROM hrm_payroll_dispute_events e WHERE e.dispute_id=d.id ORDER BY created_at DESC,id DESC LIMIT 1) AS last_event_at FROM hrm_payroll_disputes d JOIN hrm_payslips s ON s.id=d.payslip_id ORDER BY d.updated_at DESC LIMIT 100").all<PayrollDispute>()).results;
    await audit(db, user, "payroll_disputes_listed", null, user.id, { count: disputes.length });
    return disputes;
  }
  requirePermission(user, "hrm.payroll.dispute"); live(user);
  const disputes = (await db.prepare("SELECT d.*,(SELECT event_type FROM hrm_payroll_dispute_events e WHERE e.dispute_id=d.id ORDER BY created_at DESC,id DESC LIMIT 1) AS last_event,(SELECT created_at FROM hrm_payroll_dispute_events e WHERE e.dispute_id=d.id ORDER BY created_at DESC,id DESC LIMIT 1) AS last_event_at FROM hrm_payroll_disputes d JOIN hrm_people p ON p.id=d.person_id WHERE p.user_id=? ORDER BY d.updated_at DESC LIMIT 100").bind(user.id).all<PayrollDispute>()).results;
  await audit(db, user, "my_payroll_disputes_listed", null, user.id, { count: disputes.length });
  return disputes;
}

export async function payrollDisputeEvents(db: D1Database, user: WorkspaceUser, disputeId: string): Promise<PayrollDisputeEvent[]> {
  const row = await db.prepare("SELECT person_id FROM hrm_payroll_disputes WHERE id=?").bind(disputeId).first<{ person_id: string }>();
  if (!row) throw new HrmError("not_found", 404);
  if (user.can("hrm.payroll.dispute.manage")) { requirePermission(user, "hrm.payroll.dispute.manage"); live(user); }
  else {
    requirePermission(user, "hrm.payroll.dispute"); live(user);
    const owned = await db.prepare("SELECT 1 AS ok FROM hrm_people WHERE id=? AND user_id=?").bind(row.person_id, user.id).first();
    if (!owned) throw new HrmError("not_found", 404);
  }
  const events = (await db.prepare("SELECT * FROM hrm_payroll_dispute_events WHERE dispute_id=? ORDER BY created_at,id LIMIT 100").bind(disputeId).all<PayrollDisputeEvent>()).results;
  await audit(db, user, "payroll_dispute_history_read", row.person_id, disputeId, { count: events.length });
  return events;
}

export async function listPayrollSlipsForRun(db: D1Database, user: WorkspaceUser, runId: string) {
  requirePermission(user, "hrm.payroll.read"); live(user);
  const slips = (await db.prepare("SELECT s.*,COALESCE((SELECT SUM(amount_minor) FROM hrm_payroll_payments p WHERE p.payslip_id=s.id),0)+COALESCE(CAST(json_extract(s.snapshot_json,'$.paid_carryover_minor') AS INTEGER),0) AS paid_minor FROM hrm_payslips s WHERE s.run_id=? ORDER BY s.person_id").bind(runId).all<PayrollSlip>()).results;
  await audit(db, user, "payroll_slips_listed", null, runId, { count: slips.length });
  return slips;
}

export async function listPayrollPaymentsForRun(db: D1Database, user: WorkspaceUser, runId: string): Promise<PayrollPayment[]> {
  requirePermission(user, "hrm.payroll.read"); live(user);
  const payments = (await db.prepare("SELECT p.* FROM hrm_payroll_payments p JOIN hrm_payslips s ON s.id=p.payslip_id WHERE s.run_id=? ORDER BY p.paid_on,p.confirmed_at,p.id LIMIT 500").bind(runId).all<PayrollPayment>()).results;
  await audit(db, user, "payroll_payment_history_read", null, runId, { count: payments.length });
  return payments;
}

export type PayrollSlipLanguage = "en" | "vi";
export function payrollSlipLanguage(value: string | null): PayrollSlipLanguage {
  if (value === null || value === "en") return "en";
  if (value === "vi") return "vi";
  throw new HrmError("payroll_language_invalid", 400);
}

export function renderPayrollSlipHtml(snapshotJson: string, language: PayrollSlipLanguage = "en"): string {
  const snapshot = JSON.parse(snapshotJson) as { policy: { title_en: string; title_vi?: string; legal_entity: string; currency: string; minor_unit_scale: number }; period_key: string; starts_on: string; ends_on: string; employee_code: string; display_name: string; correction_of_payslip_id: string | null; lines: Array<{ title_en: string; title_vi?: string; direction: string; amount_minor: number }>; gross_minor: number; deductions_minor: number; net_minor: number };
  const vi = language === "vi", label = (en: string, translated: string) => vi ? translated : en;
  const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
  const title = (value: { title_en: string; title_vi?: string }) => esc(vi && value.title_vi?.trim() ? value.title_vi : value.title_en);
  const amount = (minor: number) => formatPayrollMoney(minor, snapshot.policy.currency, snapshot.policy.minor_unit_scale, language);
  const fallback = vi && [snapshot.policy, ...snapshot.lines].some(value => !value.title_vi?.trim());
  const rows = snapshot.lines.map(line => `<tr><td>${title(line)}</td><td>${line.direction === "deduction" ? label("Deduction", "Khấu trừ") : label("Earning", "Thu nhập")}</td><td class="amount">${amount(line.amount_minor)}</td></tr>`).join("");
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${label("Payslip", "Phiếu lương")} ${esc(snapshot.period_key)}</title><style>html{color-scheme:light;background:#fff}body{background:#fff;font:16px/1.5 system-ui,sans-serif;max-width:760px;margin:3rem auto;padding:0 1rem;color:#182126;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.65rem;border-bottom:1px solid #d9e0e2}.amount{white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}.table-scroll{max-width:100%;overflow-x:auto}.table-scroll:focus-visible{outline:2px solid #0068a0;outline-offset:3px}.total{font-weight:700}@media(max-width:480px){body{margin:1rem auto}}@media print{.table-scroll{overflow:visible}}</style></head><body><main><h1>${label("Payslip", "Phiếu lương")}</h1><p>${title(snapshot.policy)} · ${esc(snapshot.policy.legal_entity)}</p>${fallback ? '<p role="note">Một số mục trong snapshot đã phát hành chưa có tiếng Việt; nội dung gốc được giữ nguyên.</p>' : ""}<dl><dt>${label("Employee", "Nhân viên")}</dt><dd>${esc(snapshot.display_name)} · ${esc(snapshot.employee_code)}</dd><dt>${label("Pay period", "Kỳ lương")}</dt><dd>${esc(snapshot.period_key)} (${esc(snapshot.starts_on)} – ${esc(snapshot.ends_on)})</dd><dt>${label("Currency", "Loại tiền")}</dt><dd>${esc(snapshot.policy.currency)}</dd>${snapshot.correction_of_payslip_id ? `<dt>${label("Correction of", "Điều chỉnh cho phiếu")}</dt><dd>${esc(snapshot.correction_of_payslip_id)}</dd>` : ""}</dl><div class="table-scroll" tabindex="0" role="region" aria-label="${label("Payroll components", "Các khoản trên phiếu lương")}"><table><thead><tr><th scope="col">${label("Component", "Khoản lương")}</th><th scope="col">${label("Type", "Loại")}</th><th scope="col" class="amount">${label("Amount", "Số tiền")}</th></tr></thead><tbody>${rows}</tbody></table></div><p>${label("Gross", "Tổng thu nhập")}: ${amount(snapshot.gross_minor)}</p><p>${label("Deductions", "Tổng khấu trừ")}: ${amount(snapshot.deductions_minor)}</p><p class="total">${label("Net", "Thực nhận")}: ${amount(snapshot.net_minor)}</p><p>${label("This payslip records an issued statement. It does not confirm payment or acceptance.", "Phiếu lương này ghi nhận bản đã phát hành. Phiếu không xác nhận đã trả lương hoặc nhân viên đồng ý số tiền.")}</p></main></body></html>`;
}

/** Format integer minor units without converting financial values to binary floating point. */
export function formatPayrollMoney(amount: number, currency: string, scale: number, language: PayrollSlipLanguage = "en"): string {
  if (!Number.isSafeInteger(amount) || amount < 0 || !/^[A-Z]{3}$/.test(currency) || !Number.isInteger(scale) || scale < 0 || scale > 3) throw new HrmError("payroll_amount_invalid");
  const value = BigInt(amount), divisor = 10n ** BigInt(scale), whole = value / divisor, fraction = value % divisor;
  return `${currency} ${whole.toLocaleString(language === "vi" ? "vi-VN" : "en-US")}${scale ? `${language === "vi" ? "," : "."}${fraction.toString().padStart(scale, "0")}` : ""}`;
}

export function payrollFeatureStatus(user: WorkspaceUser) {
  return { live: user.hrmEnabled === true, canConfigure: user.can("hrm.payroll.configure"), canPrepare: user.can("hrm.payroll.prepare"), canRead: user.can("hrm.payroll.read"), canSelf: user.can("hrm.payroll.self") };
}
