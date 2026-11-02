import type { AstroGlobal } from "astro";
import { type OwnerOption, ownerOptions } from "../access";
import { latestPlaybooks } from "../config";
import type { Lang } from "../i18n";
import { type Ctx, context, forbidden, handlePost } from "../page";
import type { Playbook } from "../playbook";
import {
  type AreaGaps, type AreaOptions, type Breakdown, type SetStats, type StatsQuery, type StatsSet,
  areaGaps, areaOptions, fillAreas, loadBreakdown, loadSetStats, readStatsQuery, statsSearch,
} from "../stats";

export interface StatsProps {
  ctx: Ctx; query: StatsQuery; playbooks: Playbook[]; playbook: Playbook | null;
  results: { set: StatsSet; stats: SetStats }[];
  breakdown: { area: { level: "city" | "district" | "ward" | "industry"; rows: Breakdown[] }; industry: { level: "city" | "district" | "ward" | "industry"; rows: Breakdown[] } };
  options: AreaOptions; owners: OwnerOption[]; gaps: AreaGaps | null; filled: { accounts: number; leads: number; unreadable: number } | null; error: string;
}

export async function statsRoute(astro: AstroGlobal, lang: Lang): Promise<StatsProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  // Sellers see their own figures, team-wide roles everyone's; partners, finance and fulfillment have no stats.
  if (!astro.locals.workspace?.can("crm.stats")) return forbidden(lang);
  const playbooks = (await latestPlaybooks(ctx.db)).filter((item) => item.kind !== "legacy");
  const query = readStatsQuery(astro.url, ctx.actor, playbooks.map((item) => item.playbook_key));
  let error = "";
  const posted = await handlePost(astro, ctx, {
    fill_areas: async () => {
      const result = await fillAreas(ctx.db, ctx.actor);
      return `${astro.url.pathname}${statsSearch(query)}&filled=${result.accounts}.${result.leads}.${result.unreadable}#areas`;
    },
  });
  if (posted instanceof Response) return posted;
  if (posted) error = posted.serverError ? "server" : "invalid";
  const playbook = playbooks.find((item) => item.playbook_key === query.playbook) ?? null;
  // Every version of the chosen playbook, so deals opened on an older version still count.
  const ids = playbook ? (await ctx.db.prepare("SELECT id FROM crm_playbooks WHERE playbook_key = ?").bind(playbook.playbook_key).all<{ id: string }>()).results.map((row) => row.id) : [];
  const results = [];
  for (const set of query.sets) results.push({ set, stats: await loadSetStats(ctx.db, ctx.actor, query, set, playbook?.def ?? null, ids) });
  const focus = query.sets[query.focus];
  const [area, industry, options, owners, gaps] = await Promise.all([
    loadBreakdown(ctx.db, ctx.actor, query, focus, "area", ids),
    loadBreakdown(ctx.db, ctx.actor, query, focus, "industry", ids),
    areaOptions(ctx.db, ctx.actor),
    ctx.actor.manager ? ownerOptions(ctx.db, ctx.contentDb, ctx.actor) : Promise.resolve([]),
    ctx.actor.configure ? areaGaps(ctx.db) : Promise.resolve(null),
  ]);
  const filledParam = /^(\d+)\.(\d+)\.(\d+)$/.exec(astro.url.searchParams.get("filled") ?? "");
  const filled = filledParam ? { accounts: Number(filledParam[1]), leads: Number(filledParam[2]), unreadable: Number(filledParam[3]) } : null;
  astro.response.headers.set("Cache-Control", "private, no-store");
  return { ctx, query, playbooks, playbook, results, breakdown: { area, industry }, options, owners, gaps, filled, error };
}
