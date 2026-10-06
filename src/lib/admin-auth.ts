// EmDash resolves the current user from its session before application
// middleware runs. CMS editing roles do not grant ATS administrator access.
export function activeUser(locals: Pick<App.Locals, "user">) {
  const user = locals.user;
  return user?.id && !user.disabled ? user : undefined;
}

export function isAdmin(locals: Pick<App.Locals, "user">): boolean {
  return activeUser(locals)?.role === 50;
}

export function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20]/.test(value)) return "/admin/jobs";
  try {
    const url = new URL(value, "https://runlumi.app");
    const path = decodeURIComponent(url.pathname);
    const roots = ["/admin/jobs", "/admin/crm", "/crm", "/vi/crm"];
    if (url.origin !== "https://runlumi.app" || /[\\\x00-\x20]/.test(path)) return "/admin/jobs";
    if (!roots.some((root) => path === root || path.startsWith(`${root}/`))) return "/admin/jobs";
    return path === "/admin/jobs/login" ? "/admin/jobs" : url.pathname + url.search;
  } catch {
    return "/admin/jobs";
  }
}

export function emdashLoginUrl(next: string): string {
  return `/_emdash/admin/login?redirect=${encodeURIComponent(safeNext(next))}`;
}
