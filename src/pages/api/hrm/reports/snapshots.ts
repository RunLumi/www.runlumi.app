import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../lib/ats";
import { HrmError, text } from "../../../../lib/hrm/fields";
import { saveReportSnapshot } from "../../../../lib/hrm/report-snapshots";
import { readLegalForm } from "../../../../lib/hrm/legal-files";
import { sameOrigin } from "../../../../lib/http";

export const prerender=false;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};

function returnUrl(request:Request,value:string):URL{
  const url=new URL(value,request.url),path=url.pathname.startsWith("/vi/")?url.pathname.slice(3):url.pathname;
  if(url.origin!==new URL(request.url).origin||path!=="/hrm/reports")throw new HrmError("invalid_return",400);return url;
}
function redirect(url:URL,values:Record<string,string>):Response{
  for(const [key,value] of Object.entries(values))url.searchParams.set(key,value);
  return new Response(null,{status:303,headers:{...headers,Location:url.pathname+url.search}});
}

export const POST:APIRoute=async context=>{
  const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers});
  if(!sameOrigin(context.request))return new Response("Invalid request origin",{status:400,headers});
  let back:URL|undefined;
  try{
    const form=await readLegalForm(context.locals.hrmFormRequest??context.request),env=envFromLocals(context.locals);
    back=returnUrl(context.request,text(form,"return_to",400,true));
    const rawDepartment=form.get("department"),department=typeof rawDepartment==="string"?rawDepartment:null;
    const snapshotRef=await saveReportSnapshot(env.DB,env.CONTENT_DB,user,text(form,"request_key",100,true),{period:text(form,"period",7,true),department},{policyRef:text(form,"policy_ref",120,true)});
    return redirect(back,{saved:"report_snapshot_saved",snapshot:snapshotRef});
  }catch(error){
    if(!(error instanceof HrmError))console.error("hrm_report_snapshot_save_failed",error instanceof Error?error.name:"unknown");
    if(!back)try{back=returnUrl(context.request,context.request.headers.get("referer")??(context.url.pathname.startsWith("/vi/")?"/vi/hrm/reports":"/hrm/reports"))}catch{}
    back??=new URL(context.url.pathname.startsWith("/vi/")?"/vi/hrm/reports":"/hrm/reports",context.request.url);
    return redirect(back,{error:error instanceof HrmError?error.message:"internal_error"});
  }
};
