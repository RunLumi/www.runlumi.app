import type { APIRoute } from "astro";
import { envFromLocals, formText, nowIso } from "../../../../../lib/ats";
import { badRequest, redirect303, sameOrigin } from "../../../../../lib/http";
import { deskForbidden, deskPath, postLang } from "../../../../../lib/hiring/desk";

export const prerender = false;
const kinds = new Set(["short", "long", "file"]);

export const POST: APIRoute = async (context) => {
  const denied = deskForbidden(context.locals, "hiring.jobs.manage");
  if (denied) return denied;
  if (!sameOrigin(context.request)) return badRequest("Invalid request.");
  const jobId = context.params.id ?? "";
  const { DB } = envFromLocals(context.locals);
  const form = await context.request.formData();
  const kind = formText(form, "kind", 20);
  const prompt = formText(form, "prompt", 1000);
  const help = formText(form, "help_text", 1500);
  const required = form.get("required") === "1" ? 1 : 0;
  const sortOrder = Number(formText(form, "sort_order", 20)) || 0;

  if (!jobId || !prompt || !kinds.has(kind)) return badRequest("Invalid question.");

  await DB.prepare(
    `INSERT INTO job_questions
    (id, job_id, kind, prompt, help_text, required, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), jobId, kind, prompt, help, required, sortOrder, nowIso()).run();

  return redirect303(deskPath(postLang(context.request, form), `/admin/jobs/${jobId}`));
};
