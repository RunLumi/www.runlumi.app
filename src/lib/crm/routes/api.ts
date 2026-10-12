import type { AstroGlobal } from "astro";
import { displayNames } from "../access";
import { type ApiToken, createToken, listTokens, revokeToken } from "../api/tokens";
import { tools } from "../api/tools";
import type { Lang } from "../i18n";
import { type Ctx, type FormState, context, emptyState, handlePost } from "../page";

export interface ApiTokensProps {
  ctx: Ctx; state: FormState; tokens: ApiToken[]; all: ApiToken[]; names: Record<string, { name: string; active: boolean }>;
  /** The new secret, shown on this response only. null = a repeated submission. */
  created: { secret: string | null } | null; origin: string; toolList: { name: string; write: boolean; title: string }[];
}

export async function apiTokensRoute(astro: AstroGlobal, lang: Lang): Promise<ApiTokensProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  let created: ApiTokensProps["created"] = null;
  const posted = await handlePost(astro, ctx, {
    token_create: async (form) => { created = { secret: (await createToken(ctx.db, ctx.actor, form)).secret }; },
    token_revoke: async (form) => { await revokeToken(ctx.db, ctx.actor, form); return `${astro.url.pathname}#tokens`; },
  });
  // The secret is rendered in this response instead of redirecting, so it
  // never appears in a URL, browser history or logs.
  if (posted instanceof Response && !created) return posted;
  const all = ctx.actor.configure ? (await listTokens(ctx.db, ctx.actor, true)).filter((token) => token.user_id !== ctx.actor.id) : [];
  return {
    ctx, state: posted instanceof Response ? emptyState : posted ?? emptyState, created,
    tokens: await listTokens(ctx.db, ctx.actor, false), all,
    names: await displayNames(ctx.contentDb, [...new Set(all.map((token) => token.user_id))]),
    origin: astro.url.origin, toolList: tools.map((tool) => ({ name: tool.name, write: tool.write, title: tool.title })),
  };
}
