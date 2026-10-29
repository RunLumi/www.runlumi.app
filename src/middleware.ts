import { defineMiddleware } from "astro:middleware";
import { activeUser, emdashLoginUrl } from "./lib/admin-auth";
import { envFromLocals } from "./lib/ats";
import type { Permission } from "./lib/workspace/roles";
import { workspaceUser } from "./lib/workspace/roles";
import { sameOrigin } from "./lib/http";
import { financeArea, financeBoundary, setFinanceReadiness } from "./lib/finance/access";
import { restoreBlocksPath, restoreMaintenanceResponse } from "./lib/workspace/restore-maintenance";

/** Private areas and the permission each needs. The first match wins. */
const areas: { test: (path: string) => boolean; permission: Permission; api?: boolean }[] = [
  { test: (path) => path.startsWith("/api/workspace/"), permission: "workspace.access", api: true },
  { test: (path) => path.startsWith("/api/hrm/"), permission: "hrm.access", api: true },
  { test: (path) => under(path, "/hrm"), permission: "hrm.access" },
  { test: (path) => path.startsWith("/api/admin/"), permission: "hiring.access", api: true },
  { test: (path) => under(path, "/workspace/users") || under(path, "/workspace/roles"), permission: "users.manage" },
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
  const path = context.url.pathname,vi=path.startsWith("/vi/");
  const environment=envFromLocals(context.locals);
  if(restoreBlocksPath(environment.WORKSPACE_RESTORE_MODE,path))return restoreMaintenanceResponse(path,vi);
  if (financeArea(path)) return financeBoundary(context, next);
  const area = path === "/admin/jobs/login" ? undefined : areas.find((item) => item.test(path));
  const isPrivate = !!area || path.startsWith("/api/intake/") || path.startsWith("/api/crm/");

  // HRM page handlers need their native URL-encoded form even if an adapter or
  // authentication layer consumes the original Request before the page runs.
  // Keep this to small same-origin page forms; uploads use dedicated API routes.
  if(area?.permission==="hrm.access"&&!area.api&&context.request.method==="POST"&&sameOrigin(context.request)) {
    const contentType=context.request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    const length=context.request.headers.get("content-length");
    if(contentType!=="application/x-www-form-urlencoded")return new Response("Expected a URL-encoded form.",{status:415,headers:{"Cache-Control":"private, no-store"}});
    if(length!==null&&Number(length)>65536)return new Response("Form is too large.",{status:413,headers:{"Cache-Control":"private, no-store"}});
    try{context.locals.hrmFormRequest=context.request.clone() as unknown as Request}catch{return new Response("Form body is unavailable.",{status:400,headers:{"Cache-Control":"private, no-store"}})}
  }

  if (area) {
    if (!activeUser(context.locals)) {
      if (area.api) return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" } });
      return new Response(null, { status: 303, headers: { Location: emdashLoginUrl(path + context.url.search), "Cache-Control": "private, no-store" } });
    }
    const { DB } = environment;
    const user = await workspaceUser(context.locals, DB);
    if (!user) {
      if (area.api) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" } });
      return forbidden(vi);
    }
    if(!user.can(area.permission)){
      if(area.api)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
      return forbidden(vi);
    }
    const selfServiceOnly=user.can("hrm.profile.self")&&!user.can("hrm.records.manage")&&!user.can("hrm.team.read")&&!user.can("hrm.configure");
    let hrmReady = false;
    if(environment.HRM_LIVE_ENABLED === "true") {
      try {
        const policy = await DB.prepare("SELECT enabled,legal_entity,purpose,retention_policy,policy_reference,reviewed_by FROM hrm_settings WHERE id=1").first<{enabled:number;legal_entity:string;purpose:string;retention_policy:string;policy_reference:string;reviewed_by:string|null}>();
        hrmReady = policy?.enabled===1 && !!policy.legal_entity && !!policy.purpose && !!policy.retention_policy && !!policy.policy_reference && !!policy.reviewed_by;
      } catch { hrmReady=false; }
    }
    const hrmRoute=path==="/hrm"||path.startsWith("/hrm/")||path==="/vi/hrm"||path.startsWith("/vi/hrm/");
    let employmentState:"active"|"ended"|"none"|"unknown"="none";
    if(user.can("hrm.access")&&!user.admin){
      try{
        const own=await DB.prepare(`SELECT
          EXISTS(SELECT 1 FROM hrm_people WHERE user_id=?) AS has_person,
          EXISTS(SELECT 1 FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id WHERE p.user_id=? AND e.status!='ended' AND (e.ended_on IS NULL OR e.ended_on>date('now','+7 hours'))) AS active_period`)
          .bind(user.id,user.id).first<{has_person:number;active_period:number}>();
        employmentState=own?.has_person?(own.active_period?"active":"ended"):"none";
      }catch{employmentState="unknown"}
    }
    user.hrmEmploymentEnded=employmentState==="ended"||employmentState==="unknown";
    const currentEmployment=employmentState==="active";
    user.hrmEnabled = hrmReady&&(!selfServiceOnly||currentEmployment)&&!user.hrmEmploymentEnded;
    context.locals.workspace = user;
    await setFinanceReadiness(DB, user, environment.FINANCE_LIVE_ENABLED === "true");
    if(hrmRoute&&employmentState==="ended")return forbidden(vi);
    if(hrmRoute&&employmentState==="unknown"&&!user.admin)return new Response("HRM employment status could not be verified.",{status:503,headers:{"Cache-Control":"private, no-store"}});
    if(hrmRoute&&!hrmReady&&!user.can("hrm.configure")){
      if(area.api)return new Response("HRM is not activated.",{status:503,headers:{"Cache-Control":"private, no-store"}});
      const body=vi
        ? "<!doctype html><html lang='vi'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><meta name='robots' content='noindex,nofollow'><title>HRM chưa sẵn sàng</title><body style='font-family:system-ui;max-width:640px;margin:10vh auto;padding:0 20px;line-height:1.6'><main><h1>HRM chưa được kích hoạt.</h1><p>Owner và HRM Admin cần hoàn tất cấu hình chính sách và cổng triển khai trước khi mở hồ sơ nhân viên.</p><p><a href='/vi/workspace'>Về Workspace</a></p></main></body></html>"
        : "<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><meta name='robots' content='noindex,nofollow'><title>HRM is not ready</title><body style='font-family:system-ui;max-width:640px;margin:10vh auto;padding:0 20px;line-height:1.6'><main><h1>HRM is not activated.</h1><p>The owner and HRM Admin must complete policy settings and the deployment gate before employee records open.</p><p><a href='/workspace'>Back to Workspace</a></p></main></body></html>";
      return new Response(body,{status:503,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
    }
    if(hrmRoute&&hrmReady&&selfServiceOnly&&!currentEmployment){
      if(area.api)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
      return forbidden(vi);
    }
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
