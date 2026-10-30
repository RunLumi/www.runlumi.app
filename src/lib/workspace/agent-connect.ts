// Tài khoản của tôi › Bảo mật › Kết nối AI agent (board AgentConsent). A
// member creates their own personal MCP token here: the page shows what the
// agent will receive under the organisation's module levels, and creating it
// needs step-up. The token is the same personal CRM token as on CRM › API
// (src/lib/crm/api/tokens.ts): its secret is shown once, only the hash is
// kept, and it acts with the person's own current permissions.
import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { sameOrigin } from "../http";
import { actorFrom } from "../crm/access";
import { ValidationError } from "../crm/core";
import { createToken, tokenLifetimes } from "../crm/api/tokens";
import { type AgentLevel, type AgentModule, agentPolicy } from "./agents";
import type { WorkspaceUser } from "./roles";
import { stepUpGuard } from "./step-up";

export type Lang = "en" | "vi";

export interface AgentConnectData {
  lang: Lang; vi: boolean; user: WorkspaceUser; policy: Record<AgentModule, AgentLevel>; lifetimes: readonly number[];
  secret: string | null; errors: Record<string, string>; typed: { name: string; scope: string; days: string };
}

export async function agentConnectPage(astro: AstroGlobal, lang: Lang): Promise<AgentConnectData | Response> {
  const user = astro.locals.workspace!;
  const vi = lang === "vi";
  const actor = actorFrom(user);
  // Personal tokens are CRM tokens; without CRM access there is nothing an agent could use.
  if (!actor) return new Response(vi ? "Chỉ thành viên có quyền CRM mới kết nối được AI agent." : "Only members with CRM access can connect an AI agent.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
  const { DB } = envFromLocals(astro.locals);
  let secret: string | null = null, errors: Record<string, string> = {};
  let typed = { name: "", scope: "read", days: "90" };
  if (astro.request.method === "POST") {
    if (!sameOrigin(astro.request)) return new Response("Invalid request origin.", { status: 400 });
    const stepUp = await stepUpGuard({ session: astro.session, locals: astro.locals, request: astro.request, url: astro.url }, { vi, next: astro.url.pathname });
    if (stepUp) return stepUp;
    const form = await astro.request.formData().catch(() => null);
    if (!form) return new Response("Invalid form body.", { status: 400 });
    typed = { name: String(form.get("name") ?? "").slice(0, 80), scope: String(form.get("scope") ?? "read"), days: String(form.get("days") ?? "90") };
    try {
      secret = (await createToken(DB, actor, form)).secret;
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      astro.response.status = 422;
      errors = error.fields;
    }
  }
  return { lang, vi, user, policy: await agentPolicy(DB), lifetimes: tokenLifetimes, secret, errors, typed };
}
