import { test } from "node:test";
import assert from "node:assert/strict";
import { assertionUserVerified, attestationUserVerified, sessionPasskeyVerified } from "../src/lib/workspace/passkey.ts";
import { passkeyItemPath, passkeySignInHook, publicWorkspacePath, signInPath } from "../src/lib/workspace/security-gate.ts";
// @ts-expect-error test helper without types
import { memorySession, syntheticPasskey } from "./support/synthetic-passkey.mjs";

test("user verification is read from sign-in assertions and registrations; malformed input never counts", () => {
  const key = syntheticPasskey("cred_uv");
  assert.equal(assertionUserVerified(key.assert("abc").response.authenticatorData), true);
  assert.equal(assertionUserVerified(key.assert("abc", { flags: 0x01 }).response.authenticatorData), false, "presence without verification");
  assert.equal(attestationUserVerified(key.attest("abc").response.attestationObject), true);
  assert.equal(attestationUserVerified(key.attest("abc", { flags: 0x41 }).response.attestationObject), false);
  for (const bad of [undefined, 7, "", "!!!", "oA", "x".repeat(9000)]) {
    assert.equal(attestationUserVerified(bad), false, String(bad).slice(0, 10));
    assert.equal(assertionUserVerified(bad), false);
  }
});

test("public Workspace pages, sign-in redirects and EmDash passkey item paths", () => {
  assert.equal(publicWorkspacePath("/workspace/sign-in"), true);
  assert.equal(publicWorkspacePath("/vi/workspace/recovery"), true);
  assert.equal(publicWorkspacePath("/workspace/sign-in/x"), false);
  assert.equal(publicWorkspacePath("/workspace"), false);
  assert.equal(signInPath("/vi/crm", "?a=1"), "/vi/workspace/sign-in?next=%2Fvi%2Fcrm%3Fa%3D1");
  assert.equal(passkeyItemPath("/_emdash/api/auth/passkey/cred_1"), true);
  assert.equal(passkeyItemPath("/_emdash/api/auth/passkey/verify"), false);
  assert.equal(passkeyItemPath("/_emdash/api/auth/passkey/register/options"), false);
});

function fakeDb(member: boolean) {
  const writes: unknown[][] = [];
  const statement = (sql: string) => ({
    bind: (...args: unknown[]) => ({
      first: async () => (sql.includes("workspace_members") && member ? { x: 1 } : null),
      run: async () => { writes.push(args); return {}; },
      all: async () => ({ results: [] }),
    }),
  });
  return { writes, db: { prepare: statement } as unknown as D1Database };
}
function credentialsDb(rows: Record<string, { user_id: string; name: string }>) {
  return { prepare: () => ({ bind: (id: string) => ({ first: async () => rows[id] ? { id, user_id: rows[id].user_id, public_key: new Uint8Array(), algorithm: -7, counter: 0, name: rows[id].name, transports: "[]" } : null }) }) } as unknown as D1Database;
}
const signIn = (body: unknown) => ({ request: new Request("https://runlumi.app/_emdash/api/auth/passkey/verify", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), url: new URL("https://runlumi.app/_emdash/api/auth/passkey/verify") });
const emdashOk = (user: { id: string; role: number }) => new Response(JSON.stringify({ data: { success: true, user: { ...user, name: "TEST", email: "t@example.test" } } }), { status: 200 });

test("a verified EmDash passkey sign-in marks the session for the signed-in person only", async () => {
  const key = syntheticPasskey("cred_signin");
  const contentDb = credentialsDb({ cred_signin: { user_id: "alice", name: "Laptop" } });
  // Allowed: own credential, user verification, EmDash said 200.
  {
    const session = memorySession(), { db, writes } = fakeDb(true);
    const after = await passkeySignInHook({ ...signIn({ credential: key.assert("c") }), session }, db, contentDb);
    await after(emdashOk({ id: "alice", role: 30 }));
    assert.equal(await sessionPasskeyVerified(session, "alice"), true);
    assert.equal(writes.length, 1, "audited for a Workspace person");
  }
  // Denied: EmDash refused, no user verification, or the credential belongs to someone else.
  for (const [body, response, user] of [
    [{ credential: key.assert("c") }, new Response("{}", { status: 401 }), "alice"],
    [{ credential: key.assert("c", { flags: 0x01 }) }, emdashOk({ id: "alice", role: 30 }), "alice"],
    [{ credential: key.assert("c") }, emdashOk({ id: "bob", role: 30 }), "bob"],
    [{}, emdashOk({ id: "alice", role: 30 }), "alice"],
  ] as const) {
    const session = memorySession(), { db } = fakeDb(true);
    const after = await passkeySignInHook({ ...signIn(body), session }, db, contentDb);
    await after(response);
    assert.equal(await sessionPasskeyVerified(session, user), false);
  }
});
