import assert from "node:assert/strict";
import { test } from "node:test";
import { type EvidenceInput, type Motion, computeEvidence, motionOf } from "../src/lib/crm/business-evidence.ts";
import type { LedgerEntry } from "../src/lib/crm/money.ts";

const offerMotion = new Map<string, Motion>([["local-starter", "local"], ["local-trust-kit", "local"], ["local-renewal-domain", "local"], ["lumi-solution", "solutions"]]);
const deal = (id: string, account: string, playbook: string, offer: string | null, extra: Partial<EvidenceInput["deals"][number]> = {}) => ({
  id, account_id: account, playbook_key: playbook, offer_key: offer, relation: "new", source_channel: "field_visit", outcome: "won", created_at: `2026-10-0${id.length}T00:00:00Z`, ...extra,
});
let n = 0;
const entry = (opportunity: string, kind: LedgerEntry["kind"], amount: number, status: LedgerEntry["status"] = "confirmed", extra: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: `l${++n}`, opportunity_id: opportunity, kind, amount_vnd: amount, status, occurred_on: "2026-10-10", target_entry_id: null, quote_id: null, ...extra,
});

function fixture(): EvidenceInput {
  return {
    offerMotion: new Map(offerMotion),
    deals: [
      deal("a", "A", "local-preview", "local-starter", { source_channel: "referral" }),
      deal("a2", "A", "local-renewal", "local-renewal-domain", { relation: "renewal", source_channel: "existing_customer" }),
      deal("b", "B", "local-preview", "local-trust-kit"),
      deal("c", "C", "local-preview", "local-starter", { outcome: "open" }),
      deal("d", "D", "local-preview", null, { outcome: "lost" }),
      deal("s", "S", "lumi-solution", "lumi-solution", { source_channel: "email" }),
      deal("x", "X", "legacy", null, { outcome: "won" }),
      deal("y", "Y", "legacy", "lumi-solution", { source_channel: "phone" }),
    ],
    ledger: [
      entry("a", "receivable", 1_990_000), entry("a", "payment", 1_990_000, "confirmed", { occurred_on: "2026-10-12" }),
      entry("a2", "receivable", 999_000), entry("a2", "payment", 999_000),
      entry("b", "receivable", 399_000), entry("b", "payment", 399_000, "pending"),
      entry("c", "receivable", 1_990_000), entry("c", "payment", 500_000),
      entry("s", "receivable", 9_900_000), entry("s", "payment", 4_950_000), entry("s", "refund", 4_950_000),
      entry("x", "payment", 300_000),
      entry("y", "receivable", 19_800_000), entry("y", "payment", 9_900_000),
    ],
    fulfillments: [{ opportunity_id: "a", kind: "local_site", status: "live" }, { opportunity_id: "c", kind: "local_site", status: "in_progress" }, { opportunity_id: "y", kind: "solution_delivery", status: "delivered" }],
    costs: [
      { opportunity_id: "a", playbook_key: "local-preview", category: "preview", basis: "actual", minutes: 5, amount_vnd: 10_000 },
      { opportunity_id: null, playbook_key: "local-preview", category: "travel", basis: "actual", minutes: null, amount_vnd: 200_000 },
      { opportunity_id: "a", playbook_key: "local-preview", category: "printing", basis: "actual", minutes: null, amount_vnd: 150_000 },
      { opportunity_id: "a", playbook_key: "local-preview", category: "support", basis: "estimate", minutes: 60, amount_vnd: 100_000 },
      { opportunity_id: "c", playbook_key: "local-preview", category: "sales", basis: "actual", minutes: 45, amount_vnd: null },
      { opportunity_id: "s", playbook_key: "lumi-solution", category: "research", basis: "actual", minutes: null, amount_vnd: 700_000 },
    ],
  };
}

test("business evidence: only Finance-confirmed cash kept makes a paying customer", () => {
  const { byMotion } = computeEvidence(fixture());
  const local = byMotion.local;
  // A paid Starter and a renewal (one business); B's payment is still pending; C paid part.
  assert.equal(local.payingCustomers, 2, "A and the partly paid C; pending B does not count");
  assert.equal(local.netCash, 1_990_000 + 999_000 + 500_000);
  assert.equal(local.awaitingConfirmation, 399_000);
  assert.equal(local.renewedCustomers, 1);
  assert.equal(local.latestPayment, "2026-10-12");
  assert.deepEqual(local.acceptedUnpaid, { deals: 2, outstanding: 399_000 + 1_490_000 }, "accepted is not paid");
  assert.deepEqual(local.offers.map((row) => [row.offer_key, row.customers, row.net]), [["local-starter", 2, 2_490_000], ["local-renewal-domain", 1, 999_000]]);
  assert.deepEqual(local.deals, { total: 5, open: 1, won: 3, lost: 1 });
  assert.equal(local.delivered, 1);
});

test("business evidence: a full refund removes the customer; legacy deals follow their accepted offer", () => {
  const { byMotion, unclassified } = computeEvidence(fixture());
  const solutions = byMotion.solutions;
  assert.equal(solutions.payingCustomers, 1, "S was refunded in full; legacy Y paid for lumi-solution");
  assert.equal(solutions.netCash, 9_900_000);
  assert.equal(solutions.delivered, 1);
  assert.deepEqual(solutions.channels, [{ channel: "phone", customers: 1 }]);
  assert.deepEqual(unclassified, { deals: 1, netCash: 300_000 }, "a legacy deal without an offer is shown, not dropped");
});

test("business evidence: channels use each business's first paid, non-renewal deal", () => {
  const { byMotion } = computeEvidence(fixture());
  assert.deepEqual(byMotion.local.channels, [{ channel: "field_visit", customers: 1 }, { channel: "referral", customers: 1 }]);
});

test("business evidence: uncosted minutes and estimates never reduce recorded cost", () => {
  const { byMotion } = computeEvidence(fixture());
  const { costs } = byMotion.local;
  assert.equal(costs.acquisition, 10_000 + 200_000, "cohort-level travel follows the cohort's playbook");
  assert.equal(costs.delivery, 150_000);
  assert.equal(costs.estimates, 100_000);
  assert.equal(costs.uncostedEntries, 1);
  assert.equal(byMotion.local.cashAfterRecordedCosts, 3_489_000 - 360_000);
  assert.equal(byMotion.solutions.costs.acquisition, 700_000);
});

test("business evidence: empty CRM reports zeros, never invented figures", () => {
  const { byMotion, unclassified } = computeEvidence({ deals: [], ledger: [], fulfillments: [], costs: [], offerMotion: new Map() });
  for (const evidence of Object.values(byMotion)) {
    assert.equal(evidence.payingCustomers, 0);
    assert.equal(evidence.latestPayment, null);
    assert.deepEqual(evidence.offers, []);
  }
  assert.deepEqual(unclassified, { deals: 0, netCash: 0 });
});

test("business evidence: motion comes from the playbook, then the accepted offer", () => {
  assert.equal(motionOf({ playbook_key: "local-renewal", offer_key: null }, new Map()), "local");
  assert.equal(motionOf({ playbook_key: "lumi-solution", offer_key: "local-starter" }, new Map([["local-starter", "local"]])), "solutions");
  assert.equal(motionOf({ playbook_key: "legacy", offer_key: "unknown-offer" }, new Map()), null);
});
