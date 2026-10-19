import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { HrmError } from "./fields";
import type { Lang, PageBase } from "./pages";
import { getOffboardingCase, listOffboardingCases, type OffboardingCase, type OffboardingTask } from "./offboarding";
import { closeoutDesk } from "./closeout-dossiers";
import type { MemberRow } from "../workspace/members";

export interface OffboardingListPage extends PageBase {
  cases:(OffboardingCase&{task_count:number;open_tasks:number})[];
}
export interface OffboardingDetailPage extends PageBase {
  offboarding:OffboardingCase;
  tasks:OffboardingTask[];
  member:MemberRow|null;
  saved:boolean;
  error?:string;
  requestKey:string;
  closeout?:Awaited<ReturnType<typeof closeoutDesk>>;
}

export async function offboardingListPage(astro:AstroGlobal,lang:Lang):Promise<OffboardingListPage>{
  const user=astro.locals.workspace!;const {DB}=envFromLocals(astro.locals);
  const cases=await listOffboardingCases(DB,user);
  return {lang,vi:lang==="vi",user,title:lang==="vi"?"Offboarding":"Offboarding",live:user.hrmEnabled===true,cases};
}

export async function offboardingDetailPage(astro:AstroGlobal,lang:Lang,caseId:string):Promise<OffboardingDetailPage>{
  const user=astro.locals.workspace!;const {DB,CONTENT_DB,FILES}=envFromLocals(astro.locals);
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(caseId))throw new HrmError("not_found",404);
  const detail=await getOffboardingCase(DB,CONTENT_DB,user,caseId);
  const financial=user.can("hrm.payroll.approve")&&user.can("hrm.offboarding.manage")?await closeoutDesk(DB,CONTENT_DB,FILES,user,caseId,astro.url.searchParams.get("policy")):undefined;
  const allowedErrors=new Set(["financial_control_invalid","financial_control_missing","financial_control_conflict","financial_control_pending","financial_data_disposed","financial_payload_unavailable","financial_payload_remaining","request_too_large","invalid_form","invalid_file","invalid_field","invalid_action","invalid_request_key","internal_error","closeout_pdf_required","closeout_hold_unavailable","report_account_unavailable","closeout_invalid","closeout_checks_required","closeout_source_changed","closeout_approval_required","closeout_evidence_invalid","closeout_policy_required","closeout_policy_source_invalid","closeout_account_unavailable","closeout_sources_unreconciled","closeout_source_limit","file_unavailable","file_size","file_type","self_approval","forbidden","offboarding_case_inactive","offboarding_payroll_blocked","offboarding_assets_pending","offboarding_system_admin_protected","offboarding_access_pending","offboarding_self_revoke","offboarding_not_assigned","offboarding_not_waivable","reason_required","conflict","request_key_conflict","confirmation_required","invalid_transition"]);
  const error=astro.url.searchParams.get("error")??"";
  return {lang,vi:lang==="vi",user,title:lang==="vi"?"Checklist offboarding":"Offboarding checklist",live:user.hrmEnabled===true,
    ...detail,closeout:financial,saved:astro.url.searchParams.has("saved"),error:allowedErrors.has(error)?error:undefined,requestKey:crypto.randomUUID()};
}
