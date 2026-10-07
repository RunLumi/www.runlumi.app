// Workspace membership: who may sign into private modules and with which
// roles. Identity details always come from EmDash (CONTENT_DB).
import { type Role, roles, workspaceUser } from "./roles";

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

export interface MemberRow { user_id: string; email: string; name: string; enabled: boolean; active: boolean; admin: boolean; roles: Role[] }

export async function workspaceMembers(db: D1Database, contentDb: D1Database): Promise<MemberRow[]> {
  const rows = (await db.prepare(
    "SELECT m.user_id, m.enabled, GROUP_CONCAT(r.role) AS roles FROM workspace_members m LEFT JOIN workspace_roles r ON r.user_id = m.user_id GROUP BY m.user_id ORDER BY m.updated_at DESC LIMIT 500",
  ).all<{ user_id: string; enabled: number; roles: string | null }>()).results;
  const users = await emdashUsers(contentDb, rows.map((row) => row.user_id));
  return rows.map((row) => {
    const user = users.get(row.user_id);
    return {
      user_id: row.user_id, email: user?.email ?? "", name: user?.name ?? "", enabled: row.enabled === 1,
      active: !!user && user.disabled === 0, admin: user?.role === 50,
      roles: (row.roles ?? "").split(",").filter((role): role is Role => (roles as readonly string[]).includes(role)),
    };
  });
}

/** Enabled members holding any of `wanted` roles, with active EmDash accounts. */
export async function membersWithRoles(db: D1Database, contentDb: D1Database, wanted: readonly Role[]): Promise<MemberRow[]> {
  return (await workspaceMembers(db, contentDb)).filter((member) => member.enabled && member.active && member.roles.some((role) => wanted.includes(role)));
}

export async function hasRole(db: D1Database, userId: string, wanted: readonly Role[]): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id = m.user_id WHERE m.user_id = ? AND m.enabled = 1 AND r.role IN (${wanted.map(() => "?").join(", ")}) LIMIT 1`,
  ).bind(userId, ...wanted).first();
  return !!row;
}

export { workspaceUser };

export interface AuditRow { id: string; actor_name: string; action: string; target_user_id: string; detail: string; created_at: string }

export class AccessError extends Error {
  readonly field: string;
  constructor(field: string, code: string) { super(code); this.field = field; }
}

function auditStatement(db: D1Database, actor: { id: string; name: string }, action: string, target: string, detail: Record<string, unknown>, now: string): D1PreparedStatement {
  return db.prepare("INSERT INTO workspace_audit (id, actor_id, actor_name, action, target_user_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(`aud_${crypto.randomUUID().replaceAll("-", "")}`, actor.id, actor.name, action, target, JSON.stringify(detail), now);
}

export function parseRoles(values: readonly unknown[]): Role[] {
  return [...new Set(values.filter((value): value is Role => typeof value === "string" && (roles as readonly string[]).includes(value)))];
}

/**
 * Grants access with roles to an existing, active, non-admin EmDash account,
 * or updates roles/enabled state of a member. EmDash admins already hold every
 * permission and are never stored here.
 */
export async function saveMember(
  db: D1Database, contentDb: D1Database, actor: { id: string; name: string },
  input: { email?: string; userId?: string; roles: Role[]; enabled: boolean },
): Promise<string> {
  const email = (input.email ?? "").trim().toLowerCase();
  const user = input.userId
    ? await contentDb.prepare("SELECT id, role, disabled FROM users WHERE id = ? LIMIT 1").bind(input.userId).first<{ id: string; role: number; disabled: number }>()
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? await contentDb.prepare("SELECT id, role, disabled FROM users WHERE lower(email) = ? LIMIT 1").bind(email).first<{ id: string; role: number; disabled: number }>()
      : null;
  if (!user) throw new AccessError(input.userId ? "user_id" : "email", "not_found");
  if (user.role === 50) throw new AccessError(input.userId ? "user_id" : "email", "already_admin");
  if (input.enabled && user.disabled) throw new AccessError(input.userId ? "user_id" : "email", "disabled_account");
  if (input.enabled && !input.roles.length) throw new AccessError("roles", "required");
  if (user.id === actor.id) throw new AccessError("user_id", "self");
  const now = new Date().toISOString();
  const before = (await db.prepare("SELECT role FROM workspace_roles WHERE user_id = ?").bind(user.id).all<{ role: Role }>()).results.map((row) => row.role);
  await db.batch([
    db.prepare("INSERT INTO workspace_members (user_id, enabled, granted_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, granted_by = excluded.granted_by, updated_at = excluded.updated_at")
      .bind(user.id, input.enabled ? 1 : 0, actor.id, now, now),
    // Revoking keeps roles on record so access can be restored as it was.
    ...(input.enabled ? [
      db.prepare("DELETE FROM workspace_roles WHERE user_id = ?").bind(user.id),
      ...input.roles.map((role) => db.prepare("INSERT INTO workspace_roles (user_id, role, granted_by, granted_at) VALUES (?, ?, ?, ?)").bind(user.id, role, actor.id, now)),
    ] : []),
    auditStatement(db, actor, input.enabled ? "access_saved" : "access_revoked", user.id, { roles_before: before, roles_after: input.enabled ? input.roles : before }, now),
  ]);
  return user.id;
}

export async function recentAudit(db: D1Database): Promise<AuditRow[]> {
  return (await db.prepare("SELECT id, actor_name, action, target_user_id, detail, created_at FROM workspace_audit ORDER BY created_at DESC LIMIT 50").all<AuditRow>()).results;
}
