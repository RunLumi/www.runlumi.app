import type { APIRoute } from "astro";
import { envFromLocals, formText, nowIso, slugify } from "../../../../lib/ats";
import { badRequest, redirect303, sameOrigin } from "../../../../lib/http";
import { deskForbidden, deskPath, postLang } from "../../../../lib/hiring/desk";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const denied = deskForbidden(context.locals, "hiring.jobs.manage");
  if (denied) return denied;
  if (!sameOrigin(context.request)) return badRequest("Invalid request.");
  const { DB } = envFromLocals(context.locals);
  const form = await context.request.formData();
  const title = formText(form, "title", 160);
  const summary = formText(form, "summary", 500);
  const team = formText(form, "team", 120);
  const location = formText(form, "location", 160);
  const slug = slugify(formText(form, "slug", 80) || title);

  if (!title || !summary) return badRequest("Title and summary are required.");

  const id = crypto.randomUUID();
  const now = nowIso();
  try {
    await DB.prepare(
      `INSERT INTO jobs
      (id, slug, title, team, location, summary, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
    ).bind(id, slug, title, team, location, summary, now, now).run();
  } catch (error) {
    console.error("Create job failed", error);
    return redirect303(deskPath(postLang(context.request, form), "/admin/jobs?error=slug"));
  }

  return redirect303(deskPath(postLang(context.request, form), `/admin/jobs/${id}`));
};
