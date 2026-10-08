// Quotes and the commercial ledger. Sellers propose and record; only people
// with the finance capability (or admins) confirm money, refunds and voids.
import type { CrmActor } from "./access";
import { type Offer, getOffer, latestOffers } from "./config";
import { ConflictError, Errors, ForbiddenError, ValidationError, eventStatement, fail, newId, nowIso, once, onceGuarded } from "./core";
import { type CreditDecision, type CreditSource, type LedgerEntry, decideCredit, effectiveEntries, parseVnd, refundableAmount, vnDate } from "./money";
import { isIsoDate, type Playbook } from "./playbook";
import type { Opportunity } from "./records";

export interface Quote {
  id: string; opportunity_id: string; offer_id: string; snapshot: string; list_price_vnd: number | null; price_vnd: number;
  credit_vnd: number; credit_source_entry_id: string | null; status: "draft" | "accepted" | "withdrawn"; accepted_on: string | null;
  acceptance_evidence: string; created_at: string;
}
export interface QuoteLine { label: string; charge_type: string; amount_vnd: number }
export interface QuoteSnapshot {
  offer: { id: string; key: string; version: number; name_en: string; name_vi: string; charge_type: string; list_price_vnd: number | null; scope_en: string; scope_vi: string; conditions_en: string; conditions_vi: string; source_ref: string; effective_from: string };
  lines: QuoteLine[];
  credit: { amount_vnd: number; source_entry_id: string; paid_on: string; expires_on: string } | null;
  price_note: string;
}
export interface LedgerRow extends LedgerEntry {
  account_id: string; method: string; evidence: string; note: string; period_start: string | null; period_end: string | null;
  recorded_by: string; confirmed_by: string | null; confirmed_at: string | null; created_at: string;
}

const dueAtAcceptance = new Set(["one_time", "first_year", "annual", "setup", "project", "custom"]);
const paymentMethods = ["bank_transfer", "cash", "card", "e_wallet", "other"];

function requestKey(form: FormData): string {
  return typeof form.get("request_key") === "string" ? String(form.get("request_key")) : "";
}

export async function opportunityQuotes(db: D1Database, opportunityId: string): Promise<Quote[]> {
  return (await db.prepare("SELECT * FROM crm_quotes WHERE opportunity_id = ? ORDER BY created_at DESC LIMIT 50").bind(opportunityId).all<Quote>()).results;
}

export async function opportunityLedger(db: D1Database, opportunityId: string): Promise<LedgerRow[]> {
  return (await db.prepare("SELECT * FROM crm_ledger WHERE opportunity_id = ? ORDER BY created_at LIMIT 200").bind(opportunityId).all<LedgerRow>()).results;
}

/** Credit candidates: confirmed payments for the source offer on any opportunity of the same account. */
export async function creditFor(db: D1Database, opportunity: Opportunity, offer: Offer, acceptOn: string): Promise<CreditDecision | null> {
  const rule = offer.rules.credit;
  if (!rule) return null;
  const rows = (await db.prepare(
    `SELECT l.*, f.offer_key AS source_offer, f.list_price_vnd AS source_list FROM crm_ledger l
     JOIN crm_quotes q ON q.opportunity_id = l.opportunity_id AND q.status = 'accepted'
     JOIN crm_offers f ON f.id = q.offer_id
     WHERE l.account_id = ? AND l.kind = 'payment' AND l.status = 'confirmed' AND f.offer_key = ? AND l.opportunity_id != ? ORDER BY l.occurred_on DESC LIMIT 40`,
  ).bind(opportunity.account_id, rule.from_offer, opportunity.id).all<LedgerRow & { source_offer: string; source_list: number | null }>()).results;
  if (!rows.length) return decideCredit(rule, [], [], new Set(), acceptOn);
  const opportunityIds = [...new Set(rows.map((row) => row.opportunity_id))];
  const sourceLedger = (await db.prepare(`SELECT * FROM crm_ledger WHERE opportunity_id IN (${opportunityIds.map(() => "?").join(", ")})`).bind(...opportunityIds).all<LedgerRow>()).results;
  const used = (await db.prepare(`SELECT target_entry_id FROM crm_ledger WHERE kind = 'credit' AND target_entry_id IN (${rows.map(() => "?").join(", ")})`).bind(...rows.map((row) => row.id)).all<{ target_entry_id: string }>()).results;
  const sources: CreditSource[] = rows.map((row) => ({ entry: row, offerKey: row.source_offer, listPrice: row.source_list }));
  return decideCredit(rule, sources, sourceLedger, new Set(used.map((row) => row.target_entry_id)), acceptOn);
}

function snapshotOf(offer: Offer, lines: QuoteLine[], credit: QuoteSnapshot["credit"], priceNote: string): QuoteSnapshot {
  return {
    offer: { id: offer.id, key: offer.offer_key, version: offer.version, name_en: offer.name_en, name_vi: offer.name_vi, charge_type: offer.charge_type, list_price_vnd: offer.list_price_vnd, scope_en: offer.scope_en, scope_vi: offer.scope_vi, conditions_en: offer.conditions_en, conditions_vi: offer.conditions_vi, source_ref: offer.source_ref, effective_from: offer.effective_from },
    lines, credit, price_note: priceNote,
  };
}

export async function createQuote(db: D1Database, actor: CrmActor, opportunity: Opportunity, playbook: Playbook, form: FormData): Promise<void> {
  const errors = new Errors();
  const offerId = errors.text(form, "offer_id", 80, true);
  const priceNote = errors.text(form, "price_note", 500);
  errors.throwIfAny();
  const offer = await getOffer(db, offerId);
  const allowed = (await latestOffers(db, { activeOnly: true })).find((item) => item.id === offerId);
  if (!offer || !allowed || !playbook.def.offers.includes(offer.offer_key)) fail("offer_id", "not_allowed");
  let lines: QuoteLine[];
  if (offer!.list_price_vnd !== null) {
    const override = parseVnd(errors.text(form, "price_override", 20), { allowEmpty: true });
    if (override === undefined) fail("price_override", "invalid");
    if (override !== null && override !== offer!.list_price_vnd) {
      // Only admins may depart from list price, and only with a reason.
      if (!actor.configure) fail("price_override", "admin_only");
      if (!priceNote) fail("price_note", "required");
    }
    lines = [{ label: offer!.name_en, charge_type: offer!.charge_type, amount_vnd: override ?? offer!.list_price_vnd! }];
  } else {
    lines = [];
    for (let index = 0; index < 5; index += 1) {
      const label = errors.text(form, `line.${index}.label`, 160);
      const chargeType = errors.text(form, `line.${index}.charge_type`, 20);
      const amount = parseVnd(errors.text(form, `line.${index}.amount_vnd`, 20), { allowEmpty: true });
      if (!label && amount === null) continue;
      if (!label) errors.add(`line.${index}.label`, "required");
      if (!["setup", "monthly", "annual", "project", "one_time"].includes(chargeType)) errors.add(`line.${index}.charge_type`, "invalid");
      if (amount === undefined || amount === null) errors.add(`line.${index}.amount_vnd`, "invalid");
      else lines.push({ label, charge_type: chargeType, amount_vnd: amount });
    }
    errors.throwIfAny();
    if (!lines.length) fail("line.0.label", "required");
  }
  const price = lines.filter((line) => dueAtAcceptance.has(line.charge_type)).reduce((total, line) => total + line.amount_vnd, 0);
  const decision = await creditFor(db, opportunity, offer!, vnDate());
  const credit = decision?.eligible ? { amount_vnd: Math.min(decision.amount, price), source_entry_id: decision.sourceEntryId, paid_on: decision.paidOn, expires_on: decision.expiresOn } : null;
  const id = newId("quo");
  const now = nowIso();
  await once(db, actor, requestKey(form), "quote_create", id, [
    db.prepare("INSERT INTO crm_quotes (id, opportunity_id, offer_id, snapshot, list_price_vnd, price_vnd, credit_vnd, credit_source_entry_id, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)")
      .bind(id, opportunity.id, offer!.id, JSON.stringify(snapshotOf(offer!, lines, credit, priceNote)), offer!.list_price_vnd, price, credit?.amount_vnd ?? 0, credit?.source_entry_id ?? null, actor.id, now, now),
    eventStatement(db, actor, "quote_created", { quote_id: id, offer: offer!.id, price_vnd: price, credit_vnd: credit?.amount_vnd ?? 0, credit_decision: decision && !decision.eligible ? decision.reason : null }, { opportunityId: opportunity.id, accountId: opportunity.account_id }),
  ]);
}

/**
 * Records the customer's acceptance. Creates the receivable and, when still
 * eligible on the acceptance date, the one-time credit. The unique index on
 * credit sources makes a retried or concurrent acceptance unable to credit twice.
 */
export async function acceptQuote(db: D1Database, actor: CrmActor, opportunity: Opportunity, form: FormData): Promise<void> {
  const errors = new Errors();
  const quoteId = errors.text(form, "quote_id", 60, true);
  const acceptedOn = errors.text(form, "accepted_on", 10) || vnDate();
  const evidence = errors.text(form, "acceptance_evidence", 500, true);
  if (!isIsoDate(acceptedOn) || acceptedOn > vnDate()) errors.add("accepted_on", "invalid");
  errors.throwIfAny();
  const key = requestKey(form);
  const quote = await db.prepare("SELECT * FROM crm_quotes WHERE id = ? AND opportunity_id = ?").bind(quoteId, opportunity.id).first<Quote>();
  if (!quote) fail("quote_id", "invalid");
  if (quote!.status !== "draft") {
    // A retry of an acceptance that already committed is a success, not an error.
    const seen = await db.prepare("SELECT 1 FROM crm_requests WHERE request_key = ?").bind(key).first();
    if (seen) return;
    fail("quote_id", "not_draft");
  }
  // Server time anchors the credit window: only admins may date an acceptance
  // before the quote was entered (e.g. a decision recorded late), with evidence.
  if (acceptedOn < vnDate(quote!.created_at) && !actor.configure) fail("accepted_on", "before_quote");
  const offer = await getOffer(db, quote!.offer_id);
  let creditSource: string | null = null;
  const decision = await creditFor(db, opportunity, offer!, acceptedOn);
  if (quote!.credit_vnd > 0) {
    if (!decision?.eligible || decision.sourceEntryId !== quote!.credit_source_entry_id) throw new ValidationError({ quote_id: `credit_${decision && !decision.eligible ? decision.reason : "changed"}` });
    creditSource = decision.sourceEntryId;
  } else if (decision?.eligible) {
    // The credit became available after this quote was drafted (e.g. the
    // Trust Kit payment was confirmed later): re-quote so the customer is not overcharged.
    fail("quote_id", "credit_available");
  }
  const now = nowIso();
  const guard = { sql: "EXISTS (SELECT 1 FROM crm_quotes WHERE id = ? AND status = 'draft')", args: [quoteId] };
  const statements = [
    db.prepare(`INSERT INTO crm_ledger (id, opportunity_id, account_id, quote_id, kind, amount_vnd, occurred_on, status, evidence, recorded_by, confirmed_by, confirmed_at, created_at) SELECT ?, ?, ?, ?, 'receivable', ?, ?, 'confirmed', ?, ?, ?, ?, ? WHERE ${guard.sql}`)
      .bind(newId("led"), opportunity.id, opportunity.account_id, quoteId, quote!.price_vnd, acceptedOn, evidence, actor.id, actor.id, now, now, ...guard.args),
    ...(creditSource ? [db.prepare(`INSERT INTO crm_ledger (id, opportunity_id, account_id, quote_id, kind, amount_vnd, occurred_on, status, note, target_entry_id, recorded_by, confirmed_by, confirmed_at, created_at) SELECT ?, ?, ?, ?, 'credit', ?, ?, 'confirmed', ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`)
      .bind(newId("led"), opportunity.id, opportunity.account_id, quoteId, quote!.credit_vnd, acceptedOn, "upgrade credit", creditSource, actor.id, actor.id, now, now, ...guard.args)] : []),
    eventStatement(db, actor, "quote_accepted", { quote_id: quoteId, price_vnd: quote!.price_vnd, credit_vnd: creditSource ? quote!.credit_vnd : 0, accepted_on: acceptedOn }, { opportunityId: opportunity.id, accountId: opportunity.account_id }, guard),
    db.prepare(`UPDATE crm_opportunities SET offer_id = ?, updated_at = ? WHERE id = ? AND ${guard.sql}`).bind(quote!.offer_id, now, opportunity.id, ...guard.args),
    db.prepare("UPDATE crm_quotes SET status = 'accepted', accepted_on = ?, acceptance_evidence = ?, accepted_by = ?, updated_at = ? WHERE id = ? AND status = 'draft'")
      .bind(acceptedOn, evidence, actor.id, now, quoteId),
  ];
  try {
    const result = await onceGuarded(db, actor, key, "quote_accept", quoteId, guard, statements);
    if (!result.changed) throw new ConflictError();
  } catch (error) {
    if (error instanceof ConflictError) throw error;
    const used = creditSource && await db.prepare("SELECT 1 FROM crm_ledger WHERE kind = 'credit' AND target_entry_id = ?").bind(creditSource).first();
    if (used) fail("quote_id", "credit_already_used");
    throw error;
  }
}

export async function withdrawQuote(db: D1Database, actor: CrmActor, opportunity: Opportunity, form: FormData): Promise<void> {
  const quoteId = typeof form.get("quote_id") === "string" ? String(form.get("quote_id")) : "";
  const now = nowIso();
  const guard = { sql: "EXISTS (SELECT 1 FROM crm_quotes WHERE id = ? AND opportunity_id = ? AND status = 'draft')", args: [quoteId, opportunity.id] };
  const result = await onceGuarded(db, actor, requestKey(form), "quote_withdraw", quoteId, guard, [
    eventStatement(db, actor, "quote_withdrawn", { quote_id: quoteId }, { opportunityId: opportunity.id, accountId: opportunity.account_id }, guard),
    db.prepare("UPDATE crm_quotes SET status = 'withdrawn', updated_at = ? WHERE id = ? AND opportunity_id = ? AND status = 'draft'").bind(now, quoteId, opportunity.id),
  ]);
  if (!result.changed) throw new ConflictError();
}

/** Sellers record a payment claim with evidence; it counts only after finance confirms. */
export async function recordPayment(db: D1Database, actor: CrmActor, opportunity: Opportunity, form: FormData): Promise<void> {
  if (!actor.finance && !actor.reportPayments) throw new ForbiddenError();
  const errors = new Errors();
  const amount = parseVnd(errors.text(form, "amount_vnd", 20, true));
  const occurredOn = errors.text(form, "occurred_on", 10, true);
  const method = errors.text(form, "method", 20, true);
  const evidence = errors.text(form, "evidence", 500, true);
  const note = errors.text(form, "note", 500);
  const periodStart = errors.text(form, "period_start", 10);
  const periodEnd = errors.text(form, "period_end", 10);
  if (!amount) errors.add("amount_vnd", "invalid");
  if (!isIsoDate(occurredOn) || occurredOn > vnDate()) errors.add("occurred_on", "invalid");
  if (!paymentMethods.includes(method)) errors.add("method", "invalid");
  if (periodStart && !isIsoDate(periodStart)) errors.add("period_start", "invalid");
  if (periodEnd && (!isIsoDate(periodEnd) || periodEnd < periodStart)) errors.add("period_end", "invalid");
  errors.throwIfAny();
  // Finance confirms money, but not for a sale they own themselves (admins excepted).
  const confirmed = actor.finance && (actor.configure || opportunity.owner_id !== actor.id);
  const now = nowIso();
  const id = newId("led");
  await once(db, actor, requestKey(form), "payment", id, [
    db.prepare("INSERT INTO crm_ledger (id, opportunity_id, account_id, kind, amount_vnd, occurred_on, status, method, evidence, note, period_start, period_end, recorded_by, confirmed_by, confirmed_at, created_at) VALUES (?, ?, ?, 'payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, opportunity.id, opportunity.account_id, amount, occurredOn, confirmed ? "confirmed" : "pending", method, evidence, note, periodStart || null, periodEnd || null, actor.id, confirmed ? actor.id : null, confirmed ? now : null, now),
    eventStatement(db, actor, confirmed ? "payment_confirmed" : "payment_recorded", { entry_id: id, amount_vnd: amount, occurred_on: occurredOn }, { opportunityId: opportunity.id, accountId: opportunity.account_id }),
  ]);
}

export async function reviewPayment(db: D1Database, actor: CrmActor, opportunity: Opportunity, form: FormData): Promise<void> {
  if (!actor.finance) throw new ForbiddenError();
  const entryId = typeof form.get("entry_id") === "string" ? String(form.get("entry_id")) : "";
  const decision = form.get("decision") === "confirm" ? "confirmed" : form.get("decision") === "reject" ? "rejected" : "";
  const note = typeof form.get("note") === "string" ? String(form.get("note")).trim().slice(0, 500) : "";
  if (!decision) fail("decision", "invalid");
  if (decision === "rejected" && !note) fail("note", "required");
  const entry = await db.prepare("SELECT recorded_by FROM crm_ledger WHERE id = ? AND opportunity_id = ?").bind(entryId, opportunity.id).first<{ recorded_by: string }>();
  if (entry && !actor.configure && (entry.recorded_by === actor.id || opportunity.owner_id === actor.id)) throw new ForbiddenError();
  const guard = { sql: "EXISTS (SELECT 1 FROM crm_ledger WHERE id = ? AND opportunity_id = ? AND status = 'pending')", args: [entryId, opportunity.id] };
  const now = nowIso();
  const result = await onceGuarded(db, actor, requestKey(form), `payment_${decision}`, entryId, guard, [
    eventStatement(db, actor, `payment_${decision}`, { entry_id: entryId, note }, { opportunityId: opportunity.id, accountId: opportunity.account_id }, guard),
    db.prepare("UPDATE crm_ledger SET status = ?, confirmed_by = ?, confirmed_at = ?, note = CASE WHEN ? = '' THEN note ELSE ? END WHERE id = ? AND opportunity_id = ? AND status = 'pending'")
      .bind(decision, actor.id, now, note, note, entryId, opportunity.id),
  ]);
  if (!result.changed) throw new ConflictError();
}

export async function recordRefund(db: D1Database, actor: CrmActor, opportunity: Opportunity, form: FormData): Promise<void> {
  if (!actor.finance) throw new ForbiddenError();
  const errors = new Errors();
  const paymentId = errors.text(form, "target_entry_id", 60, true);
  const amount = parseVnd(errors.text(form, "amount_vnd", 20, true));
  const occurredOn = errors.text(form, "occurred_on", 10, true);
  const evidence = errors.text(form, "evidence", 500, true);
  const note = errors.text(form, "note", 500, true);
  if (!amount) errors.add("amount_vnd", "invalid");
  if (!isIsoDate(occurredOn) || occurredOn > vnDate()) errors.add("occurred_on", "invalid");
  errors.throwIfAny();
  const ledger = await opportunityLedger(db, opportunity.id);
  const refundable = refundableAmount(ledger, paymentId);
  if (!refundable) fail("target_entry_id", "invalid");
  if (amount! > refundable) fail("amount_vnd", "exceeds_payment");
  const now = nowIso();
  const id = newId("led");
  // The cap is re-checked inside the write so concurrent refunds cannot exceed the payment.
  const guard = { sql: `${amount} <= (${REFUNDABLE_SQL})`, args: [paymentId, paymentId, paymentId] };
  const result = await onceGuarded(db, actor, requestKey(form), "refund", id, guard, [
    db.prepare(`INSERT INTO crm_ledger (id, opportunity_id, account_id, kind, amount_vnd, occurred_on, status, evidence, note, target_entry_id, recorded_by, confirmed_by, confirmed_at, created_at) SELECT ?, ?, ?, 'refund', ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`)
      .bind(id, opportunity.id, opportunity.account_id, amount, occurredOn, evidence, note, paymentId, actor.id, actor.id, now, now, ...guard.args),
    eventStatement(db, actor, "refund_recorded", { entry_id: id, payment_id: paymentId, amount_vnd: amount }, { opportunityId: opportunity.id, accountId: opportunity.account_id }, guard),
  ]);
  if (!result.changed) fail("amount_vnd", "exceeds_payment");
}

/** Remaining refundable amount of a confirmed, non-voided payment (binds the payment id three times). */
const REFUNDABLE_SQL = `SELECT p.amount_vnd - COALESCE((SELECT SUM(r.amount_vnd) FROM crm_ledger r WHERE r.kind = 'refund' AND r.status != 'rejected' AND r.target_entry_id = ?
    AND NOT EXISTS (SELECT 1 FROM crm_ledger v WHERE v.kind = 'void' AND v.status = 'confirmed' AND v.target_entry_id = r.id)), 0)
  FROM crm_ledger p WHERE p.id = ? AND p.kind = 'payment' AND p.status = 'confirmed'
    AND NOT EXISTS (SELECT 1 FROM crm_ledger v WHERE v.kind = 'void' AND v.status = 'confirmed' AND v.target_entry_id = ?)`;

/** Corrections cancel an entry with a reason; the original stays visible. */
export async function voidEntry(db: D1Database, actor: CrmActor, opportunity: Opportunity, form: FormData): Promise<void> {
  if (!actor.finance) throw new ForbiddenError();
  const errors = new Errors();
  const targetId = errors.text(form, "target_entry_id", 60, true);
  const reason = errors.text(form, "note", 500, true);
  errors.throwIfAny();
  const ledger = await opportunityLedger(db, opportunity.id);
  const live = effectiveEntries(ledger);
  const target = live.find((entry) => entry.id === targetId);
  if (!target) fail("target_entry_id", "invalid");
  if (target!.kind === "payment" && live.some((entry) => entry.kind === "refund" && entry.target_entry_id === targetId)) fail("target_entry_id", "has_refunds");
  const now = nowIso();
  const id = newId("led");
  // A payment with live refunds cannot be voided, even if a refund lands concurrently.
  const guard = { sql: `NOT EXISTS (SELECT 1 FROM crm_ledger r WHERE r.kind = 'refund' AND r.status != 'rejected' AND r.target_entry_id = ?
    AND NOT EXISTS (SELECT 1 FROM crm_ledger v WHERE v.kind = 'void' AND v.status = 'confirmed' AND v.target_entry_id = r.id))`, args: [targetId] };
  const result = await onceGuarded(db, actor, requestKey(form), "void", id, guard, [
    db.prepare(`INSERT INTO crm_ledger (id, opportunity_id, account_id, kind, amount_vnd, occurred_on, status, note, target_entry_id, recorded_by, confirmed_by, confirmed_at, created_at) SELECT ?, ?, ?, 'void', 0, ?, 'confirmed', ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`)
      .bind(id, opportunity.id, opportunity.account_id, vnDate(), reason, targetId, actor.id, actor.id, now, now, ...guard.args),
    eventStatement(db, actor, "entry_voided", { entry_id: targetId, kind: target!.kind, amount_vnd: target!.amount_vnd, reason }, { opportunityId: opportunity.id, accountId: opportunity.account_id }, guard),
  ]);
  if (!result.changed) fail("target_entry_id", "has_refunds");
}

/** Finance records a periodic amount due (e.g. a monthly fee period) outside a quote. */
export async function recordReceivable(db: D1Database, actor: CrmActor, opportunity: Opportunity, form: FormData): Promise<void> {
  if (!actor.finance) throw new ForbiddenError();
  const errors = new Errors();
  const amount = parseVnd(errors.text(form, "amount_vnd", 20, true));
  const periodStart = errors.text(form, "period_start", 10, true);
  const periodEnd = errors.text(form, "period_end", 10, true);
  const note = errors.text(form, "note", 500, true);
  if (!amount) errors.add("amount_vnd", "invalid");
  if (!isIsoDate(periodStart)) errors.add("period_start", "invalid");
  if (!isIsoDate(periodEnd) || periodEnd < periodStart) errors.add("period_end", "invalid");
  errors.throwIfAny();
  const now = nowIso();
  const id = newId("led");
  await once(db, actor, requestKey(form), "receivable", id, [
    db.prepare("INSERT INTO crm_ledger (id, opportunity_id, account_id, kind, amount_vnd, occurred_on, status, note, period_start, period_end, recorded_by, confirmed_by, confirmed_at, created_at) VALUES (?, ?, ?, 'receivable', ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, opportunity.id, opportunity.account_id, amount, periodStart, note, periodStart, periodEnd, actor.id, actor.id, now, now),
    eventStatement(db, actor, "receivable_recorded", { entry_id: id, amount_vnd: amount, period_start: periodStart, period_end: periodEnd }, { opportunityId: opportunity.id, accountId: opportunity.account_id }),
  ]);
}

export function parseSnapshot(quote: Pick<Quote, "snapshot">): QuoteSnapshot | null {
  try { return JSON.parse(quote.snapshot) as QuoteSnapshot; } catch { return null; }
}
