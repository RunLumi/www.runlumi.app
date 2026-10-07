// Prints the seed INSERT statements for migrations/0003_crm_sales.sql from
// src/lib/crm/seed.ts, or rewrites the seed block in place with --write.
// Run: node --experimental-strip-types scripts/crm-seed-sql.mjs [--write]
import { readFileSync, writeFileSync } from "node:fs";
import { EFFECTIVE_FROM, SOURCE_PRICING, seedGatePolicy, seedOffers, seedPlaybooks } from "../src/lib/crm/seed.ts";

const CREATED_AT = "2026-10-07T00:00:00.000Z";
const SYSTEM = "system:migration-0003";
const q = (value) => value === null || value === undefined ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;

export function seedSql() {
  const lines = [];
  for (const offer of seedOffers) {
    lines.push(`INSERT INTO crm_offers (id, offer_key, version, name_en, name_vi, charge_type, list_price_vnd, scope_en, scope_vi, conditions_en, conditions_vi, rules, source_ref, effective_from, active, created_by, created_at) VALUES (${[
      `${offer.key}@1`, offer.key, 1, offer.name_en, offer.name_vi, offer.charge_type, offer.list_price_vnd, offer.scope_en, offer.scope_vi,
      offer.conditions_en, offer.conditions_vi, JSON.stringify(offer.rules), SOURCE_PRICING, EFFECTIVE_FROM, 1, SYSTEM, CREATED_AT,
    ].map(q).join(", ")});`);
  }
  for (const playbook of seedPlaybooks) {
    lines.push(`INSERT INTO crm_playbooks (id, playbook_key, version, name_en, name_vi, kind, description_en, description_vi, definition, active, created_by, created_at) VALUES (${[
      `${playbook.key}@1`, playbook.key, 1, playbook.name_en, playbook.name_vi, playbook.kind, playbook.description_en, playbook.description_vi,
      JSON.stringify(playbook.def), playbook.active ? 1 : 0, SYSTEM, CREATED_AT,
    ].map(q).join(", ")});`);
  }
  lines.push(`INSERT INTO crm_policies (id, policy_key, version, body, source_ref, effective_from, created_by, created_at) VALUES (${[
    `${seedGatePolicy.key}@1`, seedGatePolicy.key, 1, JSON.stringify(seedGatePolicy.body), seedGatePolicy.source_ref, EFFECTIVE_FROM, SYSTEM, CREATED_AT,
  ].map(q).join(", ")});`);
  return lines.join("\n");
}

const path = new URL("../migrations/0003_crm_sales.sql", import.meta.url);
if (process.argv.includes("--write")) {
  const sql = readFileSync(path, "utf8");
  const next = sql.replace(/(-- seed:begin[^\n]*\n)[\s\S]*?(-- seed:end)/, `$1${seedSql()}\n$2`);
  writeFileSync(path, next);
} else if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  console.log(seedSql()); // !# policy: console
}
