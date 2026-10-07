// Cohort and contribution reporting. Pure functions compute from rows so the
// arithmetic is testable with synthetic fixtures; the loader only gathers rows.
// Nothing here changes prices, headcount or campaigns when a gate is met.
import { type LedgerEntry, addDays, effectiveEntries, paymentState, summarizeLedger, vnDate } from "./money";
import type { Milestone, PlaybookDef } from "./playbook";

export const acquisitionCategories = ["research", "preview", "travel", "sales", "ads"] as const;
export const deliveryCategories = ["delivery", "support", "domain", "hosting", "printing", "generation", "payment_fee", "other"] as const;

export interface CohortOpp { id: string; account_id: string; relation: string; outcome: string; fields: Record<string, string>; offer_key: string | null }
export interface CohortTask { opportunity_id: string; kind: string; meeting_confirmed: number; outcome: string }
export interface CohortCost { opportunity_id: string | null; account_id: string | null; category: string; basis: string; minutes: number | null; amount_vnd: number | null }
export interface GatePolicy {
  cohort_size: number;
  continue: { min_paid_businesses: number; min_paid_starters: number; max_avg_preview_minutes: number; manual_google_management_allowed: boolean };
  scale: { max_cac_vnd: number; max_median_fulfillment_minutes: number; max_p90_fulfillment_minutes: number; requires_positive_contribution: boolean; unknown_costs_fail: boolean };
  review_trigger: { zero_starters_after_owner_conversations: number };
  credit_window_days: number;
}
export interface CohortInput {
  opportunities: CohortOpp[];
  milestones: { account_id: string; milestone: Milestone }[];
  tasks: CohortTask[];
  ledger: LedgerEntry[];
  costs: CohortCost[];
  costingComplete: boolean;
  policy: GatePolicy;
  starterKey: string; trustKey: string;
  today: string; startsOn: string; endsOn: string | null;
}
export type Criterion = "met" | "not_met" | "unknown";

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
/** Nearest-rank percentile. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

export function computeCohort(input: CohortInput) {
  const accounts = new Set(input.opportunities.map((opp) => opp.account_id));
  const reached = (milestone: Milestone) => new Set(input.milestones.filter((row) => row.milestone === milestone && accounts.has(row.account_id)).map((row) => row.account_id));
  const conversations = reached("conversation");
  const previews = reached("preview_shown");
  const qualified = reached("qualified");

  const ledgerByOpp = new Map<string, LedgerEntry[]>();
  for (const entry of input.ledger) ledgerByOpp.set(entry.opportunity_id, [...(ledgerByOpp.get(entry.opportunity_id) ?? []), entry]);
  const paidAccounts = (offerKey: string) => new Set(input.opportunities
    .filter((opp) => opp.offer_key === offerKey && ["paid", "overpaid"].includes(paymentState(summarizeLedger(ledgerByOpp.get(opp.id) ?? []))))
    .map((opp) => opp.account_id));
  const starter = paidAccounts(input.starterKey);
  const trust = paidAccounts(input.trustKey);
  // An upgrading business counts once as a Starter.
  const trustOnly = [...trust].filter((id) => !starter.has(id));
  const upgrades = [...starter].filter((id) => trust.has(id));
  const direct = [...starter].filter((id) => !trust.has(id));
  const paid = new Set([...starter, ...trust]);

  const totals = summarizeLedger(input.ledger);
  const meetingTasks = input.tasks.filter((task) => task.kind === "meeting" || task.kind === "demo");
  const live = effectiveEntries(input.ledger);
  // Trust-only buyers whose credit window is still open: their upgrade outcome is not final.
  const openCredit = trustOnly.filter((accountId) => live.some((entry) => entry.kind === "payment" && entry.status === "confirmed"
    && input.opportunities.some((opp) => opp.id === entry.opportunity_id && opp.account_id === accountId && opp.offer_key === input.trustKey)
    && addDays(entry.occurred_on, input.policy.credit_window_days) >= input.today)).length;

  const minutesBy = (categories: readonly string[], filter: (cost: CohortCost) => boolean = () => true) => input.costs.filter((cost) => categories.includes(cost.category) && cost.basis === "actual" && filter(cost)).reduce((sum, cost) => sum + (cost.minutes ?? 0), 0);
  const amountBy = (categories: readonly string[], basis = "actual") => input.costs.filter((cost) => categories.includes(cost.category) && cost.basis === basis).reduce((sum, cost) => sum + (cost.amount_vnd ?? 0), 0);
  const uncostedLabour = input.costs.some((cost) => cost.basis === "actual" && cost.minutes !== null && cost.amount_vnd === null);

  const previewMinutes = [...previews].map((accountId) => input.costs.filter((cost) => cost.category === "preview" && cost.basis === "actual" && cost.account_id === accountId).reduce((sum, cost) => sum + (cost.minutes ?? 0), 0));
  const previewsWithTime = previewMinutes.filter((value) => value > 0);
  const avgPreview = previewsWithTime.length === previews.size && previews.size > 0 ? previewMinutes.reduce((a, b) => a + b, 0) / previews.size : null;

  const starterOpps = input.opportunities.filter((opp) => opp.offer_key === input.starterKey && starter.has(opp.account_id));
  const fulfillment = starterOpps.map((opp) => input.costs.filter((cost) => cost.opportunity_id === opp.id && cost.category === "delivery" && cost.basis === "actual").reduce((sum, cost) => sum + (cost.minutes ?? 0), 0)).filter((value) => value > 0);

  const costingKnown = input.costingComplete && !uncostedLabour;
  const acquisitionCost = amountBy(acquisitionCategories);
  const deliveryCost = amountBy(deliveryCategories);
  const contribution = costingKnown ? totals.net - acquisitionCost - deliveryCost : null;
  const reserve = amountBy(deliveryCategories, "estimate");
  const cac = costingKnown && starter.size > 0 ? Math.round(acquisitionCost / starter.size) : null;
  const googleNeeded = input.opportunities.some((opp) => opp.fields.google_management_needed === "yes");

  const policy = input.policy;
  const complete = accounts.size >= policy.cohort_size;
  const continueGate: Record<string, Criterion> = {
    paid_businesses: paid.size >= policy.continue.min_paid_businesses ? "met" : complete ? "not_met" : "unknown",
    paid_starters: starter.size >= policy.continue.min_paid_starters ? "met" : complete ? "not_met" : "unknown",
    avg_preview_minutes: avgPreview === null ? "unknown" : avgPreview <= policy.continue.max_avg_preview_minutes ? "met" : "not_met",
    google_management: googleNeeded && !policy.continue.manual_google_management_allowed ? "not_met" : complete ? "met" : "unknown",
  };
  const fulfillmentMedian = median(fulfillment);
  const fulfillmentP90 = percentile(fulfillment, 90);
  const scaleGate: Record<string, Criterion> = {
    cac: cac === null ? (policy.scale.unknown_costs_fail && starter.size > 0 ? "not_met" : "unknown") : cac <= policy.scale.max_cac_vnd ? "met" : "not_met",
    median_fulfillment: fulfillmentMedian === null ? "unknown" : fulfillmentMedian <= policy.scale.max_median_fulfillment_minutes ? "met" : "not_met",
    p90_fulfillment: fulfillmentP90 === null ? "unknown" : fulfillmentP90 <= policy.scale.max_p90_fulfillment_minutes ? "met" : "not_met",
    contribution: contribution === null ? (policy.scale.unknown_costs_fail ? "not_met" : "unknown") : contribution - reserve > 0 ? "met" : "not_met",
  };

  return {
    sample: accounts.size, target: policy.cohort_size, complete,
    window: { starts_on: input.startsOn, ends_on: input.endsOn ?? input.today, open_credit_windows: openCredit },
    funnel: { unique_businesses: accounts.size, qualified: qualified.size, owner_conversations: conversations.size, previews_shown: previews.size },
    paid: { businesses: paid.size, starters: starter.size, starter_direct: direct.length, upgrades: upgrades.length, trust_only: trustOnly.length },
    meetings: { confirmed: meetingTasks.filter((task) => task.meeting_confirmed === 1).length, held: meetingTasks.filter((task) => task.outcome === "held").length, no_show: meetingTasks.filter((task) => task.outcome === "no_show").length },
    conversion: { starters_per_100_conversations: conversations.size ? (starter.size / conversations.size) * 100 : null, numerator: starter.size, denominator: conversations.size },
    money: { collected: totals.collected, refunded: totals.refunded, net: totals.net, credit: totals.credit },
    labour: {
      research: minutesBy(["research"]), preview: minutesBy(["preview"]), travel: minutesBy(["travel"]), sales: minutesBy(["sales"]),
      delivery: minutesBy(["delivery"]), support: minutesBy(["support"]),
      avg_preview_minutes: avgPreview, previews_timed: previewsWithTime.length,
    },
    costs: { acquisition: acquisitionCost, delivery: deliveryCost, support_reserve_estimate: reserve, costing_known: costingKnown, uncosted_labour: uncostedLabour },
    contribution: { realised: contribution, after_reserve: contribution === null ? null : contribution - reserve, per_conversation: contribution === null || !conversations.size ? null : Math.round(contribution / conversations.size) },
    cac,
    fulfillment_minutes: { median: fulfillmentMedian, p90: fulfillmentP90, sample: fulfillment.length },
    google_management_needed: googleNeeded,
    gates: { continue: continueGate, scale: scaleGate },
    review_trigger: conversations.size >= policy.review_trigger.zero_starters_after_owner_conversations && starter.size === 0,
  };
}
export type CohortReport = ReturnType<typeof computeCohort>;

/**
 * Accounts that reached each milestone. Entering a stage implies every earlier
 * non-skippable milestone was passed; a skippable milestone (e.g. preview)
 * counts only when its own stage was entered. Lost/paused moves imply nothing.
 */
export function milestoneRows(history: { account_id: string; to_stage: string; playbook_id: string }[], defs: Map<string, PlaybookDef>): { account_id: string; milestone: Milestone }[] {
  const rows: { account_id: string; milestone: Milestone }[] = [];
  for (const row of history) {
    const def = defs.get(row.playbook_id);
    const index = def ? def.stages.findIndex((stage) => stage.id === row.to_stage) : -1;
    if (!def || index < 0 || ["lost", "paused"].includes(def.stages[index].outcome)) continue;
    for (const stage of def.stages.slice(0, index + 1)) {
      if (stage.milestone && stage.outcome === "open" && (stage.id === row.to_stage || !stage.skippable)) rows.push({ account_id: row.account_id, milestone: stage.milestone });
    }
  }
  return rows;
}

export interface CohortRow { cohort_key: string; name: string; playbook_key: string; starts_on: string; ends_on: string | null; target_size: number | null; policy_id: string | null; costing_complete: number; costing_note: string }

export async function loadCohort(db: D1Database, cohortKey: string, { starterKey = "local-starter", trustKey = "local-trust-kit" } = {}): Promise<{ cohort: CohortRow; report: CohortReport; policySource: string } | null> {
  const cohort = await db.prepare("SELECT * FROM crm_cohorts WHERE cohort_key = ?").bind(cohortKey).first<CohortRow>();
  if (!cohort) return null;
  const policyRow = await db.prepare(cohort.policy_id ? "SELECT body, source_ref FROM crm_policies WHERE id = ?" : "SELECT body, source_ref FROM crm_policies WHERE policy_key = 'local-cohort-gate' ORDER BY version DESC LIMIT 1")
    .bind(...(cohort.policy_id ? [cohort.policy_id] : [])).first<{ body: string; source_ref: string }>();
  const policy = JSON.parse(policyRow?.body ?? "{}") as GatePolicy;
  if (cohort.target_size) policy.cohort_size = cohort.target_size;
  // Upgrades and renewals created from cohort opportunities belong to the cohort.
  const opps = (await db.prepare(
    `SELECT o.id, o.account_id, o.relation, o.outcome, o.fields, o.playbook_id,
      (SELECT f.offer_key FROM crm_quotes q JOIN crm_offers f ON f.id = q.offer_id WHERE q.opportunity_id = o.id AND q.status = 'accepted' ORDER BY q.accepted_on DESC LIMIT 1) AS offer_key
     FROM crm_opportunities o WHERE o.cohort_key = ? OR o.parent_id IN (SELECT id FROM crm_opportunities WHERE cohort_key = ?)`,
  ).bind(cohortKey, cohortKey).all<{ id: string; account_id: string; relation: string; outcome: string; fields: string; playbook_id: string; offer_key: string | null }>()).results;
  const ids = opps.map((opp) => opp.id);
  const inList = (column: string) => ids.length ? `${column} IN (SELECT id FROM crm_opportunities WHERE cohort_key = ? OR parent_id IN (SELECT id FROM crm_opportunities WHERE cohort_key = ?))` : "0";
  const args = ids.length ? [cohortKey, cohortKey] : [];
  const history = (await db.prepare(`SELECT h.opportunity_id, o.account_id, h.to_stage, h.playbook_id FROM crm_stage_history h JOIN crm_opportunities o ON o.id = h.opportunity_id WHERE ${inList("h.opportunity_id")}`).bind(...args).all<{ opportunity_id: string; account_id: string; to_stage: string; playbook_id: string }>()).results;
  const playbookIds = [...new Set(history.map((row) => row.playbook_id))];
  const defs = new Map<string, PlaybookDef>();
  if (playbookIds.length) for (const row of (await db.prepare(`SELECT id, definition FROM crm_playbooks WHERE id IN (${playbookIds.map(() => "?").join(", ")})`).bind(...playbookIds).all<{ id: string; definition: string }>()).results) defs.set(row.id, JSON.parse(row.definition));
  const tasks = (await db.prepare(`SELECT opportunity_id, kind, meeting_confirmed, outcome FROM crm_tasks WHERE ${inList("opportunity_id")}`).bind(...args).all<CohortTask>()).results;
  const ledger = (await db.prepare(`SELECT * FROM crm_ledger WHERE ${inList("opportunity_id")}`).bind(...args).all<LedgerEntry>()).results;
  const costs = (await db.prepare(`SELECT c.opportunity_id, o.account_id, c.category, c.basis, c.minutes, c.amount_vnd FROM crm_costs c LEFT JOIN crm_opportunities o ON o.id = c.opportunity_id WHERE (c.opportunity_id IS NULL AND c.cohort_key = ?) OR ${inList("c.opportunity_id")}`).bind(cohortKey, ...args).all<CohortCost>()).results;
  const report = computeCohort({
    opportunities: opps.map((opp) => ({ ...opp, fields: JSON.parse(opp.fields || "{}") })),
    milestones: milestoneRows(history, defs), tasks, ledger, costs, costingComplete: cohort.costing_complete === 1, policy,
    starterKey, trustKey, today: vnDate(), startsOn: cohort.starts_on, endsOn: cohort.ends_on,
  });
  return { cohort, report, policySource: policyRow?.source_ref ?? "" };
}
