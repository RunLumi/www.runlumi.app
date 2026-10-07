import type { AstroGlobal } from "astro";
import { type Offer, latestOffers, latestPlaybooks } from "../config";
import type { Lang } from "../i18n";
import { type Ctx, context } from "../page";
import type { Playbook } from "../playbook";
import { type Filters, filterSql, readFilters } from "../records";
import { type CohortReport, type CohortRow, loadCohort } from "../reports";

export interface PipelineSummary { playbook: Playbook; stages: Record<string, number>; outcomes: Record<string, number>; knownValue: number; unknownValue: number }
export interface PendingPayment { id: string; opportunity_id: string; title: string; amount_vnd: number; occurred_on: string; evidence: string }
export interface ReportsProps {
  ctx: Ctx; filters: Filters; summaries: PipelineSummary[]; offers: Offer[]; cohorts: CohortRow[];
  cohort: { cohort: CohortRow; report: CohortReport; policySource: string } | null; pending: PendingPayment[];
}

export async function reportsRoute(astro: AstroGlobal, lang: Lang): Promise<ReportsProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  const filters = readFilters(astro.url);
  const playbooks = (await latestPlaybooks(ctx.db)).filter((item) => item.kind !== "legacy" || ctx.actor.admin);
  const summaries: PipelineSummary[] = [];
  for (const playbook of playbooks) {
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
  const cohort = (ctx.actor.admin || ctx.actor.finance) && cohortKey ? await loadCohort(ctx.db, cohortKey) : null;
  const pending = ctx.actor.finance ? (await ctx.db.prepare(
    `SELECT l.id, l.opportunity_id, o.title, l.amount_vnd, l.occurred_on, l.evidence FROM crm_ledger l JOIN crm_opportunities o ON o.id = l.opportunity_id
     WHERE l.kind = 'payment' AND l.status = 'pending' ORDER BY l.created_at LIMIT 100`,
  ).all<PendingPayment>()).results : [];
  return { ctx, filters, summaries, offers: await latestOffers(ctx.db), cohorts, cohort, pending };
}
