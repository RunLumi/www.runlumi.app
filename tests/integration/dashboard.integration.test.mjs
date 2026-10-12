// Sales dashboard on /crm: expected value and win probability per deal;
// sellers see only their own figures, managers the company or one seller or
// product. Real Worker + D1 + EmDash sessions; synthetic TEST data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminSession, idFrom, jobs, q, userSession } from "./helpers.mjs";

const run = Date.now().toString(36);
const S = {};
const kpi = (html, label) => {
  const match = new RegExp(`${label}</dt><dd[^>]*>([^<]+)</dd>`).exec(html);
  assert.ok(match, `KPI ${label} present`);
  return match[1].trim();
};
const create = async (session, name, fields = {}) => {
  const response = await session.post("/crm/new", { intent: "create", playbook_key: "local-preview", source_channel: "field_visit", account_name: `${name} ${run}`, contact_name: "TEST Owner", ...fields });
  assert.equal(response.status, 303, `create ${name}: ${response.status}`);
  return idFrom(response.location);
};

test("setup: a manager and two sellers with valued deals", async () => {
  S.admin = await adminSession();
  S.manager = await userSession(S.admin, { email: `test-dash-sm-${run}@example.test`, name: `TEST Dash Manager ${run}` });
  S.one = await userSession(S.admin, { email: `test-dash-one-${run}@example.test`, name: `TEST Dash One ${run}` });
  S.two = await userSession(S.admin, { email: `test-dash-two-${run}@example.test`, name: `TEST Dash Two ${run}` });
  for (const [session, roles] of [[S.manager, ["sales_manager"]], [S.one, ["sales_executive"]], [S.two, ["sales_executive"]]]) {
    assert.equal((await S.admin.post("/workspace/users", { intent: "grant", email: session.email, roles })).status, 303);
  }
  assert.equal((await S.one.post("/crm/new", { intent: "create", playbook_key: "local-preview", source_channel: "field_visit", account_name: `TEST bad ${run}`, contact_name: "x", win_probability: "150" })).status, 422, "probability is 0–100");
  S.big = await create(S.one, "TEST Dash Big", { estimated_value_vnd: "10.000.000", win_probability: "50%" });
  S.unknown = await create(S.one, "TEST Dash Unknown", { estimated_value_vnd: "2000000" });
  S.other = await create(S.two, "TEST Dash Other", { estimated_value_vnd: "40000000", win_probability: "25" });
  assert.deepEqual(jobs(`SELECT estimated_value_vnd AS value, win_probability AS p FROM crm_opportunities WHERE id = ${q(S.big)}`)[0], { value: 10000000, p: 50 });
  assert.equal(jobs(`SELECT win_probability AS p FROM crm_opportunities WHERE id = ${q(S.unknown)}`)[0].p, null, "unknown stays unknown, not 0");
});

test("the opportunity page records the expected value and probability", async () => {
  const page = await S.one.get(`/vi/crm/${S.unknown}`);
  assert.match(page.html, /Tỉ lệ thành công mong đợi/);
  const version = Number(/name="version" value="(\d+)"/.exec(page.html)[1]);
  assert.equal((await S.one.post(`/crm/${S.unknown}`, { intent: "details", version, title: `TEST Dash Unknown ${run}`, estimated_value_vnd: "2000000", win_probability: "" })).status, 303);
  assert.equal(jobs(`SELECT win_probability AS p FROM crm_opportunities WHERE id = ${q(S.unknown)}`)[0].p, null);
});

test("sellers see only their own dashboard, whatever the URL says", async () => {
  const own = await S.one.get(`/crm?owner=${S.two.id}`);
  assert.equal(own.status, 200);
  assert.match(own.html, /Yours \(TEST Dash One/);
  assert.equal(kpi(own.html, "Open deals"), "2");
  assert.equal(kpi(own.html, "Expected contract value"), "12 m");
  assert.equal(kpi(own.html, "Probability-weighted forecast"), "5 m");
  assert.match(own.html, /with value and probability: 1 of 2 deals/, "coverage is stated, not hidden");
  assert.doesNotMatch(own.html, /By seller/, "no team table for sellers");
  assert.doesNotMatch(own.html, /name="owner"/, "no seller filter for sellers");
  const vi = await S.two.get("/vi/crm");
  assert.match(vi.html, /Tổng quan bán hàng/);
  assert.equal(kpi(vi.html, "Cơ hội đang mở"), "1");
});

test("managers see the whole company, one seller, or one product", async () => {
  const company = await S.manager.get("/crm");
  assert.match(company.html, /Whole company/);
  assert.ok(Number(kpi(company.html, "Open deals")) >= 3);
  assert.match(company.html, /By seller/);
  assert.ok(company.html.includes(`TEST Dash One ${run}`) && company.html.includes(`TEST Dash Two ${run}`));
  const one = await S.manager.get(`/crm?owner=${S.one.id}`);
  assert.match(one.html, /TEST Dash One \S+(?:'|&#39;)s/);
  assert.equal(kpi(one.html, "Open deals"), "2");
  assert.equal(kpi(one.html, "Probability-weighted forecast"), "5 m");
  const product = await S.manager.get(`/crm?owner=${S.one.id}&product=lumi-solution`);
  assert.equal(kpi(product.html, "Open deals"), "0", "product filter narrows to that playbook");
  const stages = await S.manager.get(`/crm?owner=${S.two.id}&product=local-preview`);
  assert.match(stages.html, /Open value by stage/);
  assert.equal(kpi(stages.html, "Probability-weighted forecast"), "10 m");
});

test("won deals feed the win rate and the monthly chart", async () => {
  const version = Number(/name="version" value="(\d+)"/.exec((await S.two.get(`/crm/${S.other}`)).html)[1]);
  assert.equal((await S.two.post(`/crm/${S.other}`, { intent: "stage", version, to_stage: "not_fit", reason: "TEST not a fit" })).status, 303);
  const page = await S.two.get("/crm");
  assert.equal(kpi(page.html, "Win rate, 90 days"), "0%");
  assert.match(page.html, /0 won · 1 lost/);
  assert.equal(kpi(page.html, "Open deals"), "0");
  assert.equal(kpi(page.html, "Expected contract value"), "—", "nothing to add up is unknown, not 0");
});
