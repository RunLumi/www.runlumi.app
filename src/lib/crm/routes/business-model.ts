import type { AstroGlobal } from "astro";
import { type BusinessEvidence, loadEvidence } from "../business-evidence";
import { type Canvas, canvasFor } from "../business-model";
import { type Offer, latestOffers, latestPlaybooks } from "../config";
import type { Lang } from "../i18n";
import { type Ctx, context, forbidden } from "../page";

export interface BusinessModelProps {
  ctx: Ctx; canvas: Canvas; evidence: BusinessEvidence;
  /** Current offer versions this business model sells, read from CRM configuration. */
  offers: Offer[];
  generatedAt: string;
}

export async function businessModelRoute(astro: AstroGlobal, lang: Lang): Promise<BusinessModelProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  // Owner decision 2026-10-18: only the Sales Manager and System Super Admin
  // may read the business model; Finance and sellers may not.
  if (!ctx.actor.manager) return forbidden(lang);
  const canvas = canvasFor(astro.url.searchParams.get("model"));
  const [evidence, offers, playbooks] = await Promise.all([loadEvidence(ctx.db), latestOffers(ctx.db), latestPlaybooks(ctx.db)]);
  const sold = new Set(playbooks.filter((playbook) => canvas.playbooks.includes(playbook.playbook_key)).flatMap((playbook) => playbook.def.offers));
  return { ctx, canvas, evidence, offers: offers.filter((offer) => sold.has(offer.offer_key)), generatedAt: new Date().toISOString() };
}
