import { localFetch as fetch } from "./helpers.mjs";
// Real local Worker, D1, R2 and EmDash sessions. Synthetic data only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASE, adminSession, jobs, q, userSession } from './helpers.mjs';

const run = Date.now().toString(36);
const S = {}; const ids = {};
const headers = session => ({ cookie: session.header(), origin: BASE });
async function directUpload(session, file, extra = {}) {
  const signedResponse = await fetch(`${BASE}/crm/files/uploads`, { method:'POST',headers:{...headers(session),'content-type':'application/json'},body:JSON.stringify({action:'sign',name:file.name,size:file.size,...extra}),redirect:'manual' });
  assert.equal(signedResponse.status,200,await signedResponse.clone().text());
  const ticket = await signedResponse.json();
  assert.ok(new URL(ticket.url).pathname.startsWith('/cdn-cgi/local/r2/s3/'), 'test bytes must go to local R2, never production');
  const put = await fetch(ticket.url,{method:'PUT',headers:ticket.headers,body:file});
  assert.equal(put.status,200,await put.text());
  const completed = await fetch(`${BASE}/crm/files/uploads`,{method:'POST',headers:{...headers(session),'content-type':'application/json'},body:JSON.stringify({action:'complete',uploadId:ticket.uploadId})});
  assert.equal(completed.status,200,await completed.clone().text());
  return {...ticket,...await completed.json()};
}
const locate = name => jobs(`SELECT id FROM crm_files WHERE name = ${q(name)} AND deleted_at IS NULL`)[0]?.id;
const fields = (id, extra = {}) => { const row = jobs(`SELECT * FROM crm_files WHERE id = ${q(id)}`)[0]; return { intent: 'save', id, version: row.version, name: row.name, visibility: row.visibility, ...extra }; };

test('files setup: real sessions and grants', async () => {
  S.admin = await adminSession();
  for (const [name, role] of [['owner', 'sales_executive'], ['viewer', 'sales_executive'], ['partner', 'partner'], ['hr', 'hr']]) {
    S[name] = await userSession(S.admin, { email: `test-files-${name}-${run}@example.test`, name: `TEST Files ${name}` });
    assert.equal((await S.admin.post('/workspace/users', { intent: 'grant', email: S[name].email, roles: [role] })).status, 303);
  }
});

test('files: private folder, direct S3 upload, attachment bytes and locale parity', async () => {
  const name = `TEST Files folder ${run}`;
  assert.equal((await S.owner.post('/crm/files', { intent: 'create', kind: 'folder', name })).status, 303);
  ids.folder = locate(name); assert.ok(ids.folder);
  await directUpload(S.owner,new File(['TEST local R2 content'],`TEST Files ${run}.txt`),{parent:ids.folder});
  ids.file = locate(`TEST Files ${run}.txt`); assert.ok(ids.file);
  for (const prefix of ['', '/vi']) {
    const page = await S.owner.get(`${prefix}/crm/files?folder=${ids.folder}`); assert.equal(page.status, 200); assert.ok(page.html.includes(ids.file));
    const download = await S.owner.get(`${prefix}/crm/files?item=${ids.file}&download=1`); assert.equal(download.status, 200); assert.equal(download.html, 'TEST local R2 content'); assert.match(download.headers.get('content-disposition'), /^attachment/);
  }
  assert.equal((await S.viewer.get(`/crm/files?item=${ids.file}&download=1`)).status, 404);
  assert.equal((await S.admin.get(`/crm/files?item=${ids.file}`)).status, 404);
  assert.equal((await S.hr.get('/crm/files')).status, 403);
  const anonymous = await fetch(`${BASE}/crm/files`, { redirect: 'manual' });
  assert.equal(anonymous.status, 303);
  assert.equal(anonymous.headers.get('cache-control'), 'private, no-store', 'sign-in redirects must not be cached');
});

test('files: sales team, selected viewers, denied mutation and strict origin', async () => {
  assert.equal((await S.owner.post('/crm/files', fields(ids.folder, { visibility: 'team' }))).status, 303);
  assert.equal((await S.viewer.get(`/crm/files?item=${ids.file}&download=1`)).status, 200);
  assert.equal((await S.partner.get(`/crm/files?item=${ids.file}`)).status, 404);
  assert.equal((await S.viewer.post('/crm/files', fields(ids.folder, { visibility: 'internet', confirm_public: 'yes' }))).status, 404);
  assert.equal((await S.owner.post('/crm/files', fields(ids.folder), { origin: 'https://attacker.example' })).status, 400);
  assert.equal((await S.owner.post('/crm/files', fields(ids.folder, { visibility: 'people', recipients: [S.partner.id] }))).status, 303);
  assert.equal((await S.partner.get(`/crm/files?item=${ids.file}&download=1`)).status, 200);
  assert.equal((await S.viewer.get(`/crm/files?item=${ids.file}`)).status, 404);
  jobs(`UPDATE workspace_members SET enabled = 0 WHERE user_id = ${q(S.partner.id)}`);
  assert.equal((await S.partner.get(`/crm/files?item=${ids.file}&download=1`)).status, 403, 'revoking CRM membership immediately ends file access');
  jobs(`UPDATE workspace_members SET enabled = 1 WHERE user_id = ${q(S.partner.id)}`);
});

test('files: new versions preserve history; admin or uploader alone deletes, current falls back', async () => {
  await S.owner.post('/crm/files', fields(ids.folder, { visibility: 'team' }));
  const previous = jobs(`SELECT * FROM crm_file_versions WHERE file_id = ${q(ids.file)} AND deleted_at IS NULL`)[0];
  await directUpload(S.owner,new File(['TEST version two'],'TEST revision two.txt'),{fileId:ids.file,version:jobs(`SELECT version FROM crm_files WHERE id = ${q(ids.file)}`)[0].version});
  const versions = jobs(`SELECT * FROM crm_file_versions WHERE file_id = ${q(ids.file)} AND deleted_at IS NULL ORDER BY number DESC`);
  assert.equal(versions.length,2); ids.latest = versions[0].id; ids.previous = previous.id;
  for (const prefix of ['', '/vi']) {
    const history = await S.viewer.get(`${prefix}/crm/files?item=${ids.file}`); assert.equal(history.status,200); assert.ok(history.html.includes(previous.id));
    const old = await S.viewer.get(`${prefix}/crm/files?item=${ids.file}&revision=${previous.id}&download=1`); assert.equal(old.html,'TEST local R2 content');
    const current = await S.viewer.get(`${prefix}/crm/files?item=${ids.file}&download=1`); assert.equal(current.html,'TEST version two');
  }
  let version = jobs(`SELECT version FROM crm_files WHERE id = ${q(ids.file)}`)[0].version;
  const deletion = {intent:'delete_version',id:ids.file,revision:ids.latest,version,confirm_delete:'yes'};
  assert.equal((await S.viewer.post('/crm/files',deletion)).status,404);
  assert.equal((await S.admin.post('/crm/files',deletion)).status,303);
  assert.equal((await S.owner.get(`/crm/files?item=${ids.file}&revision=${ids.latest}&download=1`)).status,404);
  assert.equal((await S.owner.get(`/crm/files?item=${ids.file}&download=1`)).html,'TEST local R2 content');
  // Upload another version so public access exercises both current and history.
  version = jobs(`SELECT version FROM crm_files WHERE id = ${q(ids.file)}`)[0].version;
  await directUpload(S.owner,new File(['TEST version three'],'TEST revision three.txt'),{fileId:ids.file,version});
});

test('files: anonymous public folder, private override, link revocation and deleted bytes', async () => {
  assert.equal((await S.owner.post('/crm/files', fields(ids.folder, { visibility: 'internet' }))).status, 422);
  assert.equal((await S.owner.post('/crm/files', fields(ids.folder, { visibility: 'internet', confirm_public: 'yes' }))).status, 303);
  const token = jobs(`SELECT public_token FROM crm_files WHERE id = ${q(ids.folder)}`)[0].public_token;
  for (const prefix of ['', '/vi']) {
    const page = await fetch(`${BASE}${prefix}/shared/files/${token}`); assert.equal(page.status, 200); assert.ok((await page.text()).includes(ids.file)); assert.equal(page.headers.get('cache-control'), 'private, no-store');
    const file = await fetch(`${BASE}${prefix}/shared/files/${token}?item=${ids.file}&download=1`); assert.equal(file.status, 200); assert.equal(await file.text(), 'TEST version three');
    const previous = await fetch(`${BASE}${prefix}/shared/files/${token}?item=${ids.file}&revision=${ids.previous}&download=1`); assert.equal(previous.status,200); assert.equal(await previous.text(),'TEST local R2 content');
    assert.equal((await fetch(`${BASE}${prefix}/shared/files/${token}?item=${ids.file}&revision=${ids.latest}&download=1`)).status,404);
  }
  await S.owner.post('/crm/files', fields(ids.file, { visibility: 'private' }));
  assert.equal((await fetch(`${BASE}/shared/files/${token}?item=${ids.file}&download=1`)).status, 404);
  assert.ok(!(await (await fetch(`${BASE}/shared/files/${token}`)).text()).includes(`TEST Files ${run}.txt`));
  await S.owner.post('/crm/files', fields(ids.folder, { visibility: 'private' }));
  assert.equal((await fetch(`${BASE}/shared/files/${token}`)).status, 404);
  const remaining = jobs(`SELECT id FROM crm_file_versions WHERE file_id = ${q(ids.file)} AND deleted_at IS NULL ORDER BY number DESC`);
  for (const revision of remaining) {
    const fileRow = jobs(`SELECT version FROM crm_files WHERE id = ${q(ids.file)}`)[0];
    assert.equal((await S.owner.post(`/crm/files?item=${ids.file}`, { intent: 'delete_version', id: ids.file, revision: revision.id, version: fileRow.version, confirm_delete: 'yes' })).status, 303);
    assert.equal((await S.owner.get(`/crm/files?item=${ids.file}&revision=${revision.id}&download=1`)).status,404);
  }
  assert.equal((await S.owner.get(`/crm/files?item=${ids.file}&download=1`)).status, 404);
  const folderRow = jobs(`SELECT version FROM crm_files WHERE id = ${q(ids.folder)}`)[0];
  assert.equal((await S.owner.post('/crm/files', { intent: 'delete', id: ids.folder, version: folderRow.version })).status, 303);
});


test('direct upload: URLs are owner-scoped, create-only and finalization is idempotent', async () => {
  const file = new File(['TEST signed bytes'],`TEST direct ${run}.txt`);
  const ticket = await directUpload(S.owner,file);
  const replay = await fetch(ticket.url,{method:'PUT',headers:ticket.headers,body:file});
  assert.equal(replay.status,412,'signed create-only URL must never overwrite a version');
  const missingCondition = await fetch(ticket.url,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:file});
  assert.equal(missingCondition.status,403,'create-only condition is signed');
  const wrongLength = await fetch(ticket.url,{method:'PUT',headers:ticket.headers,body:new File(['different byte length'],'wrong.txt')});
  assert.equal(wrongLength.status,403,'exact byte length is signed');
  const complete = session => fetch(`${BASE}/crm/files/uploads`,{method:'POST',headers:{...headers(session),'content-type':'application/json'},body:JSON.stringify({action:'complete',uploadId:ticket.uploadId})});
  assert.equal((await complete(S.owner)).status,200);
  assert.equal((await complete(S.viewer)).status,404);
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM crm_files WHERE id = ${q(ticket.fileId)}`)[0].n,1);
  const multipart = new FormData(); multipart.set('kind','file'); multipart.set('intent','create'); multipart.set('upload',new File(['proxy forbidden'],'TEST proxy.txt'));
  assert.equal((await fetch(`${BASE}/crm/files`,{method:'POST',body:multipart,headers:headers(S.owner),redirect:'manual'})).status,422);
  assert.equal((await fetch(`${BASE}/crm/files/uploads`,{method:'POST',body:multipart,headers:headers(S.owner),redirect:'manual'})).status,415);
  assert.equal((await fetch(`${BASE}/crm/files/uploads`,{method:'POST',headers:{...headers(S.owner),'content-type':'application/json'},body:JSON.stringify({action:'sign',name:'x',size:1,padding:'x'.repeat(5000)})})).status,413);
  assert.equal((await fetch(`${BASE}/crm/files/uploads`,{method:'POST',headers:{...headers(S.owner),origin:'https://attacker.example','content-type':'application/json'},body:'{"action":"sign"}'})).status,403);
});
