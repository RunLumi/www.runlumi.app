import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import type { PageBase } from "./pages";
import { listReportPolicies, type ReportPolicy } from "./report-governance";
import { HrmError } from "./fields";
import { hrmReportSnapshot, type HrmReportGroup } from "./reports";
import { listReportSchedules, listReportSnapshots, readReportSnapshot, type HrmReportScheduleSummary, type HrmReportSnapshotSummary, type HrmStoredReportSnapshot } from "./report-snapshots";

export interface HrmReportsPage extends PageBase {policies:ReportPolicy[];legalEntity:string;generatedAt:string;period:string;department:string|null;departments:string[];groups:HrmReportGroup[];snapshots:HrmReportSnapshotSummary[];snapshotPage:number;hasMoreSnapshots:boolean;schedules:HrmReportScheduleSummary[];schedulePage:number;hasMoreSchedules:boolean;selectedSnapshot?:HrmStoredReportSnapshot;saved:string;error?:string}
const base=(lang:"en"|"vi",user:NonNullable<AstroGlobal["locals"]["workspace"]>):PageBase=>({lang,vi:lang==="vi",user,title:lang==="vi"?"Báo cáo HRM":"HRM reports",live:user.hrmEnabled===true});
export async function reportsPage(astro:AstroGlobal,lang:"en"|"vi"):Promise<Response|HrmReportsPage>{
 const user=astro.locals.workspace!;if(!user.can("hrm.reports.read"))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const pageValue=Number(astro.url.searchParams.get("snapshot_page")??1),snapshotPage=Number.isFinite(pageValue)?Math.max(1,Math.min(1000,Math.floor(pageValue))):1,schedulePageValue=Number(astro.url.searchParams.get("schedule_page")??1),schedulePage=Number.isFinite(schedulePageValue)?Math.max(1,Math.min(1000,Math.floor(schedulePageValue))):1,env=envFromLocals(astro.locals),[report,snapshotResult,scheduleResult,policies]=await Promise.all([
  hrmReportSnapshot(env.DB,user,{period:astro.url.searchParams.get("period"),department:astro.url.searchParams.get("department")}),
  listReportSnapshots(env.DB,user,snapshotPage),
  listReportSchedules(env.DB,user,schedulePage),
  user.can("hrm.reports.manage")?listReportPolicies(env.DB,user):Promise.resolve([]),
 ]),snapshotRef=astro.url.searchParams.get("snapshot"),selectedSnapshot=snapshotRef?await readReportSnapshot(env.DB,user,snapshotRef):undefined;
 return {...base(lang,user),policies,legalEntity:report.legal_entity,generatedAt:report.generated_at,period:report.period,department:report.department,departments:report.departments,groups:report.groups,snapshots:snapshotResult.snapshots,snapshotPage:snapshotResult.page,hasMoreSnapshots:snapshotResult.hasMore,schedules:scheduleResult.schedules,schedulePage:scheduleResult.page,hasMoreSchedules:scheduleResult.hasMore,selectedSnapshot,saved:astro.url.searchParams.get("saved")??"",error:astro.url.searchParams.get("error")??undefined};
}
