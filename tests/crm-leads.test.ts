// Lead object and conversion (workstream 3) against real SQLite with every
// migration applied. Synthetic people and businesses only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contentD1, migratedD1 } from "./fixtures/d1-sqlite.ts";
import type { CrmActor } from "../src/lib/crm/access.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/lib/crm/core.ts";
import {
  assignLead, convertLead, createLead, currentLeadProcess, disqualifyLead, listLeads, loadLead, readLeadFilters, reopenLead, setLeadStatus, sourceLead, validateLeadProcess,
} from "../src/lib/crm/leads.ts";
import { myReferrals, submitReferral } from "../src/lib/crm/referrals.ts";
import { storeIntake } from "../src/lib/crm/intake.ts";
import { eventCard } from "../src/lib/crm/lark/cards.ts";
import { eventFacts } from "../src/lib/crm/lark/notify.ts";

const actor = (id: string, extra: Partial<CrmActor> = {}): CrmActor => ({ id, name: `TEST ${id}`, email: `${id}@example.test`, manager: false, configure: false, finance: false, fulfillment: false, refer: true, reportPayments: true, ...extra });
const execA = actor("exec_a");
const execB = actor("exec_b");
const manager = actor("manager", { manager: true });
const admin = actor("admin", { manager: true, configure: true, finance: true, fulfillment: true });
const partner = actor("partner", { reportPayments: false });
let keyCounter = 0;
const key = () => `testkey_${String(++keyCounter).padStart(12, "0")}`;
const form = (fields: Record<string, string | number>) => { const data = new FormData(); for (const [name, value] of Object.entries(fields)) data.set(name, String(value)); if (!data.has("request_key")) data.set("request_key", key()); return data; };

function setup() {
  const { raw, d1 } = migratedD1();
  const now = "2026-10-29T00:00:00.000Z";
  for (const [id, role] of [["exec_a", "sales_executive"], ["exec_b", "sales_executive"], ["manager", "sales_manager"], ["partner", "partner"]] as const) {
    raw.prepare("INSERT INTO workspace_members (user_id, enabled, granted_by, created_at, updated_at) VALUES (?, 1, 'admin', ?, ?)").run(id, now, now);
    raw.prepare("INSERT INTO workspace_roles (user_id, role, granted_by, granted_at) VALUES (?, ?, 'admin', ?)").run(id, role, now);
  }
  const content = contentD1([
    { id: "exec_a", email: "a@example.test", name: "TEST A", role: 30 }, { id: "exec_b", email: "b@example.test", name: "TEST B", role: 30 },
    { id: "manager", email: "m@example.test", name: "TEST M", role: 30 }, { id: "partner", email: "p@example.test", name: "TEST P", role: 30 }, { id: "admin", email: "x@example.test", name: "TEST X", role: 50 },
  ]);
  return { raw, db: d1, content };
}
const phone = (() => { let n = 10_000_000; return () => `09${String(++n)}`; })();
const version = async (db: D1Database, id: string) => (await db.prepare("SELECT version FROM crm_lead_records WHERE id = ?").bind(id).first<{ version: number }>())!.version;

test("lead process v1 is seeded as data and validated", async () => {
  const { db } = setup();
  const process = await currentLeadProcess(db);
  assert.equal(process.id, "crm-lead-process@1");
  assert.deepEqual(validateLeadProcess(process.def), []);
  assert.ok(validateLeadProcess({ statuses: [], disqualify_reasons: [{ id: "x1", en: "X", vi: "X" }] }).includes("statuses"));
  assert.ok(validateLeadProcess({ statuses: [{ id: "Bad Id", en: "A", vi: "A" }], disqualify_reasons: [{ id: "ok", en: "A", vi: "" }] }).length >= 2);
});

test("ownership: a seller sees only their own leads; the team sees all; others get not-found", async () => {
  const { db, content } = setup();
  const id = await createLead(db, content, execA, form({ name: "TEST Owner", company: "TEST Garage Leads", phone: phone(), source_channel: "field_visit" }));
  assert.equal((await loadLead(db, execA, id)).canEdit, true);
  await assert.rejects(loadLead(db, execB, id), NotFoundError);
  assert.equal((await loadLead(db, manager, id)).lead.owner_id, "exec_a");
  assert.equal((await listLeads(db, execB, readLeadFilters(new URL("https://x.test/crm/leads")), 1)).total, 0);
  assert.equal((await listLeads(db, manager, readLeadFilters(new URL("https://x.test/crm/leads")), 1)).total, 1);
  // A non-manager cannot assign or create for someone else.
  await assert.rejects(assignLead(db, content, execA, await loadLead(db, execA, id), form({ version: 1, owner_id: "exec_b" })), ForbiddenError);
  const own = await createLead(db, content, execA, form({ name: "TEST Two", company: "TEST Two Co", email: "two@example.test", source_channel: "phone", owner_id: "exec_b" }));
  assert.equal((await loadLead(db, execA, own)).lead.owner_id, "exec_a", "a seller's new lead is always theirs");
  await assert.rejects(createLead(db, content, execA, form({ name: "TEST", company: "TEST", source_channel: "inbound_web", phone: phone() })), ValidationError, "website and referral sources are reserved for intake");
});

test("referral: unassigned lead with referrer; partner follows status only; manager cannot self-assign", async () => {
  const { db, content } = setup();
  const leadId = await submitReferral(db, partner, form({ business: "TEST Spa Referred", contact_name: "TEST Owner", phone: phone(), need: "TEST opening hours", playbook_key: "local-preview", consent: "1" }));
  assert.match(leadId, /^lead_/);
  await assert.rejects(submitReferral(db, partner, form({ business: "TEST No Consent", contact_name: "TEST", phone: phone(), need: "x", playbook_key: "local-preview" })), ValidationError);
  const lead = (await loadLead(db, manager, leadId)).lead;
  assert.deepEqual([lead.owner_id, lead.referrer_id, lead.source_channel, lead.consent_status], [null, "partner", "referral", "granted"]);
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM crm_opportunities").first<{ n: number }>().then((row) => row!.n), 0, "a referral is not an opportunity yet");
  await assert.rejects(loadLead(db, partner, leadId), NotFoundError, "the referrer cannot open the lead record");
  const mine = await myReferrals(db, "partner");
  assert.equal(mine.length, 1);
  assert.deepEqual([mine[0].kind, mine[0].lead_status_id, mine[0].assigned], ["lead", "received", 0]);
  await assert.rejects(assignLead(db, content, manager, await loadLead(db, manager, leadId), form({ version: lead.version, owner_id: "manager" })), ValidationError, "a Sales Manager cannot credit themselves");
  await assignLead(db, content, manager, await loadLead(db, manager, leadId), form({ version: lead.version, owner_id: "exec_a" }));
  assert.equal((await myReferrals(db, "partner"))[0].assigned, 1);
});

test("convert: new company, contact and opportunity keep source, referrer and owner; lead freezes", async () => {
  const { raw, db, content } = setup();
  const leadId = await submitReferral(db, partner, form({ business: "TEST Converted Spa", contact_name: "TEST Linh", phone: phone(), need: "TEST bookings", playbook_key: "local-preview", consent: "1" }));
  await assignLead(db, content, manager, await loadLead(db, manager, leadId), form({ version: 1, owner_id: "exec_a" }));
  await assert.rejects(convertLead(db, execB, { lead: (await loadLead(db, manager, leadId)).lead, canEdit: false }, form({ version: 2 })), ForbiddenError);
  const access = await loadLead(db, execA, leadId);
  await setLeadStatus(db, execA, access, await currentLeadProcess(db), form({ version: access.lead.version, status_id: "reached" }));
  const fresh = await loadLead(db, execA, leadId);
  await assert.rejects(convertLead(db, execA, fresh, form({ version: fresh.lead.version - 1, account_mode: "new", account_name: "TEST", contact_mode: "new", playbook_key: "local-preview", title: "TEST Converted Spa" })), ConflictError, "a stale conversion writes nothing");
  const requestKey = key();
  const fields = { version: fresh.lead.version, account_mode: "new", contact_mode: "new", account_name: "TEST Converted Spa", contact_role: "owner", playbook_key: "local-preview", title: "TEST Converted Spa — Starter", estimated_value_vnd: "", request_key: requestKey };
  const result = await convertLead(db, execA, fresh, form(fields));
  const opp = raw.prepare("SELECT * FROM crm_opportunities WHERE id = ?").get(result.opportunityId) as Record<string, unknown>;
  assert.deepEqual([opp.owner_id, opp.seller_id, opp.referrer_id, opp.source_channel, opp.stage_id, opp.estimated_value_vnd], ["exec_a", "exec_a", "partner", "referral", "new", null]);
  assert.equal((raw.prepare("SELECT owner_id FROM crm_accounts WHERE id = ?").get(result.accountId) as { owner_id: string }).owner_id, "exec_a");
  assert.equal((raw.prepare("SELECT consent_status FROM crm_contacts WHERE id = ?").get(result.contactId) as { consent_status: string }).consent_status, "granted");
  const lead = (await loadLead(db, execA, leadId)).lead;
  assert.equal(lead.state, "converted");
  assert.equal((await loadLead(db, execA, leadId)).canEdit, false);
  // A retried submission returns the same records and writes nothing new.
  const again = await convertLead(db, execA, fresh, form(fields));
  assert.equal(again.opportunityId, result.opportunityId);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM crm_opportunities").get() as { n: number }).n, 1);
  assert.throws(() => raw.prepare("UPDATE crm_lead_records SET name = 'x' WHERE id = ?").run(leadId), /lead_converted/, "a converted lead is frozen in the database");
  assert.equal((await sourceLead(db, execA, result.opportunityId))?.id, leadId);
  assert.equal(await sourceLead(db, execB, result.opportunityId), null);
  const mine = await myReferrals(db, "partner");
  assert.deepEqual([mine.length, mine[0].kind], [1, "opportunity"], "after conversion the referrer sees the opportunity stage only");
});

test("convert: existing company and contact must be within the seller's edit scope", async () => {
  const { raw, db, content } = setup();
  const now = "2026-10-29T00:00:00.000Z";
  raw.prepare("INSERT INTO crm_accounts (id, name, owner_id, created_by, created_at, updated_at) VALUES ('acc_b', 'TEST B Co', 'exec_b', 'exec_b', ?, ?)").run(now, now);
  raw.prepare("INSERT INTO crm_accounts (id, name, owner_id, created_by, created_at, updated_at) VALUES ('acc_a', 'TEST A Co', 'exec_a', 'exec_a', ?, ?)").run(now, now);
  raw.prepare("INSERT INTO crm_contacts (id, account_id, name, owner_id, created_by, created_at, updated_at) VALUES ('con_a', 'acc_a', 'TEST Existing', 'exec_a', 'exec_a', ?, ?)").run(now, now);
  raw.prepare("INSERT INTO crm_contacts (id, account_id, name, owner_id, created_by, created_at, updated_at) VALUES ('con_b', 'acc_b', 'TEST Other', 'exec_b', 'exec_b', ?, ?)").run(now, now);
  const id = await createLead(db, content, execA, form({ name: "TEST Existing", company: "TEST A Co", phone: phone(), source_channel: "phone" }));
  const access = await loadLead(db, execA, id);
  const base = { version: access.lead.version, playbook_key: "lumi-solution", title: "TEST Expansion" };
  await assert.rejects(convertLead(db, execA, access, form({ ...base, account_mode: "existing", account_id: "acc_b", contact_mode: "new" })), ValidationError, "another seller's company is not offered");
  await assert.rejects(convertLead(db, execA, access, form({ ...base, account_mode: "existing", account_id: "acc_a", contact_mode: "existing", contact_id: "con_b" })), ValidationError, "a contact must belong to the chosen company");
  const done = await convertLead(db, execA, access, form({ ...base, account_mode: "existing", account_id: "acc_a", contact_mode: "existing", contact_id: "con_a" }));
  assert.deepEqual([done.accountId, done.contactId, done.reusedAccount, done.reusedContact], ["acc_a", "con_a", true, true]);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM crm_accounts").get() as { n: number }).n, 2, "no duplicate company");
});

test("do-not-contact blocks lead creation and conversion; disqualify and reopen keep history", async () => {
  const { raw, db, content } = setup();
  const blocked = phone();
  const id = await createLead(db, content, execA, form({ name: "TEST Later Blocked", company: "TEST Blocked Co", phone: blocked, source_channel: "field_visit" }));
  const now = "2026-10-29T00:00:00.000Z";
  raw.prepare("INSERT INTO crm_accounts (id, name, do_not_contact, created_by, created_at, updated_at) VALUES ('acc_dnc', 'TEST DNC', 1, 'admin', ?, ?)").run(now, now);
  raw.prepare("INSERT INTO crm_contacts (id, account_id, name, phone_norm, do_not_contact, created_by, created_at, updated_at) VALUES ('con_dnc', 'acc_dnc', 'TEST', ?, 1, 'admin', ?, ?)").run(blocked, now, now);
  await assert.rejects(createLead(db, content, execB, form({ name: "TEST", company: "TEST", phone: blocked, source_channel: "phone" })), ValidationError);
  const access = await loadLead(db, execA, id);
  await assert.rejects(convertLead(db, execA, access, form({ version: access.lead.version, account_mode: "new", contact_mode: "new", account_name: "x", playbook_key: "local-preview", title: "x" })), ValidationError);
  const process = await currentLeadProcess(db);
  await assert.rejects(disqualifyLead(db, execA, access, process, form({ version: access.lead.version, reason_id: "invented" })), ValidationError, "reasons come from the lead process");
  await disqualifyLead(db, execA, access, process, form({ version: access.lead.version, reason_id: "declined", disqualify_note: "TEST asked not to be contacted" }));
  const gone = await loadLead(db, execA, id);
  assert.deepEqual([gone.lead.state, gone.canEdit], ["disqualified", false]);
  await assert.rejects(reopenLead(db, execA, gone, process, form({ version: gone.lead.version, reopen_reason: "TEST" })), ValidationError, "a suppressed number cannot be reopened");
  const kinds = (raw.prepare("SELECT kind FROM crm_events WHERE lead_id = ? ORDER BY created_at").all(id) as { kind: string }[]).map((row) => row.kind);
  assert.deepEqual(kinds, ["lead_created", "lead_disqualified"]);
});

test("intake: a signed enquiry becomes an unassigned lead; the Lark card carries no phone or email", async () => {
  const { raw, db, content } = setup();
  const body = JSON.stringify({ name: "TEST Inbound", business: "TEST Inbound Garage", phone: "0912 345 678", email: "owner@example.test", note: "TEST call me", locale: "vi", consent: true, consent_text_version: "v1", context: null });
  const result = await storeIntake(db, { ok: true, key: "enq_test_000000000001", source: "local.runlumi.app", body });
  assert.equal(result.status, 201);
  const inbound = raw.prepare("SELECT lead_id, opportunity_id, status FROM crm_inbound").get() as { lead_id: string; opportunity_id: string | null; status: string };
  assert.deepEqual([inbound.opportunity_id, inbound.status], [null, "queued"]);
  const lead = (await loadLead(db, manager, inbound.lead_id)).lead;
  assert.deepEqual([lead.owner_id, lead.source_channel, lead.state, lead.status_id], [null, "inbound_web", "open", "received"]);
  assert.equal((await storeIntake(db, { ok: true, key: "enq_test_000000000001", source: "local.runlumi.app", body })).status, 200, "same key and body is a duplicate");
  const event = raw.prepare("SELECT id, opportunity_id, account_id, lead_id, actor_name, kind, body, created_at FROM crm_events WHERE lead_id = ?").get(inbound.lead_id) as never;
  const card = JSON.stringify(eventCard(await eventFacts(db, content, event)));
  assert.match(card, /TEST Inbound Garage/);
  assert.doesNotMatch(card, /0912|345 678|owner@example/);
  // Assignment marks the enquiry handled.
  await assignLead(db, content, manager, await loadLead(db, manager, inbound.lead_id), form({ version: lead.version, owner_id: "exec_b" }));
  assert.equal((raw.prepare("SELECT status FROM crm_inbound").get() as { status: string }).status, "assigned");
});

test("review fixes: Today shows only the person's own leads, managers included", async () => {
  const { db, content } = setup();
  await createLead(db, content, execA, form({ name: "TEST A lead", company: "TEST A Co", phone: phone(), source_channel: "phone" }));
  await createLead(db, content, manager, form({ name: "TEST M lead", company: "TEST M Co", phone: phone(), source_channel: "phone", owner_id: "manager" }));
  await createLead(db, content, manager, form({ name: "TEST queue lead", company: "TEST Q Co", phone: phone(), source_channel: "phone", owner_id: "unassigned" }));
  const { loadToday } = await import("../src/lib/crm/today.ts");
  const team = await loadToday(db, manager, [], 30);
  assert.deepEqual(team.leads.map((lead) => lead.name), ["TEST M lead"], "another seller's leads are not on the manager's list");
  assert.equal(team.unassignedLeads, 1, "the queue stays a separate count");
  assert.deepEqual((await loadToday(db, execA, [], 30)).leads.map((lead) => lead.name), ["TEST A lead"]);
});

test("review fixes: reopening after a new lead-process version moves the lead to that version", async () => {
  const { raw, db, content } = setup();
  const id = await createLead(db, content, execA, form({ name: "TEST Reopen", company: "TEST Reopen Co", phone: phone(), source_channel: "phone" }));
  const v1 = await currentLeadProcess(db);
  await disqualifyLead(db, execA, await loadLead(db, execA, id), v1, form({ version: 1, reason_id: "no_response" }));
  raw.prepare("INSERT INTO crm_policies (id, policy_key, version, body, source_ref, effective_from, created_by, created_at) VALUES ('crm-lead-process@2', 'crm-lead-process', 2, ?, 'test', '2026-10-29', 'admin', '2026-10-29T01:00:00.000Z')")
    .run(JSON.stringify({ statuses: [{ id: "fresh", en: "Fresh", vi: "Mới" }], disqualify_reasons: [{ id: "not_fit", en: "Not a fit", vi: "Không phù hợp" }] }));
  const v2 = await currentLeadProcess(db);
  await reopenLead(db, execA, await loadLead(db, execA, id), v2, form({ version: 2, reopen_reason: "TEST owner called back" }));
  const lead = (await loadLead(db, execA, id)).lead;
  assert.deepEqual([lead.state, lead.status_id, lead.process_id], ["open", "fresh", "crm-lead-process@2"]);
});

test("review fixes: a repeated conversion after commit returns the same records instead of an error", async () => {
  const { raw, db, content } = setup();
  const id = await createLead(db, content, execA, form({ name: "TEST Twice", company: "TEST Twice Co", phone: phone(), source_channel: "phone" }));
  const fields = { version: 1, account_mode: "new", account_name: "TEST Twice Co", contact_mode: "new", playbook_key: "local-preview", title: "TEST Twice Co" };
  const first = await convertLead(db, execA, await loadLead(db, execA, id), form(fields));
  // A second click carries a new request key and the old version.
  const second = await convertLead(db, execA, await loadLead(db, execA, id), form(fields));
  assert.equal(second.opportunityId, first.opportunityId);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM crm_opportunities").get() as { n: number }).n, 1);
  await assert.rejects(convertLead(db, execB, { lead: (await loadLead(db, manager, id)).lead, canEdit: false }, form(fields)), ForbiddenError, "someone else still cannot act on it");
});

test("review fixes: two concurrent lead-process saves give one version and a conflict, not a server error", async () => {
  const { raw, db } = setup();
  const { saveLeadProcessVersion } = await import("../src/lib/crm/leads.ts");
  const fields = { "status.0.id": "received", "status.0.en": "Received", "status.0.vi": "Đã tiếp nhận", "reason.0.id": "not_fit", "reason.0.en": "Not a fit", "reason.0.vi": "Không phù hợp" };
  // The other admin's save lands between this save's read and its write.
  const racing = new Proxy(db, { get(target, prop) {
    if (prop !== "batch") return Reflect.get(target, prop);
    return async (statements: D1PreparedStatement[]) => {
      raw.prepare("INSERT INTO crm_policies (id, policy_key, version, body, source_ref, effective_from, created_by, created_at) VALUES ('crm-lead-process@2', 'crm-lead-process', 2, '{}', 'other admin', '2026-10-29', 'other', '2026-10-29T02:00:00.000Z')").run();
      return target.batch(statements);
    };
  } });
  await assert.rejects(saveLeadProcessVersion(racing, admin, form(fields)), ConflictError);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM crm_policies WHERE policy_key = 'crm-lead-process'").get() as { n: number }).n, 2);
  assert.equal(await saveLeadProcessVersion(db, admin, form(fields)), "crm-lead-process@3", "the next save succeeds");
});
