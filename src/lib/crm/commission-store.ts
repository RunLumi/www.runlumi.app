// Persistence for commission: policy versions, seller terms, referrers, payouts.
import { type CrmActor, emdashUsers } from "./access";
import {
  type CommissionDeal, type CommissionLine, type CommissionPolicy, type PersonSummary, type PolicyVersion, type SellerType,
  computeCommission, parsePolicyBody, rateKeys, sellerTypes, summarizeByPerson,
} from "./commission";
import { ConflictError, Errors, ForbiddenError, ValidationError, eventStatement, fail, newId, nowIso, once, onceGuarded } from "./core";
import { type LedgerEntry, parseVnd, vnDate } from "./money";
import { isIsoDate } from "./playbook";
import type { Opportunity } from "./records";

const POLICY_KEY = "local-commission";

function requestKey(form: FormData): string {
  return typeof form.get("request_key") === "string" ? String(form.get("request_key")) : "";
}

export async function policyVersions(db: D1Database): Promise<PolicyVersion[]> {
  const rows = (await db.prepare("SELECT id, version, effective_from, body, source_ref FROM crm_policies WHERE policy_key = ? ORDER BY version DESC").bind(POLICY_KEY)
    .all<{ id: string; version: number; effective_from: string; body: string; source_ref: string }>()).results;
  return rows.map((row) => ({ ...row, body: parsePolicyBody(row.body) }));
}

export interface TermsRow { id: string; user_id: string; seller_type: SellerType; effective_from: string; note: string; created_at: string }
export async function sellerTerms(db: D1Database): Promise<TermsRow[]> {
  return (await db.prepare("SELECT id, user_id, seller_type, effective_from, note, created_at FROM crm_seller_terms ORDER BY user_id, effective_from DESC, created_at DESC LIMIT 2000").all<TermsRow>()).results;
}

export function typeResolver(terms: readonly TermsRow[], adminIds: ReadonlySet<string>): (userId: string, date: string) => SellerType | null {
  return (userId, date) => {
    const row = terms.find((item) => item.user_id === userId && item.effective_from <= date);
    if (row) return row.seller_type;
    // Admins (founders) earn no commission unless terms say otherwise.
    return adminIds.has(userId) ? "none" : null;
  };
}

const DEALS_SQL = `SELECT o.id, o.title, o.relation, o.seller_id, o.referrer_id,
    CASE WHEN o.relation IN ('upgrade', 'renewal') AND p.id IS NOT NULL THEN p.source_channel ELSE o.source_channel END AS root_channel,
    f.offer_key, q.list_price_vnd AS list_price, q.price_vnd AS receivable, q.accepted_on
  FROM crm_opportunities o
  JOIN crm_quotes q ON q.id = (SELECT id FROM crm_quotes x WHERE x.opportunity_id = o.id AND x.status = 'accepted' ORDER BY x.accepted_on DESC LIMIT 1)
  JOIN crm_offers f ON f.id = q.offer_id
  LEFT JOIN crm_opportunities p ON p.id = o.parent_id
  WHERE f.offer_key IN (SELECT value FROM json_each(?))
  LIMIT 2000`;

export interface CommissionView { versions: PolicyVersion[]; lines: CommissionLine[]; people: PersonSummary[]; terms: TermsRow[]; payouts: PayoutRow[]; names: Record<string, string>; visible: boolean }
export interface PayoutRow { id: string; user_id: string; period: string; amount_vnd: number; policy_id: string; evidence: string; note: string; created_at: string }

export async function loadCommission(db: D1Database, contentDb: D1Database, actor: CrmActor): Promise<CommissionView> {
  const versions = await policyVersions(db);
  const terms = await sellerTerms(db);
  const offers = versions[0] ? [versions[0].body.offers.trust_kit, versions[0].body.offers.starter, ...versions[0].body.offers.renewal] : [];
  const offerList = JSON.stringify([...new Set(versions.flatMap((item) => [item.body.offers.trust_kit, item.body.offers.starter, ...item.body.offers.renewal]).concat(offers))]);
  const deals = (await db.prepare(DEALS_SQL).bind(offerList).all<Omit<CommissionDeal, "ledger" | "delivered_on">>()).results;
  const ledger = (await db.prepare(`SELECT * FROM crm_ledger WHERE opportunity_id IN (SELECT o.id FROM (${DEALS_SQL}) o)`).bind(offerList).all<LedgerEntry>()).results;
  const delivered = (await db.prepare(
    `SELECT f.opportunity_id, json_extract(f.acceptance, '$.accepted_on') AS accepted_on,
      (SELECT MIN(e.created_at) FROM crm_events e WHERE e.opportunity_id = f.opportunity_id AND e.kind = 'fulfillment_status' AND json_extract(e.body, '$.to') IN ('live', 'accepted')) AS live_at
     FROM crm_fulfillments f WHERE f.status IN ('live', 'accepted')`,
  ).all<{ opportunity_id: string; accepted_on: string | null; live_at: string | null }>()).results;
  const deliveredOn = new Map(delivered.map((row) => [row.opportunity_id, row.live_at ? vnDate(row.live_at) : row.accepted_on]));
  const byOpp = new Map<string, LedgerEntry[]>();
  for (const entry of ledger) byOpp.set(entry.opportunity_id, [...(byOpp.get(entry.opportunity_id) ?? []), entry]);
  const people = [...new Set(deals.flatMap((deal) => [deal.seller_id, deal.referrer_id]).concat(terms.map((row) => row.user_id)).filter((id): id is string => !!id && !id.includes(":")))];
  const users = await emdashUsers(contentDb, people);
  const adminIds = new Set([...users.values()].filter((user) => user.role === 50).map((user) => user.id));
  const all = computeCommission(versions, deals.map((deal) => ({ ...deal, ledger: byOpp.get(deal.id) ?? [], delivered_on: deliveredOn.get(deal.id) ?? null })), typeResolver(terms, adminIds));
  const approved = versions.some((item) => item.body.status === "approved");
  // Only Admin and Finance see everyone's figures; Sales Managers see their own like any seller.
  const seesAll = actor.configure || actor.finance;
  // Collaborators see their own lines only once an approved policy exists.
  const visible = seesAll || approved;
  const lines = seesAll ? all : approved ? all.filter((line) => line.user_id === actor.id && !line.simulated) : [];
  const payouts = (await db.prepare(`SELECT * FROM crm_commission_payouts ${seesAll ? "" : "WHERE user_id = ?"} ORDER BY period DESC, created_at DESC LIMIT 500`).bind(...(seesAll ? [] : [actor.id])).all<PayoutRow>()).results;
  const names = Object.fromEntries([...users.values()].map((user) => [user.id, user.name || user.email]));
  return { versions, lines, people: summarizeByPerson(lines, payouts), terms: seesAll ? terms : terms.filter((row) => row.user_id === actor.id), payouts, names, visible };
}

export async function saveSellerTerms(db: D1Database, contentDb: D1Database, actor: CrmActor, form: FormData): Promise<void> {
  if (!actor.configure) throw new ForbiddenError();
  const errors = new Errors();
  const userId = errors.text(form, "user_id", 128, true);
  const type = errors.text(form, "seller_type", 20, true) as SellerType;
  const effectiveFrom = errors.text(form, "effective_from", 10, true);
  const note = errors.text(form, "note", 500);
  if (!sellerTypes.includes(type)) errors.add("seller_type", "invalid");
  if (effectiveFrom && !isIsoDate(effectiveFrom)) errors.add("effective_from", "invalid");
  errors.throwIfAny();
  if (!(await emdashUsers(contentDb, [userId])).has(userId)) fail("user_id", "invalid");
  const id = newId("trm");
  await once(db, actor, requestKey(form), "seller_terms", id, [
    db.prepare("INSERT INTO crm_seller_terms (id, user_id, seller_type, effective_from, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, userId, type, effectiveFrom, note, actor.id, nowIso()),
    eventStatement(db, actor, "seller_terms", { user_id: userId, seller_type: type, effective_from: effectiveFrom }, {}),
  ]);
}

/** Admin-only: who referred this deal (attribution for referral commission). */
export async function setReferrer(db: D1Database, contentDb: D1Database, actor: CrmActor, opportunity: Opportunity, form: FormData): Promise<void> {
  if (!actor.configure) throw new ForbiddenError();
  const version = Number(form.get("version"));
  const referrer = typeof form.get("referrer_id") === "string" ? String(form.get("referrer_id")) : "";
  if (!Number.isSafeInteger(version) || version < 1) fail("version", "invalid");
  if (referrer && !(await emdashUsers(contentDb, [referrer])).has(referrer)) fail("referrer_id", "invalid");
  const guard = { sql: "EXISTS (SELECT 1 FROM crm_opportunities WHERE id = ? AND version = ?)", args: [opportunity.id, version] };
  const result = await onceGuarded(db, actor, requestKey(form), "referrer", opportunity.id, guard, [
    eventStatement(db, actor, "referrer_set", { from: opportunity.referrer_id, to: referrer || null }, { opportunityId: opportunity.id, accountId: opportunity.account_id }, guard),
    db.prepare("UPDATE crm_opportunities SET referrer_id = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?").bind(referrer || null, nowIso(), opportunity.id, version),
  ]);
  if (!result.changed) throw new ConflictError();
}

/** Admin-only: a new policy version. Approving is an explicit status on the new version. */
export async function savePolicyVersion(db: D1Database, actor: CrmActor, form: FormData): Promise<void> {
  if (!actor.configure) throw new ForbiddenError();
  const versions = await policyVersions(db);
  const current = versions[0];
  if (!current) fail("policy", "missing");
  const errors = new Errors();
  const status = errors.text(form, "status", 10, true);
  const effectiveFrom = errors.text(form, "effective_from", 10, true);
  const sourceRef = errors.text(form, "source_ref", 300, true);
  const retention = Number(errors.text(form, "retention_days", 3, true));
  const inbound = Number(errors.text(form, "inbound_pct", 3, true));
  if (!["proposed", "approved"].includes(status)) errors.add("status", "invalid");
  if (effectiveFrom && !isIsoDate(effectiveFrom)) errors.add("effective_from", "invalid");
  if (!Number.isInteger(retention) || retention < 0 || retention > 365) errors.add("retention_days", "invalid");
  if (!Number.isInteger(inbound) || inbound < 0 || inbound > 100) errors.add("inbound_pct", "invalid");
  const rates = {} as CommissionPolicy["rates"];
  for (const type of ["partner_seller", "partner_referral", "employee"] as const) {
    rates[type] = {} as CommissionPolicy["rates"][typeof type];
    for (const key of rateKeys) {
      const name = `rate.${type}.${key}`;
      const raw = errors.text(form, name, 20, true);
      const value = key === "renewal_pct" ? Number(raw) : parseVnd(raw);
      if (value === undefined || value === null || !Number.isFinite(value) || value < 0 || (key === "renewal_pct" ? value > 50 : value > 5_000_000)) errors.add(name, "invalid");
      else rates[type][key] = value;
    }
  }
  errors.throwIfAny();
  const body: CommissionPolicy = {
    ...current!.body, status: status as CommissionPolicy["status"], retention_days: retention, inbound_pct: inbound, rates,
    ...(status === "approved" ? { approved_by: actor.id, approved_at: nowIso() } : { approved_by: undefined, approved_at: undefined }),
  };
  const version = current!.version + 1;
  await once(db, actor, requestKey(form), "commission_policy", `${POLICY_KEY}@${version}`, [
    db.prepare("INSERT INTO crm_policies (id, policy_key, version, body, source_ref, effective_from, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(`${POLICY_KEY}@${version}`, POLICY_KEY, version, JSON.stringify(body), sourceRef, effectiveFrom, actor.id, nowIso()),
    eventStatement(db, actor, "commission_policy", { version, status }, {}),
  ]);
}

/** Finance records money already paid (or recovered, negative) outside the CRM. */
export async function recordPayout(db: D1Database, actor: CrmActor, form: FormData): Promise<void> {
  if (!actor.finance) throw new ForbiddenError();
  const approved = (await policyVersions(db)).find((item) => item.body.status === "approved");
  if (!approved) throw new ValidationError({ policy: "not_approved" });
  const errors = new Errors();
  const userId = errors.text(form, "user_id", 128, true);
  const period = errors.text(form, "period", 7, true);
  const raw = errors.text(form, "amount_vnd", 20, true);
  const evidence = errors.text(form, "evidence", 500, true);
  const note = errors.text(form, "note", 500);
  if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) errors.add("period", "invalid");
  const negative = raw.trim().startsWith("-");
  const magnitude = parseVnd(raw.replace(/^-/, ""));
  if (!magnitude) errors.add("amount_vnd", "invalid");
  errors.throwIfAny();
  if (userId === actor.id && !actor.configure) throw new ForbiddenError();
  const id = newId("pay");
  const amount = negative ? -magnitude! : magnitude!;
  await once(db, actor, requestKey(form), "commission_payout", id, [
    db.prepare("INSERT INTO crm_commission_payouts (id, user_id, period, amount_vnd, policy_id, evidence, note, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, userId, period, amount, approved.id, evidence, note, actor.id, nowIso()),
    eventStatement(db, actor, "commission_payout", { user_id: userId, period, amount_vnd: amount }, {}),
  ]);
}
