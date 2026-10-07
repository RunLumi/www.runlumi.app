import type { APIRoute } from "astro";
import { envFromLocals, formText, nowIso } from "../../../../../lib/ats";
import { badRequest, redirect303, sameOrigin } from "../../../../../lib/http";
import { deskActor, deskForbidden, deskPath, postLang } from "../../../../../lib/hiring/desk";
import { interviewStages, interviewStatuses, parseLocalDateTime } from "../../../../../lib/hiring/interviews";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const denied = deskForbidden(context.locals, "hiring.applications.manage");
  if (denied) return denied;
  if (!sameOrigin(context.request)) return badRequest("Invalid request.");
  const id = context.params.id ?? "";
  const { DB } = envFromLocals(context.locals);
  const form = await context.request.formData();
  const back = deskPath(postLang(context.request, form), `/admin/jobs/applications/${id}`);
  if (!await DB.prepare("SELECT 1 FROM applications WHERE id = ?").bind(id).first()) return new Response("Application not found.", { status: 404 });
  const actor = deskActor(context.locals);
  const now = nowIso();
  const event = (type: string, detail: string) => DB.prepare("INSERT INTO application_events (id, application_id, actor, actor_id, event_type, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), id, actor.name, actor.id, type, detail, now);

  if (formText(form, "intent", 20) === "status") {
    const interviewId = formText(form, "interview_id", 80);
    const status = formText(form, "status", 20);
    if (!(interviewStatuses as readonly string[]).includes(status)) return redirect303(`${back}?interview_error=1#interviews`);
    const result = await DB.batch([
      DB.prepare("UPDATE application_interviews SET status = ?, updated_at = ? WHERE id = ? AND application_id = ?").bind(status, now, interviewId, id),
      event("interview_status", status),
    ]);
    if (!result[0].meta.changes) return new Response("Interview not found.", { status: 404 });
    return redirect303(`${back}?saved=interview#interviews`);
  }

  const stage = formText(form, "stage", 20);
  const scheduledAt = parseLocalDateTime(formText(form, "scheduled_at", 16));
  const duration = Number(formText(form, "duration_minutes", 3) || "45");
  const location = formText(form, "location", 300);
  const interviewers = formText(form, "interviewers", 300);
  if (!(interviewStages as readonly string[]).includes(stage) || !scheduledAt || !Number.isInteger(duration) || duration < 10 || duration > 480 || !interviewers) {
    return redirect303(`${back}?interview_error=1#interviews`);
  }
  await DB.batch([
    DB.prepare("INSERT INTO application_interviews (id, application_id, stage, scheduled_at, duration_minutes, location, interviewers, created_by, created_by_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), id, stage, scheduledAt, duration, location, interviewers, actor.id, actor.name, now, now),
    event("interview_scheduled", `${stage} ${scheduledAt}`),
  ]);
  return redirect303(`${back}?saved=interview#interviews`);
};
