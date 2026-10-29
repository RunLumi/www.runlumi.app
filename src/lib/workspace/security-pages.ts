// Loaders for the personal security pages: the passkey check (session and
// step-up) and Tài khoản của tôi › Bảo mật (passkeys, anti-phishing code).
import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import type { WorkspaceUser } from "./roles";
import { sameOrigin } from "../http";
import { AntiPhishingError, antiPhishingCode, saveAntiPhishingCode } from "./anti-phishing";
import { STEP_UP_WINDOW_MS, safeReturn, sessionPasskeyVerified, stepUpRemaining } from "./passkey";
import { stepUpGuard } from "./step-up";

export type Lang = "en" | "vi";

export interface PasskeySummary { name: string | null; created_at: string | null; last_used_at: string | null }

export async function ownPasskeys(contentDb: D1Database, userId: string): Promise<PasskeySummary[]> {
  return (await contentDb.prepare("SELECT name, created_at, last_used_at FROM credentials WHERE user_id = ? ORDER BY created_at").bind(userId).all<PasskeySummary>()).results;
}

export interface VerifyPageData {
  lang: Lang; vi: boolean; user: WorkspaceUser; reason: "step_up" | "session"; next: string;
  passkeys: PasskeySummary[]; sessionVerified: boolean; stepUpSeconds: number; windowMinutes: number;
}

export async function verifyPage(astro: AstroGlobal, lang: Lang): Promise<VerifyPageData> {
  const user = astro.locals.workspace!;
  const vi = lang === "vi";
  const { CONTENT_DB } = envFromLocals(astro.locals);
  const reason = astro.url.searchParams.get("reason") === "session" ? "session" : "step_up";
  return {
    lang, vi, user, reason, next: safeReturn(astro.url.searchParams.get("next"), vi),
    passkeys: await ownPasskeys(CONTENT_DB, user.id),
    sessionVerified: await sessionPasskeyVerified(astro.session, user.id),
    stepUpSeconds: await stepUpRemaining(astro.session, user.id),
    windowMinutes: STEP_UP_WINDOW_MS / 60_000,
  };
}

export interface AccountSecurityData {
  lang: Lang; vi: boolean; user: WorkspaceUser; passkeys: PasskeySummary[]; code: string | null; codeUpdated: string | null;
  setup: boolean; next: string; error: string | null; typed: string; saved: boolean; stepUpSeconds: number;
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
  return {
    lang, vi, user, passkeys: await ownPasskeys(CONTENT_DB, user.id), code: current?.code ?? null, codeUpdated: current?.updated_at ?? null,
    setup, next, error, typed, saved: astro.url.searchParams.get("saved") === "code", stepUpSeconds: await stepUpRemaining(astro.session, user.id),
  };
}
