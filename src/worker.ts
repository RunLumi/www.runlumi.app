// Worker entry: Astro serves every request; the scheduled handler runs the
// CRM's Lark notifications (morning digest and the retry safety net).
import { cleanupUploads } from "./lib/crm/direct-uploads";
import server from "@astrojs/cloudflare/entrypoints/server";
import { runScheduled } from "./lib/crm/lark/notify";

export default {
  fetch: server.fetch,
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(cleanupUploads(env).catch(() => {
      console.error("crm_upload_cleanup_failed"); // !# policy: console
    }));
    ctx.waitUntil(runScheduled(controller.cron, env).catch((error: unknown) => {
      console.error("crm_lark_scheduled_failed", error instanceof Error ? error.name : "unknown"); // !# policy: console
    }));
  },
} satisfies ExportedHandler<Env>;
