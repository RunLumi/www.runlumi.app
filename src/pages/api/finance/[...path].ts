import type { APIRoute } from "astro";
import { financeApi } from "../../../lib/finance/api";

export const prerender = false;
export const ALL: APIRoute = financeApi;
