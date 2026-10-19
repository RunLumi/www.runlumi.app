// Commission handed to HRM payroll. CRM computes; Finance confirms one
// employee's earned lines for one month as an immutable handoff; HRM payroll
// may import that total once. CRM never pays, and HRM never sees customers,
// opportunities or ledger entries — only the total, month and line count.
import type { CrmActor } from "./access";
import type { CommissionLine } from "./commission";
import { type CommissionView, loadCommission, sellerTerms, typeResolver } from "./commission-store";
import { ConflictError, Errors, ForbiddenError, ValidationError, eventStatement, newId, nowIso, once, requestSeen } from "./core";
import { vnDate } from "./money";

export interface Handoff {
  id: string; user_id: string; period: string; amount_vnd: number; line_count: number; lines_digest: string;
  state: "confirmed" | "voided"; confirmed_by: string; confirmed_at: string;
  voided_by: string | null; voided_at: string | null; void_reason: string | null;
  /** Whether any payroll line references it (draft or issued); then it can no longer be voided. */
  in_payroll: number;
  /** Total of refund notices already recorded for it. */
  refunded_vnd: number;
}
/** Handed-off lines a later refund forfeited that no notice covers yet. */
export interface RefundExposure { handoff_id: string; amount_vnd: number; line_count: number; keys: string[] }

const periodPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
export const lineKey = (line: Pick<CommissionLine, "policy_id" | "opportunity_id" | "user_id" | "role" | "component">) =>
  [line.policy_id, line.opportunity_id, line.user_id, line.role, line.component].join("|");

/**
 * Lines a handoff may carry: the person's earned lines under an approved
 * policy that became eligible in the month and are not already in a live
 * handoff. Waiting, holdback, forfeited, unconfigured and simulated lines are
 * never payable.
 */
export function selectHandoffLines(lines: readonly CommissionLine[], userId: string, period: string, alreadyHandedOff: ReadonlySet<string>): CommissionLine[] {
  return lines.filter((line) => line.user_id === userId && !line.simulated && line.status === "earned" && line.amount > 0
    && !!line.eligible_on && line.eligible_on.slice(0, 7) === period && !alreadyHandedOff.has(lineKey(line)));
}

async function digest(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const requestKey = (form: FormData) => typeof form.get("request_key") === "string" ? String(form.get("request_key")) : "";

/** Finance confirms the handoff; the amount is computed, never typed. */
export async function confirmHandoff(db: D1Database, contentDb: D1Database, actor: CrmActor, form: FormData, view?: CommissionView): Promise<string> {
  if (!actor.finance) throw new ForbiddenError();
  const errors = new Errors();
  const userId = errors.text(form, "user_id", 128, true), period = errors.text(form, "period", 7, true);
  if (period && (!periodPattern.test(period) || period > vnDate().slice(0, 7))) errors.add("period", "invalid");
  errors.throwIfAny();
  if (userId === actor.id) throw new ForbiddenError();
  // A retry returns the first handoff; recomputing would find its lines taken.
  const seen = await requestSeen(db, requestKey(form), actor, "commission_handoff");
  if (seen) return seen.ref_id;
  const loaded = view ?? await loadCommission(db, contentDb, actor);
  if (!loaded.versions.some((item) => item.body.status === "approved")) throw new ValidationError({ policy: "not_approved" });
  // Payroll is for employees: the seller type in force at the end of the month must be "employee".
  const monthEnd = `${period}-31`;
  if (typeResolver(await sellerTerms(db), new Set())(userId, monthEnd) !== "employee") throw new ValidationError({ user_id: "not_employee" });
  const live = new Set((await db.prepare("SELECT line_key FROM crm_commission_handoff_lines WHERE active=1").all<{ line_key: string }>()).results.map((row) => row.line_key));
  const selected = selectHandoffLines(loaded.lines, userId, period, live);
  if (!selected.length) throw new ValidationError({ period: "nothing_earned" });
  const amount = selected.reduce((sum, line) => sum + line.amount, 0);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new ValidationError({ period: "invalid" });
  const id = newId("hof"), at = nowIso(), keys = selected.map(lineKey).sort();
  const statements = [
    db.prepare("INSERT INTO crm_commission_handoffs (id, user_id, period, amount_vnd, line_count, lines_digest, state, confirmed_by, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)")
      .bind(id, userId, period, amount, selected.length, await digest(keys.join("\n")), actor.id, at),
    ...selected.map((line) => db.prepare("INSERT INTO crm_commission_handoff_lines (handoff_id, line_key, opportunity_id, policy_id, role, component, amount_vnd, eligible_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, lineKey(line), line.opportunity_id, line.policy_id, line.role, line.component, line.amount, line.eligible_on)),
    eventStatement(db, actor, "commission_handoff", { handoff_id: id, user_id: userId, period, amount_vnd: amount, line_count: selected.length }, {}),
  ];
  try {
    return (await once(db, actor, requestKey(form), "commission_handoff", id, statements)).refId;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("crm_commission_period_paid_out")) throw new ValidationError({ period: "paid_out" });
    if (/UNIQUE constraint failed/.test(message)) throw new ConflictError();
    throw error;
  }
}

/** A handoff payroll has not used can be voided; its lines become available again. */
export async function voidHandoff(db: D1Database, actor: CrmActor, form: FormData): Promise<void> {
  if (!actor.finance) throw new ForbiddenError();
  const errors = new Errors();
  const id = errors.text(form, "handoff_id", 100, true), reason = errors.text(form, "reason", 500, true);
  errors.throwIfAny();
  const row = await db.prepare("SELECT state FROM crm_commission_handoffs WHERE id = ?").bind(id).first<{ state: string }>();
  if (!row) throw new ValidationError({ handoff_id: "not_found" });
  try {
    await once(db, actor, requestKey(form), "commission_handoff_void", id, [
      db.prepare("UPDATE crm_commission_handoffs SET state = 'voided', voided_by = ?, voided_at = ?, void_reason = ? WHERE id = ? AND state = 'confirmed'").bind(actor.id, nowIso(), reason, id),
      db.prepare("UPDATE crm_commission_handoff_lines SET active = 0 WHERE handoff_id = ? AND active = 1 AND EXISTS (SELECT 1 FROM crm_commission_handoffs WHERE id = ? AND state = 'voided')").bind(id, id),
      eventStatement(db, actor, "commission_handoff_void", { handoff_id: id }, {}),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("crm_commission_handoff_in_payroll")) throw new ValidationError({ handoff_id: "in_payroll" });
    throw error;
  }
}

export async function listHandoffs(db: D1Database, actor: CrmActor): Promise<Handoff[]> {
  if (!actor.finance && !actor.configure) return [];
  return (await db.prepare(`SELECT h.*, EXISTS (SELECT 1 FROM hrm_payroll_lines l WHERE l.source_kind = 'crm_commission' AND l.source_reference = h.id) AS in_payroll,
    COALESCE((SELECT SUM(n.amount_vnd) FROM crm_commission_refund_notices n WHERE n.handoff_id = h.id), 0) AS refunded_vnd
    FROM crm_commission_handoffs h ORDER BY h.period DESC, h.confirmed_at DESC LIMIT 200`).all<Handoff>()).results;
}

/**
 * Compare frozen handoff lines with today's computation: a line now forfeited
 * by a refund, on a confirmed handoff, that no refund notice covers yet.
 */
export function refundExposure(current: readonly CommissionLine[], frozen: readonly { handoff_id: string; line_key: string; amount_vnd: number }[], noticed: ReadonlySet<string>): RefundExposure[] {
  const forfeited = new Set(current.filter((line) => line.status === "forfeited").map(lineKey));
  const byHandoff = new Map<string, RefundExposure>();
  for (const line of frozen) {
    if (!forfeited.has(line.line_key) || noticed.has(`${line.handoff_id}|${line.line_key}`)) continue;
    const row = byHandoff.get(line.handoff_id) ?? { handoff_id: line.handoff_id, amount_vnd: 0, line_count: 0, keys: [] };
    byHandoff.set(line.handoff_id, { ...row, amount_vnd: row.amount_vnd + line.amount_vnd, line_count: row.line_count + 1, keys: [...row.keys, line.line_key] });
  }
  return [...byHandoff.values()];
}

export async function loadRefundExposure(db: D1Database, current: readonly CommissionLine[]): Promise<RefundExposure[]> {
  const frozen = (await db.prepare("SELECT l.handoff_id, l.line_key, l.amount_vnd FROM crm_commission_handoff_lines l JOIN crm_commission_handoffs h ON h.id = l.handoff_id WHERE h.state = 'confirmed' AND l.active = 1 LIMIT 5000").all<{ handoff_id: string; line_key: string; amount_vnd: number }>()).results;
  const noticed = new Set((await db.prepare("SELECT handoff_id, line_key FROM crm_commission_refund_lines LIMIT 5000").all<{ handoff_id: string; line_key: string }>()).results.map((row) => `${row.handoff_id}|${row.line_key}`));
  return refundExposure(current, frozen, noticed);
}

/**
 * Finance records that a refund forfeited commission payroll already used.
 * The amount is computed from the forfeited frozen lines; nothing is deducted
 * from pay. Payroll decides any recovery through a reviewed correction.
 */
export async function recordRefundNotice(db: D1Database, contentDb: D1Database, actor: CrmActor, form: FormData, view?: CommissionView): Promise<string> {
  if (!actor.finance) throw new ForbiddenError();
  const errors = new Errors();
  const handoffId = errors.text(form, "handoff_id", 100, true), reason = errors.text(form, "reason", 500, true);
  errors.throwIfAny();
  const seen = await requestSeen(db, requestKey(form), actor, "commission_refund_notice");
  if (seen) return seen.ref_id;
  const handoff = await db.prepare("SELECT user_id, state FROM crm_commission_handoffs WHERE id = ?").bind(handoffId).first<{ user_id: string; state: string }>();
  if (!handoff || handoff.state !== "confirmed") throw new ValidationError({ handoff_id: "not_found" });
  if (handoff.user_id === actor.id) throw new ForbiddenError();
  const loaded = view ?? await loadCommission(db, contentDb, actor);
  const exposure = (await loadRefundExposure(db, loaded.lines)).find((row) => row.handoff_id === handoffId);
  if (!exposure) throw new ValidationError({ handoff_id: "nothing_refunded" });
  const id = newId("hrf"), at = nowIso();
  const amounts = new Map((await db.prepare("SELECT line_key, amount_vnd FROM crm_commission_handoff_lines WHERE handoff_id = ?").bind(handoffId).all<{ line_key: string; amount_vnd: number }>()).results.map((row) => [row.line_key, row.amount_vnd]));
  try {
    return (await once(db, actor, requestKey(form), "commission_refund_notice", id, [
      db.prepare("INSERT INTO crm_commission_refund_notices (id, handoff_id, amount_vnd, line_count, reason, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, handoffId, exposure.amount_vnd, exposure.line_count, reason, actor.id, at),
      ...exposure.keys.map((lineKeyValue) => db.prepare("INSERT INTO crm_commission_refund_lines (notice_id, handoff_id, line_key, amount_vnd) VALUES (?, ?, ?, ?)").bind(id, handoffId, lineKeyValue, amounts.get(lineKeyValue) ?? 0)),
      eventStatement(db, actor, "commission_refund_notice", { handoff_id: handoffId, amount_vnd: exposure.amount_vnd, line_count: exposure.line_count }, {}),
    ])).refId;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("crm_commission_refund_invalid")) throw new ValidationError({ handoff_id: "not_in_payroll" });
    if (/UNIQUE constraint failed|PRIMARY KEY/.test(message)) throw new ConflictError();
    throw error;
  }
}
