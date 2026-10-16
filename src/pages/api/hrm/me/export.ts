import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../lib/ats";
import { HrmError } from "../../../../lib/hrm/fields";
import { exportOwnHrmProfile } from "../../../../lib/hrm/profile-export";
import { sameOrigin } from "../../../../lib/http";

export const prerender=false;
const privateHeaders={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};

export const POST:APIRoute=async context=>{
 const user=context.locals.workspace;
 if(!user)return new Response(JSON.stringify({error:"forbidden"}),{status:403,headers:{...privateHeaders,"Content-Type":"application/json; charset=utf-8"}});
 if(!user.can("hrm.profile.self")||!user.can("hrm.legal.self")||!user.can("hrm.coi.self")||!user.can("hrm.time.self")||!user.can("hrm.leave.self"))return new Response(JSON.stringify({error:"forbidden"}),{status:403,headers:{...privateHeaders,"Content-Type":"application/json; charset=utf-8"}});
 if(!sameOrigin(context.request))return new Response(JSON.stringify({error:"invalid_origin"}),{status:400,headers:{...privateHeaders,"Content-Type":"application/json; charset=utf-8"}});
 if(!user.can("hrm.services.self")&&!user.can("hrm.services.manage"))return new Response(JSON.stringify({error:"forbidden"}),{status:403,headers:{...privateHeaders,"Content-Type":"application/json; charset=utf-8"}});
 if(!user.can("hrm.onboarding.self")&&!user.can("hrm.onboarding.manage"))return new Response(JSON.stringify({error:"forbidden"}),{status:403,headers:{...privateHeaders,"Content-Type":"application/json; charset=utf-8"}});
 try{
  const result=await exportOwnHrmProfile(envFromLocals(context.locals).DB,user);
  return new Response(result.body,{headers:{...privateHeaders,"Content-Type":"application/json; charset=utf-8","Content-Disposition":"attachment; filename=\"lumi-hrm-self-data.json\""}});
 }catch(error){
  if(!(error instanceof HrmError)&&import.meta.env.DEV)console.error("[hrm] profile export failed:",error instanceof Error?`${error.name}: ${error.message.slice(0,160)}`:"unknown");
  return new Response(JSON.stringify({error:error instanceof HrmError?error.message:"internal_error"}),{status:error instanceof HrmError?error.status:500,headers:{...privateHeaders,"Content-Type":"application/json; charset=utf-8"}});
 }
};
