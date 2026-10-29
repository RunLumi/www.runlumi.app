import { activeUser, emdashLoginUrl } from "../admin-auth";
import { envFromLocals } from "../ats";
import { makeUser, type WorkspaceUser } from "../workspace/roles";
import { getFinanceReadiness } from "./store";
import type { SessionStore } from "../workspace/passkey";
import { passkeyRequired, workspaceGate } from "../workspace/security-gate";

export function financeArea(pathname: string): { api: boolean; vi: boolean } | null {
  const vi = pathname.startsWith("/vi/");
  const path = vi ? pathname.slice(3) : pathname;
  if (path === "/finance" || path.startsWith("/finance/")) return { api: false, vi };
  if (path === "/api/finance" || path.startsWith("/api/finance/")) return { api: true, vi };
  return null;
}

/** Apply this even to authentication failures, redirects and framework errors. */
export function financePrivate(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("X-Frame-Options", "DENY");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function financeFailure(status: number, code: string, vi = false): Response {
  const messages: Record<string, [string, string]> = {
    unauthorized: ["Sign in to continue.", "Đăng nhập để tiếp tục."],
    forbidden: ["Finance is available only to System Super Admin.", "Chỉ Siêu quản trị hệ thống được truy cập Tài chính."],
    unavailable: ["Finance is temporarily unavailable. Please try again.", "Tài chính tạm thời chưa khả dụng. Vui lòng thử lại."],
  };
  const message = messages[code]?.[vi ? 1 : 0] ?? (vi ? "Yêu cầu không hợp lệ." : "The request is invalid.");
  return financePrivate(new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } }));
}

export async function setFinanceReadiness(db: D1Database, user: WorkspaceUser, deploymentEnabled: boolean): Promise<void> {
  user.financeDeploymentEnabled = deploymentEnabled;
  user.financeEnabled = false;
  // Never even ask for Finance configuration on behalf of another role.
  if (!user.admin || !user.can("finance.access") || !deploymentEnabled) return;
  try { user.financeEnabled = (await getFinanceReadiness(db)).enabled; }
  catch { user.financeEnabled = false; }
}

type BoundaryContext = { url: URL; request: Request; locals: App.Locals; session?: SessionStore };

/** A session-only boundary, intentionally independent of CRM tokens and HRM readiness. */
export async function financeBoundary(context: BoundaryContext, next: () => Promise<Response>): Promise<Response> {
  const area = financeArea(context.url.pathname)!;
  const account = activeUser(context.locals);
  if (!account || context.request.headers.has("Authorization")) {
    if (area.api || context.request.headers.has("Authorization")) return financeFailure(401, "unauthorized", area.vi);
    return financePrivate(new Response(null, { status: 303, headers: { Location: emdashLoginUrl(context.url.pathname + context.url.search) } }));
  }
  if (account.role !== 50) return financeFailure(403, "forbidden", area.vi);
  if (!["GET", "HEAD", "POST"].includes(context.request.method)) {
    return financePrivate(new Response("Method not allowed.", { status: 405, headers: { Allow: "GET, HEAD, POST" } }));
  }
  const user = makeUser({ id: account.id, name: account.name || account.email, email: account.email }, true, []);
  context.locals.workspace = user;
  try {
    // R-08: the same passkey session check and anti-phishing code as every Workspace area.
    const env = envFromLocals(context.locals);
    const gate = await workspaceGate(context, user, env.DB, area.api, passkeyRequired(env));
    if (gate) return financePrivate(gate);
    if (context.request.method === "POST") context.locals.financeFormRequest = context.request.clone() as unknown as Request;
    await setFinanceReadiness(env.DB, user, env.FINANCE_LIVE_ENABLED === "true");
    const path = context.url.pathname.replace(/^\/vi(?=\/)/, "").replace(/\/$/, "");
    const setup = path === "/finance/settings" || path === "/api/finance/settings"
      || path === "/api/finance/commands" && context.request.method === "POST";
    if (!user.financeEnabled && !setup) return financeFailure(503, "unavailable", area.vi);
    return financePrivate(await next());
  } catch {
    // Database details, submitted facts and exception messages are never serialized.
    return financeFailure(503, "unavailable", area.vi);
  }
}

export function financeSession(locals: App.Locals): WorkspaceUser | null {
  const account = activeUser(locals), user = locals.workspace;
  return account?.role === 50 && user?.id === account.id && user.admin && user.can("finance.access") ? user : null;
}

/** Origin-less clients are deliberately unsupported; browser forms send Origin. */
export function financeSameOrigin(request: Request): boolean {
  return request.headers.get("Origin") === new URL(request.url).origin
    && !["cross-site", "same-site"].includes(request.headers.get("Sec-Fetch-Site") ?? "");
}
