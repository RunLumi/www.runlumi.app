import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../../lib/ats";
import { HrmError, text } from "../../../../../lib/hrm/fields";
import { downloadLegalFile, reviewLegalFile } from "../../../../../lib/hrm/legal";
import { sameOrigin } from "../../../../../lib/http";

export const prerender=false;
function safeReturnTo(request:Request,value:string):URL{
 const local=new URL(value,request.url),origin=new URL(request.url).origin,path=local.pathname.startsWith("/vi/")?local.pathname.slice(3):local.pathname;
 if(local.origin!==origin||!(path==="/hrm/documents"||path==="/hrm/me/documents"||/^\/hrm\/me\/documents\/[A-Za-z0-9_-]+$/.test(path)||path==="/hrm/me/coi"||/^\/hrm\/me\/coi\/[A-Za-z0-9_-]+$/.test(path)||path==="/hrm/me/onboarding"||path==="/hrm/onboarding"||/^\/hrm\/documents\/issues\/[A-Za-z0-9_-]+$/.test(path)||/^\/hrm\/coi\/[A-Za-z0-9_-]+$/.test(path)))throw new HrmError("invalid_return",400);
 return local;
}
export const GET:APIRoute=async context=>{
 const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
 const env=envFromLocals(context.locals);
 try{return await downloadLegalFile(env.DB,env.FILES,user,context.params.id??"")}
 catch(error){const hrm=error instanceof HrmError?error:null;return new Response(hrm?.message??"Legal file unavailable",{status:hrm?.status??500,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}})}
};
export const POST:APIRoute=async context=>{
 const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
 if(!sameOrigin(context.request))return new Response("Invalid request origin",{status:400,headers:{"Cache-Control":"private, no-store"}});
 try{
  const form=await context.request.formData();if(text(form,"intent",20,true)!=="review")throw new HrmError("invalid_action");const local=safeReturnTo(context.request,text(form,"return_to",300,true));
  const env=envFromLocals(context.locals);await reviewLegalFile(env.DB,user,text(form,"request_key",100,true),context.params.id??"",Number(text(form,"version",10,true)),text(form,"decision",10,true) as "reviewed"|"rejected",text(form,"reason",500,true));
  local.searchParams.set("saved","file_reviewed");return new Response(null,{status:303,headers:{Location:local.pathname+local.search,"Cache-Control":"private, no-store"}});
 }catch(error){const hrm=error instanceof HrmError?error:null;return new Response(hrm?.message??"Legal file review failed",{status:hrm?.status??500,headers:{"Cache-Control":"private, no-store"}})}
};
