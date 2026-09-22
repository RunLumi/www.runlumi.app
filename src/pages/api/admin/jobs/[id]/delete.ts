import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../../lib/ats";
import { badRequest, redirect303, sameOrigin } from "../../../../../lib/http";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!sameOrigin(context.request)) return badRequest("Invalid request.");
  const id = context.params.id ?? "";
  if (!id) return badRequest("Invalid job.");

  const { DB } = envFromLocals(context.locals);
  const count = await DB.prepare(
    "SELECT COUNT(*) AS count FROM applications WHERE job_id = ?"
  ).bind(id).first<{count:number}>();

  if ((count?.count ?? 0) > 0) {
    return redirect303(`/admin/jobs/${id}?delete_error=applications`);
  }

  await DB.prepare("DELETE FROM jobs WHERE id = ?").bind(id).run();
  return redirect303("/admin/jobs");
};
