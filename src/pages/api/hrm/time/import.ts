import type { APIRoute } from "astro";
import { HrmError, revision, text } from "../../../../lib/hrm/fields";
import { envFromLocals } from "../../../../lib/ats";
import { sameOrigin } from "../../../../lib/http";
import { confirmAttendanceImport, previewAttendanceImport, rejectAttendanceImport } from "../../../../lib/hrm/time-import-service";

export const prerender=false;
const MAX_MULTIPART_BYTES=600*1024;

async function boundedForm(request:Request):Promise<FormData>{
  const contentType=request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if(contentType!=="multipart/form-data"&&contentType!=="application/x-www-form-urlencoded")throw new HrmError("invalid_form",415);
  const length=request.headers.get("content-length");
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_MULTIPART_BYTES))throw new HrmError("request_too_large",413);
  const reader=request.body?.getReader();if(!reader)throw new HrmError("invalid_form",400);
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_MULTIPART_BYTES){await reader.cancel().catch(()=>{});throw new HrmError("request_too_large",413)}chunks.push(value)}}
  catch(error){if(error instanceof HrmError)throw error;throw new HrmError("invalid_form",400)}
  const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  const headers=new Headers(request.headers);headers.delete("content-length");
  try{return await new Request(request.url,{method:"POST",headers,body}).formData();}catch{throw new HrmError("invalid_form",400)}
}
function returnTarget(request:Request,value:string):URL{
  const target=new URL(value,request.url),path=target.pathname.startsWith("/vi/")?target.pathname.slice(3):target.pathname;
  if(target.origin!==new URL(request.url).origin||path!=="/hrm/time")throw new HrmError("invalid_return",400);
  return target;
}
function redirect(target:URL,values:Record<string,string>):Response{for(const [key,value] of Object.entries(values))target.searchParams.set(key,value);if(values.batch)target.hash="time-import-preview-title";return new Response(null,{status:303,headers:{Location:target.pathname+target.search+target.hash,"Cache-Control":"private, no-store"}});}

export const POST:APIRoute=async context=>{
  const user=context.locals.workspace;if(!user)return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
  if(!sameOrigin(context.request))return new Response("Invalid origin",{status:400,headers:{"Cache-Control":"private, no-store"}});
  let target:URL;
  try{
    const form=await boundedForm(context.request);target=returnTarget(context.request,text(form,"return_to",300,true));
    const env=envFromLocals(context.locals),intent=text(form,"intent",30,true),key=text(form,"request_key",100,true),batchId=text(form,"batch_id",100,false);
    if(intent==="preview"){
      const upload=form.get("file");if(!(upload instanceof File)||!upload.name.toLowerCase().endsWith(".csv")||!(["text/csv","application/vnd.ms-excel","application/octet-stream"].includes(upload.type)))throw new HrmError("time_import_file",422);
      const periodId=text(form,"period_id",100,true),created=await previewAttendanceImport(env.DB,user,key,periodId,upload.name,await upload.arrayBuffer());
      return redirect(target,{saved:"import_preview",batch:created});
    }
    if(intent==="confirm"){await confirmAttendanceImport(env.DB,user,key,batchId,revision(form));return redirect(target,{saved:"import_confirmed",batch:batchId});}
    if(intent==="reject"){await rejectAttendanceImport(env.DB,user,key,batchId,revision(form),text(form,"reason",500,true));return redirect(target,{saved:"import_rejected",batch:batchId});}
    throw new HrmError("invalid_action");
  }catch(error){
    try{const referer=context.request.headers.get("referer"),source=new URL(referer??"/hrm/time",context.request.url);target=returnTarget(context.request,source.pathname+source.search+source.hash)}
    catch{target=new URL(context.url.pathname.startsWith("/vi/")?"/vi/hrm/time":"/hrm/time",context.request.url)}
    return redirect(target,{error:error instanceof HrmError?error.message:"internal_error"});
  }
};
