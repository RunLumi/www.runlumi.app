import type { APIRoute } from "astro";
import { envFromLocals } from "../../../lib/ats";
import { HrmError, revision, text } from "../../../lib/hrm/fields";
import { actOnPerformanceReview, createPerformanceReview, type PerformanceAction } from "../../../lib/hrm/performance";
import { createPerformanceCorrection } from "../../../lib/hrm/performance-corrections";
import { sameOrigin } from "../../../lib/http";
export const prerender=false;
// Three 4,000-character Vietnamese fields can exceed 32 KiB after form encoding.
const MAX_FORM_BYTES=128*1024;
async function readForm(request:Request):Promise<FormData>{
 const type=request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();if(type!=="application/x-www-form-urlencoded")throw new HrmError("invalid_form",415);
 const length=request.headers.get("content-length");if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_FORM_BYTES))throw new HrmError("request_too_large",413);
 const reader=request.body?.getReader();if(!reader)throw new HrmError("invalid_form",400);const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_FORM_BYTES){await reader.cancel().catch(()=>{});throw new HrmError("request_too_large",413)}chunks.push(value)}}catch(error){if(error instanceof HrmError)throw error;throw new HrmError("invalid_form",400)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 try{return await new Request(request.url,{method:"POST",headers:request.headers,body:bytes}).formData()}catch{throw new HrmError("invalid_form",400)}
}
function target(request:Request,value:string):URL{const url=new URL(value,request.url),path=url.pathname.startsWith("/vi/")?url.pathname.slice(3):url.pathname;if(url.origin!==new URL(request.url).origin||!new Set(["/hrm/performance","/hrm/me/performance"]).has(path))throw new HrmError("invalid_return",400);return url}
function redirect(url:URL,values:Record<string,string>):Response{for(const [key,value] of Object.entries(values))url.searchParams.set(key,value);return new Response(null,{status:303,headers:{Location:url.pathname+url.search,"Cache-Control":"private, no-store"}})}


export const POST:APIRoute=async context=>{
 const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
 if(!sameOrigin(context.request))return new Response("Invalid request origin",{status:400,headers:{"Cache-Control":"private, no-store"}});
 let returnUrl:URL|undefined;
 try{
  const form=await readForm(context.request);returnUrl=target(context.request,text(form,"return_to",300,true));
  const env=envFromLocals(context.locals),key=text(form,"request_key",100,true),intent=text(form,"intent",40,true);
  if(intent==="create_review"){
   const reviewId=await createPerformanceReview(env.DB,env.CONTENT_DB,user,key,{personId:text(form,"person_id",100,true),cycleCode:text(form,"cycle_code",48,true),title:text(form,"title",160,true),periodStart:text(form,"period_start",10,true),periodEnd:text(form,"period_end",10,true),dueOn:text(form,"due_on",10,true),reviewerId:text(form,"reviewer_user_id",100,true),objectives:text(form,"objectives",4000,true),evidenceInstructions:text(form,"evidence_instructions",2000,true)});
   returnUrl.searchParams.set("review",reviewId);
  }else if(intent==="create_correction"){
   const reviewId=await createPerformanceCorrection(env.DB,env.CONTENT_DB,user,key,{sourceId:text(form,"source_review_id",100,true),sourceRevision:revision(form,"source_revision"),cycleCode:text(form,"cycle_code",48,true),title:text(form,"title",160,true),periodStart:text(form,"period_start",10,true),periodEnd:text(form,"period_end",10,true),dueOn:text(form,"due_on",10,true),reviewerId:text(form,"reviewer_user_id",100,true),objectives:text(form,"objectives",4000,true),evidenceInstructions:text(form,"evidence_instructions",2000,true),reason:text(form,"reason",1000,true),selfMode:text(form,"self_mode",24,true)});
   returnUrl.searchParams.set("review",reviewId);
  }else{
   const actions=["submit_self","assess","request_changes","reassign","publish","respond","close","cancel"] as const;
   if(!actions.includes(intent as PerformanceAction))throw new HrmError("invalid_action",400);
   await actOnPerformanceReview(env.DB,env.CONTENT_DB,user,key,{action:intent as PerformanceAction,reviewId:text(form,"review_id",100,true),revision:revision(form,"revision"),assessment:text(form,"assessment",4000),evidence:text(form,"evidence",4000),developmentPlan:text(form,"development_plan",4000),feedback:text(form,"feedback",4000),acknowledged:text(form,"acknowledged",1)==="1",reviewerId:text(form,"reviewer_user_id",100),reason:text(form,"reason",1000),...(form.has("source_revision")||form.has("source_reviewed")?{sourceRevision:revision(form,"source_revision"),sourceReviewed:text(form,"source_reviewed",1)==="1"}:{})});
  }
  return redirect(returnUrl,{saved:intent});
 }catch(error){
  if(!returnUrl)try{returnUrl=target(context.request,context.request.headers.get("referer")??"/hrm/me/performance")}catch{}
  returnUrl??=new URL("/hrm/me/performance",context.request.url);
  return redirect(returnUrl,{error:error instanceof HrmError?error.message:"internal_error"});
 }
};
