// The Workspace information architecture in one place. Primary navigation
// lists modules; secondary navigation lists the pages inside the current
// module. Each entry declares the permission it needs, so menus never show
// a page that would answer 403. Paths are English; Vietnamese adds /vi.
import type { Permission, WorkspaceUser } from "./roles";

export type ModuleKey = "home" | "hiring" | "crm" | "admin";
export interface NavLink { key: string; en: string; vi: string; path: string; anyOf?: Permission[] }
export interface NavModule { key: ModuleKey; en: string; vi: string; path: string; permission: Permission; links: NavLink[] }

export const modules: NavModule[] = [
  { key: "home", en: "Overview", vi: "Tổng quan", path: "/workspace", permission: "workspace.access", links: [] },
  {
    key: "hiring", en: "Hiring", vi: "Tuyển dụng", path: "/admin/jobs", permission: "hiring.access", links: [
      { key: "jobs", en: "Roles", vi: "Vị trí", path: "/admin/jobs" },
      { key: "applications", en: "Candidates", vi: "Ứng viên", path: "/admin/jobs/applications" },
    ],
  },
  {
    key: "crm", en: "CRM", vi: "CRM", path: "/crm", permission: "crm.access", links: [
      { key: "today", en: "Today", vi: "Hôm nay", path: "/crm" },
      { key: "pipeline", en: "Pipeline", vi: "Cơ hội", path: "/crm/pipeline" },
      { key: "companies", en: "Companies", vi: "Công ty", path: "/crm/accounts" },
      { key: "contacts", en: "Contacts", vi: "Liên hệ", path: "/crm/contacts" },
      { key: "new", en: "New", vi: "Tạo mới", path: "/crm/new" },
      { key: "referrals", en: "Referrals", vi: "Giới thiệu khách", path: "/crm/referrals", anyOf: ["crm.refer"] },
      { key: "reports", en: "Reports", vi: "Báo cáo", path: "/crm/reports" },
      { key: "commission", en: "Commission", vi: "Hoa hồng", path: "/crm/commission" },
      { key: "api", en: "API & agents", vi: "API và agent", path: "/crm/api" },
      { key: "fulfillment", en: "Fulfillment", vi: "Bàn giao", path: "/crm/fulfillment", anyOf: ["crm.fulfillment", "crm.team"] },
      { key: "operations", en: "Operations", vi: "Vận hành", path: "/crm/admin", anyOf: ["crm.team"] },
      { key: "playbooks", en: "Playbooks", vi: "Playbook", path: "/crm/admin/playbooks", anyOf: ["crm.configure"] },
      { key: "offers", en: "Offers", vi: "Gói và giá", path: "/crm/admin/offers", anyOf: ["crm.configure"] },
    ],
  },
  {
    key: "admin", en: "Admin", vi: "Quản trị", path: "/workspace/users", permission: "users.manage", links: [
      { key: "users", en: "Users and roles", vi: "Người dùng và vai trò", path: "/workspace/users" },
    ],
  },
];

export function localized(path: string, vi: boolean): string {
  return vi ? `/vi${path}` : path;
}

export function visibleModules(user: WorkspaceUser): NavModule[] {
  return modules.filter((module) => user.can(module.permission));
}

export function visibleLinks(user: WorkspaceUser, module: NavModule): NavLink[] {
  return module.links.filter((link) => !link.anyOf || link.anyOf.some((permission) => user.can(permission)));
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
  if (path === "/crm" || path.startsWith("/crm/")) return "crm";
  if (path.startsWith("/workspace/users")) return "admin";
  return "home";
}
