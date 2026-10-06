import type { APIRoute } from "astro";
import { changeLead, crmActor, getLead, parseLead, validOwner } from "../../../../../lib/crm";
import { envFromLocals, formText } from "../../../../../lib/ats";
import { redirect303, sameOrigin } from "../../../../../lib/http";
import { safeNext } from "../../../../../lib/admin-auth";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!sameOrigin(context.request)) return new Response("Invalid request.", { status: 400 });
  const { DB, CONTENT_DB } = envFromLocals(context.locals);
  const actor = await crmActor(context.locals, DB);
  if (!actor) return new Response("Forbidden", { status: 403 });
  const id = context.params.id ?? "";
  const form = await context.request.formData();
  const returnTo = safeNext(formText(form, "return_to", 500));
  const back = `${returnTo.replace(/\?.*$/, "")}/${encodeURIComponent(id)}`;
  const lead = await getLead(DB, actor, id);
  if (!lead) return new Response("Lead not found.", { status: 404 });
  const version = Number(formText(form, "version", 12));
  if (!Number.isSafeInteger(version) || version < 1) return redirect303(`${back}?error=invalid`);
  try {
    const input = parseLead(form);
    const requestedOwner = actor.admin ? formText(form, "owner_id", 128) || actor.id : actor.id;
    if (!await validOwner(CONTENT_DB, DB, actor, requestedOwner)) return redirect303(`${back}?error=owner`);
    if (!await changeLead(DB, actor, lead, version, { input, owner: requestedOwner })) return redirect303(`${back}?error=conflict`);
    return redirect303(back);
  } catch {
    return redirect303(`${back}?error=invalid`);
  }
};
