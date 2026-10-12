// REST surface of the CRM API. Every route maps to one shared tool
// (src/lib/crm/api/tools.ts); the MCP endpoint exposes the same tools.
import type { APIRoute } from "astro";
import { type ToolOutcome, apiError, authorize, json, readJson, requestKeyFor, runTool } from "../../../../lib/crm/api/http";
import { findTool } from "../../../../lib/crm/api/tools";

export const prerender = false;

type Route = { method: string; pattern: RegExp; tool: string; params: string[]; status?: number };
const routes: Route[] = [
  { method: "GET", pattern: /^me$/, tool: "whoami", params: [] },
  { method: "GET", pattern: /^playbooks$/, tool: "list_playbooks", params: [] },
  { method: "GET", pattern: /^companies$/, tool: "search_companies", params: [] },
  { method: "POST", pattern: /^companies$/, tool: "create_company", params: [], status: 201 },
  { method: "GET", pattern: /^companies\/([\w-]+)$/, tool: "get_company", params: ["company_id"] },
  { method: "PATCH", pattern: /^companies\/([\w-]+)$/, tool: "update_company", params: ["company_id"] },
  { method: "POST", pattern: /^companies\/([\w-]+)\/do-not-contact$/, tool: "set_do_not_contact", params: ["company_id"] },
  { method: "GET", pattern: /^contacts$/, tool: "search_contacts", params: [] },
  { method: "POST", pattern: /^contacts$/, tool: "create_contact", params: [], status: 201 },
  { method: "PATCH", pattern: /^contacts\/([\w-]+)$/, tool: "update_contact", params: ["contact_id"] },
  { method: "GET", pattern: /^opportunities$/, tool: "search_opportunities", params: [] },
  { method: "POST", pattern: /^opportunities$/, tool: "create_opportunity", params: [], status: 201 },
  { method: "GET", pattern: /^opportunities\/([\w-]+)$/, tool: "get_opportunity", params: ["opportunity_id"] },
  { method: "PATCH", pattern: /^opportunities\/([\w-]+)$/, tool: "update_opportunity", params: ["opportunity_id"] },
  { method: "PATCH", pattern: /^opportunities\/([\w-]+)\/fields$/, tool: "update_opportunity_fields", params: ["opportunity_id"] },
  { method: "POST", pattern: /^opportunities\/([\w-]+)\/stage$/, tool: "move_stage", params: ["opportunity_id"] },
  { method: "POST", pattern: /^opportunities\/([\w-]+)\/notes$/, tool: "add_note", params: ["opportunity_id"], status: 201 },
];

function respond(outcome: ToolOutcome, status = 200): Response {
  if (outcome.ok) return json(status, { ok: true, data: outcome.data });
  return apiError(outcome.status, outcome.code, outcome.message, outcome.fields ? { fields: outcome.fields } : {});
}

export const ALL: APIRoute = async ({ request, locals, params, url }) => {
  const path = (params.path ?? "").replace(/\/+$/, "");
  const matching = routes.filter((route) => route.pattern.test(path));
  if (!matching.length) return apiError(404, "not_found", "No such endpoint.");
  const route = matching.find((item) => item.method === request.method);
  if (!route) return apiError(405, "method_not_allowed", "Method not allowed.", {}, { Allow: matching.map((item) => item.method).join(", ") });
  const api = await authorize(request, locals);
  if (api instanceof Response) return api;
  const tool = findTool(route.tool)!;
  let args: Record<string, unknown> = {};
  if (request.method === "GET") {
    for (const [key, value] of url.searchParams) args[key] = value;
  } else {
    const body = await readJson(request);
    if (body instanceof Response) return body;
    args = body;
  }
  const values = route.pattern.exec(path)!.slice(1);
  route.params.forEach((name, index) => { args[name] = values[index]; });
  const key = await requestKeyFor(api, tool.name, args, request.headers.get("idempotency-key"));
  if (key instanceof Response) return key;
  return respond(await runTool(api, tool, args, key), route.status);
};
