// Server-to-server intake from the Lumi Local marketing site. Only enquiries
// addressed to Lumi arrive here; enquiries from customers' Starter sites go to
// the destination each business agreed and are never collected by this CRM.
//
// Protocol: POST JSON with headers
//   X-Lumi-Source: local.runlumi.app        (allowlisted)
//   X-Lumi-Timestamp: <unix seconds>        (±300 s)
//   Idempotency-Key: <16–100 [A-Za-z0-9_-]>
//   X-Lumi-Signature: v1=<hex HMAC-SHA256(secret, `${timestamp}.${key}.${body}`)>
// 201 = stored, 200 = same key already stored (duplicate: true), 409 = key
// reused with a different body. Success is returned only after D1 commits.
import { newId, normalizePhone, nowIso, validRequestKey } from "./core";
import { latestPlaybooks } from "./config";
import { phoneSuppressed } from "./records";

export const INTAKE_SOURCES = ["local.runlumi.app"] as const;
const MAX_BODY = 16 * 1024;
const SKEW_SECONDS = 300;

// Mirror of RunLumi/local.runlumi src/services/routes.js (origin/main 3a6024e).
// The sender validates context server-side; this list rejects anything else.
const pageContexts: Record<string, { intent: string; offer: string }> = {
  maps: { intent: "check", offer: "unsure" }, qr: { intent: "trust-kit", offer: "trust-kit" }, check: { intent: "check", offer: "unsure" },
  website: { intent: "preview", offer: "starter" }, spa: { intent: "preview", offer: "starter" }, garage: { intent: "preview", offer: "starter" }, hvac: { intent: "preview", offer: "starter" },
};

export interface IntakePayload {
  name: string; business: string; phone: string; email: string; note: string; locale: "vi" | "en";
  consent: true; consent_text_version: string;
  context: { page_slug: string; source: string; cta_intent: string; offer_interest: string } | null;
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/** Reads at most `max` bytes, so an unauthenticated chunked body cannot force a large allocation. */
async function readCapped(request: Request, max: number): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export type Verified = { ok: true; key: string; source: string; body: string } | { ok: false; status: number; error: string };

export async function verifyIntake(request: Request, secret: string | undefined, now = Date.now()): Promise<Verified> {
  if (!secret || secret.length < 32) return { ok: false, status: 503, error: "unavailable" };
  const source = request.headers.get("x-lumi-source") ?? "";
  const timestamp = request.headers.get("x-lumi-timestamp") ?? "";
  const key = request.headers.get("idempotency-key") ?? "";
  const signature = request.headers.get("x-lumi-signature") ?? "";
  if (!(INTAKE_SOURCES as readonly string[]).includes(source)) return { ok: false, status: 403, error: "source" };
  if (!/^\d{9,11}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > SKEW_SECONDS) return { ok: false, status: 401, error: "timestamp" };
  if (!validRequestKey(key)) return { ok: false, status: 400, error: "idempotency_key" };
  if ((request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") return { ok: false, status: 415, error: "content_type" };
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return { ok: false, status: 413, error: "too_large" };
  const body = await readCapped(request, MAX_BODY);
  if (body === null) return { ok: false, status: 413, error: "too_large" };
  const expected = `v1=${await hmacHex(secret, `${timestamp}.${key}.${body}`)}`;
  if (!timingSafeEqual(expected, signature)) return { ok: false, status: 401, error: "signature" };
  return { ok: true, key, source, body };
}

const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max) : "";

export function parseIntakePayload(raw: unknown): IntakePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const name = clean(data.name, 80);
  const business = clean(data.business, 160);
  const phone = clean(data.phone, 40);
  const email = clean(data.email, 254);
  const note = clean(data.note, 1000);
  const locale = data.locale === "en" ? "en" : data.locale === "vi" ? "vi" : null;
  const digits = phone.replace(/\D/g, "");
  if (!name || !business || !locale || data.consent !== true) return null;
  if (!/^[+\d\s().-]+$/.test(phone) || digits.length < 8 || digits.length > 15) return null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  let context: IntakePayload["context"] = null;
  if (data.context && typeof data.context === "object") {
    const ctx = data.context as Record<string, unknown>;
    const slug = clean(ctx.page_slug, 20);
    const expected = pageContexts[slug];
    const source = clean(ctx.source, 120);
    if (!expected || ctx.cta_intent !== expected.intent || ctx.offer_interest !== expected.offer || !/^\/[a-z0-9/-]{1,118}$/.test(source)) return null;
    context = { page_slug: slug, source, cta_intent: expected.intent, offer_interest: expected.offer };
  }
  return { name, business, phone, email, note, locale, consent: true, consent_text_version: clean(data.consent_text_version, 40) || "unspecified", context };
}

export type IntakeResult = { status: 201 | 200; id: string; duplicate: boolean } | { status: 409 | 422 | 503; error: string };

/** Stores the enquiry and a queued, unassigned opportunity in one transaction. */
export async function storeIntake(db: D1Database, verified: Extract<Verified, { ok: true }>): Promise<IntakeResult> {
  let raw: unknown;
  try { raw = JSON.parse(verified.body); } catch { return { status: 422, error: "invalid_json" }; }
  const payload = parseIntakePayload(raw);
  if (!payload) return { status: 422, error: "invalid_fields" };
  const hash = await sha256Hex(verified.body);
  const existing = await db.prepare("SELECT id, payload_hash FROM crm_inbound WHERE idempotency_key = ?").bind(verified.key).first<{ id: string; payload_hash: string }>();
  if (existing) return existing.payload_hash === hash ? { status: 200, id: existing.id, duplicate: true } : { status: 409, error: "key_reused" };

  const playbook = (await latestPlaybooks(db, { activeOnly: true })).find((item) => item.playbook_key === "local-preview");
  if (!playbook) return { status: 503, error: "playbook_unavailable" };
  const phoneNorm = normalizePhone(payload.phone);
  const suppressed = await phoneSuppressed(db, phoneNorm);
  const now = nowIso();
  const id = newId("inb");
  const accountId = newId("acc");
  const contactId = newId("con");
  const opportunityId = newId("opp");
  const actor = `intake:${verified.source}`;
  const consentEvidence = `Web form consent on ${verified.source} (${payload.locale}, text ${payload.consent_text_version}) at ${now}`;
  const detail = payload.context ? `${payload.context.source} · intent ${payload.context.cta_intent} · offer ${payload.context.offer_interest}` : `${verified.source} (no page context)`;
  const statements = [
    db.prepare("INSERT INTO crm_accounts (id, name, phone_norm, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(accountId, payload.business, phoneNorm, actor, now, now),
    db.prepare("INSERT INTO crm_contacts (id, account_id, name, role, email, phone, phone_norm, contact_basis, preferred_channel, consent_status, consent_evidence, created_by, created_at, updated_at) VALUES (?, ?, ?, 'other', ?, ?, ?, ?, 'phone', 'granted', ?, ?, ?, ?)")
      .bind(contactId, accountId, payload.name, payload.email, payload.phone, phoneNorm, "Submitted an enquiry to Lumi Local", consentEvidence, actor, now, now),
    // Not a payment, account or qualified lead: it starts unassigned at the first stage.
    db.prepare(`INSERT INTO crm_opportunities (id, account_id, primary_contact_id, title, playbook_id, stage_id, outcome, owner_id, seller_id, created_by, source_channel, source_detail, relation, next_action, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'open', NULL, NULL, ?, 'inbound_web', ?, 'new', ?, ?, ?)`)
      .bind(opportunityId, accountId, contactId, payload.business, playbook.id, playbook.def.stages[0].id, actor, detail, payload.note ? `Enquiry note: ${payload.note.slice(0, 400)}` : "", now, now),
    // Inserted after the opportunity it references (foreign keys are immediate).
    db.prepare("INSERT INTO crm_inbound (id, idempotency_key, payload_hash, source, payload, opportunity_id, suppressed, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, verified.key, hash, verified.source, JSON.stringify(payload), opportunityId, suppressed ? 1 : 0, now),
    db.prepare("INSERT INTO crm_stage_history (id, opportunity_id, playbook_id, from_stage, to_stage, reason, actor_id, created_at) VALUES (?, ?, ?, NULL, ?, 'inbound enquiry', ?, ?)")
      .bind(newId("stg"), opportunityId, playbook.id, playbook.def.stages[0].id, actor, now),
    db.prepare("INSERT INTO crm_events (id, opportunity_id, account_id, actor_id, actor_name, kind, body, created_at) VALUES (?, ?, ?, ?, ?, 'inbound', ?, ?)")
      .bind(newId("evt"), opportunityId, accountId, actor, "Lumi Local intake", JSON.stringify({ inbound_id: id, locale: payload.locale, context: payload.context, suppressed }), now),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    const raced = await db.prepare("SELECT id, payload_hash FROM crm_inbound WHERE idempotency_key = ?").bind(verified.key).first<{ id: string; payload_hash: string }>();
    if (raced) return raced.payload_hash === hash ? { status: 200, id: raced.id, duplicate: true } : { status: 409, error: "key_reused" };
    throw error;
  }
  return { status: 201, id, duplicate: false };
}

export interface InboundRow { id: string; payload: string; opportunity_id: string; status: string; suppressed: number; received_at: string; source: string }
export async function inboundQueue(db: D1Database): Promise<InboundRow[]> {
  return (await db.prepare("SELECT id, payload, opportunity_id, status, suppressed, received_at, source FROM crm_inbound WHERE status = 'queued' ORDER BY received_at LIMIT 100").all<InboundRow>()).results;
}
