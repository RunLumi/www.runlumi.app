import { test } from "node:test";
import assert from "node:assert/strict";
import { type CommissionDeal, type PolicyVersion, type SellerType, computeCommission, policyFor, summarizeByPerson } from "../src/lib/crm/commission.ts";
import type { LedgerEntry } from "../src/lib/crm/money.ts";
import { seedCommissionPolicy } from "../src/lib/crm/seed.ts";
import { readFileSync } from "node:fs";

const proposed: PolicyVersion = { id: "local-commission@1", version: 1, effective_from: "2026-10-07", source_ref: "test", body: structuredClone(seedCommissionPolicy.body) as PolicyVersion["body"] };
const approved: PolicyVersion = { ...proposed, id: "local-commission@2", version: 2, body: { ...proposed.body, status: "approved" } };
const entry = (opp: string, id: string, kind: LedgerEntry["kind"], amount: number, extra: Partial<LedgerEntry> = {}): LedgerEntry =>
  ({ id, opportunity_id: opp, kind, amount_vnd: amount, status: "confirmed", occurred_on: "2026-10-01", target_entry_id: null, quote_id: null, ...extra });
const deal = (id: string, offer: string, extra: Partial<CommissionDeal> = {}): CommissionDeal => {
  const price = offer === "local-trust-kit" ? 399000 : offer === "local-starter" ? 1990000 : 999000;
  return { id, title: id, relation: "new", root_channel: "field_visit", offer_key: offer, list_price: price, receivable: price, accepted_on: "2026-10-08",
    seller_id: "partner", referrer_id: null, delivered_on: "2026-10-10", ledger: [entry(id, `r-${id}`, "receivable", price), entry(id, `p-${id}`, "payment", price)], ...extra };
};
const types: Record<string, SellerType> = { partner: "partner_seller", referrer: "partner_referral", staff: "employee", founder: "none" };
const typeAt = (user: string) => types[user] ?? null;
const sum = (lines: ReturnType<typeof computeCommission>) => lines.reduce((total, line) => total + line.amount, 0);

test("the seeded proposal matches migration 0004 and is not approved", () => {
  assert.equal(seedCommissionPolicy.body.status, "proposed");
  const sql = readFileSync(new URL("../migrations/0004_crm_commission.sql", import.meta.url), "utf8");
  assert.ok(sql.includes(JSON.stringify(seedCommissionPolicy.body)), "run scripts/crm-seed-sql.mjs --write");
});

test("a business that becomes a Starter pays the same total by either path", () => {
  for (const [seller, expected] of [["partner", 400000], ["staff", 150000]] as const) {
    const direct = computeCommission([approved], [deal("d", "local-starter", { seller_id: seller })], typeAt, "2027-01-01");
    const upgrade = computeCommission([approved], [deal("t", "local-trust-kit", { seller_id: seller }), deal("u", "local-starter", {
      seller_id: seller, relation: "upgrade", ledger: [entry("u", "r", "receivable", 1990000), entry("u", "c", "credit", 399000, { target_entry_id: "p-t" }), entry("u", "p", "payment", 1591000)],
    })], typeAt, "2027-01-01");
    assert.equal(sum(direct), expected);
    assert.equal(sum(upgrade), expected, `${seller} via Trust Kit`);
  }
});

test("paid and delivered first; retained part only after the holdback", () => {
  const unpaid = computeCommission([approved], [deal("a", "local-starter", { ledger: [entry("a", "r", "receivable", 1990000), entry("a", "p", "payment", 1990000, { status: "pending" })] })], typeAt, "2027-01-01");
  assert.deepEqual(unpaid.map((line) => line.status), ["waiting", "waiting"], "a pending payment earns nothing");
  const undelivered = computeCommission([approved], [deal("b", "local-starter", { delivered_on: null })], typeAt, "2027-01-01");
  assert.deepEqual(undelivered.map((line) => line.status), ["waiting", "waiting"]);
  const day59 = computeCommission([approved], [deal("c", "local-starter")], typeAt, "2026-12-08");
  assert.deepEqual(day59.map((line) => [line.component, line.status, line.eligible_on]), [["starter_live", "earned", "2026-10-10"], ["starter_retained", "holdback", "2026-12-09"]]);
  assert.equal(computeCommission([approved], [deal("c", "local-starter")], typeAt, "2026-12-09")[1].status, "earned");
});

test("refunds forfeit, discounts scale, inbound leads earn half, renewals earn a share of cash", () => {
  const refunded = computeCommission([approved], [deal("r", "local-starter", { ledger: [entry("r", "x", "receivable", 1990000), entry("r", "p", "payment", 1990000), entry("r", "f", "refund", 190000, { target_entry_id: "p" })] })], typeAt, "2027-01-01");
  assert.ok(refunded.every((line) => line.status === "forfeited"));
  const discounted = computeCommission([approved], [deal("d", "local-starter", { receivable: 995000, ledger: [entry("d", "x", "receivable", 995000), entry("d", "p", "payment", 995000)] })], typeAt, "2027-01-01");
  assert.equal(sum(discounted), 200000);
  assert.equal(sum(computeCommission([approved], [deal("i", "local-starter", { root_channel: "inbound_web" })], typeAt, "2027-01-01")), 200000);
  assert.equal(sum(computeCommission([approved], [deal("n", "local-renewal-domain", { relation: "renewal", delivered_on: null })], typeAt, "2027-01-01")), 99900);
});

test("referrers earn the referral rate; founders and unset types are explicit", () => {
  const lines = computeCommission([approved], [deal("x", "local-starter", { referrer_id: "referrer" })], typeAt, "2027-01-01");
  assert.equal(sum(lines.filter((line) => line.role === "referrer")), 150000);
  assert.equal(sum(lines.filter((line) => line.role === "seller")), 400000);
  assert.equal(computeCommission([approved], [deal("y", "local-starter", { seller_id: "founder" })], typeAt).length, 0);
  assert.deepEqual(computeCommission([approved], [deal("z", "local-starter", { seller_id: "unknown" })], typeAt).map((line) => line.status), ["no_terms", "no_terms"]);
});

test("unapproved policy is only a simulation and never part of a payable balance", () => {
  assert.deepEqual(policyFor([proposed], "2026-10-08"), { policy: proposed, simulated: true });
  assert.equal(policyFor([proposed, approved], "2026-10-08")!.policy.id, approved.id);
  assert.equal(policyFor([{ ...approved, effective_from: "2026-11-01" }, proposed], "2026-10-08")!.simulated, true, "approval does not reach back before its effective date");
  const simulated = computeCommission([proposed], [deal("s", "local-starter")], typeAt, "2027-01-01");
  const people = summarizeByPerson(simulated, []);
  assert.deepEqual([people[0].earned, people[0].simulated, people[0].balance], [0, 400000, 0]);
  const real = summarizeByPerson(computeCommission([approved], [deal("s", "local-starter")], typeAt, "2027-01-01"), [{ user_id: "partner", amount_vnd: 450000 }]);
  assert.equal(real[0].balance, -50000, "overpaid shows as money to recover");
});
