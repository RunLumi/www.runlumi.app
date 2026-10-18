import type { AstroGlobal } from "astro";
import type { WorkspaceUser } from "../workspace/roles";
import type { Lang, PageBase } from "./pages";
import { findJobDescription, jobDescriptions, type JobDescription } from "./job-description-catalog";

export interface JobDescriptionsPageData extends PageBase {
  descriptions: readonly JobDescription[];
}

export interface JobDescriptionPageData extends PageBase {
  description: JobDescription;
}

function failure(message: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(message, { status, headers: { "Cache-Control": "private, no-store", ...headers } });
}

/** Only role templates are available here; the employee-data gate stays closed. */
function reader(astro: AstroGlobal): WorkspaceUser | Response {
  const user = astro.locals.workspace;
  if (!user) return failure("Unauthorized", 401);
  if (!user.can("hrm.access") || !user.can("hrm.records.manage") || user.hrmEmploymentEnded) {
    return failure("Forbidden", 403);
  }
  if (user.hrmEnabled !== true && !user.can("hrm.configure")) {
    return failure("HRM is not activated.", 503);
  }
  if (astro.request.method !== "GET" && astro.request.method !== "HEAD") {
    return failure("Method not allowed", 405, { Allow: "GET, HEAD" });
  }
  return user;
}

function base(lang: Lang, user: WorkspaceUser, title: string): PageBase {
  return { lang, vi: lang === "vi", user, title, live: user.hrmEnabled === true };
}

export function jobDescriptionsPage(astro: AstroGlobal, lang: Lang): Response | JobDescriptionsPageData {
  const user = reader(astro);
  if (user instanceof Response) return user;
  return {
    ...base(lang, user, lang === "vi" ? "Mô tả công việc" : "Job descriptions"),
    descriptions: jobDescriptions,
  };
}

export function jobDescriptionPage(astro: AstroGlobal, lang: Lang): Response | JobDescriptionPageData {
  const user = reader(astro);
  if (user instanceof Response) return user;
  const description = findJobDescription(astro.params.slug ?? "");
  if (!description) return failure("Not found", 404);
  return { ...base(lang, user, description.locales[lang].title), description };
}
