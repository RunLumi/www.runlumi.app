// Passkey checks for the Workspace on top of the EmDash identity. EmDash owns
// the account, the session and the passkeys (its `credentials` table); this
// file only asks the signed-in person to touch one of their own EmDash
// passkeys again and remembers when that happened in the same EmDash session.
// Nothing here is a login: no password, no app-owned cookie, no second
// account. The session keeps two facts, both bound to the user ID:
//   - the Workspace passkey check (R-08, every session, at most 12 hours old);
//   - step-up freshness (5 minutes) for exports, deletes, access changes and
//     token creation.
import { type AuthenticationResponse, type ChallengeData, type PasskeyConfig, PasskeyAuthenticationError, generateAuthenticationOptions, verifyAuthenticationResponse } from "@emdash-cms/auth/passkey";

export const STEP_UP_WINDOW_MS = 5 * 60_000;
export const PASSKEY_SESSION_MS = 12 * 3600_000;
const MARK_KEY = "lumi_workspace_passkey";
const CHALLENGE_KEY = "lumi_workspace_passkey_challenge";

/** The part of Astro's session this file uses; tests pass a Map-backed fake. */
export interface SessionStore {
  get(key: string): Promise<unknown> | unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
}

export interface PasskeyMark { userId: string; at: number; credentialId: string }

/**
 * The same relying party EmDash uses (astro.config.mjs siteUrl and
 * allowedOrigins), so the passkeys people already registered in EmDash work.
 * User verification is required: a touch alone is not a re-verification.
 */
export const PASSKEY_CONFIG: PasskeyConfig = {
  rpName: "Lumi Workspace",
  rpId: "runlumi.app",
  origins: ["https://runlumi.app", "https://www.runlumi.app", "https://landing.runlumi.app"],
  userVerification: "required",
};

export async function passkeyMark(session: SessionStore | undefined, userId: string): Promise<PasskeyMark | null> {
  if (!session) return null;
  let value: unknown;
  try { value = await session.get(MARK_KEY); } catch { return null; }
  const mark = value as Partial<PasskeyMark> | null | undefined;
  if (!mark || typeof mark !== "object" || mark.userId !== userId || typeof mark.at !== "number" || typeof mark.credentialId !== "string") return null;
  return mark as PasskeyMark;
}

/** Fresh within `windowMs`; a timestamp from the future (clock skew, tampering) never counts. */
export function fresh(mark: PasskeyMark | null, windowMs: number, now = Date.now()): boolean {
  return !!mark && mark.at <= now + 1000 && now - mark.at < windowMs;
}

/** R-08: this EmDash session has verified one of the user's passkeys within the session window. */
export async function sessionPasskeyVerified(session: SessionStore | undefined, userId: string, now = Date.now()): Promise<boolean> {
  return fresh(await passkeyMark(session, userId), PASSKEY_SESSION_MS, now);
}

export async function stepUpFresh(session: SessionStore | undefined, userId: string, now = Date.now()): Promise<boolean> {
  return fresh(await passkeyMark(session, userId), STEP_UP_WINDOW_MS, now);
}

/** Seconds until step-up expires, for the page to say how long it lasts. 0 = not fresh. */
export async function stepUpRemaining(session: SessionStore | undefined, userId: string, now = Date.now()): Promise<number> {
  const mark = await passkeyMark(session, userId);
  return fresh(mark, STEP_UP_WINDOW_MS, now) ? Math.ceil((mark!.at + STEP_UP_WINDOW_MS - now) / 1000) : 0;
}

/** Records a passkey check for this session (used after EmDash itself verified a passkey with user verification). */
export function markPasskeyCheck(session: SessionStore, userId: string, credentialId: string, now = Date.now()): void {
  session.set(MARK_KEY, { userId, at: now, credentialId } satisfies PasskeyMark);
}

const base64url = (value: string): Uint8Array => {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

/** WebAuthn authenticator data flags: user present (0x01) and user verified (0x04). */
export function userVerified(authenticatorData: Uint8Array): boolean {
  return authenticatorData.length >= 37 && (authenticatorData[32] & 0x05) === 0x05;
}

/** User verification in a sign-in assertion's authenticator data (base64url). False on anything malformed. */
export function assertionUserVerified(authenticatorData: unknown): boolean {
  if (typeof authenticatorData !== "string" || authenticatorData.length > 4096) return false;
  try { return userVerified(base64url(authenticatorData)); } catch { return false; }
}

/**
 * Reads authData out of a registration's attestationObject (CBOR map with
 * text keys) and checks user verification. Only the CBOR needed for that:
 * unsigned and negative integers, byte and text strings, arrays, maps and
 * simple values. Anything else, or more than 8 KiB, is treated as not verified.
 */
export function attestationUserVerified(attestationObject: unknown): boolean {
  if (typeof attestationObject !== "string" || attestationObject.length > 8192) return false;
  let bytes: Uint8Array;
  try { bytes = base64url(attestationObject); } catch { return false; }
  let at = 0;
  const length = (info: number): number => {
    if (info < 24) return info;
    const size = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : 0;
    if (!size || at + size > bytes.length) throw new Error("cbor");
    let value = 0;
    for (let i = 0; i < size; i += 1) value = value * 256 + bytes[at++];
    return value;
  };
  const item = (depth: number): unknown => {
    if (depth > 8 || at >= bytes.length) throw new Error("cbor");
    const head = bytes[at++], major = head >> 5, info = head & 31;
    if (major === 7) return null;
    const n = length(info);
    if (major === 0) return n;
    if (major === 1) return -1 - n;
    if (major === 2 || major === 3) {
      if (at + n > bytes.length) throw new Error("cbor");
      const slice = bytes.slice(at, at + n); at += n;
      return major === 3 ? new TextDecoder().decode(slice) : slice;
    }
    if (major === 4) { for (let i = 0; i < n; i += 1) item(depth + 1); return null; }
    if (major === 5) {
      const map = new Map<unknown, unknown>();
      for (let i = 0; i < n; i += 1) { const key = item(depth + 1); map.set(key, item(depth + 1)); }
      return map;
    }
    throw new Error("cbor");
  };
  try {
    const root = item(0);
    const authData = root instanceof Map ? root.get("authData") : null;
    return authData instanceof Uint8Array && userVerified(authData);
  } catch { return false; }
}

/** Thrown by server code before a sensitive action when the last passkey check is older than five minutes. */
export class StepUpRequiredError extends Error {
  constructor() { super("step_up_required"); }
}

/** The server guard for exports, deletes, access changes and token creation. Throws StepUpRequiredError. */
export async function requireStepUp(session: SessionStore | undefined, userId: string, now = Date.now()): Promise<void> {
  if (!(await stepUpFresh(session, userId, now))) throw new StepUpRequiredError();
}

/** Where a page sends someone to verify, returning to `next` (a same-site path) afterwards. */
export function verifyPath(vi: boolean, next: string, reason: "step_up" | "session" = "step_up"): string {
  const back = safeReturn(next, vi);
  return `${vi ? "/vi" : ""}/workspace/verify?reason=${reason}&next=${encodeURIComponent(back)}`;
}

const returnRoots = ["/workspace", "/crm", "/admin/jobs", "/hrm", "/finance"];
/** Only Workspace paths on this site; anything else returns to the Workspace home. */
export function safeReturn(value: string | null | undefined, vi: boolean): string {
  const home = vi ? "/vi/workspace" : "/workspace";
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20]/.test(value)) return home;
  try {
    const url = new URL(value, "https://runlumi.app");
    if (url.origin !== "https://runlumi.app") return home;
    const path = decodeURIComponent(url.pathname);
    if (/[\\\x00-\x20]/.test(path) || path.split("/").includes("..")) return home;
    const plain = path.startsWith("/vi/") ? path.slice(3) : path;
    if (!returnRoots.some((root) => plain === root || plain.startsWith(`${root}/`))) return home;
    return url.pathname + url.search + url.hash;
  } catch {
    return home;
  }
}

/** A credential as stored by EmDash. */
export interface StoredCredential { id: string; userId: string; publicKey: Uint8Array; algorithm: number; counter: number; name: string | null; transports: string[] }

/** Read/write access to EmDash's credentials, scoped by the caller to one user. */
export interface CredentialSource {
  forUser(userId: string): Promise<StoredCredential[]>;
  byId(id: string): Promise<StoredCredential | null>;
  touch(id: string, counter: number, at: string): Promise<void>;
}

function bytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  return new Uint8Array();
}

type CredentialRow = { id: string; user_id: string; public_key: unknown; algorithm: number | null; counter: number; name: string | null; transports: string | null };
function credentialFrom(row: CredentialRow): StoredCredential {
  let transports: string[] = [];
  try { transports = row.transports ? (JSON.parse(row.transports) as string[]).filter((item) => typeof item === "string") : []; } catch { transports = []; }
  return { id: row.id, userId: row.user_id, publicKey: bytes(row.public_key), algorithm: row.algorithm ?? -7, counter: row.counter, name: row.name, transports };
}

/**
 * EmDash's credentials table in CONTENT_DB. Updating the counter and
 * last_used_at mirrors EmDash's own adapter, so clone detection keeps working.
 */
export function emdashCredentials(contentDb: D1Database): CredentialSource {
  const columns = "id, user_id, public_key, algorithm, counter, name, transports";
  return {
    async forUser(userId) {
      return (await contentDb.prepare(`SELECT ${columns} FROM credentials WHERE user_id = ? ORDER BY created_at`).bind(userId).all<CredentialRow>()).results.map(credentialFrom);
    },
    async byId(id) {
      const row = await contentDb.prepare(`SELECT ${columns} FROM credentials WHERE id = ? LIMIT 1`).bind(id).first<CredentialRow>();
      return row ? credentialFrom(row) : null;
    },
    async touch(id, counter, at) {
      await contentDb.prepare("UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?").bind(counter, at, id).run();
    },
  };
}

/** A one-challenge store inside the person's EmDash session, bound to their user ID. */
function sessionChallenges(session: SessionStore, userId: string) {
  return {
    async set(challenge: string, data: ChallengeData) { session.set(CHALLENGE_KEY, { challenge, expiresAt: data.expiresAt, userId }); },
    async get(challenge: string): Promise<ChallengeData | null> {
      const stored = (await session.get(CHALLENGE_KEY)) as { challenge?: string; expiresAt?: number; userId?: string } | undefined;
      if (!stored || stored.challenge !== challenge || stored.userId !== userId || typeof stored.expiresAt !== "number") return null;
      return { type: "authentication", userId, expiresAt: stored.expiresAt };
    },
    async delete() { session.delete(CHALLENGE_KEY); },
  };
}

export type PasskeyOptions = Awaited<ReturnType<typeof generateAuthenticationOptions>>;

/** Options for navigator.credentials.get, limited to the person's own EmDash passkeys. null = no passkey yet. */
export async function passkeyOptions(session: SessionStore, credentials: CredentialSource, userId: string, config = PASSKEY_CONFIG): Promise<PasskeyOptions | null> {
  const own = await credentials.forUser(userId);
  if (!own.length) return null;
  return generateAuthenticationOptions(config, own.map((credential) => ({ id: credential.id, transports: credential.transports as AuthenticatorTransport[] })) as never, sessionChallenges(session, userId));
}

export type VerifyResult = { ok: true; credentialId: string; credentialName: string | null } | { ok: false; code: string };

/**
 * Verifies an assertion made with one of the signed-in person's own passkeys
 * and records it in their session. A passkey of another account fails exactly
 * like an unknown one. The challenge is single use, success or not.
 */
export async function verifyPasskey(session: SessionStore, credentials: CredentialSource, userId: string, body: unknown, now = Date.now(), config = PASSKEY_CONFIG): Promise<VerifyResult> {
  const response = (body as { credential?: AuthenticationResponse } | null)?.credential;
  if (!response || typeof response !== "object" || typeof response.id !== "string" || response.id.length > 1024 || typeof response.response !== "object" || response.response === null) {
    session.delete(CHALLENGE_KEY);
    return { ok: false, code: "invalid_response" };
  }
  const credential = await credentials.byId(response.id);
  if (!credential || credential.userId !== userId) { session.delete(CHALLENGE_KEY); return { ok: false, code: "credential_not_found" }; }
  try {
    const verified = await verifyAuthenticationResponse(config, response, credential as never, sessionChallenges(session, userId));
    await credentials.touch(credential.id, verified.newCounter, new Date(now).toISOString());
    markPasskeyCheck(session, userId, credential.id, now);
    return { ok: true, credentialId: credential.id, credentialName: credential.name };
  } catch (error) {
    session.delete(CHALLENGE_KEY);
    if (error instanceof PasskeyAuthenticationError) return { ok: false, code: error.code };
    return { ok: false, code: "verification_failed" };
  }
}
