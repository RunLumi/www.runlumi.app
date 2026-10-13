import type { APIRoute } from "astro";
import { envFromLocals } from "../../../lib/ats";
import { storeIntake, verifyIntake } from "../../../lib/crm/intake";
import { kickLark } from "../../../lib/crm/lark/kick";

export const prerender = false;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

// Server-to-server only: authenticated by HMAC, never by a browser session.
export const POST: APIRoute = async ({ request, locals }) => {
  const env = envFromLocals(locals);
  const verified = await verifyIntake(request, env.CRM_INTAKE_SECRET);
  if (!verified.ok) return json(verified.status, { ok: false, error: verified.error });
  try {
    const result = await storeIntake(env.DB, verified);
    if ("error" in result) return json(result.status, { ok: false, error: result.error });
    if (!result.duplicate) kickLark();
    return json(result.status, { ok: true, id: result.id, duplicate: result.duplicate });
  } catch (error) {
    console.error("crm_intake_failed", error instanceof Error ? error.message : "unknown"); // !# policy: console
    return json(503, { ok: false, error: "storage_unavailable" });
  }
};

export const ALL: APIRoute = () => json(405, { ok: false, error: "method_not_allowed" });
