import { test } from "node:test";
import assert from "node:assert/strict";
import { auditCsv, csvCell, filterQuery, getAuditEvent, listAudit, nearbyEvents, parseFilters } from "../src/lib/workspace/audit-log.ts";
import { auditStatement } from "../src/lib/workspace/members.ts";
import { saveAntiPhishingCode } from "../src/lib/workspace/anti-phishing.ts";
import { openRecoveryWindow, securityOverview } from "../src/lib/workspace/org-security.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { sqliteD1 } from "./support/d1-sqlite.ts";

const filters = (query = "") => parseFilters(new URL(`https://runlumi.app/workspace/audit${query}`));

function seeded() {
  const db = sqliteD1();
  const admin = { id: "admin", name: "TEST Admin" }, hr = { id: "hr", name: "TEST HR" };
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 28, 1, minute)).toISOString();
  db.raw.prepare("INSERT INTO workspace_audit (id, actor_id, actor_name, action, target_user_id, detail, created_at) VALUES ('aud_legacy', 'admin', 'TEST Admin', 'access_saved', 'hr', '{\"roles_after\":[\"hr\"]}', ?)").run(at(0));
  const statements = [
    auditStatement(db, hr, "passkey_failed", "hr", { reason: "invalid_signature" }, at(5), { module: "account", outcome: "denied" }),
    auditStatement(db, hr, "passkey_verified", "hr", {}, at(6), { module: "account" }),
    auditStatement(db, hr, "data_exported", "hiring", { export: "applications", rows: 3 }, at(7), { module: "hiring" }),
    auditStatement(db, hr, "agent_tool_called", "hr", { tool: "list_opportunities" }, at(8), { module: "crm", via: "mcp" }),
  ];
  return { db, admin, hr, at, ready: Promise.all(statements.map((statement) => statement.run())) };
}

test("audit review lists newest first, filters by kind, outcome, module, actor, dates and text, and pages by cursor", async () => {
  const { db, ready } = seeded();
  await ready;
  const all = await listAudit(db, filters(), { finance: false });
  assert.deepEqual(all.rows.map((row) => row.action), ["agent_tool_called", "data_exported", "passkey_verified", "passkey_failed", "access_saved"]);
  assert.equal(all.rows.at(-1)!.module, "admin", "rows written before this migration default to admin, success, web");
  assert.equal(all.rows.at(-1)!.outcome, "success");
  const check = async (query: string, expected: string[]) => assert.deepEqual((await listAudit(db, filters(query), { finance: false })).rows.map((row) => row.action), expected, query);
  await check("?kind=security", ["passkey_verified", "passkey_failed"]);
  await check("?kind=denied", ["passkey_failed"]);
  await check("?kind=agent", ["agent_tool_called"]);
  await check("?kind=data", ["data_exported"]);
  await check("?kind=access", ["access_saved"]);
  await check("?module=hiring", ["data_exported"]);
  await check("?actor=admin", ["access_saved"]);
  await check("?q=passkey", ["passkey_verified", "passkey_failed"]);
  await check("?q=%25", [], );
  await check("?from=2026-10-29", []);
  await check("?to=2026-10-27", []);
  await check("?kind=bogus&outcome=evil", ["agent_tool_called", "data_exported", "passkey_verified", "passkey_failed", "access_saved"]);
  const first = await listAudit(db, filters(), { finance: false, limit: 2 });
  assert.equal(first.rows.length, 2);
  assert.ok(first.next);
  const second = await listAudit(db, filters(`?cursor=${encodeURIComponent(first.next!)}`), { finance: false, limit: 2 });
  assert.deepEqual(second.rows.map((row) => row.action), ["passkey_verified", "passkey_failed"]);
  assert.equal(filterQuery(filters("?kind=security&source=all&q=x")), "?kind=security&q=x");
});

test("Finance history appears only when Finance is open to this admin, never with export chunks", async () => {
  const { db, ready, at } = seeded();
  await ready;
  db.raw.exec("PRAGMA foreign_keys = OFF");
  db.raw.prepare("INSERT INTO finance_write_operations (id, request_key, actor_id, action, target_id, payload_hash, receipt, created_at) VALUES ('op1', 'k1', 'admin', 'period.close', 'fp_1', 'h', '{}', ?)").run(at(9));
  db.raw.prepare("INSERT INTO finance_audit_events (id, actor_id, actor_name, action, target_id, period, operation_id, detail, created_at) VALUES ('faudit_1', 'admin', 'TEST Admin', 'period.close', 'fp_1', '2026-09', 'op1', '{\"period\":\"2026-09\"}', ?)").run(at(9));
  db.raw.prepare("INSERT INTO finance_audit_events (id, actor_id, actor_name, action, target_id, period, operation_id, detail, created_at) VALUES ('faudit_2', 'admin', 'TEST Admin', 'report.export.chunk', 'fr_1', '2026-09', 'op1', '{\"data\":\"secret figures\"}', ?)").run(at(10));
  const closed = await listAudit(db, filters(), { finance: false });
  assert.ok(!closed.rows.some((row) => row.source === "finance"));
  assert.equal(await getAuditEvent(db, "faudit_1", { finance: false }), null, "the detail screen follows the same boundary");
  const open = await listAudit(db, filters(), { finance: true });
  assert.deepEqual(open.rows.filter((row) => row.source === "finance").map((row) => row.id), ["faudit_1"]);
  assert.equal((await listAudit(db, filters("?source=finance"), { finance: true })).rows.length, 1);
  assert.equal((await listAudit(db, filters("?source=workspace"), { finance: true })).rows.every((row) => row.source === "workspace"), true);
  assert.equal((await getAuditEvent(db, "faudit_1", { finance: true }))!.module, "finance");
  assert.equal(await getAuditEvent(db, "faudit_2", { finance: true }), null);
  assert.equal(await getAuditEvent(db, "x' OR 1=1 --", { finance: true }), null);
  const entry = (await getAuditEvent(db, "aud_legacy", { finance: true }))!;
  assert.deepEqual(entry.detail, { roles_after: ["hr"] });
  assert.ok((await nearbyEvents(db, entry, { finance: true })).every((row) => row.actor_id === "admin" && row.id !== "aud_legacy"));
});

test("CSV export: every column, formulas neutralised, UTF-8 BOM for spreadsheets", async () => {
  const { db, ready } = seeded();
  await ready;
  const rows = (await listAudit(db, filters(), { finance: false })).rows;
  const csv = auditCsv(rows, true);
  assert.ok(csv.startsWith("﻿\"Thời gian (UTC)\""));
  assert.equal(csv.trim().split("\r\n").length, rows.length + 1);
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("@cmd"), "\"'@cmd\"");
});

test("audit rows cannot be changed or removed, even by the database owner", async () => {
  const { db, ready } = seeded();
  await ready;
  assert.throws(() => db.raw.exec("UPDATE workspace_audit SET actor_name = 'someone else'"), /append-only/);
  assert.throws(() => db.raw.exec("DELETE FROM workspace_audit WHERE id = 'aud_legacy'"), /append-only/);
});

test("security overview and recovery windows: admin-only, never for oneself, audited, used once", async () => {
  const db = sqliteD1(), content = sqliteD1("content");
  content.raw.exec("CREATE TABLE credentials (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key BLOB, algorithm INTEGER, counter INTEGER, device_type TEXT, backed_up INTEGER, transports TEXT, name TEXT, created_at TEXT, last_used_at TEXT)");
  content.raw.exec("INSERT INTO users (id, email, name, role) VALUES ('admin', 'admin@example.test', 'TEST Admin', 50), ('emp', 'emp@example.test', 'TEST Employee', 30), ('out', 'out@example.test', 'TEST Outsider', 30)");
  content.raw.exec("INSERT INTO credentials (id, user_id, last_used_at) VALUES ('c1', 'admin', '2026-10-28T00:00:00Z')");
  db.raw.exec("INSERT INTO workspace_members (user_id, enabled, granted_by, created_at, updated_at) VALUES ('emp', 1, 'admin', '2026-10-01', '2026-10-01')");
  db.raw.exec("INSERT INTO workspace_roles (user_id, role, granted_by, granted_at) VALUES ('emp', 'employee', 'admin', '2026-10-01')");
  const admin = makeUser({ id: "admin", name: "TEST Admin", email: "admin@example.test" }, true, []);
  await saveAntiPhishingCode(db, admin, "Mây Xanh 7");
  const overview = await securityOverview(db, content);
  assert.deepEqual(overview.map((row) => [row.user_id, row.passkeys, row.codeSet]), [["admin", 1, true], ["emp", 0, false]]);
  assert.equal(db.raw.prepare("SELECT action FROM workspace_audit WHERE action LIKE 'anti_phishing%'").get()!.action, "anti_phishing_set");
  assert.doesNotMatch(String(db.raw.prepare("SELECT detail FROM workspace_audit WHERE action = 'anti_phishing_set'").get()!.detail), /Mây/, "the code itself is never in the audit log");
  const employee = makeUser({ id: "emp", name: "TEST Employee", email: "emp@example.test" }, false, ["employee"]);
  await assert.rejects(openRecoveryWindow(db, content, employee, "admin", "lost both phones"), /forbidden/, "denied without users.manage");
  await assert.rejects(openRecoveryWindow(db, content, admin, "admin", "lost both phones"), /self/, "never for oneself");
  await assert.rejects(openRecoveryWindow(db, content, admin, "out", "lost both phones"), /not_found/, "only Workspace people");
  await assert.rejects(openRecoveryWindow(db, content, admin, "emp", "x"), /required/, "a reason is required");
  await openRecoveryWindow(db, content, admin, "emp", "Lost both phones; confirmed by video call");
  assert.ok((await securityOverview(db, content)).find((row) => row.user_id === "emp")!.recoveryUntil);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM workspace_audit WHERE action = 'passkey_recovery_opened' AND target_user_id = 'emp'").get()!.n, 1);
});
