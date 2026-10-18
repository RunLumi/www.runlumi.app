import type { APIContext } from "astro";
import { envFromLocals } from "../ats";
import { financeFailure, financePrivate, financeSameOrigin, financeSession } from "./access";
import { defaultExpectedInputs } from "./calculations";
import { financeCsvTemplate } from "./csv";
import { financeReportCsv } from "./exports";
import { FINANCE_PAGE_KEYS, financeFormCommand, financeInteger, financeJson, financeJsonCommand, financeReturnTo, financeSelection, financeText, readFinanceForm, readFinanceText, type FinanceFields } from "./http";
import { FinanceValidationError } from "./model";
import { financeCommandRedirect, financeErrorCode, financeErrorStatus } from "./pages";
import { financeReportView } from "./reports";
import { executeFinanceCommand, loadFinance, type FinanceCommand, type FinanceSelection } from "./store";

function exportCommand(fields: FinanceFields): FinanceCommand {
  const allowed = new Set(["intent", "request_key", "return_to", "report", "period", "fiscal_year", "plan_id", "actual_revision_id", "range", "segment_code", "lang"]);
  if (Object.keys(fields).some(key => !allowed.has(key)) || fields.intent !== "report.export") throw new FinanceValidationError("invalid_export", "Invalid export fields.", 422);
  const url = new URL("https://finance.invalid/");
  for (const [name, value] of Object.entries({ year: fields.fiscal_year, period: fields.period, plan: fields.plan_id, revision: fields.actual_revision_id, range: fields.range })) if (value) url.searchParams.set(name, value);
  return { action: "report.export", selection: financeSelection(url), report: financeText(fields, "report", 30, true), segment_code: financeText(fields, "segment_code", 64) || "all" };
}

function csvResponse(csv: string, filename: string): Response {
  return financePrivate(new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` } }));
}

export async function financeApi(context: APIContext): Promise<Response> {
  if (context.request.headers.has("Authorization")) return financeFailure(401, "unauthorized", context.url.searchParams.get("lang") === "vi");
  const user = financeSession(context.locals), vi = context.url.searchParams.get("lang") === "vi";
  if (!user) return financeFailure(403, "forbidden", vi);
  const path = (context.params.path ?? "").replace(/\/$/, ""), method = context.request.method;
  const { DB } = envFromLocals(context.locals);
  try {
    if (method === "GET" || method === "HEAD") {
      if (!["", "overview", "plans", "actuals", "settings", "audit", "imports", "reports", "template"].includes(path) && !/^reports\/(pnl|cash-flow|revenue|costs|working-capital|position)$/.test(path)) return financeJson({ error: "not_found" }, 404);
      if (!user.financeEnabled && path !== "settings") return financeJson({ error: "finance_not_ready" }, 503);
      const selection = { ...financeSelection(context.url), includeAudit: path === "audit", includeImports: path === "imports" };
      const state = await loadFinance(DB, user, selection);
      if (path === "settings") return financeJson({ book: state.book, definitions: state.definitions, lines: state.lines, segments: state.segments, accounts: state.accounts, ready: user.financeEnabled === true });
      if (path === "audit") return financeJson({ events: state.audit, next: state.audit.length === 100 ? `${state.audit.at(-1)!.createdAt}|${state.audit.at(-1)!.id}` : null });
      if (!user.financeEnabled || !state.book?.enabled) return financeJson({ error: "finance_not_ready" }, 503);
      if (path === "template") {
        const kind = context.url.searchParams.get("kind");
        if (kind !== "plan" && kind !== "actual") throw new FinanceValidationError("invalid_import_kind", "Choose a plan or actual import template.", 422);
        const plan = kind === "plan" ? state.plans.find(item => item.id === selection.planId) : undefined;
        if (kind === "plan" && (!plan || plan.state !== "draft")) throw new FinanceValidationError("editable_plan_required", "Choose a draft plan before downloading its template.", 422);
        const definition = state.definitions.find(item => item.id === plan?.definitionSetId) ?? state.definitions.find(item => item.fiscalYear === state.selectedFiscalYear);
        const expected = (definition?.expectedInputs ?? defaultExpectedInputs(state.selectedFiscalYear, state.book.fiscalStartMonth, state.lines, { firstPeriod: state.book.firstPeriod }))
          .filter(item => (!selection.period || item.period === selection.period) && (kind === "plan" || item.period >= state.book!.firstPeriod) && (!plan?.actualCutoff || item.period > plan.actualCutoff));
        if (!expected.length) throw new FinanceValidationError("empty_template", "No writable input coordinates exist in this period.", 422);
        return csvResponse(financeCsvTemplate(expected, state.book.currency, plan?.kind ?? "actual"), `lumi-finance-${kind}-template-${state.selectedFiscalYear}.csv`);
      }
      if (path === "plans") return financeJson({ plans: state.plans, values: state.planValues, definitions: state.definitions, periods: state.periods });
      if (path === "actuals") return financeJson({ revisions: state.actualRevisions, values: state.actualValues, observations: state.observations, periods: state.periods, definitions: state.definitions, accounts: state.accounts });
      if (path === "imports") return financeJson({ imports: state.imports });
      const segmentCode = context.url.searchParams.get("segment") ?? "all";
      const report = financeReportView(state, selection, { range: selection.range, segmentCode });
      return financeJson({ book: state.book, ...report });
    }
    if (method !== "POST") return financeJson({ error: "method_not_allowed" }, 405);
    if (!["commands", "exports"].includes(path)) return financeJson({ error: "not_found" }, 404);
    if (!financeSameOrigin(context.request)) return financeJson({ error: "invalid_origin" }, 403);
    const contentType = context.request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
    let command: FinanceCommand, requestKey: string, fields: FinanceFields | undefined;
    if (contentType === "application/json") {
      let body: unknown;
      try { body = JSON.parse(await readFinanceText(context.request)); }
      catch (error) { if (error instanceof FinanceValidationError) throw error; throw new FinanceValidationError("invalid_json", "Invalid JSON.", 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new FinanceValidationError("invalid_request", "Expected a command envelope.", 400);
      const envelope = body as Record<string, unknown>;
      if (Object.keys(envelope).some(key => !["request_key", "command"].includes(key)) || typeof envelope.request_key !== "string") throw new FinanceValidationError("invalid_request", "Expected request_key and command.", 400);
      requestKey = envelope.request_key; command = financeJsonCommand(envelope.command);
    } else {
      fields = await readFinanceForm(context.locals.financeFormRequest ?? context.request);
      requestKey = financeText(fields, "request_key", 100, true);
      if (path === "exports") command = exportCommand(fields);
      else {
        const selection: FinanceSelection = {};
        if (fields.fiscal_year) selection.fiscalYear = financeInteger(fields.fiscal_year);
        if (fields.period) selection.period = fields.period;
        if (fields.plan_id) selection.planId = fields.plan_id;
        const state = await loadFinance(DB, user, selection);
        command = financeFormCommand(fields, state);
      }
    }
    if (path === "exports" && command.action !== "report.export") throw new FinanceValidationError("invalid_export", "Expected report.export.", 422);
    if (command.action === "report.export" && !FINANCE_PAGE_KEYS.includes(command.report as typeof FINANCE_PAGE_KEYS[number])) throw new FinanceValidationError("invalid_export_report", "Unknown report.", 422);
    // Validate return navigation before committing any native form mutation.
    const returnTo = fields && path === "commands" ? financeReturnTo(fields.return_to, context.url) : undefined;
    const receipt = await executeFinanceCommand(DB, user, requestKey, command);
    if (path === "exports") {
      const { csv, filename } = financeReportCsv(receipt);
      return csvResponse(csv, filename);
    }
    if (returnTo) return financeCommandRedirect(command, receipt, returnTo, context.url.origin);
    return financeJson({ receipt });
  } catch (error) {
    const code = financeErrorCode(error), status = financeErrorStatus(error);
    const message = code === "export_too_large"
      ? vi ? "Bản xuất vượt giới hạn dữ liệu của một bản chụp năm. Hãy chọn phiên bản ít dữ liệu hơn hoặc nhờ quản trị viên hỗ trợ xuất theo phần; không xóa bằng chứng lịch sử." : "The yearly source snapshot exceeds the export limit. Choose a smaller version or ask an administrator to arrange a partitioned export; keep historical evidence intact."
      : vi ? "Không thể hoàn tất yêu cầu. Kiểm tra dữ liệu, trạng thái tháng và phiên bản rồi thử lại." : "The request could not be completed. Check the inputs, period state and version before trying again.";
    return financeJson({ error: code, message }, status);
  }
}
