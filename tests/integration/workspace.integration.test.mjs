// Workspace roles, navigation and the hiring desk against a local Worker + D1
// with real EmDash sessions. Synthetic TEST data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE, adminSession, idFrom, jobs, q, userSession } from "./helpers.mjs";

const run = Date.now().toString(36);
const S = {};
const ids = {};

const nav = (html) => [...html.matchAll(/<nav class="ws-modules"[^>]*>([\s\S]*?)<\/nav>/g)].map((match) => match[1]).join("");
const pages = (html) => [...html.matchAll(/<nav class="crm-shell ws-pages"[^>]*>([\s\S]*?)<\/nav>/g)].map((match) => match[1]).join("");

test("setup: roles are granted on the users page, by email, with an audit trail", async () => {
  S.admin = await adminSession();
  S.hr = await userSession(S.admin, { email: `test-hr-${run}@example.test`, name: `TEST HR ${run}` });
  S.manager = await userSession(S.admin, { email: `test-sm-${run}@example.test`, name: `TEST Sales Manager ${run}` });
  S.exec = await userSession(S.admin, { email: `test-se-${run}@example.test`, name: `TEST Sales Exec ${run}` });
  S.none = await userSession(S.admin, { email: `test-none-${run}@example.test`, name: `TEST No Role ${run}` });
  const empty = await S.admin.post("/workspace/users", { intent: "grant", email: S.hr.email });
  assert.equal(empty.status, 422, "a grant needs at least one role");
  for (const [session, roles] of [[S.hr, ["hr"]], [S.manager, ["sales_manager"]], [S.exec, ["sales_executive"]]]) {
    assert.equal((await S.admin.post("/workspace/users", { intent: "grant", email: session.email, roles })).status, 303);
  }
  assert.equal((await S.admin.post("/workspace/users", { intent: "grant", email: "nobody-here@example.test", roles: ["hr"] })).status, 422);
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM workspace_audit WHERE target_user_id = ${q(S.hr.id)}`)[0].n, 1);
});

test("navigation shows only modules and pages each role may open", async () => {
  const hr = await S.hr.get("/workspace");
  assert.equal(hr.status, 200);
  assert.match(nav(hr.html), /Hiring/);
  assert.doesNotMatch(nav(hr.html), /CRM|Admin/);
  const exec = await S.exec.get("/vi/crm");
  assert.match(nav(exec.html), /CRM/);
  assert.doesNotMatch(nav(exec.html), /Tuyển dụng|Quản trị/);
  assert.doesNotMatch(pages(exec.html), /Vận hành|Playbook/);
  const manager = await S.manager.get("/crm");
  assert.match(pages(manager.html), /Operations/);
  assert.doesNotMatch(pages(manager.html), /Playbooks|Offers/);
  const admin = await S.admin.get("/workspace");
  for (const module of ["Overview", "Hiring", "CRM", "Admin"]) assert.match(nav(admin.html), new RegExp(module));
  assert.match((await S.admin.get("/crm")).html, /Playbooks/);
});

test("each role reaches only its modules; no role means no access", async () => {
  const expect = async (session, path, status) => assert.equal((await session.get(path)).status, status, `${session.name} ${path}`);
  await expect(S.hr, "/admin/jobs", 200);
  await expect(S.hr, "/vi/admin/jobs/applications", 200);
  await expect(S.hr, "/crm", 403);
  await expect(S.hr, "/workspace/users", 403);
  await expect(S.manager, "/crm/admin", 200);
  await expect(S.manager, "/crm/admin/playbooks", 403);
  await expect(S.manager, "/admin/jobs", 403);
  await expect(S.exec, "/crm/admin", 403);
  await expect(S.exec, "/admin/jobs/applications", 403);
  await expect(S.none, "/workspace", 403);
  await expect(S.none, "/crm", 403);
  assert.equal((await S.exec.post("/api/admin/jobs/create", { title: "x", summary: "x" })).status, 403, "hiring APIs refuse CRM roles");
  assert.equal((await S.manager.post("/workspace/users", { intent: "grant", email: S.none.email, roles: ["hr"] })).status, 403);
});

test("sales manager works the whole team; sales executive only their own", async () => {
  const create = async (session, name) => idFrom((await session.post("/crm/new", { intent: "create", playbook_key: "local-preview", source_channel: "field_visit", account_name: `${name} ${run}` })).location);
  ids.execOpp = await create(S.exec, "TEST Exec Garage");
  ids.managerOpp = await create(S.manager, "TEST Manager Spa");
  assert.equal((await S.manager.get(`/crm/${ids.execOpp}`)).status, 200);
  assert.equal((await S.exec.get(`/crm/${ids.managerOpp}`)).status, 404);
  const version = Number(/name="version" value="(\d+)"/.exec((await S.manager.get(`/crm/${ids.managerOpp}`)).html)[1]);
  assert.equal((await S.manager.post(`/crm/${ids.managerOpp}`, { intent: "assign", version, owner_id: S.exec.id })).status, 303, "managers assign");
  assert.equal((await S.exec.get(`/crm/${ids.managerOpp}`)).status, 200);
  assert.equal(jobs(`SELECT seller_id FROM crm_opportunities WHERE id = ${q(ids.managerOpp)}`)[0].seller_id, S.manager.id, "attribution stays");
  const execVersion = Number(/name="version" value="(\d+)"/.exec((await S.manager.get(`/crm/${ids.execOpp}`)).html)[1]);
  assert.equal((await S.manager.post(`/crm/${ids.execOpp}`, { intent: "referrer", version: execVersion, referrer_id: S.manager.id })).status, 403, "managers cannot set referral credit");
  const commission = await S.manager.get("/crm/commission");
  assert.doesNotMatch(commission.html, /mô phỏng|simulated/, "managers see no commission simulation");
});

test("hiring desk: bilingual pages, real actors in history, confirmed deletes", async () => {
  const created = await S.hr.post("/api/admin/jobs/create", { title: `TEST Role ${run}`, summary: "TEST synthetic role", lang: "vi" });
  assert.equal(created.status, 303);
  assert.match(created.location, /^\/vi\/admin\/jobs\//, "returns to the Vietnamese desk");
  ids.job = created.location.split("/").pop();
  assert.equal((await S.hr.post(`/api/admin/jobs/${ids.job}/state`, { status: "published", lang: "en" })).status, 303);
  const slug = jobs(`SELECT slug FROM jobs WHERE id = ${q(ids.job)}`)[0].slug;
  const form = new FormData();
  for (const [key, value] of Object.entries({ started_at: String(Date.now() - 5000), website: "", full_name: `TEST Candidate ${run}`, email: `cand-${run}@example.test`, cover_letter: "TEST synthetic application", consent: "1" })) form.set(key, value);
  form.set("resume", new File(["%PDF-1.4 TEST"], "TEST-cv.pdf", { type: "application/pdf" }));
  const applied = await fetch(`${BASE}/api/jobs/${slug}/apply`, { method: "POST", body: form, headers: { origin: BASE }, redirect: "manual" });
  assert.equal(applied.status, 303);
  ids.app = jobs(`SELECT id FROM applications WHERE job_id = ${q(ids.job)}`)[0].id;
  const vi = await S.hr.get(`/vi/admin/jobs/applications/${ids.app}`);
  assert.equal(vi.status, 200);
  assert.match(vi.html, /Ghi chú riêng/);
  assert.equal((await S.hr.post(`/api/admin/applications/${ids.app}/notes`, { body: "TEST strong work sample", lang: "vi" })).location, `/vi/admin/jobs/applications/${ids.app}`);
  await S.hr.post(`/api/admin/applications/${ids.app}/status`, { status: "interview", lang: "en" });
  const note = jobs(`SELECT author, author_id FROM application_notes WHERE application_id = ${q(ids.app)}`)[0];
  assert.deepEqual([note.author, note.author_id], [S.hr.name, S.hr.id]);
  assert.equal(jobs(`SELECT actor FROM application_events WHERE application_id = ${q(ids.app)} AND event_type = 'status_changed'`)[0].actor, S.hr.name);
  assert.equal((await S.hr.post(`/api/admin/applications/${ids.app}/delete`, {})).status, 400, "delete needs explicit confirmation");
  assert.equal((await S.hr.post(`/api/admin/jobs/${ids.job}/delete`, { confirm: "1" })).location, `/admin/jobs/${ids.job}?delete_error=applications`);
  assert.equal((await S.hr.post(`/api/admin/applications/${ids.app}/delete`, { confirm: "1", lang: "vi" })).location, "/vi/admin/jobs/applications");
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM applications WHERE id = ${q(ids.app)}`)[0].n, 0);
});

test("revoking a role takes effect on the next request and is audited", async () => {
  assert.equal((await S.admin.post("/workspace/users", { intent: "update", user_id: S.hr.id, roles: ["hr"], enabled: "0" })).status, 303);
  assert.equal((await S.hr.get("/admin/jobs")).status, 403);
  assert.equal((await S.admin.post("/workspace/users", { intent: "update", user_id: S.hr.id, roles: ["hr"], enabled: "1" })).status, 303, "restore keeps roles");
  assert.equal((await S.hr.get("/admin/jobs")).status, 200);
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM workspace_audit WHERE target_user_id = ${q(S.hr.id)} AND action = 'access_revoked'`)[0].n, 1);
});
