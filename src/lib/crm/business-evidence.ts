// Live evidence for the business model canvas. Figures come only from the
// commercial ledger (money counts once Finance confirms it), accepted quotes,
// fulfillment records and recorded costs. The result is aggregate: no names,
// contacts or deal titles leave this module. Unknown stays unknown, and costs
// nobody recorded are never treated as zero.
import { type LedgerEntry, effectiveEntries, paymentState, summarizeLedger } from "./money";
import { acquisitionCategories, deliveryCategories } from "./reports";

export const motions = ["local", "solutions"] as const;
export type Motion = typeof motions[number];

/** Which playbooks belong to which business model. Offers follow their playbooks. */
export const motionPlaybooks: Record<Motion, readonly string[]> = {
  local: ["local-preview", "local-renewal"],
  solutions: ["lumi-solution"],
};

/** Fulfillment states in which the promised work has reached the customer. */
export const deliveredStatuses: Record<string, readonly string[]> = {
  local_site: ["live", "accepted"],
  renewal_activation: ["active"],
  solution_delivery: ["delivered", "accepted"],
};

export interface EvidenceDeal {
  id: string; account_id: string; playbook_key: string; offer_key: string | null;
  relation: string; source_channel: string; outcome: string; created_at: string;
}
export interface EvidenceFulfillment { opportunity_id: string; kind: string; status: string }
export interface EvidenceCost { opportunity_id: string | null; playbook_key: string | null; category: string; basis: string; minutes: number | null; amount_vnd: number | null }
export interface EvidenceInput {
  deals: EvidenceDeal[]; ledger: LedgerEntry[]; fulfillments: EvidenceFulfillment[]; costs: EvidenceCost[];
  /** Offer key → motion, from the offers each motion's playbooks list. */
  offerMotion: Map<string, Motion>;
}

export interface MotionEvidence {
  deals: { total: number; open: number; won: number; lost: number };
  /** Businesses with confirmed cash kept on at least one deal (refunded in full does not count). */
  payingCustomers: number;
  netCash: number;
  latestPayment: string | null;
  offers: { offer_key: string; customers: number; net: number }[];
  /** Accepted quotes whose money has not fully arrived. Accepted is not paid. */
  acceptedUnpaid: { deals: number; outstanding: number };
  /** Payments a seller reported that Finance has not confirmed yet. */
  awaitingConfirmation: number;
  delivered: number;
  renewedCustomers: number;
  /** Where paying businesses came from: the channel of their first paid, non-renewal deal. */
  channels: { channel: string; customers: number }[];
  costs: { acquisition: number; delivery: number; estimates: number; uncostedEntries: number; entries: number };
  /** Net cash minus recorded actual costs. An upper bound until every cost is recorded. */
  cashAfterRecordedCosts: number;
}

export interface BusinessEvidence {
  byMotion: Record<Motion, MotionEvidence>;
  /** Deals no motion claims (legacy records without an accepted offer, or new offers). */
  unclassified: { deals: number; netCash: number };
}

export function motionOf(deal: Pick<EvidenceDeal, "playbook_key" | "offer_key">, offerMotion: Map<string, Motion>): Motion | null {
  for (const motion of motions) if (motionPlaybooks[motion].includes(deal.playbook_key)) return motion;
  return deal.offer_key ? offerMotion.get(deal.offer_key) ?? null : null;
}

function emptyMotion(): MotionEvidence {
  return {
    deals: { total: 0, open: 0, won: 0, lost: 0 }, payingCustomers: 0, netCash: 0, latestPayment: null, offers: [],
    acceptedUnpaid: { deals: 0, outstanding: 0 }, awaitingConfirmation: 0, delivered: 0, renewedCustomers: 0, channels: [],
    costs: { acquisition: 0, delivery: 0, estimates: 0, uncostedEntries: 0, entries: 0 }, cashAfterRecordedCosts: 0,
  };
}

export function computeEvidence(input: EvidenceInput): BusinessEvidence {
  const ledgerByDeal = new Map<string, LedgerEntry[]>();
  for (const entry of input.ledger) ledgerByDeal.set(entry.opportunity_id, [...(ledgerByDeal.get(entry.opportunity_id) ?? []), entry]);
  const fulfillmentByDeal = new Map(input.fulfillments.map((row) => [row.opportunity_id, row]));
  const dealMotion = new Map<string, Motion | null>(input.deals.map((deal) => [deal.id, motionOf(deal, input.offerMotion)]));

  const byMotion = Object.fromEntries(motions.map((motion) => [motion, emptyMotion()])) as Record<Motion, MotionEvidence>;
  const unclassified = { deals: 0, netCash: 0 };
  const paying = Object.fromEntries(motions.map((motion) => [motion, new Set<string>()])) as Record<Motion, Set<string>>;
  const renewed = Object.fromEntries(motions.map((motion) => [motion, new Set<string>()])) as Record<Motion, Set<string>>;
  const offerTotals = Object.fromEntries(motions.map((motion) => [motion, new Map<string, { accounts: Set<string>; net: number }>()])) as Record<Motion, Map<string, { accounts: Set<string>; net: number }>>;
  const firstPaid = Object.fromEntries(motions.map((motion) => [motion, new Map<string, EvidenceDeal>()])) as Record<Motion, Map<string, EvidenceDeal>>;

  for (const deal of input.deals) {
    const entries = ledgerByDeal.get(deal.id) ?? [];
    const summary = summarizeLedger(entries);
    const motion = dealMotion.get(deal.id) ?? null;
    if (!motion) {
      unclassified.deals += 1;
      unclassified.netCash += summary.net;
      continue;
    }
    const evidence = byMotion[motion];
    evidence.deals.total += 1;
    if (deal.outcome === "open") evidence.deals.open += 1;
    if (deal.outcome === "won") evidence.deals.won += 1;
    if (deal.outcome === "lost") evidence.deals.lost += 1;
    evidence.netCash += summary.net;
    evidence.awaitingConfirmation += summary.pendingPayments;
    for (const entry of effectiveEntries(entries)) {
      if (entry.kind === "payment" && entry.status === "confirmed" && (!evidence.latestPayment || entry.occurred_on > evidence.latestPayment)) evidence.latestPayment = entry.occurred_on;
    }
    const state = paymentState(summary);
    if (deal.offer_key && deal.outcome !== "lost" && (state === "unpaid" || state === "partial")) {
      evidence.acceptedUnpaid.deals += 1;
      evidence.acceptedUnpaid.outstanding += Math.max(0, summary.due - summary.net);
    }
    if (summary.net > 0) {
      paying[motion].add(deal.account_id);
      if (deal.relation === "renewal") renewed[motion].add(deal.account_id);
      else {
        const earlier = firstPaid[motion].get(deal.account_id);
        if (!earlier || deal.created_at < earlier.created_at) firstPaid[motion].set(deal.account_id, deal);
      }
      const key = deal.offer_key ?? "";
      const totals = offerTotals[motion].get(key) ?? { accounts: new Set<string>(), net: 0 };
      totals.accounts.add(deal.account_id);
      totals.net += summary.net;
      offerTotals[motion].set(key, totals);
    }
    const fulfillment = fulfillmentByDeal.get(deal.id);
    if (fulfillment && deliveredStatuses[fulfillment.kind]?.includes(fulfillment.status)) evidence.delivered += 1;
  }

  const playbookMotion = new Map<string, Motion>();
  for (const motion of motions) for (const key of motionPlaybooks[motion]) playbookMotion.set(key, motion);
  for (const cost of input.costs) {
    const motion = cost.opportunity_id ? dealMotion.get(cost.opportunity_id) ?? null : cost.playbook_key ? playbookMotion.get(cost.playbook_key) ?? null : null;
    if (!motion) continue;
    const costs = byMotion[motion].costs;
    costs.entries += 1;
    if (cost.basis === "estimate") { costs.estimates += cost.amount_vnd ?? 0; continue; }
    if (cost.amount_vnd === null) { costs.uncostedEntries += 1; continue; }
    if ((acquisitionCategories as readonly string[]).includes(cost.category)) costs.acquisition += cost.amount_vnd;
    else if ((deliveryCategories as readonly string[]).includes(cost.category)) costs.delivery += cost.amount_vnd;
  }

  for (const motion of motions) {
    const evidence = byMotion[motion];
    evidence.payingCustomers = paying[motion].size;
    evidence.renewedCustomers = renewed[motion].size;
    evidence.offers = [...offerTotals[motion]].map(([offer_key, totals]) => ({ offer_key, customers: totals.accounts.size, net: totals.net }))
      .sort((a, b) => b.net - a.net || a.offer_key.localeCompare(b.offer_key));
    const channels = new Map<string, number>();
    for (const deal of firstPaid[motion].values()) channels.set(deal.source_channel, (channels.get(deal.source_channel) ?? 0) + 1);
    evidence.channels = [...channels].map(([channel, customers]) => ({ channel, customers })).sort((a, b) => b.customers - a.customers || a.channel.localeCompare(b.channel));
    evidence.cashAfterRecordedCosts = evidence.netCash - evidence.costs.acquisition - evidence.costs.delivery;
  }
  return { byMotion, unclassified };
}

export async function loadEvidence(db: D1Database): Promise<BusinessEvidence> {
  const [deals, ledger, fulfillments, costs, playbooks] = await Promise.all([
    db.prepare(
      `SELECT o.id, o.account_id, p.playbook_key, o.relation, o.source_channel, o.outcome, o.created_at,
        (SELECT f.offer_key FROM crm_quotes q JOIN crm_offers f ON f.id = q.offer_id WHERE q.opportunity_id = o.id AND q.status = 'accepted' ORDER BY q.accepted_on DESC LIMIT 1) AS offer_key
       FROM crm_opportunities o JOIN crm_playbooks p ON p.id = o.playbook_id`,
    ).all<EvidenceDeal>(),
    db.prepare("SELECT id, opportunity_id, kind, amount_vnd, status, occurred_on, target_entry_id, quote_id FROM crm_ledger").all<LedgerEntry>(),
    db.prepare("SELECT opportunity_id, kind, status FROM crm_fulfillments").all<EvidenceFulfillment>(),
    db.prepare(
      `SELECT c.opportunity_id, COALESCE(po.playbook_key, k.playbook_key) AS playbook_key, c.category, c.basis, c.minutes, c.amount_vnd
       FROM crm_costs c LEFT JOIN crm_opportunities o ON o.id = c.opportunity_id LEFT JOIN crm_playbooks po ON po.id = o.playbook_id
       LEFT JOIN crm_cohorts k ON k.cohort_key = c.cohort_key`,
    ).all<EvidenceCost>(),
    db.prepare("SELECT playbook_key, definition FROM crm_playbooks").all<{ playbook_key: string; definition: string }>(),
  ]);
  const offerMotion = new Map<string, Motion>();
  for (const row of playbooks.results) {
    const motion = motions.find((key) => motionPlaybooks[key].includes(row.playbook_key));
    if (!motion) continue;
    const offers = (JSON.parse(row.definition) as { offers?: string[] }).offers ?? [];
    for (const offer of offers) offerMotion.set(offer, motion);
  }
  return computeEvidence({ deals: deals.results, ledger: ledger.results, fulfillments: fulfillments.results, costs: costs.results, offerMotion });
}
