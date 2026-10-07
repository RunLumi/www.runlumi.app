import type { APIRoute } from "astro";
import { envFromLocals, nowIso } from "../../../../../lib/ats";
import { badRequest, redirect303, sameOrigin } from "../../../../../lib/http";
import { deskActor, deskForbidden, deskPath, postLang } from "../../../../../lib/hiring/desk";
import { parseScorecard } from "../../../../../lib/hiring/interviews";

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
  const card = parseScorecard(form);
  if (!card) return redirect303(`${back}?scorecard_error=invalid#scorecards`);
  if (card.interviewId && !await DB.prepare("SELECT 1 FROM application_interviews WHERE id = ? AND application_id = ?").bind(card.interviewId, id).first()) return redirect303(`${back}?scorecard_error=invalid#scorecards`);
  const actor = deskActor(context.locals);
  if (!actor.id) return new Response("Forbidden", { status: 403 });
  const now = nowIso();
  try {
    await DB.batch([
      DB.prepare("INSERT INTO application_scorecards (id, application_id, interview_id, author_id, author_name, recommendation, ratings, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), id, card.interviewId || null, actor.id, actor.name, card.recommendation, JSON.stringify(card.ratings), card.evidence, now),
      DB.prepare("INSERT INTO application_events (id, application_id, actor, actor_id, event_type, detail, created_at) VALUES (?, ?, ?, ?, 'scorecard_added', ?, ?)")
        .bind(crypto.randomUUID(), id, actor.name, actor.id, card.recommendation, now),
    ]);
  } catch (error) {
    // The unique index allows one scorecard per person per interview.
    if (String(error).includes("UNIQUE")) return redirect303(`${back}?scorecard_error=exists#scorecards`);
    throw error;
  }
  return redirect303(`${back}?saved=scorecard#scorecards`);
};
