import type { APIRoute } from "astro";
import { envFromLocals } from "../../../lib/ats";
import { HrmError } from "../../../lib/hrm/fields";
import { createFileDeletionRequest, createLegalHold, createRetentionPolicy, executeFileDeletion, releaseLegalHold, reviewFileDeletion, reviewRetentionPolicy, activateRetentionPolicy, type RetentionSource } from "../../../lib/hrm/retention";
import { sameOrigin } from "../../../lib/http";

export const prerender=false;
const MAX_BODY=32*1024;
async function readFields(request:Request):Promise<URLSearchParams>{
 if(!(request.headers.get("content-type")??"").toLowerCase().startsWith("application/x-www-form-urlencoded"))throw new HrmError("invalid_form",400);
 const length=Number(request.headers.get("content-length")??0);if(Number.isFinite(length)&&length>MAX_BODY)throw new HrmError("request_too_large",413);
 if(!request.body)throw new HrmError("invalid_form",400);const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BODY){await reader.cancel();throw new HrmError("request_too_large",413)}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}return new URLSearchParams(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
}
function field(form:URLSearchParams,name:string,max=500,required=false):string{const values=form.getAll(name);if(values.length>1)throw new HrmError("invalid_field");const value=(values[0]??"").trim();if(value.length>max||required&&!value)throw new HrmError("invalid_field");return value}
function int(form:URLSearchParams,name:string):number{const value=field(form,name,12,true);if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value)))throw new HrmError("invalid_revision");return Number(value)}

export const POST:APIRoute=async context=>{
 const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
 if(!sameOrigin(context.request))return new Response("Invalid request origin",{status:400,headers:{"Cache-Control":"private, no-store"}});
 const vi=new URL(context.request.url).pathname.startsWith("/vi/");
 try{
  const form=await readFields(context.request),intent=field(form,"intent",40,true),key=field(form,"request_key",100,true),env=envFromLocals(context.locals);
  if(intent==="create_policy")await createRetentionPolicy(env.DB,user,key,field(form,"rules_json",20000,true));
  else if(intent==="review_policy"){
   const decision=field(form,"decision",10,true);if(decision!=="approve"&&decision!=="reject")throw new HrmError("invalid_decision");
   await reviewRetentionPolicy(env.DB,user,key,field(form,"policy_id",100,true),int(form,"version"),decision==="approve",field(form,"reason",500,true));
  }else if(intent==="activate_policy")await activateRetentionPolicy(env.DB,user,key,field(form,"policy_id",100,true),int(form,"version"));
  else if(intent==="place_hold"){
   const scope=field(form,"scope_kind",10,true);if(scope!=="person"&&scope!=="file")throw new HrmError("legal_hold_scope_invalid");
   const table=field(form,"source_table",30);if(table&&table!=="hrm_files"&&table!=="hrm_legal_files")throw new HrmError("legal_hold_scope_invalid");
   await createLegalHold(env.DB,user,key,{scope_kind:scope,person_id:field(form,"person_id",100),category:field(form,"category",40),source_table:table as RetentionSource|undefined,target_file_id:field(form,"target_file_id",100)||undefined,reason:field(form,"reason",1000,true)});
  }else if(intent==="release_hold")await releaseLegalHold(env.DB,user,key,field(form,"hold_id",100,true),int(form,"version"),field(form,"reason",1000,true));
  else if(intent==="request_delete"){
   const source=field(form,"source_table",30,true);if(source!=="hrm_files"&&source!=="hrm_legal_files")throw new HrmError("invalid_file_source");
   await createFileDeletionRequest(env.DB,user,key,source as RetentionSource,field(form,"file_id",100,true),field(form,"reason",500,true));
  }else if(intent==="review_delete"){
   const decision=field(form,"decision",10,true);if(decision!=="approve"&&decision!=="reject")throw new HrmError("invalid_decision");
   await reviewFileDeletion(env.DB,user,key,field(form,"request_id",100,true),int(form,"version"),decision==="approve",field(form,"reason",500,true));
  }else if(intent==="execute_delete")await executeFileDeletion(env.DB,env.FILES,user,key,field(form,"request_id",100,true),int(form,"version"));
  else throw new HrmError("invalid_action");
  return new Response(null,{status:303,headers:{Location:`${vi?"/vi":""}/hrm/retention?saved=${encodeURIComponent(intent)}`,"Cache-Control":"private, no-store"}});
 }catch(error){
  const target=new URL(`${vi?"/vi":""}/hrm/retention`,context.request.url);target.searchParams.set("error",error instanceof HrmError?error.message:"internal_error");
  return new Response(null,{status:303,headers:{Location:target.pathname+target.search,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }
};
