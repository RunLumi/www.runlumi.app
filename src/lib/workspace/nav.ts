// The Workspace information architecture in one place. Primary navigation
// lists modules; secondary navigation lists the pages inside the current
// module. Each entry declares the permission it needs, so menus never show
// a page that would answer 403. Paths are English; Vietnamese adds /vi.
import type { Permission, WorkspaceUser } from "./roles";

export type ModuleKey = "home" | "hiring" | "crm" | "hrm" | "finance" | "admin" | "account";
export type IconName =
  | "finance" | "cash_flow" | "balance" | "history"
  | "files" | "hrm" | "profile" | "hrm_people" | "hrm_settings"
  | "overview" | "hiring" | "crm" | "admin" | "today" | "leads" | "lead_settings" | "calendar" | "tasks" | "pipeline" | "new" | "referrals" | "companies" | "contacts" | "reports"
  | "commission" | "model" | "fulfillment" | "assignment" | "playbooks" | "offers" | "process" | "agents" | "roles" | "candidates" | "users" | "menu" | "apps" | "account" | "security"
  | "search" | "plus" | "help" | "bell" | "chevron";
/** `tab`: shown as a tab in the app nav bar of a grouped module; the other links sit in its "More" menu. */
export interface NavLink { key: string; en: string; vi: string; path: string; icon: IconName; group?: string; anyOf?: Permission[]; tab?: boolean }
export interface NavGroup { key: string; en: string; vi: string }
/**
 * `layout`: "tabs" puts the pages in the app nav bar (TopNav board); grouped
 * modules there show their `tab` links and a grouped "More" menu. "side" gives
 * a grouped side navigation (SetupNav board). Defaults to "tabs".
 */
export interface NavModule { key: ModuleKey; en: string; vi: string; path: string; icon: IconName; permission: Permission; links: NavLink[]; groups?: NavGroup[]; layout?: "tabs" | "side" }

export const modules: NavModule[] = [
  { key: "home", en: "Overview", vi: "Tổng quan", path: "/workspace", icon: "overview", permission: "workspace.access", links: [] },
  {
    key: "hiring", en: "Hiring", vi: "Tuyển dụng", path: "/admin/jobs", icon: "hiring", permission: "hiring.access", links: [
      { key: "jobs", en: "Roles", vi: "Vị trí", path: "/admin/jobs", icon: "roles" },
      { key: "applications", en: "Candidates", vi: "Ứng viên", path: "/admin/jobs/applications", icon: "candidates" },
    ],
  },
  {
    // Grouped by the job the person is doing: selling, knowing the customer,
    // looking at results, running delivery, configuring, and learning the tools.
    key: "crm", en: "CRM", vi: "CRM", path: "/crm", icon: "crm", permission: "crm.access",
    groups: [
      { key: "sell", en: "Selling", vi: "Bán hàng" },
      { key: "customers", en: "Customers", vi: "Khách hàng" },
      { key: "results", en: "Results", vi: "Kết quả" },
      { key: "operations", en: "Operations", vi: "Vận hành" },
      { key: "setup", en: "Setup", vi: "Cấu hình" },
      { key: "help", en: "Guides and tools", vi: "Hướng dẫn và công cụ" },
    ],
    links: [
      { key: "today", tab: true, en: "Today", vi: "Hôm nay", path: "/crm", icon: "today", group: "sell" },
      { key: "leads", tab: true, en: "Leads", vi: "Lead", path: "/crm/leads", icon: "leads", group: "sell" },
      { key: "pipeline", tab: true, en: "Pipeline", vi: "Cơ hội", path: "/crm/pipeline", icon: "pipeline", group: "sell" },
      { key: "calendar", tab: true, en: "Calendar", vi: "Lịch", path: "/crm/calendar", icon: "calendar", group: "sell" },
      { key: "tasks", tab: true, en: "Tasks", vi: "Công việc", path: "/crm/tasks", icon: "tasks", group: "sell" },
      { key: "new", en: "New opportunity", vi: "Tạo cơ hội", path: "/crm/new", icon: "new", group: "sell" },
      { key: "referrals", en: "Referrals", vi: "Giới thiệu khách", path: "/crm/referrals", icon: "referrals", group: "sell", anyOf: ["crm.refer"] },
      { key: "companies", tab: true, en: "Companies", vi: "Công ty", path: "/crm/accounts", icon: "companies", group: "customers" },
      { key: "contacts", tab: true, en: "Contacts", vi: "Liên hệ", path: "/crm/contacts", icon: "contacts", group: "customers" },
      { key: "reports", tab: true, en: "Reports", vi: "Báo cáo", path: "/crm/reports", icon: "reports", group: "results" },
      { key: "commission", en: "Commission", vi: "Hoa hồng", path: "/crm/commission", icon: "commission", group: "results" },
      { key: "model", en: "Business model", vi: "Mô hình kinh doanh", path: "/crm/model", icon: "model", group: "results", anyOf: ["crm.team"] },
      { key: "fulfillment", en: "Fulfillment", vi: "Bàn giao", path: "/crm/fulfillment", icon: "fulfillment", group: "operations", anyOf: ["crm.fulfillment", "crm.team"] },
      { key: "operations", en: "Assignment and cohorts", vi: "Phân công và cohort", path: "/crm/admin", icon: "assignment", group: "operations", anyOf: ["crm.team"] },
      { key: "playbooks", en: "Playbooks", vi: "Playbook", path: "/crm/admin/playbooks", icon: "playbooks", group: "setup", anyOf: ["crm.configure"] },
      { key: "lead-settings", en: "Lead statuses", vi: "Trạng thái Lead", path: "/crm/admin/leads", icon: "lead_settings", group: "setup", anyOf: ["crm.configure"] },
      { key: "offers", en: "Offers and prices", vi: "Gói và giá", path: "/crm/admin/offers", icon: "offers", group: "setup", anyOf: ["crm.configure"] },
      { key: "process", en: "Sales process", vi: "Quy trình bán hàng", path: "/crm/process", icon: "process", group: "help" },
      { key: "files", en: "Files", vi: "Tài liệu", path: "/crm/files", icon: "files", group: "help" },
      { key: "api", en: "Connect an AI agent", vi: "Kết nối AI agent", path: "/crm/api", icon: "agents", group: "help" },
    ],
  },
  {
    key: "hrm", en: "HRM", vi: "HRM", path: "/hrm", icon: "hrm", permission: "hrm.access", layout: "side",
    // My own records first, then the work HR does for others, then policy
    // and compliance, then reports and settings.
    groups: [
      { key: "me", en: "My HR", vi: "Của tôi" },
      { key: "people", en: "People operations", vi: "Nghiệp vụ nhân sự" },
      { key: "compliance", en: "Policies and compliance", vi: "Chính sách và tuân thủ" },
      { key: "control", en: "Reports and settings", vi: "Báo cáo và thiết lập" },
    ],
    links: [
      { key: "home", en: "My overview", vi: "Tổng quan của tôi", path: "/hrm", icon: "overview", group: "me" },
      { key: "profile", en: "My profile", vi: "Hồ sơ của tôi", path: "/hrm/me", icon: "profile", group: "me", anyOf: ["hrm.profile.self"] },
      { key: "my-documents", en: "My legal documents", vi: "Tài liệu pháp lý của tôi", path: "/hrm/me/documents", icon: "profile", group: "me", anyOf: ["hrm.legal.self"] },
      { key: "my-coi", en: "My COI declarations", vi: "Khai báo xung đột lợi ích của tôi", path: "/hrm/me/coi", icon: "profile", group: "me", anyOf: ["hrm.coi.self"] },
      { key: "my-onboarding", en: "Onboarding tasks", vi: "Việc cần làm khi hội nhập", path: "/hrm/me/onboarding", icon: "today", group: "me", anyOf: ["hrm.onboarding.self", "hrm.onboarding.tasks"] },
      { key: "my-time", en: "My attendance", vi: "Công của tôi", path: "/hrm/me/time", icon: "today", group: "me", anyOf: ["hrm.time.self"] },
      { key: "my-leave", en: "My leave", vi: "Phép của tôi", path: "/hrm/me/leave", icon: "today", group: "me", anyOf: ["hrm.leave.self"] },
      { key: "my-payslips", en: "My payslips", vi: "Phiếu lương của tôi", path: "/hrm/me/payslips", icon: "profile", group: "me", anyOf: ["hrm.payroll.self"] },
      { key: "my-requests", en: "My HR requests", vi: "Yêu cầu HR của tôi", path: "/hrm/me/requests", icon: "today", group: "me", anyOf: ["hrm.services.self"] },
      { key: "my-assets", en: "My assets", vi: "Tài sản của tôi", path: "/hrm/me/assets", icon: "profile", group: "me", anyOf: ["hrm.assets.self"] },
      { key: "my-benefits", en: "My benefits", vi: "Phúc lợi của tôi", path: "/hrm/me/benefits", icon: "profile", group: "me", anyOf: ["hrm.benefits.self"] },
      { key: "my-performance", en: "My reviews", vi: "Đánh giá của tôi", path: "/hrm/me/performance", icon: "profile", group: "me", anyOf: ["hrm.performance.self"] },
      { key: "my-training", en: "My training", vi: "Đào tạo của tôi", path: "/hrm/me/training", icon: "profile", group: "me", anyOf: ["hrm.training.self"] },
      { key: "notifications", en: "Notifications", vi: "Thông báo", path: "/hrm/notifications", icon: "today", group: "me", anyOf: ["hrm.notifications.read"] },
      { key: "people", en: "People", vi: "Nhân sự", path: "/hrm/people", icon: "hrm_people", group: "people", anyOf: ["hrm.records.manage", "hrm.team.read"] },
      { key: "job-descriptions", en: "Job descriptions", vi: "Mô tả công việc", path: "/hrm/job-descriptions", icon: "roles", group: "people", anyOf: ["hrm.records.manage"] },
      { key: "legal-documents", en: "Policies and documents", vi: "Chính sách và tài liệu", path: "/hrm/documents", icon: "profile", group: "compliance", anyOf: ["hrm.legal.manage"] },
      { key: "coi-review", en: "COI review", vi: "Rà soát xung đột lợi ích", path: "/hrm/coi", icon: "profile", group: "compliance", anyOf: ["hrm.coi.review"] },
      { key: "onboarding-manage", en: "Onboarding plans", vi: "Kế hoạch hội nhập", path: "/hrm/onboarding", icon: "hrm_people", group: "people", anyOf: ["hrm.onboarding.manage"] },
      { key: "offboarding", en: "Offboarding", vi: "Nghỉ việc", path: "/hrm/offboarding", icon: "hrm_people", group: "people", anyOf: ["hrm.offboarding.manage", "hrm.offboarding.tasks"] },
      { key: "retention", en: "Retention and legal holds", vi: "Lưu trữ và tạm giữ pháp lý", path: "/hrm/retention", icon: "hrm_settings", group: "compliance", anyOf: ["hrm.retention.manage", "hrm.retention.review", "hrm.legalhold.manage"] },
      { key: "time", en: "Schedules and attendance", vi: "Lịch và chấm công", path: "/hrm/time", icon: "hrm_people", group: "people", anyOf: ["hrm.time.manage", "hrm.time.review", "hrm.time.configure"] },
      { key: "leave", en: "Leave policies and requests", vi: "Chính sách phép và đơn nghỉ", path: "/hrm/leave", icon: "hrm_people", group: "people", anyOf: ["hrm.leave.manage", "hrm.leave.review", "hrm.leave.configure"] },
      { key: "payroll", en: "Payroll and payslips", vi: "Bảng lương và phiếu lương", path: "/hrm/payroll", icon: "hrm_people", group: "people", anyOf: ["hrm.payroll.read", "hrm.payroll.prepare", "hrm.payroll.configure"] },
      { key: "service-requests", en: "HR service desk", vi: "Yêu cầu dịch vụ HR", path: "/hrm/requests", icon: "hrm_people", group: "people", anyOf: ["hrm.services.manage"] },
      { key: "assets", en: "Asset register", vi: "Quản lý tài sản", path: "/hrm/assets", icon: "hrm_people", group: "people", anyOf: ["hrm.assets.manage"] },
      { key: "benefits", en: "Benefits", vi: "Quản lý phúc lợi", path: "/hrm/benefits", icon: "hrm_people", group: "people", anyOf: ["hrm.benefits.manage"] },
      { key: "performance", en: "Performance reviews", vi: "Đánh giá hiệu suất", path: "/hrm/performance", icon: "hrm_people", group: "people", anyOf: ["hrm.performance.manage", "hrm.performance.review"] },
      { key: "training", en: "Training and certificates", vi: "Đào tạo và chứng chỉ", path: "/hrm/training", icon: "hrm_people", group: "people", anyOf: ["hrm.training.manage"] },
      { key: "report-governance", en: "Report policies and holds", vi: "Chính sách và tạm giữ báo cáo", path: "/hrm/reports/governance", icon: "hrm_settings", group: "compliance", anyOf: ["hrm.reports.manage"] },
      { key: "reports", en: "Reports", vi: "Báo cáo", path: "/hrm/reports", icon: "hrm_settings", group: "control", anyOf: ["hrm.reports.read"] },
      { key: "settings", en: "Settings", vi: "Thiết lập", path: "/hrm/settings", icon: "hrm_settings", group: "control", anyOf: ["hrm.configure"] },
    ],
  },
  {
    key: "finance", en: "Finance", vi: "Tài chính", path: "/finance", icon: "finance", permission: "finance.access", layout: "side",
    groups: [
      { key: "review", en: "Review", vi: "Theo dõi" },
      { key: "monthly", en: "Monthly work", vi: "Công việc tháng" },
      { key: "statements", en: "Statements", vi: "Báo cáo" },
      { key: "control", en: "Controls", vi: "Quản lý" },
    ],
    links: [
      { key: "overview", en: "Overview", vi: "Tổng quan", path: "/finance", icon: "overview", group: "review" },
      { key: "plans", en: "Financial plan", vi: "Kế hoạch tài chính", path: "/finance/plans", icon: "model", group: "monthly", anyOf: ["finance.plan.manage"] },
      { key: "actuals", en: "Monthly actuals", vi: "Số thực tế tháng", path: "/finance/actuals", icon: "today", group: "monthly", anyOf: ["finance.actuals.manage"] },
      { key: "pnl", en: "Profit and loss", vi: "Lãi lỗ", path: "/finance/pnl", icon: "reports", group: "statements" },
      { key: "cash-flow", en: "Cash flow", vi: "Dòng tiền", path: "/finance/cash-flow", icon: "cash_flow", group: "statements" },
      { key: "revenue", en: "Revenue", vi: "Doanh thu", path: "/finance/revenue", icon: "pipeline", group: "statements" },
      { key: "costs", en: "Costs", vi: "Chi phí", path: "/finance/costs", icon: "offers", group: "statements" },
      { key: "working-capital", en: "Working capital", vi: "Vốn lưu động", path: "/finance/working-capital", icon: "assignment", group: "statements" },
      { key: "position", en: "Financial position", vi: "Tình hình tài chính", path: "/finance/position", icon: "balance", group: "statements" },
      { key: "settings", en: "Settings", vi: "Thiết lập", path: "/finance/settings", icon: "hrm_settings", group: "control", anyOf: ["finance.configure"] },
      { key: "audit", en: "Audit history", vi: "Lịch sử", path: "/finance/audit", icon: "history", group: "control", anyOf: ["finance.audit.read"] },
    ],
  },
  {
    key: "admin", en: "Admin", vi: "Quản trị", path: "/workspace/users", icon: "admin", permission: "users.manage", layout: "side",
    groups: [
      { key: "access", en: "People and access", vi: "Người dùng và quyền" },
      { key: "security", en: "Security and integrations", vi: "Bảo mật và tích hợp" },
    ],
    links: [
      { key: "users", en: "Users", vi: "Người dùng", path: "/workspace/users", icon: "users", group: "access" },
      { key: "roles", en: "Roles and permissions", vi: "Vai trò và quyền", path: "/workspace/roles", icon: "roles", group: "access" },
      { key: "security", en: "Security", vi: "Bảo mật", path: "/workspace/security", icon: "security", group: "security" },
      { key: "audit", en: "Audit log", vi: "Nhật ký kiểm toán", path: "/workspace/audit", icon: "history", group: "security" },
      { key: "notifications", en: "Notification rules", vi: "Quy tắc thông báo", path: "/workspace/notifications", icon: "today", group: "security" },
      { key: "webhooks", en: "Webhooks", vi: "Webhook", path: "/workspace/webhooks", icon: "apps", group: "security" },
      { key: "agents", en: "AI agents", vi: "AI agent", path: "/workspace/agents", icon: "agents", group: "security" },
    ],
  },
];

/**
 * Personal settings (R-06). Reached from the account menu, not the module
 * tabs, and open to everyone with Workspace access. Workstream 4 adds its
 * security and notification pages here.
 */
export const accountModule: NavModule = {
  key: "account", en: "My account", vi: "Tài khoản của tôi", path: "/workspace/account", icon: "account", permission: "workspace.access", links: [
    { key: "profile", en: "Profile", vi: "Hồ sơ", path: "/workspace/account", icon: "profile" },
    { key: "security", en: "Security", vi: "Bảo mật", path: "/workspace/account/security", icon: "security" },
    { key: "notifications", en: "Notifications", vi: "Thông báo", path: "/workspace/account/notifications", icon: "bell" },
  ],
};

/**
 * The header's create (+) menu: each entry opens an existing create screen
 * or sheet (`#id` targets a Sheet on that list). Shown only with `permission`
 * and, when set, one of `anyOf`.
 */
export interface CreateAction { key: string; en: string; vi: string; path: string; icon: IconName; module: ModuleKey; anyOf?: Permission[] }
export const createActions: CreateAction[] = [
  { key: "lead", en: "Lead", vi: "Lead", path: "/crm/leads#new-lead", icon: "leads", module: "crm" },
  { key: "opportunity", en: "Opportunity", vi: "Cơ hội", path: "/crm/new", icon: "pipeline", module: "crm" },
  { key: "referral", en: "Referral", vi: "Giới thiệu khách", path: "/crm/referrals#new-h", icon: "referrals", module: "crm", anyOf: ["crm.refer"] },
  { key: "role", en: "Hiring role", vi: "Vị trí tuyển dụng", path: "/admin/jobs#new-h", icon: "hiring", module: "hiring" },
  { key: "member", en: "Workspace access", vi: "Cấp quyền Workspace", path: "/workspace/users/new", icon: "users", module: "admin" },
];

export function visibleCreateActions(user: WorkspaceUser): CreateAction[] {
  const open = new Set(visibleModules(user).map((module) => module.key));
  return createActions.filter((action) => open.has(action.module) && (!action.anyOf || action.anyOf.some((permission) => user.can(permission))));
}

/** Guides for the header's help (?) menu: the "help" group of each module the person may open. */
export function helpLinks(user: WorkspaceUser): { module: NavModule; link: NavLink }[] {
  return visibleModules(user).flatMap((module) => visibleLinks(user, module).filter((link) => link.group === "help").map((link) => ({ module, link })));
}

/** Tabs and "More" groups for the app nav bar of a "tabs" module. */
export function appBar(user: WorkspaceUser, module: NavModule): { tabs: NavLink[]; more: { group: NavGroup; links: NavLink[] }[] } {
  const links = visibleLinks(user, module);
  if (!module.groups?.length) return { tabs: links, more: [] };
  return { tabs: links.filter((link) => link.tab), more: visibleGroups(user, module).map(({ group, links: items }) => ({ group, links: items.filter((link) => !link.tab) })).filter((entry) => entry.links.length > 0) };
}

export function moduleByKey(key: ModuleKey): NavModule {
  return key === "account" ? accountModule : modules.find((module) => module.key === key)!;
}

export function localized(path: string, vi: boolean): string {
  return vi ? `/vi${path}` : path;
}

export function visibleModules(user: WorkspaceUser): NavModule[] {
  return modules.filter((module) => user.can(module.permission)
    && (module.key !== "finance" || user.admin && user.financeEnabled === true)
    && (module.key !== "hrm" || !user.hrmEmploymentEnded && (user.hrmEnabled !== false || user.can("hrm.configure"))));
}

export function visibleLinks(user: WorkspaceUser, module: NavModule): NavLink[] {
  return module.links.filter((link) => {
    if (module.key === "finance" && (!user.admin || !user.can("finance.access") || user.financeEnabled !== true && link.key !== "settings")) return false;
    const allowedWhileClosed=(link.key==="report-governance"&&user.can("hrm.reports.manage"))||link.key==="settings"||(link.key==="job-descriptions"&&user.can("hrm.configure"))||(link.key==="retention"&&(user.can("hrm.retention.manage")||user.can("hrm.retention.review")||user.can("hrm.legalhold.manage")))||(link.key==="legal-documents"&&user.can("hrm.legal.manage"))||(link.key==="onboarding-manage"&&user.can("hrm.onboarding.manage"))||(link.key==="payroll"&&user.can("hrm.payroll.configure"));
    return (module.key!=="hrm"||!user.hrmEmploymentEnded&&(user.hrmEnabled!==false||allowedWhileClosed))&&(!link.anyOf||link.anyOf.some(permission=>user.can(permission)));
  });
}

/** Visible links by group, in group order; groups with nothing to open are left out. */
export function visibleGroups(user: WorkspaceUser, module: NavModule): { group: NavGroup; links: NavLink[] }[] {
  const links = visibleLinks(user, module);
  return (module.groups ?? []).map((group) => ({ group, links: links.filter((link) => link.group === group.key) })).filter((entry) => entry.links.length > 0);
}

/** Same page in the other language for every Workspace path. */
export function switchLocale(url: URL): string {
  const path = url.pathname.startsWith("/vi/") ? url.pathname.slice(3) : `/vi${url.pathname}`;
  return path + url.search;
}

/** Which module a path belongs to, for highlighting. */
export function moduleForPath(pathname: string): ModuleKey {
  const path = pathname.replace(/^\/vi(?=\/)/, "");
  if (path.startsWith("/admin/jobs")) return "hiring";
  if (path === "/finance" || path.startsWith("/finance/")) return "finance";
  if (path === "/hrm" || path.startsWith("/hrm/")) return "hrm";
  if (path === "/crm" || path.startsWith("/crm/")) return "crm";
  if (["/workspace/users", "/workspace/roles", "/workspace/audit", "/workspace/security", "/workspace/notifications", "/workspace/webhooks", "/workspace/agents"].some((root) => path === root || path.startsWith(`${root}/`))) return "admin";
  if (path.startsWith("/workspace/account")) return "account";
  // Search and notices belong to no module; they sit under Overview.
  return "home";
}
