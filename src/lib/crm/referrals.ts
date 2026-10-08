// Referrals: a partner (or any seller) passes a business to the Lumi team.
// The opportunity starts unassigned, with the referrer recorded for
// attribution. Referrers follow the status only; once assigned, the deal's
// notes, contacts and money stay with its owner.
import type { CrmActor } from "./access";
import { latestPlaybooks } from "./config";
import { Errors, ForbiddenError, emailPattern, eventStatement, fail, newId, normalizePhone, nowIso, once } from "./core";
import { vnDate } from "./money";
import { phoneSuppressed } from "./records";

export const REFERRAL_PLAYBOOK_KINDS = ["acquisition", "solution"] as const;

function requestKey(form: FormData): string {
  return typeof form.get("request_key") === "string" ? String(form.get("request_key")) : "";
}

export async function submitReferral(db: D1Database, actor: CrmActor, form: FormData): Promise<string> {
  if (!actor.refer) throw new ForbiddenError();
  const errors = new Errors();
  const business = errors.text(form, "business", 160, true);
  const industry = errors.text(form, "industry", 120);
  const region = errors.text(form, "region", 120);
  const contactName = errors.text(form, "contact_name", 160, true);
  const phone = errors.text(form, "phone", 40, true);
  const email = errors.text(form, "email", 254);
  const need = errors.text(form, "need", 1500, true);
  const playbookKey = errors.text(form, "playbook_key", 60, true);
  const phoneNorm = normalizePhone(phone);
  if (phone && (phoneNorm.length < 8 || phoneNorm.length > 15)) errors.add("phone", "invalid");
  if (email && !emailPattern.test(email)) errors.add("email", "invalid");
  if (form.get("consent") !== "1") errors.add("consent", "required");
  const playbook = (await latestPlaybooks(db, { activeOnly: true })).find((item) => item.playbook_key === playbookKey && (REFERRAL_PLAYBOOK_KINDS as readonly string[]).includes(item.kind));
  if (!playbook) errors.add("playbook_key", "invalid");
  errors.throwIfAny();
  if (await phoneSuppressed(db, phoneNorm)) fail("phone", "suppressed");

  const now = nowIso();
  const accountId = newId("acc");
  const contactId = newId("con");
  const id = newId("opp");
  const first = playbook!.def.stages[0].id;
  const fields = Object.fromEntries(Object.entries({ industry, location: region }).filter(([key, value]) => value && playbook!.def.fields.some((field) => field.key === key)));
  const evidence = `Referred by ${actor.name}, who confirmed on ${vnDate()} that the business agreed to be contacted by Lumi.`;
  await once(db, actor, requestKey(form), "referral", id, [
    db.prepare("INSERT INTO crm_accounts (id, name, industry, region, phone_norm, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(accountId, business, industry, region, phoneNorm, actor.id, now, now),
    db.prepare("INSERT INTO crm_contacts (id, account_id, name, role, email, phone, phone_norm, contact_basis, preferred_channel, consent_status, consent_evidence, created_by, created_at, updated_at) VALUES (?, ?, ?, 'owner', ?, ?, ?, ?, 'phone', 'granted', ?, ?, ?, ?)")
      .bind(contactId, accountId, contactName, email, phone, phoneNorm, `Introduced by ${actor.name}`, evidence, actor.id, now, now),
    // Unassigned: a Sales Manager assigns it. seller_id stays empty until then;
    // the referrer keeps referral attribution whoever sells it.
    db.prepare(`INSERT INTO crm_opportunities (id, account_id, primary_contact_id, title, playbook_id, stage_id, outcome, owner_id, seller_id, referrer_id, created_by, source_channel, source_detail, relation, fields, next_action, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'open', NULL, NULL, ?, ?, 'referral', ?, 'new', ?, ?, ?, ?)`)
      .bind(id, accountId, contactId, business, playbook!.id, first, actor.id, actor.id, `Referred by ${actor.name}`, JSON.stringify(fields), `Contact the referred business. Need: ${need.slice(0, 400)}`, now, now),
    db.prepare("INSERT INTO crm_stage_history (id, opportunity_id, playbook_id, from_stage, to_stage, reason, actor_id, created_at) VALUES (?, ?, ?, NULL, ?, 'referral', ?, ?)")
      .bind(newId("stg"), id, playbook!.id, first, actor.id, now),
    eventStatement(db, actor, "referred", { referrer_id: actor.id, need }, { opportunityId: id, accountId }),
  ]);
  return id;
}

export interface MyReferral { id: string; title: string; created_at: string; stage_id: string; outcome: string; playbook_id: string; assigned: number }

/** What a referrer may see: name, date, stage, outcome and whether someone took it. */
export async function myReferrals(db: D1Database, actorId: string): Promise<MyReferral[]> {
  return (await db.prepare(
    "SELECT o.id, a.name AS title, o.created_at, o.stage_id, o.outcome, o.playbook_id, CASE WHEN o.owner_id IS NULL THEN 0 ELSE 1 END AS assigned FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id WHERE o.referrer_id = ? ORDER BY o.created_at DESC LIMIT 200",
  ).bind(actorId).all<MyReferral>()).results;
}

export interface QueuedReferral { id: string; title: string; referrer_id: string | null; created_at: string; version: number; next_action: string }

export async function unassignedReferrals(db: D1Database): Promise<QueuedReferral[]> {
  return (await db.prepare(
    "SELECT o.id, o.title, o.referrer_id, o.created_at, o.version, o.next_action FROM crm_opportunities o WHERE o.owner_id IS NULL AND o.source_channel = 'referral' AND o.outcome = 'open' ORDER BY o.created_at LIMIT 100",
  ).all<QueuedReferral>()).results;
}
