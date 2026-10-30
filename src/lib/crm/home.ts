// CRM Today (Home board): this quarter's won value and strong open value, and
// the records the person last edited. Scoped like every other read: the team
// sees everyone's opportunities; others only their own.
import { type CrmActor, accountScope, opportunityScope } from "./access";
import { leadScope } from "./leads";
import { vnDate } from "./money";

export interface QuarterResult {
  label: string; from: string; to: string; today: string;
  /** Won in the quarter: known values only, with how many won deals have no value. */
  won: number; wonUnknown: number;
  /** Open opportunities with a known value and win probability ≥ 70 %. */
  strongOpen: number; strongOpenCount: number;
  /** Cumulative won value per close date inside the quarter, oldest first. */
  wonByDay: { date: string; total: number }[];
}

const STRONG = 70;

function quarterOf(date: string): { label: string; from: string; to: string } {
  const year = Number(date.slice(0, 4));
  const q = Math.floor((Number(date.slice(5, 7)) - 1) / 3);
  const from = `${year}-${String(q * 3 + 1).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(year, q * 3 + 3, 0)).toISOString().slice(0, 10);
  return { label: `Q${q + 1}/${year}`, from, to: end };
}

export async function quarterResult(db: D1Database, actor: CrmActor, today = vnDate()): Promise<QuarterResult> {
  const { label, from, to } = quarterOf(today);
  const scope = opportunityScope(actor);
  // closed_at is UTC; the close date is read in Vietnam time (+7 h).
  const won = (await db.prepare(
    `SELECT date(o.closed_at, '+7 hours') AS day, SUM(o.estimated_value_vnd) AS value, SUM(CASE WHEN o.estimated_value_vnd IS NULL THEN 1 ELSE 0 END) AS unknown
     FROM crm_opportunities o WHERE o.outcome = 'won' AND o.closed_at IS NOT NULL AND date(o.closed_at, '+7 hours') BETWEEN ? AND ? AND ${scope.sql}
     GROUP BY day ORDER BY day`,
  ).bind(from, to, ...scope.args).all<{ day: string; value: number | null; unknown: number }>()).results;
  const strong = await db.prepare(
    `SELECT COALESCE(SUM(o.estimated_value_vnd), 0) AS value, COUNT(*) AS count FROM crm_opportunities o
     WHERE o.outcome = 'open' AND o.estimated_value_vnd IS NOT NULL AND o.win_probability >= ? AND ${scope.sql}`,
  ).bind(STRONG, ...scope.args).first<{ value: number; count: number }>();
  let running = 0;
  const wonByDay = won.map((row) => ({ date: row.day, total: (running += row.value ?? 0) }));
  return {
    label, from, to, today, won: running, wonUnknown: won.reduce((sum, row) => sum + row.unknown, 0),
    strongOpen: strong?.value ?? 0, strongOpenCount: strong?.count ?? 0, wonByDay,
  };
}

export interface RecentRecord { kind: "opportunity" | "company" | "lead"; id: string; name: string; at: string }

/**
 * The records the person last changed (their own CRM events), newest first,
 * still within what they may open. The CRM keeps no view log, so this is
 * "last edited", and the page says so.
 */
export async function recentlyEdited(db: D1Database, actor: CrmActor, limit = 5): Promise<RecentRecord[]> {
  const opp = opportunityScope(actor);
  const acc = accountScope(actor);
  const lead = leadScope(actor);
  const rows = (await db.prepare(
    `SELECT kind, id, name, MAX(at) AS at FROM (
       SELECT 'opportunity' AS kind, o.id, o.title AS name, e.created_at AS at FROM crm_events e JOIN crm_opportunities o ON o.id = e.opportunity_id
         WHERE e.actor_id = ? AND ${opp.sql}
       UNION ALL
       SELECT 'company', a.id, a.name, e.created_at FROM crm_events e JOIN crm_accounts a ON a.id = e.account_id
         WHERE e.actor_id = ? AND e.opportunity_id IS NULL AND ${acc.sql}
       UNION ALL
       SELECT 'lead', l.id, l.name, e.created_at FROM crm_events e JOIN crm_lead_records l ON l.id = e.lead_id
         WHERE e.actor_id = ? AND ${lead.sql}
     ) GROUP BY kind, id ORDER BY at DESC LIMIT ?`,
  ).bind(actor.id, ...opp.args, actor.id, ...acc.args, actor.id, ...lead.args, limit).all<RecentRecord>()).results;
  return rows;
}
