import type { WorkspaceUser } from "../workspace/roles";
import { reportAccount, reportAuthority, reportPolicyForCapture } from "./report-governance";
import { HrmError } from "./fields";
import { audit, command, digest, enabled, guardBoolean, id, localDate, now, requirePermission, settings } from "./service";
import { buildHrmReportSnapshotForEntity, hrmReportSnapshot, reportCsvCell, reportCsvContent, type HrmReportFilters, type HrmReportLanguage, type HrmReportSnapshot } from "./reports";

export type HrmReportCadence="daily"|"weekly"|"monthly";
export interface HrmReportSnapshotSummary {snapshot_ref:string;source:"manual"|"scheduled";legal_entity:string;period:string;department:string|null;generated_at:string;created_at:string;scheduled_for:string|null;hold_active?:number;expires_on:string;state:"active"|"expired";retention_days:number;retention_basis?:string}
export interface HrmStoredReportSnapshot extends HrmReportSnapshotSummary {report:HrmReportSnapshot}
export interface HrmReportScheduleSummary {schedule_ref:string;legal_entity:string;department:string|null;cadence:HrmReportCadence;retention_days:number;retention_basis:string;state:"active"|"paused"|"retired";version:number;created_at:string;last_run_on:string|null;last_run_state:"run_completed"|"run_failed"|null;last_error_code:string|null}
export interface HrmReportSnapshotsPage {snapshots:HrmReportSnapshotSummary[];page:number;hasMore:boolean}
export interface HrmReportSchedulesPage {schedules:HrmReportScheduleSummary[];page:number;hasMore:boolean}

const SNAPSHOT_SCHEMA_VERSION=1,MAX_REPORT_BYTES=64*1024,MAX_ACTIVE_REPORT_SCHEDULES=20,REPORT_SNAPSHOT_PAGE_SIZE=50;
const live=(user:WorkspaceUser)=>{if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503)};
const clean=(value:string,max:number)=>{const result=value.trim();if(!result||result.length>max)throw new HrmError("invalid_field",400);return result};
const addDays=(date:string,days:number)=>new Date(Date.parse(`${date}T00:00:00.000Z`)+days*86400000).toISOString().slice(0,10);
const validLocalDate=(value:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const time=Date.parse(`${value}T00:00:00.000Z`);return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value};
async function replay(db:D1Database,user:WorkspaceUser,key:string,operation:string,payload:unknown):Promise<string|null>{
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(key))throw new HrmError("invalid_request_key",400);
  const row=await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string;result_id:string}>();
  if(!row)return null;
  if(row.operation!==operation||row.payload_hash!==await digest(JSON.stringify(payload)))throw new HrmError("request_key_conflict",409);
  return row.result_id;
}

export function reportScheduleIsDue(cadence:HrmReportCadence,scheduledDate:string):boolean{
  if(!["daily","weekly","monthly"].includes(cadence)||!validLocalDate(scheduledDate))throw new HrmError("report_schedule_date_invalid",400);
  if(cadence==="daily")return true;
  if(cadence==="weekly")return new Date(`${scheduledDate}T00:00:00.000Z`).getUTCDay()===1;
  return scheduledDate.slice(8)==="01";
}
export function reportPeriodForSchedule(cadence:HrmReportCadence,scheduledDate:string):string{
  if(!reportScheduleIsDue(cadence,scheduledDate))throw new HrmError("report_schedule_not_due",409);
  if(cadence!=="monthly")return scheduledDate.slice(0,7);
  const date=new Date(`${scheduledDate}T00:00:00.000Z`);date.setUTCDate(0);return date.toISOString().slice(0,7);
}
/**
 * Capture targets for one sweep: the run's own Vietnam date when due, plus the
 * most recent missed due date within one cadence window (1 day, 6 days or
 * 27 days, so a run on the 1st never reaches back to last month) that is not before the schedule's own creation date. A missed
 * target keeps the same time of day as this run, so its nominal clock falls on
 * the missed date while the snapshot records the actual capture time.
 */
export function reportCaptureTargets(cadence:HrmReportCadence,day:string,scheduledTime:number,createdAt:string):Array<{day:string;scheduledFor:string}>{
  const created=new Date(Date.parse(createdAt)+7*3600000).toISOString().slice(0,10),window=cadence==="daily"?1:cadence==="weekly"?6:27;
  const targets=reportScheduleIsDue(cadence,day)?[{day,scheduledFor:new Date(scheduledTime).toISOString()}]:[];
  for(let back=1;back<=window;back++){
    const previous=addDays(day,-back);
    if(previous<created)break;
    if(reportScheduleIsDue(cadence,previous)){targets.push({day:previous,scheduledFor:new Date(scheduledTime-back*86400000).toISOString()});break}
  }
  return targets;
}
export function reportExpiryDate(createdOn:string,retentionDays:number):string{
  if(!validLocalDate(createdOn)||!Number.isInteger(retentionDays)||retentionDays<1||retentionDays>36500)throw new HrmError("report_retention_invalid",400);
  return addDays(createdOn,retentionDays);
}
function departmentValue(value:string|null|undefined):string|null{
  const result=(value??"").trim();if(result.length>120||/[\u0000-\u001f\u007f]/u.test(result))throw new HrmError("report_department_invalid",400);return result||null;
}
function makeStored(report:HrmReportSnapshot):string{
  const body=JSON.stringify({schema_version:SNAPSHOT_SCHEMA_VERSION,report});
  if(new TextEncoder().encode(body).byteLength>MAX_REPORT_BYTES)throw new HrmError("report_snapshot_too_large",413);
  return body;
}
const object=(value:unknown):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value);
function parseStored(body:string):HrmReportSnapshot{
  let parsed:unknown;try{parsed=JSON.parse(body)}catch{throw new HrmError("report_snapshot_corrupt",500)}
  if(!object(parsed)||parsed.schema_version!==SNAPSHOT_SCHEMA_VERSION||!object(parsed.report))throw new HrmError("report_snapshot_corrupt",500);
  const report=parsed.report;
  if(typeof report.legal_entity!=="string"||typeof report.generated_at!=="string"||typeof report.period!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/.test(report.period)||(report.department!==null&&typeof report.department!=="string")||!Array.isArray(report.departments)||!report.departments.every(value=>typeof value==="string")||!Array.isArray(report.groups))throw new HrmError("report_snapshot_corrupt",500);
  const groups=report.groups.map(group=>{
    if(!object(group)||typeof group.key!=="string"||typeof group.title_en!=="string"||typeof group.title_vi!=="string"||!Array.isArray(group.rows))throw new HrmError("report_snapshot_corrupt",500);
    const rows=group.rows.map(row=>{
      if(!object(row)||typeof row.key!=="string"||typeof row.count!=="number"||!Number.isSafeInteger(row.count)||row.count<0)throw new HrmError("report_snapshot_corrupt",500);
      return {key:row.key,count:row.count};
    });
    return {key:group.key,title_en:group.title_en,title_vi:group.title_vi,rows};
  });
  return {legal_entity:report.legal_entity,generated_at:report.generated_at,period:report.period,department:report.department,departments:report.departments,groups};
}

export async function listReportSnapshots(db:D1Database,user:WorkspaceUser,page=1):Promise<HrmReportSnapshotsPage>{
  requirePermission(user,"hrm.reports.read");live(user);const config=await settings(db);
  if(!config.legal_entity)throw new HrmError("hrm_entity_unconfigured",409);
  const normalizedPage=Number.isFinite(page)?Math.max(1,Math.min(1000,Math.floor(page))):1;
  const rows=(await db.prepare(`SELECT snapshot_ref,source,legal_entity,period,department,generated_at,created_at,scheduled_for,expires_on,
      CASE WHEN state='expired' OR expires_on<? THEN 'expired' ELSE 'active' END AS state,retention_days,retention_basis,
      ${user.can("hrm.reports.holds.read")?"CASE WHEN hrm_report_snapshots.state='active' THEN EXISTS(SELECT 1 FROM hrm_report_snapshot_hold_matches h WHERE h.snapshot_id=hrm_report_snapshots.id) ELSE 0 END":"0"} AS hold_active
    FROM hrm_report_snapshots WHERE legal_entity=? ORDER BY generated_at DESC,id DESC LIMIT ? OFFSET ?`).bind(localDate(),config.legal_entity,REPORT_SNAPSHOT_PAGE_SIZE+1,(normalizedPage-1)*REPORT_SNAPSHOT_PAGE_SIZE).all<HrmReportSnapshotSummary>()).results;
  const hasMore=rows.length>REPORT_SNAPSHOT_PAGE_SIZE,snapshots=rows.slice(0,REPORT_SNAPSHOT_PAGE_SIZE).map(snapshot=>{
    if(user.can("hrm.reports.manage"))return snapshot;const {retention_basis:_basis,...visible}=snapshot;return visible;
  });
  await audit(db,user,"hrm_report_snapshots_listed",null,"reports",{count:snapshots.length,page:normalizedPage});return {snapshots,page:normalizedPage,hasMore};
}

export async function listReportSchedules(db:D1Database,user:WorkspaceUser,page=1):Promise<HrmReportSchedulesPage>{
  requirePermission(user,"hrm.reports.read");live(user);if(!user.can("hrm.reports.manage"))return {schedules:[],page:1,hasMore:false};
  const config=await settings(db);if(!config.legal_entity)throw new HrmError("hrm_entity_unconfigured",409);
  const normalizedPage=Number.isFinite(page)?Math.max(1,Math.min(1000,Math.floor(page))):1;
  const rows=(await db.prepare(`SELECT s.id,s.schedule_ref,s.legal_entity,s.department,s.cadence,s.retention_days,s.retention_basis,s.state,s.version,s.created_at,
      (SELECT e.scheduled_on FROM hrm_report_schedule_events e WHERE e.schedule_id=s.id AND e.event_type IN ('run_completed','run_failed') ORDER BY e.id DESC LIMIT 1) AS last_run_on,
      (SELECT e.event_type FROM hrm_report_schedule_events e WHERE e.schedule_id=s.id AND e.event_type IN ('run_completed','run_failed') ORDER BY e.id DESC LIMIT 1) AS last_run_state,
      (SELECT CASE WHEN e.event_type='run_failed' THEN json_extract(e.detail_json,'$.error_code') ELSE NULL END FROM hrm_report_schedule_events e WHERE e.schedule_id=s.id AND e.event_type IN ('run_completed','run_failed') ORDER BY e.id DESC LIMIT 1) AS last_error_code
    FROM hrm_report_schedules s WHERE s.legal_entity=? ORDER BY s.state,s.created_at DESC,s.id DESC LIMIT ? OFFSET ?`).bind(config.legal_entity,REPORT_SNAPSHOT_PAGE_SIZE+1,(normalizedPage-1)*REPORT_SNAPSHOT_PAGE_SIZE).all<HrmReportScheduleSummary & {id:string}>()).results;
  const hasMore=rows.length>REPORT_SNAPSHOT_PAGE_SIZE,schedules=rows.slice(0,REPORT_SNAPSHOT_PAGE_SIZE).map(({id:_id,...row})=>row);
  await audit(db,user,"hrm_report_schedules_listed",null,"reports",{count:schedules.length,page:normalizedPage});
  return {schedules,page:normalizedPage,hasMore};
}

export async function readReportSnapshot(db:D1Database,user:WorkspaceUser,snapshotRef:string):Promise<HrmStoredReportSnapshot>{
  requirePermission(user,"hrm.reports.read");live(user);const ref=clean(snapshotRef,100),config=await settings(db),today=localDate();
  const row=await db.prepare(`SELECT snapshot_ref,source,legal_entity,period,department,generated_at,created_at,scheduled_for,expires_on,state,retention_days,retention_basis,snapshot_json,snapshot_checksum
    FROM hrm_report_snapshots WHERE snapshot_ref=? AND legal_entity=? AND state='active' AND expires_on>=?`).bind(ref,config.legal_entity,today).first<HrmReportSnapshotSummary & {retention_basis:string;snapshot_json:string;snapshot_checksum:string}>();
  if(!row)throw new HrmError("not_found",404);
  if(await digest(row.snapshot_json)!==row.snapshot_checksum)throw new HrmError("report_snapshot_corrupt",500);
  const report=parseStored(row.snapshot_json);
  await audit(db,user,"hrm_report_snapshot_read",null,row.snapshot_ref,{period:row.period,department:row.department??"all",group_count:report.groups.length});
  const {snapshot_json:_json,snapshot_checksum:_checksum,retention_basis,...metadata}=row;return {...metadata,...(user.can("hrm.reports.manage")?{retention_basis}:{}),report};
}

export async function exportSavedReportSnapshotCsv(db:D1Database,user:WorkspaceUser,snapshotRef:string,lang:HrmReportLanguage):Promise<string>{
  requirePermission(user,"hrm.reports.export");live(user);const snapshot=await readReportSnapshot(db,user,snapshotRef);
  await audit(db,user,"hrm_report_snapshot_export",null,snapshot.snapshot_ref,{period:snapshot.period,department:snapshot.department??"all",group_count:snapshot.report.groups.length});
  return savedCsv(snapshot.report,snapshot.snapshot_ref,snapshot.expires_on,lang);
}

function savedCsv(report:HrmReportSnapshot,ref:string,expiry:string,lang:HrmReportLanguage):string{
 return reportCsvContent(report,lang)+"\r\n"+[[lang==="vi"?"Tham chiếu bản chốt":"Snapshot reference",ref],[lang==="vi"?"Hạn đọc thông thường":"Ordinary access through",expiry]].map(row=>row.map(reportCsvCell).join(",")).join("\r\n");
}
export async function exportHeldReportSnapshotCsv(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,snapshotRef:string,reason:string,lang:HrmReportLanguage):Promise<string>{
 requirePermission(user,"hrm.reports.holds.read");live(user);await reportAccount(db,content,user.id,"hrm.reports.holds.read");
 const config=await settings(db),ref=clean(snapshotRef,100),accessReason=clean(reason,500);
 const row=await db.prepare(`SELECT id,snapshot_ref,snapshot_json,snapshot_checksum,expires_on FROM hrm_report_snapshots s
  WHERE snapshot_ref=? AND legal_entity=? AND state='active' AND EXISTS(SELECT 1 FROM hrm_report_snapshot_hold_matches h WHERE h.snapshot_id=s.id)`).bind(ref,config.legal_entity).first<{id:string;snapshot_ref:string;snapshot_json:string;snapshot_checksum:string;expires_on:string}>();
 if(!row)throw new HrmError("not_found",404);if(await digest(row.snapshot_json)!==row.snapshot_checksum)throw new HrmError("report_snapshot_corrupt",500);
 const report=parseStored(row.snapshot_json),time=now();
 const accessGuards=()=>[...reportAuthority(db,user,"hrm.reports.holds.read"),
  guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND enabled=1 AND legal_entity=? AND version=?) AND EXISTS(SELECT 1 FROM hrm_report_snapshots s WHERE s.id=? AND s.state='active' AND s.snapshot_checksum=? AND EXISTS(SELECT 1 FROM hrm_report_snapshot_hold_matches h WHERE h.snapshot_id=s.id))",[config.legal_entity,config.version,row.id,row.snapshot_checksum]),
 ];
 await command(db,user,key,"hrm_report_held_export",{ref,reason:accessReason,lang},row.snapshot_ref,accessGuards(),[db.prepare("INSERT INTO hrm_report_held_access(snapshot_id,reason,actor_id,created_at) VALUES(?,?,?,?)").bind(row.id,accessReason,user.id,time)]);
 // A replay does not reinsert an audit row. It must still revalidate access at disclosure time.
 await db.batch([...accessGuards(),db.prepare("DELETE FROM hrm_write_guards")]);
 return savedCsv(report,row.snapshot_ref,row.expires_on,lang);
}

export async function saveReportSnapshot(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,filters:HrmReportFilters,input:{policyRef:string}):Promise<string>{
  requirePermission(user,"hrm.reports.manage");live(user);await reportAccount(db,content,user.id,"hrm.reports.manage");
  const department=departmentValue(filters.department),requestPayload={period:(filters.period??localDate().slice(0,7)).trim(),department,policyRef:clean(input.policyRef,120)},prior=await replay(db,user,key,"hrm_report_snapshot_save",requestPayload);
  if(prior){const previous=await db.prepare("SELECT snapshot_ref FROM hrm_report_snapshots WHERE id=?").bind(prior).first<{snapshot_ref:string}>();if(previous)return previous.snapshot_ref;throw new HrmError("report_snapshot_expired",410)}
  const config=await settings(db),{policy,owner}=await reportPolicyForCapture(db,content,input.policyRef,config.legal_entity,"manual",department);
  const report=await hrmReportSnapshot(db,user,{period:filters.period,department}),body=makeStored(report),checksum=await digest(body),completedAt=now(),expiresOn=reportExpiryDate(new Date(Date.parse(completedAt)+7*3600000).toISOString().slice(0,10),policy.retention_days),snapshotId=id("hrmrpt"),snapshotRef=`report-${crypto.randomUUID()}`;
  await command(db,user,key,"hrm_report_snapshot_save",requestPayload,snapshotId,[
    ...reportAuthority(db,user,"hrm.reports.manage"),...reportAuthority(db,owner,"hrm.reports.read"),
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND enabled=1 AND legal_entity=? AND version=?)",[report.legal_entity,config.version]),
  ],[
    db.prepare(`INSERT INTO hrm_report_snapshots(id,snapshot_ref,source,schedule_id,schedule_day,legal_entity,period,department,snapshot_json,snapshot_checksum,generated_at,retention_days,retention_basis,expires_on,state,expired_at,created_by,created_at,actor_id)
      VALUES(?,?,'manual',NULL,NULL,?,?,?,?,?,?,?, ?,?,'active',NULL,?,?,?)`).bind(snapshotId,snapshotRef,report.legal_entity,report.period,department,body,checksum,report.generated_at,policy.retention_days,`policy:${policy.policy_ref}`,expiresOn,user.id,completedAt,user.id),
  ]);
  const row=await db.prepare("SELECT snapshot_ref FROM hrm_report_snapshots WHERE id=?").bind(snapshotId).first<{snapshot_ref:string}>();
  if(!row)throw new HrmError("report_snapshot_save_failed",500);return row.snapshot_ref;
}

export async function createReportSchedule(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,input:{cadence:string;department:string|null;policyRef:string}):Promise<void>{
  requirePermission(user,"hrm.reports.manage");live(user);const config=await settings(db);if(!config.legal_entity)throw new HrmError("hrm_entity_unconfigured",409);
  if(!["daily","weekly","monthly"].includes(input.cadence))throw new HrmError("report_schedule_cadence_invalid",400);
  await reportAccount(db,content,user.id,"hrm.reports.manage");
  const cadence=input.cadence as HrmReportCadence,department=departmentValue(input.department);
  const {policy,owner}=await reportPolicyForCapture(db,content,input.policyRef,config.legal_entity,cadence,department),retention=policy.retention_days,basis=`policy:${policy.policy_ref}`;
  const requestPayload={legal_entity:config.legal_entity,department,cadence,policyRef:input.policyRef};if(await replay(db,user,key,"hrm_report_schedule_create",requestPayload))return;
  await buildHrmReportSnapshotForEntity(db,config.legal_entity,{period:localDate().slice(0,7),department});
  const active=(await db.prepare("SELECT COUNT(*) AS count FROM hrm_report_schedules WHERE legal_entity=? AND state='active'").bind(config.legal_entity).first<{count:number}>())?.count??0;
  if(active>=MAX_ACTIVE_REPORT_SCHEDULES)throw new HrmError("report_schedule_limit",409);
  const duplicate=await db.prepare("SELECT 1 FROM hrm_report_schedules WHERE legal_entity=? AND state='active' AND cadence=? AND department IS ? LIMIT 1").bind(config.legal_entity,cadence,department).first();
  if(duplicate)throw new HrmError("report_schedule_duplicate",409);
  const scheduleId=id("hrmsch"),scheduleRef=`schedule-${crypto.randomUUID()}`,time=now();
  await command(db,user,key,"hrm_report_schedule_create",requestPayload,scheduleId,[
    ...reportAuthority(db,user,"hrm.reports.manage"),...reportAuthority(db,owner,"hrm.reports.read"),
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND enabled=1 AND legal_entity=? AND version=?) AND (SELECT COUNT(*) FROM hrm_report_schedules WHERE legal_entity=? AND state='active')<? AND NOT EXISTS(SELECT 1 FROM hrm_report_schedules WHERE legal_entity=? AND state='active' AND cadence=? AND department IS ?)",[config.legal_entity,config.version,config.legal_entity,MAX_ACTIVE_REPORT_SCHEDULES,config.legal_entity,cadence,department]),
  ],[
    db.prepare(`INSERT INTO hrm_report_schedules(id,schedule_ref,legal_entity,department,cadence,retention_days,retention_basis,state,version,created_by,created_at,updated_by,updated_at,actor_id)
      VALUES(?,?,?,?,?,?,?,'active',1,?,?,?,?,?)`).bind(scheduleId,scheduleRef,config.legal_entity,department,cadence,retention,basis,user.id,time,user.id,time,user.id),
  ]);
}

export async function setReportScheduleState(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,scheduleRef:string,version:number,state:"active"|"paused"|"retired"):Promise<void>{
  requirePermission(user,"hrm.reports.manage");live(user);await reportAccount(db,content,user.id,"hrm.reports.manage");const ref=clean(scheduleRef,100),requestPayload={schedule_ref:ref,version,state};if(await replay(db,user,key,"hrm_report_schedule_state",requestPayload))return;const row=await db.prepare("SELECT id,legal_entity,department,cadence,state,version FROM hrm_report_schedules WHERE schedule_ref=?").bind(ref).first<{id:string;legal_entity:string;department:string|null;cadence:string;state:"active"|"paused"|"retired";version:number}>();
  if(!row)throw new HrmError("not_found",404);if(row.version!==version)throw new HrmError("conflict",409);if(row.state==="retired"||row.state===state)throw new HrmError("conflict",409);
  const config=await settings(db),authority=reportAuthority(db,user,"hrm.reports.manage");
  if(row.legal_entity!==config.legal_entity)throw new HrmError("not_found",404);
  if(state==="active"){
    const binding=await db.prepare("SELECT p.policy_ref,s.created_by FROM hrm_report_schedule_policies b JOIN hrm_report_policy_versions p ON p.id=b.policy_id JOIN hrm_report_schedules s ON s.id=b.schedule_id WHERE b.schedule_id=?").bind(row.id).first<{policy_ref:string;created_by:string}>();
    if(!binding)throw new HrmError("report_policy_required",409);
    const {owner}=await reportPolicyForCapture(db,content,binding.policy_ref,row.legal_entity,row.cadence,row.department),creator=await reportAccount(db,content,binding.created_by,"hrm.reports.manage");authority.push(...reportAuthority(db,owner,"hrm.reports.read"),...reportAuthority(db,creator,"hrm.reports.manage"));
    const duplicate=await db.prepare("SELECT 1 FROM hrm_report_schedules WHERE legal_entity=? AND state='active' AND id!=? AND cadence=? AND department IS ? LIMIT 1").bind(row.legal_entity,row.id,row.cadence,row.department).first();
    if(duplicate)throw new HrmError("conflict",409);
    const active=(await db.prepare("SELECT COUNT(*) AS count FROM hrm_report_schedules WHERE legal_entity=? AND state='active'").bind(row.legal_entity).first<{count:number}>())?.count??0;
    if(active>=MAX_ACTIVE_REPORT_SCHEDULES)throw new HrmError("report_schedule_limit",409);
  }
  const time=now(),stateGuard="EXISTS(SELECT 1 FROM hrm_report_schedules WHERE id=? AND schedule_ref=? AND legal_entity=? AND state=? AND version=?) AND EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND enabled=1 AND legal_entity=? AND version=?)"+(state==="active"?" AND (SELECT COUNT(*) FROM hrm_report_schedules WHERE legal_entity=? AND state='active')<?":""),stateGuardParams:(string|number|null)[]=[row.id,ref,row.legal_entity,row.state,version,row.legal_entity,config.version];
  if(state==="active")stateGuardParams.push(row.legal_entity,MAX_ACTIVE_REPORT_SCHEDULES);
  await command(db,user,key,"hrm_report_schedule_state",{schedule_ref:ref,version,state},row.id,[
    ...authority,guardBoolean(db,stateGuard,stateGuardParams),
  ],[
    db.prepare("UPDATE hrm_report_schedules SET state=?,version=version+1,updated_by=?,updated_at=?,actor_id=? WHERE id=? AND version=? AND state=?").bind(state,user.id,time,user.id,row.id,version,row.state),
  ]);
}

export async function runHrmReportScheduleSweep(db:D1Database,content:D1Database,liveFlag:string|undefined,scheduledTime:number):Promise<{created:number;expired:number;skipped:boolean}>{
  const config=await settings(db);if(!enabled(config,liveFlag))return {created:0,expired:0,skipped:true};
  if(!Number.isFinite(scheduledTime)||scheduledTime>Date.now())return {created:0,expired:0,skipped:true};
  const scheduledFor=new Date(scheduledTime).toISOString(),day=new Date(scheduledTime+7*3600000).toISOString().slice(0,10),today=localDate(),expiryTime=now();
  const schedules=(await db.prepare("SELECT id,schedule_ref,legal_entity,department,cadence,retention_days,retention_basis,created_by,version,created_at FROM hrm_report_schedules WHERE state='active' ORDER BY created_at,id").all<ScheduleRow>()).results;
  const configuredSchedules=schedules.filter(schedule=>schedule.legal_entity===config.legal_entity);
  if(configuredSchedules.length>MAX_ACTIVE_REPORT_SCHEDULES){
    const failures=configuredSchedules.map(schedule=>db.prepare("INSERT OR IGNORE INTO hrm_report_schedule_events(schedule_id,event_type,scheduled_on,detail_json,actor_id,created_at) VALUES(?,'run_failed',?,?,?,?)").bind(schedule.id,day,JSON.stringify({error_code:"report_schedule_limit"}),"system:hrm_report_scheduler",expiryTime));
    for(let offset=0;offset<failures.length;offset+=100)await db.batch(failures.slice(offset,offset+100));
    return {created:0,expired:0,skipped:true};
  }
  let expired=0,batches=0;
  while(batches<10){
    const result=await db.prepare(`UPDATE hrm_report_snapshots SET state='expired',snapshot_json='{}',snapshot_checksum=NULL,expired_at=?,actor_id='system:hrm_report_retention'
      WHERE id IN (SELECT s.id FROM hrm_report_snapshots s WHERE s.legal_entity=? AND s.state='active' AND s.expires_on<?
        AND EXISTS(SELECT 1 FROM hrm_report_snapshot_policies b WHERE b.snapshot_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM hrm_report_snapshot_hold_matches h WHERE h.snapshot_id=s.id)
        ORDER BY s.expires_on,s.id LIMIT 100)
      AND EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND enabled=1 AND legal_entity=? AND version=? AND reviewed_by=?)`).bind(expiryTime,config.legal_entity,today,config.legal_entity,config.version,config.reviewed_by).run();
    const changed=Number(result.meta?.changes??0);expired+=changed;batches++;if(changed<100)break;
  }
  const current=await settings(db);if(!enabled(current,liveFlag)||current.version!==config.version)return {created:0,expired,skipped:true};
  let created=0;
  for(const schedule of schedules){
    try{
      if(schedule.legal_entity!==config.legal_entity)throw new HrmError("report_entity_changed",409);
      if(!schedule.retention_basis.startsWith("policy:"))throw new HrmError("report_policy_required",409);
      const {policy,owner}=await reportPolicyForCapture(db,content,schedule.retention_basis.slice(7),schedule.legal_entity,schedule.cadence,schedule.department),creator=await reportAccount(db,content,schedule.created_by,"hrm.reports.manage");
      const cadence=schedule.cadence as HrmReportCadence;
      // Today's due run plus at most one missed occurrence (outage or failed
      // Cron), captured now with its true nominal and actual clocks.
      for(const target of reportCaptureTargets(cadence,day,scheduledTime,schedule.created_at)){const day=target.day,scheduledFor=target.scheduledFor;
      if(await db.prepare("SELECT 1 FROM hrm_report_snapshots WHERE schedule_id=? AND schedule_day=?").bind(schedule.id,day).first())continue;
      const period=reportPeriodForSchedule(cadence,day),generatedAt=now();
      const report=await buildHrmReportSnapshotForEntity(db,schedule.legal_entity,{period,department:schedule.department},generatedAt),body=makeStored(report),checksum=await digest(body),snapshotId=id("hrmrpt"),snapshotRef=`report-${crypto.randomUUID()}`,completedAt=now(),expiresOn=reportExpiryDate(new Date(Date.parse(completedAt)+7*3600000).toISOString().slice(0,10),policy.retention_days);
      await db.batch([
        ...reportAuthority(db,owner,"hrm.reports.read"),...reportAuthority(db,creator,"hrm.reports.manage"),
        db.prepare(`INSERT INTO hrm_report_snapshots(id,snapshot_ref,source,schedule_id,schedule_day,legal_entity,period,department,snapshot_json,snapshot_checksum,generated_at,retention_days,retention_basis,expires_on,state,expired_at,created_by,created_at,actor_id,scheduled_for)
          SELECT ?,?,'scheduled',?,?,?,?,?,?,?,?,?,?,?,'active',NULL,'system:hrm_report_scheduler',?,'system:hrm_report_scheduler',?
          WHERE EXISTS(SELECT 1 FROM hrm_report_schedules WHERE id=? AND legal_entity=? AND version=? AND state='active')
            AND EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND enabled=1 AND legal_entity=? AND version=? AND reviewed_by=?)
          ON CONFLICT(schedule_id,schedule_day) DO NOTHING`).bind(snapshotId,snapshotRef,schedule.id,day,schedule.legal_entity,report.period,schedule.department,body,checksum,generatedAt,policy.retention_days,schedule.retention_basis,expiresOn,completedAt,scheduledFor,schedule.id,schedule.legal_entity,schedule.version,config.legal_entity,config.version,config.reviewed_by),
        db.prepare("DELETE FROM hrm_write_guards"),
      ]);
      if(await db.prepare("SELECT 1 FROM hrm_report_snapshots WHERE id=?").bind(snapshotId).first())created++;
      }
    }catch(error){
      const code=error instanceof HrmError?error.message:"internal_error";
      await db.batch([
        db.prepare("UPDATE hrm_report_schedules SET state='paused',version=version+1,updated_by='system:hrm_report_scheduler',updated_at=?,actor_id='system:hrm_report_scheduler' WHERE id=? AND version=? AND state='active'").bind(now(),schedule.id,schedule.version),
        db.prepare(`INSERT OR IGNORE INTO hrm_report_schedule_events(schedule_id,event_type,scheduled_on,detail_json,actor_id,created_at) VALUES(?,'run_failed',?,?,'system:hrm_report_scheduler',?)`).bind(schedule.id,day,JSON.stringify({error_code:code}),now()),
      ]);
    }
  }
  return {created,expired,skipped:false};
}
interface ScheduleRow {id:string;schedule_ref:string;legal_entity:string;department:string|null;cadence:string;retention_days:number;retention_basis:string;created_by:string;version:number;created_at:string}
