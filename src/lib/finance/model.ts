/** Finance domain contract. Money is safe integer minor units internally and decimal strings over JSON. */
export const FINANCE_CALCULATION_VERSION = "finance-v1";
export const FINANCE_UNALLOCATED = "unallocated";
export const FINANCE_ALL = "all";
export type FinanceBasis = "pnl" | "cash" | "position" | "aging" | "control";
export type FinanceValueState = "entered" | "missing" | "not_applicable";
export type FinanceVersionKind = "actual" | "budget" | "forecast" | "scenario";

export interface FinanceBook {
  id: string;
  entityName: string;
  currency: string;
  precision: number;
  fiscalStartMonth: number;
  timezone: string;
  firstPeriod: string;
  cashFloor: number | null;
  varianceAmountThreshold?: number | null;
  /** Basis points: 100 means 1%; independent of currency precision. */
  variancePercentThresholdBps?: number | null;
  version?: number;
}

export interface FinanceLine {
  code: string;
  basis: FinanceBasis;
  group: string;
  labelEn: string;
  labelVi: string;
  kind: "input" | "derived";
  sign: 1 | -1;
  required: boolean;
  allowNa: boolean;
  requireNote?: boolean;
  nonnegative?: boolean;
  aggregation: "flow" | "stock";
  costBehavior?: "fixed" | "variable" | "mixed" | "unspecified";
}

export interface FinanceExpectedInput {
  period: string;
  lineCode: string;
  segmentCode: string;
  required: boolean;
  allowNa: boolean;
  /** Absent means all datasets; an explicit mask is pinned in definition snapshots. */
  kinds?: readonly FinanceVersionKind[];
}

export interface FinanceFact {
  lineCode: string;
  segmentCode: string;
  state: FinanceValueState;
  amount: number | null;
  note: string;
  evidenceRef: string;
}

export interface FinanceCashAccount {
  code: string;
  label: string;
  activeFrom: string;
  activeTo?: string | null;
}

export interface FinanceCashObservation {
  accountCode: string;
  kind: "opening" | "closing";
  amount: number | null;
  restrictedAmount: number | null;
  classification: "cash" | "borrowing";
  evidenceRef: string;
  asOfDate: string;
}

/** The same fact shape is used in plans and actuals; actuals additionally contain bank observations. */
export interface FinanceSnapshot {
  period: string;
  values: FinanceFact[];
  cashObservations: FinanceCashObservation[];
  revisionId?: string;
  openingSourceRevisionId?: string | null;
  state?: "draft" | "closed" | "published";
  stale?: boolean;
}

export interface FinanceCalculationContext {
  book: FinanceBook;
  lines: readonly FinanceLine[];
  expectedInputs: readonly FinanceExpectedInput[];
  cashAccounts: readonly FinanceCashAccount[];
  kind: FinanceVersionKind;
  previous?: FinanceSnapshot | null;
  previousLines?: readonly FinanceLine[];
  previousCashAccounts?: readonly FinanceCashAccount[];
  /** Computed forecast anchors. Actual cash always uses verified observations. */
  openingCash?: number | null;
  openingEquity?: number | null;
  /** P&L scope only. Cash, aging and position remain book-wide. */
  segmentCode?: string;
  /** Inject a clock for close/future-period validation. Defaults to current time. */
  now?: string | Date;
  /** Supply when the selected revision depends on a superseded prior revision. */
  stale?: boolean;
}

export interface FinanceIssue {
  code: string;
  message: string;
  lineCode?: string;
  segmentCode?: string;
  accountCode?: string;
}

export interface FinanceCompleteness {
  expected: number;
  entered: number;
  notApplicable: number;
  missing: FinanceExpectedInput[];
  complete: boolean;
}

export interface FinanceMeasure {
  value: number | null;
  complete: boolean;
}

export interface FinanceReport {
  period: string;
  kind: FinanceVersionKind;
  metrics: Record<string, number | null>;
  lineValues: Record<string, number | null>;
  completeness: FinanceCompleteness;
  issues: FinanceIssue[];
  reconciled: boolean;
  stale: boolean;
  canClose: boolean;
  sourceState?: FinanceSnapshot["state"];
  segmentCode?: string;
  /** Pins how raw line values aggregate; never infer stocks from displayed labels. */
  lineAggregation?: Record<string, "flow" | "stock">;
  periods?: string[];
}

export interface FinanceValidationResult {
  valid: boolean;
  issues: FinanceIssue[];
  report: FinanceReport;
}

export interface FinanceCsvRow extends FinanceFact {
  period: string;
  currency: string;
}

export interface FinanceCsvOptions {
  currency: string;
  precision: number;
  lines: readonly FinanceLine[];
  expectedInputs: readonly FinanceExpectedInput[];
  fiscalYear?: number;
  fiscalStartMonth?: number;
  kind?: FinanceVersionKind;
  timezone?: string;
  now?: string | Date;
}

export class FinanceValidationError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "FinanceValidationError";
    this.code = code;
    this.status = status;
  }
}

const input = (code: string, basis: FinanceBasis, group: string, labelEn: string, labelVi: string, options: Partial<FinanceLine> = {}): FinanceLine => ({
  code, basis, group, labelEn, labelVi, kind: "input", sign: 1, required: true,
  allowNa: basis === "pnl", aggregation: ["position", "aging"].includes(basis) ? "stock" : "flow", costBehavior: "unspecified", ...options,
});
const output = (code: string, basis: FinanceBasis, labelEn: string, labelVi: string): FinanceLine => ({
  ...input(code, basis, "derived", labelEn, labelVi), kind: "derived", required: false, allowNa: false,
});

/** Definition seeds only. No financial amounts or company assertions are seeded. */
export const DEFAULT_FINANCE_LINES: readonly FinanceLine[] = [
  input("pnl.projects", "pnl", "revenue", "Project revenue", "Doanh thu dự án"),
  input("pnl.maintenance", "pnl", "revenue", "Maintenance and retainers", "Bảo trì và hợp đồng định kỳ"),
  input("pnl.subscriptions", "pnl", "revenue", "Subscription revenue", "Doanh thu thuê bao"),
  input("pnl.products", "pnl", "revenue", "Product revenue", "Doanh thu sản phẩm"),
  input("pnl.other_revenue", "pnl", "revenue", "Other revenue", "Doanh thu khác", { requireNote: true }),
  input("pnl.discounts", "pnl", "revenue", "Discounts and revenue refunds", "Giảm giá và hoàn doanh thu", { sign: -1 }),
  input("pnl.delivery_payroll", "pnl", "direct_cost", "Delivery payroll", "Lương triển khai"),
  input("pnl.subcontractors", "pnl", "direct_cost", "Subcontractors", "Nhà thầu phụ"),
  input("pnl.direct_hosting", "pnl", "direct_cost", "Direct hosting and AI usage", "Hosting và AI trực tiếp"),
  input("pnl.goods", "pnl", "direct_cost", "Goods and fulfillment", "Hàng hóa và bàn giao"),
  input("pnl.payment_fees", "pnl", "direct_cost", "Payment fees", "Phí thanh toán"),
  input("pnl.other_direct_cost", "pnl", "direct_cost", "Other direct cost", "Chi phí trực tiếp khác", { requireNote: true }),
  input("pnl.shared_payroll", "pnl", "operating_expense", "Shared payroll", "Lương dùng chung"),
  input("pnl.marketing", "pnl", "operating_expense", "Sales and marketing", "Bán hàng và marketing"),
  input("pnl.software", "pnl", "operating_expense", "Shared software and cloud", "Phần mềm và cloud dùng chung"),
  input("pnl.rent", "pnl", "operating_expense", "Rent and utilities", "Văn phòng và tiện ích"),
  input("pnl.professional_fees", "pnl", "operating_expense", "Professional services", "Dịch vụ chuyên môn"),
  input("pnl.travel", "pnl", "operating_expense", "Travel and training", "Đi lại và đào tạo"),
  input("pnl.depreciation", "pnl", "operating_expense", "Depreciation and amortization", "Khấu hao và phân bổ"),
  input("pnl.bad_debt", "pnl", "operating_expense", "Bad debt expense", "Chi phí tổn thất công nợ"),
  input("pnl.other_operating_expense", "pnl", "operating_expense", "Other operating expense", "Chi phí hoạt động khác", { requireNote: true }),
  input("pnl.other_operating_income", "pnl", "other_operating_income", "Other operating income", "Thu nhập hoạt động khác"),
  input("pnl.finance_income", "pnl", "finance_income", "Finance income", "Thu nhập tài chính"),
  input("pnl.finance_cost", "pnl", "finance_cost", "Finance costs", "Chi phí tài chính"),
  input("pnl.income_tax", "pnl", "income_tax", "Income tax expense", "Chi phí thuế thu nhập"),
  input("cash.customer_receipts", "cash", "operating", "Customer collections", "Thu tiền khách hàng"),
  input("cash.other_operating_receipts", "cash", "operating", "Other operating receipts", "Thu hoạt động khác", { requireNote: true }),
  input("cash.supplier_payments", "cash", "operating", "Supplier payments", "Chi nhà cung cấp", { sign: -1 }),
  input("cash.payroll_payments", "cash", "operating", "Payroll payments", "Chi lương", { sign: -1 }),
  input("cash.operating_payments", "cash", "operating", "Operating expense payments", "Chi hoạt động", { sign: -1 }),
  input("cash.tax_payments", "cash", "operating", "Tax payments", "Tiền nộp thuế", { sign: -1 }),
  input("cash.interest_payments", "cash", "operating", "Interest payments", "Tiền trả lãi", { sign: -1 }),
  input("cash.asset_sales", "cash", "investing", "Asset sale receipts", "Thu bán tài sản"),
  input("cash.asset_purchases", "cash", "investing", "Asset purchases", "Mua tài sản", { sign: -1 }),
  input("cash.other_investing_receipts", "cash", "investing", "Other investing receipts", "Thu đầu tư khác", { requireNote: true }),
  input("cash.other_investing_payments", "cash", "investing", "Other investing payments", "Chi đầu tư khác", { sign: -1, requireNote: true }),
  input("cash.owner_contributions", "cash", "financing", "Cash owner contributions", "Góp vốn bằng tiền"),
  input("cash.owner_distributions", "cash", "financing", "Cash owner distributions", "Phân phối vốn/lợi nhuận bằng tiền", { sign: -1 }),
  input("cash.loan_draws", "cash", "financing", "Loan and overdraft draws", "Nhận vay và thấu chi"),
  input("cash.loan_repayments", "cash", "financing", "Loan principal repayments", "Trả gốc vay", { sign: -1 }),
  output("position.cash", "position", "Observed closing cash", "Tiền cuối kỳ quan sát"),
  input("position.ar_gross", "position", "asset", "Gross trade receivables", "Phải thu thương mại gộp", { nonnegative: true }),
  input("position.ar_allowance", "position", "asset", "Receivables allowance", "Dự phòng phải thu", { sign: -1, nonnegative: true }),
  output("position.ar_net", "position", "Net trade receivables", "Phải thu thương mại thuần"),
  input("position.prepayments", "position", "asset", "Prepayments and supplier advances", "Trả trước và ứng nhà cung cấp", { nonnegative: true }),
  input("position.inventory", "position", "asset", "Inventory", "Hàng tồn kho", { nonnegative: true }),
  input("position.fixed_assets", "position", "asset", "Net fixed assets", "Tài sản cố định thuần", { nonnegative: true }),
  input("position.other_assets", "position", "asset", "Other assets", "Tài sản khác", { requireNote: true }),
  input("position.ap", "position", "liability", "Trade payables", "Phải trả thương mại", { nonnegative: true }),
  input("position.payroll_payable", "position", "liability", "Payroll and accruals payable", "Lương và chi phí phải trả", { nonnegative: true }),
  input("position.tax_payable", "position", "liability", "Taxes payable", "Thuế phải nộp", { nonnegative: true }),
  input("position.deferred_revenue", "position", "liability", "Deferred revenue", "Doanh thu chưa thực hiện", { nonnegative: true }),
  input("position.debt", "position", "liability", "Loans and overdrafts", "Vay và thấu chi", { nonnegative: true }),
  input("position.other_liabilities", "position", "liability", "Other liabilities", "Nợ phải trả khác", { requireNote: true }),
  input("position.share_capital", "position", "equity", "Contributed capital", "Vốn góp"),
  input("position.retained_earnings", "position", "equity", "Accumulated earnings", "Lợi nhuận tích lũy"),
  input("position.current_earnings", "position", "equity", "Current fiscal-year earnings", "Lợi nhuận năm tài chính hiện tại"),
  input("position.other_equity", "position", "equity", "Other equity", "Vốn chủ khác", { requireNote: true }),
  ...(["ar", "ap"] as const).flatMap((side) => [
    ["current", "Not overdue", "Chưa quá hạn"], ["1_30", "1–30 days overdue", "Quá hạn 1–30 ngày"],
    ["31_60", "31–60 days overdue", "Quá hạn 31–60 ngày"], ["61_90", "61–90 days overdue", "Quá hạn 61–90 ngày"],
    ["over_90", "Over 90 days overdue", "Quá hạn trên 90 ngày"],
  ].map(([suffix, en, vi]) => input(`aging.${side}_${suffix}`, "aging", side, `${side.toUpperCase()}: ${en}`, `${side === "ar" ? "Phải thu" : "Phải trả"}: ${vi}`, { nonnegative: true }))),
  input("aging.ar_control", "control", "ar_control", "Gross AR source control", "Tổng kiểm soát phải thu gộp", { aggregation: "stock", nonnegative: true }),
  input("aging.ap_control", "control", "ap_control", "AP source control", "Tổng kiểm soát phải trả", { aggregation: "stock", nonnegative: true }),
  input("cash.opening", "control", "opening_cash", "Opening cash", "Tiền đầu kỳ", { aggregation: "stock" }),
  input("equity.opening", "control", "opening_equity", "Opening equity", "Vốn chủ đầu kỳ", { aggregation: "stock" }),
  input("equity.noncash_contributions", "control", "noncash_contribution", "Noncash owner contributions", "Góp vốn phi tiền tệ", { nonnegative: true }),
  input("equity.noncash_distributions", "control", "noncash_distribution", "Noncash owner distributions", "Phân phối phi tiền tệ", { nonnegative: true }),
  input("equity.other_movements", "control", "other_equity_movement", "Other evidenced equity movements", "Biến động vốn khác có bằng chứng", { requireNote: true }),
  input("forecast.restricted_cash", "control", "restricted_cash", "Forecast restricted closing cash", "Tiền cuối kỳ dự báo bị hạn chế", { aggregation: "stock", nonnegative: true }),
];

export const FINANCE_METRIC_LABELS: Readonly<Record<string, readonly [string, string]>> = {
  revenue: ["Recognized revenue", "Doanh thu ghi nhận"], direct_costs: ["Direct costs", "Chi phí trực tiếp"],
  gross_profit: ["Gross profit", "Lợi nhuận gộp"], operating_expenses: ["Operating expenses", "Chi phí hoạt động"],
  operating_profit: ["Operating profit", "Lợi nhuận hoạt động"], profit_before_tax: ["Profit before tax", "Lợi nhuận trước thuế"],
  net_profit: ["Net profit", "Lợi nhuận sau thuế"], gross_margin: ["Gross margin", "Biên lợi nhuận gộp"],
  operating_margin: ["Operating margin", "Biên lợi nhuận hoạt động"], net_margin: ["Net margin", "Biên lợi nhuận sau thuế"],
  cash_opening: ["Opening cash", "Tiền đầu kỳ"], cash_operating: ["Operating cash flow", "Dòng tiền hoạt động"],
  cash_investing: ["Investing cash flow", "Dòng tiền đầu tư"], cash_financing: ["Financing cash flow", "Dòng tiền tài trợ"],
  cash_expected_closing: ["Expected closing cash", "Tiền cuối kỳ kỳ vọng"], cash_closing: ["Closing cash", "Tiền cuối kỳ"],
  cash_restricted: ["Restricted cash", "Tiền bị hạn chế"], cash_available: ["Unrestricted cash", "Tiền không bị hạn chế"],
  cash_reconciliation: ["Cash difference", "Chênh lệch tiền"], assets: ["Assets", "Tài sản"],
  liabilities: ["Liabilities", "Nợ phải trả"], equity: ["Equity", "Vốn chủ sở hữu"],
  ar_gross: ["Gross receivables", "Phải thu gộp"], ar_allowance: ["Receivables allowance", "Dự phòng phải thu"],
  ar_net: ["Net receivables", "Phải thu thuần"], ap: ["Trade payables", "Phải trả thương mại"],
  ar_aging_total: ["AR aging total", "Tổng tuổi nợ phải thu"], ap_aging_total: ["AP aging total", "Tổng tuổi nợ phải trả"],
  position_reconciliation: ["Assets less liabilities and equity", "Tài sản trừ nợ và vốn"],
  equity_reconciliation: ["Equity movement difference", "Chênh lệch biến động vốn"],
};
