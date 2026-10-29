import type { AstroGlobal } from "astro";
import { type OwnerOption, displayNames, ownerOptions } from "../access";
import { latestPlaybooks } from "../config";
import { editableAccounts } from "../directory";
import type { Lang } from "../i18n";
import {
  type ConversionMatches, type Lead, type LeadFilters, type LeadProcess, addLeadNote, assignLead, boardLeads, companyContacts, conversionMatches, convertLead, createLead,
  currentLeadProcess, disqualifyLead, leadEvents, leadProcessVersions, listLeads, loadLead, readLeadFilters, reopenLead, saveLead, saveLeadProcessVersion, setLeadStatus,
} from "../leads";
import { type Ctx, type FormState, context, emptyState, forbidden, handlePost, page } from "../page";
import type { Playbook } from "../playbook";

export type LeadView = "list" | "board";

export interface LeadsProps {
  ctx: Ctx; state: FormState; view: LeadView; filters: LeadFilters; rows: Lead[]; total: number; page: number; pages: number;
  process: LeadProcess; processes: Map<string, LeadProcess>; owners: OwnerOption[]; ownerNames: Record<string, { name: string; active: boolean }>; playbooks: Playbook[];
}

/** Statuses and reasons come from the lead process version each lead was created with. */
async function processMap(db: D1Database): Promise<{ current: LeadProcess; map: Map<string, LeadProcess> }> {
  const versions = await leadProcessVersions(db);
  return { current: versions[0], map: new Map(versions.map((item) => [item.id, item])) };
}

export async function leadsRoute(astro: AstroGlobal, lang: Lang): Promise<LeadsProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  const posted = await handlePost(astro, ctx, {
    lead_create: async (form) => `${ctx.base}/leads/${await createLead(ctx.db, ctx.contentDb, ctx.actor, form)}`,
    // Board and keyboard alternative: move an open lead to another status from the list.
    lead_status: async (form) => {
      const access = await loadLead(ctx.db, ctx.actor, String(form.get("lead_id") ?? ""));
      const { map } = await processMap(ctx.db);
      await setLeadStatus(ctx.db, ctx.actor, access, map.get(access.lead.process_id) ?? await currentLeadProcess(ctx.db), form);
      return `${astro.url.pathname}${astro.url.search}`;
    },
  });
  if (posted instanceof Response) return posted;
  const view: LeadView = astro.url.searchParams.get("view") === "board" ? "board" : "list";
  const filters = readLeadFilters(astro.url);
  const list = view === "board"
    ? { rows: await boardLeads(ctx.db, ctx.actor, filters), total: 0, page: 1, pages: 1 }
    : await listLeads(ctx.db, ctx.actor, filters, page(astro.url));
  if (view === "board") list.total = list.rows.length;
  const { current, map } = await processMap(ctx.db);
  return {
    ctx, state: posted ?? emptyState, view, filters, ...list, process: current, processes: map,
    owners: ctx.actor.manager ? await ownerOptions(ctx.db, ctx.contentDb, ctx.actor) : [],
    ownerNames: await displayNames(ctx.contentDb, list.rows.map((row) => row.owner_id ?? "").filter(Boolean)),
    playbooks: (await latestPlaybooks(ctx.db, { activeOnly: true })).filter((item) => item.kind !== "legacy" && item.kind !== "renewal"),
  };
}

export interface LeadProps {
  ctx: Ctx; state: FormState; lead: Lead; canEdit: boolean; process: LeadProcess; owners: OwnerOption[]; names: Record<string, { name: string; active: boolean }>;
  events: Awaited<ReturnType<typeof leadEvents>>; playbooks: Playbook[]; matches: ConversionMatches;
  convert: boolean; contactsFor: { id: string; name: string; role: string }[]; convertAccount: string; companies: { id: string; name: string; region: string }[];
}

export async function leadRoute(astro: AstroGlobal, lang: Lang, id: string): Promise<LeadProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  let access;
  try { access = await loadLead(ctx.db, ctx.actor, id); } catch { return new Response(lang === "vi" ? "Không tìm thấy hồ sơ." : "Record not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } }); }
  const { map } = await processMap(ctx.db);
  const process = map.get(access.lead.process_id) ?? await currentLeadProcess(ctx.db);
  const here = `${ctx.base}/leads/${id}`;
  const posted = await handlePost(astro, ctx, {
    lead_save: async (form) => { await saveLead(ctx.db, ctx.actor, access, form); return here; },
    lead_status: async (form) => { await setLeadStatus(ctx.db, ctx.actor, access, process, form); return here; },
    lead_note: async (form) => { await addLeadNote(ctx.db, ctx.actor, access, form); return `${here}#activity`; },
    lead_assign: async (form) => { await assignLead(ctx.db, ctx.contentDb, ctx.actor, access, form); return here; },
    lead_disqualify: async (form) => { await disqualifyLead(ctx.db, ctx.actor, access, process, form); return here; },
    lead_reopen: async (form) => { await reopenLead(ctx.db, ctx.actor, access, await currentLeadProcess(ctx.db), form); return here; },
    lead_convert: async (form) => { await convertLead(ctx.db, ctx.actor, access, form); return `${here}/converted`; },
  });
  if (posted instanceof Response) return posted;
  const convert = astro.url.searchParams.has("convert") || (posted?.intent === "lead_convert");
  const convertAccount = posted?.intent === "lead_convert" ? posted.values.account_id ?? "" : (astro.url.searchParams.get("account_id") ?? "");
  const matches = access.canEdit ? await conversionMatches(ctx.db, ctx.actor, access.lead) : { accounts: [], contacts: [] };
  const events = await leadEvents(ctx.db, id);
  const nameIds = [access.lead.owner_id, access.lead.referrer_id, access.lead.converted_by].filter((value): value is string => !!value);
  return {
    ctx, state: posted ?? emptyState, lead: access.lead, canEdit: access.canEdit, process, events, matches, convert, convertAccount,
    owners: ctx.actor.manager ? await ownerOptions(ctx.db, ctx.contentDb, ctx.actor) : [],
    names: await displayNames(ctx.contentDb, nameIds),
    playbooks: (await latestPlaybooks(ctx.db, { activeOnly: true })).filter((item) => item.kind !== "legacy"),
    contactsFor: convert && access.canEdit && convertAccount ? await companyContacts(ctx.db, ctx.actor, convertAccount) : [],
    companies: convert && access.canEdit ? await editableAccounts(ctx.db, ctx.actor) : [],
  };
}

export interface LeadConvertedProps { ctx: Ctx; lead: Lead; account: { id: string; name: string } | null; contact: { id: string; name: string } | null; opportunity: { id: string; title: string; stage: string } | null }

export async function leadConvertedRoute(astro: AstroGlobal, lang: Lang, id: string): Promise<LeadConvertedProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  let access;
  try { access = await loadLead(ctx.db, ctx.actor, id); } catch { return new Response(lang === "vi" ? "Không tìm thấy hồ sơ." : "Record not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } }); }
  const lead = access.lead;
  if (lead.state !== "converted") return new Response(null, { status: 303, headers: { Location: `${ctx.base}/leads/${id}`, "Cache-Control": "private, no-store" } });
  const account = await ctx.db.prepare("SELECT id, name FROM crm_accounts WHERE id = ?").bind(lead.converted_account_id).first<{ id: string; name: string }>();
  const contact = await ctx.db.prepare("SELECT id, name FROM crm_contacts WHERE id = ?").bind(lead.converted_contact_id).first<{ id: string; name: string }>();
  const opp = await ctx.db.prepare("SELECT id, title, playbook_id, stage_id FROM crm_opportunities WHERE id = ?").bind(lead.converted_opportunity_id).first<{ id: string; title: string; playbook_id: string; stage_id: string }>();
  let opportunity = null;
  if (opp) {
    const playbook = (await latestPlaybooks(ctx.db)).find((item) => item.id === opp.playbook_id) ?? null;
    const stage = playbook?.def.stages.find((item) => item.id === opp.stage_id);
    opportunity = { id: opp.id, title: opp.title, stage: stage ? (ctx.vi ? stage.vi : stage.en) : opp.stage_id };
  }
  return { ctx, lead, account, contact, opportunity };
}

export interface LeadSettingsProps { ctx: Ctx; state: FormState; versions: LeadProcess[] }

/** Admin (crm.configure): versioned lead statuses and disqualification reasons. */
export async function leadSettingsRoute(astro: AstroGlobal, lang: Lang): Promise<LeadSettingsProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  if (!ctx.actor.configure) return forbidden(lang);
  const posted = await handlePost(astro, ctx, {
    lead_process: async (form) => { await saveLeadProcessVersion(ctx.db, ctx.actor, form); return astro.url.pathname; },
  });
  if (posted instanceof Response) return posted;
  return { ctx, state: posted ?? emptyState, versions: await leadProcessVersions(ctx.db) };
}
