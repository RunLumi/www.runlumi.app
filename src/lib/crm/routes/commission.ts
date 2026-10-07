import type { AstroGlobal } from "astro";
import { type OwnerOption, ownerOptions } from "../access";
import { type CommissionView, loadCommission, recordPayout, savePolicyVersion, saveSellerTerms } from "../commission-store";
import type { Lang } from "../i18n";
import { type Ctx, type FormState, context, emptyState, handlePost } from "../page";

export interface CommissionProps { ctx: Ctx; state: FormState; view: CommissionView; people: OwnerOption[]; person: string }

export async function commissionRoute(astro: AstroGlobal, lang: Lang): Promise<CommissionProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  const here = astro.url.pathname;
  const posted = await handlePost(astro, ctx, {
    policy_save: async (form) => { await savePolicyVersion(ctx.db, ctx.actor, form); return `${here}#policy`; },
    seller_terms: async (form) => { await saveSellerTerms(ctx.db, ctx.contentDb, ctx.actor, form); return `${here}#terms`; },
    payout: async (form) => { await recordPayout(ctx.db, ctx.actor, form); return `${here}#people`; },
  });
  if (posted instanceof Response) return posted;
  const view = await loadCommission(ctx.db, ctx.contentDb, ctx.actor);
  const person = ctx.actor.configure || ctx.actor.finance ? (astro.url.searchParams.get("person") ?? "") : ctx.actor.id;
  return { ctx, state: posted ?? emptyState, view, people: ctx.actor.configure || ctx.actor.finance ? await ownerOptions(ctx.db, ctx.contentDb, ctx.actor) : [], person };
}
