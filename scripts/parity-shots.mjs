// Parity screenshots (docs/redesign/UI-PARITY.md): a board next to the app.
//
//   node scripts/parity-shots.mjs <Board>=<path> [<Board>=<path> …] [options]
//
// For each pair it writes docs/redesign/parity/<Board>/:
//   board-1440.png    the board at 1440 px. The board's own template logic
//                     fills its {{…}} placeholders with its sample data where
//                     it can, and <dc-import> boards (TopNav) are inlined;
//                     anything it cannot fill stays as {{…}}, as expected.
//   app-vi-1440.png   /vi<path> at 1440 px
//   app-en-1440.png   <path> at 1440 px
//   app-vi-390.png    /vi<path> at 390 px
// <path> may carry a query and a #fragment (to open a Sheet), and end with
// "@<css selector>" to click that element before the shot (for example
// "/workspace@.ws-launcher>summary" opens the launcher). Use "-" as the path
// to render only the board.
//
// Options:
//   --as <roles>     sign in as a synthetic TEST member with these Workspace
//                    roles (comma-separated, e.g. sales_executive) instead of
//                    the local dev-bypass System Super Admin
//   --seed           add synthetic TEST records first (companies, contacts,
//                    opportunities, Leads, an HRM notice for the signed-in person)
//   --base <url> --persist <dir>
//                    use a local Worker you already run (astro dev) and its
//                    D1 persist directory, instead of starting one
//   --full           full-page app screenshots (default: the first 1600 px)
//
// Without --base the script starts its own local Worker on an isolated,
// freshly migrated D1 (like scripts/run-integration.mjs) and stops it after.
// It only ever talks to 127.0.0.1/localhost. Synthetic data only.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const boardsDir = join(root, "docs/redesign/boards");
const outRoot = join(root, "docs/redesign/parity");
const MAX_BYTES = 400 * 1024;

const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args.splice(at, 2)[1] : undefined; };
const flag = (name) => { const at = args.indexOf(name); if (at >= 0) args.splice(at, 1); return at >= 0; };
const asRoles = option("--as");
let base = option("--base");
let persist = option("--persist");
const seed = flag("--seed");
const full = flag("--full");
const pairs = args.map((arg) => {
  const at = arg.indexOf("=");
  if (at < 1) throw new Error(`Expected <Board>=<path>, got "${arg}".`);
  return { board: arg.slice(0, at), path: arg.slice(at + 1) };
});
if (!pairs.length) {
  console.error("Usage: node scripts/parity-shots.mjs <Board>=<path> [...] [--as roles] [--seed] [--base url --persist dir] [--full]");
  process.exit(2);
}
for (const { board } of pairs) if (!existsSync(join(boardsDir, `${board}.dc.html`))) throw new Error(`No board docs/redesign/boards/${board}.dc.html`);
if (base && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error("--base must be a local Worker (http://127.0.0.1:<port>).");
if (base && !persist) throw new Error("--base needs --persist <dir> (the Worker's D1 persist directory).");

// Playwright is not a project dependency: use the copy installed on the machine
// (resolved like require() does, so NODE_PATH installs work too).
const { chromium } = createRequire(import.meta.url)("playwright");
const needsApp = pairs.some(({ path }) => path !== "-");
let worker = null, ownedPersist = false, wroteVars = false, log = "";
const devVars = join(root, ".dev.vars");

async function freePort() {
  const probe = createServer();
  await new Promise((ok, fail) => { probe.once("error", fail); probe.listen(0, "127.0.0.1", ok); });
  const { port } = probe.address();
  await new Promise((ok) => probe.close(ok));
  return port;
}

async function startWorker() {
  for (const file of [".env", ".env.local", ".dev.vars"]) if (existsSync(join(root, file))) throw new Error(`Refusing to start a Worker from a checkout containing ${file}; pass --base and --persist instead.`);
  const port = await freePort();
  persist = await mkdtemp(join(tmpdir(), "runlumi-parity-"));
  ownedPersist = true;
  base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, LUMI_PERSIST_TO: persist, CRM_BASE_URL: base, HRM_LIVE_ENABLED: "true", FINANCE_LIVE_ENABLED: "true", WORKSPACE_PASSKEY_REQUIRED: "true", ASTRO_DEV_BACKGROUND: "0", WRANGLER_SEND_METRICS: "false" };
  const migrated = spawnSync(resolve(root, "node_modules/.bin/wrangler"), ["d1", "migrations", "apply", "lumi-jobs", "--local", "--persist-to", persist], { cwd: root, env, encoding: "utf8", stdio: ["ignore", "ignore", "inherit"] });
  if (migrated.status !== 0) throw new Error("Local D1 migration failed.");
  await writeFile(devVars, "HRM_LIVE_ENABLED=true\nFINANCE_LIVE_ENABLED=true\nWORKSPACE_PASSKEY_REQUIRED=true\n", { flag: "wx", mode: 0o600 });
  wroteVars = true;
  worker = spawn(process.execPath, ["./node_modules/astro/bin/astro.mjs", "dev", "--host", "127.0.0.1", "--port", String(port)], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [worker.stdout, worker.stderr]) { stream.setEncoding("utf8"); stream.on("data", (chunk) => { log = (log + chunk).slice(-8000); }); }
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (worker.exitCode !== null) throw new Error(`Local Worker exited.\n${log}`);
    try { if ((await fetch(`${base}/jobs`)).status < 500) return; } catch {}
    await new Promise((ok) => setTimeout(ok, 400));
  }
  throw new Error(`Local Worker did not start.\n${log}`);
}

async function stopWorker() {
  if (worker) {
    worker.kill("SIGTERM");
    await new Promise((ok) => { if (worker.exitCode !== null) return ok(); const timer = setTimeout(() => { worker.kill("SIGKILL"); ok(); }, 5000); worker.once("exit", () => { clearTimeout(timer); ok(); }); });
  }
  if (wroteVars) await unlink(devVars).catch(() => {});
  if (ownedPersist) await rm(persist, { recursive: true, force: true });
}

/** Signs in (dev-bypass admin, or a TEST member with --as roles) and returns browser cookies. */
async function signIn() {
  process.env.LUMI_PERSIST_TO = persist;
  process.env.CRM_BASE_URL = base;
  const helpers = await import("../tests/integration/helpers.mjs");
  const admin = await helpers.adminSession();
  let session = admin;
  if (asRoles) {
    const stamp = Date.now().toString(36);
    session = await helpers.userSession(admin, { email: `test-parity-${stamp}@example.test`, name: "TEST Minh Anh" });
    const roles = asRoles.split(",").map((role) => role.trim()).filter(Boolean);
    const granted = await admin.post("/workspace/users", { intent: "grant", email: session.email, roles });
    if (granted.status !== 303) throw new Error(`Granting ${roles.join(",")} failed: ${granted.status}`);
  }
  // Pass the Workspace passkey and anti-phishing gates the way the integration helpers do.
  await session.get("/workspace");
  if (seed) await seedData(helpers, admin, session);
  return { session, cookies: [...session.cookies].map(([name, value]) => ({ name, value, url: base })) };
}

/** Synthetic TEST records through the app's own forms (and SQL only for the HRM notice chain). */
async function seedData(helpers, admin, session) {
  const owner = session;
  const companies = ["TEST Bếp Mộc", "TEST Salon Ngọc Hair", "TEST Cà phê The Lối", "TEST Văn phòng Lumen"];
  let phone = 900000000 + Math.floor(Math.random() * 90000000);
  for (const [index, name] of companies.entries()) {
    const response = await owner.post("/crm/new", { intent: "create", playbook_key: "local-preview", source_channel: index % 2 ? "facebook" : "field_visit", account_name: name, contact_role: "owner", contact_name: `TEST Liên hệ ${index + 1}`, phone: `0${phone++}` });
    if (response.status !== 303) console.warn(`seed opportunity ${index + 1}: ${response.status}`);
  }
  for (const name of ["TEST Chị Ngọc", "TEST Anh Trí", "TEST Chị Hà"]) {
    const response = await owner.post("/crm/leads", { intent: "lead_create", name, company: `${name.replace("TEST ", "TEST Cty ")}`, phone: `0${phone++}`, source_channel: "field_visit" });
    if (response.status !== 303) console.warn(`seed lead: ${response.status}`);
  }
  const userId = await owner.userId();
  const now = new Date().toISOString();
  const { jobs, q } = helpers;
  try {
    jobs(`UPDATE hrm_settings SET enabled = 1, legal_entity = 'TEST Lumi', purpose = 'TEST parity', retention_policy = 'TEST', policy_reference = 'TEST', reviewed_by = ${q(userId)} WHERE id = 1`);
    if (asRoles && !asRoles.split(",").includes("employee")) await admin.post("/workspace/users", { intent: "grant", email: session.email, roles: [...asRoles.split(","), "employee"] });
    const person = `person_parity_${userId}`, employment = `employment_parity_${userId}`;
    jobs(`INSERT OR IGNORE INTO hrm_people (id, user_id, employee_code, legal_name, actor_id, created_at, updated_at) VALUES (${q(person)}, ${q(userId)}, ${q(`TEST-${userId.slice(-6)}`)}, 'TEST Minh Anh', ${q(userId)}, ${q(now)}, ${q(now)})`);
    jobs(`INSERT OR IGNORE INTO hrm_employments (id, person_id, legal_entity, status, actor_id, created_at, updated_at) VALUES (${q(employment)}, ${q(person)}, 'TEST Lumi', 'active', ${q(userId)}, ${q(now)}, ${q(now)})`);
    for (const [index, type] of ["request_created", "request_updated", "request_created"].entries()) {
      const request = `hrreq_parity_${index}_${userId}`, outbox = `hroutbox_parity_${index}_${userId}`;
      const at = new Date(Date.now() - index * 3_600_000).toISOString();
      jobs(`INSERT OR IGNORE INTO hrm_service_requests (id, person_id, employment_id, request_type, subject, state, sensitivity, created_by, created_at, updated_by, updated_at) VALUES (${q(request)}, ${q(person)}, ${q(employment)}, 'employment_confirmation', 'TEST xác nhận công tác', 'submitted', 'standard', ${q(userId)}, ${q(at)}, ${q(userId)}, ${q(at)})`);
      jobs(`INSERT OR IGNORE INTO hrm_notification_outbox (id, recipient_user_id, request_id, event_key, event_type, href, state, attempts, created_at, updated_at) VALUES (${q(outbox)}, ${q(userId)}, ${q(request)}, ${q(`parity:${index}:${userId}`)}, ${q(type)}, ${q(`/hrm/requests?request=${request}`)}, 'queued', 0, ${q(at)}, ${q(at)})`);
    }
  } catch (error) {
    console.warn(`HRM notice seed skipped: ${error instanceof Error ? error.message.slice(0, 200) : "error"}`);
  }
}

/** Fills a board's {{…}} with its own renderVals() and inlines <dc-import> boards. Best effort. */
async function renderBoard(page, board) {
  const sources = {};
  const html = await readFile(join(boardsDir, `${board}.dc.html`), "utf8");
  for (const match of html.matchAll(/<dc-import name="([A-Za-z]+)"/g)) sources[match[1]] = await readFile(join(boardsDir, `${match[1]}.dc.html`), "utf8").catch(() => "");
  await page.route("**/support.js", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.goto(`file://${join(boardsDir, `${board}.dc.html`)}`);
  await page.evaluate((imports) => {
    class DCLogic { constructor(props) { this.props = props; } }
    const logic = (doc, props) => {
      const script = doc.querySelector("script[data-dc-script]");
      if (!script) return {};
      let defaults = {};
      try { defaults = Object.fromEntries(Object.entries(JSON.parse(script.dataset.props || "{}")).filter(([key]) => !key.startsWith("$")).map(([key, value]) => [key, value.default])); } catch {}
      try { const Component = new Function("DCLogic", `${script.textContent};return Component;`)(DCLogic); return new Component({ ...defaults, ...props }).renderVals() ?? {}; } catch { return {}; }
    };
    const value = (expr, scope) => { try { return new Function(...Object.keys(scope), `return (${expr});`)(...Object.values(scope)); } catch { return undefined; } };
    const fill = (text, scope) => text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (all, expr) => { const result = value(expr, scope); return result === undefined || result === null ? all : String(result); });
    const render = (node, scope) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) { child.textContent = fill(child.textContent, scope); continue; }
        if (child.nodeType !== 1) continue;
        const tag = child.tagName.toLowerCase();
        if (tag === "sc-for") {
          const list = value((child.getAttribute("list") || "").replace(/^\{\{|\}\}$/g, ""), scope);
          const as = child.getAttribute("as") || "item";
          if (Array.isArray(list)) {
            for (const item of list) { const box = child.cloneNode(true); render(box, { ...scope, [as]: item }); child.before(...box.childNodes); }
            child.remove();
          } else render(child, scope);
          continue;
        }
        if (tag === "sc-if") {
          const shown = value((child.getAttribute("value") || "").replace(/^\{\{|\}\}$/g, ""), scope);
          if (shown === undefined) { render(child, scope); continue; }
          if (shown) { render(child, scope); child.before(...child.childNodes); }
          child.remove();
          continue;
        }
        if (tag === "dc-import") {
          const source = imports[child.getAttribute("name")];
          if (!source) continue;
          const doc = new DOMParser().parseFromString(source, "text/html");
          const props = Object.fromEntries([...child.attributes].filter((attr) => !["name", "hint-size"].includes(attr.name)).map((attr) => [attr.name, attr.value]));
          const inner = doc.querySelector(".root");
          if (!inner) continue;
          const vals = logic(doc, props);
          render(inner, vals);
          child.replaceWith(document.importNode(inner, true));
          continue;
        }
        for (const attr of [...child.attributes]) {
          if (!attr.value.includes("{{")) continue;
          const whole = /^\{\{\s*([^}]+?)\s*\}\}$/.exec(attr.value);
          const result = whole ? value(whole[1], scope) : undefined;
          if (whole && (result === false || result === null)) child.removeAttribute(attr.name);
          else child.setAttribute(attr.name, fill(attr.value, scope));
        }
        render(child, scope);
      }
    };
    const host = document.querySelector("x-dc") ?? document.body;
    render(host, logic(document, {}));
  }, sources);
  await page.waitForTimeout(150);
}

async function shoot(page, file, fullPage) {
  await page.screenshot({ path: file, fullPage, animations: "disabled" });
  if ((await stat(file)).size > MAX_BYTES) {
    const width = page.viewportSize().width;
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width, height: width < 600 ? 1400 : 1100 }, animations: "disabled" });
  }
  return (await stat(file)).size;
}

const browser = await chromium.launch();
try {
  let cookies = [];
  if (needsApp) {
    if (!base) await startWorker();
    ({ cookies } = await signIn());
  }
  for (const { board, path } of pairs) {
    const dir = join(outRoot, board);
    await mkdir(dir, { recursive: true });
    const boardPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await renderBoard(boardPage, board);
    const sizes = { "board-1440": await shoot(boardPage, join(dir, "board-1440.png"), true) };
    await boardPage.close();
    if (path !== "-") {
      for (const [name, prefix, width] of [["app-vi-1440", "/vi", 1440], ["app-en-1440", "", 1440], ["app-vi-390", "/vi", 390]]) {
        const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1 });
        await context.addCookies(cookies);
        const page = await context.newPage();
        const [target, click] = path.split("@");
        const response = await page.goto(base + prefix + target, { waitUntil: "networkidle" });
        if (!response || response.status() >= 400) console.warn(`${board}: ${prefix + target} answered ${response?.status()}`);
        await page.addStyleTag({ content: "astro-dev-toolbar{display:none!important}" });
        if (click) await page.click(click);
        await page.waitForTimeout(150);
        if (!full) await page.setViewportSize({ width, height: Math.min(1600, await page.evaluate(() => document.documentElement.scrollHeight)) });
        sizes[name] = await shoot(page, join(dir, `${name}.png`), full);
        await context.close();
      }
    }
    console.log(`${board}: ${Object.entries(sizes).map(([name, size]) => `${name} ${Math.round(size / 1024)} KB`).join(", ")}`);
  }
} finally {
  await browser.close();
  await stopWorker();
}
