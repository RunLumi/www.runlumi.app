import type { AstroGlobal } from "astro";
import { displayNames } from "../access";
import { type QueueRow, fulfillmentQueue } from "../fulfillment";
import type { Lang } from "../i18n";
import { type Ctx, context } from "../page";

export interface FulfillmentProps { ctx: Ctx; rows: QueueRow[]; names: Record<string, { name: string; active: boolean }> }

export async function fulfillmentRoute(astro: AstroGlobal, lang: Lang): Promise<FulfillmentProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  const rows = await fulfillmentQueue(ctx.db, ctx.actor);
  return { ctx, rows, names: await displayNames(ctx.contentDb, rows.flatMap((row) => [row.owner_id ?? "", row.assignee_id ?? ""])) };
}
