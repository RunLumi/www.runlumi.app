// Tasks, meetings, visits and time/cost records on an opportunity.
// Reminders here are for the CRM user only; they never message a customer.
import type { CrmActor } from "./access";
import { Errors, ForbiddenError, eventStatement, fail, newId, nowIso, once } from "./core";
import { vnDate } from "./money";
import { isIsoDate } from "./playbook";
import type { Opportunity } from "./records";

export const taskKinds = ["call", "message", "visit", "meeting", "demo", "pilot_review", "follow_up", "internal", "support"] as const;
export type TaskKind = typeof taskKinds[number];
/** Kinds that reach the customer and are blocked by do-not-contact. */
export const outreachKinds: readonly TaskKind[] = ["call", "message", "visit", "meeting", "demo", "follow_up"];
export const taskOutcomes = ["reached", "no_answer", "owner_absent", "rescheduled", "held", "no_show", "completed", "declined"] as const;
export const externalStates = ["none", "draft", "submitting", "verified", "failed", "unknown"] as const;
export const costCategories = ["research", "preview", "travel", "sales", "delivery", "support", "domain", "hosting", "printing", "generation", "payment_fee", "ads", "other"] as const;

export interface Task {
  id: string; opportunity_id: string; kind: TaskKind; title: string; due_on: string | null; due_time: string | null;
  contact_id: string | null; channel: string; assignee_id: string | null; status: "open" | "done" | "cancelled"; outcome: string;
  meeting_confirmed: number; needs_help: number; help_note: string; external_state: typeof externalStates[number]; note: string;
  created_at: string; completed_at: string | null;
}

function requestKey(form: FormData): string {
  return typeof form.get("request_key") === "string" ? String(form.get("request_key")) : "";
}

/**
 * Do-not-contact applies to every channel and playbook. Outreach is blocked
 * when the named contact, or the whole account, asked not to be contacted, or
 * when no contact on the account is reachable.
 */
export async function outreachBlocked(db: D1Database, opportunity: Opportunity, contactId: string | null): Promise<boolean> {
  if (opportunity.account_dnc) return true;
  if (contactId) {
    const contact = await db.prepare("SELECT do_not_contact, consent_status FROM crm_contacts WHERE id = ? AND account_id = ?").bind(contactId, opportunity.account_id)
      .first<{ do_not_contact: number; consent_status: string }>();
    return !contact || contact.do_not_contact === 1 || contact.consent_status === "withdrawn" || contact.consent_status === "refused";
  }
  const reachable = await db.prepare("SELECT 1 FROM crm_contacts WHERE account_id = ? AND do_not_contact = 0 AND consent_status NOT IN ('withdrawn', 'refused') LIMIT 1").bind(opportunity.account_id).first();
  const any = await db.prepare("SELECT 1 FROM crm_contacts WHERE account_id = ? LIMIT 1").bind(opportunity.account_id).first();
  return !!any && !reachable;
}

export async function createTask(db: D1Database, actor: CrmActor, opportunity: Opportunity, form: FormData): Promise<void> {
  const errors = new Errors();
  const kind = errors.text(form, "kind", 20, true) as TaskKind;
  const title = errors.text(form, "title", 300, true);
  const due_on = errors.text(form, "due_on", 10);
  const due_time = errors.text(form, "due_time", 5);
  const contact_id = errors.text(form, "contact_id", 60) || null;
  const channel = errors.text(form, "channel", 20);
  const note = errors.text(form, "note", 1000);
  if (!taskKinds.includes(kind)) errors.add("kind", "invalid");
  if (due_on && !isIsoDate(due_on)) errors.add("due_on", "invalid");
  if (due_time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(due_time)) errors.add("due_time", "invalid");
  if (["visit", "meeting", "demo"].includes(kind) && !due_on) errors.add("due_on", "required");
  errors.throwIfAny();
  if (contact_id && !await db.prepare("SELECT 1 FROM crm_contacts WHERE id = ? AND account_id = ?").bind(contact_id, opportunity.account_id).first()) fail("contact_id", "invalid");
  if (outreachKinds.includes(kind) && await outreachBlocked(db, opportunity, contact_id)) fail("contact_id", "do_not_contact");
  const id = newId("tsk");
  const now = nowIso();
  await once(db, actor, requestKey(form), "task_create", id, [
    db.prepare(`INSERT INTO crm_tasks (id, opportunity_id, kind, title, due_on, due_time, contact_id, channel, assignee_id, meeting_confirmed, note, external_state, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, opportunity.id, kind, title, due_on || null, due_time || null, contact_id, channel, opportunity.owner_id ?? actor.id,
        form.get("meeting_confirmed") === "1" ? 1 : 0, note, kind === "message" ? "draft" : "none", actor.id, now, now),
    eventStatement(db, actor, "task_created", { task_id: id, kind, title, due_on }, { opportunityId: opportunity.id, accountId: opportunity.account_id }),
  ]);
}

export async function updateTask(db: D1Database, actor: CrmActor, opportunity: Opportunity, form: FormData): Promise<void> {
  const errors = new Errors();
  const taskId = errors.text(form, "task_id", 60, true);
  const action = errors.text(form, "task_action", 20, true);
  const outcome = errors.text(form, "outcome", 20);
  const note = errors.text(form, "note", 1000);
  const help_note = errors.text(form, "help_note", 500);
  const external_state = errors.text(form, "external_state", 20);
  const minutesRaw = errors.text(form, "minutes", 6);
  const category = errors.text(form, "category", 20) || "sales";
  errors.throwIfAny();
  const task = await db.prepare("SELECT * FROM crm_tasks WHERE id = ? AND opportunity_id = ?").bind(taskId, opportunity.id).first<Task>();
  if (!task) fail("task_id", "invalid");
  const now = nowIso();
  const target = { opportunityId: opportunity.id, accountId: opportunity.account_id };
  const statements: D1PreparedStatement[] = [];
  if (action === "complete") {
    if (task!.status !== "open") fail("task_id", "closed");
    if (!taskOutcomes.includes(outcome as typeof taskOutcomes[number])) fail("outcome", "required");
    const minutes = minutesRaw ? Number(minutesRaw) : null;
    if (minutesRaw && (!/^\d{1,5}$/.test(minutesRaw) || minutes! > 1440)) fail("minutes", "invalid");
    if (!costCategories.includes(category as typeof costCategories[number])) fail("category", "invalid");
    // Time is logged only by the request that actually closes the task.
    const open = { sql: "EXISTS (SELECT 1 FROM crm_tasks WHERE id = ? AND status = 'open')", args: [taskId] };
    if (minutes) statements.push(db.prepare(`INSERT INTO crm_costs (id, opportunity_id, cohort_key, category, basis, minutes, occurred_on, note, recorded_by, created_at) SELECT ?, ?, ?, ?, 'actual', ?, ?, ?, ?, ? WHERE ${open.sql}`)
      .bind(newId("cst"), opportunity.id, opportunity.cohort_key, category, minutes, vnDate(), `task ${taskId}`, actor.id, now, ...open.args));
    statements.push(eventStatement(db, actor, "task_completed", { task_id: taskId, kind: task!.kind, outcome, minutes }, target, open));
    statements.push(db.prepare("UPDATE crm_tasks SET status = 'done', outcome = ?, note = CASE WHEN ? = '' THEN note ELSE ? END, completed_at = ?, updated_at = ? WHERE id = ? AND status = 'open'")
      .bind(outcome, note, note, now, now, taskId));
  } else if (action === "cancel") {
    statements.push(db.prepare("UPDATE crm_tasks SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'open'").bind(now, taskId));
    statements.push(eventStatement(db, actor, "task_cancelled", { task_id: taskId }, target));
  } else if (action === "confirm") {
    statements.push(db.prepare("UPDATE crm_tasks SET meeting_confirmed = 1, updated_at = ? WHERE id = ?").bind(now, taskId));
    statements.push(eventStatement(db, actor, "meeting_confirmed", { task_id: taskId }, target));
  } else if (action === "help") {
    const needs = form.get("needs_help") === "1";
    if (needs && !help_note) fail("help_note", "required");
    statements.push(db.prepare("UPDATE crm_tasks SET needs_help = ?, help_note = ?, updated_at = ? WHERE id = ?").bind(needs ? 1 : 0, needs ? help_note : "", now, taskId));
    statements.push(eventStatement(db, actor, needs ? "help_requested" : "help_resolved", { task_id: taskId, note: help_note }, target));
  } else if (action === "external") {
    if (!externalStates.includes(external_state as typeof externalStates[number])) fail("external_state", "invalid");
    // Unknown results need a person to verify; they are not retried here.
    if (task!.external_state === "unknown" && !["verified", "failed"].includes(external_state)) fail("external_state", "verify_unknown");
    if ((external_state === "verified" || external_state === "failed") && !note) fail("note", "required");
    statements.push(db.prepare("UPDATE crm_tasks SET external_state = ?, note = CASE WHEN ? = '' THEN note ELSE ? END, updated_at = ? WHERE id = ?").bind(external_state, note, note, now, taskId));
    statements.push(eventStatement(db, actor, "external_state", { task_id: taskId, from: task!.external_state, to: external_state, note }, target));
  } else fail("task_action", "invalid");
  await once(db, actor, requestKey(form), `task_${action}`, taskId, statements);
}

export async function logCost(db: D1Database, actor: CrmActor, opportunity: Opportunity | null, form: FormData, cohortKey?: string): Promise<void> {
  const errors = new Errors();
  const category = errors.text(form, "category", 20, true);
  const basis = errors.text(form, "basis", 10) || "actual";
  const minutesRaw = errors.text(form, "minutes", 6);
  const amountRaw = errors.text(form, "amount_vnd", 20).replace(/[.,\s₫đ]/gi, "");
  const occurred_on = errors.text(form, "occurred_on", 10) || vnDate();
  const note = errors.text(form, "note", 500);
  if (!costCategories.includes(category as typeof costCategories[number])) errors.add("category", "invalid");
  if (!["actual", "estimate"].includes(basis)) errors.add("basis", "invalid");
  if (minutesRaw && !/^\d{1,5}$/.test(minutesRaw)) errors.add("minutes", "invalid");
  if (amountRaw && !/^\d{1,13}$/.test(amountRaw)) errors.add("amount_vnd", "invalid");
  if (!minutesRaw && !amountRaw) errors.add("minutes", "required");
  if (!isIsoDate(occurred_on)) errors.add("occurred_on", "invalid");
  errors.throwIfAny();
  if (!opportunity && !actor.admin) throw new ForbiddenError();
  const id = newId("cst");
  await once(db, actor, requestKey(form), "cost", id, [
    db.prepare("INSERT INTO crm_costs (id, opportunity_id, cohort_key, category, basis, minutes, amount_vnd, occurred_on, note, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, opportunity?.id ?? null, opportunity?.cohort_key ?? cohortKey ?? null, category, basis, minutesRaw ? Number(minutesRaw) : null, amountRaw ? Number(amountRaw) : null, occurred_on, note, actor.id, nowIso()),
    eventStatement(db, actor, "cost_logged", { cost_id: id, category, basis, minutes: minutesRaw || null, amount_vnd: amountRaw || null }, { opportunityId: opportunity?.id ?? null, accountId: opportunity?.account_id ?? null }),
  ]);
}

export async function opportunityTasks(db: D1Database, opportunityId: string): Promise<Task[]> {
  return (await db.prepare("SELECT * FROM crm_tasks WHERE opportunity_id = ? ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, due_on, created_at DESC LIMIT 100").bind(opportunityId).all<Task>()).results;
}

export interface CostRow { id: string; category: string; basis: string; minutes: number | null; amount_vnd: number | null; occurred_on: string; note: string }
export async function opportunityCosts(db: D1Database, opportunityId: string): Promise<CostRow[]> {
  return (await db.prepare("SELECT id, category, basis, minutes, amount_vnd, occurred_on, note FROM crm_costs WHERE opportunity_id = ? ORDER BY occurred_on DESC, created_at DESC LIMIT 100").bind(opportunityId).all<CostRow>()).results;
}
