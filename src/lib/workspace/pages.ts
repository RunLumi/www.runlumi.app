// Workspace home and the users/roles admin page.
import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { sameOrigin } from "../http";
import { vnDate } from "../crm/money";
import { RETENTION_STATUSES, retentionCutoff } from "../hiring/interviews";
import { type AuditRow, AccessError, type MemberRow, parseRoles, recentAudit, saveMember, workspaceMembers } from "./members";
import type { WorkspaceUser } from "./roles";
import { stepUpGuard } from "./step-up";

export type Lang = "en" | "vi";

export interface HomeCard { module: "hiring" | "crm" | "hrm" | "finance" | "admin"; figures: { label: [string, string]; value: number; href: string }[] }

export async function homePage(astro: AstroGlobal, lang: Lang) {
  const user = astro.locals.workspace!;
  const { DB } = envFromLocals(astro.locals);
  const today = vnDate();
  const cards: HomeCard[] = [];
  if (user.can("hiring.access")) {
    const due = new Date(`${retentionCutoff()}T23:59:59.999+07:00`).toISOString();
    const row = await DB.prepare(`SELECT (SELECT COUNT(*) FROM jobs WHERE status = 'published') AS open, (SELECT COUNT(*) FROM applications WHERE status = 'new') AS fresh, (SELECT COUNT(*) FROM applications WHERE status = 'interview') AS interview,
      (SELECT COUNT(*) FROM applications WHERE status IN (${RETENTION_STATUSES.map(() => "?").join(", ")}) AND updated_at <= ?) AS expired`)
      .bind(...RETENTION_STATUSES, due).first<{ open: number; fresh: number; interview: number; expired: number }>();
    cards.push({ module: "hiring", figures: [
      { label: ["New applications", "Hồ sơ mới"], value: row?.fresh ?? 0, href: "/admin/jobs/applications?status=new" },
      { label: ["In interview", "Đang phỏng vấn"], value: row?.interview ?? 0, href: "/admin/jobs/applications?status=interview" },
      { label: ["Open roles", "Vị trí đang tuyển"], value: row?.open ?? 0, href: "/admin/jobs" },
      ...(user.can("hiring.applications.delete") ? [{ label: ["Past the 60-day retention (delete)", "Quá hạn lưu 60 ngày (cần xóa)"] as [string, string], value: row?.expired ?? 0, href: "/admin/jobs/applications#retention" }] : []),
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
  if(user.can("hrm.access")&&user.hrmEnabled===true){
    const row=user.can("hrm.records.manage")
      ? await DB.prepare("SELECT COUNT(*) AS count FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id AND e.status!='ended'").first<{count:number}>()
      : user.can("hrm.team.read")
        ? await DB.prepare("SELECT COUNT(*) AS count FROM hrm_employments WHERE manager_user_id=? AND status!='ended' AND (started_on IS NULL OR started_on<=date('now','+7 hours')) AND (ended_on IS NULL OR ended_on>date('now','+7 hours'))").bind(user.id).first<{count:number}>()
        : await DB.prepare("SELECT COUNT(*) AS count FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id AND e.status!='ended' WHERE p.user_id=?").bind(user.id).first<{count:number}>();
    const team=user.can("hrm.records.manage")||user.can("hrm.team.read");
    cards.push({module:"hrm",figures:[{label:team?["People in scope","Nhân sự trong phạm vi"]:["Your linked profile","Hồ sơ đã liên kết"],value:row?.count??0,href:team?"/hrm/people":"/hrm/me"}]});
  }
  if (user.can("users.manage")) {
    const row = await DB.prepare("SELECT (SELECT COUNT(*) FROM workspace_members WHERE enabled = 1) AS members").first<{ members: number }>();
    cards.push({ module: "admin", figures: [{ label: ["People with access", "Người có quyền truy cập"], value: row?.members ?? 0, href: "/workspace/users" }] });
  }
  if (user.admin && user.can("finance.access") && user.financeEnabled === true) {
    const row = await DB.prepare("SELECT COUNT(*) AS count FROM finance_periods WHERE authoritative_closed_revision_id IS NOT NULL").first<{ count: number }>();
    cards.push({ module: "finance", figures: [{ label: ["Closed monthly periods", "Tháng đã chốt"], value: row?.count ?? 0, href: "/finance/actuals" }] });
  }
  return { lang, vi: lang === "vi", user, cards };
}

export interface UsersState { errors: Record<string, string>; values: Record<string, string>; intent: string }

export async function usersPage(astro: AstroGlobal, lang: Lang): Promise<Response | {
  lang: Lang; vi: boolean; user: WorkspaceUser; members: MemberRow[]; accounts: { id: string; email: string; name: string | null; role: number }[];
  audit: AuditRow[]; names: Record<string, string>; state: UsersState; withTerms: Set<string>;
}> {
  const user = astro.locals.workspace!;
  const { DB, CONTENT_DB } = envFromLocals(astro.locals);
  let state: UsersState = { errors: {}, values: {}, intent: "" };
  if (astro.request.method === "POST") {
    if (!user.can("users.manage")) return new Response("Forbidden", { status: 403 });
    if (!sameOrigin(astro.request)) return new Response("Invalid request origin.", { status: 400 });
    // Access changes need a passkey check from the last five minutes.
    const stepUp = await stepUpGuard({ session: astro.session, locals: astro.locals, request: astro.request, url: astro.url }, { vi: lang === "vi", next: astro.url.pathname });
    if (stepUp) return stepUp;
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
  // Partners earn commission only once their seller terms are declared.
  const withTerms = new Set((await DB.prepare("SELECT DISTINCT user_id FROM crm_seller_terms").all<{ user_id: string }>()).results.map((row) => row.user_id));
  return { lang, vi: lang === "vi", user, members, accounts, audit, names, state, withTerms };
}
