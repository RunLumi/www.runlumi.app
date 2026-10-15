// Real local Worker, D1, R2 and EmDash sessions. Synthetic data only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASE, adminSession, jobs, q, userSession } from './helpers.mjs';

const run = Date.now().toString(36);
const S = {}; const ids = {};
const headers = session => ({ cookie: session.header(), origin: BASE });
const locate = name => jobs(`SELECT id FROM crm_files WHERE name = ${q(name)} AND deleted_at IS NULL`)[0]?.id;
const fields = (id, extra = {}) => { const row = jobs(`SELECT * FROM crm_files WHERE id = ${q(id)}`)[0]; return { intent: 'save', id, version: row.version, name: row.name, visibility: row.visibility, ...extra }; };

test('files setup: real sessions and grants', async () => {
  S.admin = await adminSession();
  for (const [name, role] of [['owner', 'sales_executive'], ['viewer', 'sales_executive'], ['partner', 'partner'], ['hr', 'hr']]) {
    S[name] = await userSession(S.admin, { email: `test-files-${name}-${run}@example.test`, name: `TEST Files ${name}` });
    assert.equal((await S.admin.post('/workspace/users', { intent: 'grant', email: S[name].email, roles: [role] })).status, 303);
  }
});

test('files: private folder, actual multipart upload, attachment bytes and locale parity', async () => {
  const name = `TEST Files folder ${run}`;
  assert.equal((await S.owner.post('/crm/files', { intent: 'create', kind: 'folder', name })).status, 303);
  ids.folder = locate(name); assert.ok(ids.folder);
  const body = new FormData(); body.set('intent', 'create'); body.set('kind', 'file'); body.set('parent', ids.folder);
  body.set('upload', new File(['TEST local R2 content'], `TEST Files ${run}.txt`, { type: 'text/plain' }));
  const uploaded = await fetch(`${BASE}/crm/files?folder=${ids.folder}`, { method: 'POST', body, headers: headers(S.owner), redirect: 'manual' });
  assert.equal(uploaded.status, 303);
  ids.file = locate(`TEST Files ${run}.txt`); assert.ok(ids.file);
  for (const prefix of ['', '/vi']) {
    const page = await S.owner.get(`${prefix}/crm/files?folder=${ids.folder}`); assert.equal(page.status, 200); assert.ok(page.html.includes(ids.file));
    const download = await S.owner.get(`${prefix}/crm/files?item=${ids.file}&download=1`); assert.equal(download.status, 200); assert.equal(download.html, 'TEST local R2 content'); assert.match(download.headers.get('content-disposition'), /^attachment/);
  }
  assert.equal((await S.viewer.get(`/crm/files?item=${ids.file}&download=1`)).status, 404);
  assert.equal((await S.admin.get(`/crm/files?item=${ids.file}`)).status, 404);
  assert.equal((await S.hr.get('/crm/files')).status, 403);
  assert.equal((await fetch(`${BASE}/crm/files`, { redirect: 'manual' })).status, 303);
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

test('files: anonymous public folder, private override, link revocation and deleted bytes', async () => {
  assert.equal((await S.owner.post('/crm/files', fields(ids.folder, { visibility: 'internet' }))).status, 422);
  assert.equal((await S.owner.post('/crm/files', fields(ids.folder, { visibility: 'internet', confirm_public: 'yes' }))).status, 303);
  const token = jobs(`SELECT public_token FROM crm_files WHERE id = ${q(ids.folder)}`)[0].public_token;
  for (const prefix of ['', '/vi']) {
    const page = await fetch(`${BASE}${prefix}/shared/files/${token}`); assert.equal(page.status, 200); assert.ok((await page.text()).includes(ids.file)); assert.equal(page.headers.get('cache-control'), 'private, no-store');
    const file = await fetch(`${BASE}${prefix}/shared/files/${token}?item=${ids.file}&download=1`); assert.equal(file.status, 200); assert.equal(await file.text(), 'TEST local R2 content');
  }
  await S.owner.post('/crm/files', fields(ids.file, { visibility: 'private' }));
  assert.equal((await fetch(`${BASE}/shared/files/${token}?item=${ids.file}&download=1`)).status, 404);
  assert.ok(!(await (await fetch(`${BASE}/shared/files/${token}`)).text()).includes(`TEST Files ${run}.txt`));
  await S.owner.post('/crm/files', fields(ids.folder, { visibility: 'private' }));
  assert.equal((await fetch(`${BASE}/shared/files/${token}`)).status, 404);
  const fileRow = jobs(`SELECT version FROM crm_files WHERE id = ${q(ids.file)}`)[0];
  assert.equal((await S.owner.post('/crm/files', { intent: 'delete', id: ids.file, version: fileRow.version })).status, 303);
  assert.equal((await S.owner.get(`/crm/files?item=${ids.file}&download=1`)).status, 404);
  const folderRow = jobs(`SELECT version FROM crm_files WHERE id = ${q(ids.folder)}`)[0];
  assert.equal((await S.owner.post('/crm/files', { intent: 'delete', id: ids.folder, version: folderRow.version })).status, 303);
});
