import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sqliteD1 } from './support/d1-sqlite.ts';
import { makeUser } from '../src/lib/workspace/roles.ts';
import { deleteFileVersion, fileVersions, canReadFile, changeFile, createFolder, downloadFile, fileChildren, fileItem, fileName, publicChildren, publicFile, readFile, MAX_UPLOAD } from '../src/lib/crm/files.ts';
import { reserveUpload, completeUpload } from '../src/lib/crm/direct-uploads.ts';
import type { WorkspaceUser } from '../src/lib/workspace/roles.ts';
import { ConflictError, NotFoundError, ValidationError } from '../src/lib/crm/core.ts';

const owner = makeUser({ id: 'owner', name: 'Owner', email: 'owner@example.test' }, false, ['sales_executive']);
const seller = makeUser({ id: 'seller', name: 'Seller', email: 'seller@example.test' }, false, ['sales_executive']);
const manager = makeUser({ id: 'manager', name: 'Manager', email: 'manager@example.test' }, false, ['sales_manager']);
const admin = makeUser({ id: 'admin', name: 'Admin', email: 'admin@example.test' }, true, []);
const partner = makeUser({ id: 'partner', name: 'Partner', email: 'partner@example.test' }, false, ['partner']);
const finance = makeUser({ id: 'finance', name: 'Finance', email: 'finance@example.test' }, false, ['finance']);
const hr = makeUser({ id: 'hr', name: 'HR', email: 'hr@example.test' }, false, ['hr']);
function form(values: Record<string, string | File | string[]>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) for (const entry of Array.isArray(value) ? value : [value]) form.append(key, entry);
  return form;
}
// Fixtures use the same reservation/completion boundary; only the test
// bucket receives bytes here. Production Worker code has no upload put().
async function createFile(db: D1Database, bucket: R2Bucket, user: WorkspaceUser, input: FormData): Promise<string> {
  if (input.get('kind') === 'folder') return createFolder(db,user,input);
  const file = input.get('upload');
  if (!(file instanceof File)) throw new ValidationError({upload:'invalid'});
  const ticket = await reserveUpload(db,user,{name:file.name,size:file.size,parent:String(input.get('parent') || '')});
  await bucket.put(ticket.object_key,file.stream());
  return completeUpload(db,bucket,user,ticket.id);
}
async function uploadFileVersion(db: D1Database, bucket: R2Bucket, user: WorkspaceUser, input: FormData): Promise<void> {
  const file = input.get('upload');
  if (!(file instanceof File)) throw new ValidationError({upload:'invalid'});
  const ticket = await reserveUpload(db,user,{name:file.name,size:file.size,fileId:String(input.get('id')),version:Number(input.get('version'))});
  await bucket.put(ticket.object_key,file.stream()); await completeUpload(db,bucket,user,ticket.id);
}
function setup() {
  const db = sqliteD1(); const content = sqliteD1('content');
  // An in-memory bucket double isolates policy tests; real workerd/R2 is verified separately.
  const objects = new Map<string, Uint8Array>();
  const bucket = {
    async put(key: string, stream: ReadableStream) { objects.set(key, new Uint8Array(await new Response(stream).arrayBuffer())); },
    async head(key: string) { const data = objects.get(key); return data ? { size:data.length,httpMetadata:{contentType:'application/octet-stream'} } : null; },
    async get(key: string) { const data = objects.get(key); return data ? { body: new Blob([data]).stream(), size: data.length } : null; },
    async delete(key: string) { objects.delete(key); },
  } as unknown as R2Bucket;
  const add = (name: string, parent = '') => createFile(db, bucket, owner, form({ kind: 'folder', name, parent }));
  const save = async (id: string, visibility: string, extras: Record<string, string | string[]> = {}) => {
    const item = (await fileItem(db, id))!;
    return changeFile(db, bucket, content, owner, form({ intent: 'save', id, version: String(item.version), name: item.name, visibility, ...extras }));
  };
  return { db, content, bucket, objects, add, save };
}

test('private is owner-only even for managers/admins, and other modules cannot read', async () => {
  const { db, add } = setup(); const id = await add('Private'); const item = (await fileItem(db, id))!;
  assert.equal(canReadFile(owner, item), true);
  for (const user of [seller, manager, admin, partner, finance, hr]) {
    assert.equal(canReadFile(user, item), false);
    await assert.rejects(readFile(db, user, id), NotFoundError);
    assert.equal((await fileChildren(db, user, null)).rows.length, 0);
  }
});

test('team sharing uses a permission and never includes finance, fulfillment, HR or partners implicitly', async () => {
  const { db, add, save } = setup(); const id = await add('Sales'); await save(id, 'team'); const item = (await fileItem(db, id))!;
  for (const user of [seller, manager, admin]) assert.equal(canReadFile(user, item), true);
  for (const user of [partner, finance, hr, null]) assert.equal(canReadFile(user, item), false);
  assert.equal((await fileChildren(db, seller, null)).rows[0].id, id);
});

test('specific people must be active CRM members; revocation is immediate', async () => {
  const { db, content, add, save } = setup(); const id = await add('Selected');
  await assert.rejects(save(id, 'people', { recipients: ['unknown'] }), ValidationError);
  content.raw.exec("INSERT INTO users(id,email,name,role) VALUES ('partner','partner@example.test','Partner',30)");
  db.raw.exec("INSERT INTO workspace_members(user_id,enabled,granted_by,created_at,updated_at) VALUES ('partner',1,'admin','now','now'); INSERT INTO workspace_roles(user_id,role,granted_by,granted_at) VALUES ('partner','partner','admin','now')");
  await save(id, 'people', { recipients: ['partner'] });
  assert.equal(canReadFile(partner, (await fileItem(db, id))!), true);
  assert.equal(canReadFile(seller, (await fileItem(db, id))!), false);
  db.raw.exec("UPDATE workspace_members SET enabled = 0 WHERE user_id = 'partner'");
  await assert.rejects(save(id, 'people', { recipients: ['partner'] }), ValidationError);
  await save(id, 'private'); assert.equal(canReadFile(partner, (await fileItem(db, id))!), false);
});

test('public folder inherits dynamically, private overrides stay hidden, old links never revive', async () => {
  const { db, add, save } = setup(); const root = await add('Public folder'); const child = await add('Inherited', root); const secret = await add('Secret', root);
  await save(secret, 'private');
  await assert.rejects(save(root, 'internet'), ValidationError);
  await save(root, 'internet', { confirm_public: 'yes' });
  const token = (await fileItem(db, root))!.public_token;
  assert.equal((await publicFile(db, token, child))!.id, child);
  assert.equal(await publicFile(db, token, secret), null);
  assert.deepEqual((await publicChildren(db, (await publicFile(db, token))!, root)).rows.map(row => row.id), [child]);
  await save(root, 'private');
  assert.equal(await publicFile(db, token, child), null);
  assert.equal(canReadFile(seller, (await fileItem(db, child))!), false);
  await save(root, 'internet', { confirm_public: 'yes' });
  assert.equal(await publicFile(db, token), null);
});

test('only owners may create in folders, rename, delete, or reshare, and stale writes fail', async () => {
  const { db, content, bucket, add, save } = setup(); const id = await add('Shared'); await save(id, 'team');
  await assert.rejects(createFile(db, bucket, seller, form({ kind: 'folder', name: 'Sneak', parent: id })), NotFoundError);
  for (const intent of ['save', 'delete']) await assert.rejects(changeFile(db, bucket, content, manager, form({ intent, id, version: '2', name: 'Sneak', visibility: 'internet', confirm_public: 'yes' })), NotFoundError);
  await assert.rejects(changeFile(db, bucket, content, owner, form({ intent: 'save', id, version: '1', name: 'Stale', visibility: 'private' })), ConflictError);
  assert.equal((await fileItem(db, id))!.name, 'Shared');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM crm_file_audit').first<{n:number}>())!.n, 2);
});

test('upload validation, safe attachment response, namespace isolation, deletion, empty folder guard', async () => {
  const { db, content, bucket, objects, add } = setup(); const parent = await add('Folder');
  await assert.rejects(createFile(db, bucket, owner, form({ kind: 'file', upload: new File([], 'empty') })), ValidationError);
  await assert.rejects(createFile(db, bucket, owner, form({ kind: 'file', upload: new File([new Uint8Array(MAX_UPLOAD + 1)], 'huge') })), ValidationError);
  const id = await createFile(db, bucket, owner, form({ kind: 'file', parent, upload: new File(['<script>test</script>'], 'tài liệu.html', { type: 'text/html' }) }));
  const item = (await fileItem(db, id))!;
  assert.ok(item.object_key!.startsWith('crm-files/')); assert.equal(objects.size, 1);
  const response = await downloadFile(bucket, item);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.ok(response.headers.get('content-disposition')!.startsWith('attachment;'));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(await response.text(), '<script>test</script>');
  await assert.rejects(changeFile(db, bucket, content, owner, form({ intent: 'delete', id: parent, version: '1' })), ValidationError);
  await changeFile(db, bucket, content, owner, form({ intent: 'delete', id, version: '1' }));
  assert.equal(await fileItem(db, id), null); assert.equal(objects.size, 0);
  await changeFile(db, bucket, content, owner, form({ intent: 'delete', id: parent, version: '1' })); assert.equal(await fileItem(db, parent), null);
});

test('filenames reject controls and path traversal; search treats SQL and wildcard text literally', async () => {
  for (const name of ['../secret', 'a\\b', '\n', '.', '..', 'a\u0000b']) assert.throws(() => fileName(name), ValidationError);
  assert.equal(fileName(' Báo giá.pdf '), 'Báo giá.pdf');
  const { db, add } = setup(); await add('100% sales'); await add('Sales report');
  assert.equal((await fileChildren(db, owner, null, 1, '%')).rows.length, 1);
  assert.equal((await fileChildren(db, owner, null, 1, "' OR 1=1 --")).rows.length, 0);
});

test('access filtering precedes pagination and non-CRM members cannot list public items', async () => {
  const { db, add, save } = setup();
  for (let i = 0; i < 55; i++) await add(`Private ${String(i).padStart(2, '0')}`);
  const shared = await add('Visible sales document'); await save(shared, 'team');
  const first = await fileChildren(db, seller, null);
  assert.deepEqual(first.rows.map(row => row.id), [shared]); assert.equal(first.more, false);
  const ownerPage = await fileChildren(db, owner, null); assert.equal(ownerPage.rows.length, 50); assert.equal(ownerPage.more, true);
  assert.equal((await fileChildren(db, owner, null, 2)).rows.length, 6);
  await save(shared, 'internet', { confirm_public: 'yes' });
  assert.equal((await fileChildren(db, hr, null)).rows.length, 0);
});


test('version uploads preserve earlier bytes, name and sharing; readers cannot upload or delete', async () => {
  const { db, content, bucket, objects, save } = setup();
  const id = await createFile(db,bucket,owner,form({kind:'file',upload:new File(['first'],'Original.txt')}));
  await save(id,'team');
  const initial = (await fileItem(db,id))!;
  const old = (await fileVersions(db,initial)).rows[0];
  const upload = form({id,version:String(initial.version),upload:new File(['second'],'Revision.txt')});
  await assert.rejects(uploadFileVersion(db,bucket,seller,upload),NotFoundError);
  await uploadFileVersion(db,bucket,owner,upload);
  const item = (await fileItem(db,id))!;
  assert.equal(item.name,'Original.txt'); assert.equal(item.visibility,'team');
  const versions = (await fileVersions(db,item)).rows;
  assert.deepEqual(versions.map(v=>v.number),[2,1]); assert.equal(objects.size,2);
  assert.equal(await (await downloadFile(bucket,item,db,old.id)).text(),'first');
  assert.equal(await (await downloadFile(bucket,item)).text(),'second');
  await assert.rejects(uploadFileVersion(db,bucket,owner,upload),ConflictError);
  await assert.rejects(deleteFileVersion(db,bucket,seller,form({id,revision:old.id,version:String(item.version),confirm_delete:'yes'})),NotFoundError);
  await deleteFileVersion(db,bucket,admin,form({id,revision:versions[0].id,version:String(item.version),confirm_delete:'yes'}));
  const fallback = (await fileItem(db,id))!;
  assert.equal(await (await downloadFile(bucket,fallback)).text(),'first');
  assert.equal((await downloadFile(bucket,fallback,db,versions[0].id)).status,404);
  await assert.rejects(deleteFileVersion(db,bucket,owner,form({id,revision:old.id,version:String(item.version),confirm_delete:'yes'})),ConflictError);
  await deleteFileVersion(db,bucket,owner,form({id,revision:old.id,version:String(fallback.version),confirm_delete:'yes'}));
  assert.equal(await fileItem(db,id),null); assert.equal(objects.size,0);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM crm_file_audit WHERE action = 'version_deleted'").first<{n:number}>())!.n,2);
});

test('a file owner cannot delete another uploader version or bypass it through whole-file deletion', async () => {
  const { db, content, bucket } = setup();
  const id = await createFile(db,bucket,owner,form({kind:'file',upload:new File(['original'],'Original.txt')}));
  db.raw.prepare("UPDATE crm_file_versions SET uploader_id = 'another-uploader' WHERE file_id = ?").run(id);
  const item = (await fileItem(db,id))!;
  const revision = (await fileVersions(db,item)).rows[0];
  await assert.rejects(deleteFileVersion(db,bucket,owner,form({id,revision:revision.id,version:String(item.version),confirm_delete:'yes'})),NotFoundError);
  await assert.rejects(changeFile(db,bucket,content,owner,form({intent:'delete',id,version:String(item.version)})),NotFoundError);
});

test('public links expose only this file’s live versions, and sharing revocation hides every version', async () => {
  const { db, bucket, save } = setup();
  const id = await createFile(db,bucket,owner,form({kind:'file',upload:new File(['v1'],'Public.txt')}));
  const other = await createFile(db,bucket,owner,form({kind:'file',upload:new File(['secret'],'Secret.txt')}));
  const otherVersion = (await fileVersions(db,(await fileItem(db,other))!)).rows[0];
  await save(id,'internet',{confirm_public:'yes'});
  let item = (await fileItem(db,id))!;
  await uploadFileVersion(db,bucket,owner,form({id,version:String(item.version),upload:new File(['v2'],'Public-v2.txt')}));
  item = (await fileItem(db,id))!;
  const publicItem = (await publicFile(db,item.public_token))!;
  assert.equal((await fileVersions(db,publicItem)).rows.length,2);
  assert.equal((await downloadFile(bucket,publicItem,db,otherVersion.id)).status,404);
  const old = (await fileVersions(db,item)).rows[1];
  await deleteFileVersion(db,bucket,owner,form({id,revision:old.id,version:String(item.version),confirm_delete:'yes'}));
  assert.equal((await downloadFile(bucket,(await publicFile(db,item.public_token))!,db,old.id)).status,404);
  await save(id,'private'); assert.equal(await publicFile(db,item.public_token),null);
});

test('the original uploader may delete their version while another file owner cannot', async () => {
  const { db, bucket, save } = setup();
  const id = await createFile(db,bucket,owner,form({kind:'file',upload:new File(['old'],'Original.txt')}));
  await save(id,'team');
  const item = (await fileItem(db,id))!;
  const revision = (await fileVersions(db,item)).rows[0];
  // Represents a version retained from an earlier owner/uploader arrangement.
  db.raw.prepare('UPDATE crm_file_versions SET uploader_id = ? WHERE id = ?').run(seller.id,revision.id);
  await assert.rejects(deleteFileVersion(db,bucket,owner,form({id,revision:revision.id,version:String(item.version),confirm_delete:'yes'})),NotFoundError);
  await deleteFileVersion(db,bucket,seller,form({id,revision:revision.id,version:String(item.version),confirm_delete:'yes'}));
  assert.equal(await fileItem(db,id),null);
});
