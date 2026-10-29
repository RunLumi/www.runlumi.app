// Referrals: a partner (or any seller) passes a business to the Lumi team.
// It starts as an unassigned lead, with the referrer recorded for
// attribution. Referrers follow the status only; once assigned, the deal's
// notes, contacts and money stay with its owner.
import type { CrmActor } from "./access";
import { latestPlaybooks } from "./config";
import { Errors, ForbiddenError, emailPattern, fail, newId, normalizePhone, once } from "./core";
import { referralLeadStatements } from "./leads";
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

  const id = newId("lead");
  const evidence = `Referred by ${actor.name}, who confirmed on ${vnDate()} that the business agreed to be contacted by Lumi.`;
  // Unassigned lead: a Sales Manager assigns it; the referrer keeps referral
  // attribution, which conversion copies onto the opportunity.
  await once(db, actor, requestKey(form), "referral", id, await referralLeadStatements(db, actor, id, {
    business, industry, region, contactName, phone, phoneNorm, email, need, playbookKey: playbook!.playbook_key, evidence,
  }));
  return id;
}

export interface MyReferral {
  id: string; title: string; created_at: string; assigned: number;
  /** "lead" while the team qualifies it; "opportunity" once converted (or for referrals made before leads existed). */
  kind: "lead" | "opportunity";
  stage_id: string; outcome: string; playbook_id: string;
  lead_state: "" | "open" | "disqualified"; lead_status_id: string; lead_process_id: string;
}

/**
 * What a referrer may see: name, date, whether someone took it, the lead
 * status and then the opportunity stage and outcome. Never notes, contacts or money.
 */
export async function myReferrals(db: D1Database, actorId: string): Promise<MyReferral[]> {
  return (await db.prepare(
    `SELECT o.id, a.name AS title, o.created_at, CASE WHEN o.owner_id IS NULL THEN 0 ELSE 1 END AS assigned, 'opportunity' AS kind, o.stage_id, o.outcome, o.playbook_id,
        '' AS lead_state, '' AS lead_status_id, '' AS lead_process_id
      FROM crm_opportunities o JOIN crm_accounts a ON a.id = o.account_id WHERE o.referrer_id = ?
     UNION ALL
     SELECT l.id, l.company AS title, l.created_at, CASE WHEN l.owner_id IS NULL THEN 0 ELSE 1 END AS assigned, 'lead' AS kind, '' AS stage_id, '' AS outcome, '' AS playbook_id,
        l.state AS lead_state, l.status_id AS lead_status_id, l.process_id AS lead_process_id
      FROM crm_lead_records l WHERE l.referrer_id = ? AND l.state != 'converted'
     ORDER BY created_at DESC LIMIT 200`,
  ).bind(actorId, actorId).all<MyReferral>()).results;
}

export interface QueuedReferral { id: string; title: string; referrer_id: string | null; created_at: string; version: number; next_action: string }

export async function unassignedReferrals(db: D1Database): Promise<QueuedReferral[]> {
  return (await db.prepare(
    "SELECT o.id, o.title, o.referrer_id, o.created_at, o.version, o.next_action FROM crm_opportunities o WHERE o.owner_id IS NULL AND o.source_channel = 'referral' AND o.outcome = 'open' ORDER BY o.created_at LIMIT 100",
  ).all<QueuedReferral>()).results;
}
