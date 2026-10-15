// Workspace roles and permissions. Every private module (Hiring, CRM, and
// later ones) asks `can(permission)`; only this file maps roles to
// permissions. To add a role: extend `roles`, its labels and ROLE_PERMISSIONS,
// and the CHECK constraint in a new migration. To add a module: add its
// permissions here and a nav entry in src/lib/workspace/nav.ts.
import { activeUser } from "../admin-auth";

export const roles = ["hr", "sales_manager", "sales_executive", "partner", "finance", "fulfillment"] as const;
export type Role = typeof roles[number];

export const permissions = [
  "workspace.access",
  "users.manage",
  "hiring.access", "hiring.jobs.manage", "hiring.applications.manage", "hiring.applications.delete", "hiring.export",
  "crm.access", "crm.files.team", "crm.team", "crm.configure", "crm.finance", "crm.fulfillment", "crm.refer", "crm.payments.report",
] as const;
export type Permission = typeof permissions[number];

/** What each grantable role may do. Admin (EmDash role 50) has every permission. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  hr: ["workspace.access", "hiring.access", "hiring.jobs.manage", "hiring.applications.manage", "hiring.applications.delete", "hiring.export"],
  sales_manager: ["workspace.access", "crm.access", "crm.files.team", "crm.team", "crm.refer", "crm.payments.report"],
  sales_executive: ["workspace.access", "crm.files.team", "crm.access", "crm.refer", "crm.payments.report"],
  // Freelance partners sell their own deals or refer businesses to the team.
  // Customers pay Lumi directly, so partners never report payments.
  partner: ["workspace.access", "crm.access", "crm.refer"],
  finance: ["workspace.access", "crm.access", "crm.finance"],
  fulfillment: ["workspace.access", "crm.access", "crm.fulfillment"],
};

export const roleLabels: Record<Role | "admin", [string, string]> = {
  admin: ["Admin", "Quản trị"],
  hr: ["HR", "Nhân sự (HR)"],
  sales_manager: ["Sales Manager", "Quản lý bán hàng"],
  sales_executive: ["Sales Executive", "Nhân viên bán hàng"],
  partner: ["Partner (freelance)", "Cộng tác viên"],
  finance: ["Finance", "Tài chính"],
  fulfillment: ["Fulfillment", "Bàn giao"],
};

export const roleDescriptions: Record<Role | "admin", [string, string]> = {
  admin: ["Everything, including users, roles, playbooks, offers and commission policy. Granted by the EmDash admin role.", "Toàn quyền, gồm người dùng, vai trò, playbook, gói và chính sách hoa hồng. Do vai trò admin của EmDash cấp."],
  hr: ["Hiring desk: roles, application tests, candidates, notes, export and candidate files. No CRM.", "Tuyển dụng: vị trí, bài test, ứng viên, ghi chú, xuất dữ liệu và hồ sơ ứng viên. Không vào CRM."],
  sales_manager: ["CRM for the whole team: every opportunity, assignment, inbound queue, cohorts and team reports. No hiring.", "CRM của cả đội: mọi cơ hội, phân công, hàng chờ inbound, cohort và báo cáo đội. Không vào tuyển dụng."],
  sales_executive: ["CRM for opportunities assigned to them; may report payments for confirmation.", "CRM với các cơ hội được giao cho mình; được báo đã nhận tiền để tài chính xác nhận."],
  partner: ["Freelance seller: works only their own opportunities or refers businesses to the team and follows the referral status. Never handles payments; commission follows their seller terms.", "Người bán tự do: chỉ làm cơ hội của mình hoặc giới thiệu khách cho đội và theo dõi trạng thái. Không nhận tiền của khách; hoa hồng theo loại người bán đã khai báo."],
  finance: ["Confirms payments, refunds and corrections; records commission payouts.", "Xác nhận thanh toán, hoàn tiền, điều chỉnh; ghi nhận chi hoa hồng."],
  fulfillment: ["Delivery after the sale: handoff, owner approval, launch checks.", "Bàn giao sau bán: thông tin bàn giao, chủ duyệt, kiểm tra trước live."],
};

export interface WorkspaceUser {
  id: string; name: string; email: string;
  admin: boolean;
  roles: ReadonlySet<Role>;
  can(permission: Permission): boolean;
}

export function permissionsFor(admin: boolean, granted: Iterable<Role>): Set<Permission> {
  if (admin) return new Set(permissions);
  const result = new Set<Permission>();
  for (const role of granted) for (const permission of ROLE_PERMISSIONS[role] ?? []) result.add(permission);
  return result;
}

export function makeUser(base: { id: string; name: string; email: string }, admin: boolean, granted: Iterable<Role>): WorkspaceUser {
  const set = new Set(granted);
  const allowed = permissionsFor(admin, set);
  return { ...base, admin, roles: set, can: (permission) => allowed.has(permission) };
}

/**
 * The signed-in, active EmDash user with workspace roles, or null. A disabled
 * EmDash account, a revoked membership or no roles means no access.
 */
export async function workspaceUser(locals: App.Locals, db: D1Database): Promise<WorkspaceUser | null> {
  const user = activeUser(locals);
  return user ? workspaceUserFor(db, user) : null;
}

/** Permissions for an active EmDash user (session or API token): admin, or enabled member roles. */
export async function workspaceUserFor(db: D1Database, user: { id: string; name?: string | null; email: string; role: number }): Promise<WorkspaceUser | null> {
  const base = { id: user.id, name: user.name || user.email, email: user.email };
  if (user.role === 50) return makeUser(base, true, []);
  const rows = (await db.prepare(
    "SELECT r.role FROM workspace_members m JOIN workspace_roles r ON r.user_id = m.user_id WHERE m.user_id = ? AND m.enabled = 1",
  ).bind(user.id).all<{ role: Role }>()).results;
  if (!rows.length) return null;
  return makeUser(base, false, rows.map((row) => row.role));
}

export function roleLabel(role: Role | "admin", vi: boolean): string {
  return roleLabels[role][vi ? 1 : 0];
}
