// Admin view of the R-08 rules: who has a passkey, who has set an
// anti-phishing code, when each person last passed a Workspace passkey check,
// and passkey recovery windows. Requires users.manage; opening a recovery
// window also needs step-up, is never allowed for oneself and is audited.
import { type EmDashUser, AccessError, auditStatement, chunks, emdashUsers, workspaceMembers } from "./members";
import { type Role } from "./roles";

export const RECOVERY_WINDOW_HOURS = 24;

export interface SecurityRow {
  user_id: string; name: string; email: string; admin: boolean; enabled: boolean; roles: Role[];
  passkeys: number; passkeyLastUsed: string | null; codeSet: boolean; lastCheck: string | null; recoveryUntil: string | null;
}

export async function securityOverview(db: D1Database, contentDb: D1Database): Promise<SecurityRow[]> {
  const members = await workspaceMembers(db, contentDb);
  const admins = (await contentDb.prepare("SELECT id, email, name, disabled, role FROM users WHERE role = 50 AND disabled = 0 ORDER BY name, email LIMIT 100").all<EmDashUser>()).results;
  const people = [
    ...admins.map((user) => ({ user_id: user.id, name: user.name ?? "", email: user.email, admin: true, enabled: true, roles: [] as Role[] })),
    ...members.filter((member) => !member.admin).map((member) => ({ user_id: member.user_id, name: member.name, email: member.email, admin: false, enabled: member.enabled && member.active, roles: member.roles })),
  ];
  const ids = people.map((person) => person.user_id);
  const passkeys = new Map<string, { n: number; last: string | null }>();
  const codes = new Set<string>();
  const checks = new Map<string, string>();
  const windows = new Map<string, string>();
  const now = new Date().toISOString();
  for (const part of chunks(ids)) {
    const marks = part.map(() => "?").join(", ");
    for (const row of (await contentDb.prepare(`SELECT user_id, COUNT(*) AS n, MAX(last_used_at) AS last FROM credentials WHERE user_id IN (${marks}) GROUP BY user_id`).bind(...part).all<{ user_id: string; n: number; last: string | null }>()).results) passkeys.set(row.user_id, { n: row.n, last: row.last });
    for (const row of (await db.prepare(`SELECT user_id FROM workspace_anti_phishing WHERE user_id IN (${marks})`).bind(...part).all<{ user_id: string }>()).results) codes.add(row.user_id);
    for (const row of (await db.prepare(`SELECT actor_id, MAX(created_at) AS at FROM workspace_audit WHERE action = 'passkey_verified' AND actor_id IN (${marks}) GROUP BY actor_id`).bind(...part).all<{ actor_id: string; at: string }>()).results) checks.set(row.actor_id, row.at);
    for (const row of (await db.prepare(`SELECT user_id, MAX(expires_at) AS until FROM workspace_passkey_resets WHERE used_at IS NULL AND expires_at > ? AND user_id IN (${marks}) GROUP BY user_id`).bind(now, ...part).all<{ user_id: string; until: string }>()).results) windows.set(row.user_id, row.until);
  }
  return people.map((person) => ({
    ...person, passkeys: passkeys.get(person.user_id)?.n ?? 0, passkeyLastUsed: passkeys.get(person.user_id)?.last ?? null,
    codeSet: codes.has(person.user_id), lastCheck: checks.get(person.user_id) ?? null, recoveryUntil: windows.get(person.user_id) ?? null,
  }));
}

/**
 * Lets a person who lost every passkey add a new one within 24 hours, after
 * signing in through an EmDash recovery link. Only for Workspace people,
 * never for oneself, with a reason. Re-opening replaces nothing: each window
 * is its own audited row.
 */
export async function openRecoveryWindow(db: D1Database, contentDb: D1Database, actor: { id: string; name: string; can(permission: "users.manage"): boolean }, userId: string, reason: string): Promise<void> {
  if (!actor.can("users.manage")) throw new AccessError("user_id", "forbidden");
  if (!userId || userId === actor.id) throw new AccessError("user_id", "self");
  const why = reason.replace(/\p{Cc}+/gu, " ").trim().slice(0, 500);
  if (why.length < 5) throw new AccessError("reason", "required");
  const account = (await emdashUsers(contentDb, [userId])).get(userId);
  if (!account || account.disabled) throw new AccessError("user_id", "not_found");
  const member = await db.prepare("SELECT 1 FROM workspace_members WHERE user_id = ? LIMIT 1").bind(userId).first();
  if (!member && account.role !== 50) throw new AccessError("user_id", "not_found");
  const now = new Date(), expires = new Date(now.getTime() + RECOVERY_WINDOW_HOURS * 3600_000).toISOString();
  const id = `rst_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.batch([
    db.prepare("INSERT INTO workspace_passkey_resets (id, user_id, granted_by, reason, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, userId, actor.id, why, now.toISOString(), expires),
    auditStatement(db, actor, "passkey_recovery_opened", userId, { window: id, expires_at: expires, reason: why }, now.toISOString(), { module: "account" }),
  ]);
}
