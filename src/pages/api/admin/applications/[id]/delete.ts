import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../../lib/ats";
import { badRequest, redirect303, sameOrigin } from "../../../../../lib/http";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!sameOrigin(context.request)) return badRequest("Invalid request.");
  const id = context.params.id ?? "";
  if (!id) return badRequest("Invalid application.");

  const { DB, FILES } = envFromLocals(context.locals);
  const files = (await DB.prepare(
    "SELECT object_key FROM application_files WHERE application_id = ?"
  ).bind(id).all<{object_key:string}>()).results;

  try {
    await Promise.all(files.map((file) => FILES.delete(file.object_key)));
    await DB.prepare("DELETE FROM applications WHERE id = ?").bind(id).run();
  } catch (error) {
    console.error("Delete application failed", error);
    return new Response("Could not delete application.", { status: 500 });
  }

  return redirect303("/admin/jobs/applications");
};
