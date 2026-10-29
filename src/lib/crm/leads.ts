// Leads: a person at a business before anyone has a company, contact or
// opportunity for them. Referrals (crm.refer) and signed local.runlumi.app
// enquiries arrive as unassigned leads; the team assigns them; the owner
// works them through the organisation's lead statuses (versioned data,
// R-01) and either disqualifies them with a reason or converts them.
// Conversion creates or reuses a company and contact and opens an
// opportunity that keeps the lead's source and referrer attribution.
//
// Scope: the team (crm.team) sees every lead; everyone else sees only leads
// they own. A referrer follows status on the Referrals page, never here.
import { type CrmActor, accountEditScope, assignableOwner, contactEditScope } from "./access";
import { latestPlaybooks } from "./config";
import {
  ConflictError, Errors, ForbiddenError, NotFoundError, emailPattern, fail, newId, normalizePhone, nowIso, once, onceGuarded,
} from "./core";
import { isIsoDate } from "./playbook";
import { contactRoles, dealForecast, phoneSuppressed, sourceChannels, type SourceChannel } from "./records";

export const LEAD_PROCESS_KEY = "crm-lead-process";

export interface LeadStatus { id: string; en: string; vi: string; target_hours?: number }
export interface LeadReason { id: string; en: string; vi: string }
export interface LeadProcessDef { statuses: LeadStatus[]; disqualify_reasons: LeadReason[] }
export interface LeadProcess { id: string; version: number; def: LeadProcessDef; created_at: string; created_by: string }

export type LeadState = "open" | "converted" | "disqualified";
export interface Lead {
  id: string; state: LeadState; status_id: string; process_id: string; name: string; job_title: string; company: string; industry: string; region: string;
  phone: string; phone_norm: string; email: string; need: string; playbook_key: string; source_channel: SourceChannel; source_detail: string;
  referrer_id: string | null; owner_id: string | null; consent_status: "unknown" | "granted" | "refused" | "withdrawn"; consent_evidence: string; suppressed: number;
  next_action: string; next_action_due: string | null; disqualify_reason_id: string; disqualify_note: string;
  converted_account_id: string | null; converted_contact_id: string | null; converted_opportunity_id: string | null; converted_by: string | null; converted_at: string | null;
  created_by: string; version: number; created_at: string; updated_at: string;
}

const idPattern = /^[a-z][a-z0-9_]{1,39}$/;

/** Checks a lead process definition; returns problems (empty when valid). */
export function validateLeadProcess(def: LeadProcessDef): string[] {
  const problems: string[] = [];
  if (!Array.isArray(def.statuses) || def.statuses.length < 1 || def.statuses.length > 12) problems.push("statuses");
  if (!Array.isArray(def.disqualify_reasons) || def.disqualify_reasons.length < 1 || def.disqualify_reasons.length > 20) problems.push("disqualify_reasons");
  for (const [group, items] of [["statuses", def.statuses ?? []], ["disqualify_reasons", def.disqualify_reasons ?? []]] as const) {
    const seen = new Set<string>();
    for (const item of items) {
      if (!item || typeof item.id !== "string" || !idPattern.test(item.id) || seen.has(item.id)) problems.push(`${group}.id`);
      if (typeof item?.en !== "string" || !item.en.trim() || item.en.length > 60 || typeof item.vi !== "string" || !item.vi.trim() || item.vi.length > 60) problems.push(`${group}.label`);
      seen.add(item?.id);
    }
  }
  for (const status of def.statuses ?? []) {
    if (status.target_hours !== undefined && (!Number.isSafeInteger(status.target_hours) || status.target_hours < 1 || status.target_hours > 720)) problems.push("statuses.target_hours");
  }
  return [...new Set(problems)];
}

function parseProcess(row: { id: string; version: number; body: string; created_at: string; created_by: string }): LeadProcess {
  let def: LeadProcessDef = { statuses: [], disqualify_reasons: [] };
  try { def = JSON.parse(row.body) as LeadProcessDef; } catch { /* an unreadable version has no statuses and fails validation on save */ }
  return { id: row.id, version: row.version, def, created_at: row.created_at, created_by: row.created_by };
}

export async function leadProcessVersions(db: D1Database): Promise<LeadProcess[]> {
  return (await db.prepare("SELECT id, version, body, created_at, created_by FROM crm_policies WHERE policy_key = ? ORDER BY version DESC LIMIT 50").bind(LEAD_PROCESS_KEY)
    .all<{ id: string; version: number; body: string; created_at: string; created_by: string }>()).results.map(parseProcess);
}

export async function currentLeadProcess(db: D1Database): Promise<LeadProcess> {
  const latest = (await leadProcessVersions(db))[0];
  if (!latest) throw new Error("lead_process_missing");
  return latest;
}

export async function leadProcessesById(db: D1Database, ids: readonly string[]): Promise<Map<string, LeadProcess>> {
  // Versions are few (one row per saved change); load them all and keep the ones asked for plus the latest.
  const versions = await leadProcessVersions(db);
  return new Map(versions.filter((item, index) => index === 0 || ids.includes(item.id)).map((item) => [item.id, item]));
}

export function statusLabel(process: LeadProcess | undefined, id: string, vi: boolean): string {
  const found = process?.def.statuses.find((item) => item.id === id);
  return found ? (vi ? found.vi : found.en) : id;
}

export function reasonLabel(process: LeadProcess | undefined, id: string, vi: boolean): string {
  const found = process?.def.disqualify_reasons.find((item) => item.id === id);
  return found ? (vi ? found.vi : found.en) : id;
}

/**
 * Admin-only: saves the next version of the lead process. Earlier versions
 * stay; each lead keeps the version it was created with, so labels on
 * existing leads never change underneath them.
 */
export async function saveLeadProcessVersion(db: D1Database, actor: CrmActor, form: FormData): Promise<string> {
  if (!actor.configure) throw new ForbiddenError();
  const rows = (prefix: string) => {
    const items: { id: string; en: string; vi: string; target_hours?: number }[] = [];
    for (let index = 0; index < 20; index += 1) {
      const get = (name: string) => { const raw = form.get(`${prefix}.${index}.${name}`); return typeof raw === "string" ? raw.trim() : ""; };
      const id = get("id");
      if (!id && !get("en") && !get("vi")) continue;
      const hours = get("target_hours");
      items.push({ id, en: get("en"), vi: get("vi"), ...(hours ? { target_hours: Number(hours) } : {}) });
    }
    return items;
  };
  const def: LeadProcessDef = { statuses: rows("status"), disqualify_reasons: rows("reason") };
  const problems = validateLeadProcess(def);
  if (problems.length) fail(problems[0].split(".")[0], "invalid");
  const current = await currentLeadProcess(db);
  const version = current.version + 1;
  const id = `${LEAD_PROCESS_KEY}@${version}`;
  const now = nowIso();
  const key = typeof form.get("request_key") === "string" ? String(form.get("request_key")) : "";
  try {
    await once(db, actor, key, "lead_process", id, [
      db.prepare("INSERT INTO crm_policies (id, policy_key, version, body, source_ref, effective_from, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, LEAD_PROCESS_KEY, version, JSON.stringify(def), `Saved in the CRM by ${actor.name}`, now.slice(0, 10), actor.id, now),
      leadEvent(db, actor, "lead_process_saved", { version }, null, null),
    ]);
  } catch (error) {
    // Someone saved the same next version first: report a conflict, keep the form.
    if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) throw new ConflictError();
    throw error;
  }
  return id;
}

// ---------------------------------------------------------------- scope

/** Leads a person may open: every one for the team, otherwise their own. */
export function leadScope(actor: CrmActor, alias = "l"): { sql: string; args: unknown[] } {
  return actor.manager ? { sql: "1 = 1", args: [] } : { sql: `${alias}.owner_id = ?`, args: [actor.id] };
}

function guardFor(lead: Pick<Lead, "id">, version: number, actor: CrmActor) {
  const scope = leadScope(actor, "g");
  return { sql: `EXISTS (SELECT 1 FROM crm_lead_records g WHERE g.id = ? AND g.version = ? AND ${scope.sql})`, args: [lead.id, version, ...scope.args] };
}

function leadEvent(db: D1Database, actor: CrmActor, kind: string, body: Record<string, unknown>, leadId: string | null, target: { opportunityId?: string | null; accountId?: string | null } | null, guard?: { sql: string; args: unknown[] }): D1PreparedStatement {
  const values = [newId("evt"), target?.opportunityId ?? null, target?.accountId ?? null, leadId, actor.id, actor.name, kind, JSON.stringify(body), nowIso()];
  const columns = "id, opportunity_id, account_id, lead_id, actor_id, actor_name, kind, body, created_at";
  if (!guard) return db.prepare(`INSERT INTO crm_events (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...values);
  return db.prepare(`INSERT INTO crm_events (${columns}) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`).bind(...values, ...guard.args);
}

function requestKey(form: FormData): string {
  return typeof form.get("request_key") === "string" ? String(form.get("request_key")) : "";
}

function parseVersion(form: FormData): number {
  const version = Number(form.get("version"));
  if (!Number.isSafeInteger(version) || version < 1) fail("version", "invalid");
  return version;
}

export interface LeadAccess { lead: Lead; canEdit: boolean }

export async function loadLead(db: D1Database, actor: CrmActor, id: string): Promise<LeadAccess> {
  const scope = leadScope(actor);
  const lead = await db.prepare(`SELECT l.* FROM crm_lead_records l WHERE l.id = ? AND ${scope.sql}`).bind(id, ...scope.args).first<Lead>();
  if (!lead) throw new NotFoundError();
  return { lead, canEdit: lead.state === "open" && (actor.manager || lead.owner_id === actor.id) };
}

function requireOpen(access: LeadAccess): Lead {
  if (!access.canEdit) throw new ForbiddenError();
  return access.lead;
}

// ---------------------------------------------------------------- lists

export interface LeadFilters { state: string; status: string; owner: string; source: string; q: string }
export const leadFilterKeys = ["state", "status", "owner", "source", "q"] as const;

export function readLeadFilters(url: URL): LeadFilters {
  const get = (key: string) => (url.searchParams.get(key) ?? "").trim().slice(0, 120);
  const filters = Object.fromEntries(leadFilterKeys.map((key) => [key, get(key)])) as unknown as LeadFilters;
  if (!["open", "converted", "disqualified", "all"].includes(filters.state)) filters.state = "open";
  return filters;
}

function leadWhere(actor: CrmActor, filters: LeadFilters): { sql: string; args: unknown[] } {
  const scope = leadScope(actor);
  const parts = [scope.sql];
  const args: unknown[] = [...scope.args];
  const add = (sql: string, ...values: unknown[]) => { parts.push(sql); args.push(...values); };
  if (filters.state !== "all") add("l.state = ?", filters.state);
  if (filters.status) add("l.status_id = ?", filters.status);
  if (filters.source) add("l.source_channel = ?", filters.source);
  if (actor.manager && filters.owner === "unassigned") parts.push("l.owner_id IS NULL");
  else if (actor.manager && filters.owner) add("l.owner_id = ?", filters.owner);
  if (filters.q) add("(l.name LIKE ? ESCAPE '\\' OR l.company LIKE ? ESCAPE '\\')", ...Array(2).fill(`%${filters.q.replace(/[\\%_]/g, (match) => `\\${match}`)}%`));
  return { sql: parts.join(" AND "), args };
}

export const LEAD_PAGE_SIZE = 50;

export async function listLeads(db: D1Database, actor: CrmActor, filters: LeadFilters, page: number): Promise<{ rows: Lead[]; total: number; page: number; pages: number }> {
  const where = leadWhere(actor, filters);
  const total = (await db.prepare(`SELECT COUNT(*) AS count FROM crm_lead_records l WHERE ${where.sql}`).bind(...where.args).first<{ count: number }>())?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / LEAD_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const rows = (await db.prepare(`SELECT l.* FROM crm_lead_records l WHERE ${where.sql} ORDER BY CASE WHEN l.owner_id IS NULL THEN 0 ELSE 1 END, l.created_at DESC LIMIT ? OFFSET ?`)
    .bind(...where.args, LEAD_PAGE_SIZE, (current - 1) * LEAD_PAGE_SIZE).all<Lead>()).results;
  return { rows, total, page: current, pages };
}

/** Open leads for the board, grouped by status; at most 200 so the page stays light. */
export async function boardLeads(db: D1Database, actor: CrmActor, filters: LeadFilters): Promise<Lead[]> {
  const where = leadWhere(actor, { ...filters, state: "open", status: "" });
  return (await db.prepare(`SELECT l.* FROM crm_lead_records l WHERE ${where.sql} ORDER BY l.created_at DESC LIMIT 200`).bind(...where.args).all<Lead>()).results;
}

/** Hours since a lead entered the CRM, for the per-status response target. */
export function leadAgeHours(lead: Pick<Lead, "created_at">, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(lead.created_at).getTime()) / 3_600_000));
}

export function overTarget(process: LeadProcess | undefined, lead: Pick<Lead, "status_id" | "created_at" | "state">, now = Date.now()): boolean {
  const target = process?.def.statuses.find((item) => item.id === lead.status_id)?.target_hours;
  return lead.state === "open" && !!target && leadAgeHours(lead, now) > target;
}

/** Unassigned open leads, oldest first: the team's queue. */
export async function unassignedLeads(db: D1Database): Promise<Lead[]> {
  return (await db.prepare("SELECT * FROM crm_lead_records WHERE owner_id IS NULL AND state = 'open' ORDER BY created_at LIMIT 100").all<Lead>()).results;
}

export async function leadEvents(db: D1Database, leadId: string): Promise<{ id: string; actor_name: string; kind: string; body: string; created_at: string }[]> {
  return (await db.prepare("SELECT id, actor_name, kind, body, created_at FROM crm_events WHERE lead_id = ? ORDER BY created_at DESC LIMIT 100").bind(leadId)
    .all<{ id: string; actor_name: string; kind: string; body: string; created_at: string }>()).results;
}

// ---------------------------------------------------------------- create

interface LeadInput {
  name: string; job_title: string; company: string; industry: string; region: string; phone: string; phoneNorm: string; email: string; need: string;
  playbook_key: string; next_action: string; next_action_due: string;
}

function leadInput(form: FormData, errors: Errors): LeadInput {
  const input = {
    name: errors.text(form, "name", 160, true), job_title: errors.text(form, "job_title", 120), company: errors.text(form, "company", 160, true),
    industry: errors.text(form, "industry", 120), region: errors.text(form, "region", 120), phone: errors.text(form, "phone", 40), phoneNorm: "",
    email: errors.text(form, "email", 254), need: errors.text(form, "need", 1500), playbook_key: errors.text(form, "playbook_key", 60),
    next_action: errors.text(form, "next_action", 500), next_action_due: errors.text(form, "next_action_due", 10),
  };
  input.phoneNorm = normalizePhone(input.phone);
  if (input.phone && (input.phoneNorm.length < 8 || input.phoneNorm.length > 15)) errors.add("phone", "invalid");
  if (input.email && !emailPattern.test(input.email)) errors.add("email", "invalid");
  if (input.next_action_due && !isIsoDate(input.next_action_due)) errors.add("next_action_due", "invalid");
  return input;
}

async function knownPlaybook(db: D1Database, key: string): Promise<boolean> {
  return !key || (await latestPlaybooks(db, { activeOnly: true })).some((item) => item.playbook_key === key && item.kind !== "legacy" && item.kind !== "renewal");
}

/**
 * A lead the person found themselves (visit, call, event). It is theirs; the
 * team may create it for someone who sells, or leave it in the queue.
 */
export async function createLead(db: D1Database, contentDb: D1Database, actor: CrmActor, form: FormData): Promise<string> {
  const errors = new Errors();
  const input = leadInput(form, errors);
  const source = errors.text(form, "source_channel", 30, true) as SourceChannel;
  const sourceDetail = errors.text(form, "source_detail", 300);
  if (source && (!sourceChannels.includes(source) || source === "inbound_web" || source === "referral" || source === "existing_customer")) errors.add("source_channel", "invalid");
  if (!await knownPlaybook(db, input.playbook_key)) errors.add("playbook_key", "invalid");
  const requested = errors.text(form, "owner_id", 128);
  let owner: string | null = actor.id;
  if (actor.manager) {
    owner = requested === "unassigned" ? null : requested || actor.id;
    if (owner && !await assignableOwner(db, contentDb, actor, owner)) errors.add("owner_id", "invalid");
  }
  if (!input.phone && !input.email) errors.add("phone", "required");
  errors.throwIfAny();
  if (input.phoneNorm && await phoneSuppressed(db, input.phoneNorm)) fail("phone", "suppressed");
  const process = await currentLeadProcess(db);
  const id = newId("lead");
  const now = nowIso();
  await once(db, actor, requestKey(form), "lead_create", id, [
    db.prepare(`INSERT INTO crm_lead_records (id, state, status_id, process_id, name, job_title, company, industry, region, phone, phone_norm, email, need, playbook_key, source_channel, source_detail, owner_id, next_action, next_action_due, created_by, created_at, updated_at)
      VALUES (?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, process.def.statuses[0].id, process.id, input.name, input.job_title, input.company, input.industry, input.region, input.phone, input.phoneNorm, input.email, input.need,
        input.playbook_key, source, sourceDetail, owner, input.next_action, input.next_action_due || null, actor.id, now, now),
    leadEvent(db, actor, "lead_created", { source_channel: source, owner_id: owner }, id, null),
  ]);
  return id;
}

/** Statements that store a referred business as an unassigned lead (crm.refer, consent confirmed). */
export async function referralLeadStatements(db: D1Database, actor: CrmActor, id: string, input: {
  business: string; industry: string; region: string; contactName: string; phone: string; phoneNorm: string; email: string; need: string; playbookKey: string; evidence: string;
}): Promise<D1PreparedStatement[]> {
  const process = await currentLeadProcess(db);
  const now = nowIso();
  return [
    db.prepare(`INSERT INTO crm_lead_records (id, state, status_id, process_id, name, company, industry, region, phone, phone_norm, email, need, playbook_key, source_channel, source_detail, referrer_id, owner_id, consent_status, consent_evidence, next_action, created_by, created_at, updated_at)
      VALUES (?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'referral', ?, ?, NULL, 'granted', ?, ?, ?, ?, ?)`)
      .bind(id, process.def.statuses[0].id, process.id, input.contactName, input.business, input.industry, input.region, input.phone, input.phoneNorm, input.email, input.need, input.playbookKey,
        `Referred by ${actor.name}`, actor.id, input.evidence, "Contact the referred business.", actor.id, now, now),
    leadEvent(db, actor, "lead_referred", { referrer_id: actor.id, playbook_key: input.playbookKey }, id, null),
  ];
}

// ---------------------------------------------------------------- edit

export async function saveLead(db: D1Database, actor: CrmActor, access: LeadAccess, form: FormData): Promise<void> {
  const lead = requireOpen(access);
  const version = parseVersion(form);
  const errors = new Errors();
  const input = leadInput(form, errors);
  if (!await knownPlaybook(db, input.playbook_key)) errors.add("playbook_key", "invalid");
  errors.throwIfAny();
  if (input.phoneNorm && input.phoneNorm !== lead.phone_norm && await phoneSuppressed(db, input.phoneNorm)) fail("phone", "suppressed");
  const guard = guardFor(lead, version, actor);
  const changed = (["name", "job_title", "company", "industry", "region", "phone", "email", "need", "playbook_key", "next_action"] as const)
    .filter((key) => lead[key] !== input[key]).concat(lead.next_action_due !== (input.next_action_due || null) ? ["next_action_due"] as never[] : []);
  const result = await onceGuarded(db, actor, requestKey(form), "lead_save", lead.id, guard, [
    // Only which fields changed is recorded: contact details stay out of the activity feed.
    leadEvent(db, actor, "lead_updated", { changed }, lead.id, null, guard),
    db.prepare(`UPDATE crm_lead_records SET name = ?, job_title = ?, company = ?, industry = ?, region = ?, phone = ?, phone_norm = ?, email = ?, need = ?, playbook_key = ?, next_action = ?, next_action_due = ?,
      version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND state = 'open'`)
      .bind(input.name, input.job_title, input.company, input.industry, input.region, input.phone, input.phoneNorm, input.email, input.need, input.playbook_key, input.next_action,
        input.next_action_due || null, nowIso(), lead.id, version),
  ]);
  if (!result.changed) throw new ConflictError();
}

export async function setLeadStatus(db: D1Database, actor: CrmActor, access: LeadAccess, process: LeadProcess, form: FormData): Promise<void> {
  const lead = requireOpen(access);
  const version = parseVersion(form);
  const to = typeof form.get("status_id") === "string" ? String(form.get("status_id")) : "";
  if (!process.def.statuses.some((item) => item.id === to)) fail("status_id", "invalid");
  if (to === lead.status_id) return;
  const guard = guardFor(lead, version, actor);
  const result = await onceGuarded(db, actor, requestKey(form), "lead_status", lead.id, guard, [
    leadEvent(db, actor, "lead_status", { from: lead.status_id, to }, lead.id, null, guard),
    db.prepare("UPDATE crm_lead_records SET status_id = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND state = 'open'").bind(to, nowIso(), lead.id, version),
  ]);
  if (!result.changed) throw new ConflictError();
}

export async function addLeadNote(db: D1Database, actor: CrmActor, access: LeadAccess, form: FormData): Promise<void> {
  if (!access.canEdit) throw new ForbiddenError();
  const errors = new Errors();
  const note = errors.text(form, "note", 3000, true);
  errors.throwIfAny();
  await once(db, actor, requestKey(form), "lead_note", access.lead.id, [leadEvent(db, actor, "lead_note", { text: note }, access.lead.id, null)]);
}

/**
 * Team only. Assigning an unattributed lead credits the assignee as its
 * seller once converted, so a Sales Manager cannot assign one to themselves.
 */
export async function assignLead(db: D1Database, contentDb: D1Database, actor: CrmActor, access: LeadAccess, form: FormData): Promise<void> {
  if (!actor.manager) throw new ForbiddenError();
  const lead = requireOpen(access);
  const version = parseVersion(form);
  const ownerId = typeof form.get("owner_id") === "string" ? String(form.get("owner_id")) : "";
  if (!ownerId || !await assignableOwner(db, contentDb, actor, ownerId)) fail("owner_id", "invalid");
  if (ownerId === actor.id && !actor.configure) fail("owner_id", "self_assign");
  if (ownerId === lead.owner_id) return;
  const guard = guardFor(lead, version, actor);
  const now = nowIso();
  const result = await onceGuarded(db, actor, requestKey(form), "lead_assign", lead.id, guard, [
    leadEvent(db, actor, "lead_assigned", { from: lead.owner_id, to: ownerId }, lead.id, null, guard),
    db.prepare(`UPDATE crm_inbound SET status = 'assigned', handled_by = ?, handled_at = ? WHERE lead_id = ? AND status = 'queued' AND ${guard.sql}`).bind(actor.id, now, lead.id, ...guard.args),
    db.prepare("UPDATE crm_lead_records SET owner_id = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND state = 'open'").bind(ownerId, now, lead.id, version),
  ]);
  if (!result.changed) throw new ConflictError();
}

export async function disqualifyLead(db: D1Database, actor: CrmActor, access: LeadAccess, process: LeadProcess, form: FormData): Promise<void> {
  const lead = requireOpen(access);
  const version = parseVersion(form);
  const errors = new Errors();
  const reason = errors.text(form, "reason_id", 40, true);
  const note = errors.text(form, "disqualify_note", 1000);
  if (reason && !process.def.disqualify_reasons.some((item) => item.id === reason)) errors.add("reason_id", "invalid");
  errors.throwIfAny();
  const guard = guardFor(lead, version, actor);
  const now = nowIso();
  const result = await onceGuarded(db, actor, requestKey(form), "lead_disqualify", lead.id, guard, [
    leadEvent(db, actor, "lead_disqualified", { reason_id: reason, note }, lead.id, null, guard),
    db.prepare(`UPDATE crm_inbound SET status = 'dismissed', dismiss_reason = ?, handled_by = ?, handled_at = ? WHERE lead_id = ? AND status = 'queued' AND ${guard.sql}`)
      .bind(reason, actor.id, now, lead.id, ...guard.args),
    db.prepare("UPDATE crm_lead_records SET state = 'disqualified', disqualify_reason_id = ?, disqualify_note = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND state = 'open'")
      .bind(reason, note, now, lead.id, version),
  ]);
  if (!result.changed) throw new ConflictError();
}

/** Owner or team: a disqualified lead can be reopened with a reason; a converted one never. */
export async function reopenLead(db: D1Database, actor: CrmActor, access: LeadAccess, process: LeadProcess, form: FormData): Promise<void> {
  const lead = access.lead;
  if (lead.state !== "disqualified" || !(actor.manager || lead.owner_id === actor.id)) throw new ForbiddenError();
  const version = parseVersion(form);
  const errors = new Errors();
  const reason = errors.text(form, "reopen_reason", 500, true);
  errors.throwIfAny();
  if (lead.phone_norm && await phoneSuppressed(db, lead.phone_norm)) fail("reopen_reason", "do_not_contact");
  const guard = guardFor(lead, version, actor);
  const result = await onceGuarded(db, actor, requestKey(form), "lead_reopen", lead.id, guard, [
    leadEvent(db, actor, "lead_reopened", { reason }, lead.id, null, guard),
    // A reopened lead moves to the current lead process, so its status and labels come from the same version.
    db.prepare("UPDATE crm_lead_records SET state = 'open', status_id = ?, process_id = ?, disqualify_reason_id = '', disqualify_note = '', version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND state = 'disqualified'")
      .bind(process.def.statuses[0].id, process.id, nowIso(), lead.id, version),
  ]);
  if (!result.changed) throw new ConflictError();
}

// ---------------------------------------------------------------- convert

export interface ConversionMatches {
  accounts: { id: string; name: string; region: string; reason: "phone" | "name" }[];
  contacts: { id: string; name: string; account_id: string; account_name: string; reason: "phone" | "email" }[];
}

/**
 * Companies and contacts the person may work on that look like this lead
 * (same phone, email or company name). Only records within their edit scope
 * are offered, so nobody learns about others' customers.
 */
export async function conversionMatches(db: D1Database, actor: CrmActor, lead: Lead): Promise<ConversionMatches> {
  const companies = accountEditScope(actor);
  const people = contactEditScope(actor);
  const accounts = (await db.prepare(`SELECT a.id, a.name, a.region, CASE WHEN a.phone_norm != '' AND a.phone_norm = ? THEN 'phone' ELSE 'name' END AS reason FROM crm_accounts a
    WHERE a.do_not_contact = 0 AND ((a.phone_norm != '' AND a.phone_norm = ?) OR a.name = ? COLLATE NOCASE) AND ${companies.sql} ORDER BY a.name LIMIT 10`)
    .bind(lead.phone_norm, lead.phone_norm, lead.company, ...companies.args).all<ConversionMatches["accounts"][number]>()).results;
  const contacts = (await db.prepare(`SELECT c.id, c.name, c.account_id, a.name AS account_name, CASE WHEN c.phone_norm != '' AND c.phone_norm = ? THEN 'phone' ELSE 'email' END AS reason
    FROM crm_contacts c JOIN crm_accounts a ON a.id = c.account_id
    WHERE c.do_not_contact = 0 AND a.do_not_contact = 0 AND ((c.phone_norm != '' AND c.phone_norm = ?) OR (c.email != '' AND c.email = ? COLLATE NOCASE)) AND ${people.sql} AND ${companies.sql} ORDER BY c.name LIMIT 10`)
    .bind(lead.phone_norm, lead.phone_norm, lead.email, ...people.args, ...companies.args).all<ConversionMatches["contacts"][number]>()).results;
  return { accounts, contacts };
}

/** Other contacts at a company the person may work on, for "use an existing contact". */
export async function companyContacts(db: D1Database, actor: CrmActor, accountId: string): Promise<{ id: string; name: string; role: string }[]> {
  const people = contactEditScope(actor);
  return (await db.prepare(`SELECT c.id, c.name, c.role FROM crm_contacts c WHERE c.account_id = ? AND c.do_not_contact = 0 AND ${people.sql} ORDER BY c.name LIMIT 100`)
    .bind(accountId, ...people.args).all<{ id: string; name: string; role: string }>()).results;
}

export interface ConversionResult { accountId: string; contactId: string; opportunityId: string; reusedAccount: boolean; reusedContact: boolean }

/**
 * Converts an open, assigned lead. The owner of the lead becomes the owner
 * and credited seller of the new opportunity (and of any new company and
 * contact); the referrer and source stay as attribution. Do-not-contact and
 * suppression stop the conversion. One request, one D1 batch, guarded by the
 * lead version so a stale or repeated conversion writes nothing.
 */
export async function convertLead(db: D1Database, actor: CrmActor, access: LeadAccess, form: FormData): Promise<ConversionResult> {
  // A repeated submit after the conversion committed (double click, retry)
  // returns what was created; nothing is written twice.
  if (access.lead.state === "converted" && (actor.manager || access.lead.owner_id === actor.id)
    && access.lead.converted_account_id && access.lead.converted_contact_id && access.lead.converted_opportunity_id) {
    return { accountId: access.lead.converted_account_id, contactId: access.lead.converted_contact_id, opportunityId: access.lead.converted_opportunity_id, reusedAccount: false, reusedContact: false };
  }
  const lead = requireOpen(access);
  const version = parseVersion(form);
  if (!lead.owner_id) fail("owner_id", "required");
  if (lead.consent_status === "refused" || lead.consent_status === "withdrawn") fail("consent", "do_not_contact");
  if (lead.phone_norm && await phoneSuppressed(db, lead.phone_norm)) fail("phone", "suppressed");
  const owner = lead.owner_id!;
  const errors = new Errors();
  const accountMode = errors.text(form, "account_mode", 10, true);
  const contactMode = errors.text(form, "contact_mode", 10, true);
  const accountName = errors.text(form, "account_name", 160);
  const contactRole = errors.text(form, "contact_role", 20) || "owner";
  const playbookKey = errors.text(form, "playbook_key", 60, true);
  const title = errors.text(form, "title", 160, true);
  const forecast = dealForecast(errors, form);
  if (!["new", "existing"].includes(accountMode)) errors.add("account_mode", "invalid");
  if (!["new", "existing"].includes(contactMode)) errors.add("contact_mode", "invalid");
  if (accountMode === "new" && !accountName) errors.add("account_name", "required");
  if (contactMode === "new" && !contactRoles.includes(contactRole as typeof contactRoles[number])) errors.add("contact_role", "invalid");
  const playbook = (await latestPlaybooks(db, { activeOnly: true })).find((item) => item.playbook_key === playbookKey && item.kind !== "legacy");
  if (playbookKey && !playbook) errors.add("playbook_key", "invalid");
  // Account and contact choices must be within what the person may work on.
  let accountId = "";
  let reusedAccount = false;
  let account: { id: string; name: string; industry: string; region: string; do_not_contact: number } | null = null;
  if (accountMode === "existing") {
    const scope = accountEditScope(actor);
    account = await db.prepare(`SELECT a.id, a.name, a.industry, a.region, a.do_not_contact FROM crm_accounts a WHERE a.id = ? AND ${scope.sql}`)
      .bind(errors.text(form, "account_id", 60, true), ...scope.args).first();
    if (!account) errors.add("account_id", "invalid");
    else if (account.do_not_contact) errors.add("account_id", "do_not_contact");
    else { accountId = account.id; reusedAccount = true; }
  }
  let contactId = "";
  let reusedContact = false;
  if (contactMode === "existing") {
    if (accountMode !== "existing") errors.add("contact_mode", "invalid");
    else if (accountId) {
      const scope = contactEditScope(actor);
      const contact = await db.prepare(`SELECT c.id, c.do_not_contact FROM crm_contacts c WHERE c.id = ? AND c.account_id = ? AND ${scope.sql}`)
        .bind(errors.text(form, "contact_id", 60, true), accountId, ...scope.args).first<{ id: string; do_not_contact: number }>();
      if (!contact) errors.add("contact_id", "invalid");
      else if (contact.do_not_contact) errors.add("contact_id", "do_not_contact");
      else { contactId = contact.id; reusedContact = true; }
    }
  }
  errors.throwIfAny();

  const now = nowIso();
  if (!accountId) accountId = newId("acc");
  if (!contactId) contactId = newId("con");
  const opportunityId = newId("opp");
  const firstStage = playbook!.def.stages[0].id;
  const industry = account?.industry || lead.industry;
  const region = account?.region || lead.region;
  const fields = Object.fromEntries(Object.entries({ industry, location: region }).filter(([key, value]) => value && playbook!.def.fields.some((field) => field.key === key)));
  const guard = guardFor(lead, version, actor);
  const consentEvidence = lead.consent_evidence || (lead.consent_status === "granted" ? `Recorded on lead ${lead.id}` : "");
  const statements: D1PreparedStatement[] = [];
  if (!reusedAccount) {
    statements.push(db.prepare(`INSERT INTO crm_accounts (id, name, industry, region, phone_norm, owner_id, created_by, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`)
      .bind(accountId, accountName || lead.company, lead.industry, lead.region, lead.phone_norm, owner, actor.id, now, now, ...guard.args));
  }
  if (!reusedContact) {
    statements.push(db.prepare(`INSERT INTO crm_contacts (id, account_id, name, role, email, phone, phone_norm, contact_basis, consent_status, consent_evidence, owner_id, created_by, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`)
      .bind(contactId, accountId, lead.name, contactRole, lead.email, lead.phone, lead.phone_norm, lead.job_title ? `Lead: ${lead.job_title}` : "Converted from a lead",
        lead.consent_status, consentEvidence, owner, actor.id, now, now, ...guard.args));
  }
  statements.push(
    db.prepare(`INSERT INTO crm_opportunities (id, account_id, primary_contact_id, title, playbook_id, stage_id, outcome, owner_id, seller_id, referrer_id, created_by, source_channel, source_detail, relation,
        estimated_value_vnd, win_probability, fields, next_action, next_action_due, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`)
      .bind(opportunityId, accountId, contactId, title, playbook!.id, firstStage, owner, owner, lead.referrer_id, actor.id, lead.source_channel, lead.source_detail || `Lead ${lead.id}`,
        forecast.value, forecast.probability, JSON.stringify(fields), lead.next_action, lead.next_action_due, now, now, ...guard.args),
    db.prepare(`INSERT INTO crm_stage_history (id, opportunity_id, playbook_id, from_stage, to_stage, reason, actor_id, created_at) SELECT ?, ?, ?, NULL, ?, ?, ?, ? WHERE ${guard.sql}`)
      .bind(newId("stg"), opportunityId, playbook!.id, firstStage, `converted from lead ${lead.id}`, actor.id, now, ...guard.args),
    leadEvent(db, actor, "lead_converted", { lead_id: lead.id, owner_id: owner, playbook: playbook!.id, reused_account: reusedAccount, reused_contact: reusedContact }, lead.id, { opportunityId, accountId }, guard),
    // A company or contact nobody manages yet goes to the lead's owner.
    db.prepare(`UPDATE crm_accounts SET owner_id = ?, updated_at = ? WHERE id = ? AND owner_id IS NULL AND ${guard.sql}`).bind(owner, now, accountId, ...guard.args),
    db.prepare(`UPDATE crm_contacts SET owner_id = ?, updated_at = ? WHERE id = ? AND owner_id IS NULL AND ${guard.sql}`).bind(owner, now, contactId, ...guard.args),
    db.prepare(`UPDATE crm_inbound SET opportunity_id = ?, status = CASE WHEN status = 'queued' THEN 'assigned' ELSE status END, handled_by = COALESCE(handled_by, ?), handled_at = COALESCE(handled_at, ?) WHERE lead_id = ? AND ${guard.sql}`)
      .bind(opportunityId, actor.id, now, lead.id, ...guard.args),
    // The versioned update runs last so every guarded statement above still matched.
    db.prepare(`UPDATE crm_lead_records SET state = 'converted', converted_account_id = ?, converted_contact_id = ?, converted_opportunity_id = ?, converted_by = ?, converted_at = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND version = ? AND state = 'open'`).bind(accountId, contactId, opportunityId, actor.id, now, now, lead.id, version),
  );
  const result = await onceGuarded(db, actor, requestKey(form), "lead_convert", opportunityId, guard, statements);
  if (!result.changed) throw new ConflictError();
  if (result.duplicate) {
    const done = await db.prepare("SELECT converted_account_id, converted_contact_id, converted_opportunity_id FROM crm_lead_records WHERE id = ?").bind(lead.id)
      .first<{ converted_account_id: string; converted_contact_id: string; converted_opportunity_id: string }>();
    if (done?.converted_opportunity_id) return { accountId: done.converted_account_id, contactId: done.converted_contact_id, opportunityId: done.converted_opportunity_id, reusedAccount, reusedContact };
  }
  return { accountId, contactId, opportunityId, reusedAccount, reusedContact };
}

/** The lead an opportunity was converted from, if the person may open it. */
export async function sourceLead(db: D1Database, actor: CrmActor, opportunityId: string): Promise<Pick<Lead, "id" | "name" | "company" | "converted_at"> | null> {
  const scope = leadScope(actor);
  return await db.prepare(`SELECT l.id, l.name, l.company, l.converted_at FROM crm_lead_records l WHERE l.converted_opportunity_id = ? AND ${scope.sql}`).bind(opportunityId, ...scope.args).first();
}

export interface LeadSourceRow { source_channel: string; open: number; converted: number; disqualified: number }

/**
 * Leads by source and state, within the person's lead scope. The share
 * converted is over decided leads only (converted + disqualified); open leads
 * are not counted as failures, and no rate is shown without decided leads.
 */
export async function leadReport(db: D1Database, actor: CrmActor): Promise<LeadSourceRow[]> {
  const scope = leadScope(actor);
  return (await db.prepare(`SELECT l.source_channel, SUM(CASE WHEN l.state = 'open' THEN 1 ELSE 0 END) AS open, SUM(CASE WHEN l.state = 'converted' THEN 1 ELSE 0 END) AS converted,
      SUM(CASE WHEN l.state = 'disqualified' THEN 1 ELSE 0 END) AS disqualified FROM crm_lead_records l WHERE ${scope.sql} GROUP BY l.source_channel ORDER BY COUNT(*) DESC`)
    .bind(...scope.args).all<LeadSourceRow>()).results;
}
