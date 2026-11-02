// CRM stats and ward/district/city (real SQLite, every migration applied).
// Synthetic businesses only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contentD1, migratedD1 } from "./fixtures/d1-sqlite.ts";
import type { CrmActor } from "../src/lib/crm/access.ts";
import { completeArea, normalizeArea, parseArea } from "../src/lib/crm/area.ts";
import { getPlaybook } from "../src/lib/crm/config.ts";
import { ForbiddenError } from "../src/lib/crm/core.ts";
import { createAccount, loadAccount, saveAccount } from "../src/lib/crm/directory.ts";
import { convertLead, createLead, loadLead } from "../src/lib/crm/leads.ts";
import { loadOpportunity, moveStage, quickCreate, saveFields } from "../src/lib/crm/records.ts";
import { areaGaps, areaOptions, buckets, emptySet, fillAreas, loadBreakdown, loadSetStats, rate, readStatsQuery, statsSearch } from "../src/lib/crm/stats.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { moduleByKey, visibleLinks } from "../src/lib/workspace/nav.ts";

const actor = (id: string, extra: Partial<CrmActor> = {}): CrmActor => ({ id, name: `TEST ${id}`, email: `${id}@example.test`, manager: false, configure: false, finance: false, fulfillment: false, refer: true, reportPayments: true, ...extra });
const execA = actor("exec_a");
const execB = actor("exec_b");
const manager = actor("manager", { manager: true });
const admin = actor("admin", { manager: true, configure: true, finance: true, fulfillment: true });
let counter = 0;
const form = (fields: Record<string, string | number>) => { const data = new FormData(); for (const [name, value] of Object.entries(fields)) data.set(name, String(value)); if (!data.has("request_key")) data.set("request_key", `statskey_${String(++counter).padStart(12, "0")}`); return data; };
const phone = (() => { let n = 20_000_000; return () => `09${String(++n)}`; })();

function setup() {
  const { raw, d1 } = migratedD1();
  const now = "2026-11-01T00:00:00.000Z";
  for (const [id, role] of [["exec_a", "sales_executive"], ["exec_b", "sales_executive"], ["manager", "sales_manager"]] as const) {
    raw.prepare("INSERT INTO workspace_members (user_id, enabled, granted_by, created_at, updated_at) VALUES (?, 1, 'admin', ?, ?)").run(id, now, now);
    raw.prepare("INSERT INTO workspace_roles (user_id, role, granted_by, granted_at) VALUES (?, ?, 'admin', ?)").run(id, role, now);
  }
  const content = contentD1([
    { id: "exec_a", email: "a@example.test", name: "TEST A", role: 30 }, { id: "exec_b", email: "b@example.test", name: "TEST B", role: 30 },
    { id: "manager", email: "m@example.test", name: "TEST M", role: 30 }, { id: "admin", email: "x@example.test", name: "TEST X", role: 50 },
  ]);
  return { raw, db: d1, content };
}
const deal = (db: D1Database, content: D1Database, who: CrmActor, extra: Record<string, string>) =>
  quickCreate(db, content, who, form({ contact_name: "TEST Owner", playbook_key: "local-preview", source_channel: "field_visit", phone: phone(), ...extra }));

test("area: marked parts are read and normalised; unmarked text is never guessed", () => {
  assert.deepEqual(parseArea("123 Đoàn Văn Bơ, P.13, Q.4, TP.HCM"), { ward: "Phường 13", district: "Quận 4", city: "TP. Hồ Chí Minh" });
  assert.deepEqual(parseArea("Xã Bình Hưng, Huyện Bình Chánh, Hồ Chí Minh"), { ward: "Xã Bình Hưng", district: "Huyện Bình Chánh", city: "TP. Hồ Chí Minh" });
  assert.deepEqual(parseArea("Đường số 9, khu A, Thủ Đức"), {}, "no marker, no guess");
  assert.equal(normalizeArea("district", "q 4"), "Quận 4");
  assert.equal(normalizeArea("ward", "p.12"), "Phường 12");
  assert.equal(normalizeArea("city", "tp hcm"), "TP. Hồ Chí Minh");
  assert.equal(normalizeArea("district", "QUẬN BÌNH THẠNH"), "Quận Bình Thạnh");
  assert.deepEqual(completeArea({ district: "Q7" }, "Phường Tân Phong"), { ward: "Phường Tân Phong", district: "Quận 7", city: "TP. Hồ Chí Minh" }, "numbered districts are HCMC only");
  assert.deepEqual(completeArea({ ward: "Phường 1", district: "Quận Gò Vấp", city: "" }, ""), { ward: "Phường 1", district: "Quận Gò Vấp", city: "" });
});

test("area is saved on companies, leads and quick-created deals, and a converted lead hands it to the new company", async () => {
  const { raw, db, content } = setup();
  const accountId = await createAccount(db, content, execA, form({ name: "TEST Nail Khánh Hội", industry: "Nail", address: "45 Khánh Hội, P.4, Q.4, TP.HCM" }));
  const account = await loadAccount(db, execA, accountId);
  assert.deepEqual([account.ward, account.district, account.city], ["Phường 4", "Quận 4", "TP. Hồ Chí Minh"]);
  await saveAccount(db, execA, account, form({ name: account.name, industry: "Nail", address: account.address, ward: "phường 2", district: "q4", city: "hcm", version: account.version }));
  const saved = await loadAccount(db, execA, accountId);
  assert.deepEqual([saved.ward, saved.district, saved.city], ["Phường 2", "Quận 4", "TP. Hồ Chí Minh"], "typed values win and are normalised");

  const leadId = await createLead(db, content, execA, form({ name: "TEST Chị Lan", company: "TEST Lan Spa", industry: "Spa", region: "Quận 7", phone: phone(), source_channel: "field_visit" }));
  const lead = (await loadLead(db, execA, leadId)).lead;
  assert.deepEqual([lead.ward, lead.district, lead.city], ["", "Quận 7", "TP. Hồ Chí Minh"]);
  const result = await convertLead(db, execA, await loadLead(db, execA, leadId), form({ version: lead.version, account_mode: "new", contact_mode: "new", account_name: "TEST Lan Spa", contact_role: "owner", playbook_key: "local-preview", title: "TEST Lan Spa" }));
  const converted = raw.prepare("SELECT district, city FROM crm_accounts WHERE id = ?").get(result.accountId) as { district: string; city: string };
  assert.deepEqual([converted.district, converted.city], ["Quận 7", "TP. Hồ Chí Minh"]);

  const quick = await deal(db, content, execA, { account_name: "TEST Tóc Bình Thạnh", industry: "Tóc", region: "Q. Bình Thạnh, Sài Gòn" });
  const quickAccount = raw.prepare("SELECT a.district, a.city FROM crm_accounts a JOIN crm_opportunities o ON o.account_id = a.id WHERE o.id = ?").get(quick.id) as { district: string; city: string };
  assert.deepEqual([quickAccount.district, quickAccount.city], ["Quận Bình Thạnh", "TP. Hồ Chí Minh"]);
});

test("stats: up to five sets compare areas inside the viewer's own scope; the funnel follows stage history", async () => {
  const { db, content } = setup();
  const q4 = await deal(db, content, execA, { account_name: "TEST Spa Q4 One", industry: "Spa", region: "Phường 13, Quận 4, TP.HCM" });
  await deal(db, content, execA, { account_name: "TEST Spa Q4 Two", industry: "Spa", region: "Phường 6, Quận 4, TP.HCM" });
  await deal(db, content, execB, { account_name: "TEST Nail Q4", industry: "Nail", region: "Phường 13, Quận 4, TP.HCM" });
  await deal(db, content, execB, { account_name: "TEST Nail Q7", industry: "Nail", region: "Quận 7, TP.HCM" });
  await createLead(db, content, execA, form({ name: "TEST Lead", company: "TEST Lead Spa", industry: "spa", region: "Q4", phone: phone(), source_channel: "field_visit" }));
  // Move one Quận 4 deal through "Qualified to approach".
  const playbook = (await getPlaybook(db, "local-preview@1"))!;
  let opp = (await loadOpportunity(db, execA, q4.id)).opportunity;
  await saveFields(db, execA, opp, playbook, form({ version: opp.version, checks_present: 1, "check.presence_checked": 1 }));
  opp = (await loadOpportunity(db, execA, q4.id)).opportunity;
  await moveStage(db, execA, opp, playbook, form({ version: opp.version, to_stage: "qualified" }));
  opp = (await loadOpportunity(db, execA, q4.id)).opportunity;
  await moveStage(db, execA, opp, playbook, form({ version: opp.version, to_stage: "not_fit", reason: "TEST" }));

  const url = new URL("https://x.test/crm/stats?n=3&s0_district=Qu%E1%BA%ADn%204&s1_district=Qu%E1%BA%ADn%207&s2_ward=Ph%C6%B0%E1%BB%9Dng%2013%7CQu%E1%BA%ADn%204%7CTP.%20H%E1%BB%93%20Ch%C3%AD%20Minh&s0_owner=exec_b");
  const forSeller = readStatsQuery(url, execA, ["local-preview"]);
  assert.equal(forSeller.sets.length, 3);
  assert.equal(forSeller.sets[0].owner, "", "only team-wide roles filter by owner");
  const ids = ["local-preview@1"];
  const run = async (who: CrmActor, query: ReturnType<typeof readStatsQuery>) => Promise.all(query.sets.map((set) => loadSetStats(db, who, query, set, playbook.def, ids)));
  const seller = await run(execA, forSeller);
  assert.deepEqual(seller.map((item) => item.opportunities), [2, 0, 1], "a seller compares only their own deals");
  assert.equal(seller[0].leads, 1, "the lead typed as Q4 counts in Quận 4");
  const team = await run(manager, readStatsQuery(new URL(url.href.replace("&s0_owner=exec_b", "")), manager, ["local-preview"]));
  assert.deepEqual(team.map((item) => item.opportunities), [3, 1, 2]);
  // Funnel: 3 Quận 4 deals at "New"; one reached "Qualified" before it was lost.
  assert.deepEqual(team[0].funnel.slice(0, 2), [{ id: "new", count: 3 }, { id: "qualified", count: 1 }]);
  assert.equal(team[0].lost, 1);
  assert.equal(team[0].openPipeline, 2);
  assert.equal(rate(team[0].won, team[0].opportunities), 0);
  assert.equal(rate(0, 0), null, "nothing to divide by is unknown, not 0%");
  const industry = { ...emptySet, industry: "SPA" };
  assert.equal((await loadSetStats(db, manager, forSeller, industry, playbook.def, ids)).opportunities, 2, "industry matches ignoring case");
  const byArea = await loadBreakdown(db, manager, forSeller, { ...emptySet, city: "TP. Hồ Chí Minh" }, "area", ids);
  assert.equal(byArea.level, "district");
  assert.deepEqual(byArea.rows.map((row) => [row.key, row.opportunities]), [["Quận 4", 3], ["Quận 7", 1]]);
  const options = await areaOptions(db, execA);
  assert.ok(!options.districts.some((item) => item.value === "Quận 7"), "options come only from records the person can see");
  assert.ok(options.wards.some((item) => item.value === "Phường 13|Quận 4|TP. Hồ Chí Minh"));
});

test("stats query: at most five sets, a bounded period, and URLs that round-trip", () => {
  const now = new Date("2026-11-02T03:00:00Z");
  const query = readStatsQuery(new URL("https://x.test/?n=9&from=2020-01-01&to=2030-01-01&s4_city=H%C3%A0%20N%E1%BB%99i&s0_source=bogus&trend=won"), manager, ["local-preview"], now);
  assert.equal(query.sets.length, 5);
  assert.equal(query.to, "2026-11-02", "never past today");
  assert.equal(query.from, "2025-11-02", "at most 366 days");
  assert.equal(query.sets[0].source, "");
  assert.equal(query.sets[4].city, "Hà Nội");
  assert.deepEqual(readStatsQuery(new URL(`https://x.test/${statsSearch(query)}`), manager, ["local-preview"], now), query);
  assert.equal(buckets("2026-10-01", "2026-10-30").unit, "day");
  const weeks = buckets("2026-01-01", "2026-06-30");
  assert.equal(weeks.unit, "week");
  assert.equal(new Date(`${weeks.keys[0]}T00:00:00Z`).getUTCDay(), 1, "weeks start on Monday");
});

test("filling areas: admins only, blank fields only, unreadable stays blank, audited", async () => {
  const { raw, db } = setup();
  const now = "2026-10-01T00:00:00.000Z";
  const insert = raw.prepare("INSERT INTO crm_accounts (id, name, region, address, ward, district, city, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'x', ?, ?)");
  insert.run("acc_a", "TEST A", "", "1 Lê Lợi, P. Bến Nghé, Q.1, TP.HCM", "", "", "", now, now);
  insert.run("acc_b", "TEST B", "Thủ Đức", "Đường số 9", "", "", "", now, now);
  insert.run("acc_c", "TEST C", "Quận 3", "", "Phường 9", "", "", now, now);
  assert.deepEqual(await areaGaps(db), { accounts: 2, leads: 0 });
  await assert.rejects(fillAreas(db, manager), ForbiddenError);
  assert.deepEqual(await fillAreas(db, admin, { page: 1 }), { accounts: 1, leads: 0, unreadable: 1 }, "an unreadable row never blocks the next page");
  const rows = raw.prepare("SELECT id, ward, district, city, version FROM crm_accounts ORDER BY id").all() as { id: string; ward: string; district: string; city: string; version: number }[];
  assert.deepEqual(rows.map((row) => [row.id, row.ward, row.district, row.city, row.version]), [
    ["acc_a", "Phường Bến Nghé", "Quận 1", "TP. Hồ Chí Minh", 2], ["acc_b", "", "", "", 1], ["acc_c", "Phường 9", "", "", 1],
  ]);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM workspace_audit WHERE action = 'crm_area_backfill'").get() as { n: number }).n, 1);
});

test("stats permission: sellers and managers, never partners, finance or fulfillment", () => {
  const crm = moduleByKey("crm");
  const sees = (roles: Parameters<typeof makeUser>[2]) => visibleLinks(makeUser({ id: "u", name: "TEST", email: "u@example.test" }, false, roles), crm).some((link) => link.key === "stats");
  assert.equal(sees(["sales_executive"]), true);
  assert.equal(sees(["sales_manager"]), true);
  assert.equal(sees(["partner"]), false);
  assert.equal(sees(["finance"]), false);
  assert.equal(sees(["fulfillment"]), false);
  assert.equal(makeUser({ id: "a", name: "TEST", email: "a@example.test" }, true, []).can("crm.stats"), true);
});
