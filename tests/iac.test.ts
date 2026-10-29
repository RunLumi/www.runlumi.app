import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
// @ts-expect-error untyped module
import { generate, plan } from "../scripts/generate-wrangler.mjs";
// @ts-expect-error untyped module
import { MISSING_ID, manifest } from "../infra/workspace.manifest.mjs";

const committed = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const parse = (text: string) => ts.parseConfigFileTextToJson("wrangler.jsonc", text).config as Record<string, any>;

test("wrangler.jsonc is exactly what the manifest generates", () => {
  assert.equal(committed, generate(), "run node scripts/generate-wrangler.mjs");
});

test("production keeps today's names, IDs, routes, crons and vars unchanged (R-12)", () => {
  const config = parse(committed);
  assert.equal(config.name, "runlumi");
  assert.deepEqual(config.d1_databases, [
    { binding: "DB", database_name: "lumi-jobs", database_id: "baffed60-2a53-4a8a-b680-684852edbb81", migrations_dir: "migrations" },
    { binding: "CONTENT_DB", database_name: "lumi-content", database_id: "25a3ae96-bbbd-4356-9cf7-afb39926a9ad" },
  ]);
  assert.deepEqual(config.r2_buckets, [{ binding: "FILES", bucket_name: "lumi-job-files" }, { binding: "BLOG_MEDIA", bucket_name: "lumi-blog-media" }]);
  assert.deepEqual(config.routes.map((route: { pattern: string }) => route.pattern), ["runlumi.app/*", "www.runlumi.app/*", "landing.runlumi.app/*"]);
  assert.deepEqual(config.triggers.crons, ["37 1 * * MON-SAT", "40 1 * * *", "*/10 * * * *"]);
  assert.deepEqual(config.vars, { FINANCE_LIVE_ENABLED: "true", WORKSPACE_RESTORE_MODE: "false", WORKSPACE_PASSKEY_REQUIRED: "false" }, "R-08 enforcement ships off");
  assert.deepEqual(config.compatibility_flags, ["nodejs_compat", "global_fetch_strictly_public"]);
  assert.equal(config.main, "./src/worker.ts");
});

test("staging uses lumi-workspace-*-staging in APAC, never the production domain, data or crons", () => {
  const staging = parse(committed).env.staging;
  const names = [staging.name, ...staging.d1_databases.map((db: { database_name: string }) => db.database_name), ...staging.r2_buckets.map((bucket: { bucket_name: string }) => bucket.bucket_name)];
  for (const name of names) assert.match(name, /^lumi-workspace-[a-z0-9-]+-staging$/, name);
  assert.equal(manifest.staging.location, "apac");
  assert.deepEqual(staging.routes, []);
  assert.deepEqual(staging.triggers.crons, [], "no Lark digest or webhook posts from staging");
  assert.equal(staging.vars.FINANCE_LIVE_ENABLED, "false");
  assert.equal(staging.vars.HRM_LIVE_ENABLED, "false");
  const production = parse(committed);
  for (const db of staging.d1_databases) assert.ok(!production.d1_databases.some((item: { database_id: string }) => item.database_id === db.database_id), "no shared database");
  assert.ok(staging.d1_databases.every((db: { database_id: string }) => db.database_id === MISSING_ID), "IDs stay placeholders until the founder creates the databases");
  assert.deepEqual(staging.d1_databases.map((db: { binding: string }) => db.binding), ["DB", "CONTENT_DB"], "same bindings as production");
});

test("the provisioning plan only prints APAC create commands for staging names", () => {
  const text = plan();
  assert.match(text, /wrangler d1 create lumi-workspace-jobs-staging --location apac/);
  assert.match(text, /r2 bucket create lumi-workspace-files-staging --location apac/);
  assert.doesNotMatch(text, /\blumi-jobs\b|lumi-content\b|lumi-job-files|runlumi\.app/);
  const release = readFileSync(new URL("../scripts/release.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(release, /--env/, "the production release never targets staging");
});
