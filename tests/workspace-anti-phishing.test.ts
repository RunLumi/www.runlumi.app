import { test } from "node:test";
import assert from "node:assert/strict";
import { AntiPhishingError, maskCode, normalizeCode } from "../src/lib/workspace/anti-phishing.ts";
import { renderEmail, safeLink } from "../src/lib/workspace/email.ts";
import { codeExempt, passkeyExempt, passkeyRequired, passkeyRegistrationGuard, passkeyRegistrationPath, workspaceGate } from "../src/lib/workspace/security-gate.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
// @ts-expect-error test helper without types
import { memorySession } from "./support/synthetic-passkey.mjs";

test("anti-phishing codes: 4–20 letters, numbers and spaces in any script; never the person's name or email", () => {
  assert.equal(normalizeCode("  Mây   Xanh 7 "), "Mây Xanh 7");
  assert.equal(normalizeCode("Hoà sen"), "Hoà sen", "stored in NFC");
  for (const [raw, code] of [["", "required"], ["abc", "length"], ["x".repeat(21), "length"], ["<script>", "characters"], ["mã-123", "characters"], ["a\u0000bcd", "characters"]] as const) {
    assert.throws(() => normalizeCode(raw), (error: unknown) => error instanceof AntiPhishingError && error.message === code, raw);
  }
  assert.throws(() => normalizeCode("minhanh 2026", { email: "minhanh@example.test" }), /personal/);
  assert.throws(() => normalizeCode("Minh Anh", { name: "Minh Anh" }), /personal/);
  assert.equal(maskCode("Mây Xanh 7"), "M•••••••••");
});

test("every composed email starts with the recipient's own code; text is plain and links stay on runlumi.app", () => {
  const mail = renderEmail({ id: "u1", email: "a@example.test", name: "An <b>", vi: true }, "Mây Xanh 7", {
    subject: "Còn 3 ngày\r\nBcc: evil@example.test", lines: ["Cơ hội <img src=x>", ""], link: { label: "Mở cơ hội", href: "/vi/crm/opp_1" },
  });
  assert.ok(mail.text.startsWith("Mã chống lừa đảo của bạn: Mây Xanh 7\n"));
  assert.match(mail.html, /^<!doctype html>[\s\S]*?<strong>Mã chống lừa đảo của bạn:<\/strong> Mây Xanh 7/);
  assert.doesNotMatch(mail.subject, /[\r\n]/, "no header injection");
  assert.doesNotMatch(mail.html, /<img|<b>/, "user text is escaped");
  assert.match(mail.html, /href="https:\/\/runlumi\.app\/vi\/crm\/opp_1"/);
  assert.equal(safeLink("https://evil.example/x"), null);
  assert.equal(safeLink("//evil.example/x"), null);
  const english = renderEmail({ id: "u1", email: "a@example.test", name: "", vi: false }, "Blue river 4", { subject: "S", lines: ["L"], link: { label: "Open", href: "https://evil.example/" } });
  assert.ok(english.text.startsWith("Your anti-phishing code: Blue river 4\n"));
  assert.doesNotMatch(english.text, /evil/, "foreign links are dropped");
});

const db = (rows: { code?: string | null; member?: boolean; window?: string | null } = {}) => {
  const runs: string[] = [];
  return {
    runs,
    prepare: (sql: string) => {
      const statement = {
        bind: () => statement,
        first: async () => {
          if (sql.includes("workspace_anti_phishing")) return rows.code ? { code: rows.code, updated_at: "2026-10-29T00:00:00Z" } : null;
          if (sql.includes("FROM workspace_members")) return rows.member ? { 1: 1 } : null;
          if (sql.includes("workspace_passkey_resets")) return rows.window ? { id: rows.window } : null;
          return null;
        },
        all: async () => ({ results: sql.includes("FROM credentials") ? (rows as { creds?: unknown[] }).creds ?? [] : [] }),
        run: async () => { runs.push(sql); },
      };
      return statement;
    },
    batch: async (items: unknown[]) => { runs.push(`batch:${items.length}`); return []; },
  } as unknown as D1Database & { runs: string[] };
};

test("Workspace gate: no session passkey check → redirect (pages) or 401 (APIs); then the code is required for pages", async () => {
  const user = makeUser({ id: "alice", name: "Alice", email: "alice@example.test" }, false, ["employee"]);
  const at = (path: string) => ({ session: memorySession(), request: new Request(`https://runlumi.app${path}`), url: new URL(`https://runlumi.app${path}`) });
  const page = await workspaceGate(at("/vi/crm/pipeline?x=1"), user, db(), false);
  assert.equal(page!.status, 303);
  assert.equal(page!.headers.get("location"), "/vi/workspace/verify?reason=session&next=%2Fvi%2Fcrm%2Fpipeline%3Fx%3D1");
  const api = await workspaceGate(at("/api/hrm/time"), user, db(), true);
  assert.equal(api!.status, 401);
  assert.equal((await api!.json()).error.code, "passkey_required");
  assert.equal(await workspaceGate(at("/workspace/verify"), user, db(), false), null, "the check itself opens");
  assert.equal(await workspaceGate(at("/api/workspace/passkey/options"), user, db(), true), null);
  const verified = at("/crm");
  verified.session.set("lumi_workspace_passkey", { userId: "alice", at: Date.now(), credentialId: "c" });
  const noCode = await workspaceGate(verified, user, db(), false);
  assert.equal(noCode!.headers.get("location"), "/workspace/account/security?setup=1&next=%2Fcrm");
  assert.equal(await workspaceGate(verified, user, db(), true), null, "APIs do not redirect for the code");
  assert.equal(await workspaceGate(verified, user, db({ code: "Mây Xanh 7" }), false), null);
  const other = at("/crm");
  other.session.set("lumi_workspace_passkey", { userId: "bob", at: Date.now(), credentialId: "c" });
  assert.equal((await workspaceGate(other, user, db({ code: "x y z w" }), false))!.status, 303, "another user's check does not count");
  assert.equal(await workspaceGate(at("/crm"), user, db(), false, false), null, "switch off: nobody is stopped");
  assert.equal(passkeyRequired({}), false);
  assert.equal(passkeyRequired({ WORKSPACE_PASSKEY_REQUIRED: "TRUE" }), false, "only the exact value turns it on");
  assert.equal(passkeyRequired({ WORKSPACE_PASSKEY_REQUIRED: "true" }), true);
  assert.ok(passkeyExempt("/vi/workspace/verify") && codeExempt("/workspace/account/security") && !codeExempt("/workspace/account/securityx"));
});

test("adding a passkey in EmDash: first passkey free, otherwise step-up or an admin recovery window; non-members untouched", async () => {
  const path = "/_emdash/api/auth/passkey/register/verify";
  assert.ok(passkeyRegistrationPath(path) && passkeyRegistrationPath("/_emdash/api/auth/passkey/register/options") && !passkeyRegistrationPath("/_emdash/api/auth/passkey/verify"));
  const ctx = (user: unknown, session = memorySession()) => ({ session, locals: { user } as App.Locals, request: new Request(`https://runlumi.app${path}`, { method: "POST" }), url: new URL(`https://runlumi.app${path}`) });
  const alice = { id: "alice", email: "alice@example.test", name: "Alice", role: 30, disabled: 0 };
  const content = (count: number) => ({ prepare: () => ({ bind: () => ({ all: async () => ({ results: Array.from({ length: count }, (_, i) => ({ id: `c${i}`, user_id: "alice", public_key: [], algorithm: -7, counter: 0, name: null, transports: null })) }) }) }) }) as unknown as D1Database;
  assert.equal(await passkeyRegistrationGuard(ctx(alice), db({ member: false }), content(1)), null, "not a Workspace person: EmDash decides");
  assert.equal(await passkeyRegistrationGuard(ctx(alice), db({ member: true }), content(1), false), null, "switch off: EmDash decides");
  const first = await passkeyRegistrationGuard(ctx(alice), db({ member: true }), content(0));
  assert.equal(typeof first, "function", "first passkey allowed, then audited");
  const blocked = await passkeyRegistrationGuard(ctx(alice), db({ member: true }), content(1));
  assert.ok(blocked instanceof Response);
  assert.equal(blocked.status, 403);
  const fresh = memorySession(); fresh.set("lumi_workspace_passkey", { userId: "alice", at: Date.now(), credentialId: "c0" });
  assert.equal(typeof await passkeyRegistrationGuard(ctx(alice, fresh), db({ member: true }), content(1)), "function", "step-up opens it");
  const recovery = db({ member: true, window: "rst_1" });
  const after = await passkeyRegistrationGuard(ctx(alice), recovery, content(1));
  assert.equal(typeof after, "function", "an admin recovery window opens it");
  await (after as (response: Response) => Promise<void>)(new Response("{}", { status: 200 }));
  assert.ok(recovery.runs.includes("batch:2"), "the window is closed and the addition audited in one batch");
  const admin = { ...alice, role: 50 };
  assert.ok((await passkeyRegistrationGuard(ctx(admin), db({ member: false }), content(2))) instanceof Response, "System Super Admins are Workspace people too");
});
