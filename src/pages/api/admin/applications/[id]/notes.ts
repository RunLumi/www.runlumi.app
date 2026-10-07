import type { APIRoute } from "astro";
import { envFromLocals, formText, nowIso } from "../../../../../lib/ats";
import { badRequest, redirect303, sameOrigin } from "../../../../../lib/http";
import { deskActor, deskForbidden, deskPath, postLang } from "../../../../../lib/hiring/desk";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const denied = deskForbidden(context.locals, "hiring.applications.manage");
  if (denied) return denied;
  if (!sameOrigin(context.request)) return badRequest("Invalid request.");
  const id = context.params.id ?? "";
  const { DB } = envFromLocals(context.locals);
  const form = await context.request.formData();
  const body = formText(form, "body", 4000);
  if (!id || !body) return badRequest("Note is required.");
  if (!await DB.prepare("SELECT 1 FROM applications WHERE id = ?").bind(id).first()) return new Response("Application not found.", { status: 404 });
  const now = nowIso();
  const actor = deskActor(context.locals);

  await DB.batch([
    DB.prepare(
      "INSERT INTO application_notes (id, application_id, author, author_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), id, actor.name, actor.id, body, now),
    DB.prepare(
      "INSERT INTO application_events (id, application_id, actor, actor_id, event_type, detail, created_at) VALUES (?, ?, ?, ?, 'note_added', 'Private note added', ?)"
    ).bind(crypto.randomUUID(), id, actor.name, actor.id, now)
  ]);

  return redirect303(deskPath(postLang(context.request, form), `/admin/jobs/applications/${id}`));
};
