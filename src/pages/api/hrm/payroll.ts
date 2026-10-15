import type { APIRoute } from "astro";
import { envFromLocals } from "../../../lib/ats";
import { HrmError, revision, text } from "../../../lib/hrm/fields";
import {
  activatePayrollPolicy, approvePayrollRun, closePayrollRun, confirmPayrollPayment,
  createPayrollDispute, createPayrollPolicy, createPayrollRun, calculatePayrollRun,
  publishPayrollRun, reviewPayrollPolicy, reviewPayrollRun, setPayrollLine,
  transitionPayrollDispute, type PayrollSourceKind, PAYROLL_SOURCE_KINDS,
} from "../../../lib/hrm/payroll";
import { sameOrigin } from "../../../lib/http";

export const prerender = false;
const MAX_FORM_BYTES = 64 * 1024;

async function formBody(request: Request): Promise<FormData> {
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded") throw new HrmError("invalid_form", 415);
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_FORM_BYTES)) throw new HrmError("request_too_large", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new HrmError("invalid_form", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FORM_BYTES) { await reader.cancel().catch(() => {}); throw new HrmError("request_too_large", 413); }
      chunks.push(value);
    }
  } catch (error) { if (error instanceof HrmError) throw error; throw new HrmError("invalid_form", 400); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return await new Request(request.url, { method: "POST", headers: request.headers, body: bytes }).formData(); }
  catch { throw new HrmError("invalid_form", 400); }
}

function returnTarget(request: Request, value: string): URL {
  const target = new URL(value, request.url), path = target.pathname.startsWith("/vi/") ? target.pathname.slice(3) : target.pathname;
  if (target.origin !== new URL(request.url).origin || !new Set(["/hrm/payroll", "/hrm/me/payslips"]).has(path)) throw new HrmError("invalid_return", 400);
  return target;
}
function redirect(target: URL, values: Record<string, string>): Response {
  for (const [key, value] of Object.entries(values)) target.searchParams.set(key, value);
  return new Response(null, { status: 303, headers: { Location: target.pathname + target.search, "Cache-Control": "private, no-store" } });
}

export const POST: APIRoute = async context => {
  const user = context.locals.workspace;
  if (!user) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "private, no-store" } });
  if (!sameOrigin(context.request)) return new Response("Invalid origin", { status: 400, headers: { "Cache-Control": "private, no-store" } });
  let target: URL | undefined;
  try {
    const form = await formBody(context.request);
    target = returnTarget(context.request, text(form, "return_to", 400, true));
    const env = envFromLocals(context.locals), key = text(form, "request_key", 100, true), intent = text(form, "intent", 40, true);
    if (intent === "create_policy") await createPayrollPolicy(env.DB, user, key, {
      policy_key: text(form, "policy_key", 60, true), title_en: text(form, "title_en", 100, true), title_vi: text(form, "title_vi", 100, true),
      legal_entity: text(form, "legal_entity", 200, true), currency: text(form, "currency", 3, true), minor_unit_scale: Number(text(form, "minor_unit_scale", 1, true)),
      components_json: text(form, "components_json", 48000, true),
    });
    else if (intent === "review_policy") {
      const decision = text(form, "decision", 10, true);
      if (decision !== "approve" && decision !== "reject") throw new HrmError("invalid_decision");
      await reviewPayrollPolicy(env.DB, user, key, text(form, "policy_id", 100, true), revision(form), decision === "approve", text(form, "reason", 500, true));
    } else if (intent === "activate_policy") await activatePayrollPolicy(env.DB, user, key, text(form, "policy_id", 100, true), revision(form));
    else if (intent === "create_run") await createPayrollRun(env.DB, user, key, text(form, "policy_version_id", 100, true), text(form, "period_id", 100, true));
    else if (intent === "create_correction") await createPayrollRun(env.DB, user, key, text(form, "policy_version_id", 100, true), text(form, "period_id", 100, true), text(form, "payslip_id", 100, true), text(form, "reason", 500, true));
    else if (intent === "set_line") {
      const sourceKind = text(form, "source_kind", 40, true);
      if (!(PAYROLL_SOURCE_KINDS as readonly string[]).includes(sourceKind)) throw new HrmError("payroll_component_invalid");
      await setPayrollLine(env.DB, user, key, {
        runId: text(form, "run_id", 100, true), personId: text(form, "person_id", 100, true), expectedVersion: revision(form),
        componentCode: text(form, "component_code", 40, true), amountMinor: text(form, "amount_minor", 16, true), sourceKind: sourceKind as PayrollSourceKind,
        sourceReference: text(form, "source_reference", 200, true), zeroReason: text(form, "zero_reason", 300),
      });
    } else if (intent === "calculate_run") await calculatePayrollRun(env.DB, user, key, text(form, "run_id", 100, true), revision(form));
    else if (intent === "review_run") await reviewPayrollRun(env.DB, user, key, text(form, "run_id", 100, true), revision(form), text(form, "reason", 500, true));
    else if (intent === "approve_run") await approvePayrollRun(env.DB, user, key, text(form, "run_id", 100, true), revision(form), text(form, "reason", 500, true));
    else if (intent === "publish_run") await publishPayrollRun(env.DB, user, key, text(form, "run_id", 100, true), revision(form));
    else if (intent === "close_run") await closePayrollRun(env.DB, user, key, text(form, "run_id", 100, true), revision(form), text(form, "reason", 500, true));
    else if (intent === "confirm_payment") await confirmPayrollPayment(env.DB, user, key, {
      payslipId: text(form, "payslip_id", 100, true), amountMinor: text(form, "amount_minor", 16, true), paidOn: text(form, "paid_on", 10, true),
      paymentReference: text(form, "payment_reference", 200, true), evidenceReference: text(form, "evidence_reference", 200, true),
    });
    else if (intent === "create_dispute") await createPayrollDispute(env.DB, user, key, text(form, "payslip_id", 100, true), text(form, "component_code", 40), text(form, "body", 2000, true));
    else if (intent === "transition_dispute") {
      const nextState = text(form, "next_state", 20, true);
      if (!("investigating answered resolved reopened".split(" ").includes(nextState))) throw new HrmError("payroll_dispute_transition_invalid");
      await transitionPayrollDispute(env.DB, user, key, text(form, "dispute_id", 100, true), revision(form), nextState as "investigating" | "answered" | "resolved" | "reopened", text(form, "body", 2000, true));
    } else throw new HrmError("invalid_action", 400);
    return redirect(target, { saved: intent });
  } catch (error) {
    if (!target) {
      try {
        const referer = context.request.headers.get("referer"), source = new URL(referer ?? (context.url.pathname.startsWith("/vi/") ? "/vi/hrm/payroll" : "/hrm/payroll"), context.request.url);
        target = returnTarget(context.request, source.pathname + source.search);
      } catch { target = new URL(context.url.pathname.startsWith("/vi/") ? "/vi/hrm/payroll" : "/hrm/payroll", context.request.url); }
    }
    return redirect(target, { error: error instanceof HrmError ? error.message : "internal_error" });
  }
};
