import type { WorkspaceUser } from "../workspace/roles";
import { membersWithRoles } from "../workspace/members";
import { HrmError } from "./fields";
import { audit, command, digest, guardBoolean, id, now, requirePermission } from "./service";

export const SERVICE_REQUEST_TYPES = ["employment_confirmation", "profile_support", "policy_question", "benefit_question", "asset_return", "training_question", "reimbursement", "sensitive_complaint", "other"] as const;
export type ServiceRequestType = typeof SERVICE_REQUEST_TYPES[number];
export type ServiceState = "submitted" | "triaged" | "in_progress" | "answered" | "resolved" | "reopened" | "cancelled";

export interface ServiceRequest {
  id: string; person_id: string; employment_id: string; request_type: ServiceRequestType; subject: string;
  state: ServiceState; sensitivity: "standard" | "restricted"; assigned_to_user_id: string | null;
  due_on: string | null; version: number; created_by: string; created_at: string; updated_by: string; updated_at: string;
}
export interface ServiceRequestView extends ServiceRequest { employee_code: string; display_name: string; latest_event?: string; latest_event_at?: string }
export interface ServiceEvent { id: string; request_id: string; event_type: string; visibility: "employee" | "hr_only"; body: string; actor_id: string; created_at: string }
export interface HrNotification { id: string; recipient_user_id: string; request_id: string; outbox_id: string; event_key: string; event_type: string; href: string; state: "unread" | "read"; version: number; created_at: string; read_at: string | null }
export interface OutboxFailure { id: string; request_id: string; recipient_user_id: string; event_key: string; event_type: string; attempts: number; last_error_code: string | null; created_at: string }

const live = (user: WorkspaceUser) => { if (user.hrmEnabled !== true) throw new HrmError("hrm_closed", 503); };
const clean = (value: string, max: number, required = true) => {
  const result = value.trim();
  if (result.length > max || (required && !result)) throw new HrmError("invalid_field");
  return result;
};

async function hrRecipients(db: D1Database, contentDb: D1Database, omitUserId: string): Promise<string[]> {
  return (await membersWithRoles(db, contentDb, ["hrm_officer", "hrm_admin"]))
    .map(member => member.user_id).filter(userId => userId !== omitUserId);
}

function outboxWrites(db: D1Database, requestId: string, eventType: "request_created" | "request_assigned" | "request_updated", href: string, recipients: string[], time: string): D1PreparedStatement[] {
  return recipients.map(recipient => {
    const eventKey = `hrreq:${requestId}:${eventType}:${recipient}`;
    return db.prepare("INSERT INTO hrm_notification_outbox(id,recipient_user_id,request_id,event_key,event_type,href,state,attempts,created_at,updated_at) VALUES(?,?,?,?,?,?,'queued',0,?,?) ON CONFLICT(recipient_user_id,event_key) DO NOTHING").bind(id("hroutbox"), recipient, requestId, eventKey, eventType, href, time, time);
  });
}

async function requestPerson(db: D1Database, user: WorkspaceUser): Promise<{person_id:string;employment_id:string}> {
  const row = await db.prepare("SELECT p.id AS person_id,e.id AS employment_id FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id AND e.id=(SELECT e2.id FROM hrm_employments e2 WHERE e2.person_id=p.id ORDER BY CASE WHEN e2.status!='ended' THEN 0 ELSE 1 END,e2.started_on DESC,e2.created_at DESC LIMIT 1) WHERE p.user_id=? AND e.status!='ended' AND (e.ended_on IS NULL OR e.ended_on>date('now','+7 hours')) LIMIT 1").bind(user.id).first<{person_id:string;employment_id:string}>();
  if (!row) throw new HrmError("not_found",404);
  return row;
}

export async function createServiceRequest(db:D1Database,contentDb:D1Database,user:WorkspaceUser,key:string,input:{request_type:string;subject:string;body:string}):Promise<string>{
  requirePermission(user,"hrm.services.self");live(user);
  if(!(SERVICE_REQUEST_TYPES as readonly string[]).includes(input.request_type))throw new HrmError("service_request_type_invalid");
  const requestType=input.request_type as ServiceRequestType,subject=clean(input.subject,120),body=clean(input.body,3000),person=await requestPerson(db,user);
  const restricted=requestType==="sensitive_complaint",requestId=id("hrrequest"),eventId=id("hrev"),time=now();
  const recipients=await hrRecipients(db,contentDb,user.id);
  const payload={person_id:person.person_id,employment_id:person.employment_id,request_type:requestType,subject,sensitivity:restricted?"restricted":"standard",body};
  return command(db,user,key,"hr_service_request_create",payload,requestId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id WHERE p.id=? AND p.user_id=? AND e.id=? AND e.status!='ended' AND (e.ended_on IS NULL OR e.ended_on>date('now','+7 hours')))",[person.person_id,user.id,person.employment_id]),
  ],[
    db.prepare("INSERT INTO hrm_service_requests(id,person_id,employment_id,request_type,subject,state,sensitivity,version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,'submitted',?,1,?,?,?,?)").bind(requestId,person.person_id,person.employment_id,requestType,subject,restricted?"restricted":"standard",user.id,time,user.id,time),
    db.prepare("INSERT INTO hrm_service_request_events(id,request_id,event_type,visibility,body,actor_id,created_at) VALUES(?,?,'submitted','employee',?,?,?)").bind(eventId,requestId,body,user.id,time),
    ...outboxWrites(db,requestId,"request_created",`/hrm/requests?request=${encodeURIComponent(requestId)}`,recipients,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'hr_service_request_submitted',?,?,?,?)").bind(user.id,person.person_id,requestId,JSON.stringify({request_type:requestType,sensitivity:restricted?"restricted":"standard"}),time),
  ]);
}

export async function listMyServiceRequests(db:D1Database,user:WorkspaceUser):Promise<ServiceRequestView[]>{
  requirePermission(user,"hrm.services.self");live(user);
  return (await db.prepare(`SELECT r.*,p.employee_code,COALESCE(NULLIF(p.preferred_name,''),'Employee') AS display_name,
    (SELECT event_type FROM hrm_service_request_events e WHERE e.request_id=r.id AND e.visibility='employee' ORDER BY e.created_at DESC,e.id DESC LIMIT 1) AS latest_event,
    (SELECT created_at FROM hrm_service_request_events e WHERE e.request_id=r.id AND e.visibility='employee' ORDER BY e.created_at DESC,e.id DESC LIMIT 1) AS latest_event_at
    FROM hrm_service_requests r JOIN hrm_people p ON p.id=r.person_id WHERE p.user_id=? ORDER BY r.updated_at DESC LIMIT 100`).bind(user.id).all<ServiceRequestView>()).results;
}

export async function listManagedServiceRequests(db:D1Database,user:WorkspaceUser):Promise<ServiceRequestView[]>{
  requirePermission(user,"hrm.services.manage");live(user);
  return (await db.prepare(`SELECT r.*,p.employee_code,COALESCE(NULLIF(p.preferred_name,''),p.legal_name) AS display_name,
    (SELECT event_type FROM hrm_service_request_events e WHERE e.request_id=r.id ORDER BY e.created_at DESC,e.id DESC LIMIT 1) AS latest_event,
    (SELECT created_at FROM hrm_service_request_events e WHERE e.request_id=r.id ORDER BY e.created_at DESC,e.id DESC LIMIT 1) AS latest_event_at
    FROM hrm_service_requests r JOIN hrm_people p ON p.id=r.person_id ORDER BY CASE WHEN r.state IN ('submitted','reopened') THEN 0 ELSE 1 END,r.updated_at DESC LIMIT 200`).all<ServiceRequestView>()).results;
}

export async function serviceRequestDetail(db:D1Database,user:WorkspaceUser,requestId:string){
  const manage=user.can("hrm.services.manage");
  if(manage)live(user);else{requirePermission(user,"hrm.services.self");live(user);}
  const row=await db.prepare(`SELECT r.*,p.user_id,p.employee_code,COALESCE(NULLIF(p.preferred_name,''),p.legal_name) AS display_name
    FROM hrm_service_requests r JOIN hrm_people p ON p.id=r.person_id WHERE r.id=? ${manage?"":"AND p.user_id=?"}`).bind(...(manage?[requestId]:[requestId,user.id])).first<ServiceRequestView&{user_id:string}>();
  if(!row)throw new HrmError("not_found",404);
  if(!manage&&row.sensitivity==="restricted"&&row.user_id!==user.id)throw new HrmError("not_found",404);
  const events=await db.prepare("SELECT * FROM hrm_service_request_events WHERE request_id=? AND (?=1 OR visibility='employee') ORDER BY created_at,id LIMIT 200").bind(requestId,manage?1:0).all<ServiceEvent>();
  await audit(db,user,"hr_service_request_read",row.person_id,row.id,{state:row.state,sensitivity:row.sensitivity,event_count:events.results.length});
  return {request:row,events:events.results};
}

export async function transitionServiceRequest(db:D1Database,contentDb:D1Database,user:WorkspaceUser,key:string,requestId:string,expectedVersion:number,input:{action:string;body:string;assignTo?:string}):Promise<void>{
  const row=await db.prepare("SELECT * FROM hrm_service_requests WHERE id=?").bind(requestId).first<ServiceRequest>();if(!row)throw new HrmError("not_found",404);
  const body=clean(input.body,3000),management=user.can("hrm.services.manage"),ownRequest=user.can("hrm.services.self")&&row.created_by===user.id;
  if(!management&&!ownRequest)throw new HrmError("not_found",404);live(user);
  const payload={requestId,expectedVersion,action:input.action,body,assignTo:input.assignTo??""};
  const replay=await replayServiceCommand(db,user,key,payload);if(replay)return;
  if(row.version!==expectedVersion)throw new HrmError("conflict",409);
  let state:ServiceState=row.state,eventType:string,visibility:"employee"|"hr_only",assignedTo=row.assigned_to_user_id;
  if(input.action==="message"){
    if(["resolved","cancelled"].includes(row.state))throw new HrmError("service_request_inactive",409);
    if(management&&row.created_by===user.id&&row.sensitivity==="restricted")throw new HrmError("service_request_self_review",403);
    eventType=management?"staff_message":"employee_message";visibility="employee";
  }else if(input.action==="internal_note"){
    if(!management)throw new HrmError("forbidden",403);
    if(row.created_by===user.id)throw new HrmError("service_request_self_review",403);
    eventType="staff_message";visibility="hr_only";
  }else if(input.action==="assign"){
    if(!management)throw new HrmError("forbidden",403);
    if(row.created_by===user.id)throw new HrmError("service_request_self_review",403);
    if(!["submitted","triaged","reopened"].includes(row.state))throw new HrmError("service_request_transition_invalid",409);
    const members=await membersWithRoles(db,contentDb,["hrm_officer","hrm_admin"]),target=members.find(member=>member.user_id===input.assignTo);
    if(!target)throw new HrmError("service_request_assignee_invalid",409);
    assignedTo=target.user_id;state="triaged";eventType="assigned";visibility="employee";
  }else if(input.action==="triage"||input.action==="in_progress"||input.action==="answer"||input.action==="resolve"){
    if(input.action==="resolve"&&ownRequest&&row.state==="answered"){
      state="resolved";eventType="resolved";visibility="employee";
    }else{
      if(!management)throw new HrmError("forbidden",403);
      if(row.created_by===user.id)throw new HrmError("service_request_self_review",403);
      const next:Record<string,ServiceState>={triage:"triaged",in_progress:"in_progress",answer:"answered",resolve:"resolved"};state=next[input.action];
      const allowed:Record<ServiceState,ServiceState[]>={submitted:["triaged"],triaged:["in_progress"],in_progress:["answered","resolved"],answered:["resolved"],resolved:[],reopened:["triaged","in_progress"],cancelled:[]};
      if(!allowed[row.state].includes(state))throw new HrmError("service_request_transition_invalid",409);
      eventType=state;visibility="employee";
    }
  }else if(input.action==="reopen"){
    if(row.state!=="answered"&&row.state!=="resolved")throw new HrmError("service_request_transition_invalid",409);
    if(!ownRequest&&!management)throw new HrmError("not_found",404);
    state="reopened";eventType="reopened";visibility="employee";
  }else if(input.action==="cancel"){
    if(!ownRequest||row.state!=="submitted")throw new HrmError("service_request_transition_invalid",409);
    state="cancelled";eventType="cancelled";visibility="employee";
  }else throw new HrmError("invalid_action",400);
  const time=now(),eventId=id("hrev"),nextVersion=row.version+1;
  const recipients=new Set<string>();
  if(ownRequest||input.action==="reopen")for(const member of await membersWithRoles(db,contentDb,["hrm_officer","hrm_admin"]))recipients.add(member.user_id);
  if(management&&row.created_by!==user.id&&input.action!=="internal_note")recipients.add(row.created_by);
  if(assignedTo&&assignedTo!==user.id)recipients.add(assignedTo);
  const eventKey=`${requestId}:${nextVersion}:${eventType}`;
  await command(db,user,key,"hr_service_request_transition",payload,requestId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_service_requests WHERE id=? AND version=? AND state=? AND created_by=?)",[requestId,expectedVersion,row.state,row.created_by]),
    ...(input.action==="assign"?[guardBoolean(db,"EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role IN ('hrm_officer','hrm_admin'))",[assignedTo])]:[]),
  ],[
    db.prepare("UPDATE hrm_service_requests SET state=?,assigned_to_user_id=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=?").bind(state,assignedTo,user.id,time,requestId,expectedVersion),
    db.prepare("INSERT INTO hrm_service_request_events(id,request_id,event_type,visibility,body,actor_id,created_at) VALUES(?,?,?,?,?,?,?)").bind(eventId,requestId,eventType,visibility,body,user.id,time),
    ...[...recipients].map(recipient=>db.prepare("INSERT INTO hrm_notification_outbox(id,recipient_user_id,request_id,event_key,event_type,href,state,attempts,created_at,updated_at) VALUES(?,?,?,?,?,?,'queued',0,?,?) ON CONFLICT(recipient_user_id,event_key) DO NOTHING").bind(id("hroutbox"),recipient,requestId,`${eventKey}:${recipient}`,"request_updated",recipient===row.created_by?`/hrm/me/requests?request=${encodeURIComponent(requestId)}`:`/hrm/requests?request=${encodeURIComponent(requestId)}`,time,time)),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,`hr_service_request_${eventType}`,row.person_id,requestId,JSON.stringify({state,sensitivity:row.sensitivity,visibility}),time),
  ]);
}

async function replayServiceCommand(db:D1Database,user:WorkspaceUser,key:string,payload:unknown):Promise<boolean>{
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new HrmError("invalid_request_key");
  const prior=await db.prepare("SELECT operation,payload_hash FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string}>();
  if(!prior)return false;
  if(prior.operation!=="hr_service_request_transition"||prior.payload_hash!==await digest(JSON.stringify(payload)))throw new HrmError("request_key_conflict",409);
  return true;
}

export async function markNotificationRead(db:D1Database,user:WorkspaceUser,key:string,notificationId:string,version:number):Promise<void>{
  requirePermission(user,"hrm.notifications.read");live(user);
  const payload={notificationId,version},time=now();
  await command(db,user,key,"hrm_notification_read",payload,notificationId,[guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_notifications WHERE id=? AND recipient_user_id=? AND version=? AND state='unread')",[notificationId,user.id,version])],[
    db.prepare("UPDATE hrm_notifications SET state='read',version=version+1,read_at=? WHERE id=? AND recipient_user_id=? AND version=? AND state='unread'").bind(time,notificationId,user.id,version),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'hrm_notification_read',?,?,?)").bind(user.id,notificationId,JSON.stringify({}),time),
  ]);
}

export async function listNotifications(db:D1Database,user:WorkspaceUser){
  requirePermission(user,"hrm.notifications.read");live(user);
  await deliverQueuedNotifications(db,user);
  const notifications=(await db.prepare("SELECT * FROM hrm_notifications WHERE recipient_user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all<HrNotification>()).results;
  const unread=notifications.filter(notification=>notification.state==="unread").length;
  await audit(db,user,"hrm_notifications_listed",null,user.id,{count:notifications.length,unread});
  return {notifications,unread};
}

async function deliverQueuedNotifications(db:D1Database,user:WorkspaceUser){
  const pending=(await db.prepare("SELECT * FROM hrm_notification_outbox WHERE recipient_user_id=? AND state='queued' AND attempts<3 ORDER BY created_at,id LIMIT 25").bind(user.id).all<{id:string;recipient_user_id:string;request_id:string;event_key:string;event_type:string;href:string;attempts:number;created_at:string}>()).results;
  if(!pending.length)return;
  try{
    await db.batch(pending.flatMap(item=>[
      db.prepare("INSERT INTO hrm_notifications(id,recipient_user_id,request_id,outbox_id,event_key,event_type,href,state,version,created_at) VALUES(?,?,?,?,?,?,?,'unread',1,?) ON CONFLICT(recipient_user_id,event_key) DO NOTHING").bind(id("hrnote"),item.recipient_user_id,item.request_id,item.id,item.event_key,item.event_type,item.href,item.created_at),
      db.prepare("UPDATE hrm_notification_outbox SET state='delivered',attempts=attempts+1,last_error_code=NULL,updated_at=? WHERE id=? AND state='queued'").bind(now(),item.id),
    ]));
  }catch{
    const time=now();
    await db.batch(pending.map(item=>db.prepare("UPDATE hrm_notification_outbox SET attempts=attempts+1,state=CASE WHEN attempts+1>=3 THEN 'failed' ELSE 'queued' END,last_error_code='in_app_delivery_failed',updated_at=? WHERE id=? AND state='queued'").bind(time,item.id)));
  }
}

export async function listFailedServiceOutbox(db:D1Database,user:WorkspaceUser){
  requirePermission(user,"hrm.services.manage");live(user);
  return (await db.prepare("SELECT id,recipient_user_id,request_id,event_key,event_type,attempts,last_error_code,created_at FROM hrm_notification_outbox WHERE state='failed' ORDER BY created_at DESC LIMIT 100").all<OutboxFailure>()).results;
}

export async function retryServiceOutbox(db:D1Database,user:WorkspaceUser,key:string,outboxId:string):Promise<void>{
  requirePermission(user,"hrm.services.manage");live(user);
  const time=now(),payload={outboxId};
  await command(db,user,key,"hrm_service_outbox_retry",payload,outboxId,[guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_notification_outbox WHERE id=? AND state='failed' AND attempts>=3)",[outboxId])],[
    db.prepare("UPDATE hrm_notification_outbox SET state='queued',attempts=0,last_error_code=NULL,updated_at=? WHERE id=? AND state='failed'").bind(time,outboxId),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'hrm_service_outbox_retried',?,?,?)").bind(user.id,outboxId,JSON.stringify({}),time),
  ]);
}
