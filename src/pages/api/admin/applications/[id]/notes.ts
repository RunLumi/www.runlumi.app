import type { APIRoute } from "astro";
import { envFromLocals, formText, nowIso } from "../../../../../lib/ats";
import { badRequest, redirect303, sameOrigin } from "../../../../../lib/http";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!sameOrigin(context.request)) return badRequest("Invalid request.");
  const id = context.params.id ?? "";
  const { DB } = envFromLocals(context.locals);
  const form = await context.request.formData();
  const body = formText(form, "body", 4000);
  if (!id || !body) return badRequest("Note is required.");
  const now = nowIso();

  await DB.batch([
    DB.prepare(
      "INSERT INTO application_notes (id, application_id, author, body, created_at) VALUES (?, ?, 'Admin', ?, ?)"
    ).bind(crypto.randomUUID(), id, body, now),
    DB.prepare(
      "INSERT INTO application_events (id, application_id, actor, event_type, detail, created_at) VALUES (?, ?, 'Admin', 'note_added', 'Private note added', ?)"
    ).bind(crypto.randomUUID(), id, now)
  ]);

  return redirect303(`/admin/jobs/applications/${id}`);
};
