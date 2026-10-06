import type { APIRoute } from "astro";
import { envFromLocals, formText } from "../../../../lib/ats";
import { sameOrigin } from "../../../../lib/http";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!sameOrigin(context.request)) return new Response("Invalid request.", { status: 400 });
  const { DB, CONTENT_DB } = envFromLocals(context.locals);
  const form = await context.request.formData();
  const email = formText(form, "email", 254).toLowerCase();
  const userId = formText(form, "user_id", 128);
  const enabled = formText(form, "enabled", 1) === "1";
  const user = userId
    ? await CONTENT_DB.prepare("SELECT id, role, disabled FROM users WHERE id = ? LIMIT 1").bind(userId).first<{id:string;role:number;disabled:number}>()
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? await CONTENT_DB.prepare("SELECT id, role, disabled FROM users WHERE lower(email) = ? LIMIT 1").bind(email).first<{id:string;role:number;disabled:number}>()
      : null;
  if (!userId && !user) return context.redirect("/admin/crm?status=not-found", 303);
  if (userId && !enabled && !await DB.prepare("SELECT user_id FROM crm_members WHERE user_id = ?").bind(userId).first()) return context.redirect("/admin/crm?status=not-found", 303);
  if (enabled && (!user || user.disabled || user.role === 50)) return context.redirect("/admin/crm?status=not-found", 303);
  const targetUserId = user?.id ?? userId;
  if (!targetUserId) return context.redirect("/admin/crm?status=not-found", 303);
  const now = new Date().toISOString();
  await DB.prepare(`INSERT INTO crm_members (user_id, enabled, granted_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, granted_by = excluded.granted_by, updated_at = excluded.updated_at`).bind(targetUserId, enabled ? 1 : 0, context.locals.user!.id, now).run();
  return context.redirect("/admin/crm", 303);
};
