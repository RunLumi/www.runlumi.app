import type { APIRoute } from "astro";
import { envFromLocals, nowIso } from "../../../../lib/ats";
import { badRequest, redirect303, sameOrigin } from "../../../../lib/http";
import { deskActor, deskForbidden, deskPath, postLang } from "../../../../lib/hiring/desk";
import { RETENTION_STATUSES, retentionCutoff } from "../../../../lib/hiring/interviews";

export const prerender = false;

/**
 * Retention: permanently deletes closed (rejected/withdrawn) applications last
 * updated on or before the cutoff, with their files, notes, interviews and
 * scorecards. Requires explicit confirmation and leaves an audit entry.
 */
export const POST: APIRoute = async (context) => {
  const denied = deskForbidden(context.locals, "hiring.applications.delete");
  if (denied) return denied;
  if (!sameOrigin(context.request)) return badRequest("Invalid request.");
  const form = await context.request.formData();
  const back = deskPath(postLang(context.request, form), "/admin/jobs/applications");
  const cutoff = String(form.get("cutoff") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff) || form.get("confirm") !== "1") return redirect303(`${back}?purge_error=1#retention`);
  // The policy keeps closed applications for 60 days; a later cutoff is refused.
  if (cutoff > retentionCutoff()) return redirect303(`${back}?purge_error=window#retention`);
  const until = new Date(`${cutoff}T23:59:59.999+07:00`).toISOString();
  const { DB, FILES } = envFromLocals(context.locals);
  const placeholders = RETENTION_STATUSES.map(() => "?").join(", ");
  const rows = (await DB.prepare(`SELECT id FROM applications WHERE status IN (${placeholders}) AND updated_at <= ? LIMIT 200`).bind(...RETENTION_STATUSES, until).all<{ id: string }>()).results;
  let deleted = 0;
  for (const row of rows) {
    const files = (await DB.prepare("SELECT object_key FROM application_files WHERE application_id = ?").bind(row.id).all<{ object_key: string }>()).results;
    await Promise.all(files.map((file) => FILES.delete(file.object_key)));
    await DB.prepare("DELETE FROM applications WHERE id = ?").bind(row.id).run();
    deleted += 1;
  }
  const actor = deskActor(context.locals);
  await DB.prepare("INSERT INTO workspace_audit (id, actor_id, actor_name, action, target_user_id, detail, created_at) VALUES (?, ?, ?, 'candidates_purged', 'hiring', ?, ?)")
    .bind(`aud_${crypto.randomUUID().replaceAll("-", "")}`, actor.id ?? "unknown", actor.name, JSON.stringify({ cutoff, deleted, statuses: RETENTION_STATUSES }), nowIso()).run();
  return redirect303(`${back}?purged=${deleted}#retention`);
};
