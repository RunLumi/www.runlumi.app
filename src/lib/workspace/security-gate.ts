// R-08 at the door: every private Workspace page and API needs a passkey
// check in the current EmDash session, and every person sets their
// anti-phishing code before using the Workspace. No opt-out. Middleware (and
// the Finance boundary) call `workspaceGate` after permissions pass.
import { antiPhishingCode } from "./anti-phishing";
import { auditStatement } from "./members";
import { type SessionStore, emdashCredentials, sessionPasskeyVerified, stepUpFresh, verifyPath } from "./passkey";
import type { WorkspaceUser } from "./roles";

export const ACCOUNT_SECURITY_PATH = "/workspace/account/security";

/**
 * Deployment switch for R-08 enforcement (the session passkey check, the
 * anti-phishing code gate and the EmDash passkey-registration guard).
 * Off unless WORKSPACE_PASSKEY_REQUIRED is exactly "true", so a release never
 * locks existing users out before the owner turns it on. Step-up for
 * sensitive actions is always on.
 */
export function passkeyRequired(env: { WORKSPACE_PASSKEY_REQUIRED?: string }): boolean {
  return env.WORKSPACE_PASSKEY_REQUIRED === "true";
}

const plain = (path: string) => (path.startsWith("/vi/") ? path.slice(3) : path);

/** Pages that must open before the session check: the check itself. */
export function passkeyExempt(path: string): boolean {
  const value = plain(path);
  return value === "/workspace/verify" || path.startsWith("/api/workspace/passkey/");
}

/** Pages that open before the anti-phishing code exists: the check and the page that sets the code. */
export function codeExempt(path: string): boolean {
  return passkeyExempt(path) || plain(path) === ACCOUNT_SECURITY_PATH;
}

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" };

export interface GateContext { session?: SessionStore; request: Request; url: URL }

/** null when the request may continue; otherwise the redirect or 401 to send. */
export async function workspaceGate(context: GateContext, user: WorkspaceUser, db: D1Database, api: boolean, required = true): Promise<Response | null> {
  const path = context.url.pathname, vi = path.startsWith("/vi/");
  if (!required || passkeyExempt(path)) return null;
  if (!(await sessionPasskeyVerified(context.session, user.id))) {
    if (api) return new Response(JSON.stringify({ ok: false, error: { code: "passkey_required", verify: verifyPath(vi, "/workspace", "session") } }), { status: 401, headers: { ...privateHeaders, "Content-Type": "application/json; charset=utf-8" } });
    return new Response(null, { status: 303, headers: { ...privateHeaders, Location: verifyPath(vi, path + context.url.search, "session") } });
  }
  if (api || codeExempt(path)) return null;
  let code: Awaited<ReturnType<typeof antiPhishingCode>>;
  try { code = await antiPhishingCode(db, user.id); } catch { code = null; }
  if (!code) {
    const next = encodeURIComponent(path + context.url.search);
    return new Response(null, { status: 303, headers: { ...privateHeaders, Location: `${vi ? "/vi" : ""}${ACCOUNT_SECURITY_PATH}?setup=1&next=${next}` } });
  }
  return null;
}

/** EmDash's passkey registration endpoints. */
export function passkeyRegistrationPath(path: string): boolean {
  return path === "/_emdash/api/auth/passkey/register/options" || path === "/_emdash/api/auth/passkey/register/verify";
}

/**
 * Adding a passkey through EmDash is the way back in after losing one, so for
 * Workspace people it needs proof of an existing passkey: a step-up from the
 * last five minutes. The first passkey of an account, and a passkey added
 * inside a 24-hour recovery window an admin opened, are the exceptions.
 * Returns a response to block, a callback to run after the registration
 * response (audit, and close the recovery window), or null to continue.
 */
export async function passkeyRegistrationGuard(
  context: GateContext & { locals: App.Locals }, db: D1Database, contentDb: D1Database, required = true,
): Promise<Response | ((response: Response) => Promise<void>) | null> {
  const user = context.locals.user;
  if (!required || !user?.id || user.disabled || context.request.method !== "POST") return null;
  // Revoked members count too, so a passkey added while revoked cannot carry over a later restore.
  const workspacePerson = user.role === 50 || !!(await db.prepare("SELECT 1 FROM workspace_members WHERE user_id = ? LIMIT 1").bind(user.id).first());
  if (!workspacePerson) return null;
  const verifying = context.url.pathname.endsWith("/verify");
  const actor = { id: user.id, name: user.name || user.email };
  // Every passkey a Workspace person adds is a security event in the audit log.
  const audited = (detail: Record<string, unknown>, windowId?: string) => async (response: Response) => {
    if (!response.ok) return;
    const now = new Date().toISOString();
    await db.batch([
      ...(windowId ? [db.prepare("UPDATE workspace_passkey_resets SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now, windowId)] : []),
      auditStatement(db, actor, "passkey_added", user.id, detail, now, { module: "account" }),
    ]);
  };
  if (!(await emdashCredentials(contentDb).forUser(user.id)).length) return verifying ? audited({ first: true }) : null;
  if (await stepUpFresh(context.session, user.id)) return verifying ? audited({ step_up: true }) : null;
  const window = await db.prepare("SELECT id FROM workspace_passkey_resets WHERE user_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1").bind(user.id, new Date().toISOString()).first<{ id: string }>();
  if (window) return verifying ? audited({ recovery_window: window.id }, window.id) : null;
  return new Response(JSON.stringify({ success: false, error: { code: "STEP_UP_REQUIRED", message: "Verify with one of your existing passkeys in the Workspace first (/workspace/verify), or ask an admin to open a recovery window." } }), {
    status: 403, headers: { ...privateHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}
