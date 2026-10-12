// EN/VI strings for the CRM. Both locales are peers; every key has both.
export type Lang = "en" | "vi";

const dict = {
  nav_today: ["Today", "Hôm nay"], nav_pipeline: ["Pipeline", "Cơ hội"], nav_new: ["New", "Tạo mới"], nav_reports: ["Reports", "Báo cáo"], nav_commission: ["Commission", "Hoa hồng"],
  nav_fulfillment: ["Fulfillment", "Bàn giao"], nav_admin: ["Admin", "Quản trị"], nav_hiring: ["Hiring", "Tuyển dụng"], sign_out: ["Sign out", "Đăng xuất"],
  skip: ["Skip to content", "Đến nội dung chính"], switch_lang: ["Tiếng Việt", "English"],
  save: ["Save", "Lưu"], cancel: ["Cancel", "Hủy"], unknown: ["Unknown", "Chưa biết"], none: ["None", "Không có"], not_set: ["Not set", "Chưa đặt"],
  unassigned: ["Unassigned", "Chưa phân công"], inactive_owner: ["Inactive EmDash account", "Tài khoản EmDash không hoạt động"],
  err_title: ["Some details need attention.", "Một số thông tin cần sửa."],
  err_required: ["Required.", "Bắt buộc."], err_invalid: ["Check this value.", "Kiểm tra lại giá trị này."], err_too_long: ["Too long.", "Quá dài."],
  err_suppressed: ["This contact cannot be added. Ask an admin.", "Không thể thêm người liên hệ này. Hãy hỏi admin."],
  err_do_not_contact: ["This contact or business asked not to be contacted, on any channel.", "Người liên hệ hoặc doanh nghiệp đã yêu cầu không liên hệ, trên mọi kênh."],
  err_admin_only: ["Only an admin may change the list price.", "Chỉ admin được đổi giá niêm yết."],
  err_not_allowed: ["This offer is not allowed in this playbook.", "Gói này không được dùng trong playbook này."],
  err_exceeds_payment: ["More than the refundable amount of that payment.", "Vượt số tiền còn có thể hoàn của khoản thanh toán."],
  err_has_refunds: ["Void its refunds first.", "Hãy hủy các khoản hoàn tiền trước."],
  err_owner_approval_required: ["Record the owner's approval first.", "Cần ghi nhận chủ đã duyệt trước."],
  err_checks_required: ["Every launch check must pass or be marked not applicable.", "Mọi kiểm tra trước khi live phải đạt hoặc đánh dấu không áp dụng."],
  err_acceptance_required: ["Record acceptance evidence first.", "Cần ghi nhận bằng chứng nghiệm thu trước."],
  err_blocked: ["Unblock before changing status.", "Gỡ trạng thái bị chặn trước khi đổi."],
  err_accepted_quote_required: ["A quote must be accepted first.", "Cần có báo giá đã được chấp thuận."],
  err_credit_expired: ["The upgrade credit window has closed. Create a new quote.", "Cửa sổ credit nâng cấp đã đóng. Hãy tạo báo giá mới."],
  err_credit_already_used: ["That Trust Kit payment was already credited once.", "Khoản Trust Kit đó đã được credit một lần."],
  err_credit_not_fully_paid: ["The Trust Kit payment was refunded or voided; no credit applies.", "Khoản Trust Kit đã hoàn hoặc hủy; không áp dụng credit."],
  err_credit_changed: ["Credit eligibility changed. Create a new quote.", "Điều kiện credit đã thay đổi. Hãy tạo báo giá mới."],
  err_before_quote: ["Acceptance cannot be dated before the quote was entered.", "Ngày chấp thuận không được trước ngày nhập báo giá."],
  err_parent_not_won: ["Upgrades and renewals start from an accepted sale.", "Nâng cấp và gia hạn bắt đầu từ giao dịch đã chấp thuận."],
  err_parent_period_missing: ["Set the service period on the original sale first.", "Hãy đặt kỳ dịch vụ ở giao dịch gốc trước."],
  err_renewal_playbook_required: ["Choose a renewal playbook.", "Chọn playbook gia hạn."], err_solution_playbook_required: ["Choose a solution playbook.", "Chọn playbook giải pháp."],
  err_taken: ["That key already exists.", "Mã này đã tồn tại."], err_verify_unknown: ["An unknown result must be verified as sent or failed.", "Kết quả chưa rõ phải được xác minh là đã gửi hoặc thất bại."],
  err_not_draft: ["This quote is no longer a draft.", "Báo giá không còn là bản nháp."],
  err_credit_available: ["A Trust Kit credit now applies. Withdraw this quote and create a new one.", "Khoản credit Trust Kit nay đã áp dụng được. Rút báo giá này và tạo báo giá mới."],
  err_self_assign: ["Ask an admin to assign this to you: it would credit you as the seller.", "Nhờ admin giao cho bạn: thao tác này sẽ ghi công bạn là người bán."],
  err_too_many_tokens: ["You already have 10 active tokens. Revoke one first.", "Bạn đã có 10 token đang hoạt động. Hãy thu hồi bớt trước."],
  err_not_found: ["No matching active account.", "Không tìm thấy tài khoản đang hoạt động phù hợp."],
  conflict_title: ["Someone else changed this record.", "Người khác vừa thay đổi hồ sơ này."],
  conflict_body: ["Your edit is still in the form below. Compare it with the latest values, then save again to apply it on top.", "Bản sửa của bạn vẫn còn trong form bên dưới. So sánh với giá trị mới nhất rồi lưu lại để áp dụng."],
  server_error: ["The server could not save this. Nothing was lost from the form; try again shortly.", "Máy chủ chưa lưu được. Dữ liệu trong form vẫn còn; hãy thử lại sau ít phút."],
  saved: ["Saved.", "Đã lưu."], duplicate_ok: ["Already saved — the repeated submission was ignored.", "Đã lưu trước đó — lần gửi lặp lại được bỏ qua."],
  latest_value: ["Latest saved value", "Giá trị mới nhất đã lưu"],
} as const satisfies Record<string, readonly [string, string]>;
export type Key = keyof typeof dict;

export function t(lang: Lang, key: Key): string {
  return dict[key][lang === "vi" ? 1 : 0];
}

export function errorText(lang: Lang, code: string | undefined): string {
  if (!code) return "";
  if (code.startsWith("missing:")) return lang === "vi" ? "Chưa đủ điều kiện chuyển giai đoạn." : "Requirements for this stage are not met.";
  const key = `err_${code}` as Key;
  return key in dict ? t(lang, key) : t(lang, "err_invalid");
}

type Labels = Record<string, readonly [string, string]>;
export const labels = {
  channel: { field_visit: ["Field visit", "Ghé thăm"], facebook: ["Facebook", "Facebook"], zalo: ["Zalo", "Zalo"], phone: ["Phone", "Điện thoại"], email: ["Email", "Email"], referral: ["Referral", "Giới thiệu"], inbound_web: ["Website enquiry", "Yêu cầu từ website"], event: ["Event", "Sự kiện"], existing_customer: ["Existing customer", "Khách hiện hữu"], other: ["Other", "Khác"] },
  role: { owner: ["Owner", "Chủ"], manager: ["Manager", "Quản lý"], decision_maker: ["Decision-maker", "Người quyết định"], buyer: ["Buyer", "Người mua"], technical: ["Technical contact", "Đầu mối kỹ thuật"], staff: ["Staff", "Nhân viên"], other: ["Other", "Khác"] },
  outcome: { open: ["Open", "Đang mở"], won: ["Won", "Thành công"], lost: ["Lost", "Không thành"], paused: ["Paused", "Tạm hoãn"] },
  relation: { new: ["New business", "Khách mới"], upgrade: ["Upgrade", "Nâng cấp"], renewal: ["Renewal", "Gia hạn"], expansion: ["Expansion", "Mở rộng"] },
  task: { call: ["Call", "Gọi"], message: ["Message", "Nhắn tin"], visit: ["Visit", "Ghé thăm"], meeting: ["Meeting", "Cuộc hẹn"], demo: ["Demo", "Demo"], pilot_review: ["Pilot review", "Đánh giá pilot"], follow_up: ["Follow-up", "Theo dõi"], internal: ["Internal", "Nội bộ"], support: ["Support needed", "Cần hỗ trợ"] },
  taskOutcome: { reached: ["Reached", "Đã liên lạc được"], no_answer: ["No answer", "Không nghe máy"], owner_absent: ["Owner absent", "Chủ vắng mặt"], rescheduled: ["Rescheduled", "Hẹn lại"], held: ["Held", "Đã diễn ra"], no_show: ["No-show", "Không đến"], completed: ["Completed", "Hoàn thành"], declined: ["Declined", "Từ chối"] },
  external: { none: ["—", "—"], draft: ["Draft", "Nháp"], submitting: ["Submitting", "Đang gửi"], verified: ["Verified sent", "Đã xác minh gửi"], failed: ["Failed", "Thất bại"], unknown: ["Result unknown", "Chưa rõ kết quả"] },
  cost: { research: ["Research", "Nghiên cứu"], preview: ["Preview", "Preview"], travel: ["Travel", "Di chuyển"], sales: ["Selling", "Bán hàng"], delivery: ["Delivery", "Thực hiện"], support: ["Support", "Hỗ trợ"], domain: ["Domain", "Tên miền"], hosting: ["Hosting", "Hosting"], printing: ["Printing", "In ấn"], generation: ["Generation", "Tạo nội dung"], payment_fee: ["Payment fee", "Phí thanh toán"], ads: ["Ads", "Quảng cáo"], other: ["Other", "Khác"] },
  ledger: { receivable: ["Amount due", "Phải thu"], credit: ["Credit", "Credit"], payment: ["Payment", "Thanh toán"], refund: ["Refund", "Hoàn tiền"], void: ["Correction (void)", "Điều chỉnh (hủy)"] },
  ledgerStatus: { pending: ["Awaiting confirmation", "Chờ xác nhận"], confirmed: ["Confirmed", "Đã xác nhận"], rejected: ["Rejected", "Bị từ chối"] },
  payment: { not_billed: ["Not billed", "Chưa phát sinh"], unpaid: ["Unpaid", "Chưa thanh toán"], partial: ["Part paid", "Thanh toán một phần"], paid: ["Paid", "Đã thanh toán"], overpaid: ["Overpaid", "Thanh toán thừa"], refunded: ["Refunded", "Đã hoàn tiền"] },
  method: { bank_transfer: ["Bank transfer", "Chuyển khoản"], cash: ["Cash", "Tiền mặt"], card: ["Card", "Thẻ"], e_wallet: ["E-wallet", "Ví điện tử"], other: ["Other", "Khác"] },
  quote: { draft: ["Draft", "Nháp"], accepted: ["Accepted", "Đã chấp thuận"], withdrawn: ["Withdrawn", "Đã rút"] },
  charge: { one_time: ["One-time", "Một lần"], first_year: ["First year", "Năm đầu"], annual: ["Per year", "Mỗi năm"], setup: ["Setup", "Phí setup"], monthly: ["Per month", "Mỗi tháng"], project: ["Project", "Dự án"], custom: ["Quoted per deal", "Báo giá theo dự án"] },
  fulfillment: { waiting_info: ["Waiting for information", "Chờ đủ thông tin"], in_progress: ["In progress", "Đang làm"], awaiting_owner: ["Awaiting owner approval", "Chờ chủ duyệt"], ready_to_publish: ["Ready to publish", "Sẵn sàng xuất bản"], live: ["Live", "Đã live"], accepted: ["Accepted", "Đã nghiệm thu"], pending: ["Pending activation", "Chờ kích hoạt"], active: ["Active period", "Kỳ mới đã kích hoạt"], delivered: ["Delivered", "Đã bàn giao"] },
  fulfillmentKind: { local_site: ["Local site", "Website Local"], renewal_activation: ["Renewal activation", "Kích hoạt gia hạn"], solution_delivery: ["Solution delivery", "Triển khai giải pháp"] },
  check: { call: ["Call button", "Nút gọi"], zalo: ["Zalo link", "Link Zalo"], maps: ["Maps directions", "Chỉ đường Maps"], form: ["Contact form delivery", "Form liên hệ gửi đến đúng nơi"], qr: ["Review QR", "QR đánh giá"], https: ["HTTPS", "HTTPS"], mobile: ["Mobile layout", "Hiển thị di động"] },
  checkValue: { pass: ["Pass", "Đạt"], fail: ["Fail", "Lỗi"], na: ["Not applicable", "Không áp dụng"] },
  consent: { unknown: ["Unknown", "Chưa rõ"], granted: ["Granted", "Đã đồng ý"], refused: ["Refused", "Từ chối"], withdrawn: ["Withdrawn", "Đã rút"] },
  contactChannel: { "": ["No preference", "Không ưu tiên"], phone: ["Phone", "Điện thoại"], zalo: ["Zalo", "Zalo"], email: ["Email", "Email"], visit: ["In person", "Gặp trực tiếp"], facebook: ["Facebook", "Facebook"], other: ["Other", "Khác"] },
  criterion: { met: ["Met", "Đạt"], not_met: ["Not met", "Chưa đạt"], unknown: ["Not enough data", "Chưa đủ dữ liệu"] },
} satisfies Record<string, Labels>;

export function label(lang: Lang, group: keyof typeof labels, value: string | null | undefined): string {
  const entry = (labels[group] as Labels)[value ?? ""];
  return entry ? entry[lang === "vi" ? 1 : 0] : (value ?? "");
}

export function options(lang: Lang, group: keyof typeof labels): { value: string; label: string }[] {
  return Object.entries(labels[group] as Labels).map(([value, names]) => ({ value, label: names[lang === "vi" ? 1 : 0] }));
}

export function formatDate(value: string | null | undefined, lang: Lang): string {
  if (!value) return t(lang, "not_set");
  const date = value.length === 10 ? new Date(`${value}T00:00:00+07:00`) : new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString(lang === "vi" ? "vi-VN" : "en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
}

export function formatDateTime(value: string, lang: Lang): string {
  return new Date(value).toLocaleString(lang === "vi" ? "vi-VN" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
}

/** The same page and query in the other locale. */
export function alternateUrl(url: URL): string {
  const path = url.pathname.startsWith("/vi/crm") ? url.pathname.slice(3) : url.pathname.startsWith("/crm") ? `/vi${url.pathname}` : url.pathname;
  return path + url.search;
}

export function base(lang: Lang): string {
  return lang === "vi" ? "/vi/crm" : "/crm";
}
