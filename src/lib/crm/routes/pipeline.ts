import type { AstroGlobal } from "astro";
import { type OwnerOption, displayNames, inactiveOwnerIds, ownerOptions } from "../access";
import { type Offer, latestOffers, latestPlaybooks } from "../config";
import type { Lang } from "../i18n";
import { type Ctx, type FormState, context, emptyState, handlePost, page } from "../page";
import type { Playbook } from "../playbook";
import { type Filters, type Opportunity, listOpportunities, quickCreate, readFilters, stageCounts } from "../records";

export interface PipelineProps {
  ctx: Ctx; filters: Filters; playbooks: Playbook[]; offers: Offer[]; rows: Opportunity[]; total: number; page: number; pages: number;
  counts: Record<string, number>; owners: OwnerOption[]; ownerNames: Record<string, { name: string; active: boolean }>; cohorts: string[];
}

export async function pipelineRoute(astro: AstroGlobal, lang: Lang): Promise<PipelineProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  const filters = readFilters(astro.url);
  const playbooks = await latestPlaybooks(ctx.db);
  // Stage counts never mix playbooks. "all" lists records across playbooks
  // (for search and reassignment) without showing a combined funnel.
  if (filters.playbook !== "all" && !playbooks.some((item) => item.playbook_key === filters.playbook)) filters.playbook = playbooks.find((item) => item.active)?.playbook_key ?? "";
  const query = { ...filters, playbook: filters.playbook === "all" ? "" : filters.playbook };
  const inactive = ctx.actor.admin && filters.owner === "inactive" ? await inactiveOwnerIds(ctx.db, ctx.contentDb) : [];
  const list = await listOpportunities(ctx.db, ctx.actor, query, page(astro.url), inactive);
  const counts = filters.playbook === "all" ? {} : await stageCounts(ctx.db, ctx.actor, query, inactive);
  const owners = ctx.actor.admin ? await ownerOptions(ctx.db, ctx.contentDb, ctx.actor) : [];
  const ownerNames = ctx.actor.admin ? await displayNames(ctx.contentDb, list.rows.map((row) => row.owner_id ?? "")) : {};
  const cohorts = (await ctx.db.prepare("SELECT cohort_key FROM crm_cohorts ORDER BY starts_on DESC LIMIT 50").all<{ cohort_key: string }>()).results.map((row) => row.cohort_key);
  return { ctx, filters, playbooks, offers: await latestOffers(ctx.db), ...list, counts, owners, ownerNames, cohorts };
}

export interface NewProps { ctx: Ctx; state: FormState; playbooks: Playbook[]; owners: OwnerOption[] }

export async function newRoute(astro: AstroGlobal, lang: Lang): Promise<NewProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  const posted = await handlePost(astro, ctx, {
    create: async (form) => `${ctx.base}/${(await quickCreate(ctx.db, ctx.contentDb, ctx.actor, form)).id}`,
  });
  if (posted instanceof Response) return posted;
  return {
    ctx, state: posted ?? emptyState, playbooks: await latestPlaybooks(ctx.db, { activeOnly: true }),
    owners: ctx.actor.admin ? await ownerOptions(ctx.db, ctx.contentDb, ctx.actor) : [],
  };
}
