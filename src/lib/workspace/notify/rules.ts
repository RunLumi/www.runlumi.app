// Notification rules (R-09): when a CRM event happens, under safe conditions
// (no expressions, no code), tell internal recipients by email and post to
// chosen webhooks. Recipients are Workspace members only: by role, by person
// or the record owner, and each receives only what their own CRM permissions
// let them see (a Sales Executive never hears about someone else's deal).
// Admins (users.manage) configure; every change is versioned and audited.
import { ANNOUNCED_KINDS } from "../../crm/lark/cards";
import { AccessError, auditStatement } from "../members";
import { type Role, roles, workspaceUserFor } from "../roles";

export const RULE_EVENTS = ANNOUNCED_KINDS;
export type RuleEvent = typeof RULE_EVENTS[number];
const outcomes = ["", "open", "won", "lost"] as const;

export interface RuleConditions { playbooks: string[]; min_value_vnd: number | null; outcome: typeof outcomes[number] }
export interface RuleRecipients { roles: Role[]; admins: boolean; users: string[]; record_owner: boolean }
export interface RuleInput { name: string; events: RuleEvent[]; conditions: RuleConditions; recipients: RuleRecipients; email: boolean; destinations: string[]; enabled: boolean }
export interface Rule extends RuleInput { id: string; module: "crm"; version: number; created_by: string; created_at: string; updated_by: string; updated_at: string }

const plain = (value: unknown, max: number) => String(value ?? "").replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
const ids = (values: unknown[], pattern: RegExp, max = 50) => [...new Set(values.map((value) => String(value)).filter((value) => pattern.test(value)))].slice(0, max);

/** Reads the rule form. Only known events, roles and IDs survive; the rest is ignored or refused. */
export function parseRuleForm(form: FormData): RuleInput {
  const name = plain(form.get("name"), 120);
  if (!name) throw new AccessError("name", "required");
  const events = [...new Set(form.getAll("events").map(String))].filter((value): value is RuleEvent => (RULE_EVENTS as readonly string[]).includes(value));
  if (!events.length) throw new AccessError("events", "required");
  const rawValue = plain(form.get("min_value_vnd"), 20).replace(/[.,\s]/g, "");
  if (rawValue && !/^\d{1,15}$/.test(rawValue)) throw new AccessError("min_value_vnd", "invalid");
  const outcome = plain(form.get("outcome"), 10);
  const conditions: RuleConditions = {
    playbooks: ids(form.getAll("playbooks"), /^[A-Za-z0-9_-]{1,80}$/),
    min_value_vnd: rawValue ? Number(rawValue) : null,
    outcome: (outcomes as readonly string[]).includes(outcome) ? outcome as RuleConditions["outcome"] : "",
  };
  const recipients: RuleRecipients = {
    roles: [...new Set(form.getAll("recipient_roles").map(String))].filter((value): value is Role => (roles as readonly string[]).includes(value)),
    users: ids(form.getAll("recipient_users"), /^[A-Za-z0-9_-]{1,80}$/),
    admins: form.get("recipient_admins") === "1",
    record_owner: form.get("record_owner") === "1",
  };
  const email = form.get("email") === "1";
  const destinations = ids(form.getAll("destinations"), /^dst_[a-f0-9]{32}$/, 10);
  if (email && !recipients.roles.length && !recipients.admins && !recipients.users.length && !recipients.record_owner) throw new AccessError("recipients", "required");
  if (!email && !destinations.length) throw new AccessError("channels", "required");
  return { name, events, conditions, recipients, email, destinations, enabled: form.get("enabled") !== "0" };
}

type Row = Omit<Rule, "events" | "conditions" | "recipients" | "destinations" | "email" | "enabled"> & { events: string; conditions: string; recipients: string; destinations: string; email: number; enabled: number };
const json = <T>(text: string, fallback: T): T => { try { return JSON.parse(text) as T; } catch { return fallback; } };
function fromRow(row: Row): Rule {
  return {
    ...row, module: "crm", events: json(row.events, []), destinations: json(row.destinations, []), email: row.email === 1, enabled: row.enabled === 1,
    conditions: { playbooks: [], min_value_vnd: null, outcome: "", ...json(row.conditions, {}) }, recipients: { roles: [], admins: false, users: [], record_owner: false, ...json(row.recipients, {}) },
  };
}

export async function listRules(db: D1Database, onlyEnabled = false): Promise<Rule[]> {
  return (await db.prepare(`SELECT * FROM workspace_notification_rules${onlyEnabled ? " WHERE enabled = 1" : ""} ORDER BY name LIMIT 200`).all<Row>()).results.map(fromRow);
}

export async function getRule(db: D1Database, id: string): Promise<Rule | null> {
  const row = await db.prepare("SELECT * FROM workspace_notification_rules WHERE id = ?").bind(id).first<Row>();
  return row ? fromRow(row) : null;
}

/** Creates (id null) or updates a rule; an update with a stale version is refused. Audited. */
export async function saveRule(db: D1Database, actor: { id: string; name: string; can(permission: "users.manage"): boolean }, id: string | null, input: RuleInput, version?: number): Promise<string> {
  if (!actor.can("users.manage")) throw new AccessError("rule", "forbidden");
  const known = new Set((await db.prepare("SELECT id FROM workspace_notification_destinations WHERE status != 'removed'").all<{ id: string }>()).results.map((row) => row.id));
  if (input.destinations.some((destination) => !known.has(destination))) throw new AccessError("destinations", "invalid");
  const now = new Date().toISOString();
  const values = [input.name, JSON.stringify(input.events), JSON.stringify(input.conditions), JSON.stringify(input.recipients), input.email ? 1 : 0, JSON.stringify(input.destinations), input.enabled ? 1 : 0];
  if (!id) {
    const created = `rul_${crypto.randomUUID().replaceAll("-", "")}`;
    await db.batch([
      db.prepare("INSERT INTO workspace_notification_rules (id, name, events, conditions, recipients, email, destinations, enabled, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(created, ...values, actor.id, now, actor.id, now),
      auditStatement(db, actor, "notification_rule_saved", created, { rule: created, version: 1, ...input }, now, { module: "admin" }),
    ]);
    return created;
  }
  const result = await db.prepare("UPDATE workspace_notification_rules SET name = ?, events = ?, conditions = ?, recipients = ?, email = ?, destinations = ?, enabled = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ? AND version = ?")
    .bind(...values, actor.id, now, id, version ?? -1).run();
  if (result.meta.changes !== 1) throw new AccessError("version", (await getRule(db, id)) ? "stale" : "not_found");
  await auditStatement(db, actor, "notification_rule_saved", id, { rule: id, version: (version ?? 0) + 1, ...input }, now, { module: "admin" }).run();
  return id;
}

export interface EventSubject { kind: string; playbook_id: string | null; value: number | null; outcome: string | null; owner_id: string | null }

export function matches(rule: Rule, event: EventSubject): boolean {
  if (!rule.enabled || !(rule.events as readonly string[]).includes(event.kind)) return false;
  const { playbooks, min_value_vnd, outcome } = rule.conditions;
  if (playbooks.length && (!event.playbook_id || !playbooks.includes(event.playbook_id))) return false;
  // Unknown values stay unknown: a value condition never matches an unknown value.
  if (min_value_vnd !== null && (event.value === null || event.value < min_value_vnd)) return false;
  if (outcome && event.outcome !== outcome) return false;
  return true;
}

export interface Recipient { id: string; email: string; name: string }

/**
 * Internal people the rule names who may see this record: active EmDash
 * accounts with Workspace CRM access, and either team-wide CRM access or
 * ownership of the record.
 */
export async function recipientsFor(db: D1Database, contentDb: D1Database, rule: Rule, event: Pick<EventSubject, "owner_id">): Promise<Recipient[]> {
  const wanted = new Set<string>(rule.recipients.users);
  if (rule.recipients.record_owner && event.owner_id) wanted.add(event.owner_id);
  if (rule.recipients.roles.length) {
    const rows = (await db.prepare(`SELECT DISTINCT r.user_id FROM workspace_roles r JOIN workspace_members m ON m.user_id = r.user_id WHERE m.enabled = 1 AND r.role IN (${rule.recipients.roles.map(() => "?").join(", ")}) LIMIT 300`).bind(...rule.recipients.roles).all<{ user_id: string }>()).results;
    for (const row of rows) wanted.add(row.user_id);
  }
  if (rule.recipients.admins) {
    for (const row of (await contentDb.prepare("SELECT id FROM users WHERE role = 50 AND disabled = 0 LIMIT 50").all<{ id: string }>()).results) wanted.add(row.id);
  }
  const out: Recipient[] = [];
  for (const id of [...wanted].slice(0, 300)) {
    const account = await contentDb.prepare("SELECT id, email, name, role FROM users WHERE id = ? AND disabled = 0 LIMIT 1").bind(id).first<{ id: string; email: string; name: string | null; role: number }>();
    if (!account) continue;
    const person = await workspaceUserFor(db, account);
    if (!person?.can("crm.access")) continue;
    if (!person.can("crm.team") && event.owner_id !== person.id) continue;
    out.push({ id: person.id, email: account.email, name: person.name });
  }
  return out;
}
