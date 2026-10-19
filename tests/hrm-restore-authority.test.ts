import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { closeoutFixture } from "./support/hrm-closeout-fixture.ts";
import { buildWorkspaceRestorePatches, snapshotCurrentWorkspaceAuthority } from "../scripts/reconcile-workspace-restore.mjs";
import { restoreBlocksPath, restoreMaintenanceEnabled, restoreMaintenanceResponse } from "../src/lib/workspace/restore-maintenance.ts";

function seedManager(db:DatabaseSync,now:string){
 db.prepare("INSERT INTO workspace_members(user_id,enabled,granted_by,created_at,updated_at) VALUES('TEST-manager',1,'TEST-owner',?,?)").run(now,now);
 db.prepare("INSERT INTO workspace_roles(user_id,role,granted_by,granted_at) VALUES('TEST-manager','people_manager','TEST-owner',?)").run(now);
 db.prepare("INSERT INTO workspace_members(user_id,enabled,granted_by,created_at,updated_at) VALUES('TEST-hrm-admin',1,'TEST-owner',?,?)").run(now,now);
 db.prepare("INSERT INTO workspace_roles(user_id,role,granted_by,granted_at) VALUES('TEST-hrm-admin','hrm_admin','TEST-owner',?)").run(now);
}
function copy(db:DatabaseSync,path:string){db.exec(`VACUUM INTO '${path.replaceAll("'","''")}'`);const target=new DatabaseSync(path);target.exec("PRAGMA foreign_keys=ON");return target;}
function apply(db:DatabaseSync,patches:Array<{name:string;sql:string}>){for(const patch of patches)db.exec(patch.sql);}

test("restore patches preserve current Workspace revocation/audit, new holds, and leave HRM closed",async()=>{
 const f=closeoutFixture(),temp=await mkdtemp(join(tmpdir(),"hrm-restore-authority-test-"));let target:DatabaseSync|undefined;
 try{
  const db=f.db.raw,now=new Date().toISOString();seedManager(db,now);
  db.prepare("UPDATE hrm_settings SET enabled=1,legal_entity='TEST pre-restore entity',purpose='TEST pre-restore purpose',retention_policy='TEST pre-restore retention',policy_reference='TEST pre-restore reference',reviewed_by='TEST-reviewer',reviewed_at=?,version=version+1,updated_by='TEST-reviewer',updated_at=? WHERE id=1").run(now,now);
  target=copy(db,join(temp,"historical-snapshot.sqlite"));
  // Current account state changes after the simulated backup point.
  const revokedAt=new Date(Date.now()+1000).toISOString();
  db.prepare("UPDATE workspace_members SET enabled=0,granted_by='TEST-owner',updated_at=? WHERE user_id='TEST-manager'").run(revokedAt);
  db.prepare("INSERT INTO workspace_audit(id,actor_id,actor_name,action,target_user_id,detail,created_at) VALUES('TEST-revoke-manager','TEST-owner','TEST System Admin','access_revoked','TEST-manager','{\"roles_before\":[\"people_manager\"]}',?)").run(revokedAt);
  db.prepare("UPDATE hrm_settings SET enabled=0,version=version+1,updated_by='TEST-owner',updated_at=? WHERE id=1").run(revokedAt);
  db.prepare("INSERT INTO hrm_legal_holds(id,scope_kind,person_id,category,reason,placed_by,placed_at,actor_id,created_at,updated_at) VALUES('TEST-post-backup-person-hold','person','person','banking','TEST current preservation matter','TEST-reviewer',?,'TEST-reviewer',?,?)").run(revokedAt,revokedAt,revokedAt);
  db.prepare("INSERT INTO hrm_closeout_file_holds(id,case_id,file_id,reason,placed_by,placed_at) VALUES('TEST-post-backup-file-hold',?,'proof','TEST current confidential-file hold','TEST-reviewer',?)").run(f.caseId,revokedAt);
  const snapshot=snapshotCurrentWorkspaceAuthority(db,revokedAt,{id:"TEST-owner",name:"TEST current System Admin"}),plan=buildWorkspaceRestorePatches(target,snapshot);
  assert.ok(plan.patches.length>=5);assert.equal(plan.summary.currentEnabledMembers,1);assert.equal(plan.summary.hrmForcedClosed,true);assert.equal(plan.summary.activeHoldsToRestore,2);assert.equal(plan.summary.holdRowsToRestore,2);
  apply(target,plan.patches);
  // A lost operator response can replay the same private SQL stage plan safely.
  apply(target,plan.patches);
  assert.equal(target.prepare("SELECT enabled FROM workspace_members WHERE user_id='TEST-manager'").get()!.enabled,0);
  assert.deepEqual(target.prepare("SELECT role FROM workspace_roles WHERE user_id='TEST-manager'").all().map((row:any)=>row.role),["people_manager"]);
  assert.equal(target.prepare("SELECT enabled FROM workspace_members WHERE user_id='TEST-hrm-admin'").get()!.enabled,1);
  assert.equal(target.prepare("SELECT granted_by FROM workspace_members WHERE user_id='TEST-hrm-admin'").get()!.granted_by,"TEST-owner");
  assert.deepEqual(target.prepare("SELECT role FROM workspace_roles WHERE user_id='TEST-hrm-admin'").all().map((row:any)=>row.role),["hrm_admin"]);
  assert.equal(target.prepare("SELECT actor_id,action FROM workspace_audit WHERE id='TEST-revoke-manager'").get()!.action,"access_revoked");
  assert.equal(target.prepare("SELECT COUNT(*) AS n FROM workspace_audit WHERE actor_id='TEST-owner' AND action='access_revoked' AND json_extract(detail,'$.source')='current_authority_restore'").get()!.n,2);
  assert.equal(target.prepare("SELECT COUNT(*) AS n FROM workspace_audit WHERE actor_id='TEST-owner' AND action='access_saved' AND json_extract(detail,'$.source')='current_authority_restore'").get()!.n,1);
  assert.deepEqual({...target.prepare("SELECT state,category FROM hrm_legal_holds WHERE id='TEST-post-backup-person-hold'").get()!},{state:"active",category:"banking"});
  assert.equal(target.prepare("SELECT state FROM hrm_closeout_file_holds WHERE id='TEST-post-backup-file-hold'").get()!.state,"active");
  assert.equal(target.prepare("SELECT legal_hold FROM hrm_closeout_files WHERE id='proof'").get()!.legal_hold,1);
  assert.deepEqual({...target.prepare("SELECT enabled,reviewed_by,reviewed_at,legal_entity,purpose FROM hrm_settings WHERE id=1").get()!},{enabled:0,reviewed_by:null,reviewed_at:null,legal_entity:"TEST pre-restore entity",purpose:"TEST pre-restore purpose"});
  assert.deepEqual(target.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{target?.close();f.close();await rm(temp,{recursive:true,force:true})}
});

test("restore-plan generation fails closed on a conflicting immutable audit identity",async()=>{
 const f=closeoutFixture(),temp=await mkdtemp(join(tmpdir(),"hrm-restore-conflict-test-"));let target:DatabaseSync|undefined;
 try{
  const db=f.db.raw,now=new Date().toISOString();seedManager(db,now);target=copy(db,join(temp,"historical-snapshot.sqlite"));
  db.prepare("UPDATE workspace_members SET enabled=0 WHERE user_id='TEST-manager'").run();
  db.prepare("INSERT INTO workspace_audit(id,actor_id,actor_name,action,target_user_id,detail,created_at) VALUES('TEST-conflicting-audit','TEST-owner','TEST Owner','access_revoked','TEST-manager','{}',?)").run(now);
  const snapshot=snapshotCurrentWorkspaceAuthority(db,now,{id:"TEST-owner",name:"TEST current System Admin"});
  target.prepare("INSERT INTO workspace_audit(id,actor_id,actor_name,action,target_user_id,detail,created_at) VALUES('TEST-conflicting-audit','TEST-owner','TEST Owner','access_saved','TEST-manager','{}',?)").run(now);
  assert.throws(()=>buildWorkspaceRestorePatches(target!,snapshot),/conflicting Workspace audit IDs/);
 }finally{target?.close();f.close();await rm(temp,{recursive:true,force:true})}
});


test("restores a hold placed and released after the backup with its immutable timeline intact",async()=>{
 const f=closeoutFixture(),temp=await mkdtemp(join(tmpdir(),"hrm-restore-released-hold-test-"));let target:DatabaseSync|undefined;
 try{
  const db=f.db.raw,now=new Date().toISOString();seedManager(db,now);target=copy(db,join(temp,"historical-snapshot.sqlite"));
  const placed=new Date(Date.now()+1000).toISOString(),released=new Date(Date.now()+2000).toISOString();
  db.prepare("INSERT INTO hrm_closeout_file_holds(id,case_id,file_id,reason,placed_by,placed_at) VALUES('TEST-post-backup-released-hold',?,'proof','TEST closed preservation matter','TEST-reviewer',?)").run(f.caseId,placed);
  db.prepare("UPDATE hrm_closeout_file_holds SET state='released',released_by='TEST-owner',released_at=?,release_reason='TEST matter concluded',version=version+1 WHERE id='TEST-post-backup-released-hold'").run(released);
  const currentFile={...db.prepare("SELECT version,actor_id,updated_at,legal_hold FROM hrm_closeout_files WHERE id='proof'").get()!};
  const snapshot=snapshotCurrentWorkspaceAuthority(db,new Date(Date.now()+3000).toISOString(),{id:"TEST-owner",name:"TEST current System Admin"});
  const plan=buildWorkspaceRestorePatches(target,snapshot);apply(target,plan.patches);
  const hold={...target.prepare("SELECT * FROM hrm_closeout_file_holds WHERE id='TEST-post-backup-released-hold'").get()!};
  assert.deepEqual(hold,{id:"TEST-post-backup-released-hold",case_id:f.caseId,file_id:"proof",state:"released",reason:"TEST closed preservation matter",placed_by:"TEST-reviewer",placed_at:placed,released_by:"TEST-owner",released_at:released,release_reason:"TEST matter concluded",version:2});
  assert.deepEqual({...target.prepare("SELECT version,actor_id,updated_at,legal_hold FROM hrm_closeout_files WHERE id='proof'").get()!},currentFile);
  assert.deepEqual(target.prepare("SELECT action FROM hrm_lifecycle_events WHERE target_id='TEST-post-backup-released-hold' ORDER BY id").all().map((row:any)=>row.action),["closeout_file_hold_placed","closeout_file_hold_released"]);
 }finally{target?.close();f.close();await rm(temp,{recursive:true,force:true})}
});


test("restore maintenance fences every private EN/VI module and leaves public routes available",async()=>{
 assert.equal(restoreMaintenanceEnabled("true"),true);assert.equal(restoreMaintenanceEnabled("false"),false);assert.equal(restoreMaintenanceEnabled(undefined),false);
 for(const path of ["/workspace","/vi/workspace/users","/hrm/people","/vi/hrm/me","/admin/jobs","/api/admin/applications","/api/jobs/test-engineer/apply","/crm","/vi/crm","/api/crm/v1/accounts","/api/intake/local","/finance/actuals","/vi/api/finance/reports","/api/hrm/payroll"]){assert.equal(restoreBlocksPath("true",path),true,path)}
 for(const path of ["/","/jobs","/vi","/vi/jobs","/_astro/site.css","/_emdash/admin"]){assert.equal(restoreBlocksPath("true",path),false,path)}
 assert.equal(restoreBlocksPath("false","/workspace"),false);
 for(const [path,vi]of [["/api/hrm/payroll",false],["/vi/hrm/me",true],["/vi/api/finance/reports",true]] as const){const response=restoreMaintenanceResponse(path,vi);assert.equal(response.status,503);assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(response.headers.get("x-content-type-options"),"nosniff");assert.equal(response.headers.get("content-type")?.startsWith("text/plain"),path.includes("/api/"));assert.ok((await response.text()).includes(vi?"Workspace đang tạm đóng":"Workspace is unavailable"))}
});
