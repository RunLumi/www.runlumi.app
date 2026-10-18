import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../lib/ats";
import { HrmError } from "../../../../lib/hrm/fields";
import { getPayrollSlip, payrollSlipLanguage, renderPayrollSlipHtml } from "../../../../lib/hrm/payroll";

export const prerender = false;
export const GET: APIRoute = async context => {
  const user = context.locals.workspace, vi = context.url.searchParams.get("lang") === "vi";
  if (!user) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "private, no-store" } });
  try {
    const env = envFromLocals(context.locals), slip = await getPayrollSlip(env.DB, user, context.params.id ?? ""), snapshot = JSON.parse(slip.snapshot_json) as { period_key: string; employee_code: string };
    const language = payrollSlipLanguage(context.url.searchParams.get("lang"));
    const safeName = `${snapshot.period_key}-${snapshot.employee_code}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
    // Download bytes bypass CMS page transforms and keep the issued copy free of editor UI.
    return new Response(renderPayrollSlipHtml(slip.snapshot_json, language), { status: 200, headers: {
      "Content-Type": "application/octet-stream", "Content-Language": language, "Content-Disposition": `attachment; filename="payslip-${safeName}.html"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    } });
  } catch (error) {
    const issue = error instanceof HrmError ? error : new HrmError("internal_error", 500);
    return new Response(issue.status === 404 ? (vi ? "Không tìm thấy" : "Not found") : (vi ? "Không thể tải phiếu lương" : "Payslip unavailable"), { status: issue.status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Language": vi ? "vi" : "en" } });
  }
};
