import { defineMiddleware } from "astro:middleware";
import { activeUser, emdashLoginUrl, isAdmin } from "./lib/admin-auth";
import { envFromLocals } from "./lib/ats";
import { crmActor } from "./lib/crm/access";

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const isAdminPage = path.startsWith("/admin/jobs") || path.startsWith("/admin/crm");
  const isAdminApi = path.startsWith("/api/admin/");
  const isLogin = path === "/admin/jobs/login";
  const isCrmPage = path === "/crm" || path.startsWith("/crm/") || path === "/vi/crm" || path.startsWith("/vi/crm/");

  if ((isAdminPage || isAdminApi) && !isLogin) {
    const user = activeUser(context.locals);
    if (!user) {
      if (isAdminApi) return new Response("Unauthorized", { status: 401 });
      return context.redirect(emdashLoginUrl(path + context.url.search), 303);
    }
    if (!isAdmin(context.locals)) return new Response("Forbidden", { status: 403 });
  }

  if (isCrmPage) {
    const user = activeUser(context.locals);
    if (!user) return context.redirect(emdashLoginUrl(path + context.url.search), 303);
    const { DB } = envFromLocals(context.locals);
    if (!await crmActor(context.locals, DB)) {
      return new Response(path.startsWith("/vi/") ? "Quản trị viên chưa cấp quyền CRM cho tài khoản EmDash này." : "CRM access has not been granted to this EmDash account.", { status: 403, headers: { "Cache-Control": "private, no-store" } });
    }
  }

  const response = await next();
  // CRM, hiring admin and intake responses carry personal data: never cache them.
  if (!(isCrmPage || isAdminPage || isAdminApi || path.startsWith("/api/intake/"))) return response;
  // Redirect responses can have immutable headers; copy before changing them.
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
