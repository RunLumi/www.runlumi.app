import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../lib/ats";
import { deskForbidden } from "../../../../lib/hiring/desk";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const denied = deskForbidden(context.locals, "hiring.applications.manage");
  if (denied) return denied;
  const id = context.params.id ?? "";
  const { DB, FILES } = envFromLocals(context.locals);
  const row = await DB.prepare(
    "SELECT object_key, filename, content_type FROM application_files WHERE id = ? LIMIT 1"
  ).bind(id).first<{object_key:string;filename:string;content_type:string}>();
  if (!row) return new Response("File not found.", { status: 404 });

  const object = await FILES.get(row.object_key);
  if (!object) return new Response("File not found.", { status: 404 });

  const filename = encodeURIComponent(row.filename);
  return new Response(object.body, {
    headers: {
      "Content-Type": row.content_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
};
