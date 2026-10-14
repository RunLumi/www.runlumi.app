// The Workspace information architecture in one place. Primary navigation
// lists modules; secondary navigation lists the pages inside the current
// module. Each entry declares the permission it needs, so menus never show
// a page that would answer 403. Paths are English; Vietnamese adds /vi.
import type { Permission, WorkspaceUser } from "./roles";

export type ModuleKey = "home" | "hiring" | "crm" | "hrm" | "admin";
export type IconName =
  | "files" | "hrm" | "profile" | "hrm_people" | "hrm_settings"
  | "overview" | "hiring" | "crm" | "admin" | "today" | "pipeline" | "new" | "referrals" | "companies" | "contacts" | "reports"
  | "commission" | "fulfillment" | "assignment" | "playbooks" | "offers" | "process" | "agents" | "roles" | "candidates" | "users" | "menu";
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
      { key: "pipeline", en: "Pipeline", vi: "Cơ hội", path: "/crm/pipeline", icon: "pipeline", group: "sell" },
      { key: "new", en: "New opportunity", vi: "Tạo cơ hội", path: "/crm/new", icon: "new", group: "sell" },
      { key: "referrals", en: "Referrals", vi: "Giới thiệu khách", path: "/crm/referrals", icon: "referrals", group: "sell", anyOf: ["crm.refer"] },
      { key: "companies", en: "Companies", vi: "Công ty", path: "/crm/accounts", icon: "companies", group: "customers" },
      { key: "contacts", en: "Contacts", vi: "Liên hệ", path: "/crm/contacts", icon: "contacts", group: "customers" },
      { key: "reports", en: "Reports", vi: "Báo cáo", path: "/crm/reports", icon: "reports", group: "results" },
      { key: "commission", en: "Commission", vi: "Hoa hồng", path: "/crm/commission", icon: "commission", group: "results" },
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
      { key: "people", en: "People", vi: "Nhân sự", path: "/hrm/people", icon: "hrm_people", anyOf: ["hrm.records.manage", "hrm.team.read"] },
      { key: "legal-documents", en: "Policies and documents", vi: "Chính sách và tài liệu", path: "/hrm/documents", icon: "profile", anyOf: ["hrm.legal.manage"] },
      { key: "coi-review", en: "COI review", vi: "Rà soát COI", path: "/hrm/coi", icon: "profile", anyOf: ["hrm.coi.review"] },
      { key: "onboarding-manage", en: "Onboarding plans", vi: "Kế hoạch onboarding", path: "/hrm/onboarding", icon: "hrm_people", anyOf: ["hrm.onboarding.manage"] },
      { key: "settings", en: "Settings", vi: "Thiết lập", path: "/hrm/settings", icon: "hrm_settings", anyOf: ["hrm.configure"] },
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
  return modules.filter((module) => user.can(module.permission) && (module.key !== "hrm" || user.hrmEnabled !== false || user.can("hrm.configure")));
}

export function visibleLinks(user: WorkspaceUser, module: NavModule): NavLink[] {
  return module.links.filter((link) => {
    const allowedWhileClosed=link.key==="settings"||(link.key==="legal-documents"&&user.can("hrm.legal.manage"))||(link.key==="onboarding-manage"&&user.can("hrm.onboarding.manage"));
    return (module.key!=="hrm"||user.hrmEnabled!==false||allowedWhileClosed)&&(!link.anyOf||link.anyOf.some(permission=>user.can(permission)));
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
  if (path === "/hrm" || path.startsWith("/hrm/")) return "hrm";
  if (path === "/crm" || path.startsWith("/crm/")) return "crm";
  if (path.startsWith("/workspace/users")) return "admin";
  return "home";
}
