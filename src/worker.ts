// Worker entry: Astro serves requests; scheduled handlers run only their
// explicitly assigned CRM/Lark, notification-rule or HRM reminder/report jobs.
import { cleanupUploads } from "./lib/crm/direct-uploads";
import server from "@astrojs/cloudflare/entrypoints/server";
import { RETRY_CRON, isLarkCron, runScheduled } from "./lib/crm/lark/notify";
import { HRM_ASSET_REMINDER_CRON, runHrmAssetReminderSweep } from "./lib/hrm/asset-reminders";
import { runHrmTrainingReminderSweep } from "./lib/hrm/training-reminders";
import { runHrmReportScheduleSweep } from "./lib/hrm/report-snapshots";
import { restoreMaintenanceEnabled } from "./lib/workspace/restore-maintenance";
import { runNotificationRules } from "./lib/workspace/notify/dispatch";

export default {
  fetch: server.fetch,
  async scheduled(controller, env, ctx) {
    if(restoreMaintenanceEnabled(env.WORKSPACE_RESTORE_MODE))return;
    if(isLarkCron(controller.cron)){
      ctx.waitUntil(cleanupUploads(env).catch(() => {
        console.error("crm_upload_cleanup_failed"); // !# policy: console
      }));
      ctx.waitUntil(runScheduled(controller.cron, env).catch((error: unknown) => {
        console.error("crm_lark_scheduled_failed", error instanceof Error ? error.name : "unknown"); // !# policy: console
      }));
      // Notification rules (Slack/Discord/Teams webhooks, internal email) ride the ten-minute pass.
      if(controller.cron===RETRY_CRON)ctx.waitUntil(runNotificationRules(env).catch((error: unknown) => {
        console.error("workspace_notifications_failed", error instanceof Error ? error.name : "unknown"); // !# policy: console
      }));
    }
    if(controller.cron===HRM_ASSET_REMINDER_CRON){
      ctx.waitUntil(runHrmTrainingReminderSweep(env.DB,env.CONTENT_DB,env.HRM_LIVE_ENABLED,controller.scheduledTime).catch((error:unknown)=>{
        console.error("hrm_training_reminder_scheduled_failed",error instanceof Error?error.name:"unknown"); // !# policy: console
      }));
      ctx.waitUntil(runHrmAssetReminderSweep(env.DB,env.CONTENT_DB,env.HRM_LIVE_ENABLED,controller.scheduledTime).catch((error:unknown)=>{
        console.error("hrm_asset_reminder_scheduled_failed",error instanceof Error?error.name:"unknown"); // !# policy: console
      }));
      ctx.waitUntil(runHrmReportScheduleSweep(env.DB,env.CONTENT_DB,env.HRM_LIVE_ENABLED,controller.scheduledTime).catch((error:unknown)=>{
        console.error("hrm_report_snapshot_scheduled_failed",error instanceof Error?error.name:"unknown"); // !# policy: console
      }));
    }
  },
} satisfies ExportedHandler<Env>;
