import type { WorkspaceUser } from "../workspace/roles";
import { membersWithRoles } from "../workspace/members";
import { HrmError, date } from "./fields";
import { audit, command, digest, guardBoolean, id, localDate, now, requirePermission } from "./service";

export const HRM_ASSET_TYPES=["computer","phone","monitor","accessory","key","other"] as const;
export type HrmAssetType=typeof HRM_ASSET_TYPES[number];
export type HrmAssetState="available"|"offered"|"assigned"|"return_requested"|"inspection"|"retired"|"lost";
export type HrmAssetAssignmentState="offered"|"assigned"|"return_requested"|"returned"|"cancelled";
type AssetAction="accept"|"request_return"|"report_handover"|"cancel_return"|"cancel_offer"|"confirm_return";
type ReturnCondition="good"|"damaged"|"missing";

export interface HrmAssetRow {
  id:string;asset_tag:string;asset_type:HrmAssetType;description:string;serial_number:string;legal_entity:string;location:string;state:HrmAssetState;version:number;created_at:string;updated_at:string;
  assignment_id:string|null;assignment_state:HrmAssetAssignmentState|null;person_id:string|null;employee_code:string|null;display_name:string|null;expected_return_on:string|null;issued_condition:string|null;assignment_version:number|null;offered_at:string|null;accepted_at:string|null;return_requested_by:string|null;return_requested_at:string|null;employee_handover_at:string|null;returned_at:string|null;return_condition:ReturnCondition|null;offer_reason:string|null;return_note:string|null;
}
export interface MyHrmAssetRow {
  assignment_id:string;asset_id:string;asset_tag:string;asset_type:HrmAssetType;description:string;legal_entity:string;location:string;asset_state:HrmAssetState;assignment_state:HrmAssetAssignmentState;expected_return_on:string|null;issued_condition:string;offer_reason:string;offered_at:string;accepted_at:string|null;return_requested_by:string|null;return_requested_at:string|null;employee_handover_at:string|null;returned_at:string|null;return_condition:ReturnCondition|null;return_note:string;version:number;
}
export interface HrmAssetEvent {id:string;asset_id:string;assignment_id:string|null;person_id:string|null;action:string;detail_json:string;actor_id:string;created_at:string}
export interface HrmAssetPerson {id:string;employee_code:string;display_name:string;legal_entity:string;department:string;job_title:string;user_id:string}

const live=(user:WorkspaceUser)=>{if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503)};
const clean=(value:string,max:number,required=true)=>{const result=value.trim();if(result.length>max||(required&&!result))throw new HrmError("invalid_field");return result};
function assetType(value:string):HrmAssetType{if(!(HRM_ASSET_TYPES as readonly string[]).includes(value))throw new HrmError("asset_type_invalid");return value as HrmAssetType}
function returnCondition(value:string):ReturnCondition{if(value!=="good"&&value!=="damaged"&&value!=="missing")throw new HrmError("asset_return_condition_invalid");return value}
async function replay(db:D1Database,user:WorkspaceUser,key:string,operation:string,payload:unknown):Promise<string|null>{
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new HrmError("invalid_request_key");
  const row=await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string;result_id:string}>();
  if(!row)return null;
  if(row.operation!==operation||row.payload_hash!==await digest(JSON.stringify(payload)))throw new HrmError("request_key_conflict",409);
  return row.result_id;
}

export async function listManagedAssets(db:D1Database,user:WorkspaceUser):Promise<HrmAssetRow[]>{
  requirePermission(user,"hrm.assets.manage");live(user);
  const rows=(await db.prepare(`SELECT a.*,x.id AS assignment_id,x.state AS assignment_state,x.person_id,p.employee_code,
      COALESCE(NULLIF(p.preferred_name,''),p.legal_name) AS display_name,x.expected_return_on,x.issued_condition,
      x.version AS assignment_version,x.offered_at,x.accepted_at,x.return_requested_by,x.return_requested_at,x.employee_handover_at,x.returned_at,x.return_condition,x.offer_reason,x.return_note
    FROM hrm_assets a LEFT JOIN hrm_asset_assignments x ON x.asset_id=a.id AND x.state IN ('offered','assigned','return_requested')
    LEFT JOIN hrm_people p ON p.id=x.person_id
    ORDER BY CASE a.state WHEN 'offered' THEN 0 WHEN 'return_requested' THEN 1 WHEN 'assigned' THEN 2 ELSE 3 END,a.asset_tag LIMIT 250`)
    .all<HrmAssetRow>()).results;
  await audit(db,user,"hrm_assets_listed",null,"assets",{count:rows.length});return rows;
}

export async function listAssignablePeople(db:D1Database,contentDb:D1Database,user:WorkspaceUser):Promise<HrmAssetPerson[]>{
  requirePermission(user,"hrm.assets.manage");live(user);
  const members=await membersWithRoles(db,contentDb,["employee"]),ids=members.map(member=>member.user_id);
  if(!ids.length)return [];
  const today=localDate(),marks=ids.map(()=>"?").join(",");
  const people=(await db.prepare(`SELECT p.id,p.employee_code,COALESCE(NULLIF(p.preferred_name,''),p.legal_name) AS display_name,e.legal_entity,e.department,e.job_title,p.user_id
    FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id AND e.id=(SELECT e2.id FROM hrm_employments e2 WHERE e2.person_id=p.id ORDER BY CASE WHEN e2.status!='ended' THEN 0 ELSE 1 END,e2.started_on DESC,e2.created_at DESC LIMIT 1)
    WHERE p.user_id IN (${marks}) AND e.status IN ('probation','active','notice') AND (e.started_on IS NULL OR e.started_on<=?) AND (e.ended_on IS NULL OR e.ended_on>?)
    ORDER BY e.legal_entity,p.employee_code LIMIT 500`).bind(...ids,today,today).all<HrmAssetPerson>()).results;
  await audit(db,user,"hrm_asset_assignable_people_listed",null,"assets",{count:people.length});return people;
}

export async function listMyAssets(db:D1Database,user:WorkspaceUser):Promise<MyHrmAssetRow[]>{
  requirePermission(user,"hrm.assets.self");live(user);
  const rows=(await db.prepare(`SELECT x.id AS assignment_id,x.asset_id,a.asset_tag,a.asset_type,a.description,a.legal_entity,a.location,a.state AS asset_state,
      x.state AS assignment_state,x.expected_return_on,x.issued_condition,x.offer_reason,x.offered_at,x.accepted_at,x.return_requested_by,x.return_requested_at,x.employee_handover_at,x.returned_at,x.return_condition,x.return_note,x.version
    FROM hrm_asset_assignments x JOIN hrm_assets a ON a.id=x.asset_id JOIN hrm_people p ON p.id=x.person_id
    WHERE p.user_id=? AND x.state IN ('offered','assigned','return_requested','returned','cancelled') ORDER BY CASE x.state WHEN 'offered' THEN 0 WHEN 'return_requested' THEN 1 WHEN 'assigned' THEN 2 ELSE 3 END,x.updated_at DESC LIMIT 100`)
    .bind(user.id).all<MyHrmAssetRow>()).results;
  await audit(db,user,"hrm_my_assets_listed",null,user.id,{count:rows.length});return rows;
}

export async function createAsset(db:D1Database,user:WorkspaceUser,key:string,input:{asset_tag:string;asset_type:string;description:string;serial_number:string;location:string;legal_entity:string}):Promise<string>{
  requirePermission(user,"hrm.assets.manage");live(user);
  const tag=clean(input.asset_tag,48).toUpperCase(),type=assetType(input.asset_type),description=clean(input.description,240),serial=clean(input.serial_number,120,false),location=clean(input.location,160,false),legalEntity=clean(input.legal_entity,200);
  if(!/^[A-Z0-9][A-Z0-9._-]{1,47}$/.test(tag))throw new HrmError("asset_tag_invalid");
  const payload={tag,type,description,serial,location,legalEntity},prior=await replay(db,user,key,"hrm_asset_create",payload);if(prior)return prior;
  const settings=await db.prepare("SELECT legal_entity FROM hrm_settings WHERE id=1").first<{legal_entity:string|null}>();
  if(!settings?.legal_entity||settings.legal_entity!==legalEntity)throw new HrmError("hrm_entity_unconfigured",409);
  const assetId=id("asset"),time=now();
  return command(db,user,key,"hrm_asset_create",payload,assetId,[
    guardBoolean(db,"NOT EXISTS(SELECT 1 FROM hrm_assets WHERE asset_tag=?)",[tag]),
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND legal_entity=?)",[legalEntity]),
  ],[
    db.prepare("INSERT INTO hrm_assets(id,asset_tag,asset_type,description,serial_number,legal_entity,location,state,version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,'available',1,?,?,?,?)").bind(assetId,tag,type,description,serial,legalEntity,location,user.id,time,user.id,time),
    db.prepare("INSERT INTO hrm_asset_events(id,asset_id,action,detail_json,actor_id,created_at) VALUES(?,?,'registered',?,?,?)").bind(id("assetev"),assetId,JSON.stringify({asset_tag:tag,asset_type:type,legal_entity:legalEntity}),user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'hrm_asset_registered',?,?,?)").bind(user.id,assetId,JSON.stringify({asset_tag:tag,asset_type:type,legal_entity:legalEntity}),time),
  ]);
}

export async function offerAsset(db:D1Database,contentDb:D1Database,user:WorkspaceUser,key:string,input:{assetId:string;assetVersion:number;personId:string;expectedReturnOn:string;issuedCondition:string;reason:string}):Promise<string>{
  requirePermission(user,"hrm.assets.manage");live(user);
  const expectedReturn=date(input.expectedReturnOn),condition=input.issuedCondition;
  if(condition!=="good"&&condition!=="damaged")throw new HrmError("asset_condition_invalid");
  const reason=clean(input.reason,500),payload={assetId:input.assetId,assetVersion:input.assetVersion,personId:input.personId,expectedReturnOn:expectedReturn,issuedCondition:condition,reason};
  const prior=await replay(db,user,key,"hrm_asset_offer",payload);if(prior)return prior;
  const asset=await db.prepare("SELECT id,asset_tag,legal_entity,state,version FROM hrm_assets WHERE id=?").bind(input.assetId).first<{id:string;asset_tag:string;legal_entity:string;state:HrmAssetState;version:number}>();
  if(!asset)throw new HrmError("not_found",404);
  if(asset.state!=="available"||asset.version!==input.assetVersion)throw new HrmError("conflict",409);
  const today=localDate();if(expectedReturn&&expectedReturn<today)throw new HrmError("asset_return_date_invalid");
  const members=await membersWithRoles(db,contentDb,["employee"]);
  const person=await db.prepare(`SELECT p.id,p.user_id,e.id AS employment_id,e.legal_entity,e.status,e.started_on,e.ended_on
    FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id AND e.id=(SELECT e2.id FROM hrm_employments e2 WHERE e2.person_id=p.id ORDER BY CASE WHEN e2.status!='ended' THEN 0 ELSE 1 END,e2.started_on DESC,e2.created_at DESC LIMIT 1)
    WHERE p.id=?`).bind(input.personId).first<{id:string;user_id:string|null;employment_id:string;legal_entity:string;status:string;started_on:string|null;ended_on:string|null}>();
  if(!person||!person.user_id||!members.some(member=>member.user_id===person.user_id)||!("probation active notice".split(" ").includes(person.status))||(person.ended_on&&person.ended_on<=today)||(person.started_on&&person.started_on>today)||person.legal_entity!==asset.legal_entity)throw new HrmError("asset_employee_invalid",409);
  if(person.user_id===user.id)throw new HrmError("asset_self_assignment",403);
  const assignmentId=id("asset_assignment"),time=now();
  return command(db,user,key,"hrm_asset_offer",payload,assignmentId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_assets WHERE id=? AND version=? AND state='available' AND legal_entity=?)",[asset.id,input.assetVersion,asset.legal_entity]),
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id WHERE p.id=? AND p.user_id=? AND e.id=? AND e.legal_entity=? AND e.status IN ('probation','active','notice') AND (e.started_on IS NULL OR e.started_on<=?) AND (e.ended_on IS NULL OR e.ended_on>?))",[person.id,person.user_id,person.employment_id,asset.legal_entity,today,today]),
    guardBoolean(db,"EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role='employee')",[person.user_id]),
    guardBoolean(db,"NOT EXISTS(SELECT 1 FROM hrm_asset_assignments WHERE asset_id=? AND state IN ('offered','assigned','return_requested'))",[asset.id]),
  ],[
    db.prepare("INSERT INTO hrm_asset_assignments(id,asset_id,person_id,employment_id,state,expected_return_on,issued_condition,offer_reason,offered_by,offered_at,version,actor_id,created_at,updated_at) VALUES(?,?,?,?, 'offered',?,?,?,?,?,1,?,?,?)").bind(assignmentId,asset.id,person.id,person.employment_id,expectedReturn,condition,reason,user.id,time,user.id,time,time),
    db.prepare("UPDATE hrm_assets SET state='offered',version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=? AND state='available'").bind(user.id,time,asset.id,input.assetVersion),
    db.prepare("INSERT INTO hrm_asset_events(id,asset_id,assignment_id,person_id,action,detail_json,actor_id,created_at) VALUES(?,?,?,?,'offered',?,?,?)").bind(id("assetev"),asset.id,assignmentId,person.id,JSON.stringify({expected_return_on:expectedReturn,issued_condition:condition,reason}),user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'hrm_asset_offered',?,?,?,?)").bind(user.id,person.id,assignmentId,JSON.stringify({asset_id:asset.id,asset_tag:asset.asset_tag}),time),
  ]);
}

export async function transitionAsset(db:D1Database,user:WorkspaceUser,key:string,assignmentId:string,expectedVersion:number,input:{action:AssetAction;reason:string;condition?:string}):Promise<void>{
  live(user);
  const row=await db.prepare(`SELECT x.*,a.asset_tag,a.state AS asset_state,a.version AS asset_version,a.legal_entity,p.user_id AS employee_user_id
    FROM hrm_asset_assignments x JOIN hrm_assets a ON a.id=x.asset_id JOIN hrm_people p ON p.id=x.person_id WHERE x.id=?`).bind(assignmentId)
    .first<{id:string;asset_id:string;person_id:string;employment_id:string;state:HrmAssetAssignmentState;expected_return_on:string|null;issued_condition:string;return_condition:ReturnCondition|null;offer_reason:string;return_note:string;offered_by:string;offered_at:string;accepted_by:string|null;accepted_at:string|null;return_requested_by:string|null;return_requested_at:string|null;employee_handover_by:string|null;employee_handover_at:string|null;returned_by:string|null;returned_at:string|null;version:number;asset_tag:string;asset_state:HrmAssetState;asset_version:number;legal_entity:string;employee_user_id:string|null}>();
  if(!row)throw new HrmError("not_found",404);
  const isEmployee=user.can("hrm.assets.self")&&row.employee_user_id===user.id,manage=user.can("hrm.assets.manage");
  const action=input.action;
  if(action==="accept"||action==="report_handover"){
    if(!isEmployee)throw new HrmError("not_found",404);
    if(action==="accept"&&row.offered_by===user.id)throw new HrmError("asset_self_assignment",403);
  }else if(action==="request_return"||action==="cancel_return"){
    if(!isEmployee&&!manage)throw new HrmError("not_found",404);
    if(action==="cancel_return"&&isEmployee&&row.return_requested_by!==user.id)throw new HrmError("forbidden",403);
  }else if(!manage){if(!isEmployee)throw new HrmError("not_found",404);throw new HrmError("forbidden",403)}
  const reason=clean(input.reason,500),condition=action==="confirm_return"?returnCondition(input.condition??""):null;
  const payload={assignmentId,expectedVersion,action,reason,condition},prior=await replay(db,user,key,"hrm_asset_transition",payload);if(prior)return;
  const allowed:Record<AssetAction,HrmAssetAssignmentState[]>={accept:["offered"],request_return:["assigned"],report_handover:["return_requested"],cancel_return:["return_requested"],cancel_offer:["offered"],confirm_return:["return_requested"]};
  if(row.version!==expectedVersion||!allowed[action].includes(row.state))throw new HrmError("conflict",409);
  if(action==="report_handover"&&row.employee_handover_at)throw new HrmError("asset_handover_already_reported",409);
  if(action==="cancel_return"&&row.employee_handover_at)throw new HrmError("asset_handover_already_reported",409);
  let nextAssignment:HrmAssetAssignmentState=row.state,nextAsset=row.asset_state,event:string=action;
  if(action==="accept"){nextAssignment="assigned";nextAsset="assigned";event="accepted"}
  else if(action==="request_return"){nextAssignment="return_requested";nextAsset="return_requested";event="return_requested"}
  else if(action==="report_handover"){event="handover_reported"}
  else if(action==="cancel_return"){nextAssignment="assigned";nextAsset="assigned";event="return_cancelled"}
  else if(action==="cancel_offer"){nextAssignment="cancelled";nextAsset="available";event="offer_cancelled"}
  else if(action==="confirm_return"){nextAssignment="returned";nextAsset=condition==="good"?"available":condition==="damaged"?"inspection":"lost";event=condition==="missing"?"marked_lost":condition==="damaged"?"inspection_required":"returned"}
  const time=now(),writes=[] as D1PreparedStatement[];
  if(action==="report_handover")writes.push(db.prepare("UPDATE hrm_asset_assignments SET employee_handover_by=?,employee_handover_at=?,return_note=?,version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='return_requested'").bind(user.id,time,reason,user.id,time,row.id,expectedVersion));
  else{
    writes.push(db.prepare(`UPDATE hrm_asset_assignments SET state=?,${action==="accept"?"accepted_by=?,accepted_at=?,":""}${action==="request_return"?"return_requested_by=?,return_requested_at=?,return_note=?,":""}${action==="cancel_return"?"return_requested_by=NULL,return_requested_at=NULL,employee_handover_by=NULL,employee_handover_at=NULL,return_note=?,":""}${action==="confirm_return"?"return_condition=?,return_note=?,returned_by=?,returned_at=?,":""}version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state=?`)
      .bind(...(action==="accept"?[nextAssignment,user.id,time]:action==="request_return"?[nextAssignment,user.id,time,reason]:action==="cancel_return"?[nextAssignment,reason]:action==="confirm_return"?[nextAssignment,condition,reason,user.id,time]:[nextAssignment]),user.id,time,row.id,expectedVersion,row.state));
    writes.push(db.prepare("UPDATE hrm_assets SET state=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=? AND state=?").bind(nextAsset,user.id,time,row.asset_id,row.asset_version,row.asset_state));
  }
  writes.push(
    db.prepare("INSERT INTO hrm_asset_events(id,asset_id,assignment_id,person_id,action,detail_json,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id("assetev"),row.asset_id,row.id,row.person_id,event,JSON.stringify({reason,condition,assignment_state:nextAssignment,asset_state:nextAsset}),user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,`hrm_asset_${event}`,row.person_id,row.id,JSON.stringify({asset_id:row.asset_id,reason,condition}),time),
  );
  await command(db,user,key,"hrm_asset_transition",payload,row.id,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_asset_assignments x JOIN hrm_assets a ON a.id=x.asset_id WHERE x.id=? AND x.version=? AND x.state=? AND a.version=? AND a.state=? AND a.id=?)",[row.id,expectedVersion,row.state,row.asset_version,row.asset_state,row.asset_id]),
    ...(isEmployee?[guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_asset_assignments x JOIN hrm_people p ON p.id=x.person_id JOIN workspace_members m ON m.user_id=p.user_id AND m.enabled=1 JOIN workspace_roles r ON r.user_id=m.user_id WHERE x.id=? AND p.user_id=? AND r.role='employee')",[row.id,user.id])]:[guardBoolean(db,"?=1 OR EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role IN ('hrm_officer','hrm_admin'))",[user.admin?1:0,user.id])]),
  ],[...writes,db.prepare("DELETE FROM hrm_write_guards")]);
}

export async function clearAssetInspection(db:D1Database,user:WorkspaceUser,key:string,assetId:string,version:number,reason:string):Promise<void>{
  requirePermission(user,"hrm.assets.manage");live(user);const cleanReason=clean(reason,500),payload={assetId,version,reason:cleanReason},prior=await replay(db,user,key,"hrm_asset_inspection_clear",payload);if(prior)return;
  if(!await db.prepare("SELECT 1 FROM hrm_assets WHERE id=? AND version=? AND state='inspection'").bind(assetId,version).first())throw new HrmError("conflict",409);
  const time=now();await command(db,user,key,"hrm_asset_inspection_clear",payload,assetId,[guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_assets WHERE id=? AND version=? AND state='inspection')",[assetId,version])],[
    db.prepare("UPDATE hrm_assets SET state='available',version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=? AND state='inspection'").bind(user.id,time,assetId,version),
    db.prepare("INSERT INTO hrm_asset_events(id,asset_id,action,detail_json,actor_id,created_at) VALUES(?,?,'inspection_cleared',?,?,?)").bind(id("assetev"),assetId,JSON.stringify({reason:cleanReason}),user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'hrm_asset_inspection_cleared',?,?,?)").bind(user.id,assetId,JSON.stringify({reason_recorded:true}),time),
  ]);
}

export async function retireAsset(db:D1Database,user:WorkspaceUser,key:string,assetId:string,version:number,reason:string):Promise<void>{
  requirePermission(user,"hrm.assets.manage");live(user);const cleanReason=clean(reason,500),payload={assetId,version,reason:cleanReason},prior=await replay(db,user,key,"hrm_asset_retire",payload);if(prior)return;
  const asset=await db.prepare("SELECT id,state,version FROM hrm_assets WHERE id=?").bind(assetId).first<{id:string;state:HrmAssetState;version:number}>();if(!asset)throw new HrmError("not_found",404);
  if(asset.version!==version||!(["available","inspection","lost"].includes(asset.state)))throw new HrmError("conflict",409);
  const time=now();await command(db,user,key,"hrm_asset_retire",payload,asset.id,[guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_assets WHERE id=? AND version=? AND state IN ('available','inspection','lost'))",[asset.id,version])],[
    db.prepare("UPDATE hrm_assets SET state='retired',version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=?").bind(user.id,time,asset.id,version),
    db.prepare("INSERT INTO hrm_asset_events(id,asset_id,action,detail_json,actor_id,created_at) VALUES(?,?,'retired',?,?,?)").bind(id("assetev"),asset.id,JSON.stringify({reason:cleanReason}),user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'hrm_asset_retired',?,?,?)").bind(user.id,asset.id,JSON.stringify({reason_recorded:true}),time),
  ]);
}

export async function assetEvents(db:D1Database,user:WorkspaceUser,assetId:string):Promise<HrmAssetEvent[]>{
  requirePermission(user,"hrm.assets.manage");live(user);
  if(!await db.prepare("SELECT 1 FROM hrm_assets WHERE id=?").bind(assetId).first())throw new HrmError("not_found",404);
  const events=(await db.prepare("SELECT id,asset_id,assignment_id,person_id,action,detail_json,actor_id,created_at FROM hrm_asset_events WHERE asset_id=? ORDER BY created_at,id LIMIT 100").bind(assetId).all<HrmAssetEvent>()).results;
  await audit(db,user,"hrm_asset_history_read",null,assetId,{count:events.length});return events;
}
