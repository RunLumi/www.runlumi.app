import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sqliteD1 } from './support/d1-sqlite.ts';
import { makeUser } from '../src/lib/workspace/roles.ts';
import { completeUpload, reserveUpload, presignUpload, cleanupUploads, uploadConfig } from '../src/lib/crm/direct-uploads.ts';
import { fileItem, fileVersions, createFolder } from '../src/lib/crm/files.ts';
import { ConflictError, NotFoundError, ValidationError } from '../src/lib/crm/core.ts';
const owner = makeUser({id:'owner',name:'Owner',email:'owner@example.test'},false,['sales_executive']);
const other = makeUser({id:'other',name:'Other',email:'other@example.test'},false,['sales_executive']);
function setup() {
  const db = sqliteD1();
  const objects = new Map<string,{size:number;httpMetadata:{contentType:string}}>();
  const bucket = { async head(key:string) { return objects.get(key) ?? null; },async delete(key:string) { objects.delete(key); } } as unknown as R2Bucket;
  const upload = async (name = 'File.txt', extra = {}) => {
    const ticket = await reserveUpload(db,owner,{name,size:8,...extra},1000);
    objects.set(ticket.object_key,{size:ticket.size,httpMetadata:{contentType:'application/octet-stream'}});
    return ticket;
  };
  return {db,bucket,objects,upload};
}

test('presign restricts operation, expiry, content length and create-only headers to an allocated CRM key', async () => {
  const { upload } = setup(); const ticket = await upload();
  const config = {accountId:'0123456789abcdef0123456789abcdef',bucketName:'test-bucket',accessKeyId:'synthetic-key',secretAccessKey:'synthetic-secret'};
  const signed = await presignUpload(config,ticket); const url = new URL(signed.url);
  assert.equal(url.hostname,`${config.accountId}.r2.cloudflarestorage.com`);
  assert.equal(url.pathname,`/test-bucket/${ticket.object_key}`);
  assert.equal(url.searchParams.get('X-Amz-Expires'),'300');
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'),'content-length;content-type;host;if-none-match');
  assert.equal(signed.headers['If-None-Match'],'*'); assert.equal(signed.headers['Content-Type'],'application/octet-stream');
  assert.ok(!signed.url.includes(config.secretAccessKey)); assert.match(url.searchParams.get('X-Amz-Signature')!,/^[a-f0-9]{64}$/);
});

test('upload reservations validate role, size, name and folder ownership before issuing storage access', async () => {
  const {db} = setup();
  const folder = new FormData();folder.set('kind','folder');folder.set('name','Private folder');
  const id = await createFolder(db,owner,folder);
  await assert.rejects(reserveUpload(db,other,{name:'x',size:1,parent:id}),NotFoundError);
  for (const size of [0,-1,20*1024*1024+1,NaN,1.5]) await assert.rejects(reserveUpload(db,owner,{name:'x',size}),ValidationError);
  await assert.rejects(reserveUpload(db,owner,{name:'../secret',size:1}),ValidationError);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM crm_file_uploads').first<{n:number}>())!.n,0);
});

test('completion requires actual bytes and matching size/type; another user cannot complete a ticket', async () => {
  const {db,bucket,objects} = setup(); const ticket = await reserveUpload(db,owner,{name:'x',size:8},1000);
  await assert.rejects(completeUpload(db,bucket,other,ticket.id,1001),NotFoundError);
  await assert.rejects(completeUpload(db,bucket,owner,ticket.id,1001),ValidationError);
  objects.set(ticket.object_key,{size:9,httpMetadata:{contentType:'application/octet-stream'}});
  await assert.rejects(completeUpload(db,bucket,owner,ticket.id,1001),ValidationError);
  objects.set(ticket.object_key,{size:8,httpMetadata:{contentType:'text/html'}});
  await assert.rejects(completeUpload(db,bucket,owner,ticket.id,1001),ValidationError);
  assert.equal(await fileItem(db,ticket.file_id),null);
});

test('completion commits a private file and original version exactly once, without reading object bytes', async () => {
  const {db,bucket,upload} = setup(); const ticket = await upload('Báo giá.pdf');
  assert.equal(await completeUpload(db,bucket,owner,ticket.id,1001),ticket.file_id);
  assert.equal(await completeUpload(db,bucket,owner,ticket.id,1002),ticket.file_id);
  const file = (await fileItem(db,ticket.file_id))!;
  assert.equal(file.visibility,'private');assert.equal(file.name,'Báo giá.pdf');
  assert.equal((await fileVersions(db,file)).rows.length,1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM crm_files').first<{n:number}>())!.n,1);
});

test('version completion preserves previous objects and rejects a stale concurrent version', async () => {
  const {db,bucket,upload,objects} = setup(); const first = await upload();
  await completeUpload(db,bucket,owner,first.id,1001); const initial = (await fileItem(db,first.file_id))!;
  const a = await upload('New.txt',{fileId:initial.id,version:initial.version});
  const b = await upload('Concurrent.txt',{fileId:initial.id,version:initial.version});
  await completeUpload(db,bucket,owner,a.id,1002);
  await assert.rejects(completeUpload(db,bucket,owner,b.id,1002),ConflictError);
  const current = (await fileItem(db,initial.id))!;
  assert.equal(current.object_key,a.object_key);assert.equal(current.name,initial.name);
  assert.equal((await fileVersions(db,current)).rows.length,2);assert.ok(objects.has(first.object_key));
});

test('expired reservations cannot be finalized and scheduled cleanup never deletes a live version', async () => {
  const {db,bucket,upload,objects} = setup();const live = await upload();const expired = await upload();
  await completeUpload(db,bucket,owner,live.id,1001);
  await assert.rejects(completeUpload(db,bucket,owner,expired.id,1300),ValidationError);
  await cleanupUploads({DB:db,FILES:bucket},5000);
  assert.ok(objects.has(live.object_key));assert.equal(objects.has(expired.object_key),false);
  assert.equal((await db.prepare('SELECT state FROM crm_file_uploads WHERE id = ?').bind(expired.id).first<{state:string}>())!.state,'expired');
});

test('outstanding upload reservations are capped per user and do not store client-selected keys', async () => {
  const {db,upload} = setup();for(let i=0;i<20;i++) await upload(`File ${i}.txt`);
  await assert.rejects(upload('too many'),ValidationError);
  const ticket = await reserveUpload(db,other,{name:'Other.txt',size:1},1000);
  assert.match(ticket.object_key,/^crm-files\/direct\/[a-f0-9-]{36}$/);
});

test('local S3 overrides are ignored for production origins', () => {
  const env = { CRM_R2_ACCESS_KEY_ID:'synthetic',CRM_R2_SECRET_ACCESS_KEY:'synthetic',CRM_R2_LOCAL_ENDPOINT:'http://127.0.0.1:4402/cdn-cgi/local/r2/s3' } as Env;
  assert.equal(uploadConfig(env,'https://runlumi.app')!.endpoint,undefined);
  assert.equal(uploadConfig(env,'http://127.0.0.1:4402')!.endpoint,env.CRM_R2_LOCAL_ENDPOINT);
  assert.equal(uploadConfig({} as Env),null);
});


test('cleanup removes replays into deleted keys but cannot delete live retained versions', async () => {
  const {db,bucket,upload,objects} = setup();const ticket = await upload();
  await completeUpload(db,bucket,owner,ticket.id,1001);
  db.raw.prepare("UPDATE crm_file_versions SET deleted_at = 'deleted', deleted_by = 'owner' WHERE file_id = ?").run(ticket.file_id);
  // A reusable PUT URL can recreate a deleted key until expiry, but cannot
  // resurrect its tombstoned file/version. The scheduled cleanup removes it.
  objects.set(ticket.object_key,{size:8,httpMetadata:{contentType:'application/octet-stream'}});
  await assert.rejects(completeUpload(db,bucket,owner,ticket.id,1002),NotFoundError);
  await cleanupUploads({DB:db,FILES:bucket},5000);
  assert.equal(objects.has(ticket.object_key),false);
});
