import type { Permission, WorkspaceUser } from "../workspace/roles";
import { date, HrmError } from "./fields";
import { command, digest, guardBoolean, id, localDate, now, requirePermission, settings } from "./service";
import { reportAccount, reportAuthority } from "./report-governance";
import { closeoutPolicySourceSql } from "./closeout-policies";

export const FINANCIAL_FILE_ANCHORS = ["file_created", "employment_ended", "case_completed"] as const;
export const FINANCIAL_DOSSIER_ANCHORS = ["dossier_prepared", "dossier_applied", "employment_ended", "case_completed"] as const;
export interface FinancialRetentionPolicyInput {
  policyKey: string; titleEn: string; titleVi: string; purpose: string; sourceVersionId: string;
  effectiveFrom: string; effectiveUntil: string;
  fileDays: number | null; fileAnchor: typeof FINANCIAL_FILE_ANCHORS[number] | null; fileBasis: string;
  dossierDays: number | null; dossierAnchor: typeof FINANCIAL_DOSSIER_ANCHORS[number] | null; dossierBasis: string;
}
export interface FinancialRetentionPolicy {
  id: string; policy_key: string; legal_entity: string; revision: number; title_en: string; title_vi: string; purpose: string;
  source_version_id: string; source_checksum: string; effective_from: string; effective_until: string;
  file_days: number | null; file_anchor: typeof FINANCIAL_FILE_ANCHORS[number] | null; file_basis: string;
  dossier_days: number | null; dossier_anchor: typeof FINANCIAL_DOSSIER_ANCHORS[number] | null; dossier_basis: string;
  state: "draft" | "reviewed" | "active" | "retired" | "rejected";
  created_by: string; created_at: string; reviewed_by: string | null; reviewed_at: string | null; review_reason: string | null;
  activated_by: string | null; activated_at: string | null; version: number; actor_id: string; updated_at: string;
  source_file_id?: string | null;
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string") throw new HrmError("financial_retention_invalid", 400);
  const result = value.trim();
  if (!result || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result)) throw new HrmError("financial_retention_invalid", 400);
  return result;
}
function reference(value: unknown): string {
  const result = text(value, 120);
  if (!/^[A-Za-z0-9_-]+$/.test(result)) throw new HrmError("financial_retention_invalid", 400);
  return result;
}
export function parseFinancialRetentionPolicy(input: FinancialRetentionPolicyInput): FinancialRetentionPolicyInput {
  const policyKey = text(input.policyKey, 80);
  if (!/^[A-Z][A-Z0-9_-]{1,79}$/.test(policyKey)) throw new HrmError("financial_retention_invalid", 400);
  const titleEn = text(input.titleEn, 160), titleVi = text(input.titleVi, 160);
  if (/[\r\n]/.test(titleEn + titleVi)) throw new HrmError("financial_retention_invalid", 400);
  const effectiveFrom = date(input.effectiveFrom), effectiveUntil = date(input.effectiveUntil);
  if (!effectiveFrom || !effectiveUntil || effectiveUntil < effectiveFrom) throw new HrmError("financial_retention_invalid", 400);
  const rule = (days: number | null, anchor: string | null, allowed: readonly string[]) => {
    if (days === null) { if (anchor !== null) throw new HrmError("financial_retention_invalid", 400); }
    else if (!Number.isSafeInteger(days) || days < 1 || days > 36500 || !allowed.includes(anchor ?? "")) throw new HrmError("financial_retention_invalid", 400);
  };
  rule(input.fileDays, input.fileAnchor, FINANCIAL_FILE_ANCHORS); rule(input.dossierDays, input.dossierAnchor, FINANCIAL_DOSSIER_ANCHORS);
  return { policyKey, titleEn, titleVi, purpose: text(input.purpose, 1000), sourceVersionId: reference(input.sourceVersionId),
    effectiveFrom, effectiveUntil, fileDays: input.fileDays, fileAnchor: input.fileAnchor, fileBasis: text(input.fileBasis, 1000),
    dossierDays: input.dossierDays, dossierAnchor: input.dossierAnchor, dossierBasis: text(input.dossierBasis, 1000) };
}
export async function financialPolicyActor(db: D1Database, content: D1Database, user: WorkspaceUser, permission: Permission): Promise<WorkspaceUser> {
  for (const required of [permission, "hrm.payroll.approve", "hrm.offboarding.manage"] as Permission[]) requirePermission(user, required);
  const current = await reportAccount(db, content, user.id, permission);
  if (!current.can("hrm.payroll.approve") || !current.can("hrm.offboarding.manage")) throw new HrmError("forbidden", 403);
  return current;
}
export function financialPolicyAuthority(db: D1Database, current: WorkspaceUser, permission: Permission): D1PreparedStatement[] {
  return [...reportAuthority(db, current, permission), ...reportAuthority(db, current, "hrm.payroll.approve"), ...reportAuthority(db, current, "hrm.offboarding.manage")];
}
async function previous(db: D1Database, user: WorkspaceUser, key: string, operation: string, payload: unknown): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) throw new HrmError("invalid_request_key");
  const row = await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id, key).first<{ operation: string; payload_hash: string; result_id: string }>();
  if (!row) return null;
  if (row.operation !== operation || row.payload_hash !== await digest(JSON.stringify(payload))) throw new HrmError("request_key_conflict", 409);
  return row.result_id;
}
async function source(db: D1Database, bucket: R2Bucket, sourceVersionId: string, entity: string) {
  const row = await db.prepare("SELECT v.source_checksum,f.object_key,f.size_bytes FROM hrm_legal_template_versions v JOIN hrm_legal_files f ON f.id=v.source_file_id WHERE v.id=? AND v.legal_entity=?").bind(sourceVersionId, entity).first<{ source_checksum: string; object_key: string; size_bytes: number }>();
  const valid = row && await db.prepare(`SELECT 1 FROM (SELECT ? AS source_version_id,? AS source_checksum,? AS legal_entity) p WHERE ${closeoutPolicySourceSql}`).bind(sourceVersionId, row.source_checksum, entity).first();
  if (!row || !valid) throw new HrmError("financial_retention_source_required", 409);
  const object = await bucket.head(row.object_key);
  if (!object || object.size !== row.size_bytes || object.customMetadata?.sha256 !== row.source_checksum) throw new HrmError("financial_retention_source_required", 409);
  return row;
}
export async function activeFinancialRetentionPolicy(db:D1Database,bucket:R2Bucket,policyId:string,entity:string):Promise<FinancialRetentionPolicy>{
  const row=await db.prepare("SELECT * FROM hrm_financial_retention_policy_versions WHERE id=? AND legal_entity=? AND state='active'").bind(reference(policyId),entity).first<FinancialRetentionPolicy>();
  if(!row)throw new HrmError("financial_retention_source_required",409);
  if(row.effective_from>localDate()||row.effective_until<localDate())throw new HrmError("financial_retention_expired",409);
  await source(db,bucket,row.source_version_id,row.legal_entity);return row;
}
export async function verifyFinancialRetentionSource(db:D1Database,bucket:R2Bucket,policy:FinancialRetentionPolicy):Promise<void>{
  await source(db,bucket,policy.source_version_id,policy.legal_entity);
}
export async function listFinancialRetentionPolicies(db: D1Database, content: D1Database, user: WorkspaceUser, after?: { policyKey: string; revision: number }): Promise<{ items: FinancialRetentionPolicy[]; next: { policyKey: string; revision: number } | null }> {
  await financialPolicyActor(db, content, user, "hrm.retention.review"); const config = await settings(db);
  if (after && (!/^[A-Z][A-Z0-9_-]{1,79}$/.test(after.policyKey) || !Number.isSafeInteger(after.revision) || after.revision < 1)) throw new HrmError("financial_retention_invalid", 400);
  const rows = (await db.prepare(`SELECT p.*,v.source_file_id FROM hrm_financial_retention_policy_versions p LEFT JOIN hrm_legal_template_versions v ON v.id=p.source_version_id WHERE p.legal_entity=?${after ? " AND (p.policy_key>? OR (p.policy_key=? AND p.revision<?))" : ""} ORDER BY p.policy_key,p.revision DESC LIMIT 51`)
    .bind(config.legal_entity, ...(after ? [after.policyKey, after.policyKey, after.revision] : [])).all<FinancialRetentionPolicy>()).results;
  const items = rows.slice(0, 50), last = items.at(-1);
  return { items, next: rows.length > 50 && last ? { policyKey: last.policy_key, revision: last.revision } : null };
}
export async function createFinancialRetentionPolicy(db: D1Database, content: D1Database, bucket: R2Bucket, user: WorkspaceUser, key: string, value: FinancialRetentionPolicyInput): Promise<string> {
  let current = await financialPolicyActor(db, content, user, "hrm.retention.manage");
  const input = parseFinancialRetentionPolicy(value), config = await settings(db);
  if (!config.legal_entity) throw new HrmError("hrm_entity_unconfigured", 409);
  const checked = await source(db, bucket, input.sourceVersionId, config.legal_entity), payload = { ...input, legalEntity: config.legal_entity, sourceChecksum: checked.source_checksum };
  const prior = await previous(db, current, key, "financial_retention_policy_create", payload); if (prior) return prior;
  const latest = await db.prepare("SELECT COALESCE(MAX(revision),0) AS revision FROM hrm_financial_retention_policy_versions WHERE policy_key=? AND legal_entity=?").bind(input.policyKey, config.legal_entity).first<{ revision: number }>();
  const revision = (latest?.revision ?? 0) + 1, policyId = id("financial_retention"), time = now();
  current = await financialPolicyActor(db, content, user, "hrm.retention.manage");
  await command(db, current, key, "financial_retention_policy_create", payload, policyId, [
    ...financialPolicyAuthority(db, current, "hrm.retention.manage"),
    guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND legal_entity=? AND version=?)", [config.legal_entity, config.version]),
    guardBoolean(db, "NOT EXISTS(SELECT 1 FROM hrm_financial_retention_policy_versions WHERE policy_key=? AND legal_entity=? AND revision=?)", [input.policyKey, config.legal_entity, revision]),
    guardBoolean(db, `EXISTS(SELECT 1 FROM (SELECT ? AS source_version_id,? AS source_checksum,? AS legal_entity) p WHERE ${closeoutPolicySourceSql})`, [input.sourceVersionId, checked.source_checksum, config.legal_entity]),
  ], [
    db.prepare(`INSERT INTO hrm_financial_retention_policy_versions(id,policy_key,legal_entity,revision,title_en,title_vi,purpose,source_version_id,source_checksum,effective_from,effective_until,file_days,file_anchor,file_basis,dossier_days,dossier_anchor,dossier_basis,created_by,created_at,actor_id,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(policyId, input.policyKey, config.legal_entity, revision, input.titleEn, input.titleVi, input.purpose, input.sourceVersionId, checked.source_checksum, input.effectiveFrom, input.effectiveUntil, input.fileDays, input.fileAnchor, input.fileBasis, input.dossierDays, input.dossierAnchor, input.dossierBasis, current.id, time, current.id, time),
    db.prepare("INSERT INTO hrm_financial_retention_events(policy_id,event_type,detail_json,actor_id,created_at) VALUES(?,'created',?,?,?)").bind(policyId, JSON.stringify({ revision }), current.id, time),
  ]);
  return policyId;
}
export async function actOnFinancialRetentionPolicy(db: D1Database, content: D1Database, bucket: R2Bucket, user: WorkspaceUser, key: string, input: { policyId: string; version: number; action: "approve" | "reject" | "activate" | "retire"; reason: string }): Promise<void> {
  const permission: Permission = input.action === "activate" || input.action === "retire" ? "hrm.retention.activate" : "hrm.retention.review";
  let current = await financialPolicyActor(db, content, user, permission);
  if (!Number.isSafeInteger(input.version) || input.version < 1 || !["approve", "reject", "activate", "retire"].includes(input.action)) throw new HrmError("financial_retention_invalid", 400);
  const payload = { ...input, policyId: reference(input.policyId), reason: text(input.reason, 500) };
  if (await previous(db, current, key, "financial_retention_policy_action", payload)) return;
  const config = await settings(db), row = await db.prepare("SELECT * FROM hrm_financial_retention_policy_versions WHERE id=? AND legal_entity=?").bind(payload.policyId, config.legal_entity).first<FinancialRetentionPolicy>();
  if (!row) throw new HrmError("not_found", 404); if (row.created_by === current.id) throw new HrmError("self_approval", 403);
  const reviewing = input.action === "approve" || input.action === "reject", activating = input.action === "activate";
  const expected = reviewing ? "draft" : activating ? "reviewed" : "active", next = input.action === "approve" ? "reviewed" : input.action === "reject" ? "rejected" : activating ? "active" : "retired";
  if (row.state !== expected || row.version !== input.version) throw new HrmError("conflict", 409);
  if ((activating || input.action === "approve") && row.effective_until < localDate()) throw new HrmError("financial_retention_expired", 409);
  if (activating || input.action === "approve") await source(db, bucket, row.source_version_id, row.legal_entity);
  current = await financialPolicyActor(db, content, user, permission);
  const time = now(), guards = [...financialPolicyAuthority(db, current, permission),
    guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND legal_entity=? AND version=?)", [row.legal_entity, config.version]),
    guardBoolean(db, "EXISTS(SELECT 1 FROM hrm_financial_retention_policy_versions WHERE id=? AND version=? AND state=? AND created_by!=?)", [row.id, input.version, expected, current.id])];
  if (activating || input.action === "approve") guards.push(guardBoolean(db, `EXISTS(SELECT 1 FROM hrm_financial_retention_policy_versions p WHERE p.id=? AND ${closeoutPolicySourceSql})`, [row.id]));
  const writes: D1PreparedStatement[] = [];
  if (activating) writes.push(
    db.prepare("INSERT INTO hrm_financial_retention_events(policy_id,event_type,detail_json,actor_id,created_at) SELECT id,'replaced',?,?,? FROM hrm_financial_retention_policy_versions WHERE legal_entity=? AND policy_key=? AND state='active' AND id!=?").bind(JSON.stringify({ replacementPolicyId: row.id, reason: payload.reason }), current.id, time, row.legal_entity, row.policy_key, row.id),
    db.prepare("UPDATE hrm_financial_retention_policy_versions SET state='retired',version=version+1,actor_id=?,updated_at=? WHERE legal_entity=? AND policy_key=? AND state='active' AND id!=?").bind(current.id, time, row.legal_entity, row.policy_key, row.id));
  writes.push(db.prepare(`UPDATE hrm_financial_retention_policy_versions SET state=?,version=version+1,actor_id=?,updated_at=?${reviewing ? ",reviewed_by=?,reviewed_at=?,review_reason=?" : activating ? ",activated_by=?,activated_at=?" : ""} WHERE id=? AND version=? AND state=?`)
    .bind(next, current.id, time, ...(reviewing ? [current.id, time, payload.reason] : activating ? [current.id, time] : []), row.id, input.version, expected));
  writes.push(db.prepare("INSERT INTO hrm_financial_retention_events(policy_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,?,?,?)").bind(row.id, input.action, JSON.stringify({ reason: payload.reason, revision: row.revision }), current.id, time));
  await command(db, current, key, "financial_retention_policy_action", payload, row.id, guards, writes);
}
