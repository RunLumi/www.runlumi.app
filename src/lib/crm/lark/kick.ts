// Announces new CRM events right after a successful write, without making the
// person wait: the flush runs after the response via waitUntil. The cron in
// src/worker.ts retries anything this misses.
import { env, waitUntil } from "cloudflare:workers";
import { depsFromEnv, flushLark } from "./notify";

export function kickLark(): void {
  const bindings = env as unknown as Env;
  if (!bindings.LARK_CRM_WEBHOOK_URL) return;
  try {
    waitUntil(flushLark(depsFromEnv(bindings)).then(() => undefined, (error: unknown) => {
      // Never log the error object: a failed fetch can include the webhook URL.
      console.error("crm_lark_flush_failed", error instanceof Error ? error.name : "unknown"); // !# policy: console
    }));
  } catch {
    // Outside a request context (tests, scripts): the cron sends it later.
  }
}
