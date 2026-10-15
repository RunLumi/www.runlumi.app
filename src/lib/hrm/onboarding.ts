import type { WorkspaceUser, Permission } from "../workspace/roles";
import { workspaceUserFor } from "../workspace/roles";
import { date, HrmError } from "./fields";
import { command, digest, guard, id, now, personFor, requirePermission, type Person } from "./service";

export type OnboardingOwnerKind = "employee" | "manager" | "buddy" | "hrm_officer" | "hrm_admin";
export type OnboardingVerifierKind = "none" | "manager" | "hrm_officer" | "hrm_admin";
export type OnboardingEvidence = "none" | "text" | "pdf";
export type OnboardingAction = "profile" | "identity" | "legal" | "coi" | "asset" | "training" | "custom";

export interface OnboardingApplicability {
  legal_entities: string[];
  job_titles: string[];
  locations: string[];
  employment_statuses: Array<"preboarding" | "probation" | "active" | "notice">;
}
export interface OnboardingTaskSpec {
  key: string;
  title_en: string;
  title_vi: string;
  instructions_en: string;
  instructions_vi: string;
  milestone: string;
  assignee_kind: OnboardingOwnerKind;
  verifier_kind: OnboardingVerifierKind;
  due_offset_days: number;
  required: boolean;
  allow_waive: boolean;
  dependencies: string[];
  evidence_type: OnboardingEvidence;
  action_key: OnboardingAction;
}
export interface OnboardingTaskRow extends Omit<OnboardingTaskSpec, "dependencies" | "required" | "allow_waive"> {
  id: string;
  plan_id: string;
  task_key: string;
  assignee_user_id: string | null;
  verifier_user_id: string | null;
  required: number;
  allow_waive: number;
  dependencies_json: string;
  evidence_file_id: string | null;
  submission_text: string | null;
  state: string;
  submitted_by: string | null;
  submitted_at: string | null;
  completed_by: string | null;
  completed_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  review_reason: string | null;
  blocked_reason: string | null;
  waived_by: string | null;
  waived_at: string | null;
  waive_reason: string | null;
  version: number;
  due_at: string;
  created_at: string;
  updated_at: string;
  person_id: string;
  manager_user_id?: string | null;
  employee_code: string;
  legal_name: string;
  employment_id: string;
  employment_status: string;
  plan_state: string;
  plan_started_on: string;
  dependencies_ready: number;
  current_submission_id: string | null;
  evidence_state: string | null;
  evidence_name: string | null;
  evidence_uploaded_by: string | null;
  evidence_file_version: number | null;
  person_user_id: string | null;
  is_person_owner?: boolean;
  is_assignee?: boolean;
  needs_reassignment?: boolean;
  reassignment_for?: "assignee" | "verifier";
}
export interface OnboardingTemplate { id: string; template_key: string; title_en: string; title_vi: string; state: string; current_version_id: string | null; version: number; created_by: string; created_at: string; updated_at: string }
export interface OnboardingVersion { id: string; template_id: string; version_number: number; applicability_json: string; tasks_json: string; state: string; created_by: string; created_at: string; reviewed_by: string | null; reviewed_at: string | null; review_reason: string | null; activated_by: string | null; activated_at: string | null; updated_by: string; updated_at: string; version: number }
export interface OnboardingPlan { id: string; person_id: string; employment_id: string; template_id: string; template_version_id: string; template_snapshot_json: string; started_on: string; buddy_user_id: string | null; hr_owner_user_id: string | null; admin_owner_user_id: string | null; state: string; version: number; created_by: string; updated_by: string; created_at: string; updated_at: string; employee_code: string; legal_name: string; job_title: string; department: string }
export interface OnboardingSubmission { id: string; task_id: string; submitted_by: string; submitted_at: string; evidence_type: OnboardingEvidence; evidence_text: string | null; evidence_file_id: string | null; state: string; reviewed_by: string | null; reviewed_at: string | null; review_reason: string | null; version: number }

const OWNER_KINDS: readonly string[] = ["employee", "manager", "buddy", "hrm_officer", "hrm_admin"];
const VERIFIER_KINDS: readonly string[] = ["none", "manager", "hrm_officer", "hrm_admin"];
const EVIDENCE_TYPES: readonly string[] = ["none", "text", "pdf"];
const ACTION_KEYS: readonly string[] = ["profile", "identity", "legal", "coi", "asset", "training", "custom"];
const LIVE_EMPLOYMENT_STATES = new Set(["preboarding", "probation", "active", "notice"]);
const TERMINAL_TASK_STATES = new Set(["verified", "completed", "waived"]);
const REQUEST_KEY = /^[A-Za-z0-9_-]{16,100}$/;
const clean = (value: unknown, max: number, required = false): string => {
  if (typeof value !== "string") throw new HrmError("invalid_onboarding_config");
  const result = value.trim();
  if (result.length > max || required && !result) throw new HrmError("invalid_onboarding_config");
  return result;
};
const enumValue = <T extends string>(value: unknown, values: readonly string[]): T => {
  if (typeof value !== "string" || !values.includes(value)) throw new HrmError("invalid_onboarding_config");
  return value as T;
};
function jsonValue(value: string): unknown {
  try { return JSON.parse(value); } catch { throw new HrmError("invalid_onboarding_config"); }
}

export function validateOnboardingConfig(applicabilityJson: string, tasksJson: string): { applicability: OnboardingApplicability; tasks: OnboardingTaskSpec[] } {
  const applicabilityValue = jsonValue(applicabilityJson);
  if (!applicabilityValue || typeof applicabilityValue !== "object" || Array.isArray(applicabilityValue)) throw new HrmError("invalid_onboarding_config");
  const a = applicabilityValue as Record<string, unknown>;
  const list = (key: string, limit: number): string[] => {
    const value = a[key] ?? [];
    if (!Array.isArray(value) || value.length > limit) throw new HrmError("invalid_onboarding_config");
    const normalized = value.map(item => clean(item, 160, true));
    if (new Set(normalized).size !== normalized.length) throw new HrmError("invalid_onboarding_config");
    return normalized;
  };
  const employmentStatuses = list("employment_statuses", 4);
  if (employmentStatuses.some(status => !["preboarding", "probation", "active", "notice"].includes(status))) throw new HrmError("invalid_onboarding_config");
  const applicability: OnboardingApplicability = {
    legal_entities: list("legal_entities", 50),
    job_titles: list("job_titles", 100),
    locations: list("locations", 100),
    employment_statuses: employmentStatuses as OnboardingApplicability["employment_statuses"],
  };
  const tasksValue = jsonValue(tasksJson);
  if (!Array.isArray(tasksValue) || !tasksValue.length || tasksValue.length > 50) throw new HrmError("invalid_onboarding_config");
  const tasks = tasksValue.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new HrmError("invalid_onboarding_config");
    const row = value as Record<string, unknown>;
    const key = clean(row.key, 50, true);
    if (!/^[a-z0-9][a-z0-9_-]{1,49}$/.test(key)) throw new HrmError("invalid_onboarding_config");
    const offset = row.due_offset_days;
    if (typeof offset !== "number" || !Number.isInteger(offset) || offset < -365 || offset > 3650) throw new HrmError("invalid_onboarding_config");
    const dependencies = row.dependencies ?? [];
    if (!Array.isArray(dependencies) || dependencies.length > 50) throw new HrmError("invalid_onboarding_config");
    const normalizedDependencies = dependencies.map(item => clean(item, 50, true));
    if (new Set(normalizedDependencies).size !== normalizedDependencies.length || normalizedDependencies.includes(key)) throw new HrmError("invalid_onboarding_config");
    if (typeof row.required !== "boolean" || typeof row.allow_waive !== "boolean") throw new HrmError("invalid_onboarding_config");
    const assignee = enumValue<OnboardingOwnerKind>(row.assignee_kind, OWNER_KINDS);
    const verifier = enumValue<OnboardingVerifierKind>(row.verifier_kind, VERIFIER_KINDS);
    const evidence = enumValue<OnboardingEvidence>(row.evidence_type, EVIDENCE_TYPES);
    const action = enumValue<OnboardingAction>(row.action_key, ACTION_KEYS);
    if (evidence === "pdf" && verifier === "none") throw new HrmError("onboarding_pdf_needs_reviewer");
    if (["legal", "identity", "coi"].includes(action) && verifier === "none") throw new HrmError("onboarding_restricted_needs_reviewer");
    return {
      key,
      title_en: clean(row.title_en, 180, true),
      title_vi: clean(row.title_vi, 180, true),
      instructions_en: clean(row.instructions_en ?? "", 3000),
      instructions_vi: clean(row.instructions_vi ?? "", 3000),
      milestone: clean(row.milestone, 100, true),
      assignee_kind: assignee,
      verifier_kind: verifier,
      due_offset_days: offset,
      required: row.required,
      allow_waive: row.allow_waive,
      dependencies: normalizedDependencies,
      evidence_type: evidence,
      action_key: action,
    } satisfies OnboardingTaskSpec;
  });
  const byKey = new Map(tasks.map(task => [task.key, task]));
  if (byKey.size !== tasks.length) throw new HrmError("invalid_onboarding_config");
  for (const task of tasks) for (const dependency of task.dependencies) if (!byKey.has(dependency)) throw new HrmError("invalid_onboarding_config");
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (key: string): void => {
    if (visiting.has(key)) throw new HrmError("onboarding_dependency_cycle");
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of byKey.get(key)!.dependencies) visit(dependency);
    visiting.delete(key); visited.add(key);
  };
  for (const task of tasks) visit(task.key);
  return { applicability, tasks };
}

const dateShift = (day: string, offset: number): string => {
  const parsed = date(day);
  if (!parsed) throw new HrmError("invalid_date");
  const d = new Date(`${parsed}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
async function priorCommand(db: D1Database, user: WorkspaceUser, key: string, operation: string, payload: unknown): Promise<string | null> {
  if (!REQUEST_KEY.test(key)) throw new HrmError("invalid_request_key");
  const row = await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id, key).first<{operation:string;payload_hash:string;result_id:string}>();
  if (!row) return null;
  if (row.operation !== operation || row.payload_hash !== await digest(JSON.stringify(payload))) throw new HrmError("request_key_conflict", 409);
  return row.result_id;
}
function enabled(user: WorkspaceUser, permission: Permission): void { requirePermission(user, permission); }
async function activeWorkspaceUser(db: D1Database, content: D1Database, userId: string, permission: Permission): Promise<WorkspaceUser> {
  const account = await content.prepare("SELECT id,name,email,role FROM users WHERE id=? AND disabled=0").bind(userId).first<{id:string;name:string|null;email:string;role:number}>();
  if (!account) throw new HrmError("invalid_onboarding_owner");
  const user = await workspaceUserFor(db, account);
  if (!user || !user.can(permission)) throw new HrmError("invalid_onboarding_owner");
  return user;
}
async function resolveOwner(db: D1Database, content: D1Database, person: Person, planOwners: { buddy: string | null; hr: string | null; admin: string | null }, kind: OnboardingOwnerKind): Promise<string> {
  let userId: string | null = null, permission: Permission;
  if (kind === "employee") { userId = person.user_id; permission = "hrm.onboarding.self"; }
  else if (kind === "manager") { userId = person.manager_user_id; permission = "hrm.onboarding.tasks"; }
  else if (kind === "buddy") { userId = planOwners.buddy; permission = "hrm.onboarding.tasks"; }
  else if (kind === "hrm_officer") { userId = planOwners.hr; permission = "hrm.onboarding.manage"; }
  else { userId = planOwners.admin; permission = "hrm.onboarding.manage"; }
  if (!userId) throw new HrmError("onboarding_owner_required");
  const assigned = await activeWorkspaceUser(db, content, userId, permission);
  if (kind === "manager" && userId !== person.manager_user_id) throw new HrmError("invalid_onboarding_owner");
  if (kind === "hrm_officer") {
    if (!assigned.roles.has("hrm_officer") && !assigned.roles.has("hrm_admin") && !assigned.admin) throw new HrmError("invalid_onboarding_owner");
  }
  if (kind === "hrm_admin") {
    if (!assigned.admin && !assigned.roles.has("hrm_admin")) throw new HrmError("invalid_onboarding_owner");
  }
  return userId;
}

export async function listOnboardingTemplates(db: D1Database, user: WorkspaceUser): Promise<Array<OnboardingTemplate & { current_version_number: number | null; current_version_state: string | null }>> {
  enabled(user, "hrm.onboarding.manage");
  return (await db.prepare(`SELECT t.*,v.version_number AS current_version_number,v.state AS current_version_state FROM hrm_onboarding_templates t LEFT JOIN hrm_onboarding_template_versions v ON v.id=t.current_version_id ORDER BY t.title_en LIMIT 200`).all<OnboardingTemplate & {current_version_number:number|null;current_version_state:string|null}>()).results;
}
export async function listOnboardingVersions(db: D1Database, user: WorkspaceUser, templateId: string): Promise<OnboardingVersion[]> {
  enabled(user, "hrm.onboarding.manage");
  return (await db.prepare("SELECT * FROM hrm_onboarding_template_versions WHERE template_id=? ORDER BY version_number DESC LIMIT 50").bind(templateId).all<OnboardingVersion>()).results;
}
export async function listPlanCandidates(db: D1Database, user: WorkspaceUser): Promise<Array<Person & { has_plan: number }>> {
  enabled(user, "hrm.onboarding.manage");
  return (await db.prepare(`SELECT p.id,p.employee_code,p.user_id,p.legal_name,p.preferred_name,p.version AS profile_version,p.actor_id,e.id AS employment_id,e.work_email,e.work_phone,e.department,e.job_title,e.legal_entity,e.location,e.manager_user_id,e.status,e.started_on,e.ended_on,e.version,e.actor_id AS employment_actor_id,e.created_at,e.updated_at,EXISTS(SELECT 1 FROM hrm_onboarding_plans op WHERE op.employment_id=e.id) AS has_plan FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id AND e.id=(SELECT e2.id FROM hrm_employments e2 WHERE e2.person_id=p.id ORDER BY CASE WHEN e2.status!='ended' THEN 0 ELSE 1 END,e2.started_on DESC,e2.created_at DESC LIMIT 1) WHERE e.status IN ('preboarding','probation','active') ORDER BY p.legal_name LIMIT 500`).all<Person & {has_plan:number}>()).results;
}
export async function listOnboardingPlans(db: D1Database, user: WorkspaceUser): Promise<OnboardingPlan[]> {
  enabled(user, "hrm.onboarding.manage");
  return (await db.prepare(`SELECT op.*,p.employee_code,p.legal_name,e.job_title,e.department FROM hrm_onboarding_plans op JOIN hrm_people p ON p.id=op.person_id JOIN hrm_employments e ON e.id=op.employment_id ORDER BY op.created_at DESC LIMIT 200`).all<OnboardingPlan>()).results;
}
export async function listOnboardingTasks(db: D1Database, user: WorkspaceUser): Promise<OnboardingTaskRow[]> {
  if (!user.can("hrm.onboarding.manage") && !user.can("hrm.onboarding.tasks") && !user.can("hrm.onboarding.self")) throw new HrmError("forbidden", 403);
  const manage = user.can("hrm.onboarding.manage"), bind: string[] = [];
  let scope = "";
  if (!manage) { scope = "AND (t.assignee_user_id=? OR p.user_id=?)"; bind.push(user.id, user.id); }
  const planStates=manage?"('draft','active','completed','cancelled')":"('active','completed','cancelled')";
  const rows = (await db.prepare(`SELECT t.*,p.id AS person_id,p.employee_code,p.legal_name,p.user_id AS person_user_id,e.id AS employment_id,e.manager_user_id AS manager_user_id,e.status AS employment_status,op.state AS plan_state,op.started_on AS plan_started_on,CASE WHEN NOT EXISTS(SELECT 1 FROM json_each(t.dependencies_json) dep_key JOIN hrm_onboarding_tasks dep ON dep.id=dep_key.value WHERE dep.state NOT IN ('verified','completed','waived')) THEN 1 ELSE 0 END AS dependencies_ready,s.id AS current_submission_id,f.state AS evidence_state,f.original_name AS evidence_name,f.uploaded_by AS evidence_uploaded_by,f.version AS evidence_file_version,s.evidence_file_id,t.submission_text FROM hrm_onboarding_tasks t JOIN hrm_onboarding_plans op ON op.id=t.plan_id JOIN hrm_people p ON p.id=op.person_id JOIN hrm_employments e ON e.id=op.employment_id LEFT JOIN hrm_onboarding_submissions s ON s.id=t.current_submission_id LEFT JOIN hrm_legal_files f ON f.id=s.evidence_file_id WHERE op.state IN ${planStates} ${scope} ORDER BY CASE WHEN t.state IN ('verified','completed','waived') THEN 1 ELSE 0 END,t.due_at,p.legal_name,t.task_key LIMIT 500`).bind(...bind).all<OnboardingTaskRow>()).results;
  return rows.map(row => {
    const isPersonOwner = row.person_user_id === user.id, isAssignee = row.assignee_user_id === user.id;
    if (!manage && isPersonOwner && !isAssignee) return { ...row, instructions_en:"", instructions_vi:"", submission_text:null, evidence_file_id:null, evidence_name:null, current_submission_id:null, evidence_state:null, is_person_owner:true, is_assignee:false };
    return { ...row, is_person_owner:isPersonOwner, is_assignee:isAssignee };
  });
}

export async function createOnboardingTemplate(db:D1Database,user:WorkspaceUser,key:string,input:{template_key:string;title_en:string;title_vi:string;applicability_json:string;tasks_json:string}):Promise<string>{
  enabled(user,"hrm.onboarding.manage");
  if(!/^[a-z0-9][a-z0-9_-]{2,79}$/.test(input.template_key))throw new HrmError("invalid_onboarding_config");
  const {applicability,tasks}=validateOnboardingConfig(input.applicability_json,input.tasks_json),payload={template_key:input.template_key,title_en:clean(input.title_en,200,true),title_vi:clean(input.title_vi,200,true),applicability,tasks};
  const prior=await priorCommand(db,user,key,"onboarding_template_create",payload);if(prior)return prior;
  const templateId=id("onb_template"),versionId=id("onb_version"),time=now();
  await command(db,user,key,"onboarding_template_create",payload,templateId,[guard(db,"NOT EXISTS(SELECT 1 FROM hrm_onboarding_templates WHERE template_key=?)",[payload.template_key])],[
    db.prepare("INSERT INTO hrm_onboarding_templates(id,template_key,title_en,title_vi,state,current_version_id,version,created_by,updated_by,actor_id,created_at,updated_at) VALUES(?,?,?,?,'draft',?,1,?,?,?,?,?)").bind(templateId,payload.template_key,payload.title_en,payload.title_vi,versionId,user.id,user.id,user.id,time,time),
    db.prepare("INSERT INTO hrm_onboarding_template_versions(id,template_id,version_number,applicability_json,tasks_json,state,created_by,created_at,updated_by,updated_at) VALUES(?,?,1,?,?,'draft',?,?,?,?)").bind(versionId,templateId,JSON.stringify(applicability),JSON.stringify(tasks),user.id,time,user.id,time),
    db.prepare("DELETE FROM hrm_write_guards"),
  ]);
  return templateId;
}
export async function createOnboardingVersion(db:D1Database,user:WorkspaceUser,key:string,templateId:string,expectedTemplateVersion:number):Promise<string>{
  enabled(user,"hrm.onboarding.manage");
  const template=await db.prepare("SELECT id,template_key,title_en,title_vi,current_version_id,version,state FROM hrm_onboarding_templates WHERE id=?").bind(templateId).first<OnboardingTemplate>();if(!template||template.state==="retired"||!template.current_version_id)throw new HrmError("not_found",404);
  const source=await db.prepare("SELECT applicability_json,tasks_json FROM hrm_onboarding_template_versions WHERE id=? AND template_id=? AND state IN ('active','reviewed')").bind(template.current_version_id,templateId).first<{applicability_json:string;tasks_json:string}>();if(!source)throw new HrmError("not_found",404);
  const payload={templateId,expectedTemplateVersion,sourceVersionId:template.current_version_id};const prior=await priorCommand(db,user,key,"onboarding_version_create",payload);if(prior)return prior;
  const latest=await db.prepare("SELECT COALESCE(MAX(version_number),0) AS n FROM hrm_onboarding_template_versions WHERE template_id=?").bind(templateId).first<{n:number}>(),number=Number(latest?.n??0)+1,versionId=id("onb_version"),time=now();
  await command(db,user,key,"onboarding_version_create",payload,versionId,[guard(db,"EXISTS(SELECT 1 FROM hrm_onboarding_templates WHERE id=? AND version=? AND state!='retired' AND current_version_id=?)",[templateId,expectedTemplateVersion,template.current_version_id]),guard(db,"NOT EXISTS(SELECT 1 FROM hrm_onboarding_template_versions WHERE template_id=? AND version_number=?)",[templateId,number])],[db.prepare("INSERT INTO hrm_onboarding_template_versions(id,template_id,version_number,applicability_json,tasks_json,state,created_by,created_at,updated_by,updated_at) VALUES(?,?,?, ?,?,'draft',?,?,?,?)").bind(versionId,templateId,number,source.applicability_json,source.tasks_json,user.id,time,user.id,time),db.prepare("DELETE FROM hrm_write_guards")]);
  return versionId;
}
export async function saveOnboardingDraftVersion(db:D1Database,user:WorkspaceUser,key:string,versionId:string,expectedVersion:number,applicabilityJson:string,tasksJson:string):Promise<void>{
  enabled(user,"hrm.onboarding.manage");const {applicability,tasks}=validateOnboardingConfig(applicabilityJson,tasksJson),payload={versionId,expectedVersion,applicability,tasks},prior=await priorCommand(db,user,key,"onboarding_version_edit",payload);if(prior)return;
  const time=now();await command(db,user,key,"onboarding_version_edit",payload,versionId,[guard(db,"EXISTS(SELECT 1 FROM hrm_onboarding_template_versions WHERE id=? AND version=? AND state='draft')",[versionId,expectedVersion])],[db.prepare("UPDATE hrm_onboarding_template_versions SET applicability_json=?,tasks_json=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=? AND state='draft'").bind(JSON.stringify(applicability),JSON.stringify(tasks),user.id,time,versionId,expectedVersion),db.prepare("DELETE FROM hrm_write_guards")]);
}
export async function reviewOnboardingVersion(db:D1Database,user:WorkspaceUser,key:string,versionId:string,expectedVersion:number,approve:boolean,reason:string):Promise<void>{
  enabled(user,"hrm.onboarding.manage");if(!reason.trim()||reason.length>500)throw new HrmError("reason_required");
  const payload={versionId,expectedVersion,decision:approve?"reviewed":"rejected",reason:reason.trim()},prior=await priorCommand(db,user,key,"onboarding_version_review",payload);if(prior)return;
  const row=await db.prepare("SELECT created_by,state FROM hrm_onboarding_template_versions WHERE id=?").bind(versionId).first<{created_by:string;state:string}>();if(!row||row.state!=="draft")throw new HrmError("not_found",404);if(row.created_by===user.id)throw new HrmError("self_approval",403);
  const time=now();await command(db,user,key,"onboarding_version_review",payload,versionId,[guard(db,"EXISTS(SELECT 1 FROM hrm_onboarding_template_versions WHERE id=? AND version=? AND state='draft' AND created_by!=?)",[versionId,expectedVersion,user.id])],[db.prepare("UPDATE hrm_onboarding_template_versions SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=? AND state='draft'").bind(approve?"reviewed":"rejected",user.id,time,reason.trim(),user.id,time,versionId,expectedVersion),db.prepare("DELETE FROM hrm_write_guards")]);
}
export async function activateOnboardingVersion(db:D1Database,user:WorkspaceUser,key:string,versionId:string,expectedVersion:number):Promise<void>{
  enabled(user,"hrm.configure");
  const row=await db.prepare(`SELECT v.*,t.current_version_id,t.version AS template_revision FROM hrm_onboarding_template_versions v JOIN hrm_onboarding_templates t ON t.id=v.template_id WHERE v.id=?`).bind(versionId).first<OnboardingVersion&{current_version_id:string|null;template_revision:number}>();if(!row)throw new HrmError("not_found",404);
  const payload={versionId,expectedVersion},prior=await priorCommand(db,user,key,"onboarding_version_activate",payload);if(prior)return;
  if(row.state!=="reviewed"||row.created_by===user.id||!row.reviewed_by)throw new HrmError("self_approval",403);
  const time=now(),writes:D1PreparedStatement[]=[];
  if(row.current_version_id)writes.push(db.prepare("UPDATE hrm_onboarding_template_versions SET state='retired',version=version+1,updated_by=?,updated_at=? WHERE id=? AND state='active'").bind(user.id,time,row.current_version_id));
  writes.push(db.prepare("UPDATE hrm_onboarding_template_versions SET state='active',activated_by=?,activated_at=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=? AND state='reviewed'").bind(user.id,time,user.id,time,versionId,expectedVersion),db.prepare("UPDATE hrm_onboarding_templates SET state='active',current_version_id=?,version=version+1,updated_by=?,actor_id=?,updated_at=? WHERE id=? AND version=? AND current_version_id IS ? AND state!='retired'").bind(versionId,user.id,user.id,time,row.template_id,row.template_revision,row.current_version_id),db.prepare("DELETE FROM hrm_write_guards"),db.prepare("INSERT INTO hrm_commands(actor_id,request_key,operation,payload_hash,result_id,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,key,"onboarding_version_activate",await digest(JSON.stringify(payload)),versionId,time));
  await db.batch([guard(db,"EXISTS(SELECT 1 FROM hrm_onboarding_template_versions WHERE id=? AND version=? AND state='reviewed' AND created_by!=?)",[versionId,expectedVersion,user.id]),guard(db,"EXISTS(SELECT 1 FROM hrm_onboarding_templates WHERE id=? AND version=? AND current_version_id IS ? AND state!='retired')",[row.template_id,row.template_revision,row.current_version_id]),...writes]);
}

function applicabilityMatches(json:string,person:Person):boolean{
  const applicability=JSON.parse(json) as OnboardingApplicability;
  return (!applicability.legal_entities.length||applicability.legal_entities.includes(person.legal_entity))&&
    (!applicability.job_titles.length||applicability.job_titles.includes(person.job_title))&&
    (!applicability.locations.length||applicability.locations.includes(person.location))&&
    (!applicability.employment_statuses.length||applicability.employment_statuses.includes(person.status as OnboardingApplicability["employment_statuses"][number]));
}
function verifierOwner(person:Person,owners:{hr:string|null;admin:string|null},kind:OnboardingVerifierKind):string|null{
  if(kind==="none")return null;
  if(kind==="manager")return person.manager_user_id;
  if(kind==="hrm_officer")return owners.hr;
  return owners.admin;
}
export async function createOnboardingPlan(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,input:{personId:string;templateId:string;buddyUserId:string|null;hrOwnerUserId:string|null;adminOwnerUserId:string|null}):Promise<string>{
  enabled(user,"hrm.onboarding.manage");if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
  const payload={...input},prior=await priorCommand(db,user,key,"onboarding_plan_create",payload);if(prior)return prior;
  const person=await personFor(db,user,input.personId);if(!LIVE_EMPLOYMENT_STATES.has(person.status)||!person.user_id)throw new HrmError("onboarding_employee_unavailable",409);
  const template=await db.prepare("SELECT t.id,t.template_key,t.title_en,t.title_vi,t.state,t.current_version_id,v.version_number,v.applicability_json,v.tasks_json,v.state AS version_state FROM hrm_onboarding_templates t JOIN hrm_onboarding_template_versions v ON v.id=t.current_version_id WHERE t.id=?").bind(input.templateId).first<OnboardingTemplate&{version_number:number;applicability_json:string;tasks_json:string;version_state:string}>();
  if(!template||template.state!=="active"||template.version_state!=="active")throw new HrmError("onboarding_template_inactive",409);
  const {applicability,tasks}=validateOnboardingConfig(template.applicability_json,template.tasks_json);if(!applicabilityMatches(JSON.stringify(applicability),person))throw new HrmError("onboarding_not_applicable",409);
  const owners={buddy:input.buddyUserId,hr:input.hrOwnerUserId,admin:input.adminOwnerUserId};
  const taskRows:Array<{id:string;spec:OnboardingTaskSpec;assignee:string;verifier:string|null;dueAt:string;dependencies:string[]}> = [];
  const ids=new Map(tasks.map(task=>[task.key,id("onb_task")]));
  for(const spec of tasks){
    const assignee=await resolveOwner(db,content,person,owners,spec.assignee_kind),verifier=verifierOwner(person,{hr:owners.hr,admin:owners.admin},spec.verifier_kind);
    if(verifier){const permission:Permission=spec.verifier_kind==="manager"?"hrm.onboarding.tasks":"hrm.onboarding.manage";await activeWorkspaceUser(db,content,verifier,permission);if(verifier===assignee)throw new HrmError("onboarding_self_verifier");}
    taskRows.push({id:ids.get(spec.key)!,spec,assignee,verifier,dueAt:dateShift(person.started_on??"",spec.due_offset_days),dependencies:spec.dependencies.map(key=>ids.get(key)!)});
  }
  const planId=id("onb_plan"),time=now(),snapshot={template_id:template.id,template_key:template.template_key,template_title_en:template.title_en,template_title_vi:template.title_vi,template_version_id:template.current_version_id,version_number:template.version_number,applicability,tasks};
  const writes:D1PreparedStatement[]=[db.prepare("INSERT INTO hrm_onboarding_plans(id,person_id,employment_id,template_id,template_version_id,template_snapshot_json,started_on,buddy_user_id,hr_owner_user_id,admin_owner_user_id,state,version,created_by,updated_by,actor_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,'draft',1,?,?,?,?,?)").bind(planId,person.id,person.employment_id,template.id,template.current_version_id,JSON.stringify(snapshot),person.started_on,owners.buddy,owners.hr,owners.admin,user.id,user.id,user.id,time,time)];
  for(const row of taskRows){const spec=row.spec;writes.push(db.prepare("INSERT INTO hrm_onboarding_tasks(id,plan_id,task_key,title_en,title_vi,instructions_en,instructions_vi,milestone,assignee_kind,assignee_user_id,verifier_kind,verifier_user_id,due_offset_days,due_at,required,allow_waive,dependencies_json,evidence_type,action_key,state,version,actor_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'not_started',1,?,?,?)").bind(row.id,planId,spec.key,spec.title_en,spec.title_vi,spec.instructions_en,spec.instructions_vi,spec.milestone,spec.assignee_kind,row.assignee,spec.verifier_kind,row.verifier,spec.due_offset_days,row.dueAt,spec.required?1:0,spec.allow_waive?1:0,JSON.stringify(row.dependencies),spec.evidence_type,spec.action_key,user.id,time,time));}
  writes.push(db.prepare("DELETE FROM hrm_write_guards"));
  const guards=[guard(db,"EXISTS(SELECT 1 FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id WHERE p.id=? AND p.user_id=? AND e.id=? AND e.status IN ('preboarding','probation','active','notice'))",[person.id,person.user_id,person.employment_id]),guard(db,"EXISTS(SELECT 1 FROM hrm_onboarding_template_versions WHERE id=? AND state='active')",[template.current_version_id]),guard(db,"NOT EXISTS(SELECT 1 FROM hrm_onboarding_plans WHERE employment_id=?)",[person.employment_id])];
  await command(db,user,key,"onboarding_plan_create",payload,planId,guards,writes);
  return planId;
}

async function taskRowsForPlan(db:D1Database,planId:string):Promise<OnboardingTaskRow[]>{
  return (await db.prepare(`SELECT t.*,p.id AS person_id,p.employee_code,p.legal_name,p.user_id AS person_user_id,e.id AS employment_id,e.manager_user_id AS manager_user_id,e.status AS employment_status,op.state AS plan_state,op.started_on AS plan_started_on,CASE WHEN NOT EXISTS(SELECT 1 FROM json_each(t.dependencies_json) dep_key JOIN hrm_onboarding_tasks dep ON dep.id=dep_key.value WHERE dep.state NOT IN ('verified','completed','waived')) THEN 1 ELSE 0 END AS dependencies_ready,s.id AS current_submission_id,s.evidence_file_id,f.state AS evidence_state,f.original_name AS evidence_name,f.uploaded_by AS evidence_uploaded_by,f.version AS evidence_file_version FROM hrm_onboarding_tasks t JOIN hrm_onboarding_plans op ON op.id=t.plan_id JOIN hrm_people p ON p.id=op.person_id JOIN hrm_employments e ON e.id=op.employment_id LEFT JOIN hrm_onboarding_submissions s ON s.id=t.current_submission_id LEFT JOIN hrm_legal_files f ON f.id=s.evidence_file_id WHERE t.plan_id=? ORDER BY t.due_at,t.task_key`).bind(planId).all<OnboardingTaskRow>()).results;
}
async function validateTaskOwners(db:D1Database,content:D1Database,user:WorkspaceUser,planId:string):Promise<void>{
  const plan=await db.prepare("SELECT p.*,h.manager_user_id,h.status AS employment_status FROM hrm_onboarding_plans p JOIN hrm_employments h ON h.id=p.employment_id WHERE p.id=?").bind(planId).first<OnboardingPlan&{manager_user_id:string|null;employment_status:string}>();if(!plan)throw new HrmError("not_found",404);
  const person=await personFor(db,user,plan.person_id);
  for(const task of await taskRowsForPlan(db,planId)){
    const assignee=await activeWorkspaceUser(db,content,task.assignee_user_id??"",task.assignee_kind==="employee"?"hrm.onboarding.self":task.assignee_kind==="manager"||task.assignee_kind==="buddy"?"hrm.onboarding.tasks":"hrm.onboarding.manage");
    if(task.assignee_kind==="manager"&&task.assignee_user_id!==person.manager_user_id)throw new HrmError("onboarding_owner_unavailable",409);
    if(task.assignee_kind==="hrm_officer"&&!assignee.roles.has("hrm_officer")&&!assignee.roles.has("hrm_admin")&&!assignee.admin)throw new HrmError("onboarding_owner_unavailable",409);
    if(task.assignee_kind==="hrm_admin"&&!assignee.admin&&!assignee.roles.has("hrm_admin"))throw new HrmError("onboarding_owner_unavailable",409);
    if(task.verifier_user_id){const verifier=await activeWorkspaceUser(db,content,task.verifier_user_id,task.verifier_kind==="manager"?"hrm.onboarding.tasks":"hrm.onboarding.manage");if(task.verifier_kind==="manager"&&task.verifier_user_id!==person.manager_user_id||task.verifier_kind==="hrm_officer"&&!verifier.roles.has("hrm_officer")&&!verifier.roles.has("hrm_admin")&&!verifier.admin||task.verifier_kind==="hrm_admin"&&!verifier.admin&&!verifier.roles.has("hrm_admin"))throw new HrmError("onboarding_owner_unavailable",409);}
  }
}
export async function activateOnboardingPlan(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,planId:string,version:number):Promise<void>{
  enabled(user,"hrm.onboarding.manage");if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
  const payload={planId,version},prior=await priorCommand(db,user,key,"onboarding_plan_activate",payload);if(prior)return;
  const plan=await db.prepare("SELECT state FROM hrm_onboarding_plans WHERE id=? AND version=?").bind(planId,version).first<{state:string}>();if(!plan||plan.state!=="draft")throw new HrmError("conflict",409);
  await validateTaskOwners(db,content,user,planId);
  const time=now();await command(db,user,key,"onboarding_plan_activate",payload,planId,[guard(db,"EXISTS(SELECT 1 FROM hrm_onboarding_plans WHERE id=? AND version=? AND state='draft')",[planId,version]),guard(db,"NOT EXISTS(SELECT 1 FROM hrm_onboarding_tasks WHERE plan_id=? AND required=1 AND (assignee_user_id IS NULL OR verifier_kind!='none' AND verifier_user_id IS NULL))",[planId])],[db.prepare("UPDATE hrm_onboarding_plans SET state='active',version=version+1,updated_by=?,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='draft'").bind(user.id,user.id,time,planId,version),db.prepare("DELETE FROM hrm_write_guards")]);
}
export async function cancelOnboardingPlan(db:D1Database,user:WorkspaceUser,key:string,planId:string,version:number,reason:string):Promise<void>{
  enabled(user,"hrm.onboarding.manage");if(!reason.trim()||reason.length>500)throw new HrmError("reason_required");
  const payload={planId,version,reason:reason.trim()},prior=await priorCommand(db,user,key,"onboarding_plan_cancel",payload);if(prior)return;
  const time=now();await command(db,user,key,"onboarding_plan_cancel",payload,planId,[guard(db,"EXISTS(SELECT 1 FROM hrm_onboarding_plans WHERE id=? AND version=? AND state IN ('draft','active'))",[planId,version])],[db.prepare("UPDATE hrm_onboarding_plans SET state='cancelled',cancelled_by=?,cancelled_at=?,cancel_reason=?,version=version+1,updated_by=?,actor_id=?,updated_at=? WHERE id=? AND version=? AND state IN ('draft','active')").bind(user.id,time,reason.trim(),user.id,user.id,time,planId,version),db.prepare("DELETE FROM hrm_write_guards")]);
}

interface TaskAccess { task: OnboardingTaskRow; manage: boolean; assignee: boolean; verifier: boolean }
async function taskForActor(db:D1Database,user:WorkspaceUser,taskId:string):Promise<TaskAccess>{
  const task=await db.prepare(`SELECT t.*,p.id AS person_id,p.employee_code,p.legal_name,p.user_id AS person_user_id,e.id AS employment_id,e.manager_user_id AS manager_user_id,e.status AS employment_status,op.state AS plan_state,op.started_on AS plan_started_on,CASE WHEN NOT EXISTS(SELECT 1 FROM json_each(t.dependencies_json) dep_key JOIN hrm_onboarding_tasks dep ON dep.id=dep_key.value WHERE dep.state NOT IN ('verified','completed','waived')) THEN 1 ELSE 0 END AS dependencies_ready,s.id AS current_submission_id,s.evidence_file_id,f.state AS evidence_state,f.original_name AS evidence_name,f.uploaded_by AS evidence_uploaded_by,f.version AS evidence_file_version FROM hrm_onboarding_tasks t JOIN hrm_onboarding_plans op ON op.id=t.plan_id JOIN hrm_people p ON p.id=op.person_id JOIN hrm_employments e ON e.id=op.employment_id LEFT JOIN hrm_onboarding_submissions s ON s.id=t.current_submission_id LEFT JOIN hrm_legal_files f ON f.id=s.evidence_file_id WHERE t.id=?`).bind(taskId).first<OnboardingTaskRow>();
  if(!task)throw new HrmError("not_found",404);
  const manage=user.can("hrm.onboarding.manage"),assignee=task.assignee_user_id===user.id&&(user.can("hrm.onboarding.tasks")||task.assignee_kind==="employee"&&user.can("hrm.onboarding.self")),verifier=task.verifier_user_id===user.id&&user.can("hrm.onboarding.tasks");
  if(!manage&&!assignee&&!verifier)throw new HrmError("not_found",404);
  return {task,manage,assignee,verifier};
}
export async function onboardingPdfUploadTarget(db:D1Database,user:WorkspaceUser,taskId:string):Promise<OnboardingTaskRow>{
  const {task,manage,assignee}=await taskForActor(db,user,taskId);
  if((!manage&&!assignee)||task.plan_state!=="active"||task.state!=="in_progress"||task.evidence_type!=="pdf"||!task.verifier_user_id)throw new HrmError("invalid_transition",409);
  return task;
}
export async function onboardingTaskForEvidenceViewer(db:D1Database,user:WorkspaceUser,taskId:string):Promise<OnboardingTaskRow>{
  return (await taskForActor(db,user,taskId)).task;
}
async function dependenciesComplete(db:D1Database,task:OnboardingTaskRow):Promise<boolean>{
  const ids=JSON.parse(task.dependencies_json) as string[];if(!ids.length)return true;
  const rows=await db.prepare(`SELECT id,state FROM hrm_onboarding_tasks WHERE plan_id=? AND id IN (${ids.map(()=>"?").join(",")})`).bind(task.plan_id,...ids).all<{id:string;state:string}>();
  return rows.results.length===ids.length&&rows.results.every(row=>TERMINAL_TASK_STATES.has(row.state));
}
async function updatePlanCompletion(db:D1Database,user:WorkspaceUser,planId:string,time:string):Promise<D1PreparedStatement>{
  return db.prepare(`UPDATE hrm_onboarding_plans SET state='completed',version=version+1,updated_by=?,actor_id=?,updated_at=? WHERE id=? AND state='active' AND NOT EXISTS(SELECT 1 FROM hrm_onboarding_tasks WHERE plan_id=? AND required=1 AND state NOT IN ('verified','completed','waived'))`).bind(user.id,user.id,time,planId,planId);
}
export async function actOnboardingTask(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,taskId:string,expectedVersion:number,input:{action:"start"|"submit"|"complete"|"block"|"unblock"|"verify"|"reject"|"waive"|"reassign"|"reassign_verifier";text?:string;reason?:string;assigneeUserId?:string}):Promise<void>{
  if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);const access=await taskForActor(db,user,taskId),{task,manage,assignee,verifier}=access;
  const payload={taskId,expectedVersion,...input},prior=await priorCommand(db,user,key,"onboarding_task_"+input.action,payload);if(prior)return;
  if(task.plan_state!=="active")throw new HrmError("onboarding_plan_inactive",409);
  const time=now(),writes:D1PreparedStatement[]=[];let nextState=task.state;
  if(input.action==="start"){
    if(!assignee||task.state!=="not_started")throw new HrmError("invalid_transition",409);
    if(!await dependenciesComplete(db,task))throw new HrmError("onboarding_dependency_blocked",409);
    nextState="in_progress";writes.push(db.prepare("UPDATE hrm_onboarding_tasks SET state=?,blocked_reason=NULL,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='not_started'").bind(nextState,user.id,time,taskId,expectedVersion));
  }else if(input.action==="submit"){
    if(!assignee||task.state!=="in_progress"||task.evidence_type==="pdf")throw new HrmError(task.evidence_type==="pdf"?"onboarding_pdf_upload_required":"invalid_transition",409);
    const evidenceText=clean(input.text??"",4000,task.evidence_type==="text");if(!await dependenciesComplete(db,task))throw new HrmError("onboarding_dependency_blocked",409);
    const submission=id("onb_submission"),requiresReview=task.verifier_kind!=="none";
    nextState=requiresReview?"submitted":"completed";
    writes.push(db.prepare("INSERT INTO hrm_onboarding_submissions(id,task_id,submitted_by,submitted_at,evidence_type,evidence_text,evidence_file_id,state,actor_id,created_at,updated_at) VALUES(?,?,?,?,?,?,NULL,?,?,?,?)").bind(submission,taskId,user.id,time,task.evidence_type,evidenceText||null,requiresReview?"pending_review":"completed",user.id,time,time));
    writes.push(db.prepare("UPDATE hrm_onboarding_tasks SET state=?,current_submission_id=?,submission_text=?,submitted_by=?,submitted_at=?,completed_by=?,completed_at=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='in_progress'").bind(nextState,submission,evidenceText||null,user.id,time,requiresReview?null:user.id,requiresReview?null:time,user.id,time,taskId,expectedVersion));
  }else if(input.action==="complete"){
    if(!assignee||task.state!=="in_progress"||task.verifier_kind!=="none"||task.evidence_type!=="none")throw new HrmError("invalid_transition",409);
    if(!await dependenciesComplete(db,task))throw new HrmError("onboarding_dependency_blocked",409);
    nextState="completed";writes.push(db.prepare("UPDATE hrm_onboarding_tasks SET state=?,completed_by=?,completed_at=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='in_progress'").bind(nextState,user.id,time,user.id,time,taskId,expectedVersion));
  }else if(input.action==="block"){
    const reason=(input.reason??"").trim();if((!assignee&&!manage)||task.state!=="in_progress"||!reason||reason.length>500)throw new HrmError("reason_required");
    nextState="blocked";writes.push(db.prepare("UPDATE hrm_onboarding_tasks SET state=?,blocked_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='in_progress'").bind(nextState,reason,user.id,time,taskId,expectedVersion));
  }else if(input.action==="unblock"){
    if((!assignee&&!manage)||task.state!=="blocked")throw new HrmError("invalid_transition",409);
    nextState="in_progress";writes.push(db.prepare("UPDATE hrm_onboarding_tasks SET state=?,blocked_reason=NULL,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='blocked'").bind(nextState,user.id,time,taskId,expectedVersion));
  }else if(input.action==="waive"){
    const reason=(input.reason??"").trim();if(!manage||!task.allow_waive||TERMINAL_TASK_STATES.has(task.state)||!reason||reason.length>500)throw new HrmError("waiver_not_allowed",403);
    nextState="waived";writes.push(db.prepare("UPDATE hrm_onboarding_tasks SET state=?,waived_by=?,waived_at=?,waive_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state NOT IN ('verified','completed','waived')").bind(nextState,user.id,time,reason,user.id,time,taskId,expectedVersion));
  }else if(input.action==="verify"||input.action==="reject"){
    const reason=(input.reason??"").trim();if((!manage&&!verifier)||task.state!=="submitted"||task.submitted_by===user.id||input.action==="reject"&&(!reason||reason.length>1000))throw new HrmError(task.submitted_by===user.id?"self_approval":"invalid_transition",409);
    const submission=task.current_submission_id?await db.prepare("SELECT * FROM hrm_onboarding_submissions WHERE id=? AND task_id=?").bind(task.current_submission_id,taskId).first<OnboardingSubmission>():null;if(!submission||submission.state!=="pending_review")throw new HrmError("onboarding_evidence_required",409);
    if(submission.evidence_type==="pdf"){
      const file=submission.evidence_file_id?await db.prepare("SELECT state FROM hrm_legal_files WHERE id=? AND onboarding_task_id=?").bind(submission.evidence_file_id,taskId).first<{state:string}>():null;
      if(!file||file.state!=="reviewed")throw new HrmError("evidence_pending",409);
    }
    const approved=input.action==="verify";nextState=approved?"verified":"in_progress";
    writes.push(db.prepare("UPDATE hrm_onboarding_submissions SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND state='pending_review'").bind(approved?"verified":"rejected",user.id,time,reason||null,user.id,time,submission.id));
    writes.push(db.prepare("UPDATE hrm_onboarding_tasks SET state=?,verified_by=?,verified_at=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='submitted'").bind(nextState,approved?user.id:null,approved?time:null,reason||null,user.id,time,taskId,expectedVersion));
  }else if(input.action==="reassign"){
    if(!manage||!input.assigneeUserId||TERMINAL_TASK_STATES.has(task.state))throw new HrmError("forbidden",403);
    const plan=await db.prepare("SELECT op.person_id,op.buddy_user_id,op.hr_owner_user_id,op.admin_owner_user_id FROM hrm_onboarding_plans op WHERE op.id=?").bind(task.plan_id).first<{person_id:string;buddy_user_id:string|null;hr_owner_user_id:string|null;admin_owner_user_id:string|null}>();if(!plan)throw new HrmError("not_found",404);
    const person=await personFor(db,user,plan.person_id),owners={buddy:plan.buddy_user_id,hr:plan.hr_owner_user_id,admin:plan.admin_owner_user_id};
    if(task.assignee_kind==="employee"&&input.assigneeUserId!==person.user_id)await activeWorkspaceUser(db,content,input.assigneeUserId,"hrm.onboarding.manage");
    else{
      const reassignedOwners={...owners};if(task.assignee_kind==="buddy")reassignedOwners.buddy=input.assigneeUserId;else if(task.assignee_kind==="hrm_officer")reassignedOwners.hr=input.assigneeUserId;else if(task.assignee_kind==="hrm_admin")reassignedOwners.admin=input.assigneeUserId;
      const resolved=await resolveOwner(db,content,person,reassignedOwners,task.assignee_kind);
      if(resolved!==input.assigneeUserId)throw new HrmError("invalid_onboarding_owner");
    }
    nextState=task.state;writes.push(db.prepare("UPDATE hrm_onboarding_tasks SET assignee_user_id=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state NOT IN ('verified','completed','waived')").bind(input.assigneeUserId,user.id,time,taskId,expectedVersion));
  }else{
    if(!manage||!input.assigneeUserId||task.verifier_kind==="none"||TERMINAL_TASK_STATES.has(task.state))throw new HrmError("forbidden",403);
    const plan=await db.prepare("SELECT person_id FROM hrm_onboarding_plans WHERE id=?").bind(task.plan_id).first<{person_id:string}>();if(!plan)throw new HrmError("not_found",404);
    const person=await personFor(db,user,plan.person_id),permission:Permission=task.verifier_kind==="manager"?"hrm.onboarding.tasks":"hrm.onboarding.manage",candidate=await activeWorkspaceUser(db,content,input.assigneeUserId,permission);
    if(task.verifier_kind==="manager"&&input.assigneeUserId!==person.manager_user_id||task.verifier_kind==="hrm_officer"&&!candidate.roles.has("hrm_officer")&&!candidate.roles.has("hrm_admin")&&!candidate.admin||task.verifier_kind==="hrm_admin"&&!candidate.roles.has("hrm_admin")&&!candidate.admin||input.assigneeUserId===task.assignee_user_id)throw new HrmError("invalid_onboarding_owner");
    nextState=task.state;writes.push(db.prepare("UPDATE hrm_onboarding_tasks SET verifier_user_id=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state NOT IN ('verified','completed','waived')").bind(input.assigneeUserId,user.id,time,taskId,expectedVersion));
  }
  writes.push(await updatePlanCompletion(db,user,task.plan_id,time));
  writes.push(db.prepare("DELETE FROM hrm_write_guards"));
  await command(db,user,key,"onboarding_task_"+input.action,payload,taskId,[guard(db,"EXISTS(SELECT 1 FROM hrm_onboarding_tasks t JOIN hrm_onboarding_plans p ON p.id=t.plan_id WHERE t.id=? AND t.version=? AND p.state='active')",[taskId,expectedVersion]),...(input.action==="verify"||input.action==="reject"?[guard(db,"EXISTS(SELECT 1 FROM hrm_onboarding_tasks WHERE id=? AND version=? AND state='submitted' AND submitted_by!=?)",[taskId,expectedVersion,user.id])]:[])],writes);
}

export async function reviewOnboardingEvidence(db:D1Database,user:WorkspaceUser,key:string,fileId:string,fileVersion:number,decision:"reviewed"|"rejected",reason:string):Promise<void>{
  if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
  const file=await db.prepare("SELECT id,onboarding_task_id,person_id,uploaded_by,state,version FROM hrm_legal_files WHERE id=?").bind(fileId).first<{id:string;onboarding_task_id:string|null;person_id:string|null;uploaded_by:string;state:string;version:number}>();if(!file||!file.onboarding_task_id)throw new HrmError("not_found",404);
  const access=await taskForActor(db,user,file.onboarding_task_id),{task,manage,verifier}=access;
  if(file.person_id!==task.person_id||file.uploaded_by===user.id||!manage&&!verifier)throw new HrmError(file.uploaded_by===user.id?"self_approval":"not_found",403);
  if(!reason.trim()||reason.length>500)throw new HrmError("reason_required");
  const payload={fileId,fileVersion,decision,reason:reason.trim()},prior=await priorCommand(db,user,key,"onboarding_evidence_review",payload);if(prior)return;
  if(file.state!=="quarantined"||task.state!=="submitted"||task.evidence_file_id!==file.id)throw new HrmError("not_found",404);
  const time=now();
  await command(db,user,key,"onboarding_evidence_review",payload,fileId,[guard(db,"EXISTS(SELECT 1 FROM hrm_legal_files WHERE id=? AND version=? AND state='quarantined' AND uploaded_by!=?)",[fileId,fileVersion,user.id]),guard(db,"EXISTS(SELECT 1 FROM hrm_onboarding_tasks WHERE id=? AND version=? AND state='submitted' AND evidence_file_id=?)",[task.id,task.version,fileId])],[
    db.prepare("UPDATE hrm_legal_files SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='quarantined'").bind(decision,user.id,time,reason.trim(),user.id,time,fileId,fileVersion),
    ...(decision==="rejected"?[db.prepare("UPDATE hrm_onboarding_submissions SET state='rejected',reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=(SELECT current_submission_id FROM hrm_onboarding_tasks WHERE id=?) AND state='pending_review'").bind(user.id,time,reason.trim(),user.id,time,task.id),db.prepare("UPDATE hrm_onboarding_tasks SET state='in_progress',review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND state='submitted'").bind(reason.trim(),user.id,time,task.id)]:[]),
    db.prepare("DELETE FROM hrm_write_guards"),
  ]);
}

export async function previewOnboardingReschedule(db:D1Database,user:WorkspaceUser,planId:string,newStart:string):Promise<{plan:OnboardingPlan;new_start:string;changes:Array<{task:OnboardingTaskRow;old_due:string;new_due:string}>}>{
  enabled(user,"hrm.onboarding.manage");date(newStart);
  const plan=await db.prepare(`SELECT op.*,p.employee_code,p.legal_name,e.job_title,e.department FROM hrm_onboarding_plans op JOIN hrm_people p ON p.id=op.person_id JOIN hrm_employments e ON e.id=op.employment_id WHERE op.id=? AND op.state='active'`).bind(planId).first<OnboardingPlan>();if(!plan)throw new HrmError("not_found",404);
  const tasks=await taskRowsForPlan(db,planId);
  return {plan,new_start:newStart,changes:tasks.filter(task=>!TERMINAL_TASK_STATES.has(task.state)).map(task=>({task,old_due:task.due_at,new_due:dateShift(newStart,task.due_offset_days)}))};
}
export async function rescheduleOnboardingPlan(db:D1Database,user:WorkspaceUser,key:string,planId:string,expectedVersion:number,newStart:string):Promise<void>{
  enabled(user,"hrm.onboarding.manage");date(newStart);const payload={planId,expectedVersion,newStart},prior=await priorCommand(db,user,key,"onboarding_plan_reschedule",payload);if(prior)return;
  const preview=await previewOnboardingReschedule(db,user,planId,newStart),changes=preview.changes,time=now();
  await command(db,user,key,"onboarding_plan_reschedule",payload,planId,[guard(db,"EXISTS(SELECT 1 FROM hrm_onboarding_plans WHERE id=? AND version=? AND state='active')",[planId,expectedVersion])],[db.prepare("UPDATE hrm_onboarding_plans SET started_on=?,version=version+1,updated_by=?,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='active'").bind(newStart,user.id,user.id,time,planId,expectedVersion),...changes.map(change=>db.prepare("UPDATE hrm_onboarding_tasks SET due_at=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND state NOT IN ('verified','completed','waived')").bind(change.new_due,user.id,time,change.task.id)),db.prepare("DELETE FROM hrm_write_guards")]);
}

export async function listOnboardingReassignmentQueue(db:D1Database,content:D1Database,user:WorkspaceUser):Promise<OnboardingTaskRow[]>{
  enabled(user,"hrm.onboarding.manage");const candidates=(await db.prepare(`SELECT t.*,p.id AS person_id,p.employee_code,p.legal_name,p.user_id AS person_user_id,e.id AS employment_id,e.manager_user_id AS manager_user_id,e.status AS employment_status,op.state AS plan_state,op.started_on AS plan_started_on,CASE WHEN NOT EXISTS(SELECT 1 FROM json_each(t.dependencies_json) dep_key JOIN hrm_onboarding_tasks dep ON dep.id=dep_key.value WHERE dep.state NOT IN ('verified','completed','waived')) THEN 1 ELSE 0 END AS dependencies_ready,s.id AS current_submission_id,s.evidence_file_id,f.state AS evidence_state,f.original_name AS evidence_name,f.uploaded_by AS evidence_uploaded_by,f.version AS evidence_file_version FROM hrm_onboarding_tasks t JOIN hrm_onboarding_plans op ON op.id=t.plan_id JOIN hrm_people p ON p.id=op.person_id JOIN hrm_employments e ON e.id=op.employment_id LEFT JOIN hrm_onboarding_submissions s ON s.id=t.current_submission_id LEFT JOIN hrm_legal_files f ON f.id=s.evidence_file_id WHERE op.state='active' AND t.state NOT IN ('verified','completed','waived') ORDER BY t.due_at LIMIT 200`).all<OnboardingTaskRow>()).results;
  const output:OnboardingTaskRow[]=[];
  for(const task of candidates){
    let assigneeEligible=false;
    try{const current=await activeWorkspaceUser(db,content,task.assignee_user_id??"",task.assignee_kind==="employee"?"hrm.onboarding.self":task.assignee_kind==="manager"||task.assignee_kind==="buddy"?"hrm.onboarding.tasks":"hrm.onboarding.manage");assigneeEligible=!!current;if(task.assignee_kind==="manager")assigneeEligible=assigneeEligible&&task.assignee_user_id===task.manager_user_id}catch{assigneeEligible=false}
    if(!assigneeEligible)output.push({...task,needs_reassignment:true,reassignment_for:"assignee"});
    if(task.verifier_kind!=="none"){
      let verifierEligible=false;
      try{const current=await activeWorkspaceUser(db,content,task.verifier_user_id??"",task.verifier_kind==="manager"?"hrm.onboarding.tasks":"hrm.onboarding.manage");verifierEligible=!!current;if(task.verifier_kind==="manager")verifierEligible=verifierEligible&&task.verifier_user_id===task.manager_user_id;if(task.verifier_kind==="hrm_officer")verifierEligible=verifierEligible&&(current.roles.has("hrm_officer")||current.roles.has("hrm_admin")||current.admin);if(task.verifier_kind==="hrm_admin")verifierEligible=verifierEligible&&(current.roles.has("hrm_admin")||current.admin)}catch{verifierEligible=false}
      if(!verifierEligible)output.push({...task,needs_reassignment:true,reassignment_for:"verifier"});
    }
  }
  return output;
}
