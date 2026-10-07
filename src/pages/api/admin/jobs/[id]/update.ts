import type { APIRoute } from "astro";
import { envFromLocals, formText, nowIso, slugify } from "../../../../../lib/ats";
import { badRequest, redirect303, sameOrigin } from "../../../../../lib/http";
import { deskForbidden, deskPath, postLang } from "../../../../../lib/hiring/desk";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const denied = deskForbidden(context.locals, "hiring.jobs.manage");
  if (denied) return denied;
  if (!sameOrigin(context.request)) return badRequest("Invalid request.");
  const id = context.params.id ?? "";
  const { DB } = envFromLocals(context.locals);
  const form = await context.request.formData();

  const title = formText(form, "title", 160);
  const slug = slugify(formText(form, "slug", 80) || title);
  const summary = formText(form, "summary", 500);
  if (!id || !title || !summary) return badRequest("Missing required fields.");

  const closeLocal = formText(form, "closes_at", 40);
  const closesAt = closeLocal ? new Date(closeLocal).toISOString() : null;
  const sortOrder = Number(formText(form, "sort_order", 20)) || 0;

  try {
    await DB.prepare(
      `UPDATE jobs SET
        slug=?, title=?, team=?, location=?, employment_type=?, workplace_type=?,
        summary=?, description=?, responsibilities=?, requirements=?, application_note=?,
        closes_at=?, sort_order=?, updated_at=?
       WHERE id=?`
    ).bind(
      slug,
      title,
      formText(form, "team", 120),
      formText(form, "location", 160),
      formText(form, "employment_type", 60) || "Full-time",
      formText(form, "workplace_type", 60) || "Remote",
      summary,
      formText(form, "description", 12000),
      formText(form, "responsibilities", 12000),
      formText(form, "requirements", 12000),
      formText(form, "application_note", 6000),
      closesAt,
      sortOrder,
      nowIso(),
      id
    ).run();
  } catch (error) {
    console.error("Update job failed", error);
    return redirect303(deskPath(postLang(context.request, form), `/admin/jobs/${id}?error=slug`));
  }

  return redirect303(deskPath(postLang(context.request, form), `/admin/jobs/${id}`));
};
