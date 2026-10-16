import type { WorkspaceUser } from "../workspace/roles";
import { HrmError, readableFileType, type RecordKind } from "./fields";
import { retentionCategoryForHrm } from "./retention";
import { assertRecordRead, audit, command, digest, guard, id, now, own, requirePermission, type Person, type PrivateFile } from "./service";
const kinds=["avatar","identity","dependent","bank","tax","personal","leave_evidence","service_evidence","training_evidence","asset_evidence"] as const;
export type FileKind=typeof kinds[number];
export function fileKind(value:string):FileKind {if(!(kinds as readonly string[]).includes(value))throw new HrmError("invalid_kind");return value as FileKind}
function authorize(person:Person,user:WorkspaceUser,kind:string):void {if(kind==="leave_evidence"||kind==="service_evidence"||kind==="training_evidence"||kind==="asset_evidence")throw new HrmError("not_found",404);assertRecordRead(person,user,(kind==="avatar"?"personal":kind) as RecordKind)}
export async function listFiles(db:D1Database,user:WorkspaceUser,person:Person,kind:string):Promise<PrivateFile[]> {
 authorize(person,user,kind);await audit(db,user,"files_listed",person.id,person.id,{kind});
 return (await db.prepare("SELECT id,person_id,record_id,kind,original_name,mime_type,size_bytes,checksum,state,uploaded_by,reviewed_by,version,expires_on,legal_hold,object_deleted_at,created_at FROM hrm_files WHERE person_id=? AND kind=? ORDER BY created_at DESC LIMIT 100").bind(person.id,kind).all<PrivateFile>()).results;
}
export async function uploadFile(db:D1Database,bucket:R2Bucket,user:WorkspaceUser,key:string,person:Person,kind:string,file:File,recordId:string|null,expiresOn:string|null):Promise<string> {
 if(kind==="leave_evidence"||kind==="service_evidence"||kind==="training_evidence"||kind==="asset_evidence")throw new HrmError("invalid_kind",400);
 authorize(person,user,kind);if(!own(person,user))requirePermission(user,"hrm.records.manage");
 if(file.size<=0||file.size>5*1024*1024)throw new HrmError("file_size");
 if(expiresOn&&!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn))throw new HrmError("invalid_date");
 const bytes=await file.arrayBuffer();const detected=readableFileType(new Uint8Array(bytes));
 if(!detected||detected!==file.type||(kind==="avatar"&&detected==="application/pdf"))throw new HrmError("file_type");
 const name=file.name.replace(/[\x00-\x1f\x7f"\\/]/g,"_").slice(0,160)||"document";const checksum=await digest(bytes);const payload={person:person.id,kind,checksum,name,recordId,expiresOn};
 if(!/^[a-zA-Z0-9_-]{16,100}$/.test(key))throw new HrmError("invalid_request_key");
 const hash=await digest(JSON.stringify(payload));const previous=await db.prepare("SELECT payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{payload_hash:string;result_id:string}>();
 if(previous){if(previous.payload_hash!==hash)throw new HrmError("request_key_conflict",409);return previous.result_id}
 const target=id("file"),objectKey=`hrm/${person.id}/${target}`,time=now();const recordKind=kind==="avatar"?"personal":kind,category=retentionCategoryForHrm(kind);
 const guards=recordId?[guard(db,"EXISTS(SELECT 1 FROM hrm_records WHERE id=? AND person_id=? AND kind=?)",[recordId,person.id,recordKind])]:[];
 await bucket.put(objectKey,bytes,{httpMetadata:{contentType:detected},customMetadata:{checksum,person:person.id,kind}});
 try{
  await command(db,user,key,"file_upload",payload,target,guards,[
   db.prepare(`INSERT INTO hrm_files(id,person_id,record_id,kind,object_key,original_name,mime_type,size_bytes,checksum,state,uploaded_by,expires_on,legal_hold,retention_actor_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,'quarantined',?,?,CASE WHEN EXISTS(SELECT 1 FROM hrm_legal_holds WHERE scope_kind='person' AND state='active' AND person_id=? AND category IN (?, '*')) THEN 1 ELSE 0 END,CASE WHEN EXISTS(SELECT 1 FROM hrm_legal_holds WHERE scope_kind='person' AND state='active' AND person_id=? AND category IN (?, '*')) THEN ? ELSE NULL END,?,?)`)
    .bind(target,person.id,recordId,kind,objectKey,name,detected,file.size,checksum,user.id,expiresOn,person.id,category,person.id,category,user.id,time,time),
   db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'file_uploaded',?,?,?,?)").bind(user.id,person.id,target,JSON.stringify({kind,state:"quarantined",size:file.size}),time),
   db.prepare("DELETE FROM hrm_write_guards"),
  ]);return target;
 }catch(error){await bucket.delete(objectKey);throw error}
}
export async function reviewFile(db:D1Database,user:WorkspaceUser,key:string,person:Person,fileId:string,version:number,state:"reviewed"|"rejected",reason:string):Promise<void>{
 requirePermission(user,"hrm.files.review");const file=await db.prepare("SELECT kind,uploaded_by FROM hrm_files WHERE id=? AND person_id=?").bind(fileId,person.id).first<{kind:string;uploaded_by:string}>();
 if(!file)throw new HrmError("not_found",404);authorize(person,user,file.kind);if(file.uploaded_by===user.id||own(person,user))throw new HrmError("self_approval",403);if(!reason)throw new HrmError("reason_required");
 const time=now();await command(db,user,key,"file_review",{person:person.id,fileId,version,state,reason},fileId,[guard(db,"EXISTS(SELECT 1 FROM hrm_files WHERE id=? AND person_id=? AND version=? AND state='quarantined')",[fileId,person.id,version])],[
  db.prepare("UPDATE hrm_files SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,version=version+1,updated_at=? WHERE id=?").bind(state,user.id,time,reason,time,fileId),
  db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'file_reviewed',?,?,?,?)").bind(user.id,person.id,fileId,JSON.stringify({state}),time),db.prepare("DELETE FROM hrm_write_guards")
 ]);
}
export async function downloadFile(db:D1Database,bucket:R2Bucket,user:WorkspaceUser,person:Person,fileId:string):Promise<Response>{
 const file=await db.prepare("SELECT * FROM hrm_files WHERE id=? AND person_id=?").bind(fileId,person.id).first<PrivateFile&{object_key:string}>();if(!file)throw new HrmError("not_found",404);authorize(person,user,file.kind);
 if(file.object_deleted_at)throw new HrmError("file_unavailable",404);
 if(file.state!=="reviewed"&&file.uploaded_by!==user.id&&!user.can("hrm.files.review"))throw new HrmError("not_found",404);
 const object=await bucket.get(file.object_key);if(!object)throw new HrmError("file_unavailable",404);await audit(db,user,"file_downloaded",person.id,file.id,{kind:file.kind,state:file.state});
 const extension=file.mime_type==="application/pdf"?"pdf":file.mime_type==="image/png"?"png":"jpg";
 return new Response(object.body,{headers:{"Content-Type":file.mime_type,"Content-Length":String(file.size_bytes),"Content-Disposition":`attachment; filename="document.${extension}"; filename*=UTF-8''${encodeURIComponent(file.original_name).replaceAll("'","%27")}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox","Referrer-Policy":"no-referrer"}});
}
