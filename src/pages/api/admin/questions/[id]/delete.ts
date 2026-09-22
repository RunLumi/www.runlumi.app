import type { APIRoute } from "astro";
import { envFromLocals, formText } from "../../../../../lib/ats";
import { badRequest, redirect303, sameOrigin } from "../../../../../lib/http";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!sameOrigin(context.request)) return badRequest("Invalid request.");
  const id = context.params.id ?? "";
  const { DB } = envFromLocals(context.locals);
  const form = await context.request.formData();
  const jobId = formText(form, "job_id", 100);
  if (!id || !jobId) return badRequest("Invalid question.");

  try {
    await DB.prepare("DELETE FROM job_questions WHERE id = ? AND job_id = ?").bind(id, jobId).run();
    return redirect303(`/admin/jobs/${jobId}`);
  } catch {
    return redirect303(`/admin/jobs/${jobId}?question_error=1`);
  }
};
