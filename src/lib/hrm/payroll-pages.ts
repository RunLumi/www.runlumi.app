import type { AstroGlobal } from "astro";
import type { PageBase } from "./pages";
import { envFromLocals } from "../ats";
import { listCloseoutPolicies, type CloseoutPolicy } from "./closeout-policies";
import { settings } from "./service";
import { HrmError } from "./fields";
import { listCompensation, runCompensationCoverage, type CompensationCoverage, type CompensationVersion } from "./compensation";
import {
  listLockedPayrollPeriods, listMyPayslips, listPayrollDisputes, listPayrollPolicies,
  listPayrollPaymentsForRun, listPayrollRuns, listPayrollSlipsForRun, payrollDisputeEvents, payrollRun, payrollRunSettled,
  type PayrollDispute, type PayrollDisputeEvent, type PayrollPayment, type PayrollPolicy, type PayrollRun, type PayrollSlip,
} from "./payroll";

const base = (lang: "en" | "vi", user: NonNullable<AstroGlobal["locals"]["workspace"]>, title: string): PageBase => ({ lang, vi: lang === "vi", user, title, live: user.hrmEnabled === true });
const errorValue = (astro: AstroGlobal) => astro.url.searchParams.get("error") ?? undefined;

export interface PayrollDeskPage extends PageBase {
  policies: PayrollPolicy[]; periods: Array<{ id: string; period_key: string; starts_on: string; ends_on: string; snapshot_checksum: string; version: number }>;
  runs: Array<PayrollRun & { employee_count: number }>; selectedRun?: Awaited<ReturnType<typeof payrollRun>>;
  slips: PayrollSlip[]; payments: PayrollPayment[]; runSettled: boolean; disputes: PayrollDispute[]; selectedDispute?: PayrollDisputeEvent[];
  saved: string; error?: string;
  compensation: CompensationVersion[]; compensationHasMore: boolean; compensationFilter: string; compensationPage: number;
  /** Coverage hint per `run_person_id:component_code` for the selected draft run. */
  coverage: Record<string, CompensationCoverage>;
  /** Confirmed CRM commission handoffs for the selected run's month, by run person. Totals only. */
  commission: Record<string, Array<{ id: string; amount_vnd: number; line_count: number }>>;
  /** CRM refund notices on handoffs payroll used: totals only, never customer detail. */
  refundNotices: Array<{ id: string; handoff_id: string; period: string; amount_vnd: number; line_count: number; reason: string; recorded_at: string; employee_code: string | null; on_current_payslip: number }>;
  closeoutPolicies:CloseoutPolicy[];closeoutSources:{id:string;source_file_id:string;title_en:string;title_vi:string;version_number:number}[];
}
export async function payrollDeskPage(astro: AstroGlobal, lang: "en" | "vi"): Promise<Response | PayrollDeskPage> {
  const user = astro.locals.workspace!;
  if (!user.can("hrm.payroll.read") && !user.can("hrm.payroll.configure")) return new Response("Forbidden", { status: 403 });
  const env = envFromLocals(astro.locals), live = user.hrmEnabled === true, canConfigure = user.can("hrm.payroll.configure");
  const canCloseout=canConfigure&&user.can("hrm.offboarding.manage"),config=canCloseout?await settings(env.DB):null;
  const closeoutPolicies=canCloseout?await listCloseoutPolicies(env.DB,user):[];
  const closeoutSources=canCloseout?(await env.DB.prepare(`SELECT v.id,v.source_file_id,t.title_en,t.title_vi,v.version_number FROM hrm_legal_template_versions v JOIN hrm_legal_templates t ON t.id=v.template_id WHERE v.legal_entity=? AND t.document_type='policy' ORDER BY v.created_at DESC,v.id LIMIT 100`).bind(config!.legal_entity).all<{id:string;source_file_id:string;title_en:string;title_vi:string;version_number:number}>()).results:[];
  const policies = canConfigure || live ? await listPayrollPolicies(env.DB, user) : [];
  const periods = live && user.can("hrm.payroll.prepare") ? await listLockedPayrollPeriods(env.DB, user) : [];
  const runs = live && user.can("hrm.payroll.read") ? await listPayrollRuns(env.DB, user) : [];
  let selectedRun: PayrollDeskPage["selectedRun"], slips: PayrollSlip[] = [], payments: PayrollPayment[] = [], runSettled = false;
  const runId = astro.url.searchParams.get("run");
  if (runId && live && user.can("hrm.payroll.read")) {
    selectedRun = await payrollRun(env.DB, user, runId);
    if (["published", "closed"].includes(selectedRun.run.state)) {
      slips = await listPayrollSlipsForRun(env.DB, user, runId);
      payments = await listPayrollPaymentsForRun(env.DB, user, runId);
      if (selectedRun.run.state === "published") runSettled = await payrollRunSettled(env.DB, user, runId);
    }
  }
  const compensationFilter = (astro.url.searchParams.get("compensation_employee") ?? "").trim().slice(0, 60);
  const compensationPage = Math.max(1, Math.min(1000, Number.parseInt(astro.url.searchParams.get("compensation_page") ?? "1", 10) || 1));
  const listed = live && user.can("hrm.compensation.read") ? await listCompensation(env.DB, user, compensationFilter, compensationPage) : { rows: [], hasMore: false };
  const coverage: Record<string, CompensationCoverage> = {};
  if (selectedRun && !["published", "closed"].includes(selectedRun.run.state) && user.can("hrm.payroll.prepare")) {
    const components = JSON.parse(selectedRun.policy.components_json) as Array<{ code: string; source_kind: string }>;
    const byEmployment = await runCompensationCoverage(env.DB, selectedRun.run.id, selectedRun.run.starts_on, selectedRun.run.ends_on);
    for (const person of selectedRun.people) for (const component of components.filter(item => item.source_kind === "employment_record"))
      coverage[`${person.id}:${component.code}`] = byEmployment.get(`${person.employment_id}:${component.code}`) ?? { state: "missing" };
  }
  const commission: PayrollDeskPage["commission"] = {};
  if (selectedRun && !["published", "closed"].includes(selectedRun.run.state) && user.can("hrm.payroll.prepare") && selectedRun.run.starts_on.slice(0, 7) === selectedRun.run.ends_on.slice(0, 7)) {
    const rows = (await env.DB.prepare(`SELECT rp.id AS run_person_id,h.id,h.amount_vnd,h.line_count FROM hrm_payroll_run_people rp JOIN hrm_people p ON p.id=rp.person_id
      JOIN crm_commission_handoffs h ON h.user_id=p.user_id AND h.state='confirmed' AND h.period=? WHERE rp.run_id=? ORDER BY h.confirmed_at`).bind(selectedRun.run.starts_on.slice(0, 7), selectedRun.run.id).all<{ run_person_id: string; id: string; amount_vnd: number; line_count: number }>()).results;
    for (const row of rows) commission[row.run_person_id] = [...(commission[row.run_person_id] ?? []), { id: row.id, amount_vnd: row.amount_vnd, line_count: row.line_count }];
  }
  const refundNotices = live && user.can("hrm.payroll.read") ? (await env.DB.prepare(`SELECT n.id,n.handoff_id,h.period,n.amount_vnd,n.line_count,n.reason,n.recorded_at,
      (SELECT p.employee_code FROM hrm_people p WHERE p.user_id=h.user_id ORDER BY p.created_at DESC LIMIT 1) AS employee_code,
      EXISTS(SELECT 1 FROM hrm_payslips s, json_each(s.snapshot_json,'$.lines') j WHERE s.state='published' AND json_extract(j.value,'$.source_kind')='crm_commission' AND json_extract(j.value,'$.source_reference')=h.id) AS on_current_payslip
    FROM crm_commission_refund_notices n JOIN crm_commission_handoffs h ON h.id=n.handoff_id ORDER BY n.recorded_at DESC LIMIT 100`).all<PayrollDeskPage["refundNotices"][number]>()).results : [];
  const disputes = live && user.can("hrm.payroll.dispute.manage") ? await listPayrollDisputes(env.DB, user) : [];
  const disputeId = astro.url.searchParams.get("dispute");
  let selectedDispute: PayrollDisputeEvent[] | undefined;
  if (disputeId && live && user.can("hrm.payroll.dispute.manage")) selectedDispute = await payrollDisputeEvents(env.DB, user, disputeId);
  return { ...base(lang, user, lang === "vi" ? "Bảng lương và phiếu lương" : "Payroll and payslips"), policies, compensation: listed.rows, compensationHasMore: listed.hasMore, compensationFilter, compensationPage, coverage, commission, refundNotices, closeoutPolicies, closeoutSources, periods, runs, selectedRun, slips, payments, runSettled, disputes, selectedDispute, saved: astro.url.searchParams.get("saved") ?? "", error: errorValue(astro) };
}

export interface MyPayslipsPage extends PageBase { slips: PayrollSlip[]; disputes: PayrollDispute[]; selectedDispute?: PayrollDisputeEvent[]; saved: string; error?: string }
export async function myPayslipsPage(astro: AstroGlobal, lang: "en" | "vi"): Promise<Response | MyPayslipsPage> {
  const user = astro.locals.workspace!;
  if (!user.can("hrm.payroll.self")) return new Response("Forbidden", { status: 403 });
  if (user.hrmEnabled !== true) throw new HrmError("payroll_closed", 503);
  const env = envFromLocals(astro.locals), slips = await listMyPayslips(env.DB, user), disputes = await listPayrollDisputes(env.DB, user);
  const disputeId = astro.url.searchParams.get("dispute");
  const selectedDispute = disputeId ? await payrollDisputeEvents(env.DB, user, disputeId) : undefined;
  return { ...base(lang, user, lang === "vi" ? "Phiếu lương của tôi" : "My payslips"), slips, disputes, selectedDispute, saved: astro.url.searchParams.get("saved") ?? "", error: errorValue(astro) };
}
