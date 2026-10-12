// Sales dashboard on /crm. Figures come only from opportunities the person
// owns; team-wide roles see the whole company and may narrow it to one
// seller or one product (playbook). Unknown values stay unknown: totals say
// how many deals they cover instead of counting missing values as zero.
import { type CrmActor, opportunityScope } from "./access";
import { vnDate } from "./money";

export interface DashboardFilters { owner: string; playbook: string }

export function readDashboardFilters(url: URL, actor: CrmActor): DashboardFilters {
  const get = (key: string) => (url.searchParams.get(key) ?? "").trim().slice(0, 128);
  // Only team-wide roles may look at someone else's numbers.
  return { owner: actor.manager ? get("owner") : "", playbook: get("product") };
}

export interface Totals { deals: number; valued: number; value: number; forecastable: number; forecast: number }
export interface Row extends Totals { key: string }
export interface MonthRow { month: string; created: number; won: number }
export interface Closed { won: number; lost: number; wonValue: number; wonValued: number }

export interface Dashboard {
  filters: DashboardFilters; open: Totals; closed: Closed; winRate: number | null;
  breakdown: { by: "stage" | "playbook"; rows: Row[] }; months: MonthRow[]; owners: Row[] | null;
}

export const CLOSED_WINDOW_DAYS = 90;
export const MONTHS = 6;

/** Win rate among deals closed in the window; null when nothing closed. */
export function winRate(won: number, lost: number): number | null {
  return won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;
}

/** The last `count` calendar months in Vietnam time, oldest first, as YYYY-MM. */
export function monthKeys(now: Date, count: number): string[] {
  const [year, month] = vnDate(now).split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const offset = month - 1 - (count - 1 - index);
    const y = year + Math.floor(offset / 12);
    const m = ((offset % 12) + 12) % 12 + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  });
}

/** Fills months without activity with zeros so the chart keeps its time axis. */
export function fillMonths(keys: readonly string[], created: readonly { month: string; n: number }[], won: readonly { month: string; n: number }[]): MonthRow[] {
  const count = (rows: readonly { month: string; n: number }[], key: string) => rows.find((row) => row.month === key)?.n ?? 0;
  return keys.map((month) => ({ month, created: count(created, month), won: count(won, month) }));
}

/** Compact VND for chart labels: 1,2 tỷ · 350 tr · 900 k. */
export function compactVnd(amount: number, vi: boolean): string {
  const format = (value: number, unit: string) => `${new Intl.NumberFormat(vi ? "vi-VN" : "en-US", { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${unit}`;
  if (amount >= 1e9) return format(amount / 1e9, vi ? "tỷ" : "bn");
  if (amount >= 1e6) return format(amount / 1e6, vi ? "tr" : "m");
  if (amount >= 1e3) return format(amount / 1e3, "k");
  return format(amount, "₫");
}

const TOTALS = `COUNT(*) AS deals, COUNT(o.estimated_value_vnd) AS valued, COALESCE(SUM(o.estimated_value_vnd), 0) AS value,
  SUM(CASE WHEN o.estimated_value_vnd IS NOT NULL AND o.win_probability IS NOT NULL THEN 1 ELSE 0 END) AS forecastable,
  COALESCE(SUM(CASE WHEN o.estimated_value_vnd IS NOT NULL AND o.win_probability IS NOT NULL THEN o.estimated_value_vnd * o.win_probability / 100.0 END), 0) AS forecast`;
// Months in Vietnam time (UTC+7, no daylight saving).
const VN_MONTH = (column: string) => `substr(datetime(${column}, '+7 hours'), 1, 7)`;

export async function loadDashboard(db: D1Database, actor: CrmActor, filters: DashboardFilters, now = new Date()): Promise<Dashboard> {
  const scope = opportunityScope(actor);
  const parts = [scope.sql];
  const args: unknown[] = [...scope.args];
  if (actor.manager && filters.owner) { parts.push("o.owner_id = ?"); args.push(filters.owner); }
  if (filters.playbook) { parts.push("o.playbook_id IN (SELECT id FROM crm_playbooks WHERE playbook_key = ?)"); args.push(filters.playbook); }
  const where = parts.join(" AND ");
  const open = `${where} AND o.outcome IN ('open', 'paused')`;
  const since = new Date(now.getTime() - CLOSED_WINDOW_DAYS * 86_400_000).toISOString();
  const keys = monthKeys(now, MONTHS);
  const from = `${keys[0]}-01`;
  const by = filters.playbook ? "stage" : "playbook";
  const group = by === "stage" ? "o.stage_id" : "substr(o.playbook_id, 1, instr(o.playbook_id, '@') - 1)";
  const all = <T>(sql: string, values: unknown[]) => db.prepare(sql).bind(...values).all<T>().then((result) => result.results);
  const [totals, closed, breakdown, created, won, owners] = await Promise.all([
    db.prepare(`SELECT ${TOTALS} FROM crm_opportunities o WHERE ${open}`).bind(...args).first<Totals>(),
    db.prepare(`SELECT SUM(o.outcome = 'won') AS won, SUM(o.outcome = 'lost') AS lost, COALESCE(SUM(CASE WHEN o.outcome = 'won' THEN o.estimated_value_vnd END), 0) AS wonValue,
      SUM(o.outcome = 'won' AND o.estimated_value_vnd IS NOT NULL) AS wonValued FROM crm_opportunities o WHERE ${where} AND o.closed_at >= ?`).bind(...args, since).first<Closed>(),
    all<Row>(`SELECT ${group} AS key, ${TOTALS} FROM crm_opportunities o WHERE ${open} GROUP BY key ORDER BY value DESC, deals DESC LIMIT 20`, args),
    all<{ month: string; n: number }>(`SELECT ${VN_MONTH("o.created_at")} AS month, COUNT(*) AS n FROM crm_opportunities o WHERE ${where} AND o.created_at >= ? GROUP BY month`, [...args, `${from}T00:00:00.000Z`]),
    all<{ month: string; n: number }>(`SELECT ${VN_MONTH("o.closed_at")} AS month, COUNT(*) AS n FROM crm_opportunities o WHERE ${where} AND o.outcome = 'won' AND o.closed_at >= ? GROUP BY month`, [...args, `${from}T00:00:00.000Z`]),
    actor.manager && !filters.owner
      ? all<Row>(`SELECT COALESCE(o.owner_id, '') AS key, ${TOTALS} FROM crm_opportunities o WHERE ${open} GROUP BY key ORDER BY forecast DESC, value DESC LIMIT 50`, args)
      : Promise.resolve(null),
  ]);
  const zero: Totals = { deals: 0, valued: 0, value: 0, forecastable: 0, forecast: 0 };
  const shut: Closed = { won: closed?.won ?? 0, lost: closed?.lost ?? 0, wonValue: closed?.wonValue ?? 0, wonValued: closed?.wonValued ?? 0 };
  return {
    filters, open: totals ?? zero, closed: shut, winRate: winRate(shut.won, shut.lost),
    breakdown: { by, rows: breakdown }, months: fillMonths(keys, created, won), owners,
  };
}
