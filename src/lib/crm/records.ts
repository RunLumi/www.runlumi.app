// Accounts, contacts and opportunities. Every query that returns a record is
// scoped by access.ts; a record outside the scope is reported as not found.
import { type CrmActor, opportunityScope, readableScope, assignableOwner } from "./access";
import { getPlaybook, latestPlaybooks } from "./config";
import {
  ConflictError, Errors, ForbiddenError, NotFoundError, ValidationError, emailPattern, eventStatement, fail, newId, normalizePhone, nowIso, once, onceGuarded,
} from "./core";
import { addDays } from "./money";
import { type Playbook, type TransitionContext, checkTransition, isIsoDate, parseFieldValue, stageIndex, visibleChecks, visibleFields } from "./playbook";

export const sourceChannels = ["field_visit", "facebook", "zalo", "phone", "email", "referral", "inbound_web", "event", "existing_customer", "other"] as const;
export type SourceChannel = typeof sourceChannels[number];
export const contactRoles = ["owner", "manager", "decision_maker", "buyer", "technical", "staff", "other"] as const;
export const contactChannels = ["", "phone", "zalo", "email", "visit", "facebook", "other"] as const;
export const relations = ["new", "upgrade", "renewal", "expansion"] as const;
export type Relation = typeof relations[number];

export interface Opportunity {
  id: string; account_id: string; primary_contact_id: string | null; title: string; playbook_id: string; stage_id: string;
  outcome: "open" | "won" | "lost" | "paused"; owner_id: string | null; seller_id: string | null; created_by: string;
  source_channel: SourceChannel; source_detail: string; referrer: string; parent_id: string | null; relation: Relation;
  offer_id: string | null; estimated_value_vnd: number | null; fields: string; checks: string; next_action: string;
  next_action_due: string | null; lost_reason: string; cohort_key: string | null; service_period_start: string | null;
  service_period_end: string | null; renewal_due_on: string | null; needs_review: number; legacy_data: string | null;
  version: number; created_at: string; updated_at: string; closed_at: string | null;
  account_name: string; industry: string; region: string; account_dnc: number;
}
export interface Account {
  id: string; name: string; industry: string; region: string; address: string; phone_norm: string; do_not_contact: number;
  dnc_reason: string; notes: string; version: number; created_at: string; updated_at: string;
}
export interface Contact {
  id: string; account_id: string; name: string; role: typeof contactRoles[number]; email: string; phone: string; zalo: string;
  contact_basis: string; preferred_channel: string; consent_status: "unknown" | "granted" | "refused" | "withdrawn";
  consent_evidence: string; do_not_contact: number; dnc_reason: string; dnc_recorded_at: string | null; version: number;
}

const OPP_SELECT = "SELECT o.*, a.name AS account_name, a.industry, a.region, a.do_not_contact AS account_dnc FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id";

export interface Access { opportunity: Opportunity; canEdit: boolean }

export async function loadOpportunity(db: D1Database, actor: CrmActor, id: string): Promise<Access> {
  const scope = readableScope(actor);
  const row = await db.prepare(`${OPP_SELECT} WHERE o.id = ? AND ${scope.sql}`).bind(id, ...scope.args).first<Opportunity>();
  if (!row) throw new NotFoundError();
  return { opportunity: row, canEdit: actor.admin || row.owner_id === actor.id };
}

export function requireEdit(access: Access): Opportunity {
  if (!access.canEdit) throw new ForbiddenError();
  return access.opportunity;
}

export function oppFields(opportunity: Pick<Opportunity, "fields">): Record<string, string> {
  try { return JSON.parse(opportunity.fields) as Record<string, string>; } catch { return {}; }
}
export function oppChecks(opportunity: Pick<Opportunity, "checks">): Record<string, boolean> {
  try { return JSON.parse(opportunity.checks) as Record<string, boolean>; } catch { return {}; }
}

function guardFor(opportunity: Pick<Opportunity, "id">, version: number, actor: CrmActor) {
  const scope = opportunityScope(actor, "g");
  return { sql: `EXISTS (SELECT 1 FROM crm_opportunities g WHERE g.id = ? AND g.version = ? AND ${scope.sql})`, args: [opportunity.id, version, ...scope.args] };
}

export function parseVersion(form: FormData): number {
  const version = Number(form.get("version"));
  if (!Number.isSafeInteger(version) || version < 1) fail("version", "invalid");
  return version;
}

function requestKey(form: FormData): string {
  return typeof form.get("request_key") === "string" ? String(form.get("request_key")) : "";
}

export interface DuplicateHint { suppressed: boolean }

/** Suppression check by phone across every account; reveals no record details. */
export async function phoneSuppressed(db: D1Database, phoneNorm: string): Promise<boolean> {
  if (phoneNorm.length < 8) return false;
  const row = await db.prepare(
    "SELECT 1 FROM crm_contacts c JOIN crm_accounts a ON a.id = c.account_id WHERE c.phone_norm = ? AND (c.do_not_contact = 1 OR a.do_not_contact = 1) LIMIT 1",
  ).bind(phoneNorm).first();
  return !!row;
}

export interface QuickCreate {
  account_name: string; industry: string; region: string; contact_name: string; contact_role: string; phone: string; email: string;
  playbook_key: string; source_channel: SourceChannel; source_detail: string; referrer: string; owner_id: string; next_action: string; next_action_due: string;
}

export async function quickCreate(db: D1Database, contentDb: D1Database, actor: CrmActor, form: FormData): Promise<{ id: string; duplicate: boolean }> {
  const errors = new Errors();
  const input = {
    account_name: errors.text(form, "account_name", 160, true),
    industry: errors.text(form, "industry", 120),
    region: errors.text(form, "region", 120),
    contact_name: errors.text(form, "contact_name", 160),
    contact_role: errors.text(form, "contact_role", 20) || "owner",
    phone: errors.text(form, "phone", 40),
    email: errors.text(form, "email", 254),
    playbook_key: errors.text(form, "playbook_key", 60, true),
    source_channel: errors.text(form, "source_channel", 30, true) as SourceChannel,
    source_detail: errors.text(form, "source_detail", 300),
    referrer: errors.text(form, "referrer", 160),
    owner_id: errors.text(form, "owner_id", 128),
    next_action: errors.text(form, "next_action", 500),
    next_action_due: errors.text(form, "next_action_due", 10),
  };
  if (input.email && !emailPattern.test(input.email)) errors.add("email", "invalid");
  const phoneNorm = normalizePhone(input.phone);
  if (input.phone && (phoneNorm.length < 8 || phoneNorm.length > 15)) errors.add("phone", "invalid");
  if ((input.phone || input.email) && !input.contact_name) errors.add("contact_name", "required");
  if (!sourceChannels.includes(input.source_channel)) errors.add("source_channel", "invalid");
  if (!contactRoles.includes(input.contact_role as typeof contactRoles[number])) errors.add("contact_role", "invalid");
  if (input.next_action_due && !isIsoDate(input.next_action_due)) errors.add("next_action_due", "invalid");
  const playbook = (await latestPlaybooks(db, { activeOnly: true })).find((item) => item.playbook_key === input.playbook_key);
  if (!playbook) errors.add("playbook_key", "invalid");
  const owner = actor.admin ? (input.owner_id || actor.id) : actor.id;
  if (actor.admin && !await assignableOwner(db, contentDb, actor, owner)) errors.add("owner_id", "invalid");
  errors.throwIfAny();
  if (phoneNorm && await phoneSuppressed(db, phoneNorm)) fail("phone", "suppressed");

  const now = nowIso();
  const accountId = newId("acc");
  const contactId = input.contact_name ? newId("con") : null;
  const id = newId("opp");
  const firstStage = playbook!.def.stages[0].id;
  const statements = [
    db.prepare("INSERT INTO crm_accounts (id, name, industry, region, phone_norm, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(accountId, input.account_name, input.industry, input.region, phoneNorm, actor.id, now, now),
    ...(contactId ? [db.prepare("INSERT INTO crm_contacts (id, account_id, name, role, email, phone, phone_norm, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(contactId, accountId, input.contact_name, input.contact_role, input.email, input.phone, phoneNorm, actor.id, now, now)] : []),
    db.prepare(`INSERT INTO crm_opportunities (id, account_id, primary_contact_id, title, playbook_id, stage_id, outcome, owner_id, seller_id, created_by, source_channel, source_detail, referrer, relation, fields, next_action, next_action_due, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?)`)
      .bind(id, accountId, contactId, input.account_name, playbook!.id, firstStage, owner, owner, actor.id, input.source_channel, input.source_detail, input.referrer,
        JSON.stringify(Object.fromEntries(Object.entries({ industry: input.industry, location: input.region }).filter(([key, value]) => value && playbook!.def.fields.some((field) => field.key === key)))),
        input.next_action, input.next_action_due || null, now, now),
    db.prepare("INSERT INTO crm_stage_history (id, opportunity_id, playbook_id, from_stage, to_stage, actor_id, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?)").bind(newId("stg"), id, playbook!.id, firstStage, actor.id, now),
    eventStatement(db, actor, "created", { playbook: playbook!.id, stage: firstStage, owner_id: owner, source_channel: input.source_channel }, { opportunityId: id, accountId }),
  ];
  const result = await once(db, actor, requestKey(form), "quick_create", id, statements);
  return { id: result.refId, duplicate: result.duplicate };
}

export async function saveDetails(db: D1Database, actor: CrmActor, opportunity: Opportunity, form: FormData): Promise<boolean> {
  const version = parseVersion(form);
  const errors = new Errors();
  const title = errors.text(form, "title", 160, true);
  const next_action = errors.text(form, "next_action", 500);
  const next_action_due = errors.text(form, "next_action_due", 10);
  const rawValue = errors.text(form, "estimated_value_vnd", 20);
  const referrer = errors.text(form, "referrer", 160);
  const source_detail = errors.text(form, "source_detail", 300);
  const cohort_key = errors.text(form, "cohort_key", 60);
  const period = ["service_period_start", "service_period_end", "renewal_due_on"].map((key) => errors.text(form, key, 10));
  if (next_action_due && !isIsoDate(next_action_due)) errors.add("next_action_due", "invalid");
  period.forEach((value, index) => { if (value && !isIsoDate(value)) errors.add(["service_period_start", "service_period_end", "renewal_due_on"][index], "invalid"); });
  const cleaned = rawValue.replace(/[.,\s₫đ]/gi, "");
  if (cleaned && (!/^\d{1,13}$/.test(cleaned) || Number(cleaned) > 1_000_000_000_000)) errors.add("estimated_value_vnd", "invalid");
  if (cohort_key && !await db.prepare("SELECT 1 FROM crm_cohorts WHERE cohort_key = ?").bind(cohort_key).first()) errors.add("cohort_key", "invalid");
  errors.throwIfAny();
  const value = cleaned ? Number(cleaned) : null;
  const guard = guardFor(opportunity, version, actor);
  const now = nowIso();
  const result = await onceGuarded(db, actor, requestKey(form), "details", opportunity.id, guard, [
    eventStatement(db, actor, "details", {
      from: { title: opportunity.title, estimated_value_vnd: opportunity.estimated_value_vnd, next_action: opportunity.next_action, next_action_due: opportunity.next_action_due, cohort_key: opportunity.cohort_key },
      to: { title, estimated_value_vnd: value, next_action, next_action_due: next_action_due || null, cohort_key: cohort_key || null },
    }, { opportunityId: opportunity.id, accountId: opportunity.account_id }, guard),
    db.prepare(`UPDATE crm_opportunities SET title = ?, next_action = ?, next_action_due = ?, estimated_value_vnd = ?, referrer = ?, source_detail = ?, cohort_key = ?,
      service_period_start = ?, service_period_end = ?, renewal_due_on = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`)
      .bind(title, next_action, next_action_due || null, value, referrer, source_detail, cohort_key || null, period[0] || null, period[1] || null, period[2] || null, now, opportunity.id, version),
  ]);
  if (!result.changed) throw new ConflictError();
  return result.duplicate;
}

export async function saveFields(db: D1Database, actor: CrmActor, opportunity: Opportunity, playbook: Playbook, form: FormData): Promise<void> {
  const version = parseVersion(form);
  const fields = { ...oppFields(opportunity) };
  const checks = { ...oppChecks(opportunity) };
  const errors = new Errors();
  for (const field of visibleFields(playbook.def, opportunity.stage_id)) {
    const raw = form.get(`field.${field.key}`);
    if (typeof raw !== "string") continue;
    const parsed = parseFieldValue(field, raw);
    if (parsed === null) errors.add(`field.${field.key}`, "invalid");
    else if (parsed === "") delete fields[field.key];
    else fields[field.key] = parsed;
  }
  if (form.get("checks_present") === "1") {
    for (const check of visibleChecks(playbook.def, opportunity.stage_id)) checks[check.key] = form.get(`check.${check.key}`) === "1";
  }
  errors.throwIfAny();
  const guard = guardFor(opportunity, version, actor);
  const result = await onceGuarded(db, actor, requestKey(form), "fields", opportunity.id, guard, [
    eventStatement(db, actor, "fields", { changed: Object.keys(fields).filter((key) => fields[key] !== oppFields(opportunity)[key]) }, { opportunityId: opportunity.id, accountId: opportunity.account_id }, guard),
    db.prepare("UPDATE crm_opportunities SET fields = ?, checks = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
      .bind(JSON.stringify(fields), JSON.stringify(checks), nowIso(), opportunity.id, version),
  ]);
  if (!result.changed) throw new ConflictError();
}

export async function transitionContext(db: D1Database, opportunity: Opportunity): Promise<TransitionContext> {
  const quote = await db.prepare("SELECT 1 FROM crm_quotes WHERE opportunity_id = ? AND status = 'accepted' LIMIT 1").bind(opportunity.id).first();
  return {
    fields: oppFields(opportunity), checks: oppChecks(opportunity), acceptedQuote: !!quote,
    primaryContact: !!opportunity.primary_contact_id, nextStep: !!opportunity.next_action.trim() && !!opportunity.next_action_due,
  };
}

export async function moveStage(db: D1Database, actor: CrmActor, opportunity: Opportunity, playbook: Playbook, form: FormData): Promise<void> {
  const version = parseVersion(form);
  const errors = new Errors();
  const to = errors.text(form, "to_stage", 40, true);
  const reason = errors.text(form, "reason", 1000);
  errors.throwIfAny();
  const target = playbook.def.stages.find((stage) => stage.id === to);
  if (!target) fail("to_stage", "invalid");
  const check = checkTransition(playbook.def, opportunity.stage_id, to, await transitionContext(db, opportunity));
  if (!check.ok) throw new ValidationError({ to_stage: `missing:${check.missing.join(",")}` });
  if (check.needsReason && !reason) fail("reason", "required");
  const now = nowIso();
  const closed = target!.outcome === "won" || target!.outcome === "lost";
  const guard = guardFor(opportunity, version, actor);
  const result = await onceGuarded(db, actor, requestKey(form), "stage", opportunity.id, guard, [
    db.prepare(`INSERT INTO crm_stage_history (id, opportunity_id, playbook_id, from_stage, to_stage, skipped, reason, actor_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`)
      .bind(newId("stg"), opportunity.id, playbook.id, opportunity.stage_id, to, JSON.stringify(check.skipped), reason, actor.id, now, ...guard.args),
    eventStatement(db, actor, "stage", { from: opportunity.stage_id, to, skipped: check.skipped, reason }, { opportunityId: opportunity.id, accountId: opportunity.account_id }, guard),
    db.prepare("UPDATE crm_opportunities SET stage_id = ?, outcome = ?, lost_reason = ?, closed_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
      .bind(to, target!.outcome, target!.outcome === "lost" ? reason : "", closed ? now : null, now, opportunity.id, version),
  ]);
  if (!result.changed) throw new ConflictError();
}

export async function assignOwner(db: D1Database, contentDb: D1Database, actor: CrmActor, opportunity: Opportunity, form: FormData): Promise<void> {
  if (!actor.admin) throw new ForbiddenError();
  const version = parseVersion(form);
  const ownerId = typeof form.get("owner_id") === "string" ? String(form.get("owner_id")) : "";
  if (!ownerId || !await assignableOwner(db, contentDb, actor, ownerId)) fail("owner_id", "invalid");
  const guard = guardFor(opportunity, version, actor);
  const now = nowIso();
  const result = await onceGuarded(db, actor, requestKey(form), "assign", opportunity.id, guard, [
    eventStatement(db, actor, "assigned", { from: opportunity.owner_id, to: ownerId }, { opportunityId: opportunity.id, accountId: opportunity.account_id }, guard),
    db.prepare(`UPDATE crm_inbound SET status = 'assigned', handled_by = ?, handled_at = ? WHERE opportunity_id = ? AND status = 'queued' AND ${guard.sql}`).bind(actor.id, now, opportunity.id, ...guard.args),
    // seller_id is filled only if attribution was never recorded (inbound queue).
    // The versioned update runs last so earlier guarded statements still match.
    db.prepare("UPDATE crm_opportunities SET owner_id = ?, seller_id = COALESCE(seller_id, ?), version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
      .bind(ownerId, ownerId, now, opportunity.id, version),
  ]);
  if (!result.changed) throw new ConflictError();
}

export async function addNote(db: D1Database, actor: CrmActor, opportunity: Opportunity, form: FormData): Promise<void> {
  const errors = new Errors();
  const note = errors.text(form, "note", 3000, true);
  errors.throwIfAny();
  await once(db, actor, requestKey(form), "note", opportunity.id, [eventStatement(db, actor, "note", { text: note }, { opportunityId: opportunity.id, accountId: opportunity.account_id })]);
}

/** Highest open stage the parent reached, used to continue an upgrade. */
async function highestOpenStage(db: D1Database, parent: Opportunity, playbook: Playbook): Promise<string> {
  const rows = (await db.prepare("SELECT to_stage FROM crm_stage_history WHERE opportunity_id = ? AND playbook_id = ?").bind(parent.id, parent.playbook_id).all<{ to_stage: string }>()).results;
  const open = rows.map((row) => row.to_stage).filter((stage) => playbook.def.stages.find((item) => item.id === stage)?.outcome === "open");
  return open.sort((a, b) => stageIndex(playbook.def, b) - stageIndex(playbook.def, a))[0] ?? playbook.def.stages[0].id;
}

/**
 * Upgrade, renewal or expansion as a new opportunity on the same account.
 * The customer is never cloned; the parent link keeps the commercial history.
 */
export async function createLinked(db: D1Database, actor: CrmActor, parent: Opportunity, form: FormData): Promise<{ id: string; duplicate: boolean }> {
  const errors = new Errors();
  const relation = errors.text(form, "relation", 20, true) as Relation;
  const playbookKey = errors.text(form, "playbook_key", 60, true);
  errors.throwIfAny();
  if (!["upgrade", "renewal", "expansion"].includes(relation)) fail("relation", "invalid");
  if ((relation === "upgrade" || relation === "renewal") && parent.outcome !== "won") fail("relation", "parent_not_won");
  const playbook = (await latestPlaybooks(db, { activeOnly: true })).find((item) => item.playbook_key === playbookKey);
  if (!playbook) fail("playbook_key", "invalid");
  if (relation === "renewal" && playbook!.kind !== "renewal") fail("playbook_key", "renewal_playbook_required");
  if (relation === "expansion" && playbook!.kind !== "solution") fail("playbook_key", "solution_playbook_required");
  const parentPlaybook = await getPlaybook(db, parent.playbook_id);
  const samePlaybook = parentPlaybook?.playbook_key === playbook!.playbook_key;
  const stage = relation === "upgrade" && samePlaybook && parentPlaybook ? await highestOpenStage(db, parent, playbook!) : playbook!.def.stages[0].id;
  const startIndex = stageIndex(playbook!.def, stage);
  const fields = samePlaybook ? Object.fromEntries(Object.entries(oppFields(parent)).filter(([key]) => !["offer_choice", "agreed_next_step"].includes(key))) : {};
  let periodStart: string | null = null; let periodEnd: string | null = null;
  if (relation === "renewal") {
    if (!parent.service_period_end) fail("relation", "parent_period_missing");
    periodStart = addDays(parent.service_period_end!, 1);
    periodEnd = addDays(addDays(periodStart, 365), -1);
  }
  const now = nowIso();
  const id = newId("opp");
  const titles: Record<string, string> = { upgrade: "Upgrade", renewal: "Renewal", expansion: "Expansion" };
  const statements = [
    db.prepare(`INSERT INTO crm_opportunities (id, account_id, primary_contact_id, title, playbook_id, stage_id, outcome, owner_id, seller_id, created_by, source_channel, source_detail, referrer, parent_id, relation, fields, cohort_key, service_period_start, service_period_end, renewal_due_on, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, 'existing_customer', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, parent.account_id, parent.primary_contact_id, `${parent.account_name} — ${titles[relation]}`, playbook!.id, stage, parent.owner_id ?? actor.id, actor.id, actor.id,
        `from ${parent.id}`, parent.referrer, parent.id, relation, JSON.stringify(fields), relation === "upgrade" ? parent.cohort_key : null, periodStart, periodEnd, periodStart, now, now),
    db.prepare("INSERT INTO crm_stage_history (id, opportunity_id, playbook_id, from_stage, to_stage, reason, actor_id, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)")
      .bind(newId("stg"), id, playbook!.id, stage, startIndex > 0 ? `continued from ${parent.id}` : "", actor.id, now),
    eventStatement(db, actor, "linked_created", { relation, parent_id: parent.id, playbook: playbook!.id, stage }, { opportunityId: id, accountId: parent.account_id }),
    eventStatement(db, actor, "child_created", { relation, child_id: id }, { opportunityId: parent.id, accountId: parent.account_id }),
  ];
  const result = await once(db, actor, requestKey(form), `linked_${relation}`, id, statements);
  return { id: result.refId, duplicate: result.duplicate };
}

/** Admin-only: move an opportunity to another playbook/version with an explicit stage mapping. */
export async function changePlaybook(db: D1Database, actor: CrmActor, opportunity: Opportunity, form: FormData): Promise<void> {
  if (!actor.admin) throw new ForbiddenError();
  const version = parseVersion(form);
  const errors = new Errors();
  const targetId = errors.text(form, "target_playbook_id", 80, true);
  const targetStage = errors.text(form, "target_stage", 40, true);
  const reason = errors.text(form, "reason", 1000, true);
  errors.throwIfAny();
  const target = await getPlaybook(db, targetId);
  if (!target || !target.active) fail("target_playbook_id", "invalid");
  const stage = target!.def.stages.find((item) => item.id === targetStage);
  if (!stage) fail("target_stage", "invalid");
  const guard = guardFor(opportunity, version, actor);
  const now = nowIso();
  const result = await onceGuarded(db, actor, requestKey(form), "playbook_change", opportunity.id, guard, [
    db.prepare(`INSERT INTO crm_stage_history (id, opportunity_id, playbook_id, from_stage, to_stage, reason, actor_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`)
      .bind(newId("stg"), opportunity.id, target!.id, `${opportunity.playbook_id}:${opportunity.stage_id}`, targetStage, reason, actor.id, now, ...guard.args),
    eventStatement(db, actor, "playbook_changed", { from: { playbook: opportunity.playbook_id, stage: opportunity.stage_id }, to: { playbook: target!.id, stage: targetStage }, reason }, { opportunityId: opportunity.id, accountId: opportunity.account_id }, guard),
    db.prepare("UPDATE crm_opportunities SET playbook_id = ?, stage_id = ?, outcome = ?, needs_review = 0, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
      .bind(target!.id, targetStage, stage!.outcome, now, opportunity.id, version),
  ]);
  if (!result.changed) throw new ConflictError();
}

export async function loadAccount(db: D1Database, actor: CrmActor, id: string): Promise<Account> {
  const scope = readableScope(actor, "ox");
  const row = await db.prepare(`SELECT a.* FROM crm_accounts a WHERE a.id = ? AND ${actor.admin ? "1 = 1" : `EXISTS (SELECT 1 FROM crm_opportunities ox WHERE ox.account_id = a.id AND ${scope.sql})`}`)
    .bind(id, ...(actor.admin ? [] : scope.args)).first<Account>();
  if (!row) throw new NotFoundError();
  return row;
}

export async function accountContacts(db: D1Database, accountId: string): Promise<Contact[]> {
  return (await db.prepare("SELECT * FROM crm_contacts WHERE account_id = ? ORDER BY created_at LIMIT 100").bind(accountId).all<Contact>()).results;
}

/** Opportunities on an account the actor may read. Others' records stay hidden. */
export async function accountOpportunities(db: D1Database, actor: CrmActor, accountId: string): Promise<Opportunity[]> {
  const scope = readableScope(actor);
  return (await db.prepare(`${OPP_SELECT} WHERE o.account_id = ? AND ${scope.sql} ORDER BY o.created_at LIMIT 100`).bind(accountId, ...scope.args).all<Opportunity>()).results;
}

export async function canEditAccount(db: D1Database, actor: CrmActor, accountId: string): Promise<boolean> {
  if (actor.admin) return true;
  return !!await db.prepare("SELECT 1 FROM crm_opportunities WHERE account_id = ? AND owner_id = ? LIMIT 1").bind(accountId, actor.id).first();
}

export async function saveContact(db: D1Database, actor: CrmActor, accountId: string, form: FormData): Promise<void> {
  if (!await canEditAccount(db, actor, accountId)) throw new ForbiddenError();
  const errors = new Errors();
  const contactId = errors.text(form, "contact_id", 60);
  const name = errors.text(form, "name", 160, true);
  const role = errors.text(form, "role", 20) || "other";
  const email = errors.text(form, "email", 254);
  const phone = errors.text(form, "phone", 40);
  const zalo = errors.text(form, "zalo", 80);
  const contact_basis = errors.text(form, "contact_basis", 500);
  const preferred_channel = errors.text(form, "preferred_channel", 20);
  const consent_status = errors.text(form, "consent_status", 20) || "unknown";
  const consent_evidence = errors.text(form, "consent_evidence", 500);
  if (!contactRoles.includes(role as typeof contactRoles[number])) errors.add("role", "invalid");
  if (email && !emailPattern.test(email)) errors.add("email", "invalid");
  const phoneNorm = normalizePhone(phone);
  if (phone && (phoneNorm.length < 8 || phoneNorm.length > 15)) errors.add("phone", "invalid");
  if (!contactChannels.includes(preferred_channel as typeof contactChannels[number])) errors.add("preferred_channel", "invalid");
  if (!["unknown", "granted", "refused", "withdrawn"].includes(consent_status)) errors.add("consent_status", "invalid");
  if (consent_status === "granted" && !consent_evidence) errors.add("consent_evidence", "required");
  errors.throwIfAny();
  const now = nowIso();
  const target = { accountId };
  if (!contactId) {
    const id = newId("con");
    await once(db, actor, requestKey(form), "contact_add", id, [
      db.prepare("INSERT INTO crm_contacts (id, account_id, name, role, email, phone, phone_norm, zalo, contact_basis, preferred_channel, consent_status, consent_evidence, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, accountId, name, role, email, phone, phoneNorm, zalo, contact_basis, preferred_channel, consent_status, consent_evidence, actor.id, now, now),
      eventStatement(db, actor, "contact_added", { contact_id: id, role }, target),
    ]);
    return;
  }
  const version = parseVersion(form);
  // Withdrawn or refused consent also stops contact; it cannot be lifted here.
  const dnc = consent_status === "withdrawn" || consent_status === "refused";
  const guard = { sql: "EXISTS (SELECT 1 FROM crm_contacts WHERE id = ? AND account_id = ? AND version = ?)", args: [contactId, accountId, version] };
  const result = await onceGuarded(db, actor, requestKey(form), "contact_edit", contactId, guard, [
    eventStatement(db, actor, "contact_updated", { contact_id: contactId, consent_status }, target, guard),
    db.prepare(`UPDATE crm_contacts SET name = ?, role = ?, email = ?, phone = ?, phone_norm = ?, zalo = ?, contact_basis = ?, preferred_channel = ?, consent_status = ?, consent_evidence = ?,
      do_not_contact = CASE WHEN ? = 1 THEN 1 ELSE do_not_contact END, dnc_reason = CASE WHEN ? = 1 AND do_not_contact = 0 THEN 'consent ' || ? ELSE dnc_reason END,
      dnc_recorded_by = CASE WHEN ? = 1 AND do_not_contact = 0 THEN ? ELSE dnc_recorded_by END, dnc_recorded_at = CASE WHEN ? = 1 AND do_not_contact = 0 THEN ? ELSE dnc_recorded_at END,
      version = version + 1, updated_at = ? WHERE id = ? AND account_id = ? AND version = ?`)
      .bind(name, role, email, phone, phoneNorm, zalo, contact_basis, preferred_channel, consent_status, consent_evidence, dnc ? 1 : 0, dnc ? 1 : 0, consent_status, dnc ? 1 : 0, actor.id, dnc ? 1 : 0, now, now, contactId, accountId, version),
  ]);
  if (!result.changed) throw new ConflictError();
}

/** Anyone working the account can stop contact; only an admin can lift it, with evidence. */
export async function setDoNotContact(db: D1Database, actor: CrmActor, accountId: string, form: FormData): Promise<void> {
  if (!await canEditAccount(db, actor, accountId)) throw new ForbiddenError();
  const errors = new Errors();
  const contactId = errors.text(form, "contact_id", 60);
  const value = form.get("do_not_contact") === "1";
  const reason = errors.text(form, "dnc_reason", 500, true);
  errors.throwIfAny();
  if (!value && !actor.admin) throw new ForbiddenError();
  const now = nowIso();
  const statements = contactId
    ? [db.prepare("UPDATE crm_contacts SET do_not_contact = ?, dnc_reason = ?, dnc_recorded_by = ?, dnc_recorded_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND account_id = ?").bind(value ? 1 : 0, reason, actor.id, now, now, contactId, accountId)]
    : [db.prepare("UPDATE crm_accounts SET do_not_contact = ?, dnc_reason = ?, version = version + 1, updated_at = ? WHERE id = ?").bind(value ? 1 : 0, reason, now, accountId)];
  await once(db, actor, requestKey(form), "dnc", accountId, [...statements, eventStatement(db, actor, value ? "do_not_contact_set" : "do_not_contact_lifted", { contact_id: contactId || null, reason }, { accountId })]);
}

export async function saveAccount(db: D1Database, actor: CrmActor, account: Account, form: FormData): Promise<void> {
  if (!await canEditAccount(db, actor, account.id)) throw new ForbiddenError();
  const version = parseVersion(form);
  const errors = new Errors();
  const name = errors.text(form, "name", 160, true);
  const industry = errors.text(form, "industry", 120);
  const region = errors.text(form, "region", 120);
  const address = errors.text(form, "address", 300);
  const notes = errors.text(form, "notes", 3000);
  errors.throwIfAny();
  const guard = { sql: "EXISTS (SELECT 1 FROM crm_accounts WHERE id = ? AND version = ?)", args: [account.id, version] };
  const result = await onceGuarded(db, actor, requestKey(form), "account", account.id, guard, [
    eventStatement(db, actor, "account_updated", { from: { name: account.name, industry: account.industry, region: account.region }, to: { name, industry, region } }, { accountId: account.id }, guard),
    db.prepare("UPDATE crm_accounts SET name = ?, industry = ?, region = ?, address = ?, notes = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
      .bind(name, industry, region, address, notes, nowIso(), account.id, version),
  ]);
  if (!result.changed) throw new ConflictError();
}

/** Admin-only merge of a duplicate: moves one opportunity to another existing account. */
export async function moveToAccount(db: D1Database, actor: CrmActor, opportunity: Opportunity, form: FormData): Promise<void> {
  if (!actor.admin) throw new ForbiddenError();
  const version = parseVersion(form);
  const targetId = typeof form.get("target_account_id") === "string" ? String(form.get("target_account_id")) : "";
  if (!targetId || targetId === opportunity.account_id || !await db.prepare("SELECT 1 FROM crm_accounts WHERE id = ?").bind(targetId).first()) fail("target_account_id", "invalid");
  const guard = guardFor(opportunity, version, actor);
  const now = nowIso();
  const result = await onceGuarded(db, actor, requestKey(form), "move_account", opportunity.id, guard, [
    eventStatement(db, actor, "account_moved", { from: opportunity.account_id, to: targetId }, { opportunityId: opportunity.id, accountId: targetId }, guard),
    db.prepare(`UPDATE crm_ledger SET account_id = ? WHERE opportunity_id = ? AND ${guard.sql}`).bind(targetId, opportunity.id, ...guard.args),
    db.prepare("UPDATE crm_opportunities SET account_id = ?, primary_contact_id = NULL, version = version + 1, updated_at = ? WHERE id = ? AND version = ?").bind(targetId, now, opportunity.id, version),
  ]);
  if (!result.changed) throw new ConflictError();
}

/** Admin view: accounts that share a phone number or name with this one. */
export async function possibleDuplicates(db: D1Database, account: Account): Promise<Pick<Account, "id" | "name" | "region">[]> {
  return (await db.prepare(
    "SELECT id, name, region FROM crm_accounts WHERE id != ? AND ((phone_norm != '' AND phone_norm = ?) OR (name = ? COLLATE NOCASE)) LIMIT 10",
  ).bind(account.id, account.phone_norm, account.name).all<Pick<Account, "id" | "name" | "region">>()).results;
}

export interface Filters { playbook: string; stage: string; owner: string; channel: string; cohort: string; industry: string; region: string; offer: string; outcome: string; q: string }
export const filterKeys = ["playbook", "stage", "owner", "channel", "cohort", "industry", "region", "offer", "outcome", "q"] as const;

export function readFilters(url: URL): Filters {
  const get = (key: string) => (url.searchParams.get(key) ?? "").trim().slice(0, 120);
  return Object.fromEntries(filterKeys.map((key) => [key, get(key)])) as unknown as Filters;
}

export function filterSql(actor: CrmActor, filters: Filters, inactiveOwners: readonly string[] = []): { sql: string; args: unknown[] } {
  const scope = opportunityScope(actor);
  const parts = [scope.sql];
  const args: unknown[] = [...scope.args];
  const add = (sql: string, ...values: unknown[]) => { parts.push(sql); args.push(...values); };
  if (filters.playbook) add("o.playbook_id IN (SELECT id FROM crm_playbooks WHERE playbook_key = ?)", filters.playbook);
  if (filters.stage) add("o.stage_id = ?", filters.stage);
  if (filters.owner === "unassigned" && actor.admin) parts.push("o.owner_id IS NULL");
  else if (filters.owner === "inactive" && actor.admin) {
    const ids = inactiveOwners.slice(0, 80);
    parts.push(ids.length ? `o.owner_id IN (${ids.map(() => "?").join(", ")})` : "0");
    args.push(...ids);
  }
  else if (filters.owner && actor.admin) add("o.owner_id = ?", filters.owner);
  if (filters.channel) add("o.source_channel = ?", filters.channel);
  if (filters.cohort) add("o.cohort_key = ?", filters.cohort);
  if (filters.industry) add("a.industry = ? COLLATE NOCASE", filters.industry);
  if (filters.region) add("a.region = ? COLLATE NOCASE", filters.region);
  if (filters.offer) add("(o.offer_id IN (SELECT id FROM crm_offers WHERE offer_key = ?) OR EXISTS (SELECT 1 FROM crm_quotes q JOIN crm_offers f ON f.id = q.offer_id WHERE q.opportunity_id = o.id AND f.offer_key = ?))", filters.offer, filters.offer);
  if (["open", "won", "lost", "paused"].includes(filters.outcome)) add("o.outcome = ?", filters.outcome);
  if (filters.q) add("(o.title LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\')", ...Array(2).fill(`%${filters.q.replace(/[\\%_]/g, (match) => `\\${match}`)}%`));
  return { sql: parts.join(" AND "), args };
}

export const PAGE_SIZE = 50;

export async function listOpportunities(db: D1Database, actor: CrmActor, filters: Filters, page: number, inactiveOwners: readonly string[] = []): Promise<{ rows: Opportunity[]; total: number; page: number; pages: number }> {
  const where = filterSql(actor, filters, inactiveOwners);
  const total = (await db.prepare(`SELECT COUNT(*) AS count FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id WHERE ${where.sql}`).bind(...where.args).first<{ count: number }>())?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const rows = (await db.prepare(`${OPP_SELECT} WHERE ${where.sql} ORDER BY CASE o.outcome WHEN 'open' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, CASE WHEN o.next_action_due IS NULL THEN 1 ELSE 0 END, o.next_action_due, o.updated_at DESC LIMIT ? OFFSET ?`)
    .bind(...where.args, PAGE_SIZE, (current - 1) * PAGE_SIZE).all<Opportunity>()).results;
  return { rows, total, page: current, pages };
}

export async function stageCounts(db: D1Database, actor: CrmActor, filters: Filters, inactiveOwners: readonly string[] = []): Promise<Record<string, number>> {
  const where = filterSql(actor, { ...filters, stage: "" }, inactiveOwners);
  const rows = (await db.prepare(`SELECT o.stage_id, COUNT(*) AS count FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id WHERE ${where.sql} GROUP BY o.stage_id`).bind(...where.args).all<{ stage_id: string; count: number }>()).results;
  return Object.fromEntries(rows.map((row) => [row.stage_id, row.count]));
}

export async function relatedOpportunities(db: D1Database, actor: CrmActor, opportunity: Opportunity): Promise<Opportunity[]> {
  const scope = readableScope(actor);
  return (await db.prepare(`${OPP_SELECT} WHERE o.id != ? AND (o.account_id = ? OR o.parent_id = ? OR o.id = ?) AND ${scope.sql} ORDER BY o.created_at LIMIT 50`)
    .bind(opportunity.id, opportunity.account_id, opportunity.id, opportunity.parent_id ?? "", ...scope.args).all<Opportunity>()).results;
}

export async function recentEvents(db: D1Database, opportunityId: string): Promise<{ id: string; actor_name: string; kind: string; body: string; created_at: string }[]> {
  return (await db.prepare("SELECT id, actor_name, kind, body, created_at FROM crm_events WHERE opportunity_id = ? ORDER BY created_at DESC LIMIT 100").bind(opportunityId).all<{ id: string; actor_name: string; kind: string; body: string; created_at: string }>()).results;
}
