import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import type { PageBase } from "./pages";
import { HrmError } from "./fields";
import { hrmReportSnapshot, type HrmReportGroup } from "./reports";

export interface HrmReportsPage extends PageBase {legalEntity:string;generatedAt:string;period:string;department:string|null;departments:string[];groups:HrmReportGroup[];error?:string}
const base=(lang:"en"|"vi",user:NonNullable<AstroGlobal["locals"]["workspace"]>):PageBase=>({lang,vi:lang==="vi",user,title:lang==="vi"?"Báo cáo HRM":"HRM reports",live:user.hrmEnabled===true});
export async function reportsPage(astro:AstroGlobal,lang:"en"|"vi"):Promise<Response|HrmReportsPage>{
 const user=astro.locals.workspace!;if(!user.can("hrm.reports.read"))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const env=envFromLocals(astro.locals),report=await hrmReportSnapshot(env.DB,user,{period:astro.url.searchParams.get("period"),department:astro.url.searchParams.get("department")});
 return {...base(lang,user),legalEntity:report.legal_entity,generatedAt:report.generated_at,period:report.period,department:report.department,departments:report.departments,groups:report.groups,error:astro.url.searchParams.get("error")??undefined};
}
