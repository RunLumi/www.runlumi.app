// CRM stats on the Reports page (/crm/reports): leads, the opportunity funnel, the open pipeline and
// daily activity, for up to five filter sets side by side. Every query runs
// inside the viewer's own scope (team-wide roles: everyone; others: what they
// own), so comparing sets never reveals records the person cannot open.
// Lead area/industry come from the lead; opportunity area/industry from its
// company. Unknown stays unknown: a rate with no denominator is null.
import { foldSql, foldText } from "../search";
import { auditStatement } from "../workspace/members";
import { completeArea } from "./area";
import { ForbiddenError } from "./core";
import { type CrmActor, accountScope, opportunityScope } from "./access";
import { leadScope } from "./leads";
import { vnDate } from "./money";
import type { PlaybookDef } from "./playbook";
import { sourceChannels } from "./records";

export const MAX_SETS = 5;
export const MAX_DAYS = 366;
export const DAILY_LIMIT_DAYS = 62;
const ROW_CAP = 20_000;

export interface StatsSet { label: string; city: string; district: string; ward: string; industry: string; source: string; owner: string }
export interface StatsQuery {
  from: string; to: string; playbook: string; sets: StatsSet[]; focus: number; trend: "leads" | "opportunities" | "won";
  /** Other filters on the same Reports page (sales overview, cohort), carried through stats links. */
  keep: Record<string, string>;
}
const keptParams = ["owner", "product", "cohort_report"] as const;
export const emptySet: StatsSet = { label: "", city: "", district: "", ward: "", industry: "", source: "", owner: "" };
const setKeys = ["label", "city", "district", "ward", "industry", "source", "owner"] as const;

const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
/** UTC instant of 00:00 Vietnam time (UTC+7) on `day`. */
const vnStart = (day: string) => new Date(Date.parse(`${day}T00:00:00+07:00`)).toISOString();

export function readStatsQuery(url: URL, actor: Pick<CrmActor, "manager">, playbookKeys: string[], now = new Date()): StatsQuery {
  const get = (key: string, max = 80) => (url.searchParams.get(key) ?? "").replace(/\p{Cc}/gu, "").trim().slice(0, max);
  const today = vnDate(now);
  let to = isoDay.test(get("to")) && !Number.isNaN(Date.parse(get("to"))) ? get("to") : today;
  if (to > today) to = today;
  let from = isoDay.test(get("from")) && !Number.isNaN(Date.parse(get("from"))) ? get("from") : addDays(to, -29);
  if (from > to) from = to;
  if (dayDiff(from, to) >= MAX_DAYS) from = addDays(to, -(MAX_DAYS - 1));
  const count = Math.min(MAX_SETS, Math.max(1, Number.parseInt(get("n", 2), 10) || 1));
  const sets: StatsSet[] = [];
  for (let index = 0; index < count; index += 1) {
    const set = { ...emptySet };
    for (const key of setKeys) set[key] = get(`s${index}_${key}`, key === "ward" ? 200 : 80);
    if (!(sourceChannels as readonly string[]).includes(set.source)) set.source = "";
    if (!actor.manager) set.owner = "";
    sets.push(set);
  }
  const playbook = playbookKeys.includes(get("playbook", 60)) ? get("playbook", 60) : playbookKeys[0] ?? "";
  const focus = Math.min(count - 1, Math.max(0, Number.parseInt(get("focus", 1), 10) || 0));
  const trend = (["leads", "opportunities", "won"] as const).find((item) => item === get("trend", 20)) ?? "leads";
  const keep = Object.fromEntries(keptParams.map((key) => [key, get(key, 128)]).filter(([, value]) => value));
  return { from, to, playbook, sets, focus, trend, keep };
}

/** Query string for a stats URL (only non-empty values). */
export function statsSearch(query: StatsQuery, change: Partial<Omit<StatsQuery, "sets">> & { sets?: StatsSet[] } = {}): string {
  const next = { ...query, ...change };
  const params = new URLSearchParams();
  params.set("from", next.from); params.set("to", next.to);
  if (next.playbook) params.set("playbook", next.playbook);
  if (next.sets.length > 1) params.set("n", String(next.sets.length));
  next.sets.forEach((set, index) => { for (const key of setKeys) if (set[key]) params.set(`s${index}_${key}`, set[key]); });
  if (next.focus) params.set("focus", String(next.focus));
  if (next.trend !== "leads") params.set("trend", next.trend);
  for (const [key, value] of Object.entries(next.keep)) params.set(key, value);
  return `?${params}`;
}

/** Ward options carry their district and city ("Phường 13|Quận 4|TP. Hồ Chí Minh") so a ward is never matched in the wrong district. */
export function splitWard(value: string): { ward: string; district: string; city: string } {
  const [ward = "", district = "", city = ""] = value.split("|");
  return { ward, district, city };
}

interface Where { sql: string; args: unknown[] }

/** Filters of one set on a table alias holding city/district/ward/industry plus owner/source columns. */
function setWhere(set: StatsSet, area: string, row: string): Where {
  const parts: string[] = [];
  const args: unknown[] = [];
  const same = (column: string, value: string) => { parts.push(`${foldSql(column)} = ?`); args.push(foldText(value)); };
  const ward = splitWard(set.ward);
  if (set.city || ward.city) same(`${area}.city`, set.city || ward.city);
  if (set.district || ward.district) same(`${area}.district`, set.district || ward.district);
  if (ward.ward) same(`${area}.ward`, ward.ward);
  if (set.industry) same(`${area}.industry`, set.industry);
  if (set.source) { parts.push(`${row}.source_channel = ?`); args.push(set.source); }
  if (set.owner === "unassigned") parts.push(`${row}.owner_id IS NULL`);
  else if (set.owner) { parts.push(`${row}.owner_id = ?`); args.push(set.owner); }
  return { sql: parts.length ? parts.join(" AND ") : "1 = 1", args };
}

export interface FunnelStep { id: string; count: number }
export interface SetStats {
  leads: number; converted: number; disqualified: number; openLeads: number;
  opportunities: number; won: number; lost: number; wonValue: number; wonValued: number;
  funnel: FunnelStep[]; pipeline: FunnelStep[]; openPipeline: number;
  series: { bucket: string; leads: number; opportunities: number; won: number }[];
  capped: boolean;
}

export interface Breakdown { key: string; leads: number; converted: number; disqualified: number; opportunities: number; won: number }

export const rate = (part: number, whole: number): number | null => whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

/** Buckets for the trend: days for short periods, weeks (Monday) beyond DAILY_LIMIT_DAYS. */
export function buckets(from: string, to: string): { unit: "day" | "week"; keys: string[] } {
  const days = dayDiff(from, to) + 1;
  if (days <= DAILY_LIMIT_DAYS) return { unit: "day", keys: Array.from({ length: days }, (_, index) => addDays(from, index)) };
  const monday = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
  const keys: string[] = [];
  for (let day = monday(from); day <= to; day = addDays(day, 7)) keys.push(day);
  return { unit: "week", keys };
}

const VN_DAY = (column: string) => `substr(datetime(${column}, '+7 hours'), 1, 10)`;

export async function loadSetStats(db: D1Database, actor: CrmActor, query: StatsQuery, set: StatsSet, def: PlaybookDef | null, playbookIds: string[]): Promise<SetStats> {
  const start = vnStart(query.from);
  const end = vnStart(addDays(query.to, 1));
  const lead = leadScope(actor, "l");
  const leadSet = setWhere(set, "l", "l");
  const leadWhere = `${lead.sql} AND ${leadSet.sql} AND l.created_at >= ? AND l.created_at < ?`;
  const leadArgs = [...lead.args, ...leadSet.args, start, end];
  const opp = opportunityScope(actor, "o");
  const oppSet = setWhere(set, "a", "o");
  const inPlaybook = playbookIds.length ? `o.playbook_id IN (${playbookIds.map(() => "?").join(", ")})` : "0 = 1";
  const oppBase = `${opp.sql} AND ${oppSet.sql} AND ${inPlaybook}`;
  const oppBaseArgs = [...opp.args, ...oppSet.args, ...playbookIds];

  const [leadTotals, leadDays, opps, pipelineRows, wonDays] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS leads, SUM(l.state = 'converted') AS converted, SUM(l.state = 'disqualified') AS disqualified, SUM(l.state = 'open') AS open
      FROM crm_lead_records l WHERE ${leadWhere}`).bind(...leadArgs).first<{ leads: number; converted: number | null; disqualified: number | null; open: number | null }>(),
    db.prepare(`SELECT ${VN_DAY("l.created_at")} AS day, COUNT(*) AS n FROM crm_lead_records l WHERE ${leadWhere} GROUP BY day`).bind(...leadArgs).all<{ day: string; n: number }>(),
    db.prepare(`SELECT o.stage_id, o.outcome, o.estimated_value_vnd AS value, ${VN_DAY("o.created_at")} AS day,
        (SELECT group_concat(h.to_stage, ',') FROM crm_stage_history h WHERE h.opportunity_id = o.id) AS path
      FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id
      WHERE ${oppBase} AND o.created_at >= ? AND o.created_at < ? LIMIT ${ROW_CAP + 1}`).bind(...oppBaseArgs, start, end)
      .all<{ stage_id: string; outcome: string; value: number | null; day: string; path: string | null }>(),
    db.prepare(`SELECT o.stage_id AS id, COUNT(*) AS count FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id
      WHERE ${oppBase} AND o.outcome = 'open' GROUP BY o.stage_id`).bind(...oppBaseArgs).all<FunnelStep>(),
    db.prepare(`SELECT ${VN_DAY("o.closed_at")} AS day, COUNT(*) AS n FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id
      WHERE ${oppBase} AND o.outcome = 'won' AND o.closed_at >= ? AND o.closed_at < ? GROUP BY day`).bind(...oppBaseArgs, start, end).all<{ day: string; n: number }>(),
  ]);

  const rows = opps.results.slice(0, ROW_CAP);
  const stages = def?.stages ?? [];
  const openStages = stages.filter((stage) => stage.outcome === "open");
  const wonStages = new Set(stages.filter((stage) => stage.outcome === "won").map((stage) => stage.id));
  const order = new Map(stages.map((stage, index) => [stage.id, index]));
  // The furthest stage each deal reached, from its history and current stage.
  const reached = rows.map((row) => {
    const path = [...(row.path ?? "").split(","), row.stage_id].filter(Boolean);
    const won = row.outcome === "won" || path.some((id) => wonStages.has(id));
    const furthest = Math.max(-1, ...path.filter((id) => !wonStages.has(id) && stages[order.get(id) ?? -1]?.outcome === "open").map((id) => order.get(id) ?? -1));
    return { won, furthest: won ? stages.length : furthest, path: new Set(path) };
  });
  // A skippable stage counts only deals that actually went through it.
  const funnel: FunnelStep[] = [
    ...openStages.map((stage) => ({ id: stage.id, count: reached.filter((item) => stage.skippable ? item.path.has(stage.id) : item.furthest >= (order.get(stage.id) ?? 0)).length })),
    { id: "won", count: reached.filter((item) => item.won).length },
  ];
  const range = buckets(query.from, query.to);
  const bucketOf = (day: string) => range.unit === "day" ? day : [...range.keys].reverse().find((key) => key <= day) ?? range.keys[0];
  const tally = new Map(range.keys.map((key) => [key, { bucket: key, leads: 0, opportunities: 0, won: 0 }]));
  for (const row of leadDays.results) { const entry = tally.get(bucketOf(row.day)); if (entry) entry.leads += row.n; }
  for (const row of rows) { const entry = tally.get(bucketOf(row.day)); if (entry) entry.opportunities += 1; }
  for (const row of wonDays.results) { const entry = tally.get(bucketOf(row.day)); if (entry) entry.won += row.n; }
  const won = rows.filter((row) => row.outcome === "won");
  return {
    leads: leadTotals?.leads ?? 0, converted: leadTotals?.converted ?? 0, disqualified: leadTotals?.disqualified ?? 0, openLeads: leadTotals?.open ?? 0,
    opportunities: rows.length, won: won.length, lost: rows.filter((row) => row.outcome === "lost").length,
    wonValue: won.reduce((sum, row) => sum + (row.value ?? 0), 0), wonValued: won.filter((row) => row.value !== null).length,
    funnel, pipeline: openStages.map((stage) => ({ id: stage.id, count: pipelineRows.results.find((row) => row.id === stage.id)?.count ?? 0 })),
    openPipeline: pipelineRows.results.reduce((sum, row) => sum + row.count, 0),
    series: [...tally.values()], capped: opps.results.length > ROW_CAP,
  };
}

/** Leads and deals of one set grouped by area (the level below the set's own area filter) or by industry. */
export type BreakdownLevel = "city" | "district" | "ward" | "industry" | "source_channel";
export async function loadBreakdown(db: D1Database, actor: CrmActor, query: StatsQuery, set: StatsSet, by: "area" | "industry" | "source", playbookIds: string[]): Promise<{ level: BreakdownLevel; rows: Breakdown[] }> {
  const ward = splitWard(set.ward);
  const level: BreakdownLevel = by === "industry" ? "industry" : by === "source" ? "source_channel" : ward.ward || set.district || ward.district ? "ward" : set.city || ward.city ? "district" : "city";
  const accountColumn = level === "source_channel" ? "o.source_channel" : `a.${level}`;
  const start = vnStart(query.from);
  const end = vnStart(addDays(query.to, 1));
  const lead = leadScope(actor, "l");
  const leadSet = setWhere(set, "l", "l");
  const opp = opportunityScope(actor, "o");
  const oppSet = setWhere(set, "a", "o");
  const inPlaybook = playbookIds.length ? `o.playbook_id IN (${playbookIds.map(() => "?").join(", ")})` : "0 = 1";
  const [leads, opps] = await Promise.all([
    db.prepare(`SELECT l.${level} AS key, COUNT(*) AS leads, SUM(l.state = 'converted') AS converted, SUM(l.state = 'disqualified') AS disqualified FROM crm_lead_records l
      WHERE ${lead.sql} AND ${leadSet.sql} AND l.created_at >= ? AND l.created_at < ? GROUP BY l.${level}`)
      .bind(...lead.args, ...leadSet.args, start, end).all<{ key: string; leads: number; converted: number; disqualified: number }>(),
    db.prepare(`SELECT ${accountColumn} AS key, COUNT(*) AS opportunities, SUM(o.outcome = 'won') AS won FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id
      WHERE ${opp.sql} AND ${oppSet.sql} AND ${inPlaybook} AND o.created_at >= ? AND o.created_at < ? GROUP BY ${accountColumn}`)
      .bind(...opp.args, ...oppSet.args, ...playbookIds, start, end).all<{ key: string; opportunities: number; won: number }>(),
  ]);
  const merged = new Map<string, Breakdown>();
  const entry = (key: string) => { const name = key ?? ""; if (!merged.has(name)) merged.set(name, { key: name, leads: 0, converted: 0, disqualified: 0, opportunities: 0, won: 0 }); return merged.get(name)!; };
  for (const row of leads.results) { const item = entry(row.key); item.leads += row.leads; item.converted += row.converted ?? 0; item.disqualified += row.disqualified ?? 0; }
  for (const row of opps.results) { const item = entry(row.key); item.opportunities += row.opportunities; item.won += row.won ?? 0; }
  const rows = [...merged.values()].sort((a, b) => (b.leads + b.opportunities) - (a.leads + a.opportunities) || a.key.localeCompare(b.key, "vi"));
  return { level, rows: rows.slice(0, 50) };
}

export interface AreaOptions { cities: string[]; districts: { value: string; city: string }[]; wards: { value: string; label: string }[]; industries: string[] }

/** Distinct area and industry values among the leads and companies the person can see. */
export async function areaOptions(db: D1Database, actor: CrmActor): Promise<AreaOptions> {
  const lead = leadScope(actor, "l");
  const accounts = accountScope(actor, "a");
  const rows = (await db.prepare(`SELECT city, district, ward, industry FROM (
      SELECT l.city, l.district, l.ward, l.industry FROM crm_lead_records l WHERE ${lead.sql}
      UNION SELECT a.city, a.district, a.ward, a.industry FROM crm_accounts a WHERE ${accounts.sql}) LIMIT 5000`)
    .bind(...lead.args, ...accounts.args).all<{ city: string; district: string; ward: string; industry: string }>()).results;
  const sort = (values: Iterable<string>) => [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
  const industryNames = new Map<string, string>();
  for (const row of rows) if (row.industry && !industryNames.has(foldText(row.industry))) industryNames.set(foldText(row.industry), row.industry);
  const districts = new Map<string, { value: string; city: string }>();
  for (const row of rows) if (row.district) districts.set(`${row.district}|${row.city}`, { value: row.district, city: row.city });
  const wards = new Map<string, { value: string; label: string }>();
  for (const row of rows) if (row.ward) wards.set(`${row.ward}|${row.district}|${row.city}`, { value: `${row.ward}|${row.district}|${row.city}`, label: [row.ward, row.district, row.city].filter(Boolean).join(" · ") });
  return {
    cities: sort(rows.map((row) => row.city)),
    districts: [...districts.values()].sort((a, b) => a.value.localeCompare(b.value, "vi", { numeric: true })),
    wards: [...wards.values()].sort((a, b) => a.label.localeCompare(b.label, "vi", { numeric: true })),
    industries: sort(industryNames.values()),
  };
}

// ------------------------------------------------------------ area backfill

export interface AreaGaps { accounts: number; leads: number }

/** Companies and open/closed leads with no area yet but some text to read it from. */
export async function areaGaps(db: D1Database): Promise<AreaGaps> {
  const row = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM crm_accounts WHERE ward = '' AND district = '' AND city = '' AND (address != '' OR region != '')) AS accounts,
      (SELECT COUNT(*) FROM crm_lead_records WHERE ward = '' AND district = '' AND city = '' AND region != '') AS leads`).first<AreaGaps>();
  return { accounts: row?.accounts ?? 0, leads: row?.leads ?? 0 };
}

/**
 * CRM admins only: fills blank ward/district/city from the address or area
 * text where a part is explicitly marked (see area.ts). Records that cannot
 * be read stay blank. Each changed record gets a new version, and one audit
 * row records how many were filled.
 */
export async function fillAreas(db: D1Database, actor: CrmActor, { page = 200, max = 2000 } = {}): Promise<{ accounts: number; leads: number; unreadable: number }> {
  if (!actor.configure) throw new ForbiddenError();
  const now = new Date().toISOString();
  const result = { accounts: 0, leads: 0, unreadable: 0 };
  const tables = [
    { table: "crm_accounts", key: "accounts" as const, text: "address, region", extra: "(address != '' OR region != '')" },
    { table: "crm_lead_records", key: "leads" as const, text: "'' AS address, region", extra: "region != ''" },
  ];
  for (const { table, key, text, extra } of tables) {
    // A cursor, so records that cannot be read never block the next page.
    for (let after = "", seen = 0; seen < max;) {
      const rows = (await db.prepare(`SELECT id, ${text}, version FROM ${table} WHERE ward = '' AND district = '' AND city = '' AND ${extra} AND id > ? ORDER BY id LIMIT ?`)
        .bind(after, page).all<{ id: string; address: string; region: string; version: number }>()).results;
      if (!rows.length) break;
      seen += rows.length;
      after = rows[rows.length - 1].id;
      const statements: D1PreparedStatement[] = [];
      for (const row of rows) {
        const area = completeArea({}, row.address, row.region);
        if (!area.ward && !area.district && !area.city) { result.unreadable += 1; continue; }
        result[key] += 1;
        statements.push(db.prepare(`UPDATE ${table} SET ward = ?, district = ?, city = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND ward = '' AND district = '' AND city = ''`)
          .bind(area.ward, area.district, area.city, now, row.id, row.version));
      }
      if (statements.length) await db.batch(statements);
      if (rows.length < page) break;
    }
  }
  await auditStatement(db, actor, "crm_area_backfill", actor.id, result, now, { module: "crm" }).run();
  return result;
}
