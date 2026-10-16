import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../lib/ats";
import { HrmError, revision, text } from "../../../../lib/hrm/fields";
import { readLegalForm } from "../../../../lib/hrm/legal-files";
import { reviewAssetEvidence, uploadAssetEvidence } from "../../../../lib/hrm/asset-attachments";
import { sameOrigin } from "../../../../lib/http";

export const prerender=false;

function target(request:Request,value:string):URL{
  const url=new URL(value,request.url),path=url.pathname.startsWith("/vi/")?url.pathname.slice(3):url.pathname;
  if(url.origin!==new URL(request.url).origin||!new Set(["/hrm/assets","/hrm/me/assets"]).has(path))throw new HrmError("invalid_return",400);
  return url;
}

function redirect(url:URL,values:Record<string,string>):Response{
  for(const [key,value] of Object.entries(values))url.searchParams.set(key,value);
  return new Response(null,{status:303,headers:{Location:url.pathname+url.search,"Cache-Control":"private, no-store"}});
}

export const POST:APIRoute=async context=>{
  const user=context.locals.workspace;
  if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
  if(!sameOrigin(context.request))return new Response("Invalid request origin",{status:400,headers:{"Cache-Control":"private, no-store"}});
  let returnUrl:URL|undefined;
  try{
    const form=await readLegalForm(context.locals.hrmFormRequest??context.request);
    returnUrl=target(context.request,text(form,"return_to",400,true));
    const env=envFromLocals(context.locals),key=text(form,"request_key",100,true),intent=text(form,"intent",40,true);
    if(intent==="upload_evidence"){
      const file=form.get("file");if(!(file instanceof File))throw new HrmError("asset_evidence_file_required",400);
      const evidenceId=await uploadAssetEvidence(env.DB,env.FILES,user,key,text(form,"assignment_id",100,true),revision(form,"version"),text(form,"evidence_type",20,true),file);
      return redirect(returnUrl,{saved:"asset_evidence_uploaded",evidence_id:evidenceId});
    }
    if(intent==="review_evidence"){
      const decision=text(form,"decision",20,true);if(decision!=="approve"&&decision!=="reject")throw new HrmError("asset_evidence_decision_invalid",400);
      await reviewAssetEvidence(env.DB,user,key,text(form,"evidence_id",100,true),revision(form,"file_version"),decision,text(form,"reason",500,true));
      return redirect(returnUrl,{saved:decision==="approve"?"asset_evidence_reviewed":"asset_evidence_rejected"});
    }
    throw new HrmError("invalid_action",400);
  }catch(error){
    if(!(error instanceof HrmError))console.error("hrm_asset_evidence_request_failed",error instanceof Error?error.name:"unknown");
    if(!returnUrl)try{returnUrl=target(context.request,context.request.headers.get("referer")??(context.url.pathname.startsWith("/vi/")?"/vi/hrm/assets":"/hrm/assets"))}catch{}
    returnUrl??=new URL(context.url.pathname.startsWith("/vi/")?"/vi/hrm/assets":"/hrm/assets",context.request.url);
    return redirect(returnUrl,{error:error instanceof HrmError?error.message:"internal_error"});
  }
};
