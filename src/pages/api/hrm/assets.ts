import type { APIRoute } from "astro";
import { envFromLocals } from "../../../lib/ats";
import { HrmError, revision, text } from "../../../lib/hrm/fields";
import { clearAssetInspection, createAsset, offerAsset, retireAsset, transitionAsset } from "../../../lib/hrm/assets";
import { sameOrigin } from "../../../lib/http";

export const prerender=false;
const MAX_FORM_BYTES=32*1024;
async function readForm(request:Request):Promise<FormData>{
 const type=request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();if(type!=="application/x-www-form-urlencoded")throw new HrmError("invalid_form",415);
 const length=request.headers.get("content-length");if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_FORM_BYTES))throw new HrmError("request_too_large",413);
 const reader=request.body?.getReader();if(!reader)throw new HrmError("invalid_form",400);const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_FORM_BYTES){await reader.cancel().catch(()=>{});throw new HrmError("request_too_large",413)}chunks.push(value)}}catch(error){if(error instanceof HrmError)throw error;throw new HrmError("invalid_form",400)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 try{return await new Request(request.url,{method:"POST",headers:request.headers,body:bytes}).formData()}catch{throw new HrmError("invalid_form",400)}
}
function target(request:Request,value:string):URL{const url=new URL(value,request.url),path=url.pathname.startsWith("/vi/")?url.pathname.slice(3):url.pathname;if(url.origin!==new URL(request.url).origin||!new Set(["/hrm/assets","/hrm/me/assets"]).has(path))throw new HrmError("invalid_return",400);return url}
function redirect(url:URL,values:Record<string,string>):Response{for(const [key,value] of Object.entries(values))url.searchParams.set(key,value);return new Response(null,{status:303,headers:{Location:url.pathname+url.search,"Cache-Control":"private, no-store"}})}
const transitions=["accept","request_return","report_handover","cancel_return","cancel_offer","confirm_return"] as const;

export const POST:APIRoute=async context=>{
 const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
 if(!sameOrigin(context.request))return new Response("Invalid request origin",{status:400,headers:{"Cache-Control":"private, no-store"}});
 let returnUrl:URL|undefined;
 try{
  const form=await readForm(context.request);returnUrl=target(context.request,text(form,"return_to",300,true));
  const env=envFromLocals(context.locals),key=text(form,"request_key",100,true),intent=text(form,"intent",40,true);
  if(intent==="create_asset")await createAsset(env.DB,user,key,{asset_tag:text(form,"asset_tag",48,true),asset_type:text(form,"asset_type",20,true),description:text(form,"description",240,true),serial_number:text(form,"serial_number",120),location:text(form,"location",160),legal_entity:text(form,"legal_entity",200,true)});
  else if(intent==="offer_asset")await offerAsset(env.DB,env.CONTENT_DB,user,key,{assetId:text(form,"asset_id",100,true),assetVersion:revision(form,"asset_version"),personId:text(form,"person_id",100,true),expectedReturnOn:text(form,"expected_return_on",10),issuedCondition:text(form,"issued_condition",20,true),reason:text(form,"reason",500,true)});
  else if(intent==="transition_asset"){
   const action=text(form,"action",30,true);if(!(transitions as readonly string[]).includes(action))throw new HrmError("invalid_action",400);
   await transitionAsset(env.DB,user,key,text(form,"assignment_id",100,true),revision(form),{action:action as typeof transitions[number],reason:text(form,"reason",500,true),condition:text(form,"condition",20)});
  }else if(intent==="clear_inspection")await clearAssetInspection(env.DB,user,key,text(form,"asset_id",100,true),revision(form,"asset_version"),text(form,"reason",500,true));
  else if(intent==="retire_asset")await retireAsset(env.DB,user,key,text(form,"asset_id",100,true),revision(form,"asset_version"),text(form,"reason",500,true));
  else throw new HrmError("invalid_action",400);
  return redirect(returnUrl,{saved:intent});
 }catch(error){
  if(!returnUrl)try{returnUrl=target(context.request,context.request.headers.get("referer")??(context.url.pathname.startsWith("/vi/")?"/vi/hrm/assets":"/hrm/assets"))}catch{}
  returnUrl??=new URL(context.url.pathname.startsWith("/vi/")?"/vi/hrm/assets":"/hrm/assets",context.request.url);
  return redirect(returnUrl,{error:error instanceof HrmError?error.message:"internal_error"});
 }
};
