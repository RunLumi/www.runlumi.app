// Personal API tokens. A token belongs to one EmDash user and carries a scope
// (read or write); every request re-checks the user's account, Workspace
// membership and roles, so revoking access in the Workspace stops the token.
// Tokens grant CRM permissions only: hiring never accepts them.
import { type CrmActor, actorFrom } from "../access";
import { Errors, ForbiddenError, NotFoundError, eventStatement, newId, nowIso, once } from "../core";
import { workspaceUserFor } from "../../workspace/roles";
import { randomSecret, sha256 } from "./secret";

export const TOKEN_PREFIX = "lumi_crm_";
export const tokenScopes = ["read", "write"] as const;
export type TokenScope = typeof tokenScopes[number];
export const tokenLifetimes = [30, 90, 365] as const;
export const RATE_LIMIT_PER_MINUTE = 120;
const tokenPattern = /^lumi_crm_[A-Za-z0-9_-]{43}$/;

export interface ApiToken {
  id: string; user_id: string; name: string; prefix: string; scope: TokenScope; created_at: string; expires_at: string;
  last_used_at: string | null; revoked_at: string | null;
}

function requestKey(form: FormData): string {
  return typeof form.get("request_key") === "string" ? String(form.get("request_key")) : "";
}

/** Creates a token for the signed-in person. Returns the secret once; only its hash is kept. */
export async function createToken(db: D1Database, actor: CrmActor, form: FormData): Promise<{ id: string; secret: string | null }> {
  const errors = new Errors();
  // Shown in history as "Name (API: token name)": keep it plain so it cannot imitate another actor.
  const name = errors.text(form, "name", 80, true).replace(/[()[\]<>\p{Cc}]/gu, "").trim();
  if (!name && !errors.fields.name) errors.add("name", "required");
  const scope = errors.text(form, "scope", 10, true) as TokenScope;
  const days = Number(errors.text(form, "days", 4, true));
  if (scope && !tokenScopes.includes(scope)) errors.add("scope", "invalid");
  if (!tokenLifetimes.includes(days as typeof tokenLifetimes[number])) errors.add("days", "invalid");
  errors.throwIfAny();
  const active = await db.prepare("SELECT COUNT(*) AS n FROM crm_api_tokens WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?").bind(actor.id, nowIso()).first<{ n: number }>();
  if ((active?.n ?? 0) >= 10) errors.add("name", "too_many_tokens");
  errors.throwIfAny();
  const secret = `${TOKEN_PREFIX}${randomSecret()}`;
  const id = newId("tok");
  const now = new Date();
  const expires = new Date(now.getTime() + days * 86_400_000).toISOString();
  const result = await once(db, actor, requestKey(form), "api_token", id, [
    db.prepare("INSERT INTO crm_api_tokens (id, user_id, name, token_hash, prefix, scope, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, actor.id, name, await sha256(secret), secret.slice(0, TOKEN_PREFIX.length + 6), scope, now.toISOString(), expires),
    eventStatement(db, actor, "api_token_created", { token_id: id, name, scope, expires_at: expires }, {}),
  ]);
  // A repeated submission keeps the first token; its secret cannot be shown again.
  return { id: result.refId, secret: result.duplicate ? null : secret };
}

/** Lists the person's own tokens, or everyone's for an admin. */
export async function listTokens(db: D1Database, actor: CrmActor, all: boolean): Promise<ApiToken[]> {
  const columns = "id, user_id, name, prefix, scope, created_at, expires_at, last_used_at, revoked_at";
  const query = all && actor.configure
    ? db.prepare(`SELECT ${columns} FROM crm_api_tokens ORDER BY revoked_at IS NOT NULL, created_at DESC LIMIT 200`)
    : db.prepare(`SELECT ${columns} FROM crm_api_tokens WHERE user_id = ? ORDER BY revoked_at IS NOT NULL, created_at DESC LIMIT 50`).bind(actor.id);
  return (await query.all<ApiToken>()).results;
}

/** Owners revoke their own tokens; admins may revoke anyone's. */
export async function revokeToken(db: D1Database, actor: CrmActor, form: FormData): Promise<void> {
  const id = typeof form.get("token_id") === "string" ? String(form.get("token_id")) : "";
  const token = await db.prepare("SELECT id, user_id, revoked_at FROM crm_api_tokens WHERE id = ?").bind(id).first<{ id: string; user_id: string; revoked_at: string | null }>();
  if (!token || (token.user_id !== actor.id && !actor.configure)) throw new NotFoundError();
  if (token.revoked_at) return;
  await once(db, actor, requestKey(form), "api_token_revoke", id, [
    db.prepare("UPDATE crm_api_tokens SET revoked_at = ?, revoked_by = ? WHERE id = ? AND revoked_at IS NULL").bind(nowIso(), actor.id, id),
    eventStatement(db, actor, "api_token_revoked", { token_id: id, owner_id: token.user_id }, {}),
  ]);
}

export interface ApiIdentity { actor: CrmActor; token: { id: string; name: string; scope: TokenScope } }
export type AuthFailure = { status: 401 | 403 | 429; message: string; retryAfter?: number };

/**
 * Resolves a bearer token to a CRM actor with the user's current permissions.
 * Unknown, expired and revoked tokens, disabled accounts and removed
 * Workspace access all fail the same way (401) so nothing is revealed.
 */
export async function authenticate(db: D1Database, contentDb: D1Database, header: string | null): Promise<ApiIdentity | AuthFailure> {
  const secret = /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1] ?? "";
  const denied: AuthFailure = { status: 401, message: "Invalid or expired token." };
  if (!tokenPattern.test(secret)) return denied;
  const now = nowIso();
  const token = await db.prepare("SELECT id, user_id, name, scope, last_used_at FROM crm_api_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?")
    .bind(await sha256(secret), now).first<{ id: string; user_id: string; name: string; scope: TokenScope; last_used_at: string | null }>();
  if (!token) return denied;
  // Count before the account and role lookups, so a throttled token costs little.
  const limited = await rateLimited(db, token.id);
  if (limited) return { status: 429, message: "Too many requests. Slow down.", retryAfter: limited };
  const user = await contentDb.prepare("SELECT id, email, name, role FROM users WHERE id = ? AND disabled = 0 LIMIT 1").bind(token.user_id).first<{ id: string; email: string; name: string | null; role: number }>();
  if (!user) return denied;
  const workspace = await workspaceUserFor(db, user);
  const actor = workspace ? actorFrom(workspace) : null;
  if (!actor) return denied;
  if (!token.last_used_at || Date.parse(token.last_used_at) < Date.now() - 5 * 60_000) {
    await db.prepare("UPDATE crm_api_tokens SET last_used_at = ? WHERE id = ?").bind(now, token.id).run();
  }
  // History shows the change came through the API and which token made it.
  return { actor: { ...actor, name: `${actor.name} (API: ${token.name.slice(0, 40)})` }, token: { id: token.id, name: token.name, scope: token.scope } };
}

/** Returns seconds to wait when the token is over its per-minute budget, else 0. */
async function rateLimited(db: D1Database, tokenId: string): Promise<number> {
  const now = Date.now();
  const window = new Date(now - (now % 60_000)).toISOString();
  const row = await db.prepare("INSERT INTO crm_api_rate (token_id, window_start, count) VALUES (?, ?, 1) ON CONFLICT(token_id, window_start) DO UPDATE SET count = count + 1 RETURNING count")
    .bind(tokenId, window).first<{ count: number }>();
  if ((row?.count ?? 1) === 1) await db.prepare("DELETE FROM crm_api_rate WHERE token_id = ? AND window_start < ?").bind(tokenId, window).run();
  return (row?.count ?? 1) > RATE_LIMIT_PER_MINUTE ? Math.ceil((60_000 - (now % 60_000)) / 1000) : 0;
}

export function requireWrite(identity: ApiIdentity): void {
  if (identity.token.scope !== "write") throw new ForbiddenError();
}
