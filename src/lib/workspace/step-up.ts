// Step-up for sensitive actions, as one server guard for pages and API routes.
// Call it after the permission check and before reading the form or data:
//
//   const stepUp = await stepUpGuard(context, { vi });
//   if (stepUp) return stepUp;
//
// A browser navigation is sent to the passkey page and returns afterwards; a
// fetch() caller (Accept: application/json) gets 403 step_up_required.
import { type SessionStore, stepUpFresh, verifyPath } from "./passkey";

export interface GuardContext { session?: SessionStore; locals: App.Locals; request: Request; url: URL }

/** Same-site page that started this action, so the person comes back to it after verifying. */
export function returnPath(context: Pick<GuardContext, "request" | "url">, fallback?: string): string {
  const referer = context.request.headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.origin === context.url.origin) return url.pathname + url.search + url.hash;
    } catch { /* fall through */ }
  }
  return fallback ?? (context.request.method === "GET" ? context.url.pathname + context.url.search : context.url.pathname);
}

export function wantsJson(request: Request): boolean {
  return /\bapplication\/json\b/i.test(request.headers.get("accept") ?? "") || /^application\/json\b/i.test(request.headers.get("content-type") ?? "");
}

export function stepUpRequiredResponse(context: Pick<GuardContext, "request" | "url">, options: { vi?: boolean; next?: string; json?: boolean } = {}): Response {
  const vi = options.vi ?? (context.url.pathname.startsWith("/vi/") || /^\/vi\//.test(new URL(context.request.headers.get("referer") ?? "https://x.invalid/").pathname));
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (options.json ?? wantsJson(context.request)) {
    return new Response(JSON.stringify({ ok: false, error: { code: "step_up_required", message: vi ? "Xác thực lại bằng passkey trước thao tác này." : "Verify with your passkey again before this action.", verify: verifyPath(vi, returnPath(context, options.next)) } }), {
      status: 403, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
    });
  }
  return new Response(null, { status: 303, headers: { ...headers, Location: verifyPath(vi, returnPath(context, options.next)) } });
}

/** null when the signed-in person verified a passkey in this session within five minutes; otherwise the response to send. */
export async function stepUpGuard(context: GuardContext, options: { vi?: boolean; next?: string; json?: boolean } = {}): Promise<Response | null> {
  const userId = context.locals.workspace?.id ?? context.locals.user?.id;
  if (userId && await stepUpFresh(context.session, userId)) return null;
  return stepUpRequiredResponse(context, options);
}
