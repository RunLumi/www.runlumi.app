import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { workspaceMembers, type MemberRow } from "../workspace/members";
import { HrmError, date } from "./fields";
import type { Lang, PageBase } from "./pages";
import {
  listOnboardingPlans,
  listOnboardingReassignmentQueue,
  listOnboardingTasks,
  listOnboardingTemplates,
  listOnboardingVersions,
  listPlanCandidates,
  previewOnboardingReschedule,
  type OnboardingPlan,
  type OnboardingTaskRow,
  type OnboardingTemplate,
  type OnboardingVersion,
} from "./onboarding";

const base=(lang:Lang,user:NonNullable<AstroGlobal["locals"]["workspace"]>,title:string):PageBase=>({lang,vi:lang==="vi",user,title,live:user.hrmEnabled===true});

export interface OnboardingManagePage extends PageBase {
  templates:Array<OnboardingTemplate&{current_version_number:number|null;current_version_state:string|null}>;
  versions:OnboardingVersion[];
  plans:OnboardingPlan[];
  tasks:OnboardingTaskRow[];
  candidates:Awaited<ReturnType<typeof listPlanCandidates>>;
  members:MemberRow[];
  reassignment:OnboardingTaskRow[];
  selectedTemplate:string;
  saved:string;
  error?:string;
  preview?:Awaited<ReturnType<typeof previewOnboardingReschedule>>;
}
export async function onboardingManagePage(astro:AstroGlobal,lang:Lang):Promise<Response|OnboardingManagePage>{
  const user=astro.locals.workspace!;if(!user.can("hrm.onboarding.manage"))return new Response("Forbidden",{status:403});
  const env=envFromLocals(astro.locals),templates=await listOnboardingTemplates(env.DB,user),requested=astro.url.searchParams.get("selected")??"";
  const selectedTemplate=templates.some(template=>template.id===requested)?requested:templates[0]?.id??"";
  const [versions,plans,candidates,tasks,reassignment,members]=await Promise.all([
    selectedTemplate?listOnboardingVersions(env.DB,user,selectedTemplate):Promise.resolve([]),
    listOnboardingPlans(env.DB,user),listPlanCandidates(env.DB,user),listOnboardingTasks(env.DB,user),
    listOnboardingReassignmentQueue(env.DB,env.CONTENT_DB,user),workspaceMembers(env.DB,env.CONTENT_DB),
  ]);
  let preview:OnboardingManagePage["preview"],error=astro.url.searchParams.get("error")??undefined;
  const previewPlan=astro.url.searchParams.get("preview_plan")??"",previewStart=astro.url.searchParams.get("preview_start")??"";
  if(previewPlan&&previewStart)try{preview=await previewOnboardingReschedule(env.DB,user,previewPlan,date(previewStart)!)}catch(cause){error=cause instanceof HrmError?cause.message:"internal_error";if(cause instanceof HrmError)astro.response.status=cause.status;}
  return {...base(lang,user,lang==="vi"?"Kế hoạch onboarding":"Onboarding plans"),templates,versions,plans,candidates,tasks,reassignment,members,selectedTemplate,saved:astro.url.searchParams.get("saved")??"",error,preview};
}

export interface OnboardingSelfPage extends PageBase {tasks:OnboardingTaskRow[];saved:string;error?:string}
export async function onboardingTasksPage(astro:AstroGlobal,lang:Lang):Promise<Response|OnboardingSelfPage>{
  const user=astro.locals.workspace!;if(!user.can("hrm.onboarding.self")&&!user.can("hrm.onboarding.tasks"))return new Response("Forbidden",{status:403});
  const env=envFromLocals(astro.locals);
  return {...base(lang,user,lang==="vi"?"Việc cần làm khi gia nhập":"Onboarding tasks"),tasks:await listOnboardingTasks(env.DB,user),saved:astro.url.searchParams.get("saved")??"",error:astro.url.searchParams.get("error")??undefined};
}
