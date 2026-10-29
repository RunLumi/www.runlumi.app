import { test } from "node:test";
import assert from "node:assert/strict";
import { PASSKEY_SESSION_MS, STEP_UP_WINDOW_MS, StepUpRequiredError, passkeyOptions, requireStepUp, safeReturn, sessionPasskeyVerified, stepUpFresh, verifyPasskey, verifyPath, type CredentialSource, type StoredCredential } from "../src/lib/workspace/passkey.ts";
import { stepUpGuard, stepUpRequiredResponse } from "../src/lib/workspace/step-up.ts";
import { optionsRoute, verifyRoute } from "../src/lib/workspace/passkey-routes.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
// @ts-expect-error test helper without types
import { memorySession, syntheticPasskey } from "./support/synthetic-passkey.mjs";

function source(...items: StoredCredential[]): CredentialSource & { touched: { id: string; counter: number }[] } {
  const touched: { id: string; counter: number }[] = [];
  return {
    touched,
    forUser: async (userId) => items.filter((item) => item.userId === userId),
    byId: async (id) => items.find((item) => item.id === id) ?? null,
    touch: async (id, counter) => { touched.push({ id, counter }); const item = items.find((entry) => entry.id === id); if (item) item.counter = counter; },
  };
}
const stored = (key: { id: string; publicKey: Uint8Array }, userId: string): StoredCredential => ({ id: key.id, userId, publicKey: key.publicKey, algorithm: -7, counter: 0, name: "Synthetic laptop", transports: ["internal"] });

test("a fresh passkey assertion of the signed-in person's own credential opens step-up for five minutes", async () => {
  const key = syntheticPasskey("cred_alice"), session = memorySession(), creds = source(stored(key, "alice"));
  assert.equal(await stepUpFresh(session, "alice"), false, "nothing is fresh before verification");
  await assert.rejects(requireStepUp(session, "alice"), StepUpRequiredError);
  const options = await passkeyOptions(session, creds, "alice");
  assert.ok(options);
  assert.equal(options!.userVerification, "required");
  assert.deepEqual(options!.allowCredentials?.map((item) => item.id), ["cred_alice"], "only the person's own passkeys are offered");
  const now = Date.now();
  const result = await verifyPasskey(session, creds, "alice", { credential: key.assert(options!.challenge) }, now);
  assert.deepEqual(result, { ok: true, credentialId: "cred_alice", credentialName: "Synthetic laptop" });
  assert.deepEqual(creds.touched, [{ id: "cred_alice", counter: 1 }], "EmDash's signature counter is advanced");
  assert.equal(await stepUpFresh(session, "alice", now + STEP_UP_WINDOW_MS - 1000), true);
  assert.equal(await stepUpFresh(session, "alice", now + STEP_UP_WINDOW_MS + 1), false, "step-up expires after five minutes");
  assert.equal(await sessionPasskeyVerified(session, "alice", now + STEP_UP_WINDOW_MS + 1), true, "the session check lasts longer");
  assert.equal(await sessionPasskeyVerified(session, "alice", now + PASSKEY_SESSION_MS + 1), false, "and ends after 12 hours");
  assert.equal(await stepUpFresh(session, "bob", now), false, "a mark never transfers to another user in the same session");
  await requireStepUp(session, "alice", now + 1000);
});

test("replays, other people's passkeys, missing user verification and wrong origins are refused", async () => {
  const alice = syntheticPasskey("cred_a"), bob = syntheticPasskey("cred_b");
  const creds = source(stored(alice, "alice"), stored(bob, "bob"));
  const cases: [string, (challenge: string) => unknown, string][] = [
    ["another user's passkey", (challenge) => ({ credential: bob.assert(challenge) }), "credential_not_found"],
    ["no user verification", (challenge) => ({ credential: alice.assert(challenge, { flags: 0x01 }) }), "user_verification_not_verified"],
    ["phishing origin", (challenge) => ({ credential: alice.assert(challenge, { origin: "https://runlumi.app.evil.example" }) }), "invalid_origin"],
    ["other relying party", (challenge) => ({ credential: alice.assert(challenge, { rpId: "evil.example" }) }), "invalid_rp_id_hash"],
    ["registration ceremony", (challenge) => ({ credential: alice.assert(challenge, { type: "webauthn.create" }) }), "invalid_client_data_type"],
    ["unknown challenge", () => ({ credential: alice.assert("A".repeat(43)) }), "challenge_not_found"],
    ["garbage", () => ({ credential: { id: "cred_a", response: {} } }), "invalid_response"],
    ["no body", () => null, "invalid_response"],
  ];
  for (const [label, body, code] of cases) {
    const session = memorySession();
    const options = await passkeyOptions(session, creds, "alice");
    const result = await verifyPasskey(session, creds, "alice", body(options!.challenge));
    assert.equal(result.ok, false, label);
    assert.equal((result as { code: string }).code, code, label);
    assert.equal(await stepUpFresh(session, "alice"), false, `${label}: no step-up`);
  }
  const session = memorySession();
  const options = await passkeyOptions(session, creds, "alice");
  const assertion = alice.assert(options!.challenge);
  assert.equal((await verifyPasskey(session, creds, "alice", { credential: assertion })).ok, true);
  assert.equal((await verifyPasskey(memorySession(), creds, "alice", { credential: assertion })).ok, false, "an assertion cannot be replayed into another session");
  assert.equal((await verifyPasskey(session, creds, "alice", { credential: assertion })).ok, false, "the challenge is single use");
  assert.equal(await passkeyOptions(memorySession(), creds, "carol"), null, "no passkey yet");
});

test("tampered or foreign marks never count", async () => {
  const session = memorySession();
  session.set("lumi_workspace_passkey", { userId: "alice", at: Date.now() + 60_000, credentialId: "x" });
  assert.equal(await stepUpFresh(session, "alice"), false, "future timestamps are rejected");
  session.set("lumi_workspace_passkey", { userId: "alice", at: "now", credentialId: "x" });
  assert.equal(await stepUpFresh(session, "alice"), false);
  assert.equal(await stepUpFresh(undefined, "alice"), false, "no session, no step-up");
});

test("return paths stay inside the Workspace", () => {
  assert.equal(safeReturn("/crm/api#tokens", false), "/crm/api#tokens");
  assert.equal(safeReturn("/vi/workspace/users?x=1", true), "/vi/workspace/users?x=1");
  for (const bad of ["//evil.example/x", "https://evil.example/workspace", "/workspace/../api/x", "/blog", "/api/crm/v1/me", "/crm\\evil", null]) {
    assert.equal(safeReturn(bad, false), "/workspace", String(bad));
  }
  assert.equal(verifyPath(true, "/vi/crm/api"), "/vi/workspace/verify?reason=step_up&next=%2Fvi%2Fcrm%2Fapi");
});

test("step-up guard: navigations go to the passkey page, fetch callers get 403 JSON, fresh sessions pass", async () => {
  const user = makeUser({ id: "alice", name: "Alice", email: "alice@example.test" }, false, ["hr"]);
  const url = new URL("https://runlumi.app/api/admin/applications/export.csv");
  const nav = new Request(url, { headers: { referer: "https://runlumi.app/vi/admin/jobs/applications" } });
  const session = memorySession();
  const redirect = await stepUpGuard({ session, locals: { workspace: user } as App.Locals, request: nav, url });
  assert.equal(redirect!.status, 303);
  assert.equal(redirect!.headers.get("location"), "/vi/workspace/verify?reason=step_up&next=%2Fvi%2Fadmin%2Fjobs%2Fapplications");
  assert.equal(redirect!.headers.get("cache-control"), "private, no-store");
  const api = stepUpRequiredResponse({ request: new Request(url, { headers: { accept: "application/json" } }), url });
  assert.equal(api.status, 403);
  assert.equal((await api.json()).error.code, "step_up_required");
  session.set("lumi_workspace_passkey", { userId: "alice", at: Date.now(), credentialId: "c" });
  assert.equal(await stepUpGuard({ session, locals: { workspace: user } as App.Locals, request: nav, url }), null);
  assert.ok(await stepUpGuard({ session, locals: {} as App.Locals, request: nav, url }), "no Workspace user, no pass");
});

test("passkey endpoints: allowed same-origin JSON for a member; denied for bearer tokens, other origins, non-members", async () => {
  const user = makeUser({ id: "alice", name: "Alice", email: "alice@example.test" }, false, ["employee"]);
  const key = syntheticPasskey("cred_route"), creds = source(stored(key, "alice"));
  const url = new URL("https://runlumi.app/api/workspace/passkey/options");
  const audits: unknown[][] = [];
  const db = { prepare: () => ({ bind: (...args: unknown[]) => ({ run: async () => { audits.push(args); } }) }) } as unknown as D1Database;
  const request = (body: unknown, headers: Record<string, string> = {}) => new Request(url, { method: "POST", body: JSON.stringify(body), headers: { origin: "https://runlumi.app", "content-type": "application/json", ...headers } });
  const session = memorySession();
  const denied: [string, Parameters<typeof optionsRoute>[0], number][] = [
    ["bearer token", { session, locals: { workspace: user } as App.Locals, request: request({}, { authorization: "Bearer lumi_crm_x" }), url }, 401],
    ["cross-origin", { session, locals: { workspace: user } as App.Locals, request: request({}, { origin: "https://evil.example" }), url }, 403],
    ["form post", { session, locals: { workspace: user } as App.Locals, request: new Request(url, { method: "POST", body: "a=1", headers: { origin: "https://runlumi.app", "content-type": "application/x-www-form-urlencoded" } }), url }, 415],
    ["no Workspace membership", { session, locals: {} as App.Locals, request: request({}), url }, 403],
    ["no session", { locals: { workspace: user } as App.Locals, request: request({}), url }, 503],
  ];
  for (const [label, context, status] of denied) assert.equal((await optionsRoute(context, creds)).status, status, label);
  const started = await optionsRoute({ session, locals: { workspace: user } as App.Locals, request: request({}), url }, creds);
  assert.equal(started.status, 200);
  const { options } = await started.json();
  const failed = await verifyRoute({ session, locals: { workspace: user } as App.Locals, request: request({ credential: key.assert(options.challenge, { flags: 1 }) }), url }, { credentials: creds, db });
  assert.equal(failed.status, 401);
  assert.equal(audits.at(-1)![3], "passkey_failed", "failed attempts are audited");
  assert.equal(audits.at(-1)![8], "denied");
  const again = await (await optionsRoute({ session, locals: { workspace: user } as App.Locals, request: request({}), url }, creds)).json();
  const ok = await verifyRoute({ session, locals: { workspace: user } as App.Locals, request: request({ purpose: "session", credential: key.assert(again.options.challenge) }), url }, { credentials: creds, db });
  assert.equal(ok.status, 200);
  assert.equal(audits.at(-1)![3], "passkey_verified");
  assert.doesNotMatch(String(audits.at(-1)![5]), /signature|clientData/, "the assertion itself is never stored");
  assert.equal(await stepUpFresh(session, "alice"), true);
  assert.equal((await optionsRoute({ session: memorySession(), locals: { workspace: makeUser({ id: "nokey", name: "N", email: "n@example.test" }, false, ["employee"]) } as App.Locals, request: request({}), url }, creds)).status, 409, "no passkey yet");
});
