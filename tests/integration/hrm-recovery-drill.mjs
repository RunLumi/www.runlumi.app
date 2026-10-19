// Synthetic-only recovery proof across local D1 snapshots, private R2 objects,
// EmDash revocation state and the actual HRM download route.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AwsClient } from "aws4fetch";
import { BASE, PERSIST, content, jobs, q } from "./helpers.mjs";
import { buildWorkspaceRestorePatches, snapshotCurrentWorkspaceAuthority } from "../../scripts/reconcile-workspace-restore.mjs";

const root = process.cwd();
const wrangler = resolve(root, "node_modules/.bin/wrangler");
const R2_BUCKET = "lumi-job-files";
const R2_PREFIX = "/cdn-cgi/local/r2/s3";
const localS3 = new AwsClient({
  accessKeyId: "test-crm-s3",
  secretAccessKey: "synthetic-local-only-not-for-production",
  service: "s3",
  region: "auto",
  retries: 0,
});

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function runWrangler(args, { cwd = root } = {}) {
  try {
    return execFileSync(wrangler, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    });
  } catch (error) {
    const details = String(error?.stderr ?? error?.stdout ?? "").trim().slice(-1200);
    const command = args.slice(0, 3).join(" ");
    throw new Error(`Synthetic recovery Wrangler step failed: ${command}${details ? `: ${details}` : ""}`);
  }
}

function databaseRows(persist, database, command) {
  const output = runWrangler([
    "d1", "execute", database, "--local", "--persist-to", persist,
    "--json", "--command", command,
  ]);
  return JSON.parse(output)[0].results;
}

async function findLocalDatabaseFile(persist, tableName) {
  const pending = [persist];
  while (pending.length) {
    const current = pending.pop();
    for (const name of await readdir(current)) {
      const path = join(current, name);
      const info = await stat(path);
      if (info.isDirectory()) {
        pending.push(path);
      } else if (name.endsWith(".sqlite")) {
        let found = false;
        let database;
        try {
          database = new DatabaseSync(path, { readOnly: true });
          found = Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tableName));
        } catch {} finally { database?.close(); }
        if (found) return path;
      }
    }
  }
  throw new Error(`Could not find the isolated local D1 file containing ${tableName}.`);
}

async function snapshotLocalDatabase({ sourcePersist, tableName, backupPath, directory }) {
  const snapshotRoot = join(directory, "d1-snapshot");
  await cp(sourcePersist, snapshotRoot, { recursive: true });
  const sourceFile = await findLocalDatabaseFile(snapshotRoot, tableName);
  const database = new DatabaseSync(sourceFile);
  try {
    database.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
  } finally {
    database.close();
  }
  return sourceFile;
}

function s3Url(base, key, query = {}) {
  const encodedKey = key ? `/${key.split("/").map(encodeURIComponent).join("/")}` : "";
  const url = new URL(`${base}${R2_PREFIX}/${R2_BUCKET}${encodedKey}`);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  return url;
}

async function s3Request(base, method, key, { query = {}, headers = {}, body } = {}) {
  return localS3.fetch(s3Url(base, key, query), {
    method,
    headers,
    body,
    aws: { allHeaders: true },
  });
}

async function listHrmObjects(base) {
  const response = await s3Request(base, "GET", "", { query: { "list-type": "2" } });
  assert.equal(response.status, 200, "the local R2 S3 endpoint must list the synthetic private bucket");
  const xml = await response.text();
  assert.ok(!/<IsTruncated>true<\/IsTruncated>/.test(xml), "synthetic HRM fixture should fit in one local R2 listing page");
  return [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)]
    .map((match) => match[1].replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">"))
    .filter((key) => key.startsWith("hrm/"))
    .sort();
}

async function listenPort() {
  const probe = createServer();
  await new Promise((resolveListen, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolveListen);
  });
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a synthetic recovery port.");
  await new Promise((resolveClose) => probe.close(resolveClose));
  return address.port;
}

async function startRecoveryWorker(persist, port, tempRoot, { restoreMode=false, instance="restored-worker" }={}) {
  const base = `http://127.0.0.1:${port}`;
  const runtimeRoot = join(tempRoot, instance);
  const excluded = new Set([".git", ".wrangler", ".astro", "node_modules", "dist", ".dev.vars", ".env", ".env.local", ".env.production"]);
  await cp(root, runtimeRoot, {
    recursive: true,
    filter: (source) => {
      const path = relative(root, source);
      if (!path) return true;
      const top = path.split(sep)[0];
      return !excluded.has(top) && top !== ".env" && !top.startsWith(".env.");
    },
  });
  await symlink(resolve(root, "node_modules"), join(runtimeRoot, "node_modules"), "dir");
  await mkdir(join(runtimeRoot, "dist"), { recursive: true });
  const recoveryEnv = { ...process.env, CRM_BASE_URL: base, WRANGLER_SEND_METRICS: "false", WORKSPACE_RESTORE_MODE:restoreMode?"true":"false" };
  execFileSync(process.execPath, [join(runtimeRoot, "scripts/prepare-crm-upload-test.mjs")], {
    cwd: runtimeRoot,
    env: recoveryEnv,
    stdio: "ignore",
  });
  const env = {
    ...recoveryEnv,
    LUMI_PERSIST_TO: persist,
    HRM_LIVE_ENABLED: "true",
    ASTRO_DEV_BACKGROUND: "0",
    WRANGLER_SEND_METRICS: "false",
    CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH: join(runtimeRoot, ".wrangler", "crm-upload-test.jsonc"),
  };
  const worker = spawn(process.execPath, [join(runtimeRoot, "node_modules/astro/bin/astro.mjs"), "dev", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: runtimeRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  const capture = (chunk) => {
    logs = `${logs}${chunk}`.slice(-6000);
  };
  worker.stdout.setEncoding("utf8");
  worker.stderr.setEncoding("utf8");
  worker.stdout.on("data", capture);
  worker.stderr.on("data", capture);

  const deadline = Date.now() + 90000;
  const safeLogs = () => logs
    .replace(/[^\s@]+@[^\s@]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b\d{9,15}\b/g, "[redacted-number]")
    .slice(-3000);
  try {
    while (Date.now() < deadline) {
      if (worker.exitCode !== null) throw new Error(`Restored local Worker exited before readiness (exit=${worker.exitCode}).\n${safeLogs()}`);
      try {
        const response = await fetch(`${base}/jobs`, { redirect: "manual" });
        if (response.status < 500) return { worker, base, logs };
      } catch {}
      await new Promise((resolveWait) => setTimeout(resolveWait, 300));
    }
    throw new Error(`Restored local Worker did not become ready in 90 seconds.\n${safeLogs()}`);
  } catch (error) {
    await stopRecoveryWorker(worker);
    throw error;
  }
}

async function stopRecoveryWorker(worker) {
  if (!worker || worker.exitCode !== null) return;
  worker.kill("SIGTERM");
  await new Promise((resolveExit) => {
    const timeout = setTimeout(() => {
      worker.kill("SIGKILL");
      resolveExit();
    }, 5000);
    worker.once("exit", () => {
      clearTimeout(timeout);
      resolveExit();
    });
  });
}

async function assertRestoreFence(worker){
  const privatePaths=["/workspace","/vi/workspace/users","/hrm/people","/vi/hrm/me","/admin/jobs","/api/admin/applications","/api/jobs/test-engineer/apply","/crm","/vi/crm","/api/crm/v1/accounts","/api/intake/local","/finance/actuals","/vi/finance/actuals","/api/hrm/payroll"];
  for(const path of privatePaths){
    const response=await fetch(worker.base+path,{redirect:"manual"});assert.equal(response.status,503,`restore fence closes ${path}`);
    assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(response.headers.get("x-content-type-options"),"nosniff");
  }
  for(const path of ["/","/jobs","/vi","/vi/jobs"]){const response=await fetch(worker.base+path,{redirect:"manual"});assert.equal(response.status,200,`restore fence preserves public ${path}`)}
}

export async function runHrmRecoveryDrill({
  adminCookie,
  employeeCookie,
  managerCookie,
  employeeUserId,
  attachmentId,
  fileId,
  run,
  expectedMembershipEnabled = 1,
  closeoutFileId = null,
  currentWorkspaceRevokedUserId = null,
  recoveryOperator = null,
  afterBackup = null,
}) {
  assert.ok([0,1].includes(expectedMembershipEnabled), "recovery membership expectation must be explicit");
  assert.ok(PERSIST, "recovery drill requires the integration runner's disposable D1/R2 store");
  const file = jobs(`SELECT id,object_key,checksum,size_bytes,mime_type,legal_hold,object_deleted_at
    FROM hrm_files WHERE id=${q(fileId)}`)[0];
  assert.ok(file && !file.object_deleted_at, "recovery fixture must reference a live synthetic HRM file");
  const closeoutFile=closeoutFileId?jobs(`SELECT id,case_id,object_key,checksum,size_bytes,legal_hold,object_deleted_at FROM hrm_closeout_files WHERE id=${q(closeoutFileId)}`)[0]:null;
  if(closeoutFileId){assert.ok(closeoutFile&&!closeoutFile.object_deleted_at);assert.equal(closeoutFile.legal_hold,1,"new financial evidence inherits the explicit person-wide hold")}
  let closeoutHolds=closeoutFile?jobs(`SELECT * FROM hrm_closeout_file_holds WHERE file_id=${q(closeoutFile.id)} ORDER BY id`):[];
  const liveFiles = jobs("SELECT object_key,checksum,size_bytes,mime_type FROM hrm_files WHERE object_deleted_at IS NULL UNION ALL SELECT object_key,checksum,size_bytes,mime_type FROM hrm_legal_files WHERE object_deleted_at IS NULL UNION ALL SELECT object_key,checksum,size_bytes,'application/pdf' AS mime_type FROM hrm_closeout_files WHERE object_deleted_at IS NULL").sort((left, right) => left.object_key.localeCompare(right.object_key));
  const sourceKeys = await listHrmObjects(BASE);
  assert.deepEqual(sourceKeys, liveFiles.map((row) => row.object_key).sort(), "live HRM metadata and private R2 object listings must match before backup");

  const tempRoot = await mkdtemp(join(tmpdir(), "runlumi-hrm-recovery-drill-"));
  const backupRoot = join(tempRoot, "r2-backup");
  await mkdir(backupRoot, { recursive: true });
  const jobsSnapshot = join(tempRoot, "lumi-jobs.sqlite");
  const recoveryPersist = join(tempRoot, "recovery-state");

  let recoveryWorker;
  let disabledForRecovery = false;
  try {
    await snapshotLocalDatabase({
      sourcePersist: PERSIST,
      tableName: "hrm_files",
      backupPath: jobsSnapshot,
      directory: join(tempRoot, "jobs-export"),
    });

    const objects = new Map();
    for (const row of liveFiles) {
      const response = await s3Request(BASE, "GET", row.object_key);
      assert.equal(response.status, 200, "every D1-live HRM object must be downloadable from the private local R2 bucket");
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.length, row.size_bytes);
      assert.equal(digest(bytes), row.checksum, "source R2 bytes must match the D1 checksum before backup");
      const backupPath = join(backupRoot, digest(Buffer.from(row.object_key)));
      await writeFile(backupPath, bytes, { mode: 0o600 });
      const metadata=Object.fromEntries([...response.headers.entries()].filter(([name])=>name.startsWith("x-amz-meta-")));
      objects.set(row.object_key, { backupPath, checksum: row.checksum, size: row.size_bytes, mimeType: row.mime_type,metadata });
    }

    const activeAccount = content(`SELECT id,disabled FROM users WHERE id=${q(employeeUserId)}`)[0];
    assert.ok(activeAccount && activeAccount.disabled === 0, "revocation fixture must be active before the D1 backup point");
    content(`UPDATE users SET disabled=1 WHERE id=${q(employeeUserId)}`);
    disabledForRecovery = true;
    assert.equal(content(`SELECT disabled FROM users WHERE id=${q(employeeUserId)}`)[0].disabled, 1);
    if(currentWorkspaceRevokedUserId){
      assert.ok(typeof afterBackup==="function","current Workspace revocation fixture is required");
      const liveManager=await fetch(`${BASE}/workspace`,{headers:{cookie:managerCookie},redirect:"manual"});assert.equal(liveManager.status,200,"the future-revoked EmDash account has Workspace access before the backup-point change");
      await afterBackup();
      const currentManager=await fetch(`${BASE}/workspace`,{headers:{cookie:managerCookie},redirect:"manual"});assert.equal(currentManager.status,403,"the post-backup Workspace revocation is effective in current D1 before restore");
      assert.equal(content(`SELECT disabled FROM users WHERE id=${q(currentWorkspaceRevokedUserId)}`)[0]?.disabled,0,"the second revocation remains a Workspace-membership test, not an EmDash-disable test");
      if(closeoutFile)closeoutHolds=jobs(`SELECT * FROM hrm_closeout_file_holds WHERE file_id=${q(closeoutFile.id)} ORDER BY id`);
    }

    // Preserve the current shared authorization data before replacing only
    // the isolated recovery D1 file with the earlier backup point.
    await cp(PERSIST, recoveryPersist, { recursive: true });
    recoveryWorker=await startRecoveryWorker(recoveryPersist,await listenPort(),tempRoot,{restoreMode:true,instance:"restore-maintenance-before-time-travel"});
    await assertRestoreFence(recoveryWorker);
    await stopRecoveryWorker(recoveryWorker.worker);recoveryWorker=null;
    const recoveryJobsFile = await findLocalDatabaseFile(recoveryPersist, "hrm_files");
    const currentAuthorityDb=new DatabaseSync(recoveryJobsFile,{readOnly:true});
    let authoritySnapshot;try{authoritySnapshot=snapshotCurrentWorkspaceAuthority(currentAuthorityDb,new Date().toISOString(),recoveryOperator)}finally{currentAuthorityDb.close()}
    for (const suffix of ["", "-wal", "-shm"]) await rm(`${recoveryJobsFile}${suffix}`, { force: true });
    await cp(jobsSnapshot, recoveryJobsFile);
    if(currentWorkspaceRevokedUserId){
      assert.equal(databaseRows(recoveryPersist,"lumi-jobs",`SELECT enabled FROM workspace_members WHERE user_id=${q(currentWorkspaceRevokedUserId)}`)[0]?.enabled,1,"the intentionally restored backup contains the pre-revocation grant");
      assert.equal(databaseRows(recoveryPersist,"lumi-jobs","SELECT enabled FROM hrm_settings WHERE id=1")[0]?.enabled,1,"the intentionally restored backup contains its former HRM-open state");
      recoveryWorker=await startRecoveryWorker(recoveryPersist,await listenPort(),tempRoot,{restoreMode:true,instance:"restore-fence-before-reconcile"});
      for(const [path,cookie]of [["/workspace",adminCookie],["/workspace",managerCookie],["/vi/workspace/users",adminCookie],["/hrm/people",adminCookie],["/vi/hrm/me",employeeCookie],["/admin/jobs",adminCookie],["/crm",managerCookie],["/finance/actuals",adminCookie],["/api/hrm/payroll",adminCookie],["/api/crm/v1/accounts",managerCookie],["/api/admin/applications",adminCookie],["/api/intake/local",null]]){
        const response=await fetch(recoveryWorker.base+path,{headers:cookie?{cookie}: {},redirect:"manual"});assert.equal(response.status,503,`restore maintenance fences ${path}`);assert.ok(response.headers.get("cache-control")?.includes("no-store"));assert.equal(response.headers.get("x-content-type-options"),"nosniff");
      }
      for(const path of ["/jobs","/vi/jobs","/"]){const publicResponse=await fetch(recoveryWorker.base+path,{redirect:"manual"});assert.equal(publicResponse.status,200,`recovery maintenance preserves public ${path}`)}
      await stopRecoveryWorker(recoveryWorker.worker);recoveryWorker=null;
    }
    const restoredDb=new DatabaseSync(recoveryJobsFile);restoredDb.exec("PRAGMA foreign_keys=ON");let authorityPlan;
    try{authorityPlan=buildWorkspaceRestorePatches(restoredDb,authoritySnapshot)}finally{restoredDb.close()}
    for(const patch of authorityPlan.patches){const patchPath=join(tempRoot,patch.name);await writeFile(patchPath,patch.sql,{flag:"wx",mode:0o600});runWrangler(["d1","execute","lumi-jobs","--local","--persist-to",recoveryPersist,"--file",patchPath])}
    const authorityRows=databaseRows(recoveryPersist,"lumi-jobs","SELECT enabled,reviewed_by,reviewed_at FROM hrm_settings WHERE id=1")[0];
    assert.deepEqual(authorityRows,{enabled:0,reviewed_by:null,reviewed_at:null},"a recovered pre-restore HRM configuration is never reactivated");
    if(currentWorkspaceRevokedUserId){
      assert.equal(databaseRows(recoveryPersist,"lumi-jobs",`SELECT enabled FROM workspace_members WHERE user_id=${q(currentWorkspaceRevokedUserId)}`)[0]?.enabled,0,"a revoked Workspace membership is replayed from the current authority snapshot");
      assert.ok(databaseRows(recoveryPersist,"lumi-jobs",`SELECT 1 FROM workspace_audit WHERE target_user_id=${q(currentWorkspaceRevokedUserId)} AND action='access_revoked'`).length>0,"the post-backup Workspace audit record survives D1 restore");
    }

    recoveryWorker = await startRecoveryWorker(recoveryPersist, await listenPort(), tempRoot,{restoreMode:true,instance:"restore-maintenance-after-reconcile"});
    await assertRestoreFence(recoveryWorker);
    await stopRecoveryWorker(recoveryWorker.worker);recoveryWorker=null;
    recoveryWorker = await startRecoveryWorker(recoveryPersist, await listenPort(), tempRoot,{restoreMode:false,instance:"reconciled-workspace"});

    const recoveredMembership = databaseRows(recoveryPersist, "lumi-jobs", `SELECT enabled FROM workspace_members WHERE user_id=${q(employeeUserId)}`)[0];
    assert.equal(recoveredMembership?.enabled, expectedMembershipEnabled, "the recovered D1 snapshot retains the explicitly expected Workspace membership state");
    assert.equal(databaseRows(recoveryPersist, "lumi-content", `SELECT disabled FROM users WHERE id=${q(employeeUserId)}`)[0]?.disabled, 1, "the recovered Worker must use current EmDash revocation state");

    for (const key of sourceKeys) {
      const removeCopy = await s3Request(recoveryWorker.base, "DELETE", key);
      assert.ok([200, 204].includes(removeCopy.status), "only the disposable restored R2 copy is emptied before replaying backup objects");
    }
    assert.deepEqual(await listHrmObjects(recoveryWorker.base), [], "the isolated restore target starts without HRM object bytes");
    for (const [key, object] of objects) {
      const bytes = await readFile(object.backupPath);
      const response = await s3Request(recoveryWorker.base, "PUT", key, {
        headers: { "content-type": object.mimeType,...object.metadata },
        body: bytes,
      });
      assert.ok([200, 201, 204].includes(response.status), "the isolated R2 restore should accept a backed-up HRM object");
      const restoredHead=await s3Request(recoveryWorker.base,"HEAD",key);assert.equal(restoredHead.status,200);
      for(const [name,value]of Object.entries(object.metadata))assert.equal(restoredHead.headers.get(name),value,"restored R2 custom metadata must match the backup, including DOCX sha256 and confidential PDF case scope");
    }

    const recoveredKeys = await listHrmObjects(recoveryWorker.base);
    assert.deepEqual(recoveredKeys, sourceKeys, "restored private R2 keys must match the D1 backup manifest");
    const recoveredFile = databaseRows(recoveryPersist, "lumi-jobs", `SELECT checksum,size_bytes,mime_type,legal_hold,object_deleted_at FROM hrm_files WHERE id=${q(fileId)}`)[0];
    assert.deepEqual(recoveredFile, {
      checksum: file.checksum,
      size_bytes: file.size_bytes,
      mime_type: file.mime_type,
      legal_hold: file.legal_hold,
      object_deleted_at: file.object_deleted_at,
    }, "restored D1 file metadata and hold state must match the saved snapshot");

    const adminResponse = await fetch(`${recoveryWorker.base}/api/hrm/services/attachments/${attachmentId}`, { headers: { cookie: adminCookie }, redirect: "manual" });
    assert.equal(adminResponse.status, 503, "recovered HRM stays closed until identity, access and hold review is repeated");
    const managerResponse = await fetch(`${recoveryWorker.base}/api/hrm/services/attachments/${attachmentId}`, { headers: { cookie: managerCookie }, redirect: "manual" });
    assert.equal(managerResponse.status, 403, "a Workspace revocation after backup stays denied for the current EmDash account");
    const restoredBytes=await s3Request(recoveryWorker.base,"GET",file.object_key);assert.equal(restoredBytes.status,200);assert.equal(digest(Buffer.from(await restoredBytes.arrayBuffer())),file.checksum,"the verified private recovery copy remains available to the recovery operator");
    const revokedEmployee = await fetch(`${recoveryWorker.base}/hrm/me/requests`, { headers: { cookie: employeeCookie }, redirect: "manual" });
    assert.notEqual(revokedEmployee.status, 200, "a later EmDash revocation must prevent the old D1 membership snapshot from restoring access");
    if(currentWorkspaceRevokedUserId){
      const revokedMember=await fetch(`${recoveryWorker.base}/workspace`,{headers:{cookie:managerCookie},redirect:"manual"});assert.equal(revokedMember.status,403,"a post-backup Workspace role revocation must not be undone by the restored D1 snapshot");
      assert.equal(databaseRows(recoveryPersist,"lumi-jobs",`SELECT COUNT(*) n FROM workspace_audit WHERE target_user_id=${q(currentWorkspaceRevokedUserId)} AND action='access_revoked'`)[0].n,2);
    }

    if(closeoutFile){
      const record=databaseRows(recoveryPersist,"lumi-jobs",`SELECT case_id,checksum,size_bytes,legal_hold,object_deleted_at FROM hrm_closeout_files WHERE id=${q(closeoutFile.id)}`)[0];
      assert.deepEqual(record,{case_id:closeoutFile.case_id,checksum:closeoutFile.checksum,size_bytes:closeoutFile.size_bytes,legal_hold:1,object_deleted_at:null});
      assert.deepEqual(databaseRows(recoveryPersist,"lumi-jobs",`SELECT * FROM hrm_closeout_file_holds WHERE file_id=${q(closeoutFile.id)} ORDER BY id`),closeoutHolds,"restored financial hold placement/release history stays exact");
      const path=`/api/hrm/closeout/files/${closeoutFile.id}?case_id=${closeoutFile.case_id}`;
      const financial=await fetch(recoveryWorker.base+path,{headers:{cookie:adminCookie},redirect:"manual"});assert.equal(financial.status,503,"restored HRM remains closed until owner/recovery review; historical files are not exposed early");
      const restoredFinancialBytes=await s3Request(recoveryWorker.base,"GET",closeoutFile.object_key);assert.equal(restoredFinancialBytes.status,200);assert.equal(digest(Buffer.from(await restoredFinancialBytes.arrayBuffer())),closeoutFile.checksum);
      for(const cookie of [employeeCookie,managerCookie])assert.notEqual((await fetch(recoveryWorker.base+path,{headers:{cookie},redirect:"manual"})).status,200,"restored confidential financial evidence stays inaccessible to employees and managers");
      const restoredFileHolds=databaseRows(recoveryPersist,"lumi-jobs",`SELECT * FROM hrm_closeout_file_holds WHERE file_id=${q(closeoutFile.id)} ORDER BY id`);
      assert.deepEqual(restoredFileHolds,closeoutHolds,"current post-backup financial file holds and their release history are reconciled before HRM stays closed");
      if(currentWorkspaceRevokedUserId){
        const currentHoldEvents=jobs(`SELECT id,actor_id,action,person_id,employment_id,source_application_id,offboarding_case_id,target_id,detail,created_at FROM hrm_lifecycle_events WHERE target_id IN (SELECT id FROM hrm_closeout_file_holds WHERE file_id=${q(closeoutFile.id)}) ORDER BY id`);
        const restoredHoldEvents=databaseRows(recoveryPersist,"lumi-jobs",`SELECT id,actor_id,action,person_id,employment_id,source_application_id,offboarding_case_id,target_id,detail,created_at FROM hrm_lifecycle_events WHERE target_id IN (SELECT id FROM hrm_closeout_file_holds WHERE file_id=${q(closeoutFile.id)}) ORDER BY id`);
        assert.deepEqual(restoredHoldEvents,currentHoldEvents,"hold placement/release events remain continuous across the old restore point");
      }
    }

    const lostObject = objects.get(file.object_key);
    const deleted = await s3Request(recoveryWorker.base, "DELETE", file.object_key);
    assert.ok([200, 204].includes(deleted.status), "the missing-object detection step deletes only the disposable restored copy");
    const missing = await s3Request(recoveryWorker.base, "GET", file.object_key);
    assert.equal(missing.status, 404, "the restore checker must observe a metadata row whose R2 object is missing");
    assert.equal(databaseRows(recoveryPersist, "lumi-jobs", `SELECT object_deleted_at FROM hrm_files WHERE id=${q(fileId)}`)[0]?.object_deleted_at, null, "missing R2 bytes do not erase D1 metadata");
    const repaired = await s3Request(recoveryWorker.base, "PUT", file.object_key, {
      headers: { "content-type": lostObject.mimeType,...lostObject.metadata },
      body: await readFile(lostObject.backupPath),
    });
    assert.ok([200, 201, 204].includes(repaired.status));
    const repairedBytes = await s3Request(recoveryWorker.base, "GET", file.object_key);
    assert.equal(digest(Buffer.from(await repairedBytes.arrayBuffer())), lostObject.checksum, "the private R2 backup repairs the synthetic missing object");

    const orphanKey = `hrm/recovery-orphan-${run}`;
    const orphanWrite = await s3Request(recoveryWorker.base, "PUT", orphanKey, {
      headers: { "content-type": "application/pdf" },
      body: Buffer.from("%PDF-1.4\n% synthetic orphan\n%%EOF\n"),
    });
    assert.ok([200, 201, 204].includes(orphanWrite.status));
    const metadataKeys = new Set(databaseRows(recoveryPersist, "lumi-jobs", "SELECT object_key FROM hrm_files WHERE object_deleted_at IS NULL UNION ALL SELECT object_key FROM hrm_legal_files WHERE object_deleted_at IS NULL UNION ALL SELECT object_key FROM hrm_closeout_files WHERE object_deleted_at IS NULL").map((row) => row.object_key));
    const orphanKeys = (await listHrmObjects(recoveryWorker.base)).filter((key) => !metadataKeys.has(key));
    assert.deepEqual(orphanKeys, [orphanKey], "an R2 orphan without a live D1 reference is detected and quarantined by the drill");
    const orphanDelete = await s3Request(recoveryWorker.base, "DELETE", orphanKey);
    assert.ok([200, 204].includes(orphanDelete.status));
    assert.deepEqual((await listHrmObjects(recoveryWorker.base)).filter((key) => !metadataKeys.has(key)), []);

    console.log(`HRM synthetic recovery drill passed: ${liveFiles.length} D1/R2 references, current Workspace authority/audit replay, HRM closed gate, hold history, checksums, private access, revocation, missing-object repair and orphan detection.`);
  } finally {
    await stopRecoveryWorker(recoveryWorker?.worker);
    if (disabledForRecovery) content(`UPDATE users SET disabled=0 WHERE id=${q(employeeUserId)}`);
    await rm(tempRoot, { recursive: true, force: true });
  }
}

// Disposable local integration storage only; never a production resource.
export { s3Request as syntheticR2Request };
