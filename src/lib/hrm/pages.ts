import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { sameOrigin } from "../http";
import type { WorkspaceUser } from "../workspace/roles";
import type { MemberRow } from "../workspace/members";
import { HrmError, date, kindOf, period, readRecord, revision, text, recordKinds } from "./fields";
import { settings, enabled, saveSettings, savePerson, startEmploymentPeriod, localDate, personFor, recordsFor, changesFor, submitRecord, reviewChange, listPeople, type Person, type Settings, type HrmRecord, type Change, type PrivateFile } from "./service";
import { listAssetReminderPolicies, type AssetReminderPolicy } from "./asset-reminders";
import { listTrainingReminderPolicies, type TrainingReminderPolicy } from "./training-reminders";
/** Employee or contractor; an absent field keeps the current value so older forms never change it. */
function relationshipType(form:FormData,fallback:"employee"|"contractor"):"employee"|"contractor"{
  const value=text(form,"relationship_type",20)||fallback;
  if(value!=="employee"&&value!=="contractor")throw new HrmError("invalid_relationship_type");
  return value;
}
export type Lang = "en" | "vi";
export interface PageBase { lang:Lang; vi:boolean; user:WorkspaceUser; title:string; live:boolean }
export interface Failure extends PageBase { error:string; status:number }
const base=(lang:Lang,user:WorkspaceUser):PageBase=>({lang,vi:lang==="vi",user,title:"",live:user.hrmEnabled===true});
const err=(lang:Lang,user:WorkspaceUser,error:unknown):Failure=>({ ...base(lang,user), title:"HRM", error:error instanceof HrmError?error.message:"internal_error", status:error instanceof HrmError?error.status:500 });
const redirect=(astro:AstroGlobal,params:Record<string,string>):Response=>{const url=new URL(astro.url);for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);return new Response(null,{status:303,headers:{Location:url.pathname+url.search,"Cache-Control":"private, no-store"}})};
const formOf=async(astro:AstroGlobal)=>{if(!sameOrigin(astro.request))throw new HrmError("invalid_origin",400);const request=astro.locals.hrmFormRequest??astro.request;const body=await request.formData().catch(()=>null);if(!body)throw new HrmError("invalid_form",400);return body};
const requireLive=(user:WorkspaceUser)=>{if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503)};
const common=(astro:AstroGlobal,lang:Lang)=>({user:astro.locals.workspace!,env:envFromLocals(astro.locals),lang});

export async function settingsPage(astro:AstroGlobal,lang:Lang):Promise<Response| (PageBase & {settings:Settings; assetReminderPolicies:AssetReminderPolicy[]; trainingReminderPolicies:TrainingReminderPolicy[]; saved:string; deploymentEnabled:boolean; error?:string})>{
  const {user,env}=common(astro,lang);
  if(!user.can("hrm.configure"))return new Response("Forbidden",{status:403});
  try {
    const current=await settings(env.DB),assetReminderPolicies=user.can("hrm.assets.reminders.manage")?await listAssetReminderPolicies(env.DB,user):[],trainingReminderPolicies=user.can("hrm.training.reminders.manage")?await listTrainingReminderPolicies(env.DB,user):[];
    if(astro.request.method==="POST") {
      const form=await formOf(astro);
      const requestKey=text(form,"request_key",100,true);
      const desired=form.get("enabled")==="1";
      if(desired && env.HRM_LIVE_ENABLED!=="true") throw new HrmError("activation_closed",409);
      await saveSettings(env.DB,user,requestKey,{version:revision(form),legal_entity:text(form,"legal_entity",200,true),purpose:text(form,"purpose",1000,true),retention_policy:text(form,"retention_policy",1000,true),policy_reference:text(form,"policy_reference",500,true),reviewed:form.get("reviewed")==="1",enabled:desired});
      return redirect(astro,{saved:"1"});
    }
    return {...base(lang,user),title:lang==="vi"?"Thiết lập HRM":"HRM settings",settings:current,assetReminderPolicies,trainingReminderPolicies,saved:astro.url.searchParams.get("saved")??"",deploymentEnabled:env.HRM_LIVE_ENABLED==="true"};
  } catch(error){if(error instanceof HrmError)astro.response.status=error.status;return {...err(lang,user,error),settings:await settings(env.DB).catch(()=>({enabled:0,legal_entity:"",purpose:"",retention_policy:"",policy_reference:"",reviewed_by:null,reviewed_at:null,version:0})) as Settings,assetReminderPolicies:[],trainingReminderPolicies:[],saved:"",deploymentEnabled:env.HRM_LIVE_ENABLED==="true"};}
}
export async function overviewPage(astro:AstroGlobal,lang:Lang):Promise<PageBase & {person:Person|null;settings?:Settings; people:number}> {
 const {user,env}=common(astro,lang);const config=await settings(env.DB);const live=enabled(config,env.HRM_LIVE_ENABLED);
 if(!live){if(user.can("hrm.configure"))return {...base(lang,user),title:"HRM",person:null,settings:config,people:0};throw new HrmError("hrm_closed",503)}
 const row=await env.DB.prepare("SELECT p.id FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id WHERE p.user_id=? AND e.status!='ended' AND (e.ended_on IS NULL OR e.ended_on>date('now','+7 hours')) ORDER BY e.started_on DESC LIMIT 1").bind(user.id).first<{id:string}>();
 let person:Person|null=null;if(row)person=await personFor(env.DB,user,row.id);
 let people=0;if(user.can("hrm.records.manage"))people=Number((await env.DB.prepare("SELECT COUNT(DISTINCT person_id) AS n FROM hrm_employments WHERE status!='ended'").first<{n:number}>())?.n??0);
 return {...base(lang,user),title:lang==="vi"?"Tổng quan HRM":"HRM overview",person,people};
}
export interface PeopleResult extends PageBase { people:Person[]; query:string; page:number; hasMore:boolean }
export async function peoplePage(astro:AstroGlobal,lang:Lang):Promise<PeopleResult>{
 const {user,env}=common(astro,lang);requireLive(user);
 if(!user.can("hrm.records.manage")&&!user.can("hrm.team.read"))throw new HrmError("forbidden",403);
 const query=astro.url.searchParams.get("q")?.trim().slice(0,100)??"";const page=Math.max(1,Math.min(400,Number(astro.url.searchParams.get("page"))||1));
 const rows=await listPeople(env.DB,user,query,page);
 return {...base(lang,user),title:lang==="vi"?"Nhân sự":"People",people:rows.slice(0,25),query,page,hasMore:rows.length>25};
}
export interface ProfileResult extends PageBase { files?:PrivateFile[]; fileKind?:string; person:Person; kind:typeof recordKinds[number]; records:HrmRecord[]; changes:Change[]; saved:boolean; error?:string }
export async function profilePage(astro:AstroGlobal,lang:Lang,personId?:string):Promise<Response|ProfileResult>{
 const {user,env}=common(astro,lang);requireLive(user);
 const person=await personFor(env.DB,user,personId);
 const kind=kindOf(astro.url.searchParams.get("section")??"contact");
 let notice:string|undefined;
 if(astro.request.method==="POST"){
  try{
   const form=await formOf(astro);const intent=text(form,"intent",40,true);const key=text(form,"request_key",100,true);
   if(intent==="submit"){
    const data=readRecord(form,kind),[from,to]=period(form);const recordId=text(form,"record_id",100)||null;const expected=revision(form,"expected_version");
    const createNew=form.get("new_record")==="1";const result=await submitRecord(env.DB,user,key,person,kind,createNew?null:recordId,createNew?0:expected,data,from,to);
    return redirect(astro,{section:kind,saved:kind==="contact"&&person.user_id===user.id?"1":"submitted",result});
   }
   if(intent==="review"){
    const decision=text(form,"decision",20,true);if(!["approved","rejected","withdrawn"].includes(decision))throw new HrmError("invalid_decision");
    await reviewChange(env.DB,user,key,person,text(form,"change_id",100,true),revision(form),decision as "approved"|"rejected"|"withdrawn",text(form,"reason",500,decision!=="withdrawn"));
    return redirect(astro,{section:kind,saved:decision});
   }
   throw new HrmError("invalid_action");
  }catch(error){
    notice=error instanceof HrmError?error.message:"internal_error";
    astro.response.status=error instanceof HrmError?error.status:500;
    if(import.meta.env.DEV&&!(error instanceof HrmError))console.error("[hrm] profile mutation failed:",error instanceof Error?(error.name+": "+error.message.slice(0,240)):"unknown error");
  }
 }
 const [records,changes]=await Promise.all([recordsFor(env.DB,user,person,kind),changesFor(env.DB,user,person,kind)]);
 return {...base(lang,user),title:lang==="vi"?"Hồ sơ nhân viên":"Employee profile",person,kind,records,changes,saved:astro.url.searchParams.has("saved"),error:notice};
}
export async function createPersonPage(astro:AstroGlobal,lang:Lang):Promise<Response| (PageBase & {error?:string;saved?:boolean;settings:Settings;managers:MemberRow[]})>{
 const {user,env}=common(astro,lang);if(!user.can("hrm.records.manage"))return new Response("Forbidden",{status:403});
 const config=await settings(env.DB);requireLive(user);let error:string|undefined;const managers=await import("../workspace/members").then(({membersWithRoles})=>membersWithRoles(env.DB,env.CONTENT_DB,["people_manager","hrm_admin"]));
 if(astro.request.method==="POST")try{
  const form=await formOf(astro);const email=text(form,"account_email",254).toLowerCase();let accountId:string|null=null;if(email){const rows=(await env.CONTENT_DB.prepare("SELECT id FROM users WHERE lower(email)=? AND disabled=0 LIMIT 2").bind(email).all<{id:string}>()).results;if(rows.length!==1)throw new HrmError("invalid_account");accountId=rows[0].id;}const fields={employee_code:text(form,"employee_code",50,true),user_id:accountId,legal_name:text(form,"legal_name",200,true),preferred_name:text(form,"preferred_name",200),work_email:text(form,"work_email",254),work_phone:text(form,"work_phone",40),department:text(form,"department",200),job_title:text(form,"job_title",200),legal_entity:text(form,"legal_entity",200,true),location:text(form,"location",200),manager_user_id:text(form,"manager_user_id",100)||null,status:text(form,"status",20,true),started_on:date(text(form,"started_on",10)),ended_on:date(text(form,"ended_on",10))};
  if(!["preboarding","probation","active","notice","ended"].includes(fields.status))throw new HrmError("invalid_status");
  if(fields.work_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.work_email))throw new HrmError("invalid_email");
  if(config.legal_entity&&fields.legal_entity!==config.legal_entity)throw new HrmError("legal_entity_unconfigured");
  if(fields.ended_on&&fields.started_on&&fields.ended_on<fields.started_on)throw new HrmError("invalid_date");
  if(fields.user_id&&fields.work_email&&fields.work_email.toLowerCase()!==fields.work_email)fields.work_email=fields.work_email.toLowerCase();
  await savePerson(env.DB,env.CONTENT_DB,user,text(form,"request_key",100,true),null,null,0,0,{...fields,relationship_type:relationshipType(form,"employee")});
  return redirect(astro,{saved:"1"});
 }catch(e){error=e instanceof HrmError?e.message:"internal_error";if(e instanceof HrmError)astro.response.status=e.status;}
 return {...base(lang,user),title:lang==="vi"?"Tạo hồ sơ nhân viên":"Create employee",error,saved:astro.url.searchParams.has("saved"),settings:config,managers};
}

export async function workProfilePage(astro:AstroGlobal,lang:Lang,personId:string):Promise<Response|(PageBase&{person:Person;accountEmail:string;managers:MemberRow[];saved:boolean;canRehire:boolean;rehired:boolean;error?:string})>{
 const {user,env}=common(astro,lang);requireLive(user);const person=await personFor(env.DB,user,personId);if(!user.can("hrm.records.manage")&&!user.can("hrm.team.read"))throw new HrmError("forbidden",403);
 const managers=await import("../workspace/members").then(({membersWithRoles})=>membersWithRoles(env.DB,env.CONTENT_DB,["people_manager","hrm_admin"]));let error:string|undefined;const canRehire=user.can("hrm.records.manage")&&person.status==="ended"&&!!person.ended_on&&person.ended_on<=localDate();
 if(astro.request.method==="POST")try{
  if(!user.can("hrm.records.manage"))throw new HrmError("forbidden",403);
  const form=await formOf(astro);const intent=text(form,"intent",20)||"save";const requestKey=text(form,"request_key",100,true);
  if(intent==="rehire"){
   const input={work_email:text(form,"work_email",254).toLowerCase(),work_phone:text(form,"work_phone",40),department:text(form,"department",200),job_title:text(form,"job_title",200),legal_entity:text(form,"legal_entity",200,true),location:text(form,"location",200),manager_user_id:text(form,"manager_user_id",100)||null,status:text(form,"status",20,true) as "preboarding"|"probation"|"active",started_on:date(text(form,"started_on",10,true))!,relationship_type:relationshipType(form,person.relationship_type)};
   if(!["preboarding","probation","active"].includes(input.status))throw new HrmError("invalid_status");
   if(input.work_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.work_email))throw new HrmError("invalid_email");
   await startEmploymentPeriod(env.DB,env.CONTENT_DB,user,requestKey,person.id,text(form,"previous_employment_id",100,true),revision(form,"previous_version"),input);
   return redirect(astro,{rehired:"1"});
  }
  if(intent!=="save")throw new HrmError("invalid_action");
  const email=text(form,"account_email",254).toLowerCase();let accountId:string|null=null;
  if(email){const rows=(await env.CONTENT_DB.prepare("SELECT id FROM users WHERE lower(email)=? AND disabled=0 LIMIT 2").bind(email).all<{id:string}>()).results;if(rows.length!==1)throw new HrmError("invalid_account");accountId=rows[0].id}
  const input={employee_code:text(form,"employee_code",50,true),user_id:accountId,legal_name:text(form,"legal_name",200,true),preferred_name:text(form,"preferred_name",200),work_email:text(form,"work_email",254),work_phone:text(form,"work_phone",40),department:text(form,"department",200),job_title:text(form,"job_title",200),legal_entity:text(form,"legal_entity",200,true),location:text(form,"location",200),manager_user_id:text(form,"manager_user_id",100)||null,status:text(form,"status",20,true),started_on:date(text(form,"started_on",10)),ended_on:date(text(form,"ended_on",10))};
  if(!["preboarding","probation","active","notice","ended"].includes(input.status))throw new HrmError("invalid_status");if(input.ended_on&&input.started_on&&input.ended_on<input.started_on)throw new HrmError("invalid_date");if(input.work_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.work_email))throw new HrmError("invalid_email");if(input.legal_entity!==person.legal_entity&&input.legal_entity!==(await settings(env.DB)).legal_entity)throw new HrmError("legal_entity_unconfigured");
  await savePerson(env.DB,env.CONTENT_DB,user,requestKey,person.id,text(form,"employment_id",100,true),revision(form),revision(form,"profile_version"),{...input,relationship_type:relationshipType(form,person.relationship_type)});return redirect(astro,{saved:"1"});
 }catch(cause){error=cause instanceof HrmError?cause.message:"internal_error";if(cause instanceof HrmError)astro.response.status=cause.status}
 let accountEmail="";if(user.can("hrm.records.manage")&&person.user_id)accountEmail=(await env.CONTENT_DB.prepare("SELECT email FROM users WHERE id=?").bind(person.user_id).first<{email:string}>())?.email??"";await import("./service").then(({audit})=>audit(env.DB,user,"work_record_viewed",person.id,person.employment_id));
 return {...base(lang,user),title:lang==="vi"?"Thông tin công việc":"Work details",person,accountEmail,managers,saved:astro.url.searchParams.has("saved"),canRehire,rehired:astro.url.searchParams.get("rehired")==="1",error};
}
