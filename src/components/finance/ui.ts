import { FINANCE_METRIC_LABELS, type FinanceLine } from "../../lib/finance/model";
import { calculateVariance, type FinanceVariance } from "../../lib/finance/calculations";
import type { FinancePageData, FinancePageKey } from "./types";

export const pageCopy: Record<FinancePageKey, { title: readonly [string, string]; description: readonly [string, string] }> = {
  overview: { title: ["Financial overview", "Tổng quan tài chính"], description: ["The plan, the actual result and the cash position for the selected period, with material variances listed.", "Kế hoạch, kết quả thực tế và tình hình tiền của kỳ đã chọn, kèm các chênh lệch trọng yếu."] },
  plans: { title: ["Financial plans", "Kế hoạch tài chính"], description: ["Build the year month by month. Keep the baseline, scenarios and forecasts distinct.", "Lập kế hoạch từng tháng trong năm. Theo dõi riêng kế hoạch gốc, kịch bản và dự báo."] },
  actuals: { title: ["Monthly actuals", "Số thực tế tháng"], description: ["Enter sourced monthly figures, resolve differences and close a complete revision.", "Nhập số liệu tháng cùng nguồn đối chiếu, xử lý chênh lệch và chốt phiên bản hoàn chỉnh."] },
  pnl: { title: ["Profit and loss", "Báo cáo lãi lỗ"], description: ["Follow recognized revenue through direct costs and expenses to the final result.", "Theo dõi doanh thu ghi nhận, chi phí trực tiếp và chi phí hoạt động đến lợi nhuận sau thuế."] },
  "cash-flow": { title: ["Cash flow", "Dòng tiền"], description: ["Connect cash movements to observed balances and the months ahead.", "Đối chiếu thu chi với số dư quan sát và kế hoạch dòng tiền các tháng tiếp theo."] },
  revenue: { title: ["Revenue", "Doanh thu"], description: ["Understand recognized revenue, its sources and the difference from the plan.", "Theo dõi doanh thu ghi nhận theo nguồn và chênh lệch so với kế hoạch."] },
  costs: { title: ["Costs", "Chi phí"], description: ["Review direct and shared costs with their budget and supporting context.", "Đối chiếu chi phí trực tiếp, chi phí dùng chung với ngân sách và giải trình."] },
  "working-capital": { title: ["Working capital", "Vốn lưu động"], description: ["Review receivables, payables and supplied aging at the end of the month.", "Theo dõi phải thu, phải trả và tuổi nợ được cung cấp tại thời điểm cuối tháng."] },
  position: { title: ["Financial position", "Tình hình tài chính"], description: ["Review assets, liabilities and equity with explicit reconciliation checks.", "Theo dõi tài sản, nợ phải trả, vốn chủ sở hữu và kết quả kiểm tra cân đối."] },
  settings: { title: ["Finance settings", "Thiết lập tài chính"], description: ["Define the reporting book, its calendar and the meaning of every input.", "Thiết lập sổ quản trị, kỳ báo cáo và ý nghĩa của từng khoản mục đầu vào."] },
  audit: { title: ["Finance audit trail", "Lịch sử tài chính"], description: ["Trace changes, frozen revisions and the explanations attached to them.", "Tra cứu thay đổi, các phiên bản đã chốt và giải trình gắn với từng số liệu."] },
};

export const groups: Record<string, readonly [string, string]> = {
  pnl: ["Profit and loss", "Lãi lỗ"], cash: ["Cash movements", "Thu chi tiền"], position: ["Financial position", "Tình hình tài chính"], aging: ["Receivable and payable aging", "Tuổi nợ phải thu và phải trả"], control: ["Reconciliation inputs", "Số liệu kiểm soát"], revenue: ["Revenue", "Doanh thu"], direct_cost: ["Direct costs", "Chi phí trực tiếp"], operating_expense: ["Operating expenses", "Chi phí hoạt động"], other_operating_income: ["Other operating income", "Thu nhập hoạt động khác"], finance_income: ["Finance income", "Thu nhập tài chính"], finance_cost: ["Finance costs", "Chi phí tài chính"], income_tax: ["Income tax", "Thuế thu nhập"], operating: ["Operating activities", "Hoạt động kinh doanh"], investing: ["Investing activities", "Hoạt động đầu tư"], financing: ["Financing activities", "Hoạt động tài trợ"], asset: ["Assets", "Tài sản"], liability: ["Liabilities", "Nợ phải trả"], equity: ["Equity", "Vốn chủ sở hữu"], ar: ["Trade receivables", "Phải thu thương mại"], ap: ["Trade payables", "Phải trả thương mại"], ar_control: ["Receivable control", "Kiểm soát phải thu"], ap_control: ["Payable control", "Kiểm soát phải trả"], opening_cash: ["Opening cash", "Tiền đầu kỳ"], opening_equity: ["Opening equity", "Vốn chủ đầu kỳ"], noncash_contribution: ["Noncash contributions", "Góp vốn phi tiền tệ"], noncash_distribution: ["Noncash distributions", "Phân phối phi tiền tệ"], other_equity_movement: ["Other equity movements", "Biến động vốn khác"], restricted_cash: ["Restricted cash forecast", "Dự báo tiền bị hạn chế"],
};

export const tr = (vi: boolean, text: readonly [string, string]) => text[vi ? 1 : 0];
export const lineLabel = (line: FinanceLine, vi: boolean) => vi ? line.labelVi : line.labelEn;
export const metricLabel = (key: string, vi: boolean) => FINANCE_METRIC_LABELS[key]?.[vi ? 1 : 0] ?? key;
export const groupLabel = (key: string, vi: boolean) => groups[key]?.[vi ? 1 : 0] ?? key;
export const localized = (path: string, vi: boolean) => `${vi ? "/vi" : ""}${path}`;
export function financeLink(data: FinancePageData, page: FinancePageKey = data.page, extra: Record<string, string | number | undefined> = {}) {
  const params = new URLSearchParams({ year: String(data.fiscalYear), period: data.period });
  if (data.selectedPlanId) params.set("plan", data.selectedPlanId);
  if (data.segmentCode && data.segmentCode !== "all") params.set("segment", data.segmentCode);
  if (data.range && data.range !== "month") params.set("range", data.range);
  const drilldown = ["actuals", "pnl", "cash-flow", "revenue", "costs", "working-capital", "position"];
  if (data.selectedActualRevisionId && drilldown.includes(data.page) && drilldown.includes(page) && !Object.hasOwn(extra, "period") && !Object.hasOwn(extra, "revision")) {
    params.set("revision", data.selectedActualRevisionId);
    const authoritative = data.state.periods.find(item => item.period === data.period)?.authoritativeClosedRevisionId;
    if (data.selectedActualRevisionId !== authoritative) params.set("range", "month");
  }
  for (const [key, value] of Object.entries(extra)) { if (value === undefined || value === "") params.delete(key); else params.set(key, String(value)); }
  return `${localized(`/finance${page === "overview" ? "" : `/${page}`}`, data.lang === "vi")}?${params}`;
}

/** Display exact integer minor units without converting money through floating-point division. */
export function money(value: number | null | undefined, precision = 0, vi = false): string {
  if (value === null || value === undefined || !Number.isSafeInteger(value)) return "—";
  const big = BigInt(value), negative = big < 0n, magnitude = negative ? -big : big, scale = 10n ** BigInt(precision);
  const integer = (magnitude / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, vi ? "." : ",");
  const decimals = precision ? `${vi ? "," : "."}${(magnitude % scale).toString().padStart(precision, "0")}` : "";
  return `${negative ? "−" : ""}${integer}${decimals}`;
}

export function monthLabel(period: string, vi: boolean, long = false): string {
  if (!/^\d{4}-\d{2}$/.test(period)) return period;
  const [year, month] = period.split("-").map(Number);
  if (vi) return `${long ? "Tháng " : "T"}${month}${long ? " năm " : "/"}${year}`;
  return new Intl.DateTimeFormat("en-GB", { month: long ? "long" : "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function timestamp(value: string | undefined | null, vi: boolean, timezone = "Asia/Ho_Chi_Minh"): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(vi ? "vi-VN" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(date);
}

export const inputValue = (data: FinancePageData, name: string, fallback: string | number = "") => data.submitted?.[name] ?? String(fallback);
export const stateLabel = (state: string | null | undefined, vi: boolean) => ({ draft: vi ? "Bản nháp" : "Draft", published: vi ? "Đã công bố" : "Published", closed: vi ? "Đã chốt" : "Closed", missing: vi ? "Chưa nhập" : "Missing", entered: vi ? "Đã nhập" : "Entered", not_applicable: vi ? "Không áp dụng" : "Not applicable", budget: vi ? "Ngân sách" : "Budget", forecast: vi ? "Dự báo" : "Forecast", scenario: vi ? "Kịch bản" : "Scenario", pending: vi ? "Chờ xác nhận" : "Pending", committed: vi ? "Đã ghi dữ liệu" : "Committed", discarded: vi ? "Đã bỏ phần chờ" : "Pending data discarded", partial: vi ? "Đã ghi một phần" : "Partly committed", preview: vi ? "Bản xem trước" : "Preview" } as Record<string, string>)[state ?? ""] ?? (vi ? "Chưa có dữ liệu" : "No data");
export function percent(value: number | null | undefined, vi: boolean): string { return value == null || !Number.isFinite(value) ? "—" : `${new Intl.NumberFormat(vi ? "vi-VN" : "en-GB", { maximumFractionDigits: 1 }).format(value * 100)}%`; }
export function exactDelta(actual: number | null | undefined, plan: number | null | undefined): number | null { if (actual == null || plan == null || !Number.isSafeInteger(actual) || !Number.isSafeInteger(plan)) return null; const delta = BigInt(actual) - BigInt(plan); return delta > BigInt(Number.MAX_SAFE_INTEGER) || delta < BigInt(Number.MIN_SAFE_INTEGER) ? null : Number(delta); }
export function exactTotal(values: (number | null | undefined)[]): number | null { if (!values.length || values.some(value => value == null || !Number.isSafeInteger(value))) return null; const total = values.reduce<bigint>((sum, value) => sum + BigInt(value!), 0n); return total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER) ? null : Number(total); }

export function selectedPlan(data: FinancePageData) { return data.state.plans.find(plan => plan.id === data.selectedPlanId); }
export function selectedRevision(data: FinancePageData) {
  const period = data.state.periods.find(item => item.period === data.period);
  const id = data.selectedActualRevisionId ?? (data.page === "actuals" ? period?.workingRevisionId ?? period?.authoritativeClosedRevisionId : period?.authoritativeClosedRevisionId);
  return data.state.actualRevisions.find(revision => revision.id === id);
}
export function selectedContext(data: FinancePageData, kind: "plan" | "actual") {
  const target = kind === "plan" ? selectedPlan(data) : selectedRevision(data);
  const frozen = target?.reportingSnapshot;
  const definition = data.state.definitions.find(item => item.id === target?.definitionSetId) ?? data.state.definitions.find(item => item.fiscalYear === data.fiscalYear);
  return { lines: frozen?.lines ?? definition?.lines ?? data.state.lines, segments: frozen?.segments ?? definition?.segments ?? data.state.segments, expectedInputs: frozen?.expectedInputs ?? definition?.expectedInputs ?? [], accounts: frozen?.cashAccounts ?? data.state.accounts, definition };
}
export const segmentLabel = (code: string, data: FinancePageData, vi: boolean) => code === "all" ? (vi ? "Toàn sổ" : "Whole book") : code === "unallocated" ? (vi ? "Chưa phân bổ" : "Unallocated") : data.state.segments.find(segment => segment.code === code)?.[vi ? "labelVi" : "labelEn"] ?? code;
export const costBehaviorLabel = (behavior: string | undefined, vi: boolean) => ({ fixed: ["Fixed", "Cố định"], variable: ["Variable", "Biến đổi"], mixed: ["Mixed", "Hỗn hợp"], unspecified: ["Unspecified", "Chưa phân loại"] } as Record<string, string[]>)[behavior ?? "unspecified"]?.[vi ? 1 : 0] ?? (vi ? "Chưa phân loại" : "Unspecified");

export function variance(actual: number | null | undefined, plan: number | null | undefined, direction: "higher" | "lower" | "neutral" = "neutral", ratio = false): FinanceVariance {
  try { return calculateVariance(actual ?? null, plan ?? null, direction, ratio); }
  catch { return { difference: null, percentage: null, percentagePoints: null, favorable: null, state: "no_comparison" }; }
}

export function financeErrorText(raw: string, vi: boolean): string {
  const code = raw.toLowerCase();
  const text: readonly [string, string] = code.includes("note_required") ? ["Add an explanation for not-applicable, negative or Other inputs.", "Bổ sung giải thích cho ô không áp dụng, số âm hoặc khoản mục Khác."]
    : code.includes("conflict") || code.includes("changed") || code.includes("version") ? ["The saved version has changed. Compare your retained inputs with the current record before resubmitting.", "Phiên bản đã thay đổi. Đối chiếu nội dung được giữ lại với bản hiện hành trước khi gửi lại."]
    : code.includes("not_ended") ? ["This month has not ended in the book’s time zone. Save a draft and close it after month end.", "Tháng chưa kết thúc theo múi giờ của sổ. Lưu bản nháp và chốt sau cuối tháng."]
    : code.includes("future") ? ["Actuals cannot be entered for a future month. Use a plan for future figures.", "Không nhập số thực tế cho tháng tương lai. Dùng kế hoạch cho số liệu dự kiến."]
    : code.includes("missing_input") || code.includes("incomplete") || code.includes("missing_block") ? ["Required inputs or reconciliation checks are incomplete. Review the missing inputs and save the draft first.", "Còn thiếu đầu vào hoặc chưa khớp đối chiếu. Kiểm tra các ô còn thiếu và lưu bản nháp trước."]
    : code.includes("reconciliation") ? ["The related balances do not reconcile. Review the source totals and movements; do not insert a balancing estimate.", "Các số dư liên quan chưa khớp. Kiểm tra tổng nguồn và phát sinh; không thêm số ước tính để cân đối."]
    : code.includes("stale") || code.includes("opening_source_mismatch") ? ["An earlier closed source has been replaced. Reconcile the opening-balance chain using the current closed revision.", "Nguồn đã chốt trước đó đã được thay thế. Đối chiếu lại chuỗi số dư đầu kỳ theo phiên bản chốt hiện hành."]
    : code.includes("source") || code.includes("evidence") ? ["Check the source date, scope and evidence references for every reporting block.", "Kiểm tra ngày nguồn, phạm vi và tham chiếu đối chiếu của từng nhóm báo cáo."]
    : code.includes("opening") || code.includes("prior_close") ? ["Supply initial opening balances or close the previous reporting month before continuing.", "Nhập số dư đầu kỳ đầu tiên hoặc chốt tháng báo cáo trước khi tiếp tục."]
    : code.includes("forecast_requires") || code.includes("forecast_anchor") ? ["A forecast needs continuous, reconciled closed actuals from fiscal year start through its cutoff.", "Dự báo cần chuỗi thực tế đã chốt liên tục và đối chiếu khớp từ đầu năm tài chính đến tháng chuyển tiếp."]
    : code.includes("locked") || code.includes("prefix") ? ["This record is frozen. Create a new plan version or reopen the actual period with a reason.", "Bản ghi này đã được giữ nguyên. Tạo phiên bản kế hoạch mới hoặc mở lại kỳ thực tế kèm lý do."]
    : code.includes("weight") || code.includes("split") ? ["Enter twelve valid nonnegative weights with a positive total for an editable full-year budget or scenario.", "Nhập 12 trọng số không âm có tổng dương cho bản ngân sách hoặc kịch bản cả năm còn chỉnh được."]
    : code.includes("duplicate") ? ["A code or input coordinate is duplicated. Keep one entry for each line, segment and month.", "Mã hoặc ô nhập bị trùng. Giữ một giá trị cho mỗi khoản mục, phân khúc và tháng."]
    : code.includes("coordinate") || code.includes("manifest") || code.includes("unknown_line") || code.includes("segment") ? ["The line, segment or month does not match the selected definition. Review the applicable input scope in Settings.", "Khoản mục, phân khúc hoặc tháng không khớp định nghĩa đã chọn. Kiểm tra phạm vi ô nhập trong Thiết lập."]
    : code.includes("account_required") || code.includes("inactive_cash_account") ? ["Configure an active cash account for this period before entering or closing its balances.", "Thiết lập tài khoản tiền hoạt động trong kỳ trước khi nhập hoặc chốt số dư."]
    : code.includes("observation") || code.includes("restricted_cash") ? ["Review each account’s date, balance, restricted portion and classification. Restricted cash cannot exceed its cash balance.", "Kiểm tra ngày, số dư, phần bị hạn chế và phân loại từng tài khoản. Tiền bị hạn chế không được vượt số dư tiền."]
    : code.includes("amount") || code.includes("money") || code.includes("negative") || code.includes("value_state") || code.includes("na_forbidden") || code.includes("not_applicable") ? ["Check the amount and its state. Use a decimal point without thousands separators; leave N/A amounts blank and provide a note.", "Kiểm tra số tiền và trạng thái. Dùng dấu chấm thập phân, không phân tách hàng nghìn; ô không áp dụng để trống số tiền và có giải thích."]
    : code.includes("too_large") || code.includes("too_many") ? ["This input exceeds the supported size. Split the data into smaller monthly batches.", "Dữ liệu vượt giới hạn cho phép. Chia thành các đợt nhập theo tháng nhỏ hơn."]
    : code.includes("expired") || code.includes("import") ? ["The import preview cannot be applied in its current state. Review its receipt or stage a fresh preview.", "Không thể áp dụng bản xem trước ở trạng thái hiện tại. Kiểm tra biên nhận hoặc tạo bản xem trước mới."]
    : code.includes("unavailable") || code.includes("not_ready") ? ["Finance is not ready to complete this request. Check setup and try again when the service is available.", "Tài chính chưa sẵn sàng xử lý yêu cầu. Kiểm tra thiết lập và thử lại khi dịch vụ hoạt động."]
    : code.includes("required") || code.includes("configuration") || code.includes("timezone") ? ["Complete the required configuration and policy fields before continuing.", "Hoàn tất các trường thiết lập và chính sách bắt buộc trước khi tiếp tục."]
    : ["The request could not be completed with these inputs. Review the selected period, required fields and source details, then try again.", "Không thể xử lý yêu cầu với dữ liệu này. Kiểm tra kỳ đã chọn, các trường bắt buộc và nguồn đối chiếu rồi thử lại."];
  return tr(vi, text);
}
