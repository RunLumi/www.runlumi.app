// Loaders for the public Workspace pages before sign-in: sign-in and
// recovery. Sign-in itself is EmDash's (passkey or sign-in link); these pages
// only call EmDash's endpoints. They show no Workspace data to a signed-out
// visitor, and the recovery page shows a signed-in person only their own state.
import type { AstroGlobal } from "astro";
import { activeUser } from "../admin-auth";
import { envFromLocals } from "../ats";
import { safeReturn, sessionPasskeyVerified } from "./passkey";
import { switchLocale } from "./nav";

export type Lang = "en" | "vi";

export interface SignInData { lang: Lang; vi: boolean; next: string; switchHref: string; error: string | null }

export function signInPage(astro: AstroGlobal, lang: Lang): SignInData | Response {
  const vi = lang === "vi";
  const next = safeReturn(astro.url.searchParams.get("next"), vi);
  // Already signed in: the Workspace decides what comes next (passkey check, code, the page).
  if (activeUser(astro.locals)) return new Response(null, { status: 303, headers: { Location: next, "Cache-Control": "private, no-store" } });
  const error = astro.url.searchParams.get("error");
  return { lang, vi, next, switchHref: switchLocale(astro.url), error: error && /^[a-z_]{1,40}$/.test(error) ? error : null };
}

export type RecoveryState = "signed_out" | "not_member" | "waiting" | "open" | "verified";
export interface RecoveryData { lang: Lang; vi: boolean; switchHref: string; state: RecoveryState; email: string | null; openedBy: string | null; openedAt: string | null; until: string | null; passkeys: number }

export async function recoveryPage(astro: AstroGlobal, lang: Lang): Promise<RecoveryData> {
  const vi = lang === "vi";
  const base = { lang, vi, switchHref: switchLocale(astro.url), email: null, openedBy: null, openedAt: null, until: null, passkeys: 0 };
  const user = activeUser(astro.locals);
  if (!user) return { ...base, state: "signed_out" };
  const { DB, CONTENT_DB } = envFromLocals(astro.locals);
  const member = user.role === 50 || !!(await DB.prepare("SELECT 1 FROM workspace_members WHERE user_id = ? AND enabled = 1 LIMIT 1").bind(user.id).first());
  if (!member) return { ...base, state: "not_member" };
  const passkeys = (await CONTENT_DB.prepare("SELECT COUNT(*) AS n FROM credentials WHERE user_id = ?").bind(user.id).first<{ n: number }>())?.n ?? 0;
  const own = { ...base, email: user.email, passkeys };
  if (await sessionPasskeyVerified(astro.session, user.id)) return { ...own, state: "verified" };
  const window = await DB.prepare("SELECT r.created_at, r.expires_at, a.actor_name FROM workspace_passkey_resets r LEFT JOIN workspace_audit a ON a.action = 'passkey_recovery_opened' AND json_extract(a.detail, '$.window') = r.id WHERE r.user_id = ? AND r.used_at IS NULL AND r.expires_at > ? ORDER BY r.created_at DESC LIMIT 1")
    .bind(user.id, new Date().toISOString()).first<{ created_at: string; expires_at: string; actor_name: string | null }>();
  if (!window) return { ...own, state: "waiting" };
  return { ...own, state: "open", openedBy: window.actor_name, openedAt: window.created_at, until: window.expires_at };
}
