import type { AstroGlobal } from "astro";
import { type OwnerOption, displayNames, ownerOptions } from "../access";
import { type QueuedReferral, unassignedReferrals } from "../referrals";
import { assignOwner, loadOpportunity } from "../records";
import { assignInbound, dismissInbound, saveCohort, setCostingComplete } from "../admin";
import {
  type Offer, type OfferInput, allOfferVersions, allPlaybookVersions, latestOffers, latestPlaybooks, parsePlaybookForm, saveOfferVersion, savePlaybookVersion, setOfferActive, setPlaybookActive,
} from "../config";
import { type ChargeType } from "../seed";
import type { Lang } from "../i18n";
import { type InboundRow, inboundQueue } from "../intake";
import { parseVnd } from "../money";
import { type Ctx, type FormState, context, emptyState, forbidden, handlePost } from "../page";
import type { Playbook } from "../playbook";
import type { CohortRow } from "../reports";
import { logCost } from "../tasks";
import { ValidationError } from "../core";

export interface AdminProps {
  ctx: Ctx; state: FormState;
  inbound: InboundRow[]; referrals: QueuedReferral[]; referrerNames: Record<string, { name: string; active: boolean }>; owners: OwnerOption[]; cohorts: CohortRow[]; playbooks: Playbook[];
}

/** CRM operations (inbound queue, cohorts) need the team permission; configuration needs Admin. */
async function adminContext(astro: AstroGlobal, lang: Lang, level: "manager" | "configure" = "manager"): Promise<Ctx | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  return ctx.actor[level] ? ctx : forbidden(lang);
}

export async function adminRoute(astro: AstroGlobal, lang: Lang): Promise<AdminProps | Response> {
  const ctx = await adminContext(astro, lang);
  if (ctx instanceof Response) return ctx;
  const here = astro.url.pathname;
  const posted = await handlePost(astro, ctx, {
    inbound_assign: async (form) => { await assignInbound(ctx.db, ctx.contentDb, ctx.actor, form); return `${here}#inbound`; },
    referral_assign: async (form) => {
      const access = await loadOpportunity(ctx.db, ctx.actor, String(form.get("opportunity_id") ?? ""));
      await assignOwner(ctx.db, ctx.contentDb, ctx.actor, access.opportunity, form);
      return `${here}#referrals`;
    },
    inbound_dismiss: async (form) => { await dismissInbound(ctx.db, ctx.actor, form); return `${here}#inbound`; },
    cohort: async (form) => { await saveCohort(ctx.db, ctx.actor, form); return `${here}#cohorts`; },
    costing: async (form) => { await setCostingComplete(ctx.db, ctx.actor, form); return `${here}#cohorts`; },
    cohort_cost: async (form) => {
      const key = typeof form.get("cohort_key") === "string" ? String(form.get("cohort_key")) : "";
      if (!await ctx.db.prepare("SELECT 1 FROM crm_cohorts WHERE cohort_key = ?").bind(key).first()) throw new ValidationError({ cohort_key: "invalid" });
      await logCost(ctx.db, ctx.actor, null, form, key);
      return `${here}#cohorts`;
    },
  });
  if (posted instanceof Response) return posted;
  const queued = await unassignedReferrals(ctx.db);
  return {
    ctx, state: posted ?? emptyState,
    referrals: queued, referrerNames: await displayNames(ctx.contentDb, queued.map((row) => row.referrer_id ?? "")),
    inbound: await inboundQueue(ctx.db), owners: await ownerOptions(ctx.db, ctx.contentDb, ctx.actor),
    cohorts: (await ctx.db.prepare("SELECT * FROM crm_cohorts ORDER BY starts_on DESC LIMIT 50").all<CohortRow>()).results,
    playbooks: await latestPlaybooks(ctx.db),
  };
}

export interface PlaybooksProps { ctx: Ctx; state: FormState; versions: Playbook[]; latest: Playbook[]; offers: Offer[]; editing: Playbook | null; isNew: boolean }

export async function playbooksRoute(astro: AstroGlobal, lang: Lang): Promise<PlaybooksProps | Response> {
  const ctx = await adminContext(astro, lang, "configure");
  if (ctx instanceof Response) return ctx;
  const here = astro.url.pathname;
  const posted = await handlePost(astro, ctx, {
    playbook_save: async (form) => {
      const { meta, def } = parsePlaybookForm(form);
      await savePlaybookVersion(ctx.db, ctx.actor, meta, def, { newKey: form.get("is_new") === "1" });
      return `${here}?edit=${meta.key}`;
    },
    playbook_active: async (form) => { await setPlaybookActive(ctx.db, ctx.actor, String(form.get("playbook_key") ?? ""), form.get("active") === "1"); return here; },
  });
  if (posted instanceof Response) return posted;
  const versions = await allPlaybookVersions(ctx.db);
  const latest = await latestPlaybooks(ctx.db);
  const editKey = astro.url.searchParams.get("edit") ?? "";
  const from = astro.url.searchParams.get("from") ?? "";
  const isNew = astro.url.searchParams.has("new");
  const editing = isNew ? (versions.find((item) => item.id === from) ?? null) : latest.find((item) => item.playbook_key === editKey && item.kind !== "legacy") ?? null;
  return { ctx, state: posted ?? emptyState, versions, latest, offers: await latestOffers(ctx.db), editing, isNew };
}

export interface OffersProps { ctx: Ctx; state: FormState; versions: Offer[]; latest: Offer[] }

function offerInput(form: FormData): OfferInput {
  const get = (key: string) => (typeof form.get(key) === "string" ? String(form.get(key)).trim() : "");
  const price = parseVnd(get("list_price_vnd"), { allowEmpty: true });
  if (price === undefined) throw new ValidationError({ list_price_vnd: "invalid" });
  const days = get("credit_days");
  return {
    key: get("offer_key"), name_en: get("name_en").slice(0, 160), name_vi: get("name_vi").slice(0, 160), charge_type: get("charge_type") as ChargeType, list_price_vnd: price,
    scope_en: get("scope_en").slice(0, 2000), scope_vi: get("scope_vi").slice(0, 2000), conditions_en: get("conditions_en").slice(0, 2000), conditions_vi: get("conditions_vi").slice(0, 2000),
    source_ref: get("source_ref").slice(0, 300), effective_from: get("effective_from"), credit_from: get("credit_from"), credit_days: days ? Number(days) : null,
  };
}

export async function offersRoute(astro: AstroGlobal, lang: Lang): Promise<OffersProps | Response> {
  const ctx = await adminContext(astro, lang, "configure");
  if (ctx instanceof Response) return ctx;
  const here = astro.url.pathname;
  const posted = await handlePost(astro, ctx, {
    offer_save: async (form) => { await saveOfferVersion(ctx.db, ctx.actor, offerInput(form), { newKey: form.get("is_new") === "1" }); return here; },
    offer_active: async (form) => { await setOfferActive(ctx.db, ctx.actor, String(form.get("offer_key") ?? ""), form.get("active") === "1"); return here; },
  });
  if (posted instanceof Response) return posted;
  return { ctx, state: posted ?? emptyState, versions: await allOfferVersions(ctx.db), latest: await latestOffers(ctx.db) };
}
