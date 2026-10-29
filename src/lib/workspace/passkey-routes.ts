// Handlers behind /api/workspace/passkey/{options,verify}. Middleware has
// already required an active EmDash session with Workspace membership; these
// accept only same-origin JSON from the browser, never a bearer token.
import { envFromLocals } from "../ats";
import { auditStatement } from "./members";
import { type CredentialSource, type SessionStore, STEP_UP_WINDOW_MS, emdashCredentials, passkeyOptions, verifyPasskey } from "./passkey";

export interface PasskeyRouteContext { session?: SessionStore; locals: App.Locals; request: Request; url: URL }

export const FAILURE_LIMIT = 10;
export const FAILURE_WINDOW_MS = 15 * 60_000;
const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
const failure = (status: number, code: string) => reply(status, { ok: false, error: { code } });

function rejected(context: PasskeyRouteContext): Response | null {
  const { request, url } = context;
  if (request.headers.has("authorization")) return failure(401, "session_only");
  if (request.headers.get("origin") !== url.origin) return failure(403, "origin_not_allowed");
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return failure(415, "send_json");
  if (Number(request.headers.get("content-length") ?? "0") > 16_384) return failure(413, "too_large");
  if (!context.session) return failure(503, "session_unavailable");
  if (!context.locals.workspace) return failure(403, "forbidden");
  return null;
}

export async function optionsRoute(context: PasskeyRouteContext, credentials?: CredentialSource): Promise<Response> {
  const bad = rejected(context);
  if (bad) return bad;
  const user = context.locals.workspace!;
  const source = credentials ?? emdashCredentials(envFromLocals(context.locals).CONTENT_DB);
  const options = await passkeyOptions(context.session!, source, user.id);
  if (!options) return failure(409, "no_passkey");
  return reply(200, { ok: true, options });
}

export async function verifyRoute(context: PasskeyRouteContext, deps: { credentials?: CredentialSource; db?: D1Database } = {}): Promise<Response> {
  const bad = rejected(context);
  if (bad) return bad;
  const user = context.locals.workspace!;
  let body: unknown;
  try { body = JSON.parse(await context.request.text()); } catch { return failure(400, "invalid_json"); }
  const env = deps.db && deps.credentials ? null : envFromLocals(context.locals);
  const db = deps.db ?? env!.DB;
  // At most FAILURE_LIMIT failed checks per person in FAILURE_WINDOW_MS. While
  // limited, nothing is verified and nothing more is written to the
  // append-only audit log, so no member can grow it without bound.
  const since = new Date(Date.now() - FAILURE_WINDOW_MS).toISOString();
  const failures = await db.prepare("SELECT COUNT(*) AS n FROM workspace_audit WHERE actor_id = ? AND action = 'passkey_failed' AND created_at > ?").bind(user.id, since).first<{ n: number }>();
  if ((failures?.n ?? 0) >= FAILURE_LIMIT) return new Response(JSON.stringify({ ok: false, error: { code: "too_many_attempts" } }), { status: 429, headers: { ...headers, "Retry-After": String(FAILURE_WINDOW_MS / 1000) } });
  const result = await verifyPasskey(context.session!, deps.credentials ?? emdashCredentials(env!.CONTENT_DB), user.id, body);
  const purpose = (body as { purpose?: unknown } | null)?.purpose === "session" ? "session" : "step_up";
  // Every attempt is recorded, including failures; never the assertion itself.
  await auditStatement(db, user, result.ok ? "passkey_verified" : "passkey_failed", user.id,
    result.ok ? { purpose, credential: result.credentialName ?? "" } : { purpose, reason: result.code }, new Date().toISOString(),
    { module: "account", outcome: result.ok ? "success" : "denied" }).run();
  if (!result.ok) return failure(401, "verification_failed");
  return reply(200, { ok: true, step_up_seconds: STEP_UP_WINDOW_MS / 1000 });
}
