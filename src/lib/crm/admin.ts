// Admin operations: membership, capabilities, inbound queue and cohorts.
import type { CrmActor } from "./access";
import { assignableOwner } from "./access";
import { ConflictError, Errors, ForbiddenError, ValidationError, emailPattern, eventStatement, fail, nowIso, onceGuarded } from "./core";
import { isIsoDate } from "./playbook";

function requireAdmin(actor: CrmActor): void {
  if (!actor.admin) throw new ForbiddenError();
}

/** Grants, revokes or restores CRM access for an existing, active, non-admin EmDash account. */
export async function setMembership(db: D1Database, contentDb: D1Database, actor: CrmActor, form: FormData): Promise<void> {
  requireAdmin(actor);
  const errors = new Errors();
  const email = errors.text(form, "email", 254).toLowerCase();
  const userId = errors.text(form, "user_id", 128);
  const enabled = form.get("enabled") === "1";
  errors.throwIfAny();
  if (!userId && !emailPattern.test(email)) fail("email", "invalid");
  const user = userId
    ? await contentDb.prepare("SELECT id, role, disabled FROM users WHERE id = ? LIMIT 1").bind(userId).first<{ id: string; role: number; disabled: number }>()
    : await contentDb.prepare("SELECT id, role, disabled FROM users WHERE lower(email) = ? LIMIT 1").bind(email).first<{ id: string; role: number; disabled: number }>();
  const target = user?.id ?? userId;
  if (!target) fail("email", "not_found");
  if (enabled && (!user || user.disabled || user.role === 50)) fail(userId ? "user_id" : "email", "not_found");
  if (!enabled && !await db.prepare("SELECT 1 FROM crm_members WHERE user_id = ?").bind(target).first()) fail("user_id", "not_found");
  const now = nowIso();
  await db.batch([
    db.prepare("INSERT INTO crm_members (user_id, enabled, granted_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, granted_by = excluded.granted_by, updated_at = excluded.updated_at")
      .bind(target, enabled ? 1 : 0, actor.id, now),
    eventStatement(db, actor, enabled ? "member_enabled" : "member_revoked", { user_id: target }, {}),
  ]);
}

export async function setCapabilities(db: D1Database, actor: CrmActor, form: FormData): Promise<void> {
  requireAdmin(actor);
  const userId = typeof form.get("user_id") === "string" ? String(form.get("user_id")) : "";
  if (!await db.prepare("SELECT 1 FROM crm_members WHERE user_id = ?").bind(userId).first()) fail("user_id", "not_found");
  const wanted = (["finance", "fulfillment"] as const).filter((capability) => form.get(capability) === "1");
  const now = nowIso();
  await db.batch([
    db.prepare("DELETE FROM crm_capabilities WHERE user_id = ?").bind(userId),
    ...wanted.map((capability) => db.prepare("INSERT INTO crm_capabilities (user_id, capability, granted_by, granted_at) VALUES (?, ?, ?, ?)").bind(userId, capability, actor.id, now)),
    eventStatement(db, actor, "capabilities_set", { user_id: userId, capabilities: wanted }, {}),
  ]);
}

/** Assigns a queued inbound enquiry to an owner. */
export async function assignInbound(db: D1Database, contentDb: D1Database, actor: CrmActor, form: FormData): Promise<void> {
  requireAdmin(actor);
  const errors = new Errors();
  const inboundId = errors.text(form, "inbound_id", 60, true);
  const ownerId = errors.text(form, "owner_id", 128, true);
  errors.throwIfAny();
  if (!await assignableOwner(db, contentDb, actor, ownerId)) fail("owner_id", "invalid");
  const row = await db.prepare("SELECT opportunity_id FROM crm_inbound WHERE id = ? AND status = 'queued'").bind(inboundId).first<{ opportunity_id: string }>();
  if (!row) fail("inbound_id", "invalid");
  const now = nowIso();
  const key = typeof form.get("request_key") === "string" ? String(form.get("request_key")) : "";
  const queued = { sql: "EXISTS (SELECT 1 FROM crm_inbound WHERE id = ? AND status = 'queued')", args: [inboundId] };
  const result = await onceGuarded(db, actor, key, "inbound_assign", inboundId, queued, [
    db.prepare(`UPDATE crm_opportunities SET owner_id = ?, seller_id = COALESCE(seller_id, ?), version = version + 1, updated_at = ? WHERE id = ? AND owner_id IS NULL AND ${queued.sql}`).bind(ownerId, ownerId, now, row!.opportunity_id, ...queued.args),
    eventStatement(db, actor, "assigned", { from: null, to: ownerId, inbound_id: inboundId }, { opportunityId: row!.opportunity_id }, queued),
    db.prepare("UPDATE crm_inbound SET status = 'assigned', handled_by = ?, handled_at = ? WHERE id = ? AND status = 'queued'").bind(actor.id, now, inboundId),
  ]);
  if (!result.changed) throw new ConflictError();
}

/** Dismisses spam or misdirected enquiries; the record and its opportunity are kept, closed as not a fit. */
export async function dismissInbound(db: D1Database, actor: CrmActor, form: FormData): Promise<void> {
  requireAdmin(actor);
  const errors = new Errors();
  const inboundId = errors.text(form, "inbound_id", 60, true);
  const reason = errors.text(form, "dismiss_reason", 500, true);
  errors.throwIfAny();
  const row = await db.prepare("SELECT i.opportunity_id, o.playbook_id FROM crm_inbound i JOIN crm_opportunities o ON o.id = i.opportunity_id WHERE i.id = ? AND i.status = 'queued'").bind(inboundId).first<{ opportunity_id: string; playbook_id: string }>();
  if (!row) fail("inbound_id", "invalid");
  const def = JSON.parse((await db.prepare("SELECT definition FROM crm_playbooks WHERE id = ?").bind(row!.playbook_id).first<{ definition: string }>())?.definition ?? "{}") as { stages?: { id: string; outcome: string }[] };
  const lost = def.stages?.find((stage) => stage.outcome === "lost")?.id;
  if (!lost) throw new ValidationError({ inbound_id: "invalid" });
  const now = nowIso();
  const key = typeof form.get("request_key") === "string" ? String(form.get("request_key")) : "";
  // Every statement runs only while the enquiry is still queued; the status change runs last.
  const queued = { sql: "EXISTS (SELECT 1 FROM crm_inbound WHERE id = ? AND status = 'queued')", args: [inboundId] };
  const result = await onceGuarded(db, actor, key, "inbound_dismiss", inboundId, queued, [
    db.prepare(`UPDATE crm_opportunities SET stage_id = ?, outcome = 'lost', lost_reason = ?, closed_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner_id IS NULL AND ${queued.sql}`).bind(lost, reason, now, now, row!.opportunity_id, ...queued.args),
    db.prepare(`INSERT INTO crm_stage_history (id, opportunity_id, playbook_id, from_stage, to_stage, reason, actor_id, created_at) SELECT ?, ?, ?, NULL, ?, ?, ?, ? WHERE ${queued.sql}`).bind(`stg_${crypto.randomUUID().replaceAll("-", "")}`, row!.opportunity_id, row!.playbook_id, lost, `inbound dismissed: ${reason}`, actor.id, now, ...queued.args),
    eventStatement(db, actor, "inbound_dismissed", { inbound_id: inboundId, reason }, { opportunityId: row!.opportunity_id }, queued),
    db.prepare("UPDATE crm_inbound SET status = 'dismissed', dismiss_reason = ?, handled_by = ?, handled_at = ? WHERE id = ? AND status = 'queued'").bind(reason, actor.id, now, inboundId),
  ]);
  if (!result.changed) throw new ConflictError();
}

const cohortKeyPattern = /^[a-z0-9][a-z0-9-]{2,59}$/;

export async function saveCohort(db: D1Database, actor: CrmActor, form: FormData): Promise<void> {
  requireAdmin(actor);
  const errors = new Errors();
  const key = errors.text(form, "cohort_key", 60, true);
  const name = errors.text(form, "name", 120, true);
  const playbookKey = errors.text(form, "playbook_key", 60, true);
  const startsOn = errors.text(form, "starts_on", 10, true);
  const endsOn = errors.text(form, "ends_on", 10);
  const target = errors.text(form, "target_size", 5);
  if (key && !cohortKeyPattern.test(key)) errors.add("cohort_key", "invalid");
  if (startsOn && !isIsoDate(startsOn)) errors.add("starts_on", "invalid");
  if (endsOn && (!isIsoDate(endsOn) || endsOn < startsOn)) errors.add("ends_on", "invalid");
  if (target && (!/^\d{1,4}$/.test(target) || Number(target) < 1)) errors.add("target_size", "invalid");
  errors.throwIfAny();
  if (await db.prepare("SELECT 1 FROM crm_cohorts WHERE cohort_key = ?").bind(key).first()) fail("cohort_key", "taken");
  const policy = await db.prepare("SELECT id FROM crm_policies WHERE policy_key = 'local-cohort-gate' ORDER BY version DESC LIMIT 1").first<{ id: string }>();
  const now = nowIso();
  await db.batch([
    db.prepare("INSERT INTO crm_cohorts (cohort_key, name, playbook_key, starts_on, ends_on, target_size, policy_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(key, name, playbookKey, startsOn, endsOn || null, target ? Number(target) : null, policy?.id ?? null, actor.id, now, now),
    eventStatement(db, actor, "cohort_created", { cohort_key: key }, {}),
  ]);
}

export async function setCostingComplete(db: D1Database, actor: CrmActor, form: FormData): Promise<void> {
  requireAdmin(actor);
  const errors = new Errors();
  const key = errors.text(form, "cohort_key", 60, true);
  const complete = form.get("costing_complete") === "1";
  const note = errors.text(form, "costing_note", 1000, complete);
  errors.throwIfAny();
  const result = await db.prepare("UPDATE crm_cohorts SET costing_complete = ?, costing_note = ?, updated_at = ? WHERE cohort_key = ?").bind(complete ? 1 : 0, note, nowIso(), key).run();
  if (!result.meta.changes) fail("cohort_key", "invalid");
  await eventStatement(db, actor, "cohort_costing", { cohort_key: key, complete, note }, {}).run();
}
