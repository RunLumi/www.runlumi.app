import { defineMiddleware } from "astro:middleware";
import { isAdmin } from "./lib/admin-auth";

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const isAdminPage = path.startsWith("/admin/jobs");
  const isAdminApi = path.startsWith("/api/admin/");
  const isLogin = path === "/admin/jobs/login" || path === "/api/admin/login";

  if ((isAdminPage || isAdminApi) && !isLogin) {
    const ok = await isAdmin(context as any);
    if (!ok) {
      if (isAdminApi) {
        return new Response("Unauthorized", { status: 401 });
      }
      const nextUrl = encodeURIComponent(path + context.url.search);
      return context.redirect(`/admin/jobs/login?next=${nextUrl}`, 303);
    }
  }

  return next();
});
