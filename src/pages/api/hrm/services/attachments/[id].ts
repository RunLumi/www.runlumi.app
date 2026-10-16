import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../../lib/ats";
import { HrmError } from "../../../../../lib/hrm/fields";
import { downloadServiceAttachment } from "../../../../../lib/hrm/service-attachments";

export const prerender=false;
export const GET:APIRoute=async context=>{
 const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
 try{const env=envFromLocals(context.locals);return await downloadServiceAttachment(env.DB,env.FILES,user,context.params.id??"")}
 catch(error){const hrm=error instanceof HrmError?error:null;return new Response(hrm?.message??"Attachment unavailable",{status:hrm?.status??500,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}})}
};
