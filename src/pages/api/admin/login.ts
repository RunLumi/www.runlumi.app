import type { APIRoute } from "astro";
import { createAdminSession, safeNext, setAdminCookie } from "../../../lib/admin-auth";
import { envFromLocals, formText } from "../../../lib/ats";
import { redirect303, sameOrigin } from "../../../lib/http";

export const prerender = false;

function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < length; i++) mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return mismatch === 0;
}

export const POST: APIRoute = async (context) => {
  if (!sameOrigin(context.request)) return new Response("Invalid request.", { status: 400 });
  const { ADMIN_PASSWORD, ADMIN_SESSION_SECRET } = envFromLocals(context.locals);
  const form = await context.request.formData();
  const password = formText(form, "password", 500);
  const next = safeNext(formText(form, "next", 500));

  if (!ADMIN_PASSWORD || !ADMIN_SESSION_SECRET || !constantTimeEqual(password, ADMIN_PASSWORD)) {
    return redirect303(`/admin/jobs/login?error=1&next=${encodeURIComponent(next)}`);
  }

  setAdminCookie(context, await createAdminSession(ADMIN_SESSION_SECRET));
  return redirect303(next);
};
