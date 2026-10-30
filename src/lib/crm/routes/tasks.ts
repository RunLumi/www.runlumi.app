import type { AstroGlobal } from "astro";
import { displayNames } from "../access";
import { schedulableOpportunities, vnToday } from "../calendar";
import type { Lang } from "../i18n";
import { type Ctx, type FormState, context, emptyState, handlePost } from "../page";
import { loadOpportunity, requireEdit } from "../records";
import { type TaskRow, openTasks, taskOpportunityId } from "../task-list";
import { createTask, updateTask } from "../tasks";

export interface TasksProps {
  ctx: Ctx; state: FormState; tasks: TaskRow[]; selected: TaskRow | null; today: string;
  names: Record<string, { name: string; active: boolean }>; opportunities: { id: string; title: string; account_name: string }[];
}

export async function tasksRoute(astro: AstroGlobal, lang: Lang): Promise<TasksProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  const editable = async (opportunityId: string) => requireEdit(await loadOpportunity(ctx.db, ctx.actor, opportunityId));
  const posted = await handlePost(astro, ctx, {
    // Both go through the opportunity, with the same ownership, do-not-contact and outcome checks as the record page.
    task_create: async (form) => { await createTask(ctx.db, ctx.actor, await editable(String(form.get("opportunity_id") ?? "")), form); return `${ctx.base}/tasks`; },
    task_update: async (form) => {
      const taskId = String(form.get("task_id") ?? "");
      await updateTask(ctx.db, ctx.actor, await editable(await taskOpportunityId(ctx.db, taskId)), form);
      return `${ctx.base}/tasks`;
    },
  });
  if (posted instanceof Response) return posted;
  const tasks = await openTasks(ctx.db, ctx.actor);
  const wanted = astro.url.searchParams.get("task") ?? (posted?.intent === "task_update" ? posted.values.task_id : "");
  return {
    ctx, state: posted ?? emptyState, tasks, today: vnToday(),
    selected: tasks.find((task) => task.id === wanted) ?? tasks[0] ?? null,
    names: await displayNames(ctx.contentDb, tasks.map((task) => task.owner_id ?? "").filter(Boolean)),
    opportunities: astro.url.searchParams.get("new") === "1" || posted?.intent === "task_create" ? await schedulableOpportunities(ctx.db, ctx.actor) : [],
  };
}
