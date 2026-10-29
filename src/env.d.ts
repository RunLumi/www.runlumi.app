/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

interface Env {
  /** Finance deployment switch; book setup and System Super Admin remain mandatory. */
  FINANCE_LIVE_ENABLED?: string;
  /** HRM deployment kill switch; absent/off keeps production closed. */
  HRM_LIVE_ENABLED?: string;
  /** R-08 enforcement switch: "true" requires a passkey check per session and an anti-phishing code for every Workspace user. Absent/other = off. */
  WORKSPACE_PASSKEY_REQUIRED?: string;
  /** In-place D1 recovery fence; while true, all private routes/jobs stay unavailable. */
  WORKSPACE_RESTORE_MODE?: string;
  DB: D1Database;
  CONTENT_DB: D1Database;
  FILES: R2Bucket;
  /** Bucket-scoped R2 S3 credentials, Worker secrets only. */
  CRM_R2_ACCESS_KEY_ID?: string;
  CRM_R2_SECRET_ACCESS_KEY?: string;
  /** Test-only local R2 S3 endpoint; honored only on loopback requests. */
  CRM_R2_LOCAL_ENDPOINT?: string;
  DISCORD_APPLICATION_WEBHOOK_URL?: string;
  /** Shared HMAC secret for /api/intake/local (≥32 chars). */
  CRM_INTAKE_SECRET?: string;
  /** Lark custom bot webhook for the CRM team group (https://open.larksuite.com/open-apis/bot/v2/hook/…). */
  LARK_CRM_WEBHOOK_URL?: string;
  /** Lark custom bot signing secret (signature verification). */
  LARK_CRM_WEBHOOK_SECRET?: string;
  /** Optional, ≥32 characters: encrypts admin-added Slack/Discord/Teams webhook URLs at rest. Absent = those webhooks cannot be added or used. */
  WORKSPACE_WEBHOOK_KEY?: string;
}

declare namespace App {
  interface Locals {
    /** Set by middleware on private routes: the signed-in user with Workspace roles. */
    workspace?: import("./lib/workspace/roles").WorkspaceUser;
    /** Bounded form-body clone retained before request adapters consume the original stream. */
    hrmFormRequest?: Request;
    /** Preserve native Finance form bodies across the SSR adapter. */
    financeFormRequest?: Request;
  }
}
