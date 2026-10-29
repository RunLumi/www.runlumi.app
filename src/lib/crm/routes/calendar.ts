import type { AstroGlobal } from "astro";
import { type CalendarItem, type CalendarView, calendarItems, calendarRange, schedulableOpportunities, vnToday } from "../calendar";
import type { Lang } from "../i18n";
import { type Ctx, type FormState, context, emptyState, handlePost } from "../page";
import { loadOpportunity, requireEdit } from "../records";
import { createTask } from "../tasks";

export interface CalendarProps {
  ctx: Ctx; state: FormState; view: CalendarView; range: ReturnType<typeof calendarRange>; items: CalendarItem[]; activity: boolean; today: string;
  opportunities: { id: string; title: string; account_name: string }[]; newDate: string;
}

export async function calendarRoute(astro: AstroGlobal, lang: Lang): Promise<CalendarProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  const posted = await handlePost(astro, ctx, {
    // New event: a task on one of the person's opportunities, with the same checks as the record (do-not-contact included).
    task_create: async (form) => {
      const opportunity = requireEdit(await loadOpportunity(ctx.db, ctx.actor, String(form.get("opportunity_id") ?? "")));
      await createTask(ctx.db, ctx.actor, opportunity, form);
      return `${astro.url.pathname}${astro.url.search}`;
    },
  });
  if (posted instanceof Response) return posted;
  const view: CalendarView = astro.url.searchParams.get("view") === "week" ? "week" : "month";
  const today = vnToday();
  const range = calendarRange(view, astro.url.searchParams.get(view === "week" ? "week" : "month"), today);
  const activity = astro.url.searchParams.get("activity") === "1";
  const requested = astro.url.searchParams.get("date") ?? "";
  return {
    ctx, state: posted ?? emptyState, view, range, today, activity,
    items: await calendarItems(ctx.db, ctx.actor, ctx.base, range.from, range.to, { activity, today }),
    opportunities: await schedulableOpportunities(ctx.db, ctx.actor),
    newDate: /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today,
  };
}
