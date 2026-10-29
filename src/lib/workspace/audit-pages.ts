// Loaders for the admin audit review (list, event, CSV export). Permission:
// users.manage (System Super Admin). Finance rows only when Finance is ready
// for this admin, as everywhere else Finance data is read.
import type { APIContext, AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { AUDIT_EXPORT_MAX, type AuditEntry, type AuditFilters, auditCsv, getAuditEvent, listAudit, nearbyEvents, parseFilters } from "./audit-log";
import { auditStatement, emdashUsers } from "./members";
import type { WorkspaceUser } from "./roles";
import { stepUpGuard } from "./step-up";

export type Lang = "en" | "vi";

const financeOpen = (user: WorkspaceUser) => user.admin && user.can("finance.audit.read") && user.financeEnabled === true;

async function names(contentDb: D1Database, rows: AuditEntry[]): Promise<Record<string, string>> {
  const ids = [...new Set(rows.flatMap((row) => [row.actor_id, row.target]).filter((id) => id && !id.includes(":")))];
  const users = await emdashUsers(contentDb, ids);
  return Object.fromEntries([...users].map(([id, user]) => [id, user.name || user.email]));
}

export interface AuditListData { lang: Lang; vi: boolean; user: WorkspaceUser; filters: AuditFilters; rows: AuditEntry[]; next: string | null; names: Record<string, string>; finance: boolean; actors: { id: string; name: string }[] }

export async function auditLogPage(astro: AstroGlobal, lang: Lang): Promise<AuditListData | Response> {
  const user = astro.locals.workspace!;
  if (!user.can("users.manage")) return new Response("Forbidden", { status: 403 });
  const { DB, CONTENT_DB } = envFromLocals(astro.locals);
  const filters = parseFilters(astro.url), finance = financeOpen(user);
  const { rows, next } = await listAudit(DB, filters, { finance });
  const actorIds = (await DB.prepare("SELECT DISTINCT actor_id FROM workspace_audit ORDER BY actor_id LIMIT 200").all<{ actor_id: string }>()).results.map((row) => row.actor_id);
  const actorNames = await emdashUsers(CONTENT_DB, actorIds);
  const actors = actorIds.map((id) => ({ id, name: actorNames.get(id)?.name || actorNames.get(id)?.email || id })).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  return { lang, vi: lang === "vi", user, filters, rows, next, names: await names(CONTENT_DB, rows), finance, actors };
}

export interface AuditEventData { lang: Lang; vi: boolean; user: WorkspaceUser; entry: AuditEntry; nearby: AuditEntry[]; names: Record<string, string> }

export async function auditEventPage(astro: AstroGlobal, lang: Lang): Promise<AuditEventData | Response> {
  const user = astro.locals.workspace!;
  if (!user.can("users.manage")) return new Response("Forbidden", { status: 403 });
  const { DB, CONTENT_DB } = envFromLocals(astro.locals);
  const entry = await getAuditEvent(DB, astro.params.id ?? "", { finance: financeOpen(user) });
  if (!entry) return new Response(lang === "vi" ? "Không tìm thấy sự kiện." : "Event not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const nearby = await nearbyEvents(DB, entry, { finance: financeOpen(user) });
  return { lang, vi: lang === "vi", user, entry, nearby, names: await names(CONTENT_DB, [entry, ...nearby]) };
}

/** GET /api/workspace/audit/export.csv — the filtered list (up to 5,000 rows), behind step-up, and itself audited. */
export async function auditExport(context: APIContext): Promise<Response> {
  const user = context.locals.workspace;
  if (!user?.can("users.manage")) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "private, no-store" } });
  const vi = context.url.searchParams.get("lang") === "vi";
  const stepUp = await stepUpGuard(context, { vi, next: `${vi ? "/vi" : ""}/workspace/audit` });
  if (stepUp) return stepUp;
  const { DB } = envFromLocals(context.locals);
  const filters = { ...parseFilters(context.url), cursor: "" };
  const { rows } = await listAudit(DB, filters, { finance: financeOpen(user), limit: AUDIT_EXPORT_MAX });
  const { cursor: _cursor, ...applied } = filters;
  await auditStatement(DB, user, "data_exported", "audit", { export: "audit_log", rows: rows.length, filters: applied }, new Date().toISOString(), { module: "admin" }).run();
  return new Response(auditCsv(rows, vi), { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="lumi-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
