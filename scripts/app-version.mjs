// Build version shown in page footers: v<year>.<month>+<short commit>, for
// example v2026.11+c1a328c. The month is the commit's month in Vietnam time;
// the commit comes from Cloudflare Workers Builds (WORKERS_CI_COMMIT_SHA) or
// the local git checkout. Without git the build date and "dev" are used.
import { execFileSync } from "node:child_process";

function git(args) {
  try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; }
}

/** @param {{ sha?: string; date?: Date }} [input] */
export function formatAppVersion({ sha = "", date = new Date() } = {}) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit" }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const short = /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : "dev";
  return `v${year}.${month}+${short}`;
}

export function appVersion(env = process.env) {
  const sha = env.WORKERS_CI_COMMIT_SHA || git(["rev-parse", "HEAD"]);
  const committed = sha ? git(["show", "-s", "--format=%cI", sha]) : "";
  const date = committed ? new Date(committed) : new Date();
  return formatAppVersion({ sha, date: Number.isNaN(date.getTime()) ? new Date() : date });
}
