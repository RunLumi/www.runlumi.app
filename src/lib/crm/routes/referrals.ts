import type { AstroGlobal } from "astro";
import { latestPlaybooks } from "../config";
import { leadProcessVersions } from "../leads";
import type { Lang } from "../i18n";
import { type Ctx, type FormState, context, emptyState, forbidden, handlePost } from "../page";
import type { Playbook } from "../playbook";
import { type MyReferral, REFERRAL_PLAYBOOK_KINDS, myReferrals, submitReferral } from "../referrals";

export interface ReferralsProps { ctx: Ctx; state: FormState; playbooks: Playbook[]; referrals: MyReferral[]; stageNames: Record<string, string> }

export async function referralsRoute(astro: AstroGlobal, lang: Lang): Promise<ReferralsProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  if (!ctx.actor.refer) return forbidden(lang);
  const posted = await handlePost(astro, ctx, {
    refer: async (form) => { await submitReferral(ctx.db, ctx.actor, form); return `${astro.url.pathname}#mine`; },
  });
  if (posted instanceof Response) return posted;
  const all = await latestPlaybooks(ctx.db);
  const stageNames: Record<string, string> = {};
  for (const playbook of all) for (const stage of playbook.def.stages) stageNames[`${playbook.playbook_key}:${stage.id}`] = lang === "vi" ? stage.vi : stage.en;
  // Lead statuses, keyed by process version, for referrals not yet converted.
  for (const process of await leadProcessVersions(ctx.db)) for (const status of process.def.statuses) stageNames[`lead:${process.id}:${status.id}`] = lang === "vi" ? status.vi : status.en;
  return {
    ctx, state: posted ?? emptyState, stageNames,
    playbooks: all.filter((item) => item.active && (REFERRAL_PLAYBOOK_KINDS as readonly string[]).includes(item.kind)),
    referrals: await myReferrals(ctx.db, ctx.actor.id),
  };
}
