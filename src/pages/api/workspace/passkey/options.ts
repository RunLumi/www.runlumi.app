import type { APIRoute } from "astro";
import { optionsRoute } from "../../../../lib/workspace/passkey-routes";

export const prerender = false;
export const POST: APIRoute = (context) => optionsRoute(context);
