import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../../lib/ats";
import { HrmError, revision, text } from "../../../../../lib/hrm/fields";
import { readLegalForm } from "../../../../../lib/hrm/legal-files";
import { uploadLeaveEvidence } from "../../../../../lib/hrm/leave-evidence";
import { sameOrigin } from "../../../../../lib/http";

export const prerender=false;
function returnTarget(request:Request,value:string):URL{const target=new URL(value,request.url),path=target.pathname.startsWith("/vi/")?target.pathname.slice(3):target.pathname;if(target.origin!==new URL(request.url).origin||!new Set(["/hrm/me/leave","/hrm/leave"]).has(path))throw new HrmError("invalid_return",400);return target;}
function redirect(target:URL,values:Record<string,string>):Response{for(const [key,value] of Object.entries(values))target.searchParams.set(key,value);return new Response(null,{status:303,headers:{Location:target.pathname+target.search+target.hash,"Cache-Control":"private, no-store"}});}
export const POST:APIRoute=async context=>{
 const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
 if(!sameOrigin(context.request))return new Response("Invalid origin",{status:400,headers:{"Cache-Control":"private, no-store"}});
 let target:URL|undefined;
 try{
  const form=await readLegalForm(context.request),intent=text(form,"intent",20,true);target=returnTarget(context.request,text(form,"return_to",300,true));
  if(intent!=="upload")throw new HrmError("invalid_action",400);
  const file=form.get("file");if(!(file instanceof File))throw new HrmError("file_required");
  const env=envFromLocals(context.locals),requestId=text(form,"request_id",100,true),fileId=await uploadLeaveEvidence(env.DB,env.FILES,user,text(form,"request_key",100,true),requestId,revision(form,"request_version"),file);
  return redirect(target,{saved:"leave_evidence_uploaded",request_id:requestId,file_id:fileId});
 }catch(error){
  if(!target)try{const referer=context.request.headers.get("referer"),source=new URL(referer??"/hrm/me/leave",context.request.url);target=returnTarget(context.request,source.pathname+source.search+source.hash)}catch{}
  target??=new URL(context.url.pathname.startsWith("/vi/")?"/vi/hrm/me/leave":"/hrm/me/leave",context.request.url);
  return redirect(target,{error:error instanceof HrmError?error.message:"internal_error"});
 }
};
