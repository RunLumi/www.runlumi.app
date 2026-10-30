// Bilingual names for the CRM events a rule can listen to.
const labels: Record<string, [string, string]> = {
  created: ["Opportunity created", "Tạo cơ hội"], linked_created: ["Follow-on opportunity created", "Tạo cơ hội nối tiếp"], inbound: ["Enquiry from Lumi Local", "Yêu cầu từ Lumi Local"],
  referred: ["Business referred", "Giới thiệu khách"], assigned: ["Owner changed", "Đổi người phụ trách"], stage: ["Stage changed", "Đổi giai đoạn"], note: ["Note added", "Thêm ghi chú"],
  details: ["Details changed", "Đổi thông tin"], fields: ["Discovery fields changed", "Đổi trường khám phá"], quote_created: ["Quote created", "Tạo báo giá"], quote_accepted: ["Quote accepted", "Khách nhận báo giá"],
  quote_withdrawn: ["Quote withdrawn", "Rút báo giá"], payment_recorded: ["Payment reported", "Báo đã nhận tiền"], payment_confirmed: ["Payment confirmed", "Xác nhận thanh toán"], refund_recorded: ["Refund recorded", "Ghi hoàn tiền"],
  entry_voided: ["Ledger entry voided", "Hủy bút toán"], task_created: ["Task created", "Tạo việc"], task_completed: ["Task completed", "Hoàn thành việc"], meeting_confirmed: ["Meeting confirmed", "Xác nhận cuộc hẹn"],
  help_requested: ["Help requested", "Nhờ hỗ trợ"], handoff_created: ["Handoff created", "Tạo bàn giao"], fulfillment_status: ["Delivery status changed", "Đổi trạng thái bàn giao"], fulfillment_blocked: ["Delivery blocked", "Bàn giao bị chặn"],
  fulfillment_unblocked: ["Delivery unblocked", "Bàn giao hết bị chặn"], owner_approval: ["Customer approval", "Khách duyệt"], delivery_accepted: ["Delivery accepted", "Nghiệm thu bàn giao"],
  account_created: ["Company created", "Tạo công ty"], contact_added: ["Contact added", "Thêm liên hệ"], account_owner_changed: ["Company manager changed", "Đổi người quản lý công ty"], do_not_contact_set: ["Do-not-contact recorded", "Ghi không liên hệ"],
  lead_inbound: ["Lead from the website", "Lead từ website"], lead_referred: ["Lead referred", "Lead được giới thiệu"], lead_created: ["Lead created", "Tạo Lead"],
  lead_assigned: ["Lead owner changed", "Đổi người phụ trách Lead"], lead_status: ["Lead status changed", "Đổi trạng thái Lead"], lead_note: ["Note on a Lead", "Ghi chú trên Lead"],
  lead_disqualified: ["Lead disqualified", "Lead không tiếp tục"], lead_converted: ["Lead converted", "Chuyển đổi Lead"],
};
export function eventLabel(kind: string, vi: boolean): string {
  return labels[kind]?.[vi ? 1 : 0] ?? kind;
}
