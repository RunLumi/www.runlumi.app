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
interface TimeEntryRow extends ExportRow {id:string}
interface TimeAdjustmentRow extends ExportRow {id:string;entry_id:string}
interface LeaveRequestExportRow extends ExportRow {id:string;evidence_object_available:number;evidence_deleted:number;evidence_superseded:number}
interface LeaveBalanceExportRow extends ExportRow {leave_type_key:string;balance_minutes:number;pending_minutes:number}
interface PayslipExportRow extends ExportRow {id:string;supersedes_payslip_id:string|null;snapshot_json:string;paid_minor:number}
interface PayrollDisputeExportRow extends ExportRow {id:string;payslip_id:string}
interface PayrollDisputeEventExportRow extends ExportRow {dispute_id:string}
interface EmployeeAssetExportRow extends ExportRow {id:string}
interface EmployeeAssetEvidenceExportRow extends ExportRow {assignment_id:string;object_available:number}
interface EmployeeAssetReminderExportRow extends ExportRow {assignment_id:string}
interface EmployeeBenefitPlanExportRow extends ExportRow {id:string}
interface EmployeeBenefitEnrollmentExportRow extends ExportRow {id:string;plan_version_id:string}
interface EmployeeTrainingAssignmentExportRow extends ExportRow {id:string}
interface EmployeeTrainingEvidenceExportRow extends ExportRow {assignment_id:string;object_available:number}
interface SelfPayrollLine {component_code:string;title_en:string;title_vi:string;direction:"earning"|"deduction";amount_minor:number}
interface SelfPayrollSnapshot {
 policy:{title_en:string;title_vi:string;legal_entity:string;currency:string;minor_unit_scale:number;revision:number};
 period_key:string;starts_on:string;ends_on:string;employee_code:string;display_name:string;correction_of_payslip_id:string|null;
 lines:SelfPayrollLine[];gross_minor:number;deductions_minor:number;net_minor:number;
}
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
function safePayrollSnapshot(value:string):SelfPayrollSnapshot{
 let parsed:unknown;try{parsed=JSON.parse(value)}catch{throw new HrmError("profile_export_invalid_record",409)}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new HrmError("profile_export_invalid_record",409);
 const source=parsed as Record<string,unknown>,policy=source.policy;
 if(!policy||typeof policy!=="object"||Array.isArray(policy)||!Array.isArray(source.lines)||source.lines.length>500)throw new HrmError("profile_export_invalid_record",409);
 const policyValue=policy as Record<string,unknown>,minorUnitScale=policyValue.minor_unit_scale,revision=policyValue.revision;
 if(typeof policyValue.title_en!=="string"||typeof policyValue.title_vi!=="string"||typeof policyValue.legal_entity!=="string"||typeof policyValue.currency!=="string"||!/^[A-Z]{3}$/.test(policyValue.currency)||!Number.isInteger(minorUnitScale)||Number(minorUnitScale)<0||Number(minorUnitScale)>3||!Number.isInteger(revision)||Number(revision)<1)throw new HrmError("profile_export_invalid_record",409);
 const lines=(source.lines as unknown[]).map(line=>{
  if(!line||typeof line!=="object"||Array.isArray(line))throw new HrmError("profile_export_invalid_record",409);
  const item=line as Record<string,unknown>;
  if(typeof item.component_code!=="string"||typeof item.title_en!=="string"||typeof item.title_vi!=="string"||!(item.direction==="earning"||item.direction==="deduction")||!Number.isSafeInteger(item.amount_minor)||Number(item.amount_minor)<0)throw new HrmError("profile_export_invalid_record",409);
  return {component_code:item.component_code,title_en:item.title_en,title_vi:item.title_vi,direction:item.direction as "earning"|"deduction",amount_minor:Number(item.amount_minor)};
 });
 const money=(key:string)=>{const amount=source[key];if(!Number.isSafeInteger(amount)||Number(amount)<0)throw new HrmError("profile_export_invalid_record",409);return Number(amount)};
 const text=(key:string)=>{const item=source[key];if(typeof item!=="string"||item.length>500)throw new HrmError("profile_export_invalid_record",409);return item};
 const correction=source.correction_of_payslip_id;
 if(correction!==null&&correction!==undefined&&typeof correction!=="string")throw new HrmError("profile_export_invalid_record",409);
 return {policy:{title_en:policyValue.title_en,title_vi:policyValue.title_vi,legal_entity:policyValue.legal_entity,currency:policyValue.currency,minor_unit_scale:Number(minorUnitScale),revision:Number(revision)},period_key:text("period_key"),starts_on:text("starts_on"),ends_on:text("ends_on"),employee_code:text("employee_code"),display_name:text("display_name"),correction_of_payslip_id:typeof correction==="string"?correction:null,lines,gross_minor:money("gross_minor"),deductions_minor:money("deductions_minor"),net_minor:money("net_minor")};
}

/** A bounded, self-only snapshot of employee-visible HRM data; private file contents stay on their download routes. */
export async function exportOwnHrmProfile(db:D1Database,user:WorkspaceUser):Promise<HrmProfileExportResult>{
 requirePermission(user,"hrm.profile.self");
 requirePermission(user,"hrm.legal.self");
 requirePermission(user,"hrm.coi.self");
 requirePermission(user,"hrm.time.self");
 requirePermission(user,"hrm.leave.self");
 if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const person=await personFor(db,user);
 if(!own(person,user))throw new HrmError("not_found",404);
 if(!user.can("hrm.services.self")&&!user.can("hrm.services.manage"))throw new HrmError("forbidden",403);
 if(!user.can("hrm.onboarding.self")&&!user.can("hrm.onboarding.manage"))throw new HrmError("forbidden",403);
 const exportOwnPayroll=user.can("hrm.payroll.self"),exportOwnPayrollDisputes=exportOwnPayroll&&user.can("hrm.payroll.dispute"),exportOwnAssets=user.can("hrm.assets.self"),exportOwnBenefits=user.can("hrm.benefits.self"),exportOwnTraining=user.can("hrm.training.self");
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
  db.prepare(`SELECT t.id,periods.period_key,t.work_date,t.shift_key,t.planned_minutes,t.check_in_utc,t.check_out_utc,t.break_minutes,t.worked_minutes,t.overtime_minutes,t.overtime_state,t.state,t.review_reason,t.submitted_at,c.timezone
    FROM hrm_time_entries t JOIN hrm_people p ON p.id=t.person_id AND p.user_id=?
    JOIN hrm_time_periods periods ON periods.id=t.period_id JOIN hrm_work_assignments a ON a.id=t.assignment_id
    JOIN hrm_work_calendar_versions c ON c.id=a.calendar_version_id
    WHERE t.person_id=? ORDER BY t.work_date,t.submitted_at,t.id LIMIT ?`).bind(user.id,person.id,ROW_LIMIT+1),
  db.prepare(`SELECT a.id,a.entry_id,a.old_check_in_utc,a.old_check_out_utc,a.old_break_minutes,a.proposed_check_in_utc,a.proposed_check_out_utc,a.proposed_break_minutes,a.proposed_worked_minutes,a.reason,a.state,a.submitted_at,a.reviewed_at
    FROM hrm_time_adjustments a JOIN hrm_time_entries t ON t.id=a.entry_id JOIN hrm_people p ON p.id=t.person_id AND p.user_id=?
    WHERE t.person_id=? ORDER BY a.submitted_at,a.id LIMIT ?`).bind(user.id,person.id,ROW_LIMIT+1),
  db.prepare(`SELECT r.id,r.leave_type_key,r.starts_on,r.ends_on,r.portion,r.requested_minutes,r.private_reason,r.cancellation_reason,r.handoff_note,r.state,r.review_reason,r.submitted_at,r.reviewed_at,
      json_extract(rule.value,'$.title_en') AS leave_title_en,json_extract(rule.value,'$.title_vi') AS leave_title_vi,
      CASE WHEN json_extract(rule.value,'$.paid')=1 THEN 1 ELSE 0 END AS paid,
      CASE WHEN json_extract(rule.value,'$.evidence_required')=1 THEN 1 ELSE 0 END AS evidence_required,
      f.original_name AS evidence_name,f.mime_type AS evidence_mime_type,f.size_bytes AS evidence_size_bytes,f.checksum AS evidence_checksum,f.state AS evidence_state,f.created_at AS evidence_created_at,f.reviewed_at AS evidence_reviewed_at,
      CASE WHEN f.id IS NOT NULL AND f.object_deleted_at IS NULL THEN 1 ELSE 0 END AS evidence_object_available,
      CASE WHEN f.id IS NOT NULL AND f.object_deleted_at IS NOT NULL THEN 1 ELSE 0 END AS evidence_deleted,
      CASE WHEN link.id IS NULL AND EXISTS(SELECT 1 FROM hrm_leave_evidence_links older WHERE older.leave_request_id=r.id AND older.revision_no<r.current_revision_no) THEN 1 ELSE 0 END AS evidence_superseded
    FROM hrm_leave_requests r JOIN hrm_people p ON p.id=r.person_id AND p.user_id=?
    JOIN hrm_leave_policy_versions policy ON policy.id=r.policy_version_id
    JOIN json_each(policy.rules_json) rule ON json_extract(rule.value,'$.key')=r.leave_type_key
    LEFT JOIN hrm_leave_evidence_links link ON link.id=(SELECT current_link.id FROM hrm_leave_evidence_links current_link WHERE current_link.leave_request_id=r.id AND current_link.person_id=r.person_id AND current_link.revision_no=r.current_revision_no ORDER BY current_link.created_at DESC LIMIT 1)
    LEFT JOIN hrm_files f ON f.id=link.file_id AND f.person_id=r.person_id AND f.kind='leave_evidence'
    WHERE r.person_id=? ORDER BY r.submitted_at,r.id LIMIT ?`).bind(user.id,person.id,ROW_LIMIT+1),
  db.prepare(`SELECT json_extract(rule.value,'$.key') AS leave_type_key,
      COALESCE((SELECT SUM(l.minutes) FROM hrm_leave_ledger l WHERE l.employment_id=a.employment_id AND l.leave_type_key=json_extract(rule.value,'$.key')),0) AS balance_minutes,
      COALESCE((SELECT SUM(r.requested_minutes) FROM hrm_leave_requests r WHERE r.employment_id=a.employment_id AND r.leave_type_key=json_extract(rule.value,'$.key') AND r.state='pending_approval'),0) AS pending_minutes
    FROM hrm_leave_policy_assignments a JOIN hrm_leave_policy_versions policy ON policy.id=a.policy_version_id JOIN json_each(policy.rules_json) rule
    WHERE a.person_id=? AND a.employment_id=? AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>=?)
      AND a.effective_from=(SELECT MAX(current_assignment.effective_from) FROM hrm_leave_policy_assignments current_assignment WHERE current_assignment.person_id=? AND current_assignment.employment_id=? AND current_assignment.effective_from<=? AND (current_assignment.effective_to IS NULL OR current_assignment.effective_to>=?))
    ORDER BY json_extract(rule.value,'$.key') LIMIT ?`).bind(person.id,person.employment_id,localDate(),localDate(),person.id,person.employment_id,localDate(),localDate(),ROW_LIMIT+1),
  db.prepare(`SELECT s.id,s.supersedes_payslip_id,s.state,s.snapshot_json,s.snapshot_checksum,s.issued_at,
      COALESCE((SELECT SUM(payment.amount_minor) FROM hrm_payroll_payments payment WHERE payment.payslip_id=s.id),0)+COALESCE(CAST(json_extract(s.snapshot_json,'$.paid_carryover_minor') AS INTEGER),0) AS paid_minor
    FROM hrm_payslips s JOIN hrm_people p ON p.id=s.person_id
    WHERE p.user_id=? AND ?=1 ORDER BY s.issued_at,s.id LIMIT ?`).bind(user.id,exportOwnPayroll?1:0,ROW_LIMIT+1),
  db.prepare(`SELECT d.id,d.payslip_id,d.component_code,d.state,d.created_at,d.updated_at,
      (SELECT event_type FROM hrm_payroll_dispute_events event WHERE event.dispute_id=d.id ORDER BY event.created_at DESC,event.id DESC LIMIT 1) AS last_event,
      (SELECT event.created_at FROM hrm_payroll_dispute_events event WHERE event.dispute_id=d.id ORDER BY event.created_at DESC,event.id DESC LIMIT 1) AS last_event_at
    FROM hrm_payroll_disputes d JOIN hrm_people p ON p.id=d.person_id AND p.user_id=?
    JOIN hrm_payslips s ON s.id=d.payslip_id AND s.person_id=d.person_id
    WHERE ?=1 ORDER BY d.updated_at,d.id LIMIT ?`).bind(user.id,exportOwnPayrollDisputes?1:0,ROW_LIMIT+1),
  db.prepare(`SELECT event.dispute_id,event.event_type,event.body,event.created_at
    FROM hrm_payroll_dispute_events event JOIN hrm_payroll_disputes d ON d.id=event.dispute_id
    JOIN hrm_payslips s ON s.id=d.payslip_id AND s.person_id=d.person_id
    JOIN hrm_people p ON p.id=d.person_id AND p.user_id=?
    WHERE ?=1 ORDER BY event.dispute_id,event.created_at,event.id LIMIT ?`).bind(user.id,exportOwnPayrollDisputes?1:0,ROW_LIMIT+1),
  db.prepare(`SELECT x.id,a.asset_tag,a.asset_type,a.description,a.legal_entity,a.location,a.state AS asset_state,
      x.state AS assignment_state,x.expected_return_on,x.issued_condition,x.offered_at,x.accepted_at,x.return_requested_at,x.employee_handover_at,x.returned_at,x.return_condition
    FROM hrm_asset_assignments x JOIN hrm_assets a ON a.id=x.asset_id JOIN hrm_people p ON p.id=x.person_id AND p.user_id=?
    WHERE ?=1 AND x.state IN ('offered','assigned','return_requested','returned','cancelled')
    ORDER BY CASE x.state WHEN 'offered' THEN 0 WHEN 'return_requested' THEN 1 WHEN 'assigned' THEN 2 ELSE 3 END,x.updated_at DESC,x.id LIMIT ?`).bind(user.id,exportOwnAssets?1:0,ROW_LIMIT+1),
  db.prepare(`SELECT l.assignment_id,l.evidence_type,f.original_name,f.mime_type,f.size_bytes,f.checksum,f.state,f.created_at,
      CASE WHEN f.object_deleted_at IS NULL THEN 1 ELSE 0 END AS object_available
    FROM hrm_asset_evidence_links l JOIN hrm_asset_assignments x ON x.id=l.assignment_id AND x.person_id=l.person_id
    JOIN hrm_people p ON p.id=l.person_id AND p.user_id=? JOIN hrm_files f ON f.id=l.file_id AND f.person_id=l.person_id AND f.kind='asset_evidence'
    WHERE ?=1 ORDER BY l.created_at,l.id LIMIT ?`).bind(user.id,exportOwnAssets?1:0,ROW_LIMIT+1),
  db.prepare(`SELECT n.assignment_id,a.asset_tag,a.description,x.state AS assignment_state,n.due_on,n.days_before_due,n.state,n.created_at,n.read_at
    FROM hrm_asset_reminders n JOIN hrm_asset_assignments x ON x.id=n.assignment_id AND x.asset_id=n.asset_id AND x.person_id=n.person_id
    JOIN hrm_assets a ON a.id=x.asset_id JOIN hrm_people p ON p.id=x.person_id AND p.user_id=?
    WHERE n.recipient_user_id=? AND ?=1 ORDER BY n.due_on,n.created_at,n.id LIMIT ?`).bind(user.id,user.id,exportOwnAssets?1:0,ROW_LIMIT+1),
  db.prepare(`SELECT id,plan_code,version_no,legal_entity,category,name,description,eligibility_text,effective_from,effective_to
    FROM hrm_benefit_plans WHERE legal_entity=? AND state='active' AND effective_from<=? AND effective_to>=? AND ?=1
    ORDER BY plan_code,version_no DESC LIMIT ?`).bind(person.legal_entity,localDate(),localDate(),exportOwnBenefits?1:0,ROW_LIMIT+1),
  db.prepare(`SELECT e.id,e.plan_version_id,e.plan_code,e.plan_version_no,e.legal_entity,e.category,e.state,e.employee_note,e.created_at,e.reviewed_at,e.review_reason,e.updated_at,p.name AS plan_name
    FROM hrm_benefit_enrollments e JOIN hrm_benefit_plans p ON p.id=e.plan_version_id
    WHERE e.person_id=? AND ?=1 ORDER BY e.created_at,e.id LIMIT ?`).bind(person.id,exportOwnBenefits?1:0,ROW_LIMIT+1),
  db.prepare(`SELECT a.id,a.course_code,a.course_version_no,a.legal_entity,a.category,a.evidence_required,a.renewal_days,a.due_on,a.renew_by,a.state,a.employee_note,a.submitted_at,a.created_at,a.reviewed_at,a.review_reason,c.title AS course_title
    FROM hrm_training_assignments a JOIN hrm_training_courses c ON c.id=a.course_version_id
    WHERE a.person_id=? AND ?=1 ORDER BY CASE a.state WHEN 'submitted' THEN 0 WHEN 'assigned' THEN 1 ELSE 2 END,a.due_on,a.created_at DESC,a.id LIMIT ?`).bind(person.id,exportOwnTraining?1:0,ROW_LIMIT+1),
  db.prepare(`SELECT l.assignment_id,f.original_name,f.mime_type,f.size_bytes,f.checksum,f.state,f.created_at,
      CASE WHEN f.object_deleted_at IS NULL THEN 1 ELSE 0 END AS object_available
    FROM hrm_training_evidence_links l JOIN hrm_training_assignments a ON a.id=l.assignment_id AND a.person_id=l.person_id
    JOIN hrm_people p ON p.id=l.person_id AND p.user_id=? JOIN hrm_files f ON f.id=l.file_id AND f.person_id=l.person_id AND f.kind='training_evidence'
    WHERE a.person_id=? AND ?=1 ORDER BY a.created_at,a.id,l.created_at,l.id LIMIT ?`).bind(user.id,person.id,exportOwnTraining?1:0,ROW_LIMIT+1),
  db.prepare("DELETE FROM hrm_write_guards"),
 ])}catch(error){if(error instanceof Error&&/CHECK constraint failed/.test(error.message))throw new HrmError("conflict",409);throw error}
 const employmentPeriods=batch[1]?.results as ExportRow[]??[],records=batch[2]?.results as RecordRow[]??[],recordHistory=batch[3]?.results as HistoryRow[]??[],changeRequests=batch[4]?.results as ChangeRow[]??[],files=batch[5]?.results as FileRow[]??[];
 const legalIssueRows=batch[6]?.results as LegalIssueRow[]??[],employeeParties=batch[7]?.results as ExportRow[]??[],coiRows=batch[8]?.results as CoiRow[]??[],coiEvents=batch[9]?.results as ExportRow[]??[],legalFiles=batch[10]?.results as ExportRow[]??[],serviceRequests=batch[11]?.results as ServiceRequestRow[]??[],serviceEvents=batch[12]?.results as ServiceEventRow[]??[],serviceFiles=batch[13]?.results as ServiceFileRow[]??[],onboardingPlans=batch[14]?.results as OnboardingPlanRow[]??[],onboardingTasks=batch[15]?.results as OnboardingTaskRow[]??[],onboardingFiles=batch[16]?.results as OnboardingFileRow[]??[],timeEntries=batch[17]?.results as TimeEntryRow[]??[],timeAdjustments=batch[18]?.results as TimeAdjustmentRow[]??[],leaveRequests=batch[19]?.results as LeaveRequestExportRow[]??[],leaveBalances=batch[20]?.results as LeaveBalanceExportRow[]??[],payslips=batch[21]?.results as PayslipExportRow[]??[],payrollDisputes=batch[22]?.results as PayrollDisputeExportRow[]??[],payrollDisputeEvents=batch[23]?.results as PayrollDisputeEventExportRow[]??[],assetAssignments=batch[24]?.results as EmployeeAssetExportRow[]??[],assetEvidence=batch[25]?.results as EmployeeAssetEvidenceExportRow[]??[],assetReminders=batch[26]?.results as EmployeeAssetReminderExportRow[]??[],benefitPlans=batch[27]?.results as EmployeeBenefitPlanExportRow[]??[],benefitEnrollments=batch[28]?.results as EmployeeBenefitEnrollmentExportRow[]??[],trainingAssignments=batch[29]?.results as EmployeeTrainingAssignmentExportRow[]??[],trainingEvidence=batch[30]?.results as EmployeeTrainingEvidenceExportRow[]??[];
 for(const collection of [employmentPeriods,records,recordHistory,changeRequests,files,legalIssueRows,employeeParties,coiRows,coiEvents,legalFiles,serviceRequests,serviceEvents,serviceFiles,onboardingPlans,onboardingTasks,onboardingFiles,timeEntries,timeAdjustments,leaveRequests,leaveBalances,payslips,payrollDisputes,payrollDisputeEvents,assetAssignments,assetEvidence,assetReminders,benefitPlans,benefitEnrollments,trainingAssignments,trainingEvidence])if(collection.length>ROW_LIMIT)throw new HrmError("profile_export_too_large",413);
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
 const timeEntryRefs=new Map(timeEntries.map((row,index)=>[row.id,`time-entry-${index+1}`]));
 const timeEntryData=timeEntries.map(({id:entryId,period_key:periodKey,...value})=>({...value,entry_ref:timeEntryRefs.get(entryId),period_key:periodKey}));
 const timeAdjustmentRefs=new Map(timeAdjustments.map((row,index)=>[row.id,`time-adjustment-${index+1}`]));
 const timeAdjustmentData=timeAdjustments.map(({id:adjustmentId,entry_id:entryId,...value})=>({...value,adjustment_ref:timeAdjustmentRefs.get(adjustmentId),entry_ref:timeEntryRefs.get(entryId)??null}));
 const leaveRequestRefs=new Map(leaveRequests.map((row,index)=>[row.id,`leave-request-${index+1}`]));
 const leaveRequestData=leaveRequests.map(({id:requestId,evidence_name,evidence_mime_type,evidence_size_bytes,evidence_checksum,evidence_state,evidence_created_at,evidence_reviewed_at,evidence_object_available,evidence_deleted,evidence_superseded,...value})=>{
  const evidenceStatus=evidence_deleted===1?"deleted":evidence_state??(evidence_superseded===1?"superseded":value.evidence_required===1?"required_not_submitted":"not_required");
  const evidenceFile=evidence_name?{original_name:evidence_name,mime_type:evidence_mime_type,size_bytes:evidence_size_bytes,checksum:evidence_checksum,created_at:evidence_created_at,object_available:Boolean(evidence_object_available)}:null;
  return {...value,request_ref:leaveRequestRefs.get(requestId),paid:Boolean(value.paid),evidence_required:Boolean(value.evidence_required),evidence:{status:evidenceStatus,reviewed_at:evidence_state==="reviewed"&&!evidence_deleted?evidence_reviewed_at:null,file:evidenceFile}};
 });
 const leaveBalanceData=leaveBalances.map(({leave_type_key,balance_minutes,pending_minutes})=>({leave_type_key,balance_minutes,pending_minutes,available_minutes:balance_minutes-pending_minutes}));
 const leaveEvidenceMetadataCount=leaveRequestData.filter(row=>Boolean(row.evidence.file)).length;
 const payslipRefs=new Map(payslips.map((row,index)=>[row.id,`payslip-${index+1}`]));
 const payslipData=payslips.map(row=>{
  const snapshot=safePayrollSnapshot(row.snapshot_json),paidMinor=row.paid_minor;
  if(!Number.isSafeInteger(paidMinor)||paidMinor<0)throw new HrmError("profile_export_invalid_record",409);
  const correctionId=row.supersedes_payslip_id??snapshot.correction_of_payslip_id;
  return {payslip_ref:payslipRefs.get(row.id),state:row.state,issued_at:row.issued_at,snapshot_checksum:row.snapshot_checksum,correction_of_payslip_ref:correctionId?payslipRefs.get(correctionId)??null:null,policy:snapshot.policy,period:{key:snapshot.period_key,starts_on:snapshot.starts_on,ends_on:snapshot.ends_on},employee:{employee_code:snapshot.employee_code,display_name:snapshot.display_name},lines:snapshot.lines,gross_minor:snapshot.gross_minor,deductions_minor:snapshot.deductions_minor,net_minor:snapshot.net_minor,paid_minor:paidMinor};
 });
 const payrollDisputeRefs=new Map(payrollDisputes.map((row,index)=>[row.id,`payroll-inquiry-${index+1}`]));
 const payrollDisputeData=payrollDisputes.map(({id:disputeId,payslip_id:payslipId,...value})=>({...value,dispute_ref:payrollDisputeRefs.get(disputeId),payslip_ref:payslipRefs.get(payslipId)??null}));
 const payrollDisputeEventData=payrollDisputeEvents.map(({dispute_id:disputeId,...value})=>({...value,dispute_ref:payrollDisputeRefs.get(disputeId)??null}));
 const assetAssignmentRefs=new Map(assetAssignments.map((row,index)=>[row.id,`asset-assignment-${index+1}`]));
 const assetData=assetAssignments.map(({id:assignmentId,...value})=>({...value,assignment_ref:assetAssignmentRefs.get(assignmentId)}));
 const assetEvidenceData=assetEvidence.map((row,index)=>{const {assignment_id:assignmentId,...value}=row;return {...value,evidence_ref:`asset-evidence-${index+1}`,assignment_ref:assetAssignmentRefs.get(assignmentId)??null,object_available:Boolean(value.object_available)}});
 const assetReminderData=assetReminders.map((row,index)=>{const {assignment_id:assignmentId,...value}=row;return {...value,reminder_ref:`asset-reminder-${index+1}`,assignment_ref:assetAssignmentRefs.get(assignmentId)??null}});
 const benefitPlanIds=[...new Set([...benefitPlans.map(row=>row.id),...benefitEnrollments.map(row=>row.plan_version_id)])];
 const benefitPlanRefs=new Map(benefitPlanIds.map((planId,index)=>[planId,`benefit-plan-${index+1}`]));
 const benefitPlanData=benefitPlans.map(({id:planId,...value})=>({...value,plan_ref:benefitPlanRefs.get(planId)}));
 const benefitEnrollmentData=benefitEnrollments.map(({id:enrollmentId,plan_version_id:planId,...value},index)=>({...value,enrollment_ref:`benefit-enrollment-${index+1}`,plan_ref:benefitPlanRefs.get(planId)??null}));
 const trainingAssignmentRefs=new Map(trainingAssignments.map((row,index)=>[row.id,`training-assignment-${index+1}`]));
 const trainingAssignmentData=trainingAssignments.map(({id:assignmentId,...value})=>({...value,assignment_ref:trainingAssignmentRefs.get(assignmentId),evidence_required:Boolean(value.evidence_required)}));
 const trainingEvidenceData=trainingEvidence.map((row,index)=>{const {assignment_id:assignmentId,...value}=row;return {...value,evidence_ref:`training-evidence-${index+1}`,assignment_ref:trainingAssignmentRefs.get(assignmentId)??null,object_available:Boolean(value.object_available)}});
 const included=["profile_identity","employment_periods","structured_profile_records","record_revision_history","profile_change_requests","profile_file_metadata","legal_document_issues","employee_party_status","policy_acknowledgements","coi_declarations","coi_event_actions","legal_evidence_file_metadata","employee_hr_requests","employee_visible_request_events","service_request_file_metadata","onboarding_plans","onboarding_tasks","onboarding_evidence_file_metadata","attendance_entries","attendance_adjustments","leave_requests","leave_balance_summary","leave_evidence_file_metadata"];
 const excluded=["file_contents","object_keys","internal_review_notes","reviewer_identity","required_parties","other_legal_parties","hr_only_request_notes","other_people_onboarding","onboarding_internal_owner_ids","onboarding_event_details","other_people","audit_log"];
 if(exportOwnPayroll){included.push("employee_payslips");excluded.push("other_people_payroll","payroll_policy_configuration","payroll_payment_references","payroll_reconciliation_evidence");if(exportOwnPayrollDisputes)included.push("employee_payroll_disputes","employee_visible_payroll_dispute_events");else excluded.push("employee_payroll_disputes")}
 else excluded.push("payroll");
 if(exportOwnAssets)included.push("employee_asset_assignments","employee_asset_evidence_file_metadata","employee_asset_reminders");else excluded.push("assets");
 if(exportOwnBenefits)included.push("available_benefit_plans","employee_benefit_enrollments");else excluded.push("benefits");
 if(exportOwnTraining)included.push("employee_training_assignments","employee_training_evidence_file_metadata");else excluded.push("training");
 const createdAt=now();
 const bundle={
  schema_version:7,
  export_scope:"self_profile_legal_coi_requests_onboarding_time_leave_payroll_employee_services_snapshot",
  exported_at:createdAt,
  included,
  excluded,
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
  time_entries:timeEntryData,
  time_adjustments:timeAdjustmentData,
  leave_requests:leaveRequestData,
  leave_balances:leaveBalanceData,
  payslips:payslipData,
  payroll_disputes:payrollDisputeData,
  payroll_dispute_events:payrollDisputeEventData,
  assets:assetData,
  asset_evidence_files:assetEvidenceData,
  asset_reminders:assetReminderData,
  available_benefit_plans:benefitPlanData,
  benefit_enrollments:benefitEnrollmentData,
  training_assignments:trainingAssignmentData,
  training_evidence_files:trainingEvidenceData,
 };
 const body=JSON.stringify(bundle,null,2),contentBytes=new TextEncoder().encode(body).byteLength;
 if(contentBytes>BYTE_LIMIT)throw new HrmError("profile_export_too_large",413);
 const exportId=id("profile_export");
 await audit(db,user,"employee_profile_exported",person.id,exportId,{scope:"self_profile_legal_coi_requests_onboarding_time_leave_payroll_employee_services_snapshot",employment_period_count:employmentPeriods.length,record_count:recordData.length,history_count:recordHistory.length,change_request_count:changeData.length,file_metadata_count:files.length,legal_document_count:legalDocuments.length,acknowledgement_count:acknowledgements.length,coi_declaration_count:coiDeclarations.length,legal_file_metadata_count:legalFileData.length,service_request_count:serviceRequestData.length,service_event_count:serviceEventData.length,service_file_metadata_count:serviceFileData.length,onboarding_plan_count:onboardingPlanData.length,onboarding_task_count:onboardingTaskData.length,onboarding_file_metadata_count:onboardingFileData.length,time_entry_count:timeEntryData.length,time_adjustment_count:timeAdjustmentData.length,leave_request_count:leaveRequestData.length,leave_balance_count:leaveBalanceData.length,leave_evidence_metadata_count:leaveEvidenceMetadataCount,payslip_count:payslipData.length,payroll_dispute_count:payrollDisputeData.length,payroll_dispute_event_count:payrollDisputeEventData.length,asset_assignment_count:assetData.length,asset_evidence_metadata_count:assetEvidenceData.length,asset_reminder_count:assetReminderData.length,benefit_plan_count:benefitPlanData.length,benefit_enrollment_count:benefitEnrollmentData.length,training_assignment_count:trainingAssignmentData.length,training_evidence_metadata_count:trainingEvidenceData.length,content_bytes:contentBytes});
 return {body,contentBytes,personId:person.id};
}
