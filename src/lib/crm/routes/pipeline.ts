import type { AstroGlobal } from "astro";
import { type OwnerOption, displayNames, inactiveOwnerIds, ownerOptions } from "../access";
import { type Offer, getPlaybook, latestOffers, latestPlaybooks } from "../config";
import { NotFoundError } from "../core";
import { type PickableContact, createOpportunityForContact, pickableContacts } from "../directory";
import type { Lang } from "../i18n";
import { type Ctx, type FormState, context, emptyState, handlePost, page } from "../page";
import type { Playbook } from "../playbook";
import { type BoardOpportunity, type Filters, type Opportunity, boardOpportunities, listOpportunities, loadOpportunity, moveStage, quickCreate, readFilters, requireEdit, saveInline, stageCounts } from "../records";

export type PipelineView = "list" | "board" | "table";

export interface PipelineProps {
  ctx: Ctx; state: FormState; view: PipelineView; filters: Filters; playbooks: Playbook[]; offers: Offer[]; rows: Opportunity[]; total: number; page: number; pages: number;
  board: BoardOpportunity[]; counts: Record<string, number>; owners: OwnerOption[]; ownerNames: Record<string, { name: string; active: boolean }>; cohorts: string[];
  failedId: string; customers: PickableContact[];
}

export async function pipelineRoute(astro: AstroGlobal, lang: Lang): Promise<PipelineProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  const back = `${astro.url.pathname}${astro.url.search}`;
  const editable = async (form: FormData) => requireEdit(await loadOpportunity(ctx.db, ctx.actor, String(form.get("opportunity_id") ?? "")));
  const posted = await handlePost(astro, ctx, {
    // Kanban drop or the card's "Move to" control: the same checked, versioned move as the record page.
    stage: async (form) => {
      const opportunity = await editable(form);
      const playbook = await getPlaybook(ctx.db, opportunity.playbook_id);
      if (!playbook) throw new NotFoundError();
      await moveStage(ctx.db, ctx.actor, opportunity, playbook, form);
      return back;
    },
    inline: async (form) => { await saveInline(ctx.db, ctx.actor, await editable(form), form); return back; },
    // The create sheet: the same function as /crm/new.
    create: (form) => createOpportunity(ctx, form),
  });
  if (posted instanceof Response) return posted;
  const filters = readFilters(astro.url);
  const playbooks = await latestPlaybooks(ctx.db);
  // Stage counts never mix playbooks. "all" lists records across playbooks
  // (for search and reassignment) without showing a combined funnel.
  if (filters.playbook !== "all" && !playbooks.some((item) => item.playbook_key === filters.playbook)) filters.playbook = playbooks.find((item) => item.active)?.playbook_key ?? "";
  const query = { ...filters, playbook: filters.playbook === "all" ? "" : filters.playbook };
  const inactive = ctx.actor.manager && filters.owner === "inactive" ? await inactiveOwnerIds(ctx.db, ctx.contentDb) : [];
  const requested = astro.url.searchParams.get("view");
  // The board groups by one playbook's stages, so it needs a single playbook.
  const view: PipelineView = requested === "board" && filters.playbook !== "all" ? "board" : requested === "table" ? "table" : "list";
  const board = view === "board" ? await boardOpportunities(ctx.db, ctx.actor, query, inactive) : [];
  const list = view === "board" ? { rows: [] as Opportunity[], total: board.length, page: 1, pages: 1 } : await listOpportunities(ctx.db, ctx.actor, query, page(astro.url), inactive);
  const counts = filters.playbook === "all" ? {} : await stageCounts(ctx.db, ctx.actor, query, inactive);
  const owners = ctx.actor.manager ? await ownerOptions(ctx.db, ctx.contentDb, ctx.actor) : [];
  const ownerNames = await displayNames(ctx.contentDb, [...list.rows, ...board].map((row) => row.owner_id ?? "").filter(Boolean));
  const cohorts = (await ctx.db.prepare("SELECT cohort_key FROM crm_cohorts ORDER BY starts_on DESC LIMIT 50").all<{ cohort_key: string }>()).results.map((row) => row.cohort_key);
  return { ctx, state: posted ?? emptyState, view, filters, playbooks, offers: await latestOffers(ctx.db), ...list, board, counts, owners, ownerNames, cohorts, failedId: posted?.values.opportunity_id ?? "",
    customers: astro.url.searchParams.get("new") === "1" || posted?.intent === "create" ? await pickableContacts(ctx.db, ctx.actor) : [] };
}

/** An existing contact (and so its company), or a new company and contact. */
async function createOpportunity(ctx: Ctx, form: FormData): Promise<string> {
  return form.get("contact_id")
    ? `${ctx.base}/${await createOpportunityForContact(ctx.db, ctx.contentDb, ctx.actor, form)}`
    : `${ctx.base}/${(await quickCreate(ctx.db, ctx.contentDb, ctx.actor, form)).id}`;
}

export interface NewProps { ctx: Ctx; state: FormState; playbooks: Playbook[]; owners: OwnerOption[]; customers: PickableContact[] }

export async function newRoute(astro: AstroGlobal, lang: Lang): Promise<NewProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  const posted = await handlePost(astro, ctx, {
    create: (form) => createOpportunity(ctx, form),
  });
  if (posted instanceof Response) return posted;
  return {
    ctx, state: posted ?? emptyState, playbooks: await latestPlaybooks(ctx.db, { activeOnly: true }),
    owners: ctx.actor.manager ? await ownerOptions(ctx.db, ctx.contentDb, ctx.actor) : [],
    customers: await pickableContacts(ctx.db, ctx.actor),
  };
}
