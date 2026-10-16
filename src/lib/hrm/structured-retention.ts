import type { WorkspaceUser } from "../workspace/roles";
import { HrmError, recordKinds, type RecordKind } from "./fields";
import { command, guard, id, localDate, now, requirePermission, settings } from "./service";

export const STRUCTURED_RETENTION_KINDS=recordKinds;
export type StructuredRetentionAnchor="record_created"|"effective_to";
export interface StructuredRetentionRule {kind:RecordKind;retention_days:number|null;retention_anchor:StructuredRetentionAnchor|null;basis:string}
export interface StructuredRetentionPolicy {id:string;legal_entity:string;version_number:number;rules_json:string;state:string;created_by:string;created_at:string;reviewed_by:string|null;reviewed_at:string|null;review_reason:string|null;activated_by:string|null;activated_at:string|null;version:number;actor_id:string;updated_at:string}
export interface StructuredDispositionRequest {id:string;record_id:string;person_id:string;record_kind:RecordKind;record_version:number;policy_version_id:string;policy_version:number;retention_due_on:string;state:string;request_reason:string;requested_by:string;requested_at:string;reviewed_by:string|null;reviewed_at:string|null;review_reason:string|null;completed_by:string|null;completed_at:string|null;completion_detail:string|null;block_reason:string|null;version:number;actor_id:string;created_at:string;updated_at:string;employee_code?:string}
export interface StructuredRetentionRecord {id:string;person_id:string;employee_code:string;kind:RecordKind;state:string;created_at:string;effective_to:string|null;version:number;redacted:number;held:number;live_files:number;pending_changes:number;policy_configured:boolean;retention_due_on:string|null;disposition_state:string|null;disposition_request_id:string|null}
interface DispositionTarget extends StructuredRetentionRecord {data:string;legal_entity:string}

const holdCategory:Record<RecordKind,string>={contact:"personal",personal:"personal",identity:"identity",dependent:"dependent",bank:"banking",tax:"tax"};
const configuredRetentionDays=(value:number|null)=>value===null||Number.isInteger(value)&&value>=1&&value<=36500;
const cleanReason=(reason:string,max=500)=>{const value=reason.trim();if(!value||value.length>max)throw new HrmError("reason_required");return value};
const requireRetention=(user:WorkspaceUser,permission:"hrm.retention.manage"|"hrm.retention.review"|"hrm.retention.activate")=>requirePermission(user,permission);
const requireLive=(user:WorkspaceUser)=>{if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503)};

export function parseStructuredRetentionRules(value:string):StructuredRetentionRule[]{
  let parsed:unknown;try{parsed=JSON.parse(value)}catch{throw new HrmError("structured_retention_policy_invalid")}
  if(!Array.isArray(parsed)||parsed.length!==STRUCTURED_RETENTION_KINDS.length)throw new HrmError("structured_retention_policy_invalid");
  const rules=parsed.map((entry):StructuredRetentionRule=>{
    if(!entry||typeof entry!=="object")throw new HrmError("structured_retention_policy_invalid");
    const row=entry as Record<string,unknown>,keys=Object.keys(row).sort(),kind=row.kind as RecordKind,days=row.retention_days,anchor=row.retention_anchor,basis=typeof row.basis==="string"?row.basis.trim():"";
    if(keys.join(",")!=="basis,kind,retention_anchor,retention_days"||!(STRUCTURED_RETENTION_KINDS as readonly string[]).includes(kind)||!configuredRetentionDays(days as number|null)||!(anchor===null||anchor==="record_created"||anchor==="effective_to")||(days===null&&anchor!==null)||(days!==null&&anchor===null)||!basis||basis.length>1000)throw new HrmError("structured_retention_policy_invalid");
    return {kind,retention_days:days as number|null,retention_anchor:anchor as StructuredRetentionAnchor|null,basis};
  });
  if(new Set(rules.map(rule=>rule.kind)).size!==STRUCTURED_RETENTION_KINDS.length||STRUCTURED_RETENTION_KINDS.some(kind=>!rules.some(rule=>rule.kind===kind)))throw new HrmError("structured_retention_policy_invalid");
  return STRUCTURED_RETENTION_KINDS.map(kind=>rules.find(rule=>rule.kind===kind)!);
}

export function structuredRetentionTemplate():string{return JSON.stringify(STRUCTURED_RETENTION_KINDS.map(kind=>({kind,retention_days:null,retention_anchor:null,basis:""})),null,2)}
export function structuredRetentionDue(record:{created_at:string;effective_to:string|null},rule:StructuredRetentionRule):string|null{
  if(rule.retention_days===null)return null;
  const createdAt=Date.parse(record.created_at);if(rule.retention_anchor==="record_created"&&!Number.isFinite(createdAt))throw new HrmError("retention_file_date_invalid");
  const anchor=rule.retention_anchor==="effective_to"?record.effective_to:rule.retention_anchor==="record_created"?new Date(createdAt+7*3600000).toISOString().slice(0,10):null;
  if(!anchor)return null;
  return new Date(Date.parse(`${anchor}T00:00:00.000Z`)+rule.retention_days*86400000).toISOString().slice(0,10);
}

async function policyForEntity(db:D1Database,entity:string):Promise<StructuredRetentionPolicy|null>{
  const row=await db.prepare("SELECT * FROM hrm_structured_retention_policy_versions WHERE legal_entity=? AND state='active'").bind(entity).first<StructuredRetentionPolicy>();
  if(row)parseStructuredRetentionRules(row.rules_json);return row;
}
async function dispositionTarget(db:D1Database,entity:string,recordId:string):Promise<DispositionTarget|null>{
  return db.prepare(`SELECT r.id,r.person_id,p.employee_code,r.kind,r.data,r.state,r.created_at,r.effective_to,r.version,e.legal_entity,
    CASE WHEN r.data='{}' THEN 1 ELSE 0 END AS redacted,
    CASE WHEN EXISTS(SELECT 1 FROM hrm_legal_holds h WHERE h.state='active' AND ((h.scope_kind='person' AND h.person_id=r.person_id AND h.category IN ('*',CASE r.kind WHEN 'contact' THEN 'personal' WHEN 'bank' THEN 'banking' ELSE r.kind END)) OR (h.scope_kind='file' AND h.source_table='hrm_files' AND h.target_file_id IN (SELECT f.id FROM hrm_files f WHERE f.record_id=r.id))))
      OR EXISTS(SELECT 1 FROM hrm_files f WHERE f.record_id=r.id AND f.legal_hold=1) THEN 1 ELSE 0 END AS held,
    (SELECT COUNT(*) FROM hrm_files f WHERE f.record_id=r.id AND f.object_deleted_at IS NULL) AS live_files,
    (SELECT COUNT(*) FROM hrm_change_requests c WHERE c.record_id=r.id AND c.state='submitted') AS pending_changes,
    (SELECT x.state FROM hrm_structured_disposition_requests x WHERE x.record_id=r.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1) AS disposition_state,
    (SELECT x.id FROM hrm_structured_disposition_requests x WHERE x.record_id=r.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1) AS disposition_request_id
    FROM hrm_records r JOIN hrm_people p ON p.id=r.person_id JOIN hrm_employments e ON e.person_id=p.id
    WHERE r.id=? AND e.legal_entity=? AND e.id=(SELECT ee.id FROM hrm_employments ee WHERE ee.person_id=p.id ORDER BY CASE WHEN ee.status!='ended' THEN 0 ELSE 1 END,ee.started_on DESC,ee.created_at DESC LIMIT 1)`)
    .bind(recordId,entity).first<DispositionTarget>();
}
async function isHeld(db:D1Database,record:DispositionTarget):Promise<boolean>{
  if(record.held===1)return true;
  return !!(await db.prepare(`SELECT 1 FROM hrm_files f LEFT JOIN hrm_legal_holds h ON h.state='active' AND ((h.scope_kind='file' AND h.source_table='hrm_files' AND h.target_file_id=f.id) OR (h.scope_kind='person' AND h.person_id=f.person_id AND h.category IN ('*',CASE f.kind WHEN 'avatar' THEN 'profile_photo' WHEN 'bank' THEN 'banking' ELSE f.kind END))) WHERE f.record_id=? AND (f.legal_hold=1 OR h.id IS NOT NULL) LIMIT 1`).bind(record.id).first());
}
async function hasLiveStructuredFiles(db:D1Database,recordId:string):Promise<boolean>{return !!(await db.prepare("SELECT 1 FROM hrm_files WHERE record_id=? AND object_deleted_at IS NULL LIMIT 1").bind(recordId).first())}
function ruleFor(policy:StructuredRetentionPolicy,kind:RecordKind):StructuredRetentionRule{
  const rule=parseStructuredRetentionRules(policy.rules_json).find(item=>item.kind===kind);if(!rule)throw new HrmError("structured_retention_category_unconfigured",409);return rule;
}
function policyIsActive(db:D1Database,policy:StructuredRetentionPolicy):D1PreparedStatement{return guard(db,"EXISTS(SELECT 1 FROM hrm_structured_retention_policy_versions WHERE id=? AND legal_entity=? AND version_number=? AND state='active')",[policy.id,policy.legal_entity,policy.version_number])}
function noRecordHold(db:D1Database,record:DispositionTarget):D1PreparedStatement{return guard(db,"NOT EXISTS(SELECT 1 FROM hrm_legal_holds WHERE scope_kind='person' AND state='active' AND person_id=? AND category IN (?, '*'))",[record.person_id,holdCategory[record.kind]])}
function noFileHoldForRecord(db:D1Database,recordId:string):D1PreparedStatement{return guard(db,"NOT EXISTS(SELECT 1 FROM hrm_files f WHERE f.record_id=? AND (f.legal_hold=1 OR EXISTS(SELECT 1 FROM hrm_legal_holds h WHERE h.scope_kind='file' AND h.source_table='hrm_files' AND h.target_file_id=f.id AND h.state='active')))",[recordId])}
function noLiveFiles(db:D1Database,recordId:string):D1PreparedStatement{return guard(db,"NOT EXISTS(SELECT 1 FROM hrm_files WHERE record_id=? AND object_deleted_at IS NULL)",[recordId])}
function noPendingChanges(db:D1Database,recordId:string):D1PreparedStatement{return guard(db,"NOT EXISTS(SELECT 1 FROM hrm_change_requests WHERE record_id=? AND state='submitted')",[recordId])}
export async function listStructuredRetentionPolicies(db:D1Database,user:WorkspaceUser):Promise<StructuredRetentionPolicy[]>{
  if(!user.can("hrm.retention.manage")&&!user.can("hrm.retention.review"))throw new HrmError("forbidden",403);
  const config=await settings(db);return (await db.prepare("SELECT * FROM hrm_structured_retention_policy_versions WHERE legal_entity=? ORDER BY version_number DESC LIMIT 100").bind(config.legal_entity).all<StructuredRetentionPolicy>()).results.map(row=>{parseStructuredRetentionRules(row.rules_json);return row});
}

export async function createStructuredRetentionPolicy(db:D1Database,user:WorkspaceUser,key:string,rulesJson:string):Promise<string>{
  requireRetention(user,"hrm.retention.manage");const rules=parseStructuredRetentionRules(rulesJson),config=await settings(db);
  if(!config.legal_entity.trim())throw new HrmError("hrm_entity_unconfigured");
  const latest=await db.prepare("SELECT COALESCE(MAX(version_number),0) AS version_number FROM hrm_structured_retention_policy_versions WHERE legal_entity=?").bind(config.legal_entity).first<{version_number:number}>();
  const versionNumber=(latest?.version_number??0)+1,policyId=id("structured_retention_policy"),time=now(),payload={legalEntity:config.legal_entity,versionNumber,rules};
  await command(db,user,key,"structured_retention_policy_create",payload,policyId,[guard(db,"NOT EXISTS(SELECT 1 FROM hrm_structured_retention_policy_versions WHERE legal_entity=? AND version_number=?)",[config.legal_entity,versionNumber])],[
    db.prepare("INSERT INTO hrm_structured_retention_policy_versions(id,legal_entity,version_number,rules_json,state,created_by,created_at,version,actor_id,updated_at) VALUES(?,?,?,?,'draft',?,?,1,?,?)").bind(policyId,config.legal_entity,versionNumber,JSON.stringify(rules),user.id,time,user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'structured_retention_policy_created',?,?,?)").bind(user.id,policyId,JSON.stringify({legal_entity:config.legal_entity,version_number:versionNumber}),time),
  ]);
  return policyId;
}

export async function reviewStructuredRetentionPolicy(db:D1Database,user:WorkspaceUser,key:string,policyId:string,version:number,approve:boolean,reason:string):Promise<void>{
  requireRetention(user,"hrm.retention.review");const reviewReason=cleanReason(reason),row=await db.prepare("SELECT * FROM hrm_structured_retention_policy_versions WHERE id=?").bind(policyId).first<StructuredRetentionPolicy>();
  if(!row)throw new HrmError("not_found",404);if(row.created_by===user.id)throw new HrmError("self_approval",403);if(row.state!=="draft"||row.version!==version)throw new HrmError("conflict",409);
  const next=approve?"reviewed":"rejected",time=now(),payload={policyId,version,approve,reason:reviewReason};
  await command(db,user,key,"structured_retention_policy_review",payload,policyId,[guard(db,"EXISTS(SELECT 1 FROM hrm_structured_retention_policy_versions WHERE id=? AND version=? AND state='draft' AND created_by!=?)",[policyId,version,user.id])],[
    db.prepare("UPDATE hrm_structured_retention_policy_versions SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='draft'").bind(next,user.id,time,reviewReason,user.id,time,policyId,version),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,?,?,?,?)").bind(user.id,`structured_retention_policy_${next}`,policyId,JSON.stringify({version:row.version_number,reason_recorded:true}),time),
  ]);
}

export async function activateStructuredRetentionPolicy(db:D1Database,user:WorkspaceUser,key:string,policyId:string,version:number):Promise<void>{
  requireRetention(user,"hrm.retention.activate");const row=await db.prepare("SELECT * FROM hrm_structured_retention_policy_versions WHERE id=?").bind(policyId).first<StructuredRetentionPolicy>();
  if(!row)throw new HrmError("not_found",404);if(row.created_by===user.id)throw new HrmError("self_approval",403);if(row.state!=="reviewed"||row.version!==version||!row.reviewed_by)throw new HrmError("retention_policy_review_required",403);
  const payload={policyId,version},time=now(),active=await policyForEntity(db,row.legal_entity);
  if(active&&await db.prepare("SELECT 1 FROM hrm_structured_disposition_requests WHERE policy_version_id=? AND state='executing' LIMIT 1").bind(active.id).first())throw new HrmError("structured_disposition_in_progress",409);
  const writes:D1PreparedStatement[]=[];
  if(active){
    writes.push(db.prepare("UPDATE hrm_structured_retention_policy_versions SET state='retired',version=version+1,actor_id=?,updated_at=? WHERE id=? AND state='active'").bind(user.id,time,active.id));
    writes.push(db.prepare("UPDATE hrm_structured_disposition_requests SET state='blocked',block_reason='Structured retention policy version changed; create a new request under the active policy.',version=version+1,actor_id=?,updated_at=? WHERE policy_version_id=? AND state IN ('pending_review','approved')").bind(user.id,time,active.id));
  }
  writes.push(db.prepare("UPDATE hrm_structured_retention_policy_versions SET state='active',activated_by=?,activated_at=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='reviewed'").bind(user.id,time,user.id,time,policyId,version));
  writes.push(db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'structured_retention_policy_activated',?,?,?)").bind(user.id,policyId,JSON.stringify({legal_entity:row.legal_entity,version_number:row.version_number}),time));
  await command(db,user,key,"structured_retention_policy_activate",payload,policyId,[guard(db,"EXISTS(SELECT 1 FROM hrm_structured_retention_policy_versions WHERE id=? AND version=? AND state='reviewed' AND created_by!=? AND reviewed_by IS NOT NULL)",[policyId,version,user.id]),...(active?[guard(db,"NOT EXISTS(SELECT 1 FROM hrm_structured_disposition_requests WHERE policy_version_id=? AND state='executing')",[active.id])]:[])],writes);
}

export async function listStructuredRetentionRecords(db:D1Database,user:WorkspaceUser):Promise<StructuredRetentionRecord[]>{
  if(!user.can("hrm.retention.manage")&&!user.can("hrm.retention.review"))throw new HrmError("forbidden",403);
  const config=await settings(db),rows=(await db.prepare(`SELECT r.id,r.person_id,p.employee_code,r.kind,r.state,r.created_at,r.effective_to,r.version,
    CASE WHEN r.data='{}' THEN 1 ELSE 0 END AS redacted,
    CASE WHEN EXISTS(SELECT 1 FROM hrm_legal_holds h WHERE h.state='active' AND ((h.scope_kind='person' AND h.person_id=r.person_id AND h.category IN ('*',CASE r.kind WHEN 'contact' THEN 'personal' WHEN 'bank' THEN 'banking' ELSE r.kind END)) OR (h.scope_kind='file' AND h.source_table='hrm_files' AND h.target_file_id IN (SELECT f.id FROM hrm_files f WHERE f.record_id=r.id))))
      OR EXISTS(SELECT 1 FROM hrm_files f WHERE f.record_id=r.id AND f.legal_hold=1) THEN 1 ELSE 0 END AS held,
    (SELECT COUNT(*) FROM hrm_files f WHERE f.record_id=r.id AND f.object_deleted_at IS NULL) AS live_files,
    (SELECT COUNT(*) FROM hrm_change_requests c WHERE c.record_id=r.id AND c.state='submitted') AS pending_changes,
    (SELECT x.state FROM hrm_structured_disposition_requests x WHERE x.record_id=r.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1) AS disposition_state,
    (SELECT x.id FROM hrm_structured_disposition_requests x WHERE x.record_id=r.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1) AS disposition_request_id
    FROM hrm_records r JOIN hrm_people p ON p.id=r.person_id JOIN hrm_employments e ON e.person_id=p.id
    WHERE e.legal_entity=? AND e.id=(SELECT ee.id FROM hrm_employments ee WHERE ee.person_id=p.id ORDER BY CASE WHEN ee.status!='ended' THEN 0 ELSE 1 END,ee.started_on DESC,ee.created_at DESC LIMIT 1)
    ORDER BY p.employee_code,r.kind,r.created_at DESC LIMIT 500`).bind(config.legal_entity).all<StructuredRetentionRecord>()).results;
  const policy=await policyForEntity(db,config.legal_entity),rules=policy?new Map(parseStructuredRetentionRules(policy.rules_json).map(rule=>[rule.kind,rule])):new Map<RecordKind,StructuredRetentionRule>();
  return rows.map(row=>{const rule=rules.get(row.kind);return {...row,policy_configured:!!rule&&rule.retention_days!==null,retention_due_on:rule?structuredRetentionDue(row,rule):null}});
}

export async function listStructuredDispositionRequests(db:D1Database,user:WorkspaceUser):Promise<StructuredDispositionRequest[]>{
  if(!user.can("hrm.retention.manage")&&!user.can("hrm.retention.review"))throw new HrmError("forbidden",403);
  const config=await settings(db);return (await db.prepare(`SELECT r.*,p.employee_code FROM hrm_structured_disposition_requests r JOIN hrm_people p ON p.id=r.person_id JOIN hrm_employments e ON e.person_id=p.id
    WHERE e.legal_entity=? AND e.id=(SELECT ee.id FROM hrm_employments ee WHERE ee.person_id=p.id ORDER BY CASE WHEN ee.status!='ended' THEN 0 ELSE 1 END,ee.started_on DESC,ee.created_at DESC LIMIT 1)
    ORDER BY r.created_at DESC LIMIT 500`).bind(config.legal_entity).all<StructuredDispositionRequest>()).results;
}

export async function createStructuredDispositionRequest(db:D1Database,user:WorkspaceUser,key:string,recordId:string,reason:string):Promise<string>{
  requireRetention(user,"hrm.retention.manage");requireLive(user);const requestReason=cleanReason(reason),config=await settings(db);
  const [record,policy]=await Promise.all([dispositionTarget(db,config.legal_entity,recordId),policyForEntity(db,config.legal_entity)]);
  if(!record)throw new HrmError("not_found",404);if(record.data==="{}")throw new HrmError("structured_record_already_disposed",409);if(!policy)throw new HrmError("structured_retention_policy_missing",409);
  const rule=ruleFor(policy,record.kind);if(rule.retention_days===null)throw new HrmError("structured_retention_manual_review",409);
  const due=structuredRetentionDue(record,rule);if(!due)throw new HrmError("structured_retention_anchor_unavailable",409);if(due>localDate())throw new HrmError("retention_not_due",409);
  if(await isHeld(db,record))throw new HrmError("legal_hold_active",409);if(await hasLiveStructuredFiles(db,record.id))throw new HrmError("structured_record_files_pending",409);
  if(await db.prepare("SELECT 1 FROM hrm_change_requests WHERE record_id=? AND state='submitted' LIMIT 1").bind(record.id).first())throw new HrmError("structured_record_change_pending",409);
  const payload={recordId,recordVersion:record.version,policyId:policy.id,policyVersion:policy.version_number,retentionDueOn:due,reason:requestReason},requestId=id("structured_disposition"),time=now();
  await command(db,user,key,"structured_record_disposition_request",payload,requestId,[
    guard(db,"EXISTS(SELECT 1 FROM hrm_records r WHERE r.id=? AND r.version=? AND r.kind=? AND r.data!='{}')",[record.id,record.version,record.kind]),
    policyIsActive(db,policy),
    guard(db,"NOT EXISTS(SELECT 1 FROM hrm_structured_disposition_requests WHERE record_id=? AND state IN ('pending_review','approved','executing','completed'))",[record.id]),
    noRecordHold(db,record),
    noFileHoldForRecord(db,record.id),
    noLiveFiles(db,record.id),
    noPendingChanges(db,record.id),
  ],[
    db.prepare(`INSERT INTO hrm_structured_disposition_requests(id,record_id,person_id,record_kind,record_version,policy_version_id,policy_version,retention_due_on,state,request_reason,requested_by,requested_at,version,actor_id,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,'pending_review',?,?,?,1,?,?,?)`).bind(requestId,record.id,record.person_id,record.kind,record.version,policy.id,policy.version_number,due,requestReason,user.id,time,user.id,time,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'structured_record_disposition_requested',?,?,?,?)").bind(user.id,record.person_id,requestId,JSON.stringify({record_kind:record.kind,policy_version:policy.version_number,retention_due_on:due}),time),
  ]);
  return requestId;
}

export async function reviewStructuredDispositionRequest(db:D1Database,user:WorkspaceUser,key:string,requestId:string,version:number,approve:boolean,reason:string):Promise<void>{
  requireRetention(user,"hrm.retention.review");requireLive(user);const reviewReason=cleanReason(reason),request=await db.prepare("SELECT * FROM hrm_structured_disposition_requests WHERE id=?").bind(requestId).first<StructuredDispositionRequest>();
  if(!request)throw new HrmError("not_found",404);if(request.requested_by===user.id)throw new HrmError("self_approval",403);if(request.state!=="pending_review"||request.version!==version)throw new HrmError("conflict",409);
  const config=await settings(db),policy=await policyForEntity(db,config.legal_entity),record=await dispositionTarget(db,config.legal_entity,request.record_id);
  if(approve&&(!policy||policy.id!==request.policy_version_id||policy.version_number!==request.policy_version))throw new HrmError("structured_retention_policy_changed",409);
  if(approve&&(!record||record.version!==request.record_version||record.kind!==request.record_kind))throw new HrmError("structured_record_changed",409);
  if(approve&&record&&await isHeld(db,record))throw new HrmError("legal_hold_active",409);if(approve&&await hasLiveStructuredFiles(db,request.record_id))throw new HrmError("structured_record_files_pending",409);
  if(approve&&await db.prepare("SELECT 1 FROM hrm_change_requests WHERE record_id=? AND state='submitted' LIMIT 1").bind(request.record_id).first())throw new HrmError("structured_record_change_pending",409);
  if(approve&&request.retention_due_on>localDate())throw new HrmError("retention_not_due",409);
  const approvalGuards:D1PreparedStatement[]=approve&&policy&&record?[policyIsActive(db,policy),noRecordHold(db,record),noFileHoldForRecord(db,record.id),noLiveFiles(db,record.id),noPendingChanges(db,record.id)]:[];
  const payload={requestId,version,approve,reason:reviewReason},next=approve?"approved":"rejected",time=now();
  await command(db,user,key,"structured_record_disposition_review",payload,requestId,[
    guard(db,"EXISTS(SELECT 1 FROM hrm_structured_disposition_requests WHERE id=? AND version=? AND state='pending_review' AND requested_by!=?)",[requestId,version,user.id]),
    ...approvalGuards,
  ],[
    db.prepare("UPDATE hrm_structured_disposition_requests SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='pending_review'").bind(next,user.id,time,reviewReason,user.id,time,requestId,version),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,`structured_record_disposition_${next}`,request.person_id,requestId,JSON.stringify({record_kind:request.record_kind,reason_recorded:true}),time),
  ]);
}

export async function executeStructuredDispositionRequest(db:D1Database,user:WorkspaceUser,key:string,requestId:string,version:number):Promise<void>{
  if(!user.admin)throw new HrmError("retention_execution_system_admin_only",403);requireLive(user);
  const request=await db.prepare("SELECT * FROM hrm_structured_disposition_requests WHERE id=?").bind(requestId).first<StructuredDispositionRequest>();if(!request)throw new HrmError("not_found",404);
  if(request.state!=="approved"||request.version!==version)throw new HrmError("invalid_transition",409);
  if(!request.reviewed_by||request.reviewed_by===user.id||request.requested_by===user.id)throw new HrmError("retention_executor_must_differ",403);
  const config=await settings(db),policy=await policyForEntity(db,config.legal_entity),record=await dispositionTarget(db,config.legal_entity,request.record_id);
  if(!policy||policy.id!==request.policy_version_id||policy.version_number!==request.policy_version)throw new HrmError("structured_retention_policy_changed",409);
  if(!record||record.version!==request.record_version||record.kind!==request.record_kind)throw new HrmError("structured_record_changed",409);
  if(await isHeld(db,record))throw new HrmError("legal_hold_active",409);if(await hasLiveStructuredFiles(db,request.record_id))throw new HrmError("structured_record_files_pending",409);
  if(await db.prepare("SELECT 1 FROM hrm_change_requests WHERE record_id=? AND state='submitted' LIMIT 1").bind(request.record_id).first())throw new HrmError("structured_record_change_pending",409);
  if(request.retention_due_on>localDate())throw new HrmError("retention_not_due",409);
  const time=now(),payload={requestId,version,recordId:request.record_id,recordVersion:request.record_version,policyVersion:request.policy_version};
  await command(db,user,key,"structured_record_disposition_execute",payload,requestId,[
    guard(db,"EXISTS(SELECT 1 FROM hrm_structured_disposition_requests WHERE id=? AND version=? AND state='approved' AND requested_by!=? AND reviewed_by!=?)",[requestId,version,user.id,user.id]),
    guard(db,"EXISTS(SELECT 1 FROM hrm_records WHERE id=? AND version=? AND kind=? AND data!='{}')",[request.record_id,request.record_version,request.record_kind]),
    policyIsActive(db,policy),noRecordHold(db,record),noFileHoldForRecord(db,record.id),noLiveFiles(db,record.id),noPendingChanges(db,record.id),
  ],[
    db.prepare("UPDATE hrm_structured_disposition_requests SET state='executing',version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='approved'").bind(user.id,time,requestId,version),
    db.prepare("INSERT INTO hrm_structured_disposition_guards(request_id,record_id,valid,actor_id,created_at) VALUES(?,?,1,?,?)").bind(requestId,request.record_id,user.id,time),
    db.prepare("DELETE FROM hrm_record_history WHERE record_id=?").bind(request.record_id),
    db.prepare("UPDATE hrm_change_requests SET data='{}',effective_from=NULL,effective_to=NULL,review_reason=CASE WHEN review_reason IS NULL THEN NULL ELSE 'Redacted by structured-record disposition' END,version=version+1,actor_id=?,updated_at=? WHERE record_id=?").bind(user.id,time,request.record_id),
    db.prepare("UPDATE hrm_records SET data='{}',state='ended',effective_from=NULL,effective_to=NULL,verified_by=NULL,verified_at=NULL,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=?").bind(user.id,time,request.record_id,request.record_version),
    db.prepare("UPDATE hrm_structured_disposition_requests SET state='completed',completed_by=?,completed_at=?,completion_detail='Structured record content redacted; historical snapshots purged; metadata tombstone retained.',version=version+1,actor_id=?,updated_at=? WHERE id=? AND state='executing'").bind(user.id,time,user.id,time,requestId),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'structured_record_disposition_completed',?,?,?,?)").bind(user.id,request.person_id,requestId,JSON.stringify({record_kind:request.record_kind,policy_version:request.policy_version}),time),
    db.prepare("DELETE FROM hrm_structured_disposition_guards WHERE request_id=?").bind(requestId),
  ]);
}
