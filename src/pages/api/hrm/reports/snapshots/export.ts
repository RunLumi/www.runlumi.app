import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../../lib/ats";
import { HrmError, text } from "../../../../../lib/hrm/fields";
import { readLegalForm } from "../../../../../lib/hrm/legal-files";
import { exportHeldReportSnapshotCsv, exportSavedReportSnapshotCsv } from "../../../../../lib/hrm/report-snapshots";
import { sameOrigin } from "../../../../../lib/http";

export const prerender=false;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};

export const POST:APIRoute=async context=>{
  const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers});
  if(!sameOrigin(context.request))return new Response("Invalid request origin",{status:400,headers});
  try{
    const form=await readLegalForm(context.locals.hrmFormRequest??context.request),env=envFromLocals(context.locals),lang=text(form,"lang",2,false)==="vi"?"vi":"en";
    const ref=text(form,"snapshot_ref",100,true),csv=form.get("held_access")==="1"?await exportHeldReportSnapshotCsv(env.DB,env.CONTENT_DB,user,text(form,"request_key",100,true),ref,text(form,"reason",500,true),lang):await exportSavedReportSnapshotCsv(env.DB,user,ref,lang);
    return new Response(csv,{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="lumi-hrm-report-snapshot.csv"'}});
  }catch(error){
    if(!(error instanceof HrmError))console.error("hrm_report_snapshot_export_failed",error instanceof Error?error.name:"unknown");
    const status=error instanceof HrmError?error.status:500,body=error instanceof HrmError?error.message:"internal_error";
    return new Response(body,{status,headers:{...headers,"Content-Type":"text/plain; charset=utf-8"}});
  }
};
