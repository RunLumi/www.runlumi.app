#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { argv } from "node:process";

const MAX_SQL_PATCH_BYTES = 48 * 1024;
const MAX_STATEMENTS_PER_PATCH = 40;
const ROLE_TABLES = {
  workspace_members: ["user_id", "enabled", "granted_by", "created_at", "updated_at"],
  workspace_roles: ["user_id", "role", "granted_by", "granted_at"],
  workspace_audit: ["id", "actor_id", "actor_name", "action", "target_user_id", "detail", "created_at"],
  crm_api_tokens: ["id","user_id","token_hash","revoked_at","revoked_by"],
  hrm_settings: ["id", "enabled", "legal_entity", "purpose", "retention_policy", "policy_reference", "reviewed_by", "reviewed_at", "version", "updated_by", "updated_at"],
  hrm_legal_holds: ["id", "scope_kind", "person_id", "category", "source_table", "target_file_id", "state", "reason", "placed_by", "placed_at", "released_by", "released_at", "release_reason", "version", "actor_id", "created_at", "updated_at"],
  hrm_closeout_file_holds: ["id", "case_id", "file_id", "state", "reason", "placed_by", "placed_at", "released_by", "released_at", "release_reason", "version"],
  hrm_lifecycle_events: ["id", "actor_id", "action", "person_id", "employment_id", "source_application_id", "offboarding_case_id", "target_id", "detail", "created_at"],
};
const createdAt = () => new Date().toISOString();
const identifier = value => typeof value === "string" && /^[A-Za-z0-9_:-]{1,160}$/.test(value);
const isoUtc = value => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function hasTable(db, name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}
function requireTables(db) {
  for (const [table, columns] of Object.entries(ROLE_TABLES)) {
    if (!hasTable(db, table)) throw new Error(`required table missing: ${table}`);
    const present = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name));
    if (columns.some(column => !present.has(column))) throw new Error(`required column missing: ${table}`);
  }
}
function all(db, table, orderBy) {
  const columns = ROLE_TABLES[table];
  return db.prepare(`SELECT ${columns.map(column => `\"${column}\"`).join(",")} FROM \"${table}\" ORDER BY ${orderBy}`).all();
}
function rowKey(table, row) {
  if (table === "workspace_roles") return `${row.user_id}\u0000${row.role}`;
  return String(row.id ?? row.user_id);
}
function sameRow(columns,left,right){return columns.every(column=>Object.is(left[column],right[column]));}
function literal(value) {
  if (value === null) return "NULL";
  if (typeof value === "string") {
    if (value.includes(String.fromCharCode(0))) throw new Error("authority text contains a non-importable NUL");
    return `'${value.replaceAll("'", "''")}'`;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  throw new Error("authority patch refuses a non-string/non-integer value");
}
function tuple(columns, row) {
  return `(${columns.map(column => literal(row[column])).join(",")})`;
}
function statementsPatch(name, statements) {
  if (!statements.length) return [];
  const patches = []; let batch = [], size = 0;
  for (const statement of statements) {
    const bytes = Buffer.byteLength(statement + ";\n");
    if (bytes > MAX_SQL_PATCH_BYTES) throw new Error(`one authority statement exceeds the private patch limit: ${name}`);
    if (batch.length && (batch.length >= MAX_STATEMENTS_PER_PATCH || size + bytes > MAX_SQL_PATCH_BYTES)) {
      patches.push({ name: `${name}-${String(patches.length + 1).padStart(4, "0")}.sql`, sql: batch.join(";\n") + ";\n" }); batch = []; size = 0;
    }
    batch.push(statement); size += bytes;
  }
  if (batch.length) patches.push({ name: `${name}-${String(patches.length + 1).padStart(4, "0")}.sql`, sql: batch.join(";\n") + ";\n" });
  return patches;
}
function indexRows(table, rows) {
  const result = new Map();
  for (const row of rows) {
    const key = rowKey(table, row);
    if (result.has(key)) throw new Error(`duplicate authority row in ${table}`);
    result.set(key, row);
  }
  return result;
}

function planHoldHistory(db,table,columns,identityColumns,sourceRows){
  const releaseBefore=[],restoration=[];
  for(const row of sourceRows){
    if(typeof row.id!=="string"||!row.id||! ["active","released"].includes(row.state)||!Number.isSafeInteger(row.version))throw new Error(`invalid current hold snapshot: ${table}`);
    const old=db.prepare(`SELECT * FROM "${table}" WHERE id=?`).get(row.id);
    if(old){
      if(identityColumns.some(column=>!Object.is(old[column],row[column])))throw new Error(`conflicting immutable hold identity: ${table}`);
      if(old.state===row.state&&sameRow(columns,old,row))continue;
      if(old.state==="active"&&row.state==="released"&&row.version===Number(old.version)+1&&identifier(row.released_by)&&isoUtc(row.released_at)&&typeof row.release_reason==="string"&&row.release_reason.trim()){
        releaseBefore.push(table==="hrm_legal_holds"
          ? `UPDATE hrm_legal_holds SET state='released',released_by=${literal(row.released_by)},released_at=${literal(row.released_at)},release_reason=${literal(row.release_reason)},version=${row.version},actor_id=${literal(row.actor_id)},updated_at=${literal(row.updated_at)} WHERE id=${literal(row.id)} AND state='active' AND version=${old.version}`
          : `UPDATE hrm_closeout_file_holds SET state='released',released_by=${literal(row.released_by)},released_at=${literal(row.released_at)},release_reason=${literal(row.release_reason)},version=${row.version} WHERE id=${literal(row.id)} AND state='active' AND version=${old.version}`);
        continue;
      }
      throw new Error(`hold states cannot be reconciled automatically: ${table}`);
    }
    if(row.state==="active"){
      if(row.version!==1)throw new Error(`new active hold has a non-initial revision: ${table}`);
      restoration.push(`INSERT OR IGNORE INTO "${table}"(${columns.join(",")}) VALUES${tuple(columns,row)}`);
      continue;
    }
    if(row.version!==2||!identifier(row.released_by)||!isoUtc(row.released_at)||typeof row.release_reason!=="string"||!row.release_reason.trim())throw new Error(`new released hold history is incomplete: ${table}`);
    const initial={...row,state:"active",version:1,released_by:null,released_at:null,release_reason:null};
    if(table==="hrm_legal_holds")Object.assign(initial,{actor_id:row.placed_by,updated_at:row.placed_at});
    restoration.push(`INSERT OR IGNORE INTO "${table}"(${columns.join(",")}) VALUES${tuple(columns,initial)}`);
    restoration.push(table==="hrm_legal_holds"
      ? `UPDATE hrm_legal_holds SET state='released',released_by=${literal(row.released_by)},released_at=${literal(row.released_at)},release_reason=${literal(row.release_reason)},version=2,actor_id=${literal(row.actor_id)},updated_at=${literal(row.updated_at)} WHERE id=${literal(row.id)} AND state='active' AND version=1`
      : `UPDATE hrm_closeout_file_holds SET state='released',released_by=${literal(row.released_by)},released_at=${literal(row.released_at)},release_reason=${literal(row.release_reason)},version=2 WHERE id=${literal(row.id)} AND state='active' AND version=1`);
  }
  const rowsToRestore=sourceRows.filter(row=>!db.prepare(`SELECT 1 FROM "${table}" WHERE id=?`).get(row.id)).length;
  const activeRowsToRestore=sourceRows.filter(row=>row.state==="active"&&!db.prepare(`SELECT 1 FROM "${table}" WHERE id=?`).get(row.id)).length;
  return {releaseBefore,restoration,rowsToRestore,activeRowsToRestore};
}

/** Capture the authority and preservation rows that must outlive an older D1 point. */
export function snapshotCurrentWorkspaceAuthority(db, capturedAt = createdAt(), recoveryActor) {
  if (!isoUtc(capturedAt)) throw new Error("capture time must be canonical UTC");
  if(!recoveryActor||!identifier(recoveryActor.id)||typeof recoveryActor.name!=="string"||!recoveryActor.name.trim()||recoveryActor.name.length>160||/[\u0000-\u001f\u007f]/u.test(recoveryActor.name))throw new Error("a current System Super Admin audit actor is required");
  requireTables(db);
  const members = all(db, "workspace_members", "user_id");
  const memberIds = new Set(members.map(row => row.user_id));
  if (members.some(row => !identifier(row.user_id) || ![0, 1].includes(row.enabled) || !identifier(row.granted_by) || !isoUtc(row.created_at) || !isoUtc(row.updated_at))) throw new Error("invalid current Workspace membership snapshot");
  const roles = all(db, "workspace_roles", "user_id,role");
  if (roles.some(row => !memberIds.has(row.user_id) || !identifier(row.granted_by) || !isoUtc(row.granted_at))) throw new Error("current Workspace role has no membership row");
  const settings = db.prepare("SELECT id,enabled,legal_entity,purpose,retention_policy,policy_reference,reviewed_by,reviewed_at,version,updated_by,updated_at FROM hrm_settings WHERE id=1").get();
  if (!settings || ![0, 1].includes(settings.enabled) || !Number.isSafeInteger(settings.version) || (settings.updated_at!==null&&!isoUtc(settings.updated_at))) throw new Error("invalid current HRM gate snapshot");
  return {
    version: 1,
    capturedAt,
    recoveryActor:{id:recoveryActor.id,name:recoveryActor.name.trim()},
    members,
    roles,
    audit: all(db, "workspace_audit", "id"),
    revokedTokens:db.prepare("SELECT id,user_id,token_hash,revoked_at,revoked_by FROM crm_api_tokens WHERE revoked_at IS NOT NULL ORDER BY id").all(),
    settings,
    legalHolds: all(db, "hrm_legal_holds", "id"),
    closeoutFileHolds: all(db, "hrm_closeout_file_holds", "id"),
    lifecycleEvents: all(db, "hrm_lifecycle_events", "id"),
  };
}

/**
 * Build ordered D1 SQL stages from a current source and the pre-restore target.
 * The first stage disables all members and HRM before rebuilding the shared
 * allowlist. The last stage re-enables only current memberships; any failed
 * stage leaves the system fail-closed. Apply returned files in array order.
 */
export function buildWorkspaceRestorePatches(targetDb, snapshot) {
  if (!snapshot || snapshot.version !== 1 || !isoUtc(snapshot.capturedAt)) throw new Error("unsupported Workspace authority snapshot");
  requireTables(targetDb);
  const requiredLists=[snapshot.members,snapshot.roles,snapshot.audit,snapshot.revokedTokens,snapshot.legalHolds,snapshot.closeoutFileHolds,snapshot.lifecycleEvents];
  if(requiredLists.some(value=>!Array.isArray(value))||!snapshot.settings||typeof snapshot.settings!=="object") throw new Error("authority snapshot is incomplete");
  if (snapshot.members.some(row => !identifier(row.user_id) || ![0, 1].includes(row.enabled) || !identifier(row.granted_by) || !isoUtc(row.created_at) || !isoUtc(row.updated_at))) throw new Error("invalid current Workspace membership snapshot");
  const sourceMemberIds = new Set(snapshot.members.map(row => row.user_id));
  if (snapshot.roles.some(row => !sourceMemberIds.has(row.user_id) || !identifier(row.granted_by) || !isoUtc(row.granted_at))) throw new Error("current Workspace role has no membership row");
  const sourceSettings = snapshot.settings;
  if (sourceSettings.id !== 1 || ![0, 1].includes(sourceSettings.enabled) || !Number.isSafeInteger(sourceSettings.version) || (sourceSettings.updated_at!==null&&!isoUtc(sourceSettings.updated_at))) throw new Error("invalid current HRM gate snapshot");
  const targetSettings = targetDb.prepare("SELECT id,version FROM hrm_settings WHERE id=1").get();
  if (!targetSettings) throw new Error("restored D1 is missing the singleton HRM settings row");
  const gateVersion = Math.max(sourceSettings.version, targetSettings.version) + 1;
  const stamp = snapshot.capturedAt;
  const patches = [];
  if(!snapshot.recoveryActor||!identifier(snapshot.recoveryActor.id)||typeof snapshot.recoveryActor.name!=="string"||!snapshot.recoveryActor.name.trim())throw new Error("restore operator audit identity is missing");
  const targetMembersForAudit=all(targetDb,"workspace_members","user_id");
  const targetRolesByUser=new Map();
  for(const row of all(targetDb,"workspace_roles","user_id,role")){const value=targetRolesByUser.get(row.user_id)??[];value.push(row.role);targetRolesByUser.set(row.user_id,value.sort())}
  const currentRolesByUser=new Map();
  for(const row of snapshot.roles){const value=currentRolesByUser.get(row.user_id)??[];value.push(row.role);currentRolesByUser.set(row.user_id,value.sort())}
  const restoreAuditId=(phase,userId)=>`aud_restore_${createHash("sha256").update(`${phase}\n${snapshot.capturedAt}\n${userId}`).digest("hex").slice(0,40)}`;
  const restoreAuditRow=(phase,userId,before,after)=>({id:restoreAuditId(phase,userId),actor_id:snapshot.recoveryActor.id,actor_name:snapshot.recoveryActor.name,action:phase==="lock"?"access_revoked":"access_saved",target_user_id:userId,detail:JSON.stringify({source:"current_authority_restore",phase,roles_before:before,roles_after:after}),created_at:stamp});
  const targetAuditMap=indexRows("workspace_audit",all(targetDb,"workspace_audit","id"));
  const recoveryLockAudit=targetMembersForAudit.filter(row=>row.enabled===1).map(row=>restoreAuditRow("lock",row.user_id,targetRolesByUser.get(row.user_id)??[],[]));
  const recoveryEnableAudit=snapshot.members.filter(row=>row.enabled===1).map(row=>restoreAuditRow("recover",row.user_id,targetRolesByUser.get(row.user_id)??[],currentRolesByUser.get(row.user_id)??[]));
  for(const row of [...recoveryLockAudit,...recoveryEnableAudit]){const old=targetAuditMap.get(row.id);if(old&&!sameRow(ROLE_TABLES.workspace_audit,old,row))throw new Error("conflicting restore-operator audit identity");}
  patches.push(...statementsPatch("01-disable-and-lock", [
    `UPDATE hrm_settings SET enabled=0,reviewed_by=NULL,reviewed_at=NULL,version=${gateVersion},updated_by='system:hrm-restore',updated_at=${literal(stamp)} WHERE id=1`,
    `UPDATE workspace_members SET enabled=0,granted_by='system:hrm-restore',updated_at=${literal(stamp)} WHERE enabled!=0`,
    "DELETE FROM workspace_roles",
    ...recoveryLockAudit.map(row=>`INSERT OR IGNORE INTO workspace_audit(id,actor_id,actor_name,action,target_user_id,detail,created_at) VALUES${tuple(ROLE_TABLES.workspace_audit,row)}`),
  ]));
  const disabledMembers = snapshot.members.map(row => ({ ...row, enabled: 0 }));
  const memberStatements = [];
  for (const row of disabledMembers) memberStatements.push(`INSERT INTO workspace_members(user_id,enabled,granted_by,created_at,updated_at) VALUES${tuple(ROLE_TABLES.workspace_members,row)} ON CONFLICT(user_id) DO UPDATE SET enabled=0,granted_by=excluded.granted_by,created_at=excluded.created_at,updated_at=excluded.updated_at`);
  patches.push(...statementsPatch("02-members", memberStatements));
  const roleStatements = snapshot.roles.map(row => `INSERT INTO workspace_roles(user_id,role,granted_by,granted_at) VALUES${tuple(ROLE_TABLES.workspace_roles,row)}`);
  patches.push(...statementsPatch("03-roles", roleStatements));
  const tokenStatements=[];
  for(const row of snapshot.revokedTokens){
    if(!identifier(row.id)||!identifier(row.user_id)||typeof row.token_hash!=="string"||!/^[a-f0-9]{64}$/.test(row.token_hash)||!isoUtc(row.revoked_at)||!identifier(row.revoked_by))throw new Error("invalid current CRM token revocation snapshot");
    const old=targetDb.prepare("SELECT user_id,token_hash,revoked_at,revoked_by FROM crm_api_tokens WHERE id=?").get(row.id);
    if(!old)continue; // Token created after the restore point: do not recreate a lost credential.
    if(old.user_id!==row.user_id||old.token_hash!==row.token_hash)throw new Error("conflicting immutable API token identity between restore points");
    if(old.revoked_at!==null){if(old.revoked_at===row.revoked_at&&old.revoked_by===row.revoked_by)continue;if(Date.parse(old.revoked_at)>=Date.parse(row.revoked_at))continue;}
    tokenStatements.push(`UPDATE crm_api_tokens SET revoked_at=${literal(row.revoked_at)},revoked_by=${literal(row.revoked_by)} WHERE id=${literal(row.id)} AND user_id=${literal(row.user_id)} AND revoked_at IS NULL`);
  }
  patches.push(...statementsPatch("04-revoke-current-api-tokens",tokenStatements));

  const targetAudit = indexRows("workspace_audit", all(targetDb, "workspace_audit", "id"));
  const auditStatements = [];
  for (const row of snapshot.audit) {
    if (!identifier(row.id) || !identifier(row.actor_id) || typeof row.actor_name !== "string" || typeof row.action !== "string" || !identifier(row.target_user_id) || typeof row.detail !== "string" || !isoUtc(row.created_at)) throw new Error("invalid Workspace audit snapshot");
    const old = targetAudit.get(row.id);
    if (old) { if (!sameRow(ROLE_TABLES.workspace_audit,old,row)) throw new Error("conflicting Workspace audit IDs between restore points"); }
    else auditStatements.push(`INSERT OR IGNORE INTO workspace_audit(id,actor_id,actor_name,action,target_user_id,detail,created_at) VALUES${tuple(ROLE_TABLES.workspace_audit,row)}`);
  }

  const lifecycleColumns=ROLE_TABLES.hrm_lifecycle_events, targetEvents=indexRows("hrm_lifecycle_events",all(targetDb,"hrm_lifecycle_events","id")), eventStatements=[];
  for(const row of snapshot.lifecycleEvents){
    const old=targetEvents.get(String(row.id));
    if(old){if(!sameRow(lifecycleColumns,old,row))throw new Error("conflicting HRM lifecycle event IDs between restore points");}
    else eventStatements.push(`INSERT OR IGNORE INTO hrm_lifecycle_events(${lifecycleColumns.join(",")}) VALUES${tuple(lifecycleColumns,row)}`);
  }
  const legal=planHoldHistory(targetDb,"hrm_legal_holds",ROLE_TABLES.hrm_legal_holds,["id","scope_kind","person_id","category","source_table","target_file_id","reason","placed_by","placed_at","created_at"],snapshot.legalHolds);
  const closeout=planHoldHistory(targetDb,"hrm_closeout_file_holds",ROLE_TABLES.hrm_closeout_file_holds,["id","case_id","file_id","reason","placed_by","placed_at"],snapshot.closeoutFileHolds);
  patches.push(...statementsPatch("05-release-current-holds",[...legal.releaseBefore,...closeout.releaseBefore]));
  patches.push(...statementsPatch("06-restore-current-holds",[...legal.restoration,...closeout.restoration]));
  patches.push(...statementsPatch("07-restore-audit-and-events",[...auditStatements,...eventStatements]));
  const enable = snapshot.members.filter(row => row.enabled===1).map(row => `UPDATE workspace_members SET enabled=1,granted_by=${literal(snapshot.recoveryActor.id)},updated_at=${literal(stamp)} WHERE user_id=${literal(row.user_id)}`);
  patches.push(...statementsPatch("08-enable-current-members",[...enable,...recoveryEnableAudit.map(row=>`INSERT OR IGNORE INTO workspace_audit(id,actor_id,actor_name,action,target_user_id,detail,created_at) VALUES${tuple(ROLE_TABLES.workspace_audit,row)}`)]));
  return { patches, summary: { members: snapshot.members.length, roles: snapshot.roles.length, apiTokenRevocationsToRestore:tokenStatements.length,auditEventsToRestore: auditStatements.length,
    holdRowsToRestore:legal.rowsToRestore+closeout.rowsToRestore,
    activeHoldsToRestore:legal.activeRowsToRestore+closeout.activeRowsToRestore,
    lifecycleEventsToRestore: eventStatements.length, hrmForcedClosed: true, currentEnabledMembers: enable.length,restoreAuditEvents:recoveryLockAudit.length+recoveryEnableAudit.length } };
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index++) {
    const key = values[index]; if (!key.startsWith("--")) throw new Error("expected a named argument");
    const value = values[++index]; if (!value || value.startsWith("--") || key in result) throw new Error("missing or duplicate argument");
    result[key] = value;
  }
  if (Object.keys(result).length !== 5 || !result["--current"] || !result["--restored"] || !result["--output-dir"] || !result["--operator-id"] || !result["--operator-name"]) throw new Error("usage: node scripts/reconcile-workspace-restore.mjs --current <private-current-export.sql> --restored <private-restored-export.sql> --output-dir <new-private-directory> --operator-id <current-EmDash-System-Super-Admin-id> --operator-name <current-EmDash-System-Super-Admin-name>");
  return { current: resolve(result["--current"]), restored: resolve(result["--restored"]), output: resolve(result["--output-dir"]),operator:{id:result["--operator-id"],name:result["--operator-name"]} };
}

async function main() {
  let current,restored;
  try {
    const args=parseArgs(argv.slice(2));
    const repositoryRoot=resolve(new URL("..",import.meta.url).pathname);
    const insideRepo=path=>{const rel=relative(repositoryRoot,path);return !rel.startsWith("..")&&!isAbsolute(rel)};
    if(insideRepo(args.current)||insideRepo(args.restored)||insideRepo(args.output))throw new Error("recovery exports and patch files must stay outside the repository");
    for(const input of [args.current,args.restored]){const info=await lstat(input);if(!info.isFile()||(info.mode&0o077)!==0)throw new Error("recovery export must be a private regular file (mode 0600 or stricter)");}
    await mkdir(args.output,{recursive:false,mode:0o700});
    const currentSQL=await readFile(args.current,"utf8"),restoredSQL=await readFile(args.restored,"utf8");
    current=new DatabaseSync(":memory:");current.exec(currentSQL);
    restored=new DatabaseSync(":memory:");restored.exec(restoredSQL);
    let snapshot;
    try { snapshot=snapshotCurrentWorkspaceAuthority(current,createdAt(),args.operator); }
    catch(error) { throw new Error(`current D1 export validation: ${error instanceof Error?error.message:"unknown validation error"}`); }
    let plan;
    try { plan=buildWorkspaceRestorePatches(restored,snapshot); }
    catch(error) { throw new Error(`restored D1 export validation: ${error instanceof Error?error.message:"unknown validation error"}`); }
    if(!plan.patches.length)throw new Error("authority reconciliation produced no locked patch plan");
    for(const patch of plan.patches)await writeFile(resolve(args.output,patch.name),patch.sql,{flag:"wx",mode:0o600});
    const manifest={ version:1,source_sha256:createHash("sha256").update(currentSQL).digest("hex"),restored_sha256:createHash("sha256").update(restoredSQL).digest("hex"),captured_at:snapshot.capturedAt,patches:plan.patches.map(patch=>({name:patch.name,sha256:createHash("sha256").update(patch.sql).digest("hex")})),summary:plan.summary };
    await writeFile(resolve(args.output,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",{flag:"wx",mode:0o600});
    process.stdout.write(`Recovery patch plan ready: ${plan.patches.length} SQL stages, ${plan.summary.members} Workspace memberships, ${plan.summary.roles} roles, HRM forced closed. Patch contents and identifiers remain in the private output directory. Apply stages in filename order; stop on any error.\n`);
  } catch (error) {
    const message=error instanceof Error?error.message:"";
    const reason=/^current D1 export validation:.*(?:required (?:table|column) missing|no such table)/i.test(message)?"current authority D1 export is missing required schema":/^restored D1 export validation:.*(?:required (?:table|column) missing|no such table)/i.test(message)?"restored D1 export is missing required schema":/required (?:table|column) missing|no such table/i.test(message)?"required D1 schema is absent":/conflict|duplicate authority|immutable hold identity/i.test(message)?"immutable identity or history conflict":/foreign key constraint failed/i.test(message)?"current hold or event references a record absent from the restore point":/private regular file|outside the repository|private output/i.test(message)?"recovery file permissions or location are invalid":/syntax error|SQLITE_ERROR|near .+ syntax/i.test(message)?"D1 export is not valid SQLite SQL":/invalid|unsupported|incomplete|must be|required/i.test(message)?"current authority snapshot failed validation":"schema or recovery-plan validation failed";
    process.stderr.write(`Could not build a private, schema-valid restore authority patch (${reason}). Keep HRM closed and have the authorized recovery operator resolve the mismatch. No restore or live database write was attempted.\n`);
    process.exitCode=1;
  } finally { current?.close();restored?.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) await main();
