// CRM calendar: tasks, visits and meetings by due date, next steps of open
// opportunities and leads, and (optionally) recorded activity, for a month or
// a week in Vietnam time. Everything is scoped like the pipeline: the team
// sees all; everyone else only their own opportunities and leads.
import { type CrmActor, opportunityScope } from "./access";
import { leadScope } from "./leads";

export type CalendarView = "month" | "week";
export interface CalendarItem {
  date: string; time: string | null; kind: "task" | "next_step" | "lead_step" | "activity";
  /** Task kind or event kind; labels are resolved by the view. */
  subtype: string; title: string; href: string; record: string; status: "open" | "done" | "cancelled"; overdue: boolean;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** Today in Vietnam. */
export function vnToday(now = Date.now()): string {
  return new Date(now + 7 * 3_600_000).toISOString().slice(0, 10);
}

function addDaysIso(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Monday of the week containing `date` (ISO week, Monday first). */
export function weekStart(date: string): string {
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDaysIso(date, -weekday);
}

/**
 * The visible range. A month shows whole weeks (Monday to Sunday) around it;
 * a week shows seven days. Invalid parameters fall back to today.
 */
export function calendarRange(view: CalendarView, param: string | null, today = vnToday()): { anchor: string; from: string; to: string; days: string[]; previous: string; next: string } {
  if (view === "week") {
    const anchor = weekStart(param && datePattern.test(param) && Number.isFinite(Date.parse(param)) ? param : today);
    const days = Array.from({ length: 7 }, (_, index) => addDaysIso(anchor, index));
    return { anchor, from: days[0], to: days[6], days, previous: addDaysIso(anchor, -7), next: addDaysIso(anchor, 7) };
  }
  const month = param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) ? param : today.slice(0, 7);
  const first = `${month}-01`;
  const nextMonth = new Date(`${first}T00:00:00Z`); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const last = addDaysIso(nextMonth.toISOString().slice(0, 10), -1);
  const from = weekStart(first);
  const to = addDaysIso(weekStart(last), 6);
  const days: string[] = [];
  for (let day = from; day <= to; day = addDaysIso(day, 1)) days.push(day);
  const previous = new Date(`${first}T00:00:00Z`); previous.setUTCMonth(previous.getUTCMonth() - 1);
  return { anchor: first, from, to, days, previous: previous.toISOString().slice(0, 7), next: nextMonth.toISOString().slice(0, 7) };
}

const ACTIVITY_KINDS = ["stage", "note", "task_completed", "meeting_confirmed", "quote_accepted", "lead_note", "lead_status", "lead_converted"] as const;

export async function calendarItems(db: D1Database, actor: CrmActor, base: string, from: string, to: string, { activity = false, today = vnToday() } = {}): Promise<CalendarItem[]> {
  const opps = opportunityScope(actor);
  const leads = leadScope(actor);
  const tasks = (await db.prepare(`SELECT t.id, t.kind, t.title, t.due_on, t.due_time, t.status, o.id AS opp_id, o.title AS opp_title
      FROM crm_tasks t JOIN crm_opportunities o ON o.id = t.opportunity_id
      WHERE t.due_on BETWEEN ? AND ? AND t.status != 'cancelled' AND ${opps.sql} ORDER BY t.due_on, t.due_time LIMIT 1000`)
    .bind(from, to, ...opps.args).all<{ id: string; kind: string; title: string; due_on: string; due_time: string | null; status: "open" | "done"; opp_id: string; opp_title: string }>()).results;
  const steps = (await db.prepare(`SELECT o.id, o.title, o.next_action, o.next_action_due FROM crm_opportunities o
      WHERE o.outcome = 'open' AND o.next_action_due BETWEEN ? AND ? AND ${opps.sql} ORDER BY o.next_action_due LIMIT 500`)
    .bind(from, to, ...opps.args).all<{ id: string; title: string; next_action: string; next_action_due: string }>()).results;
  const leadSteps = (await db.prepare(`SELECT l.id, l.name, l.company, l.next_action, l.next_action_due FROM crm_lead_records l
      WHERE l.state = 'open' AND l.next_action_due BETWEEN ? AND ? AND ${leads.sql} ORDER BY l.next_action_due LIMIT 500`)
    .bind(from, to, ...leads.args).all<{ id: string; name: string; company: string; next_action: string; next_action_due: string }>()).results;
  const items: CalendarItem[] = [
    ...tasks.map((task) => ({ date: task.due_on, time: task.due_time, kind: "task" as const, subtype: task.kind, title: task.title, href: `${base}/${task.opp_id}#tasks`, record: task.opp_title, status: task.status, overdue: task.status === "open" && task.due_on < today })),
    ...steps.map((row) => ({ date: row.next_action_due, time: null, kind: "next_step" as const, subtype: "next_step", title: row.next_action || row.title, href: `${base}/${row.id}`, record: row.title, status: "open" as const, overdue: row.next_action_due < today })),
    ...leadSteps.map((row) => ({ date: row.next_action_due, time: null, kind: "lead_step" as const, subtype: "lead_step", title: row.next_action || row.name, href: `${base}/leads/${row.id}`, record: `${row.name} · ${row.company}`, status: "open" as const, overdue: row.next_action_due < today })),
  ];
  if (activity) {
    // Recorded activity on the day it happened (Vietnam time). Only what happened and where; note text stays on the record.
    const kinds = ACTIVITY_KINDS.map(() => "?").join(", ");
    const events = (await db.prepare(`SELECT e.kind, e.created_at, substr(datetime(e.created_at, '+7 hours'), 1, 10) AS day, substr(datetime(e.created_at, '+7 hours'), 12, 5) AS at,
        o.id AS opp_id, o.title AS opp_title, l.id AS lead_id, l.name AS lead_name, l.company AS lead_company
        FROM crm_events e LEFT JOIN crm_opportunities o ON o.id = e.opportunity_id LEFT JOIN crm_lead_records l ON l.id = e.lead_id
        WHERE e.kind IN (${kinds}) AND e.created_at >= ? AND e.created_at < ?
          AND ((o.id IS NOT NULL AND ${opps.sql}) OR (o.id IS NULL AND l.id IS NOT NULL AND ${leads.sql}))
        ORDER BY e.created_at LIMIT 1000`)
      .bind(...ACTIVITY_KINDS, new Date(`${from}T00:00:00+07:00`).toISOString(), new Date(`${addDaysIso(to, 1)}T00:00:00+07:00`).toISOString(), ...opps.args, ...leads.args)
      .all<{ kind: string; day: string; at: string; opp_id: string | null; opp_title: string | null; lead_id: string | null; lead_name: string | null; lead_company: string | null }>()).results;
    for (const event of events) {
      const record = event.opp_id ? event.opp_title ?? "" : `${event.lead_name ?? ""} · ${event.lead_company ?? ""}`;
      items.push({ date: event.day, time: event.at, kind: "activity", subtype: event.kind, title: record, href: event.opp_id ? `${base}/${event.opp_id}#activity` : `${base}/leads/${event.lead_id}#activity`, record, status: "done", overdue: false });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99"));
}

/** Open opportunities a person may add a task to from the calendar. */
export async function schedulableOpportunities(db: D1Database, actor: CrmActor): Promise<{ id: string; title: string; account_name: string }[]> {
  const scope = opportunityScope(actor);
  return (await db.prepare(`SELECT o.id, o.title, a.name AS account_name FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id
    WHERE o.outcome IN ('open', 'paused') AND ${scope.sql} ORDER BY o.updated_at DESC LIMIT 300`).bind(...scope.args).all<{ id: string; title: string; account_name: string }>()).results;
}
