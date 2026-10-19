import type { WorkspaceUser } from "../workspace/roles";
import { date, HrmError } from "./fields";
import { audit, command, digest, guardBoolean, id, now, requirePermission, settings } from "./service";

/**
 * Effective compensation that `employment_record` payroll lines must trace to
 * (spec §10.1). A version declares one exact amount per payroll period. There
 * is no proration rule: a period that a single approved version does not cover
 * in full is blocked, never estimated.
 */
export const COMPENSATION_SOURCE_KINDS = ["contract_issue", "decision_reference"] as const;
export type CompensationSourceKind = typeof COMPENSATION_SOURCE_KINDS[number];
export interface CompensationVersion {
  id: string; person_id: string; employment_id: string; legal_entity: string; component_code: string;
  currency: string; minor_unit_scale: number; amount_minor: number; cadence: string;
  effective_from: string; effective_until: string | null; source_kind: CompensationSourceKind; source_reference: string;
  basis_note: string; supersedes_id: string | null; state: "draft" | "approved" | "rejected" | "cancelled" | "superseded";
  created_by: string; created_at: string; reviewed_by: string | null; reviewed_at: string | null; review_reason: string | null;
  version: number; actor_id: string; updated_at: string;
  employee_code?: string; display_name?: string;
}
export interface CompensationInput {
  employeeCode: string; componentCode: string; currency: string; minorUnitScale: string; amountMinor: string;
  effectiveFrom: string; effectiveUntil: string; sourceKind: string; sourceReference: string; basisNote: string; supersedesId: string;
  /** Optional: a specific employment period (rehire, late final pay). Defaults to the current or most recent one. */
  employmentId?: string;
}

const MAX_MINOR = Number.MAX_SAFE_INTEGER;
const PAGE_SIZE = 50;
const live = (user: WorkspaceUser) => { if (user.hrmEnabled !== true) throw new HrmError("payroll_closed", 503); };
const clean = (value: string, max: number, required = true) => {
  const text = value.trim();
  if (text.length > max || (required && !text)) throw new HrmError("invalid_field");
  return text;
};
/** A retried command returns its first result even if prechecks would now fail. */
async function replayed(db: D1Database, user: WorkspaceUser, key: string, operation: string, payload: unknown): Promise<string | null> {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new HrmError("invalid_request_key");
  const previous = await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id, key).first<{ operation: string; payload_hash: string; result_id: string }>();
  if (!previous) return null;
  if (previous.operation !== operation || previous.payload_hash !== await digest(JSON.stringify(payload))) throw new HrmError("request_key_conflict", 409);
  return previous.result_id;
}
const dayBefore = (value: string) => new Date(Date.parse(`${value}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

export function parseCompensationInput(input: CompensationInput) {
  const componentCode = clean(input.componentCode, 40);
  if (!/^[a-z][a-z0-9_]{0,39}$/.test(componentCode)) throw new HrmError("compensation_invalid");
  const currency = clean(input.currency, 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new HrmError("invalid_currency");
  if (!/^[0-3]$/.test(input.minorUnitScale.trim())) throw new HrmError("compensation_invalid");
  if (!/^\d{1,16}$/.test(input.amountMinor.trim())) throw new HrmError("payroll_amount_invalid");
  const amount = Number(input.amountMinor.trim());
  if (!Number.isSafeInteger(amount) || amount > MAX_MINOR) throw new HrmError("payroll_amount_invalid");
  const effectiveFrom = clean(input.effectiveFrom, 10), effectiveUntil = clean(input.effectiveUntil, 10, false) || null;
  date(effectiveFrom); if (effectiveUntil) date(effectiveUntil);
  if (effectiveUntil && effectiveUntil < effectiveFrom) throw new HrmError("compensation_dates_invalid");
  const sourceKind = input.sourceKind.trim();
  if (!(COMPENSATION_SOURCE_KINDS as readonly string[]).includes(sourceKind)) throw new HrmError("compensation_source_invalid");
  return {
    employeeCode: clean(input.employeeCode, 60), componentCode, currency, minorUnitScale: Number(input.minorUnitScale.trim()), amount,
    effectiveFrom, effectiveUntil, sourceKind: sourceKind as CompensationSourceKind, sourceReference: clean(input.sourceReference, 200),
    basisNote: clean(input.basisNote, 1000), supersedesId: clean(input.supersedesId, 100, false) || null,
    employmentId: clean(input.employmentId ?? "", 100, false) || null,
  };
}

/** A completed, issued contract or addendum for the same employment. */
const contractSourceSql = `EXISTS(SELECT 1 FROM hrm_legal_issues i JOIN hrm_legal_templates t ON t.id=i.template_id
  WHERE i.id=? AND i.person_id=? AND i.employment_id=? AND i.state='completed' AND t.document_type IN ('employment_contract','contract_addendum'))`;

/** The version stays inside its employment period (re-checked at approval in case the employment ended meanwhile). */
const withinEmploymentSql = `EXISTS(SELECT 1 FROM hrm_compensation_versions v JOIN hrm_employments e ON e.id=v.employment_id
  WHERE v.id=? AND (e.started_on IS NULL OR v.effective_from>=e.started_on) AND (e.ended_on IS NULL OR (v.effective_from<=e.ended_on AND v.effective_until IS NOT NULL AND v.effective_until<=e.ended_on)))`;

export async function createCompensation(db: D1Database, user: WorkspaceUser, key: string, input: CompensationInput): Promise<string> {
  requirePermission(user, "hrm.compensation.manage"); live(user);
  const values = parseCompensationInput(input);
  const done = await replayed(db, user, key, "compensation_create", values);
  if (done) return done;
  const config = await settings(db);
  if (!config.legal_entity) throw new HrmError("hrm_entity_unconfigured", 409);
  const person = await db.prepare(`SELECT p.id AS person_id,p.user_id,e.id AS employment_id,e.legal_entity,e.started_on,e.ended_on FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id
    WHERE upper(p.employee_code)=upper(?) AND (CASE WHEN ? IS NULL THEN e.id=(SELECT e2.id FROM hrm_employments e2 WHERE e2.person_id=p.id ORDER BY CASE WHEN e2.status!='ended' THEN 0 ELSE 1 END,e2.started_on DESC,e2.created_at DESC LIMIT 1) ELSE e.id=? END)`)
    .bind(values.employeeCode, values.employmentId, values.employmentId).first<{ person_id: string; user_id: string | null; employment_id: string; legal_entity: string; started_on: string | null; ended_on: string | null }>();
  if (!person) throw new HrmError("not_found", 404);
  if (person.legal_entity !== config.legal_entity) throw new HrmError("hrm_entity_unconfigured", 409);
  if (person.user_id === user.id) throw new HrmError("self_approval", 403);
  if (person.started_on && values.effectiveFrom < person.started_on || person.ended_on && (values.effectiveFrom > person.ended_on || !values.effectiveUntil || values.effectiveUntil > person.ended_on)) throw new HrmError("compensation_outside_employment", 409);
  if (values.sourceKind === "contract_issue" && !await db.prepare(`SELECT ${contractSourceSql} AS ok`).bind(values.sourceReference, person.person_id, person.employment_id).first<{ ok: number }>().then(row => row?.ok === 1)) throw new HrmError("compensation_source_invalid", 409);
  if (values.supersedesId) {
    const prior = await db.prepare("SELECT employment_id,component_code,state,effective_from,effective_until FROM hrm_compensation_versions WHERE id=?").bind(values.supersedesId).first<Pick<CompensationVersion, "employment_id" | "component_code" | "state" | "effective_from" | "effective_until">>();
    if (!prior || prior.state !== "approved" || prior.employment_id !== person.employment_id || prior.component_code !== values.componentCode) throw new HrmError("compensation_supersede_invalid", 409);
    if (!coversReplacementTail(prior, values.effectiveFrom, values.effectiveUntil)) throw new HrmError("compensation_supersede_invalid", 409);
    if (await db.prepare("SELECT 1 AS pending FROM hrm_compensation_versions WHERE supersedes_id=? AND state IN ('draft','approved','superseded')").bind(values.supersedesId).first()) throw new HrmError("compensation_replacement_pending", 409);
  }
  const versionId = id("comp"), time = now();
  return command(db, user, key, "compensation_create", values, versionId, [
    guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND legal_entity=?)", [person.legal_entity]),
    guardBoolean(db, "NOT EXISTS(SELECT 1 FROM hrm_people WHERE id=? AND user_id=?)", [person.person_id, user.id]),
    values.sourceKind === "contract_issue" ? guardBoolean(db, contractSourceSql, [values.sourceReference, person.person_id, person.employment_id]) : guardBoolean(db, "1", []),
  ], [
    db.prepare(`INSERT INTO hrm_compensation_versions(id,person_id,employment_id,legal_entity,component_code,currency,minor_unit_scale,amount_minor,effective_from,effective_until,source_kind,source_reference,basis_note,supersedes_id,state,created_by,created_at,version,actor_id,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,1,?,?)`).bind(versionId, person.person_id, person.employment_id, person.legal_entity, values.componentCode, values.currency, values.minorUnitScale, values.amount, values.effectiveFrom, values.effectiveUntil, values.sourceKind, values.sourceReference, values.basisNote, values.supersedesId, user.id, time, user.id, time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'compensation_created',?,?,?,?)").bind(user.id, person.person_id, versionId, JSON.stringify({ component_code: values.componentCode, source_kind: values.sourceKind, supersedes: Boolean(values.supersedesId) }), time),
  ]);
}

/** The replacement must run through the end of the version it replaces, so no paid span silently disappears. */
function coversReplacementTail(prior: { effective_from: string; effective_until: string | null }, from: string, until: string | null): boolean {
  if (prior.effective_until && from > prior.effective_until) return false;
  return until === null || prior.effective_until !== null && until >= prior.effective_until;
}

export async function reviewCompensation(db: D1Database, user: WorkspaceUser, key: string, versionId: string, expectedVersion: number, decision: "approve" | "reject" | "cancel", reason: string): Promise<void> {
  const cleanReason = clean(reason, 500);
  const row = await db.prepare("SELECT v.*,p.user_id AS subject_user_id FROM hrm_compensation_versions v JOIN hrm_people p ON p.id=v.person_id WHERE v.id=?").bind(versionId).first<CompensationVersion & { subject_user_id: string | null }>();
  if (!row) throw new HrmError("not_found", 404);
  const payload = { versionId, expectedVersion, decision, reason: cleanReason }, time = now();
  if (await replayed(db, user, key, `compensation_${decision}`, payload)) return;
  if (decision === "cancel") {
    requirePermission(user, "hrm.compensation.manage"); live(user);
    if (row.created_by !== user.id) throw new HrmError("forbidden", 403);
    await command(db, user, key, "compensation_cancel", payload, versionId, [
      guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_compensation_versions WHERE id=? AND version=? AND state='draft' AND created_by=?)", [versionId, expectedVersion, user.id]),
    ], [
      db.prepare("UPDATE hrm_compensation_versions SET state='cancelled',version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='draft'").bind(user.id, time, versionId, expectedVersion),
      db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'compensation_cancelled',?,?,?,?)").bind(user.id, row.person_id, versionId, JSON.stringify({ reason_recorded: true }), time),
    ]);
    return;
  }
  requirePermission(user, "hrm.compensation.review"); live(user);
  if (row.created_by === user.id || row.subject_user_id === user.id) throw new HrmError("self_approval", 403);
  const writes: D1PreparedStatement[] = [], guards: D1PreparedStatement[] = [
    guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_compensation_versions v JOIN hrm_people p ON p.id=v.person_id WHERE v.id=? AND v.version=? AND v.state='draft' AND v.created_by!=? AND (p.user_id IS NULL OR p.user_id!=?))", [versionId, expectedVersion, user.id, user.id]),
  ];
  if (decision === "approve") {
    if (!await db.prepare(`SELECT ${withinEmploymentSql} AS ok`).bind(versionId).first<{ ok: number }>().then(found => found?.ok === 1)) throw new HrmError("compensation_outside_employment", 409);
    guards.push(guardBoolean(db, withinEmploymentSql, [versionId]));
    if (row.source_kind === "contract_issue") guards.push(guardBoolean(db, contractSourceSql, [row.source_reference, row.person_id, row.employment_id]));
    if (row.supersedes_id) {
      const prior = await db.prepare("SELECT * FROM hrm_compensation_versions WHERE id=?").bind(row.supersedes_id).first<CompensationVersion>();
      if (!prior || prior.state !== "approved" || !coversReplacementTail(prior, row.effective_from, row.effective_until)) throw new HrmError("compensation_supersede_invalid", 409);
      guards.push(guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_compensation_versions WHERE id=? AND version=? AND state='approved')", [prior.id, prior.version]));
      writes.push(row.effective_from <= prior.effective_from
        ? db.prepare("UPDATE hrm_compensation_versions SET state='superseded',version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='approved'").bind(user.id, time, prior.id, prior.version)
        : db.prepare("UPDATE hrm_compensation_versions SET effective_until=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='approved'").bind(dayBefore(row.effective_from), user.id, time, prior.id, prior.version));
    }
  }
  writes.push(
    db.prepare("UPDATE hrm_compensation_versions SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='draft'").bind(decision === "approve" ? "approved" : "rejected", user.id, time, cleanReason, user.id, time, versionId, expectedVersion),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,?,?,?,?,?)").bind(user.id, decision === "approve" ? "compensation_approved" : "compensation_rejected", row.person_id, versionId, JSON.stringify({ supersedes: row.supersedes_id }), time),
  );
  await command(db, user, key, `compensation_${decision}`, payload, versionId, guards, writes);
}

export async function listCompensation(db: D1Database, user: WorkspaceUser, employeeCode: string, page: number): Promise<{ rows: CompensationVersion[]; hasMore: boolean }> {
  requirePermission(user, "hrm.compensation.read"); live(user);
  const code = employeeCode.trim().slice(0, 60), offset = (Math.max(1, Math.min(page, 1000)) - 1) * PAGE_SIZE;
  const rows = (await db.prepare(`SELECT v.*,p.employee_code,COALESCE(NULLIF(p.preferred_name,''),p.legal_name) AS display_name FROM hrm_compensation_versions v JOIN hrm_people p ON p.id=v.person_id
    WHERE (?='' OR upper(p.employee_code)=upper(?)) ORDER BY v.created_at DESC,v.id LIMIT ? OFFSET ?`).bind(code, code, PAGE_SIZE + 1, offset).all<CompensationVersion>()).results;
  await audit(db, user, "compensation_listed", null, user.id, { filtered: Boolean(code), count: Math.min(rows.length, PAGE_SIZE) });
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

/**
 * Approved versions that cover a payroll period in full. Shared by the line
 * validator, calculation, review/approval and publish guards so the UI hint
 * and the atomic checks cannot disagree.
 */
export const coveringCompensationSql = `SELECT 1 FROM hrm_compensation_versions c
  WHERE c.id=l.source_reference AND c.state='approved' AND c.employment_id=rp.employment_id AND c.component_code=l.component_code
  AND c.amount_minor=l.amount_minor AND c.currency=pol.currency AND c.minor_unit_scale=pol.minor_unit_scale AND c.legal_entity=pol.legal_entity
  AND c.effective_from<=r.starts_on AND (c.effective_until IS NULL OR c.effective_until>=r.ends_on)`;
/** True when an `employment_record` line in the run no longer traces to an approved, fully covering version. */
export const untracedCompensationSql = `EXISTS(SELECT 1 FROM hrm_payroll_lines l JOIN hrm_payroll_run_people rp ON rp.id=l.run_person_id
  JOIN hrm_payroll_runs r ON r.id=rp.run_id JOIN hrm_payroll_policy_versions pol ON pol.id=r.policy_version_id
  WHERE r.id=? AND l.source_kind='employment_record' AND NOT EXISTS(${coveringCompensationSql}))`;

export interface CompensationCoverage { state: "covered" | "missing" | "partial"; version?: CompensationVersion }
const classify = (rows: CompensationVersion[], startsOn: string, endsOn: string): CompensationCoverage => {
  if (rows.length === 0) return { state: "missing" };
  const [only] = rows;
  if (rows.length === 1 && only.effective_from <= startsOn && (only.effective_until === null || only.effective_until >= endsOn)) return { state: "covered", version: only };
  return { state: "partial" };
};
/** One query for every employment in a run: coverage keyed by `employment_id:component_code`. */
export async function runCompensationCoverage(db: D1Database, runId: string, startsOn: string, endsOn: string): Promise<Map<string, CompensationCoverage>> {
  const rows = (await db.prepare(`SELECT c.* FROM hrm_compensation_versions c WHERE c.state='approved' AND c.employment_id IN (SELECT employment_id FROM hrm_payroll_run_people WHERE run_id=?)
    AND c.effective_from<=? AND (c.effective_until IS NULL OR c.effective_until>=?) ORDER BY c.employment_id,c.component_code,c.effective_from`).bind(runId, endsOn, startsOn).all<CompensationVersion>()).results;
  const grouped = new Map<string, CompensationVersion[]>();
  for (const row of rows) { const k = `${row.employment_id}:${row.component_code}`; grouped.set(k, [...(grouped.get(k) ?? []), row]); }
  return new Map([...grouped].map(([k, versions]) => [k, classify(versions, startsOn, endsOn)]));
}
/** Classify what an employment component has for a period, for the line validator and form hint. */
export async function compensationCoverage(db: D1Database, employmentId: string, componentCode: string, startsOn: string, endsOn: string): Promise<CompensationCoverage> {
  const rows = (await db.prepare(`SELECT * FROM hrm_compensation_versions WHERE employment_id=? AND component_code=? AND state='approved'
    AND effective_from<=? AND (effective_until IS NULL OR effective_until>=?) ORDER BY effective_from LIMIT 3`).bind(employmentId, componentCode, endsOn, startsOn).all<CompensationVersion>()).results;
  return classify(rows, startsOn, endsOn);
}
