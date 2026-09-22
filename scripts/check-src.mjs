// Zero-dependency policy linter for AGENTS.md rules that can be checked
// mechanically. Wired into the `lint` package script and the ECC pre-push
// hook. Use !# policy tags to allow a line deliberately:
//   console.log("..."); // !# policy: ignore-rule-id
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const ROOT = process.cwd();
const LOCALES = ["en", "vi"];

const findings = [];

function fail(file, line, rule, message) {
  const loc = line == null ? file : `${file}:${line}`;
  findings.push(`${loc} [${rule}] ${message}`);
}

function allowTagged(text, rule) {
  return new RegExp(`!#\\s*policy:\\s*\\b${rule}\\b`).test(text);
}

function walk(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, exts, out);
    else if (exts.some((ext) => path.endsWith(ext))) out.push(path);
  }
  return out;
}

const srcFiles = walk("src", [".ts", ".astro"]);
const contentFiles = walk("src", [".astro", ".ts"]);

// hype-copy: AGENTS.md non-negotiable 10 — no unsupported hype language.
const hype = /\b(10x|100x|revolutioniz\w*|supercharg\w*|game[\s-]?chang\w*)\b/i;
for (const file of contentFiles) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((text, i) => {
    if (hype.test(text) && !allowTagged(text, "hype-copy")) fail(file, i + 1, "hype-copy", `banned hype language: ${text.trim().slice(0, 80)}`);
  });
}

// remote-deps: AGENTS.md dependency hygiene — no remote/git package specs
// (the pkg-age-guard on dev machines blocks them anyway; keep the repo portable).
const remoteSpec = /^\s*(?:"[^"]+"\s*:)?\s*["'](?:git(?:\+[^"']+)?|github|gitlab|bitbucket):|^https?:\/\//;
for (const file of ["package.json", "package-lock.json"]) {
  try {
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    const sections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "bundleDependencies"];
    for (const section of sections) {
      for (const [name, spec] of Object.entries(pkg[section] ?? {})) {
        if (typeof spec === "string" && /^(?:git(?:\+)?|github|gitlab|bitbucket|https?):/.test(spec) && !allowTagged(spec, "remote-deps")) {
          fail(file, null, "remote-deps", `${section}: ${name} uses a remote spec (${spec})`);
        }
      }
    }
  } catch (error) {
    fail(file, null, "remote-deps", `unreadable: ${error.message}`);
  }
}

// d1-blob: AGENTS.md — never store CV/file blobs in D1; they belong in R2.
// Heuristics: BLOB/BYTEA columns in schema files, inserts into cv/resume/
// attachment tables ("*_files" metadata tables are legitimate), and file
// bytes bound directly into SQL.
const blobColumn = /\b(?:blob|bytea)\b/i;
const blobInsert = /(?:insert\s+into|update)\s+(?:cv|resume|attachment)\w*/i;
const boundBytes = /(?:values|set)\s*\([^;]*?(?:\.arrayBuffer\(\)|\.buffer\b|new\s+Uint8Array\()/i;
for (const file of [...walk("migrations", [".sql"]), ...walk("src", [".ts"]).filter((path) => path.includes("api"))]) {
  const sql = readFileSync(file, "utf8");
  if (!allowTagged(sql, "d1-blob") && (blobColumn.test(sql) || blobInsert.test(sql) || boundBytes.test(sql)))
    fail(file, null, "d1-blob", "possible binary/CV content stored through D1 — candidate files belong in R2");
}

// locale-peers: AGENTS.md non-negotiable 2 — structural content ships in
// both locales. Compare .astro pages under src/pages against src/pages/vi.
// API routes (src/pages/api/**) are locale-agnostic and excluded.
const englishOnlyPrefixes = ["admin/", "jobs/"];
const enPages = walk("src/pages", [".astro"], [])
  .map((path) => path.slice("src/pages/".length))
  .filter((path) => path !== "index.astro" && !path.startsWith("vi/"))
  .filter((path) => !englishOnlyPrefixes.some((prefix) => path.startsWith(prefix)));
const viPages = walk("src/pages/vi", [".astro"], [])
  .map((path) => path.slice("src/pages/vi/".length))
  .filter((path) => path !== "index.astro");
for (const path of enPages.filter((path) => !viPages.includes(path)))
  fail(`src/pages/${path}`, null, "locale-peers", `page has no Vietnamese counterpart (src/pages/vi/${path})`);
for (const path of viPages.filter((path) => !enPages.includes(path)))
  fail(`src/pages/vi/${path}`, null, "locale-peers", `page has no English counterpart (src/pages/${path})`);

// no-client-secrets: AGENTS.md — do not expose admin credentials or secrets in client code.
const secretish = /(?:ADMIN_PASSWORD|ADMIN_SESSION_SECRET|password\s*[:=]\s*["'][^"']{6,})/i;
for (const file of srcFiles) {
  if (file.includes(`${sep}api${sep}`) || file.includes(`lib${sep}`) || file === join("src", "env.d.ts")) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((text, i) => {
    if (secretish.test(text) && !allowTagged(text, "no-client-secrets")) fail(file, i + 1, "no-client-secrets", "possible secret reference outside server-only code");
  });
}

if (findings.length) {
  console.error(`check-src: ${findings.length} finding(s)`);
  for (const finding of findings) console.error(`  ${finding}`);
  console.error("\nSuppress a deliberate line with a trailing `// !# policy: <rule-id>` comment.");
  process.exit(1);
}

console.log(`check-src: ok (${srcFiles.length} source files)`);
