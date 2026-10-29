// Loaders for the personal security pages: the passkey check (session and
// step-up) and, in the next slices, the anti-phishing code.
import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import type { WorkspaceUser } from "./roles";
import { STEP_UP_WINDOW_MS, safeReturn, sessionPasskeyVerified, stepUpRemaining } from "./passkey";

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
