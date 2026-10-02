/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ADMIN_PASSWORD: string;
  ADMIN_SESSION_SECRET: string;
  DISCORD_APPLICATION_WEBHOOK_URL?: string;
}
