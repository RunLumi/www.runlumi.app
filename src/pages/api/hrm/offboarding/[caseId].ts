import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../lib/ats";
import { HrmError } from "../../../../lib/hrm/fields";
import { actOnOffboardingTask } from "../../../../lib/hrm/offboarding";
import { sameOrigin } from "../../../../lib/http";

export const prerender=false;
const MAX_FORM_BYTES=8*1024;
async function readFields(request:Request):Promise<URLSearchParams>{
 const contentType=request.headers.get("content-type")??"";if(!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded"))throw new HrmError("invalid_form",400);
 const length=Number(request.headers.get("content-length")??0);if(Number.isFinite(length)&&length>MAX_FORM_BYTES)throw new HrmError("request_too_large",413);
 if(!request.body)throw new HrmError("invalid_form",400);const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_FORM_BYTES){await reader.cancel();throw new HrmError("request_too_large",413)}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}return new URLSearchParams(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
}
function field(form:URLSearchParams,key:string,max=500,required=false):string{const values=form.getAll(key);if(values.length>1)throw new HrmError("invalid_field");const value=(values[0]??"").trim();if(value.length>max||required&&!value)throw new HrmError("invalid_field");return value}
export const POST:APIRoute=async context=>{
 const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
 if(!sameOrigin(context.request))return new Response("Invalid request origin",{status:400,headers:{"Cache-Control":"private, no-store"}});
 const caseId=context.params.caseId??"";if(!/^[A-Za-z0-9_-]{1,120}$/.test(caseId))return new Response("Not found",{status:404,headers:{"Cache-Control":"private, no-store"}});
 let vi=false;
 try{
  const form=await readFields(context.request),intent=field(form,"intent",30,true),lang=field(form,"lang",2);
  if(lang&&lang!=="en"&&lang!=="vi")throw new HrmError("invalid_field",400);vi=lang==="vi";
  if(!["complete","not_required","block","unblock","revoke_access"].includes(intent))throw new HrmError("invalid_action");
  const env=envFromLocals(context.locals);
  const dossierId=field(form,"dossier_id",120);
  await actOnOffboardingTask(env.DB,env.CONTENT_DB,user,field(form,"request_key",100,true),caseId,field(form,"task_id",100,true),Number(field(form,"version",10,true)),intent as "complete"|"not_required"|"block"|"unblock"|"revoke_access",field(form,"reason",500,true),field(form,"confirmed",1)==="1",dossierId?{dossierId,bucket:env.FILES}:undefined);
  return new Response(null,{status:303,headers:{Location:`${vi?"/vi":""}/hrm/offboarding/${encodeURIComponent(caseId)}?saved=1`,"Cache-Control":"private, no-store"}});
 }catch(error){
  const target=new URL(`${vi?"/vi":""}/hrm/offboarding/${encodeURIComponent(caseId)}`,context.request.url);
  target.searchParams.set("error",error instanceof HrmError?error.message:"internal_error");
  return new Response(null,{status:303,headers:{Location:target.pathname+target.search,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }
};
