// Loaders for the personal security pages: the passkey check (session and
// step-up) and Tài khoản của tôi › Bảo mật (passkeys, anti-phishing code).
import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import type { WorkspaceUser } from "./roles";
import { sameOrigin } from "../http";
import { AntiPhishingError, antiPhishingCode, saveAntiPhishingCode } from "./anti-phishing";
import { STEP_UP_WINDOW_MS, passkeyMark, safeReturn, sessionPasskeyVerified, stepUpRemaining } from "./passkey";
import { stepUpGuard } from "./step-up";

export type Lang = "en" | "vi";

/** One of the person's own EmDash passkeys. The credential ID is public (browsers send it in every sign-in). */
export interface PasskeySummary { id: string; name: string | null; device_type: string | null; backed_up: number | null; created_at: string | null; last_used_at: string | null }

export async function ownPasskeys(contentDb: D1Database, userId: string): Promise<PasskeySummary[]> {
  return (await contentDb.prepare("SELECT id, name, device_type, backed_up, created_at, last_used_at FROM credentials WHERE user_id = ? ORDER BY created_at").bind(userId).all<PasskeySummary>()).results;
}

/** An open recovery window an admin granted this person, if any. */
export async function openRecovery(db: D1Database, userId: string): Promise<{ expires_at: string } | null> {
  return await db.prepare("SELECT expires_at FROM workspace_passkey_resets WHERE user_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1").bind(userId, new Date().toISOString()).first<{ expires_at: string }>() ?? null;
}

export interface VerifyPageData {
  lang: Lang; vi: boolean; user: WorkspaceUser; reason: "step_up" | "session"; next: string;
  passkeys: PasskeySummary[]; sessionVerified: boolean; stepUpSeconds: number; windowMinutes: number;
  /** Minutes since the last passkey check in this session (null: none yet), and which passkey it used. */
  lastCheckMinutes: number | null; lastPasskey: string | null; recoveryUntil: string | null;
}

export async function verifyPage(astro: AstroGlobal, lang: Lang): Promise<VerifyPageData> {
  const user = astro.locals.workspace!;
  const vi = lang === "vi";
  const { CONTENT_DB } = envFromLocals(astro.locals);
  const { DB } = envFromLocals(astro.locals);
  const reason = astro.url.searchParams.get("reason") === "session" ? "session" : "step_up";
  const passkeys = await ownPasskeys(CONTENT_DB, user.id);
  const mark = await passkeyMark(astro.session, user.id);
  return {
    lang, vi, user, reason, next: safeReturn(astro.url.searchParams.get("next"), vi), passkeys,
    lastCheckMinutes: mark ? Math.max(0, Math.floor((Date.now() - mark.at) / 60_000)) : null,
    lastPasskey: passkeys.find((key) => key.id === mark?.credentialId)?.name ?? [...passkeys].sort((a, b) => String(b.last_used_at).localeCompare(String(a.last_used_at)))[0]?.name ?? null,
    recoveryUntil: (await openRecovery(DB, user.id))?.expires_at ?? null,
    sessionVerified: await sessionPasskeyVerified(astro.session, user.id),
    stepUpSeconds: await stepUpRemaining(astro.session, user.id),
    windowMinutes: STEP_UP_WINDOW_MS / 60_000,
  };
}

export interface AccountSecurityData {
  lang: Lang; vi: boolean; user: WorkspaceUser; passkeys: PasskeySummary[]; code: string | null; codeUpdated: string | null;
  setup: boolean; next: string; error: string | null; typed: string; saved: boolean; stepUpSeconds: number;
  sheet: "code" | null; session: { verifiedAt: string | null; passkey: string | null; passkeyId: string | null };
  tokens: { id: string; name: string; scope: string; created_at: string; expires_at: string; last_used_at: string | null }[]; canTokens: boolean;
}

/** Tài khoản của tôi › Bảo mật: own passkeys and own anti-phishing code. Nobody edits another person's here. */
export async function accountSecurityPage(astro: AstroGlobal, lang: Lang): Promise<AccountSecurityData | Response> {
  const user = astro.locals.workspace!;
  const vi = lang === "vi";
  const { DB, CONTENT_DB } = envFromLocals(astro.locals);
  const setup = astro.url.searchParams.get("setup") === "1";
  const next = safeReturn(astro.url.searchParams.get("next"), vi);
  let current = await antiPhishingCode(DB, user.id);
  let error: string | null = null, typed = "";
  if (astro.request.method === "POST") {
    if (!sameOrigin(astro.request)) return new Response("Invalid request origin.", { status: 400 });
    // Changing an existing code is sensitive; the first code follows the session check just made.
    if (current) {
      const stepUp = await stepUpGuard({ session: astro.session, locals: astro.locals, request: astro.request, url: astro.url }, { vi, next: astro.url.pathname + astro.url.search });
      if (stepUp) return stepUp;
    }
    const form = await astro.request.formData().catch(() => null);
    if (!form || form.get("intent") !== "code") return new Response("Unknown action.", { status: 400 });
    typed = String(form.get("code") ?? "").slice(0, 100);
    try {
      await saveAntiPhishingCode(DB, user, form.get("code"));
      const target = setup ? next : `${astro.url.pathname}?saved=code`;
      return new Response(null, { status: 303, headers: { Location: target, "Cache-Control": "private, no-store" } });
    } catch (failure) {
      if (!(failure instanceof AntiPhishingError)) throw failure;
      astro.response.status = 422;
      error = failure.message;
      current = await antiPhishingCode(DB, user.id);
    }
  }
  const passkeys = await ownPasskeys(CONTENT_DB, user.id);
  const mark = await passkeyMark(astro.session, user.id);
  // Only the person's own active tokens; managing them stays on the CRM API page.
  const tokens = (await DB.prepare("SELECT id, name, scope, created_at, expires_at, last_used_at FROM crm_api_tokens WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 20")
    .bind(user.id, new Date().toISOString()).all<AccountSecurityData["tokens"][number]>()).results;
  return {
    lang, vi, user, passkeys, code: current?.code ?? null, codeUpdated: current?.updated_at ?? null,
    setup, next, error, typed, saved: astro.url.searchParams.get("saved") === "code", stepUpSeconds: await stepUpRemaining(astro.session, user.id),
    sheet: astro.url.searchParams.get("sheet") === "code" || (!!error && !!current) ? "code" : null,
    session: { verifiedAt: mark ? new Date(mark.at).toISOString() : null, passkey: passkeys.find((key) => key.id === mark?.credentialId)?.name ?? null, passkeyId: mark?.credentialId ?? null },
    tokens, canTokens: user.can("crm.access"),
  };
}
