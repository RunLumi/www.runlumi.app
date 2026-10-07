// Deploy preflight: verify the remote Worker has the secrets the app requires
// before shipping. Admin access uses EmDash's session and user database.
import { execFileSync } from "node:child_process";

const REQUIRED_SECRETS = ["EMDASH_ENCRYPTION_KEY", "DISCORD_APPLICATION_WEBHOOK_URL", "CRM_INTAKE_SECRET"];

function wranglerJson(args) {
  return JSON.parse(
    execFileSync("./node_modules/.bin/wrangler", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
}

const workerName = "runlumi";

let secrets;
try {
  secrets = wranglerJson(["secret", "list", "--name", workerName, "--format", "json"]);
} catch (error) {
  console.error(`preflight: failed to list secrets on Worker "${workerName}"`);
  console.error(String(error.stderr || error.message));
  process.exit(1);
}

const present = new Set(secrets.map((secret) => secret.name));
const missing = REQUIRED_SECRETS.filter((name) => !present.has(name));

if (missing.length) {
  console.error(`preflight: Worker "${workerName}" is missing required secrets: ${missing.join(", ")}`);
  console.error("Set them with:");
  for (const name of missing) {
    console.error(`  printf '%s' '<value>' | ./node_modules/.bin/wrangler secret put ${name}`);
  }
  process.exit(1);
}

console.log(`preflight: ok — ${REQUIRED_SECRETS.join(", ")} present on Worker "${workerName}"`);
