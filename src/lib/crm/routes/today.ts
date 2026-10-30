import type { AstroGlobal } from "astro";
import { inactiveOwnerIds } from "../access";
import { latestOffers, latestPlaybooks } from "../config";
import { type QuarterResult, type RecentRecord, quarterResult, recentlyEdited } from "../home";
import type { Lang } from "../i18n";
import { type Ctx, context } from "../page";
import { type TodayData, loadToday } from "../today";
import { leadProcessVersions } from "../leads";

export interface TodayProps {
  ctx: Ctx; data: TodayData; stageNames: Record<string, string>; leadStatus: Record<string, string>;
  quarter: QuarterResult; recent: RecentRecord[];
}

export async function todayRoute(astro: AstroGlobal, lang: Lang): Promise<TodayProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  const starter = (await latestOffers(ctx.db)).find((offer) => offer.offer_key === "local-starter");
  const windowDays = starter?.rules.credit?.window_days ?? 30;
  const data = await loadToday(ctx.db, ctx.actor, ctx.actor.manager ? await inactiveOwnerIds(ctx.db, ctx.contentDb) : [], windowDays);
  const stageNames: Record<string, string> = {};
  const playbooks = await latestPlaybooks(ctx.db);
  for (const playbook of playbooks) for (const stage of playbook.def.stages) stageNames[`${playbook.playbook_key}:${stage.id}`] = ctx.vi ? stage.vi : stage.en;
  const leadStatus: Record<string, string> = {};
  for (const process of await leadProcessVersions(ctx.db)) for (const status of process.def.statuses) leadStatus[`${process.id}:${status.id}`] = ctx.vi ? status.vi : status.en;
  // The sales dashboard (figures, filters, per-seller table) lives on Reports.
  return { ctx, data, stageNames, leadStatus, quarter: await quarterResult(ctx.db, ctx.actor, data.today), recent: await recentlyEdited(ctx.db, ctx.actor) };
}
