import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../lib/ats";
import { HrmError } from "../../../../lib/hrm/fields";
import { exportHrmReportCsv } from "../../../../lib/hrm/reports";
import { sameOrigin } from "../../../../lib/http";
import { stepUpGuard } from "../../../../lib/workspace/step-up";

export const prerender=false;
const privateHeaders={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};

export const POST:APIRoute=async context=>{
 const user=context.locals.workspace;
 if(!user)return new Response("Forbidden",{status:403,headers:privateHeaders});
 if(!sameOrigin(context.request))return new Response("Invalid request origin",{status:400,headers:privateHeaders});
 const stepUp=await stepUpGuard(context);if(stepUp)return stepUp;
 try{
  const env=envFromLocals(context.locals),lang=context.url.searchParams.get("lang")==="vi"?"vi":"en";
  const csv=await exportHrmReportCsv(env.DB,user,lang,{period:context.url.searchParams.get("period"),department:context.url.searchParams.get("department")});
  return new Response(csv,{headers:{...privateHeaders,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="lumi-hrm-summary.csv"'}});
 }catch(error){
  const status=error instanceof HrmError?error.status:500,body=error instanceof HrmError?error.message:"internal_error";
  return new Response(body,{status,headers:{...privateHeaders,"Content-Type":"text/plain; charset=utf-8"}});
 }
};
