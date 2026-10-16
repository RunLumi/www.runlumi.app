import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../lib/ats";
import { HrmError, revision, text } from "../../../../lib/hrm/fields";
import { activateTrainingReminderPolicy, createTrainingReminderPolicy, markTrainingReminderRead, reviewTrainingReminderPolicy, runHrmTrainingReminderSweep } from "../../../../lib/hrm/training-reminders";
import { readLegalForm } from "../../../../lib/hrm/legal-files";
import { sameOrigin } from "../../../../lib/http";

export const prerender=false;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};

function returnUrl(request:Request,value:string):URL{
  const url=new URL(value,request.url),path=url.pathname.startsWith("/vi/")?url.pathname.slice(3):url.pathname;
  if(url.origin!==new URL(request.url).origin||!new Set(["/hrm/settings","/hrm/training","/hrm/me/training"]).has(path))throw new HrmError("invalid_return",400);
  return url;
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
    if(intent==="create_policy"){
      await createTrainingReminderPolicy(env.DB,user,key,{titleEn:text(form,"title_en",120,true),titleVi:text(form,"title_vi",120,true),daysBeforeDue:text(form,"days_before_due",200,true)});
      return redirect(back,{saved:"training_reminder_policy_created"});
    }
    if(intent==="review_policy"){
      const decision=text(form,"decision",16,true);if(decision!=="approve"&&decision!=="reject")throw new HrmError("training_reminder_decision_invalid",400);
      await reviewTrainingReminderPolicy(env.DB,user,key,text(form,"policy_ref",120,true),revision(form),decision,text(form,"reason",500,true));
      return redirect(back,{saved:decision==="approve"?"training_reminder_policy_reviewed":"training_reminder_policy_rejected"});
    }
    if(intent==="activate_policy"){
      await activateTrainingReminderPolicy(env.DB,user,key,text(form,"policy_ref",120,true),revision(form));
      return redirect(back,{saved:"training_reminder_policy_activated"});
    }
    if(intent==="dispatch_due"){
      if(!user.can("hrm.training.reminders.manage"))throw new HrmError("forbidden",403);
      if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
      const result=await runHrmTrainingReminderSweep(env.DB,env.CONTENT_DB,env.HRM_LIVE_ENABLED,Date.now());
      return redirect(back,{saved:result.skipped?"training_reminders_skipped":"training_reminders_dispatched",count:String(result.created)});
    }
    if(intent==="read_reminder"){
      await markTrainingReminderRead(env.DB,user,key,text(form,"reminder_ref",120,true),revision(form,"version"));
      return redirect(back,{saved:"training_reminder_read"});
    }
    throw new HrmError("invalid_action",400);
  }catch(error){
    if(!(error instanceof HrmError))console.error("hrm_training_reminder_request_failed",error instanceof Error?error.name:"unknown");
    if(!back)try{back=returnUrl(context.request,context.request.headers.get("referer")??(context.url.pathname.startsWith("/vi/")?"/vi/hrm/training":"/hrm/training"))}catch{}
    back??=new URL(context.url.pathname.startsWith("/vi/")?"/vi/hrm/training":"/hrm/training",context.request.url);
    return redirect(back,{error:error instanceof HrmError?error.message:"internal_error"});
  }
};
