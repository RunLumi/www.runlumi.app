import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../../lib/ats";
import { HrmError } from "../../../../../lib/hrm/fields";
import { downloadTrainingEvidence } from "../../../../../lib/hrm/training";

export const prerender=false;
export const GET:APIRoute=async({locals,params})=>{
 const user=locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
 try{const env=envFromLocals(locals);return await downloadTrainingEvidence(env.DB,env.FILES,user,params.evidenceId??"")}
 catch(error){return new Response(error instanceof HrmError?error.message:"Internal server error",{status:error instanceof HrmError?error.status:500,headers:{"Cache-Control":"private, no-store","Content-Type":"text/plain; charset=utf-8"}})}
};
