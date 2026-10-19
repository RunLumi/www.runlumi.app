// End-to-end CRM flows against a local Worker + D1 with real EmDash sessions.
// Run: see docs/crm/README.md ("Integration run"). Each numbered block maps
// to an acceptance criterion in docs/crm/README.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminSession, idFrom, isoDaysAgo, jobs, key, oppVersion, q, signedIntake, userSession, version } from "./helpers.mjs";

const run = Date.now().toString(36);
// Unique synthetic numbers per run: do-not-contact marks from earlier runs must not collide.
const phone = () => `09${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`;
const phoneB = phone();
const S = {};
const ids = {};
const intakeSecret = process.env.CRM_INTAKE_SECRET ?? "local-test-secret-not-for-production-0123456789";

async function create(session, fields) {
  const response = await session.post("/crm/new", { intent: "create", source_channel: "field_visit", contact_role: "owner", contact_name: "TEST Contact", ...fields });
  assert.equal(response.status, 303, `create failed: ${response.status} ${response.html.slice(0, 300)}`);
  return idFrom(response.location);
}
async function act(session, id, fields, expected = 303) {
  const response = await session.post(`/crm/${id}`, fields);
  assert.equal(response.status, expected, `${fields.intent} on ${id}: expected ${expected}, got ${response.status} ${[...response.html.matchAll(/class="crm-error"[^>]*>([^<]+)/g)].map((match) => match[1]).join(" | ")}`);
  return response;
}
async function fields(session, id, values) {
  return act(session, id, { intent: "fields", version: await oppVersion(session, id), ...Object.fromEntries(Object.entries(values).map(([name, value]) => [`field.${name}`, value])) });
}
async function stage(session, id, to, extra = {}, expected = 303) {
  return act(session, id, { intent: "stage", version: await oppVersion(session, id), to_stage: to, ...extra }, expected);
}
async function details(session, id, extra) {
  const page = await session.get(`/crm/${id}`);
  const title = /id="d-title"[^>]*value="([^"]*)"/.exec(page.html)?.[1] ?? "x";
  return act(session, id, { intent: "details", version: version(page.html), title, next_action: "Follow up", next_action_due: isoDaysAgo(-2), ...extra });
}
function offerId(keyName) { return jobs(`SELECT id FROM crm_offers WHERE offer_key = ${q(keyName)} ORDER BY version DESC LIMIT 1`)[0].id; }
async function quoteAndAccept(seller, id, offerKey, extra = {}) {
  await act(seller, id, { intent: "quote_create", offer_id: offerId(offerKey), ...extra });
  const quote = jobs(`SELECT id, price_vnd, credit_vnd FROM crm_quotes WHERE opportunity_id = ${q(id)} AND status = 'draft' ORDER BY created_at DESC LIMIT 1`)[0];
  const requestKey = key();
  await act(seller, id, { intent: "quote_accept", quote_id: quote.id, acceptance_evidence: "TEST owner confirmed by message", request_key: requestKey });
  return { ...quote, requestKey };
}
async function pay(session, id, amount, occurredOn = isoDaysAgo(0)) {
  return act(session, id, { intent: "payment", amount_vnd: amount, occurred_on: occurredOn, method: "bank_transfer", evidence: `TEST-REF-${key().slice(0, 8)}` });
}
function ledger(id) { return jobs(`SELECT kind, amount_vnd, status, target_entry_id FROM crm_ledger WHERE opportunity_id = ${q(id)} ORDER BY created_at`); }
async function walkLocal(session, id, { skipPreview = false } = {}) {
  await fields(session, id, { industry: "Garage", location: "Bình Thạnh" });
  await act(session, id, { intent: "fields", version: await oppVersion(session, id), checks_present: "1", "check.presence_checked": "1" });
  await stage(session, id, "qualified");
  await fields(session, id, { owner_contact_basis: "TEST met owner at the shop", friction: "TEST customers cannot find service prices" });
  await stage(session, id, "owner_talked");
  if (!skipPreview) {
    await fields(session, id, { preview_private: "yes", preview_version: "v1", preview_sources: "TEST owner-confirmed facts" });
    await stage(session, id, "preview_shown");
    await fields(session, id, { owner_feedback: "TEST likes the call button" });
    await details(session, id, {});
    await stage(session, id, "deciding");
  } else {
    await fields(session, id, { owner_feedback: "TEST decided at the first visit" });
    await details(session, id, {});
    await stage(session, id, "deciding", { reason: "TEST owner decided without a preview" });
  }
}

test("setup: real EmDash sessions and CRM membership", async () => {
  S.admin = await adminSession();
  S.a = await userSession(S.admin, { email: `test-a-${run}@example.test`, name: `TEST Seller A ${run}` });
  S.b = await userSession(S.admin, { email: `test-b-${run}@example.test`, name: `TEST Seller B ${run}` });
  S.fin = await userSession(S.admin, { email: `test-fin-${run}@example.test`, name: `TEST Finance ${run}`, role: 20 });
  S.ful = await userSession(S.admin, { email: `test-ful-${run}@example.test`, name: `TEST Fulfillment ${run}`, role: 20 });
  S.outsider = await userSession(S.admin, { email: `test-out-${run}@example.test`, name: `TEST Outsider ${run}` });
  assert.equal((await S.a.get("/crm")).status, 403, "EmDash login alone grants no CRM access");
  for (const [session, roles] of [[S.a, ["sales_executive"]], [S.b, ["sales_executive"]], [S.fin, ["finance"]], [S.ful, ["fulfillment"]]]) {
    const response = await S.admin.post("/workspace/users", { intent: "grant", email: session.email, roles });
    assert.equal(response.status, 303, `grant ${session.name}`);
  }
  for (const session of [S.a, S.b, S.fin, S.ful]) assert.equal((await session.get("/crm")).status, 200, `${session.name} can open the CRM`);
  assert.equal((await S.outsider.get("/crm")).status, 403);
  assert.equal((await S.a.get("/admin/jobs")).status, 403, "CRM members get no ATS access");
  assert.equal((await S.fin.get("/admin/jobs")).status, 403, "finance capability grants no ATS access");
});

test("1. create form: minimal fields, field errors keep input, no-store headers", async () => {
  const bad = await S.a.post("/crm/new", { intent: "create", playbook_key: "local-preview", source_channel: "field_visit", account_name: "", contact_name: "TEST Kept Name", phone: "12" });
  assert.equal(bad.status, 422);
  assert.match(bad.html, /value="TEST Kept Name"/, "typed values are kept");
  assert.match(bad.html, /aria-invalid="true"[^>]*name="account_name"|name="account_name"[^>]*aria-invalid="true"/);
  ids.local = await create(S.a, { playbook_key: "local-preview", account_name: `TEST Garage Direct ${run}`, contact_name: "TEST Owner One", phone: phone() });
  const page = await S.a.get(`/crm/${ids.local}`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("cache-control") ?? "", /no-store/);
  const crossSite = await S.a.post("/crm/new", { intent: "create", playbook_key: "local-preview", account_name: "TEST x" }, { origin: "https://evil.example" });
  assert.equal(crossSite.status, 400, "cross-origin form posts are rejected");
});

test("2. ownership: no cross-access through pages, actions, search, accounts or Today", async () => {
  ids.bOwn = await create(S.b, { playbook_key: "local-preview", account_name: `TEST Spa Of B ${run}`, contact_name: "TEST Owner B", phone: phoneB });
  assert.equal((await S.b.get(`/crm/${ids.local}`)).status, 404);
  assert.equal((await S.b.post(`/crm/${ids.local}`, { intent: "note", note: "TEST should fail" })).status, 404);
  const accountId = jobs(`SELECT account_id FROM crm_opportunities WHERE id = ${q(ids.local)}`)[0].account_id;
  assert.equal((await S.b.get(`/crm/accounts/${accountId}`)).status, 404);
  // The search box echoes the query, so check for the record link, not the text.
  const search = await S.b.get(`/crm/pipeline?playbook=all&q=${encodeURIComponent("Garage Direct")}`);
  assert.ok(!search.html.includes(ids.local), "search does not return A's record");
  assert.ok(!(await S.b.get("/crm")).html.includes(ids.local));
  assert.ok(!(await S.b.get("/crm/reports")).html.includes("Garage Direct"));
  assert.equal((await S.fin.get(`/crm/${ids.local}`)).status, 404, "finance sees records only once money is recorded");
  assert.equal((await S.a.get("/crm/admin")).status, 403);
  const assign = await S.a.post(`/crm/${ids.local}`, { intent: "assign", version: await oppVersion(S.a, ids.local), owner_id: S.b.id });
  assert.equal(assign.status, 403, "collaborators cannot reassign");
  const adminView = await S.admin.get(`/crm/${ids.local}`);
  assert.equal(adminView.status, 200);
});

test("3. Starter sold directly: no Trust Kit, no pilot, requirements enforced", async () => {
  await stage(S.a, ids.local, "qualified", {}, 422);
  await walkLocal(S.a, ids.local);
  await stage(S.a, ids.local, "accepted", {}, 422);
  await stage(S.a, ids.local, "not_fit", { reason: "TEST owner hesitated" });
  await stage(S.a, ids.local, "accepted", { reason: "TEST reopen" }, 422);
  await stage(S.a, ids.local, "deciding", { reason: "TEST owner came back" });
  const quote = await quoteAndAccept(S.a, ids.local, "local-starter");
  assert.equal(quote.price_vnd, 1990000);
  assert.equal(quote.credit_vnd, 0);
  await fields(S.a, ids.local, { offer_choice: "starter" });
  await stage(S.a, ids.local, "accepted");
  assert.deepEqual(ledger(ids.local).map((row) => [row.kind, row.amount_vnd]), [["receivable", 1990000]]);
  await pay(S.a, ids.local, 1990000);
  assert.equal(ledger(ids.local).at(-1).status, "pending", "seller reports; finance confirms");
  assert.match((await S.a.get(`/crm/${ids.local}`)).html, /Unpaid|Chưa thanh toán/);
  const pending = jobs(`SELECT id FROM crm_ledger WHERE opportunity_id = ${q(ids.local)} AND status = 'pending'`)[0].id;
  assert.equal((await S.a.post(`/crm/${ids.local}`, { intent: "payment_review", entry_id: pending, decision: "confirm" })).status, 403);
  assert.equal((await S.fin.get(`/crm/${ids.local}`)).status, 200, "finance can now read it");
  await act(S.fin, ids.local, { intent: "payment_review", entry_id: pending, decision: "confirm" });
  assert.match((await S.a.get(`/crm/${ids.local}`)).html, />Paid</);
  assert.equal((await S.fin.post(`/crm/${ids.local}`, { intent: "details", version: await oppVersion(S.admin, ids.local), title: "TEST hijack" })).status, 403, "finance cannot edit sales fields");
});

test("4. Trust Kit → Starter upgrade: credit once, 399k + 1,591k, day-30 boundary", async () => {
  async function trustKitSale(name, paidDaysAgo) {
    const id = await create(S.a, { playbook_key: "local-preview", account_name: `${name} ${run}`, contact_name: "TEST Owner", phone: phone() });
    await walkLocal(S.a, id, { skipPreview: true });
    await quoteAndAccept(S.a, id, "local-trust-kit");
    await fields(S.a, id, { offer_choice: "trust_kit" });
    await stage(S.a, id, "accepted");
    await pay(S.fin, id, 399000, isoDaysAgo(paidDaysAgo));
    return id;
  }
  ids.trust = await trustKitSale("TEST Garage Trust", 10);
  const upgrade = await act(S.a, ids.trust, { intent: "linked", relation: "upgrade", playbook_key: "local-preview" });
  ids.upgrade = idFrom(upgrade.location);
  assert.equal(jobs(`SELECT stage_id FROM crm_opportunities WHERE id = ${q(ids.upgrade)}`)[0].stage_id, "deciding", "upgrade continues where the owner already was");
  assert.equal(jobs(`SELECT COUNT(DISTINCT account_id) AS n FROM crm_opportunities WHERE id IN (${q(ids.trust)}, ${q(ids.upgrade)})`)[0].n, 1, "same account, no clone");
  const quote = await quoteAndAccept(S.a, ids.upgrade, "local-starter");
  assert.equal(quote.credit_vnd, 399000);
  // Retrying the same acceptance must not credit twice.
  const retry = await S.a.post(`/crm/${ids.upgrade}`, { intent: "quote_accept", quote_id: quote.id, acceptance_evidence: "TEST retry", request_key: quote.requestKey });
  assert.equal(retry.status, 303);
  assert.deepEqual(ledger(ids.upgrade).map((row) => [row.kind, row.amount_vnd]), [["receivable", 1990000], ["credit", 399000]]);
  await pay(S.fin, ids.upgrade, 1591000);
  const page = await S.a.get(`/crm/${ids.upgrade}`);
  assert.match(page.html, />Paid</);
  const cash = jobs(`SELECT SUM(amount_vnd) AS total FROM crm_ledger WHERE kind = 'payment' AND status = 'confirmed' AND opportunity_id IN (${q(ids.trust)}, ${q(ids.upgrade)})`)[0].total;
  assert.equal(cash, 1990000, "399.000 + 1.591.000 = 1.990.000 collected");
  // A second upgrade attempt on the same account cannot reuse the credit.
  const second = idFrom((await act(S.a, ids.trust, { intent: "linked", relation: "upgrade", playbook_key: "local-preview" })).location);
  await act(S.a, second, { intent: "quote_create", offer_id: offerId("local-starter") });
  assert.equal(jobs(`SELECT credit_vnd FROM crm_quotes WHERE opportunity_id = ${q(second)}`)[0].credit_vnd, 0);
  // A quote drafted before the Trust Kit payment is confirmed cannot be accepted without the credit.
  const late = await trustKitSale("TEST Late Confirm", 1);
  const lateChild = idFrom((await act(S.a, late, { intent: "linked", relation: "upgrade", playbook_key: "local-preview" })).location);
  jobs(`UPDATE crm_ledger SET status = 'pending' WHERE opportunity_id = ${q(late)} AND kind = 'payment'`);
  await act(S.a, lateChild, { intent: "quote_create", offer_id: offerId("local-starter") });
  const lateQuote = jobs(`SELECT id, credit_vnd FROM crm_quotes WHERE opportunity_id = ${q(lateChild)}`)[0];
  assert.equal(lateQuote.credit_vnd, 0);
  jobs(`UPDATE crm_ledger SET status = 'confirmed' WHERE opportunity_id = ${q(late)} AND kind = 'payment'`);
  const blocked = await S.a.post(`/crm/${lateChild}`, { intent: "quote_accept", quote_id: lateQuote.id, acceptance_evidence: "TEST" });
  assert.equal(blocked.status, 422, "re-quote required so the customer is not overcharged");
  // Boundary: paid 30 days ago is eligible today; 31 days ago is not.
  for (const [days, expected] of [[30, 399000], [31, 0]]) {
    const source = await trustKitSale(`TEST Boundary ${days}`, days);
    const child = idFrom((await act(S.a, source, { intent: "linked", relation: "upgrade", playbook_key: "local-preview" })).location);
    await act(S.a, child, { intent: "quote_create", offer_id: offerId("local-starter") });
    assert.equal(jobs(`SELECT credit_vnd FROM crm_quotes WHERE opportunity_id = ${q(child)}`)[0].credit_vnd, expected, `paid ${days} days ago`);
  }
});

test("5. refund and correction keep history and change totals", async () => {
  const payment = jobs(`SELECT id FROM crm_ledger WHERE opportunity_id = ${q(ids.local)} AND kind = 'payment' AND status = 'confirmed'`)[0].id;
  assert.equal((await S.a.post(`/crm/${ids.local}`, { intent: "refund", target_entry_id: payment, amount_vnd: 100000, occurred_on: isoDaysAgo(0), evidence: "x", note: "x" })).status, 403);
  await act(S.fin, ids.local, { intent: "refund", target_entry_id: payment, amount_vnd: 2000000, occurred_on: isoDaysAgo(0), evidence: "TEST", note: "TEST over refund" }, 422);
  await act(S.fin, ids.local, { intent: "refund", target_entry_id: payment, amount_vnd: 190000, occurred_on: isoDaysAgo(0), evidence: "TEST-REFUND", note: "TEST goodwill refund agreed in writing" });
  // Two concurrent refunds that each fit, but not together: at most one is written.
  const racing = await Promise.all([1, 2].map(() => S.fin.post(`/crm/${ids.local}`, { intent: "refund", target_entry_id: payment, amount_vnd: 1000000, occurred_on: isoDaysAgo(0), evidence: "TEST-RACE", note: "TEST race" })));
  assert.equal(racing.filter((response) => response.status === 303).length, 1, `statuses ${racing.map((response) => response.status)}`);
  const refunded = jobs(`SELECT SUM(amount_vnd) AS total FROM crm_ledger WHERE kind = 'refund' AND target_entry_id = ${q(payment)}`)[0].total;
  assert.equal(refunded, 1190000);
  const raceRefund = jobs(`SELECT id FROM crm_ledger WHERE kind = 'refund' AND evidence = 'TEST-RACE' AND target_entry_id = ${q(payment)}`)[0].id;
  await act(S.fin, ids.local, { intent: "void", target_entry_id: raceRefund, note: "TEST undo race refund" });
  await pay(S.fin, ids.local, 50000);
  const mistaken = jobs(`SELECT id FROM crm_ledger WHERE opportunity_id = ${q(ids.local)} AND kind = 'payment' AND amount_vnd = 50000`)[0].id;
  await act(S.fin, ids.local, { intent: "void", target_entry_id: mistaken, note: "TEST duplicate entry" });
  const rows = ledger(ids.local);
  assert.equal(rows.length, 7, "receivable, payment, two refunds, the mistaken payment and two voids are all kept");
  assert.match((await S.a.get(`/crm/${ids.local}`)).html, /Part paid|Thanh toán một phần/);
});

test("6–8. one account: Local, AI workflow expansion and renewal without cloning or leaks", async () => {
  await details(S.a, ids.local, { service_period_start: isoDaysAgo(330), service_period_end: isoDaysAgo(-35) });
  ids.expansion = idFrom((await act(S.a, ids.local, { intent: "linked", relation: "expansion", playbook_key: "lumi-solution" })).location);
  ids.renewal = idFrom((await act(S.a, ids.local, { intent: "linked", relation: "renewal", playbook_key: "local-renewal" })).location);
  const accounts = jobs(`SELECT COUNT(DISTINCT account_id) AS n FROM crm_opportunities WHERE id IN (${q(ids.local)}, ${q(ids.expansion)}, ${q(ids.renewal)})`)[0].n;
  assert.equal(accounts, 1);
  await act(S.admin, ids.expansion, { intent: "assign", version: await oppVersion(S.admin, ids.expansion), owner_id: S.b.id });
  assert.equal((await S.a.get(`/crm/${ids.expansion}`)).status, 404, "A cannot see B's opportunity on the same account");
  assert.doesNotMatch((await S.a.get(`/crm/${ids.local}`)).html, new RegExp(ids.expansion));
  assert.equal(jobs(`SELECT seller_id FROM crm_opportunities WHERE id = ${q(ids.expansion)}`)[0].seller_id, S.a.id, "reassignment keeps attribution");

  // 7. AI workflow: discovery → qualified → demo → (pilot skipped with reason) → proposal → accepted.
  const x = ids.expansion;
  await stage(S.b, x, "contacted");
  await fields(S.b, x, { current_workflow: "TEST quotes assembled by hand from 3 tools", pain: "TEST slow replies" });
  await stage(S.b, x, "discovery");
  await fields(S.b, x, { frequency: "daily", baseline: "TEST estimated 2h/day (owner estimate)", decision_maker: "TEST owner", systems_data: "TEST Zalo, Sheets" });
  await stage(S.b, x, "qualified");
  await fields(S.b, x, { demo_outcome: "continue", capabilities_to_confirm: "TEST Sheets connector", capabilities_confirmed: "yes" });
  await stage(S.b, x, "demo");
  await details(S.b, x, {});
  await stage(S.b, x, "proposal", {}, 422);
  await stage(S.b, x, "proposal", { reason: "TEST pilot not needed: one workflow, reversible" });
  await act(S.b, x, { intent: "quote_create", offer_id: offerId("lumi-solution"), "line.0.label": "TEST setup", "line.0.charge_type": "setup", "line.0.amount_vnd": "3000000", "line.1.label": "TEST monthly", "line.1.charge_type": "monthly", "line.1.amount_vnd": "500000" });
  const solutionQuote = jobs(`SELECT id, price_vnd FROM crm_quotes WHERE opportunity_id = ${q(x)}`)[0];
  assert.equal(solutionQuote.price_vnd, 3000000, "monthly fees are not due at acceptance");
  await act(S.b, x, { intent: "quote_accept", quote_id: solutionQuote.id, acceptance_evidence: "TEST signed proposal" });
  await stage(S.b, x, "accepted");
  assert.deepEqual(jobs(`SELECT skipped FROM crm_stage_history WHERE opportunity_id = ${q(x)} AND to_stage = 'proposal'`)[0].skipped, '["pilot"]');

  // 8. Renewal: next service period, plan, quote, payment with period, activation separately.
  const renewal = jobs(`SELECT service_period_start, renewal_due_on, stage_id FROM crm_opportunities WHERE id = ${q(ids.renewal)}`)[0];
  assert.equal(renewal.stage_id, "pending_review");
  assert.equal(renewal.service_period_start, isoDaysAgo(-36));
  await fields(S.a, ids.renewal, { owner_feedback: "TEST happy, wants own domain" });
  await stage(S.a, ids.renewal, "discussed");
  await fields(S.a, ids.renewal, { plan_choice: "domain" });
  await details(S.a, ids.renewal, { service_period_start: renewal.service_period_start, service_period_end: isoDaysAgo(-400), renewal_due_on: renewal.renewal_due_on });
  await stage(S.a, ids.renewal, "proposed");
  await quoteAndAccept(S.a, ids.renewal, "local-renewal-domain");
  await stage(S.a, ids.renewal, "accepted");
  assert.match((await S.a.get(`/crm/${ids.renewal}`)).html, /Unpaid|Chưa thanh toán/, "accepted is not paid");
  await act(S.fin, ids.renewal, { intent: "payment", amount_vnd: 999000, occurred_on: isoDaysAgo(0), method: "bank_transfer", evidence: "TEST-RENEW", period_start: renewal.service_period_start, period_end: isoDaysAgo(-400) });
  await act(S.a, ids.renewal, { intent: "handoff" });
  const activation = jobs(`SELECT kind, status FROM crm_fulfillments WHERE opportunity_id = ${q(ids.renewal)}`)[0];
  assert.deepEqual([activation.kind, activation.status], ["renewal_activation", "pending"]);
});

test("9. sales stage, payment and delivery change independently; seller cannot approve for the owner", async () => {
  const handoff = { intent: "handoff", "handoff.confirmed_content": "TEST services and prices", "handoff.assets_permitted": "TEST owner photos", "handoff.domain_choice": "subdomain", "handoff.revision_terms": "one basic round", "handoff.delivery_date": isoDaysAgo(-7), "handoff.enquiry_destination": "TEST owner Zalo", "handoff.response_owner": "TEST owner" };
  await act(S.a, ids.trust, { intent: "handoff" }, 422);
  await act(S.a, ids.upgrade, handoff);
  const before = jobs(`SELECT stage_id FROM crm_opportunities WHERE id = ${q(ids.upgrade)}`)[0].stage_id;
  assert.equal((await S.ful.get("/crm/fulfillment")).status, 200);
  assert.match((await S.ful.get("/crm/fulfillment")).html, /Garage Trust/);
  const fulfillmentVersion = () => Number(jobs(`SELECT version FROM crm_fulfillments WHERE opportunity_id = ${q(ids.upgrade)}`)[0].version);
  const fact = (fields, expected = 303) => act(S.ful, ids.upgrade, { intent: "fulfillment", version: fulfillmentVersion(), ...fields }, expected);
  assert.equal((await S.a.post(`/crm/${ids.upgrade}`, { intent: "fulfillment", version: fulfillmentVersion(), fulfillment_action: "owner_approval", approved_on: isoDaysAgo(0), approval_evidence: "seller says ok" })).status, 403);
  await fact({ fulfillment_action: "status", status: "in_progress" });
  await fact({ fulfillment_action: "status", status: "ready_to_publish" }, 422);
  await fact({ fulfillment_action: "block", blocked: "1", blocked_reason: "TEST waiting for logo" });
  assert.match((await S.a.get("/crm")).html, /TEST waiting for logo/, "blocked delivery appears on Today");
  await fact({ fulfillment_action: "block", blocked: "0" });
  await fact({ fulfillment_action: "owner_approval", approved_on: isoDaysAgo(0), approval_evidence: "TEST owner approved by Zalo" });
  await fact({ fulfillment_action: "status", status: "ready_to_publish" });
  await fact({ fulfillment_action: "status", status: "live" }, 422);
  await fact({ fulfillment_action: "checks", "check.call": "pass", "check.zalo": "pass", "check.maps": "pass", "check.form": "pass", "check.qr": "na", "check.https": "pass", "check.mobile": "pass" });
  await fact({ fulfillment_action: "status", status: "live" });
  assert.equal(jobs(`SELECT stage_id FROM crm_opportunities WHERE id = ${q(ids.upgrade)}`)[0].stage_id, before, "delivery changes do not move the sales stage");
});

test("10. do-not-contact blocks outreach across channels and new records", async () => {
  const contact = jobs(`SELECT c.id, c.account_id FROM crm_contacts c JOIN crm_opportunities o ON o.primary_contact_id = c.id WHERE o.id = ${q(ids.bOwn)}`)[0];
  await S.b.post(`/crm/accounts/${contact.account_id}`, { intent: "dnc", contact_id: contact.id, do_not_contact: "1", dnc_reason: "TEST owner asked by phone to stop" });
  await act(S.b, ids.bOwn, { intent: "task_create", kind: "call", title: "TEST call", contact_id: contact.id, due_on: isoDaysAgo(-1) }, 422);
  await act(S.b, ids.bOwn, { intent: "task_create", kind: "message", title: "TEST try Zalo instead" }, 422);
  await act(S.b, ids.bOwn, { intent: "task_create", kind: "internal", title: "TEST internal review" });
  const again = await S.a.post("/crm/new", { intent: "create", playbook_key: "local-preview", source_channel: "facebook", account_name: "TEST Same Phone", contact_name: "x", phone: `+84 ${phoneB.slice(1, 4)} ${phoneB.slice(4)}` });
  assert.equal(again.status, 422, "same number cannot be re-approached through another record");
  assert.equal((await S.b.post(`/crm/accounts/${contact.account_id}`, { intent: "dnc", contact_id: contact.id, do_not_contact: "0", dnc_reason: "lift" })).status, 403, "only admins lift do-not-contact");
});

test("11. intake from Lumi Local: signed, idempotent, queued for assignment", async () => {
  const body = { name: "TEST Inbound Owner", business: `TEST Inbound Garage ${run}`, phone: phone(), email: "", note: "TEST wants a preview", locale: "vi", consent: true, consent_text_version: "copy.js@3a6024e",
    context: { page_slug: "garage", source: "/nganh/garage/", cta_intent: "preview", offer_interest: "starter" } };
  const idem = `enq_${key()}`;
  const first = await signedIntake(intakeSecret, body, { key: idem });
  assert.equal(first.status, 201);
  const firstJson = await first.json();
  const replay = await signedIntake(intakeSecret, body, { key: idem });
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { ok: true, id: firstJson.id, duplicate: true });
  assert.equal((await signedIntake(intakeSecret, { ...body, note: "changed" }, { key: idem })).status, 409);
  assert.equal((await signedIntake("wrong-secret-wrong-secret-wrong-secret", body)).status, 401);
  assert.equal((await signedIntake(intakeSecret, body, { source: "evil.example" })).status, 403);
  assert.equal((await signedIntake(intakeSecret, body, { timestamp: Math.floor(Date.now() / 1000) - 900 })).status, 401);
  assert.equal((await signedIntake(intakeSecret, { ...body, context: { ...body.context, offer_interest: "trust-kit" } })).status, 422, "forged context is rejected");
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM crm_inbound WHERE idempotency_key = ${q(idem)}`)[0].n, 1);
  const opp = jobs(`SELECT o.id, o.owner_id, o.source_channel, o.stage_id FROM crm_inbound i JOIN crm_opportunities o ON o.id = i.opportunity_id WHERE i.id = ${q(firstJson.id)}`)[0];
  assert.deepEqual([opp.owner_id, opp.source_channel, opp.stage_id], [null, "inbound_web", "new"]);
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM crm_ledger WHERE opportunity_id = ${q(opp.id)}`)[0].n, 0, "an enquiry is not a payment");
  assert.match((await S.admin.get("/crm/admin")).html, /TEST Inbound Garage/);
  assert.equal((await S.a.get(`/crm/${opp.id}`)).status, 404);
  await S.admin.post("/crm/admin", { intent: "inbound_assign", inbound_id: firstJson.id, owner_id: S.a.id });
  assert.equal((await S.a.get(`/crm/${opp.id}`)).status, 200);
  assert.match((await S.a.get(`/crm/${opp.id}`)).html, /\/nganh\/garage\//);
});

test("12. conflicts keep the user's edit; double submits write once", async () => {
  const id = ids.bOwn;
  const page = await S.b.get(`/crm/${id}`);
  const stale = version(page.html);
  await S.admin.post(`/crm/${id}`, { intent: "details", version: stale, title: "TEST admin edit", next_action: "Admin step", next_action_due: isoDaysAgo(-3) });
  const conflict = await S.b.post(`/crm/${id}`, { intent: "details", version: stale, title: "TEST B typed this", next_action: "B step", next_action_due: isoDaysAgo(-4) });
  assert.equal(conflict.status, 409);
  assert.match(conflict.html, /value="TEST B typed this"/);
  assert.match(conflict.html, /TEST admin edit/, "latest value shown for comparison");
  const latest = version(conflict.html);
  assert.equal((await S.b.post(`/crm/${id}`, { intent: "details", version: latest, title: "TEST B typed this", next_action: "B step", next_action_due: isoDaysAgo(-4) })).status, 303);
  const requestKey = key();
  for (let attempt = 0; attempt < 3; attempt += 1) assert.equal((await S.b.post(`/crm/${id}`, { intent: "note", note: "TEST once", request_key: requestKey })).status, 303);
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM crm_events WHERE opportunity_id = ${q(id)} AND kind = 'note'`)[0].n, 1);
  const bad = await S.b.post(`/crm/${id}`, { intent: "details", version: latest + 1, title: "", next_action: "kept" });
  assert.equal(bad.status, 422);
  assert.match(bad.html, /value="kept"/);
});

test("13. admin builds a playbook and offer in the UI; versions never rewrite history", async () => {
  const offerKey = `test-audit-${run}`;
  assert.equal((await S.admin.post("/crm/admin/offers", { intent: "offer_save", is_new: "1", offer_key: offerKey, name_en: "TEST Audit", name_vi: "TEST Kiểm tra", charge_type: "one_time", list_price_vnd: "500000", effective_from: isoDaysAgo(0), source_ref: "TEST decision note" })).status, 303);
  const pbKey = `test-pb-${run}`;
  const form = { intent: "playbook_save", is_new: "1", playbook_key: pbKey, kind: "acquisition", name_en: "TEST Audit sale", name_vi: "TEST Bán kiểm tra",
    "s.0.id": "new", "s.0.en": "New", "s.0.vi": "Mới", "s.0.outcome": "open",
    "s.1.id": "scoped", "s.1.en": "Scoped", "s.1.vi": "Đã xác định", "s.1.outcome": "open", "s.1.requires": "audit_scope", "s.1.milestone": "qualified",
    "s.2.id": "won", "s.2.en": "Won", "s.2.vi": "Thành công", "s.2.outcome": "won", "s.2.requires": "accepted_quote",
    "s.3.id": "lost", "s.3.en": "Lost", "s.3.vi": "Thua", "s.3.outcome": "lost",
    "f.0.key": "audit_scope", "f.0.en": "Scope", "f.0.vi": "Phạm vi", "f.0.type": "long_text", "f.0.stage": "new", offers: offerKey };
  const bad = await S.admin.post("/crm/admin/playbooks", { ...form, "s.1.requires": "nonexistent_key" });
  assert.equal(bad.status, 422);
  assert.match(bad.html, /nonexistent_key/);
  assert.equal((await S.admin.post("/crm/admin/playbooks", form)).status, 303);
  const id = await create(S.a, { playbook_key: pbKey, account_name: `TEST Configured ${run}` });
  await fields(S.a, id, { audit_scope: "TEST two locations" });
  await stage(S.a, id, "scoped");
  const quote = await quoteAndAccept(S.a, id, offerKey);
  assert.equal(quote.price_vnd, 500000);
  await stage(S.a, id, "won");
  // New offer price and new playbook version leave the accepted quote and the opportunity untouched.
  await S.admin.post("/crm/admin/offers", { intent: "offer_save", is_new: "0", offer_key: offerKey, name_en: "TEST Audit", name_vi: "TEST Kiểm tra", charge_type: "one_time", list_price_vnd: "650000", effective_from: isoDaysAgo(-1), source_ref: "TEST price change" });
  await S.admin.post("/crm/admin/playbooks", { ...form, is_new: "0", "s.1.en": "Scoped (renamed)" });
  const after = jobs(`SELECT q.price_vnd, json_extract(q.snapshot, '$.offer.version') AS offer_version, o.playbook_id FROM crm_quotes q JOIN crm_opportunities o ON o.id = q.opportunity_id WHERE o.id = ${q(id)}`)[0];
  assert.deepEqual([after.price_vnd, after.offer_version, after.playbook_id], [500000, 1, `${pbKey}@1`]);
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM crm_playbooks WHERE playbook_key = ${q(pbKey)}`)[0].n, 2);
  const newer = await create(S.a, { playbook_key: pbKey, account_name: `TEST Configured v2 ${run}` });
  assert.equal(jobs(`SELECT playbook_id FROM crm_opportunities WHERE id = ${q(newer)}`)[0].playbook_id, `${pbKey}@2`);
});

test("revocation and disabled EmDash accounts take effect on the next request; records stay", async () => {
  await S.admin.post("/workspace/users", { intent: "update", user_id: S.b.id, roles: ["sales_executive"], enabled: "0" });
  assert.equal((await S.b.get("/crm")).status, 403);
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM crm_opportunities WHERE owner_id = ${q(S.b.id)}`)[0].n >= 1, true, "B's records remain");
  assert.match((await S.admin.get("/crm/pipeline?owner=inactive&playbook=all")).html, /TEST B typed this/);
  await act(S.admin, ids.bOwn, { intent: "assign", version: await oppVersion(S.admin, ids.bOwn), owner_id: S.a.id });
  assert.equal((await S.a.get(`/crm/${ids.bOwn}`)).status, 200);
  const { content } = await import("./helpers.mjs");
  content(`UPDATE users SET disabled = 1 WHERE id = ${q(S.a.id)}`);
  const disabled = await S.a.get("/crm");
  assert.ok([303, 403].includes(disabled.status), `disabled EmDash user blocked (${disabled.status})`);
  content(`UPDATE users SET disabled = 0 WHERE id = ${q(S.a.id)}`);
});

test("14. commission: proposal is admin-only simulation; approval shows each seller their own lines", async () => {
  const before = await S.a.get("/crm/commission");
  assert.equal(before.status, 200);
  assert.doesNotMatch(before.html, /class="crm-table"/, "collaborators see no amounts before approval");
  await S.admin.post("/crm/commission", { intent: "seller_terms", user_id: S.a.id, seller_type: "partner_seller", effective_from: "2026-01-01" });
  await S.admin.post("/crm/commission", { intent: "seller_terms", user_id: S.fin.id, seller_type: "employee", effective_from: "2026-01-01" });
  const simulated = await S.fin.get(`/crm/commission?person=${S.a.id}`);
  assert.match(simulated.html, /simulated|mô phỏng/);
  assert.equal((await S.fin.post("/crm/commission", { intent: "payout", user_id: S.a.id, period: "2026-10", amount_vnd: "100000", evidence: "TEST" })).status, 422, "no payouts before approval");
  assert.equal((await S.a.post("/crm/commission", { intent: "policy_save", status: "approved" })).status, 403);
  const rates = {};
  for (const type of ["partner_seller", "partner_referral", "employee"]) for (const [key, value] of Object.entries({ trust_kit: 100000, starter_live: 300000, starter_retained: 100000, upgrade_live: 200000, upgrade_retained: 100000, renewal_pct: 10 })) rates[`rate.${type}.${key}`] = String(value);
  assert.equal((await S.admin.post("/crm/commission", { intent: "policy_save", status: "approved", effective_from: "2026-01-01", retention_days: "60", inbound_pct: "50", source_ref: "TEST approval in an isolated database", ...rates })).status, 303);
  const mine = await S.a.get("/crm/commission");
  assert.match(mine.html, /Đã đủ điều kiện|Earned|Đang trong thời gian giữ|In holdback/);
  assert.ok(mine.html.includes("Garage Trust"), "A sees lines for deals A sold");
  assert.ok(!mine.html.includes(S.b.name), "A does not see other people's lines");
  assert.equal((await S.a.post("/crm/commission", { intent: "payout", user_id: S.a.id, period: "2026-10", amount_vnd: "100000", evidence: "TEST" })).status, 403);
  // Payroll handoff: only Employee-type sellers, computed amounts, once per line, never both channels.
  const month = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
  assert.equal((await S.fin.post("/crm/commission", { intent: "handoff", user_id: S.a.id, period: month })).status, 422, "a partner is not handed to payroll");
  await S.admin.post("/crm/commission", { intent: "seller_terms", user_id: S.a.id, seller_type: "employee", effective_from: `${month}-01` });
  assert.equal((await S.a.post("/crm/commission", { intent: "handoff", user_id: S.a.id, period: month })).status, 403, "sellers cannot hand off their own commission");
  const handoffKey = `crm_handoff_${run}`;
  assert.equal((await S.fin.post("/crm/commission", { intent: "handoff", request_key: handoffKey, user_id: S.a.id, period: month })).status, 303);
  assert.equal((await S.fin.post("/crm/commission", { intent: "handoff", request_key: handoffKey, user_id: S.a.id, period: month })).status, 303, "a retry replays the handoff");
  const handoffs = jobs(`SELECT id, amount_vnd, line_count, state FROM crm_commission_handoffs WHERE user_id = ${q(S.a.id)}`);
  assert.equal(handoffs.length, 1); assert.ok(handoffs[0].amount_vnd > 0 && handoffs[0].line_count > 0);
  assert.equal(jobs(`SELECT COALESCE(SUM(amount_vnd),0) AS n FROM crm_commission_handoff_lines WHERE handoff_id = ${q(handoffs[0].id)}`)[0].n, handoffs[0].amount_vnd, "the total is the sum of frozen earned lines");
  assert.equal((await S.fin.post("/crm/commission", { intent: "handoff", user_id: S.a.id, period: month })).status, 422, "no earned line is handed off twice");
  assert.equal((await S.fin.post("/crm/commission", { intent: "payout", user_id: S.a.id, period: month, amount_vnd: "100000", evidence: "TEST-BLOCKED" })).status, 422, "a handed-off month is not also paid manually");
  const finView = await S.fin.get("/vi/crm/commission");
  assert.match(finView.html, /Chuyển sang payroll HRM/); assert.match(finView.html, /Chờ payroll/);
  assert.equal((await S.fin.post("/crm/commission", { intent: "handoff_void", handoff_id: handoffs[0].id, reason: "TEST returned to manual payout for this regression" })).status, 303);
  assert.equal(jobs(`SELECT state FROM crm_commission_handoffs WHERE id = ${q(handoffs[0].id)}`)[0].state, "voided");
  // One HTTP chain from CRM commission to an issued payslip, then a refund:
  // Finance re-confirms the month, HRM payroll imports that handoff for the
  // seller's own EmDash account and publishes; the handoff can no longer be
  // voided, a refund produces a refund notice for payroll, and pay is unchanged.
  const reconfirmKey = `crm_handoff_again_${run}`;
  assert.equal((await S.fin.post("/crm/commission", { intent: "handoff", request_key: reconfirmKey, user_id: S.a.id, period: month })).status, 303, "voided lines can be handed off again");
  const handoff = jobs(`SELECT id, amount_vnd FROM crm_commission_handoffs WHERE user_id = ${q(S.a.id)} AND state = 'confirmed'`)[0];
  assert.ok(handoff);
  const entity = `TEST CRM chain ${run}`;
  // Every HRM step must save: a 303 alone can be an ?error= redirect.
  const hrmOk = async (session, path, fields, label) => { const response = await session.post(path, fields); assert.equal(response.status, 303, label); assert.equal(new URL(response.location, "http://x").searchParams.get("error"), null, label); return response; };
  const hrmAdmin = await userSession(S.admin, { email: `test-chain-hrm-${run}@example.test`, name: `TEST Chain HRM ${run}` });
  const payroll = await userSession(S.admin, { email: `test-chain-payroll-${run}@example.test`, name: `TEST Chain Payroll ${run}` });
  for (const [session, role] of [[hrmAdmin, "hrm_admin"], [payroll, "payroll_officer"]]) assert.equal((await S.admin.post("/workspace/users", { intent: "grant", email: session.email, roles: [role] })).status, 303);
  const originalSettings = jobs("SELECT version, enabled, legal_entity, purpose, retention_policy, policy_reference, reviewed_by FROM hrm_settings WHERE id = 1")[0], settingsVersion = originalSettings.version;
  assert.equal((await S.admin.post("/hrm/settings", { request_key: `chain_settings_${run}`, version: settingsVersion, legal_entity: entity, purpose: "Synthetic CRM-to-payroll chain test only", retention_policy: "Synthetic records only", policy_reference: "TEST chain", reviewed: "1", enabled: "1" })).status, 303);
  // A free single day inside the handoff month keeps the run within one calendar
  // month. Locking checks every employee's scheduled work and pending leave, so
  // the day must have no period, no work-calendar assignment and no pending leave.
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const day = Array.from({ length: Number(today.slice(8, 10)) }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`).reverse()
    .find((date) => jobs(`SELECT
      (SELECT COUNT(*) FROM hrm_time_periods WHERE starts_on <= ${q(date)} AND ends_on >= ${q(date)})
      + (SELECT COUNT(*) FROM hrm_work_assignments WHERE effective_from <= ${q(date)} AND (effective_to IS NULL OR effective_to >= ${q(date)}))
      + (SELECT COUNT(*) FROM hrm_leave_requests WHERE state IN ('pending_approval','cancellation_requested') AND starts_on <= ${q(date)} AND ends_on >= ${q(date)}) AS n`)[0].n === 0);
  assert.ok(day, "a free day exists in the handoff month");
  const code = `TEST-CHAIN-${run}`;
  assert.equal((await hrmAdmin.post("/hrm/people/new", { request_key: `chain_person_${run}`, employee_code: code, account_email: S.a.email, legal_name: "TEST Chain Seller", preferred_name: "TEST Chain Seller", work_email: `chain-${run}@work.example.test`, work_phone: "0900000000", department: "TEST Sales", job_title: "TEST Seller", legal_entity: entity, location: "Ho Chi Minh City", manager_user_id: "", status: "active", started_on: day })).status, 303);
  const personId = jobs(`SELECT id FROM hrm_people WHERE employee_code = ${q(code)}`)[0].id;
  const periodKey = `CHAIN-${run}`;
  await hrmOk(hrmAdmin, "/api/hrm/time", { intent: "create_period", return_to: "/hrm/time", request_key: `chain_period_${run}`, period_key: periodKey, starts_on: day, ends_on: day }, "create period");
  let period = jobs(`SELECT id, version FROM hrm_time_periods WHERE period_key = ${q(periodKey)}`)[0];
  await hrmOk(hrmAdmin, "/api/hrm/time", { intent: "review_period", return_to: "/hrm/time", request_key: `chain_review_period_${run}`, period_id: period.id, version: period.version }, "review period");
  period = jobs(`SELECT id, version FROM hrm_time_periods WHERE id = ${q(period.id)}`)[0];
  await hrmOk(hrmAdmin, "/api/hrm/time", { intent: "lock_period", return_to: "/hrm/time", request_key: `chain_lock_period_${run}`, period_id: period.id, version: period.version, reason: "TEST synthetic chain period" }, "lock period");
  const components = [{ code: "commission", title_en: "Sales commission", title_vi: "Hoa hồng bán hàng", direction: "earning", required: true, source_kind: "crm_commission" }];
  const policyKey = `test-chain-${run}`;
  await hrmOk(hrmAdmin, "/api/hrm/payroll", { intent: "create_policy", return_to: "/hrm/payroll", request_key: `chain_policy_${run}`, policy_key: policyKey, title_en: "TEST chain payroll", title_vi: "TEST lương chuỗi", legal_entity: entity, currency: "VND", minor_unit_scale: "0", components_json: JSON.stringify(components) }, "create policy");
  let policy = jobs(`SELECT id, version FROM hrm_payroll_policy_versions WHERE policy_key = ${q(policyKey)}`)[0];
  await hrmOk(S.admin, "/api/hrm/payroll", { intent: "review_policy", return_to: "/hrm/payroll", request_key: `chain_policy_review_${run}`, policy_id: policy.id, version: policy.version, decision: "approve", reason: "TEST independent policy review" }, "review policy");
  policy = jobs(`SELECT id, version FROM hrm_payroll_policy_versions WHERE id = ${q(policy.id)}`)[0];
  await hrmOk(S.admin, "/api/hrm/payroll", { intent: "activate_policy", return_to: "/hrm/payroll", request_key: `chain_policy_activate_${run}`, policy_id: policy.id, version: policy.version }, "activate policy");
  const payrollStep = async (session, fields, label) => { const response = await session.post("/api/hrm/payroll", { return_to: "/hrm/payroll", request_key: `chain_${label}_${run}`, ...fields }); assert.equal(new URL(response.location, "http://x").searchParams.get("error"), null, label); };
  await payrollStep(payroll, { intent: "create_run", policy_version_id: policy.id, period_id: period.id }, "run");
  const runRow = jobs(`SELECT id FROM hrm_payroll_runs WHERE policy_version_id = ${q(policy.id)} AND period_id = ${q(period.id)}`)[0];
  assert.deepEqual(jobs(`SELECT person_id FROM hrm_payroll_run_people WHERE run_id = ${q(runRow.id)}`).map((row) => row.person_id), [personId], "the dedicated entity's roster is the seller alone");
  const runVersion = () => jobs(`SELECT version FROM hrm_payroll_runs WHERE id = ${q(runRow.id)}`)[0].version;
  const desk = await payroll.get(`/hrm/payroll?run=${runRow.id}`);
  assert.ok(desk.html.includes(handoff.id), "the line form offers the confirmed handoff");
  assert.ok(!desk.html.includes("Garage Trust"), "payroll never sees CRM customers");
  const wrongAmount = await payroll.post("/api/hrm/payroll", { intent: "set_line", return_to: "/hrm/payroll", request_key: `chain_wrong_${run}`, run_id: runRow.id, person_id: personId, version: runVersion(), component_code: "commission", amount_minor: String(handoff.amount_vnd + 1), source_kind: "crm_commission", source_reference: handoff.id, zero_reason: "" });
  assert.equal(new URL(wrongAmount.location, "http://x").searchParams.get("error"), "payroll_commission_mismatch");
  await payrollStep(payroll, { intent: "set_line", run_id: runRow.id, person_id: personId, version: runVersion(), component_code: "commission", amount_minor: String(handoff.amount_vnd), source_kind: "crm_commission", source_reference: handoff.id, zero_reason: "" }, "line");
  await payrollStep(payroll, { intent: "calculate_run", run_id: runRow.id, version: runVersion() }, "calculate");
  await payrollStep(hrmAdmin, { intent: "review_run", run_id: runRow.id, version: runVersion(), reason: "TEST reviewed against the CRM handoff total" }, "review");
  await payrollStep(hrmAdmin, { intent: "approve_run", run_id: runRow.id, version: runVersion(), reason: "TEST independent approval" }, "approve");
  await payrollStep(S.admin, { intent: "publish_run", run_id: runRow.id, version: runVersion() }, "publish");
  const slip = jobs(`SELECT snapshot_json FROM hrm_payslips WHERE run_id = ${q(runRow.id)}`)[0];
  const snapshot = JSON.parse(slip.snapshot_json);
  assert.equal(snapshot.net_minor, handoff.amount_vnd, "the payslip pays exactly the Finance-confirmed total");
  assert.ok(!/Garage Trust|opp_|ledger/i.test(slip.snapshot_json), "no CRM customer, opportunity or ledger data reaches the payslip");
  const lateVoid = await S.fin.post("/crm/commission", { intent: "handoff_void", handoff_id: handoff.id, reason: "TEST too late" });
  assert.equal(lateVoid.status, 422, "a handoff payroll used cannot be voided");
  // Refund one handed-off deal: Finance records a refund notice; pay stays as issued.
  const refundedOpp = jobs(`SELECT opportunity_id FROM crm_commission_handoff_lines WHERE handoff_id = ${q(handoff.id)} ORDER BY amount_vnd LIMIT 1`)[0].opportunity_id;
  const payment = jobs(`SELECT id FROM crm_ledger WHERE opportunity_id = ${q(refundedOpp)} AND kind = 'payment' AND status = 'confirmed' ORDER BY created_at LIMIT 1`)[0];
  assert.ok(payment, "the handed-off deal has a confirmed payment to refund");
  assert.equal((await S.fin.post(`/crm/${refundedOpp}`, { intent: "refund", target_entry_id: payment.id, amount_vnd: 1000, occurred_on: today, evidence: "TEST-CHAIN-REFUND", note: "TEST refund after handoff" })).status, 303);
  const financeView = await S.fin.get("/crm/commission");
  assert.match(financeView.html, /Refunded after handoff/);
  assert.equal((await S.fin.post("/crm/commission", { intent: "refund_notice", handoff_id: handoff.id, reason: "TEST customer refund after payroll used the handoff" })).status, 303);
  const notice = jobs(`SELECT amount_vnd, line_count FROM crm_commission_refund_notices WHERE handoff_id = ${q(handoff.id)}`)[0];
  assert.ok(notice && notice.amount_vnd > 0 && notice.amount_vnd <= handoff.amount_vnd);
  assert.equal(jobs(`SELECT snapshot_json FROM hrm_payslips WHERE run_id = ${q(runRow.id)}`)[0].snapshot_json, slip.snapshot_json, "the issued payslip is unchanged");
  const viDesk = await payroll.get("/vi/hrm/payroll");
  assert.match(viDesk.html, /Báo hoàn tiền từ CRM/);
  assert.ok(viDesk.html.includes(code), "payroll sees the employee, month and amount of the notice");
  // Restore the HRM settings the earlier suites left, for the regressions that follow.
  const restoreVersion = jobs("SELECT version FROM hrm_settings WHERE id = 1")[0].version;
  // A fresh database had no HRM configuration: leave HRM closed and unreviewed.
  const restore = originalSettings.legal_entity
    ? { legal_entity: originalSettings.legal_entity, purpose: originalSettings.purpose, retention_policy: originalSettings.retention_policy, policy_reference: originalSettings.policy_reference, ...(originalSettings.reviewed_by ? { reviewed: "1" } : {}), ...(originalSettings.enabled ? { enabled: "1" } : {}) }
    : { legal_entity: entity, purpose: "Synthetic CRM-to-payroll chain test only", retention_policy: "Synthetic records only", policy_reference: "TEST chain" };
  assert.equal((await S.admin.post("/hrm/settings", { request_key: `chain_settings_restore_${run}`, version: restoreVersion, ...restore })).status, 303);
  assert.equal(jobs("SELECT enabled FROM hrm_settings WHERE id = 1")[0].enabled, originalSettings.legal_entity ? originalSettings.enabled : 0);

  await S.admin.post("/crm/commission", { intent: "seller_terms", user_id: S.a.id, seller_type: "partner_seller", effective_from: `${month}-02` });
  // The handed-off month stays with payroll; the manual payout uses an earlier month.
  const earlierMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  assert.equal((await S.fin.post("/crm/commission", { intent: "payout", user_id: S.a.id, period: earlierMonth, amount_vnd: "100000", evidence: "TEST-PAYOUT" })).status, 303);
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM crm_commission_payouts WHERE user_id = ${q(S.a.id)} AND evidence = 'TEST-PAYOUT'`)[0].n, 1);
  // Restore the proposal so later runs start from an unapproved policy again.
  // Voided handoffs stay as append-only history; they no longer hold any line.
  jobs("DELETE FROM crm_commission_payouts; DELETE FROM crm_policies WHERE policy_key = 'local-commission' AND version > 1");
});
