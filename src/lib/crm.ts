import { activeUser } from "./admin-auth";

export const stages = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
export type Stage = typeof stages[number];
export type CrmActor = { id: string; name: string; admin: boolean };
export interface CrmMember { user_id: string; email: string; name: string; enabled: number; active: boolean }
export interface Lead {
  id: string; company: string; contact_name: string; email: string; phone: string;
  source: string; owner_id: string; stage: Stage; value_vnd: number; next_action: string;
  next_contact_on: string | null; lost_reason: string; version: number;
  created_at: string; updated_at: string;
}
export interface Activity { id: string; actor_name: string; kind: string; body: string; created_at: string }
export type LeadInput = Pick<Lead, "company" | "contact_name" | "email" | "phone" | "source" | "stage" | "value_vnd" | "next_action" | "next_contact_on" | "lost_reason">;

export async function crmActor(locals: App.Locals, db: D1Database): Promise<CrmActor | null> {
  const user = activeUser(locals);
  if (!user) return null;
  const admin = user.role === 50;
  if (!admin && !await db.prepare("SELECT user_id FROM crm_members WHERE user_id = ? AND enabled = 1").bind(user.id).first()) return null;
  return { id: user.id, name: user.name || user.email, admin };
}

export function leadScope(actor: CrmActor) {
  return actor.admin ? { sql: "1 = 1", args: [] as string[] } : { sql: "owner_id = ?", args: [actor.id] };
}

export async function getLead(db: D1Database, actor: CrmActor, id: string): Promise<Lead | null> {
  const scope = leadScope(actor);
  return db.prepare(`SELECT * FROM crm_leads WHERE id = ? AND ${scope.sql}`).bind(id, ...scope.args).first<Lead>();
}

export async function members(db: D1Database, contentDb: D1Database): Promise<CrmMember[]> {
  const rows = (await db.prepare("SELECT user_id, enabled FROM crm_members ORDER BY user_id").all<{ user_id: string; enabled: number }>()).results;
  if (!rows.length) return [];
  const placeholders = rows.map(() => "?").join(", ");
  const users = (await contentDb.prepare(`SELECT id, email, name, disabled FROM users WHERE id IN (${placeholders})`).bind(...rows.map((row) => row.user_id)).all<{ id: string; email: string; name: string | null; disabled: number }>()).results;
  const userById = new Map(users.map((user) => [user.id, user]));
  return rows.map((row) => {
    const user = userById.get(row.user_id);
    return { user_id: row.user_id, email: user?.email ?? "", name: user?.name ?? "", enabled: row.enabled, active: !!user && user.disabled === 0 };
  });
}

export function parseLead(form: FormData): LeadInput {
  const text = (key: string, max: number, required = false) => {
    const raw = form.get(key);
    if (typeof raw !== "string" || raw.trim().length > max || (required && !raw.trim())) throw new Error("invalid");
    return raw.trim();
  };
  const company = text("company", 160, true);
  const contact_name = text("contact_name", 160, true);
  const email = text("email", 254);
  const phone = text("phone", 80);
  if (!email && !phone) throw new Error("contact");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("email");
  const stage = text("stage", 20);
  if (!stages.includes(stage as Stage)) throw new Error("stage");
  const amount = text("value_vnd", 14, true);
  const value_vnd = Number(amount);
  if (!/^\d+$/.test(amount) || !Number.isSafeInteger(value_vnd) || value_vnd > 1_000_000_000_000) throw new Error("value");
  const next_contact_on = text("next_contact_on", 10) || null;
  if (next_contact_on && (!/^\d{4}-\d{2}-\d{2}$/.test(next_contact_on) || !Number.isFinite(Date.parse(next_contact_on)) || new Date(next_contact_on).toISOString().slice(0, 10) !== next_contact_on)) throw new Error("date");
  const lost_reason = text("lost_reason", 1000);
  if (stage === "lost" && !lost_reason) throw new Error("reason");
  return { company, contact_name, email, phone, source: text("source", 200), stage: stage as Stage, value_vnd, next_action: text("next_action", 1000), next_contact_on, lost_reason: stage === "lost" ? lost_reason : "" };
}

export function inputValues(input: LeadInput) {
  return [input.company, input.contact_name, input.email, input.phone, input.source, input.stage, input.value_vnd, input.next_action, input.next_contact_on, input.lost_reason];
}

export async function createLead(db: D1Database, actor: CrmActor, input: LeadInput, owner: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO crm_leads (id, company, contact_name, email, phone, source, stage, value_vnd, next_action, next_contact_on, lost_reason, owner_id, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, ...inputValues(input), owner, actor.id, actor.id, now, now),
    db.prepare("INSERT INTO crm_activities (id, lead_id, actor_id, actor_name, kind, body, created_at) VALUES (?, ?, ?, ?, 'created', ?, ?)").bind(crypto.randomUUID(), id, actor.id, actor.name, JSON.stringify({ stage: input.stage, owner_id: owner }), now),
  ]);
  return id;
}

// D1 executes batch statements atomically. The audit insert and update share
// the ownership/version guard, so stale edits cannot append activity.
export async function changeLead(db: D1Database, actor: CrmActor, lead: Lead, version: number, change: { input: LeadInput; owner: string } | { note: string }): Promise<boolean> {
  const scope = leadScope(actor);
  const where = `id = ? AND version = ? AND ${scope.sql}`;
  const args = [lead.id, version, ...scope.args];
  const now = new Date().toISOString();
  const body = "note" in change ? change.note : JSON.stringify({ from: { stage: lead.stage, owner_id: lead.owner_id, value_vnd: lead.value_vnd }, to: { ...change.input, owner_id: change.owner } });
  const audit = db.prepare(`INSERT INTO crm_activities (id, lead_id, actor_id, actor_name, kind, body, created_at) SELECT ?, id, ?, ?, ?, ?, ? FROM crm_leads WHERE ${where}`).bind(crypto.randomUUID(), actor.id, actor.name, "note" in change ? "note" : "updated", body, now, ...args);
  const update = "note" in change
    ? db.prepare(`UPDATE crm_leads SET version = version + 1, updated_by = ?, updated_at = ? WHERE ${where}`).bind(actor.id, now, ...args)
    : db.prepare(`UPDATE crm_leads SET company = ?, contact_name = ?, email = ?, phone = ?, source = ?, stage = ?, value_vnd = ?, next_action = ?, next_contact_on = ?, lost_reason = ?, owner_id = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE ${where}`).bind(...inputValues(change.input), change.owner, actor.id, now, ...args);
  const result = await db.batch([audit, update]);
  return result[1].meta.changes === 1;
}

export async function validOwner(contentDb: D1Database, db: D1Database, actor: CrmActor, owner: string): Promise<boolean> {
  if (!actor.admin) return owner === actor.id;
  if (owner === actor.id) return true;
  const member = await db.prepare("SELECT user_id FROM crm_members WHERE user_id = ? AND enabled = 1").bind(owner).first();
  if (!member) return false;
  const user = await contentDb.prepare("SELECT id FROM users WHERE id = ? AND disabled = 0 AND role < 50 LIMIT 1").bind(owner).first();
  return !!user;
}
