import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import type { PageBase } from "./pages";
import { HrmError } from "./fields";
import { listManagedTraining, listMyTraining, type HrmTrainingDashboard } from "./training";

const base=(lang:"en"|"vi",user:NonNullable<AstroGlobal["locals"]["workspace"]>,title:string):PageBase=>({lang,vi:lang==="vi",user,title,live:user.hrmEnabled===true});
export interface TrainingManagementPage extends PageBase,HrmTrainingDashboard {legalEntity:string;saved:string;error?:string}
export async function trainingManagementPage(astro:AstroGlobal,lang:"en"|"vi"):Promise<Response|TrainingManagementPage>{
 const user=astro.locals.workspace!;if(!user.can("hrm.training.manage"))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const env=envFromLocals(astro.locals),[data,settings]=await Promise.all([
  listManagedTraining(env.DB,user),env.DB.prepare("SELECT legal_entity FROM hrm_settings WHERE id=1").first<{legal_entity:string|null}>(),
 ]);
 return {...base(lang,user,lang==="vi"?"Đào tạo và chứng chỉ":"Training and certificates"),...data,legalEntity:settings?.legal_entity??"",saved:astro.url.searchParams.get("saved")??"",error:astro.url.searchParams.get("error")??undefined};
}
export interface MyTrainingPage extends PageBase,HrmTrainingDashboard {saved:string;error?:string}
export async function myTrainingPage(astro:AstroGlobal,lang:"en"|"vi"):Promise<Response|MyTrainingPage>{
 const user=astro.locals.workspace!;if(!user.can("hrm.training.self"))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const env=envFromLocals(astro.locals),data=await listMyTraining(env.DB,user);
 return {...base(lang,user,lang==="vi"?"Đào tạo của tôi":"My training"),...data,saved:astro.url.searchParams.get("saved")??"",error:astro.url.searchParams.get("error")??undefined};
}
