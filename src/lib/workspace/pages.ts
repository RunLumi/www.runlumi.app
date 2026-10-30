// Workspace home and the users/roles admin page.
import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { vnDate } from "../crm/money";
import { RETENTION_STATUSES, retentionCutoff } from "../hiring/interviews";
import { type AccessFormState, type AccessRow, type AuditEntry, accessRows, auditFor, emptyState, handleAccessPost, namesFor } from "./access";
import type { WorkspaceUser } from "./roles";

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

export type UsersState = AccessFormState;

export type UsersFilter = "all" | "backup" | "agents" | "active" | "revoked" | "admins" | "terms";

/** Admin › Users: the access table, quick filters, search and recent changes. */
export async function usersPage(astro: AstroGlobal, lang: Lang): Promise<Response | {
  lang: Lang; vi: boolean; user: WorkspaceUser; rows: AccessRow[]; shown: AccessRow[]; filter: UsersFilter; query: string;
  audit: AuditEntry[]; names: Map<string, string>; state: UsersState;
}> {
  const user = astro.locals.workspace!;
  const { DB, CONTENT_DB } = envFromLocals(astro.locals);
  let state: UsersState = emptyState;
  if (astro.request.method === "POST") {
    const result = await handleAccessPost(astro, () => `${astro.url.pathname}?saved=1`);
    if (result instanceof Response) return result;
    state = result;
  }
  const rows = await accessRows(DB, CONTENT_DB);
  const filters: UsersFilter[] = ["all", "backup", "agents", "active", "revoked", "admins", "terms"];
  const requested = astro.url.searchParams.get("filter") as UsersFilter | null;
  const filter = requested && filters.includes(requested) ? requested : "all";
  const query = (astro.url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const needle = query.toLocaleLowerCase("vi");
  const shown = rows.filter((row) => ({
    all: true, backup: row.passkeys !== null && row.passkeys < 2, agents: row.tokens > 0, active: row.enabled && row.active, revoked: !row.enabled || !row.active, admins: row.admin, terms: row.sellerTermsMissing,
  })[filter]).filter((row) => !needle || `${row.name} ${row.email}`.toLocaleLowerCase("vi").includes(needle));
  const audit = await auditFor(DB, undefined, 10);
  const names = await namesFor(CONTENT_DB, audit.map((row) => row.target_user_id));
  return { lang, vi: lang === "vi", user, rows, shown, filter, query, audit, names, state };
}

/** Admin › Users › New: grant roles to an existing EmDash account. */
export async function newMemberPage(astro: AstroGlobal, lang: Lang): Promise<Response | {
  lang: Lang; vi: boolean; user: WorkspaceUser; candidates: { email: string; name: string | null }[]; state: UsersState;
}> {
  const user = astro.locals.workspace!;
  if (!user.can("users.manage")) return new Response("Forbidden", { status: 403 });
  const { DB, CONTENT_DB } = envFromLocals(astro.locals);
  const base = lang === "vi" ? "/vi/workspace/users" : "/workspace/users";
  let state: UsersState = emptyState;
  if (astro.request.method === "POST") {
    const result = await handleAccessPost(astro, (id) => `${base}/${encodeURIComponent(id)}?saved=1`);
    if (result instanceof Response) return result;
    state = result;
  }
  const members = new Set((await DB.prepare("SELECT user_id FROM workspace_members").all<{ user_id: string }>()).results.map((row) => row.user_id));
  const candidates = (await CONTENT_DB.prepare("SELECT id, email, name FROM users WHERE disabled = 0 AND role < 50 ORDER BY name, email LIMIT 300").all<{ id: string; email: string; name: string | null }>()).results
    .filter((account) => !members.has(account.id)).map(({ email, name }) => ({ email, name }));
  return { lang, vi: lang === "vi", user, candidates, state };
}

/** Admin › Users › person: identity, roles, modules, credentials and access history. */
export async function memberPage(astro: AstroGlobal, lang: Lang): Promise<Response | {
  lang: Lang; vi: boolean; user: WorkspaceUser; member: AccessRow; audit: AuditEntry[]; names: Map<string, string>; state: UsersState; self: boolean; security: MemberSecurity;
}> {
  const user = astro.locals.workspace!;
  if (!user.can("users.manage")) return new Response("Forbidden", { status: 403 });
  const { DB, CONTENT_DB } = envFromLocals(astro.locals);
  const id = String(astro.params.id ?? "");
  const notFound = () => new Response(lang === "vi" ? "Không tìm thấy người dùng." : "User not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
  if (!id || id.length > 100) return notFound();
  let state: UsersState = emptyState;
  if (astro.request.method === "POST") {
    const result = await handleAccessPost(astro, (saved) => `${astro.url.pathname.replace(/\/[^/]*$/, "")}/${encodeURIComponent(saved)}?saved=1`);
    if (result instanceof Response) return result;
    state = result;
  }
  const [member] = await accessRows(DB, CONTENT_DB, id);
  if (!member) return notFound();
  const audit = await auditFor(DB, id, 100);
  const names = await namesFor(CONTENT_DB, [member.granted_by]);
  return { lang, vi: lang === "vi", user, member, audit, names, state, self: member.user_id === user.id, security: await memberSecurity(DB, CONTENT_DB, member.user_id) };
}

/** What an admin sees about a member's security: passkey list (no IDs), whether a code is set (never its value), tokens and recent activity. */
export interface MemberSecurity {
  passkeys: { name: string | null; device_type: string | null; backed_up: number | null; created_at: string | null; last_used_at: string | null }[];
  codeUpdated: string | null; lastCheck: string | null;
  tokens: { name: string; scope: string; last_used_at: string | null }[];
  activity: { id: string; action: string; created_at: string }[];
}

async function memberSecurity(db: D1Database, contentDb: D1Database, userId: string): Promise<MemberSecurity> {
  const [passkeys, code, check, tokens, activity] = await Promise.all([
    contentDb.prepare("SELECT name, device_type, backed_up, created_at, last_used_at FROM credentials WHERE user_id = ? ORDER BY created_at").bind(userId).all<MemberSecurity["passkeys"][number]>(),
    db.prepare("SELECT updated_at FROM workspace_anti_phishing WHERE user_id = ?").bind(userId).first<{ updated_at: string }>(),
    db.prepare("SELECT MAX(created_at) AS at FROM workspace_audit WHERE actor_id = ? AND action = 'passkey_verified'").bind(userId).first<{ at: string | null }>(),
    db.prepare("SELECT name, scope, last_used_at FROM crm_api_tokens WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 20").bind(userId, new Date().toISOString()).all<MemberSecurity["tokens"][number]>(),
    db.prepare("SELECT id, action, created_at FROM workspace_audit WHERE actor_id = ? ORDER BY created_at DESC LIMIT 8").bind(userId).all<MemberSecurity["activity"][number]>(),
  ]);
  return { passkeys: passkeys.results, codeUpdated: code?.updated_at ?? null, lastCheck: check?.at ?? null, tokens: tokens.results, activity: activity.results };
}

/** Admin › Roles and permissions: the permission map as a matrix. */
export function rolesPage(astro: AstroGlobal, lang: Lang): Response | { lang: Lang; vi: boolean; user: WorkspaceUser } {
  const user = astro.locals.workspace!;
  if (!user.can("users.manage")) return new Response("Forbidden", { status: 403 });
  return { lang, vi: lang === "vi", user };
}

/** My account: the signed-in person's own identity, roles and connections. */
export async function accountPage(astro: AstroGlobal, lang: Lang) {
  const user = astro.locals.workspace!;
  const { DB, CONTENT_DB } = envFromLocals(astro.locals);
  const identity = await CONTENT_DB.prepare("SELECT email, name, role, created_at FROM users WHERE id = ? LIMIT 1").bind(user.id).first<{ email: string; name: string | null; role: number; created_at: string | null }>();
  let passkeys: { name: string | null; device_type: string; backed_up: number; created_at: string | null; last_used_at: string | null }[] | null = null;
  try {
    passkeys = (await CONTENT_DB.prepare("SELECT name, device_type, backed_up, created_at, last_used_at FROM credentials WHERE user_id = ? ORDER BY created_at").bind(user.id).all<NonNullable<typeof passkeys>[number]>()).results;
  } catch { passkeys = null; }
  const membership = user.admin ? null : await DB.prepare("SELECT created_at, updated_at FROM workspace_members WHERE user_id = ?").bind(user.id).first<{ created_at: string; updated_at: string }>();
  const tokens = user.can("crm.access")
    ? (await DB.prepare("SELECT COUNT(*) AS n FROM crm_api_tokens WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?").bind(user.id, new Date().toISOString()).first<{ n: number }>())?.n ?? 0
    : null;
  const hasCode = !!await DB.prepare("SELECT 1 AS ok FROM workspace_anti_phishing WHERE user_id = ?").bind(user.id).first<{ ok: number }>().catch(() => null);
  return { lang, vi: lang === "vi", user, identity, passkeys, membership, tokens, hasCode };
}
