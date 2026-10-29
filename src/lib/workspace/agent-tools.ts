// MCP tools of the Workspace module: what the person's agent may know about
// the person's own access. Read-only. No colleague, candidate, HRM or Finance
// data is reachable here.
import type { Tool } from "../crm/api/tools";
import { agentPolicy, excludedModules } from "./agents";
import { visibleModules } from "./nav";
import { roleLabel, workspaceUserFor } from "./roles";

export const workspaceTools: Tool[] = [
  {
    name: "workspace_my_access", title: "My Workspace access", write: false, module: "workspace",
    description: "The Workspace modules and roles of the person this token acts for, and which modules an admin allows AI agents to read or change. Modules agents can never use are listed with the reason.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async (ctx) => {
      const account = await ctx.contentDb.prepare("SELECT id, email, name, role FROM users WHERE id = ? AND disabled = 0 LIMIT 1").bind(ctx.identity.actor.id).first<{ id: string; email: string; name: string | null; role: number }>();
      const person = account ? await workspaceUserFor(ctx.db, account) : null;
      return {
        roles: person ? (person.admin ? [roleLabel("admin", false)] : [...person.roles].map((role) => roleLabel(role, false))) : [],
        modules: person ? visibleModules(person).map((module) => module.en) : [],
        agent_modules: await agentPolicy(ctx.db),
        never_available_to_agents: excludedModules.map((module) => ({ module: module.key, reason: module.reason[0] })),
      };
    },
  },
];
