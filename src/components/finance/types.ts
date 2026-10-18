import type { WorkspaceUser } from "../../lib/workspace/roles";
import type { FinanceFact, FinanceReport } from "../../lib/finance/model";
import type { FinanceReceipt, FinanceState } from "../../lib/finance/store-types";

export type FinancePageKey = "overview" | "plans" | "actuals" | "pnl" | "cash-flow" | "revenue" | "costs" | "working-capital" | "position" | "settings" | "audit";
export interface FinancePageData {
  page: FinancePageKey;
  lang: "en" | "vi";
  user: WorkspaceUser;
  state: FinanceState;
  period: string;
  currentPeriod: string;
  fiscalYear: number;
  months: string[];
  generatedAt: string;
  selectedPlanId?: string;
  selectedActualRevisionId?: string;
  report?: FinanceReport;
  planReport?: FinanceReport;
  reports?: FinanceReport[];
  planReports?: FinanceReport[];
  aggregateReport?: FinanceReport;
  aggregatePlanReport?: FinanceReport;
  comparisonPeriods?: string[];
  comparisonLabel?: string;
  range?: "month" | "quarter" | "ytd" | "year";
  segmentCode?: string;
  saved?: string;
  error?: string;
  submitted?: Record<string, string>;
  receipt?: FinanceReceipt;
  spreadPreview?: { lineCode: string; segmentCode: string; periods: string[]; amounts: number[]; annualAmount: number; weights?: (number | string)[] };
  copyPreview?: { fromPeriod: string; toPeriod: string; values: FinanceFact[] };
}
