// Personal API tokens, the REST API and the MCP server against a real local
// Worker + D1 + EmDash. Synthetic TEST data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE, adminSession, jobs, q, userSession } from "./helpers.mjs";

const run = Date.now().toString(36);
const S = {};
const T = {};
const ids = {};

async function call(token, method, path, body, headers = {}) {
  const response = await fetch(BASE + path, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined, redirect: "manual",
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* empty or non-JSON body */ }
  return { status: response.status, json, headers: response.headers };
}
const mcp = (token, method, params, id = 1, headers) => call(token, "POST", "/api/crm/mcp", { jsonrpc: "2.0", id, method, params }, headers);

async function newToken(session, name, scope) {
  const response = await session.post("/crm/api", { intent: "token_create", name, scope, days: "30" });
  assert.equal(response.status, 200, `token page: ${response.status}`);
  const secret = /lumi_crm_[A-Za-z0-9_-]{43}/.exec(response.html)?.[0];
  assert.ok(secret, "the secret is shown once");
  return secret;
}

test("setup: tokens are created on the CRM API page and stored only as a hash", async () => {
  S.admin = await adminSession();
  S.manager = await userSession(S.admin, { email: `test-api-sm-${run}@example.test`, name: `TEST API Manager ${run}` });
  S.one = await userSession(S.admin, { email: `test-api-one-${run}@example.test`, name: `TEST API One ${run}` });
  S.two = await userSession(S.admin, { email: `test-api-two-${run}@example.test`, name: `TEST API Two ${run}` });
  S.hr = await userSession(S.admin, { email: `test-api-hr-${run}@example.test`, name: `TEST API HR ${run}` });
  for (const [session, roles] of [[S.manager, ["sales_manager"]], [S.one, ["sales_executive"]], [S.two, ["sales_executive"]], [S.hr, ["hr"]]]) {
    assert.equal((await S.admin.post("/workspace/users", { intent: "grant", email: session.email, roles })).status, 303);
  }
  assert.equal((await S.hr.get("/crm/api")).status, 403, "no CRM role, no API page");
  assert.match((await S.one.get("/vi/crm/api")).html, /Tạo token/);
  T.oneRead = await newToken(S.one, "TEST read", "read");
  T.oneWrite = await newToken(S.one, "TEST agent", "write");
  T.twoWrite = await newToken(S.two, "TEST two", "write");
  T.managerWrite = await newToken(S.manager, "TEST manager", "write");
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM crm_api_tokens WHERE token_hash = ${q(T.oneRead)} OR prefix = ${q(T.oneRead)}`)[0].n, 0, "the secret itself is never stored");
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM crm_api_tokens WHERE user_id = ${q(S.one.id)}`)[0].n, 2);
  assert.ok(!(await S.one.get("/crm/api")).html.includes(T.oneRead), "the secret is not shown again");
});

test("REST: bearer tokens only, scoped to the token owner's permissions", async () => {
  assert.equal((await call(null, "GET", "/api/crm/v1/me")).status, 401);
  assert.equal((await call("lumi_crm_" + "x".repeat(43), "GET", "/api/crm/v1/me")).status, 401);
  const session = await fetch(`${BASE}/api/crm/v1/me`, { headers: { cookie: S.one.header() } });
  assert.equal(session.status, 401, "a browser session cookie is not accepted");
  const me = await call(T.oneRead, "GET", "/api/crm/v1/me");
  assert.equal(me.status, 200);
  assert.equal(me.json.data.id, S.one.id);
  assert.equal(me.json.data.token.scope, "read");
  assert.match(me.headers.get("cache-control") ?? "", /no-store/);
  const readOnly = await call(T.oneRead, "POST", "/api/crm/v1/companies", { name: `TEST nope ${run}` });
  assert.equal(readOnly.status, 403);
  assert.equal(readOnly.json.error.code, "read_only_token");
  assert.equal((await call(T.oneWrite, "POST", "/api/crm/v1/companies", "not json")).status, 400);
  assert.equal((await call(T.oneWrite, "DELETE", "/api/crm/v1/companies")).status, 405);
  assert.equal((await call(T.oneWrite, "GET", "/api/crm/v1/nothing")).status, 404);
});

test("REST: an agent creates a company, contact and opportunity, then updates it", async () => {
  const company = await call(T.oneWrite, "POST", "/api/crm/v1/companies", { name: `TEST API Cafe ${run}`, industry: "Cafe", owner_id: S.two.id, contact: { name: `TEST API Owner ${run}`, role: "owner", phone: `09${String(Date.now()).slice(-8)}` } });
  assert.equal(company.status, 201, JSON.stringify(company.json));
  ids.company = company.json.data.id;
  assert.equal(company.json.data.owner_id, S.one.id, "executives own what they create");
  assert.match(jobs(`SELECT actor_name FROM crm_events WHERE account_id = ${q(ids.company)} AND kind = 'account_created'`)[0].actor_name, /\(API: TEST agent\)/, "history shows the API and token");
  const contact = await call(T.oneWrite, "POST", "/api/crm/v1/contacts", { company_id: ids.company, name: `TEST API Barista ${run}`, role: "staff" });
  assert.equal(contact.status, 201);
  ids.contact = contact.json.data.id;
  const invalid = await call(T.oneWrite, "POST", "/api/crm/v1/contacts", { company_id: ids.company, name: "TEST x", email: "not-an-email" });
  assert.equal(invalid.status, 422);
  assert.equal(invalid.json.error.fields.email, "invalid");
  const opp = await call(T.oneWrite, "POST", "/api/crm/v1/opportunities", { company_id: ids.company, contact_id: ids.contact, playbook_key: "local-preview", source_channel: "field_visit" }, { "idempotency-key": `idem${run}`.padEnd(20, "x") });
  assert.equal(opp.status, 201, JSON.stringify(opp.json));
  ids.opp = opp.json.data.id;
  const retry = await call(T.oneWrite, "POST", "/api/crm/v1/opportunities", { company_id: ids.company, contact_id: ids.contact, playbook_key: "local-preview", source_channel: "field_visit" }, { "idempotency-key": `idem${run}`.padEnd(20, "x") });
  assert.equal(retry.json.data.id, ids.opp, "a retry with the same idempotency key writes once");
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM crm_opportunities WHERE account_id = ${q(ids.company)}`)[0].n, 1);
  assert.equal((await call(T.oneWrite, "GET", "/api/crm/v1/me", null, { "idempotency-key": "short" })).status, 422, "a malformed key is refused, not ignored");
  const version = opp.json.data.version;
  const updated = await call(T.oneWrite, "PATCH", `/api/crm/v1/opportunities/${ids.opp}`, { next_action: "TEST call back Friday", version });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.data.next_action, "TEST call back Friday");
  assert.equal(updated.json.data.title, `TEST API Cafe ${run}`, "fields not passed stay unchanged");
  assert.equal((await call(T.oneWrite, "PATCH", `/api/crm/v1/opportunities/${ids.opp}`, { next_action: "stale", version })).status, 409, "a stale version is rejected");
  assert.equal((await call(T.oneWrite, "PATCH", `/api/crm/v1/opportunities/${ids.opp}/fields`, { fields: { made_up: "x" } })).status, 422);
  const fields = await call(T.oneWrite, "PATCH", `/api/crm/v1/opportunities/${ids.opp}/fields`, { fields: { industry: "Cafe", location: "District 1" } });
  assert.equal(fields.status, 200);
  assert.equal(fields.json.data.fields.location, "District 1");
  const blocked = await call(T.oneWrite, "POST", `/api/crm/v1/opportunities/${ids.opp}/stage`, { to_stage: "owner_talked" });
  assert.equal(blocked.status, 422);
  assert.match(blocked.json.error.fields.to_stage, /^missing:/, "stage requirements still apply");
  assert.equal((await call(T.oneWrite, "PATCH", `/api/crm/v1/opportunities/${ids.opp}`, { estimated_value_vnd: 1500000.5 })).status, 422, "whole VND only");
  const key = { "idempotency-key": `note${run}`.padEnd(20, "n") };
  assert.equal((await call(T.oneWrite, "POST", `/api/crm/v1/opportunities/${ids.opp}/notes`, { note: "TEST owner prefers Zalo" }, key)).status, 201);
  assert.equal((await call(T.oneWrite, "POST", `/api/crm/v1/opportunities/${ids.opp}/notes`, { note: "TEST a different note" }, key)).status, 201);
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM crm_events WHERE opportunity_id = ${q(ids.opp)} AND kind = 'note'`)[0].n, 2, "a reused key never swallows a different write");
  // Money stays out of the API, even for the deal's owner.
  jobs(`INSERT INTO crm_events (id, opportunity_id, account_id, actor_id, actor_name, kind, body, created_at) VALUES ('evt_test_${run}', ${q(ids.opp)}, ${q(ids.company)}, 'test', 'TEST Finance', 'payment_confirmed', '{"amount_vnd":1990000}', '2026-10-12T00:00:00.000Z')`);
  const detail = await call(T.oneWrite, "GET", `/api/crm/v1/opportunities/${ids.opp}`);
  assert.ok(detail.json.data.recent_activity.some((event) => event.kind === "note"));
  assert.ok(!JSON.stringify(detail.json.data).includes("payment_confirmed") && !JSON.stringify(detail.json.data).includes("1990000"));
});

test("REST: other people's records stay invisible; managers see the team", async () => {
  assert.equal((await call(T.twoWrite, "GET", `/api/crm/v1/companies/${ids.company}`)).status, 404);
  assert.equal((await call(T.twoWrite, "PATCH", `/api/crm/v1/companies/${ids.company}`, { name: "TEST hijack" })).status, 404);
  assert.equal((await call(T.twoWrite, "POST", `/api/crm/v1/opportunities/${ids.opp}/notes`, { note: "TEST nope" })).status, 404);
  const search = await call(T.twoWrite, "GET", `/api/crm/v1/contacts?q=${encodeURIComponent("API Owner")}`);
  assert.ok(!JSON.stringify(search.json).includes(`TEST API Owner ${run}`));
  const team = await call(T.managerWrite, "GET", `/api/crm/v1/companies/${ids.company}`);
  assert.equal(team.status, 200);
  assert.equal(team.json.data.contacts.length, 2);
});

test("MCP: initialize, list tools by scope, call tools, report errors as tool results", async () => {
  const init = await mcp(T.oneRead, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  assert.equal(init.status, 200);
  assert.equal(init.json.result.protocolVersion, "2025-06-18");
  assert.equal(init.json.result.serverInfo.name, "lumi-crm");
  assert.equal((await call(T.oneRead, "POST", "/api/crm/mcp", { jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
  const readTools = (await mcp(T.oneRead, "tools/list", {})).json.result.tools.map((tool) => tool.name);
  assert.ok(readTools.includes("search_companies") && !readTools.includes("create_company"), "read tokens see read tools only");
  const writeTools = (await mcp(T.oneWrite, "tools/list", {})).json.result.tools;
  assert.ok(writeTools.some((tool) => tool.name === "move_stage" && tool.annotations.readOnlyHint === false));
  assert.equal(writeTools.find((tool) => tool.name === "set_do_not_contact").annotations.destructiveHint, true);
  const found = await mcp(T.oneRead, "tools/call", { name: "search_companies", arguments: { q: "API Cafe" } });
  assert.equal(found.json.result.structuredContent.companies[0].id, ids.company);
  const refused = await mcp(T.oneRead, "tools/call", { name: "create_company", arguments: { name: "TEST no" } });
  assert.equal(refused.json.result.isError, true);
  assert.equal(refused.json.result.structuredContent.error.code, "read_only_token");
  const noted = await mcp(T.oneWrite, "tools/call", { name: "add_note", arguments: { opportunity_id: ids.opp, note: "TEST from MCP" } });
  assert.equal(noted.json.result.isError, undefined);
  const hidden = await mcp(T.twoWrite, "tools/call", { name: "get_opportunity", arguments: { opportunity_id: ids.opp } });
  assert.equal(hidden.json.result.structuredContent.error.code, "not_found");
  assert.equal((await mcp(T.oneRead, "nope/method", {})).json.error.code, -32601);
  assert.equal((await mcp(T.oneRead, "ping", {}, 1, { origin: "https://evil.example" })).status, 403, "cross-origin browsers are refused");
  assert.equal((await call(T.oneRead, "GET", "/api/crm/mcp")).status, 405);
  assert.equal((await mcp(null, "ping", {})).status, 401);
});

test("tokens stop at revocation and when Workspace access is removed; never open hiring", async () => {
  assert.equal((await call(T.oneWrite, "POST", "/api/admin/jobs/create", { title: "x" })).status, 401, "hiring APIs ignore API tokens");
  const id = jobs(`SELECT id FROM crm_api_tokens WHERE user_id = ${q(S.one.id)} AND name = 'TEST read'`)[0].id;
  assert.equal((await S.two.post("/crm/api", { intent: "token_revoke", token_id: id })).status, 404, "nobody revokes another person's token");
  assert.equal((await S.one.post("/crm/api", { intent: "token_revoke", token_id: id })).status, 303);
  assert.equal((await call(T.oneRead, "GET", "/api/crm/v1/me")).status, 401);
  assert.equal((await S.admin.post("/workspace/users", { intent: "update", user_id: S.two.id, roles: ["sales_executive"], enabled: "0" })).status, 303);
  assert.equal((await call(T.twoWrite, "GET", "/api/crm/v1/me")).status, 401, "removing CRM access stops the token");
  assert.equal((await S.admin.post("/workspace/users", { intent: "update", user_id: S.two.id, roles: ["sales_executive"], enabled: "1" })).status, 303);
  assert.equal((await call(T.twoWrite, "GET", "/api/crm/v1/me")).status, 401, "restoring access does not revive old tokens");
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM crm_api_tokens WHERE user_id = ${q(S.two.id)} AND revoked_at IS NULL`)[0].n, 0);
  assert.match((await S.admin.get("/crm/api")).html, /TEST API Manager/, "admins see everyone's tokens");
});

test("each token is limited to 120 requests a minute", async () => {
  const token = await newToken(S.manager, "TEST burst", "read");
  const statuses = [];
  for (let index = 0; index < 125; index += 1) statuses.push((await call(token, "GET", "/api/crm/v1/me")).status);
  // A minute boundary may reset the window mid-loop; the limit must still trip once 120 are spent.
  assert.ok(statuses.includes(429), "the limit applies");
  assert.ok(statuses.filter((status) => status === 200).length >= 120);
});
