import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { sameOrigin } from "../http";
import { HrmError, date, text } from "./fields";
import type { Lang, PageBase } from "./pages";
import { settings } from "./service";
import { activateLegalVersion, acknowledgePolicy, createLegalTemplate, createLegalVersion, getLegalIssue, issueLegalDocument, listLegalIssues, listLegalSourceFiles, listLegalTemplateVersions, listLegalTemplates, listIssueTargets, listMyLegalIssues, retireLegalTemplate, reviewLegalFile, reviewLegalVersion, verifyPaperParty, type LegalFile, type LegalIssue, type LegalTemplate, type LegalVersion } from "./legal";

const pageBase=(lang:Lang,user:NonNullable<AstroGlobal["locals"]["workspace"]>,title:string):PageBase=>({lang,vi:lang==="vi",user,title,live:user.hrmEnabled===true});
const redirect=(astro:AstroGlobal,params:Record<string,string>)=>{const url=new URL(astro.url);for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);return new Response(null,{status:303,headers:{Location:url.pathname+url.search,"Cache-Control":"private, no-store"}})};
const formOf=async(astro:AstroGlobal):Promise<FormData>=>{if(!sameOrigin(astro.request))throw new HrmError("invalid_origin",400);const request=astro.locals.hrmFormRequest??astro.request;const form=await request.formData().catch(()=>null);if(!form)throw new HrmError("invalid_form",400);return form};

export interface LegalConsole extends PageBase {templates:(LegalTemplate&{latest_version:number|null;source_state:string|null})[];versions:(LegalVersion&{source_name:string;source_state:string})[];files:LegalFile[];issues:(LegalIssue&{employee_code:string;legal_name:string;document_type:string;title_en:string;version_number:number})[];people:{id:string;employee_code:string;legal_name:string;status:string}[];selectedTemplate:string;saved:string;error?:string;legalEntity:string}
export async function legalDocumentsPage(astro:AstroGlobal,lang:Lang):Promise<Response|LegalConsole>{
 const user=astro.locals.workspace!;if(!user.can("hrm.legal.manage"))return new Response("Forbidden",{status:403});
 const {DB}=envFromLocals(astro.locals);let error:string|undefined;
 if(astro.request.method==="POST")try{
  const form=await formOf(astro),intent=text(form,"intent",30,true),key=text(form,"request_key",100,true);
  if(intent==="create_template"){
   await createLegalTemplate(DB,user,key,{document_key:text(form,"document_key",80,true).toLowerCase(),document_type:text(form,"document_type",40,true) as LegalTemplate["document_type"],title_en:text(form,"title_en",200,true),title_vi:text(form,"title_vi",200,true)});
   return redirect(astro,{saved:"template"});
  }
  if(intent==="create_version"){
   const signing=text(form,"signing_mode",30,true);if(signing!=="acknowledgement"&&signing!=="paper_scan")throw new HrmError("invalid_document_config");
   const audience=form.getAll("audience_status").filter((value):value is string=>typeof value==="string");const requiresAck=signing==="acknowledgement"&&form.get("requires_ack")==="1";
   const parties=signing==="paper_scan"?[
    {party_key:"employee",party_kind:"employee",display_name:"Employee",required:true},
    {party_key:"company",party_kind:"company",display_name:text(form,"company_party_name",160,true),required:true},
   ]:[];
   const due=text(form,"due_days",5,true);if(!/^\d{1,4}$/.test(due))throw new HrmError("invalid_document_config");
   await createLegalVersion(DB,user,key,text(form,"template_id",100,true),text(form,"source_file_id",100,true),{language:text(form,"language",20,true) as "en"|"vi"|"bilingual",legal_entity:text(form,"legal_entity",200,true),purpose:text(form,"purpose",1000,true),audience_json:JSON.stringify(audience),requires_ack:requiresAck,signing_mode:signing,required_parties_json:JSON.stringify(parties),effective_on:date(text(form,"effective_on",10)),due_days:Number(due)});
   return redirect(astro,{selected:text(form,"template_id",100,true),saved:"version"});
  }
  if(intent==="review_version"){
   const decision=text(form,"decision",10,true);if(decision!=="approve"&&decision!=="reject")throw new HrmError("invalid_decision");
   await reviewLegalVersion(DB,user,key,text(form,"version_id",100,true),Number(text(form,"version",10,true)),decision==="approve",text(form,"reason",500,true));
   return redirect(astro,{selected:text(form,"template_id",100,true),saved:decision==="approve"?"reviewed":"rejected"});
  }
  if(intent==="activate_version"){
   await activateLegalVersion(DB,user,key,text(form,"version_id",100,true),Number(text(form,"version",10,true)));
   return redirect(astro,{selected:text(form,"template_id",100,true),saved:"activated"});
  }
  if(intent==="issue"){
   if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
   await issueLegalDocument(DB,user,key,text(form,"template_id",100,true),text(form,"person_id",100,true));
   return redirect(astro,{saved:"issued"});
  }
  if(intent==="retire_template"){
   await retireLegalTemplate(DB,user,key,text(form,"template_id",100,true),Number(text(form,"version",10,true)),text(form,"reason",500,true));
   return redirect(astro,{saved:"retired"});
  }
  throw new HrmError("invalid_action");
 }catch(cause){error=cause instanceof HrmError?cause.message:"internal_error";if(cause instanceof HrmError)astro.response.status=cause.status;}
 const [templates,files,issues,people]=await Promise.all([listLegalTemplates(DB,user),listLegalSourceFiles(DB,user),listLegalIssues(DB,user),listIssueTargets(DB,user)]);
 const requested=astro.url.searchParams.get("selected")??"";const selectedTemplate=templates.some(template=>template.id===requested)?requested:templates[0]?.id??"";
 const versions=selectedTemplate?await listLegalTemplateVersions(DB,user,selectedTemplate):[];
 const config=await settings(DB);
 return {...pageBase(lang,user,lang==="vi"?"Chính sách và tài liệu pháp lý":"Policies and legal documents"),templates,versions,files,issues,people,selectedTemplate,saved:astro.url.searchParams.get("saved")??"",error,legalEntity:config.legal_entity};
}

export interface MyLegalDocuments extends PageBase {issues:Awaited<ReturnType<typeof listMyLegalIssues>>;saved:string;error?:string}
export async function myLegalDocumentsPage(astro:AstroGlobal,lang:Lang):Promise<Response|MyLegalDocuments>{
 const user=astro.locals.workspace!;if(!user.can("hrm.legal.self"))return new Response("Forbidden",{status:403});
 try{const {DB}=envFromLocals(astro.locals);const issues=await listMyLegalIssues(DB,user);return {...pageBase(lang,user,lang==="vi"?"Tài liệu của tôi":"My documents"),issues,saved:astro.url.searchParams.get("saved")??""}}
 catch(cause){if(cause instanceof HrmError&&cause.status===404)return new Response("Not found",{status:404,headers:{"Cache-Control":"private, no-store"}});throw cause}
}

export type LegalIssuePageData=PageBase&Awaited<ReturnType<typeof getLegalIssue>>&{saved:string;error?:string;legalManager:boolean;legalReviewer:boolean;requestKey:string;title:string};
export async function legalIssuePage(astro:AstroGlobal,lang:Lang,issueId:string):Promise<Response|LegalIssuePageData>{
 const user=astro.locals.workspace!;const {DB}=envFromLocals(astro.locals);let error:string|undefined;
 if(astro.request.method==="POST")try{
  const form=await formOf(astro),intent=text(form,"intent",30,true),key=text(form,"request_key",100,true);
  if(intent==="acknowledge"){
   await acknowledgePolicy(DB,user,key,issueId,text(form,"checksum",100,true),form.get("affirmed")==="1");
   return redirect(astro,{saved:"acknowledged"});
  }
  if(intent==="review_file"){
   const decision=text(form,"decision",10,true);if(decision!=="reviewed"&&decision!=="rejected")throw new HrmError("invalid_decision");
   await reviewLegalFile(DB,user,key,text(form,"file_id",100,true),Number(text(form,"version",10,true)),decision,text(form,"reason",500,true));
   return redirect(astro,{saved:"file_reviewed"});
  }
  if(intent==="verify_party"){
   await verifyPaperParty(DB,user,key,issueId,text(form,"party_id",100,true),Number(text(form,"version",10,true)),text(form,"file_id",100,true),date(text(form,"signed_on",10)),text(form,"reason",500,true));
   return redirect(astro,{saved:"paper_checked"});
  }
  throw new HrmError("invalid_action");
 }catch(cause){error=cause instanceof HrmError?cause.message:"internal_error";if(!(cause instanceof HrmError)&&import.meta.env.DEV)console.error("[hrm] legal issue mutation failed:",cause instanceof Error?cause.message.slice(0,180):"unknown");if(cause instanceof HrmError)astro.response.status=cause.status;}
 const issue=await getLegalIssue(DB,user,issueId);
 const title=lang==="vi"?issue.title_vi:issue.title_en;
 return {...pageBase(lang,user,title),...issue,saved:astro.url.searchParams.get("saved")??"",error,legalManager:user.can("hrm.legal.manage"),legalReviewer:user.can("hrm.legal.review"),requestKey:crypto.randomUUID(),title};
}
