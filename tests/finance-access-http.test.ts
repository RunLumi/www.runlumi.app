import { test } from "node:test";
import assert from "node:assert/strict";
import { activeUser, safeNext } from "../src/lib/admin-auth.ts";
import { makeUser, permissions, roles } from "../src/lib/workspace/roles.ts";
import { modules, moduleForPath, visibleLinks, visibleModules } from "../src/lib/workspace/nav.ts";
import { financeArea, financeBoundary, financePrivate, financeSameOrigin, financeSession } from "../src/lib/finance/access.ts";
import { financeFormCommand, financeJson, financeJsonCommand, financeReturnTo, financeSelection, readFinanceForm, readFinanceText } from "../src/lib/finance/http.ts";
import type { FinanceState } from "../src/lib/finance/store-types.ts";

const base = { id: "finance-admin", name: "Synthetic Admin", email: "finance@example.test" };
const account = { ...base, role: 50, disabled: false };
const user = makeUser(base, true, []);
const state: FinanceState = { book: { ...base, id: "primary", entityName: "Synthetic entity", currency: "VND", precision: 0, fiscalStartMonth: 1, timezone: "Asia/Ho_Chi_Minh", firstPeriod: "2025-01", cashFloor: null, version: 1, enabled: true, policyNote: "Synthetic only", createdAt: "", updatedAt: "" }, definitions: [], lines: [], segments: [], accounts: [], periods: [], plans: [], planValues: [], actualRevisions: [], actualValues: [], observations: [], imports: [], audit: [], selectedFiscalYear: 2025 };

test("Finance capabilities belong exclusively to System Super Admin, including role unions", () => {
  const capabilities = permissions.filter(permission => permission.startsWith("finance."));
  assert.equal(capabilities.length, 8);
  for (const granted of [...roles.map(role => [role]), [...roles]]) {
    const actor = makeUser(base, false, granted);
    for (const permission of capabilities) assert.equal(actor.can(permission), false, `${granted.join("+")} cannot ${permission}`);
    assert.equal(visibleModules(actor).some(module => module.key === "finance"), false);
  }
  for (const permission of capabilities) assert.equal(user.can(permission), true);
  const finance = modules.find(module => module.key === "finance")!;
  assert.equal(visibleModules(user).includes(finance), false, "unconfigured navigation is hidden");
  assert.deepEqual(visibleLinks(user, finance).map(link => link.key), ["settings"]);
  const ready = { ...user, financeEnabled: true };
  assert.equal(visibleModules(ready).includes(finance), true);
  assert.equal(visibleLinks(ready, finance).length, 11);
});

test("Finance route matching and login redirects preserve legitimate filters without adjacent-prefix bypass", () => {
  for (const path of ["/finance", "/finance/plans", "/vi/finance/actuals", "/api/finance/exports", "/api/finance"]) assert.ok(financeArea(path));
  for (const path of ["/finances", "/finance-public", "/api/finance-public", "/crm"]) assert.equal(financeArea(path), null);
  assert.equal(moduleForPath("/vi/finance/pnl"), "finance");
  assert.equal(safeNext("/vi/finance/plans?year=2025"), "/vi/finance/plans?year=2025");
  assert.equal(safeNext("/finance/%5c%5cevil.example"), "/admin/jobs");
  const url = new URL("https://runlumi.app/api/finance/commands");
  assert.equal(financeReturnTo("/vi/finance/actuals?period=2025-02", url), "/vi/finance/actuals?period=2025-02");
  for (const path of ["//evil.example/finance", "/finance/../crm", "/finance/%2e%2e/crm", "/financeevil", "/finance\\evil"]) assert.throws(() => financeReturnTo(path, url));
});

test("all early Finance denials are private and do not execute a loader or query", async () => {
  for (const path of ["/finance/plans", "/vi/finance/actuals", "/api/finance/commands", "/api/finance/exports"]) {
    for (const actor of [undefined, { ...account, disabled: true }, { ...account, role: 30 }, { ...account, role: 49 }]) {
      let reached = false;
      const context = { url: new URL("https://runlumi.app" + path), request: new Request("https://runlumi.app" + path), locals: { user: actor } as App.Locals };
      const response = await financeBoundary(context, async () => { reached = true; return new Response("secret"); });
      assert.equal(reached, false);
      assert.ok([303, 401, 403].includes(response.status));
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
      assert.doesNotMatch(await response.text(), /secret/);
    }
  }
  const context = { url: new URL("https://runlumi.app/api/finance/overview"), request: new Request("https://runlumi.app/api/finance/overview", { headers: { Authorization: "Bearer synthetic-invalid" } }), locals: { user: account } as App.Locals };
  const response = await financeBoundary(context, async () => new Response("must not execute"));
  assert.equal(response.status, 401, "even an admin session does not turn this into a bearer-token endpoint");
});

test("session identity is checked again after permission changes", () => {
  assert.equal(financeSession({ user: account, workspace: user } as App.Locals), user);
  for (const changed of [{ ...account, role: 30 }, { ...account, disabled: true }, { ...account, id: "another" }]) assert.equal(financeSession({ user: changed, workspace: user } as App.Locals), null);
  assert.equal(activeUser({ user: { ...account, disabled: true } as never }), undefined);
});

test("Finance accepts only exact-origin browser mutations", () => {
  const url = "https://runlumi.app/api/finance/commands";
  for (const origin of [undefined, "null", "https://www.runlumi.app", "https://attacker.runlumi.app", "https://evil.example"]) {
    const request = new Request(url, { method: "POST", headers: origin ? { Origin: origin } : {} });
    assert.equal(financeSameOrigin(request), false);
  }
  assert.equal(financeSameOrigin(new Request(url, { method: "POST", headers: { Origin: "https://runlumi.app" } })), true);
  assert.equal(financeSameOrigin(new Request(url, { method: "POST", headers: { Origin: "https://runlumi.app", "Sec-Fetch-Site": "same-site" } })), false);
});

test("bounded bodies reject lying lengths, duplicate fields, unsupported types and invalid UTF-8", async () => {
  const url = "https://runlumi.app/finance/settings";
  await assert.rejects(readFinanceText(new Request(url, { method: "POST", body: "12345" }), 4));
  await assert.rejects(readFinanceText(new Request(url, { method: "POST", body: "a", headers: { "Content-Length": "99999999" } }), 4));
  await assert.rejects(readFinanceText(new Request(url, { method: "POST", body: new Uint8Array([0xff]) })));
  await assert.rejects(readFinanceForm(new Request(url, { method: "POST", body: "intent=x&intent=y", headers: { "Content-Type": "application/x-www-form-urlencoded" } })));
  await assert.rejects(readFinanceForm(new Request(url, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } })));
});

test("native form money preserves blanks, explicit zero, clear, N/A and dotted line codes", () => {
  const command = financeFormCommand({ intent: "plan.save", plan_id: "plan-one", expected_version: "1", period: "2025-01",
    "value.pnl.projects.unallocated.state": "entered", "value.pnl.projects.unallocated.amount": "0",
    "value.pnl.hosting.unallocated.state": "entered", "value.pnl.hosting.unallocated.amount": "",
    "value.pnl.other_revenue.unallocated.state": "missing", "value.pnl.other_revenue.unallocated.amount": "99",
  }, state);
  assert.equal(command.action, "plan.save");
  if (command.action !== "plan.save") return;
  assert.deepEqual(command.values?.map(fact => [fact.lineCode, fact.state, fact.amount]), [["pnl.projects", "entered", 0], ["pnl.hosting", "missing", null], ["pnl.other_revenue", "missing", null]]);
  assert.throws(() => financeFormCommand({ intent: "plan.save", plan_id: "x", expected_version: "1", unexpected: "x" }, state));
  assert.throws(() => financeFormCommand({ intent: "plan.save", plan_id: "x", expected_version: "1", "value.pnl.projects.unallocated.state": "entered", "value.pnl.projects.unallocated.amount": "9007199254740992" }, state));
});

test("JSON commands require exact integer strings for money, and responses preserve that boundary", async () => {
  const input = { action: "plan.save", plan_id: "p", expected_version: 1, period: "2025-01", values: [{ lineCode: "pnl.projects", segmentCode: "unallocated", state: "entered", amount: "9007199254740991", note: "", evidenceRef: "" }] };
  const command = financeJsonCommand(input);
  assert.equal(command.action === "plan.save" && command.values?.[0].amount, Number.MAX_SAFE_INTEGER);
  assert.throws(() => financeJsonCommand({ ...input, values: [{ ...input.values[0], amount: 1 }] }));
  assert.throws(() => financeJsonCommand({ ...input, actor_id: "forged" }));
  assert.throws(() => financeJsonCommand({ ...input, values: [{ ...input.values[0], amount: "9007199254740992" }] }));
  const response = financeJson({ version: 2, values: [{ amount: Number.MAX_SAFE_INTEGER }], metrics: { revenue: 100, unknown: null } });
  assert.deepEqual(await response.json(), { version: 2, values: [{ amount: "9007199254740991" }], metrics: { revenue: "100", unknown: null } });
  assert.equal(financePrivate(Response.redirect("https://runlumi.app/finance", 303)).headers.get("Cache-Control"), "private, no-store");
  assert.throws(() => financeSelection(new URL("https://runlumi.app/finance?year=NaN")));
});
