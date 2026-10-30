// Opportunity activity in words (the events in crm_events), shared by the
// opportunity and company activity rails.
export type ActivityKind = "note" | "task" | "event" | "warn";

const kinds: Record<string, [string, string]> = {
  created: ["Created", "Tạo hồ sơ"], details: ["Details updated", "Cập nhật thông tin"], fields: ["Information updated", "Cập nhật thông tin xác minh"], stage: ["Stage changed", "Đổi giai đoạn"],
  assigned: ["Owner changed", "Đổi người phụ trách"], note: ["Note", "Ghi chú"], task_created: ["Task added", "Thêm việc"], task_completed: ["Task completed", "Hoàn tất việc"],
  task_cancelled: ["Task cancelled", "Hủy việc"], meeting_confirmed: ["Meeting confirmed", "Cuộc hẹn đã xác nhận"], help_requested: ["Help requested", "Yêu cầu hỗ trợ"], help_resolved: ["Help resolved", "Đã hỗ trợ"],
  external_state: ["External action state", "Trạng thái hành động bên ngoài"], cost_logged: ["Time or cost logged", "Ghi thời gian/chi phí"], quote_created: ["Quote created", "Tạo báo giá"],
  quote_accepted: ["Quote accepted", "Báo giá được chấp thuận"], quote_withdrawn: ["Quote withdrawn", "Rút báo giá"], payment_recorded: ["Payment reported", "Báo đã nhận tiền"],
  payment_confirmed: ["Payment confirmed", "Xác nhận thanh toán"], payment_rejected: ["Payment rejected", "Từ chối thanh toán"], refund_recorded: ["Refund recorded", "Ghi hoàn tiền"],
  entry_voided: ["Entry voided", "Hủy dòng ghi"], receivable_recorded: ["Amount due recorded", "Ghi phải thu"], handoff_created: ["Handed off", "Đã bàn giao"], handoff_updated: ["Handoff updated", "Cập nhật bàn giao"],
  fulfillment_status: ["Delivery status", "Trạng thái thực hiện"], fulfillment_blocked: ["Delivery blocked", "Thực hiện bị chặn"], fulfillment_unblocked: ["Delivery unblocked", "Gỡ chặn"],
  fulfillment_checks: ["Launch checks", "Kiểm tra trước live"], owner_approval: ["Owner approval recorded", "Ghi nhận chủ duyệt"], delivery_accepted: ["Delivery accepted", "Nghiệm thu"],
  linked_created: ["Created from an earlier deal", "Tạo từ giao dịch trước"], child_created: ["Follow-on opportunity opened", "Mở cơ hội tiếp nối"], playbook_changed: ["Playbook changed", "Đổi playbook"],
  account_moved: ["Moved to another account", "Chuyển sang doanh nghiệp khác"], inbound: ["Website enquiry received", "Nhận yêu cầu từ website"], fulfillment_assigned: ["Delivery assigned", "Giao người thực hiện"],
};
export function activitySummary(kind: string, raw: string, vi: boolean, playbookNames: Record<string, string>): string {
  try {
    const body = JSON.parse(raw) as Record<string, any>;
    if (kind === "note") return body.text ?? "";
    if (kind.startsWith("legacy_")) return body.body ?? "";
    if (kind === "stage") return `${body.from} → ${body.to}${body.skipped?.length ? ` (${vi ? "bỏ qua" : "skipped"}: ${body.skipped.join(", ")})` : ""}${body.reason ? ` — ${body.reason}` : ""}`;
    if (kind === "playbook_changed") return `${playbookNames[body.from?.playbook] ?? body.from?.playbook}:${body.from?.stage} → ${playbookNames[body.to?.playbook] ?? body.to?.playbook}:${body.to?.stage} — ${body.reason}`;
    if (kind === "task_created" || kind === "task_completed") return [body.title, body.outcome, body.minutes ? `${body.minutes} min` : ""].filter(Boolean).join(" · ");
    if (kind === "fulfillment_status") return `${body.from} → ${body.to}`;
    if (kind === "external_state") return `${body.from} → ${body.to}${body.note ? ` — ${body.note}` : ""}`;
    if (body.reason) return body.reason;
    return "";
  } catch { return ""; }
}
export function activityName(kind: string, vi: boolean): string {
  return (kinds[kind] ?? (kind.startsWith("legacy_") ? ["Earlier CRM activity", "Hoạt động từ CRM cũ"] : [kind, kind]))[vi ? 1 : 0];
}

export function activityKind(kind: string): ActivityKind {
  return kind === "note" ? "note" : kind.startsWith("task") || kind === "meeting_confirmed" ? "task" : kind.includes("blocked") || kind === "payment_rejected" || kind === "help_requested" ? "warn" : "event";
}
