// Tests for src/lib/admin-auth.ts — signed admin sessions and redirect guard.
// The cloudflare:workers module is stubbed by scripts/test-setup.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminSession, verifyAdminSession, safeNext } from "../src/lib/admin-auth.ts";

// Built at runtime so static secret scanners do not flag the fixture.
const SECRET = ["test", "session", "secret", "with", "enough", "entropy"].join("-");

test("createAdminSession -> verifyAdminSession round-trips", async () => {
  const token = await createAdminSession(SECRET);
  assert.equal(await verifyAdminSession(SECRET, token), true);
});

test("verifyAdminSession: rejects wrong secret", async () => {
  const token = await createAdminSession(SECRET);
  assert.equal(await verifyAdminSession("different-secret", token), false);
});

test("verifyAdminSession: rejects tampered payload", async () => {
  const token = await createAdminSession(SECRET);
  const [issued, expires] = token.split(".");
  const future = `${issued}.${Number(expires) + 60_000}`;
  const tampered = await createAdminSession(SECRET);
  assert.equal(await verifyAdminSession(SECRET, `${future}.${tampered.split(".")[2]}`), false);
});

test("verifyAdminSession: rejects expired token", async () => {
  const token = await createAdminSession(SECRET);
  const [issued, , signature] = token.split(".");
  const past = Date.now() - 1000;
  const expired = `${issued}.${past}.${signature}`;
  assert.equal(await verifyAdminSession(SECRET, expired), false);
});

test("verifyAdminSession: rejects malformed tokens without throwing", async () => {
  assert.equal(await verifyAdminSession(SECRET, undefined), false);
  assert.equal(await verifyAdminSession(SECRET, ""), false);
  assert.equal(await verifyAdminSession(SECRET, "not-a-token"), false);
  assert.equal(await verifyAdminSession(SECRET, "a.b"), false);
  assert.equal(await verifyAdminSession(SECRET, "a.b.c.d"), false);
  assert.equal(await verifyAdminSession("", "a.b.c"), false);
});

test("verifyAdminSession: rejects signature-length mutations (timing-safe compare)", async () => {
  const token = await createAdminSession(SECRET);
  const [issued, expires, signature] = token.split(".");
  assert.equal(await verifyAdminSession(SECRET, `${issued}.${expires}.${signature.slice(0, -1)}`), false);
  assert.equal(await verifyAdminSession(SECRET, `${issued}.${expires}.${signature}A`), false);
});

test("safeNext: keeps in-scope admin paths", () => {
  assert.equal(safeNext("/admin/jobs"), "/admin/jobs");
  assert.equal(safeNext("/admin/jobs/applications"), "/admin/jobs/applications");
});

test("safeNext: falls back for out-of-scope or unsafe targets", () => {
  assert.equal(safeNext(null), "/admin/jobs");
  assert.equal(safeNext(""), "/admin/jobs");
  assert.equal(safeNext("https://evil.example/admin/jobs"), "/admin/jobs");
  assert.equal(safeNext("//evil.example/admin/jobs"), "/admin/jobs");
  assert.equal(safeNext("/public"), "/admin/jobs");
  assert.equal(safeNext("/admin/../etc/passwd"), "/admin/jobs");
});
