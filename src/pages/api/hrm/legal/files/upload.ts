import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../../lib/ats";
import { HrmError, text } from "../../../../../lib/hrm/fields";
import { uploadLegalFile } from "../../../../../lib/hrm/legal";
import { readLegalForm } from "../../../../../lib/hrm/legal-files";
import { sameOrigin } from "../../../../../lib/http";

export const prerender=false;
function safeReturnTo(request:Request,value:string):URL{
 const local=new URL(value,request.url),origin=new URL(request.url).origin,path=local.pathname.startsWith("/vi/")?local.pathname.slice(3):local.pathname;
 if(local.origin!==origin||!(path==="/hrm/documents"||path==="/hrm/me/documents"||/^\/hrm\/me\/documents\/[A-Za-z0-9_-]+$/.test(path)||path==="/hrm/me/coi"||/^\/hrm\/me\/coi\/[A-Za-z0-9_-]+$/.test(path)||path==="/hrm/me/onboarding"||path==="/hrm/onboarding"||/^\/hrm\/documents\/issues\/[A-Za-z0-9_-]+$/.test(path)||/^\/hrm\/coi\/[A-Za-z0-9_-]+$/.test(path)))throw new HrmError("invalid_return",400);
 return local;
}
export const POST:APIRoute=async context=>{
 const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
 if(!sameOrigin(context.request))return new Response("Invalid request origin",{status:400,headers:{"Cache-Control":"private, no-store"}});
 try{
  const form=await readLegalForm(context.request),kind=text(form,"kind",20,true);if(kind!=="docx_source"&&kind!=="pdf_evidence")throw new HrmError("invalid_file_kind");
  const local=safeReturnTo(context.request,text(form,"return_to",300,true));
  const file=form.get("file");if(!(file instanceof File))throw new HrmError("file_required");const env=envFromLocals(context.locals);
  let fileId:string;
  if(kind==="docx_source")fileId=await uploadLegalFile(env.DB,env.FILES,user,text(form,"request_key",100,true),file,{kind,templateId:text(form,"template_id",100,true)});
  else{
   const issueId=text(form,"issue_id",100),coiDeclarationId=text(form,"coi_declaration_id",100),onboardingTaskId=text(form,"onboarding_task_id",100);
   if([issueId,coiDeclarationId,onboardingTaskId].filter(Boolean).length!==1)throw new HrmError("invalid_file_target");
   fileId=issueId
    ?await uploadLegalFile(env.DB,env.FILES,user,text(form,"request_key",100,true),file,{kind,issueId})
    :coiDeclarationId
      ?await uploadLegalFile(env.DB,env.FILES,user,text(form,"request_key",100,true),file,{kind,coiDeclarationId})
      :await uploadLegalFile(env.DB,env.FILES,user,text(form,"request_key",100,true),file,{kind,onboardingTaskId});
  }
  local.searchParams.set("file",fileId);return new Response(null,{status:303,headers:{Location:local.pathname+local.search,"Cache-Control":"private, no-store"}});
 }catch(error){const hrm=error instanceof HrmError?error:null;return new Response(hrm?.message??"Legal file upload failed",{status:hrm?.status??500,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}})}
};
