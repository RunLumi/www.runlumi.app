import { localFetch as fetch } from "./helpers.mjs";
// Workspace security against a local Worker + D1 with real EmDash sessions:
// passkey verification through EmDash's credentials, and step-up before
// sensitive actions. Synthetic TEST data and a synthetic authenticator only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE, adminSession, content, jobs, q, userSession } from "./helpers.mjs";
import { syntheticPasskey } from "../support/synthetic-passkey.mjs";

const run = Date.now().toString(36);
const S = {};
const json = (session, extra = {}) => ({ cookie: session.header(), origin: BASE, "content-type": "application/json", accept: "application/json", ...extra });

test("setup: an admin and members with roles", async () => {
  S.admin = await adminSession();
  S.hr = await userSession(S.admin, { email: `test-sec-hr-${run}@example.test`, name: `TEST Sec HR ${run}` });
  S.exec = await userSession(S.admin, { email: `test-sec-se-${run}@example.test`, name: `TEST Sec Exec ${run}` });
  S.none = await userSession(S.admin, { email: `test-sec-none-${run}@example.test`, name: `TEST Sec None ${run}` });
  for (const [session, roles] of [[S.hr, ["hr"]], [S.exec, ["sales_executive"]]]) {
    assert.equal((await S.admin.post("/workspace/users", { intent: "grant", email: session.email, roles })).status, 303);
  }
  assert.ok(S.admin.passkeyChecks >= 1, "granting access asked the admin for a passkey check");
});

test("access changes need a fresh passkey check (allowed after verifying, denied before)", async () => {
  const admin = await adminSession();
  const body = new URLSearchParams({ intent: "grant", email: `test-sec-none-${run}@example.test`, roles: "employee", request_key: `grant_none_${run}_abcdefgh` });
  const before = await admin.rawPost("/workspace/users", body);
  assert.equal(before.status, 303);
  assert.match(before.location, /^\/workspace\/verify\?reason=(?:step_up|session)&next=%2Fworkspace%2Fusers$/);
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM workspace_members m JOIN workspace_roles r ON r.user_id = m.user_id WHERE m.user_id = ${q(S.none.id)}`)[0].n, 0, "nothing changed without the check");
  assert.equal(await admin.verifyPasskey(), 200);
  const after = await admin.rawPost("/workspace/users", body);
  assert.equal(after.status, 303);
  assert.match(after.location, /saved=1/);
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM workspace_roles WHERE user_id = ${q(S.none.id)} AND role = 'employee'`)[0].n, 1);
});

test("passkey endpoints: denied for non-members, bearer tokens, other origins and someone else's passkey", async () => {
  const stranger = await userSession(S.admin, { email: `test-sec-stranger-${run}@example.test`, name: `TEST Sec Stranger ${run}` });
  assert.equal((await fetch(`${BASE}/api/workspace/passkey/options`, { method: "POST", headers: json(stranger), body: "{}" })).status, 403, "no Workspace membership");
  assert.equal((await fetch(`${BASE}/api/workspace/passkey/options`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 401, "anonymous");
  assert.equal((await fetch(`${BASE}/api/workspace/passkey/options`, { method: "POST", headers: json(S.hr, { origin: "https://evil.example" }), body: "{}" })).status, 403, "cross-origin");
  assert.equal((await fetch(`${BASE}/api/workspace/passkey/options`, { method: "POST", headers: json(S.hr, { authorization: "Bearer lumi_crm_x" }), body: "{}" })).status, 401, "bearer");
  // S.exec signs with S.hr's passkey: refused and audited.
  assert.equal(await S.hr.verifyPasskey(), 200);
  const started = await fetch(`${BASE}/api/workspace/passkey/options`, { method: "POST", headers: json(S.exec), body: "{}" });
  if (started.status === 409) { assert.equal(await S.exec.verifyPasskey(), 200); }
  const options = (await (await fetch(`${BASE}/api/workspace/passkey/options`, { method: "POST", headers: json(S.exec), body: "{}" })).json()).options;
  const stolen = await fetch(`${BASE}/api/workspace/passkey/verify`, { method: "POST", headers: json(S.exec), body: JSON.stringify({ credential: S.hr.passkey.assert(options.challenge) }) });
  assert.equal(stolen.status, 401);
  assert.ok(jobs(`SELECT COUNT(*) AS n FROM workspace_audit WHERE actor_id = ${q(S.exec.id)} AND action = 'passkey_failed' AND outcome = 'denied'`)[0].n >= 1, "failed attempts are audited");
  // A passkey unknown to EmDash fails the same way.
  const foreign = syntheticPasskey("test_cred_unknown");
  const again = (await (await fetch(`${BASE}/api/workspace/passkey/options`, { method: "POST", headers: json(S.exec), body: "{}" })).json()).options;
  assert.equal((await fetch(`${BASE}/api/workspace/passkey/verify`, { method: "POST", headers: json(S.exec), body: JSON.stringify({ credential: foreign.assert(again.challenge) }) })).status, 401);
  assert.ok(jobs(`SELECT COUNT(*) AS n FROM workspace_audit WHERE actor_id = ${q(S.hr.id)} AND action = 'passkey_verified' AND module = 'account'`)[0].n >= 1);
  assert.equal(content(`SELECT counter FROM credentials WHERE id = ${q(S.hr.passkey.id)}`)[0].counter >= 1, true, "EmDash's signature counter advanced");
});

test("token creation and hiring exports need step-up; afterwards they work and exports are audited", async () => {
  const exec = await userSession(S.admin, { email: `test-sec-se-${run}@example.test`, name: `TEST Sec Exec ${run}` });
  exec.passkey = S.exec.passkey;
  const token = new URLSearchParams({ intent: "token_create", name: `TEST token ${run}`, scope: "read", days: "30", request_key: `token_create_${run}_abcdefgh` });
  const denied = await exec.rawPost("/crm/api", token);
  assert.equal(denied.status, 303);
  assert.match(denied.location, /^\/workspace\/verify\?reason=(?:step_up|session)&next=%2Fcrm%2Fapi/);
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM crm_api_tokens WHERE user_id = ${q(S.exec.id)}`)[0].n, 0);
  assert.equal(await exec.verifyPasskey(), 200);
  const created = await exec.rawPost("/crm/api", token);
  assert.equal(created.status, 200);
  assert.match(created.html, /lumi_crm_[A-Za-z0-9_-]{43}/);
  S.token = /lumi_crm_[A-Za-z0-9_-]{43}/.exec(created.html)[0];

  const hr = await userSession(S.admin, { email: `test-sec-hr-${run}@example.test`, name: `TEST Sec HR ${run}` });
  hr.passkey = S.hr.passkey;
  const exportDenied = await hr.rawGet("/api/admin/applications/export.csv");
  assert.equal(exportDenied.status, 401, "an unverified session reaches no Workspace API");
  assert.match(exportDenied.html, /"code":"passkey_required"/);
  assert.equal(await hr.verifyPasskey(), 200);
  const exported = await hr.rawGet("/api/admin/applications/export.csv");
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get("content-type"), /text\/csv/);
  assert.ok(jobs(`SELECT COUNT(*) AS n FROM workspace_audit WHERE actor_id = ${q(S.hr.id)} AND action = 'data_exported' AND module = 'hiring'`)[0].n >= 1);
  assert.equal((await S.exec.rawGet("/api/admin/applications/export.csv")).status, 403, "step-up never replaces the permission");
});

test("the audit log is append-only", () => {
  assert.throws(() => jobs("UPDATE workspace_audit SET action = 'x' WHERE 1 = 1"), /append-only/);
  assert.throws(() => jobs("DELETE FROM workspace_audit"), /append-only/);
});

test("the passkey page renders in both locales inside the Workspace shell", async () => {
  for (const path of ["/workspace/verify?reason=step_up&next=%2Fcrm%2Fapi", "/vi/workspace/verify?reason=session&next=%2Fvi%2Fcrm"]) {
    const page = await S.exec.get(path);
    assert.equal(page.status, 200, path);
    assert.match(page.html, /class="ws-modules"/);
    assert.match(page.html, /data-passkey="verify"/);
    assert.match(page.html, path.startsWith("/vi") ? /Xác thực/ : /Verify/);
  }
  const evil = await S.exec.get("/workspace/verify?next=https%3A%2F%2Fevil.example%2F");
  assert.match(evil.html, /data-next="\/workspace"/, "foreign return targets fall back to the Workspace");
});

/** The real ceremony without the helper's automatic code setup, to see each gate. */
async function verifyOnly(session) {
  const started = await fetch(`${BASE}/api/workspace/passkey/options`, { method: "POST", headers: json(session), body: "{}" });
  const { options } = await started.json();
  const done = await fetch(`${BASE}/api/workspace/passkey/verify`, { method: "POST", headers: json(session), body: JSON.stringify({ purpose: "session", credential: session.passkey.assert(options.challenge) }) });
  session.absorb(done);
  return done.status;
}

test("R-08 gate: no passkey check, no Workspace (pages redirect, APIs 401); then the anti-phishing code is required", async () => {
  const email = `test-sec-gate-${run}@example.test`;
  const fresh = await userSession(S.admin, { email, name: `TEST Sec Gate ${run}` });
  assert.equal((await S.admin.post("/workspace/users", { intent: "grant", email, roles: ["hr"] })).status, 303);
  const page = await fresh.rawGet("/vi/admin/jobs?x=1");
  assert.equal(page.status, 303);
  assert.equal(page.location, "/vi/workspace/verify?reason=session&next=%2Fvi%2Fadmin%2Fjobs%3Fx%3D1");
  const api = await fresh.rawGet("/api/admin/applications/export.csv");
  assert.equal(api.status, 401);
  assert.match(api.html, /"code":"passkey_required"/);
  assert.equal((await fresh.rawGet("/workspace/verify")).status, 200, "the passkey page itself opens");
  fresh.passkey = (await import("../support/synthetic-passkey.mjs")).syntheticPasskey(`test_cred_gate_${run}`);
  content(`INSERT INTO credentials (id, user_id, public_key, algorithm, counter, device_type, backed_up, transports, name) VALUES (${q(fresh.passkey.id)}, ${q(fresh.id)}, X'${fresh.passkey.publicKeyHex}', -7, 0, 'singleDevice', 0, '["internal"]', 'Synthetic')`);
  assert.equal(await verifyOnly(fresh), 200);
  const noCode = await fresh.rawGet("/admin/jobs");
  assert.equal(noCode.status, 303);
  assert.equal(noCode.location, "/workspace/account/security?setup=1&next=%2Fadmin%2Fjobs");
  const bad = await fresh.rawPost("/workspace/account/security?setup=1&next=%2Fadmin%2Fjobs", new URLSearchParams({ intent: "code", code: "<b>" }));
  assert.equal(bad.status, 422);
  const saved = await fresh.rawPost("/workspace/account/security?setup=1&next=%2Fadmin%2Fjobs", new URLSearchParams({ intent: "code", code: "Mây Xanh 7" }));
  assert.equal(saved.status, 303);
  assert.equal(saved.location, "/admin/jobs");
  assert.equal((await fresh.rawGet("/admin/jobs")).status, 200);
  const security = await fresh.rawGet("/vi/workspace/account/security");
  assert.equal(security.status, 200);
  assert.match(security.html, /Mã chống lừa đảo của bạn: Mây Xanh 7/, "the email preview starts with the person's code");
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM workspace_audit WHERE actor_id = ${q(fresh.id)} AND action = 'anti_phishing_set'`)[0].n, 1);
  assert.doesNotMatch(JSON.stringify(jobs(`SELECT detail FROM workspace_audit WHERE actor_id = ${q(fresh.id)}`)), /Mây Xanh/, "the code is never in the audit log");
  S.gate = fresh;
});

test("adding a passkey in EmDash needs an existing one; an admin recovery window opens it once, never for oneself", async () => {
  const unverified = await userSession(S.admin, { email: `test-sec-gate-${run}@example.test`, name: `TEST Sec Gate ${run}` });
  const emdash = (session) => ({ cookie: session.header(), origin: BASE, "content-type": "application/json", "x-emdash-request": "1" });
  const blocked = await fetch(`${BASE}/_emdash/api/auth/passkey/register/options`, { method: "POST", headers: emdash(unverified), body: "{}" });
  assert.equal(blocked.status, 403);
  assert.match(await blocked.text(), /STEP_UP_REQUIRED/);
  assert.equal((await S.admin.post("/workspace/security", { intent: "recovery", user_id: await S.admin.userId(), reason: "self service attempt" })).status, 422, "never for oneself");
  assert.equal((await S.hr.post("/workspace/security", { intent: "recovery", user_id: S.gate.id, reason: "Confirmed by video call" })).status, 403, "only admins");
  assert.equal((await S.admin.post("/workspace/security", { intent: "recovery", user_id: S.gate.id, reason: "Confirmed by video call" })).status, 303);
  const opened = await fetch(`${BASE}/_emdash/api/auth/passkey/register/options`, { method: "POST", headers: emdash(unverified), body: "{}" });
  assert.equal(opened.status, 200, "the recovery window lets them start adding a passkey");
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM workspace_audit WHERE action = 'passkey_recovery_opened' AND target_user_id = ${q(S.gate.id)}`)[0].n, 1);
  const stranger = await userSession(S.admin, { email: `test-sec-stranger-${run}@example.test`, name: `TEST Sec Stranger ${run}` });
  assert.notEqual((await fetch(`${BASE}/_emdash/api/auth/passkey/register/options`, { method: "POST", headers: emdash(stranger), body: "{}" })).status, 403, "people outside the Workspace are left to EmDash");
});

const adminPaths = ["/workspace/audit", "/workspace/security", "/workspace/notifications", "/workspace/notifications/new", "/workspace/webhooks", "/workspace/agents"];

test("admin security screens: allowed for System Super Admin in both locales, denied for every other role", async () => {
  for (const path of adminPaths) {
    for (const prefix of ["", "/vi"]) {
      const page = await S.admin.get(prefix + path);
      assert.equal(page.status, 200, prefix + path);
      assert.match(page.html, /class="ws-modules"|ws-launcher|WorkspaceShell|ws-header/, `${prefix + path} renders inside the shell`);
    }
    assert.equal((await S.hr.get(path)).status, 403, `HR ${path}`);
    assert.equal((await S.exec.get(path)).status, 403, `Sales Executive ${path}`);
  }
  assert.equal((await S.hr.get("/workspace/account/security")).status, 200, "everyone reaches their own security page");
  assert.equal((await S.exec.get("/api/workspace/audit/export.csv")).status, 403);
});

test("audit review: security events listed, event child screen, CSV export behind step-up and itself audited", async () => {
  const list = await S.admin.get("/workspace/audit?kind=security");
  assert.match(list.html, /Passkey verified/);
  const id = /href="\/workspace\/audit\/(aud_[a-f0-9]+)"/.exec(list.html)?.[1];
  assert.ok(id);
  const event = await S.admin.get(`/vi/workspace/audit/${id}`);
  assert.equal(event.status, 200);
  assert.match(event.html, /Nhật ký kiểm toán/);
  assert.equal((await S.admin.get("/workspace/audit/aud_doesnotexist")).status, 404);
  const csv = await S.admin.get("/api/workspace/audit/export.csv?kind=security&lang=en");
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  assert.match(csv.html, /passkey_verified/);
  assert.ok(jobs("SELECT COUNT(*) AS n FROM workspace_audit WHERE action = 'data_exported' AND module = 'admin'")[0].n >= 1);
});

test("notification rules and webhooks: admins configure with step-up; webhooks refuse to store a URL without the encryption key", async () => {
  const created = await S.admin.post("/workspace/notifications/new", { name: `TEST rule ${run}`, events: ["stage", "created"], email: "1", record_owner: "1", recipient_roles: "sales_manager", enabled: "1" });
  assert.equal(created.status, 303);
  assert.match(created.location, /^\/workspace\/notifications\/rul_[a-f0-9]{32}\?saved=rule$/);
  const page = await S.admin.get(created.location);
  assert.equal(page.status, 200);
  assert.match(page.html, new RegExp(`TEST rule ${run}`));
  const version = /name="version" value="(\d+)"/.exec(page.html)[1];
  assert.equal((await S.admin.post(created.location.split("?")[0], { name: `TEST rule ${run}`, events: "stage", email: "1", record_owner: "1", version: "99" })).status, 422, "stale versions are refused");
  assert.equal((await S.admin.post(created.location.split("?")[0], { name: `TEST rule ${run} v2`, events: "stage", email: "1", record_owner: "1", version })).status, 303);
  assert.equal((await S.admin.post("/workspace/notifications/new", { name: "x", events: "stage" })).status, 422, "a rule needs a channel");
  assert.equal((await S.hr.post("/workspace/notifications/new", { name: "x", events: "stage", email: "1", record_owner: "1" })).status, 403);
  const hook = await S.admin.post("/workspace/webhooks", { intent: "create", platform: "slack", name: "TEST Slack", url: "https://hooks.slack.com/services/T0123456/B0123456/abcdefghijklmnopqrstuvwx" });
  assert.equal(hook.status, 503, "no WORKSPACE_WEBHOOK_KEY in the test Worker: nothing stored");
  assert.equal(jobs("SELECT COUNT(*) AS n FROM workspace_notification_destinations")[0].n, 0);
  assert.equal(jobs("SELECT COUNT(*) AS n FROM workspace_audit WHERE action = 'notification_rule_saved'")[0].n >= 2, true);
});

test("AI agents: admin module levels apply to the next MCP call, and every call is audited", async () => {
  const mcp = (body) => fetch(`${BASE}/api/crm/mcp`, { method: "POST", headers: { authorization: `Bearer ${S.token}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }) }).then((response) => response.json());
  const before = await mcp({ method: "tools/list" });
  assert.ok(before.result.tools.some((tool) => tool.name === "workspace_my_access"));
  const access = await mcp({ method: "tools/call", params: { name: "workspace_my_access", arguments: {} } });
  assert.deepEqual(access.result.structuredContent.never_available_to_agents.map((item) => item.module), ["hiring", "hrm", "finance"]);
  assert.equal((await S.admin.post("/workspace/agents", { intent: "policy", level_crm: "off", level_workspace: "read" })).status, 303);
  assert.equal((await S.hr.post("/workspace/agents", { intent: "policy", level_crm: "write", level_workspace: "read" })).status, 403);
  const after = await mcp({ method: "tools/list" });
  assert.ok(!after.result.tools.some((tool) => tool.name === "search_companies"), "CRM tools disappear for every agent");
  const refused = await mcp({ method: "tools/call", params: { name: "search_companies", arguments: {} } });
  assert.equal(refused.result.structuredContent.error.code, "module_not_allowed");
  assert.ok(jobs(`SELECT COUNT(*) AS n FROM workspace_audit WHERE action = 'agent_tool_called' AND via = 'mcp' AND outcome = 'denied' AND actor_id = ${q(S.exec.id)}`)[0].n >= 1);
  assert.ok(jobs(`SELECT COUNT(*) AS n FROM workspace_audit WHERE action = 'agent_tool_called' AND via = 'mcp' AND outcome = 'success' AND actor_id = ${q(S.exec.id)}`)[0].n >= 1);
  assert.equal((await S.admin.post("/workspace/agents", { intent: "policy", level_crm: "write", level_workspace: "read" })).status, 303);
  const restored = (await mcp({ method: "tools/list" })).result.tools.map((tool) => tool.name);
  assert.ok(restored.includes("search_companies"));
  assert.ok(!restored.includes("create_company"), "a read-only token still sees no write tools");
});
