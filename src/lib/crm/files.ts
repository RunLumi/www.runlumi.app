import type { WorkspaceUser } from "../workspace/roles";
import { permissionsFor } from "../workspace/roles";
import { workspaceMembers } from "../workspace/members";
import { ConflictError, NotFoundError, fail, text } from "./core";

export const MAX_UPLOAD = 20 * 1024 * 1024;
export const visibilityOptions = ['private', 'team', 'people', 'internet', 'inherit'] as const;
export type Visibility = typeof visibilityOptions[number];
export interface FileItem {
  id: string; parent_id: string | null; owner_id: string; name: string; kind: 'folder' | 'file';
  object_key: string | null; size: number; visibility: Visibility; recipients: string; public_token: string;
  version: number; created_at: string; updated_at: string; depth: number; policy_id: string;
  policy_token: string; effective_visibility: Visibility; effective_recipients: string; policy_owner: string;
}
// Only live descendants of live roots enter the tree. There is no moving or
// reparenting, and every creation enforces the depth/owner boundary.
const tree = `WITH RECURSIVE tree AS (
 SELECT n.*, n.id AS policy_id, 0 AS depth FROM crm_files n WHERE parent_id IS NULL AND deleted_at IS NULL
 UNION ALL
 SELECT n.*, CASE WHEN n.visibility = 'inherit' THEN t.policy_id ELSE n.id END, t.depth + 1
 FROM crm_files n JOIN tree t ON n.parent_id = t.id WHERE n.deleted_at IS NULL AND t.depth < 20
) SELECT t.*, p.visibility AS effective_visibility, p.recipients AS effective_recipients, p.owner_id AS policy_owner, p.public_token AS policy_token
FROM tree t JOIN crm_files p ON p.id = t.policy_id`;

export function canReadFile(user: WorkspaceUser | null, item: FileItem): boolean {
  if (!user?.can('crm.access')) return false;
  if (item.owner_id === user.id) return true;
  if (item.effective_visibility === 'internet') return true;
  if (item.effective_visibility === 'team') return user.can('crm.files.team');
  return item.effective_visibility === 'people' && (JSON.parse(item.effective_recipients) as string[]).includes(user.id);
}

export async function fileItem(db: D1Database, id: string): Promise<FileItem | null> {
  return db.prepare(`${tree} WHERE t.id = ?`).bind(id).first<FileItem>();
}

export async function readFile(db: D1Database, user: WorkspaceUser, id: string): Promise<FileItem> {
  const item = await fileItem(db, id);
  if (!item || !canReadFile(user, item)) throw new NotFoundError();
  return item;
}

export async function fileChildren(db: D1Database, user: WorkspaceUser, parent: string | null, page = 1, query = ''): Promise<{ rows: FileItem[]; more: boolean }> {
  if (!user.can('crm.access')) return { rows: [], more: false };
  // Filter before LIMIT so inaccessible rows never affect pagination or leak names.
  const rows = (await db.prepare(`${tree} WHERE ${parent ? 't.parent_id = ?' : "(t.parent_id IS NULL OR (t.visibility <> 'inherit' AND t.owner_id <> ?))"}
    AND (t.owner_id = ? OR p.visibility = 'internet' OR (p.visibility = 'team' AND ? = 1)
      OR (p.visibility = 'people' AND EXISTS (SELECT 1 FROM json_each(p.recipients) WHERE value = ?)))
    AND instr(lower(t.name), lower(?)) > 0
    ORDER BY t.kind DESC, t.name COLLATE NOCASE, t.id LIMIT 51 OFFSET ?`)
    .bind(parent ?? user.id, user.id, user.can('crm.files.team') ? 1 : 0, user.id, query, (page - 1) * 50).all<FileItem>()).results;
  return { rows: rows.slice(0, 50), more: rows.length > 50 };
}

export async function filePeople(db: D1Database, contentDb: D1Database): Promise<{ id: string; name: string }[]> {
  const members = (await workspaceMembers(db, contentDb))
    .filter(member => member.active && member.enabled && permissionsFor(member.admin, member.roles).has('crm.access'))
    .map(member => ({ id: member.user_id, name: member.name || member.email }));
  const admins = (await contentDb.prepare("SELECT id, COALESCE(NULLIF(name, ''), email) AS name FROM users WHERE role = 50 AND disabled = 0 LIMIT 100").all<{ id: string; name: string }>()).results;
  return [...new Map([...members, ...admins].map(person => [person.id, person])).values()];
}

export function fileName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 180 || /[\x00-\x1f\x7f/\\]/.test(name) || name === '.' || name === '..') fail('name', 'invalid');
  return name;
}

export async function createFile(db: D1Database, bucket: R2Bucket, user: WorkspaceUser, form: FormData): Promise<string> {
  if (!user.can('crm.access')) throw new NotFoundError();
  const parentId = text(form, 'parent', 100) || null;
  let parent: FileItem | null = null;
  if (parentId) {
    parent = await readFile(db, user, parentId);
    if (parent.kind !== 'folder' || parent.owner_id !== user.id) throw new NotFoundError();
    if (parent.depth >= 20) fail('parent', 'depth');
  }
  const kind = text(form, 'kind', 20);
  if (kind !== 'file' && kind !== 'folder') fail('kind', 'invalid');
  const upload = form.get('upload');
  if (kind === 'file' && (!(upload instanceof File) || !upload.size || upload.size > MAX_UPLOAD)) fail('upload', 'size');
  const file = upload instanceof File ? upload : null;
  const name = fileName(kind === 'file' ? file!.name : text(form, 'name', 180, { required: true }));
  const id = crypto.randomUUID();
  const key = kind === 'file' ? `crm-files/${id}` : null;
  const now = new Date().toISOString();
  if (key) await bucket.put(key, file!.stream(), { httpMetadata: { contentType: 'application/octet-stream' } });
  try {
    // Recheck the parent in the write, including concurrent removal.
    const result = await db.prepare(`INSERT INTO crm_files
      (id,parent_id,owner_id,name,kind,object_key,size,visibility,public_token,last_actor,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ? IS NULL OR EXISTS
      (SELECT 1 FROM crm_files WHERE id = ? AND owner_id = ? AND kind = 'folder' AND deleted_at IS NULL)`)
      .bind(id, parentId, user.id, name, kind, key, kind === 'file' ? file!.size : 0, parent ? 'inherit' : 'private', crypto.randomUUID(), user.id, now, now, parentId, parentId, user.id).run();
    if (!result.meta.changes) throw new NotFoundError();
  } catch (error) {
    if (key) await bucket.delete(key);
    throw error;
  }
  return id;
}

export async function changeFile(db: D1Database, bucket: R2Bucket, contentDb: D1Database, user: WorkspaceUser, form: FormData): Promise<void> {
  const item = await readFile(db, user, text(form, 'id', 100));
  if (item.owner_id !== user.id) throw new NotFoundError();
  const version = Number(form.get('version'));
  if (!Number.isSafeInteger(version) || version !== item.version) throw new ConflictError();
  const intent = text(form, 'intent', 20);
  const now = new Date().toISOString();
  let result: D1Result;
  if (intent === 'delete') {
    // Empty folders only: never recursively remove another file by accident.
    result = await db.prepare(`UPDATE crm_files SET deleted_at = ?, updated_at = ?, last_actor = ?, version = version + 1
      WHERE id = ? AND owner_id = ? AND version = ? AND deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM crm_files c WHERE c.parent_id = crm_files.id AND c.deleted_at IS NULL)`)
      .bind(now, now, user.id, item.id, user.id, version).run();
    if (!result.meta.changes) fail('folder', 'not_empty_or_changed');
    if (item.object_key?.startsWith('crm-files/')) await bucket.delete(item.object_key);
    return;
  }
  if (intent !== 'save') fail('intent', 'invalid');
  const visibility = text(form, 'visibility', 20) as Visibility;
  if (!visibilityOptions.includes(visibility) || (visibility === 'inherit' && !item.parent_id)) fail('visibility', 'invalid');
  if (visibility === 'internet' && form.get('confirm_public') !== 'yes') fail('confirm_public', 'required');
  const recipients = [...new Set(form.getAll('recipients').filter((value): value is string => typeof value === 'string'))];
  if (recipients.length > 100) fail('recipients', 'invalid');
  if (visibility === 'people') {
    const people = new Set((await filePeople(db, contentDb)).map(person => person.id));
    if (!recipients.length || recipients.some(id => !people.has(id))) fail('recipients', 'invalid');
  }
  result = await db.prepare(`UPDATE crm_files SET name = ?, visibility = ?, recipients = ?, public_token = ?,
    updated_at = ?, last_actor = ?, version = version + 1 WHERE id = ? AND owner_id = ? AND version = ? AND deleted_at IS NULL`)
    .bind(fileName(text(form, 'name', 180, { required: true })), visibility, JSON.stringify(visibility === 'people' ? recipients : []),
      visibility === 'internet' && item.visibility === 'internet' ? item.public_token : crypto.randomUUID(), now, user.id, item.id, user.id, version).run();
  if (!result.meta.changes) throw new ConflictError();
}

export async function publicFile(db: D1Database, token: string, child?: string): Promise<FileItem | null> {
  // Link tokens are bearer capabilities. A child must inherit this exact policy;
  // private overrides and separate public policies never leak into this link.
  const root = await db.prepare(`${tree} WHERE t.public_token = ? AND t.visibility = 'internet'`).bind(token).first<FileItem>();
  if (!root) return null;
  if (!child || child === root.id) return root;
  const item = await fileItem(db, child);
  if (!item || item.policy_id !== root.id) return null;
  // policy_id alone also ensures membership in the immutable descendant tree.
  return item;
}

export async function publicChildren(db: D1Database, item: FileItem, policyId: string, page = 1): Promise<{ rows: FileItem[]; more: boolean }> {
  const rows = (await db.prepare(`${tree} WHERE t.parent_id = ? AND t.policy_id = ? ORDER BY t.kind DESC, t.name COLLATE NOCASE, t.id LIMIT 51 OFFSET ?`)
    .bind(item.id, policyId, (page - 1) * 50).all<FileItem>()).results;
  return { rows: rows.slice(0, 50), more: rows.length > 50 };
}

export async function downloadFile(bucket: R2Bucket, item: FileItem): Promise<Response> {
  if (item.kind !== 'file' || !item.object_key?.startsWith('crm-files/')) return new Response('Not found', { status: 404 });
  const object = await bucket.get(item.object_key);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, { headers: {
    'Content-Type': 'application/octet-stream', 'Content-Length': String(object.size),
    'Content-Disposition': `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(item.name).replaceAll("'", '%27')}`,
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox", 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
  } });
}
