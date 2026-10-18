import type { AstroGlobal } from "astro";
import type { PageBase } from "./pages";
import { envFromLocals } from "../ats";
import { listCloseoutPolicies, type CloseoutPolicy } from "./closeout-policies";
import { settings } from "./service";
import { HrmError } from "./fields";
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
  const disputes = live && user.can("hrm.payroll.dispute.manage") ? await listPayrollDisputes(env.DB, user) : [];
  const disputeId = astro.url.searchParams.get("dispute");
  let selectedDispute: PayrollDisputeEvent[] | undefined;
  if (disputeId && live && user.can("hrm.payroll.dispute.manage")) selectedDispute = await payrollDisputeEvents(env.DB, user, disputeId);
  return { ...base(lang, user, lang === "vi" ? "Payroll và phiếu lương" : "Payroll and payslips"), policies, closeoutPolicies, closeoutSources, periods, runs, selectedRun, slips, payments, runSettled, disputes, selectedDispute, saved: astro.url.searchParams.get("saved") ?? "", error: errorValue(astro) };
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
