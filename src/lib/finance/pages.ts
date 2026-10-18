import type { AstroGlobal } from "astro";
import type { FinancePageData, FinancePageKey } from "../../components/finance/types";
import { envFromLocals } from "../ats";
import { FinanceValidationError } from "./model";
import { allocateAnnual, fiscalPeriods } from "./calculations";
import { financeFailure, financePrivate, financeSameOrigin, financeSession } from "./access";
import { financeFormCommand, financeReturnTo, financeSelection, financeSpread, financeText, readFinanceForm, type FinanceFields } from "./http";
import { financeReportView, type FinanceRange } from "./reports";
import { executeFinanceCommand, FinanceError, loadFinance, type FinanceCommand, type FinanceReceipt, type FinanceSelection } from "./store";

export function financeErrorCode(error: unknown): string {
  return error instanceof FinanceError || error instanceof FinanceValidationError ? error.code : "unavailable";
}
export function financeErrorStatus(error: unknown): number {
  return error instanceof FinanceError || error instanceof FinanceValidationError ? error.status : 503;
}

export function financeCommandRedirect(command: FinanceCommand, receipt: FinanceReceipt, returnTo: string, origin: string): Response {
  const target = new URL(returnTo, origin);
  target.searchParams.delete("error");
  target.searchParams.set("saved", command.action);
  if (command.action === "plan.create") {
    target.searchParams.set("plan", receipt.targetId); target.searchParams.set("year", String(command.fiscal_year));
    target.searchParams.delete("period");
  }
  if (["actual.open", "actual.save", "actual.close", "actual.reopen"].includes(command.action)) {
    target.searchParams.set("revision", receipt.targetId);
    if (receipt.period) target.searchParams.set("period", receipt.period);
  }
  if (command.action === "import.preview") target.searchParams.set("import", receipt.targetId);
  return financePrivate(new Response(null, { status: 303, headers: { Location: target.pathname + target.search } }));
}

export async function financePage(astro: AstroGlobal, lang: "en" | "vi", page: FinancePageKey): Promise<Response | FinancePageData> {
  const user = financeSession(astro.locals), vi = lang === "vi";
  if (!user) return financeFailure(403, "forbidden", vi);
  if (!user.financeEnabled && page !== "settings") return financeFailure(503, "unavailable", vi);
  if (!["GET", "HEAD", "POST"].includes(astro.request.method)) return financePrivate(new Response("Method not allowed.", { status: 405 }));
  const { DB } = envFromLocals(astro.locals);
  let selection: FinanceSelection;
  try { selection = { ...financeSelection(astro.url), includeAudit: page === "audit", includeImports: page === "plans" || page === "actuals" }; }
  catch (error) { return financePrivate(new Response(vi ? "Bộ lọc không hợp lệ." : "Invalid report filters.", { status: financeErrorStatus(error) })); }
  let state;
  try { state = await loadFinance(DB, user, selection); }
  catch (error) { return financeFailure(financeErrorStatus(error), "unavailable", vi); }
  let error: string | undefined, submitted: FinanceFields | undefined, spreadPreview: FinancePageData["spreadPreview"], copyPreview: FinancePageData["copyPreview"];
  if (astro.request.method === "POST") {
    if (!financeSameOrigin(astro.request)) return financePrivate(new Response(vi ? "Nguồn yêu cầu không hợp lệ." : "Invalid request origin.", { status: 403 }));
    try {
      submitted = await readFinanceForm(astro.locals.financeFormRequest ?? astro.request as unknown as Request);
      const returnTo = financeReturnTo(submitted.return_to, astro.url);
      if (submitted.intent === "plan.preview") {
        const plan = state.plans.find(item => item.id === submitted!.plan_id);
        if (!user.financeEnabled || !plan || plan.state !== "draft" || plan.kind === "forecast") throw new FinanceValidationError("invalid_plan_preview", "Choose an editable annual budget or scenario.", 422);
        if (Number(submitted.expected_version) !== plan.version) throw new FinanceValidationError("version_conflict", "The plan changed. Reload before preparing another preview.", 409);
        const spread = financeSpread(submitted, state.book!.precision);
        const periods = fiscalPeriods(plan.fiscalYear, state.book!.fiscalStartMonth);
        const definition = state.definitions.find(item => item.id === plan.definitionSetId);
        const line = definition?.lines.find(item => item.code === spread.lineCode);
        if (!line || line.kind !== "input" || line.aggregation !== "flow" || !["pnl", "cash"].includes(line.basis) || periods.some(period => !definition!.expectedInputs.some(item => item.period === period && item.lineCode === spread.lineCode && item.segmentCode === spread.segmentCode && (!item.kinds || item.kinds.includes(plan.kind))))) throw new FinanceValidationError("invalid_split_coordinate", "Choose a flow input that applies in all twelve plan months.", 422);
        spreadPreview = { ...spread, periods, amounts: allocateAnnual(spread.annualAmount, spread.weights) };
      } else if (submitted.intent === "plan.copy.preview") {
        const plan = state.plans.find(item => item.id === submitted!.plan_id);
        if (!user.financeEnabled || !plan || plan.state !== "draft") throw new FinanceValidationError("invalid_plan_preview", "Choose an editable plan.", 422);
        if (Number(submitted.expected_version) !== plan.version) throw new FinanceValidationError("version_conflict", "The plan changed. Reload before another preview.", 409);
        const fromPeriod = financeText(submitted, "copy_from_period", 7, true), toPeriod = financeText(submitted, "period", 7, true);
        const months = fiscalPeriods(plan.fiscalYear, state.book!.fiscalStartMonth), definition = state.definitions.find(item => item.id === plan.definitionSetId);
        if (!definition || !months.includes(fromPeriod) || !months.includes(toPeriod) || (plan.actualCutoff && toPeriod <= plan.actualCutoff)) throw new FinanceValidationError("invalid_copy_period", "Choose writable months in the same plan.", 422);
        const coordinates = new Set(definition.expectedInputs.filter(item => item.period === toPeriod && (!item.kinds || item.kinds.includes(plan.kind))).map(item => `${item.lineCode}|${item.segmentCode}`));
        const actualSource = plan.sourceActuals[fromPeriod];
        if (plan.actualCutoff && fromPeriod <= plan.actualCutoff && !actualSource) throw new FinanceValidationError("copy_source_empty", "The pinned source actuals are unavailable.", 422);
        const sourceValues = actualSource ? state.actualValues.filter(item => item.actualRevisionId === actualSource) : state.planValues.filter(item => item.planId === plan.id && item.period === fromPeriod);
        const values = sourceValues.filter(item => coordinates.has(`${item.lineCode}|${item.segmentCode}`));
        if (!values.length) throw new FinanceValidationError("copy_source_empty", "The selected source month has no applicable inputs.", 422);
        copyPreview = { fromPeriod, toPeriod, values };
      } else {
        const command = financeFormCommand(submitted, state);
        const key = financeText(submitted, "request_key", 100, true);
        const receipt = await executeFinanceCommand(DB, user, key, command);
        return financeCommandRedirect(command, receipt, returnTo, astro.url.origin);
      }
    } catch (caught) {
      error = financeErrorCode(caught); astro.response.status = financeErrorStatus(caught);
    }
  }
  if (page === "plans" && !selection.planId && state.plans.length) selection.planId = state.plans.find(plan => plan.baseline)?.id ?? state.plans[0].id;
  const rawRange = astro.url.searchParams.get("range") ?? "month";
  if (!["month", "quarter", "ytd", "year"].includes(rawRange)) return financePrivate(new Response(vi ? "Khoảng báo cáo không hợp lệ." : "Invalid reporting range.", { status: 422 }));
  const segmentCode = ["overview", "pnl", "revenue", "costs"].includes(page) ? astro.url.searchParams.get("segment") ?? "all" : "all";
  try {
    const view = financeReportView(state, selection, { lang, editor: page === "actuals", range: rawRange as FinanceRange, segmentCode });
    return { page, lang, user, state, ...view, generatedAt: new Date().toISOString(), saved: astro.url.searchParams.get("saved") ?? undefined, error, submitted, spreadPreview, copyPreview };
  } catch (caught) {
    return financePrivate(new Response(vi ? "Không thể lập báo cáo với bộ lọc này. Hãy kiểm tra kỳ và phiên bản." : "The selected period and versions cannot form this report. Check your filters.", { status: financeErrorStatus(caught) }));
  }
}
