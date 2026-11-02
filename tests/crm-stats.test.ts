// CRM stats and ward/district/city (real SQLite, every migration applied).
// Synthetic businesses only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contentD1, migratedD1 } from "./fixtures/d1-sqlite.ts";
import type { CrmActor } from "../src/lib/crm/access.ts";
import { areaFilter, findProvince, findWard, parseArea, provinces } from "../src/lib/crm/area.ts";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlaybook } from "../src/lib/crm/config.ts";
import { ForbiddenError, ValidationError } from "../src/lib/crm/core.ts";
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

const HCM = "Thành phố Hồ Chí Minh";

test("area: only post-merger provinces and wards; case, accents and prefixes do not matter; old names are not guessed", () => {
  assert.equal(provinces.length, 34);
  assert.equal(provinces.reduce((sum, item) => sum + item.wards.length, 0), 3321);
  assert.equal(findProvince("tp hcm")?.fullName, HCM);
  assert.equal(findProvince("TP. Hồ Chí Minh")?.fullName, HCM);
  assert.equal(findProvince("Bình Dương")?.fullName, HCM, "pre-merger provinces map to their new province");
  assert.equal(findProvince("ha noi")?.fullName, "Thành phố Hà Nội");
  assert.equal(findProvince("Quận 4"), null);
  const hcm = findProvince(HCM)!;
  assert.equal(findWard(hcm, "khanh hoi")?.fullName, "Phường Khánh Hội");
  assert.equal(findWard(hcm, "P. Khánh Hội")?.fullName, "Phường Khánh Hội");
  assert.equal(findWard(hcm, "Phường 13"), null, "pre-merger numbered wards do not exist any more");
  assert.deepEqual(parseArea("12 Đoàn Văn Bơ, Phường Khánh Hội, TP.HCM"), { ward: "Phường Khánh Hội", district: "", city: HCM });
  assert.deepEqual(parseArea("12 Đoàn Văn Bơ, P.13, Q.4, TP.HCM"), { ward: "", district: "", city: HCM }, "old ward and district are dropped, not guessed");
  assert.deepEqual(parseArea("Đường số 9, khu A, Thủ Đức"), { ward: "", district: "", city: "" });
  assert.deepEqual(areaFilter("hcm", "xóm chiếu"), { city: HCM, ward: "Phường Xóm Chiếu" });
  assert.deepEqual(areaFilter("nowhere", "x"), { city: "", ward: "" });
});

test("area is validated on save, read from addresses, and a converted lead hands it to the new company", async () => {
  const { raw, db, content } = setup();
  const accountId = await createAccount(db, content, execA, form({ name: "TEST Nail Khánh Hội", industry: "Nail", address: "45 Khánh Hội, Phường Khánh Hội, Hồ Chí Minh" }));
  const account = await loadAccount(db, execA, accountId);
  assert.deepEqual([account.ward, account.district, account.city], ["Phường Khánh Hội", "", HCM]);
  await saveAccount(db, execA, account, form({ name: account.name, industry: "Nail", address: account.address, ward: "vinh hoi", city: "hcm", version: account.version }));
  const saved = await loadAccount(db, execA, accountId);
  assert.deepEqual([saved.ward, saved.city], ["Phường Vĩnh Hội", HCM], "typed values are stored in their official spelling");
  await assert.rejects(saveAccount(db, execA, saved, form({ name: saved.name, ward: "Phường 13", city: HCM, version: saved.version })), (error: unknown) => error instanceof ValidationError && error.fields.ward === "invalid");
  await assert.rejects(saveAccount(db, execA, saved, form({ name: saved.name, city: "Quận 4", version: saved.version })), (error: unknown) => error instanceof ValidationError && error.fields.city === "invalid");

  const leadId = await createLead(db, content, execA, form({ name: "TEST Chị Lan", company: "TEST Lan Spa", industry: "Spa", city: "Thành phố Hồ Chí Minh", ward: "Phường Tân Thuận", phone: phone(), source_channel: "field_visit" }));
  const lead = (await loadLead(db, execA, leadId)).lead;
  assert.deepEqual([lead.ward, lead.city], ["Phường Tân Thuận", HCM]);
  const result = await convertLead(db, execA, await loadLead(db, execA, leadId), form({ version: lead.version, account_mode: "new", contact_mode: "new", account_name: "TEST Lan Spa", contact_role: "owner", playbook_key: "local-preview", title: "TEST Lan Spa" }));
  const converted = raw.prepare("SELECT ward, city FROM crm_accounts WHERE id = ?").get(result.accountId) as { ward: string; city: string };
  assert.deepEqual([converted.ward, converted.city], ["Phường Tân Thuận", HCM]);
});

test("stats: up to five sets compare areas inside the viewer's own scope; the funnel follows stage history", async () => {
  const { db, content } = setup();
  const kh = await deal(db, content, execA, { account_name: "TEST Spa KH One", industry: "Spa", city: HCM, ward: "Phường Khánh Hội" });
  await deal(db, content, execA, { account_name: "TEST Spa VH", industry: "Spa", city: HCM, ward: "Phường Vĩnh Hội" });
  await deal(db, content, execB, { account_name: "TEST Nail KH", industry: "Nail", city: HCM, ward: "Phường Khánh Hội" });
  await deal(db, content, execB, { account_name: "TEST Nail HN", industry: "Nail", city: "Hà Nội", ward: "Phường Ba Đình" });
  await createLead(db, content, execA, form({ name: "TEST Lead", company: "TEST Lead Spa", industry: "spa", city: "hcm", ward: "khánh hội", phone: phone(), source_channel: "field_visit" }));
  // Move one Khánh Hội deal through "Qualified to approach".
  const playbook = (await getPlaybook(db, "local-preview@1"))!;
  let opp = (await loadOpportunity(db, execA, kh.id)).opportunity;
  await saveFields(db, execA, opp, playbook, form({ version: opp.version, "field.industry": "Spa", "field.location": "Khánh Hội", checks_present: 1, "check.presence_checked": 1 }));
  opp = (await loadOpportunity(db, execA, kh.id)).opportunity;
  await moveStage(db, execA, opp, playbook, form({ version: opp.version, to_stage: "qualified" }));
  opp = (await loadOpportunity(db, execA, kh.id)).opportunity;
  await moveStage(db, execA, opp, playbook, form({ version: opp.version, to_stage: "not_fit", reason: "TEST" }));

  const params = new URLSearchParams({ n: "3", s0_city: "tp hcm", s1_city: "Hà Nội", s2_city: HCM, s2_ward: "Khánh Hội", s0_owner: "exec_b" });
  const url = new URL(`https://x.test/crm/reports?${params}`);
  const forSeller = readStatsQuery(url, execA, ["local-preview"]);
  assert.equal(forSeller.sets.length, 3);
  assert.equal(forSeller.sets[0].owner, "", "only team-wide roles filter by owner");
  assert.equal(forSeller.sets[0].city, HCM, "filter values are resolved to official names");
  assert.equal(forSeller.sets[2].ward, "Phường Khánh Hội");
  const ids = ["local-preview@1"];
  const run = async (who: CrmActor, query: ReturnType<typeof readStatsQuery>) => Promise.all(query.sets.map((set) => loadSetStats(db, who, query, set, playbook.def, ids)));
  const seller = await run(execA, forSeller);
  assert.deepEqual(seller.map((item) => item.opportunities), [2, 0, 1], "a seller compares only their own deals");
  assert.equal(seller[2].leads, 1, "the lead typed as 'khánh hội' counts in Phường Khánh Hội");
  params.delete("s0_owner");
  const team = await run(manager, readStatsQuery(new URL(`https://x.test/crm/reports?${params}`), manager, ["local-preview"]));
  assert.deepEqual(team.map((item) => item.opportunities), [3, 1, 2]);
  assert.deepEqual(team[2].funnel.slice(0, 2), [{ id: "new", count: 2 }, { id: "qualified", count: 1 }]);
  assert.equal(team[2].lost, 1);
  assert.equal(team[2].openPipeline, 1);
  assert.equal(rate(team[0].won, team[0].opportunities), 0);
  assert.equal(rate(0, 0), null, "nothing to divide by is unknown, not 0%");
  const industry = { ...emptySet, industry: "SPA" };
  assert.equal((await loadSetStats(db, manager, forSeller, industry, playbook.def, ids)).opportunities, 2, "industry matches ignoring case");
  const byWard = await loadBreakdown(db, manager, forSeller, { ...emptySet, city: HCM }, "area", ids);
  assert.equal(byWard.level, "ward");
  assert.deepEqual(byWard.rows.map((row) => [row.key, row.opportunities]), [["Phường Khánh Hội", 2], ["Phường Vĩnh Hội", 1]]);
  assert.equal((await loadBreakdown(db, manager, forSeller, emptySet, "area", ids)).level, "city");
  assert.ok((await areaOptions(db, execA)).industries.includes("Spa"));
  assert.ok(!(await areaOptions(db, execA)).industries.includes("Nail"), "industries come only from records the person can see");
});

test("stats query: at most five sets, a bounded period, and URLs that round-trip", () => {
  const now = new Date("2026-11-02T03:00:00Z");
  const query = readStatsQuery(new URL("https://x.test/?n=9&from=2020-01-01&to=2030-01-01&s4_city=H%C3%A0%20N%E1%BB%99i&s0_source=bogus&trend=won"), manager, ["local-preview"], now);
  assert.equal(query.sets.length, 5);
  assert.equal(query.to, "2026-11-02", "never past today");
  assert.equal(query.from, "2025-11-02", "at most 366 days");
  assert.equal(query.sets[0].source, "");
  assert.equal(query.sets[4].city, "Thành phố Hà Nội", "resolved to the official name");
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
  insert.run("acc_a", "TEST A", "", "1 Lê Lợi, Phường Sài Gòn, TP.HCM", "", "", "", now, now);
  insert.run("acc_b", "TEST B", "Thủ Đức", "Đường số 9", "", "", "", now, now);
  insert.run("acc_c", "TEST C", "", "", "Phường Bến Thành", "", HCM, now, now);
  assert.deepEqual(await areaGaps(db), { accounts: 2, leads: 0 });
  await assert.rejects(fillAreas(db, manager), ForbiddenError);
  assert.deepEqual(await fillAreas(db, admin, { page: 1 }), { accounts: 1, leads: 0, unreadable: 1 }, "an unreadable row never blocks the next page");
  const rows = raw.prepare("SELECT id, ward, city, version FROM crm_accounts ORDER BY id").all() as { id: string; ward: string; city: string; version: number }[];
  assert.deepEqual(rows.map((row) => [row.id, row.ward, row.city, row.version]), [
    ["acc_a", "Phường Sài Gòn", HCM, 2], ["acc_b", "", "", 1], ["acc_c", "Phường Bến Thành", HCM, 1],
  ]);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM workspace_audit WHERE action = 'crm_area_backfill'").get() as { n: number }).n, 1);
});

test("migration 0058 moves stored areas to the post-merger map once, without guessing wards", () => {
  const raw = new DatabaseSync(":memory:");
  const dir = join(process.cwd(), "migrations");
  const files = readdirSync(dir).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  for (const file of files.filter((name) => name < "0058")) raw.exec(readFileSync(join(dir, file), "utf8"));
  const now = "2026-11-01T00:00:00.000Z";
  const insert = raw.prepare("INSERT INTO crm_accounts (id, name, ward, district, city, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'x', ?, ?)");
  insert.run("a1", "TEST old HCMC", "Phường 13", "Quận 4", "TP. Hồ Chí Minh", now, now);
  insert.run("a2", "TEST kept ward", "Phường Khánh Hội", "Quận 4", "TP. Hồ Chí Minh", now, now);
  insert.run("a3", "TEST old province", "", "", "Bình Dương", now, now);
  insert.run("a4", "TEST unknown", "Phường 1", "", "Quận 4", now, now);
  insert.run("a5", "TEST untouched", "", "", "", now, now);
  raw.exec(readFileSync(join(dir, files.find((name) => name.startsWith("0058"))!), "utf8"));
  const rows = raw.prepare("SELECT id, ward, district, city, version FROM crm_accounts ORDER BY id").all() as { id: string; ward: string; district: string; city: string; version: number }[];
  assert.deepEqual(rows.map((row) => [row.id, row.ward, row.district, row.city, row.version]), [
    ["a1", "", "", HCM, 2], ["a2", "Phường Khánh Hội", "", HCM, 2], ["a3", "", "", HCM, 2], ["a4", "", "", "", 2], ["a5", "", "", "", 1],
  ]);
  const audit = raw.prepare("SELECT detail FROM workspace_audit WHERE action = 'crm_area_post_merger'").get() as { detail: string };
  assert.deepEqual(JSON.parse(audit.detail), { accounts: 4, accounts_city_kept: 3, accounts_ward_kept: 1, leads: 0, leads_city_kept: 0, leads_ward_kept: 0 });
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'tmp_area%'").get()!.n, 0, "lookup tables are dropped");
});

test("stats permission: sellers and managers, never partners, finance or fulfillment", () => {
  const can = (roles: Parameters<typeof makeUser>[2]) => makeUser({ id: "u", name: "TEST", email: "u@example.test" }, false, roles).can("crm.stats");
  assert.equal(can(["sales_executive"]), true);
  assert.equal(can(["sales_manager"]), true);
  assert.equal(can(["partner"]), false);
  assert.equal(can(["finance"]), false);
  assert.equal(can(["fulfillment"]), false);
  assert.equal(makeUser({ id: "a", name: "TEST", email: "a@example.test" }, true, []).can("crm.stats"), true);
  // Stats live on the Reports page, which every CRM member already has; there is no separate nav entry.
  assert.ok(!moduleByKey("crm").links.some((link) => link.key === "stats"));
  assert.ok(visibleLinks(makeUser({ id: "p", name: "TEST", email: "p@example.test" }, false, ["partner"]), moduleByKey("crm")).some((link) => link.key === "reports"));
});
