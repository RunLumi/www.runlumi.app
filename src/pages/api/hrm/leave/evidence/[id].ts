import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../../lib/ats";
import { HrmError, revision, text } from "../../../../../lib/hrm/fields";
import { downloadLeaveEvidence, reviewLeaveEvidence } from "../../../../../lib/hrm/leave-evidence";
import { sameOrigin } from "../../../../../lib/http";

export const prerender=false;
const MAX_FORM_BYTES=48*1024;
async function formBody(request:Request):Promise<FormData>{
 const type=request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();if(type!=="application/x-www-form-urlencoded")throw new HrmError("invalid_form",415);
 const length=request.headers.get("content-length");if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_FORM_BYTES))throw new HrmError("request_too_large",413);
 const reader=request.body?.getReader();if(!reader)throw new HrmError("invalid_form",400);const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_FORM_BYTES){await reader.cancel().catch(()=>{});throw new HrmError("request_too_large",413)}chunks.push(value)}}catch(error){if(error instanceof HrmError)throw error;throw new HrmError("invalid_form",400)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 try{return await new Request(request.url,{method:"POST",headers:request.headers,body:bytes}).formData()}catch{throw new HrmError("invalid_form",400)}
}
function returnTarget(request:Request,value:string):URL{const target=new URL(value,request.url),path=target.pathname.startsWith("/vi/")?target.pathname.slice(3):target.pathname;if(target.origin!==new URL(request.url).origin||!new Set(["/hrm/me/leave","/hrm/leave"]).has(path))throw new HrmError("invalid_return",400);return target;}
function redirect(target:URL,values:Record<string,string>):Response{for(const [key,value] of Object.entries(values))target.searchParams.set(key,value);return new Response(null,{status:303,headers:{Location:target.pathname+target.search+target.hash,"Cache-Control":"private, no-store"}});}
export const GET:APIRoute=async context=>{
 const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
 const env=envFromLocals(context.locals);try{return await downloadLeaveEvidence(env.DB,env.FILES,user,context.params.id??"")}
 catch(error){const hrm=error instanceof HrmError?error:null;return new Response(hrm?.message??"Leave evidence unavailable",{status:hrm?.status??500,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}})}
};
export const POST:APIRoute=async context=>{
 const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});if(!sameOrigin(context.request))return new Response("Invalid origin",{status:400,headers:{"Cache-Control":"private, no-store"}});
 let target:URL|undefined;
 try{
  const form=await formBody(context.request);target=returnTarget(context.request,text(form,"return_to",300,true));
  const intent=text(form,"intent",20,true);if(intent!=="review")throw new HrmError("invalid_action",400);
  const decision=text(form,"decision",10,true);if(decision!=="approve"&&decision!=="reject")throw new HrmError("invalid_decision");
  const env=envFromLocals(context.locals),requestId=text(form,"request_id",100,true);
  await reviewLeaveEvidence(env.DB,user,text(form,"request_key",100,true),context.params.id??"",revision(form,"request_version"),revision(form,"file_version"),decision==="approve",text(form,"reason",500,true));
  return redirect(target,{saved:"leave_evidence_reviewed",request_id:requestId});
 }catch(error){
  if(!target)try{const referer=context.request.headers.get("referer"),source=new URL(referer??"/hrm/leave",context.request.url);target=returnTarget(context.request,source.pathname+source.search+source.hash)}catch{}
  target??=new URL(context.url.pathname.startsWith("/vi/")?"/vi/hrm/leave":"/hrm/leave",context.request.url);
  return redirect(target,{error:error instanceof HrmError?error.message:"internal_error"});
 }
};
