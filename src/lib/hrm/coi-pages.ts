import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import type { MemberRow } from "../workspace/members";
import { HrmError, date, revision, text } from "./fields";
import type { Lang, PageBase } from "./pages";
import { sameOrigin } from "../http";
import {
  assignCoiReviewer,
  getCoiDeclaration,
  listCoiEvidence,
  listCoiReviewQueue,
  listMyCoiDeclarations,
  listCoiReviewers,
  reviewCoiDeclaration,
  saveCoiDraft,
  startCoiReview,
  submitCoiDeclaration,
  type CoiAnswers,
  type CoiDeclaration,
  type CoiListItem,
  type LegalCoiFile,
} from "./coi";

const base = (lang: Lang, user: NonNullable<AstroGlobal["locals"]["workspace"]>, title: string): PageBase => ({
  lang,
  vi: lang === "vi",
  user,
  title,
  live: user.hrmEnabled === true,
});

async function formOf(astro: AstroGlobal): Promise<FormData> {
  if (!sameOrigin(astro.request)) throw new HrmError("invalid_origin", 400);
  const request = astro.locals.hrmFormRequest ?? astro.request;
  const form = await request.formData().catch(() => null);
  if (!form) throw new HrmError("invalid_form", 400);
  return form;
}

const redirect = (astro: AstroGlobal, path: string, saved: string): Response => {
  const target = new URL(path, astro.url);
  target.searchParams.set("saved", saved);
  return new Response(null, { status: 303, headers: { Location: target.pathname + target.search, "Cache-Control": "private, no-store" } });
};

function answersFrom(form: FormData): CoiAnswers {
  const hasConflict = text(form, "has_conflict", 5, true);
  if (hasConflict !== "yes" && hasConflict !== "no") throw new HrmError("invalid_field");
  return {
    has_conflict: hasConflict,
    related_organization: text(form, "related_organization", 300),
    relationship: text(form, "relationship", 300),
    description: text(form, "description", 2000),
    impact: text(form, "impact", 2000),
    proposed_mitigation: text(form, "proposed_mitigation", 2000),
  };
}

function liveUser(astro: AstroGlobal) {
  const user = astro.locals.workspace!;
  if (user.hrmEnabled !== true) throw new HrmError("hrm_closed", 503);
  return user;
}

export interface MyCoiPage extends PageBase {
  declarations: CoiDeclaration[];
  saved: string;
  error?: string;
  requestKey: string;
}

export async function myCoiPage(astro: AstroGlobal, lang: Lang): Promise<Response | MyCoiPage> {
  const user = liveUser(astro);
  if (!user.can("hrm.coi.self")) return new Response("Forbidden", { status: 403 });
  const { DB } = envFromLocals(astro.locals);
  let error: string | undefined;
  if (astro.request.method === "POST") {
    try {
      const form = await formOf(astro);
      if (text(form, "intent", 30, true) !== "create") throw new HrmError("invalid_action");
      const declarationId = await saveCoiDraft(
        DB,
        user,
        text(form, "request_key", 100, true),
        null,
        0,
        answersFrom(form),
        text(form, "supersedes_id", 100) || null,
      );
      return redirect(astro, `${lang === "vi" ? "/vi" : ""}/hrm/me/coi/${encodeURIComponent(declarationId)}`, "draft_saved");
    } catch (cause) {
      error = cause instanceof HrmError ? cause.message : "internal_error";
      if (import.meta.env.DEV) console.error("[hrm] COI declaration create failed:", error);
      if (cause instanceof HrmError) astro.response.status = cause.status;
    }
  }
  return {
    ...base(lang, user, lang === "vi" ? "Khai báo xung đột lợi ích" : "Conflict-of-interest declarations"),
    declarations: await listMyCoiDeclarations(DB, user),
    saved: astro.url.searchParams.get("saved") ?? "",
    error,
    requestKey: crypto.randomUUID(),
  };
}

export interface CoiDetailPage extends PageBase {
  declaration: CoiDeclaration & { person: Awaited<ReturnType<typeof getCoiDeclaration>>["person"] };
  files: LegalCoiFile[];
  reviewers: MemberRow[];
  ownerView: boolean;
  canReview: boolean;
  canAssign: boolean;
  saved: string;
  requestKey: string;
  error?: string;
}

export async function myCoiDetailPage(astro: AstroGlobal, lang: Lang, declarationId: string): Promise<Response | CoiDetailPage> {
  const user = liveUser(astro);
  if (!user.can("hrm.coi.self")) return new Response("Forbidden", { status: 403 });
  const { DB } = envFromLocals(astro.locals);
  const declaration = await getCoiDeclaration(DB, user, declarationId);
  if (declaration.person.user_id !== user.id) return new Response("Not found", { status: 404 });
  let error: string | undefined;
  if (astro.request.method === "POST") {
    try {
      const form = await formOf(astro), intent = text(form, "intent", 30, true), key = text(form, "request_key", 100, true);
      if (intent === "save_draft") {
        await saveCoiDraft(DB, user, key, declarationId, revision(form), answersFrom(form));
        return redirect(astro, `${lang === "vi" ? "/vi" : ""}/hrm/me/coi/${encodeURIComponent(declarationId)}`, "draft_saved");
      }
      if (intent === "submit") {
        await submitCoiDeclaration(DB, user, key, declarationId, revision(form));
        return redirect(astro, `${lang === "vi" ? "/vi" : ""}/hrm/me/coi/${encodeURIComponent(declarationId)}`, "submitted");
      }
      if (intent === "amend") {
        if (declaration.state !== "clarification_needed") throw new HrmError("invalid_transition", 409);
        const amendedId = await saveCoiDraft(DB, user, key, null, 0, answersFrom(form), declarationId);
        return redirect(astro, `${lang === "vi" ? "/vi" : ""}/hrm/me/coi/${encodeURIComponent(amendedId)}`, "draft_saved");
      }
      throw new HrmError("invalid_action");
    } catch (cause) {
      error = cause instanceof HrmError ? cause.message : "internal_error";
      if (import.meta.env.DEV) console.error("[hrm] COI detail mutation failed:", error, cause instanceof Error ? cause.message.slice(0, 160) : "");
      if (cause instanceof HrmError) astro.response.status = cause.status;
    }
  }
  return {
    ...base(lang, user, lang === "vi" ? "Khai báo COI" : "COI declaration"),
    declaration,
    files: await listCoiEvidence(DB, user, declarationId),
    reviewers: [],
    ownerView: true,
    canReview: false,
    canAssign: false,
    saved: astro.url.searchParams.get("saved") ?? "",
    requestKey: crypto.randomUUID(),
    error,
  };
}

export interface CoiQueuePage extends PageBase {
  declarations: CoiListItem[];
}

export async function coiQueuePage(astro: AstroGlobal, lang: Lang): Promise<Response | CoiQueuePage> {
  const user = liveUser(astro);
  if (!user.can("hrm.coi.review") && !user.can("hrm.configure")) return new Response("Forbidden", { status: 403 });
  const { DB } = envFromLocals(astro.locals);
  return {
    ...base(lang, user, lang === "vi" ? "Hàng chờ rà soát COI" : "COI review queue"),
    declarations: await listCoiReviewQueue(DB, user),
  };
}

export async function coiReviewDetailPage(astro: AstroGlobal, lang: Lang, declarationId: string): Promise<Response | CoiDetailPage> {
  const user = liveUser(astro);
  if (!user.can("hrm.coi.review") && !user.can("hrm.configure")) return new Response("Forbidden", { status: 403 });
  const env = envFromLocals(astro.locals);
  let error: string | undefined;
  let declaration = await getCoiDeclaration(env.DB, user, declarationId);
  if (astro.request.method === "POST") {
    try {
      const form = await formOf(astro), intent = text(form, "intent", 30, true), key = text(form, "request_key", 100, true), version = revision(form);
      if (intent === "assign") {
        const reviewerId = text(form, "reviewer_id", 100) || null;
        await assignCoiReviewer(env.DB, env.CONTENT_DB, user, key, declarationId, version, reviewerId);
        return redirect(astro, `${lang === "vi" ? "/vi" : ""}/hrm/coi/${encodeURIComponent(declarationId)}`, "assigned");
      }
      if (intent === "start_review") {
        await startCoiReview(env.DB, user, key, declarationId, version);
        return redirect(astro, `${lang === "vi" ? "/vi" : ""}/hrm/coi/${encodeURIComponent(declarationId)}`, "review_started");
      }
      if (intent === "review") {
        const value = text(form, "decision", 30, true);
        if (!["clarification_needed", "cleared", "mitigation_required", "escalated", "closed"].includes(value)) throw new HrmError("invalid_decision");
        await reviewCoiDeclaration(env.DB, user, key, declarationId, version, value as "clarification_needed" | "cleared" | "mitigation_required" | "escalated" | "closed", text(form, "reason", 1000, true), text(form, "mitigation", 2000), date(text(form, "followup_due", 10)));
        return redirect(astro, `${lang === "vi" ? "/vi" : ""}/hrm/coi/${encodeURIComponent(declarationId)}`, "review_saved");
      }
      throw new HrmError("invalid_action");
    } catch (cause) {
      error = cause instanceof HrmError ? cause.message : "internal_error";
      if (!(cause instanceof HrmError) && import.meta.env.DEV) console.error("[hrm] COI workflow mutation failed:", cause instanceof Error ? cause.message.slice(0, 180) : "unknown");
      if (cause instanceof HrmError) astro.response.status = cause.status;
      declaration = await getCoiDeclaration(env.DB, user, declarationId);
    }
  }
  const reviewers = user.can("hrm.configure") ? await listCoiReviewers(env.DB, env.CONTENT_DB, user) : [];
  return {
    ...base(lang, user, lang === "vi" ? "Rà soát khai báo COI" : "Review COI declaration"),
    declaration,
    files: await listCoiEvidence(env.DB, user, declarationId),
    reviewers,
    ownerView: false,
    canReview: user.can("hrm.coi.review") && (user.can("hrm.configure") || declaration.assigned_reviewer_id === user.id),
    canAssign: user.can("hrm.configure"),
    saved: astro.url.searchParams.get("saved") ?? "",
    requestKey: crypto.randomUUID(),
    error,
  };
}
