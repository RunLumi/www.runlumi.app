import type { APIRoute } from "astro";
import { envFromLocals } from "../../../lib/ats";
import { sameOrigin } from "../../../lib/http";
import { HrmError, revision } from "../../../lib/hrm/fields";
import { readLegalForm } from "../../../lib/hrm/legal-files";
import { prepareCloseoutDossier, reviewCloseoutDossier, reopenCloseoutReview, uploadCloseoutFile, reviewCloseoutFile } from "../../../lib/hrm/closeout-dossiers";
export const prerender=false;
function field(form:FormData,name:string,max=120,required=false){const values=form.getAll(name);if(values.length>1||values.some(v=>typeof v!=="string"))throw new HrmError("invalid_field",400);const value=String(values[0]??"").trim();if(value.length>max||required&&!value)throw new HrmError("invalid_field",400);return value}
function files(form:FormData,name:string){const values=form.getAll(name);if(values.length>5||values.some(v=>typeof v!=="string"||!(/^[A-Za-z0-9_-]{1,120}$/).test(v)))throw new HrmError("closeout_evidence_invalid",400);return values as string[]}
export const POST:APIRoute=async context=>{
 const user=context.locals.workspace,headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
 if(!user||!user.can("hrm.offboarding.manage")||!user.can("hrm.payroll.approve"))return new Response("Forbidden",{status:403,headers});if(user.hrmEnabled!==true)return new Response("HRM is not activated",{status:503,headers});if(!sameOrigin(context.request))return new Response("Invalid origin",{status:400,headers});
 let target="/hrm/offboarding";
 try{const referrer=new URL(context.request.headers.get("referer")??"",context.request.url);if(referrer.origin===new URL(context.request.url).origin&&/^\/(?:vi\/)?hrm\/offboarding\/[A-Za-z0-9_-]{1,120}$/.test(referrer.pathname))target=referrer.pathname}catch{/* A malformed referrer never chooses a return target. */}
 try{
  const multipart=context.request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data");
  const form=await readLegalForm(context.request,multipart?5*1024*1024+256*1024:64*1024),caseId=field(form,"case_id",120,true);
  if(!/^[A-Za-z0-9_-]+$/.test(caseId))throw new HrmError("not_found",404);
  const lang=field(form,"lang",2);if(lang!==""&&lang!=="en"&&lang!=="vi")throw new HrmError("invalid_field",400);
  target=`${lang==="vi"?"/vi":""}/hrm/offboarding/${encodeURIComponent(caseId)}`;
  const intent=field(form,"intent",30,true),key=field(form,"request_key",100,true),env=envFromLocals(context.locals);
  if(intent==="upload_file"){
   const values=form.getAll("file");if(values.length!==1||!(values[0] instanceof File))throw new HrmError("invalid_file",400);
   await uploadCloseoutFile(env.DB,env.CONTENT_DB,env.FILES,user,key,caseId,values[0]);
  }else if(intent==="review_file"){
   const decision=field(form,"decision",10,true);if(decision!=="reviewed"&&decision!=="rejected")throw new HrmError("invalid_action",400);
   await reviewCloseoutFile(env.DB,env.CONTENT_DB,env.FILES,user,key,{caseId,fileId:field(form,"file_id",120,true),version:revision(form),decision,reason:field(form,"reason",1000,true)});
  }else if(intent==="prepare"){
   const checks=[];for(const name of form.keys())if(name.startsWith("check_")&&!/^check_(?:[0-9]|[12][0-9])_(?:key|outcome|reason|files)$/.test(name))throw new HrmError("closeout_checks_required",400);
   for(let i=0;i<30;i++){const id=field(form,`check_${i}_key`,48),outcome=field(form,`check_${i}_outcome`,20),reason=field(form,`check_${i}_reason`,1000),proof=files(form,`check_${i}_files`);if(id||outcome||reason||proof.length)checks.push({key:id,outcome,reason,file_ids:proof})}
   const source=field(form,"source_revision",16,true);if(!/^[1-9][0-9]*$/.test(source)||!Number.isSafeInteger(Number(source)))throw new HrmError("closeout_invalid",400);
   await prepareCloseoutDossier(env.DB,env.CONTENT_DB,env.FILES,user,key,{caseId,policyId:field(form,"policy_id",120,true),sourceRevision:Number(source),checks,noPayrollEvidence:files(form,"no_payroll_files")});
  }else if(intent==="reopen"){
   await reopenCloseoutReview(env.DB,env.CONTENT_DB,user,key,{caseId,dossierId:field(form,"dossier_id",120,true),version:revision(form),reason:field(form,"reason",1000,true),confirmed:field(form,"confirmed",1)==="1"});
  }else if(intent==="review"){
   const decision=field(form,"decision",10,true);if(decision!=="approve"&&decision!=="reject")throw new HrmError("invalid_action",400);
   await reviewCloseoutDossier(env.DB,env.CONTENT_DB,env.FILES,user,key,{caseId,dossierId:field(form,"dossier_id",120,true),version:revision(form),decision,reason:field(form,"reason",1000,true),confirmed:field(form,"confirmed",1)==="1"});
  }else throw new HrmError("invalid_action",400);
  return new Response(null,{status:303,headers:{...headers,Location:target+"?saved=1"}});
 }catch(error){
  if(target==="/hrm/offboarding")return new Response(error instanceof HrmError?error.message:"Internal error",{status:error instanceof HrmError?error.status:500,headers:{...headers,"Content-Type":"text/plain; charset=utf-8"}});
  return new Response(null,{status:303,headers:{...headers,Location:target+"?error="+encodeURIComponent(error instanceof HrmError?error.message:"internal_error")}})
 }
};
