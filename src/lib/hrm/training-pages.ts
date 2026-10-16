import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import type { PageBase } from "./pages";
import { HrmError } from "./fields";
import { listManagedTraining, listMyTraining, type HrmTrainingDashboard } from "./training";
import { listTrainingReminders, type TrainingReminder } from "./training-reminders";

const base=(lang:"en"|"vi",user:NonNullable<AstroGlobal["locals"]["workspace"]>,title:string):PageBase=>({lang,vi:lang==="vi",user,title,live:user.hrmEnabled===true});
const pageNumber=(astro:AstroGlobal):number=>{const value=Number(astro.url.searchParams.get("reminder_page")??1);return Number.isFinite(value)?Math.max(1,Math.min(1000,Math.floor(value))):1};
export interface TrainingManagementPage extends PageBase,HrmTrainingDashboard {legalEntity:string;saved:string;reminders:TrainingReminder[];reminderPage:number;hasMoreReminders:boolean;error?:string}
export async function trainingManagementPage(astro:AstroGlobal,lang:"en"|"vi"):Promise<Response|TrainingManagementPage>{
 const user=astro.locals.workspace!;if(!user.can("hrm.training.manage"))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const env=envFromLocals(astro.locals),reminderPage=pageNumber(astro),[data,settings,reminders]=await Promise.all([
  listManagedTraining(env.DB,user),env.DB.prepare("SELECT legal_entity FROM hrm_settings WHERE id=1").first<{legal_entity:string|null}>(),listTrainingReminders(env.DB,user,reminderPage),
 ]);
 return {...base(lang,user,lang==="vi"?"Đào tạo và chứng chỉ":"Training and certificates"),...data,legalEntity:settings?.legal_entity??"",reminders:reminders.reminders,reminderPage:reminders.page,hasMoreReminders:reminders.hasMore,saved:astro.url.searchParams.get("saved")??"",error:astro.url.searchParams.get("error")??undefined};
}
export interface MyTrainingPage extends PageBase,HrmTrainingDashboard {saved:string;reminders:TrainingReminder[];reminderPage:number;hasMoreReminders:boolean;error?:string}
export async function myTrainingPage(astro:AstroGlobal,lang:"en"|"vi"):Promise<Response|MyTrainingPage>{
 const user=astro.locals.workspace!;if(!user.can("hrm.training.self"))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const env=envFromLocals(astro.locals),reminderPage=pageNumber(astro),[data,reminders]=await Promise.all([listMyTraining(env.DB,user),listTrainingReminders(env.DB,user,reminderPage)]);
 return {...base(lang,user,lang==="vi"?"Đào tạo của tôi":"My training"),...data,reminders:reminders.reminders,reminderPage:reminders.page,hasMoreReminders:reminders.hasMore,saved:astro.url.searchParams.get("saved")??"",error:astro.url.searchParams.get("error")??undefined};
}
