import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../lib/ats";
import { HrmError } from "../../../../lib/hrm/fields";
import { transferAtsCandidate } from "../../../../lib/hrm/lifecycle";
import { sameOrigin } from "../../../../lib/http";

export const prerender=false;
const MAX_FORM_BYTES=16*1024;

async function readFields(request:Request):Promise<URLSearchParams>{
 const contentType=request.headers.get("content-type")??"";
 if(!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded"))throw new HrmError("invalid_form",400);
 const length=Number(request.headers.get("content-length")??0);
 if(Number.isFinite(length)&&length>MAX_FORM_BYTES)throw new HrmError("request_too_large",413);
 if(!request.body)throw new HrmError("invalid_form",400);
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_FORM_BYTES){await reader.cancel();throw new HrmError("request_too_large",413)}chunks.push(value)}
 }finally{reader.releaseLock()}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 return new URLSearchParams(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
}
function field(form:URLSearchParams,name:string,max=200,required=false):string{
 const values=form.getAll(name);if(values.length>1)throw new HrmError("invalid_field");const value=(values[0]??"").trim();if(value.length>max||required&&!value)throw new HrmError("invalid_field");return value;
}
function intField(form:URLSearchParams,name:string):number{const value=field(form,name,10,true);if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value)))throw new HrmError("invalid_revision");return Number(value)}

export const POST:APIRoute=async context=>{
 const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
 if(!sameOrigin(context.request))return new Response("Invalid request origin",{status:400,headers:{"Cache-Control":"private, no-store"}});
 const applicationId=context.params.applicationId??"";if(!/^[A-Za-z0-9_-]{1,120}$/.test(applicationId))return new Response("Not found",{status:404,headers:{"Cache-Control":"private, no-store"}});
 const url=new URL(context.request.url),vi=url.pathname.startsWith("/vi/");
 try{
  const form=await readFields(context.request);if(field(form,"confirm_transfer",1,true)!=="1")throw new HrmError("confirmation_required");
  const env=envFromLocals(context.locals);
  await transferAtsCandidate(env.DB,env.CONTENT_DB,user,field(form,"request_key",100,true),applicationId,{
   expectedSourceUpdatedAt:field(form,"source_updated_at",40,true),expectedJobUpdatedAt:field(form,"job_updated_at",40,true),expectedSettingsVersion:intField(form,"settings_version"),
   employeeCode:field(form,"employee_code",50,true),employeeAccountEmail:field(form,"employee_account_email",254,true),startedOn:field(form,"started_on",10,true),managerEmail:field(form,"manager_email",254)||null,
  });
  return new Response(null,{status:303,headers:{Location:`${vi?"/vi":""}/hrm/transfers/${encodeURIComponent(applicationId)}?saved=1`,"Cache-Control":"private, no-store"}});
 }catch(error){
  const url=new URL(`${vi?"/vi":""}/hrm/transfers/${encodeURIComponent(applicationId)}`,context.request.url);
  url.searchParams.set("error",error instanceof HrmError?error.message:"internal_error");
  return new Response(null,{status:303,headers:{Location:url.pathname+url.search,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }
};
