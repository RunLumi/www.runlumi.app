import type { APIRoute } from "astro";
import { crmActor, createLead, parseLead, validOwner } from "../../../lib/crm";
import { envFromLocals, formText } from "../../../lib/ats";
import { redirect303, sameOrigin } from "../../../lib/http";
import { safeNext } from "../../../lib/admin-auth";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  if (!sameOrigin(context.request)) return new Response("Invalid request.", { status: 400 });
  const { DB, CONTENT_DB } = envFromLocals(context.locals);
  const actor = await crmActor(context.locals, DB);
  if (!actor) return new Response("Forbidden", { status: 403 });
  const form = await context.request.formData();
  const returnTo = safeNext(formText(form, "return_to", 500));
  try {
    const input = parseLead(form);
    const requestedOwner = actor.admin ? formText(form, "owner_id", 128) || actor.id : actor.id;
    if (!await validOwner(CONTENT_DB, DB, actor, requestedOwner)) throw new Error("owner");
    const owner = requestedOwner;
    const id = await createLead(DB, actor, input, owner);
    return redirect303(`${returnTo.replace(/\?.*$/, "")}/${id}`);
  } catch (error) {
    return redirect303(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=invalid`);
  }
};
