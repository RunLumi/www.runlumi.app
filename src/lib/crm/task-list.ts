// "Công việc": the open tasks a person may see, scoped like the pipeline (the
// team sees every task; everyone else only tasks on opportunities they own).
// Tasks stay records of their opportunity; this is a read view over them.
import { type CrmActor, opportunityScope } from "./access";

export interface TaskRow {
  id: string; opportunity_id: string; kind: string; title: string; due_on: string | null; due_time: string | null; note: string;
  meeting_confirmed: number; needs_help: number; help_note: string; created_at: string;
  opp_title: string; account_name: string; owner_id: string | null; contact_name: string | null; contact_role: string | null;
}
export type TaskGroup = "overdue" | "today" | "upcoming" | "undated";

export async function openTasks(db: D1Database, actor: CrmActor): Promise<TaskRow[]> {
  const scope = opportunityScope(actor);
  return (await db.prepare(`SELECT t.id, t.opportunity_id, t.kind, t.title, t.due_on, t.due_time, t.note, t.meeting_confirmed, t.needs_help, t.help_note, t.created_at,
      o.title AS opp_title, a.name AS account_name, o.owner_id, c.name AS contact_name, c.role AS contact_role
    FROM crm_tasks t JOIN crm_opportunities o ON o.id = t.opportunity_id JOIN crm_accounts a ON a.id = o.account_id LEFT JOIN crm_contacts c ON c.id = t.contact_id
    WHERE t.status = 'open' AND ${scope.sql}
    ORDER BY CASE WHEN t.due_on IS NULL THEN 1 ELSE 0 END, t.due_on, t.due_time, t.created_at LIMIT 300`).bind(...scope.args).all<TaskRow>()).results;
}

export function taskGroup(task: Pick<TaskRow, "due_on">, today: string): TaskGroup {
  if (!task.due_on) return "undated";
  return task.due_on < today ? "overdue" : task.due_on === today ? "today" : "upcoming";
}

/** The opportunity a task belongs to, for checks that go through the record. */
export async function taskOpportunityId(db: D1Database, taskId: string): Promise<string> {
  return (await db.prepare("SELECT opportunity_id FROM crm_tasks WHERE id = ?").bind(taskId).first<{ opportunity_id: string }>())?.opportunity_id ?? "";
}
