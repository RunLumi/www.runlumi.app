import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../../lib/ats";
import { HrmError } from "../../../../../lib/hrm/fields";
import { downloadAssetEvidence } from "../../../../../lib/hrm/asset-attachments";

export const prerender=false;

export const GET:APIRoute=async context=>{
  const user=context.locals.workspace;
  if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
  try{
    const env=envFromLocals(context.locals);
    return await downloadAssetEvidence(env.DB,env.FILES,user,context.params.id??"");
  }catch(error){
    const status=error instanceof HrmError?error.status:500;
    return new Response(status===404?"Not found":"Unable to download evidence",{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }
};
