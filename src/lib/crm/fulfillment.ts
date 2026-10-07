// Seller → fulfillment handoff and delivery tracking. The CRM records and
// coordinates; it never buys domains, publishes sites or messages customers.
import type { CrmActor } from "./access";
import { hasRole } from "../workspace/members";
import { parseSnapshot, type Quote } from "./commercial";
import { ConflictError, Errors, ForbiddenError, eventStatement, fail, newId, nowIso, once, onceGuarded } from "./core";
import { isIsoDate, type Playbook } from "./playbook";
import type { Opportunity } from "./records";

export type FulfillmentKind = "local_site" | "renewal_activation" | "solution_delivery";
export const fulfillmentStatuses: Record<FulfillmentKind, readonly string[]> = {
  local_site: ["waiting_info", "in_progress", "awaiting_owner", "ready_to_publish", "live", "accepted"],
  renewal_activation: ["pending", "active"],
  solution_delivery: ["waiting_info", "in_progress", "delivered", "accepted"],
};
export const siteChecks = ["call", "zalo", "maps", "form", "qr", "https", "mobile"] as const;
export const handoffKeys = [
  "confirmed_content", "assets_permitted", "domain_choice", "domain_name", "domain_ownership", "domain_cost", "revision_terms",
  "delivery_date", "cancellation_terms", "enquiry_destination", "response_owner", "missing_info", "next_appointment",
] as const;
export type Handoff = Partial<Record<typeof handoffKeys[number], string>> & { quote_id?: string; scope?: string; from_owner?: string };

export interface Fulfillment {
  id: string; opportunity_id: string; kind: FulfillmentKind; status: string; blocked: number; blocked_reason: string;
  handoff: string; checks: string; owner_approval: string | null; acceptance: string | null; assignee_id: string | null;
  version: number; created_at: string; updated_at: string;
}

function requestKey(form: FormData): string {
  return typeof form.get("request_key") === "string" ? String(form.get("request_key")) : "";
}

export function kindFor(playbook: Playbook): FulfillmentKind | null {
  if (playbook.kind === "acquisition") return "local_site";
  if (playbook.kind === "renewal") return "renewal_activation";
  if (playbook.kind === "solution") return "solution_delivery";
  return null;
}

export async function getFulfillment(db: D1Database, opportunityId: string): Promise<Fulfillment | null> {
  return db.prepare("SELECT * FROM crm_fulfillments WHERE opportunity_id = ?").bind(opportunityId).first<Fulfillment>();
}

function readHandoff(form: FormData, errors: Errors): Handoff {
  const values: Handoff = {};
  for (const key of handoffKeys) {
    const value = errors.text(form, `handoff.${key}`, key.endsWith("_date") || key === "next_appointment" ? 16 : 1000);
    if (value) values[key] = value;
  }
  if (values.delivery_date && !isIsoDate(values.delivery_date)) errors.add("handoff.delivery_date", "invalid");
  if (values.domain_choice && !["subdomain", "custom", "undecided"].includes(values.domain_choice)) errors.add("handoff.domain_choice", "invalid");
  return values;
}

/** The seller hands over an accepted scope; scope text comes from the quote snapshot, not free entry. */
export async function createHandoff(db: D1Database, actor: CrmActor, opportunity: Opportunity, playbook: Playbook, quotes: Quote[], form: FormData): Promise<void> {
  const kind = kindFor(playbook);
  if (!kind) fail("handoff", "not_supported");
  const accepted = quotes.find((quote) => quote.status === "accepted");
  if (!accepted) fail("handoff", "accepted_quote_required");
  const errors = new Errors();
  const handoff = readHandoff(form, errors);
  if (kind === "local_site") {
    for (const key of ["confirmed_content", "assets_permitted", "domain_choice", "revision_terms", "delivery_date", "enquiry_destination", "response_owner"] as const) if (!handoff[key]) errors.add(`handoff.${key}`, "required");
  }
  errors.throwIfAny();
  const snapshot = parseSnapshot(accepted!);
  const scope = snapshot ? `${snapshot.offer.name_en} v${snapshot.offer.version}: ${snapshot.offer.scope_en}` : accepted!.offer_id;
  const full: Handoff = { ...handoff, quote_id: accepted!.id, scope, from_owner: opportunity.owner_id ?? actor.id };
  const id = newId("ful");
  const now = nowIso();
  await once(db, actor, requestKey(form), "handoff", id, [
    db.prepare("INSERT INTO crm_fulfillments (id, opportunity_id, kind, status, handoff, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, opportunity.id, kind, fulfillmentStatuses[kind!][0], JSON.stringify(full), actor.id, now, now),
    eventStatement(db, actor, "handoff_created", { fulfillment_id: id, kind, quote_id: accepted!.id }, { opportunityId: opportunity.id, accountId: opportunity.account_id }),
  ]);
}

/** Sellers may complete missing handoff details while information is still being gathered. */
export async function updateHandoff(db: D1Database, actor: CrmActor, opportunity: Opportunity, fulfillment: Fulfillment, form: FormData): Promise<void> {
  const ownerEdit = actor.manager || opportunity.owner_id === actor.id;
  if (!actor.fulfillment && !(ownerEdit && ["waiting_info", "pending"].includes(fulfillment.status))) throw new ForbiddenError();
  const version = Number(form.get("version"));
  const errors = new Errors();
  const values = readHandoff(form, errors);
  errors.throwIfAny();
  const current = JSON.parse(fulfillment.handoff) as Handoff;
  const next: Handoff = { quote_id: current.quote_id, scope: current.scope, from_owner: current.from_owner, ...values };
  await guardedFulfillment(db, actor, opportunity, fulfillment, version, form, "handoff_updated", { changed: handoffKeys.filter((key) => current[key] !== next[key]) },
    db.prepare("UPDATE crm_fulfillments SET handoff = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?").bind(JSON.stringify(next), nowIso(), fulfillment.id, version));
}

async function guardedFulfillment(db: D1Database, actor: CrmActor, opportunity: Opportunity, fulfillment: Fulfillment, version: number, form: FormData, kind: string, body: Record<string, unknown>, update: D1PreparedStatement): Promise<void> {
  if (!Number.isSafeInteger(version) || version < 1) fail("version", "invalid");
  const guard = { sql: "EXISTS (SELECT 1 FROM crm_fulfillments WHERE id = ? AND version = ?)", args: [fulfillment.id, version] };
  const result = await onceGuarded(db, actor, requestKey(form), kind, fulfillment.id, guard, [
    eventStatement(db, actor, kind, { fulfillment_id: fulfillment.id, ...body }, { opportunityId: opportunity.id, accountId: opportunity.account_id }, guard),
    update,
  ]);
  if (!result.changed) throw new ConflictError();
}

export function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

/** Fulfillment-only actions: status, blocking, launch checks, owner approval and acceptance. */
export async function fulfillmentAction(db: D1Database, actor: CrmActor, opportunity: Opportunity, fulfillment: Fulfillment, form: FormData): Promise<void> {
  if (!actor.fulfillment) throw new ForbiddenError();
  const version = Number(form.get("version"));
  const errors = new Errors();
  const action = errors.text(form, "fulfillment_action", 20, true);
  errors.throwIfAny();
  const now = nowIso();
  const statuses = fulfillmentStatuses[fulfillment.kind];
  const sql = (set: string, ...args: unknown[]) => db.prepare(`UPDATE crm_fulfillments SET ${set}, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`).bind(...args, now, fulfillment.id, version);
  if (action === "status") {
    const to = errors.text(form, "status", 30, true);
    errors.throwIfAny();
    if (!statuses.includes(to)) fail("status", "invalid");
    if (fulfillment.blocked) fail("status", "blocked");
    const approval = parseJson<{ approved_on?: string } | null>(fulfillment.owner_approval, null);
    const checks = parseJson<Record<string, string>>(fulfillment.checks, {});
    if (fulfillment.kind === "local_site" && statuses.indexOf(to) >= statuses.indexOf("ready_to_publish") && !approval?.approved_on) fail("status", "owner_approval_required");
    if (fulfillment.kind === "local_site" && statuses.indexOf(to) >= statuses.indexOf("live") && siteChecks.some((check) => !["pass", "na"].includes(checks[check] ?? ""))) fail("status", "checks_required");
    if (to === "accepted" && !parseJson(fulfillment.acceptance, null)) fail("status", "acceptance_required");
    return guardedFulfillment(db, actor, opportunity, fulfillment, version, form, "fulfillment_status", { from: fulfillment.status, to }, sql("status = ?", to));
  }
  if (action === "block") {
    const blocked = form.get("blocked") === "1";
    const reason = errors.text(form, "blocked_reason", 500, blocked);
    errors.throwIfAny();
    return guardedFulfillment(db, actor, opportunity, fulfillment, version, form, blocked ? "fulfillment_blocked" : "fulfillment_unblocked", { reason }, sql("blocked = ?, blocked_reason = ?", blocked ? 1 : 0, blocked ? reason : ""));
  }
  if (action === "checks") {
    const checks: Record<string, string> = {};
    for (const check of siteChecks) {
      const value = errors.text(form, `check.${check}`, 10);
      if (value && !["pass", "fail", "na"].includes(value)) errors.add(`check.${check}`, "invalid");
      if (value) checks[check] = value;
      const note = errors.text(form, `check_note.${check}`, 300);
      if (note) checks[`${check}_note`] = note;
    }
    errors.throwIfAny();
    return guardedFulfillment(db, actor, opportunity, fulfillment, version, form, "fulfillment_checks", { checks }, sql("checks = ?", JSON.stringify(checks)));
  }
  if (action === "owner_approval") {
    // Recorded by fulfillment from the owner's own confirmation, never by the seller.
    const approvedOn = errors.text(form, "approved_on", 10, true);
    const evidence = errors.text(form, "approval_evidence", 500, true);
    if (approvedOn && !isIsoDate(approvedOn)) errors.add("approved_on", "invalid");
    errors.throwIfAny();
    return guardedFulfillment(db, actor, opportunity, fulfillment, version, form, "owner_approval", { approved_on: approvedOn }, sql("owner_approval = ?", JSON.stringify({ approved_on: approvedOn, evidence, recorded_by: actor.id, recorded_at: now })));
  }
  if (action === "acceptance") {
    const acceptedOn = errors.text(form, "accepted_on", 10, true);
    const evidence = errors.text(form, "acceptance_evidence", 500, true);
    if (acceptedOn && !isIsoDate(acceptedOn)) errors.add("accepted_on", "invalid");
    errors.throwIfAny();
    return guardedFulfillment(db, actor, opportunity, fulfillment, version, form, "delivery_accepted", { accepted_on: acceptedOn }, sql("acceptance = ?", JSON.stringify({ accepted_on: acceptedOn, evidence, recorded_by: actor.id, recorded_at: now })));
  }
  if (action === "assign") {
    const assignee = errors.text(form, "assignee_id", 128, true);
    errors.throwIfAny();
    if (assignee !== actor.id && !await hasRole(db, assignee, ["fulfillment"])) fail("assignee_id", "invalid");
    return guardedFulfillment(db, actor, opportunity, fulfillment, version, form, "fulfillment_assigned", { to: assignee }, sql("assignee_id = ?", assignee));
  }
  fail("fulfillment_action", "invalid");
}

export interface QueueRow { id: string; opportunity_id: string; kind: FulfillmentKind; status: string; blocked: number; blocked_reason: string; title: string; account_name: string; owner_id: string | null; assignee_id: string | null; updated_at: string; delivery_date: string | null }
export async function fulfillmentQueue(db: D1Database, actor: CrmActor, { blockedOnly = false } = {}): Promise<QueueRow[]> {
  const scope = actor.fulfillment ? "1 = 1" : "o.owner_id = ?";
  return (await db.prepare(
    `SELECT f.id, f.opportunity_id, f.kind, f.status, f.blocked, f.blocked_reason, o.title, a.name AS account_name, o.owner_id, f.assignee_id, f.updated_at, json_extract(f.handoff, '$.delivery_date') AS delivery_date
     FROM crm_fulfillments f JOIN crm_opportunities o ON o.id = f.opportunity_id JOIN crm_accounts a ON a.id = o.account_id
     WHERE ${scope}${blockedOnly ? " AND f.blocked = 1" : ""} AND f.status NOT IN ('accepted', 'active') ORDER BY f.blocked DESC, delivery_date, f.updated_at LIMIT 200`,
  ).bind(...(actor.fulfillment ? [] : [actor.id])).all<QueueRow>()).results;
}
