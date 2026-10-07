// Shared helpers for the bilingual hiring desk (/admin/jobs, /vi/admin/jobs).
import type { ApplicationStatus, JobStatus } from "../ats";

export type Lang = "en" | "vi";

/** Locale for a form post: the hidden `lang` field, else the same-origin referrer. */
export function postLang(request: Request, form?: FormData): Lang {
  const field = form?.get("lang");
  if (field === "vi" || field === "en") return field;
  try {
    const referer = request.headers.get("referer");
    if (referer && new URL(referer).origin === new URL(request.url).origin && new URL(referer).pathname.startsWith("/vi/")) return "vi";
  } catch { /* fall through */ }
  return "en";
}

export function deskPath(lang: Lang, path: string): string {
  return lang === "vi" ? `/vi${path}` : path;
}

/** Who acted, for notes and history. Never a generic "Admin". */
export function deskActor(locals: App.Locals): { id: string | null; name: string } {
  const user = locals.workspace;
  return user ? { id: user.id, name: user.name } : { id: null, name: "Unknown" };
}

const statusNames: Record<ApplicationStatus | JobStatus, [string, string]> = {
  new: ["New", "Mới"], review: ["In review", "Đang xem"], shortlist: ["Shortlist", "Danh sách ngắn"], interview: ["Interview", "Phỏng vấn"],
  offer: ["Offer", "Đề nghị"], hired: ["Hired", "Đã tuyển"], rejected: ["Not moving forward", "Không tiếp tục"], withdrawn: ["Withdrawn", "Ứng viên rút"],
  draft: ["Draft", "Nháp"], published: ["Published", "Đang tuyển"], closed: ["Closed", "Đã đóng"],
};
export function statusName(status: string, lang: Lang): string {
  return statusNames[status as keyof typeof statusNames]?.[lang === "vi" ? 1 : 0] ?? status;
}
export function statusTone(status: string): string {
  if (["published", "hired", "offer"].includes(status)) return "green";
  if (["new", "review", "shortlist", "interview"].includes(status)) return "blue";
  if (["draft"].includes(status)) return "amber";
  return "";
}

const eventNames: Record<string, [string, string]> = {
  status_changed: ["Stage changed", "Đổi giai đoạn"], note_added: ["Private note added", "Thêm ghi chú riêng"], submitted: ["Application received", "Nhận hồ sơ"],
  interview_scheduled: ["Interview scheduled", "Đã hẹn phỏng vấn"], interview_status: ["Interview updated", "Cập nhật phỏng vấn"], scorecard_added: ["Scorecard added", "Thêm phiếu đánh giá"],
  discord_notification_sent: ["Team notified", "Đã báo cho đội"], discord_notification_failed: ["Team notification failed", "Báo cho đội thất bại"],
};
export function eventName(type: string, lang: Lang): string {
  return eventNames[type]?.[lang === "vi" ? 1 : 0] ?? type.replace(/_/g, " ");
}

export function deskDate(value: string | null | undefined, lang: Lang): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleDateString(lang === "vi" ? "vi-VN" : "en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
}

/** Defence in depth for hiring APIs: middleware already requires hiring access. */
export function deskForbidden(locals: App.Locals, permission: import("../workspace/roles").Permission): Response | null {
  return locals.workspace?.can(permission) ? null : new Response("Forbidden", { status: 403, headers: { "Cache-Control": "private, no-store" } });
}
