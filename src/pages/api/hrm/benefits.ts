import type { APIRoute } from "astro";
import { envFromLocals } from "../../../lib/ats";
import { HrmError, revision, text } from "../../../lib/hrm/fields";
import { activateBenefitPlan, cancelBenefitEnrollment, createBenefitPlan, decideBenefitEnrollment, submitBenefitEnrollment } from "../../../lib/hrm/benefits";
import { sameOrigin } from "../../../lib/http";

export const prerender=false;
const MAX_FORM_BYTES=32*1024;
async function readForm(request:Request):Promise<FormData>{
 const type=request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();if(type!=="application/x-www-form-urlencoded")throw new HrmError("invalid_form",415);
 const length=request.headers.get("content-length");if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_FORM_BYTES))throw new HrmError("request_too_large",413);
 const reader=request.body?.getReader();if(!reader)throw new HrmError("invalid_form",400);const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_FORM_BYTES){await reader.cancel().catch(()=>{});throw new HrmError("request_too_large",413)}chunks.push(value)}}catch(error){if(error instanceof HrmError)throw error;throw new HrmError("invalid_form",400)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 try{return await new Request(request.url,{method:"POST",headers:request.headers,body:bytes}).formData()}catch{throw new HrmError("invalid_form",400)}
}
function target(request:Request,value:string):URL{const url=new URL(value,request.url),path=url.pathname.startsWith("/vi/")?url.pathname.slice(3):url.pathname;if(url.origin!==new URL(request.url).origin||!new Set(["/hrm/benefits","/hrm/me/benefits"]).has(path))throw new HrmError("invalid_return",400);return url}
function redirect(url:URL,values:Record<string,string>):Response{for(const [key,value] of Object.entries(values))url.searchParams.set(key,value);return new Response(null,{status:303,headers:{Location:url.pathname+url.search,"Cache-Control":"private, no-store"}})}

export const POST:APIRoute=async context=>{
 const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
 if(!sameOrigin(context.request))return new Response("Invalid request origin",{status:400,headers:{"Cache-Control":"private, no-store"}});
 let returnUrl:URL|undefined;
 try{
  const form=await readForm(context.request);returnUrl=target(context.request,text(form,"return_to",300,true));
  const env=envFromLocals(context.locals),key=text(form,"request_key",100,true),intent=text(form,"intent",40,true);
  if(intent==="create_plan")await createBenefitPlan(env.DB,user,key,{planCode:text(form,"plan_code",48,true),legalEntity:text(form,"legal_entity",200,true),category:text(form,"category",20,true),name:text(form,"name",120,true),description:text(form,"description",2000,true),eligibilityText:text(form,"eligibility_text",2000,true),effectiveFrom:text(form,"effective_from",10,true),effectiveTo:text(form,"effective_to",10,true)});
  else if(intent==="activate_plan")await activateBenefitPlan(env.DB,user,key,text(form,"plan_id",100,true),revision(form,"plan_revision"),text(form,"reason",1000,true));
  else if(intent==="submit_enrollment")await submitBenefitEnrollment(env.DB,user,key,text(form,"plan_id",100,true),text(form,"employee_note",1000));
  else if(intent==="decide_enrollment")await decideBenefitEnrollment(env.DB,user,key,text(form,"enrollment_id",100,true),revision(form,"enrollment_revision"),text(form,"decision",20,true),text(form,"reason",1000,true));
  else if(intent==="cancel_enrollment")await cancelBenefitEnrollment(env.DB,user,key,text(form,"enrollment_id",100,true),revision(form,"enrollment_revision"),text(form,"reason",1000,true));
  else throw new HrmError("invalid_action",400);
  return redirect(returnUrl,{saved:intent});
 }catch(error){
  if(!returnUrl)try{returnUrl=target(context.request,context.request.headers.get("referer")??(context.url.pathname.startsWith("/vi/")?"/vi/hrm/me/benefits":"/hrm/me/benefits"))}catch{}
  returnUrl??=new URL(context.url.pathname.startsWith("/vi/")?"/vi/hrm/me/benefits":"/hrm/me/benefits",context.request.url);
  return redirect(returnUrl,{error:error instanceof HrmError?error.message:"internal_error"});
 }
};
