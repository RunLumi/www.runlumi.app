import type { APIRoute } from "astro";
import { envFromLocals, formText } from "../../../../../lib/ats";
import { badRequest, redirect303, sameOrigin } from "../../../../../lib/http";
import { deskForbidden, deskPath, postLang } from "../../../../../lib/hiring/desk";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const denied = deskForbidden(context.locals, "hiring.jobs.manage");
  if (denied) return denied;
  if (!sameOrigin(context.request)) return badRequest("Invalid request.");
  const id = context.params.id ?? "";
  const { DB } = envFromLocals(context.locals);
  const form = await context.request.formData();
  const jobId = formText(form, "job_id", 100);
  if (!id || !jobId) return badRequest("Invalid question.");

  const usage = await DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM application_answers WHERE question_id = ?) +
       (SELECT COUNT(*) FROM application_files WHERE question_id = ?) AS count`
  ).bind(id, id).first<{ count: number }>();

  if ((usage?.count ?? 0) > 0) {
    return redirect303(deskPath(postLang(context.request, form), `/admin/jobs/${jobId}?question_error=1`));
  }

  await DB.prepare("DELETE FROM job_questions WHERE id = ? AND job_id = ?").bind(id, jobId).run();
  return redirect303(deskPath(postLang(context.request, form), `/admin/jobs/${jobId}`));
};
