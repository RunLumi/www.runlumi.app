// CRM API checklist ticks (move into "Qualified to approach" needs
// presence_checked) and case-insensitive, any-order word search over real
// SQLite with every migration applied. Synthetic businesses only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contentD1, migratedD1 } from "./fixtures/d1-sqlite.ts";
import type { CrmActor } from "../src/lib/crm/access.ts";
import { ValidationError } from "../src/lib/crm/core.ts";
import { type ToolContext, findTool } from "../src/lib/crm/api/tools.ts";
import { listAccounts, listContacts } from "../src/lib/crm/directory.ts";
import { listOpportunities } from "../src/lib/crm/records.ts";
import { caseForms, matchesSearch, sameTextSql, searchSql, searchTerms } from "../src/lib/search.ts";

const seller: CrmActor = { id: "exec_a", name: "TEST A (API: agent)", email: "a@example.test", manager: false, configure: false, finance: false, fulfillment: false, refer: true, reportPayments: true };
let counter = 0;

function setup() {
  const { raw, d1 } = migratedD1();
  const now = "2026-11-02T00:00:00.000Z";
  raw.prepare("INSERT INTO workspace_members (user_id, enabled, granted_by, created_at, updated_at) VALUES ('exec_a', 1, 'admin', ?, ?)").run(now, now);
  raw.prepare("INSERT INTO workspace_roles (user_id, role, granted_by, granted_at) VALUES ('exec_a', 'sales_executive', 'admin', ?)").run(now);
  const content = contentD1([{ id: "exec_a", email: "a@example.test", name: "TEST A", role: 30 }]);
  const ctx = (): ToolContext => ({ db: d1, contentDb: content, identity: { actor: seller, token: { id: "tok_1", name: "agent", scope: "write" } } as never, requestKey: `apikey_${String(++counter).padStart(12, "0")}` });
  const call = async (name: string, args: Record<string, unknown>) => findTool(name)!.run(ctx(), args) as Promise<Record<string, unknown>>;
  return { raw, db: d1, call };
}

async function vanSpa(call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>) {
  const company = await call("create_company", { name: "TEST Vân Spa", industry: "Spa", region: "Quận Đống Đa", contact: { name: "TEST Chị Vân", phone: "0912000111", contact_basis: "Met in person" } });
  const contact = (await call("search_contacts", { q: "chị VÂN" })) as { contacts: { id: string }[] };
  assert.equal(contact.contacts.length, 1, "API search ignores letter case");
  const opp = await call("create_opportunity", { company_id: company.id, contact_id: contact.contacts[0].id, playbook_key: "local-preview", source_channel: "field_visit" });
  return { company, opp };
}

test("API: presence_checked can be ticked so the deal moves to Qualified to approach", async () => {
  const { call } = setup();
  const { opp } = await vanSpa(call);
  const detail = opp as { id: string; checks: Record<string, boolean>; playbook: { checklist: { key: string }[] } };
  assert.equal(detail.checks.presence_checked, false);
  assert.ok(detail.playbook.checklist.some((item) => item.key === "presence_checked"), "the checklist is visible to agents");
  const playbooks = await call("list_playbooks", {}) as { playbooks: { key: string; checklist: { key: string }[] }[] };
  assert.ok(playbooks.playbooks.find((item) => item.key === "local-preview")!.checklist.some((item) => item.key === "presence_checked"));

  await assert.rejects(call("move_stage", { opportunity_id: detail.id, to_stage: "qualified" }), (error: unknown) => error instanceof ValidationError && /presence_checked/.test(error.fields.to_stage));
  await call("update_opportunity_fields", { opportunity_id: detail.id, fields: { industry: "Spa", location: "Đống Đa, Hà Nội" }, checks: { presence_checked: true } });
  const moved = await call("move_stage", { opportunity_id: detail.id, to_stage: "qualified" });
  assert.equal(moved.stage_id, "qualified");
  assert.equal((moved.checks as Record<string, boolean>).presence_checked, true);
});

test("API: a checklist key sent as a field is a tick; other ticks stay; errors say what is expected", async () => {
  const { call } = setup();
  const { opp } = await vanSpa(call);
  const id = opp.id as string;
  const after = await call("update_opportunity_fields", { opportunity_id: id, fields: { presence_checked: "true", industry: "Spa" } });
  assert.deepEqual((after.checks as Record<string, boolean>).presence_checked, true);
  assert.equal((after.fields as Record<string, string>).industry, "Spa");
  // Updating only a field keeps the tick.
  const kept = await call("update_opportunity_fields", { opportunity_id: id, fields: { location: "Hà Nội" } });
  assert.equal((kept.checks as Record<string, boolean>).presence_checked, true);
  const invalid = async (args: Record<string, unknown>, key: string, code: RegExp) =>
    assert.rejects(call("update_opportunity_fields", { opportunity_id: id, ...args }), (error: unknown) => error instanceof ValidationError && code.test(error.fields[key]));
  await invalid({ checks: { presence_checked: "maybe" } }, "check.presence_checked", /expected_true_or_false/);
  await invalid({ checks: { scope_explained: true } }, "check.scope_explained", /not_available_at_this_stage/);
  await invalid({ checks: { nope: true } }, "check.nope", /unknown_key/);
  await invalid({ fields: { website_status: "Không có" } }, "field.website_status", /expected_one_of:none_found\|/);
  await invalid({ fields: { maps_url: "maps" } }, "field.maps_url", /expected_http_or_https_url/);
  await invalid({ fields: { friction: "later stage" } }, "field.friction", /not_available_at_this_stage/);
  await invalid({}, "fields", /required/);
});

test("search: every word, any order, ignoring case — Vietnamese capitals and combining accents included", async () => {
  const { db, call } = setup();
  await vanSpa(call);
  await call("create_company", { name: "TEST ĐẠI PHÁT Garage", industry: "Sửa xe", region: "Thủ Đức" });
  const companies = async (q: string) => (await listAccounts(db, seller, { q, owner: "" }, 1)).rows.map((row) => row.name);
  assert.deepEqual(await companies("vân spa"), ["TEST Vân Spa"]);
  assert.deepEqual(await companies("VÂN SPA"), ["TEST Vân Spa"]);
  assert.deepEqual(await companies("spa VÂN"), ["TEST Vân Spa"], "word order does not matter");
  assert.deepEqual(await companies("đại phát"), ["TEST ĐẠI PHÁT Garage"]);
  assert.deepEqual(await companies("Đại Phát thủ đức"), ["TEST ĐẠI PHÁT Garage"], "words may come from different columns");
  assert.deepEqual(await companies("đại".normalize("NFD")), ["TEST ĐẠI PHÁT Garage"], "decomposed input");
  assert.deepEqual(await companies("100%"), [], "LIKE wildcards are plain text");
  assert.deepEqual(await companies("_"), []);
  assert.equal((await companies("")).length, 2);
  assert.deepEqual((await listContacts(db, seller, { q: "chị VÂN", owner: "" }, 1)).rows.map((row) => row.name), ["TEST Chị Vân"]);
  assert.equal((await listContacts(db, seller, { q: "0912000", owner: "" }, 1)).total, 1, "phone digits still match");
  const opps = await listOpportunities(db, seller, { playbook: "", stage: "", owner: "", channel: "", cohort: "", industry: "", region: "", offer: "", outcome: "", q: "vÂn sPa" }, 1);
  assert.equal(opps.total, 1);
});

test("search helpers: words are folded, deduplicated and capped; in-memory matching agrees", () => {
  assert.deepEqual(searchTerms("  Vân   VÂN spa "), ["vân", "spa"]);
  assert.equal(searchSql(["a.name"], "   "), null);
  assert.equal(searchTerms("a b c d e f g h i j").length, 8);
  assert.equal(matchesSearch(["Nguyễn Thị Ánh", "anh@example.test"], "ÁNH nguyễn"), true);
  assert.equal(matchesSearch("Webhook Lark", "lark slack"), false);
  assert.equal(matchesSearch("anything", ""), true);
});

test("search SQL stays shallow: D1 rejects expression trees deeper than 100", () => {
  const depth = (sql: string) => { let deepest = 0, open = 0; for (const char of sql) { if (char === "(") deepest = Math.max(deepest, ++open); else if (char === ")") open -= 1; } return deepest; };
  const clause = searchSql(["a.name", "a.industry", "a.region", "a.address", "a.notes"], "một hai ba bốn năm sáu bảy tám");
  assert.ok(clause && depth(clause.sql) < 12, `nesting ${clause && depth(clause.sql)}`);
  assert.ok(depth(sameTextSql("a.city", "TP. Hồ Chí Minh").sql) < 5);
  assert.deepEqual(caseForms("đại").filter((form) => form === form.normalize("NFC")), ["đại", "ĐẠi", "Đại"], "lower, UPPER (only ASCII lowered by SQL) and Title case");
});
