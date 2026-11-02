// Dry run of the one-off CRM area import (importAreasOnce in src/lib/crm/stats.ts):
// reads the same blank records and text the import reads, runs parseArea from
// src/lib/crm/area.ts on them and prints aggregate counts only. Writes nothing
// to the database. With --sql <file> it also writes the UPDATE statements the
// import would run (plus its audit row) to that file, for review and a manual
// `wrangler d1 execute --file`; the file holds record IDs and area names only.
// Prints no names, phone numbers or addresses: only counts, the short area
// strings (region, deal location), ward-marked parts and province parts.
// Run: node --experimental-strip-types scripts/crm-area-dry-run.mjs [--local] [--sql <file>]
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { areaKey, findProvince, parseArea } from "../src/lib/crm/area.ts";

const where = process.argv.includes("--local") ? "--local" : "--remote";
const sqlFile = process.argv.includes("--sql") ? process.argv[process.argv.indexOf("--sql") + 1] : "";
const LOCATION = "(SELECT json_extract(o.fields, '$.location') FROM crm_opportunities o WHERE o.account_id = crm_accounts.id AND COALESCE(json_extract(o.fields, '$.location'), '') != '' ORDER BY o.updated_at DESC LIMIT 1)";
const SOURCES = {
  accounts: `SELECT id, version, address, region, COALESCE(${LOCATION}, '') AS location FROM crm_accounts WHERE ward = '' AND city = '' AND (address != '' OR region != '' OR ${LOCATION} IS NOT NULL)`,
  leads: "SELECT id, version, '' AS address, region, '' AS location FROM crm_lead_records WHERE ward = '' AND city = '' AND region != ''",
};

function query(sql) {
  const out = execFileSync("./node_modules/.bin/wrangler", ["d1", "execute", "lumi-jobs", where, "--json", "--command", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out)[0].results;
}
const tally = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const sorted = (map) => Object.fromEntries([...map].sort((a, b) => b[1] - a[1]));
const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const now = new Date().toISOString();
const statements = [];
const counts = { accounts: 0, leads: 0, unreadable: 0 };
const TABLES = { accounts: "crm_accounts", leads: "crm_lead_records" };
const WARD_MARKED = /^(?:phường|p\.|xã|x\.|đặc khu)\s*\S/iu;

for (const [name, sql] of Object.entries(SOURCES)) {
  const rows = query(sql);
  const result = { records: rows.length, city: 0, ward: 0, unreadable: 0 };
  const cities = new Map(), wards = new Map(), cityFrom = new Map(), unreadableArea = new Map(), wardParts = new Map(), provinceParts = new Map();
  for (const row of rows) {
    const area = parseArea(row.address, row.region, row.location);
    if (!area.city && !area.ward) { result.unreadable += 1; counts.unreadable += 1; tally(unreadableArea, `region=${row.region || "∅"} | location=${row.location || "∅"}`); continue; }
    counts[name] += 1;
    // Same statement as readAreasFromText in src/lib/crm/stats.ts.
    statements.push(`UPDATE ${TABLES[name]} SET ward = ${sqlText(area.ward)}, district = '', city = ${sqlText(area.city)}, version = version + 1, updated_at = ${sqlText(now)} WHERE id = ${sqlText(row.id)} AND version = ${Number(row.version)} AND ward = '' AND city = '';`);
    result.city += area.city ? 1 : 0;
    result.ward += area.ward ? 1 : 0;
    tally(cities, area.city);
    if (area.ward) tally(wards, area.ward);
    // Which single text would have given the province on its own.
    tally(cityFrom, ["address", "region", "location"].filter((key) => parseArea(row[key]).city).join("+") || "only combined");
    for (const part of row.address.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean)) {
      // Ward-marked parts: digits shown as # so old numbered wards group together.
      if (WARD_MARKED.test(part.normalize("NFC")) && part.length <= 40) tally(wardParts, /\d/.test(part) ? areaKey(part).replace(/\d+/g, "#") : areaKey(part));
    }
    // The two last address parts (where the province usually is), digits as #.
    for (const part of row.address.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean).slice(-2)) {
      if (part.length <= 30) tally(provinceParts, `${areaKey(part).replace(/\d+/g, "#")} → ${findProvince(part)?.fullName ?? "not a province"}`);
    }
  }
  console.log(`\n== ${name}`);
  console.log(JSON.stringify(result));
  console.log("city:", JSON.stringify(sorted(cities)));
  console.log("ward:", JSON.stringify(sorted(wards)));
  console.log("province readable from:", JSON.stringify(sorted(cityFrom)));
  console.log("unreadable region/location:", JSON.stringify(sorted(unreadableArea)));
  console.log("ward-marked address parts (not matched to a current ward unless listed under ward):", JSON.stringify(sorted(wardParts)));
  console.log("last two address parts:", JSON.stringify(sorted(provinceParts)));
}

if (sqlFile) {
  // The audit row importAreasOnce writes; it also stops the scheduled import from running again.
  statements.push(`INSERT INTO workspace_audit (id, actor_id, actor_name, action, target_user_id, detail, created_at, module, outcome, via) VALUES (${[
    `aud_${crypto.randomUUID().replaceAll("-", "")}`, "system:crm-area-import", "CRM area import (one-off)", "crm_area_text_import", "system:crm-area-import", JSON.stringify(counts), now, "crm", "success", "system",
  ].map(sqlText).join(", ")});`);
  writeFileSync(sqlFile, statements.join("\n") + "\n");
  console.log(`\nwrote ${statements.length} statements to ${sqlFile}`);
}
