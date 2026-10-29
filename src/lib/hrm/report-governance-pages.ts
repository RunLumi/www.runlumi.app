import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { sameOrigin } from "../http";
import { membersWithRoles } from "../workspace/members";
import { ROLE_PERMISSIONS, type Role } from "../workspace/roles";
import type { PageBase } from "./pages";
import { HrmError, revision, text } from "./fields";
import { readLegalForm } from "./legal-files";
import { settings } from "./service";
import { actOnReportPolicy, createReportPolicy, listReportHolds, listReportPolicies, placeReportHold, releaseReportHold, type ReportHold, type ReportPolicy } from "./report-governance";
export interface ReportGovernancePage extends PageBase {policies:ReportPolicy[];holds:ReportHold[];sources:{id:string;title_en:string;title_vi:string;version_number:number}[];owners:{id:string;name:string}[];error?:string;saved:boolean}
export async function reportGovernancePage(astro:AstroGlobal,lang:"en"|"vi"):Promise<Response|ReportGovernancePage>{
 const user=astro.locals.workspace!;if(!user.can("hrm.reports.manage"))return new Response("Forbidden",{status:403,headers:{"Cache-Control":"private, no-store"}});
 const env=envFromLocals(astro.locals),config=await settings(env.DB);let error:string|undefined;
 if(astro.request.method==="POST")try{
  if(!sameOrigin(astro.request))throw new HrmError("invalid_origin",400);
  const form=await readLegalForm(astro.locals.hrmFormRequest??astro.request),intent=text(form,"intent",40,true),key=text(form,"request_key",100,true);
  if(intent==="create_policy"){
   const days=text(form,"retention_days",5,true);if(!/^\d+$/.test(days))throw new HrmError("report_retention_invalid",400);
   await createReportPolicy(env.DB,env.CONTENT_DB,user,key,{classCode:text(form,"class_code",48,true),captureKind:text(form,"capture_kind",12,true),department:text(form,"department",120),titleEn:text(form,"title_en",120,true),titleVi:text(form,"title_vi",120,true),purpose:text(form,"purpose",1000,true),jurisdiction:text(form,"jurisdiction",300,true),sourceVersionId:text(form,"source_version_id",120),ownerUserId:text(form,"owner_user_id",120,true),retentionDays:Number(days),effectiveFrom:text(form,"effective_from",10,true),effectiveUntil:text(form,"effective_until",10,true)});
  }else if(intent==="policy_action"){
   const action=text(form,"action",12,true);if(!["approve","reject","activate","retire"].includes(action))throw new HrmError("invalid_action",400);
   await actOnReportPolicy(env.DB,env.CONTENT_DB,user,key,{policyRef:text(form,"policy_ref",120,true),version:revision(form),action:action as "approve"|"reject"|"activate"|"retire",reason:text(form,"reason",500,true)});
  }else if(intent==="place_hold"){
   const scope=text(form,"scope_kind",12,true),mode=text(form,"department_mode",8,true);if(!["entity","class","snapshot","schedule"].includes(scope)||!["all","exact"].includes(mode))throw new HrmError("report_hold_invalid",400);
   await placeReportHold(env.DB,env.CONTENT_DB,user,key,{scopeKind:scope as ReportHold["scope_kind"],targetRef:text(form,"target_ref",120),period:text(form,"period",7),departmentMode:mode as "all"|"exact",department:text(form,"department",120),reason:text(form,"reason",1000,true)});
  }else if(intent==="release_hold"){
   await releaseReportHold(env.DB,env.CONTENT_DB,user,key,{holdRef:text(form,"hold_ref",120,true),version:revision(form),reason:text(form,"reason",500,true)});
  }else throw new HrmError("invalid_action",400);
  return new Response(null,{status:303,headers:{Location:astro.url.pathname+"?saved=1","Cache-Control":"private, no-store"}});
 }catch(caught){error=caught instanceof HrmError?caught.message:"internal_error";astro.response.status=caught instanceof HrmError?caught.status:500}
 const roles=Object.entries(ROLE_PERMISSIONS).filter(([,p])=>p.includes("hrm.reports.read")).map(([role])=>role as Role);
 const [policies,holds,sources,members,admins]=await Promise.all([
  listReportPolicies(env.DB,user),listReportHolds(env.DB,user),
  env.DB.prepare(`SELECT v.id,t.title_en,t.title_vi,v.version_number FROM hrm_legal_template_versions v JOIN hrm_legal_templates t ON t.id=v.template_id WHERE v.legal_entity=? ORDER BY v.created_at DESC,v.id LIMIT 100`).bind(config.legal_entity).all<{id:string;title_en:string;title_vi:string;version_number:number}>(),
  membersWithRoles(env.DB,env.CONTENT_DB,roles),env.CONTENT_DB.prepare("SELECT id,COALESCE(name,email) AS name FROM users WHERE role=50 AND disabled=0 ORDER BY id LIMIT 100").all<{id:string;name:string}>(),
 ]);
 const owners=[...new Map([...members.map(m=>({id:m.user_id,name:m.name||m.email})),...admins.results].map(m=>[m.id,m])).values()];
 return {lang,vi:lang==="vi",user,title:lang==="vi"?"Chính sách và tạm giữ báo cáo":"Report policies and holds",live:user.hrmEnabled===true,policies,holds,sources:sources.results,owners,error,saved:astro.url.searchParams.get("saved")==="1"};
}
