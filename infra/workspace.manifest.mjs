// Infrastructure manifest for the runlumi Worker. `node scripts/generate-wrangler.mjs`
// writes wrangler.jsonc from this file; edit here, never wrangler.jsonc by hand.
//
// R-12: production keeps today's names unchanged (runlumi, lumi-jobs,
// lumi-content, lumi-job-files, lumi-blog-media). Staging uses
// lumi-workspace-*-staging names in APAC and has no runlumi.app routes, no
// crons (so no Lark or webhook posts) and Finance/HRM switched off.
// Renaming production resources or splitting D1 per module is a separate,
// founder-run migration. Nothing here creates, deploys or migrates anything.

export const manifest = {
  schema: "node_modules/wrangler/config-schema.json",
  main: "./src/worker.ts",
  compatibility_date: "2026-09-22",
  compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
  assets: { binding: "ASSETS", directory: "./dist" },
  observability: { enabled: true },
  production: {
    name: "runlumi",
    vars: {
      FINANCE_LIVE_ENABLED: { value: "true", comment: "Company data remains unavailable until Super Admin completes book setup." },
      WORKSPACE_RESTORE_MODE: { value: "false" },
      WORKSPACE_PASSKEY_REQUIRED: { value: "false", comment: "R-08 passkey and anti-phishing enforcement. Off until the owner confirms every\nWorkspace user has an EmDash passkey; see docs/workspace/security.md." },
    },
    routes: ["runlumi.app/*", "www.runlumi.app/*", "landing.runlumi.app/*"],
    zone: "runlumi.app",
    crons: {
      comment: "Lark digest at 08:37 Vietnam time Monday–Saturday, configurable HRM asset\nreminders and aggregate report snapshots daily at 08:40, and Lark retry\nsafety pass every ten minutes.",
      schedules: ["37 1 * * MON-SAT", "40 1 * * *", "*/10 * * * *"],
    },
    d1: [
      { binding: "DB", name: "lumi-jobs", id: "baffed60-2a53-4a8a-b680-684852edbb81", migrations: "migrations" },
      { binding: "CONTENT_DB", name: "lumi-content", id: "25a3ae96-bbbd-4356-9cf7-afb39926a9ad" },
    ],
    r2: [
      { binding: "FILES", name: "lumi-job-files" },
      { binding: "BLOG_MEDIA", name: "lumi-blog-media" },
    ],
  },
  staging: {
    name: "lumi-workspace-app-staging",
    location: "apac",
    vars: {
      FINANCE_LIVE_ENABLED: { value: "false" },
      HRM_LIVE_ENABLED: { value: "false" },
      WORKSPACE_RESTORE_MODE: { value: "false" },
      WORKSPACE_PASSKEY_REQUIRED: { value: "false" },
    },
    d1: [
      // IDs exist only after the founder creates the databases (see --plan).
      { binding: "DB", name: "lumi-workspace-jobs-staging", id: null, migrations: "migrations" },
      { binding: "CONTENT_DB", name: "lumi-workspace-content-staging", id: null },
    ],
    r2: [
      { binding: "FILES", name: "lumi-workspace-files-staging" },
      { binding: "BLOG_MEDIA", name: "lumi-workspace-blog-media-staging" },
    ],
  },
};

/** Placeholder written for a staging database that has not been created yet; deploy refuses it. */
export const MISSING_ID = "00000000-0000-0000-0000-000000000000";
