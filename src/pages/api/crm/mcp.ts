// MCP server (Streamable HTTP transport, JSON responses, stateless) for AI
// agents. Same bearer tokens and tools as the REST API; no session cookies.
import type { APIRoute } from "astro";
import { apiError, authorize, json, readJson, requestKeyFor, runTool } from "../../../lib/crm/api/http";
import { findTool as findCrmTool, tools as crmTools } from "../../../lib/crm/api/tools";
import { agentPolicy, allowed } from "../../../lib/workspace/agents";
import { workspaceTools } from "../../../lib/workspace/agent-tools";

// CRM tools plus the Workspace module; admins choose per module what agents may do.
const tools = [...crmTools, ...workspaceTools];
const findTool = (name: string) => findCrmTool(name) ?? workspaceTools.find((tool) => tool.name === name);

export const prerender = false;

const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];
const INSTRUCTIONS = [
  "Lumi Workspace (CRM and Workspace modules). You act as the person who owns this token, with their current permissions and the modules an admin allows for AI agents.",
  "Companies have many contacts; each opportunity has one company and one contact. Call list_playbooks before creating or moving opportunities.",
  "Record only what the customer or the user said. Never guess values, prices, rankings or consent; leave unknown values empty.",
  "If someone asks not to be contacted, call set_do_not_contact. Never contact customers yourself on the user's behalf.",
].join(" ");

type Rpc = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
const rpcResult = (id: unknown, result: unknown) => json(200, { jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string, status = 200) => json(status, { jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** Browsers send Origin; only this site's own pages may call. Agents send none. */
function originAllowed(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === url.origin;
}

export const POST: APIRoute = async ({ request, locals, url }) => {
  if (!originAllowed(request, url)) return apiError(403, "origin_not_allowed", "Cross-origin requests are not accepted.");
  const api = await authorize(request, locals);
  if (api instanceof Response) return api;
  const body = await readJson(request);
  if (body instanceof Response) return rpcError(null, -32700, "Parse error: send one JSON-RPC object.", 400);
  const message = body as Rpc;
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") return rpcError(message.id, -32600, "Invalid request.", 400);
  // Notifications (no id) need no answer.
  if (message.id === undefined || message.id === null) return new Response(null, { status: 202 });
  const params = message.params && typeof message.params === "object" && !Array.isArray(message.params) ? message.params as Record<string, unknown> : {};

  switch (message.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return rpcResult(message.id, {
        protocolVersion: SUPPORTED.includes(requested) ? requested : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "lumi-crm", title: "Lumi CRM", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(message.id, {});
    case "tools/list": {
      // Only tools this token may run now: scope and the admin's module levels.
      const policy = await agentPolicy(api.db);
      return rpcResult(message.id, {
        tools: tools.filter((tool) => (!tool.write || api.identity.token.scope === "write") && allowed(policy, tool.module ?? "crm", tool.write)).map((tool) => ({
          name: tool.name, title: tool.title, description: tool.description, inputSchema: tool.inputSchema,
          annotations: { title: tool.title, readOnlyHint: !tool.write, destructiveHint: tool.name === "set_do_not_contact", idempotentHint: !tool.write, openWorldHint: false },
        })),
      });
    }
    case "tools/call": {
      const tool = typeof params.name === "string" ? findTool(params.name) : undefined;
      if (!tool) return rpcError(message.id, -32602, "Unknown tool.");
      const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments as Record<string, unknown> : {};
      const meta = params._meta && typeof params._meta === "object" ? params._meta as Record<string, unknown> : {};
      // Per call only: a header would be reused for every call of a session.
      const key = await requestKeyFor(api, tool.name, args, meta.idempotency_key);
      if (key instanceof Response) return rpcResult(message.id, { content: [{ type: "text", text: JSON.stringify({ error: { code: "validation", message: "Invalid _meta.idempotency_key." } }) }], isError: true });
      const outcome = await runTool(api, tool, args, key, "mcp");
      if (outcome.ok) {
        const data = outcome.data && typeof outcome.data === "object" && !Array.isArray(outcome.data) ? outcome.data : { result: outcome.data };
        return rpcResult(message.id, { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data });
      }
      const error = { code: outcome.code, message: outcome.message, ...(outcome.fields ? { fields: outcome.fields } : {}) };
      return rpcResult(message.id, { content: [{ type: "text", text: JSON.stringify({ error }) }], structuredContent: { error }, isError: true });
    }
    default:
      return rpcError(message.id, -32601, "Method not found.");
  }
};

// Stateless server: no server-initiated stream and no sessions to end.
export const GET: APIRoute = () => apiError(405, "method_not_allowed", "This MCP server answers POST requests only.", {}, { Allow: "POST" });
export const DELETE: APIRoute = () => apiError(405, "method_not_allowed", "No sessions to end.", {}, { Allow: "POST" });
