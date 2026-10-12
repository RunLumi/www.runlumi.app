import type { AstroGlobal } from "astro";
import { type OwnerOption, displayNames, ownerOptions } from "../access";
import {
  type LedgerRow, type Quote, acceptQuote, createQuote, creditFor, opportunityLedger, opportunityQuotes, recordPayment, recordReceivable, recordRefund, reviewPayment, voidEntry, withdrawQuote,
} from "../commercial";
import { type Offer, type OfferRow, allPlaybookVersions, getPlaybook, latestPlaybooks, offersForPlaybook, parseOffer } from "../config";
import { NotFoundError } from "../core";
import { setReferrer } from "../commission-store";
import { type Fulfillment, createHandoff, fulfillmentAction, getFulfillment, updateHandoff } from "../fulfillment";
import type { Lang } from "../i18n";
import { type CreditDecision, type LedgerSummary, type PaymentState, paymentState, summarizeLedger, vnDate } from "../money";
import { type Ctx, type FormState, context, emptyState, handlePost, notFound } from "../page";
import { type Playbook, type TransitionCheck, checkTransition } from "../playbook";
import {
  type Access, type Contact, type Opportunity, addNote, assignOwner, changePlaybook, createLinked, loadOpportunity, moveStage, moveToAccount,
  recentEvents, relatedOpportunities, requireEdit, saveDetails, saveFields, setPrimaryContact, transitionContext,
} from "../records";
import { visibleContacts } from "../directory";
import { type CostRow, type Task, createTask, logCost, opportunityCosts, opportunityTasks, updateTask } from "../tasks";

export interface OppProps {
  ctx: Ctx; state: FormState; access: Access; playbook: Playbook; transitions: Record<string, TransitionCheck>;
  offers: Offer[]; quoteOffers: Record<string, Offer>; quotes: Quote[]; ledger: LedgerRow[]; summary: LedgerSummary; payment: PaymentState;
  credit: CreditDecision | null; fulfillment: Fulfillment | null; tasks: Task[]; costs: CostRow[]; contacts: Contact[];
  related: Opportunity[]; events: { id: string; actor_name: string; kind: string; body: string; created_at: string }[];
  names: Record<string, { name: string; active: boolean }>; owners: OwnerOption[]; cohorts: string[];
  linkPlaybooks: Playbook[]; allVersions: Playbook[]; playbookNames: Record<string, string>;
}

export async function opportunityRoute(astro: AstroGlobal, lang: Lang): Promise<OppProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  let access: Access;
  try {
    access = await loadOpportunity(ctx.db, ctx.actor, astro.params.id ?? "");
  } catch (error) {
    if (error instanceof NotFoundError) return notFound(lang);
    throw error;
  }
  const opportunity = access.opportunity;
  const playbook = await getPlaybook(ctx.db, opportunity.playbook_id);
  if (!playbook) return notFound(lang);
  const here = astro.url.pathname;
  const edit = () => requireEdit(access);
  const quotesNow = () => opportunityQuotes(ctx.db, opportunity.id);
  const fulfillmentNow = async () => {
    const found = await getFulfillment(ctx.db, opportunity.id);
    if (!found) throw new NotFoundError();
    return found;
  };
  const posted = await handlePost(astro, ctx, {
    details: async (form) => { await saveDetails(ctx.db, ctx.actor, edit(), form); return `${here}#details`; },
    fields: async (form) => { await saveFields(ctx.db, ctx.actor, edit(), playbook, form); return `${here}#discovery`; },
    stage: async (form) => { await moveStage(ctx.db, ctx.actor, edit(), playbook, form); return `${here}#stage`; },
    assign: async (form) => { await assignOwner(ctx.db, ctx.contentDb, ctx.actor, opportunity, form); return here; },
    primary_contact: async (form) => { await setPrimaryContact(ctx.db, ctx.actor, edit(), form); return `${here}#contacts`; },
    note: async (form) => { await addNote(ctx.db, ctx.actor, edit(), form); return `${here}#activity`; },
    task_create: async (form) => { await createTask(ctx.db, ctx.actor, edit(), form); return `${here}#tasks`; },
    task_update: async (form) => { await updateTask(ctx.db, ctx.actor, edit(), form); return `${here}#tasks`; },
    cost: async (form) => { await logCost(ctx.db, ctx.actor, edit(), form); return `${here}#time`; },
    quote_create: async (form) => { await createQuote(ctx.db, ctx.actor, edit(), playbook, form); return `${here}#commercial`; },
    quote_accept: async (form) => { await acceptQuote(ctx.db, ctx.actor, edit(), form); return `${here}#commercial`; },
    quote_withdraw: async (form) => { await withdrawQuote(ctx.db, ctx.actor, edit(), form); return `${here}#commercial`; },
    payment: async (form) => { await recordPayment(ctx.db, ctx.actor, ctx.actor.finance ? opportunity : edit(), form); return `${here}#commercial`; },
    payment_review: async (form) => { await reviewPayment(ctx.db, ctx.actor, opportunity, form); return `${here}#commercial`; },
    refund: async (form) => { await recordRefund(ctx.db, ctx.actor, opportunity, form); return `${here}#commercial`; },
    void: async (form) => { await voidEntry(ctx.db, ctx.actor, opportunity, form); return `${here}#commercial`; },
    receivable: async (form) => { await recordReceivable(ctx.db, ctx.actor, opportunity, form); return `${here}#commercial`; },
    handoff: async (form) => { await createHandoff(ctx.db, ctx.actor, edit(), playbook, await quotesNow(), form); return `${here}#fulfillment`; },
    handoff_update: async (form) => { await updateHandoff(ctx.db, ctx.actor, opportunity, await fulfillmentNow(), form); return `${here}#fulfillment`; },
    fulfillment: async (form) => { await fulfillmentAction(ctx.db, ctx.actor, opportunity, await fulfillmentNow(), form); return `${here}#fulfillment`; },
    linked: async (form) => `${ctx.base}/${(await createLinked(ctx.db, ctx.actor, edit(), form)).id}`,
    playbook_change: async (form) => { await changePlaybook(ctx.db, ctx.actor, opportunity, form); return here; },
    move_account: async (form) => { await moveToAccount(ctx.db, ctx.actor, opportunity, form); return here; },
    referrer: async (form) => { await setReferrer(ctx.db, ctx.contentDb, ctx.actor, opportunity, form); return `${here}#details`; },
  });
  if (posted instanceof Response) return posted;

  // Finance/fulfillment readers who do not own the deal see money, delivery
  // and contacts, not the seller's notes, tasks, time or discovery details.
  const full = access.canEdit;
  const [quotes, ledger, fulfillment, tasks, costs, contacts, related, events, context2, offers] = await Promise.all([
    quotesNow(), opportunityLedger(ctx.db, opportunity.id), getFulfillment(ctx.db, opportunity.id), full ? opportunityTasks(ctx.db, opportunity.id) : [],
    full ? opportunityCosts(ctx.db, opportunity.id) : [], visibleContacts(ctx.db, ctx.actor, opportunity.account_id), relatedOpportunities(ctx.db, ctx.actor, opportunity),
    full ? recentEvents(ctx.db, opportunity.id) : [], transitionContext(ctx.db, opportunity), offersForPlaybook(ctx.db, playbook),
  ]);
  const transitions = Object.fromEntries(playbook.def.stages.filter((stage) => stage.id !== opportunity.stage_id).map((stage) => [stage.id, checkTransition(playbook.def, opportunity.stage_id, stage.id, context2)]));
  const quoteOfferIds = [...new Set(quotes.map((quote) => quote.offer_id))];
  const quoteOffers: Record<string, Offer> = {};
  if (quoteOfferIds.length) for (const row of (await ctx.db.prepare(`SELECT * FROM crm_offers WHERE id IN (${quoteOfferIds.map(() => "?").join(", ")})`).bind(...quoteOfferIds).all<OfferRow>()).results) quoteOffers[row.id] = parseOffer(row);
  const creditOffer = offers.find((offer) => offer.rules.credit);
  const credit = creditOffer ? await creditFor(ctx.db, opportunity, creditOffer, vnDate()) : null;
  const summary = summarizeLedger(ledger);
  const people = [opportunity.owner_id, opportunity.seller_id, opportunity.referrer_id, opportunity.created_by, ...ledger.flatMap((entry) => [entry.recorded_by, entry.confirmed_by]), fulfillment?.assignee_id].filter((id): id is string => !!id && !id.includes(":"));
  const latest = await latestPlaybooks(ctx.db, { activeOnly: true });
  return {
    ctx, state: posted ?? emptyState, access, playbook, transitions, offers, quoteOffers, quotes, ledger, summary, payment: paymentState(summary), credit,
    fulfillment, tasks, costs, contacts, related, events, names: await displayNames(ctx.contentDb, people),
    owners: ctx.actor.manager ? await ownerOptions(ctx.db, ctx.contentDb, ctx.actor) : [],
    cohorts: (await ctx.db.prepare("SELECT cohort_key FROM crm_cohorts ORDER BY starts_on DESC LIMIT 50").all<{ cohort_key: string }>()).results.map((row) => row.cohort_key),
    linkPlaybooks: latest.filter((item) => item.kind !== "legacy"),
    allVersions: ctx.actor.manager ? (await allPlaybookVersions(ctx.db)).filter((item) => item.active && item.kind !== "legacy") : [],
    playbookNames: Object.fromEntries((await allPlaybookVersions(ctx.db)).map((item) => [item.id, `${lang === "vi" ? item.name_vi : item.name_en} v${item.version}`])),
  };
}
