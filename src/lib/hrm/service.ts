import type { WorkspaceUser } from "../workspace/roles";
import { emdashUsers, membersWithRoles } from "../workspace/members";
import { HrmError, type RecordKind, sections } from "./fields";

export interface Settings { enabled: number; legal_entity: string; purpose: string; retention_policy: string; policy_reference: string; reviewed_by: string | null; reviewed_at: string | null; version: number }
export interface Person {
  id: string; employment_id:string; employee_code: string; user_id: string | null; legal_name: string; preferred_name: string; profile_version:number;
  work_email: string; work_phone: string; department: string; job_title: string; legal_entity: string; location: string;
  manager_user_id: string | null; status: string; started_on: string | null; ended_on: string | null;
  version: number; actor_id: string; created_at: string; updated_at: string;
}
export interface HrmRecord { id: string; person_id: string; kind: RecordKind; data: string; state: string; version: number; effective_from: string | null; effective_to: string | null; verified_by: string | null; verified_at: string | null; updated_at: string }
export interface Change { id: string; person_id: string; record_id: string; kind: RecordKind; data: string; expected_version: number; state: string; submitted_by: string; reviewed_by: string | null; review_reason: string | null; version: number; effective_from: string | null; effective_to: string | null; created_at: string }
export interface PrivateFile { id: string; person_id: string; record_id: string | null; kind: string; original_name: string; mime_type: string; size_bytes: number; checksum: string; state: string; uploaded_by: string; reviewed_by: string | null; version: number; expires_on: string | null; legal_hold: number; object_deleted_at?:string|null; created_at: string }
export const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
export const now = () => new Date().toISOString();
export async function settings(db: D1Database): Promise<Settings> {
  const result = await db.prepare("SELECT enabled,legal_entity,purpose,retention_policy,policy_reference,reviewed_by,reviewed_at,version FROM hrm_settings WHERE id=1").first<Settings>();
  if (!result) throw new HrmError("not_configured", 503);
  return result;
}
export function enabled(config: Settings, live: string | undefined): boolean {
  return live === "true" && config.enabled === 1 && !!config.reviewed_by && !!config.legal_entity && !!config.purpose && !!config.retention_policy && !!config.policy_reference;
}
export function requirePermission(user: WorkspaceUser, permission: Parameters<WorkspaceUser["can"]>[0]): void {
  if (!user.can(permission)) throw new HrmError("forbidden", 403);
}
export function localDate():string { return new Date(Date.now()+7*60*60*1000).toISOString().slice(0,10); }
export function own(person: Person, user: WorkspaceUser): boolean { return person.user_id === user.id && person.status !== "ended" && (!person.ended_on || person.ended_on > localDate()); }
/** Query scope remains in D1, including detail/file/download requests. */
export async function personFor(db: D1Database, user: WorkspaceUser, personId?: string): Promise<Person> {
  requirePermission(user,"hrm.access");
  const params: string[] = [];
  const clauses: string[] = ["e.id=(SELECT e2.id FROM hrm_employments e2 WHERE e2.person_id=p.id ORDER BY CASE WHEN e2.status!='ended' THEN 0 ELSE 1 END, e2.started_on DESC, e2.created_at DESC LIMIT 1)"];
  if(personId){clauses.push("p.id=?");params.push(personId)}
  if(!user.can("hrm.records.manage")||!personId){
    if(personId&&user.can("hrm.team.read")){
      clauses.push("((p.user_id=? AND e.status!='ended' AND (e.ended_on IS NULL OR e.ended_on>?)) OR (e.manager_user_id=? AND e.status!='ended' AND (e.started_on IS NULL OR e.started_on<=?) AND (e.ended_on IS NULL OR e.ended_on>?)))");
      const today=localDate();params.push(user.id,today,user.id,today,today);
    }else{clauses.push("p.user_id=? AND e.status!='ended' AND (e.ended_on IS NULL OR e.ended_on>?)");params.push(user.id,localDate())}
  }
  const visibleName=user.can("hrm.records.manage")?"p.legal_name":"CASE WHEN p.user_id=? THEN p.legal_name ELSE COALESCE(NULLIF(p.preferred_name,''),'Employee') END";if(!user.can("hrm.records.manage"))params.unshift(user.id);
    const person=await db.prepare(`SELECT p.id,e.id AS employment_id,p.employee_code,p.user_id,${visibleName} AS legal_name,p.preferred_name,p.version AS profile_version,p.actor_id,p.created_at AS person_created_at,e.work_email,e.work_phone,e.department,e.job_title,e.legal_entity,e.location,e.manager_user_id,e.status,e.started_on,e.ended_on,e.version,e.actor_id AS employment_actor_id,e.created_at,e.updated_at FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id WHERE ${clauses.join(" AND ")} LIMIT 1`).bind(...params).first<Person>();
  if(!person)throw new HrmError("not_found",404);return person;
}
export function canReadRecord(person: Person, user: WorkspaceUser, kind: RecordKind): boolean {
  if (own(person,user) && user.can("hrm.profile.self")) return true;
  if (!user.can("hrm.records.manage")) return false;
  const permission = sections[kind].permission;
  return !permission || user.can(permission);
}
export function assertRecordRead(person: Person, user: WorkspaceUser, kind: RecordKind): void {
  if (!canReadRecord(person,user,kind)) throw new HrmError("not_found",404);
}
export async function recordsFor(db: D1Database, user: WorkspaceUser, person: Person, kind: RecordKind): Promise<HrmRecord[]> {
  assertRecordRead(person,user,kind);
  await audit(db,user,"records_read",person.id,person.id,{kind});
  return (await db.prepare("SELECT id,person_id,kind,data,state,version,effective_from,effective_to,verified_by,verified_at,updated_at FROM hrm_records WHERE person_id=? AND kind=? ORDER BY created_at DESC LIMIT 100").bind(person.id,kind).all<HrmRecord>()).results;
}
export async function changesFor(db: D1Database, user: WorkspaceUser, person: Person, kind: RecordKind): Promise<Change[]> {
  assertRecordRead(person,user,kind);
  return (await db.prepare("SELECT * FROM hrm_change_requests WHERE person_id=? AND kind=? ORDER BY created_at DESC LIMIT 100").bind(person.id,kind).all<Change>()).results;
}
export async function listPeople(db:D1Database,user:WorkspaceUser,query:string,page:number):Promise<Person[]> {
 if(!user.can("hrm.records.manage")&&!user.can("hrm.team.read"))throw new HrmError("forbidden",403);
 const team=!user.can("hrm.records.manage"),search=query,today=localDate();const visibleName=team?"COALESCE(NULLIF(p.preferred_name,''),'Employee')":"p.legal_name";
 const sql=`SELECT p.id,e.id AS employment_id,p.employee_code,p.user_id,${visibleName} AS legal_name,p.preferred_name,p.version AS profile_version,e.work_email,e.work_phone,e.department,e.job_title,e.legal_entity,e.location,e.manager_user_id,e.status,e.started_on,e.ended_on,e.version,e.actor_id AS actor_id,e.created_at,e.updated_at FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id AND e.id=(SELECT e2.id FROM hrm_employments e2 WHERE e2.person_id=p.id ORDER BY CASE WHEN e2.status!='ended' THEN 0 ELSE 1 END,e2.started_on DESC,e2.created_at DESC LIMIT 1) WHERE (instr(lower(${visibleName}),lower(?))>0 OR instr(upper(p.employee_code),upper(?))>0) ${team?"AND e.manager_user_id=? AND e.status!='ended' AND (e.started_on IS NULL OR e.started_on<=?) AND (e.ended_on IS NULL OR e.ended_on>?)":""} ORDER BY ${visibleName},p.id LIMIT 26 OFFSET ?`;
 try{return (await db.prepare(sql).bind(search,search,...(team?[user.id,today,today]:[]),(page-1)*25).all<Person>()).results}
 catch(error){if(import.meta.env.DEV&&error instanceof Error)console.error("[hrm] people query failed:",error.message.slice(0,240));throw error}
}
export async function audit(db: D1Database,user: WorkspaceUser,action: string,personId: string | null,target: string,detail: Record<string,unknown> = {}): Promise<void> {
  await db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,action,personId,target,JSON.stringify(detail),now()).run();
}
export async function digest(value: string | ArrayBuffer): Promise<string> {
  const raw = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256",raw))].map(v=>v.toString(16).padStart(2,"0")).join("");
}
/** Guard assertions and writes run in one D1 batch; a failed CHECK rolls all back. */
export async function command(db: D1Database,user: WorkspaceUser,key: string,operation: string,payload: unknown,resultId: string,guards: D1PreparedStatement[],writes: D1PreparedStatement[]): Promise<string> {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new HrmError("invalid_request_key");
  const hash = await digest(JSON.stringify(payload));
  const previous = async () => db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string;result_id:string}>();
  const check = (row: {operation:string;payload_hash:string;result_id:string}) => { if (row.operation !== operation || row.payload_hash !== hash) throw new HrmError("request_key_conflict",409); return row.result_id; };
  const old = await previous(); if(old) return check(old);
  try {
    await db.batch([
      ...guards,...writes,
      // Guard rows exist only to make atomic SQL assertions. Always clear them
      // in the same batch, even when a caller does not include an explicit delete.
      db.prepare("DELETE FROM hrm_write_guards"),
      db.prepare("INSERT INTO hrm_commands(actor_id,request_key,operation,payload_hash,result_id,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,key,operation,hash,resultId,now()),
    ]);
  } catch(error) {
    const retry = await previous(); if(retry) return check(retry);
    const message = error instanceof Error ? error.message : "";
    if(message.includes("hrm_closeout_evidence_held"))throw new HrmError("legal_hold_active",409);
    if(message.includes("hrm_closeout_source_changed"))throw new HrmError("closeout_source_changed",409);
    if(message.includes("hrm_closeout_evidence_invalid"))throw new HrmError("closeout_evidence_invalid",409);
    if(message.includes("hrm_performance_review_superseded"))throw new HrmError("performance_review_superseded",409);
    if(message.includes("hrm_performance_correction_conflict"))throw new HrmError("performance_correction_conflict",409);
    if(message.includes("structured_disposition_in_progress"))throw new HrmError("structured_disposition_in_progress",409);
    if(message.includes("structured_disposition_guard_required"))throw new HrmError("structured_record_changed",409);
    if(message.includes("time_period_import_pending")) throw new HrmError("time_period_import_pending",409);
    if(message.includes("time_period_locked_calendar_change")) throw new HrmError("time_period_locked_calendar_change",409);
    if(message.includes("time_period_locked")) throw new HrmError("time_period_locked",409);
    if(message.includes("hrm_report_policy_required"))throw new HrmError("report_policy_required",409);
    if(message.includes("hrm_report_policy_source_required"))throw new HrmError("report_policy_source_invalid",409);
    if(message.includes("hrm_report_snapshot_preserved"))throw new HrmError("report_snapshot_preserved",409);
    if(message.includes("hrm_report_hold_target_unavailable"))throw new HrmError("not_found",404);
    if(message.includes("hrm_report_schedule_limit")) throw new HrmError("report_schedule_limit",409);
    if (/CHECK constraint failed|UNIQUE constraint failed|immutable_history/.test(message)) throw new HrmError("conflict",409);
    throw error;
  }
  return resultId;
}
export function guard(db: D1Database, condition: string, params: (string | number | null)[]): D1PreparedStatement {
  // Rows are deliberately transient; successful guards remove themselves.
  return db.prepare(`INSERT INTO hrm_write_guards(id,valid) SELECT ?,CASE WHEN (${condition}) THEN 1 ELSE 0 END`).bind(id("guard"),...params);
}
/** Boolean EXISTS/NOT EXISTS predicates can be inserted directly; a failed CHECK rolls back the batch. */
export function guardBoolean(db: D1Database, predicate: string, params: (string | number | null)[]): D1PreparedStatement {
  return db.prepare(`INSERT INTO hrm_write_guards(id,valid) SELECT ?,(${predicate})`).bind(id("guard"),...params);
}
const clearGuards = (db: D1Database) => db.prepare("DELETE FROM hrm_write_guards");
export async function saveSettings(db: D1Database,user: WorkspaceUser,key: string,input: {version:number;legal_entity:string;purpose:string;retention_policy:string;policy_reference:string;reviewed:boolean;enabled:boolean}): Promise<void> {
  requirePermission(user,"hrm.configure");
  if(input.enabled && (!input.reviewed || !input.legal_entity || !input.purpose || !input.retention_policy || !input.policy_reference)) throw new HrmError("policy_required");
  const time=now();
  await command(db,user,key,"settings",input,"settings",[guard(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND version=?)",[input.version])],[
    db.prepare("UPDATE hrm_settings SET legal_entity=?,purpose=?,retention_policy=?,policy_reference=?,reviewed_by=?,reviewed_at=?,enabled=?,version=version+1,updated_by=?,updated_at=? WHERE id=1").bind(input.legal_entity,input.purpose,input.retention_policy,input.policy_reference,input.reviewed?user.id:null,input.reviewed?time:null,input.enabled?1:0,user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'settings_updated','settings',?,?)").bind(user.id,JSON.stringify({enabled:input.enabled,reviewed:input.reviewed}),time),clearGuards(db),
  ]);
}
export async function savePerson(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,personId:string|null,employmentId:string|null,version:number,profileVersion:number,input:Omit<Person,"id"|"employment_id"|"version"|"profile_version"|"actor_id"|"created_at"|"updated_at">):Promise<string>{
 requirePermission(user,"hrm.records.manage");
 if(input.status==="ended"&&!input.ended_on)throw new HrmError("offboarding_end_date_required");
 if(input.user_id||input.manager_user_id){const accounts=await emdashUsers(content,[input.user_id??"",input.manager_user_id??""]);for(const accountId of [input.user_id,input.manager_user_id].filter(Boolean)){const account=accounts.get(accountId!);if(!account||account.disabled)throw new HrmError("invalid_account")}}
 if(input.manager_user_id){const managers=await membersWithRoles(db,content,["people_manager","hrm_admin"]);if(!managers.some(m=>m.user_id===input.manager_user_id))throw new HrmError("invalid_manager")}
 if(input.user_id&&input.user_id===input.manager_user_id)throw new HrmError("invalid_manager");
 const time=now(),target=personId??id("person"),employment=employmentId??id("employment");
 const employmentColumns=["work_email","work_phone","department","job_title","legal_entity","location","manager_user_id","status","started_on","ended_on"] as const;
 if(personId){
  const current=await db.prepare("SELECT employee_code FROM hrm_people WHERE id=?").bind(personId).first<{employee_code:string}>();if(!current)throw new HrmError("not_found",404);if(input.employee_code!==current.employee_code)throw new HrmError("employee_code_immutable",409);
  if(!employmentId)throw new HrmError("employment_required",409);
  const guards=[guard(db,"EXISTS(SELECT 1 FROM hrm_people WHERE id=? AND version=?)",[target,profileVersion]),guard(db,"EXISTS(SELECT 1 FROM hrm_employments WHERE id=? AND person_id=? AND version=?)",[employment,target,version])];
  return command(db,user,key,"person_update",{target,employment,version,profileVersion,input},target,guards,[
   db.prepare("UPDATE hrm_people SET user_id=?,legal_name=?,preferred_name=?,version=version+1,actor_id=?,updated_at=? WHERE id=?").bind(input.user_id,input.legal_name,input.preferred_name,user.id,time,target),
   db.prepare(`UPDATE hrm_employments SET ${employmentColumns.map(c=>c+"=?").join(",")},version=version+1,actor_id=?,updated_at=? WHERE id=? AND person_id=?`).bind(...employmentColumns.map(c=>input[c]),user.id,time,employment,target),clearGuards(db)
  ]);
 }
 const guards=input.user_id?[guard(db,"NOT EXISTS(SELECT 1 FROM hrm_people WHERE user_id=?)",[input.user_id])]:[];
 return command(db,user,key,"person_create",{input},target,guards,[
  db.prepare("INSERT INTO hrm_people(id,employee_code,user_id,legal_name,preferred_name,actor_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(target,input.employee_code,input.user_id,input.legal_name,input.preferred_name,user.id,time,time),
  db.prepare(`INSERT INTO hrm_employments(id,person_id,${employmentColumns.join(",")},actor_id,created_at,updated_at) VALUES(${Array(15).fill("?").join(",")})`).bind(employment,target,...employmentColumns.map(c=>input[c]),user.id,time,time),
  clearGuards(db)
 ]);
}
export interface RehireInput {
 work_email:string;work_phone:string;department:string;job_title:string;legal_entity:string;location:string;manager_user_id:string|null;status:"preboarding"|"probation"|"active";started_on:string;
}
/** Start a new immutable employment period without changing the person's identity or prior history. */
export async function startEmploymentPeriod(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,personId:string,previousEmploymentId:string,previousVersion:number,input:RehireInput):Promise<string>{
 requirePermission(user,"hrm.records.manage");
 const payload={personId,previousEmploymentId,previousVersion,input};
 const previousCommand=await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string;result_id:string}>();
 if(previousCommand){if(previousCommand.operation!=="employment_rehire"||previousCommand.payload_hash!==await digest(JSON.stringify(payload)))throw new HrmError("request_key_conflict",409);return previousCommand.result_id}
 if(!["preboarding","probation","active"].includes(input.status))throw new HrmError("invalid_status");
 const person=await db.prepare("SELECT user_id FROM hrm_people WHERE id=?").bind(personId).first<{user_id:string|null}>();if(!person)throw new HrmError("not_found",404);
 const ended=await db.prepare("SELECT ended_on FROM hrm_employments WHERE id=? AND person_id=? AND version=? AND status='ended'").bind(previousEmploymentId,personId,previousVersion).first<{ended_on:string|null}>();
 if(!ended?.ended_on||input.started_on<=ended.ended_on)throw new HrmError("rehire_conflict",409);
 const config=await settings(db);if(input.legal_entity!==config.legal_entity)throw new HrmError("legal_entity_unconfigured");
 if(person.user_id||input.manager_user_id){const accounts=await emdashUsers(content,[person.user_id??"",input.manager_user_id??""]);for(const accountId of [person.user_id,input.manager_user_id].filter(Boolean)){const account=accounts.get(accountId!);if(!account||account.disabled)throw new HrmError("invalid_account")}}
 if(person.user_id&&person.user_id===input.manager_user_id)throw new HrmError("invalid_manager");
 if(input.manager_user_id){const managers=await membersWithRoles(db,content,["people_manager","hrm_admin"]);if(!managers.some(manager=>manager.user_id===input.manager_user_id))throw new HrmError("invalid_manager")}
 const employment=id("employment"),time=now();
 const columns=["work_email","work_phone","department","job_title","legal_entity","location","manager_user_id","status","started_on"] as const;
 return command(db,user,key,"employment_rehire",payload,employment,[
  guard(db,"EXISTS(SELECT 1 FROM hrm_people WHERE id=?)",[personId]),
  guard(db,"EXISTS(SELECT 1 FROM hrm_employments WHERE id=? AND person_id=? AND version=? AND status='ended' AND ended_on IS NOT NULL AND ?>ended_on)",[previousEmploymentId,personId,previousVersion,input.started_on]),
  guard(db,"NOT EXISTS(SELECT 1 FROM hrm_employments WHERE person_id=? AND status!='ended')",[personId]),
 ],[
  db.prepare(`INSERT INTO hrm_employments(id,person_id,${columns.join(",")},ended_on,actor_id,created_at,updated_at) VALUES(${Array(15).fill("?").join(",")})`).bind(employment,personId,...columns.map(column=>input[column]),null,user.id,time,time),
  db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'employment_rehired',?,?,?,?)").bind(user.id,personId,employment,JSON.stringify({previous_employment_id:previousEmploymentId}),time),
  clearGuards(db),
 ]);
}
export async function submitRecord(db: D1Database,user: WorkspaceUser,key:string,person:Person,kind:RecordKind,recordId:string|null,expectedVersion:number,data:Record<string,string>,from:string|null,to:string|null):Promise<string> {
  assertRecordRead(person,user,kind);
  if(!own(person,user) && !user.can("hrm.records.manage")) throw new HrmError("forbidden",403);
  const target=recordId??id("rec"); const request=id("chg"); const time=now();
  const condition=recordId?"EXISTS(SELECT 1 FROM hrm_records WHERE id=? AND person_id=? AND kind=? AND version=?)":"NOT EXISTS(SELECT 1 FROM hrm_records WHERE id=?)";
  const args=recordId?[target,person.id,kind,expectedVersion]:[target];
  const guards=[guard(db,condition,args)];
  if(!recordId && expectedVersion!==0) throw new HrmError("invalid_revision");
  const direct=kind==="contact" && own(person,user);
  const writes: D1PreparedStatement[]=[];
  if(direct) writes.push(recordId?
    db.prepare("UPDATE hrm_records SET data=?,state='unverified',effective_from=?,effective_to=?,version=version+1,actor_id=?,verified_by=NULL,verified_at=NULL,updated_at=? WHERE id=?").bind(JSON.stringify(data),from,to,user.id,time,target):
    db.prepare("INSERT INTO hrm_records(id,person_id,kind,data,state,effective_from,effective_to,actor_id,created_at,updated_at) VALUES(?,?,?,?,'unverified',?,?,?,?,?)").bind(target,person.id,kind,JSON.stringify(data),from,to,user.id,time,time));
  else writes.push(db.prepare("INSERT INTO hrm_change_requests(id,person_id,record_id,kind,expected_version,data,effective_from,effective_to,state,submitted_by,actor_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'submitted',?,?,?,?)").bind(request,person.id,target,kind,expectedVersion,JSON.stringify(data),from,to,user.id,user.id,time,time));
  writes.push(clearGuards(db));
  return command(db,user,key,"record_submit",{person:person.id,kind,recordId,expectedVersion,data,from,to},direct?target:request,guards,writes);
}
export async function reviewChange(db:D1Database,user:WorkspaceUser,key:string,person:Person,requestId:string,version:number,decision:"approved"|"rejected"|"withdrawn",reason:string):Promise<void> {
  const request=await db.prepare("SELECT * FROM hrm_change_requests WHERE id=? AND person_id=?").bind(requestId,person.id).first<Change>();
  if(!request) throw new HrmError("not_found",404);
  assertRecordRead(person,user,request.kind);
  if(decision==="withdrawn") {if(request.submitted_by!==user.id) throw new HrmError("forbidden",403);}
  else {requirePermission(user,"hrm.records.manage");if(request.submitted_by===user.id || own(person,user)) throw new HrmError("self_approval",403);if(!reason) throw new HrmError("reason_required");}
  const time=now();const guards=[guard(db,"EXISTS(SELECT 1 FROM hrm_change_requests WHERE id=? AND person_id=? AND version=? AND state='submitted')",[request.id,person.id,version])];
  const writes:D1PreparedStatement[]=[];
  if(decision==="approved") {
    guards.push(guard(db,request.expected_version===0?"NOT EXISTS(SELECT 1 FROM hrm_records WHERE id=?)":"EXISTS(SELECT 1 FROM hrm_records WHERE id=? AND person_id=? AND kind=? AND version=?)",request.expected_version===0?[request.record_id]:[request.record_id,person.id,request.kind,request.expected_version]));
    writes.push(request.expected_version===0?
      db.prepare("INSERT INTO hrm_records(id,person_id,kind,data,state,effective_from,effective_to,actor_id,verified_by,verified_at,created_at,updated_at) VALUES(?,?,?,?,'verified',?,?,?,?,?,?,?)").bind(request.record_id,person.id,request.kind,request.data,request.effective_from,request.effective_to,user.id,user.id,time,time,time):
      db.prepare("UPDATE hrm_records SET data=?,state='verified',effective_from=?,effective_to=?,version=version+1,actor_id=?,verified_by=?,verified_at=?,updated_at=? WHERE id=?").bind(request.data,request.effective_from,request.effective_to,user.id,user.id,time,time,request.record_id));
  }
  writes.push(db.prepare("UPDATE hrm_change_requests SET state=?,reviewed_by=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=?").bind(decision,decision==="withdrawn"?null:user.id,reason||null,user.id,time,request.id),clearGuards(db));
  await command(db,user,key,"change_review",{person:person.id,requestId,version,decision,reason},request.id,guards,writes);
}
