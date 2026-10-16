// Team notifications in Lark. CRM changes already write crm_events in the same
// batch as the change; this module announces the interesting ones after the
// response (waitUntil) and from a cron safety net, claiming each event in
// crm_notifications first so it is posted once. A Lark outage never affects a
// CRM write. Not configured (no webhook secret) = nothing happens.
import { type CrmActor, displayNames } from "../access";
import { getPlaybook } from "../config";
import { loadDashboard } from "../dashboard";
import { vnDate } from "../money";
import { loadToday } from "../today";
import { ANNOUNCED_KINDS, type DigestFacts, type EventFacts, type OppFacts, digestCard, eventCard } from "./cards";
import { type LarkResult, postToLark } from "./client";

export interface LarkDeps {
  db: D1Database; contentDb: D1Database; webhook: string | undefined; secret: string | undefined;
  send?: typeof fetch; now?: () => Date; pause?: (ms: number) => Promise<void>;
}

export const MAX_ATTEMPTS = 4;
const BATCH = 15;
const STALE_MS = 10 * 60_000;
// Lark allows 5 messages a second per bot; stay well under it.
const SPACING_MS = 250;
const WEEKDAYS = ["Chủ nhật", "thứ Hai", "thứ Ba", "thứ Tư", "thứ Năm", "thứ Sáu", "thứ Bảy"];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Read-only, team-wide view used to compose the digest. Never writes. */
const SYSTEM_READER: CrmActor = { id: "system:lark", name: "Lark digest", email: "", manager: true, configure: false, finance: true, fulfillment: true, refer: false, reportPayments: false };

/** Claims an event for sending: new, or failed with attempts left, or stuck in "sending". */
export async function claim(db: D1Database, eventId: string, kind: string, now: Date): Promise<boolean> {
  const at = now.toISOString();
  const inserted = await db.prepare("INSERT INTO crm_notifications (id, event_id, kind, status, attempts, created_at, updated_at) VALUES (?, ?, ?, 'sending', 0, ?, ?) ON CONFLICT(event_id) DO NOTHING")
    .bind(`ntf_${crypto.randomUUID().replaceAll("-", "")}`, eventId, kind, at, at).run();
  if (inserted.meta.changes === 1) return true;
  const retried = await db.prepare(`UPDATE crm_notifications SET status = 'sending', updated_at = ? WHERE event_id = ?
    AND ((status = 'failed' AND attempts < ?) OR (status = 'sending' AND updated_at < ?))`)
    .bind(at, eventId, MAX_ATTEMPTS, new Date(now.getTime() - STALE_MS).toISOString()).run();
  return retried.meta.changes === 1;
}

async function finish(db: D1Database, eventId: string, result: LarkResult | "skipped", now: Date): Promise<void> {
  const at = now.toISOString();
  if (result === "skipped") {
    await db.prepare("UPDATE crm_notifications SET status = 'skipped', updated_at = ? WHERE event_id = ?").bind(at, eventId).run();
  } else if (result.ok) {
    await db.prepare("UPDATE crm_notifications SET status = 'sent', attempts = attempts + 1, last_error = '', updated_at = ? WHERE event_id = ?").bind(at, eventId).run();
  } else {
    // Errors that cannot fix themselves (bad signature, webhook, size) stop retrying at once.
    await db.prepare(`UPDATE crm_notifications SET status = 'failed', attempts = CASE WHEN ? THEN attempts + 1 ELSE ? END, last_error = ?, updated_at = ? WHERE event_id = ?`)
      .bind(result.retry ? 1 : 0, MAX_ATTEMPTS, result.reason, at, eventId).run();
  }
}

interface EventRow { id: string; opportunity_id: string | null; account_id: string | null; actor_name: string; kind: string; body: string; created_at: string }

function parse(body: string): Record<string, unknown> {
  try { return JSON.parse(body) as Record<string, unknown>; } catch { return {}; }
}

/** Gathers what a card shows. Names come from EmDash; stages from the playbook version. */
export async function eventFacts(db: D1Database, contentDb: D1Database, row: EventRow): Promise<EventFacts> {
  const body = parse(row.body);
  let opportunity: OppFacts | null = null;
  let fromStage: string | undefined;
  // "from"/"to" are user IDs on assignment events, stage IDs on stage events.
  const people = row.kind === "stage" || row.kind === "fulfillment_status" ? [] : [body.from, body.to, body.owner_id].filter((id): id is string => typeof id === "string" && !!id);
  const offerName = row.kind.startsWith("quote_") && typeof body.offer === "string"
    ? (await db.prepare("SELECT name_vi FROM crm_offers WHERE id = ?").bind(body.offer).first<{ name_vi: string }>())?.name_vi ?? null : null;
  if (row.opportunity_id) {
    const opp = await db.prepare(`SELECT o.id, o.title, o.playbook_id, o.stage_id, o.outcome, o.owner_id, o.estimated_value_vnd, o.win_probability, o.source_channel, a.name AS account_name
      FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id WHERE o.id = ?`).bind(row.opportunity_id)
      .first<{ id: string; title: string; playbook_id: string; stage_id: string; outcome: string; owner_id: string | null; estimated_value_vnd: number | null; win_probability: number | null; source_channel: string; account_name: string }>();
    if (opp) {
      const playbook = await getPlaybook(db, opp.playbook_id);
      const stageName = (id: string) => playbook?.def.stages.find((stage) => stage.id === id)?.vi ?? id;
      if (row.kind === "stage" && typeof body.from === "string") fromStage = stageName(body.from);
      const names = await displayNames(contentDb, [...people, ...(opp.owner_id ? [opp.owner_id] : [])]);
      const fieldLabels = row.kind === "fields" && playbook ? Object.fromEntries(playbook.def.fields.map((field) => [field.key, field.vi])) : undefined;
      opportunity = {
        id: opp.id, title: opp.title, accountName: opp.account_name, product: playbook?.name_vi ?? opp.playbook_id, stage: stageName(opp.stage_id), outcome: opp.outcome,
        ownerName: opp.owner_id ? names[opp.owner_id]?.name ?? null : null, value: opp.estimated_value_vnd, probability: opp.win_probability, channel: opp.source_channel,
      };
      return { kind: row.kind, body, actorName: row.actor_name, createdAt: row.created_at, opportunity, accountId: row.account_id, accountName: opp.account_name, fromStage, offerName, fieldLabels,
        ownerFrom: typeof body.from === "string" ? names[body.from]?.name ?? null : null, ownerTo: typeof body.to === "string" ? names[body.to]?.name ?? null : null };
    }
  }
  const account = row.account_id ? await db.prepare("SELECT name FROM crm_accounts WHERE id = ?").bind(row.account_id).first<{ name: string }>() : null;
  const names = await displayNames(contentDb, people);
  const ownerTo = typeof body.to === "string" ? body.to : typeof body.owner_id === "string" ? body.owner_id : null;
  return { kind: row.kind, body, actorName: row.actor_name, createdAt: row.created_at, opportunity, accountId: row.account_id, accountName: account?.name ?? null, offerName,
    ownerFrom: typeof body.from === "string" ? names[body.from]?.name ?? null : null, ownerTo: ownerTo ? names[ownerTo]?.name ?? null : null };
}

/** Announces new CRM events and retries failed ones. Returns how many were posted. */
export async function flushLark(deps: LarkDeps): Promise<{ sent: number; failed: number; skipped: number }> {
  const outcome = { sent: 0, failed: 0, skipped: 0 };
  if (!deps.webhook) return outcome;
  const now = deps.now ?? (() => new Date());
  const pause = deps.pause ?? sleep;
  const started = now();
  const kinds = ANNOUNCED_KINDS.map(() => "?").join(", ");
  const rows = (await deps.db.prepare(`SELECT e.id, e.opportunity_id, e.account_id, e.actor_name, e.kind, e.body, e.created_at
    FROM crm_events e LEFT JOIN crm_notifications n ON n.event_id = e.id
    WHERE e.kind IN (${kinds}) AND e.created_at > (SELECT created_at FROM crm_notifications WHERE id = 'marker') AND e.created_at > ?
      AND (n.id IS NULL OR (n.status = 'failed' AND n.attempts < ?) OR (n.status = 'sending' AND n.updated_at < ?))
    ORDER BY e.created_at LIMIT ?`)
    .bind(...ANNOUNCED_KINDS, new Date(started.getTime() - 2 * 86_400_000).toISOString(), MAX_ATTEMPTS, new Date(started.getTime() - STALE_MS).toISOString(), BATCH)
    .all<EventRow>()).results;
  for (const row of rows) {
    if (!await claim(deps.db, row.id, row.kind, now())) continue;
    const message = eventCard(await eventFacts(deps.db, deps.contentDb, row));
    if (!message) { await finish(deps.db, row.id, "skipped", now()); outcome.skipped += 1; continue; }
    if (outcome.sent + outcome.failed > 0) await pause(SPACING_MS);
    const result = await postToLark(deps.webhook, deps.secret, message, now().getTime(), deps.send);
    await finish(deps.db, row.id, result, now());
    if (result.ok) outcome.sent += 1; else outcome.failed += 1;
  }
  return outcome;
}

/** Vietnam calendar date and weekday (0 = Sunday) for an instant. */
export function vnDay(at: Date): { date: string; weekday: number } {
  const date = vnDate(at);
  return { date, weekday: new Date(`${date}T00:00:00Z`).getUTCDay() };
}

export async function digestFacts(db: D1Database, contentDb: D1Database, at: Date): Promise<DigestFacts> {
  const { date, weekday } = vnDay(at);
  const [today, dashboard] = await Promise.all([loadToday(db, SYSTEM_READER, [], 30), loadDashboard(db, SYSTEM_READER, { owner: "", playbook: "" }, at)]);
  const since = new Date(at.getTime() - 86_400_000).toISOString();
  const recent = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM crm_opportunities WHERE created_at >= ?) AS created,
      (SELECT COUNT(*) FROM crm_opportunities WHERE outcome = 'won' AND closed_at >= ?) AS won,
      (SELECT COALESCE(SUM(estimated_value_vnd), 0) FROM crm_opportunities WHERE outcome = 'won' AND closed_at >= ?) AS won_value,
      (SELECT COUNT(*) FROM crm_opportunities WHERE outcome = 'lost' AND closed_at >= ?) AS lost`)
    .bind(since, since, since, since).first<{ created: number; won: number; won_value: number; lost: number }>();
  const top = today.overdue.slice(0, 5);
  const names = await displayNames(contentDb, top.map((task) => task.owner_id).filter((id): id is string => !!id));
  return {
    date, weekday: WEEKDAYS[weekday],
    open: dashboard.open.deals, valued: dashboard.open.valued, value: dashboard.open.value, forecastable: dashboard.open.forecastable, forecast: dashboard.open.forecast,
    created24h: recent?.created ?? 0, won24h: recent?.won ?? 0, wonValue24h: recent?.won_value ?? 0, lost24h: recent?.lost ?? 0,
    overdue: today.overdue.length, dueToday: today.dueToday.length,
    topOverdue: top.map((task) => ({ id: task.opportunity_id, title: `${task.title} (${task.account_name})`, ownerName: task.owner_id ? names[task.owner_id]?.name ?? null : null, due: task.due_on })),
    missingNext: today.missingNext.length, unassigned: (await db.prepare("SELECT COUNT(*) AS count FROM crm_opportunities WHERE owner_id IS NULL AND outcome = 'open'").first<{ count: number }>())?.count ?? 0,
    pendingPayments: today.pendingPayments, blocked: today.blocked.length,
  };
}

/** The morning digest, Monday to Saturday (Vietnam time), once per day. */
export async function sendDigest(deps: LarkDeps): Promise<"sent" | "failed" | "skipped"> {
  if (!deps.webhook) return "skipped";
  const at = (deps.now ?? (() => new Date()))();
  const { date, weekday } = vnDay(at);
  if (weekday === 0) return "skipped";
  const eventId = `digest:${date}`;
  if (!await claim(deps.db, eventId, "digest", at)) return "skipped";
  const result = await postToLark(deps.webhook, deps.secret, digestCard(await digestFacts(deps.db, deps.contentDb, at)), at.getTime(), deps.send);
  await finish(deps.db, eventId, result, at);
  return result.ok ? "sent" : "failed";
}

/** Retries today's digest only if it was attempted and failed (never sends it early). */
export async function retryDigest(deps: LarkDeps): Promise<void> {
  const at = (deps.now ?? (() => new Date()))();
  const { date } = vnDay(at);
  const row = await deps.db.prepare("SELECT status, attempts FROM crm_notifications WHERE event_id = ?").bind(`digest:${date}`).first<{ status: string; attempts: number }>();
  if (row && (row.status === "failed" || row.status === "sending") && row.attempts < MAX_ATTEMPTS) await sendDigest(deps);
}

export const DIGEST_CRON = "37 1 * * MON-SAT";
export const RETRY_CRON = "*/10 * * * *";
export function isLarkCron(cron: string): boolean { return cron === DIGEST_CRON || cron === RETRY_CRON; }

export function depsFromEnv(env: Pick<Env, "DB" | "CONTENT_DB" | "LARK_CRM_WEBHOOK_URL" | "LARK_CRM_WEBHOOK_SECRET">): LarkDeps {
  return { db: env.DB, contentDb: env.CONTENT_DB, webhook: env.LARK_CRM_WEBHOOK_URL, secret: env.LARK_CRM_WEBHOOK_SECRET };
}

/** Cron entry point: the digest at 08:37 Vietnam time, retries every ten minutes. */
export async function runScheduled(cron: string, env: Pick<Env, "DB" | "CONTENT_DB" | "LARK_CRM_WEBHOOK_URL" | "LARK_CRM_WEBHOOK_SECRET">): Promise<void> {
  if (!isLarkCron(cron)) return;
  const deps = depsFromEnv(env);
  if (cron === DIGEST_CRON) await sendDigest(deps);
  else { await flushLark(deps); await retryDigest(deps); }
}
