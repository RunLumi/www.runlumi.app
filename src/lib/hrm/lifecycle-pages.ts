import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { membersWithRoles } from "../workspace/members";
import { HrmError } from "./fields";
import type { Lang, PageBase } from "./pages";
import { settings } from "./service";
import { atsCandidatePreview, getAtsTransfer, type AtsCandidatePreview, type AtsTransferRecord } from "./lifecycle";

export interface AtsTransferPage extends PageBase {
  candidate: AtsCandidatePreview | null;
  transfer: AtsTransferRecord | null;
  employees: { email:string; name:string }[];
  managers: { email:string; name:string }[];
  legalEntity: string;
  settingsVersion: number;
  saved: boolean;
  error?: string;
  requestKey: string;
}

const messages=new Set(["transfer_preview_stale","candidate_not_hired","candidate_already_transferred","candidate_data_invalid","transfer_employee_account_invalid","invalid_employee_code","invalid_account","invalid_manager","conflict","request_key_conflict"]);

export async function atsTransferPage(astro:AstroGlobal,lang:Lang,applicationId:string):Promise<AtsTransferPage>{
  const user=astro.locals.workspace!;
  if(!user.can("hiring.applications.manage")||!user.can("hrm.records.manage"))throw new HrmError("forbidden",403);
  if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
  const {DB,CONTENT_DB}=envFromLocals(astro.locals);
  const transfer=await getAtsTransfer(DB,user,applicationId);
  const config=await settings(DB);
  const requestedError=astro.url.searchParams.get("error")??"";
  if(transfer)return {lang,vi:lang==="vi",user,title:lang==="vi"?"Đã chuyển hồ sơ sang HRM":"Candidate transferred to HRM",live:true,candidate:null,transfer,employees:[],managers:[],legalEntity:config.legal_entity,settingsVersion:config.version,saved:astro.url.searchParams.has("saved"),error:messages.has(requestedError)?requestedError:undefined,requestKey:crypto.randomUUID()};
  const candidate=await atsCandidatePreview(DB,user,applicationId);
  const [employees,managers]=await Promise.all([
    membersWithRoles(DB,CONTENT_DB,["employee"]),
    membersWithRoles(DB,CONTENT_DB,["people_manager","hrm_admin"]),
  ]);
  return {lang,vi:lang==="vi",user,title:lang==="vi"?"Xem trước chuyển sang HRM":"Preview ATS-to-HRM transfer",live:true,candidate,transfer:null,
    employees:employees.map(member=>({email:member.email,name:member.name})),
    managers:managers.map(member=>({email:member.email,name:member.name})),
    legalEntity:config.legal_entity,settingsVersion:config.version,saved:astro.url.searchParams.has("saved"),
    error:messages.has(requestedError)?requestedError:undefined,requestKey:crypto.randomUUID()};
}
