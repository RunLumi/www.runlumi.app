import type { APIRoute } from "astro";
import { auditExport } from "../../../../lib/workspace/audit-pages";

export const prerender = false;
export const GET: APIRoute = (context) => auditExport(context);
