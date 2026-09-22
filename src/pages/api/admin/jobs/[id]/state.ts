import type { APIRoute } from "astro";
import { envFromLocals, formText, nowIso } from "../../../../../lib/ats";
import { badRequest, redirect303, sameOrigin } from "../../../../../lib/http";

export const prerender = false;
const states = new Set(["draft", "published", "closed"]);

export const POST: APIRoute = async (context) => {
  if (!sameOrigin(context.request)) return badRequest("Invalid request.");
  const id = context.params.id ?? "";
  const { DB } = envFromLocals(context.locals);
  const form = await context.request.formData();
  const status = formText(form, "status", 20);
  if (!id || !states.has(status)) return badRequest("Invalid status.");

  const now = nowIso();
  if (status === "published") {
    await DB.prepare(
      "UPDATE jobs SET status='published', published_at=COALESCE(published_at, ?), updated_at=? WHERE id=?"
    ).bind(now, now, id).run();
  } else {
    await DB.prepare("UPDATE jobs SET status=?, updated_at=? WHERE id=?").bind(status, now, id).run();
  }

  return redirect303(`/admin/jobs/${id}`);
};
