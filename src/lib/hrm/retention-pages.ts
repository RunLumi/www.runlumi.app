import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { HrmError } from "./fields";
import type { Lang, PageBase } from "./pages";
import { listDeletionRequests, listLegalHolds, listRetentionFiles, listRetentionPolicies, RETENTION_CATEGORIES, type FileDeletionRequest, type LegalHold, type RetentionFile, type RetentionPolicyVersion } from "./retention";
import { listStructuredDispositionRequests, listStructuredRetentionPolicies, listStructuredRetentionRecords, structuredRetentionTemplate, type StructuredDispositionRequest, type StructuredRetentionPolicy, type StructuredRetentionRecord } from "./structured-retention";

export interface RetentionPerson {id:string;employee_code:string;legal_name:string;status:string}
export interface RetentionPageData extends PageBase {
  policies:RetentionPolicyVersion[];files:RetentionFile[];holds:LegalHold[];requests:FileDeletionRequest[];people:RetentionPerson[];
  categories:readonly string[];policyTemplate:string;structuredPolicies:StructuredRetentionPolicy[];structuredRecords:StructuredRetentionRecord[];structuredRequests:StructuredDispositionRequest[];structuredPolicyTemplate:string;requestKey:string;saved:string;error?:string;
}

const allowedErrors=new Set(["invalid_field","retention_policy_invalid","retention_policy_missing","retention_policy_review_required","retention_deletion_in_progress","retention_category_manual_review","retention_category_unconfigured","retention_not_due","legal_hold_active","legal_hold_scope_invalid","legal_hold_record_disposed","retention_file_unreviewed","retention_policy_changed","retention_file_changed","retention_execution_system_admin_only","retention_executor_must_differ","retention_delete_failed","retention_hold_deletion_in_progress","retention_request_system_admin_not_needed","structured_retention_policy_invalid","structured_retention_policy_missing","structured_retention_policy_changed","structured_retention_category_unconfigured","structured_retention_manual_review","structured_retention_anchor_unavailable","structured_record_files_pending","structured_record_change_pending","structured_record_changed","structured_record_already_disposed","structured_disposition_in_progress","self_approval","conflict","invalid_transition","request_key_conflict","reason_required","forbidden","retention_file_date_invalid"]);
export async function retentionPage(astro:AstroGlobal,lang:Lang):Promise<RetentionPageData>{
  const user=astro.locals.workspace!;
  if(!user.can("hrm.retention.manage")&&!user.can("hrm.retention.review")&&!user.can("hrm.legalhold.manage"))throw new HrmError("forbidden",403);
  const {DB}=envFromLocals(astro.locals);
  const [policies,files,holds,requests,people,structuredPolicies,structuredRecords,structuredRequests]=await Promise.all([
    listRetentionPolicies(DB,user),listRetentionFiles(DB,user),listLegalHolds(DB,user),listDeletionRequests(DB,user),
    DB.prepare(`SELECT p.id,p.employee_code,p.legal_name,e.status FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id AND e.id=(SELECT ee.id FROM hrm_employments ee WHERE ee.person_id=p.id ORDER BY CASE WHEN ee.status!='ended' THEN 0 ELSE 1 END,ee.started_on DESC,ee.created_at DESC LIMIT 1) ORDER BY p.employee_code LIMIT 500`).all<RetentionPerson>(),
    listStructuredRetentionPolicies(DB,user),listStructuredRetentionRecords(DB,user),listStructuredDispositionRequests(DB,user),
  ]);
  const template=RETENTION_CATEGORIES.map(category=>({category,retention_days:null,basis:""}));
  const error=astro.url.searchParams.get("error")??"";
  return {lang,vi:lang==="vi",user,title:lang==="vi"?"Lưu trữ và legal hold":"Retention and legal holds",live:user.hrmEnabled===true,
    policies,files,holds,requests,people:people.results,categories:RETENTION_CATEGORIES,policyTemplate:JSON.stringify(template,null,2),structuredPolicies,structuredRecords,structuredRequests,structuredPolicyTemplate:structuredRetentionTemplate(),
    requestKey:crypto.randomUUID(),saved:astro.url.searchParams.get("saved")??"",error:allowedErrors.has(error)?error:undefined};
}
