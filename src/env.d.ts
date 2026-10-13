/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
  CONTENT_DB: D1Database;
  FILES: R2Bucket;
  DISCORD_APPLICATION_WEBHOOK_URL?: string;
  /** Shared HMAC secret for /api/intake/local (≥32 chars). */
  CRM_INTAKE_SECRET?: string;
  /** Lark custom bot webhook for the CRM team group (https://open.larksuite.com/open-apis/bot/v2/hook/…). */
  LARK_CRM_WEBHOOK_URL?: string;
  /** Lark custom bot signing secret (signature verification). */
  LARK_CRM_WEBHOOK_SECRET?: string;
}

declare namespace App {
  interface Locals {
    /** Set by middleware on private routes: the signed-in user with Workspace roles. */
    workspace?: import("./lib/workspace/roles").WorkspaceUser;
  }
}
