// One line per module saying what it holds, for the module launcher and the
// Overview. Plain statements of what the module does (R-07).
import type { ModuleKey } from "./nav";

export const moduleSummaries: Record<ModuleKey, [string, string]> = {
  home: ["What needs you today, across your modules.", "Việc cần bạn hôm nay, trong các phân hệ của bạn."],
  hiring: ["Roles, application tests and candidates.", "Vị trí tuyển, bài test và ứng viên."],
  crm: ["Opportunities, quotes, payments, delivery and commission.", "Cơ hội, báo giá, thanh toán, bàn giao và hoa hồng."],
  hrm: ["Employee records and requests in your permitted scope.", "Hồ sơ và yêu cầu nhân sự trong phạm vi được cấp."],
  finance: ["Monthly plans, actuals, cash and financial statements.", "Kế hoạch, số thực tế tháng, dòng tiền và báo cáo tài chính."],
  admin: ["Who can sign in, and with which roles.", "Ai được đăng nhập và với vai trò nào."],
  account: ["Your identity, roles and personal settings.", "Danh tính, vai trò và thiết lập cá nhân của bạn."],
};

/** Tile colour per module (launcher and object icons), from the boards' object palette. */
export const moduleTone: Record<ModuleKey, string> = {
  home: "#102A43", hiring: "#1F7A4D", crm: "#0F7B7B", hrm: "#5B4FC4", finance: "#9A5B00", admin: "#5E6677", account: "#006093",
};

/** Two initials for the account button: the last two words of the name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const picked = words.length > 1 ? words.slice(-2) : words;
  return picked.map((word) => [...word][0] ?? "").join("").toLocaleUpperCase("vi") || "?";
}
