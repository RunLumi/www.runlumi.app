import type { AstroGlobal } from "astro";
import { inactiveOwnerIds } from "../access";
import { latestOffers, latestPlaybooks } from "../config";
import type { Lang } from "../i18n";
import { type Ctx, context } from "../page";
import { type TodayData, loadToday } from "../today";

export interface TodayProps { ctx: Ctx; data: TodayData; stageNames: Record<string, string> }

export async function todayRoute(astro: AstroGlobal, lang: Lang): Promise<TodayProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  const starter = (await latestOffers(ctx.db)).find((offer) => offer.offer_key === "local-starter");
  const windowDays = starter?.rules.credit?.window_days ?? 30;
  const data = await loadToday(ctx.db, ctx.actor, ctx.actor.manager ? await inactiveOwnerIds(ctx.db, ctx.contentDb) : [], windowDays);
  const stageNames: Record<string, string> = {};
  for (const playbook of await latestPlaybooks(ctx.db)) for (const stage of playbook.def.stages) stageNames[`${playbook.playbook_key}:${stage.id}`] = ctx.vi ? stage.vi : stage.en;
  return { ctx, data, stageNames };
}
