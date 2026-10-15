import type { WorkspaceUser } from "../workspace/roles";
import { HrmError } from "./fields";
import { readLegalUpload } from "./legal-files";
import { parseLeaveRules, reviewerScope } from "./time-leave";
import { command, digest, guard, id, now, requirePermission } from "./service";

interface LeaveEvidenceTarget {id:string;person_id:string;state:string;version:number;current_revision_no:number;policy_version_id:string;leave_type_key:string;employee_user_id:string|null}
interface LeaveEvidenceRow {id:string;leave_request_id:string;file_id:string;person_id:string;uploaded_by:string;actor_id:string;created_at:string;object_key:string;original_name:string;mime_type:string;size_bytes:number;checksum:string;state:string;version:number;reviewed_by:string|null;object_deleted_at:string|null;employee_user_id:string|null}
const live=(user:WorkspaceUser)=>{if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503)};
const safeName=(value:string)=>value.replace(/[\u0000-\u001f\u007f"\\/]/g,"_").slice(0,160)||"leave-evidence.pdf";

async function uploadTarget(db:D1Database,user:WorkspaceUser,requestId:string):Promise<LeaveEvidenceTarget>{
  const target=await db.prepare(`SELECT r.id,r.person_id,r.state,r.version,r.current_revision_no,r.policy_version_id,r.leave_type_key,p.user_id AS employee_user_id
    FROM hrm_leave_requests r JOIN hrm_people p ON p.id=r.person_id WHERE r.id=?`).bind(requestId).first<LeaveEvidenceTarget>();
  if(!target)throw new HrmError("not_found",404);
  const self=target.employee_user_id===user.id&&user.can("hrm.leave.self");
  if(!self&&!user.can("hrm.leave.manage")&&!user.admin)throw new HrmError("not_found",404);
  const policy=await db.prepare("SELECT rules_json FROM hrm_leave_policy_versions WHERE id=?").bind(target.policy_version_id).first<{rules_json:string}>();
  const rule=policy?parseLeaveRules(policy.rules_json).find(item=>item.key===target.leave_type_key):null;
  if(!rule||!rule.evidence_required)throw new HrmError("leave_evidence_not_required",409);
  return target;
}

export async function uploadLeaveEvidence(db:D1Database,bucket:R2Bucket,user:WorkspaceUser,key:string,requestId:string,requestVersion:number,file:File):Promise<string>{
  live(user);
  const target=await uploadTarget(db,user,requestId),loaded=await readLegalUpload(file,"pdf_evidence"),name=safeName(file.name),checksum=await digest(loaded.bytes),fileId=id("leave_evidence"),linkId=id("leave_evidence_link"),time=now(),objectKey=`hrm/${target.person_id}/leave-evidence/${fileId}`;
  const payload={requestId,requestVersion,revisionNo:target.current_revision_no,personId:target.person_id,checksum,size:file.size,name},payloadHash=await digest(JSON.stringify(payload));
  const previous=await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string;result_id:string}>();
  if(previous){if(previous.operation!=="leave_evidence_upload"||previous.payload_hash!==payloadHash)throw new HrmError("request_key_conflict",409);return previous.result_id;}
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new HrmError("invalid_request_key");
  if(target.state!=="pending_approval"||target.version!==requestVersion)throw new HrmError("leave_request_stale",409);
  if(await db.prepare(`SELECT 1 FROM hrm_leave_evidence_links l JOIN hrm_files f ON f.id=l.file_id WHERE l.leave_request_id=? AND l.revision_no=? AND f.state IN ('quarantined','reviewed') AND f.object_deleted_at IS NULL LIMIT 1`).bind(requestId,target.current_revision_no).first())throw new HrmError("leave_evidence_already_attached",409);
  await bucket.put(objectKey,loaded.bytes,{httpMetadata:{contentType:"application/pdf"},customMetadata:{sha256:checksum,kind:"leave_evidence",request_id:requestId}});
  try{
    await command(db,user,key,"leave_evidence_upload",payload,fileId,[
      guard(db,"EXISTS(SELECT 1 FROM hrm_leave_requests WHERE id=? AND person_id=? AND version=? AND state='pending_approval')",[requestId,target.person_id,requestVersion]),
      guard(db,"EXISTS(SELECT 1 FROM hrm_leave_requests r JOIN hrm_leave_policy_versions p ON p.id=r.policy_version_id JOIN json_each(p.rules_json) j ON json_extract(j.value,'$.key')=r.leave_type_key WHERE r.id=? AND json_extract(j.value,'$.evidence_required')=1)",[requestId]),
      guard(db,"NOT EXISTS(SELECT 1 FROM hrm_leave_evidence_links l JOIN hrm_files f ON f.id=l.file_id WHERE l.leave_request_id=? AND l.revision_no=? AND f.state IN ('quarantined','reviewed') AND f.object_deleted_at IS NULL)",[requestId,target.current_revision_no]),
    ],[
      db.prepare(`INSERT INTO hrm_files(id,person_id,record_id,kind,object_key,original_name,mime_type,size_bytes,checksum,state,uploaded_by,expires_on,legal_hold,retention_actor_id,created_at,updated_at)
        VALUES(?,?,NULL,'leave_evidence',?,?,?,?,?,'quarantined',?,NULL,CASE WHEN EXISTS(SELECT 1 FROM hrm_legal_holds WHERE scope_kind='person' AND state='active' AND person_id=? AND category IN ('leave_evidence','*')) THEN 1 ELSE 0 END,CASE WHEN EXISTS(SELECT 1 FROM hrm_legal_holds WHERE scope_kind='person' AND state='active' AND person_id=? AND category IN ('leave_evidence','*')) THEN ? ELSE NULL END,?,?)`)
        .bind(fileId,target.person_id,objectKey,name,"application/pdf",file.size,checksum,user.id,target.person_id,target.person_id,user.id,time,time),
      db.prepare("INSERT INTO hrm_leave_evidence_links(id,leave_request_id,file_id,revision_no,person_id,uploaded_by,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(linkId,requestId,fileId,target.current_revision_no,target.person_id,user.id,user.id,time),
      db.prepare("UPDATE hrm_leave_requests SET version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='pending_approval'").bind(user.id,time,requestId,requestVersion),
      db.prepare("INSERT INTO hrm_leave_events(id,leave_request_id,action,actor_id,detail_json,created_at) VALUES(?,?,'evidence_uploaded',?,?,?)").bind(id("leave_event"),requestId,user.id,JSON.stringify({file_id:fileId,checksum,size_bytes:file.size}),time),
      db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'leave_evidence_uploaded',?,?,?,?)").bind(user.id,target.person_id,fileId,JSON.stringify({request_id:requestId,checksum,size_bytes:file.size}),time),
      db.prepare("DELETE FROM hrm_write_guards"),
    ]);
    return fileId;
  }catch(error){await bucket.delete(objectKey).catch(()=>{});throw error;}
}

export async function reviewLeaveEvidence(db:D1Database,user:WorkspaceUser,key:string,fileId:string,requestVersion:number,fileVersion:number,approve:boolean,reason:string):Promise<void>{
  requirePermission(user,"hrm.leave.review");live(user);if(!reason.trim()||reason.length>500)throw new HrmError("reason_required",400);
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new HrmError("invalid_request_key");
  const evidence=await db.prepare(`SELECT l.leave_request_id,l.person_id,l.revision_no,l.uploaded_by,f.state,f.version,r.version AS request_version,r.current_revision_no,r.state AS request_state,r.submitted_by
    FROM hrm_leave_evidence_links l JOIN hrm_files f ON f.id=l.file_id JOIN hrm_leave_requests r ON r.id=l.leave_request_id WHERE f.id=?`).bind(fileId).first<{leave_request_id:string;person_id:string;revision_no:number;uploaded_by:string;state:string;version:number;request_version:number;current_revision_no:number;request_state:string;submitted_by:string}>();
  if(!evidence)throw new HrmError("not_found",404);await reviewerScope(db,user,evidence.person_id,"leave");
  if(evidence.uploaded_by===user.id)throw new HrmError("self_approval",403);
  const time=now(),state=approve?"reviewed":"rejected",payload={fileId,requestId:evidence.leave_request_id,requestVersion,fileVersion,approve,reason:reason.trim()};
  const prior=await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string;result_id:string}>();
  if(prior){if(prior.operation!=="leave_evidence_review"||prior.payload_hash!==await digest(JSON.stringify(payload)))throw new HrmError("request_key_conflict",409);return;}
  if(evidence.state!=="quarantined"||evidence.request_state!=="pending_approval"||evidence.revision_no!==evidence.current_revision_no)throw new HrmError("invalid_transition",409);
  if(evidence.request_version!==requestVersion||evidence.version!==fileVersion)throw new HrmError("conflict",409);
  await command(db,user,key,"leave_evidence_review",payload,fileId,[
    guard(db,"EXISTS(SELECT 1 FROM hrm_files f JOIN hrm_leave_evidence_links l ON l.file_id=f.id JOIN hrm_leave_requests r ON r.id=l.leave_request_id WHERE f.id=? AND f.version=? AND f.state='quarantined' AND f.uploaded_by!=? AND r.id=? AND r.version=? AND r.current_revision_no=l.revision_no AND r.state='pending_approval')",[fileId,fileVersion,user.id,evidence.leave_request_id,requestVersion]),
  ],[
    db.prepare("UPDATE hrm_files SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,retention_actor_id=?,updated_at=? WHERE id=? AND version=? AND state='quarantined'").bind(state,user.id,time,reason.trim(),user.id,time,fileId,fileVersion),
    db.prepare("UPDATE hrm_leave_requests SET version=version+1,actor_id=?,updated_at=? WHERE id=? AND version=? AND state='pending_approval'").bind(user.id,time,evidence.leave_request_id,requestVersion),
    db.prepare("INSERT INTO hrm_leave_events(id,leave_request_id,action,actor_id,detail_json,created_at) VALUES(?,?,?,?,?,?)").bind(id("leave_event"),evidence.leave_request_id,approve?"evidence_reviewed":"evidence_rejected",user.id,JSON.stringify({file_id:fileId,reason:reason.trim()}),time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,"leave_evidence_"+state,evidence.person_id,fileId,JSON.stringify({request_id:evidence.leave_request_id,reason:reason.trim()}),time),
    db.prepare("DELETE FROM hrm_write_guards"),
  ]);
}

export async function downloadLeaveEvidence(db:D1Database,bucket:R2Bucket,user:WorkspaceUser,fileId:string):Promise<Response>{
  live(user);
  const file=await db.prepare(`SELECT f.*,l.leave_request_id,l.person_id AS evidence_person_id,p.user_id AS employee_user_id
    FROM hrm_files f JOIN hrm_leave_evidence_links l ON l.file_id=f.id JOIN hrm_leave_requests r ON r.id=l.leave_request_id JOIN hrm_people p ON p.id=l.person_id WHERE f.id=? AND f.kind='leave_evidence'`).bind(fileId).first<LeaveEvidenceRow&{evidence_person_id:string;employee_user_id:string|null}>();
  if(!file||file.object_deleted_at)throw new HrmError("not_found",404);
  const ownFile=!!user.can("hrm.leave.self")&&file.employee_user_id===user.id;
  if(!ownFile&&!user.can("hrm.leave.review")&&!user.can("hrm.leave.manage")&&!user.admin)throw new HrmError("not_found",404);
  if(!ownFile)await reviewerScope(db,user,file.evidence_person_id,"leave");
  if(file.state!=="reviewed"&&file.uploaded_by!==user.id&&!user.can("hrm.leave.review")&&!user.can("hrm.leave.manage")&&!user.admin)throw new HrmError("not_found",404);
  const object=await bucket.get(file.object_key);if(!object)throw new HrmError("file_unavailable",404);
  await db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'leave_evidence_downloaded',?,?,?,?)").bind(user.id,file.evidence_person_id,file.id,JSON.stringify({request_id:file.leave_request_id,checksum:file.checksum}),now()).run();
  return new Response(object.body,{headers:{"Content-Type":"application/pdf","Content-Length":String(file.size_bytes),"Content-Disposition":`attachment; filename="leave-evidence.pdf"; filename*=UTF-8''${encodeURIComponent(file.original_name).replaceAll("'","%27")}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox","Referrer-Policy":"no-referrer"}});
}
