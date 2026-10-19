import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { abandonStagedFinancialControl, beginFinancialErasure, completeFinancialErasure, financialControlKey, financialFilePayloadKey, publishFinancialControl, readFinancialControl, readFinancialFilePayload, requireLiveFinancialControl, stageFinancialControl, stageFinancialFilePayload, type FinancialControlTarget, type FinancialErasureAuthorization } from "../src/lib/hrm/financial-control.ts";

type Entry = { bytes: Uint8Array; etag: string; customMetadata: Record<string,string> };
type PutOptions = { onlyIf?: R2Conditional | Headers; customMetadata?: Record<string,string> };
class Bucket {
  objects = new Map<string, Entry>();
  writes = 0;
  beforePut?: (key: string, bytes: Uint8Array, options: PutOptions) => Promise<void>;
  async head(key: string) {
    const entry = this.objects.get(key);
    return entry ? { key, size: entry.bytes.byteLength, etag: entry.etag, customMetadata: { ...entry.customMetadata } } : null;
  }
  async get(key: string) {
    const entry = this.objects.get(key), metadata = await this.head(key);
    return entry && metadata ? { ...metadata, body: new Response(entry.bytes.slice()).body! } : null;
  }
  async put(key: string, value: string | ArrayBuffer, options: PutOptions = {}) {
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value.slice(0));
    await this.beforePut?.(key, bytes, options);
    // Evaluate preconditions at commit, after an intentionally delayed request.
    const current = this.objects.get(key), condition = options.onlyIf;
    if (condition instanceof Headers) {
      if (condition.get("if-none-match") === "*" && current) return null;
    } else if (condition?.etagMatches !== undefined && condition.etagMatches !== current?.etag) return null;
    this.writes++;
    this.objects.set(key, { bytes, etag: createHash("sha256").update(bytes).digest("hex"), customMetadata: { ...options.customMetadata } });
    return this.head(key);
  }
  async delete(key: string) { this.objects.delete(key); }
  binding() { return this as unknown as R2Bucket; }
}
function fixture() {
  const store = new Bucket(), bucket = store.binding();
  const bytes = new TextEncoder().encode("%PDF-1.4\nTEST PRIVATE FINANCIAL PAYLOAD\n%%EOF").buffer;
  const checksum = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  const target: FinancialControlTarget = { kind: "file", id: "TEST-file", caseId: "TEST-case", personId: "TEST-person", employmentId: "TEST-employment", checksum, sizeBytes: bytes.byteLength };
  const at = new Date().toISOString(), operationHash = "a".repeat(64);
  const decision: FinancialErasureAuthorization = { requestId: "TEST-request", policyId: "TEST-policy", policyRevision: 1,
    requestedBy: "TEST-requester", requestedAt: at, reviewedBy: "TEST-reviewer", reviewedAt: at,
    authorizedBy: "TEST-executor", authorizedAt: at, completedBy: null, completedAt: null };
  const upload = () => stageFinancialFilePayload(bucket, target, operationHash, "TEST-uploader", bytes, async () => {});
  return { store, bucket, bytes, target, operationHash, decision, upload, payloadKey: financialFilePayloadKey(target),
    controlKey: financialControlKey(target.kind, target.caseId, target.id) };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test("upload registration remains quarantined until publication and replay never rewrites the birth clock", async () => {
  const f = fixture();
  const staged = await f.upload();
  assert.equal(staged.value.phase, "staged");
  await assert.rejects(requireLiveFinancialControl(f.bucket, f.target), { message: "financial_control_pending" });
  const published = await publishFinancialControl(f.bucket, f.target, f.operationHash);
  assert.equal(published.value.phase, "live");
  const writes = f.store.writes, replay = await f.upload();
  assert.equal(replay.value.registeredAt, staged.value.registeredAt); assert.equal(f.store.writes, writes);
  assert.equal((await requireLiveFinancialControl(f.bucket, f.target)).value.liveAt, published.value.liveAt);
  assert.deepEqual(f.store.objects.get(f.payloadKey)!.bytes, new Uint8Array(f.bytes));
  assert.deepEqual(await readFinancialFilePayload(f.bucket, f.target), f.bytes);
  assert.ok(!f.controlKey.startsWith("hrm/"), "old payload-only backup replay must not overwrite current control state");
  assert.ok(!new TextDecoder().decode(f.store.objects.get(f.controlKey)!.bytes).includes("PRIVATE FINANCIAL PAYLOAD"));
});

test("a proven uncommitted duplicate can be abandoned without reopening its staging operation", async () => {
  const f = fixture(); await f.upload();
  const abandoned = await abandonStagedFinancialControl(f.bucket, f.target, f.operationHash, "TEST-uploader");
  assert.equal(abandoned.value.phase, "abandoned"); assert.equal(abandoned.value.abandonedBy, "TEST-uploader");
  await f.bucket.delete(f.payloadKey);
  await assert.rejects(f.upload(), { message: "financial_data_disposed" });
  assert.equal(f.store.objects.has(f.payloadKey), false);
  assert.equal((await abandonStagedFinancialControl(f.bucket, f.target, f.operationHash, "TEST-uploader")).etag, abandoned.etag);
  const live = fixture(); await live.upload(); await publishFinancialControl(live.bucket, live.target, live.operationHash);
  await assert.rejects(abandonStagedFinancialControl(live.bucket, live.target, live.operationHash, "TEST-uploader"), { message: "financial_control_conflict" });
  assert.deepEqual(await readFinancialFilePayload(live.bucket, live.target), live.bytes);
});

test("missing or mismatched control and malformed phases never become permission to read a restored file", async () => {
  const f = fixture();
  await assert.rejects(requireLiveFinancialControl(f.bucket, f.target), { message: "financial_control_missing" });
  await f.upload();
  await assert.rejects(readFinancialControl(f.bucket, { ...f.target, checksum: "b".repeat(64) }), { message: "financial_control_conflict" });
  const original = JSON.parse(new TextDecoder().decode(f.store.objects.get(f.controlKey)!.bytes));
  await f.store.put(f.controlKey, JSON.stringify({ ...original, phase: ["live"] }));
  await assert.rejects(readFinancialControl(f.bucket, f.target), { message: "financial_control_invalid" });
  await assert.rejects(stageFinancialControl(f.bucket, { ...f.target, id: "../escape" }, f.operationHash, "TEST-uploader"), { message: "financial_control_invalid" });
});

test("concurrent create-once registration adopts the one committed record, including its original timestamp", async () => {
  const f = fixture();
  const rows = await Promise.all([1, 2].map(() => stageFinancialControl(f.bucket, f.target, f.operationHash, "TEST-uploader")));
  assert.deepEqual(rows[0].value, rows[1].value); assert.equal(f.store.writes, 1);
  await assert.rejects(stageFinancialControl(f.bucket, f.target, "c".repeat(64), "TEST-uploader"), { message: "request_key_conflict" });
  await assert.rejects(publishFinancialControl(f.bucket, f.target, f.operationHash), { message: "financial_payload_unavailable" });
});

test("three distinct actors are required before erasure and bytes must be gone before marking completion", async () => {
  const f = fixture(); await f.upload(); await publishFinancialControl(f.bucket, f.target, f.operationHash);
  const writes = f.store.writes;
  await assert.rejects(beginFinancialErasure(f.bucket, f.target, { ...f.decision, authorizedBy: f.decision.requestedBy }), { message: "self_approval" });
  assert.equal(f.store.writes, writes);
  await beginFinancialErasure(f.bucket, f.target, f.decision);
  await assert.rejects(requireLiveFinancialControl(f.bucket, f.target), { message: "financial_control_pending" });
  await assert.rejects(completeFinancialErasure(f.bucket, f.target, f.decision, "TEST-executor"), { message: "financial_payload_remaining" });
  await f.bucket.delete(f.payloadKey);
  const completed = await completeFinancialErasure(f.bucket, f.target, f.decision, "TEST-recovery-executor");
  assert.equal(completed.value.phase, "erased"); assert.equal(completed.value.erasure!.completedBy, "TEST-recovery-executor");
  assert.equal(completed.value.erasure!.authorizedBy, "TEST-executor", "a recovering executor does not rewrite the original authorization");
  await assert.rejects(requireLiveFinancialControl(f.bucket, f.target), { message: "financial_data_disposed" });
  await assert.rejects(f.upload(), { message: "financial_data_disposed" });
  await assert.rejects(publishFinancialControl(f.bucket, f.target, f.operationHash));
  assert.equal((await completeFinancialErasure(f.bucket, f.target, f.decision, "TEST-recovery-executor")).etag, completed.etag);
});

test("restoring the old PDF bytes cannot undo a current erasure decision", async () => {
  const f = fixture(); await f.upload(); await publishFinancialControl(f.bucket, f.target, f.operationHash);
  const olderPayload = f.store.objects.get(f.payloadKey)!;
  await beginFinancialErasure(f.bucket, f.target, f.decision); await f.bucket.delete(f.payloadKey);
  await completeFinancialErasure(f.bucket, f.target, f.decision, "TEST-executor");
  f.store.objects.set(f.payloadKey, olderPayload); // Replay an older payload backup, preserving current controls.
  await assert.rejects(requireLiveFinancialControl(f.bucket, f.target), { message: "financial_data_disposed" });
  assert.equal((await readFinancialControl(f.bucket, f.target)).value.phase, "erased");
});

test("a payload PUT still in flight cannot repopulate private bytes after erasure", { timeout: 5000 }, async () => {
  const f = fixture(), firstReady = deferred(), secondReady = deferred(), releaseFirst = deferred(), releaseSecond = deferred();
  let payloadWrites = 0;
  f.store.beforePut = async (key, _bytes, options) => {
    if (key !== f.payloadKey || options.customMetadata?.financial_control !== "1") return;
    if (++payloadWrites === 1) { firstReady.resolve(); await releaseFirst.promise; }
    else { secondReady.resolve(); await releaseSecond.promise; }
  };
  const first = f.upload(); await firstReady.promise;
  const second = f.upload(); await secondReady.promise;
  try {
    releaseFirst.resolve(); await first; await publishFinancialControl(f.bucket, f.target, f.operationHash);
    await beginFinancialErasure(f.bucket, f.target, f.decision); await f.bucket.delete(f.payloadKey);
    await completeFinancialErasure(f.bucket, f.target, f.decision, "TEST-executor");
    releaseSecond.resolve(); await assert.rejects(second, { message: "financial_data_disposed" });
    assert.equal(f.store.objects.has(f.payloadKey), false, "the old sentinel ETag no longer matches an absent payload key");
  } finally { releaseFirst.resolve(); releaseSecond.resolve(); await Promise.allSettled([first, second]); }
});

test("a delayed staging create may leave only a sentinel, never the old PDF payload", { timeout: 5000 }, async () => {
  const f = fixture(), payloadReady = deferred(), sentinelReady = deferred(), releasePayload = deferred(), releaseSentinel = deferred();
  let stagingWrites = 0;
  f.store.beforePut = async (key, _bytes, options) => {
    if (key !== f.payloadKey) return;
    if (options.customMetadata?.financial_control === "1") { payloadReady.resolve(); await releasePayload.promise; }
    if (options.customMetadata?.financial_staging && ++stagingWrites === 2) { sentinelReady.resolve(); await releaseSentinel.promise; }
  };
  const first = f.upload(); await payloadReady.promise;
  const second = f.upload(); await sentinelReady.promise;
  try {
    releasePayload.resolve(); await first; await publishFinancialControl(f.bucket, f.target, f.operationHash);
    await beginFinancialErasure(f.bucket, f.target, f.decision); await f.bucket.delete(f.payloadKey);
    await completeFinancialErasure(f.bucket, f.target, f.decision, "TEST-executor");
    releaseSentinel.resolve(); await assert.rejects(second, { message: "financial_data_disposed" });
    const residual = new TextDecoder().decode(f.store.objects.get(f.payloadKey)!.bytes);
    assert.match(residual, /^hrm-financial-upload-staging-v1\n/); assert.ok(!residual.includes("PRIVATE FINANCIAL PAYLOAD"));
    await assert.rejects(requireLiveFinancialControl(f.bucket, f.target), { message: "financial_data_disposed" });
  } finally { releasePayload.resolve(); releaseSentinel.resolve(); await Promise.allSettled([first, second]); }
});
