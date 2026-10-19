import type { APIRoute } from "astro";
import { envFromLocals } from "../../../lib/ats";
import { HrmError } from "../../../lib/hrm/fields";
import { createFileDeletionRequest, createLegalHold, createRetentionPolicy, executeFileDeletion, releaseLegalHold, reviewFileDeletion, reviewRetentionPolicy, activateRetentionPolicy, type RetentionSource } from "../../../lib/hrm/retention";
import { activateStructuredRetentionPolicy, createStructuredDispositionRequest, createStructuredRetentionPolicy, executeStructuredDispositionRequest, reviewStructuredDispositionRequest, reviewStructuredRetentionPolicy } from "../../../lib/hrm/structured-retention";
import { sameOrigin } from "../../../lib/http";
import { actOnFinancialRetentionPolicy, createFinancialRetentionPolicy, type FinancialRetentionPolicyInput } from "../../../lib/hrm/financial-retention-policies";

import { createFinancialDispositionRequest, reviewFinancialDispositionRequest, executeFinancialFileDisposition, executeFinancialDossierDisposition } from "../../../lib/hrm/financial-disposition";

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
function days(form:URLSearchParams,name:string):number|null{const value=field(form,name,5);if(!value)return null;if(!/^[0-9]+$/.test(value))throw new HrmError("financial_retention_invalid");return Number(value)}

export const POST:APIRoute=async context=>{
 const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
 if(!sameOrigin(context.request))return new Response("Invalid request origin",{status:400,headers:{"Cache-Control":"private, no-store"}});
 let vi=false,financialCase="";
 try{const referer=new URL(context.request.headers.get("referer")??"");vi=referer.origin===new URL(context.request.url).origin&&referer.pathname==="/vi/hrm/retention"}catch{/* An invalid referrer cannot choose a return locale. */}
 try{
  const form=await readFields(context.request),intent=field(form,"intent",40,true),key=field(form,"request_key",100,true),env=envFromLocals(context.locals);
  const selectedCase=field(form,"case_id",120);if(/^[A-Za-z0-9_-]{1,120}$/.test(selectedCase))financialCase=selectedCase;
  const lang=field(form,"lang",2);if(lang&&lang!=="en"&&lang!=="vi")throw new HrmError("invalid_field");if(lang)vi=lang==="vi";
  if(intent==="create_financial_policy")await createFinancialRetentionPolicy(env.DB,env.CONTENT_DB,env.FILES,user,key,{
   policyKey:field(form,"policy_key",80,true),titleEn:field(form,"title_en",160,true),titleVi:field(form,"title_vi",160,true),purpose:field(form,"purpose",1000,true),sourceVersionId:field(form,"source_version_id",120,true),
   effectiveFrom:field(form,"effective_from",10,true),effectiveUntil:field(form,"effective_until",10,true),
   fileDays:days(form,"file_days"),fileAnchor:(field(form,"file_anchor",30)||null) as FinancialRetentionPolicyInput["fileAnchor"],fileBasis:field(form,"file_basis",1000,true),
   dossierDays:days(form,"dossier_days"),dossierAnchor:(field(form,"dossier_anchor",30)||null) as FinancialRetentionPolicyInput["dossierAnchor"],dossierBasis:field(form,"dossier_basis",1000,true),
  });
  else if(intent==="financial_policy_action"){
   const action=field(form,"action",12,true);if(!["approve","reject","activate","retire"].includes(action))throw new HrmError("invalid_action");
   await actOnFinancialRetentionPolicy(env.DB,env.CONTENT_DB,env.FILES,user,key,{policyId:field(form,"policy_id",120,true),version:int(form,"version"),action:action as "approve"|"reject"|"activate"|"retire",reason:field(form,"reason",500,true)});
  }
  else if(intent==="request_financial_disposition"){
   const kind=field(form,"target_kind",10,true);if(kind!=="file"&&kind!=="dossier")throw new HrmError("invalid_field");
   await createFinancialDispositionRequest(env.DB,env.CONTENT_DB,env.FILES,user,key,{caseId:field(form,"case_id",120,true),targetKind:kind,targetId:field(form,"target_id",120,true),targetVersion:int(form,"version"),policyId:field(form,"policy_id",120,true),reason:field(form,"reason",1000,true),confirmed:field(form,"confirmed",3)==="yes"});
  }else if(intent==="review_financial_disposition"){
   const decision=field(form,"decision",10,true);if(decision!=="approve"&&decision!=="reject")throw new HrmError("invalid_decision");
   await reviewFinancialDispositionRequest(env.DB,env.CONTENT_DB,env.FILES,user,key,{caseId:field(form,"case_id",120,true),requestId:field(form,"request_id",120,true),version:int(form,"version"),approve:decision==="approve",reason:field(form,"reason",1000,true),confirmed:field(form,"confirmed",3)==="yes"});
  }else if(intent==="execute_financial_file"||intent==="execute_financial_dossier"){
   const execute=intent==="execute_financial_file"?executeFinancialFileDisposition:executeFinancialDossierDisposition;
   await execute(env.DB,env.CONTENT_DB,env.FILES,user,key,{caseId:field(form,"case_id",120,true),requestId:field(form,"request_id",120,true),version:int(form,"version"),confirmed:field(form,"confirmed",3)==="yes"});
  }
  else if(intent==="create_policy")await createRetentionPolicy(env.DB,user,key,field(form,"rules_json",20000,true));
  else if(intent==="create_structured_policy")await createStructuredRetentionPolicy(env.DB,user,key,field(form,"structured_rules_json",20000,true));
  else if(intent==="review_structured_policy"){
   const decision=field(form,"decision",10,true);if(decision!=="approve"&&decision!=="reject")throw new HrmError("invalid_decision");
   await reviewStructuredRetentionPolicy(env.DB,user,key,field(form,"policy_id",100,true),int(form,"version"),decision==="approve",field(form,"reason",500,true));
  }else if(intent==="activate_structured_policy")await activateStructuredRetentionPolicy(env.DB,user,key,field(form,"policy_id",100,true),int(form,"version"));
  else if(intent==="request_structured_disposition")await createStructuredDispositionRequest(env.DB,user,key,field(form,"record_id",100,true),field(form,"reason",500,true));
  else if(intent==="review_structured_disposition"){
   const decision=field(form,"decision",10,true);if(decision!=="approve"&&decision!=="reject")throw new HrmError("invalid_decision");
   await reviewStructuredDispositionRequest(env.DB,user,key,field(form,"request_id",100,true),int(form,"version"),decision==="approve",field(form,"reason",500,true));
  }else if(intent==="execute_structured_disposition")await executeStructuredDispositionRequest(env.DB,user,key,field(form,"request_id",100,true),int(form,"version"));
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
  return new Response(null,{status:303,headers:{Location:`${vi?"/vi":""}/hrm/retention?saved=${encodeURIComponent(intent)}${financialCase?`&financial_case=${encodeURIComponent(financialCase)}`:""}`,"Cache-Control":"private, no-store"}});
 }catch(error){
  if(!(error instanceof HrmError)&&import.meta.env.DEV)console.error("[hrm] retention request failed:",error instanceof Error?`${error.name}: ${error.message.slice(0,180)}`:"unknown");
  const target=new URL(`${vi?"/vi":""}/hrm/retention`,context.request.url);if(financialCase)target.searchParams.set("financial_case",financialCase);target.searchParams.set("error",error instanceof HrmError?error.message:"internal_error");
  return new Response(null,{status:303,headers:{Location:target.pathname+target.search,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }
};
