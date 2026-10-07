// Shared persistence helpers: errors that pages turn into responses,
// idempotent batches and audit events.
import type { CrmActor } from "./access";

export type FieldErrors = Record<string, string>;

/** User input is invalid; the page re-renders the form with these errors. */
export class ValidationError extends Error {
  readonly fields: FieldErrors;
  constructor(fields: FieldErrors) { super("validation"); this.fields = fields; }
}
/** Someone else changed the record; the page keeps the user's edit and shows the latest. */
export class ConflictError extends Error {
  constructor() { super("conflict"); }
}
export class NotFoundError extends Error {
  constructor() { super("not_found"); }
}
export class ForbiddenError extends Error {
  constructor() { super("forbidden"); }
}

export function fail(field: string, code: string): never {
  throw new ValidationError({ [field]: code });
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

const requestKeyPattern = /^[A-Za-z0-9_-]{16,100}$/;
export function validRequestKey(value: string): boolean {
  return requestKeyPattern.test(value);
}

export async function requestSeen(db: D1Database, key: string, actor?: CrmActor, intent?: string): Promise<{ ref_id: string } | null> {
  const row = await db.prepare("SELECT ref_id, actor_id, intent FROM crm_requests WHERE request_key = ?").bind(key).first<{ ref_id: string; actor_id: string; intent: string }>();
  // A key belongs to one person and one action; anything else is not a retry.
  if (row && actor && (row.actor_id !== actor.id || (intent && row.intent !== intent))) fail("request_key", "invalid");
  return row;
}

/**
 * Runs statements atomically with an idempotency record first. If the same
 * request key was already committed (double-click, browser retry), nothing is
 * written again and the original ref is returned.
 */
export async function once(
  db: D1Database, actor: CrmActor, key: string, intent: string, refId: string, statements: D1PreparedStatement[],
): Promise<{ duplicate: boolean; refId: string; results: D1Result[] }> {
  if (!validRequestKey(key)) fail("request_key", "invalid");
  const seen = await requestSeen(db, key, actor, intent);
  if (seen) return { duplicate: true, refId: seen.ref_id, results: [] };
  const record = db.prepare("INSERT INTO crm_requests (request_key, actor_id, intent, ref_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(key, actor.id, intent, refId, nowIso());
  try {
    const results = await db.batch([record, ...statements]);
    return { duplicate: false, refId, results: results.slice(1) };
  } catch (error) {
    const again = await requestSeen(db, key);
    if (again) return { duplicate: true, refId: again.ref_id, results: [] };
    throw error;
  }
}

/**
 * Version-guarded variant: every statement must carry the guard in its WHERE
 * clause. The idempotency row is inserted only when the guard holds, so a
 * stale edit writes nothing; `changed` reports whether the guard matched.
 */
export async function onceGuarded(
  db: D1Database, actor: CrmActor, key: string, intent: string, refId: string,
  guard: { sql: string; args: unknown[] }, statements: D1PreparedStatement[],
): Promise<{ duplicate: boolean; changed: boolean }> {
  if (!validRequestKey(key)) fail("request_key", "invalid");
  if (await requestSeen(db, key, actor, intent)) return { duplicate: true, changed: true };
  const record = db.prepare(`INSERT INTO crm_requests (request_key, actor_id, intent, ref_id, created_at) SELECT ?, ?, ?, ?, ? WHERE ${guard.sql}`)
    .bind(key, actor.id, intent, refId, nowIso(), ...guard.args);
  try {
    const results = await db.batch([record, ...statements]);
    if (results[0].meta.changes === 1) return { duplicate: false, changed: true };
  } catch (error) {
    if (!await requestSeen(db, key)) throw error;
    return { duplicate: true, changed: true };
  }
  // The guard failed. A concurrent copy of this same request may have won.
  if (await requestSeen(db, key)) return { duplicate: true, changed: true };
  return { duplicate: false, changed: false };
}

export function eventStatement(
  db: D1Database, actor: CrmActor, kind: string, body: Record<string, unknown>,
  target: { opportunityId?: string | null; accountId?: string | null }, guard?: { sql: string; args: unknown[] },
): D1PreparedStatement {
  const values = [newId("evt"), target.opportunityId ?? null, target.accountId ?? null, actor.id, actor.name, kind, JSON.stringify(body), nowIso()];
  if (!guard) return db.prepare("INSERT INTO crm_events (id, opportunity_id, account_id, actor_id, actor_name, kind, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(...values);
  return db.prepare(`INSERT INTO crm_events (id, opportunity_id, account_id, actor_id, actor_name, kind, body, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`).bind(...values, ...guard.args);
}

export function text(form: FormData, key: string, max: number, { required = false } = {}): string {
  const raw = form.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  if (required && !value) fail(key, "required");
  if (value.length > max) fail(key, "too_long");
  return value;
}

/** Collects field errors across several checks before throwing once. */
export class Errors {
  readonly fields: FieldErrors = {};
  add(field: string, code: string): void { if (!this.fields[field]) this.fields[field] = code; }
  text(form: FormData, key: string, max: number, required = false): string {
    const raw = form.get(key);
    const value = typeof raw === "string" ? raw.trim() : "";
    if (required && !value) this.add(key, "required");
    else if (value.length > max) this.add(key, "too_long");
    return value.slice(0, max);
  }
  throwIfAny(): void { if (Object.keys(this.fields).length) throw new ValidationError(this.fields); }
}

export function formValues(form: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  // Repeated keys (checkbox groups) are joined with commas.
  for (const [key, value] of form.entries()) if (typeof value === "string" && key.length <= 80) values[key] = key in values ? `${values[key]},${value.slice(0, 5000)}` : value.slice(0, 5000);
  return values;
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 11 && digits.startsWith("84") ? `0${digits.slice(2)}` : digits;
}

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
