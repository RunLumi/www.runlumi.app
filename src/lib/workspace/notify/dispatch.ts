// Delivers notification rules from the existing ten-minute cron. CRM changes
// already write crm_events; this reads recent events, matches enabled rules,
// claims each (rule, event, target) once and sends. Content is the Lark card
// for the event (cards.ts), so the Lark privacy rules hold everywhere. Email
// goes only to internal recipients, always starts with their anti-phishing
// code, and is sent only when an email transport is configured; otherwise
// the delivery is recorded as skipped. Nothing here can fail a CRM write.
import { eventCard } from "../../crm/lark/cards";
import { eventFacts } from "../../crm/lark/notify";
import { composeWorkspaceEmail, type ComposedEmail } from "../email";
import { type Platform, PAUSE_AFTER_FAILURES, openUrl, plainFromLarkCard, platformPayload, postWebhook, webhookSecret } from "./destinations";
import { type Rule, listRules, matches, recipientsFor } from "./rules";

export const MAX_ATTEMPTS = 4;
const EVENTS_PER_RUN = 40;
const STALE_MS = 10 * 60_000;

/** Sends one composed email. None is configured today (see docs/workspace/security.md). */
export type EmailTransport = (mail: ComposedEmail) => Promise<{ ok: boolean; reason?: string }>;

export interface DispatchDeps {
  db: D1Database; contentDb: D1Database; webhookKey: string | null; email?: EmailTransport | null;
  send?: typeof fetch; now?: () => Date;
}

async function claim(db: D1Database, ruleId: string, eventId: string, target: string, now: Date): Promise<boolean> {
  const at = now.toISOString();
  const inserted = await db.prepare("INSERT INTO workspace_notification_deliveries (id, rule_id, event_id, target, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, 'sending', 0, ?, ?) ON CONFLICT(rule_id, event_id, target) DO NOTHING")
    .bind(`dlv_${crypto.randomUUID().replaceAll("-", "")}`, ruleId, eventId, target, at, at).run();
  if (inserted.meta.changes === 1) return true;
  const retried = await db.prepare(`UPDATE workspace_notification_deliveries SET status = 'sending', updated_at = ? WHERE rule_id = ? AND event_id = ? AND target = ?
    AND ((status = 'failed' AND attempts < ?) OR (status = 'sending' AND updated_at < ?))`).bind(at, ruleId, eventId, target, MAX_ATTEMPTS, new Date(now.getTime() - STALE_MS).toISOString()).run();
  return retried.meta.changes === 1;
}

async function finish(db: D1Database, ruleId: string, eventId: string, target: string, result: { ok: true } | { ok: false; reason: string; retry: boolean } | { skipped: string }, now: Date): Promise<void> {
  const at = now.toISOString();
  if ("skipped" in result) await db.prepare("UPDATE workspace_notification_deliveries SET status = 'skipped', last_error = ?, updated_at = ? WHERE rule_id = ? AND event_id = ? AND target = ?").bind(result.skipped, at, ruleId, eventId, target).run();
  else if (result.ok) await db.prepare("UPDATE workspace_notification_deliveries SET status = 'sent', attempts = attempts + 1, last_error = '', updated_at = ? WHERE rule_id = ? AND event_id = ? AND target = ?").bind(at, ruleId, eventId, target).run();
  else await db.prepare("UPDATE workspace_notification_deliveries SET status = 'failed', attempts = CASE WHEN ? THEN attempts + 1 ELSE ? END, last_error = ?, updated_at = ? WHERE rule_id = ? AND event_id = ? AND target = ?")
    .bind(result.retry ? 1 : 0, MAX_ATTEMPTS, result.reason.slice(0, 80), at, ruleId, eventId, target).run();
}

/** Success resets the failure count; ten failures in a row pause the webhook until an admin resumes it. */
async function recordDestination(db: D1Database, id: string, ok: boolean, reason: string, now: Date): Promise<void> {
  const at = now.toISOString();
  if (ok) await db.prepare("UPDATE workspace_notification_destinations SET consecutive_failures = 0, last_result = 'ok', last_sent_at = ? WHERE id = ?").bind(at, id).run();
  else await db.prepare("UPDATE workspace_notification_destinations SET consecutive_failures = consecutive_failures + 1, last_result = ?, last_sent_at = ?, status = CASE WHEN consecutive_failures + 1 >= ? THEN 'paused' ELSE status END WHERE id = ?")
    .bind(reason.slice(0, 80), at, PAUSE_AFTER_FAILURES, id).run();
}

interface EventRow { id: string; opportunity_id: string | null; account_id: string | null; actor_name: string; kind: string; body: string; created_at: string; playbook_id: string | null; value: number | null; outcome: string | null; owner_id: string | null }

export async function dispatchNotifications(deps: DispatchDeps): Promise<{ sent: number; failed: number; skipped: number }> {
  const outcome = { sent: 0, failed: 0, skipped: 0 };
  const now = deps.now ?? (() => new Date());
  const rules = await listRules(deps.db, true);
  if (!rules.length) return outcome;
  const kinds = [...new Set(rules.flatMap((rule) => rule.events))];
  const oldest = rules.reduce((min, rule) => rule.created_at < min ? rule.created_at : min, rules[0].created_at);
  const since = new Date(now().getTime() - 2 * 86_400_000).toISOString();
  const events = (await deps.db.prepare(`SELECT e.id, e.opportunity_id, e.account_id, e.actor_name, e.kind, e.body, e.created_at, p.playbook_key AS playbook_id, o.estimated_value_vnd AS value, o.outcome,
      COALESCE(o.owner_id, a.owner_id) AS owner_id
    FROM crm_events e LEFT JOIN crm_opportunities o ON o.id = e.opportunity_id LEFT JOIN crm_accounts a ON a.id = e.account_id LEFT JOIN crm_playbooks p ON p.id = o.playbook_id
    WHERE e.kind IN (${kinds.map(() => "?").join(", ")}) AND e.created_at >= ? AND e.created_at >= ?
      AND NOT EXISTS (SELECT 1 FROM workspace_notification_settled s WHERE s.event_id = e.id)
    ORDER BY e.created_at LIMIT ?`)
    .bind(...kinds, since, oldest, EVENTS_PER_RUN * 5).all<EventRow>()).results;
  const destinations = new Map((await deps.db.prepare("SELECT id, platform, url_sealed FROM workspace_notification_destinations WHERE status = 'active'").all<{ id: string; platform: Platform; url_sealed: string }>()).results.map((row) => [row.id, row]));
  const done = new Set((await deps.db.prepare("SELECT rule_id || '|' || event_id || '|' || target AS k FROM workspace_notification_deliveries WHERE created_at >= ? AND status IN ('sent', 'skipped')").bind(since).all<{ k: string }>()).results.map((row) => row.k));
  // An event is settled once no target can still be sent: then later runs skip it in SQL.
  const settle = (eventId: string) => deps.db.prepare("INSERT INTO workspace_notification_settled (event_id, settled_at) VALUES (?, ?) ON CONFLICT(event_id) DO NOTHING").bind(eventId, now().toISOString()).run();
  let handled = 0;
  for (const event of events) {
    const matching = rules.filter((rule) => event.created_at >= rule.created_at && matches(rule, { kind: event.kind, playbook_id: event.playbook_id, value: event.value, outcome: event.outcome, owner_id: event.owner_id }));
    if (!matching.length) { await settle(event.id); continue; }
    if (++handled > EVENTS_PER_RUN) break;
    const state = { pending: false };
    let card: ReturnType<typeof plainFromLarkCard> | undefined;
    const message = async () => card !== undefined ? card : (card = plainFromLarkCard(eventCard(await eventFacts(deps.db, deps.contentDb, event)) ?? {}));
    for (const rule of matching) {
      for (const id of rule.destinations) {
        const target = `webhook:${id}`;
        if (done.has(`${rule.id}|${event.id}|${target}`)) continue;
        if (!await claim(deps.db, rule.id, event.id, target, now())) { state.pending = true; continue; }
        const destination = destinations.get(id), plain = await message();
        if (!destination || !plain) { await finish(deps.db, rule.id, event.id, target, { skipped: destination ? "not_announced" : "destination_inactive" }, now()); outcome.skipped += 1; continue; }
        const url = deps.webhookKey ? await openUrl(deps.webhookKey, destination.url_sealed) : null;
        if (!url) { await finish(deps.db, rule.id, event.id, target, { skipped: "webhook_key_missing" }, now()); outcome.skipped += 1; continue; }
        const result = await postWebhook(destination.platform, url, platformPayload(destination.platform, plain), deps.send);
        await finish(deps.db, rule.id, event.id, target, result.ok ? { ok: true } : result, now());
        await recordDestination(deps.db, id, result.ok, result.ok ? "ok" : result.reason, now());
        if (result.ok) outcome.sent += 1; else { outcome.failed += 1; state.pending = true; }
      }
      if (rule.email) await emailRule(deps, rule, event, message, outcome, done, now, state);
    }
    if (!state.pending) await settle(event.id);
  }
  return outcome;
}

async function emailRule(deps: DispatchDeps, rule: Rule, event: EventRow, message: () => Promise<ReturnType<typeof plainFromLarkCard>>, outcome: { sent: number; failed: number; skipped: number }, done: Set<string>, now: () => Date, state: { pending: boolean }): Promise<void> {
  const people = await recipientsFor(deps.db, deps.contentDb, rule, { owner_id: event.owner_id });
  for (const person of people) {
    const target = `email:${person.id}`;
    if (done.has(`${rule.id}|${event.id}|${target}`)) continue;
    if (!await claim(deps.db, rule.id, event.id, target, now())) { state.pending = true; continue; }
    const plain = await message();
    const mail = plain ? await composeWorkspaceEmail(deps.db, { ...person, vi: true }, {
      subject: plain.title, lines: [...(plain.quote ? [plain.quote] : []), ...plain.fields.map(([label, value]) => `${label}: ${value}`), plain.footer], link: plain.link ? { label: plain.link.label, href: plain.link.url } : undefined,
    }) : null;
    // No code, no email: a message without the recipient's code is never sent.
    const skipped = !plain ? "not_announced" : !mail ? "no_anti_phishing_code" : !deps.email ? "email_not_configured" : "";
    if (skipped) { await finish(deps.db, rule.id, event.id, target, { skipped }, now()); outcome.skipped += 1; continue; }
    const result = await deps.email!(mail!).catch(() => ({ ok: false, reason: "email_failed" }));
    await finish(deps.db, rule.id, event.id, target, result.ok ? { ok: true } : { ok: false, reason: result.reason ?? "email_failed", retry: true }, now());
    if (result.ok) outcome.sent += 1; else { outcome.failed += 1; state.pending = true; }
  }
}

export async function runNotificationRules(env: Pick<Env, "DB" | "CONTENT_DB" | "WORKSPACE_WEBHOOK_KEY">): Promise<void> {
  await dispatchNotifications({ db: env.DB, contentDb: env.CONTENT_DB, webhookKey: webhookSecret(env), email: null });
}
