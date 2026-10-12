import type { AstroGlobal } from "astro";
import { type OwnerOption, displayNames, inactiveOwnerIds, ownerOptions } from "../access";
import { type Dashboard, loadDashboard, readDashboardFilters } from "../dashboard";
import type { Playbook } from "../playbook";
import { latestOffers, latestPlaybooks } from "../config";
import type { Lang } from "../i18n";
import { type Ctx, context } from "../page";
import { type TodayData, loadToday } from "../today";

export interface TodayProps {
  ctx: Ctx; data: TodayData; stageNames: Record<string, string>;
  dashboard: Dashboard; owners: OwnerOption[]; playbooks: Playbook[]; names: Record<string, { name: string; active: boolean }>;
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
  const dashboard = await loadDashboard(ctx.db, ctx.actor, readDashboardFilters(astro.url, ctx.actor));
  const people = [dashboard.filters.owner, ...(dashboard.owners ?? []).map((row) => row.key)].filter(Boolean);
  return {
    ctx, data, stageNames, dashboard, playbooks: playbooks.filter((item) => item.kind !== "legacy"),
    owners: ctx.actor.manager ? await ownerOptions(ctx.db, ctx.contentDb, ctx.actor) : [],
    names: await displayNames(ctx.contentDb, [...new Set(people)]),
  };
}
