import type { WorkspaceUser } from "../workspace/roles";
import { HrmError } from "./fields";
import { audit, guard, id, localDate, now, own, personFor, requirePermission } from "./service";

const ROW_LIMIT=5000;
const BYTE_LIMIT=5*1024*1024;

interface ExportRow { [key:string]:unknown }
interface JsonExportRow extends ExportRow {data:unknown}
interface RecordRow extends JsonExportRow {id:string}
interface HistoryRow extends JsonExportRow {record_id:string}
interface ChangeRow extends JsonExportRow {record_id:string}
interface FileRow extends ExportRow {record_id:string|null}
interface LegalIssueRow extends ExportRow {issue_no:number;snapshot_json:string;source_checksum:string;acknowledged_at:string|null}
interface CoiRow extends ExportRow {declaration_no:number;answers_json:string}
interface ServiceRequestRow extends ExportRow {id:string}
interface ServiceEventRow extends ExportRow {request_id:string}
interface ServiceFileRow extends ExportRow {request_id:string;object_available:number}
interface OnboardingPlanRow extends ExportRow {id:string}
interface OnboardingTaskRow extends ExportRow {id:string;plan_id:string;assigned_to_me:number;dependencies_ready:number}
interface OnboardingFileRow extends ExportRow {task_id:string;object_available:number}
export interface HrmProfileExportResult {body:string;contentBytes:number;personId:string}
function parseData<T extends JsonExportRow>(row:T):Omit<T,"data">&{data:unknown}{
 let data:unknown;try{data=JSON.parse(String(row.data))}catch{throw new HrmError("profile_export_invalid_record",409)}
 const metadata={...row};delete metadata.data;return {...metadata,data} as Omit<T,"data">&{data:unknown};
}
function safeLegalSnapshot(value:string):Record<string,unknown>{
 let parsed:unknown;try{parsed=JSON.parse(value)}catch{throw new HrmError("profile_export_invalid_record",409)}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new HrmError("profile_export_invalid_record",409);
 const source=parsed as Record<string,unknown>,keys=["document_type","title_en","title_vi","version","language","legal_entity","purpose","effective_on","source_checksum","signing_mode","requires_ack"];
 return Object.fromEntries(keys.filter(key=>Object.hasOwn(source,key)).map(key=>[key,source[key]]));
}

/** A bounded, self-only snapshot. File bytes and other HRM modules stay on their existing routes. */
export async function exportOwnHrmProfile(db:D1Database,user:WorkspaceUser):Promise<HrmProfileExportResult>{
 requirePermission(user,"hrm.profile.self");
 requirePermission(user,"hrm.legal.self");
 requirePermission(user,"hrm.coi.self");
 if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const person=await personFor(db,user);
 if(!own(person,user))throw new HrmError("not_found",404);
 if(!user.can("hrm.services.self")&&!user.can("hrm.services.manage"))throw new HrmError("forbidden",403);
 if(!user.can("hrm.onboarding.self")&&!user.can("hrm.onboarding.manage"))throw new HrmError("forbidden",403);
 let batch:D1Result<unknown>[];
 try{batch=await db.batch([
  guard(db,"EXISTS(SELECT 1 FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id WHERE p.id=? AND p.user_id=? AND p.version=? AND e.id=? AND e.version=? AND e.status!='ended' AND (e.ended_on IS NULL OR e.ended_on>?))",[person.id,user.id,person.profile_version,person.employment_id,person.version,localDate()]),
  db.prepare(`SELECT legal_entity,work_email,work_phone,department,job_title,location,status,started_on,ended_on,created_at,updated_at,version,
      CASE WHEN id=? THEN 1 ELSE 0 END AS is_current
    FROM hrm_employments WHERE person_id=? ORDER BY started_on,created_at LIMIT ?`).bind(person.employment_id,person.id,ROW_LIMIT+1),
  db.prepare(`SELECT id,kind,data,state,effective_from,effective_to,version,verified_at,created_at,updated_at
    FROM hrm_records WHERE person_id=? ORDER BY kind,created_at,id LIMIT ?`).bind(person.id,ROW_LIMIT+1),
  db.prepare(`SELECT h.record_id,r.kind,h.version,h.data,h.state,h.effective_from,h.effective_to,h.created_at
    FROM hrm_record_history h JOIN hrm_records r ON r.id=h.record_id
    WHERE r.person_id=? ORDER BY r.kind,h.created_at,h.version LIMIT ?`).bind(person.id,ROW_LIMIT+1),
  db.prepare(`SELECT record_id,kind,expected_version,data,effective_from,effective_to,state,version,created_at,updated_at
    FROM hrm_change_requests WHERE person_id=? ORDER BY created_at,kind LIMIT ?`).bind(person.id,ROW_LIMIT+1),
  db.prepare(`SELECT record_id,kind AS file_kind,original_name,mime_type,size_bytes,checksum,state,expires_on,created_at,
      CASE WHEN object_deleted_at IS NULL THEN 1 ELSE 0 END AS object_available
    FROM hrm_files WHERE person_id=? AND kind IN ('avatar','identity','dependent','bank','tax','personal')
    ORDER BY created_at,kind,original_name LIMIT ?`).bind(person.id,ROW_LIMIT+1),
  db.prepare(`SELECT i.issue_no,i.snapshot_json,i.source_checksum,i.state,i.issued_at,i.due_at,i.created_at,i.updated_at,a.acknowledged_at
    FROM hrm_legal_issues i
    LEFT JOIN hrm_policy_acknowledgements a ON a.issue_id=i.id AND a.person_id=i.person_id
      AND a.template_version_id=i.template_version_id AND a.source_checksum=i.source_checksum
    WHERE i.person_id=? ORDER BY i.issued_at,i.issue_no LIMIT ?`).bind(person.id,ROW_LIMIT+1),
  db.prepare(`SELECT i.issue_no,p.party_key,p.state,p.required,p.signed_at,p.declared_signed_on,p.updated_at
    FROM hrm_legal_parties p JOIN hrm_legal_issues i ON i.id=p.issue_id
    WHERE i.person_id=? AND p.party_kind='employee' AND p.user_id=? ORDER BY i.issue_no,p.party_key LIMIT ?`).bind(person.id,user.id,ROW_LIMIT+1),
  db.prepare(`SELECT declaration_no,answers_json,state,submitted_at,reviewed_at,mitigation,followup_due,created_at,updated_at
    FROM hrm_coi_declarations WHERE person_id=? ORDER BY declaration_no LIMIT ?`).bind(person.id,ROW_LIMIT+1),
  db.prepare(`SELECT c.declaration_no,e.action,e.created_at
    FROM hrm_coi_events e JOIN hrm_coi_declarations c ON c.id=e.declaration_id
    WHERE c.person_id=? ORDER BY c.declaration_no,e.created_at LIMIT ?`).bind(person.id,ROW_LIMIT+1),
  db.prepare(`SELECT i.issue_no,c.declaration_no,f.kind AS file_kind,f.original_name,f.mime_type,f.size_bytes,f.checksum,f.state,f.created_at,
      CASE WHEN f.object_deleted_at IS NULL THEN 1 ELSE 0 END AS object_available
    FROM hrm_legal_files f
    LEFT JOIN hrm_legal_issues i ON i.id=f.issue_id AND i.person_id=f.person_id
    LEFT JOIN hrm_coi_declarations c ON c.id=f.coi_declaration_id AND c.person_id=f.person_id
    WHERE f.person_id=? AND f.kind='pdf_evidence' AND (i.id IS NOT NULL OR c.id IS NOT NULL)
    ORDER BY f.created_at,f.kind,f.original_name LIMIT ?`).bind(person.id,ROW_LIMIT+1),
  db.prepare(`SELECT id,request_type,subject,state,sensitivity,due_on,version,created_at,updated_at
    FROM hrm_service_requests WHERE person_id=? ORDER BY created_at,id LIMIT ?`).bind(person.id,ROW_LIMIT+1),
  db.prepare(`SELECT e.request_id,e.event_type,e.body,e.created_at
    FROM hrm_service_request_events e JOIN hrm_service_requests r ON r.id=e.request_id
    WHERE r.person_id=? AND e.visibility='employee' ORDER BY e.request_id,e.created_at,e.id LIMIT ?`).bind(person.id,ROW_LIMIT+1),
  db.prepare(`SELECT r.id AS request_id,f.kind AS file_kind,f.original_name,f.mime_type,f.size_bytes,f.checksum,f.state,f.created_at,
      CASE WHEN f.object_deleted_at IS NULL THEN 1 ELSE 0 END AS object_available
    FROM hrm_service_request_attachments a JOIN hrm_service_requests r ON r.id=a.request_id AND r.person_id=a.person_id
    JOIN hrm_files f ON f.id=a.file_id AND f.person_id=r.person_id
    WHERE r.person_id=? AND f.kind='service_evidence'
    ORDER BY a.created_at,a.id LIMIT ?`).bind(person.id,ROW_LIMIT+1),
  db.prepare(`SELECT id,started_on,state,created_at,updated_at FROM hrm_onboarding_plans
    WHERE person_id=? AND state IN ('active','completed','cancelled') ORDER BY started_on,created_at,id LIMIT ?`).bind(person.id,ROW_LIMIT+1),
  db.prepare(`SELECT t.id,t.plan_id,t.task_key,t.title_en,t.title_vi,t.milestone,t.due_at,t.required,t.evidence_type,t.action_key,t.state,t.submitted_at,t.completed_at,t.verified_at,t.review_reason,t.blocked_reason,
      CASE WHEN NOT EXISTS(SELECT 1 FROM json_each(t.dependencies_json) dep_key JOIN hrm_onboarding_tasks dep ON dep.id=dep_key.value WHERE dep.state NOT IN ('verified','completed','waived')) THEN 1 ELSE 0 END AS dependencies_ready,
      CASE WHEN t.assignee_user_id=? THEN t.instructions_en ELSE '' END AS instructions_en,
      CASE WHEN t.assignee_user_id=? THEN t.instructions_vi ELSE '' END AS instructions_vi,
      CASE WHEN t.assignee_user_id=? THEN t.submission_text ELSE NULL END AS submission_text,
      CASE WHEN t.assignee_user_id=? THEN 1 ELSE 0 END AS assigned_to_me,op.state AS plan_state,op.started_on AS plan_started_on
    FROM hrm_onboarding_tasks t JOIN hrm_onboarding_plans op ON op.id=t.plan_id JOIN hrm_people p ON p.id=op.person_id
    WHERE p.user_id=? AND op.state IN ('active','completed','cancelled')
    ORDER BY op.started_on,op.id,t.due_at,t.task_key LIMIT ?`).bind(user.id,user.id,user.id,user.id,user.id,ROW_LIMIT+1),
  db.prepare(`SELECT t.id AS task_id,f.kind AS file_kind,f.original_name,f.mime_type,f.size_bytes,f.checksum,f.state,f.created_at,
      CASE WHEN f.object_deleted_at IS NULL THEN 1 ELSE 0 END AS object_available
    FROM hrm_onboarding_tasks t JOIN hrm_onboarding_plans op ON op.id=t.plan_id JOIN hrm_people p ON p.id=op.person_id
    JOIN hrm_onboarding_submissions s ON s.id=t.current_submission_id
    JOIN hrm_legal_files f ON f.id=s.evidence_file_id AND f.person_id=p.id AND f.onboarding_task_id=t.id
    WHERE p.user_id=? AND t.assignee_user_id=? AND op.state IN ('active','completed','cancelled') AND f.kind='pdf_evidence'
    ORDER BY op.started_on,op.id,t.due_at,t.task_key,f.created_at LIMIT ?`).bind(user.id,user.id,ROW_LIMIT+1),
  db.prepare("DELETE FROM hrm_write_guards"),
 ])}catch(error){if(error instanceof Error&&/CHECK constraint failed/.test(error.message))throw new HrmError("conflict",409);throw error}
 const employmentPeriods=batch[1]?.results as ExportRow[]??[],records=batch[2]?.results as RecordRow[]??[],recordHistory=batch[3]?.results as HistoryRow[]??[],changeRequests=batch[4]?.results as ChangeRow[]??[],files=batch[5]?.results as FileRow[]??[];
 const legalIssueRows=batch[6]?.results as LegalIssueRow[]??[],employeeParties=batch[7]?.results as ExportRow[]??[],coiRows=batch[8]?.results as CoiRow[]??[],coiEvents=batch[9]?.results as ExportRow[]??[],legalFiles=batch[10]?.results as ExportRow[]??[],serviceRequests=batch[11]?.results as ServiceRequestRow[]??[],serviceEvents=batch[12]?.results as ServiceEventRow[]??[],serviceFiles=batch[13]?.results as ServiceFileRow[]??[],onboardingPlans=batch[14]?.results as OnboardingPlanRow[]??[],onboardingTasks=batch[15]?.results as OnboardingTaskRow[]??[],onboardingFiles=batch[16]?.results as OnboardingFileRow[]??[];
 for(const collection of [employmentPeriods,records,recordHistory,changeRequests,files,legalIssueRows,employeeParties,coiRows,coiEvents,legalFiles,serviceRequests,serviceEvents,serviceFiles,onboardingPlans,onboardingTasks,onboardingFiles])if(collection.length>ROW_LIMIT)throw new HrmError("profile_export_too_large",413);
 const recordIds=[...new Set([...records.map(row=>row.id),...recordHistory.map(row=>row.record_id),...changeRequests.map(row=>row.record_id),...files.flatMap(row=>row.record_id?[row.record_id]:[])])];
 const recordRefs=new Map(recordIds.map((recordId,index)=>[recordId,`record-${index+1}`]));
 const recordData=records.map(row=>{const {id:recordId,...value}=row;return {...parseData(value),record_ref:recordRefs.get(recordId)}});
 const historyData=recordHistory.map(row=>{const {record_id:recordId,...value}=row;return {...parseData(value),record_ref:recordRefs.get(recordId)}});
 const changeData=changeRequests.map(row=>{const {record_id:recordId,...value}=row;return {...parseData(value),record_ref:recordRefs.get(recordId)}});
 const fileData=files.map(row=>{const {record_id:recordId,...value}=row;return {...value,record_ref:recordId?recordRefs.get(recordId)??null:null,object_available:Boolean(value.object_available)}});
 const legalDocuments=legalIssueRows.map(row=>{const {snapshot_json,...value}=row;return {...value,snapshot:safeLegalSnapshot(snapshot_json)}});
 const acknowledgements=legalIssueRows.filter(row=>typeof row.acknowledged_at==="string").map(row=>({issue_no:row.issue_no,version:safeLegalSnapshot(row.snapshot_json).version,source_checksum:row.source_checksum,acknowledged_at:row.acknowledged_at}));
 const coiDeclarations=coiRows.map(row=>{const {answers_json,...value}=row;let answers:unknown;try{answers=JSON.parse(answers_json)}catch{throw new HrmError("profile_export_invalid_record",409)}return {...value,answers}});
 const legalFileData=legalFiles.map(file=>({...file,object_available:Boolean(file.object_available)}));
 const serviceRequestIds=[...new Set([...serviceRequests.map(row=>row.id),...serviceEvents.map(row=>row.request_id),...serviceFiles.map(row=>row.request_id)])];
 const serviceRequestRefs=new Map(serviceRequestIds.map((requestId,index)=>[requestId,`request-${index+1}`]));
 const serviceRequestData=serviceRequests.map(row=>{const {id:requestId,...value}=row;return {...value,request_ref:serviceRequestRefs.get(requestId)}});
 const serviceEventData=serviceEvents.map(row=>{const {request_id:requestId,...value}=row;return {...value,request_ref:serviceRequestRefs.get(requestId)}});
 const serviceFileData=serviceFiles.map(row=>{const {request_id:requestId,...value}=row;return {...value,request_ref:serviceRequestRefs.get(requestId),object_available:Boolean(value.object_available)}});
 const onboardingPlanRefs=new Map(onboardingPlans.map((row,index)=>[row.id,`onboarding-plan-${index+1}`]));
 const onboardingPlanData=onboardingPlans.map(({id:planId,...value})=>({...value,plan_ref:onboardingPlanRefs.get(planId)}));
 const onboardingTaskRefs=new Map(onboardingTasks.map((row,index)=>[row.id,`onboarding-task-${index+1}`]));
 const onboardingTaskData=onboardingTasks.map(({id:taskId,plan_id:planId,...value})=>({...value,plan_ref:onboardingPlanRefs.get(planId),task_ref:onboardingTaskRefs.get(taskId),assigned_to_me:Boolean(value.assigned_to_me),dependencies_ready:Boolean(value.dependencies_ready)}));
 const onboardingFileData=onboardingFiles.map(({task_id:taskId,...value})=>({...value,task_ref:onboardingTaskRefs.get(taskId),object_available:Boolean(value.object_available)}));
 const createdAt=now();
 const bundle={
  schema_version:4,
  export_scope:"self_profile_legal_coi_requests_onboarding_snapshot",
  exported_at:createdAt,
  included:["profile_identity","employment_periods","structured_profile_records","record_revision_history","profile_change_requests","profile_file_metadata","legal_document_issues","employee_party_status","policy_acknowledgements","coi_declarations","coi_event_actions","legal_evidence_file_metadata","employee_hr_requests","employee_visible_request_events","service_request_file_metadata","onboarding_plans","onboarding_tasks","onboarding_evidence_file_metadata"],
  excluded:["file_contents","object_keys","internal_review_notes","reviewer_identity","required_parties","other_legal_parties","hr_only_request_notes","other_people_onboarding","onboarding_internal_owner_ids","onboarding_event_details","attendance","leave","payroll","assets","benefits","training","other_people","audit_log"],
  profile:{employee_code:person.employee_code,legal_name:person.legal_name,preferred_name:person.preferred_name},
  employment_periods:employmentPeriods,
  records:recordData,
  record_history:historyData,
  change_requests:changeData,
  profile_files:fileData,
  legal_documents:legalDocuments,
  employee_party_status:employeeParties,
  policy_acknowledgements:acknowledgements,
  coi_declarations:coiDeclarations,
  coi_event_actions:coiEvents,
  legal_evidence_files:legalFileData,
  hr_requests:serviceRequestData,
  hr_request_events:serviceEventData,
  hr_request_files:serviceFileData,
  onboarding_plans:onboardingPlanData,
  onboarding_tasks:onboardingTaskData,
  onboarding_evidence_files:onboardingFileData,
 };
 const body=JSON.stringify(bundle,null,2),contentBytes=new TextEncoder().encode(body).byteLength;
 if(contentBytes>BYTE_LIMIT)throw new HrmError("profile_export_too_large",413);
 const exportId=id("profile_export");
 await audit(db,user,"employee_profile_exported",person.id,exportId,{scope:"self_profile_legal_coi_requests_onboarding_snapshot",employment_period_count:employmentPeriods.length,record_count:recordData.length,history_count:historyData.length,change_request_count:changeData.length,file_metadata_count:files.length,legal_document_count:legalDocuments.length,acknowledgement_count:acknowledgements.length,coi_declaration_count:coiDeclarations.length,legal_file_metadata_count:legalFileData.length,service_request_count:serviceRequestData.length,service_event_count:serviceEventData.length,service_file_metadata_count:serviceFileData.length,onboarding_plan_count:onboardingPlanData.length,onboarding_task_count:onboardingTaskData.length,onboarding_file_metadata_count:onboardingFileData.length,content_bytes:contentBytes});
 return {body,contentBytes,personId:person.id};
}
