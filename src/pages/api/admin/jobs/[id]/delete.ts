import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../../lib/ats";
import { badRequest, redirect303, sameOrigin } from "../../../../../lib/http";
import { stepUpGuard } from "../../../../../lib/workspace/step-up";
import { deskForbidden, deskPath, postLang } from "../../../../../lib/hiring/desk";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const denied = deskForbidden(context.locals, "hiring.jobs.manage");
  if (denied) return denied;
  if (!sameOrigin(context.request)) return badRequest("Invalid request.");
  const stepUp = await stepUpGuard(context);
  if (stepUp) return stepUp;
  const form = await context.request.formData().catch(() => new FormData());
  if (form.get("confirm") !== "1") return badRequest("Confirm the deletion first.");
  const id = context.params.id ?? "";
  if (!id) return badRequest("Invalid job.");

  const { DB } = envFromLocals(context.locals);
  const count = await DB.prepare(
    "SELECT COUNT(*) AS count FROM applications WHERE job_id = ?"
  ).bind(id).first<{count:number}>();

  if ((count?.count ?? 0) > 0) {
    return redirect303(deskPath(postLang(context.request, form), `/admin/jobs/${id}?delete_error=applications`));
  }

  await DB.prepare("DELETE FROM jobs WHERE id = ?").bind(id).run();
  return redirect303(deskPath(postLang(context.request, form), "/admin/jobs"));
};
