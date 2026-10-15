import { AwsV4Signer } from 'aws4fetch';
import type { WorkspaceUser } from '../workspace/roles';
import { ConflictError, NotFoundError, fail } from './core';
import { fileName, readFile } from './files';
import { MAX_UPLOAD } from './file-upload-limits';

export const UPLOAD_TTL = 300;
export interface UploadConfig { accountId: string; bucketName: string; accessKeyId: string; secretAccessKey: string; endpoint?: string }
export interface UploadTicket { id: string; user_id: string; file_id: string; parent_id: string | null; expected_version: number | null; name: string; size: number; object_key: string; created_at: number; expires_at: number; state: string }
export interface UploadInput { name: string; size: number; parent?: string; fileId?: string; version?: number }

export function uploadConfig(env: Env, origin?: string): UploadConfig | null {
  if (!env.CRM_R2_ACCESS_KEY_ID || !env.CRM_R2_SECRET_ACCESS_KEY) return null;
  let endpoint: string | undefined;
  if (env.CRM_R2_LOCAL_ENDPOINT && origin && ['localhost','127.0.0.1'].includes(new URL(origin).hostname)) {
    const local = new URL(env.CRM_R2_LOCAL_ENDPOINT);
    if (local.protocol === 'http:' && ['localhost','127.0.0.1'].includes(local.hostname)) endpoint = local.href.replace(/\/$/,'');
  }
  return { endpoint, accountId: '73fe06de8746378768229a64680dd62f', bucketName: 'lumi-job-files', accessKeyId: env.CRM_R2_ACCESS_KEY_ID, secretAccessKey: env.CRM_R2_SECRET_ACCESS_KEY };
}

export async function presignUpload(config: UploadConfig, ticket: UploadTicket): Promise<{ url: string; headers: Record<string,string> }> {
  const url = new URL(`${config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`}/${config.bucketName}/${ticket.object_key}`);
  url.searchParams.set('X-Amz-Expires',String(UPLOAD_TTL));
  // Sign the exact byte length and create-only condition. Replaying a URL must
  // not overwrite a committed version. File names never enter the object path.
  const headers = { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' };
  const signer = new AwsV4Signer({ url: url.href, method: 'PUT', headers: { ...headers, 'Content-Length': String(ticket.size) }, accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service:'s3', region:'auto', signQuery:true, allHeaders:true, datetime: new Date(ticket.created_at * 1000).toISOString().replace(/[:-]|\.\d{3}/g,'') });
  const signed = await signer.sign();
  // Content-Length is browser-controlled, generated from the File body.
  return { url: signed.url.toString(), headers };
}

export async function reserveUpload(db: D1Database, user: WorkspaceUser, input: UploadInput, now = Math.floor(Date.now()/1000)): Promise<UploadTicket> {
  if (!user.can('crm.access')) throw new NotFoundError();
  if (!input || typeof input.name !== 'string') fail('name','invalid');
  const name = fileName(input.name);
  if (!Number.isSafeInteger(input.size) || input.size <= 0 || input.size > MAX_UPLOAD) fail('upload','size');
  let parent: string | null = null;
  let fileId: string = crypto.randomUUID(); let version: number | null = null;
  if (input.fileId) {
    const file = await readFile(db,user,String(input.fileId));
    if (file.kind !== 'file' || file.owner_id !== user.id) throw new NotFoundError();
    if (file.version !== input.version) throw new ConflictError();
    fileId = file.id; version = file.version;
  } else if (input.parent) {
    const folder = await readFile(db,user,String(input.parent));
    if (folder.kind !== 'folder' || folder.owner_id !== user.id) throw new NotFoundError();
    if (folder.depth >= 20) fail('parent','depth');
    parent = folder.id;
  }
  const id = crypto.randomUUID();
  const ticket: UploadTicket = { id,user_id:user.id,file_id:fileId,parent_id:parent,expected_version:version,name,size:input.size,object_key:`crm-files/direct/${id}`,created_at:now,expires_at:now+UPLOAD_TTL,state:'pending' };
  const result = await db.prepare(`INSERT INTO crm_file_uploads(id,user_id,file_id,parent_id,expected_version,name,size,object_key,created_at,expires_at)
    SELECT ?,?,?,?,?,?,?,?,?,? WHERE
    (SELECT COUNT(*) FROM crm_file_uploads WHERE user_id = ? AND created_at > ?) < 60 AND
    (SELECT COUNT(*) FROM crm_file_uploads WHERE user_id = ? AND state = 'pending' AND expires_at > ?) < 20`)
    .bind(id,user.id,fileId,parent,version,name,input.size,ticket.object_key,now,ticket.expires_at,user.id,now-60,user.id,now).run();
  if (!result.meta.changes) fail('upload','rate_limit');
  return ticket;
}

export async function completeUpload(db: D1Database, bucket: R2Bucket, user: WorkspaceUser, id: string, now = Math.floor(Date.now()/1000)): Promise<string> {
  if (!user.can('crm.access')) throw new NotFoundError();
  const ticket = await db.prepare('SELECT * FROM crm_file_uploads WHERE id = ? AND user_id = ?').bind(id,user.id).first<UploadTicket>();
  if (!ticket) throw new NotFoundError();
  // Completed requests are idempotent, but must still pass current visibility.
  if (ticket.state === 'complete') { await readFile(db,user,ticket.file_id); return ticket.file_id; }
  if (ticket.state !== 'pending' || ticket.expires_at <= now) fail('upload','expired');
  if (ticket.expected_version !== null) {
    const file = await readFile(db,user,ticket.file_id);
    if (file.owner_id !== user.id || file.kind !== 'file') throw new NotFoundError();
    if (file.version !== ticket.expected_version) throw new ConflictError();
  } else if (ticket.parent_id) {
    const folder = await readFile(db,user,ticket.parent_id);
    if (folder.owner_id !== user.id || folder.kind !== 'folder') throw new NotFoundError();
  }
  const object = await bucket.head(ticket.object_key);
  if (!object) fail('upload','not_uploaded');
  if (object.size !== ticket.size || object.httpMetadata?.contentType !== 'application/octet-stream') fail('upload','invalid');
  const stamp = new Date(now*1000).toISOString();
  const pending = "EXISTS (SELECT 1 FROM crm_file_uploads WHERE id = ? AND user_id = ? AND state = 'pending' AND expires_at > ?)";
  const insert = ticket.expected_version === null
    ? db.prepare(`INSERT INTO crm_files(id,parent_id,owner_id,name,kind,object_key,size,visibility,public_token,last_actor,created_at,updated_at)
      SELECT ?,?,?,?,'file',?,?,?,?,?,?,? WHERE ${pending} AND
      (? IS NULL OR EXISTS (SELECT 1 FROM crm_files WHERE id = ? AND owner_id = ? AND kind = 'folder' AND deleted_at IS NULL))`)
      .bind(ticket.file_id,ticket.parent_id,user.id,ticket.name,ticket.object_key,ticket.size,ticket.parent_id ? 'inherit' : 'private',crypto.randomUUID(),user.id,stamp,stamp,ticket.id,user.id,now,ticket.parent_id,ticket.parent_id,user.id)
    : db.prepare(`INSERT INTO crm_file_versions(id,file_id,number,object_key,name,size,uploader_id,uploader_name,created_at)
      SELECT ?,?,COALESCE((SELECT MAX(number) FROM crm_file_versions WHERE file_id = ?),0)+1,?,?,?,?,?,? WHERE ${pending}
      AND EXISTS (SELECT 1 FROM crm_files WHERE id = ? AND owner_id = ? AND version = ? AND deleted_at IS NULL)`)
      .bind(ticket.id,ticket.file_id,ticket.file_id,ticket.object_key,ticket.name,ticket.size,user.id,user.name,stamp,ticket.id,user.id,now,ticket.file_id,user.id,ticket.expected_version);
  const revisionId = ticket.expected_version === null ? ticket.file_id : ticket.id;
  const results = await db.batch([insert,
    db.prepare(`UPDATE crm_file_uploads SET state = 'complete' WHERE id = ? AND user_id = ? AND state = 'pending'
      AND EXISTS (SELECT 1 FROM crm_file_versions WHERE id = ? AND file_id = ? AND deleted_at IS NULL)`)
      .bind(ticket.id,user.id,revisionId,ticket.file_id),
  ]);
  if (!results[0].meta.changes) {
    const again = await db.prepare("SELECT state FROM crm_file_uploads WHERE id = ? AND user_id = ?").bind(id,user.id).first<{ state: string }>();
    if (again?.state !== 'complete') throw new ConflictError();
    await readFile(db,user,ticket.file_id);
  }
  return ticket.file_id;
}

export async function cleanupUploads(env: Pick<Env,'DB'|'FILES'>, now = Math.floor(Date.now()/1000)): Promise<void> {
  // Grace allows already-started PUTs to finish. Never delete a live version's key.
  const rows = (await env.DB.prepare(`SELECT id,object_key FROM crm_file_uploads u WHERE expires_at < ? AND (
    (state = 'pending' AND NOT EXISTS (SELECT 1 FROM crm_file_versions v WHERE v.object_key = u.object_key))
    OR (state = 'complete' AND EXISTS (SELECT 1 FROM crm_file_versions v WHERE v.object_key = u.object_key AND v.deleted_at IS NOT NULL))) LIMIT 100`).bind(now-3600).all<{id:string;object_key:string}>()).results;
  for (const row of rows) {
    await env.FILES.delete(row.object_key);
    await env.DB.prepare("UPDATE crm_file_uploads SET state = 'expired' WHERE id = ? AND state IN ('pending','complete')").bind(row.id).run();
  }
}
