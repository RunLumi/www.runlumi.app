import type { APIRoute } from "astro";
import { applicationStatuses, envFromLocals, formText, nowIso } from "../../../../../lib/ats";
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
  const status = formText(form, "status", 30);
  if (!id || !applicationStatuses.includes(status as any)) return badRequest("Invalid stage.");

  const current = await DB.prepare("SELECT status FROM applications WHERE id = ?").bind(id).first<{status:string}>();
  if (!current) return new Response("Application not found.", { status: 404 });
  const now = nowIso();
  const actor = deskActor(context.locals);
  if (current.status === status) return redirect303(deskPath(postLang(context.request, form), `/admin/jobs/applications/${id}`));

  await DB.batch([
    DB.prepare("UPDATE applications SET status = ?, updated_at = ? WHERE id = ?").bind(status, now, id),
    DB.prepare(
      `INSERT INTO application_events
       (id, application_id, actor, actor_id, event_type, from_status, to_status, created_at)
       VALUES (?, ?, ?, ?, 'status_changed', ?, ?, ?)`
    ).bind(crypto.randomUUID(), id, actor.name, actor.id, current.status, status, now)
  ]);

  return redirect303(deskPath(postLang(context.request, form), `/admin/jobs/applications/${id}`));
};
