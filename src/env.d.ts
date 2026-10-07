/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
  CONTENT_DB: D1Database;
  FILES: R2Bucket;
  DISCORD_APPLICATION_WEBHOOK_URL?: string;
  /** Shared HMAC secret for /api/intake/local (≥32 chars). */
  CRM_INTAKE_SECRET?: string;
}
