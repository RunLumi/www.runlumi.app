// Companies and contacts: created before opportunities, managed per person,
// listed per scope. Real Worker + D1 + EmDash sessions; synthetic TEST data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminSession, idFrom, jobs, q, userSession } from "./helpers.mjs";

const run = Date.now().toString(36);
const S = {};
const ids = {};
const phone = () => `09${String(Date.now() + Math.floor(Math.random() * 1000)).slice(-8)}`;
const accountFrom = (location) => /\/crm\/accounts\/(acc_[a-f0-9]+)/.exec(location ?? "")?.[1];
const contactsOf = (accountId) => jobs(`SELECT id, name, owner_id, version FROM crm_contacts WHERE account_id = ${q(accountId)} ORDER BY created_at`);

test("setup: a manager and two sales executives", async () => {
  S.admin = await adminSession();
  S.manager = await userSession(S.admin, { email: `test-dir-sm-${run}@example.test`, name: `TEST Dir Manager ${run}` });
  S.one = await userSession(S.admin, { email: `test-dir-one-${run}@example.test`, name: `TEST Dir One ${run}` });
  S.two = await userSession(S.admin, { email: `test-dir-two-${run}@example.test`, name: `TEST Dir Two ${run}` });
  for (const [session, roles] of [[S.manager, ["sales_manager"]], [S.one, ["sales_executive"]], [S.two, ["sales_executive"]]]) {
    assert.equal((await S.admin.post("/workspace/users", { intent: "grant", email: session.email, roles })).status, 303);
  }
});

test("a company and its contacts exist before any opportunity, managed by their creator", async () => {
  const pageHtml = (await S.one.get("/vi/crm/accounts")).html;
  assert.match(pageHtml, /Thêm công ty/);
  const created = await S.one.post("/crm/accounts", { intent: "account_create", name: `TEST Bakery ${run}`, industry: "Bakery", region: "District 3", contact_name: `TEST Owner Lan ${run}`, contact_role: "owner", contact_phone: phone(), owner_id: S.two.id });
  assert.equal(created.status, 303);
  ids.account = accountFrom(created.location);
  assert.ok(ids.account);
  assert.equal(jobs(`SELECT owner_id FROM crm_accounts WHERE id = ${q(ids.account)}`)[0].owner_id, S.one.id, "executives manage what they create, whatever owner they post");
  const added = await S.one.post("/crm/contacts", { intent: "contact_create", account_id: ids.account, name: `TEST Manager Minh ${run}`, role: "manager", phone: phone() });
  assert.equal(added.status, 303);
  const contacts = contactsOf(ids.account);
  assert.equal(contacts.length, 2, "one company, several contacts");
  assert.ok(contacts.every((contact) => contact.owner_id === S.one.id));
  [ids.lan, ids.minh] = contacts.map((contact) => contact.id);
  assert.equal(jobs(`SELECT COUNT(*) AS n FROM crm_opportunities WHERE account_id = ${q(ids.account)}`)[0].n, 0);
  assert.equal((await S.one.post("/crm/contacts", { intent: "contact_create", account_id: ids.account, name: "TEST x", consent_status: "granted" })).status, 422, "granted consent needs evidence");
});

test("executives see only what they manage; managers see everything", async () => {
  assert.equal((await S.two.get(`/crm/accounts/${ids.account}`)).status, 404);
  assert.ok(!(await S.two.get("/crm/accounts")).html.includes(ids.account));
  assert.ok(!(await S.two.get(`/crm/contacts?q=${encodeURIComponent("Owner Lan")}`)).html.includes(`TEST Owner Lan ${run}`));
  assert.equal((await S.two.post("/crm/contacts", { intent: "contact_create", account_id: ids.account, name: "TEST sneak" })).status, 422, "cannot add contacts to someone else's company");
  assert.ok((await S.one.get("/crm/contacts")).html.includes(`TEST Owner Lan ${run}`));
  const all = await S.manager.get(`/crm/contacts?owner=${S.one.id}`);
  assert.ok(all.html.includes(`TEST Owner Lan ${run}`) && all.html.includes(`TEST Manager Minh ${run}`));
  assert.ok((await S.manager.get("/crm/accounts?q=Bakery")).html.includes(ids.account));
});

test("an opportunity names one company and one contact, and can be assigned later", async () => {
  const missing = await S.manager.post(`/crm/accounts/${ids.account}`, { intent: "opportunity", playbook_key: "local-preview", source_channel: "field_visit", owner_id: S.two.id });
  assert.equal(missing.status, 422, "a contact is required");
  assert.equal((await S.one.post("/crm/new", { intent: "create", playbook_key: "local-preview", source_channel: "field_visit", account_name: `TEST No Contact ${run}` })).status, 422, "quick create needs a contact too");
  const opened = await S.manager.post(`/crm/accounts/${ids.account}`, { intent: "opportunity", contact_id: ids.minh, playbook_key: "local-preview", source_channel: "field_visit", owner_id: S.two.id, next_action: "TEST visit" });
  assert.equal(opened.status, 303);
  ids.opp = idFrom(opened.location);
  const row = jobs(`SELECT account_id, primary_contact_id, owner_id, seller_id FROM crm_opportunities WHERE id = ${q(ids.opp)}`)[0];
  assert.deepEqual(row, { account_id: ids.account, primary_contact_id: ids.minh, owner_id: S.two.id, seller_id: S.two.id });
  // The assignee sees the company and the contact on their opportunity, not the other contact.
  const account = await S.two.get(`/crm/accounts/${ids.account}`);
  assert.equal(account.status, 200);
  assert.ok(account.html.includes(`TEST Manager Minh ${run}`));
  assert.ok(!account.html.includes(`TEST Owner Lan ${run}`), "contacts managed by someone else stay hidden");
  assert.ok((await S.two.get(`/crm/${ids.opp}`)).html.includes(`TEST Manager Minh ${run}`));
  const lan = contactsOf(ids.account).find((contact) => contact.id === ids.lan);
  assert.equal((await S.two.post(`/crm/accounts/${ids.account}`, { intent: "contact", contact_id: ids.lan, version: lan.version, name: "TEST hijack" })).status, 403);
  const version = jobs(`SELECT version FROM crm_opportunities WHERE id = ${q(ids.opp)}`)[0].version;
  assert.equal((await S.two.post(`/crm/${ids.opp}`, { intent: "primary_contact", version, contact_id: ids.lan })).status, 422, "only a contact you can see may become the main contact");
  assert.equal((await S.one.post(`/crm/accounts/${ids.account}`, { intent: "opportunity", contact_id: ids.lan, playbook_key: "local-preview", source_channel: "field_visit", owner_id: S.two.id })).status, 303);
  assert.equal(jobs(`SELECT owner_id FROM crm_opportunities WHERE primary_contact_id = ${q(ids.lan)}`)[0].owner_id, S.one.id, "executives open opportunities for themselves");
});

test("managers hand a company and its contacts to someone else", async () => {
  assert.equal((await S.one.post(`/crm/accounts/${ids.account}`, { intent: "account_owner", version: 1, owner_id: S.two.id })).status, 403);
  const version = jobs(`SELECT version FROM crm_accounts WHERE id = ${q(ids.account)}`)[0].version;
  assert.equal((await S.manager.post(`/crm/accounts/${ids.account}`, { intent: "account_owner", version, owner_id: S.two.id, with_contacts: "1" })).status, 303);
  assert.equal(jobs(`SELECT owner_id FROM crm_accounts WHERE id = ${q(ids.account)}`)[0].owner_id, S.two.id);
  assert.ok(contactsOf(ids.account).every((contact) => contact.owner_id === S.two.id), "contacts move with the company");
  assert.ok((await S.two.get(`/crm/accounts/${ids.account}`)).html.includes(`TEST Owner Lan ${run}`));
  const lan = contactsOf(ids.account).find((contact) => contact.id === ids.lan);
  assert.equal((await S.manager.post(`/crm/accounts/${ids.account}`, { intent: "contact_owner", contact_id: ids.lan, version: lan.version, owner_id: S.one.id })).status, 303);
  assert.equal(contactsOf(ids.account).find((contact) => contact.id === ids.lan).owner_id, S.one.id);
  assert.ok(jobs(`SELECT COUNT(*) AS n FROM crm_events WHERE account_id = ${q(ids.account)} AND kind IN ('account_owner_changed', 'contact_owner_changed')`)[0].n >= 2, "every handover is recorded");
});

test("a contact who asked not to be contacted cannot be given a new opportunity", async () => {
  assert.equal((await S.manager.post(`/crm/accounts/${ids.account}`, { intent: "dnc", contact_id: ids.minh, do_not_contact: "1", dnc_reason: "TEST asked by phone" })).status, 303);
  assert.equal((await S.manager.post(`/crm/accounts/${ids.account}`, { intent: "opportunity", contact_id: ids.minh, playbook_key: "local-preview", source_channel: "field_visit", owner_id: S.two.id })).status, 422);
});

test("the new-opportunity page picks an existing customer, or creates the company and contact", async () => {
  const company = await S.one.post("/crm/accounts", { intent: "account_create", name: `TEST Spa Hoa ${run}`, contact_name: `TEST Chị Hoa ${run}`, contact_role: "owner" });
  const accountId = accountFrom(company.location);
  const [hoa] = contactsOf(accountId);
  const form = await S.one.get(`/vi/crm/new?contact=${hoa.id}`);
  assert.match(form.html, new RegExp(`<option value="${hoa.id}" selected`), "a linked contact is preselected");
  assert.match(form.html, /Khách mới — tạo công ty và người liên hệ bên dưới/);
  assert.ok(!(await S.two.get("/crm/new")).html.includes(hoa.id), "others' customers are not offered");
  const companiesBefore = jobs("SELECT COUNT(*) AS n FROM crm_accounts")[0].n;
  const picked = await S.one.post("/crm/new", { intent: "create", playbook_key: "local-preview", source_channel: "phone", contact_id: hoa.id, account_name: "ignored", contact_name: "ignored", source_detail: "TEST called back" });
  assert.equal(picked.status, 303);
  const opp = jobs(`SELECT account_id, primary_contact_id, owner_id, title, source_detail FROM crm_opportunities WHERE id = ${q(idFrom(picked.location))}`)[0];
  assert.deepEqual(opp, { account_id: accountId, primary_contact_id: hoa.id, owner_id: S.one.id, title: `TEST Spa Hoa ${run}`, source_detail: "TEST called back" });
  assert.equal(jobs("SELECT COUNT(*) AS n FROM crm_accounts")[0].n, companiesBefore, "no company is created when one is picked");
  assert.equal((await S.two.post("/crm/new", { intent: "create", playbook_key: "local-preview", source_channel: "phone", contact_id: hoa.id })).status, 422, "nobody opens deals on contacts they cannot see");
  const duplicate = await S.one.post("/crm/new", { intent: "create", playbook_key: "local-preview", source_channel: "field_visit", account_name: `test spa hoa ${run}`, contact_name: "TEST Anh Nam" });
  assert.equal(duplicate.status, 422, "an existing company name is caught");
  assert.match(duplicate.html, /name="allow_duplicate"/);
  const branch = await S.one.post("/crm/new", { intent: "create", playbook_key: "local-preview", source_channel: "field_visit", account_name: `test spa hoa ${run}`, contact_name: "TEST Anh Nam", allow_duplicate: "1", title: "TEST branch two" });
  assert.equal(branch.status, 303, "a deliberate second company is allowed");
  const created = jobs(`SELECT o.title, a.owner_id, c.name FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id JOIN crm_contacts c ON c.id = o.primary_contact_id WHERE o.id = ${q(idFrom(branch.location))}`)[0];
  assert.deepEqual(created, { title: "TEST branch two", owner_id: S.one.id, name: "TEST Anh Nam" }, "a new customer creates its company and contact");
  assert.equal((await S.two.post("/crm/new", { intent: "create", playbook_key: "local-preview", source_channel: "field_visit", account_name: `TEST Spa Hoa ${run}`, contact_name: "TEST x" })).status, 303, "names of companies you cannot see are not revealed");
});
