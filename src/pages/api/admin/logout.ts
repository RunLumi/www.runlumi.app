import type { APIRoute } from "astro";
import { clearAdminCookie } from "../../../lib/admin-auth";
import { redirect303, sameOrigin } from "../../../lib/http";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!sameOrigin(context.request)) return new Response("Invalid request.", { status: 400 });
  clearAdminCookie(context);
  return redirect303("/admin/jobs/login");
};
