// Request handling shared by the REST API and the MCP endpoint: bearer-token
// authentication (never a browser session, so no cookie can be replayed
// cross-site), JSON bodies, idempotency keys and error mapping.
import { envFromLocals } from "../../ats";
import { validRequestKey } from "../core";
import { kickLark } from "../lark/kick";
import { sha256 } from "./secret";
import { type ApiIdentity, authenticate } from "./tokens";
import { type Tool, type ToolContext, toolFailure } from "./tools";

export const MAX_BODY_BYTES = 64 * 1024;

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

export function apiError(status: number, code: string, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
  return json(status, { ok: false, error: { code, message, ...extra } }, headers);
}

export interface ApiRequest { db: D1Database; contentDb: D1Database; identity: ApiIdentity }

export async function authorize(request: Request, locals: App.Locals): Promise<ApiRequest | Response> {
  const { DB, CONTENT_DB } = envFromLocals(locals);
  const result = await authenticate(DB, CONTENT_DB, request.headers.get("authorization"));
  if ("status" in result) {
    const headers: Record<string, string> = result.status === 401 ? { "WWW-Authenticate": 'Bearer realm="lumi-crm"' } : result.retryAfter ? { "Retry-After": String(result.retryAfter) } : {};
    return apiError(result.status, result.status === 429 ? "rate_limited" : "unauthorized", result.message, {}, headers);
  }
  return { db: DB, contentDb: CONTENT_DB, identity: result };
}

/** Reads at most `limit` bytes, stopping (without buffering the rest) once it is exceeded. */
async function readCapped(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); // !# policy: d1-blob (request body in memory, never stored)
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

/** Reads a JSON object body of at most 64 KB. */
export async function readJson(request: Request): Promise<Record<string, unknown> | Response> {
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return apiError(415, "unsupported_media_type", "Send application/json.");
  const raw = await readCapped(request, MAX_BODY_BYTES);
  if (raw === null) return apiError(413, "too_large", "Body is larger than 64 KB.");
  if (!raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return apiError(400, "invalid_json", "Send a JSON object.");
    return parsed as Record<string, unknown>;
  } catch {
    return apiError(400, "invalid_json", "Body is not valid JSON.");
  }
}

/**
 * A client-supplied idempotency key makes retries safe. The stored key is
 * derived from the person, the operation, its arguments and the client's key,
 * so a reused key never swallows a different write and never collides with
 * another person's keys. Without a key every call is new.
 */
export async function requestKeyFor(api: ApiRequest, tool: string, args: Record<string, unknown>, clientKey: unknown): Promise<string | Response> {
  if (clientKey === undefined || clientKey === null || clientKey === "") return crypto.randomUUID().replaceAll("-", "");
  if (typeof clientKey !== "string" || !validRequestKey(clientKey)) return apiError(422, "validation", "Idempotency key must be 16–100 characters of A–Z, a–z, 0–9, _ or -.", { fields: { idempotency_key: "invalid" } });
  return `api_${await sha256(`${api.identity.actor.id}\n${tool}\n${JSON.stringify(args)}\n${clientKey}`)}`;
}

export type ToolOutcome = { ok: true; data: unknown } | { ok: false; status: number; code: string; message: string; fields?: Record<string, string> };

export async function runTool(api: ApiRequest, tool: Tool, args: Record<string, unknown>, requestKey: string): Promise<ToolOutcome> {
  if (tool.write && api.identity.token.scope !== "write") return { ok: false, status: 403, code: "read_only_token", message: "This token is read-only. Create a token with write scope to make changes." };
  const ctx: ToolContext = { db: api.db, contentDb: api.contentDb, identity: api.identity, requestKey };
  try {
    const data = await tool.run(ctx, args);
    if (tool.write) kickLark();
    return { ok: true, data };
  } catch (error) {
    const failure = toolFailure(error);
    if (failure) return { ok: false, ...failure };
    // Log without arguments: they may contain personal data.
    console.error("crm_api_failed", tool.name, error instanceof Error ? error.message : "unknown"); // !# policy: console
    return { ok: false, status: 500, code: "server_error", message: "The server could not complete this. Try again shortly." };
  }
}
