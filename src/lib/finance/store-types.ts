import type { FinanceBook, FinanceCashAccount, FinanceCashObservation, FinanceExpectedInput, FinanceFact, FinanceLine, FinanceSnapshot, FinanceVersionKind } from "./model";

/** Public service contract. Amounts here are validated integer minor units. HTTP serializes money as strings. */
export interface FinanceBookState extends FinanceBook {
  version: number; enabled: boolean; policyNote: string; createdAt: string; updatedAt: string;
  varianceAmountThreshold: number | null; variancePercentThresholdBps: number | null;
}
export interface FinanceSegment { code: string; labelEn: string; labelVi: string; activeFrom: string; activeTo: string | null }
export interface FinanceDefinitionSet {
  id: string; fiscalYear: number; state: "draft" | "published"; version: number;
  calculationVersion: string; lines: FinanceLine[]; expectedInputs: FinanceExpectedInput[]; segments: FinanceSegment[];
  createdAt: string; publishedAt: string | null;
}
export interface FinanceAccount extends FinanceCashAccount { id: string; version: number; activeTo: string | null }
export interface FinancePeriod {
  period: string; version: number; definitionSetId: string;
  authoritativeClosedRevisionId: string | null; workingRevisionId: string | null;
}
export interface FinanceSourceContext {
  sourceAsOf: string;
  scope: string;
  blocks: Partial<Record<"pnl" | "cash" | "aging" | "position", { evidenceRef: string; note?: string }>>;
}
export interface FinanceFrozenContext {
  book: FinanceBookState; lines: FinanceLine[]; expectedInputs: FinanceExpectedInput[];
  segments: FinanceSegment[]; cashAccounts: FinanceCashAccount[]; calculationVersion: string;
  sources: FinanceSourceContext; capturedAt: string;
}
export interface FinancePlan {
  id: string; label: string; fiscalYear: number; kind: Exclude<FinanceVersionKind, "actual">;
  state: "draft" | "published"; version: number; definitionSetId: string; baseline: boolean;
  assumptions: string; sourcePlanId: string | null; actualCutoff: string | null;
  sourceActuals: Record<string, string>; reportingSnapshot: FinanceFrozenContext | null;
  createdAt: string; publishedAt: string | null; stale: boolean;
}
export interface FinancePlanValue extends FinanceFact { planId: string; period: string; sourceOperationId: string }
export interface FinanceActualRevision {
  id: string; period: string; version: number; state: "draft" | "closed"; definitionSetId: string;
  openingSourceRevisionId: string | null; supersedesRevisionId: string | null;
  sources: FinanceSourceContext; reportingSnapshot: FinanceFrozenContext | null;
  reason: string; createdAt: string; closedAt: string | null; stale: boolean;
}
export interface FinanceActualValue extends FinanceFact { actualRevisionId: string; sourceOperationId: string }
export interface FinanceObservation extends FinanceCashObservation { actualRevisionId: string; sourceOperationId: string }
export interface FinanceImportMonth {
  period: string; status: "pending" | "committed" | "discarded";
  expectedVersion: number; expectedPeriodVersion: number | null; actualRevisionId: string | null;
  values: FinanceFact[]; sources: FinanceSourceContext; fingerprint: string;
  receipt: FinanceReceipt | null;
}
export interface FinanceImportBatch {
  id: string; version: number; kind: "plan" | "actual"; planId: string | null; fiscalYear: number;
  definitionSetId: string; definitionVersion: number; bookVersion: number;
  status: "preview" | "partial" | "committed" | "discarded"; contentHash: string;
  months: FinanceImportMonth[]; createdAt: string; expiresAt: string;
}
export interface FinanceAuditEvent {
  id: string; action: string; actorId: string; actorName: string; targetId: string;
  period: string | null; operationId: string; detail: Record<string, unknown>; createdAt: string;
}
export interface FinanceSelection {
  fiscalYear?: number; period?: string; planId?: string; actualRevisionId?: string;
  range?: "month" | "quarter" | "ytd" | "year";
  includeAudit?: boolean; includeImports?: boolean; auditBefore?: string; auditAction?: string; auditActor?: string;
}
export interface FinanceState {
  book: FinanceBookState | null; definitions: FinanceDefinitionSet[]; lines: FinanceLine[];
  segments: FinanceSegment[]; accounts: FinanceAccount[]; periods: FinancePeriod[];
  plans: FinancePlan[]; planValues: FinancePlanValue[]; actualRevisions: FinanceActualRevision[];
  actualValues: FinanceActualValue[]; observations: FinanceObservation[];
  imports: FinanceImportBatch[]; audit: FinanceAuditEvent[]; selectedFiscalYear: number;
}
export interface FinanceReceipt {
  operationId: string; action: string; targetId: string; version: number;
  period?: string; replayed?: boolean; manifest?: Record<string, unknown>;
}
export interface FinanceBookInput {
  legal_entity: string; currency: string; precision: number; fiscal_start_month: number; timezone: string;
  first_period: string; cash_floor: number | null; policy_note: string; enabled: boolean;
  variance_amount_threshold?: number | null; variance_percent_threshold_bps?: number | null;
}
export type FinanceCommand =
  | ({ action: "book.save"; expected_version: number } & FinanceBookInput)
  | { action: "definition.save"; fiscal_year: number; expected_version: number; lines?: FinanceLine[]; segments?: FinanceSegment[]; expected_inputs?: FinanceExpectedInput[] }
  | { action: "account.save"; account_code: string; expected_version: number; label: string; active_from: string; active_to?: string | null }
  | { action: "plan.create"; fiscal_year: number; label: string; kind: "budget" | "forecast" | "scenario"; assumptions?: string; source_plan_id?: string; actual_cutoff?: string }
  | { action: "plan.save"; plan_id: string; expected_version: number; period?: string; values?: FinanceFact[]; label?: string; assumptions?: string; copy_from_period?: string; spread?: { lineCode: string; segmentCode: string; annualAmount: number; weights?: (string | number)[]; note: string; evidenceRef: string } }
  | { action: "plan.publish"; plan_id: string; expected_version: number; baseline?: boolean }
  | { action: "actual.open"; period: string; expected_period_version: number }
  | { action: "actual.save"; actual_revision_id: string; expected_version: number; expected_period_version: number; values?: FinanceFact[]; observations?: FinanceCashObservation[]; sources?: FinanceSourceContext }
  | { action: "actual.close"; actual_revision_id: string; expected_version: number; expected_period_version: number }
  | { action: "actual.reopen"; period: string; expected_period_version: number; reason: string }
  | { action: "import.preview"; kind: "plan" | "actual"; plan_id?: string; fiscal_year: number; csv: string; expected_versions: Record<string, { version: number; period_version?: number; actual_revision_id?: string }>; sources: Record<string, FinanceSourceContext> }
  | { action: "import.commit"; import_id: string; expected_version: number; period: string }
  | { action: "import.discard"; import_id: string; expected_version: number }
  | { action: "annotation.add"; baseline_id?: string; actual_revision_id?: string; period: string; line_code?: string; segment_code?: string; cause: string; next_action: string; review: string }
  | { action: "report.export"; selection: FinanceSelection; report: string; segment_code?: string };

export function revisionSnapshot(state: FinanceState, revision: FinanceActualRevision): FinanceSnapshot {
  return { period: revision.period, revisionId: revision.id, state: revision.state,
    openingSourceRevisionId: revision.openingSourceRevisionId, stale: revision.stale,
    values: state.actualValues.filter(value => value.actualRevisionId === revision.id),
    cashObservations: state.observations.filter(value => value.actualRevisionId === revision.id) };
}
