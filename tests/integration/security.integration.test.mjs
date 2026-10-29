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

  const hr = await userSession(S.admin, { email: `test-sec-hr-${run}@example.test`, name: `TEST Sec HR ${run}` });
  hr.passkey = S.hr.passkey;
  const exportDenied = await hr.rawGet("/api/admin/applications/export.csv");
  assert.equal(exportDenied.status, 303);
  assert.match(exportDenied.location, /^\/workspace\/verify\?/);
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
