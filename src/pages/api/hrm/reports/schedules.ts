import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../lib/ats";
import { HrmError, revision, text } from "../../../../lib/hrm/fields";
import { createReportSchedule, setReportScheduleState } from "../../../../lib/hrm/report-snapshots";
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
    const intent=text(form,"intent",32,true),key=text(form,"request_key",100,true);
    if(intent==="create_schedule"){
      const daysText=text(form,"retention_days",8,true);if(!/^\d{1,5}$/.test(daysText))throw new HrmError("report_retention_invalid",400);
      const rawDepartment=form.get("department"),department=typeof rawDepartment==="string"?rawDepartment:null;
      await createReportSchedule(env.DB,user,key,{cadence:text(form,"cadence",12,true),department,retention_days:Number(daysText),retention_basis:text(form,"retention_basis",1000,true)});
      return redirect(back,{saved:"report_schedule_created"});
    }
    if(intent==="set_schedule_state"){
      const action=text(form,"action",16,true);if(action!=="pause"&&action!=="resume"&&action!=="retire")throw new HrmError("report_schedule_action_invalid",400);
      const state=action==="pause"?"paused":action==="retire"?"retired":"active";
      await setReportScheduleState(env.DB,user,key,text(form,"schedule_ref",100,true),revision(form),state);
      return redirect(back,{saved:action==="pause"?"report_schedule_paused":action==="retire"?"report_schedule_retired":"report_schedule_resumed"});
    }
    throw new HrmError("invalid_action",400);
  }catch(error){
    if(!(error instanceof HrmError))console.error("hrm_report_schedule_request_failed",error instanceof Error?error.name:"unknown");
    if(!back)try{back=returnUrl(context.request,context.request.headers.get("referer")??(context.url.pathname.startsWith("/vi/")?"/vi/hrm/reports":"/hrm/reports"))}catch{}
    back??=new URL(context.url.pathname.startsWith("/vi/")?"/vi/hrm/reports":"/hrm/reports",context.request.url);
    return redirect(back,{error:error instanceof HrmError?error.message:"internal_error"});
  }
};
