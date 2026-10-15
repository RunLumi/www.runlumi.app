import type { APIRoute } from "astro";
import { envFromLocals } from "../../../lib/ats";
import { HrmError, revision, text } from "../../../lib/hrm/fields";
import { createServiceRequest, markNotificationRead, retryServiceOutbox, transitionServiceRequest } from "../../../lib/hrm/employee-services";
import { sameOrigin } from "../../../lib/http";

export const prerender=false;
const MAX_FORM_BYTES=48*1024;
async function readForm(request:Request):Promise<FormData>{
 const length=request.headers.get("content-length");if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_FORM_BYTES))throw new HrmError("request_too_large",413);
 const reader=request.body?.getReader();if(!reader)throw new HrmError("invalid_form",400);const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_FORM_BYTES){await reader.cancel().catch(()=>{});throw new HrmError("request_too_large",413)}chunks.push(value)}}catch(error){if(error instanceof HrmError)throw error;throw new HrmError("invalid_form",400)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 try{return await new Request(request.url,{method:"POST",headers:request.headers,body:bytes}).formData()}catch{throw new HrmError("invalid_form",400)}
}
function target(request:Request,value:string):URL{const url=new URL(value,request.url),path=url.pathname.startsWith("/vi/")?url.pathname.slice(3):url.pathname;if(url.origin!==new URL(request.url).origin||!new Set(["/hrm/me/requests","/hrm/requests","/hrm/notifications"]).has(path))throw new HrmError("invalid_return",400);return url}
function redirect(url:URL,values:Record<string,string>):Response{for(const [key,value] of Object.entries(values))url.searchParams.set(key,value);return new Response(null,{status:303,headers:{Location:url.pathname+url.search,"Cache-Control":"private, no-store"}})}
export const POST:APIRoute=async context=>{
 const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});if(!sameOrigin(context.request))return new Response("Invalid request origin",{status:400,headers:{"Cache-Control":"private, no-store"}});
 let returnUrl:URL|undefined;
 try{
  const form=await readForm(context.locals.hrmFormRequest??context.request);returnUrl=target(context.request,text(form,"return_to",400,true));
  const env=envFromLocals(context.locals),key=text(form,"request_key",100,true),intent=text(form,"intent",40,true);
  if(intent==="create_request")await createServiceRequest(env.DB,env.CONTENT_DB,user,key,{request_type:text(form,"request_type",40,true),subject:text(form,"subject",120,true),body:text(form,"body",3000,true)});
  else if(intent==="transition")await transitionServiceRequest(env.DB,env.CONTENT_DB,user,key,text(form,"request_id",100,true),revision(form),{action:text(form,"action",30,true),body:text(form,"body",3000,true),assignTo:text(form,"assign_to",100)});
  else if(intent==="mark_read")await markNotificationRead(env.DB,user,key,text(form,"notification_id",100,true),revision(form));
  else if(intent==="retry_outbox")await retryServiceOutbox(env.DB,user,key,text(form,"outbox_id",100,true));
  else throw new HrmError("invalid_action",400);
  return redirect(returnUrl,{saved:intent});
 }catch(error){
  if(!returnUrl)try{returnUrl=target(context.request,context.request.headers.get("referer")??(context.url.pathname.startsWith("/vi/")?"/vi/hrm/me/requests":"/hrm/me/requests"))}catch{returnUrl=new URL(context.url.pathname.startsWith("/vi/")?"/vi/hrm/me/requests":"/hrm/me/requests",context.request.url)}
  return redirect(returnUrl,{error:error instanceof HrmError?error.message:"internal_error"});
 }
};
