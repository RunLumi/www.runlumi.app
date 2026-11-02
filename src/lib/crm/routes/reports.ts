import type { AstroGlobal } from "astro";
import { type OwnerOption, displayNames, ownerOptions } from "../access";
import { type Dashboard, loadDashboard, readDashboardFilters } from "../dashboard";
import { type Offer, latestOffers, latestPlaybooks } from "../config";
import type { Lang } from "../i18n";
import { type Ctx, context, handlePost } from "../page";
import { type LeadSourceRow, leadReport } from "../leads";
import type { Playbook } from "../playbook";
import { type Filters, filterSql, readFilters } from "../records";
import { type CohortReport, type CohortRow, loadCohort } from "../reports";
import {
  type AreaGaps, type AreaOptions, type Breakdown, type BreakdownLevel, type SetStats, type StatsQuery, type StatsSet,
  areaGaps, areaOptions, fillAreas, loadBreakdown, loadSetStats, readStatsQuery, statsSearch,
} from "../stats";

/** Stats on the Reports page (docs/crm/STATS.md): only for crm.stats, in the viewer's own scope. */
export interface ReportStats {
  query: StatsQuery; playbooks: Playbook[]; playbook: Playbook | null;
  results: { set: StatsSet; stats: SetStats }[];
  breakdowns: { level: BreakdownLevel; rows: Breakdown[] }[];
  options: AreaOptions;
}

export interface PipelineSummary { playbook: Playbook; stages: Record<string, number>; outcomes: Record<string, number>; knownValue: number; unknownValue: number }
export interface PendingPayment { id: string; opportunity_id: string; title: string; amount_vnd: number; occurred_on: string; evidence: string }
export interface ReportsProps {
  ctx: Ctx; filters: Filters; summaries: PipelineSummary[]; offers: Offer[]; cohorts: CohortRow[];
  cohort: { cohort: CohortRow; report: CohortReport; policySource: string } | null; pending: PendingPayment[]; leads: LeadSourceRow[];
  /** Sales dashboard (moved here from Today): own figures for sellers; company, one seller or one product for the team. */
  dashboard: Dashboard; dashboardPlaybooks: Playbook[]; owners: OwnerOption[]; names: Record<string, { name: string; active: boolean }>;
  /** Present for people with crm.stats; it replaces the per-playbook summaries and leads-by-source table. */
  stats: ReportStats | null;
  gaps: AreaGaps | null; filled: { accounts: number; leads: number; unreadable: number } | null; error: string;
}

export async function reportsRoute(astro: AstroGlobal, lang: Lang): Promise<ReportsProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  const filters = readFilters(astro.url);
  const playbooks = (await latestPlaybooks(ctx.db)).filter((item) => item.kind !== "legacy" || ctx.actor.manager);
  const canStats = !!astro.locals.workspace?.can("crm.stats");
  const statsPlaybooks = playbooks.filter((item) => item.kind !== "legacy");
  const query = readStatsQuery(astro.url, ctx.actor, statsPlaybooks.map((item) => item.playbook_key));
  let error = "";
  const posted = await handlePost(astro, ctx, {
    fill_areas: async () => {
      const result = await fillAreas(ctx.db, ctx.actor);
      return `${astro.url.pathname}${statsSearch(query)}&filled=${result.accounts}.${result.leads}.${result.unreadable}#areas`;
    },
  });
  if (posted instanceof Response) return posted;
  if (posted) error = posted.serverError ? "server" : "invalid";
  const summaries: PipelineSummary[] = [];
  for (const playbook of canStats ? [] : playbooks) {
    const where = filterSql(ctx.actor, { ...filters, playbook: playbook.playbook_key, stage: "" });
    const rows = (await ctx.db.prepare(
      `SELECT o.stage_id, o.outcome, COUNT(*) AS count, SUM(CASE WHEN o.outcome = 'open' AND o.estimated_value_vnd IS NOT NULL THEN o.estimated_value_vnd ELSE 0 END) AS known,
        SUM(CASE WHEN o.outcome = 'open' AND o.estimated_value_vnd IS NULL THEN 1 ELSE 0 END) AS unknown
       FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id WHERE ${where.sql} GROUP BY o.stage_id, o.outcome`,
    ).bind(...where.args).all<{ stage_id: string; outcome: string; count: number; known: number; unknown: number }>()).results;
    if (!rows.length && !playbook.active) continue;
    const summary: PipelineSummary = { playbook, stages: {}, outcomes: {}, knownValue: 0, unknownValue: 0 };
    for (const row of rows) {
      summary.stages[row.stage_id] = (summary.stages[row.stage_id] ?? 0) + row.count;
      summary.outcomes[row.outcome] = (summary.outcomes[row.outcome] ?? 0) + row.count;
      summary.knownValue += row.known; summary.unknownValue += row.unknown;
    }
    summaries.push(summary);
  }
  const cohorts = (await ctx.db.prepare("SELECT * FROM crm_cohorts ORDER BY starts_on DESC LIMIT 50").all<CohortRow>()).results;
  // Cohort economics are admin/finance views; collaborators see their own pipeline only.
  const cohortKey = astro.url.searchParams.get("cohort_report") ?? cohorts[0]?.cohort_key ?? "";
  const cohort = (ctx.actor.manager || ctx.actor.finance) && cohortKey ? await loadCohort(ctx.db, cohortKey) : null;
  const pending = ctx.actor.finance ? (await ctx.db.prepare(
    `SELECT l.id, l.opportunity_id, o.title, l.amount_vnd, l.occurred_on, l.evidence FROM crm_ledger l JOIN crm_opportunities o ON o.id = l.opportunity_id
     WHERE l.kind = 'payment' AND l.status = 'pending' ORDER BY l.created_at LIMIT 100`,
  ).all<PendingPayment>()).results : [];
  const dashboard = await loadDashboard(ctx.db, ctx.actor, readDashboardFilters(astro.url, ctx.actor));
  const people = [dashboard.filters.owner, ...(dashboard.owners ?? []).map((row) => row.key)].filter(Boolean);
  const filledParam = /^(\d+)\.(\d+)\.(\d+)$/.exec(astro.url.searchParams.get("filled") ?? "");
  astro.response.headers.set("Cache-Control", "private, no-store");
  return {
    stats: canStats ? await loadReportStats(ctx, query, statsPlaybooks) : null,
    gaps: ctx.actor.configure ? await areaGaps(ctx.db) : null,
    filled: filledParam ? { accounts: Number(filledParam[1]), leads: Number(filledParam[2]), unreadable: Number(filledParam[3]) } : null, error,
    ctx, filters, summaries, offers: await latestOffers(ctx.db), cohorts, cohort, pending, leads: canStats ? [] : await leadReport(ctx.db, ctx.actor),
    dashboard, dashboardPlaybooks: playbooks.filter((item) => item.kind !== "legacy"),
    owners: ctx.actor.manager ? await ownerOptions(ctx.db, ctx.contentDb, ctx.actor) : [],
    names: await displayNames(ctx.contentDb, [...new Set(people)]),
  };
}

async function loadReportStats(ctx: Ctx, query: StatsQuery, playbooks: Playbook[]): Promise<ReportStats> {
  const playbook = playbooks.find((item) => item.playbook_key === query.playbook) ?? null;
  // Every version of the chosen playbook, so deals opened on an older version still count.
  const ids = playbook ? (await ctx.db.prepare("SELECT id FROM crm_playbooks WHERE playbook_key = ?").bind(playbook.playbook_key).all<{ id: string }>()).results.map((row) => row.id) : [];
  const results = [];
  for (const set of query.sets) results.push({ set, stats: await loadSetStats(ctx.db, ctx.actor, query, set, playbook?.def ?? null, ids) });
  const focus = query.sets[query.focus];
  const [area, industry, source, options] = await Promise.all([
    loadBreakdown(ctx.db, ctx.actor, query, focus, "area", ids),
    loadBreakdown(ctx.db, ctx.actor, query, focus, "industry", ids),
    loadBreakdown(ctx.db, ctx.actor, query, focus, "source", ids),
    areaOptions(ctx.db, ctx.actor),
  ]);
  return { query, playbooks, playbook, results, breakdowns: [area, industry, source], options };
}
