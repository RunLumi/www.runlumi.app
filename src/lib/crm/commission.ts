// Commission estimates from the commercial ledger and delivery state.
// The CRM computes and records; it never pays. See docs/crm/COMMISSION.md.
import { type LedgerEntry, addDays, paymentState, summarizeLedger, vnDate } from "./money";

export const sellerTypes = ["partner_seller", "partner_referral", "employee", "none"] as const;
export type SellerType = typeof sellerTypes[number];
export type PaidType = Exclude<SellerType, "none">;
export const rateKeys = ["trust_kit", "starter_live", "starter_retained", "upgrade_live", "upgrade_retained", "renewal_pct"] as const;
export type RateKey = typeof rateKeys[number];
export type Rates = Record<RateKey, number>;

export interface CommissionPolicy {
  status: "proposed" | "approved";
  approved_by?: string; approved_at?: string;
  retention_days: number;
  inbound_pct: number;
  offers: { trust_kit: string; starter: string; renewal: string[] };
  rates: Record<PaidType, Rates>;
}
export interface PolicyVersion { id: string; version: number; effective_from: string; body: CommissionPolicy; source_ref: string }

export interface CommissionDeal {
  id: string; title: string; relation: string; root_channel: string; offer_key: string;
  list_price: number | null; receivable: number; accepted_on: string;
  seller_id: string | null; referrer_id: string | null;
  ledger: LedgerEntry[]; delivered_on: string | null;
}

export type LineStatus = "waiting" | "holdback" | "earned" | "forfeited" | "no_terms";
export interface CommissionLine {
  opportunity_id: string; title: string; user_id: string; role: "seller" | "referrer"; component: RateKey;
  amount: number; status: LineStatus; eligible_on: string | null; policy_id: string; simulated: boolean;
}

/**
 * The policy that governs a deal: the latest approved version effective on
 * the acceptance date. Without one, the latest version is used as a
 * simulation (shown to admins/finance only, never payable).
 */
export function policyFor(versions: readonly PolicyVersion[], acceptedOn: string): { policy: PolicyVersion; simulated: boolean } | null {
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  const approved = sorted.find((item) => item.body.status === "approved" && item.effective_from <= acceptedOn);
  if (approved) return { policy: approved, simulated: false };
  return sorted[0] ? { policy: sorted[0], simulated: true } : null;
}

export function computeCommission(
  versions: readonly PolicyVersion[], deals: readonly CommissionDeal[],
  typeAt: (userId: string, date: string) => SellerType | null, today = vnDate(),
): CommissionLine[] {
  const lines: CommissionLine[] = [];
  for (const deal of deals) {
    const governing = policyFor(versions, deal.accepted_on);
    if (!governing) continue;
    const { body } = governing.policy;
    const summary = summarizeLedger(deal.ledger);
    const paid = ["paid", "overpaid"].includes(paymentState(summary));
    const refunded = summary.refunded > 0;
    // List-price discounts scale commission down; the upgrade credit is not a discount.
    const scale = deal.list_price ? Math.min(1, deal.receivable / deal.list_price) : 1;
    const inbound = deal.root_channel === "inbound_web" ? body.inbound_pct / 100 : 1;
    type Part = { key: RateKey; after: "delivered" | "retained" | "paid" };
    let parts: Part[] = [];
    if (deal.offer_key === body.offers.trust_kit) parts = [{ key: "trust_kit", after: "delivered" }];
    else if (deal.offer_key === body.offers.starter) parts = deal.relation === "upgrade"
      ? [{ key: "upgrade_live", after: "delivered" }, { key: "upgrade_retained", after: "retained" }]
      : [{ key: "starter_live", after: "delivered" }, { key: "starter_retained", after: "retained" }];
    else if (body.offers.renewal.includes(deal.offer_key)) parts = [{ key: "renewal_pct", after: "paid" }];
    if (!parts.length) continue;

    const beneficiaries: { user: string; role: "seller" | "referrer" }[] = [];
    if (deal.seller_id) beneficiaries.push({ user: deal.seller_id, role: "seller" });
    if (deal.referrer_id && deal.referrer_id !== deal.seller_id) beneficiaries.push({ user: deal.referrer_id, role: "referrer" });
    for (const { user, role } of beneficiaries) {
      const type = typeAt(user, deal.accepted_on);
      if (type === "none") continue;
      const rateType: PaidType | null = role === "referrer" ? "partner_referral" : type;
      for (const part of parts) {
        const base = { opportunity_id: deal.id, title: deal.title, user_id: user, role, component: part.key, policy_id: governing.policy.id, simulated: governing.simulated };
        if (!type || !rateType) { lines.push({ ...base, amount: 0, status: "no_terms", eligible_on: null }); continue; }
        const rate = body.rates[rateType][part.key];
        const amount = part.key === "renewal_pct"
          ? Math.round((summary.net * rate) / 100)
          : Math.round(rate * scale * inbound);
        if (amount <= 0) continue;
        let status: LineStatus;
        let eligibleOn: string | null = null;
        if (refunded) status = "forfeited";
        else if (!paid || (part.after !== "paid" && !deal.delivered_on)) status = "waiting";
        else {
          eligibleOn = part.after === "retained" ? addDays(deal.delivered_on!, body.retention_days) : (part.after === "paid" ? deal.accepted_on : deal.delivered_on);
          status = eligibleOn! <= today ? "earned" : "holdback";
        }
        lines.push({ ...base, amount, status, eligible_on: eligibleOn });
      }
    }
  }
  return lines;
}

export interface PersonSummary { user_id: string; earned: number; holdback: number; waiting: number; forfeited: number; simulated: number; paid: number; balance: number; missing_terms: number;
  /** Confirmed handoffs to HRM payroll; payroll pays these, so they are not owed here. */
  payroll: number }

/** Balance = earned (payable policies only) − recorded payouts − payroll handoffs. Negative means money to recover. */
export function summarizeByPerson(lines: readonly CommissionLine[], payouts: readonly { user_id: string; amount_vnd: number }[], handoffs: readonly { user_id: string; amount_vnd: number }[] = []): PersonSummary[] {
  const people = new Map<string, PersonSummary>();
  const get = (id: string) => people.get(id) ?? people.set(id, { user_id: id, earned: 0, holdback: 0, waiting: 0, forfeited: 0, simulated: 0, paid: 0, balance: 0, missing_terms: 0, payroll: 0 }).get(id)!;
  for (const line of lines) {
    const row = get(line.user_id);
    if (line.status === "no_terms") row.missing_terms += 1;
    // Amounts under an unapproved policy are a simulation and never payable.
    else if (line.simulated) { if (line.status === "earned" || line.status === "holdback") row.simulated += line.amount; }
    else row[line.status] += line.amount;
  }
  for (const payout of payouts) get(payout.user_id).paid += payout.amount_vnd;
  for (const handoff of handoffs) get(handoff.user_id).payroll += handoff.amount_vnd;
  return [...people.values()].map((row) => ({ ...row, balance: row.earned - row.paid - row.payroll })).sort((a, b) => b.earned - a.earned);
}

export function parsePolicyBody(value: string): CommissionPolicy {
  return JSON.parse(value) as CommissionPolicy;
}
