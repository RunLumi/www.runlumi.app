// Shared request handling for CRM pages. Forms post back to the page that
// rendered them: success redirects (303) to a fresh GET; invalid input,
// conflicts and server errors re-render the same form with what was typed.
import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { sameOrigin } from "../http";
import { type CrmActor, crmActor } from "./access";
import { ConflictError, type FieldErrors, ForbiddenError, NotFoundError, ValidationError, formValues } from "./core";
import { type Lang, base } from "./i18n";
import { kickLark } from "./lark/kick";
import { StepUpRequiredError } from "../workspace/passkey";
import { stepUpRequiredResponse } from "../workspace/step-up";

export interface Ctx { actor: CrmActor; db: D1Database; contentDb: D1Database; lang: Lang; vi: boolean; base: string; url: URL }

export interface FormState {
  intent: string; values: Record<string, string>; errors: FieldErrors;
  conflict: boolean; serverError: boolean;
}
export const emptyState: FormState = { intent: "", values: {}, errors: {}, conflict: false, serverError: false };

export async function context(astro: AstroGlobal, lang: Lang): Promise<Ctx | Response> {
  const { DB, CONTENT_DB } = envFromLocals(astro.locals);
  const actor = await crmActor(astro.locals, DB);
  // Middleware already redirects anonymous users and rejects non-members.
  if (!actor) return new Response(lang === "vi" ? "Chưa được cấp quyền CRM." : "CRM access has not been granted.", { status: 403 });
  return { actor, db: DB, contentDb: CONTENT_DB, lang, vi: lang === "vi", base: base(lang), url: astro.url };
}

export function notFound(lang: Lang): Response {
  return new Response(lang === "vi" ? "Không tìm thấy hồ sơ." : "Record not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
}

export function forbidden(lang: Lang): Response {
  return new Response(lang === "vi" ? "Bạn không có quyền thực hiện thao tác này." : "You do not have permission for this action.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
}

export type Handler = (form: FormData) => Promise<string | void>;

/**
 * Runs the handler for the submitted intent. Returns a Response to send
 * (redirect, 4xx) or a FormState to re-render with. The handler may return a
 * path to redirect to; otherwise the current URL is reloaded with ?saved=.
 */
export async function handlePost(astro: AstroGlobal, ctx: Ctx, handlers: Record<string, Handler>): Promise<Response | FormState | null> {
  if (astro.request.method !== "POST") return null;
  if (!sameOrigin(astro.request)) return new Response("Invalid request origin.", { status: 400 });
  let form: FormData;
  try {
    form = await astro.request.formData();
  } catch {
    return new Response("Invalid form body.", { status: 400 });
  }
  const intent = typeof form.get("intent") === "string" ? String(form.get("intent")) : "";
  const state: FormState = { ...emptyState, intent, values: formValues(form), errors: {} };
  const handler = Object.hasOwn(handlers, intent) ? handlers[intent] : undefined;
  if (!handler) return new Response("Unknown action.", { status: 400 });
  try {
    const target = await handler(form);
    kickLark();
    const next = new URL(target ?? astro.url.pathname + astro.url.search, astro.url);
    next.searchParams.set("saved", intent);
    return new Response(null, { status: 303, headers: { Location: next.pathname + next.search + next.hash, "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ValidationError) { astro.response.status = 422; return { ...state, errors: error.fields }; }
    if (error instanceof ConflictError) { astro.response.status = 409; return { ...state, conflict: true }; }
    if (error instanceof NotFoundError) return notFound(ctx.lang);
    if (error instanceof ForbiddenError) return forbidden(ctx.lang);
    if (error instanceof StepUpRequiredError) return stepUpRequiredResponse({ request: astro.request, url: astro.url }, { vi: ctx.vi, next: astro.url.pathname + astro.url.search });
    // Log the failure without form contents; they may contain personal data.
    console.error("crm_action_failed", intent, error instanceof Error ? error.message : "unknown"); // !# policy: console
    astro.response.status = 500;
    return { ...state, serverError: true };
  }
}

/** Value for a form field: what the user typed if this form was re-rendered, else the stored value. */
export function valueFor(state: FormState, intent: string, name: string, stored: string | number | null | undefined): string {
  if (state.intent === intent && name in state.values) return state.values[name];
  return stored === null || stored === undefined ? "" : String(stored);
}

export function errorFor(state: FormState, intent: string, name: string): string | undefined {
  return state.intent === intent ? state.errors[name] : undefined;
}

export function requestKey(state: FormState, intent: string): string {
  return state.intent === intent && state.values.request_key ? state.values.request_key : crypto.randomUUID();
}

export function page(url: URL): number {
  const value = Number(url.searchParams.get("page") ?? "1");
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}
