import type { WorkspaceUser } from "../workspace/roles";
import { HrmError } from "./fields";
import { readLegalUpload } from "./legal-files";
import { audit, command, digest, guardBoolean, id, now, requirePermission } from "./service";

export type AssetEvidenceType = "handover" | "return";
export interface AssetEvidenceRow {
  id:string;asset_id:string;assignment_id:string;file_id:string;person_id:string;evidence_type:AssetEvidenceType;
  uploaded_by:string;created_at:string;original_name:string;mime_type:string;size_bytes:number;checksum:string;
  state:"quarantined"|"reviewed"|"rejected";version:number;reviewed_by:string|null;reviewed_at:string|null;offered_by:string;assignment_state:string;
  review_reason:string|null;legal_hold:number;object_deleted_at:string|null;employee_user_id:string|null;
}

const live=(user:WorkspaceUser)=>{if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503)};
const safeName=(value:string)=>value.replace(/[\u0000-\u001f\u007f"\\/]/g,"_").slice(0,160)||"asset-handover.pdf";
function evidenceType(value:string):AssetEvidenceType{if(value!=="handover"&&value!=="return")throw new HrmError("asset_evidence_type_invalid");return value}

async function previous(db:D1Database,user:WorkspaceUser,key:string,operation:string,payload:unknown):Promise<string|null>{
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new HrmError("invalid_request_key");
  const row=await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string;result_id:string}>();
  if(!row)return null;
  if(row.operation!==operation||row.payload_hash!==await digest(JSON.stringify(payload)))throw new HrmError("request_key_conflict",409);
  return row.result_id;
}

export async function listAssetEvidenceForAssignment(db:D1Database,user:WorkspaceUser,assignmentId:string):Promise<AssetEvidenceRow[]>{
  live(user);
  const assignment=await db.prepare(`SELECT x.id,p.id AS person_id,p.user_id AS employee_user_id
    FROM hrm_asset_assignments x JOIN hrm_people p ON p.id=x.person_id WHERE x.id=?`).bind(assignmentId)
    .first<{id:string;person_id:string;employee_user_id:string|null}>();
  if(!assignment)throw new HrmError("not_found",404);
  const self=user.can("hrm.assets.self")&&assignment.employee_user_id===user.id;
  if(!self&&!user.can("hrm.assets.manage"))throw new HrmError("not_found",404);
  const rows=(await db.prepare(`SELECT l.id,l.asset_id,l.assignment_id,l.file_id,l.person_id,l.evidence_type,l.uploaded_by,l.created_at,
      f.original_name,f.mime_type,f.size_bytes,f.checksum,f.state,f.version,f.reviewed_by,f.reviewed_at,f.review_reason,f.legal_hold,f.object_deleted_at,
      p.user_id AS employee_user_id,x.offered_by,x.state AS assignment_state
    FROM hrm_asset_evidence_links l JOIN hrm_files f ON f.id=l.file_id JOIN hrm_people p ON p.id=l.person_id JOIN hrm_asset_assignments x ON x.id=l.assignment_id
    WHERE l.assignment_id=? AND f.object_deleted_at IS NULL ORDER BY l.created_at,l.id LIMIT 50`)
    .bind(assignmentId).all<AssetEvidenceRow>()).results;
  await audit(db,user,"hrm_asset_evidence_listed",assignment.person_id,assignmentId,{count:rows.length});
  return rows;
}

export async function listAssetEvidenceForAsset(db:D1Database,user:WorkspaceUser,assetId:string):Promise<AssetEvidenceRow[]>{
  requirePermission(user,"hrm.assets.manage");live(user);
  if(!await db.prepare("SELECT 1 FROM hrm_assets WHERE id=?").bind(assetId).first())throw new HrmError("not_found",404);
  const rows=(await db.prepare(`SELECT l.id,l.asset_id,l.assignment_id,l.file_id,l.person_id,l.evidence_type,l.uploaded_by,l.created_at,
      f.original_name,f.mime_type,f.size_bytes,f.checksum,f.state,f.version,f.reviewed_by,f.reviewed_at,f.review_reason,f.legal_hold,f.object_deleted_at,
      p.user_id AS employee_user_id,x.offered_by,x.state AS assignment_state
    FROM hrm_asset_evidence_links l JOIN hrm_files f ON f.id=l.file_id JOIN hrm_people p ON p.id=l.person_id JOIN hrm_asset_assignments x ON x.id=l.assignment_id
    WHERE l.asset_id=? AND f.object_deleted_at IS NULL ORDER BY l.created_at DESC,l.id LIMIT 100`)
    .bind(assetId).all<AssetEvidenceRow>()).results;
  await audit(db,user,"hrm_asset_evidence_listed",null,assetId,{count:rows.length});
  return rows;
}

export async function listMyAssetEvidence(db:D1Database,user:WorkspaceUser):Promise<AssetEvidenceRow[]>{
  requirePermission(user,"hrm.assets.self");live(user);
  const rows=(await db.prepare(`SELECT l.id,l.asset_id,l.assignment_id,l.file_id,l.person_id,l.evidence_type,l.uploaded_by,l.created_at,
      f.original_name,f.mime_type,f.size_bytes,f.checksum,f.state,f.version,f.reviewed_by,f.reviewed_at,f.review_reason,f.legal_hold,f.object_deleted_at,
      p.user_id AS employee_user_id,x.offered_by,x.state AS assignment_state
    FROM hrm_asset_evidence_links l JOIN hrm_files f ON f.id=l.file_id JOIN hrm_people p ON p.id=l.person_id JOIN hrm_asset_assignments x ON x.id=l.assignment_id
    WHERE p.user_id=? AND f.object_deleted_at IS NULL ORDER BY l.created_at,l.id LIMIT 100`).bind(user.id).all<AssetEvidenceRow>()).results;
  await audit(db,user,"hrm_my_asset_evidence_listed",null,user.id,{count:rows.length});
  return rows;
}

export async function uploadAssetEvidence(
  db:D1Database,bucket:R2Bucket,user:WorkspaceUser,key:string,assignmentId:string,version:number,typeInput:string,file:File,
):Promise<string>{
  live(user);
  const type=evidenceType(typeInput),self=user.can("hrm.assets.self"),manage=user.can("hrm.assets.manage");
  if(!self&&!manage)throw new HrmError("forbidden",403);
  const assignment=await db.prepare(`SELECT x.id,x.asset_id,x.person_id,x.employment_id,x.state,x.version,x.employee_handover_at,
      a.asset_tag,p.user_id AS employee_user_id
    FROM hrm_asset_assignments x JOIN hrm_assets a ON a.id=x.asset_id JOIN hrm_people p ON p.id=x.person_id WHERE x.id=?`)
    .bind(assignmentId).first<{id:string;asset_id:string;person_id:string;employment_id:string;state:string;version:number;employee_handover_at:string|null;asset_tag:string;employee_user_id:string|null}>();
  if(!assignment)throw new HrmError("not_found",404);
  const employeeOwns=self&&assignment.employee_user_id===user.id;
  if(!employeeOwns&&!manage)throw new HrmError("not_found",404);
  if(type==="handover"&&(!employeeOwns||assignment.state!=="return_requested"||!assignment.employee_handover_at))throw new HrmError("not_found",404);
  if(type==="return"&&(!manage||assignment.state!=="return_requested"))throw new HrmError("not_found",404);
  if(assignment.version!==version)throw new HrmError("conflict",409);
  const uploaded=await readLegalUpload(file,"pdf_evidence"),name=safeName(file.name),checksum=await digest(uploaded.bytes);
  const fileId=id("asset_file"),linkId=id("asset_evidence"),time=now(),objectKey=`hrm/${assignment.person_id}/asset-evidence/${fileId}`;
  const payload={assignmentId,version,evidenceType:type,checksum,sizeBytes:file.size,name};
  const prior=await previous(db,user,key,"hrm_asset_evidence_upload",payload);if(prior)return prior;
  try{await bucket.put(objectKey,uploaded.bytes,{httpMetadata:{contentType:"application/pdf"},customMetadata:{checksum,assignment_id:assignmentId,kind:"asset_evidence"}})}catch{throw new HrmError("asset_evidence_storage_failed",503)}
  try{
    const committed=await command(db,user,key,"hrm_asset_evidence_upload",payload,linkId,[
      guardBoolean(db,`EXISTS(SELECT 1 FROM hrm_asset_assignments x JOIN hrm_people p ON p.id=x.person_id
        WHERE x.id=? AND x.asset_id=? AND x.person_id=? AND x.version=? AND x.state='return_requested'
          AND (?=1 OR (p.user_id=? AND x.employee_handover_at IS NOT NULL AND EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=p.user_id AND m.enabled=1 AND r.role='employee'))))`
      ,[assignment.id,assignment.asset_id,assignment.person_id,version,manage?1:0,user.id]),
      guardBoolean(db,"NOT EXISTS(SELECT 1 FROM hrm_asset_evidence_links WHERE id=? OR file_id=?)",[linkId,fileId]),
    ],[
      db.prepare(`INSERT INTO hrm_files(id,person_id,record_id,kind,object_key,original_name,mime_type,size_bytes,checksum,state,uploaded_by,expires_on,legal_hold,retention_actor_id,created_at,updated_at)
        VALUES(?,?,NULL,'asset_evidence',?,?,'application/pdf',?,?,'quarantined',?,NULL,
          CASE WHEN EXISTS(SELECT 1 FROM hrm_legal_holds WHERE scope_kind='person' AND state='active' AND person_id=? AND category IN ('asset_evidence','*')) THEN 1 ELSE 0 END,
          CASE WHEN EXISTS(SELECT 1 FROM hrm_legal_holds WHERE scope_kind='person' AND state='active' AND person_id=? AND category IN ('asset_evidence','*')) THEN ? ELSE NULL END,?,?)`)
        .bind(fileId,assignment.person_id,objectKey,name,file.size,checksum,user.id,assignment.person_id,assignment.person_id,user.id,time,time),
      db.prepare("INSERT INTO hrm_asset_evidence_links(id,asset_id,assignment_id,file_id,person_id,evidence_type,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?)")
        .bind(linkId,assignment.asset_id,assignment.id,fileId,assignment.person_id,type,user.id,time),
      db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'hrm_asset_evidence_uploaded',?,?,?,?)")
        .bind(user.id,assignment.person_id,linkId,JSON.stringify({asset_id:assignment.asset_id,assignment_id:assignment.id,evidence_type:type,file_id:fileId,checksum,size_bytes:file.size}),time),
      db.prepare("DELETE FROM hrm_write_guards"),
    ]);
    if(committed!==linkId){await bucket.delete(objectKey).catch(()=>{});return committed}
    return linkId;
  }catch(error){
    await bucket.delete(objectKey).catch(()=>{});
    if(error instanceof HrmError)throw error;
    const message=error instanceof Error?error.message:"";
    if(message.includes("asset_evidence_target_invalid"))throw new HrmError("asset_evidence_target_invalid",409);
    if(/CHECK constraint failed|UNIQUE constraint failed|FOREIGN KEY constraint failed/.test(message))throw new HrmError("conflict",409);
    throw new HrmError("asset_evidence_persist_failed",503);
  }
}

export async function reviewAssetEvidence(db:D1Database,user:WorkspaceUser,key:string,evidenceId:string,fileVersion:number,decision:"approve"|"reject",reason:string):Promise<void>{
  requirePermission(user,"hrm.assets.approve");live(user);
  const cleanReason=reason.trim();if(!cleanReason||cleanReason.length>500)throw new HrmError("reason_required");
  const row=await db.prepare(`SELECT l.asset_id,l.assignment_id,l.person_id,l.file_id,l.uploaded_by,x.offered_by,
      f.state,f.version,f.object_deleted_at FROM hrm_asset_evidence_links l JOIN hrm_asset_assignments x ON x.id=l.assignment_id
    JOIN hrm_files f ON f.id=l.file_id WHERE l.id=?`).bind(evidenceId)
    .first<{asset_id:string;assignment_id:string;person_id:string;file_id:string;uploaded_by:string;offered_by:string;state:string;version:number;object_deleted_at:string|null}>();
  if(!row||row.object_deleted_at)throw new HrmError("not_found",404);
  if(row.uploaded_by===user.id||row.offered_by===user.id)throw new HrmError("asset_evidence_self_review",403);
  const payload={evidenceId,fileVersion,decision,reason:cleanReason};
  if(await previous(db,user,key,"hrm_asset_evidence_review",payload))return;
  if(row.state!=="quarantined"||row.version!==fileVersion)throw new HrmError("conflict",409);
  const next=decision==="approve"?"reviewed":"rejected",time=now();
  await command(db,user,key,"hrm_asset_evidence_review",payload,evidenceId,[
    guardBoolean(db,`EXISTS(SELECT 1 FROM hrm_asset_evidence_links l JOIN hrm_asset_assignments x ON x.id=l.assignment_id JOIN hrm_files f ON f.id=l.file_id
      WHERE l.id=? AND x.offered_by!=? AND l.uploaded_by!=? AND f.version=? AND f.state='quarantined' AND f.object_deleted_at IS NULL)`,[evidenceId,user.id,user.id,fileVersion]),
  ],[
    db.prepare("UPDATE hrm_files SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,retention_actor_id=?,updated_at=? WHERE id=? AND version=? AND state='quarantined' AND object_deleted_at IS NULL")
      .bind(next,user.id,time,cleanReason,user.id,time,row.file_id,fileVersion),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,?,?,?,?,?)")
      .bind(user.id,`hrm_asset_evidence_${next}`,row.person_id,evidenceId,JSON.stringify({asset_id:row.asset_id,assignment_id:row.assignment_id,file_id:row.file_id,reason_recorded:true}),time),
    db.prepare("DELETE FROM hrm_write_guards"),
  ]);
}

export async function downloadAssetEvidence(db:D1Database,bucket:R2Bucket,user:WorkspaceUser,evidenceId:string):Promise<Response>{
  live(user);
  const row=await db.prepare(`SELECT l.id,l.asset_id,l.assignment_id,l.person_id,l.uploaded_by,p.user_id AS employee_user_id,
      f.original_name,f.size_bytes,f.checksum,f.state,f.object_key,f.object_deleted_at
    FROM hrm_asset_evidence_links l JOIN hrm_people p ON p.id=l.person_id JOIN hrm_files f ON f.id=l.file_id WHERE l.id=?`)
    .bind(evidenceId).first<{id:string;asset_id:string;assignment_id:string;person_id:string;uploaded_by:string;employee_user_id:string|null;original_name:string;size_bytes:number;checksum:string;state:string;object_key:string;object_deleted_at:string|null}>();
  if(!row||row.object_deleted_at)throw new HrmError("not_found",404);
  const self=user.can("hrm.assets.self")&&row.employee_user_id===user.id,manage=user.can("hrm.assets.manage");
  if(!self&&!manage)throw new HrmError("not_found",404);
  if(row.state!=="reviewed"&&row.uploaded_by!==user.id&&!user.can("hrm.assets.approve"))throw new HrmError("not_found",404);
  const object=await bucket.get(row.object_key);if(!object)throw new HrmError("file_unavailable",404);
  await audit(db,user,"hrm_asset_evidence_downloaded",row.person_id,row.id,{asset_id:row.asset_id,assignment_id:row.assignment_id,checksum:row.checksum});
  const filename=row.original_name.replace(/[\u0000-\u001f\u007f"\\/]/g,"_").slice(0,160)||"asset-handover.pdf";
  return new Response(object.body,{headers:{"Content-Type":"application/pdf","Content-Length":String(row.size_bytes),"Content-Disposition":`attachment; filename="asset-handover.pdf"; filename*=UTF-8''${encodeURIComponent(filename).replaceAll("'","%27")}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox","Referrer-Policy":"no-referrer"}});
}
