import { localFetch as fetch } from "./helpers.mjs";
// Workspace security against a local Worker + D1 with real EmDash sessions:
// passkey verification through EmDash's credentials, and step-up before
// sensitive actions. Synthetic TEST data and a synthetic authenticator only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE, Session, adminSession, content, jobs, q, userSession } from "./helpers.mjs";
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
    // Step-up shows the dialog with the passkey button; an already verified session shows Continue.
    assert.match(page.html, path.includes("step_up") ? /data-passkey="verify"/ : /href="\/vi\/crm"/);
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
  assert.match(security.html, /data-code-band[^>]*><span>Mã chống lừa đảo của bạn<\/span><strong>Mây Xanh 7<\/strong>/, "only its owner can show the code");
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
  assert.equal((await S.admin.post("/workspace/security", { intent: "recovery", user_id: await S.admin.userId(), reason: "self service attempt", confirmed: "1" })).status, 422, "never for oneself");
  assert.equal((await S.hr.post("/workspace/security", { intent: "recovery", user_id: S.gate.id, reason: "Confirmed by video call", confirmed: "1" })).status, 403, "only admins");
  assert.equal((await S.admin.post("/workspace/security", { intent: "recovery", user_id: S.gate.id, reason: "Confirmed by video call", confirmed: "1" })).status, 303);
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

// ---- Round 2 (ui4): the first visit, later sign-ins, own passkeys and recovery, all through EmDash's own endpoints.

const emdashJson = (session) => ({ cookie: session.header(), origin: BASE, "content-type": "application/json", "x-emdash-request": "1" });

/** EmDash's own passkey registration, as the Workspace enrol page calls it. Returns the verify status. */
async function enrolThroughEmDash(session, key) {
  const started = await fetch(`${BASE}/_emdash/api/auth/passkey/register/options`, { method: "POST", headers: emdashJson(session), body: JSON.stringify({ name: "TEST laptop" }) });
  session.absorb(started);
  if (started.status !== 200) return started.status;
  const { data } = await started.json();
  const done = await fetch(`${BASE}/_emdash/api/auth/passkey/register/verify`, { method: "POST", headers: emdashJson(session), body: JSON.stringify({ credential: key.attest(data.options.challenge) }) });
  session.absorb(done);
  return done.status;
}

/** EmDash's own passkey sign-in from a signed-out browser. */
async function signInWithPasskey(email, key, flags) {
  const session = new Session(`signin ${email}`);
  const started = await fetch(`${BASE}/_emdash/api/auth/passkey/options`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ email }) });
  session.absorb(started);
  const { data } = await started.json();
  const done = await fetch(`${BASE}/_emdash/api/auth/passkey/verify`, { method: "POST", headers: { cookie: session.header(), origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ credential: key.assert(data.options.challenge, flags === undefined ? {} : { flags }) }) });
  session.absorb(done);
  session.status = done.status;
  return session;
}

const firstVisit = [
  ["hr", "/admin/jobs", 10], ["sales_manager", "/crm", 20], ["sales_executive", "/vi/crm", 30], ["partner", "/crm", 40],
  ["finance", "/crm", 10], ["fulfillment", "/crm", 20], ["employee", "/workspace", 30], ["people_manager", "/vi/workspace", 40],
  ["hrm_officer", "/workspace", 10], ["hrm_admin", "/hrm", 20], ["payroll_officer", "/workspace", 30],
];

test("first visit: every role and every EmDash role below admin, with no passkey, enrols through EmDash, sets a code and reaches its module", async () => {
  S.firstVisit = {};
  for (const [role, target, emdashRole] of firstVisit) {
    const email = `test-ui4-${role.replaceAll("_", "-")}-${run}@example.test`;
    const person = await userSession(S.admin, { email, name: `TEST First ${role} ${run}`, role: emdashRole });
    assert.equal((await S.admin.post("/workspace/users", { intent: "grant", email, roles: [role] })).status, 303, role);
    const door = await person.rawGet(target);
    assert.equal(door.status, 303, `${role}: no passkey check yet`);
    assert.match(door.location, /^\/(?:vi\/)?workspace\/verify\?reason=session&next=/);
    const enrol = await person.rawGet(door.location);
    assert.equal(enrol.status, 200, `${role}: the enrol screen opens`);
    assert.match(enrol.html, /data-passkey="enrol"/);
    assert.match(enrol.html, /data-step="passkey"/, `${role}: the three-step header`);
    person.passkey = syntheticPasskey(`test_cred_ui4_${role}_${run}`);
    assert.equal(await enrolThroughEmDash(person, person.passkey), 200, `${role}: EmDash lets every role add a first passkey`);
    const listed = await fetch(`${BASE}/_emdash/api/auth/passkey`, { headers: { cookie: person.header() } });
    assert.equal(listed.status, 200, `${role}: EmDash lists own passkeys for EmDash role ${emdashRole}`);
    assert.equal((await listed.json()).data.items.length, 1);
    const codeStep = await person.rawGet(target);
    assert.equal(codeStep.status, 303, `${role}: the new passkey counted as this session's check`);
    assert.match(codeStep.location, /\/workspace\/account\/security\?setup=1&next=/);
    const codePage = await person.rawGet(codeStep.location);
    assert.match(codePage.html, /data-step="code"/, `${role}: step 3 of the same header`);
    const saved = await person.rawPost(codeStep.location, new URLSearchParams({ intent: "code", code: `Sông Hồng ${firstVisit.findIndex(([name]) => name === role) + 1}` }));
    assert.equal(saved.status, 303);
    assert.equal(saved.location, target);
    assert.equal((await person.rawGet(target)).status, 200, `${role} reaches ${target}`);
    assert.equal(jobs(`SELECT COUNT(*) AS n FROM workspace_audit WHERE actor_id = ${q(person.id)} AND action = 'passkey_added'`)[0].n, 1, `${role}: audited`);
    S.firstVisit[role] = person;
  }
});

test("first visit, denied: no Workspace page or API before the check, no page before the code, no second passkey without proof", async () => {
  const email = `test-ui4-denied-${run}@example.test`;
  const person = await userSession(S.admin, { email, name: `TEST Denied ${run}` });
  assert.equal((await S.admin.post("/workspace/users", { intent: "grant", email, roles: ["sales_executive"] })).status, 303);
  assert.equal((await person.rawGet("/crm/api")).status, 303);
  const api = await fetch(`${BASE}/api/workspace/passkey/verify`, { method: "POST", headers: json(person), body: "{}" });
  assert.notEqual(api.status, 200);
  person.passkey = syntheticPasskey(`test_cred_ui4_denied_${run}`);
  assert.equal(await enrolThroughEmDash(person, person.passkey), 200);
  const noCode = await person.rawGet("/crm");
  assert.match(noCode.location ?? "", /account\/security\?setup=1/, "no code, no CRM");
  assert.equal((await person.rawPost("/workspace/account/security?setup=1&next=%2Fcrm", new URLSearchParams({ intent: "code", code: `TEST Denied ${run}` }))).status, 422, "not my own name");
  // A different browser session of the same account (a stolen cookie, say) cannot add a passkey once one exists.
  const other = await userSession(S.admin, { email, name: `TEST Denied ${run}` });
  assert.equal(await enrolThroughEmDash(other, syntheticPasskey(`test_cred_ui4_thief_${run}`)), 403);
  // Outside the Workspace, a CMS-only account gets no Workspace page at all.
  const cms = await userSession(S.admin, { email: `test-ui4-cms-${run}@example.test`, name: `TEST CMS ${run}` });
  assert.equal((await cms.rawGet("/workspace")).status, 403);
});

test("sign-in: signed-out visitors go to the Workspace sign-in page; a verified passkey sign-in through EmDash is the session check", async () => {
  const anonymous = new Session("anonymous");
  const door = await anonymous.rawGet("/vi/crm?view=table");
  assert.equal(door.status, 303);
  assert.equal(door.location, "/vi/workspace/sign-in?next=%2Fvi%2Fcrm%3Fview%3Dtable");
  for (const path of ["/workspace/sign-in?next=%2Fcrm", "/vi/workspace/sign-in", "/workspace/recovery", "/vi/workspace/recovery"]) {
    const page = await anonymous.rawGet(path);
    assert.equal(page.status, 200, path);
    assert.match(page.headers.get("cache-control") ?? "", /no-store/);
  }
  assert.equal((await anonymous.rawGet("/api/workspace/audit/export.csv")).status, 401, "APIs stay closed");
  const exec = S.firstVisit.sales_executive;
  const signedIn = await signInWithPasskey(exec.email, exec.passkey);
  assert.equal(signedIn.status, 200, "EmDash signed the person in");
  assert.equal((await signedIn.rawGet("/crm")).status, 200, "no second passkey prompt");
  assert.ok(jobs(`SELECT COUNT(*) AS n FROM workspace_audit WHERE actor_id = ${q(exec.id)} AND action = 'passkey_verified' AND detail LIKE '%sign_in%'`)[0].n >= 1);
  // Denied: an assertion without user verification signs in to EmDash but is not a Workspace check.
  const presenceOnly = await signInWithPasskey(exec.email, exec.passkey, 0x01);
  if (presenceOnly.status === 200) {
    const page = await presenceOnly.rawGet("/crm");
    assert.equal(page.status, 303);
    assert.match(page.location, /workspace\/verify\?reason=session/);
  }
  // Denied: another person's passkey never signs this person in; EmDash signs in the passkey's own owner.
  const other = await signInWithPasskey(exec.email, S.firstVisit.partner.passkey);
  if (other.status === 200) {
    const me = await (await fetch(`${BASE}/_emdash/api/auth/me`, { headers: { cookie: other.header() } })).json();
    assert.equal(me.data?.id, S.firstVisit.partner.id, "the session is the passkey owner's, not the typed email's");
    assert.notEqual(me.data?.id, exec.id);
  }
});

test("account security: every role renames and removes its own passkeys in the Workspace; removal needs step-up; never someone else's", async () => {
  const partner = S.firstVisit.partner;
  const page = await partner.get("/workspace/account/security");
  assert.equal(page.status, 200);
  assert.doesNotMatch(page.html, /_emdash\/admin\/settings\/security/, "no link to the EmDash admin page");
  assert.match(page.html, /data-passkey-rename/);
  // A second passkey (needs step-up, which this session has).
  assert.equal(await partner.verifyPasskey(), 200);
  const second = syntheticPasskey(`test_cred_ui4_partner2_${run}`);
  assert.equal(await enrolThroughEmDash(partner, second), 200);
  const rename = await fetch(`${BASE}/_emdash/api/auth/passkey/${second.id}`, { method: "PATCH", headers: emdashJson(partner), body: JSON.stringify({ name: "TEST phone" }) });
  assert.equal(rename.status, 200);
  const foreign = await fetch(`${BASE}/_emdash/api/auth/passkey/${S.firstVisit.hr.passkey.id}`, { method: "PATCH", headers: emdashJson(partner), body: JSON.stringify({ name: "x" }) });
  assert.equal(foreign.status, 404, "someone else's passkey is not found");
  // Removal from a session without a fresh check is refused.
  const fresh = await userSession(S.admin, { email: partner.email, name: `TEST First partner ${run}`, role: 40 });
  const refused = await fetch(`${BASE}/_emdash/api/auth/passkey/${second.id}`, { method: "DELETE", headers: emdashJson(fresh) });
  assert.equal(refused.status, 403);
  assert.match(await refused.text(), /STEP_UP_REQUIRED/);
  fresh.passkey = partner.passkey;
  assert.equal(await fresh.verifyPasskey(), 200);
  assert.equal((await fetch(`${BASE}/_emdash/api/auth/passkey/${S.firstVisit.hr.passkey.id}`, { method: "DELETE", headers: emdashJson(fresh) })).status, 404, "never someone else's");
  assert.equal((await fetch(`${BASE}/_emdash/api/auth/passkey/${second.id}`, { method: "DELETE", headers: emdashJson(fresh) })).status, 200);
  assert.equal((await fetch(`${BASE}/_emdash/api/auth/passkey/${partner.passkey.id}`, { method: "DELETE", headers: emdashJson(fresh) })).status, 400, "the last passkey stays");
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM workspace_audit WHERE actor_id = ${q(partner.id)} AND action = 'passkey_removed'`)[0].n, 1);
  assert.equal(content(`SELECT COUNT(*) AS n FROM credentials WHERE user_id = ${q(partner.id)}`)[0].n, 1);
});

test("recovery: someone who lost every passkey gets back in only after an admin opens a window, once", async () => {
  const hr = S.firstVisit.hr;
  // The lost device: a recovery sign-in (EmDash link) gives a session with no passkey to touch.
  const recovering = await userSession(S.admin, { email: hr.email, name: `TEST First hr ${run}`, role: 10 });
  const door = await recovering.rawGet("/admin/jobs");
  assert.match(door.location, /verify\?reason=session/);
  const replacement = syntheticPasskey(`test_cred_ui4_hr_new_${run}`);
  assert.equal(await enrolThroughEmDash(recovering, replacement), 403, "no window yet");
  const before = await recovering.rawGet("/workspace/recovery");
  assert.match(before.html, /data-recovery-state="waiting"/);
  assert.equal((await S.firstVisit.sales_manager.post("/workspace/security", { intent: "recovery", user_id: hr.id, reason: "Confirmed by video call", confirmed: "1" })).status, 403, "only admins");
  assert.equal((await S.admin.post("/workspace/security", { intent: "recovery", user_id: hr.id, reason: "Confirmed by video call" })).status, 422, "identity confirmation is required");
  assert.equal((await S.admin.post("/workspace/security", { intent: "recovery", user_id: hr.id, reason: "Confirmed by video call", confirmed: "1" })).status, 303);
  const open = await recovering.rawGet("/workspace/recovery");
  assert.match(open.html, /data-recovery-state="open"/);
  assert.equal(await enrolThroughEmDash(recovering, replacement), 200, "the window lets them add a new passkey");
  assert.equal((await recovering.rawGet("/admin/jobs")).status, 200, "and the new passkey is this session's check");
  const again = await userSession(S.admin, { email: hr.email, name: `TEST First hr ${run}`, role: 10 });
  assert.equal(await enrolThroughEmDash(again, syntheticPasskey(`test_cred_ui4_hr_third_${run}`)), 403, "the window is used once");
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM workspace_audit WHERE target_user_id = ${q(hr.id)} AND action = 'passkey_added' AND detail LIKE '%recovery_window%'`)[0].n, 1);
});

test("connect an AI agent: a CRM member creates a personal token behind step-up; others are refused", async () => {
  const exec = S.firstVisit.sales_executive;
  for (const path of ["/workspace/account/agents/connect", "/vi/workspace/account/agents/connect"]) {
    const page = await exec.get(path);
    assert.equal(page.status, 200, path);
    assert.match(page.html, /api\/crm\/mcp/);
  }
  assert.equal((await S.firstVisit.hr.get("/workspace/account/agents/connect")).status, 403, "no CRM access, no agent");
  const fresh = await userSession(S.admin, { email: exec.email, name: `TEST First sales_executive ${run}`, role: 30 });
  fresh.passkey = exec.passkey;
  const body = new URLSearchParams({ name: `TEST agent ${run}`, scope: "read", days: "30", request_key: `agent_${run}_abcdefgh` });
  assert.equal(await fresh.verifyPasskey("session"), 200);
  // A session check older than 5 minutes cannot be simulated here, so step-up is shown on a session that never verified.
  const unverified = await userSession(S.admin, { email: exec.email, name: `TEST First sales_executive ${run}`, role: 30 });
  assert.equal((await unverified.rawPost("/workspace/account/agents/connect", body)).status, 303, "an unverified session is sent to the passkey check");
  const created = await fresh.rawPost("/workspace/account/agents/connect", body);
  assert.equal(created.status, 200);
  assert.match(created.html, /data-token>lumi_crm_[A-Za-z0-9_-]{43}</);
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM crm_api_tokens WHERE user_id = ${q(exec.id)} AND name = ${q(`TEST agent ${run}`)}`)[0].n, 1);
  const security = await fresh.get("/workspace/account/security");
  assert.match(security.html, new RegExp(`TEST agent ${run}`), "the agent is listed on My account › Security");
});

test("admin board screens: member record shows security facts without secrets; filters and sheets open; non-admins refused", async () => {
  const hr = S.firstVisit.hr;
  const member = await S.admin.get(`/workspace/users/${hr.id}`);
  assert.equal(member.status, 200);
  assert.match(member.html, /Passkeys \(\d\)/);
  assert.doesNotMatch(member.html, new RegExp(hr.passkey.id), "no credential IDs on the admin view");
  assert.doesNotMatch(member.html, /Sông Hồng/, "never the anti-phishing code");
  for (const path of ["/workspace/users?filter=backup", "/workspace/users?filter=agents", "/workspace/webhooks?sheet=new", "/vi/workspace/webhooks?filter=slack", "/workspace/notifications?filter=on", `/workspace/security?recover=${hr.id}`, "/workspace/audit?kind=denied", "/vi/workspace/roles"]) {
    const page = await S.admin.get(path);
    assert.equal(page.status, 200, path);
  }
  assert.match((await S.admin.get(`/workspace/security?recover=${hr.id}`)).html, /name="confirmed"/, "the recovery dialog asks the admin to confirm identity");
  assert.match((await S.admin.get("/vi/workspace/roles")).html, /Của mình/, "the matrix marks own-records permissions");
  for (const path of ["/workspace/users?filter=backup", `/workspace/security?recover=${hr.id}`, "/workspace/webhooks?sheet=new"]) assert.equal((await S.firstVisit.sales_manager.get(path)).status, 403, path);
});
