import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import type { PageBase } from "./pages";
import { membersWithRoles, type MemberRow } from "../workspace/members";
import { HrmError } from "./fields";
import { listFailedServiceOutbox, listManagedServiceRequests, listMyServiceRequests, listNotifications, serviceRequestDetail, type OutboxFailure, type ServiceRequestView, type HrNotification } from "./employee-services";

const base=(lang:"en"|"vi",user:NonNullable<AstroGlobal["locals"]["workspace"]>,title:string):PageBase=>({lang,vi:lang==="vi",user,title,live:user.hrmEnabled===true});

export interface MyRequestsPage extends PageBase {requests:ServiceRequestView[];selected?:Awaited<ReturnType<typeof serviceRequestDetail>>;saved:string;error?:string}
export async function myRequestsPage(astro:AstroGlobal,lang:"en"|"vi"):Promise<Response|MyRequestsPage>{
 const user=astro.locals.workspace!;if(!user.can("hrm.services.self"))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const env=envFromLocals(astro.locals),requests=await listMyServiceRequests(env.DB,user),id=astro.url.searchParams.get("request")??undefined,selected=id?await serviceRequestDetail(env.DB,user,id):undefined;
 return {...base(lang,user,lang==="vi"?"Yêu cầu HR của tôi":"My HR requests"),requests,selected,saved:astro.url.searchParams.get("saved")??"",error:astro.url.searchParams.get("error")??undefined};
}
export interface ServiceDeskPage extends PageBase {requests:ServiceRequestView[];failures:OutboxFailure[];members:MemberRow[];selected?:Awaited<ReturnType<typeof serviceRequestDetail>>;saved:string;error?:string}
export async function serviceDeskPage(astro:AstroGlobal,lang:"en"|"vi"):Promise<Response|ServiceDeskPage>{
 const user=astro.locals.workspace!;if(!user.can("hrm.services.manage"))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const env=envFromLocals(astro.locals),[requests,failures,members]=await Promise.all([listManagedServiceRequests(env.DB,user),listFailedServiceOutbox(env.DB,user),membersWithRoles(env.DB,env.CONTENT_DB,["hrm_officer","hrm_admin"])]),id=astro.url.searchParams.get("request")??undefined,selected=id?await serviceRequestDetail(env.DB,user,id):undefined;
 return {...base(lang,user,lang==="vi"?"Bàn dịch vụ HR":"HR service desk"),requests,failures,members,selected,saved:astro.url.searchParams.get("saved")??"",error:astro.url.searchParams.get("error")??undefined};
}
export interface NotificationsPage extends PageBase {notifications:HrNotification[];unread:number;saved:string;error?:string}
export async function notificationsPage(astro:AstroGlobal,lang:"en"|"vi"):Promise<Response|NotificationsPage>{
 const user=astro.locals.workspace!;if(!user.can("hrm.notifications.read"))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const env=envFromLocals(astro.locals),result=await listNotifications(env.DB,user);
 return {...base(lang,user,lang==="vi"?"Thông báo HRM":"HRM notifications"),notifications:result.notifications,unread:result.unread,saved:astro.url.searchParams.get("saved")??"",error:astro.url.searchParams.get("error")??undefined};
}
