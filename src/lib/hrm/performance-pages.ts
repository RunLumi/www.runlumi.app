import type { AstroGlobal } from "astro";
import { emdashUsers } from "../workspace/members";
import { envFromLocals } from "../ats";
import type { PageBase } from "./pages";
import { HrmError } from "./fields";
import { getPerformanceReview, listPerformanceReviews, performanceOptions, type PerformanceEvent, type PerformancePerson, type PerformanceReview, type PerformanceReviewer } from "./performance";
export interface PerformancePage extends PageBase {mode:"self"|"team";reviews:PerformanceReview[];page:number;hasMore:boolean;selected?:PerformanceReview;events:PerformanceEvent[];people:PerformancePerson[];reviewers:(PerformanceReviewer&{name:string})[];saved:string;error?:string}
export async function performancePage(astro:AstroGlobal,lang:"en"|"vi",mode:"self"|"team"):Promise<Response|PerformancePage>{
 const user=astro.locals.workspace!,permission=mode==="self"?"hrm.performance.self":user.can("hrm.performance.manage")?"hrm.performance.manage":"hrm.performance.review";
 if(!user.can(permission))return new Response("Forbidden",{status:403});if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const env=envFromLocals(astro.locals),db=env.DB,list=await listPerformanceReviews(db,user,mode,Number(astro.url.searchParams.get("page")??1)),selected=astro.url.searchParams.get("review"),detail=selected?await getPerformanceReview(db,user,selected):undefined;
 // A self-service URL must never expose an HR user's unrelated review by ID.
 if(mode==="self"&&detail&&detail.review.employee_user_id!==user.id)throw new HrmError("not_found",404);
 const options=mode==="team"&&user.can("hrm.performance.manage")?await performanceOptions(db,user):{people:[],reviewers:[]};
 const accounts=await emdashUsers(env.CONTENT_DB,options.reviewers.map(row=>row.user_id));
 const reviewers=options.reviewers.flatMap(row=>{const account=accounts.get(row.user_id);return account&&!account.disabled?[{...row,name:account.name||account.email}]:[]});
 return {lang,vi:lang==="vi",user,title:lang==="vi"?(mode==="self"?"Đánh giá của tôi":"Đánh giá hiệu suất"):(mode==="self"?"My reviews":"Performance reviews"),live:user.hrmEnabled===true,mode,...list,...options,reviewers,selected:detail?.review,events:detail?.events??[],saved:astro.url.searchParams.get("saved")??"",error:astro.url.searchParams.get("error")??undefined};
}
