import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { type LedgerEntry, addDays, decideCredit, effectiveEntries, parseVnd, paymentState, refundableAmount, summarizeLedger, vnDate } from "../src/lib/crm/money.ts";
import { checkTransition, parseFieldValue, validatePlaybook, visibleFields, type PlaybookDef } from "../src/lib/crm/playbook.ts";
import { lumiSolution, localPreview, localRenewal, legacy, seedOffers, seedPlaybooks } from "../src/lib/crm/seed.ts";
import { computeCohort, median, milestoneRows, percentile, type CohortInput } from "../src/lib/crm/reports.ts";
import { hmacHex, parseIntakePayload, verifyIntake } from "../src/lib/crm/intake.ts";
import { alternateUrl } from "../src/lib/crm/i18n.ts";
import { normalizePhone } from "../src/lib/crm/core.ts";

const entry = (id: string, kind: LedgerEntry["kind"], amount: number, extra: Partial<LedgerEntry> = {}): LedgerEntry =>
  ({ id, opportunity_id: "opp", kind, amount_vnd: amount, status: "confirmed", occurred_on: "2026-10-01", target_entry_id: null, quote_id: null, ...extra });

test("ledger: Trust Kit 399k + upgrade 1.591k = 1.990k collected, never 2.389k", () => {
  const trust = [entry("r1", "receivable", 399000), entry("p1", "payment", 399000)];
  const starter = [entry("r2", "receivable", 1990000), entry("c2", "credit", 399000, { target_entry_id: "p1" }), entry("p2", "payment", 1591000)];
  const total = summarizeLedger([...trust, ...starter]);
  assert.equal(total.collected, 1990000);
  assert.equal(summarizeLedger(starter).due, 1591000);
  assert.equal(paymentState(summarizeLedger(starter)), "paid");
  assert.equal(paymentState(summarizeLedger([entry("r", "receivable", 1990000)])), "unpaid");
});

test("ledger: pending and rejected payments do not count; voids cancel without deleting", () => {
  const rows = [entry("r", "receivable", 1000), entry("p", "payment", 1000, { status: "pending" }), entry("x", "payment", 500, { status: "rejected" })];
  assert.equal(summarizeLedger(rows).collected, 0);
  assert.equal(summarizeLedger(rows).pendingPayments, 1000);
  const voided = [entry("r", "receivable", 1000), entry("p", "payment", 1000), entry("v", "void", 0, { target_entry_id: "p" })];
  assert.equal(effectiveEntries(voided).length, 1);
  assert.equal(summarizeLedger(voided).collected, 0);
});

test("ledger: refunds are bounded by what remains of a payment", () => {
  const rows = [entry("p", "payment", 1990000), entry("f", "refund", 190000, { target_entry_id: "p" })];
  assert.equal(refundableAmount(rows, "p"), 1800000);
  assert.equal(summarizeLedger(rows).net, 1800000);
  assert.equal(paymentState(summarizeLedger([entry("p", "payment", 399000), entry("f", "refund", 399000, { target_entry_id: "p" })])), "refunded");
});

test("credit: window opens on the payment date and includes day 30", () => {
  const rule = { from_offer: "local-trust-kit", window_days: 30, amount: "full_paid" as const };
  const paid = entry("p1", "payment", 399000, { occurred_on: "2026-09-01" });
  const sources = [{ entry: paid, offerKey: "local-trust-kit", listPrice: 399000 }];
  assert.equal(addDays("2026-09-01", 30), "2026-10-01");
  const onDay30 = decideCredit(rule, sources, [paid], new Set(), "2026-10-01");
  assert.ok(onDay30.eligible && onDay30.amount === 399000 && onDay30.expiresOn === "2026-10-01");
  assert.deepEqual(decideCredit(rule, sources, [paid], new Set(), "2026-10-02"), { eligible: false, reason: "expired", sourceEntryId: "p1", expiresOn: "2026-10-01" });
  assert.equal(decideCredit(rule, sources, [paid], new Set(["p1"]), "2026-09-10").eligible, false, "a source credits once");
  const refunded = [paid, entry("f", "refund", 399000, { target_entry_id: "p1" })];
  assert.equal(decideCredit(rule, sources, refunded, new Set(), "2026-09-10").eligible, false, "refunded Trust Kit earns no credit");
  const voidedSource = [paid, entry("v", "void", 0, { target_entry_id: "p1" })];
  assert.equal(decideCredit(rule, sources, voidedSource, new Set(), "2026-09-10").eligible, false);
  assert.equal(decideCredit(rule, [], [], new Set(), "2026-09-10").eligible, false);
});

test("dates use Asia/Ho_Chi_Minh calendar days", () => {
  assert.equal(vnDate("2026-10-06T17:30:00Z"), "2026-10-07");
  assert.equal(vnDate("2026-10-06T16:59:59Z"), "2026-10-06");
  assert.equal(parseVnd("1.591.000"), 1591000);
  assert.equal(parseVnd("", { allowEmpty: true }), null, "blank stays unknown, not zero");
  assert.equal(parseVnd("12a"), undefined);
});

test("seeded playbooks and offers validate and match the migration", () => {
  const offers = new Set(seedOffers.map((offer) => offer.key));
  for (const playbook of seedPlaybooks) assert.deepEqual(validatePlaybook(playbook.def, offers), [], playbook.key);
  const sql = readFileSync(new URL("../migrations/0003_crm_sales.sql", import.meta.url), "utf8");
  for (const playbook of seedPlaybooks) assert.ok(sql.includes(JSON.stringify(playbook.def).replaceAll("'", "''")), `${playbook.key} seed is in sync; run scripts/crm-seed-sql.mjs --write`);
  for (const offer of seedOffers) assert.ok(sql.includes(`'${offer.key}@1', '${offer.key}', 1`), offer.key);
  const price = (key: string) => seedOffers.find((offer) => offer.key === key)!.list_price_vnd;
  assert.deepEqual([price("local-trust-kit"), price("local-starter"), price("local-renewal-subdomain"), price("local-renewal-domain"), price("lumi-solution")], [399000, 1990000, 599000, 999000, null]);
});

test("playbook validation rejects unsafe or broken definitions", () => {
  const offers = new Set(["x"]);
  const base: PlaybookDef = { stages: [{ id: "new", en: "New", vi: "Mới", outcome: "open" }, { id: "won", en: "Won", vi: "Thắng", outcome: "won" }, { id: "lost", en: "Lost", vi: "Thua", outcome: "lost" }], fields: [], checklist: [], offers: [] };
  assert.deepEqual(validatePlaybook(base, offers), []);
  assert.match(validatePlaybook({ ...base, stages: base.stages.slice(0, 2) }, offers).join(), /lost stage/);
  assert.match(validatePlaybook({ ...base, stages: [...base.stages, { id: "Bad Id; DROP", en: "x", vi: "x", outcome: "open" }] }, offers).join(), /id must be/);
  assert.match(validatePlaybook({ ...base, fields: [{ key: "f", en: "x", vi: "x", type: "script" as never, stage: "new" }] }, offers).join(), /invalid key|unsupported type/);
  assert.match(validatePlaybook({ ...base, stages: [{ ...base.stages[0], requires: ["nope"] }, ...base.stages.slice(1)] }, offers).join(), /requirement "nope"/);
  assert.match(validatePlaybook({ ...base, offers: ["missing"] }, offers).join(), /offer "missing"/);
});

test("transitions: requirements, skippable steps with reasons, no skipping required stages", () => {
  const empty = { fields: {}, checks: {}, acceptedQuote: false, primaryContact: false, nextStep: false };
  assert.deepEqual(checkTransition(localPreview, "new", "qualified", empty).missing, ["industry", "location", "presence_checked"]);
  const ready = { ...empty, fields: { owner_feedback: "ok" }, nextStep: true };
  const skip = checkTransition(localPreview, "owner_talked", "deciding", ready);
  assert.ok(skip.ok && skip.needsReason && skip.skipped[0] === "preview_shown");
  assert.ok(!checkTransition(localPreview, "new", "deciding", ready).ok, "cannot jump over required stages");
  assert.ok(!checkTransition(localPreview, "deciding", "accepted", { ...ready, fields: { offer_choice: "starter" } }).ok, "won needs an accepted quote");
  assert.ok(checkTransition(localPreview, "deciding", "not_fit", empty).needsReason);
  const reopen = checkTransition(localPreview, "not_fit", "accepted", { ...ready, fields: { offer_choice: "starter" } });
  assert.ok(!reopen.ok && reopen.missing.includes("accepted_quote"), "reopening into won still needs an accepted quote");
  assert.ok(checkTransition(localPreview, "not_fit", "deciding", ready).needsReason, "reopening records why");
  assert.ok(!checkTransition(lumiSolution, "on_hold", "proposal", empty).ok, "leaving on-hold meets the target's requirements");
  const pilotSkip = checkTransition(lumiSolution, "demo", "proposal", { ...empty, fields: { capabilities_confirmed: "yes" }, nextStep: true });
  assert.deepEqual(pilotSkip.skipped, ["pilot"]);
  assert.equal(parseFieldValue({ key: "x", en: "", vi: "", type: "yes_no", stage: "new" }, "maybe"), null);
  assert.equal(parseFieldValue({ key: "x", en: "", vi: "", type: "url", stage: "new" }, "javascript:alert(1)"), null);
  assert.ok(visibleFields(localPreview, "owner_talked").some((field) => field.key === "owner_feedback"), "fields for the stage after a skippable one are reachable");
  assert.ok(!visibleFields(localPreview, "new").some((field) => field.key === "friction"), "discovery fields wait for their stage");
  assert.ok(localRenewal.stages.some((stage) => stage.id === "not_renewing") && legacy.offers.length === 0);
});

const policy = { cohort_size: 30, continue: { min_paid_businesses: 6, min_paid_starters: 2, max_avg_preview_minutes: 5, manual_google_management_allowed: false }, scale: { max_cac_vnd: 600000, max_median_fulfillment_minutes: 120, max_p90_fulfillment_minutes: 240, requires_positive_contribution: true, unknown_costs_fail: true }, review_trigger: { zero_starters_after_owner_conversations: 20 }, credit_window_days: 30 };

function cohortFixture(): CohortInput {
  // Synthetic cohort: A direct Starter, B Trust Kit → Starter, C Trust-only (credit still open), D conversation only, E refunded Trust Kit.
  const opp = (id: string, account: string, offer: string | null, relation = "new") => ({ id, account_id: account, relation, outcome: offer ? "won" : "open", fields: {}, offer_key: offer });
  const ledger: LedgerEntry[] = [
    entry("ra", "receivable", 1990000, { opportunity_id: "a" }), entry("pa", "payment", 1990000, { opportunity_id: "a" }),
    entry("rb1", "receivable", 399000, { opportunity_id: "b1" }), entry("pb1", "payment", 399000, { opportunity_id: "b1", occurred_on: "2026-09-20" }),
    entry("rb2", "receivable", 1990000, { opportunity_id: "b2" }), entry("cb2", "credit", 399000, { opportunity_id: "b2", target_entry_id: "pb1" }), entry("pb2", "payment", 1591000, { opportunity_id: "b2" }),
    entry("rc", "receivable", 399000, { opportunity_id: "c" }), entry("pc", "payment", 399000, { opportunity_id: "c", occurred_on: "2026-10-01" }),
    entry("re", "receivable", 399000, { opportunity_id: "e" }), entry("pe", "payment", 399000, { opportunity_id: "e" }), entry("fe", "refund", 399000, { opportunity_id: "e", target_entry_id: "pe" }),
  ];
  return {
    opportunities: [opp("a", "A", "local-starter"), opp("b1", "B", "local-trust-kit"), opp("b2", "B", "local-starter", "upgrade"), opp("c", "C", "local-trust-kit"), opp("d", "D", null), opp("e", "E", "local-trust-kit")],
    milestones: ["A", "B", "C", "D", "E"].flatMap((account) => [{ account_id: account, milestone: "conversation" as const }, ...(account !== "D" ? [{ account_id: account, milestone: "preview_shown" as const }] : [])]),
    tasks: [{ opportunity_id: "a", kind: "meeting", meeting_confirmed: 1, outcome: "held" }, { opportunity_id: "d", kind: "meeting", meeting_confirmed: 1, outcome: "no_show" }, { opportunity_id: "c", kind: "meeting", meeting_confirmed: 0, outcome: "" }],
    ledger,
    costs: [
      ...["A", "B", "C", "E"].map((account) => ({ opportunity_id: null, account_id: account, category: "preview", basis: "actual", minutes: 4, amount_vnd: 20000 })),
      { opportunity_id: "a", account_id: "A", category: "delivery", basis: "actual", minutes: 90, amount_vnd: 150000 },
      { opportunity_id: "b2", account_id: "B", category: "delivery", basis: "actual", minutes: 150, amount_vnd: 250000 },
      { opportunity_id: null, account_id: null, category: "travel", basis: "actual", minutes: 120, amount_vnd: 200000 },
      { opportunity_id: null, account_id: null, category: "support", basis: "estimate", minutes: null, amount_vnd: 300000 },
    ],
    costingComplete: true, policy, starterKey: "local-starter", trustKey: "local-trust-kit", today: "2026-10-07", startsOn: "2026-09-15", endsOn: null,
  };
}

test("cohort report: counts once per business, separates trust-only, upgrades, refunds and meetings", () => {
  const report = computeCohort(cohortFixture());
  assert.deepEqual(report.funnel, { unique_businesses: 5, qualified: 0, owner_conversations: 5, previews_shown: 4 });
  assert.deepEqual(report.paid, { businesses: 3, starters: 2, starter_direct: 1, upgrades: 1, trust_only: 1 }, "refunded E is not paid; B upgrade counts once");
  assert.deepEqual(report.meetings, { confirmed: 2, held: 1, no_show: 1 });
  assert.equal(report.money.collected, 1990000 + 399000 + 1591000 + 399000 + 399000);
  assert.equal(report.money.refunded, 399000);
  assert.equal(report.money.net, 4379000);
  assert.equal(report.window.open_credit_windows, 1, "C paid on 2026-10-01 is still inside the window");
  assert.deepEqual(report.conversion, { starters_per_100_conversations: 40, numerator: 2, denominator: 5 });
  assert.equal(report.labour.avg_preview_minutes, 4);
  // Acquisition = 4×20k preview + 200k travel = 280k; delivery = 400k actual.
  assert.equal(report.costs.acquisition, 280000);
  assert.equal(report.contribution.realised, 4379000 - 280000 - 400000);
  assert.equal(report.contribution.after_reserve, 4379000 - 280000 - 400000 - 300000);
  assert.equal(report.cac, 140000);
  assert.deepEqual(report.fulfillment_minutes, { median: 120, p90: 150, sample: 2 });
  assert.equal(report.gates.continue.paid_starters, "met");
  assert.equal(report.gates.continue.paid_businesses, "unknown", "3 of 6 with an incomplete sample is not yet a failure");
  assert.equal(report.gates.scale.cac, "met");
});

test("cohort report: unknown costing never shows as a positive contribution or 0đ CAC", () => {
  const fixture = cohortFixture();
  const incomplete = computeCohort({ ...fixture, costingComplete: false });
  assert.equal(incomplete.contribution.realised, null);
  assert.equal(incomplete.cac, null);
  assert.equal(incomplete.gates.scale.contribution, "not_met", "unknown costs fail the scale gate");
  const uncosted = computeCohort({ ...fixture, costs: [...fixture.costs, { opportunity_id: "a", account_id: "A", category: "sales", basis: "actual", minutes: 30, amount_vnd: null }] });
  assert.equal(uncosted.contribution.realised, null);
  const noStarters = computeCohort({ ...fixture, opportunities: fixture.opportunities.filter((opp) => opp.offer_key !== "local-starter"), ledger: fixture.ledger.filter((row) => !["a", "b2"].includes(row.opportunity_id)) });
  assert.equal(noStarters.cac, null, "no Starter means CAC is undefined, not 0");
  assert.equal(noStarters.conversion.starters_per_100_conversations, 0);
  const noConversations = computeCohort({ ...fixture, milestones: [] });
  assert.equal(noConversations.conversion.starters_per_100_conversations, null);
  assert.equal(computeCohort({ ...fixture, milestones: fixture.milestones.filter((row) => row.milestone !== "preview_shown") }).labour.avg_preview_minutes, null);
});

test("milestones: skipped optional stages are not counted as reached", () => {
  const defs = new Map([["local-preview@1", localPreview]]);
  const rows = milestoneRows([{ account_id: "X", to_stage: "deciding", playbook_id: "local-preview@1" }], defs);
  assert.deepEqual(rows.map((row) => row.milestone).sort(), ["conversation", "qualified"]);
  assert.deepEqual(milestoneRows([{ account_id: "X", to_stage: "not_fit", playbook_id: "local-preview@1" }], defs), []);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 90), 90);
});

test("intake: signature, source allowlist, freshness and context validation", async () => {
  const secret = "s".repeat(40);
  const body = JSON.stringify({ name: "TEST", business: "TEST Co", phone: "0903 000 003", locale: "vi", consent: true });
  const now = 1_790_000_000_000;
  const request = async (headers: Record<string, string>, text = body) => new Request("https://runlumi.app/api/intake/local", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: text });
  const sign = async (ts: number, idem: string, text = body) => `v1=${await hmacHex(secret, `${ts}.${idem}.${text}`)}`;
  const ts = Math.floor(now / 1000);
  const good = { "x-lumi-source": "local.runlumi.app", "x-lumi-timestamp": String(ts), "idempotency-key": "enq_0123456789abcdef", "x-lumi-signature": await sign(ts, "enq_0123456789abcdef") };
  assert.equal((await verifyIntake(await request(good), secret, now)).ok, true);
  assert.deepEqual(await verifyIntake(await request(good), undefined, now), { ok: false, status: 503, error: "unavailable" });
  assert.equal((await verifyIntake(await request({ ...good, "x-lumi-source": "evil" }), secret, now) as { status: number }).status, 403);
  assert.equal((await verifyIntake(await request(good, body.replace("TEST Co", "Other")), secret, now) as { status: number }).status, 401, "tampered body");
  assert.equal((await verifyIntake(await request(good), secret, now + 301_000) as { status: number }).status, 401, "stale");
  assert.ok(parseIntakePayload({ name: "a", business: "b", phone: "0903000003", locale: "en", consent: true }));
  assert.equal(parseIntakePayload({ name: "a", business: "b", phone: "0903000003", locale: "en", consent: "yes" }), null, "consent must be explicit true");
  assert.equal(parseIntakePayload({ name: "a", business: "b", phone: "12", locale: "vi", consent: true }), null);
  assert.equal(parseIntakePayload({ name: "a", business: "b", phone: "0903000003", locale: "vi", consent: true, context: { page_slug: "qr", source: "/x/", cta_intent: "preview", offer_interest: "starter" } }), null, "intent must match the page");
});

test("locale switch keeps the same record and filters; phone normalization", () => {
  assert.equal(alternateUrl(new URL("https://runlumi.app/crm/opp_1?x=1#a")), "/vi/crm/opp_1?x=1");
  assert.equal(alternateUrl(new URL("https://runlumi.app/vi/crm/pipeline?playbook=local-preview&stage=new")), "/crm/pipeline?playbook=local-preview&stage=new");
  assert.equal(normalizePhone("+84 90 123 4567"), "0901234567");
  assert.equal(normalizePhone("090.123.4567"), "0901234567");
});
