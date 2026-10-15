// Workspace roles and permissions. Every private module (Hiring, CRM, and
// later ones) asks `can(permission)`; only this file maps roles to
// permissions. To add a role: extend `roles`, its labels and ROLE_PERMISSIONS,
// and the CHECK constraint in a new migration. To add a module: add its
// permissions here and a nav entry in src/lib/workspace/nav.ts.
import { activeUser } from "../admin-auth";

export const roles = ["hr", "sales_manager", "sales_executive", "partner", "finance", "fulfillment", "employee", "people_manager", "hrm_officer", "hrm_admin", "payroll_officer"] as const;
export type Role = typeof roles[number];

export const permissions = [
  "hrm.access", "hrm.profile.self", "hrm.team.read", "hrm.records.manage", "hrm.identity.read", "hrm.bank.read", "hrm.tax.read", "hrm.files.review", "hrm.audit.read", "hrm.configure",
  "hrm.legal.self", "hrm.legal.manage", "hrm.legal.review", "hrm.legal.activate", "hrm.coi.self", "hrm.coi.review", "hrm.onboarding.self", "hrm.onboarding.tasks", "hrm.onboarding.manage", "hrm.offboarding.tasks", "hrm.offboarding.manage", "hrm.retention.manage", "hrm.retention.review", "hrm.retention.activate", "hrm.legalhold.manage",
  "hrm.time.self", "hrm.time.manage", "hrm.time.review", "hrm.time.configure", "hrm.leave.self", "hrm.leave.manage", "hrm.leave.review", "hrm.leave.configure", "hrm.approval.delegate",
  "hrm.payroll.read", "hrm.payroll.configure", "hrm.payroll.prepare", "hrm.payroll.review", "hrm.payroll.approve", "hrm.payroll.publish", "hrm.payroll.payment.confirm", "hrm.payroll.self", "hrm.payroll.dispute", "hrm.payroll.dispute.manage",
  "hrm.services.self", "hrm.services.manage", "hrm.notifications.read",
  "hrm.assets.self", "hrm.assets.manage",
  "hrm.benefits.self", "hrm.benefits.manage", "hrm.benefits.approve",
  "workspace.access",
  "users.manage",
  "hiring.access", "hiring.jobs.manage", "hiring.applications.manage", "hiring.applications.delete", "hiring.export",
  "crm.access", "crm.files.team", "crm.team", "crm.configure", "crm.finance", "crm.fulfillment", "crm.refer", "crm.payments.report",
] as const;
export type Permission = typeof permissions[number];

/** What each grantable role may do. Admin (EmDash role 50) has every permission. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  employee: ["workspace.access", "hrm.access", "hrm.profile.self", "hrm.legal.self", "hrm.coi.self", "hrm.onboarding.self", "hrm.onboarding.tasks", "hrm.time.self", "hrm.leave.self", "hrm.payroll.self", "hrm.payroll.dispute", "hrm.services.self", "hrm.notifications.read", "hrm.assets.self", "hrm.benefits.self"],
  people_manager: ["workspace.access", "hrm.access", "hrm.profile.self", "hrm.team.read", "hrm.legal.self", "hrm.coi.self", "hrm.onboarding.self", "hrm.onboarding.tasks", "hrm.offboarding.tasks", "hrm.time.self", "hrm.time.review", "hrm.leave.self", "hrm.leave.review", "hrm.approval.delegate", "hrm.notifications.read"],
  hrm_officer: ["workspace.access", "hrm.access", "hrm.profile.self", "hrm.records.manage", "hrm.identity.read", "hrm.files.review", "hrm.audit.read", "hrm.legal.self", "hrm.legal.manage", "hrm.legal.review", "hrm.coi.self", "hrm.coi.review", "hrm.onboarding.self", "hrm.onboarding.tasks", "hrm.onboarding.manage", "hrm.offboarding.tasks", "hrm.offboarding.manage", "hrm.retention.review", "hrm.time.manage", "hrm.time.review", "hrm.leave.manage", "hrm.leave.review", "hrm.services.manage", "hrm.notifications.read", "hrm.assets.manage", "hrm.benefits.manage"],
  hrm_admin: ["workspace.access", "hrm.access", "hrm.profile.self", "hrm.team.read", "hrm.records.manage", "hrm.identity.read", "hrm.bank.read", "hrm.tax.read", "hrm.files.review", "hrm.audit.read", "hrm.configure", "hrm.legal.self", "hrm.legal.manage", "hrm.legal.review", "hrm.legal.activate", "hrm.coi.self", "hrm.coi.review", "hrm.onboarding.self", "hrm.onboarding.tasks", "hrm.onboarding.manage", "hrm.offboarding.tasks", "hrm.offboarding.manage", "hrm.retention.manage", "hrm.retention.review", "hrm.retention.activate", "hrm.legalhold.manage", "hrm.time.self", "hrm.time.manage", "hrm.time.review", "hrm.time.configure", "hrm.leave.self", "hrm.leave.manage", "hrm.leave.review", "hrm.leave.configure", "hrm.payroll.read", "hrm.payroll.configure", "hrm.payroll.prepare", "hrm.payroll.review", "hrm.payroll.approve", "hrm.payroll.publish", "hrm.payroll.payment.confirm", "hrm.payroll.dispute.manage", "hrm.services.manage", "hrm.notifications.read", "hrm.assets.manage", "hrm.benefits.manage", "hrm.benefits.approve"],
  payroll_officer: ["workspace.access", "hrm.access", "hrm.payroll.read", "hrm.payroll.prepare", "hrm.payroll.dispute.manage", "hrm.notifications.read"],
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
  employee: ["Employee", "Nhân viên"],
  people_manager: ["People Manager", "Quản lý nhân sự trực tiếp"],
  hrm_officer: ["HRM Officer", "Chuyên viên nhân sự"],
  hrm_admin: ["HRM Admin", "Quản trị HRM"],
  payroll_officer: ["Payroll Officer", "Phụ trách payroll"],
  admin: ["System Super Admin", "Siêu quản trị hệ thống"],
  hr: ["HR", "Nhân sự (HR)"],
  sales_manager: ["Sales Manager", "Quản lý bán hàng"],
  sales_executive: ["Sales Executive", "Nhân viên bán hàng"],
  partner: ["Partner (freelance)", "Cộng tác viên"],
  finance: ["Finance", "Tài chính"],
  fulfillment: ["Fulfillment", "Bàn giao"],
};

export const roleDescriptions: Record<Role | "admin", [string, string]> = {
  employee: ["Own profile, legal/COI documents, onboarding tasks and assigned asset handovers. No Hiring or CRM access.", "Hồ sơ, tài liệu pháp lý/COI, việc onboarding và bàn giao tài sản của mình. Không vào tuyển dụng hoặc CRM."],
  people_manager: ["Work information for current direct reports. No identity documents or pay.", "Thông tin công việc của nhân viên đang quản lý trực tiếp. Không xem giấy tờ định danh hoặc lương."],
  hrm_officer: ["Employee records and identity verification. No banking, tax, user administration or other modules.", "Hồ sơ nhân viên và xác minh định danh. Không xem ngân hàng, thuế, quản trị tài khoản hoặc phân hệ khác."],
  hrm_admin: ["HRM configuration and records; approves within HRM without self-approval. No user/role administration.", "Cấu hình, hồ sơ và phê duyệt HRM; không tự duyệt. Không quản trị tài khoản/vai trò."],
  payroll_officer: ["Prepare payroll inputs and handle assigned payroll inquiries. Cannot approve or publish a run.", "Chuẩn bị đầu vào payroll và xử lý thắc mắc được giao; không được duyệt hoặc phát hành kỳ lương."],
  admin: ["System-wide authority from EmDash role 50, including account administration and all Workspace modules.", "Quyền toàn hệ thống từ EmDash role 50, gồm quản lý tài khoản và mọi phân hệ Workspace."],
  hr: ["Hiring desk: roles, application tests, candidates, notes, export and candidate files. No CRM.", "Tuyển dụng: vị trí, bài test, ứng viên, ghi chú, xuất dữ liệu và hồ sơ ứng viên. Không vào CRM."],
  sales_manager: ["CRM for the whole team: every opportunity, assignment, inbound queue, cohorts and team reports. No hiring.", "CRM của cả đội: mọi cơ hội, phân công, hàng chờ inbound, cohort và báo cáo đội. Không vào tuyển dụng."],
  sales_executive: ["CRM for opportunities assigned to them; may report payments for confirmation.", "CRM với các cơ hội được giao cho mình; được báo đã nhận tiền để tài chính xác nhận."],
  partner: ["Freelance seller: works only their own opportunities or refers businesses to the team and follows the referral status. Never handles payments; commission follows their seller terms.", "Người bán tự do: chỉ làm cơ hội của mình hoặc giới thiệu khách cho đội và theo dõi trạng thái. Không nhận tiền của khách; hoa hồng theo loại người bán đã khai báo."],
  finance: ["Confirms payments, refunds and corrections; records commission payouts.", "Xác nhận thanh toán, hoàn tiền, điều chỉnh; ghi nhận chi hoa hồng."],
  fulfillment: ["Delivery after the sale: handoff, owner approval, launch checks.", "Bàn giao sau bán: thông tin bàn giao, chủ duyệt, kiểm tra trước live."],
};

export interface WorkspaceUser {
  /** Runtime kill switch; false suppresses self-service navigation while admins can configure readiness. */
  hrmEnabled?: boolean;
  /** Linked employment ended; HRM access is denied until an authorized rehire creates a current period. */
  hrmEmploymentEnded?: boolean;
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
