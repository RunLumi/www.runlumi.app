// Production release: run by Cloudflare Workers Builds as the deploy command
// after every push to main (see docs/crm/RUNBOOK.md §12), or by hand through
// `npm run deploy`. Expects a finished `npm run build`.
//
//   1. refuse to run for any branch other than main (previews must never
//      migrate or replace production);
//   2. preflight: the Worker's required secrets exist;
//   3. if D1 migrations are pending: print a Time Travel bookmark first (the
//      restore point), then apply them;
//   4. wrangler deploy, tagged with the commit.
//
// RELEASE_DRY_RUN=1 checks everything without migrating or uploading.
import { execFileSync } from "node:child_process";

const wrangler = "./node_modules/.bin/wrangler";
const DATABASE = "lumi-jobs";
const branch = process.env.WORKERS_CI_BRANCH;
const commit = (process.env.WORKERS_CI_COMMIT_SHA ?? "").slice(0, 12);
const dryRun = process.env.RELEASE_DRY_RUN === "1";

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, CI: "1" }, ...options });
}

if (branch && branch !== "main") {
  console.error(`release: refusing to release branch "${branch}"; only main deploys to production.`);
  process.exit(1);
}

execFileSync("node", ["scripts/preflight.mjs"], { stdio: "inherit" });

const pending = run(wrangler, ["d1", "migrations", "list", DATABASE, "--remote"]);
if (/No migrations to apply/i.test(pending)) {
  console.log("release: no D1 migrations pending");
} else {
  const { bookmark } = JSON.parse(run(wrangler, ["d1", "time-travel", "info", DATABASE, "--json"]));
  if (!bookmark) throw new Error("release: could not read a D1 Time Travel bookmark; not migrating without a restore point");
  console.log(`release: D1 restore point before migrations: ${bookmark}`);
  console.log(`release: to roll back data: wrangler d1 time-travel restore ${DATABASE} --bookmark=${bookmark}`);
  if (dryRun) console.log("release: dry run, migrations not applied:\n" + pending);
  else process.stdout.write(run(wrangler, ["d1", "migrations", "apply", DATABASE, "--remote"]));
}

const message = commit ? `main ${commit}` : "manual release";
execFileSync(wrangler, ["deploy", "--message", message, ...(commit ? ["--tag", commit] : []), ...(dryRun ? ["--dry-run"] : [])], { stdio: "inherit", env: { ...process.env, CI: "1" } });
console.log(dryRun ? `release: dry run complete (${message}); nothing was migrated or uploaded` : `release: deployed (${message})`);
