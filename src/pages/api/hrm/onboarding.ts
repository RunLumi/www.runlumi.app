import type { APIRoute, AstroGlobal } from "astro";
import { envFromLocals } from "../../../lib/ats";
import { HrmError, date, revision, text } from "../../../lib/hrm/fields";
import {
  actOnboardingTask,
  activateOnboardingPlan,
  activateOnboardingVersion,
  cancelOnboardingPlan,
  createOnboardingPlan,
  createOnboardingTemplate,
  createOnboardingVersion,
  rescheduleOnboardingPlan,
  reviewOnboardingVersion,
  saveOnboardingDraftVersion,
} from "../../../lib/hrm/onboarding";
import { sameOrigin } from "../../../lib/http";

export const prerender=false;
const MAX_FORM_BYTES=64*1024;
async function readBoundedForm(request:Request):Promise<FormData>{
  const type=request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();if(type!=="application/x-www-form-urlencoded")throw new HrmError("invalid_form",415);
  const length=request.headers.get("content-length");if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_FORM_BYTES))throw new HrmError("request_too_large",413);
  const reader=request.body?.getReader();if(!reader)throw new HrmError("invalid_form",400);const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_FORM_BYTES){await reader.cancel().catch(()=>{});throw new HrmError("request_too_large",413)}chunks.push(value)}}catch(error){if(error instanceof HrmError)throw error;throw new HrmError("invalid_form",400)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  try{return await new Request(request.url,{method:"POST",headers:request.headers,body:bytes}).formData()}catch{throw new HrmError("invalid_form",400)}
}
const allowedPaths=new Set(["/hrm/onboarding","/vi/hrm/onboarding","/hrm/me/onboarding","/vi/hrm/me/onboarding"]);
function returnPath(request:Request,value:string|undefined,user:NonNullable<AstroGlobal["locals"]["workspace"]>):URL{
  const fallback=user.can("hrm.onboarding.manage")?"/hrm/onboarding":"/hrm/me/onboarding",target=new URL(value||fallback,request.url);
  if(target.origin!==new URL(request.url).origin||!allowedPaths.has(target.pathname))throw new HrmError("invalid_return",400);
  return target;
}
function failure(error:unknown,lang:"en"|"vi",back:URL):Response{
  const code=error instanceof HrmError?error.message:"internal_error",status=error instanceof HrmError?error.status:500;
  const messages:Record<string,[string,string]>={
    invalid_onboarding_config:["Check the template fields and task dependency graph.","Hãy kiểm tra cấu hình mẫu và chuỗi phụ thuộc todo."],
    onboarding_dependency_cycle:["The template contains a task dependency cycle.","Mẫu có chu trình phụ thuộc giữa các todo."],
    onboarding_not_applicable:["This template does not apply to this employment period.","Mẫu này không áp dụng cho đợt làm việc này."],
    onboarding_template_inactive:["The template version must be reviewed and active.","Phiên bản mẫu phải được rà soát và kích hoạt."],
    onboarding_owner_required:["Assign every required task owner before creating the plan.","Hãy phân công đủ người phụ trách trước khi tạo kế hoạch."],
    onboarding_owner_unavailable:["An owner lacks the required active Workspace permission.","Người phụ trách thiếu quyền Workspace đang hoạt động."],
    onboarding_dependency_blocked:["Complete the prerequisite tasks first.","Hãy hoàn tất các todo phụ thuộc trước."],
    onboarding_plan_inactive:["This onboarding plan is not active.","Kế hoạch onboarding này không còn hoạt động."],
    evidence_pending:["The uploaded evidence is still waiting for review.","Bằng chứng tải lên vẫn đang chờ rà soát."],
    self_approval:["A person cannot approve their own submission or evidence.","Không thể tự duyệt nội dung hoặc bằng chứng của chính mình."],
    conflict:["This record changed. Reload it and review the latest version.","Hồ sơ đã đổi. Hãy tải lại và kiểm tra phiên bản mới nhất."],
    request_key_conflict:["This request key was already used for different content.","Mã yêu cầu này đã được dùng cho nội dung khác."],
    waiver_not_allowed:["This task cannot be waived by your role or the template policy.","Vai trò hoặc chính sách mẫu không cho phép miễn todo này."],
    hrm_closed:["HRM is not activated.","HRM chưa được kích hoạt."],
    invalid_transition:["The task state changed. Reload and try again.","Trạng thái todo đã đổi. Hãy tải lại và thử lại."],
    invalid_origin:["The request origin was rejected.","Nguồn gửi yêu cầu không hợp lệ."],
    invalid_request_key:["The request key is invalid.","Mã yêu cầu không hợp lệ."],
  };
  const message=messages[code]?.[lang==="vi"?1:0]??(lang==="vi"?"Không thể hoàn tất yêu cầu này.":"Could not complete this request.");
  const title=lang==="vi"?"Chưa hoàn tất":"Could not complete";
  return new Response(`<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui;max-width:640px;margin:10vh auto;padding:0 20px;line-height:1.6"><main><h1>${title}</h1><p>${message}</p><a href="${back.pathname+back.search}">${lang==="vi"?"Quay lại onboarding":"Back to onboarding"}</a></main></body></html>`,{status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
export const POST:APIRoute=async context=>{
  const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
  if(!sameOrigin(context.request))return new Response("Invalid request origin",{status:400,headers:{"Cache-Control":"private, no-store"}});
  const lang=context.url.pathname.startsWith("/vi/")?"vi":"en";
  let back:URL;try{const form=await readBoundedForm(context.request);back=returnPath(context.request,text(form,"return_to",300)||context.request.headers.get("referer")||undefined,user);const env=envFromLocals(context.locals),intent=text(form,"intent",40,true),key=text(form,"request_key",100,true);
    if(intent==="create_template")await createOnboardingTemplate(env.DB,user,key,{template_key:text(form,"template_key",80,true).toLowerCase(),title_en:text(form,"title_en",200,true),title_vi:text(form,"title_vi",200,true),applicability_json:text(form,"applicability_json",20000,true),tasks_json:text(form,"tasks_json",48000,true)});
    else if(intent==="create_version")await createOnboardingVersion(env.DB,user,key,text(form,"template_id",100,true),revision(form,"template_version"));
    else if(intent==="save_version")await saveOnboardingDraftVersion(env.DB,user,key,text(form,"version_id",100,true),revision(form),text(form,"applicability_json",20000,true),text(form,"tasks_json",48000,true));
    else if(intent==="review_version"){const decision=text(form,"decision",10,true);if(decision!=="approve"&&decision!=="reject")throw new HrmError("invalid_decision");await reviewOnboardingVersion(env.DB,user,key,text(form,"version_id",100,true),revision(form),decision==="approve",text(form,"reason",500,true));}
    else if(intent==="activate_version")await activateOnboardingVersion(env.DB,user,key,text(form,"version_id",100,true),revision(form));
    else if(intent==="create_plan")await createOnboardingPlan(env.DB,env.CONTENT_DB,user,key,{personId:text(form,"person_id",100,true),templateId:text(form,"template_id",100,true),buddyUserId:text(form,"buddy_user_id",100)||null,hrOwnerUserId:text(form,"hr_owner_user_id",100)||null,adminOwnerUserId:text(form,"admin_owner_user_id",100)||null});
    else if(intent==="activate_plan")await activateOnboardingPlan(env.DB,env.CONTENT_DB,user,key,text(form,"plan_id",100,true),revision(form));
    else if(intent==="cancel_plan")await cancelOnboardingPlan(env.DB,user,key,text(form,"plan_id",100,true),revision(form),text(form,"reason",500,true));
    else if(intent==="preview_reschedule"){const target=new URL(back);target.searchParams.set("preview_plan",text(form,"plan_id",100,true));target.searchParams.set("preview_start",date(text(form,"new_start",10,true))!);return new Response(null,{status:303,headers:{Location:target.pathname+target.search,"Cache-Control":"private, no-store"}});}
    else if(intent==="reschedule"){if(form.get("confirm")!=="1")throw new HrmError("confirmation_required",400);await rescheduleOnboardingPlan(env.DB,user,key,text(form,"plan_id",100,true),revision(form),date(text(form,"new_start",10,true))!);}
    else if(intent==="task_action"){const action=text(form,"action",30,true);if(!["start","submit","complete","block","unblock","verify","reject","waive","reassign","reassign_verifier"].includes(action))throw new HrmError("invalid_action");await actOnboardingTask(env.DB,env.CONTENT_DB,user,key,text(form,"task_id",100,true),revision(form),{action:action as "start"|"submit"|"complete"|"block"|"unblock"|"verify"|"reject"|"waive"|"reassign"|"reassign_verifier",text:text(form,"submission_text",4000),reason:text(form,"reason",1000),assigneeUserId:text(form,"assignee_user_id",100)||undefined});}
    else throw new HrmError("invalid_action");
    if(form.has("selected"))back.searchParams.set("selected",text(form,"selected",200));
    const saved=intent==="create_template"?"template_created":intent==="create_version"?"version_created":intent==="save_version"?"version_saved":intent==="review_version"?(form.get("decision")==="approve"?"version_reviewed":"version_rejected"):intent==="activate_version"?"version_activated":intent==="create_plan"?"plan_created":intent==="activate_plan"?"plan_activated":intent==="cancel_plan"?"plan_cancelled":intent==="reschedule"?"dates_rescheduled":intent==="task_action"?"task_updated":intent;
    back.searchParams.set("saved",saved);return new Response(null,{status:303,headers:{Location:back.pathname+back.search,"Cache-Control":"private, no-store"}});
  }catch(error){
    try{back=returnPath(context.request,undefined,user)}catch{back=new URL(user.can("hrm.onboarding.manage")?"/hrm/onboarding":"/hrm/me/onboarding",context.request.url)}
    return failure(error,lang,back);
  }
};
