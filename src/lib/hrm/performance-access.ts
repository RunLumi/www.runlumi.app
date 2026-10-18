import type { Permission, WorkspaceUser } from "../workspace/roles";
import { ROLE_PERMISSIONS } from "../workspace/roles";
import { HrmError, date } from "./fields";
import { guardBoolean, requirePermission } from "./service";
import type { PerformanceReview, PerformanceState } from "./performance";
export const sharedStates=new Set<PerformanceState>(["published","responded","closed"]);
export const live=(user:WorkspaceUser)=>{if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503)};
export function performanceText(value:string,max:number,required=true):string{const result=value.trim();if(result.length>max||(required&&!result))throw new HrmError("invalid_field");return result}
export function performanceDates(start:string,end:string,due:string):void{if(!date(start)||!date(end)||!date(due)||end<start||due<end)throw new HrmError("invalid_date")}
export const rolesFor=(permission:Permission)=>Object.entries(ROLE_PERMISSIONS).filter(([,permissions])=>permissions.includes(permission)).map(([role])=>role);
export const reviewerRoles=rolesFor("hrm.performance.review"),employeeRoles=rolesFor("hrm.performance.self");
export const marks=(roles:readonly string[])=>roles.map(()=>"?").join(",");
export function authority(db:D1Database,user:WorkspaceUser,permission:Permission):D1PreparedStatement[]{
 requirePermission(user,permission);live(user);const gate=guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND enabled=1 AND reviewed_by IS NOT NULL)",[]);if(user.admin)return [gate];
 const roles=rolesFor(permission);
 return [gate,guardBoolean(db,`EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role IN (${roles.map(()=>"?").join(",")}))`,[user.id,...roles])];
}
export async function activeReviewer(contentDb:D1Database,userId:string):Promise<void>{if(!await contentDb.prepare("SELECT 1 FROM users WHERE id=? AND disabled=0").bind(userId).first())throw new HrmError("invalid_account",409)}
export const reviewerPredicate=`EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role IN (${marks(reviewerRoles)}))`;
export const selectReview=`SELECT r.*,(SELECT c.subject_user_id FROM hrm_performance_corrections c WHERE c.replacement_review_id=r.id) AS correction_subject_user_id,EXISTS(SELECT 1 FROM hrm_performance_corrections c JOIN hrm_performance_reviews n ON n.id=c.replacement_review_id WHERE c.source_review_id=r.id AND n.state IN ('published','responded','closed')) AS superseded,EXISTS(SELECT 1 FROM hrm_performance_corrections c JOIN hrm_performance_reviews n ON n.id=c.replacement_review_id WHERE c.source_review_id=r.id AND n.state IN ('open','self_submitted','assessed')) AS pending_correction,(SELECT c.attempt_no FROM hrm_performance_corrections c WHERE c.replacement_review_id=r.id) AS correction_attempt,p.user_id AS employee_user_id,p.employee_code,COALESCE(NULLIF(p.preferred_name,''),p.legal_name) AS display_name FROM hrm_performance_reviews r JOIN hrm_people p ON p.id=r.person_id`;
export function subjectOfPerformance(row:Pick<PerformanceReview,"employee_user_id"|"correction_subject_user_id">,userId:string):boolean{return row.employee_user_id===userId||row.correction_subject_user_id===userId}
export function allowed(user:WorkspaceUser,row:Pick<PerformanceReview,"employee_user_id"|"reviewer_user_id"|"correction_subject_user_id">):boolean{
 const aligned=!row.correction_subject_user_id||row.correction_subject_user_id===row.employee_user_id;
 return user.can("hrm.performance.manage")||(aligned&&((user.can("hrm.performance.self")&&row.employee_user_id===user.id)||(user.can("hrm.performance.review")&&row.reviewer_user_id===user.id)));
}
export const alignedPerformanceIdentity="NOT EXISTS(SELECT 1 FROM hrm_performance_corrections identity_link WHERE identity_link.replacement_review_id=r.id AND identity_link.subject_user_id IS NOT p.user_id)";
export function readScope(user:WorkspaceUser):{sql:string;params:(string|number)[]}{return user.can("hrm.performance.manage")?{sql:"1=1",params:[]}:{sql:`(((?=1 AND p.user_id=?) OR (?=1 AND r.reviewer_user_id=?)) AND ${alignedPerformanceIdentity})`,params:[Number(user.can("hrm.performance.self")),user.id,Number(user.can("hrm.performance.review")),user.id]}}
export async function rawReview(db:D1Database,user:WorkspaceUser,reviewId:string):Promise<PerformanceReview>{
 live(user);const scope=readScope(user),row=await db.prepare(`${selectReview} WHERE r.id=? AND ${scope.sql}`).bind(reviewId,...scope.params).first<PerformanceReview>();if(!row||!allowed(user,row))throw new HrmError("not_found",404);return row;
}
