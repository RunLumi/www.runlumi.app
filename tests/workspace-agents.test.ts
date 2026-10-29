import { test } from "node:test";
import assert from "node:assert/strict";
import { agentPolicy, allowed, saveAgentPolicy } from "../src/lib/workspace/agents.ts";
import { runTool } from "../src/lib/crm/api/http.ts";
import { tools } from "../src/lib/crm/api/tools.ts";
import { workspaceTools } from "../src/lib/workspace/agent-tools.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { sqliteD1 } from "./support/d1-sqlite.ts";

const form = (entries: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(entries)) data.set(key, value); return data; };

test("admins set module levels for agents; defaults keep today's CRM behaviour; Workspace is read-only at most", async () => {
  const db = sqliteD1();
  assert.deepEqual(await agentPolicy(db), { crm: "write", workspace: "read" });
  const admin = makeUser({ id: "admin", name: "TEST Admin", email: "a@example.test" }, true, []);
  const seller = makeUser({ id: "s", name: "TEST Seller", email: "s@example.test" }, false, ["sales_manager"]);
  await assert.rejects(saveAgentPolicy(db, seller, form({ level_crm: "off" })), /forbidden/);
  await assert.rejects(saveAgentPolicy(db, admin, form({ level_workspace: "write" })), /invalid/, "Workspace tools never write");
  await saveAgentPolicy(db, admin, form({ level_crm: "read", level_workspace: "off" }));
  const policy = await agentPolicy(db);
  assert.deepEqual(policy, { crm: "read", workspace: "off" });
  assert.equal(allowed(policy, "crm", false), true);
  assert.equal(allowed(policy, "crm", true), false);
  assert.equal(allowed(policy, "workspace", false), false);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM workspace_audit WHERE action = 'agent_policy_changed'").get()!.n, 1);
  assert.ok(workspaceTools.every((tool) => !tool.write && tool.module === "workspace"));
  assert.ok(!tools.some((tool) => /payment|ledger|commission|candidate|applicant|payroll|salary|assign/i.test(tool.name)), "no excluded data has a tool");
});

test("tool calls: a lowered module level refuses at once; allowed and refused calls are both audited without arguments", async () => {
  const db = sqliteD1(), content = sqliteD1("content");
  const admin = makeUser({ id: "admin", name: "TEST Admin", email: "a@example.test" }, true, []);
  const api = { db, contentDb: content, identity: { actor: { id: "s", name: "TEST Seller (API: agent)", email: "s@example.test", manager: false, configure: false, finance: false, fulfillment: false, refer: true, reportPayments: false }, token: { id: "tok_1", name: "agent", scope: "write" as const } } };
  const whoami = tools.find((tool) => tool.name === "whoami")!;
  const ok = await runTool(api as never, whoami, {}, "k1", "mcp");
  assert.equal(ok.ok, true);
  await saveAgentPolicy(db, admin, form({ level_crm: "off", level_workspace: "read" }));
  const denied = await runTool(api as never, whoami, { secret: "0912345678" }, "k2", "mcp");
  assert.deepEqual(denied.ok ? null : denied.code, "module_not_allowed");
  const rows = db.raw.prepare("SELECT outcome, via, module, detail FROM workspace_audit WHERE action = 'agent_tool_called' ORDER BY created_at, outcome DESC").all() as { outcome: string; via: string; module: string; detail: string }[];
  assert.deepEqual(rows.map((row) => [row.outcome, row.via, row.module]), [["success", "mcp", "crm"], ["denied", "mcp", "crm"]]);
  assert.ok(rows.every((row) => !row.detail.includes("0912345678")), "arguments are never stored");
});
