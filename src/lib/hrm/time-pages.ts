import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { workspaceMembers, type MemberRow } from "../workspace/members";
import { listPeople, localDate } from "./service";
import { HrmError } from "./fields";
import type { Lang, PageBase } from "./pages";
import {
  listCalendarVersions,
  listLeaveAssignments,
  listLeavePolicies,
  listLeaveRequests,
  listTimeAdjustments,
  listMyTimeAdjustments,
  listTimeEntries,
  listTimePeriods,
  listWorkAssignments,
  listLeaveBalances,
  myLeaveOptions,
  previewLeaveRequest,
  myTimeContext,
  type LeaveAssignment,
  type LeavePolicy,
  type LeaveRequest,
  type TimeAdjustment,
  type TimeEntry,
  type TimePeriod,
  type WorkAssignment,
  type WorkCalendar,
  type CalendarSchedule,
  type LeaveRule,
} from "./time-leave";

const base=(lang:Lang,user:NonNullable<AstroGlobal["locals"]["workspace"]>,title:string):PageBase=>({lang,vi:lang==="vi",user,title,live:user.hrmEnabled===true});
const status=(astro:AstroGlobal)=>astro.url.searchParams.get("error")??undefined;

export interface TimeManagePage extends PageBase {
  calendars:WorkCalendar[];assignments:WorkAssignment[];periods:TimePeriod[];entries:TimeEntry[];adjustments:TimeAdjustment[];
  people:Array<{id:string;employee_code:string;legal_name:string;preferred_name:string;employment_id:string;status:string}>;members:MemberRow[];saved:string;error?:string;
}
export async function timeManagePage(astro:AstroGlobal,lang:Lang):Promise<Response|TimeManagePage>{
  const user=astro.locals.workspace!;if(!user.can("hrm.time.manage")&&!user.can("hrm.time.review")&&!user.can("hrm.time.configure"))return new Response("Forbidden",{status:403});
  const env=envFromLocals(astro.locals),live=user.hrmEnabled===true;
  const [calendars,assignments,periods,entries,adjustments,people,members]=await Promise.all([
    listCalendarVersions(env.DB,user),
    live&&(user.can("hrm.time.manage")||user.can("hrm.time.review"))?listWorkAssignments(env.DB,user):Promise.resolve([]),
    live&&(user.can("hrm.time.manage")||user.can("hrm.time.review"))?listTimePeriods(env.DB,user):Promise.resolve([]),
    live?listTimeEntries(env.DB,user):Promise.resolve([]),
    live&&user.can("hrm.time.review")?listTimeAdjustments(env.DB,user):Promise.resolve([]),
    live&&user.can("hrm.time.manage")?listPeople(env.DB,user,"",1):Promise.resolve([]),
    workspaceMembers(env.DB,env.CONTENT_DB),
  ]);
  return {...base(lang,user,lang==="vi"?"Lịch và chấm công":"Schedules and attendance"),calendars,assignments,periods,entries,adjustments,people,members,saved:astro.url.searchParams.get("saved")??"",error:status(astro)};
}

export interface MyTimePage extends PageBase {entries:TimeEntry[];adjustments:TimeAdjustment[];context?:{personId:string;workDate:string;timezone:string;weekdays:CalendarSchedule["weekdays"];holidays:string[];periods:TimePeriod[]};saved:string;error?:string}
export async function myTimePage(astro:AstroGlobal,lang:Lang):Promise<Response|MyTimePage>{
  const user=astro.locals.workspace!;if(!user.can("hrm.time.self"))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)return new Response("HRM is not activated",{status:503,headers:{"Cache-Control":"private, no-store"}});
  const env=envFromLocals(astro.locals),[entries,adjustments]=await Promise.all([listTimeEntries(env.DB,user),user.hrmEnabled===true?listMyTimeAdjustments(env.DB,user):Promise.resolve([])]);let context:MyTimePage["context"],error=status(astro);
  if(user.hrmEnabled===true)try{const date=astro.url.searchParams.get("work_date")||localDate(),value=await myTimeContext(env.DB,user,date);context={personId:value.person.id,workDate:date,timezone:value.assignment.timezone,weekdays:value.schedule.weekdays,holidays:value.schedule.holidays,periods:value.periods}}catch(cause){if(cause instanceof HrmError){error=cause.message;if(cause.status!==409)astro.response.status=cause.status}else throw cause}
  return {...base(lang,user,lang==="vi"?"Công của tôi":"My attendance"),entries,adjustments,context,saved:astro.url.searchParams.get("saved")??"",error};
}

export interface LeaveManagePage extends PageBase {policies:LeavePolicy[];assignments:LeaveAssignment[];requests:LeaveRequest[];members:MemberRow[];people:Array<{id:string;employee_code:string;legal_name:string;preferred_name:string;employment_id:string;status:string}>;saved:string;error?:string}
export async function leaveManagePage(astro:AstroGlobal,lang:Lang):Promise<Response|LeaveManagePage>{
  const user=astro.locals.workspace!;if(!user.can("hrm.leave.manage")&&!user.can("hrm.leave.review")&&!user.can("hrm.leave.configure"))return new Response("Forbidden",{status:403});
  const env=envFromLocals(astro.locals),live=user.hrmEnabled===true;
  const [policies,assignments,requests,members,people]=await Promise.all([
    listLeavePolicies(env.DB,user),
    live&&(user.can("hrm.leave.manage")||user.can("hrm.leave.review"))?listLeaveAssignments(env.DB,user):Promise.resolve([]),
    live&&(user.can("hrm.leave.manage")||user.can("hrm.leave.review"))?listLeaveRequests(env.DB,user):Promise.resolve([]),
    workspaceMembers(env.DB,env.CONTENT_DB),
    live&&user.can("hrm.leave.manage")?listPeople(env.DB,user,"",1):Promise.resolve([]),
  ]);
  return {...base(lang,user,lang==="vi"?"Chính sách phép và đơn nghỉ":"Leave policies and requests"),policies,assignments,requests,members,people,saved:astro.url.searchParams.get("saved")??"",error:status(astro)};
}

export interface MyLeavePage extends PageBase {requests:LeaveRequest[];balances:Array<{leave_type_key:string;balance_minutes:number;pending_minutes:number;available_minutes:number}>;options?:{personId:string;policyVersionId:string;timezone:string;rules:LeaveRule[]};preview?:Awaited<ReturnType<typeof previewLeaveRequest>>;previewValues?:{startsOn:string;endsOn:string;portion:"full"|"half_first"|"half_second";leaveTypeKey:string};saved:string;error?:string}
export async function myLeavePage(astro:AstroGlobal,lang:Lang):Promise<Response|MyLeavePage>{
  const user=astro.locals.workspace!;if(!user.can("hrm.leave.self"))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)return new Response("HRM is not activated",{status:503,headers:{"Cache-Control":"private, no-store"}});
  const env=envFromLocals(astro.locals);let requests:LeaveRequest[]=[],balances:MyLeavePage["balances"]=[],options:MyLeavePage["options"],preview:MyLeavePage["preview"],previewValues:MyLeavePage["previewValues"],error=status(astro);
  if(user.hrmEnabled===true){requests=await listLeaveRequests(env.DB,user);balances=await listLeaveBalances(env.DB,user);try{const date=astro.url.searchParams.get("starts_on")||localDate(),value=await myLeaveOptions(env.DB,user,date);options={personId:value.person.id,policyVersionId:value.assignment.policy_version_id,timezone:value.assignment.timezone,rules:value.rules}}catch(cause){if(cause instanceof HrmError){if(cause.message!=="leave_policy_assignment_missing"&&cause.message!=="calendar_assignment_missing")error=cause.message}else throw cause}if(astro.url.searchParams.get("preview")==="1")try{const portion=astro.url.searchParams.get("portion"),startsOn=astro.url.searchParams.get("starts_on")??"",endsOn=astro.url.searchParams.get("ends_on")??"",leaveTypeKey=astro.url.searchParams.get("leave_type_key")??"";if(!["full","half_first","half_second"].includes(portion||""))throw new HrmError("invalid_request",400);preview=await previewLeaveRequest(env.DB,user,{startsOn,endsOn,portion:portion as "full"|"half_first"|"half_second",leaveTypeKey});previewValues={startsOn,endsOn,portion:portion as "full"|"half_first"|"half_second",leaveTypeKey}}catch(cause){if(cause instanceof HrmError){error=cause.message;astro.response.status=cause.status}else throw cause}}
  return {...base(lang,user,lang==="vi"?"Xin nghỉ và số dư phép":"Leave requests and balance"),requests,balances,options,preview,previewValues,saved:astro.url.searchParams.get("saved")??"",error};
}
