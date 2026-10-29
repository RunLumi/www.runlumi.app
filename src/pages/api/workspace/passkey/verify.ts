import type { APIRoute } from "astro";
import { verifyRoute } from "../../../../lib/workspace/passkey-routes";

export const prerender = false;
export const POST: APIRoute = (context) => verifyRoute(context);
