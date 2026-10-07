import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../../lib/ats";
import { badRequest, redirect303, sameOrigin } from "../../../../../lib/http";
import { deskForbidden, deskPath, postLang } from "../../../../../lib/hiring/desk";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const denied = deskForbidden(context.locals, "hiring.applications.delete");
  if (denied) return denied;
  if (!sameOrigin(context.request)) return badRequest("Invalid request.");
  const form = await context.request.formData().catch(() => new FormData());
  if (form.get("confirm") !== "1") return badRequest("Confirm the deletion first.");
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

  return redirect303(deskPath(postLang(context.request, form), "/admin/jobs/applications"));
};
