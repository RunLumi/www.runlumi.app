/** An in-place D1 recovery can restore stale roles. Lock private Workspace
 * routes and all scheduled D1 jobs until current authority is reconciled. */
const PRIVATE_ROOTS=["/admin/jobs","/admin/crm","/workspace","/hrm","/crm","/api/admin","/api/jobs","/api/crm","/api/hrm","/api/intake","/finance","/api/finance"] as const;
export function restoreMaintenanceEnabled(value:unknown):boolean{return value==="true"}
export function restoreBlocksPath(value:unknown,path:string):boolean{
 if(!restoreMaintenanceEnabled(value))return false;
 const normalized=path.startsWith("/vi/")?path.slice(3):path;
 return PRIVATE_ROOTS.some(root=>normalized===root||normalized.startsWith(`${root}/`));
}
export function restoreMaintenanceResponse(path:string,vi:boolean):Response{
 const normalized=path.startsWith("/vi/")?path.slice(3):path;
 const api=normalized.startsWith("/api/");
 const body=api
  ?(vi?"Workspace đang tạm đóng để đối soát dữ liệu phục hồi.":"Workspace is unavailable while recovery is being reconciled.")
  :(vi?"<!doctype html><html lang=\"vi\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex,nofollow\"><title>Đang đối soát phục hồi</title><body><main><h1>Workspace đang tạm đóng</h1><p>Dữ liệu quyền truy cập đang được đối soát sau phục hồi. Vui lòng thử lại sau.</p></main></body></html>":"<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex,nofollow\"><title>Recovery reconciliation</title><body><main><h1>Workspace is temporarily closed</h1><p>Access records are being reconciled after recovery. Please try again later.</p></main></body></html>");
 return new Response(body,{status:503,headers:{"Content-Type":api?"text/plain; charset=utf-8":"text/html; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"same-origin","X-Robots-Tag":"noindex, nofollow","Content-Security-Policy":"default-src 'none'; base-uri 'none'; frame-ancestors 'none'"}});
}
