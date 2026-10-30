// "Today": the work due for the signed-in person, scoped like every other read.
import { type CrmActor, opportunityScope } from "./access";
import { addDays, vnDate } from "./money";

export interface TodayTask { id: string; opportunity_id: string; kind: string; title: string; due_on: string | null; due_time: string | null; meeting_confirmed: number; needs_help: number; help_note: string; account_name: string; opp_title: string; owner_id: string | null }
export interface TodayOpp { id: string; title: string; account_name: string; stage_id: string; playbook_id: string; next_action: string; next_action_due: string | null; owner_id: string | null; renewal_due_on?: string | null; service_period_end?: string | null }
export interface ExpiringCredit { opportunity_id: string; account_name: string; paid_on: string; expires_on: string; owner_id: string | null }
export interface TodayData {
  today: string;
  overdue: TodayTask[]; dueToday: TodayTask[]; upcoming: TodayTask[]; help: TodayTask[];
  missingNext: TodayOpp[]; renewals: TodayOpp[]; renewalCandidates: TodayOpp[]; credits: ExpiringCredit[];
  blocked: { id: string; opportunity_id: string; title: string; blocked_reason: string }[];
  unassigned: number; inactiveOwners: TodayOpp[]; pendingPayments: number;
  /** The person's open leads whose next step is due, or that have none yet. */
  leads: TodayLead[]; unassignedLeads: number;
  /** The person's own open opportunities with the largest known value (Home board). */
  largest: (TodayOpp & { estimated_value_vnd: number })[];
}
export interface TodayLead { id: string; name: string; company: string; status_id: string; process_id: string; next_action: string; next_action_due: string | null; created_at: string; owner_id: string | null }

const TASK_SELECT = `SELECT t.id, t.opportunity_id, t.kind, t.title, t.due_on, t.due_time, t.meeting_confirmed, t.needs_help, t.help_note, a.name AS account_name, o.title AS opp_title, o.owner_id
  FROM crm_tasks t JOIN crm_opportunities o ON o.id = t.opportunity_id JOIN crm_accounts a ON a.id = o.account_id`;

export async function loadToday(db: D1Database, actor: CrmActor, inactiveIds: readonly string[], creditWindowDays: number): Promise<TodayData> {
  const today = vnDate();
  const scope = opportunityScope(actor);
  const week = addDays(today, 7);
  const tasks = (where: string, ...args: unknown[]) => db.prepare(`${TASK_SELECT} WHERE t.status = 'open' AND ${scope.sql} AND ${where} ORDER BY t.due_on, t.due_time LIMIT 100`).bind(...scope.args, ...args).all<TodayTask>().then((result) => result.results);
  const [overdue, dueToday, upcoming, help] = await Promise.all([
    tasks("t.due_on < ?", today),
    tasks("t.due_on = ?", today),
    tasks("t.due_on > ? AND t.due_on <= ? AND t.kind IN ('visit', 'meeting', 'demo', 'pilot_review')", today, week),
    actor.manager ? db.prepare(`${TASK_SELECT} WHERE t.status = 'open' AND t.needs_help = 1 ORDER BY t.updated_at LIMIT 100`).all<TodayTask>().then((result) => result.results) : tasks("t.needs_help = 1"),
  ]);
  const missingNext = (await db.prepare(
    `SELECT o.id, o.title, a.name AS account_name, o.stage_id, o.playbook_id, o.next_action, o.next_action_due, o.owner_id FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id
     WHERE o.outcome = 'open' AND ${scope.sql} AND (TRIM(o.next_action) = '' OR o.next_action_due IS NULL)
     AND NOT EXISTS (SELECT 1 FROM crm_tasks t WHERE t.opportunity_id = o.id AND t.status = 'open') ORDER BY o.updated_at LIMIT 100`,
  ).bind(...scope.args).all<TodayOpp>()).results;
  const renewals = (await db.prepare(
    `SELECT o.id, o.title, a.name AS account_name, o.stage_id, o.playbook_id, o.next_action, o.next_action_due, o.owner_id, o.renewal_due_on FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id
     WHERE o.relation = 'renewal' AND o.outcome IN ('open', 'paused') AND ${scope.sql} AND o.renewal_due_on <= ? ORDER BY o.renewal_due_on LIMIT 100`,
  ).bind(...scope.args, addDays(today, 45)).all<TodayOpp>()).results;
  // Won Local sales whose service period ends soon and have no renewal opportunity yet.
  const renewalCandidates = (await db.prepare(
    `SELECT o.id, o.title, a.name AS account_name, o.stage_id, o.playbook_id, o.next_action, o.next_action_due, o.owner_id, o.service_period_end FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id
     WHERE o.outcome = 'won' AND ${scope.sql} AND o.service_period_end IS NOT NULL AND o.service_period_end <= ?
     AND NOT EXISTS (SELECT 1 FROM crm_opportunities c WHERE c.parent_id = o.id AND c.relation = 'renewal') ORDER BY o.service_period_end LIMIT 100`,
  ).bind(...scope.args, addDays(today, 60)).all<TodayOpp>()).results;
  // Trust Kit payments whose upgrade credit is still open and unused (window from the Starter offer rule).
  const credits = (await db.prepare(
    `SELECT l.opportunity_id, a.name AS account_name, l.occurred_on AS paid_on, o.owner_id FROM crm_ledger l
     JOIN crm_opportunities o ON o.id = l.opportunity_id JOIN crm_accounts a ON a.id = o.account_id
     JOIN crm_quotes q ON q.opportunity_id = o.id AND q.status = 'accepted' JOIN crm_offers f ON f.id = q.offer_id
     WHERE l.kind = 'payment' AND l.status = 'confirmed' AND f.offer_key = 'local-trust-kit' AND ${scope.sql}
     AND NOT EXISTS (SELECT 1 FROM crm_ledger c WHERE c.kind = 'credit' AND c.target_entry_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM crm_ledger v WHERE v.kind = 'void' AND v.status = 'confirmed' AND v.target_entry_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM crm_ledger r WHERE r.kind = 'refund' AND r.status != 'rejected' AND r.target_entry_id = l.id)
     AND l.occurred_on >= ? ORDER BY l.occurred_on LIMIT 100`,
  ).bind(...scope.args, addDays(today, -creditWindowDays)).all<{ opportunity_id: string; account_name: string; paid_on: string; owner_id: string | null }>()).results
    .map((row) => ({ ...row, expires_on: addDays(row.paid_on, creditWindowDays) }));
  const blocked = (await db.prepare(
    `SELECT f.id, f.opportunity_id, o.title, f.blocked_reason FROM crm_fulfillments f JOIN crm_opportunities o ON o.id = f.opportunity_id
     WHERE f.blocked = 1 AND ${actor.fulfillment ? "1 = 1" : scope.sql} LIMIT 100`,
  ).bind(...(actor.fulfillment ? [] : scope.args)).all<{ id: string; opportunity_id: string; title: string; blocked_reason: string }>()).results;
  let unassigned = 0; let inactiveOwners: TodayOpp[] = []; let pendingPayments = 0;
  if (actor.manager) {
    unassigned = (await db.prepare("SELECT COUNT(*) AS count FROM crm_opportunities WHERE owner_id IS NULL AND outcome = 'open'").first<{ count: number }>())?.count ?? 0;
    if (inactiveIds.length) {
      inactiveOwners = (await db.prepare(`SELECT o.id, o.title, a.name AS account_name, o.stage_id, o.playbook_id, o.next_action, o.next_action_due, o.owner_id FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id WHERE o.outcome IN ('open', 'paused') AND o.owner_id IN (${inactiveIds.slice(0, 90).map(() => "?").join(", ")}) LIMIT 100`)
        .bind(...inactiveIds.slice(0, 90)).all<TodayOpp>()).results;
    }
  }
  // The person's own leads only, managers included: the team's unassigned
  // queue is a separate count with a link, not part of anyone's to-do list.
  const leads = (await db.prepare(`SELECT l.id, l.name, l.company, l.status_id, l.process_id, l.next_action, l.next_action_due, l.created_at, l.owner_id FROM crm_lead_records l
     WHERE l.state = 'open' AND l.owner_id = ? AND (l.next_action_due IS NULL OR l.next_action_due <= ?) ORDER BY CASE WHEN l.next_action_due IS NULL THEN 1 ELSE 0 END, l.next_action_due, l.created_at LIMIT 100`)
    .bind(actor.id, today).all<TodayLead>()).results;
  const unassignedLeads = actor.manager ? (await db.prepare("SELECT COUNT(*) AS count FROM crm_lead_records WHERE owner_id IS NULL AND state = 'open'").first<{ count: number }>())?.count ?? 0 : 0;
  if (actor.finance) pendingPayments = (await db.prepare("SELECT COUNT(*) AS count FROM crm_ledger WHERE kind = 'payment' AND status = 'pending'").first<{ count: number }>())?.count ?? 0;
  const largest = (await db.prepare(
    `SELECT o.id, o.title, a.name AS account_name, o.stage_id, o.playbook_id, o.next_action, o.next_action_due, o.owner_id, o.estimated_value_vnd FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id
     WHERE o.outcome = 'open' AND o.owner_id = ? AND o.estimated_value_vnd IS NOT NULL ORDER BY o.estimated_value_vnd DESC LIMIT 5`,
  ).bind(actor.id).all<TodayOpp & { estimated_value_vnd: number }>()).results;
  return { largest, today, overdue, dueToday, upcoming, help, missingNext, renewals, renewalCandidates, credits, blocked, unassigned, inactiveOwners, pendingPayments, leads, unassignedLeads };
}
