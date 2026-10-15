import type { WorkspaceUser } from "../workspace/roles";
import { membersWithRoles } from "../workspace/members";
import { HrmError, date } from "./fields";
import { command, digest, guard, id, now, requirePermission, settings } from "./service";

export interface AtsCandidatePreview {
  id: string;
  public_id: string;
  full_name: string;
  email: string;
  phone: string;
  status: string;
  updated_at: string;
  job_title: string;
  department: string;
  location: string;
  job_updated_at: string;
}

export interface AtsTransferRecord {
  id: string;
  source_application_id: string;
  source_public_id: string;
  source_updated_at: string;
  source_status: string;
  settings_version: number;
  person_id: string;
  employment_id: string;
  transferred_fields_json: string;
  actor_id: string;
  transferred_at: string;
  employee_code: string;
  legal_name: string;
  job_title: string;
  status: string;
  started_on: string | null;
}

export interface AtsTransferInput {
  expectedSourceUpdatedAt: string;
  expectedJobUpdatedAt: string;
  expectedSettingsVersion: number;
  employeeCode: string;
  employeeAccountEmail: string;
  startedOn: string;
  managerEmail: string | null;
}

function requireTransferAccess(user: WorkspaceUser): void {
  requirePermission(user, "hiring.applications.manage");
  requirePermission(user, "hrm.records.manage");
  if (user.hrmEnabled !== true) throw new HrmError("hrm_closed", 503);
}

export async function atsCandidatePreview(db: D1Database, user: WorkspaceUser, applicationId: string): Promise<AtsCandidatePreview> {
  requireTransferAccess(user);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(applicationId)) throw new HrmError("not_found", 404);
  const row = await db.prepare(`SELECT a.id,a.public_id,a.full_name,a.email,a.phone,a.status,a.updated_at,
      j.title AS job_title,j.team AS department,j.location,j.updated_at AS job_updated_at
    FROM applications a JOIN jobs j ON j.id=a.job_id
    WHERE a.id=? AND NOT EXISTS(SELECT 1 FROM hrm_ats_transfers t WHERE t.source_application_id=a.id)`)
    .bind(applicationId).first<AtsCandidatePreview>();
  if (!row) throw new HrmError("not_found",404);
  return row;
}

export async function getAtsTransfer(db: D1Database, user: WorkspaceUser, applicationId: string): Promise<AtsTransferRecord | null> {
  requireTransferAccess(user);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(applicationId)) throw new HrmError("not_found", 404);
  return db.prepare(`SELECT t.*,p.employee_code,p.legal_name,e.job_title,e.status,e.started_on
    FROM hrm_ats_transfers t JOIN hrm_people p ON p.id=t.person_id
    JOIN hrm_employments e ON e.id=t.employment_id WHERE t.source_application_id=?`)
    .bind(applicationId).first<AtsTransferRecord>();
}

async function priorTransferCommand(db: D1Database, user: WorkspaceUser, key: string, payload: unknown): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) throw new HrmError("invalid_request_key");
  const row = await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?")
    .bind(user.id,key).first<{operation:string;payload_hash:string;result_id:string}>();
  if (!row) return null;
  if (row.operation !== "ats_hrm_transfer" || row.payload_hash !== await digest(JSON.stringify(payload))) throw new HrmError("request_key_conflict",409);
  return row.result_id;
}

export async function transferAtsCandidate(
  db: D1Database,
  contentDb: D1Database,
  user: WorkspaceUser,
  key: string,
  applicationId: string,
  input: AtsTransferInput,
): Promise<string> {
  requireTransferAccess(user);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(applicationId)) throw new HrmError("not_found",404);
  const startedOn = date(input.startedOn);
  if (!startedOn) throw new HrmError("invalid_date");
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,49}$/.test(input.employeeCode)) throw new HrmError("invalid_employee_code");
  const employeeAccountEmail=input.employeeAccountEmail.trim().toLowerCase();
  const managerEmail=input.managerEmail?.trim().toLowerCase()||null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employeeAccountEmail)) throw new HrmError("invalid_account");
  if (managerEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail)) throw new HrmError("invalid_manager");

  const payload = { applicationId,input:{...input,employeeAccountEmail,managerEmail,startedOn} };
  const prior = await priorTransferCommand(db,user,key,payload);
  if (prior) return prior;

  const [candidate,config] = await Promise.all([
    db.prepare(`SELECT a.id,a.public_id,a.full_name,a.email,a.phone,a.status,a.updated_at,
        j.title AS job_title,j.team AS department,j.location,j.updated_at AS job_updated_at
      FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.id=?`)
      .bind(applicationId).first<AtsCandidatePreview>(),
    settings(db),
  ]);
  if (!candidate) throw new HrmError("not_found",404);
  if (candidate.status !== "hired") throw new HrmError("candidate_not_hired",409);
  if (candidate.updated_at !== input.expectedSourceUpdatedAt || candidate.job_updated_at !== input.expectedJobUpdatedAt || config.version !== input.expectedSettingsVersion) {
    throw new HrmError("transfer_preview_stale",409);
  }
  if (!config.legal_entity || !config.reviewed_by || !config.enabled) throw new HrmError("hrm_closed",503);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email) || !candidate.full_name.trim() || candidate.full_name.length > 200 || candidate.email.length>254 || candidate.phone.length>40 || candidate.job_title.length>200 || candidate.department.length>200 || candidate.location.length>200) throw new HrmError("candidate_data_invalid");

  const employeeAccounts=(await contentDb.prepare("SELECT id,email,name,disabled,role FROM users WHERE lower(email)=? LIMIT 2").bind(employeeAccountEmail).all<{id:string;email:string;name:string|null;disabled:number;role:number}>()).results;
  if(employeeAccounts.length!==1||employeeAccounts[0].disabled||employeeAccounts[0].role===50)throw new HrmError("transfer_employee_account_invalid");
  const employeeUserId=employeeAccounts[0].id;
  const employeeGrant=await db.prepare("SELECT 1 AS allowed FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role='employee' LIMIT 1")
    .bind(employeeUserId).first<{allowed:number}>();
  if(!employeeGrant)throw new HrmError("transfer_employee_account_invalid");
  let managerUserId:string|null=null;
  if(managerEmail){
    const managerAccounts=(await contentDb.prepare("SELECT id,email,name,disabled,role FROM users WHERE lower(email)=? LIMIT 2").bind(managerEmail).all<{id:string;email:string;name:string|null;disabled:number;role:number}>()).results;
    const manager=managerAccounts.length===1?managerAccounts[0]:null;
    const allowed=manager?await membersWithRoles(db,contentDb,["people_manager","hrm_admin"]).then(members=>members.some(member=>member.user_id===manager.id)):false;
    if(!manager||manager.disabled||manager.id===employeeUserId||!allowed)throw new HrmError("invalid_manager");
    managerUserId=manager.id;
  }

  const personId=id("person"),employmentId=id("employment"),transferId=id("ats_transfer"),time=now();
  const fields=["full_name→legal_name","email→work_email","phone→work_phone","job.title→job_title","job.team→department","job.location→location","started_on"];
  const guards=[
    guard(db,"EXISTS(SELECT 1 FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.id=? AND a.status='hired' AND a.updated_at=? AND j.updated_at=?)",[applicationId,input.expectedSourceUpdatedAt,input.expectedJobUpdatedAt]),
    guard(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND version=? AND enabled=1 AND reviewed_by IS NOT NULL AND legal_entity=?)",[input.expectedSettingsVersion,config.legal_entity]),
    guard(db,"EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role='employee')",[employeeUserId]),
    guard(db,"NOT EXISTS(SELECT 1 FROM hrm_people WHERE user_id=?)",[employeeUserId]),
    guard(db,"NOT EXISTS(SELECT 1 FROM hrm_people WHERE employee_code=?)",[input.employeeCode]),
    guard(db,"NOT EXISTS(SELECT 1 FROM hrm_ats_transfers WHERE source_application_id=?)",[applicationId]),
    ...(managerUserId?[guard(db,"EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role IN ('people_manager','hrm_admin'))",[managerUserId])]:[]),
  ];
  const writes:D1PreparedStatement[]=[
    db.prepare("INSERT INTO hrm_people(id,employee_code,user_id,legal_name,preferred_name,actor_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(personId,input.employeeCode,employeeUserId,candidate.full_name.trim(),"",user.id,time,time),
    db.prepare("INSERT INTO hrm_employments(id,person_id,work_email,work_phone,department,job_title,legal_entity,location,manager_user_id,status,started_on,ended_on,actor_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'preboarding',?,NULL,?,?,?)")
      .bind(employmentId,personId,candidate.email.trim().toLowerCase(),candidate.phone,candidate.department,candidate.job_title,config.legal_entity,candidate.location,managerUserId,startedOn,user.id,time,time),
    db.prepare(`INSERT INTO hrm_ats_transfers(id,source_application_id,source_public_id,source_updated_at,source_status,settings_version,person_id,employment_id,transferred_fields_json,actor_id,transferred_at,created_at)
      VALUES(?,?,?,?, 'hired',?,?,?,?,?,?,?)`)
      .bind(transferId,candidate.id,candidate.public_id,candidate.updated_at,config.version,personId,employmentId,JSON.stringify(fields),user.id,time,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'ats_candidate_transferred',?,?,?,?)")
      .bind(user.id,personId,transferId,JSON.stringify({source_application_id:candidate.id,source_public_id:candidate.public_id,transferred_fields:fields}),time),
    db.prepare("DELETE FROM hrm_write_guards"),
  ];
  return command(db,user,key,"ats_hrm_transfer",payload,transferId,guards,writes);
}
