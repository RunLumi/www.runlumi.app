// Page data for the shell's own screens (stories UI1-S3, S4, S6): search,
// notices and My account › Notifications. Everything is read with the
// signed-in person's own permissions and scopes; nothing is sample data.
import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { actorFrom } from "../crm/access";
import { listAccounts, listContacts } from "../crm/directory";
import { listLeads } from "../crm/leads";
import { type Filters, listOpportunities } from "../crm/records";
import { HrmError } from "../hrm/fields";
import { sameOrigin } from "../http";
import { hasNoticeSource, listNotices, markNoticeRead, type Notice } from "./inbox";
import { workspaceMembers } from "./members";
import { listRules, type Rule } from "./notify/rules";
import type { WorkspaceUser } from "./roles";

export type Lang = "en" | "vi";

// ------------------------------------------------------------------ search

export type SearchKind = "opportunities" | "companies" | "contacts" | "leads" | "members";
export interface SearchHit { title: string; href: string; meta: string[] }
export interface SearchGroup { kind: SearchKind; total: number; hits: SearchHit[]; all: string }
export const SEARCH_LIMIT = 5;
export const searchKinds: SearchKind[] = ["opportunities", "companies", "contacts", "leads", "members"];

/** Object types this person may search: the lists they can already open. */
export function searchableKinds(user: WorkspaceUser): SearchKind[] {
  return searchKinds.filter((kind) => kind === "members" ? user.can("users.manage") : user.can("crm.access"));
}

/**
 * Search runs each list's own function with the person's CRM actor, so the
 * ownership scopes of those lists apply unchanged; members need users.manage.
 */
export async function search(db: D1Database, contentDb: D1Database, user: WorkspaceUser, q: string, only: SearchKind | "" = ""): Promise<SearchGroup[]> {
  const kinds = searchableKinds(user).filter((kind) => !only || kind === only);
  const limit = only ? 50 : SEARCH_LIMIT;
  const actor = actorFrom(user);
  const enc = encodeURIComponent(q);
  const groups: SearchGroup[] = [];
  for (const kind of kinds) {
    if (kind === "members") {
      const needle = q.toLocaleLowerCase("vi");
      const rows = (await workspaceMembers(db, contentDb)).filter((row) => `${row.name} ${row.email}`.toLocaleLowerCase("vi").includes(needle));
      groups.push({ kind, total: rows.length, all: `/workspace/users?q=${enc}`, hits: rows.slice(0, limit).map((row) => ({ title: row.name || row.email, href: `/workspace/users/${encodeURIComponent(row.user_id)}`, meta: [row.email, row.enabled ? "" : "revoked"].filter(Boolean) })) });
      continue;
    }
    if (!actor) continue;
    if (kind === "opportunities") {
      const filters: Filters = { playbook: "", stage: "", owner: "", channel: "", cohort: "", industry: "", region: "", offer: "", outcome: "", q };
      const result = await listOpportunities(db, actor, filters, 1);
      groups.push({ kind, total: result.total, all: `/crm/pipeline?playbook=all&q=${enc}`, hits: result.rows.slice(0, limit).map((row) => ({ title: row.title, href: `/crm/${encodeURIComponent(row.id)}`, meta: [row.account_name, `outcome:${row.outcome}`] })) });
    } else if (kind === "companies") {
      const result = await listAccounts(db, actor, { q, owner: "" }, 1);
      groups.push({ kind, total: result.total, all: `/crm/accounts?q=${enc}`, hits: result.rows.slice(0, limit).map((row) => ({ title: row.name, href: `/crm/accounts/${encodeURIComponent(row.id)}`, meta: [row.industry, row.region].filter(Boolean) })) });
    } else if (kind === "contacts") {
      const result = await listContacts(db, actor, { q, owner: "" }, 1);
      groups.push({ kind, total: result.total, all: `/crm/contacts?q=${enc}`, hits: result.rows.slice(0, limit).map((row) => ({ title: row.name, href: `/crm/contacts/${encodeURIComponent(row.id)}`, meta: [row.account_name] })) });
    } else if (kind === "leads") {
      const result = await listLeads(db, actor, { state: "all", status: "", owner: "", source: "", q }, 1);
      groups.push({ kind, total: result.total, all: `/crm/leads?state=all&q=${enc}`, hits: result.rows.slice(0, limit).map((row) => ({ title: row.name, href: `/crm/leads/${encodeURIComponent(row.id)}`, meta: [row.company, `lead:${row.state}`].filter(Boolean) })) });
    }
  }
  return groups;
}

export async function searchPage(astro: AstroGlobal, lang: Lang) {
  const user = astro.locals.workspace!;
  const { DB, CONTENT_DB } = envFromLocals(astro.locals);
  const q = (astro.url.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const kinds = searchableKinds(user);
  const requested = astro.url.searchParams.get("type") ?? "";
  const only = (kinds as string[]).includes(requested) ? requested as SearchKind : "";
  const ready = [...q].length >= 2;
  const groups = ready && kinds.length ? await search(DB, CONTENT_DB, user, q, only) : [];
  const counts = ready && only ? await search(DB, CONTENT_DB, user, q) : groups;
  return { lang, vi: lang === "vi", user, q, ready, only, kinds, groups, counts: Object.fromEntries(counts.map((group) => [group.kind, group.total])) as Partial<Record<SearchKind, number>> };
}

// ------------------------------------------------------------------ notices

export async function inboxPage(astro: AstroGlobal, lang: Lang): Promise<Response | { lang: Lang; vi: boolean; user: WorkspaceUser; source: boolean; notices: Notice[]; unread: number; filter: "all" | "unread"; saved: string; error: string }> {
  const user = astro.locals.workspace!;
  const vi = lang === "vi";
  const { DB } = envFromLocals(astro.locals);
  const self = astro.url.pathname;
  if (astro.request.method === "POST") {
    if (!sameOrigin(astro.request)) return new Response("Invalid request origin.", { status: 400 });
    const form = await astro.request.formData().catch(() => null);
    const intent = String(form?.get("intent") ?? "");
    const key = String(form?.get("request_key") ?? "");
    let error = "";
    try {
      if (!hasNoticeSource(user)) return new Response(vi ? "Bạn không có thông báo trong ứng dụng." : "You have no in-app notices.", { status: 403 });
      if (intent === "mark_read") await markNoticeRead(DB, user, key, String(form?.get("id") ?? ""), Number(form?.get("version") ?? 0));
      else if (intent === "mark_all") {
        const { notices } = await listNotices(DB, user);
        let index = 0;
        for (const notice of notices.filter((item) => item.unread)) await markNoticeRead(DB, user, `${key.slice(0, 80)}-${index++}`, notice.id, notice.version);
      } else return new Response("Unknown action.", { status: 400 });
    } catch (caught) {
      error = caught instanceof HrmError ? caught.message : "internal_error";
    }
    const next = new URL(self, astro.url);
    if (astro.url.searchParams.get("filter") === "unread") next.searchParams.set("filter", "unread");
    next.searchParams.set(error ? "error" : "saved", error || intent);
    return new Response(null, { status: 303, headers: { Location: next.pathname + next.search, "Cache-Control": "private, no-store" } });
  }
  const source = hasNoticeSource(user);
  const { notices, unread } = source ? await listNotices(DB, user) : { notices: [], unread: 0 };
  const filter = astro.url.searchParams.get("filter") === "unread" ? "unread" : "all";
  return { lang, vi, user, source, notices, unread, filter, saved: astro.url.searchParams.get("saved") ?? "", error: astro.url.searchParams.get("error") ?? "" };
}

// ------------------------------------------------------- my notifications

export interface RuleReach { rule: Rule; why: ("person" | "role" | "admins" | "owner")[]; scope: "team" | "own" }

/** Enabled email rules that reach this person, and why (mirrors recipientsFor). */
export function rulesReaching(user: WorkspaceUser, rules: Rule[]): RuleReach[] {
  if (!user.can("crm.access")) return [];
  const scope = user.can("crm.team") ? "team" : "own";
  return rules.filter((rule) => rule.enabled && rule.email).flatMap((rule) => {
    const why: RuleReach["why"] = [];
    if (rule.recipients.users.includes(user.id)) why.push("person");
    if (rule.recipients.roles.some((role) => user.roles.has(role))) why.push("role");
    if (rule.recipients.admins && user.admin) why.push("admins");
    if (rule.recipients.record_owner) why.push("owner");
    return why.length ? [{ rule, why, scope }] : [];
  });
}

export async function accountNotificationsPage(astro: AstroGlobal, lang: Lang) {
  const user = astro.locals.workspace!;
  const { DB } = envFromLocals(astro.locals);
  const rules = user.can("crm.access") ? rulesReaching(user, await listRules(DB, true)) : [];
  const code = await DB.prepare("SELECT 1 AS ok FROM workspace_anti_phishing WHERE user_id = ?").bind(user.id).first<{ ok: number }>().catch(() => null);
  return { lang, vi: lang === "vi", user, rules, hrmNotices: hasNoticeSource(user), hasCode: !!code };
}
