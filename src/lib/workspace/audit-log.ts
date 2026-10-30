// Audit log review for admins (R-11): the append-only workspace_audit table
// and, when Finance is ready, the append-only Finance audit history, read as
// one newest-first list with filters, a detail screen and a CSV export.
// Read-only: nothing here writes an audit event except the export itself.
// Finance rows follow the Finance boundary: only a System Super Admin whose
// Finance books are ready sees them, and export chunks (report data) never
// appear.

export const AUDIT_PAGE = 50;
export const AUDIT_EXPORT_MAX = 5000;

export const auditKinds = ["security", "access", "data", "agent", "denied"] as const;
export type AuditKind = typeof auditKinds[number];

const SECURITY_ACTIONS = ["passkey_verified", "passkey_failed", "passkey_added", "passkey_removed", "passkey_recovery_opened", "anti_phishing_set", "anti_phishing_changed"];
const ACCESS_ACTIONS = ["access_saved", "access_revoked", "agent_policy_changed", "notification_rule_saved", "notification_destination_saved", "notification_destination_removed"];
const DATA_ACTIONS = ["data_exported", "record_deleted", "candidates_purged", "report.export"];

/** Which quick-filter kind an event belongs to, for the list's "Kind" column. */
export function auditKindOf(entry: Pick<AuditEntry, "action" | "via">): "security" | "access" | "data" | "agent" | "other" {
  if (entry.via === "api" || entry.via === "mcp") return "agent";
  if (SECURITY_ACTIONS.includes(entry.action) || entry.action === "passkey_removed") return "security";
  if (ACCESS_ACTIONS.includes(entry.action)) return "access";
  if (DATA_ACTIONS.includes(entry.action)) return "data";
  return "other";
}

export interface AuditFilters { source: "all" | "workspace" | "finance"; kind: AuditKind | ""; module: string; actor: string; outcome: "" | "success" | "denied" | "failed"; from: string; to: string; q: string; cursor: string }

export interface AuditEntry {
  id: string; source: "workspace" | "finance"; created_at: string; actor_id: string; actor_name: string;
  module: string; action: string; outcome: string; via: string; target: string; detail: Record<string, unknown>;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const pick = <T extends string>(value: string | null, allowed: readonly T[]): T | "" => (allowed as readonly string[]).includes(value ?? "") ? value as T : "";

export function parseFilters(url: URL): AuditFilters {
  const get = (name: string) => url.searchParams.get(name);
  return {
    source: pick(get("source"), ["workspace", "finance"] as const) || "all",
    kind: pick(get("kind"), auditKinds),
    module: (get("module") ?? "").replace(/[^a-z_]/g, "").slice(0, 20),
    actor: (get("actor") ?? "").slice(0, 80),
    outcome: pick(get("outcome"), ["success", "denied", "failed"] as const),
    from: datePattern.test(get("from") ?? "") ? get("from")! : "",
    to: datePattern.test(get("to") ?? "") ? get("to")! : "",
    q: (get("q") ?? "").replace(/\p{Cc}/gu, "").trim().slice(0, 80),
    cursor: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\|[A-Za-z0-9_-]{1,80}$/.test(get("cursor") ?? "") ? get("cursor")! : "",
  };
}

/** The same filters as a query string, for links, paging and the export. */
export function filterQuery(filters: AuditFilters, changes: Partial<AuditFilters> = {}): string {
  const merged = { ...filters, ...changes };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) if (value && !(key === "source" && value === "all")) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);
const inList = (values: string[]) => values.map(() => "?").join(", ");

function decode(detail: string): Record<string, unknown> {
  try {
    const value = JSON.parse(detail) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : { value };
  } catch { return {}; }
}

interface Row { id: string; source: "workspace" | "finance"; created_at: string; actor_id: string; actor_name: string; module: string; action: string; outcome: string; via: string; target: string; detail: string }

function query(filters: AuditFilters, finance: boolean): { sql: string; args: unknown[] } {
  const parts: string[] = [];
  if (filters.source !== "finance") parts.push("SELECT id, 'workspace' AS source, created_at, actor_id, actor_name, module, action, outcome, via, target_user_id AS target, detail FROM workspace_audit");
  // Export chunks carry report data, not events; the Finance page hides them too.
  if (finance && filters.source !== "workspace") parts.push("SELECT id, 'finance' AS source, created_at, actor_id, actor_name, 'finance' AS module, action, 'success' AS outcome, 'web' AS via, target_id AS target, detail FROM finance_audit_events WHERE action != 'report.export.chunk'");
  if (!parts.length) parts.push("SELECT id, 'workspace' AS source, created_at, actor_id, actor_name, module, action, outcome, via, target_user_id AS target, detail FROM workspace_audit WHERE 0");
  const where: string[] = [], args: unknown[] = [];
  if (filters.kind === "security") { where.push(`action IN (${inList(SECURITY_ACTIONS)})`); args.push(...SECURITY_ACTIONS); }
  if (filters.kind === "access") { where.push(`action IN (${inList(ACCESS_ACTIONS)})`); args.push(...ACCESS_ACTIONS); }
  if (filters.kind === "data") { where.push(`action IN (${inList(DATA_ACTIONS)})`); args.push(...DATA_ACTIONS); }
  if (filters.kind === "agent") where.push("via IN ('api', 'mcp')");
  if (filters.kind === "denied") where.push("outcome != 'success'");
  if (filters.module) { where.push("module = ?"); args.push(filters.module); }
  if (filters.outcome) { where.push("outcome = ?"); args.push(filters.outcome); }
  if (filters.actor) { where.push("actor_id = ?"); args.push(filters.actor); }
  if (filters.from) { where.push("created_at >= ?"); args.push(new Date(`${filters.from}T00:00:00+07:00`).toISOString()); }
  if (filters.to) { where.push("created_at <= ?"); args.push(new Date(`${filters.to}T23:59:59.999+07:00`).toISOString()); }
  if (filters.q) { where.push("(action LIKE ? ESCAPE '\\' OR actor_name LIKE ? ESCAPE '\\')"); args.push(`%${escapeLike(filters.q)}%`, `%${escapeLike(filters.q)}%`); }
  if (filters.cursor) {
    const [at, id] = filters.cursor.split("|");
    where.push("(created_at < ? OR (created_at = ? AND id < ?))"); args.push(at, at, id);
  }
  return { sql: `SELECT * FROM (${parts.join(" UNION ALL ")})${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC, id DESC`, args };
}

export async function listAudit(db: D1Database, filters: AuditFilters, options: { finance: boolean; limit?: number }): Promise<{ rows: AuditEntry[]; next: string | null }> {
  const limit = options.limit ?? AUDIT_PAGE;
  const { sql, args } = query(filters, options.finance);
  const rows = (await db.prepare(`${sql} LIMIT ?`).bind(...args, limit + 1).all<Row>()).results;
  const page = rows.slice(0, limit).map((row) => ({ ...row, detail: decode(row.detail) }));
  return { rows: page, next: rows.length > limit ? `${page.at(-1)!.created_at}|${page.at(-1)!.id}` : null };
}

/** One event for the detail screen; Finance events only when Finance is open to this admin. */
export async function getAuditEvent(db: D1Database, id: string, options: { finance: boolean }): Promise<AuditEntry | null> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  const own = await db.prepare("SELECT id, 'workspace' AS source, created_at, actor_id, actor_name, module, action, outcome, via, target_user_id AS target, detail FROM workspace_audit WHERE id = ?").bind(id).first<Row>();
  const row = own ?? (options.finance
    ? await db.prepare("SELECT id, 'finance' AS source, created_at, actor_id, actor_name, 'finance' AS module, action, 'success' AS outcome, 'web' AS via, target_id AS target, detail FROM finance_audit_events WHERE id = ? AND action != 'report.export.chunk'").bind(id).first<Row>()
    : null);
  return row ? { ...row, detail: decode(row.detail) } : null;
}

/** Events by the same person within an hour either side, for context on the detail screen. */
export async function nearbyEvents(db: D1Database, entry: AuditEntry, options: { finance: boolean }): Promise<AuditEntry[]> {
  const at = Date.parse(entry.created_at);
  const filters: AuditFilters = { source: "all", kind: "", module: "", actor: entry.actor_id, outcome: "", from: "", to: "", q: "", cursor: "" };
  const { sql, args } = query(filters, options.finance);
  const rows = (await db.prepare(`SELECT * FROM (${sql}) WHERE created_at BETWEEN ? AND ? AND id != ? LIMIT 20`).bind(...args, new Date(at - 3600_000).toISOString(), new Date(at + 3600_000).toISOString(), entry.id).all<Row>()).results;
  return rows.map((row) => ({ ...row, detail: decode(row.detail) }));
}

const actionLabels: Record<string, [string, string]> = {
  access_saved: ["Access saved", "Lưu quyền"], access_revoked: ["Access revoked", "Thu hồi quyền"],
  passkey_verified: ["Passkey verified", "Xác thực passkey"], passkey_failed: ["Passkey check failed", "Xác thực passkey thất bại"],
  passkey_added: ["Passkey added", "Thêm passkey"], passkey_removed: ["Passkey removed", "Xóa passkey"], passkey_recovery_opened: ["Passkey recovery window opened", "Mở khôi phục passkey"],
  anti_phishing_set: ["Anti-phishing code set", "Đặt mã chống lừa đảo"], anti_phishing_changed: ["Anti-phishing code changed", "Đổi mã chống lừa đảo"],
  data_exported: ["Data exported", "Xuất dữ liệu"], record_deleted: ["Record deleted", "Xóa bản ghi"], candidates_purged: ["Expired candidates deleted", "Xóa ứng viên quá hạn"],
  agent_tool_called: ["AI agent tool call", "AI agent gọi công cụ"], agent_policy_changed: ["AI agent module access changed", "Đổi quyền module cho AI agent"],
  notification_rule_saved: ["Notification rule saved", "Lưu quy tắc thông báo"], notification_destination_saved: ["Webhook saved", "Lưu Webhook"], notification_destination_removed: ["Webhook removed", "Gỡ Webhook"],
  "report.export": ["Finance report exported", "Xuất báo cáo tài chính"],
};
export function actionLabel(action: string, vi: boolean): string {
  return actionLabels[action]?.[vi ? 1 : 0] ?? action;
}

export const moduleLabels: Record<string, [string, string]> = {
  admin: ["Admin", "Quản trị"], account: ["Account", "Tài khoản"], hiring: ["Hiring", "Tuyển dụng"], crm: ["CRM", "CRM"], hrm: ["HRM", "HRM"], finance: ["Finance", "Tài chính"], workspace: ["Workspace", "Workspace"],
};

/** RFC 4180 cell, with spreadsheet formulas neutralised. */
export function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
}

export function auditCsv(rows: AuditEntry[], vi: boolean): string {
  const header = vi ? ["Thời gian (UTC)", "Mã sự kiện", "Nguồn", "Người thực hiện", "Mã người thực hiện", "Qua", "Module", "Hành động", "Mã hành động", "Kết quả", "Đối tượng", "Chi tiết"]
    : ["Time (UTC)", "Event ID", "Source", "Actor", "Actor ID", "Via", "Module", "Action", "Action code", "Outcome", "Target", "Detail"];
  const lines = rows.map((row) => [row.created_at, row.id, row.source, row.actor_name, row.actor_id, row.via, row.module, actionLabel(row.action, vi), row.action, row.outcome, row.target, JSON.stringify(row.detail)].map(csvCell).join(","));
  return `\uFEFF${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}
