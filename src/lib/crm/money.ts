// Commercial ledger arithmetic for the CRM. This is a sales record, not
// accounting: it separates what was agreed (receivable), price adjustments
// (credit), money actually received (payment) and money returned (refund).
// Entries are never edited or deleted; a "void" entry cancels a mistaken one.

export const ledgerKinds = ["receivable", "credit", "payment", "refund", "void"] as const;
export type LedgerKind = typeof ledgerKinds[number];
export const ledgerStatuses = ["pending", "confirmed", "rejected"] as const;
export type LedgerStatus = typeof ledgerStatuses[number];

export interface LedgerEntry {
  id: string; opportunity_id: string; kind: LedgerKind; amount_vnd: number; status: LedgerStatus;
  occurred_on: string; target_entry_id: string | null; quote_id: string | null;
}

export interface LedgerSummary {
  /** Agreed amounts from accepted quotes or recorded periods. */
  receivable: number;
  /** Price adjustments such as the Trust Kit upgrade credit. Not cash. */
  credit: number;
  /** receivable − credit. */
  due: number;
  /** Confirmed money received. */
  collected: number;
  /** Confirmed money returned. */
  refunded: number;
  /** collected − refunded: cash kept before costs. */
  net: number;
  outstanding: number;
  pendingPayments: number;
}

export type PaymentState = "not_billed" | "unpaid" | "partial" | "paid" | "overpaid" | "refunded";

export const TIME_ZONE_OFFSET_HOURS = 7; // Asia/Ho_Chi_Minh has no DST.

/** The calendar date in Asia/Ho_Chi_Minh for an instant. */
export function vnDate(at: Date | string = new Date()): string {
  const time = typeof at === "string" ? new Date(at).getTime() : at.getTime();
  return new Date(time + TIME_ZONE_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return new Date(parsed.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

/** Entries that count: not rejected, not a void, not cancelled by a confirmed void. */
export function effectiveEntries<T extends LedgerEntry>(entries: readonly T[]): T[] {
  const voided = new Set(entries.filter((entry) => entry.kind === "void" && entry.status === "confirmed" && entry.target_entry_id).map((entry) => entry.target_entry_id!));
  return entries.filter((entry) => entry.kind !== "void" && entry.status !== "rejected" && !voided.has(entry.id));
}

export function summarizeLedger(entries: readonly LedgerEntry[]): LedgerSummary {
  const live = effectiveEntries(entries);
  const sum = (kind: LedgerKind, status?: LedgerStatus) => live
    .filter((entry) => entry.kind === kind && (!status || entry.status === status))
    .reduce((total, entry) => total + entry.amount_vnd, 0);
  const receivable = sum("receivable", "confirmed");
  const credit = sum("credit", "confirmed");
  const collected = sum("payment", "confirmed");
  const refunded = sum("refund", "confirmed");
  const due = Math.max(0, receivable - credit);
  const net = collected - refunded;
  return { receivable, credit, due, collected, refunded, net, outstanding: due - net, pendingPayments: sum("payment", "pending") };
}

export function paymentState(summary: LedgerSummary): PaymentState {
  if (summary.receivable === 0 && summary.collected === 0) return "not_billed";
  if (summary.collected > 0 && summary.net <= 0) return "refunded";
  if (summary.net <= 0) return "unpaid";
  if (summary.net < summary.due) return "partial";
  return summary.net === summary.due ? "paid" : "overpaid";
}

/** Remaining refundable amount of one payment, counting pending refunds. */
export function refundableAmount(entries: readonly LedgerEntry[], paymentId: string): number {
  const live = effectiveEntries(entries);
  const payment = live.find((entry) => entry.id === paymentId && entry.kind === "payment" && entry.status === "confirmed");
  if (!payment) return 0;
  const refunded = live.filter((entry) => entry.kind === "refund" && entry.target_entry_id === paymentId).reduce((total, entry) => total + entry.amount_vnd, 0);
  return Math.max(0, payment.amount_vnd - refunded);
}

export interface CreditRule {
  /** Offer key whose payment earns the credit (e.g. local-trust-kit). */
  from_offer: string;
  window_days: number;
  /** Credit equals the full amount paid for the source offer. */
  amount: "full_paid";
}

export interface CreditSource { entry: LedgerEntry; offerKey: string; listPrice: number | null }
export type CreditDecision =
  | { eligible: true; amount: number; sourceEntryId: string; paidOn: string; expiresOn: string }
  | { eligible: false; reason: "no_source" | "not_fully_paid" | "already_used" | "expired" | "before_payment"; sourceEntryId?: string; expiresOn?: string };

/**
 * Upgrade credit policy (see docs/crm): the window opens on the calendar date
 * the source payment was received (Asia/Ho_Chi_Minh) and includes day
 * `window_days`. Acceptance on paidOn + 30 days is eligible; paidOn + 31 is not.
 * A source payment can be credited once. A refunded or voided source earns none.
 */
export function decideCredit(
  rule: CreditRule,
  sources: readonly CreditSource[],
  sourceLedger: readonly LedgerEntry[],
  usedSourceIds: ReadonlySet<string>,
  acceptOn: string,
): CreditDecision {
  const live = effectiveEntries(sourceLedger);
  const candidates = sources
    .filter((source) => source.offerKey === rule.from_offer && source.entry.kind === "payment" && source.entry.status === "confirmed")
    .filter((source) => live.some((entry) => entry.id === source.entry.id))
    .sort((a, b) => b.entry.occurred_on.localeCompare(a.entry.occurred_on));
  if (!candidates.length) return { eligible: false, reason: "no_source" };
  let last: CreditDecision = { eligible: false, reason: "no_source" };
  for (const source of candidates) {
    const expiresOn = addDays(source.entry.occurred_on, rule.window_days);
    const refundable = refundableAmount(sourceLedger, source.entry.id);
    if (usedSourceIds.has(source.entry.id)) { last = { eligible: false, reason: "already_used", sourceEntryId: source.entry.id, expiresOn }; continue; }
    if (refundable !== source.entry.amount_vnd || (source.listPrice !== null && source.entry.amount_vnd < source.listPrice)) { last = { eligible: false, reason: "not_fully_paid", sourceEntryId: source.entry.id, expiresOn }; continue; }
    if (acceptOn < source.entry.occurred_on) { last = { eligible: false, reason: "before_payment", sourceEntryId: source.entry.id, expiresOn }; continue; }
    if (acceptOn > expiresOn) { last = { eligible: false, reason: "expired", sourceEntryId: source.entry.id, expiresOn }; continue; }
    return { eligible: true, amount: source.entry.amount_vnd, sourceEntryId: source.entry.id, paidOn: source.entry.occurred_on, expiresOn };
  }
  return last;
}

export function parseVnd(raw: string, { allowEmpty = false } = {}): number | null | undefined {
  const value = raw.replace(/[.,\s₫đ]/gi, "").trim();
  if (value === "") return allowEmpty ? null : undefined;
  if (!/^\d{1,13}$/.test(value)) return undefined;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount <= 1_000_000_000_000 ? amount : undefined;
}

export function formatVnd(amount: number | null | undefined, vi: boolean): string {
  if (amount === null || amount === undefined) return vi ? "Chưa biết" : "Unknown";
  return `${new Intl.NumberFormat(vi ? "vi-VN" : "en-US").format(amount)} ₫`;
}
