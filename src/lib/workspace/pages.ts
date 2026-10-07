// Workspace home and the users/roles admin page.
import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { sameOrigin } from "../http";
import { vnDate } from "../crm/money";
import { type AuditRow, AccessError, type MemberRow, parseRoles, recentAudit, saveMember, workspaceMembers } from "./members";
import type { WorkspaceUser } from "./roles";

export type Lang = "en" | "vi";

export interface HomeCard { module: "hiring" | "crm" | "admin"; figures: { label: [string, string]; value: number; href: string }[] }

export async function homePage(astro: AstroGlobal, lang: Lang) {
  const user = astro.locals.workspace!;
  const { DB } = envFromLocals(astro.locals);
  const today = vnDate();
  const cards: HomeCard[] = [];
  if (user.can("hiring.access")) {
    const row = await DB.prepare("SELECT (SELECT COUNT(*) FROM jobs WHERE status = 'published') AS open, (SELECT COUNT(*) FROM applications WHERE status = 'new') AS fresh, (SELECT COUNT(*) FROM applications WHERE status = 'interview') AS interview")
      .first<{ open: number; fresh: number; interview: number }>();
    cards.push({ module: "hiring", figures: [
      { label: ["New applications", "Hồ sơ mới"], value: row?.fresh ?? 0, href: "/admin/jobs/applications?status=new" },
      { label: ["In interview", "Đang phỏng vấn"], value: row?.interview ?? 0, href: "/admin/jobs/applications?status=interview" },
      { label: ["Open roles", "Vị trí đang tuyển"], value: row?.open ?? 0, href: "/admin/jobs" },
    ] });
  }
  if (user.can("crm.access")) {
    const team = user.can("crm.team");
    const scope = team ? "1 = 1" : "o.owner_id = ?";
    const args = team ? [] : [user.id];
    const row = await DB.prepare(
      `SELECT (SELECT COUNT(*) FROM crm_opportunities o WHERE o.outcome = 'open' AND ${scope}) AS open,
        (SELECT COUNT(*) FROM crm_tasks t JOIN crm_opportunities o ON o.id = t.opportunity_id WHERE t.status = 'open' AND t.due_on <= ? AND ${scope}) AS due,
        (SELECT COUNT(*) FROM crm_inbound WHERE status = 'queued') AS inbound`,
    ).bind(...args, today, ...args).first<{ open: number; due: number; inbound: number }>();
    cards.push({ module: "crm", figures: [
      { label: ["Tasks due or overdue", "Việc đến hạn hoặc quá hạn"], value: row?.due ?? 0, href: "/crm" },
      { label: [team ? "Open opportunities (team)" : "Your open opportunities", team ? "Cơ hội đang mở (cả đội)" : "Cơ hội đang mở của bạn"], value: row?.open ?? 0, href: "/crm/pipeline?playbook=all&outcome=open" },
      ...(team ? [{ label: ["Enquiries to assign", "Yêu cầu chờ phân công"] as [string, string], value: row?.inbound ?? 0, href: "/crm/admin#inbound" }] : []),
    ] });
  }
  if (user.can("users.manage")) {
    const row = await DB.prepare("SELECT (SELECT COUNT(*) FROM workspace_members WHERE enabled = 1) AS members").first<{ members: number }>();
    cards.push({ module: "admin", figures: [{ label: ["People with access", "Người có quyền truy cập"], value: row?.members ?? 0, href: "/workspace/users" }] });
  }
  return { lang, vi: lang === "vi", user, cards };
}

export interface UsersState { errors: Record<string, string>; values: Record<string, string>; intent: string }

export async function usersPage(astro: AstroGlobal, lang: Lang): Promise<Response | {
  lang: Lang; vi: boolean; user: WorkspaceUser; members: MemberRow[]; accounts: { id: string; email: string; name: string | null; role: number }[];
  audit: AuditRow[]; names: Record<string, string>; state: UsersState;
}> {
  const user = astro.locals.workspace!;
  const { DB, CONTENT_DB } = envFromLocals(astro.locals);
  let state: UsersState = { errors: {}, values: {}, intent: "" };
  if (astro.request.method === "POST") {
    if (!user.can("users.manage")) return new Response("Forbidden", { status: 403 });
    if (!sameOrigin(astro.request)) return new Response("Invalid request origin.", { status: 400 });
    const form = await astro.request.formData().catch(() => null);
    if (!form) return new Response("Invalid form body.", { status: 400 });
    const intent = String(form.get("intent") ?? "");
    try {
      if (intent !== "grant" && intent !== "update") return new Response("Unknown action.", { status: 400 });
      await saveMember(DB, CONTENT_DB, user, {
        email: intent === "grant" ? String(form.get("email") ?? "") : undefined,
        userId: intent === "update" ? String(form.get("user_id") ?? "") : undefined,
        roles: parseRoles(form.getAll("roles")),
        enabled: form.get("enabled") !== "0",
      });
      return new Response(null, { status: 303, headers: { Location: `${astro.url.pathname}?saved=1`, "Cache-Control": "private, no-store" } });
    } catch (error) {
      if (!(error instanceof AccessError)) throw error;
      astro.response.status = 422;
      state = { intent, errors: { [error.field]: error.message }, values: { email: String(form.get("email") ?? ""), user_id: String(form.get("user_id") ?? "") } };
    }
  }
  const members = await workspaceMembers(DB, CONTENT_DB);
  const accounts = (await CONTENT_DB.prepare("SELECT id, email, name, role FROM users WHERE disabled = 0 ORDER BY role DESC, name, email LIMIT 300").all<{ id: string; email: string; name: string | null; role: number }>()).results;
  const audit = await recentAudit(DB);
  const names = Object.fromEntries([...accounts.map((account) => [account.id, account.name || account.email]), ...members.map((member) => [member.user_id, member.name || member.email])]);
  return { lang, vi: lang === "vi", user, members, accounts, audit, names, state };
}
