import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
for (const file of [".env", ".env.local", ".dev.vars"]) {
  if (existsSync(join(root, file))) {
    throw new Error("Refusing integration tests from a checkout containing " + file + "; use a credential-free clone.");
  }
}

const portProbe = createServer();
await new Promise((resolveListen, reject) => {
  portProbe.once("error", reject);
  portProbe.listen(0, "127.0.0.1", resolveListen);
});
const address = portProbe.address();
if (!address || typeof address === "string") throw new Error("Could not allocate a local test port.");
const port = address.port;
await new Promise(resolveClose => portProbe.close(resolveClose));

const devVarsPath = join(root, ".dev.vars");
const persist = await mkdtemp(join(tmpdir(), "runlumi-integration-"));
const base = "http://127.0.0.1:" + port;
const env = {
  ...process.env,
  LUMI_PERSIST_TO: persist,
  CRM_BASE_URL: base,
  HRM_LIVE_ENABLED: "true",
  ASTRO_DEV_BACKGROUND: "0",
  CRM_INTAKE_SECRET: "local-test-secret-not-for-production-0123456789",
  WRANGLER_SEND_METRICS: "false",
  CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH: resolve(root,".wrangler/crm-upload-test.jsonc"),
};
let worker = null;
let localVars = false;
let log = "";

try {
  // Preserve the credential-free HRM gate and add native local R2 S3 support
  // for CRM uploads. Only synthetic credentials enter the ignored test config.
  const prepared = spawnSync(process.execPath,["scripts/prepare-crm-upload-test.mjs"],{cwd:root,env,encoding:"utf8",stdio:"inherit"});
  if(prepared.status !== 0) throw new Error("Local S3 test configuration failed.");
  const migration = spawnSync(
    resolve(root, "node_modules/.bin/wrangler"),
    ["d1", "migrations", "apply", "lumi-jobs", "--local", "--persist-to", persist],
    { cwd: root, env, encoding: "utf8", stdio: "inherit" },
  );
  if (migration.status !== 0) throw new Error("Isolated local D1 migration failed; integration tests did not start.");

  await writeFile(
    devVarsPath,
    "HRM_LIVE_ENABLED=true\nCRM_INTAKE_SECRET=local-test-secret-not-for-production-0123456789\n",
    { flag: "wx", mode: 0o600 },
  );
  localVars = true;

  worker = spawn(
    process.execPath,
    ["./node_modules/astro/bin/astro.mjs", "dev", "--host", "127.0.0.1", "--port", String(port)],
    { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  worker.stdout.setEncoding("utf8");
  worker.stderr.setEncoding("utf8");
  const capture = chunk => {
    log += chunk;
    if (log.length > 16000) log = log.slice(-12000);
  };
  worker.stdout.on("data", capture);
  worker.stderr.on("data", capture);

  let ready = false;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (worker.exitCode !== null) throw new Error("Local Worker exited before readiness.\n" + log);
    try {
      const response = await fetch(base + "/jobs");
      if (response.status < 500) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 350));
  }
  if (!ready) throw new Error("Local Worker did not become ready within 90 seconds.\n" + log);

  const runSuites = suites => spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", ...suites],
    { cwd: root, env, stdio: "inherit", timeout: 600_000, killSignal: "SIGTERM" },
  );
  const regressions=["crm","workspace","directory","api","dashboard","files"].map(name=>`tests/integration/${name}.integration.test.mjs`);
  const isolatedSuites={
    hrm:["tests/integration/hrm.integration.test.mjs"],
    "hrm-p3":["tests/integration/hrm.integration.test.mjs"],
    crm:["tests/integration/crm.integration.test.mjs"],
    workspace:["tests/integration/workspace.integration.test.mjs"],
    directory:["tests/integration/directory.integration.test.mjs"],
    api:["tests/integration/api.integration.test.mjs"],
    dashboard:["tests/integration/dashboard.integration.test.mjs"],
    files:["tests/integration/files.integration.test.mjs"],
  };
  const requestedScope=process.env.RUNLUMI_INTEGRATION_SCOPE;
  if(requestedScope&&!Object.hasOwn(isolatedSuites,requestedScope))throw new Error("Unknown RUNLUMI_INTEGRATION_SCOPE; use hrm, hrm-p3, crm, workspace, directory, api, dashboard or files.");
  let result;
  if(requestedScope){
    console.log(`Running isolated ${requestedScope} integration suite.`);
    result=runSuites(isolatedSuites[requestedScope]);
  }else{
    console.log("Running HRM integration gate first.");
    result=runSuites(isolatedSuites.hrm);
    if(result.status===0){
      console.log("HRM integration gate passed; running existing module regressions.");
      result=runSuites(regressions);
    }
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    const safeLogs = log.slice(-12000)
      .replace(/[^\s@]+@[^\s@]+\.[A-Z]{2,}/gi, "[redacted-email]")
      .replace(/([?&]token=)[A-Z0-9_-]+/gi, "$1[redacted-token]")
      .replace(/\b\d{9,15}\b/g, "[redacted-number]");
    console.error("Synthetic Worker logs (emails/numbers redacted):\n" + safeLogs);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (worker) {
    worker.kill("SIGTERM");
    await new Promise(resolveExit => {
      if (worker.exitCode !== null) return resolveExit();
      const timeout = setTimeout(() => {
        worker.kill("SIGKILL");
        resolveExit();
      }, 5000);
      worker.once("exit", () => {
        clearTimeout(timeout);
        resolveExit();
      });
    });
  }
  await rm(persist, { recursive: true, force: true });
  if (localVars) await unlink(devVarsPath).catch(() => {});
}
