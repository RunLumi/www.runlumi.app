import type { WorkspaceUser } from "../workspace/roles";
import { membersWithRoles } from "../workspace/members";
import { HrmError } from "./fields";
import { readLegalUpload } from "./legal-files";
import { audit, command, digest, guardBoolean, id, now, requirePermission } from "./service";

interface RequestTarget {
  id: string; person_id: string; created_by: string; state: string; version: number;
  assigned_to_user_id: string | null; employee_user_id: string | null;
}
export interface ServiceAttachment {
  id: string; request_id: string; file_id: string; person_id: string; uploaded_by: string;
  created_at: string; original_name: string; mime_type: string; size_bytes: number;
  checksum: string; state: "quarantined" | "reviewed" | "rejected"; version: number;
  reviewed_by: string | null; reviewed_at: string | null; review_reason: string | null;
  object_deleted_at: string | null;
}

const live = (user: WorkspaceUser) => { if (user.hrmEnabled !== true) throw new HrmError("hrm_closed", 503); };
const safeName = (value: string) => value.replace(/[\u0000-\u001f\u007f"\\/]/g, "_").slice(0, 160) || "hr-evidence.pdf";
async function replayCommand(db:D1Database,user:WorkspaceUser,key:string,operation:string,payload:unknown):Promise<boolean>{
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new HrmError("invalid_request_key");
  const prior=await db.prepare("SELECT operation,payload_hash FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string}>();
  if(!prior)return false;
  if(prior.operation!==operation||prior.payload_hash!==await digest(JSON.stringify(payload)))throw new HrmError("request_key_conflict",409);
  return true;
}

async function requestTarget(db: D1Database, user: WorkspaceUser, requestId: string): Promise<RequestTarget> {
  const row = await db.prepare(`SELECT r.id,r.person_id,r.created_by,r.state,r.version,r.assigned_to_user_id,p.user_id AS employee_user_id
    FROM hrm_service_requests r JOIN hrm_people p ON p.id=r.person_id WHERE r.id=?`)
    .bind(requestId).first<RequestTarget>();
  if (!row) throw new HrmError("not_found", 404);
  const isRequester = user.can("hrm.services.self") && row.created_by === user.id && row.employee_user_id === user.id;
  if (!isRequester && !user.can("hrm.services.manage")) throw new HrmError("not_found", 404);
  live(user);
  return row;
}

export async function listServiceAttachments(db: D1Database, requestId: string): Promise<ServiceAttachment[]> {
  return (await db.prepare(`SELECT a.id,a.request_id,a.file_id,a.person_id,a.uploaded_by,a.created_at,
      f.original_name,f.mime_type,f.size_bytes,f.checksum,f.state,f.version,f.reviewed_by,f.reviewed_at,f.review_reason,f.object_deleted_at
    FROM hrm_service_request_attachments a JOIN hrm_files f ON f.id=a.file_id
    WHERE a.request_id=? AND f.object_deleted_at IS NULL ORDER BY a.created_at,a.id LIMIT 50`)
    .bind(requestId).all<ServiceAttachment>()).results;
}

export async function uploadServiceAttachment(
  db: D1Database, contentDb: D1Database, bucket: R2Bucket, user: WorkspaceUser, key: string,
  requestId: string, file: File,
): Promise<string> {
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) throw new HrmError("invalid_request_key");
  const request = await requestTarget(db, user, requestId);
  if (["resolved", "cancelled"].includes(request.state)) throw new HrmError("service_request_inactive", 409);
  const uploaded = await readLegalUpload(file, "pdf_evidence");
  const name = safeName(file.name), checksum = await digest(uploaded.bytes), fileId = id("service_file"), attachmentId = id("service_attachment"), time = now();
  const payload = { requestId, requestVersion: request.version, checksum, sizeBytes: file.size, name };
  const payloadHash = await digest(JSON.stringify(payload));
  const previous = await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?")
    .bind(user.id, key).first<{ operation: string; payload_hash: string; result_id: string }>();
  if (previous) {
    if (previous.operation !== "hrm_service_attachment_upload" || previous.payload_hash !== payloadHash) throw new HrmError("request_key_conflict", 409);
    return previous.result_id;
  }

  const objectKey = `hrm/${request.person_id}/service-evidence/${fileId}`;
  await bucket.put(objectKey, uploaded.bytes, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { checksum, request_id: request.id, kind: "service_evidence" } });
  try {
    const recipients = new Set<string>();
    if (request.created_by === user.id) {
      for (const member of await membersWithRoles(db, contentDb, ["hrm_officer", "hrm_admin"])) {
        if (member.user_id !== user.id) recipients.add(member.user_id);
      }
    } else {
      recipients.add(request.created_by);
      if (request.assigned_to_user_id && request.assigned_to_user_id !== user.id) recipients.add(request.assigned_to_user_id);
    }
    const eventWrites = [...recipients].map(recipient => {
      const eventKey = `hrreq:${request.id}:attachment:${fileId}:${recipient}`;
      const href = recipient === request.created_by ? `/hrm/me/requests?request=${encodeURIComponent(request.id)}` : `/hrm/requests?request=${encodeURIComponent(request.id)}`;
      return db.prepare(`INSERT INTO hrm_notification_outbox(id,recipient_user_id,request_id,event_key,event_type,href,state,attempts,created_at,updated_at)
        VALUES(?,?,?,?,?,?,'queued',0,?,?) ON CONFLICT(recipient_user_id,event_key) DO NOTHING`)
        .bind(id("hroutbox"), recipient, request.id, eventKey, "request_updated", href, time, time);
    });
    const committedId = await command(db, user, key, "hrm_service_attachment_upload", payload, attachmentId, [
      guardBoolean(db, `EXISTS(SELECT 1 FROM hrm_service_requests r JOIN hrm_people p ON p.id=r.person_id
        WHERE r.id=? AND r.person_id=? AND r.version=? AND r.state NOT IN ('resolved','cancelled')
          AND (?=1 OR (r.created_by=? AND p.user_id=? AND EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles wr ON wr.user_id=m.user_id
            WHERE m.user_id=? AND m.enabled=1 AND wr.role='employee')) OR EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles wr ON wr.user_id=m.user_id
            WHERE m.user_id=? AND m.enabled=1 AND wr.role IN ('hrm_officer','hrm_admin'))))`,
        [request.id, request.person_id, request.version, user.admin ? 1 : 0, user.id, user.id, user.id, user.id]),
      guardBoolean(db, "NOT EXISTS(SELECT 1 FROM hrm_service_request_attachments WHERE file_id=? OR (request_id=? AND file_id=?))", [fileId, request.id, fileId]),
    ], [
      db.prepare(`INSERT INTO hrm_files(id,person_id,record_id,kind,object_key,original_name,mime_type,size_bytes,checksum,state,uploaded_by,expires_on,legal_hold,retention_actor_id,created_at,updated_at)
        VALUES(?,?,NULL,'service_evidence',?,?, 'application/pdf',?,?,'quarantined',?,NULL,
          CASE WHEN EXISTS(SELECT 1 FROM hrm_legal_holds WHERE scope_kind='person' AND state='active' AND person_id=? AND category IN ('service_evidence','*')) THEN 1 ELSE 0 END,
          CASE WHEN EXISTS(SELECT 1 FROM hrm_legal_holds WHERE scope_kind='person' AND state='active' AND person_id=? AND category IN ('service_evidence','*')) THEN ? ELSE NULL END,?,?)`)
        .bind(fileId, request.person_id, objectKey, name, file.size, checksum, user.id, request.person_id, request.person_id, user.id, time, time),
      db.prepare("INSERT INTO hrm_service_request_attachments(id,request_id,file_id,person_id,uploaded_by,created_at) VALUES(?,?,?,?,?,?)")
        .bind(attachmentId, request.id, fileId, request.person_id, user.id, time),
      db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'hr_service_attachment_uploaded',?,?,?,?)")
        .bind(user.id, request.person_id, attachmentId, JSON.stringify({ request_id: request.id, file_id: fileId, checksum, size_bytes: file.size }), time),
      ...eventWrites,
      db.prepare("DELETE FROM hrm_write_guards"),
    ]);
    if (committedId !== attachmentId) {
      await bucket.delete(objectKey).catch(() => {});
      return committedId;
    }
    return attachmentId;
  } catch (error) {
    await bucket.delete(objectKey).catch(() => {});
    throw error;
  }
}

export async function reviewServiceAttachment(
  db: D1Database, user: WorkspaceUser, key: string, attachmentId: string, fileVersion: number,
  decision: "approve" | "reject", reason: string,
): Promise<void> {
  requirePermission(user, "hrm.services.manage"); live(user);
  const cleanReason = reason.trim();
  if (!cleanReason || cleanReason.length > 500) throw new HrmError("reason_required");
  const row = await db.prepare(`SELECT a.request_id,a.person_id,a.file_id,a.uploaded_by,r.created_by,r.state AS request_state,
      f.state,f.version,f.object_deleted_at
    FROM hrm_service_request_attachments a JOIN hrm_service_requests r ON r.id=a.request_id
    JOIN hrm_files f ON f.id=a.file_id WHERE a.id=?`)
    .bind(attachmentId).first<{ request_id:string;person_id:string;file_id:string;uploaded_by:string;created_by:string;request_state:string;state:string;version:number;object_deleted_at:string|null }>();
  if (!row || row.object_deleted_at) throw new HrmError("not_found", 404);
  if (row.created_by === user.id || row.uploaded_by === user.id) throw new HrmError("service_request_self_review", 403);
  const payload = { attachmentId, fileVersion, decision, reason: cleanReason };
  if (await replayCommand(db,user,key,"hrm_service_attachment_review",payload)) return;
  if (row.state !== "quarantined" || row.version !== fileVersion) throw new HrmError("conflict", 409);
  const next = decision === "approve" ? "reviewed" : "rejected", time = now();
  await command(db, user, key, "hrm_service_attachment_review", payload, attachmentId, [
    guardBoolean(db, `EXISTS(SELECT 1 FROM hrm_service_request_attachments a JOIN hrm_service_requests r ON r.id=a.request_id
      JOIN hrm_files f ON f.id=a.file_id WHERE a.id=? AND r.created_by!=? AND a.uploaded_by!=? AND f.version=? AND f.state='quarantined' AND f.object_deleted_at IS NULL
        AND (?=1 OR EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles wr ON wr.user_id=m.user_id
          WHERE m.user_id=? AND m.enabled=1 AND wr.role IN ('hrm_officer','hrm_admin'))))`,
      [attachmentId, user.id, user.id, fileVersion, user.admin ? 1 : 0, user.id]),
  ], [
    db.prepare("UPDATE hrm_files SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,updated_at=? WHERE id=? AND version=? AND state='quarantined'")
      .bind(next, user.id, time, cleanReason, time, row.file_id, fileVersion),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,?,?,?,?,?)")
      .bind(user.id, `hr_service_attachment_${next}`, row.person_id, attachmentId, JSON.stringify({ request_id: row.request_id, file_id: row.file_id, reason: cleanReason }), time),
    db.prepare(`INSERT INTO hrm_notification_outbox(id,recipient_user_id,request_id,event_key,event_type,href,state,attempts,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'queued',0,?,?) ON CONFLICT(recipient_user_id,event_key) DO NOTHING`)
      .bind(id("hroutbox"), row.created_by, row.request_id, `hrreq:${row.request_id}:attachment:${attachmentId}:${next}:${row.created_by}`, "request_updated", `/hrm/me/requests?request=${encodeURIComponent(row.request_id)}`, time, time),
    db.prepare("DELETE FROM hrm_write_guards"),
  ]);
}

export async function downloadServiceAttachment(db: D1Database, bucket: R2Bucket, user: WorkspaceUser, attachmentId: string): Promise<Response> {
  live(user);
  const row = await db.prepare(`SELECT a.id,a.request_id,a.person_id,a.uploaded_by,r.created_by,p.user_id AS employee_user_id,
      f.original_name,f.mime_type,f.size_bytes,f.checksum,f.state,f.object_key,f.object_deleted_at
    FROM hrm_service_request_attachments a JOIN hrm_service_requests r ON r.id=a.request_id
    JOIN hrm_people p ON p.id=a.person_id JOIN hrm_files f ON f.id=a.file_id WHERE a.id=?`)
    .bind(attachmentId).first<{ id:string;request_id:string;person_id:string;uploaded_by:string;created_by:string;employee_user_id:string|null;original_name:string;mime_type:string;size_bytes:number;checksum:string;state:string;object_key:string;object_deleted_at:string|null }>();
  if (!row || row.object_deleted_at) throw new HrmError("not_found", 404);
  const isRequester = user.can("hrm.services.self") && row.created_by === user.id && row.employee_user_id === user.id;
  const canManage = user.can("hrm.services.manage");
  if (!isRequester && !canManage) throw new HrmError("not_found", 404);
  if (!canManage && row.state !== "reviewed" && row.uploaded_by !== user.id) throw new HrmError("not_found", 404);
  const object = await bucket.get(row.object_key);
  if (!object) throw new HrmError("file_unavailable", 404);
  await audit(db, user, "hr_service_attachment_downloaded", row.person_id, row.id, { request_id: row.request_id, checksum: row.checksum });
  const filename = safeName(row.original_name);
  return new Response(object.body, { headers: {
    "Content-Type": "application/pdf", "Content-Length": String(row.size_bytes),
    "Content-Disposition": `attachment; filename="hr-evidence.pdf"; filename*=UTF-8''${encodeURIComponent(filename).replaceAll("'", "%27")}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "Referrer-Policy": "no-referrer",
  } });
}
