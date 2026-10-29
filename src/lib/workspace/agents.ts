// AI agents (R-10): each person connects their own agent with a personal
// token (src/lib/crm/api/tokens.ts) and acts with their own current
// permissions. Admins set, per module, whether agents may read, write or not
// use it at all; lowering a level takes effect on the next call. Every tool
// call is written to workspace_audit (via "mcp" or "api").
//
// Modules agents may never reach, whatever the level:
// - Hiring: AGENTS.md, "never let tokens reach hiring" (candidate data).
// - HRM: docs/specs/hrm requires a separate HRM token and scope; CRM tokens never work there.
// - Finance: session-only for System Super Admin.
// - Within CRM: payments, ledger, commission, fulfillment, assignment and configuration (no tools exist).
import { AccessError, auditStatement } from "./members";

export const agentModules = ["crm", "workspace"] as const;
export type AgentModule = typeof agentModules[number];
export const agentLevels = ["off", "read", "write"] as const;
export type AgentLevel = typeof agentLevels[number];

/** Highest level each module supports, and the default when an admin has not chosen. */
export const moduleLimits: Record<AgentModule, { max: AgentLevel; fallback: AgentLevel }> = {
  crm: { max: "write", fallback: "write" },
  workspace: { max: "read", fallback: "read" },
};

export const excludedModules: { key: string; reason: [string, string] }[] = [
  { key: "hiring", reason: ["Candidate data never leaves the hiring desk; tokens never reach hiring (AGENTS.md).", "Dữ liệu ứng viên không rời bàn tuyển dụng; token không bao giờ vào được Tuyển dụng (AGENTS.md)."] },
  { key: "hrm", reason: ["HRM personal data needs its own HRM token and scope (HRM spec); CRM tokens never work there.", "Dữ liệu cá nhân HRM cần token và phạm vi HRM riêng (đặc tả HRM); token CRM không dùng được."] },
  { key: "finance", reason: ["Finance is open only to a System Super Admin browser session.", "Tài chính chỉ mở cho phiên trình duyệt của Siêu quản trị hệ thống."] },
];

const rank: Record<AgentLevel, number> = { off: 0, read: 1, write: 2 };

export async function agentPolicy(db: D1Database): Promise<Record<AgentModule, AgentLevel>> {
  const rows = (await db.prepare("SELECT module, level FROM workspace_agent_modules").all<{ module: AgentModule; level: AgentLevel }>()).results;
  const policy = Object.fromEntries(agentModules.map((module) => [module, moduleLimits[module].fallback])) as Record<AgentModule, AgentLevel>;
  for (const row of rows) if ((agentModules as readonly string[]).includes(row.module)) policy[row.module] = rank[row.level] > rank[moduleLimits[row.module].max] ? moduleLimits[row.module].max : row.level;
  return policy;
}

/** May an agent run a tool of this module that reads (write=false) or writes? */
export function allowed(policy: Record<AgentModule, AgentLevel>, module: AgentModule, write: boolean): boolean {
  return rank[policy[module]] >= (write ? 2 : 1);
}

export async function saveAgentPolicy(db: D1Database, actor: { id: string; name: string; can(permission: "users.manage"): boolean }, form: FormData): Promise<void> {
  if (!actor.can("users.manage")) throw new AccessError("policy", "forbidden");
  const before = await agentPolicy(db), now = new Date().toISOString();
  const next = { ...before };
  for (const module of agentModules) {
    const value = String(form.get(`level_${module}`) ?? before[module]);
    if (!(agentLevels as readonly string[]).includes(value) || rank[value as AgentLevel] > rank[moduleLimits[module].max]) throw new AccessError(`level_${module}`, "invalid");
    next[module] = value as AgentLevel;
  }
  await db.batch([
    ...agentModules.map((module) => db.prepare("INSERT INTO workspace_agent_modules (module, level, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(module) DO UPDATE SET level = excluded.level, updated_by = excluded.updated_by, updated_at = excluded.updated_at").bind(module, next[module], actor.id, now)),
    auditStatement(db, actor, "agent_policy_changed", "agents", { before, after: next }, now, { module: "admin" }),
  ]);
}

/** One audit row per tool call: who, which tool, which token, allowed or not. Never the arguments. */
export function agentCallAudit(db: D1Database, actor: { id: string; name: string }, call: { tool: string; module: AgentModule; tokenId: string; via: "api" | "mcp"; outcome: "success" | "denied" | "failed"; code?: string }): D1PreparedStatement {
  return auditStatement(db, actor, "agent_tool_called", actor.id, { tool: call.tool, token: call.tokenId, ...(call.code ? { code: call.code } : {}) }, new Date().toISOString(), { module: call.module, via: call.via, outcome: call.outcome });
}
