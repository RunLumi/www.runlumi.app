import { defineMiddleware } from "astro:middleware";
import { activeUser, emdashLoginUrl } from "./lib/admin-auth";
import { envFromLocals } from "./lib/ats";
import type { Permission } from "./lib/workspace/roles";
import { workspaceUser } from "./lib/workspace/roles";

/** Private areas and the permission each needs. The first match wins. */
const areas: { test: (path: string) => boolean; permission: Permission; api?: boolean }[] = [
  { test: (path) => path.startsWith("/api/admin/"), permission: "hiring.access", api: true },
  { test: (path) => under(path, "/workspace/users"), permission: "users.manage" },
  { test: (path) => under(path, "/workspace"), permission: "workspace.access" },
  { test: (path) => under(path, "/admin/jobs"), permission: "hiring.access" },
  { test: (path) => under(path, "/admin/crm") || under(path, "/crm"), permission: "crm.access" },
];

/** Matches the path and its /vi peer. */
function under(path: string, root: string): boolean {
  const plain = path.startsWith("/vi/") ? path.slice(3) : path;
  return plain === root || plain.startsWith(`${root}/`);
}

function forbidden(vi: boolean): Response {
  const body = vi
    ? `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Không có quyền</title><body style="font-family:system-ui;max-width:640px;margin:10vh auto;padding:0 20px;line-height:1.6"><h1>Bạn chưa có quyền vào khu vực này.</h1><p>Hãy nhờ admin cấp vai trò phù hợp trong Workspace.</p><p><a href="/vi/workspace">Về Workspace</a></p></body></html>`
    : `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>No access</title><body style="font-family:system-ui;max-width:640px;margin:10vh auto;padding:0 20px;line-height:1.6"><h1>You do not have access to this area.</h1><p>Ask an admin to grant the right role in the Workspace.</p><p><a href="/workspace">Back to the Workspace</a></p></body></html>`;
  return new Response(body, { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const vi = path.startsWith("/vi/");
  const area = path === "/admin/jobs/login" ? undefined : areas.find((item) => item.test(path));
  const isPrivate = !!area || path.startsWith("/api/intake/") || path.startsWith("/api/crm/");

  if (area) {
    if (!activeUser(context.locals)) {
      if (area.api) return new Response("Unauthorized", { status: 401 });
      return new Response(null, { status: 303, headers: { Location: emdashLoginUrl(path + context.url.search), "Cache-Control": "private, no-store" } });
    }
    const { DB } = envFromLocals(context.locals);
    const user = await workspaceUser(context.locals, DB);
    if (!user?.can(area.permission)) {
      if (area.api) return new Response("Forbidden", { status: 403 });
      return forbidden(vi);
    }
    context.locals.workspace = user;
  }

  const response = await next();
  // Private responses carry personal data: never cache them.
  if (!isPrivate) return response;
  // Redirect responses can have immutable headers; copy before changing them.
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
