// Synthetic Finance v1 journey against the actual Worker, EmDash sessions and local D1.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { adminSession, userSession, Session, BASE, PERSIST, content, jobs, q, key, localFetch } from "./helpers.mjs";
import { startHrmBrowserQa } from "./hrm-browser-qa.mjs";

const pages = ["", "/plans", "/actuals", "/pnl", "/cash-flow", "/revenue", "/costs", "/working-capital", "/position", "/settings", "/audit"];
const year = 2025, january = "2025-01", february = "2025-02";
const months = Array.from({ length: 12 }, (_, index) => `2025-${String(index + 1).padStart(2, "0")}`);
const book = { legal_entity: "Synthetic Finance Integration Entity", currency: "VND", precision: 0, fiscal_start_month: 1, timezone: "Asia/Ho_Chi_Minh", first_period: january, cash_floor: "200", policy_note: "Synthetic integration only: monthly management accrual P&L, direct cash flow and independent month-end controls.", enabled: true };
function privateResponse(response) {
  assert.match(response.headers.get("cache-control") ?? "", /private.*no-store/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}
async function command(session, value, { requestKey = key(), expected = 200, origin = BASE, path = "commands" } = {}) {
  const response = await localFetch(`${BASE}/api/finance/${path}`, { method: "POST", headers: { cookie: session.header(), origin, "content-type": "application/json" }, body: JSON.stringify({ request_key: requestKey, command: value }), redirect: "manual" });
  privateResponse(response);
  const result = await response.json();
  assert.equal(response.status, expected, `${value.action}: ${JSON.stringify(result)}`);
  return result;
}
async function state(session, path = "settings", query = "") {
  const result = await session.get(`/api/finance/${path}?year=${year}${query}`);
  privateResponse(result); assert.equal(result.status, 200, result.html);
  return JSON.parse(result.html);
}
function source(month) {
  const end = month === january ? "2025-01-31" : month === february ? "2025-02-28" : `${month}-30`;
  return { sourceAsOf: end, scope: "Synthetic entity: all accounts and activity", blocks: Object.fromEntries(["pnl", "cash", "aging", "position"].map(basis => [basis, { evidenceRef: `synthetic-${basis}-${month}`, note: "Synthetic evidence only" }])) };
}
function facts(definition, period, kind, overrides = {}) {
  return definition.expectedInputs.filter(item => item.period === period && (!item.kinds || item.kinds.includes(kind))).map(item => ({ lineCode: item.lineCode, segmentCode: item.segmentCode, state: "entered", amount: String(overrides[item.lineCode] ?? 0), note: "Explicit synthetic input", evidenceRef: "synthetic-evidence" }));
}

test("Finance v1 complete HTTP and D1 journey", { timeout: 8 * 60 * 1000 }, async t => {
  const admin = await adminSession(), anonymous = new Session("anonymous");
  let definition, budgetId, draftId, closedId, exportRequest, exportedCsv, exporterKey;

  await t.test("all eleven EN/VI pages and API families enforce current Super Admin authority", async () => {
    for (const prefix of ["", "/vi"]) for (const page of pages) {
      const result = await anonymous.get(`${prefix}/finance${page}`);
      assert.equal(result.status, 303, `${prefix}/finance${page}`); privateResponse(result);
      assert.match(result.location, /_emdash\/admin\/login/);
    }
    for (const path of ["overview", "settings", "plans", "actuals", "audit", "imports", "reports/pnl", "template?kind=actual"]) {
      const result = await anonymous.get(`/api/finance/${path}`); assert.equal(result.status, 401); privateResponse(result);
    }
    const nonAdmin = await userSession(admin, { email: "finance-role-union@example.test", name: "Synthetic role union", role: 40 });
    const grant = await admin.post("/workspace/users", { intent: "grant", email: nonAdmin.email, roles: ["hr", "sales_manager", "sales_executive", "partner", "finance", "fulfillment", "employee", "people_manager", "hrm_officer", "hrm_admin", "payroll_officer"] });
    assert.equal(grant.status, 303, grant.html);
    for (const prefix of ["", "/vi"]) for (const page of pages) assert.equal((await nonAdmin.get(`${prefix}/finance${page}`)).status, 403);
    assert.equal((await nonAdmin.get("/api/finance/settings")).status, 403);
    const temporary = await userSession(admin, { email: "finance-temporary-admin@example.test", name: "Synthetic temporary admin", role: 50 });
    assert.equal((await temporary.get("/finance/settings")).status, 200);
    content(`UPDATE users SET role=40 WHERE id=${q(temporary.id)}`);
    assert.equal((await temporary.get("/finance/settings")).status, 403, "an existing session loses Finance access after demotion");
    content(`UPDATE users SET role=50,disabled=1 WHERE id=${q(temporary.id)}`);
    assert.equal((await temporary.get("/api/finance/settings")).status, 401, "disabled session cannot read configuration");
    const bearer = await localFetch(`${BASE}/api/finance/settings`, { headers: { cookie: admin.header(), authorization: "Bearer synthetic-crm-token" }, redirect: "manual" });
    assert.equal(bearer.status, 401); privateResponse(bearer); await bearer.text();
  });

  await t.test("empty installation has no financial seeds; explicit setup controls readiness", async () => {
    assert.equal(jobs("SELECT count(*) AS n FROM finance_books")[0].n, 0);
    const home = await admin.get("/workspace"); assert.ok(!home.html.includes('data-module="finance"'));
    const setup = await admin.post("/vi/finance/settings", { intent: "book.save", expected_version: 0, ...book, enabled: false, return_to: "/vi/finance/settings" });
    assert.equal(setup.status, 303, setup.html); privateResponse(setup);
    assert.equal((await admin.get("/api/finance/plans?year=2025")).status, 503);
    assert.equal((await admin.get("/api/finance/audit")).status, 503);
    await command(admin, { action: "account.save", account_code: "bank", expected_version: 0, label: "Synthetic bank account", active_from: january });
    const pending = await state(admin);
    await command(admin, { action: "book.save", expected_version: pending.book.version, ...book, variance_amount_threshold: "10", variance_percent_threshold_bps: 500 });
    const current = await state(admin); assert.equal(current.book.version, pending.book.version + 1); assert.equal(current.book.cashFloor, "200");
    assert.equal(current.book.varianceAmountThreshold, "10"); assert.equal(current.book.variancePercentThresholdBps, 500);
    definition = current.definitions.find(item => item.fiscalYear === year);
    assert.ok(definition); assert.ok(definition.expectedInputs.length > 500);
    const dashboard = await admin.get("/workspace"); assert.match(dashboard.html, /href="\/finance/);
    await command(admin, { action: "plan.create", fiscal_year: year, kind: "budget", label: "Rejected origin" }, { origin: "https://outside.invalid", expected: 403 });
    await command(admin, { action: "actual.save", actual_revision_id: "invalid", expected_version: 1, expected_period_version: 1, values: [null] }, { expected: 400 });
    await command(admin, { action: "book.save", expected_version: 2, ...book, cash_floor: 200 }, { expected: 400 });
  });

  await t.test("annual budget saves twelve months, previews exact spread, and publishes an immutable baseline", async () => {
    const created = await command(admin, { action: "plan.create", fiscal_year: year, kind: "budget", label: "Synthetic original budget", assumptions: "Twelve explicit months; no imported CRM or payroll." }); budgetId = created.receipt.targetId;
    let version = 1;
    const preview = await admin.post(`/finance/plans?year=${year}&plan=${budgetId}&period=${january}`, { intent: "plan.preview", plan_id: budgetId, expected_version: version, spread_line: "pnl.projects", spread_segment: "unallocated", spread_amount: "1201", spread_weights: "", spread_note: "Synthetic annual preview", spread_evidence: "synthetic", return_to: `/finance/plans?year=${year}&plan=${budgetId}` });
    assert.equal(preview.status, 200, preview.html.slice(0, 300)); assert.match(preview.html, /1201|1,201/);
    assert.equal(jobs(`SELECT count(*) AS n FROM finance_plan_values WHERE plan_id=${q(budgetId)}`)[0].n, 0, "annual preview cannot write plan facts");
    for (const period of months) {
      await command(admin, { action: "plan.save", plan_id: budgetId, expected_version: version++, period, values: facts(definition, period, "budget", { "pnl.projects": 100, "pnl.shared_payroll": 40, "cash.customer_receipts": 90, "cash.payroll_payments": 40, "cash.opening": 1000 }) });
    }
    await command(admin, { action: "plan.publish", plan_id: budgetId, expected_version: version, baseline: true });
    const denied = await command(admin, { action: "plan.save", plan_id: budgetId, expected_version: version + 1, period: january, values: facts(definition, january, "budget") }, { expected: 409 });
    assert.match(denied.error, /locked|immutable|published/);
  });

  await t.test("native invalid inputs survive; complete actuals reconcile independent profit, cash, AR and position", async () => {
    const opened = await admin.post(`/finance/actuals?year=${year}&period=${january}`, { intent: "actual.open", period: january, expected_period_version: 0, return_to: `/finance/actuals?year=${year}&period=${january}` });
    assert.equal(opened.status, 303, opened.html); draftId = new URL(opened.location, BASE).searchParams.get("revision"); assert.ok(draftId);
    const rejected = await admin.post(`/vi/finance/actuals?year=${year}&period=${january}&revision=${draftId}`, { intent: "actual.save", actual_revision_id: draftId, expected_version: 1, expected_period_version: 1, "value.pnl.projects.unallocated.amount": "12x", "value.pnl.projects.unallocated.state": "entered" });
    assert.equal(rejected.status, 400, rejected.html.slice(0, 300)); privateResponse(rejected); assert.match(rejected.html, /value="12x"/);
    const partialClose = await command(admin, { action: "actual.close", actual_revision_id: draftId, expected_version: 1, expected_period_version: 1 }, { expected: 400 }); assert.ok(partialClose.error);
    const values = facts(definition, january, "actual", { "pnl.projects": 120, "pnl.shared_payroll": 50, "cash.customer_receipts": 100, "cash.payroll_payments": 50, "equity.opening": 1000, "position.share_capital": 1000, "position.current_earnings": 70, "position.ar_gross": 20, "aging.ar_current": 20, "aging.ar_control": 20 });
    values.find(item => item.lineCode === "pnl.projects").note = "=SUM(1,2) synthetic explanatory text";
    const savedCommand = { action: "actual.save", actual_revision_id: draftId, expected_version: 1, expected_period_version: 1, values, sources: source(january), observations: [
      { accountCode: "bank", kind: "opening", amount: "1000", restrictedAmount: "0", classification: "cash", evidenceRef: "synthetic-opening-bank", asOfDate: "2025-01-01" },
      { accountCode: "bank", kind: "closing", amount: "1050", restrictedAmount: "100", classification: "cash", evidenceRef: "synthetic-closing-bank", asOfDate: "2025-01-31" },
    ] };
    const saveKey = key(); await command(admin, savedCommand, { requestKey: saveKey });
    await command(admin, { ...savedCommand, values: [] }, { expected: 409 });
    const closed = await admin.post(`/finance/actuals?year=${year}&period=${january}&revision=${draftId}`, { intent: "actual.close", actual_revision_id: draftId, expected_version: 2, expected_period_version: 2 });
    assert.equal(closed.status, 303, closed.html); closedId = draftId;
    const replay = await command(admin, savedCommand, { requestKey: saveKey }); assert.equal(replay.receipt.replayed, true); assert.equal(replay.receipt.version, 2);
    const report = await state(admin, "reports", `&period=${january}&plan=${budgetId}`);
    assert.equal(report.report.metrics.net_profit, "70"); assert.equal(report.report.metrics.cash_closing, "1050"); assert.equal(report.report.metrics.cash_available, "950");
    assert.equal(report.report.metrics.assets, "1070"); assert.equal(report.report.metrics.equity, "1070"); assert.equal(report.report.reconciled, true);
    assert.equal(report.planReport.metrics.net_profit, "60");
  });

  await t.test("forecast pins actual cutoff, scenarios clone, CSV preview commits one month and preserves receipts", async () => {
    const forecast = await command(admin, { action: "plan.create", fiscal_year: year, kind: "forecast", label: "Synthetic reforecast", source_plan_id: budgetId, actual_cutoff: january });
    await command(admin, { action: "plan.publish", plan_id: forecast.receipt.targetId, expected_version: 1 });
    const forecastReport = await state(admin, "reports", `&period=${january}&plan=${forecast.receipt.targetId}`); assert.equal(forecastReport.planReport.metrics.net_profit, "70");
    const scenario = await command(admin, { action: "plan.create", fiscal_year: year, kind: "scenario", label: "Synthetic scenario", source_plan_id: budgetId });
    const scenarioId = scenario.receipt.targetId;
    const copy = await admin.post(`/finance/plans?year=${year}&plan=${scenarioId}&period=2025-03`, { intent: "plan.copy.preview", plan_id: scenarioId, expected_version: 1, period: "2025-03", copy_from_period: january });
    assert.equal(copy.status, 200, copy.html.slice(0, 300)); assert.match(copy.html, /2025-03/);
    const csv = `period,line_code,segment_code,value_state,amount,currency,evidence_ref,note\n${january},pnl.projects,unallocated,entered,130,VND,synthetic,Scenario adjustment\n${february},pnl.projects,unallocated,entered,140,VND,synthetic,Scenario adjustment\n`;
    const preview = await command(admin, { action: "import.preview", kind: "plan", plan_id: scenarioId, fiscal_year: year, csv, expected_versions: { [january]: { version: 1 }, [february]: { version: 1 } }, sources: { [january]: source(january), [february]: source(february) } });
    const firstCommit = { action: "import.commit", import_id: preview.receipt.targetId, expected_version: 1, period: january }, commitKey = key();
    await command(admin, firstCommit, { requestKey: commitKey });
    assert.equal((await command(admin, firstCommit, { requestKey: commitKey })).receipt.replayed, true);
    await command(admin, { action: "import.discard", import_id: preview.receipt.targetId, expected_version: 2 });
    const batch = (await state(admin, "imports")).imports.find(item => item.id === preview.receipt.targetId);
    assert.equal(batch.months[0].status, "committed"); assert.ok(batch.months[0].receipt); assert.equal(batch.months[1].status, "discarded"); assert.deepEqual(batch.months[1].values, []);
    const template = await admin.get(`/api/finance/template?year=${year}&period=${february}&kind=plan&plan=${scenarioId}`);
    assert.equal(template.status, 200); privateResponse(template); assert.match(template.html, /^period,line_code,segment_code,value_state,amount,currency,evidence_ref,note/); assert.match(template.html, /,entered,,VND,/);
    await command(admin, { action: "annotation.add", baseline_id: budgetId, actual_revision_id: closedId, period: january, cause: "Synthetic timing variance", next_action: "Review collections", review: "Owner review recorded" });
  });

  await t.test("every page renders EN/VI, reports use the closed YTD prefix and downloads are formula-safe", async () => {
    for (const prefix of ["", "/vi"]) for (const page of pages) {
      const result = await admin.get(`${prefix}/finance${page}?year=${year}&period=${january}&plan=${budgetId}`);
      assert.equal(result.status, 200, `${prefix}/finance${page}: ${result.html.slice(0, 300)}`); privateResponse(result);
      assert.ok(!result.html.includes("NaN")); assert.match(result.html, /Synthetic Finance Integration Entity/);
    }
    const ytd = await state(admin, "reports", `&period=2025-03&range=ytd&plan=${budgetId}`);
    assert.deepEqual(ytd.comparisonPeriods, [january]); assert.equal(ytd.aggregateReport.metrics.net_profit, "70");
    exportRequest = { intent: "report.export", report: "pnl", period: january, fiscal_year: year, plan_id: budgetId, actual_revision_id: closedId, range: "month", segment_code: "all", lang: "en" };
    exporterKey = key(); const download = await admin.post("/api/finance/exports", { ...exportRequest, request_key: exporterKey });
    assert.equal(download.status, 200, download.html); privateResponse(download); assert.match(download.headers.get("content-disposition"), /attachment/);
    exportedCsv = download.html; assert.match(exportedCsv, /'\=SUM\(1,2\)/); assert.match(exportedCsv, /calculation_version/); assert.match(exportedCsv, /70,major_currency,VND/);
    const audit = await state(admin, "audit", "&action=report.export"); assert.equal(audit.events.length, 1); assert.equal(audit.events[0].action, "report.export");
    assert.equal(jobs("SELECT count(*) AS n FROM finance_write_guards")[0].n, 0, "successful writes leave no transient guard rows");
    if (process.env.FINANCE_BROWSER_BINARY) {
      const browser = await startHrmBrowserQa({ baseUrl: BASE, binary: process.env.FINANCE_BROWSER_BINARY, artifactDir: process.env.FINANCE_BROWSER_ARTIFACTS });
      try {
        for (const [page, expectedText, artifactName] of [
          ["/finance", "Financial overview", "finance-overview"], ["/vi/finance/plans", "Kế hoạch", "finance-plans-vi"],
          ["/vi/finance/actuals", "Số thực tế", "finance-actuals-vi"], ["/finance/settings", "Finance settings", "finance-settings"],
        ]) await browser.auditPage(admin, `${page}?year=${year}&period=${january}&plan=${budgetId}`, { expectedText, artifactName, widths: [320, 430, 1280, 1920] });
      } finally { await browser.close(); }
    }
  });

  await t.test("reopening preserves the previous close and reproduces the original export after restatement", async () => {
    const reopened = await command(admin, { action: "actual.reopen", period: january, expected_period_version: 3, reason: "Synthetic restatement preserving all original evidence" });
    assert.notEqual(reopened.receipt.targetId, closedId);
    const beforeReclose = await state(admin, "reports", `&period=2025-03&range=ytd`); assert.deepEqual(beforeReclose.comparisonPeriods, []);
    await command(admin, { action: "actual.close", actual_revision_id: reopened.receipt.targetId, expected_version: 1, expected_period_version: 4 });
    const history = await state(admin, "actuals", `&period=${january}`); assert.ok(history.revisions.some(item => item.id === closedId)); assert.ok(history.revisions.some(item => item.id === reopened.receipt.targetId));
    const repeated = await admin.post("/api/finance/exports", { ...exportRequest, request_key: exporterKey }); assert.equal(repeated.status, 200, repeated.html); assert.equal(repeated.html, exportedCsv);
    const settings = await state(admin); await command(admin, { action: "book.save", expected_version: settings.book.version, ...book, enabled: false });
    const blocked = await admin.post("/api/finance/exports", { ...exportRequest, request_key: exporterKey }); assert.equal(blocked.status, 503); privateResponse(blocked);
    const latest = await state(admin); await command(admin, { action: "book.save", expected_version: latest.book.version, ...book });
  });

  await t.test("native local D1 backup and restore preserve financial history, constraints and shared Workspace records", async () => {
    const directory = mkdtempSync(join(tmpdir(), "runlumi-finance-recovery-"));
    const snapshot = join(directory, "synthetic.sqlite"), restored = join(directory, "restored");
    const cli = args => execFileSync("./node_modules/.bin/wrangler", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const restoreQuery = sql => JSON.parse(cli(["d1", "execute", "lumi-jobs", "--local", "--persist-to", restored, "--json", "--command", sql]))[0].results;
    const findDatabase = (persist, table) => {
      const pending = [persist], matches = [];
      while (pending.length) {
        const parent = pending.pop();
        for (const entry of readdirSync(parent, { withFileTypes: true })) {
          const path = join(parent, entry.name);
          if (entry.isDirectory()) pending.push(path);
          else if (entry.isFile() && entry.name.endsWith(".sqlite")) {
            const database = new DatabaseSync(path, { readOnly: true });
            try { if (database.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table)) matches.push(path); }
            finally { database.close(); }
          }
        }
      }
      assert.equal(matches.length, 1, `exactly one disposable D1 database must contain ${table}`);
      return matches[0];
    };
    const manifest = database => {
      const result = {};
      const tables = database.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND (name GLOB 'finance_*' OR name IN ('workspace_members','workspace_roles')) ORDER BY name").all();
      for (const { name } of tables) {
        const digest = createHash("sha256"); let count = 0;
        for (const row of database.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).iterate()) { digest.update(JSON.stringify(row)); digest.update("\n"); count++; }
        result[name] = { count, sha256: digest.digest("hex") };
      }
      return result;
    };
    const closedFactsSql = `SELECT line_code,segment_code,value_state,amount,note,evidence_ref,source_operation_id FROM finance_actual_values WHERE actual_revision_id=${q(closedId)} ORDER BY line_code,segment_code`;
    const hasSqlError = code => error => `${String(error?.stderr ?? "")}\n${String(error?.stdout ?? "")}`.includes(code);
    try {
      const originalFile = findDatabase(PERSIST, "finance_books"), original = new DatabaseSync(originalFile, { readOnly: true });
      let before, closedFacts;
      try {
        // Pin one read snapshot. SQLite's online backup includes committed WAL data;
        // do not copy a live .sqlite file or its WAL/SHM files independently.
        original.exec("BEGIN");
        before = manifest(original);
        closedFacts = original.prepare(closedFactsSql).all().map(row => ({ ...row }));
        assert.ok(closedFacts.length > 0, "the recovery fixture has real synthetic closed input rows");
        await backup(original, snapshot);
      } finally { original.exec("ROLLBACK"); original.close(); }

      // Wrangler export has no --persist-to option in the installed version.
      // Initialize only the disposable target through D1, close that CLI process,
      // then restore the consistent SQLite snapshot with the native backup API.
      // This copies schema/constraints/triggers together without replaying inserts
      // through immutable-row triggers or disabling foreign keys.
      restoreQuery("CREATE TABLE finance_recovery_probe (id INTEGER PRIMARY KEY)");
      const restoredFile = findDatabase(restored, "finance_recovery_probe"), saved = new DatabaseSync(snapshot, { readOnly: true });
      assert.notEqual(restoredFile, originalFile);
      try { assert.deepEqual(manifest(saved), before); await backup(saved, restoredFile); }
      finally { saved.close(); }

      assert.equal(restoreQuery("SELECT entity_name FROM finance_books WHERE id='main'")[0].entity_name, book.legal_entity);
      assert.equal(restoreQuery(`SELECT state FROM finance_actual_revisions WHERE id=${q(closedId)}`)[0].state, "closed");
      assert.deepEqual(restoreQuery(closedFactsSql), closedFacts, "D1 reads the same closed amounts, notes, evidence and operation references");
      assert.deepEqual(restoreQuery("PRAGMA foreign_key_check"), [], "all restored Finance and shared-table foreign keys remain valid");
      assert.throws(() => restoreQuery(`UPDATE finance_actual_values SET amount=1 WHERE actual_revision_id=${q(closedId)}`), hasSqlError("finance_value_locked_or_invalid"), "restored triggers reject changing closed inputs with the expected Finance error");
      assert.throws(() => restoreQuery(`UPDATE finance_actual_revisions SET reason='invalid rewrite' WHERE id=${q(closedId)}`), hasSqlError("finance_actual_immutable"));
      assert.throws(() => restoreQuery("DELETE FROM finance_audit_events"), hasSqlError("finance_history_immutable"));
      assert.deepEqual(restoreQuery("SELECT name FROM sqlite_schema WHERE name='finance_recovery_probe'"), [], "the target probe is replaced, not merged with the backup");
      const recovered = new DatabaseSync(restoredFile, { readOnly: true }), unchanged = new DatabaseSync(originalFile, { readOnly: true });
      try {
        assert.deepEqual(manifest(recovered), before, "every Finance and Workspace table count and content hash survives restore and rejected writes");
        assert.deepEqual(manifest(unchanged), before, "the original database is not modified by the rehearsal");
      } finally { recovered.close(); unchanged.close(); }
      t.diagnostic("Recovery evidence is native SQLite backup/restore of disposable local D1 only; production D1 export and Time Travel restore remain separate rehearsal gates.");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
