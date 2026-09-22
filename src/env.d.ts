/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ADMIN_PASSWORD: string;
  ADMIN_SESSION_SECRET: string;
}

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
