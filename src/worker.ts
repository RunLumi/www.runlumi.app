// Worker entry: Astro serves requests; scheduled handlers run only their
// explicitly assigned CRM/Lark or HRM asset-reminder/report jobs.
import { cleanupUploads } from "./lib/crm/direct-uploads";
import server from "@astrojs/cloudflare/entrypoints/server";
import { isLarkCron, runScheduled } from "./lib/crm/lark/notify";
import { HRM_ASSET_REMINDER_CRON, runHrmAssetReminderSweep } from "./lib/hrm/asset-reminders";
import { runHrmReportScheduleSweep } from "./lib/hrm/report-snapshots";

export default {
  fetch: server.fetch,
  async scheduled(controller, env, ctx) {
    if(isLarkCron(controller.cron)){
      ctx.waitUntil(cleanupUploads(env).catch(() => {
        console.error("crm_upload_cleanup_failed"); // !# policy: console
      }));
      ctx.waitUntil(runScheduled(controller.cron, env).catch((error: unknown) => {
        console.error("crm_lark_scheduled_failed", error instanceof Error ? error.name : "unknown"); // !# policy: console
      }));
    }
    if(controller.cron===HRM_ASSET_REMINDER_CRON){
      ctx.waitUntil(runHrmAssetReminderSweep(env.DB,env.CONTENT_DB,env.HRM_LIVE_ENABLED,controller.scheduledTime).catch((error:unknown)=>{
        console.error("hrm_asset_reminder_scheduled_failed",error instanceof Error?error.name:"unknown"); // !# policy: console
      }));
      ctx.waitUntil(runHrmReportScheduleSweep(env.DB,env.HRM_LIVE_ENABLED,controller.scheduledTime).catch((error:unknown)=>{
        console.error("hrm_report_snapshot_scheduled_failed",error instanceof Error?error.name:"unknown"); // !# policy: console
      }));
    }
  },
} satisfies ExportedHandler<Env>;
