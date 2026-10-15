import type { AstroGlobal } from "astro";
import type { PageBase } from "./pages";
import { HrmError } from "./fields";
import { listManagedBenefits, listMyBenefits, type HrmBenefitEnrollment, type HrmBenefitPlan } from "./benefits";
import { envFromLocals } from "../ats";

const base=(lang:"en"|"vi",user:NonNullable<AstroGlobal["locals"]["workspace"]>,title:string):PageBase=>({lang,vi:lang==="vi",user,title,live:user.hrmEnabled===true});
export interface BenefitManagementPage extends PageBase {plans:HrmBenefitPlan[];enrollments:HrmBenefitEnrollment[];legalEntity:string;saved:string;error?:string}
export async function benefitManagementPage(astro:AstroGlobal,lang:"en"|"vi"):Promise<Response|BenefitManagementPage>{
 const user=astro.locals.workspace!;if(!user.can("hrm.benefits.manage"))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const env=envFromLocals(astro.locals),[data,settings]=await Promise.all([
  listManagedBenefits(env.DB,user),env.DB.prepare("SELECT legal_entity FROM hrm_settings WHERE id=1").first<{legal_entity:string|null}>(),
 ]);
 return {...base(lang,user,lang==="vi"?"Quản lý phúc lợi":"Benefits management"),...data,legalEntity:settings?.legal_entity??"",saved:astro.url.searchParams.get("saved")??"",error:astro.url.searchParams.get("error")??undefined};
}
export interface MyBenefitsPage extends PageBase {plans:HrmBenefitPlan[];enrollments:HrmBenefitEnrollment[];saved:string;error?:string}
export async function myBenefitsPage(astro:AstroGlobal,lang:"en"|"vi"):Promise<Response|MyBenefitsPage>{
 const user=astro.locals.workspace!;if(!user.can("hrm.benefits.self"))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const env=envFromLocals(astro.locals),data=await listMyBenefits(env.DB,user);
 return {...base(lang,user,lang==="vi"?"Phúc lợi của tôi":"My benefits"),...data,saved:astro.url.searchParams.get("saved")??"",error:astro.url.searchParams.get("error")??undefined};
}
