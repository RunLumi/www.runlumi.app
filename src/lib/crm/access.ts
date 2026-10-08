// CRM authorization on top of Workspace roles (src/lib/workspace/roles.ts).
// EmDash owns identity, session and disabled status.
import { type WorkspaceUser, workspaceUser } from "../workspace/roles";
import { type EmDashUser, chunks, emdashUsers, hasRole, membersWithRoles } from "../workspace/members";

export { chunks, emdashUsers };
export type { EmDashUser };

export interface CrmActor {
  id: string; name: string; email: string;
  /** Team-wide: sees every opportunity and assigns owners (Admin, Sales Manager). */
  manager: boolean;
  /** System configuration: playbooks, offers, commission policy (Admin only). */
  configure: boolean;
  finance: boolean;
  fulfillment: boolean;
  /** May refer businesses to the team (partners, sales). */
  refer: boolean;
  /** May report a payment received for finance to confirm (staff, not partners). */
  reportPayments: boolean;
}

export function actorFrom(user: WorkspaceUser): CrmActor | null {
  if (!user.can("crm.access")) return null;
  return { id: user.id, name: user.name, email: user.email, manager: user.can("crm.team"), configure: user.can("crm.configure"), finance: user.can("crm.finance"), fulfillment: user.can("crm.fulfillment"), refer: user.can("crm.refer"), reportPayments: user.can("crm.payments.report") };
}

export async function crmActor(locals: App.Locals, db: D1Database): Promise<CrmActor | null> {
  const user = locals.workspace ?? await workspaceUser(locals, db);
  return user ? actorFrom(user) : null;
}

export interface SqlScope { sql: string; args: unknown[] }

/** Opportunities a person may open: own, or every record for admins. */
export function opportunityScope(actor: CrmActor, alias = "o"): SqlScope {
  return actor.manager ? { sql: "1 = 1", args: [] } : { sql: `${alias}.owner_id = ?`, args: [actor.id] };
}

/**
 * Read scope for the opportunity page. Finance can read records with ledger
 * entries; fulfillment can read records with a handoff. Neither capability
 * grants edit rights to sales fields or ownership.
 */
export function readableScope(actor: CrmActor, alias = "o"): SqlScope {
  if (actor.manager) return { sql: "1 = 1", args: [] };
  const parts = [`${alias}.owner_id = ?`];
  if (actor.finance) parts.push(`EXISTS (SELECT 1 FROM crm_ledger l WHERE l.opportunity_id = ${alias}.id)`);
  if (actor.fulfillment) parts.push(`EXISTS (SELECT 1 FROM crm_fulfillments f WHERE f.opportunity_id = ${alias}.id)`);
  return { sql: `(${parts.join(" OR ")})`, args: [actor.id] };
}

/** Accounts are visible only through an opportunity the person may read. */
export function accountScope(actor: CrmActor, alias = "a"): SqlScope {
  if (actor.manager) return { sql: "1 = 1", args: [] };
  const readable = readableScope(actor, "ox");
  return { sql: `EXISTS (SELECT 1 FROM crm_opportunities ox WHERE ox.account_id = ${alias}.id AND ${readable.sql})`, args: readable.args };
}

/** Roles that can own opportunities. */
export const SELLING_ROLES = ["sales_manager", "sales_executive", "partner"] as const;

/** Managers may assign themselves, active admins, or enabled sales members; others only themselves. */
export async function assignableOwner(db: D1Database, contentDb: D1Database, actor: CrmActor, ownerId: string): Promise<boolean> {
  if (!actor.manager) return ownerId === actor.id;
  if (ownerId === actor.id) return true;
  const user = await contentDb.prepare("SELECT id, role FROM users WHERE id = ? AND disabled = 0 LIMIT 1").bind(ownerId).first<{ id: string; role: number }>();
  if (!user) return false;
  if (user.role === 50) return true;
  return hasRole(db, ownerId, SELLING_ROLES);
}

export interface OwnerOption { id: string; label: string }
export async function ownerOptions(db: D1Database, contentDb: D1Database, actor: CrmActor): Promise<OwnerOption[]> {
  const team = (await membersWithRoles(db, contentDb, SELLING_ROLES)).filter((member) => !member.admin);
  return [{ id: actor.id, label: actor.name }, ...team.filter((member) => member.user_id !== actor.id).map((member) => ({ id: member.user_id, label: member.name || member.email }))];
}

export async function displayNames(contentDb: D1Database, ids: readonly string[]): Promise<Record<string, { name: string; active: boolean }>> {
  const users = await emdashUsers(contentDb, ids);
  return Object.fromEntries([...users.values()].map((user) => [user.id, { name: user.name || user.email, active: user.disabled === 0 }]));
}

/** Owners of open work whose EmDash account, membership or sales role is no longer active. */
export async function inactiveOwnerIds(db: D1Database, contentDb: D1Database): Promise<string[]> {
  const owners = (await db.prepare("SELECT DISTINCT owner_id FROM crm_opportunities WHERE owner_id IS NOT NULL AND outcome IN ('open', 'paused') LIMIT 500").all<{ owner_id: string }>()).results.map((row) => row.owner_id);
  if (!owners.length) return [];
  const users = await emdashUsers(contentDb, owners);
  const enabled = new Set((await db.prepare(`SELECT DISTINCT m.user_id FROM workspace_members m JOIN workspace_roles r ON r.user_id = m.user_id WHERE m.enabled = 1 AND r.role IN ('sales_manager', 'sales_executive', 'partner')`).all<{ user_id: string }>()).results.map((row) => row.user_id));
  return owners.filter((id) => {
    const user = users.get(id);
    return !user || user.disabled !== 0 || (user.role !== 50 && !enabled.has(id));
  });
}
