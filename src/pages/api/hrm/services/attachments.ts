import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../lib/ats";
import { HrmError, text } from "../../../../lib/hrm/fields";
import { uploadServiceAttachment } from "../../../../lib/hrm/service-attachments";
import { readLegalForm } from "../../../../lib/hrm/legal-files";
import { sameOrigin } from "../../../../lib/http";

export const prerender=false;
function target(request:Request,value:string):URL{
 const url=new URL(value,request.url),path=url.pathname.startsWith("/vi/")?url.pathname.slice(3):url.pathname;
 if(url.origin!==new URL(request.url).origin||!new Set(["/hrm/me/requests","/hrm/requests"]).has(path))throw new HrmError("invalid_return",400);
 return url;
}
function redirect(url:URL,values:Record<string,string>):Response{for(const [key,value] of Object.entries(values))url.searchParams.set(key,value);return new Response(null,{status:303,headers:{Location:url.pathname+url.search,"Cache-Control":"private, no-store"}})}

export const POST:APIRoute=async context=>{
 const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
 if(!sameOrigin(context.request))return new Response("Invalid request origin",{status:400,headers:{"Cache-Control":"private, no-store"}});
 let returnUrl:URL|undefined;
 try{
  const form=await readLegalForm(context.locals.hrmFormRequest??context.request);returnUrl=target(context.request,text(form,"return_to",400,true));
  const file=form.get("file");if(!(file instanceof File))throw new HrmError("file_required",400);
  const env=envFromLocals(context.locals),attachmentId=await uploadServiceAttachment(env.DB,env.CONTENT_DB,env.FILES,user,text(form,"request_key",100,true),text(form,"request_id",100,true),file);
  return redirect(returnUrl,{saved:"attachment_uploaded",attachment_id:attachmentId});
 }catch(error){
  if(!returnUrl)try{returnUrl=target(context.request,context.request.headers.get("referer")??(context.url.pathname.startsWith("/vi/")?"/vi/hrm/me/requests":"/hrm/me/requests"))}catch{}
  returnUrl??=new URL(context.url.pathname.startsWith("/vi/")?"/vi/hrm/me/requests":"/hrm/me/requests",context.request.url);
  return redirect(returnUrl,{error:error instanceof HrmError?error.message:"internal_error"});
 }
};
