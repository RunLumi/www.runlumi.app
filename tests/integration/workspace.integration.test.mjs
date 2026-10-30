import { localFetch as fetch } from "./helpers.mjs";
// Workspace roles, navigation and the hiring desk against a local Worker + D1
// with real EmDash sessions. Synthetic TEST data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE, adminSession, idFrom, jobs, q, userSession } from "./helpers.mjs";

const run = Date.now().toString(36);
const S = {};
const ids = {};

const nav = (html) => [...html.matchAll(/<nav class="ws-modules"[^>]*>([\s\S]*?)<\/nav>/g)].map((match) => match[1]).join("");
// Module pages: the tab bar (hiring, account) or the grouped menu (CRM, HRM, Admin).
const pages = (html) => [...html.matchAll(/<nav class="(?:ws-pages|ws-gmenu[^"]*)"[^>]*>([\s\S]*?)<\/nav>/g)].map((match) => match[1]).join("");

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
  const create = async (session, name) => idFrom((await session.post("/crm/new", { intent: "create", playbook_key: "local-preview", source_channel: "field_visit", account_name: `${name} ${run}`, contact_name: "TEST Owner" })).location);
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

test("admin screens: users table opens a member child screen; only users.manage reaches them", async () => {
  const list = await S.admin.get("/workspace/users");
  assert.equal(list.status, 200);
  assert.match(list.html, /<table class="ws-tbl" data-frozen="1"/, "the users table freezes the name column");
  assert.match(list.html, new RegExp(`href="/workspace/users/${S.hr.id}"`), "a row opens the member's child screen");
  // The first table on the page lists people; the second lists recent access changes.
  const people = (html) => /<table class="ws-tbl"[\s\S]*?<\/table>/.exec(html)?.[0] ?? "";
  const filtered = people((await S.admin.get(`/workspace/users?q=${encodeURIComponent(S.manager.email)}`)).html);
  assert.match(filtered, new RegExp(S.manager.email.replace(/[.]/g, "\\.")));
  assert.doesNotMatch(filtered, new RegExp(`href="/workspace/users/${S.hr.id}"`), "search narrows the table");
  for (const path of [`/workspace/users/${S.hr.id}`, `/vi/workspace/users/${S.hr.id}`]) {
    const page = await S.admin.get(path);
    assert.equal(page.status, 200, path);
    assert.match(page.html, /class="ws-crumbs"/, "child screens carry breadcrumbs");
    assert.match(page.html, new RegExp(S.hr.email.replace(/[.]/g, "\\.")));
  }
  assert.equal((await S.admin.get("/workspace/users/not_a_real_user")).status, 404);
  for (const path of ["/workspace/roles", "/vi/workspace/roles", "/workspace/users/new", "/vi/workspace/users/new"]) assert.equal((await S.admin.get(path)).status, 200, path);
  assert.match((await S.admin.get("/workspace/roles")).html, /hiring\.applications\.delete/);
  for (const session of [S.hr, S.manager, S.exec]) {
    for (const path of [`/workspace/users/${S.exec.id}`, "/workspace/users/new", "/workspace/roles", "/vi/workspace/roles"]) assert.equal((await session.get(path)).status, 403, `${session.name} ${path}`);
    assert.equal((await session.post(`/workspace/users/${S.exec.id}`, { intent: "update", user_id: S.exec.id, roles: ["sales_manager"], enabled: "1" })).status, 403, `${session.name} cannot change access`);
  }
  assert.equal(jobs(`SELECT role FROM workspace_roles WHERE user_id = ${q(S.exec.id)}`).map((row) => row.role).join(), "sales_executive", "a denied POST changes nothing");
  const saved = await S.admin.post(`/workspace/users/${S.exec.id}`, { intent: "update", user_id: S.exec.id, roles: ["sales_executive"], enabled: "1" });
  assert.equal(saved.status, 303);
  assert.equal(saved.location, `/workspace/users/${S.exec.id}?saved=1`, "saving on the child screen returns to it");
  const empty = await S.admin.post(`/vi/workspace/users/${S.exec.id}`, { intent: "update", user_id: S.exec.id, enabled: "1" });
  assert.equal(empty.status, 422);
  assert.match(empty.html, /Chọn ít nhất một vai trò/);
});

test("my account: everyone with access sees only their own identity, in both languages", async () => {
  for (const [session, other] of [[S.hr, S.exec], [S.exec, S.hr]]) {
    for (const path of ["/workspace/account", "/vi/workspace/account"]) {
      const page = await session.get(path);
      assert.equal(page.status, 200, `${session.name} ${path}`);
      assert.match(page.html, new RegExp(session.email.replace(/[.]/g, "\\.")));
      assert.doesNotMatch(page.html, new RegExp(other.email.replace(/[.]/g, "\\.")), "no one else's identity");
    }
  }
  assert.match((await S.hr.get("/workspace/account")).html, /Personal tokens currently work with the CRM only/, "HR has no CRM tokens");
  assert.match((await S.exec.get("/vi/workspace/account")).html, /href="\/vi\/crm\/api"/, "CRM roles reach their token page");
  assert.equal((await S.none.get("/workspace/account")).status, 403, "no role means no account page");
  const home = await S.hr.get("/workspace");
  assert.match(home.html, /href="\/workspace\/account"/, "the account menu links to My account");
});

test("search returns only what each person may list (UI1-S3)", async () => {
  const phone = () => `09${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`;
  const create = async (session, name) => assert.equal((await session.post("/crm/new", { intent: "create", playbook_key: "local-preview", source_channel: "field_visit", account_name: name, contact_role: "owner", contact_name: `${name} Contact`, phone: phone() })).status, 303, `create ${name}`);
  const mine = `TEST Findme Exec ${run}`, theirs = `TEST Findme Mgr ${run}`;
  await create(S.exec, mine);
  await create(S.manager, theirs);
  const term = encodeURIComponent(`Findme`);
  const exec = await S.exec.get(`/vi/workspace/search?q=${term}`);
  assert.equal(exec.status, 200);
  assert.match(exec.html, new RegExp(mine), "own opportunity, company and contact are found");
  assert.doesNotMatch(exec.html, new RegExp(theirs), "another owner's records stay hidden");
  assert.doesNotMatch(exec.html, /href="\/vi\/workspace\/users\//, "no members without users.manage");
  const manager = await S.manager.get(`/workspace/search?q=${term}`);
  assert.match(manager.html, new RegExp(mine));
  assert.match(manager.html, new RegExp(theirs), "the team sees every owner's records");
  const hr = await S.hr.get(`/workspace/search?q=${term}`);
  assert.equal(hr.status, 200);
  assert.doesNotMatch(hr.html, /Findme/, "HR has no CRM results");
  assert.match(hr.html, /Nothing to search yet/);
  const admin = await S.admin.get(`/workspace/search?q=${encodeURIComponent(`TEST HR ${run}`)}&type=members`);
  assert.match(admin.html, new RegExp(`href="/workspace/users/${S.hr.id}"`), "admins find people with access");
  assert.match((await S.exec.get("/workspace/search?q=a")).html, /Type at least 2 characters/);
  assert.equal((await S.none.get(`/workspace/search?q=${term}`)).status, 403, "no role, no search");
});

test("notices: the bell and inbox show only my own notices (UI1-S4)", async () => {
  const settings = jobs("SELECT enabled, legal_entity, purpose, retention_policy, policy_reference, reviewed_by FROM hrm_settings WHERE id = 1")[0];
  jobs("UPDATE hrm_settings SET enabled = 1, legal_entity = 'TEST Lumi', purpose = 'TEST notices', retention_policy = 'TEST', policy_reference = 'TEST', reviewed_by = 'test_reviewer' WHERE id = 1");
  const made = [];
  try {
    S.empA = await userSession(S.admin, { email: `test-empa-${run}@example.test`, name: `TEST Employee A ${run}` });
    S.empB = await userSession(S.admin, { email: `test-empb-${run}@example.test`, name: `TEST Employee B ${run}` });
    const now = new Date().toISOString();
    for (const session of [S.empA, S.empB]) {
      assert.equal((await S.admin.post("/workspace/users", { intent: "grant", email: session.email, roles: ["employee"] })).status, 303);
      jobs(`INSERT INTO hrm_people (id, user_id, employee_code, legal_name, actor_id, created_at, updated_at) VALUES (${q(`person_${session.id}`)}, ${q(session.id)}, ${q(`TEST-${session.id}`)}, ${q(session.name)}, 'test', ${q(now)}, ${q(now)})`);
      jobs(`INSERT INTO hrm_employments (id, person_id, legal_entity, status, actor_id, created_at, updated_at) VALUES (${q(`emp_${session.id}`)}, ${q(`person_${session.id}`)}, 'TEST Lumi', 'active', 'test', ${q(now)}, ${q(now)})`);
    }
    const request = `hrreq_ui1_${run}`;
    jobs(`INSERT INTO hrm_service_requests (id, person_id, employment_id, request_type, subject, state, sensitivity, created_by, created_at, updated_by, updated_at) VALUES (${q(request)}, ${q(`person_${S.empA.id}`)}, ${q(`emp_${S.empA.id}`)}, 'employment_confirmation', 'TEST confirmation', 'submitted', 'standard', ${q(S.empA.id)}, ${q(now)}, ${q(S.empA.id)}, ${q(now)})`);
    jobs(`INSERT INTO hrm_notification_outbox (id, recipient_user_id, request_id, event_key, event_type, href, state, attempts, created_at, updated_at) VALUES (${q(`hroutbox_ui1_${run}`)}, ${q(S.empA.id)}, ${q(request)}, ${q(`ui1:${run}`)}, 'request_updated', ${q(`/hrm/me/requests?request=${request}`)}, 'queued', 0, ${q(now)}, ${q(now)})`);
    made.push(request);
    assert.match((await S.empA.get("/workspace")).html, /class="ws-ibtn ws-bell"[^>]*aria-label="Notifications, 1 unread"/, "my bell counts my notice");
    assert.match((await S.empB.get("/workspace")).html, /class="ws-ibtn ws-bell"[^>]*aria-label="Notifications"/, "B has a bell with nothing unread");
    assert.doesNotMatch((await S.hr.get("/workspace")).html, /ws-bell/, "no notice source, no bell");
    const inboxA = await S.empA.get("/vi/workspace/inbox");
    assert.equal(inboxA.status, 200);
    assert.match(inboxA.html, /Yêu cầu HR bạn theo dõi có cập nhật/);
    assert.doesNotMatch((await S.empB.get("/workspace/inbox")).html, /An HR request you follow was updated/, "B never sees A's notice");
    const note = jobs(`SELECT id, version FROM hrm_notifications WHERE recipient_user_id = ${q(S.empA.id)}`)[0];
    const denied = await S.empB.post("/workspace/inbox", { intent: "mark_read", id: note.id, version: note.version });
    assert.equal(denied.status, 303);
    assert.match(denied.location, /error=/, "B cannot mark A's notice");
    assert.equal(jobs(`SELECT state FROM hrm_notifications WHERE id = ${q(note.id)}`)[0].state, "unread");
    const read = await S.empA.post("/workspace/inbox", { intent: "mark_read", id: note.id, version: note.version });
    assert.match(read.location, /saved=mark_read/);
    assert.equal(jobs(`SELECT state FROM hrm_notifications WHERE id = ${q(note.id)}`)[0].state, "read");
    assert.equal((await S.hr.post("/workspace/inbox", { intent: "mark_all" })).status, 403, "no notice source, no write");
    assert.equal((await S.empA.post("/workspace/inbox", { intent: "mark_read", id: note.id, version: note.version }, { origin: "https://evil.example" })).status, 400, "cross-site posts are refused");
    assert.equal((await S.none.get("/workspace/inbox")).status, 403);
  } finally {
    jobs(`UPDATE hrm_settings SET enabled = ${settings.enabled}, legal_entity = ${q(settings.legal_entity)}, purpose = ${q(settings.purpose)}, retention_policy = ${q(settings.retention_policy)}, policy_reference = ${q(settings.policy_reference)}, reviewed_by = ${settings.reviewed_by === null ? "NULL" : q(settings.reviewed_by)} WHERE id = 1`);
  }
});

test("my notifications: only the rules that reach me, read-only (UI1-S6)", async () => {
  const now = new Date().toISOString();
  const rule = (id, name, recipients) => jobs(`INSERT INTO workspace_notification_rules (id, name, events, recipients, email, created_by, created_at, updated_by, updated_at) VALUES (${q(id)}, ${q(name)}, '["stage"]', ${q(JSON.stringify(recipients))}, 1, 'test', ${q(now)}, 'test', ${q(now)})`);
  rule(`rule_exec_${run}`, `TEST Rule for executives ${run}`, { roles: ["sales_executive"] });
  rule(`rule_mgr_${run}`, `TEST Rule for managers ${run}`, { roles: ["sales_manager"] });
  try {
    const exec = await S.exec.get("/vi/workspace/account/notifications");
    assert.equal(exec.status, 200);
    assert.match(exec.html, new RegExp(`TEST Rule for executives ${run}`));
    assert.doesNotMatch(exec.html, new RegExp(`TEST Rule for managers ${run}`), "a rule for another role stays hidden");
    assert.doesNotMatch(exec.html, /<form/, "nothing on the page saves a preference");
    const hr = await S.hr.get("/workspace/account/notifications");
    assert.equal(hr.status, 200);
    assert.doesNotMatch(hr.html, /TEST Rule for/, "CRM rules never reach HR");
    assert.match(hr.html, new RegExp(S.hr.email.replace(/[.]/g, "\\.")));
    assert.doesNotMatch(hr.html, new RegExp(S.exec.email.replace(/[.]/g, "\\.")), "only my own email");
    assert.equal((await S.none.get("/workspace/account/notifications")).status, 403);
  } finally {
    jobs(`DELETE FROM workspace_notification_rules WHERE id IN (${q(`rule_exec_${run}`)}, ${q(`rule_mgr_${run}`)})`);
  }
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

async function apply(slug, name, lang = "en") {
  const form = new FormData();
  for (const [key, value] of Object.entries({ started_at: String(Date.now() - 5000), website: "", full_name: name, email: `${name.replace(/\W+/g, "-").toLowerCase()}@example.test`, cover_letter: "TEST synthetic application", consent: "1", lang })) form.set(key, value);
  form.set("resume", new File(["%PDF-1.4 TEST"], "TEST-cv.pdf", { type: "application/pdf" }));
  return fetch(`${BASE}/api/jobs/${slug}/apply`, { method: "POST", body: form, headers: { origin: BASE }, redirect: "manual" });
}

test("careers pages are bilingual; a Vietnamese application returns to Vietnamese", async () => {
  const slug = jobs(`SELECT slug FROM jobs WHERE id = ${q(ids.job)}`)[0].slug;
  const listing = await fetch(`${BASE}/vi/jobs`);
  assert.equal(listing.status, 200);
  const html = await listing.text();
  assert.match(html, /Vị trí đang tuyển/);
  assert.match(html, new RegExp(`/vi/jobs/${slug}`));
  const page = await fetch(`${BASE}/vi/jobs/${slug}`);
  assert.match(await page.text(), /Gửi hồ sơ/);
  const applied = await apply(slug, `TEST Ung Vien ${run}`, "vi");
  assert.match(applied.headers.get("location") ?? "", new RegExp(`^/vi/jobs/${slug}\\?applied=`));
});

test("interviews and independent scorecards; retention deletes only closed, old applications", async () => {
  S.hr2 = await userSession(S.admin, { email: `test-hr2-${run}@example.test`, name: `TEST HR Two ${run}` });
  await S.admin.post("/workspace/users", { intent: "grant", email: S.hr2.email, roles: ["hr"] });
  const app = jobs(`SELECT id FROM applications WHERE job_id = ${q(ids.job)} ORDER BY created_at DESC LIMIT 1`)[0].id;
  assert.match((await S.hr.post(`/api/admin/applications/${app}/interviews`, { intent: "create", stage: "screen", scheduled_at: "2026-10-09T09:30", duration_minutes: "30", interviewers: "TEST HR", lang: "en" })).location, /saved=interview/);
  assert.match((await S.hr.post(`/api/admin/applications/${app}/interviews`, { intent: "create", stage: "screen", scheduled_at: "soon", interviewers: "x" })).location, /interview_error/);
  const interview = jobs(`SELECT id, scheduled_at FROM application_interviews WHERE application_id = ${q(app)}`)[0];
  assert.equal(interview.scheduled_at, "2026-10-09T02:30:00.000Z", "stored in UTC from Vietnam time");
  await S.hr.post(`/api/admin/applications/${app}/interviews`, { intent: "status", interview_id: interview.id, status: "done" });
  const card = { interview_id: interview.id, recommendation: "yes", evidence: "TEST walked through a real customer case with numbers.", "rating.role_skills": "3", "rating.problem_solving": "3", "rating.communication": "4", "rating.ownership": "3" };
  assert.match((await S.hr.post(`/api/admin/applications/${app}/scorecards`, card)).location, /saved=scorecard/);
  assert.match((await S.hr.post(`/api/admin/applications/${app}/scorecards`, card)).location, /scorecard_error=exists/, "one scorecard per person per interview");
  const before = await S.hr2.get(`/admin/jobs/applications/${app}`);
  assert.match(before.html, /appear after you submit yours/);
  assert.ok(!before.html.includes("TEST walked through"), "a second reviewer does not see the first scorecard yet");
  await S.hr2.post(`/api/admin/applications/${app}/scorecards`, { ...card, recommendation: "no", evidence: "TEST could not explain the trade-off in the pricing case." });
  assert.ok((await S.hr2.get(`/admin/jobs/applications/${app}`)).html.includes("TEST walked through"), "visible after submitting");
  // Retention: only closed applications at or before the cutoff are deleted.
  await S.hr.post(`/api/admin/applications/${app}/status`, { status: "rejected" });
  jobs(`UPDATE applications SET updated_at = '2026-01-01T00:00:00.000Z' WHERE id = ${q(app)}`);
  const slug = jobs(`SELECT slug FROM jobs WHERE id = ${q(ids.job)}`)[0].slug;
  assert.equal((await apply(slug, `TEST Still Open ${run}`)).status, 303);
  const open = jobs(`SELECT id FROM applications WHERE job_id = ${q(ids.job)} AND id != ${q(app)} LIMIT 1`)[0].id;
  jobs(`UPDATE applications SET updated_at = '2026-01-01T00:00:00.000Z' WHERE id = ${q(open)}`);
  const tooRecent = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  assert.match((await S.hr.post("/api/admin/applications/purge", { cutoff: tooRecent, confirm: "1" })).location, /purge_error=window/, "nothing inside the 60 days can be deleted");
  const preview = await S.hr.get("/admin/jobs/applications?cutoff=2026-02-01");
  assert.match(preview.html, /would be deleted/);
  assert.match((await S.hr.post("/api/admin/applications/purge", { cutoff: "2026-02-01" })).location, /purge_error/, "confirmation required");
  assert.match((await S.hr.post("/api/admin/applications/purge", { cutoff: "2026-02-01", confirm: "1" })).location, /purged=\d+/);
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM applications WHERE id = ${q(app)}`)[0].n, 0);
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM application_scorecards WHERE application_id = ${q(app)}`)[0].n, 0, "scorecards go with it");
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM applications WHERE id = ${q(open)}`)[0].n, 1, "old but still-open applications stay");
  assert.ok(jobs("SELECT COUNT(*) AS n FROM workspace_audit WHERE action = 'candidates_purged'")[0].n >= 1);
  assert.equal((await S.exec.post("/api/admin/applications/purge", { cutoff: "2026-02-01", confirm: "1" })).status, 403);
});

test("revoking a role takes effect on the next request and is audited", async () => {
  assert.equal((await S.admin.post("/workspace/users", { intent: "update", user_id: S.hr.id, roles: ["hr"], enabled: "0" })).status, 303);
  assert.equal((await S.hr.get("/admin/jobs")).status, 403);
  assert.equal((await S.admin.post("/workspace/users", { intent: "update", user_id: S.hr.id, roles: ["hr"], enabled: "1" })).status, 303, "restore keeps roles");
  assert.equal((await S.hr.get("/admin/jobs")).status, 200);
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM workspace_audit WHERE target_user_id = ${q(S.hr.id)} AND action = 'access_revoked'`)[0].n, 1);
});

test("partners refer businesses, follow status only, and never record payments", async () => {
  S.partner = await userSession(S.admin, { email: `test-ctv-${run}@example.test`, name: `TEST Partner ${run}` });
  assert.equal((await S.admin.post("/workspace/users", { intent: "grant", email: S.partner.email, roles: ["partner"] })).status, 303);
  const users = await S.admin.get("/workspace/users");
  assert.match(users.html, /Seller terms not set/, "admins are reminded to declare partner seller terms");
  const home = await S.partner.get("/vi/crm");
  assert.match(pages(home.html), /Giới thiệu khách/);
  assert.doesNotMatch(pages(home.html), /Vận hành|Bàn giao/);
  assert.equal((await S.partner.get("/crm/admin")).status, 403);
  assert.equal((await S.partner.get("/admin/jobs")).status, 403);
  assert.equal((await S.hr.get("/crm/referrals")).status, 403, "HR cannot refer");

  const business = `TEST Referred Bakery ${run}`;
  const refer = (fields) => S.partner.post("/crm/referrals", { intent: "refer", business, contact_name: "TEST Owner", phone: `09${String(Date.now()).slice(-8)}`, need: "Customers cannot find opening hours", playbook_key: "local-preview", ...fields });
  assert.equal((await refer({})).status, 422, "consent is required");
  const sent = await refer({ consent: "1" });
  assert.equal(sent.status, 303);
  // A referral arrives as an unassigned lead; conversion later opens the opportunity.
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM crm_opportunities WHERE title = ${q(business)}`)[0].n, 0);
  const [row] = jobs(`SELECT id, owner_id, referrer_id, source_channel, version FROM crm_lead_records WHERE company = ${q(business)}`);
  assert.deepEqual([row.owner_id, row.referrer_id, row.source_channel], [null, S.partner.id, "referral"]);
  assert.match((await S.partner.get("/crm/referrals")).html, new RegExp(`${business}[\\s\\S]*Waiting for assignment`));
  assert.equal((await S.partner.get(`/crm/leads/${row.id}`)).status, 404, "the referrer cannot open the lead");

  const ops = await S.manager.get("/crm/admin");
  assert.match(ops.html, new RegExp(business), "managers see the lead queue");
  assert.doesNotMatch((await S.exec.get("/crm/leads")).html, new RegExp(business), "executives do not see unassigned leads");
  assert.equal((await S.exec.get(`/crm/leads/${row.id}`)).status, 404);
  assert.equal((await S.manager.post("/crm/admin", { intent: "lead_assign", lead_id: row.id, version: row.version, owner_id: S.manager.id })).status, 422, "a Sales Manager cannot take an unattributed lead");
  assert.equal((await S.manager.post("/crm/admin", { intent: "lead_assign", lead_id: row.id, version: row.version, owner_id: S.exec.id })).status, 303);
  assert.equal(jobs(`SELECT owner_id FROM crm_lead_records WHERE id = ${q(row.id)}`)[0].owner_id, S.exec.id);
  assert.equal((await S.exec.get(`/crm/leads/${row.id}`)).status, 200);
  assert.match((await S.partner.get("/crm/referrals")).html, /Assigned to the team/);
  const leadVersion = jobs(`SELECT version FROM crm_lead_records WHERE id = ${q(row.id)}`)[0].version;
  const converted = await S.exec.post(`/crm/leads/${row.id}`, { intent: "lead_convert", version: leadVersion, account_mode: "new", account_name: business, contact_mode: "new", contact_role: "owner", playbook_key: "local-preview", title: business });
  assert.equal(converted.status, 303, `convert: ${converted.status}`);
  const [opp] = jobs(`SELECT id, owner_id, seller_id, referrer_id, source_channel FROM crm_opportunities WHERE title = ${q(business)}`);
  assert.deepEqual([opp.owner_id, opp.seller_id, opp.referrer_id, opp.source_channel], [S.exec.id, S.exec.id, S.partner.id, "referral"]);
  assert.equal((await S.exec.get(`/crm/${opp.id}`)).status, 200);
  assert.equal((await S.partner.get(`/crm/${opp.id}`)).status, 404, "the referrer cannot open the converted deal");
  assert.match((await S.partner.get("/crm/referrals")).html, /Assigned to the team/);

  const own = idFrom((await S.partner.post("/crm/new", { intent: "create", playbook_key: "local-preview", source_channel: "field_visit", account_name: `TEST Partner Own ${run}`, contact_name: "TEST Owner" })).location);
  const page = await S.partner.get(`/crm/${own}`);
  assert.equal(page.status, 200, "partners can sell their own deals");
  assert.doesNotMatch(page.html, /name="intent" value="payment"/, "no payment form for partners");
  assert.equal((await S.partner.post(`/crm/${own}`, { intent: "payment", version: Number(/name="version" value="(\d+)"/.exec(page.html)[1]), amount: "399000", method: "bank_transfer", paid_on: "2026-10-01" })).status, 403);
});

test("the sales process hub and selected Markdown guide render for CRM roles only", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../../docs/Lumi_Quy_Trinh_Ban_Hang.md", import.meta.url), "utf8");
  const title = /^# (.+)$/m.exec(source)[1].trim();
  const sections = [...source.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim());
  const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const hub = await S.exec.get("/vi/crm/process");
  assert.equal(hub.status, 200);
  assert.ok(hub.html.includes("Chọn quy trình bán hàng"), "the Vietnamese hub has its localized title");
  assert.match(hub.html, /data-sales-motion="local"/);
  assert.match(hub.html, /data-sales-motion="agents-vaults"/);
  assert.doesNotMatch(hub.html, /data-process-guide=/, "the hub does not choose a guide implicitly");

  const localGuide = await S.exec.get("/vi/crm/process?flow=local");
  assert.equal(localGuide.status, 200);
  assert.ok(localGuide.html.includes(escape(title)), "the selected page shows the Local Markdown title");
  for (const section of sections) assert.ok(localGuide.html.includes(escape(section)), `section "${section}" is rendered`);
  assert.match(localGuide.html, /<table>/, "Markdown tables render as tables");

  assert.equal((await S.partner.get("/crm/process")).status, 200, "partners read the hub");
  assert.equal((await S.partner.get("/crm/process?flow=local")).status, 200, "partners read selected guides too");
  assert.equal((await S.hr.get("/crm/process")).status, 403, "HR has no CRM access");
  assert.equal((await S.hr.get("/crm/process?flow=agents-vaults")).status, 403, "HR cannot open deep links either");
});
