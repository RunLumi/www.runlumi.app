// CRM identity and authorization. EmDash owns identity, session and disabled
// status; this module only reads the active EmDash user from locals and the
// explicit CRM allowlist/capabilities in the hiring D1 database.
import { activeUser } from "../admin-auth";

export type Capability = "finance" | "fulfillment";
export interface CrmActor {
  id: string; name: string; email: string;
  /** EmDash admin (role 50). Admins manage team, playbooks, offers and assignment. */
  admin: boolean;
  finance: boolean;
  fulfillment: boolean;
}

export async function crmActor(locals: App.Locals, db: D1Database): Promise<CrmActor | null> {
  const user = activeUser(locals);
  if (!user) return null;
  const name = user.name || user.email;
  if (user.role === 50) return { id: user.id, name, email: user.email, admin: true, finance: true, fulfillment: true };
  const rows = (await db.prepare(
    "SELECT m.user_id, c.capability FROM crm_members m LEFT JOIN crm_capabilities c ON c.user_id = m.user_id WHERE m.user_id = ? AND m.enabled = 1",
  ).bind(user.id).all<{ user_id: string; capability: Capability | null }>()).results;
  if (!rows.length) return null;
  const caps = new Set(rows.map((row) => row.capability));
  return { id: user.id, name, email: user.email, admin: false, finance: caps.has("finance"), fulfillment: caps.has("fulfillment") };
}

export interface SqlScope { sql: string; args: unknown[] }

/** Opportunities a person may open: own, or every record for admins. */
export function opportunityScope(actor: CrmActor, alias = "o"): SqlScope {
  return actor.admin ? { sql: "1 = 1", args: [] } : { sql: `${alias}.owner_id = ?`, args: [actor.id] };
}

/**
 * Read scope for the opportunity page. Finance can read records with ledger
 * entries; fulfillment can read records with a handoff. Neither capability
 * grants edit rights to sales fields or ownership.
 */
export function readableScope(actor: CrmActor, alias = "o"): SqlScope {
  if (actor.admin) return { sql: "1 = 1", args: [] };
  const parts = [`${alias}.owner_id = ?`];
  if (actor.finance) parts.push(`EXISTS (SELECT 1 FROM crm_ledger l WHERE l.opportunity_id = ${alias}.id)`);
  if (actor.fulfillment) parts.push(`EXISTS (SELECT 1 FROM crm_fulfillments f WHERE f.opportunity_id = ${alias}.id)`);
  return { sql: `(${parts.join(" OR ")})`, args: [actor.id] };
}

/** Accounts are visible only through an opportunity the person may read. */
export function accountScope(actor: CrmActor, alias = "a"): SqlScope {
  if (actor.admin) return { sql: "1 = 1", args: [] };
  const readable = readableScope(actor, "ox");
  return { sql: `EXISTS (SELECT 1 FROM crm_opportunities ox WHERE ox.account_id = ${alias}.id AND ${readable.sql})`, args: readable.args };
}

export interface MemberRow { user_id: string; email: string; name: string; enabled: number; active: boolean; role: number | null; finance: boolean; fulfillment: boolean }

/** D1 allows at most 100 bound parameters per statement. */
export const BIND_CHUNK = 90;
export function chunks<T>(items: readonly T[], size = BIND_CHUNK): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

export interface EmDashUser { id: string; email: string; name: string | null; disabled: number; role: number }

export async function emdashUsers(contentDb: D1Database, ids: readonly string[]): Promise<Map<string, EmDashUser>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, EmDashUser>();
  for (const part of chunks(unique)) {
    const rows = (await contentDb.prepare(`SELECT id, email, name, disabled, role FROM users WHERE id IN (${part.map(() => "?").join(", ")})`).bind(...part).all<EmDashUser>()).results;
    for (const row of rows) map.set(row.id, row);
  }
  return map;
}

export async function members(db: D1Database, contentDb: D1Database): Promise<MemberRow[]> {
  const rows = (await db.prepare(
    "SELECT m.user_id, m.enabled, GROUP_CONCAT(c.capability) AS caps FROM crm_members m LEFT JOIN crm_capabilities c ON c.user_id = m.user_id GROUP BY m.user_id ORDER BY m.updated_at DESC",
  ).all<{ user_id: string; enabled: number; caps: string | null }>()).results;
  const users = await emdashUsers(contentDb, rows.map((row) => row.user_id));
  return rows.map((row) => {
    const user = users.get(row.user_id);
    const caps = new Set((row.caps ?? "").split(","));
    return {
      user_id: row.user_id, email: user?.email ?? "", name: user?.name ?? "", enabled: row.enabled,
      active: !!user && user.disabled === 0, role: user?.role ?? null, finance: caps.has("finance"), fulfillment: caps.has("fulfillment"),
    };
  });
}

/** People an admin may assign: themselves, other active admins, or active enabled members. */
export async function assignableOwner(db: D1Database, contentDb: D1Database, actor: CrmActor, ownerId: string): Promise<boolean> {
  if (!actor.admin) return ownerId === actor.id;
  if (ownerId === actor.id) return true;
  const user = await contentDb.prepare("SELECT id, role FROM users WHERE id = ? AND disabled = 0 LIMIT 1").bind(ownerId).first<{ id: string; role: number }>();
  if (!user) return false;
  if (user.role === 50) return true;
  return !!await db.prepare("SELECT user_id FROM crm_members WHERE user_id = ? AND enabled = 1").bind(ownerId).first();
}

export interface OwnerOption { id: string; label: string }
export async function ownerOptions(db: D1Database, contentDb: D1Database, actor: CrmActor): Promise<OwnerOption[]> {
  const team = (await members(db, contentDb)).filter((member) => member.enabled && member.active && member.role !== 50);
  return [{ id: actor.id, label: actor.name }, ...team.filter((member) => member.user_id !== actor.id).map((member) => ({ id: member.user_id, label: member.name || member.email }))];
}

export async function displayNames(contentDb: D1Database, ids: readonly string[]): Promise<Record<string, { name: string; active: boolean }>> {
  const users = await emdashUsers(contentDb, ids);
  return Object.fromEntries([...users.values()].map((user) => [user.id, { name: user.name || user.email, active: user.disabled === 0 }]));
}

/** Owners of open work whose EmDash account or CRM membership is no longer active. */
export async function inactiveOwnerIds(db: D1Database, contentDb: D1Database): Promise<string[]> {
  const owners = (await db.prepare("SELECT DISTINCT owner_id FROM crm_opportunities WHERE owner_id IS NOT NULL AND outcome IN ('open', 'paused') LIMIT 500").all<{ owner_id: string }>()).results.map((row) => row.owner_id);
  if (!owners.length) return [];
  const users = await emdashUsers(contentDb, owners);
  const enabled = new Set((await db.prepare("SELECT user_id FROM crm_members WHERE enabled = 1").all<{ user_id: string }>()).results.map((row) => row.user_id));
  return owners.filter((id) => {
    const user = users.get(id);
    return !user || user.disabled !== 0 || (user.role !== 50 && !enabled.has(id));
  });
}
