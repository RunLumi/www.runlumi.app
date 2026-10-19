import { HrmError } from "./fields";

// These objects are control state, not payload backups. Restoring hrm/* must
// preserve this current namespace. No new bucket or public route is required.
const PREFIX = "hrm-privacy/v1/financial/";
const MAX_CONTROL_BYTES = 16 * 1024;
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;
export interface FinancialControlTarget {
  kind: "file" | "dossier";
  id: string;
  caseId: string;
  personId: string;
  employmentId: string;
  checksum: string;
  sizeBytes: number;
}
export interface FinancialErasureAuthorization {
  requestId: string;
  policyId: string;
  policyRevision: number;
  requestedBy: string;
  requestedAt: string;
  reviewedBy: string;
  reviewedAt: string;
  authorizedBy: string;
  authorizedAt: string;
  completedBy: string | null;
  completedAt: string | null;
}
export interface FinancialControl {
  version: 1;
  phase: "staged" | "live" | "erasing" | "erased" | "abandoned";
  target: FinancialControlTarget;
  operationHash: string;
  createdBy: string;
  registeredAt: string;
  liveAt: string | null;
  abandonedBy: string | null;
  abandonedAt: string | null;
  erasure: FinancialErasureAuthorization | null;
}
export interface StoredFinancialControl { key: string; etag: string; value: FinancialControl }

const invalid = () => new HrmError("financial_control_invalid", 503);
function ref(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(value)) throw invalid();
}
function actor(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_:-]{1,160}$/.test(value)) throw invalid();
}
function checksum(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw invalid();
}
function utc(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw invalid();
}
function object(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw invalid();
}
function target(value: unknown): asserts value is FinancialControlTarget {
  object(value, ["kind", "id", "caseId", "personId", "employmentId", "checksum", "sizeBytes"]);
  if (value.kind !== "file" && value.kind !== "dossier") throw invalid();
  for (const key of ["id", "caseId", "personId", "employmentId"]) ref(value[key]);
  checksum(value.checksum);
  if (!Number.isSafeInteger(value.sizeBytes) || Number(value.sizeBytes) < 1 || Number(value.sizeBytes) > MAX_PAYLOAD_BYTES) throw invalid();
}
function authorization(value: unknown, completed: boolean): asserts value is FinancialErasureAuthorization {
  object(value, ["requestId", "policyId", "policyRevision", "requestedBy", "requestedAt", "reviewedBy", "reviewedAt", "authorizedBy", "authorizedAt", "completedBy", "completedAt"]);
  ref(value.requestId); ref(value.policyId);
  if (!Number.isSafeInteger(value.policyRevision) || Number(value.policyRevision) < 1) throw invalid();
  actor(value.requestedBy); actor(value.reviewedBy); actor(value.authorizedBy);
  utc(value.requestedAt); utc(value.reviewedAt); utc(value.authorizedAt);
  if (value.requestedBy === value.reviewedBy || value.authorizedBy === value.requestedBy || value.authorizedBy === value.reviewedBy) throw new HrmError("self_approval", 403);
  if (completed) {
    actor(value.completedBy); utc(value.completedAt);
    if (value.completedBy === value.requestedBy || value.completedBy === value.reviewedBy) throw new HrmError("self_approval", 403);
  } else if (value.completedBy !== null || value.completedAt !== null) throw invalid();
}
function control(value: unknown): asserts value is FinancialControl {
  object(value, ["version", "phase", "target", "operationHash", "createdBy", "registeredAt", "liveAt", "abandonedBy", "abandonedAt", "erasure"]);
  if (value.version !== 1 || typeof value.phase !== "string" || !["staged", "live", "erasing", "erased", "abandoned"].includes(value.phase)) throw invalid();
  target(value.target); checksum(value.operationHash); actor(value.createdBy); utc(value.registeredAt);
  if (value.phase === "staged" || value.phase === "abandoned") { if (value.liveAt !== null) throw invalid(); }
  else utc(value.liveAt);
  if (value.phase === "abandoned") { actor(value.abandonedBy); utc(value.abandonedAt); }
  else if (value.abandonedBy !== null || value.abandonedAt !== null) throw invalid();
  if (value.phase === "staged" || value.phase === "live" || value.phase === "abandoned") { if (value.erasure !== null) throw invalid(); }
  else authorization(value.erasure, value.phase === "erased");
}
function sameTarget(left: FinancialControlTarget, right: FinancialControlTarget): boolean {
  return left.kind === right.kind && left.id === right.id && left.caseId === right.caseId
    && left.personId === right.personId && left.employmentId === right.employmentId
    && left.checksum === right.checksum && left.sizeBytes === right.sizeBytes;
}
export function financialControlKey(kind: FinancialControlTarget["kind"], caseId: string, id: string): string {
  if (kind !== "file" && kind !== "dossier") throw invalid();
  ref(caseId); ref(id); return `${PREFIX}${kind}/${caseId}/${id}.json`;
}
async function read(bucket: R2Bucket, kind: FinancialControlTarget["kind"], caseId: string, id: string): Promise<StoredFinancialControl | null> {
  const key = financialControlKey(kind, caseId, id), found = await bucket.get(key);
  if (!found) return null;
  if (!Number.isSafeInteger(found.size) || found.size < 1 || found.size > MAX_CONTROL_BYTES || !found.etag) {
    await found.body.cancel(); throw invalid();
  }
  const reader = found.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.byteLength;
      if (length > MAX_CONTROL_BYTES) { await reader.cancel(); throw invalid(); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw invalid(); }
  control(value);
  if (value.target.kind !== kind || value.target.caseId !== caseId || value.target.id !== id) throw invalid();
  return { key, etag: found.etag, value };
}
export async function readFinancialControl(bucket: R2Bucket, expected: FinancialControlTarget): Promise<StoredFinancialControl> {
  target(expected); const found = await read(bucket, expected.kind, expected.caseId, expected.id);
  if (!found) throw new HrmError("financial_control_missing", 503);
  if (!sameTarget(found.value.target, expected)) throw new HrmError("financial_control_conflict", 409);
  return found;
}
export async function requireLiveFinancialControl(bucket: R2Bucket, expected: FinancialControlTarget): Promise<StoredFinancialControl> {
  const found = await readFinancialControl(bucket, expected);
  if (found.value.phase === "erased" || found.value.phase === "abandoned") throw new HrmError("financial_data_disposed", 410);
  if (found.value.phase !== "live") throw new HrmError("financial_control_pending", 409);
  return found;
}
async function replace(bucket: R2Bucket, old: StoredFinancialControl, value: FinancialControl): Promise<StoredFinancialControl> {
  control(value);
  const result = await bucket.put(old.key, JSON.stringify(value), {
    onlyIf: { etagMatches: old.etag },
    httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" },
  });
  if (!result) throw new HrmError("financial_control_conflict", 409);
  return { key: old.key, etag: result.etag, value };
}
export async function stageFinancialControl(bucket: R2Bucket, expected: FinancialControlTarget, operationHash: string, createdBy: string): Promise<StoredFinancialControl> {
  target(expected); checksum(operationHash); actor(createdBy);
  const value: FinancialControl = { version: 1, phase: "staged", target: { ...expected }, operationHash,
    createdBy, registeredAt: new Date().toISOString(), liveAt: null, abandonedBy: null, abandonedAt: null, erasure: null };
  const key = financialControlKey(expected.kind, expected.caseId, expected.id);
  // A negative read cannot rule out an earlier ambiguous PUT. The conditional
  // create is the fence; never turn absence into permission to overwrite.
  const result = await bucket.put(key, JSON.stringify(value), {
    onlyIf: new Headers({ "If-None-Match": "*" }),
    httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" },
  });
  if (result) return { key, etag: result.etag, value };
  const found = await readFinancialControl(bucket, expected);
  if (found.value.operationHash !== operationHash || found.value.createdBy !== createdBy) throw new HrmError("request_key_conflict", 409);
  if (found.value.phase === "erasing" || found.value.phase === "erased" || found.value.phase === "abandoned") throw new HrmError("financial_data_disposed", 410);
  return found;
}

/** Only for a definitively uncommitted duplicate/orphan; never infer that from a
 * negative D1 read after an ambiguous write. The caller must prove no accepted
 * record owns this target before deleting its transient payload. */
export async function abandonStagedFinancialControl(bucket: R2Bucket, expected: FinancialControlTarget, operationHash: string, abandonedBy: string): Promise<StoredFinancialControl> {
  checksum(operationHash); actor(abandonedBy); const found = await readFinancialControl(bucket, expected);
  if (found.value.operationHash !== operationHash) throw new HrmError("request_key_conflict", 409);
  if (found.value.phase === "abandoned") return found;
  if (found.value.phase !== "staged") throw new HrmError("financial_control_conflict", 409);
  return replace(bucket, found, { ...found.value, phase: "abandoned", abandonedBy, abandonedAt: new Date().toISOString() });
}
export async function publishFinancialControl(bucket: R2Bucket, expected: FinancialControlTarget, operationHash: string): Promise<StoredFinancialControl> {
  checksum(operationHash); const found = await readFinancialControl(bucket, expected);
  if (found.value.operationHash !== operationHash) throw new HrmError("request_key_conflict", 409);
  if (expected.kind === "file" && !matchesPayload(await bucket.head(financialFilePayloadKey(expected)), expected)) throw new HrmError("financial_payload_unavailable", 503);
  if (found.value.phase === "live") return found;
  if (found.value.phase !== "staged") throw new HrmError("financial_data_disposed", 410);
  return replace(bucket, found, { ...found.value, phase: "live", liveAt: new Date().toISOString() });
}

export function financialFilePayloadKey(expected: FinancialControlTarget): string {
  target(expected); if (expected.kind !== "file") throw invalid();
  return `hrm/closeout/${expected.caseId}/${expected.id}`;
}
function matchesPayload(found: R2Object | null, expected: FinancialControlTarget): boolean {
  return !!found && found.size === expected.sizeBytes && found.customMetadata?.checksum === expected.checksum
    && found.customMetadata?.case_id === expected.caseId && found.customMetadata?.financial_control === "1";
}
async function uploadControl(bucket: R2Bucket, expected: FinancialControlTarget, operationHash: string): Promise<StoredFinancialControl> {
  const found = await readFinancialControl(bucket, expected);
  if (found.value.operationHash !== operationHash) throw new HrmError("request_key_conflict", 409);
  if (found.value.phase === "erasing" || found.value.phase === "erased" || found.value.phase === "abandoned") throw new HrmError("financial_data_disposed", 410);
  return found;
}
/** Store immutable bytes, still quarantined until the caller commits D1 and publishes control.
 * A delayed payload create-if-absent could otherwise recreate erased bytes after DELETE.
 * Only the metadata-only sentinel uses create-if-absent; payload writes must match its ETag.
 */
export async function stageFinancialFilePayload(bucket: R2Bucket, expected: FinancialControlTarget, operationHash: string, createdBy: string, bytes: ArrayBuffer, authorize: () => Promise<void>): Promise<StoredFinancialControl> {
  const key = financialFilePayloadKey(expected);
  if (bytes.byteLength !== expected.sizeBytes) throw invalid();
  const checksumBytes = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(checksumBytes), byte => byte.toString(16).padStart(2, "0")).join("");
  if (hash !== expected.checksum) throw invalid();
  await authorize();
  const staged = await stageFinancialControl(bucket, expected, operationHash, createdBy);
  await authorize();
  if (staged.value.phase === "live") {
    if (!matchesPayload(await bucket.head(key), expected)) throw new HrmError("financial_payload_unavailable", 503);
    return staged;
  }
  const sentinel = `hrm-financial-upload-staging-v1\n${crypto.randomUUID()}`;
  const created = await bucket.put(key, sentinel, {
    onlyIf: new Headers({ "If-None-Match": "*" }),
    httpMetadata: { contentType: "application/octet-stream", cacheControl: "private, no-store" },
    customMetadata: { financial_staging: operationHash },
  });
  const currentObject = created ?? await bucket.head(key);
  // This read must follow the sentinel write's definitive result. A late
  // sentinel is harmless; it may never authorize a payload after erasure.
  const currentControl = await uploadControl(bucket, expected, operationHash);
  await authorize();
  if (matchesPayload(currentObject, expected)) return currentControl;
  if (!currentObject || currentControl.value.phase !== "staged" || currentObject.customMetadata?.financial_staging !== operationHash) {
    throw new HrmError("financial_control_conflict", 409);
  }
  const stored = await bucket.put(key, bytes, {
    onlyIf: { etagMatches: currentObject.etag }, sha256: checksumBytes,
    httpMetadata: { contentType: "application/pdf", cacheControl: "private, no-store" },
    customMetadata: { checksum: expected.checksum, case_id: expected.caseId, financial_control: "1" },
  });
  const latest = await uploadControl(bucket, expected, operationHash);
  await authorize();
  if (!stored && !matchesPayload(await bucket.head(key), expected)) throw new HrmError("financial_control_conflict", 409);
  return latest;
}

export async function readFinancialFilePayload(bucket: R2Bucket, expected: FinancialControlTarget): Promise<ArrayBuffer> {
  const key = financialFilePayloadKey(expected); await requireLiveFinancialControl(bucket, expected);
  const found = await bucket.get(key);
  if (!matchesPayload(found, expected)) {
    if (found) await found.body.cancel();
    throw new HrmError("financial_payload_unavailable", 503);
  }
  const bytes = await new Response(found!.body).arrayBuffer();
  if (bytes.byteLength !== expected.sizeBytes) throw new HrmError("financial_payload_unavailable", 503);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  if (hash !== expected.checksum) throw new HrmError("financial_payload_unavailable", 503);
  // Current control wins over old metadata or bytes fetched before disposition.
  await requireLiveFinancialControl(bucket, expected);
  return bytes;
}
function sameDecision(left: FinancialErasureAuthorization, right: FinancialErasureAuthorization): boolean {
  return left.requestId === right.requestId && left.policyId === right.policyId && left.policyRevision === right.policyRevision
    && left.requestedBy === right.requestedBy && left.requestedAt === right.requestedAt
    && left.reviewedBy === right.reviewedBy && left.reviewedAt === right.reviewedAt;
}
export async function beginFinancialErasure(bucket: R2Bucket, expected: FinancialControlTarget, decision: FinancialErasureAuthorization): Promise<StoredFinancialControl> {
  authorization(decision, false); const found = await readFinancialControl(bucket, expected);
  if (found.value.phase === "erasing" || found.value.phase === "erased") {
    if (!found.value.erasure || !sameDecision(found.value.erasure, decision)) throw new HrmError("financial_control_conflict", 409);
    return found;
  }
  if (found.value.phase !== "live") throw new HrmError("financial_control_pending", 409);
  return replace(bucket, found, { ...found.value, phase: "erasing", erasure: { ...decision } });
}
export async function completeFinancialErasure(bucket: R2Bucket, expected: FinancialControlTarget, decision: FinancialErasureAuthorization, completedBy: string): Promise<StoredFinancialControl> {
  authorization(decision, false); actor(completedBy);
  if (completedBy === decision.requestedBy || completedBy === decision.reviewedBy) throw new HrmError("self_approval", 403);
  const found = await readFinancialControl(bucket, expected);
  if (!found.value.erasure || !sameDecision(found.value.erasure, decision)) throw new HrmError("financial_control_conflict", 409);
  if (found.value.phase === "erased") return found;
  if (found.value.phase !== "erasing") throw new HrmError("financial_control_pending", 409);
  if (expected.kind === "file") {
    const remaining = await bucket.get(financialFilePayloadKey(expected));
    if (remaining) {
      if (remaining.size > 128 || remaining.customMetadata?.financial_staging !== found.value.operationHash) {
        await remaining.body.cancel(); throw new HrmError("financial_payload_remaining", 409);
      }
      const text = await new Response(remaining.body).text();
      if (!/^hrm-financial-upload-staging-v1\n[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(text)) throw new HrmError("financial_payload_remaining", 409);
    }
  }
  return replace(bucket, found, { ...found.value, phase: "erased", erasure: { ...found.value.erasure, completedBy, completedAt: new Date().toISOString() } });
}
