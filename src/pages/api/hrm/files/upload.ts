import type { APIRoute } from "astro";
import { envFromLocals } from "../../../../lib/ats";
import { HrmError, date, text } from "../../../../lib/hrm/fields";
import { fileKind, uploadFile } from "../../../../lib/hrm/files";
import { personFor } from "../../../../lib/hrm/service";
import { sameOrigin } from "../../../../lib/http";
export const prerender=false;
export const POST:APIRoute=async context=>{
 const user=context.locals.workspace;if(!user?.hrmEnabled)return new Response("Unavailable",{status:503,headers:{"Cache-Control":"private, no-store"}});if(!sameOrigin(context.request))return new Response("Invalid request origin",{status:400});
 try{const form=await context.request.formData();const kind=fileKind(text(form,"kind",30,true));const personId=text(form,"person_id",100,true);const file=form.get("file");if(!(file instanceof File))throw new HrmError("file_required");const recordId=text(form,"record_id",100)||null;const expiresOn=date(text(form,"expires_on",10));const env=envFromLocals(context.locals);const person=await personFor(env.DB,user,personId);const destination=text(form,"return_to",300,true);const local=new URL(destination,context.request.url);if(local.origin!==new URL(context.request.url).origin||!(/^\/hrm\/me$|^\/vi\/hrm\/me$/.test(local.pathname)||["/hrm/people/"+encodeURIComponent(person.id),"/vi/hrm/people/"+encodeURIComponent(person.id),"/hrm/people/"+encodeURIComponent(person.id)+"/profile","/vi/hrm/people/"+encodeURIComponent(person.id)+"/profile"].includes(local.pathname)))throw new HrmError("invalid_return",400);await uploadFile(env.DB,env.FILES,user,text(form,"request_key",100,true),person,kind,file,recordId,expiresOn);local.searchParams.set("section",kind);local.searchParams.set("file","uploaded");return new Response(null,{status:303,headers:{Location:local.pathname+local.search,"Cache-Control":"private, no-store"}})}catch(error){const e=error instanceof HrmError?error:null;return new Response(e?.message??"Upload failed",{status:e?.status??500,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}})}
};
