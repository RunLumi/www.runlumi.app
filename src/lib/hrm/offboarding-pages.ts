import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { HrmError } from "./fields";
import type { Lang, PageBase } from "./pages";
import { getOffboardingCase, listOffboardingCases, type OffboardingCase, type OffboardingTask } from "./offboarding";
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
}

export async function offboardingListPage(astro:AstroGlobal,lang:Lang):Promise<OffboardingListPage>{
  const user=astro.locals.workspace!;const {DB}=envFromLocals(astro.locals);
  const cases=await listOffboardingCases(DB,user);
  return {lang,vi:lang==="vi",user,title:lang==="vi"?"Offboarding":"Offboarding",live:user.hrmEnabled===true,cases};
}

export async function offboardingDetailPage(astro:AstroGlobal,lang:Lang,caseId:string):Promise<OffboardingDetailPage>{
  const user=astro.locals.workspace!;const {DB,CONTENT_DB}=envFromLocals(astro.locals);
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(caseId))throw new HrmError("not_found",404);
  const detail=await getOffboardingCase(DB,CONTENT_DB,user,caseId);
  const allowedErrors=new Set(["forbidden","offboarding_case_inactive","offboarding_payroll_blocked","offboarding_system_admin_protected","offboarding_access_pending","offboarding_self_revoke","offboarding_not_assigned","offboarding_not_waivable","reason_required","conflict","request_key_conflict","confirmation_required","invalid_transition"]);
  const error=astro.url.searchParams.get("error")??"";
  return {lang,vi:lang==="vi",user,title:lang==="vi"?"Checklist offboarding":"Offboarding checklist",live:user.hrmEnabled===true,
    ...detail,saved:astro.url.searchParams.has("saved"),error:allowedErrors.has(error)?error:undefined,requestKey:crypto.randomUUID()};
}
