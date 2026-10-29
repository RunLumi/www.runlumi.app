// The Workspace information architecture in one place. Primary navigation
// lists modules; secondary navigation lists the pages inside the current
// module. Each entry declares the permission it needs, so menus never show
// a page that would answer 403. Paths are English; Vietnamese adds /vi.
import type { Permission, WorkspaceUser } from "./roles";

export type ModuleKey = "home" | "hiring" | "crm" | "hrm" | "finance" | "admin";
export type IconName =
  | "finance" | "cash_flow" | "balance" | "history"
  | "files" | "hrm" | "profile" | "hrm_people" | "hrm_settings"
  | "overview" | "hiring" | "crm" | "admin" | "today" | "leads" | "calendar" | "pipeline" | "new" | "referrals" | "companies" | "contacts" | "reports"
  | "commission" | "model" | "fulfillment" | "assignment" | "playbooks" | "offers" | "process" | "agents" | "roles" | "candidates" | "users" | "menu";
export interface NavLink { key: string; en: string; vi: string; path: string; icon: IconName; group?: string; anyOf?: Permission[] }
export interface NavGroup { key: string; en: string; vi: string }
export interface NavModule { key: ModuleKey; en: string; vi: string; path: string; icon: IconName; permission: Permission; links: NavLink[]; groups?: NavGroup[] }

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
      { key: "today", en: "Today", vi: "Hôm nay", path: "/crm", icon: "today", group: "sell" },
      { key: "leads", en: "Leads", vi: "Lead", path: "/crm/leads", icon: "leads", group: "sell" },
      { key: "pipeline", en: "Pipeline", vi: "Cơ hội", path: "/crm/pipeline", icon: "pipeline", group: "sell" },
      { key: "calendar", en: "Calendar", vi: "Lịch", path: "/crm/calendar", icon: "calendar", group: "sell" },
      { key: "new", en: "New opportunity", vi: "Tạo cơ hội", path: "/crm/new", icon: "new", group: "sell" },
      { key: "referrals", en: "Referrals", vi: "Giới thiệu khách", path: "/crm/referrals", icon: "referrals", group: "sell", anyOf: ["crm.refer"] },
      { key: "companies", en: "Companies", vi: "Công ty", path: "/crm/accounts", icon: "companies", group: "customers" },
      { key: "contacts", en: "Contacts", vi: "Liên hệ", path: "/crm/contacts", icon: "contacts", group: "customers" },
      { key: "reports", en: "Reports", vi: "Báo cáo", path: "/crm/reports", icon: "reports", group: "results" },
      { key: "commission", en: "Commission", vi: "Hoa hồng", path: "/crm/commission", icon: "commission", group: "results" },
      { key: "model", en: "Business model", vi: "Mô hình kinh doanh", path: "/crm/model", icon: "model", group: "results", anyOf: ["crm.team"] },
      { key: "fulfillment", en: "Fulfillment", vi: "Bàn giao", path: "/crm/fulfillment", icon: "fulfillment", group: "operations", anyOf: ["crm.fulfillment", "crm.team"] },
      { key: "operations", en: "Assignment and cohorts", vi: "Phân công và cohort", path: "/crm/admin", icon: "assignment", group: "operations", anyOf: ["crm.team"] },
      { key: "playbooks", en: "Playbooks", vi: "Playbook", path: "/crm/admin/playbooks", icon: "playbooks", group: "setup", anyOf: ["crm.configure"] },
      { key: "offers", en: "Offers and prices", vi: "Gói và giá", path: "/crm/admin/offers", icon: "offers", group: "setup", anyOf: ["crm.configure"] },
      { key: "process", en: "Sales process", vi: "Quy trình bán hàng", path: "/crm/process", icon: "process", group: "help" },
      { key: "files", en: "Files", vi: "Tài liệu", path: "/crm/files", icon: "files", group: "help" },
      { key: "api", en: "Connect an AI agent", vi: "Kết nối AI agent", path: "/crm/api", icon: "agents", group: "help" },
    ],
  },
  {
    key: "hrm", en: "HRM", vi: "HRM", path: "/hrm", icon: "hrm", permission: "hrm.access", links: [
      { key: "home", en: "My overview", vi: "Tổng quan của tôi", path: "/hrm", icon: "overview" },
      { key: "profile", en: "My profile", vi: "Hồ sơ của tôi", path: "/hrm/me", icon: "profile", anyOf: ["hrm.profile.self"] },
      { key: "my-documents", en: "My legal documents", vi: "Tài liệu pháp lý của tôi", path: "/hrm/me/documents", icon: "profile", anyOf: ["hrm.legal.self"] },
      { key: "my-coi", en: "My COI declarations", vi: "Khai báo COI của tôi", path: "/hrm/me/coi", icon: "profile", anyOf: ["hrm.coi.self"] },
      { key: "my-onboarding", en: "Onboarding tasks", vi: "Việc cần làm khi gia nhập", path: "/hrm/me/onboarding", icon: "today", anyOf: ["hrm.onboarding.self", "hrm.onboarding.tasks"] },
      { key: "my-time", en: "My attendance", vi: "Công của tôi", path: "/hrm/me/time", icon: "today", anyOf: ["hrm.time.self"] },
      { key: "my-leave", en: "My leave", vi: "Phép của tôi", path: "/hrm/me/leave", icon: "today", anyOf: ["hrm.leave.self"] },
      { key: "my-payslips", en: "My payslips", vi: "Phiếu lương của tôi", path: "/hrm/me/payslips", icon: "profile", anyOf: ["hrm.payroll.self"] },
      { key: "my-requests", en: "My HR requests", vi: "Yêu cầu HR của tôi", path: "/hrm/me/requests", icon: "today", anyOf: ["hrm.services.self"] },
      { key: "my-assets", en: "My assets", vi: "Tài sản của tôi", path: "/hrm/me/assets", icon: "profile", anyOf: ["hrm.assets.self"] },
      { key: "my-benefits", en: "My benefits", vi: "Phúc lợi của tôi", path: "/hrm/me/benefits", icon: "profile", anyOf: ["hrm.benefits.self"] },
      { key: "my-performance", en: "My reviews", vi: "Đánh giá của tôi", path: "/hrm/me/performance", icon: "profile", anyOf: ["hrm.performance.self"] },
      { key: "my-training", en: "My training", vi: "Đào tạo của tôi", path: "/hrm/me/training", icon: "profile", anyOf: ["hrm.training.self"] },
      { key: "notifications", en: "Notifications", vi: "Thông báo", path: "/hrm/notifications", icon: "today", anyOf: ["hrm.notifications.read"] },
      { key: "people", en: "People", vi: "Nhân sự", path: "/hrm/people", icon: "hrm_people", anyOf: ["hrm.records.manage", "hrm.team.read"] },
      { key: "job-descriptions", en: "Job descriptions", vi: "Mô tả công việc", path: "/hrm/job-descriptions", icon: "roles", anyOf: ["hrm.records.manage"] },
      { key: "legal-documents", en: "Policies and documents", vi: "Chính sách và tài liệu", path: "/hrm/documents", icon: "profile", anyOf: ["hrm.legal.manage"] },
      { key: "coi-review", en: "COI review", vi: "Rà soát COI", path: "/hrm/coi", icon: "profile", anyOf: ["hrm.coi.review"] },
      { key: "onboarding-manage", en: "Onboarding plans", vi: "Kế hoạch onboarding", path: "/hrm/onboarding", icon: "hrm_people", anyOf: ["hrm.onboarding.manage"] },
      { key: "offboarding", en: "Offboarding", vi: "Offboarding", path: "/hrm/offboarding", icon: "hrm_people", anyOf: ["hrm.offboarding.manage", "hrm.offboarding.tasks"] },
      { key: "retention", en: "Retention and legal holds", vi: "Lưu trữ và legal hold", path: "/hrm/retention", icon: "hrm_settings", anyOf: ["hrm.retention.manage", "hrm.retention.review", "hrm.legalhold.manage"] },
      { key: "time", en: "Schedules and attendance", vi: "Lịch và chấm công", path: "/hrm/time", icon: "hrm_people", anyOf: ["hrm.time.manage", "hrm.time.review", "hrm.time.configure"] },
      { key: "leave", en: "Leave policies and requests", vi: "Chính sách phép và đơn nghỉ", path: "/hrm/leave", icon: "hrm_people", anyOf: ["hrm.leave.manage", "hrm.leave.review", "hrm.leave.configure"] },
      { key: "payroll", en: "Payroll and payslips", vi: "Payroll và phiếu lương", path: "/hrm/payroll", icon: "hrm_people", anyOf: ["hrm.payroll.read", "hrm.payroll.prepare", "hrm.payroll.configure"] },
      { key: "service-requests", en: "HR service desk", vi: "Yêu cầu dịch vụ HR", path: "/hrm/requests", icon: "hrm_people", anyOf: ["hrm.services.manage"] },
      { key: "assets", en: "Asset register", vi: "Quản lý tài sản", path: "/hrm/assets", icon: "hrm_people", anyOf: ["hrm.assets.manage"] },
      { key: "benefits", en: "Benefits", vi: "Quản lý phúc lợi", path: "/hrm/benefits", icon: "hrm_people", anyOf: ["hrm.benefits.manage"] },
      { key: "performance", en: "Performance reviews", vi: "Đánh giá hiệu suất", path: "/hrm/performance", icon: "hrm_people", anyOf: ["hrm.performance.manage", "hrm.performance.review"] },
      { key: "training", en: "Training and certificates", vi: "Đào tạo và chứng chỉ", path: "/hrm/training", icon: "hrm_people", anyOf: ["hrm.training.manage"] },
      { key: "report-governance", en: "Report policies and holds", vi: "Chính sách và hold báo cáo", path: "/hrm/reports/governance", icon: "hrm_settings", anyOf: ["hrm.reports.manage"] },
      { key: "reports", en: "Reports", vi: "Báo cáo", path: "/hrm/reports", icon: "hrm_settings", anyOf: ["hrm.reports.read"] },
      { key: "settings", en: "Settings", vi: "Thiết lập", path: "/hrm/settings", icon: "hrm_settings", anyOf: ["hrm.configure"] },
    ],
  },
  {
    key: "finance", en: "Finance", vi: "Tài chính", path: "/finance", icon: "finance", permission: "finance.access",
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
    key: "admin", en: "Admin", vi: "Quản trị", path: "/workspace/users", icon: "admin", permission: "users.manage", links: [
      { key: "users", en: "Users and roles", vi: "Người dùng và vai trò", path: "/workspace/users", icon: "users" },
    ],
  },
];

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
  if (path.startsWith("/workspace/users")) return "admin";
  return "home";
}
