// Read models for the Admin screens (users list, member child screen, roles
// matrix) and the shared access-form handler. Identity comes from EmDash;
// grants, audit and API-token state from the hiring D1 database.
import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { sameOrigin } from "../http";
import { chunks, AccessError, parseRoles, saveMember } from "./members";
import { modules, type NavModule } from "./nav";
import { type Permission, type Role, type WorkspaceUser, permissions, permissionsFor, roles } from "./roles";

/** Roles grouped by the module they open, for forms and the matrix. */
export const roleAreas: { key: "hiring" | "crm" | "hrm"; en: string; vi: string; roles: Role[] }[] = [
  { key: "hiring", en: "Hiring", vi: "Tuyển dụng", roles: ["hr"] },
  { key: "crm", en: "CRM", vi: "CRM", roles: ["sales_manager", "sales_executive", "partner", "finance", "fulfillment"] },
  { key: "hrm", en: "HRM", vi: "HRM", roles: ["employee", "people_manager", "hrm_officer", "hrm_admin", "payroll_officer"] },
];

/** Modules a set of roles opens. Finance needs the System Super Admin, so a grant never opens it. */
export function modulesFor(admin: boolean, granted: Iterable<Role>): NavModule[] {
  const allowed = permissionsFor(admin, granted);
  return modules.filter((module) => module.key !== "home" && allowed.has(module.permission) && (module.key !== "finance" || admin));
}

export interface AccessRow {
  user_id: string; name: string; email: string; admin: boolean; enabled: boolean; active: boolean; roles: Role[];
  created_at: string | null; updated_at: string | null; granted_by: string | null;
  passkeys: number | null; tokens: number; sellerTermsMissing: boolean;
}

async function passkeyCounts(contentDb: D1Database, ids: string[]): Promise<Map<string, number> | null> {
  const map = new Map<string, number>();
  try {
    for (const part of chunks(ids)) {
      const rows = (await contentDb.prepare(`SELECT user_id, COUNT(*) AS n FROM credentials WHERE user_id IN (${part.map(() => "?").join(", ")}) GROUP BY user_id`).bind(...part).all<{ user_id: string; n: number }>()).results;
      for (const row of rows) map.set(row.user_id, row.n);
    }
    return map;
  } catch {
    // An EmDash schema without the credentials table: show "unknown", never 0.
    return null;
  }
}

/** Every Workspace member plus the EmDash admins, newest change first. */
export async function accessRows(db: D1Database, contentDb: D1Database, onlyUserId?: string): Promise<AccessRow[]> {
  const where = onlyUserId ? "WHERE m.user_id = ?" : "";
  const members = (await db.prepare(
    `SELECT m.user_id, m.enabled, m.created_at, m.updated_at, m.granted_by, GROUP_CONCAT(r.role) AS roles FROM workspace_members m LEFT JOIN workspace_roles r ON r.user_id = m.user_id ${where} GROUP BY m.user_id ORDER BY m.updated_at DESC LIMIT 500`,
  ).bind(...(onlyUserId ? [onlyUserId] : [])).all<{ user_id: string; enabled: number; created_at: string; updated_at: string; granted_by: string; roles: string | null }>()).results;
  const admins = (await contentDb.prepare(`SELECT id, email, name, disabled, role FROM users WHERE role = 50 ${onlyUserId ? "AND id = ?" : ""} ORDER BY name, email LIMIT 50`)
    .bind(...(onlyUserId ? [onlyUserId] : [])).all<{ id: string; email: string; name: string | null; disabled: number; role: number }>()).results;
  const ids = [...new Set([...members.map((row) => row.user_id), ...admins.map((row) => row.id)])];
  const identities = new Map<string, { email: string; name: string | null; disabled: number; role: number }>();
  for (const part of chunks(ids)) {
    const rows = (await contentDb.prepare(`SELECT id, email, name, disabled, role FROM users WHERE id IN (${part.map(() => "?").join(", ")})`).bind(...part).all<{ id: string; email: string; name: string | null; disabled: number; role: number }>()).results;
    for (const row of rows) identities.set(row.id, row);
  }
  const passkeys = await passkeyCounts(contentDb, ids);
  const tokens = new Map<string, number>();
  const now = new Date().toISOString();
  for (const part of chunks(ids)) {
    const rows = (await db.prepare(`SELECT user_id, COUNT(*) AS n FROM crm_api_tokens WHERE revoked_at IS NULL AND expires_at > ? AND user_id IN (${part.map(() => "?").join(", ")}) GROUP BY user_id`).bind(now, ...part).all<{ user_id: string; n: number }>()).results;
    for (const row of rows) tokens.set(row.user_id, row.n);
  }
  const withTerms = new Set((await db.prepare("SELECT DISTINCT user_id FROM crm_seller_terms").all<{ user_id: string }>()).results.map((row) => row.user_id));
  const adminRows: AccessRow[] = admins.map((account) => ({
    user_id: account.id, name: account.name || account.email, email: account.email, admin: true, enabled: true, active: account.disabled === 0, roles: [],
    created_at: null, updated_at: null, granted_by: null, passkeys: passkeys ? passkeys.get(account.id) ?? 0 : null, tokens: tokens.get(account.id) ?? 0, sellerTermsMissing: false,
  }));
  const memberRows: AccessRow[] = members.filter((row) => !admins.some((account) => account.id === row.user_id)).map((row) => {
    const identity = identities.get(row.user_id);
    const granted = (row.roles ?? "").split(",").filter((role): role is Role => (roles as readonly string[]).includes(role));
    return {
      user_id: row.user_id, name: identity?.name || identity?.email || "", email: identity?.email ?? "", admin: false,
      enabled: row.enabled === 1, active: !!identity && identity.disabled === 0, roles: granted,
      created_at: row.created_at, updated_at: row.updated_at, granted_by: row.granted_by,
      passkeys: passkeys ? passkeys.get(row.user_id) ?? 0 : null, tokens: tokens.get(row.user_id) ?? 0,
      sellerTermsMissing: row.enabled === 1 && granted.includes("partner") && !withTerms.has(row.user_id),
    };
  });
  return [...adminRows, ...memberRows];
}

export interface AuditEntry { id: string; actor_name: string; action: string; target_user_id: string; detail: string; created_at: string }

/** Grants and revocations only; other modules also write workspace_audit (for example hiring retention runs). */
export async function auditFor(db: D1Database, userId?: string, limit = 50): Promise<AuditEntry[]> {
  const sql = `SELECT id, actor_name, action, target_user_id, detail, created_at FROM workspace_audit WHERE action IN ('access_saved', 'access_revoked') ${userId ? "AND target_user_id = ?" : ""} ORDER BY created_at DESC LIMIT ?`;
  return (await db.prepare(sql).bind(...(userId ? [userId, limit] : [limit])).all<AuditEntry>()).results;
}

export async function namesFor(contentDb: D1Database, ids: (string | null)[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const part of chunks([...new Set(ids.filter((id): id is string => !!id))])) {
    const rows = (await contentDb.prepare(`SELECT id, email, name FROM users WHERE id IN (${part.map(() => "?").join(", ")})`).bind(...part).all<{ id: string; email: string; name: string | null }>()).results;
    for (const row of rows) map.set(row.id, row.name || row.email);
  }
  return map;
}

export interface AccessFormState { errors: Record<string, string>; values: Record<string, string>; intent: string }
export const emptyState: AccessFormState = { errors: {}, values: {}, intent: "" };

/**
 * Handles a grant/update POST for any Admin screen. Returns a redirect or 4xx
 * Response, or a form state to re-render with (422). `success` builds the
 * redirect target from the saved user ID.
 */
export async function handleAccessPost(astro: AstroGlobal, success: (userId: string) => string): Promise<Response | AccessFormState> {
  const user = astro.locals.workspace!;
  if (!user.can("users.manage")) return new Response("Forbidden", { status: 403 });
  if (!sameOrigin(astro.request)) return new Response("Invalid request origin.", { status: 400 });
  const form = await astro.request.formData().catch(() => null);
  if (!form) return new Response("Invalid form body.", { status: 400 });
  const intent = String(form.get("intent") ?? "");
  if (intent !== "grant" && intent !== "update") return new Response("Unknown action.", { status: 400 });
  const { DB, CONTENT_DB } = envFromLocals(astro.locals);
  try {
    const saved = await saveMember(DB, CONTENT_DB, user, {
      email: intent === "grant" ? String(form.get("email") ?? "") : undefined,
      userId: intent === "update" ? String(form.get("user_id") ?? "") : undefined,
      roles: parseRoles(form.getAll("roles")),
      enabled: form.get("enabled") !== "0",
    });
    return new Response(null, { status: 303, headers: { Location: success(saved), "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (!(error instanceof AccessError)) throw error;
    astro.response.status = 422;
    return { intent, errors: { [error.field]: error.message }, values: { email: String(form.get("email") ?? ""), user_id: String(form.get("user_id") ?? "") } };
  }
}

export const accessErrors: Record<string, [string, string]> = {
  not_found: ["No active EmDash account matches. Create or invite it in EmDash first.", "Không có tài khoản EmDash đang hoạt động nào khớp. Hãy tạo hoặc mời tài khoản trong EmDash trước."],
  already_admin: ["EmDash admins already have every permission.", "Admin EmDash đã có mọi quyền."],
  disabled_account: ["That EmDash account is disabled.", "Tài khoản EmDash này đang bị vô hiệu hóa."],
  required: ["Choose at least one role.", "Chọn ít nhất một vai trò."],
  self: ["You cannot change your own access.", "Bạn không thể tự đổi quyền của mình."],
};

export const auditActions: Record<string, [string, string]> = { access_saved: ["Access saved", "Lưu quyền"], access_revoked: ["Access revoked", "Thu hồi quyền"] };

/** Permission keys grouped by area for the roles matrix. */
export function permissionGroups(): { key: string; en: string; vi: string; items: Permission[] }[] {
  const area = (permission: Permission) => permission.split(".")[0];
  const labels: Record<string, [string, string]> = {
    workspace: ["Workspace", "Workspace"], users: ["Users and roles", "Người dùng và vai trò"], hiring: ["Hiring", "Tuyển dụng"],
    crm: ["CRM", "CRM"], hrm: ["HRM", "HRM"], finance: ["Finance", "Tài chính"],
  };
  return Object.keys(labels).map((key) => ({ key, en: labels[key][0], vi: labels[key][1], items: permissions.filter((permission) => area(permission) === key) })).filter((group) => group.items.length);
}

export type { WorkspaceUser };
