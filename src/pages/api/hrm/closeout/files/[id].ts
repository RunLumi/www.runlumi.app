import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../../lib/ats";
import { downloadCloseoutFile } from "../../../../../lib/hrm/closeout-dossiers";
import { HrmError } from "../../../../../lib/hrm/fields";
export const prerender=false;
export const GET:APIRoute=async context=>{
 const user=context.locals.workspace,headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};if(!user)return new Response("Forbidden",{status:403,headers});
 const caseId=context.url.searchParams.get("case_id")??"",fileId=context.params.id??"";
 if(!/^[A-Za-z0-9_-]{1,120}$/.test(caseId)||!/^[A-Za-z0-9_-]{1,120}$/.test(fileId))return new Response("Not found",{status:404,headers});
 try{const env=envFromLocals(context.locals);return await downloadCloseoutFile(env.DB,env.CONTENT_DB,env.FILES,user,caseId,fileId)}
 catch(error){return new Response(error instanceof HrmError?error.message:"Internal error",{status:error instanceof HrmError?error.status:500,headers})}
};
