import type { APIRoute } from "astro";
import { envFromLocals, getApplications } from "../../../../lib/ats";
import { deskForbidden } from "../../../../lib/hiring/desk";
import { auditStatement } from "../../../../lib/workspace/members";
import { stepUpGuard } from "../../../../lib/workspace/step-up";

export const prerender = false;

function csv(value: unknown): string {
  const raw = String(value ?? "");
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
}

export const GET: APIRoute = async (context) => {
  const denied = deskForbidden(context.locals, "hiring.export");
  if (denied) return denied;
  const stepUp = await stepUpGuard(context);
  if (stepUp) return stepUp;
  const { DB } = envFromLocals(context.locals);
  const job = context.url.searchParams.get("job") ?? "";
  const status = context.url.searchParams.get("status") ?? "";
  const rows = await getApplications(DB, job, status);
  const actor = context.locals.workspace!;
  // Exports are audited by count and filter only; never names or contact details.
  await auditStatement(DB, actor, "data_exported", "hiring", { export: "applications", rows: rows.length, job: job.slice(0, 80), status: status.slice(0, 40) }, new Date().toISOString(), { module: "hiring" }).run();

  const header = ["Reference","Name","Email","Phone","Role","Stage","LinkedIn","Portfolio","Applied"];
  const body = rows.map((row) => [
    row.public_id,
    row.full_name,
    row.email,
    row.phone,
    row.job_title,
    row.status,
    row.linkedin_url,
    row.portfolio_url,
    row.created_at
  ].map(csv).join(","));

  return new Response([header.map(csv).join(","), ...body].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="lumi-applications.csv"',
      "Cache-Control": "private, no-store"
    }
  });
};
