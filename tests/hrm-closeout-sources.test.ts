import test from "node:test";
import assert from "node:assert/strict";
import { closeoutFixture } from "./support/hrm-closeout-fixture.ts";

// Synthetic SQL fixture for source-revision/evidence invariants only. This is
// not an HTTP clearance or a professional/statutory reconciliation proof.
const fixture=closeoutFixture;

test("source counters start with real cases; missing payroll cannot be approved without explicitly evidenced exemption",()=>{
 const f=fixture();try{
  assert.equal(f.source(),1);f.dossier("without-exemption",f.source(),undefined,[]);f.link("proof","without-exemption");
  assert.throws(()=>f.approve("without-exemption"),/hrm_closeout_evidence_invalid/);
  f.dossier();f.link();f.approve();assert.equal(f.row().state,"approved");
  assert.equal(f.db.raw.prepare("SELECT enabled FROM workspace_members WHERE user_id='employee'").get()?.enabled,0);
 }finally{f.close()}
});

test("scope, checksum, quarantine and checklist evidence are enforced in the review transaction",()=>{
 const f=fixture();try{
  f.file("foreign-proof",f.otherCase);f.file("quarantined",f.caseId,"quarantined");f.dossier();
  assert.throws(()=>f.link("foreign-proof"),/hrm_closeout_evidence_invalid/);assert.throws(()=>f.link("quarantined"),/hrm_closeout_evidence_invalid/);assert.throws(()=>f.link("proof","dossier","b".repeat(64)),/hrm_closeout_evidence_invalid/);
  assert.throws(()=>f.approve(),/hrm_closeout_evidence_invalid/);f.link();f.approve();
  assert.throws(()=>f.db.raw.prepare("UPDATE hrm_closeout_dossier_files SET checksum=?").run("b".repeat(64)),/immutable_history/);
  f.dossier("waiver",f.source(),[{key:"TEST_CHECK",outcome:"not_applicable",reason:"TEST attempted waiver",file_ids:["proof"]}]);f.link("proof","waiver");assert.throws(()=>f.approve("waiver"),/hrm_closeout_evidence_invalid/);
 }finally{f.close()}
});

test("the preparer and employee subject cannot approve, and frozen basis/review history cannot be rewritten",()=>{
 const f=fixture();try{
  f.dossier();f.link();assert.throws(()=>f.approve("dossier","TEST-author"),/CHECK constraint/);assert.throws(()=>f.approve("dossier","employee"),/CHECK constraint/);
  f.approve();assert.throws(()=>f.db.raw.exec("UPDATE hrm_closeout_dossiers SET basis_json='{}'"),/immutable_history/);assert.throws(()=>f.db.raw.exec("UPDATE hrm_closeout_dossiers SET reviewed_by='TEST-other'"),/immutable_history/);assert.throws(()=>f.db.raw.exec("DELETE FROM hrm_closeout_events"),/immutable_history/);
 }finally{f.close()}
});

test("a scoped source change invalidates prepared and approved dossiers, preserving their frozen evidence and decisions",()=>{
 for(const approved of [false,true]){
  const f=fixture();try{
   f.dossier();f.link();if(approved)f.approve();const original={...f.row()},revision=f.source();
   f.db.raw.exec("UPDATE hrm_people SET legal_name='TEST corrected legal name',version=version+1 WHERE id='person'");
   assert.equal(f.row().state,"invalidated");assert.equal(f.source(),revision+1);
   for(const field of ["basis_json","basis_checksum","checks_json","source_revision","prepared_by","reviewed_by","reviewed_at"])assert.equal(f.row()[field],original[field],field);
   assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_closeout_events WHERE dossier_id='dossier' AND event_type='invalidated'").get()?.n,1);
   assert.throws(()=>f.approve(),/hrm_closeout_source_changed|invalid_transition|immutable_history/);
  }finally{f.close()}
 }
});

test("post-completion source changes reopen only financial follow-up and never resurrect Workspace access",()=>{
 const f=fixture();try{
  f.dossier();f.link();f.approve();f.apply();const taskBefore=f.db.raw.prepare("SELECT * FROM hrm_offboarding_tasks WHERE case_id=? AND task_key='workspace_access'").get(f.caseId)!;
  f.db.raw.exec("UPDATE hrm_employments SET location='TEST corrected jurisdiction context',version=version+1 WHERE id='person-employment'");
  assert.equal(f.row().state,"invalidated");assert.equal(f.db.raw.prepare("SELECT state FROM hrm_offboarding_cases WHERE id=?").get(f.caseId)?.state,"open");
  assert.equal(f.db.raw.prepare("SELECT state FROM hrm_offboarding_tasks WHERE case_id=? AND task_key='payroll_closeout'").get(f.caseId)?.state,"blocked");
  assert.deepEqual({...f.db.raw.prepare("SELECT * FROM hrm_offboarding_tasks WHERE case_id=? AND task_key='workspace_access'").get(f.caseId)!},{...taskBefore});
  assert.equal(f.db.raw.prepare("SELECT enabled FROM workspace_members WHERE user_id='employee'").get()?.enabled,0);assert.equal(f.row().reviewed_by,"TEST-reviewer");assert.ok(f.row().applied_at);
 }finally{f.close()}
});

test("another employee's source changes and unlinked PDF uploads do not invalidate this employee's approval",()=>{
 const f=fixture();try{
  f.dossier();f.link();f.approve();const revision=f.source();f.db.raw.exec("UPDATE hrm_people SET legal_name='TEST Other corrected',version=version+1 WHERE id='other'");f.file("additional-unlinked");
  assert.equal(f.source(),revision);assert.equal(f.row().state,"approved");
 }finally{f.close()}
});

test("disposing linked PDF evidence invalidates approval; cancelled cases stay cancelled",()=>{
 const f=fixture();try{
  f.dossier();f.link();f.approve();f.db.raw.prepare("UPDATE hrm_offboarding_cases SET state='cancelled',cancelled_by='TEST-author',cancelled_at=?,cancel_reason='TEST rehire' WHERE id=?").run(f.time,f.caseId);
  f.db.raw.exec("UPDATE hrm_closeout_files SET disposition_state='pending_review',version=version+1 WHERE id='proof'");
  assert.equal(f.row().state,"invalidated");assert.equal(f.db.raw.prepare("SELECT state FROM hrm_offboarding_cases WHERE id=?").get(f.caseId)?.state,"cancelled");
 }finally{f.close()}
});

test("stale preparation is refused and a failed apply batch rolls source writes and invalidation back atomically",async()=>{
 const f=fixture();try{
  const stale=f.source();f.db.raw.exec("UPDATE hrm_people SET legal_name='TEST amended',version=version+1 WHERE id='person'");assert.throws(()=>f.dossier("stale",stale),/hrm_closeout_source_changed/);
  f.dossier();f.link();f.approve();const revision=f.source(),name=f.db.raw.prepare("SELECT legal_name FROM hrm_people WHERE id='person'").get()?.legal_name;
  await assert.rejects(f.db.batch([
   f.db.prepare("UPDATE hrm_people SET legal_name='TEST concurrent correction',version=version+1 WHERE id='person'"),
   f.db.prepare("UPDATE hrm_closeout_dossiers SET state='applied',applied_by='TEST-reviewer',applied_at=?,actor_id='TEST-reviewer' WHERE id='dossier'").bind(f.time),
  ]));
  assert.equal(f.row().state,"approved");assert.equal(f.source(),revision);assert.equal(f.db.raw.prepare("SELECT legal_name FROM hrm_people WHERE id='person'").get()?.legal_name,name);
 }finally{f.close()}
});

test("upgrading existing ended employments preserves case, access and records, and seeds no dossier or clearance",async()=>{
 const {DatabaseSync}=await import("node:sqlite"),{readFileSync,readdirSync}=await import("node:fs");
 const db=new DatabaseSync(":memory:"),root=new URL("../migrations/",import.meta.url),migration="0043_hrm_closeout_dossiers.sql",time=new Date().toISOString();
 try{
  db.exec("PRAGMA foreign_keys=ON");for(const name of readdirSync(root).filter(n=>n.endsWith(".sql")&&n<migration).sort())db.exec(readFileSync(new URL(name,root),"utf8"));
  db.prepare("INSERT INTO workspace_members(user_id,enabled,granted_by,created_at,updated_at) VALUES('TEST-employee',0,'TEST-owner',?,?)").run(time,time);
  db.prepare("INSERT INTO hrm_people(id,employee_code,user_id,legal_name,actor_id,created_at,updated_at) VALUES('TEST-person','TEST-existing','TEST-employee','TEST Employee','TEST-owner',?,?)").run(time,time);
  db.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,started_on,ended_on,actor_id,created_at,updated_at) VALUES('TEST-employment','TEST-person','TEST entity','ended','2026-01-01','2026-01-31','TEST-owner',?,?)").run(time,time);
  const before={person:{...db.prepare("SELECT * FROM hrm_people").get()},employment:{...db.prepare("SELECT * FROM hrm_employments").get()},offboarding:{...db.prepare("SELECT * FROM hrm_offboarding_cases").get()},tasks:db.prepare("SELECT * FROM hrm_offboarding_tasks ORDER BY task_key").all().map(r=>({...r})),member:{...db.prepare("SELECT * FROM workspace_members").get()}};
  db.exec(readFileSync(new URL(migration,root),"utf8"));
  const after={person:{...db.prepare("SELECT * FROM hrm_people").get()},employment:{...db.prepare("SELECT * FROM hrm_employments").get()},offboarding:{...db.prepare("SELECT * FROM hrm_offboarding_cases").get()},tasks:db.prepare("SELECT * FROM hrm_offboarding_tasks ORDER BY task_key").all().map(r=>({...r})),member:{...db.prepare("SELECT * FROM workspace_members").get()}};
  assert.deepEqual(after,before);assert.equal(db.prepare("SELECT revision FROM hrm_closeout_sources").get()?.revision,1);
  for(const table of ["hrm_closeout_dossiers","hrm_closeout_files","hrm_closeout_events","hrm_closeout_source_events"])assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n,0);
  assert.equal(db.prepare("SELECT enabled FROM hrm_settings").get()?.enabled,0);
 }finally{db.close()}
});

test("person-wide legal hold covers existing and newly uploaded financial PDFs and blocks disposition until independent release",()=>{
 const f=fixture();try{
  f.db.raw.prepare("INSERT INTO hrm_legal_holds(id,scope_kind,person_id,category,reason,placed_by,placed_at,actor_id,created_at,updated_at) VALUES('TEST-hold','person','person','*','TEST preserve all employee evidence','TEST-author',?,'TEST-author',?,?)").run(f.time,f.time,f.time);
  assert.equal(f.db.raw.prepare("SELECT legal_hold FROM hrm_closeout_files WHERE id='proof'").get()?.legal_hold,1);
  f.file("new-held-proof");assert.equal(f.db.raw.prepare("SELECT legal_hold FROM hrm_closeout_files WHERE id='new-held-proof'").get()?.legal_hold,1);
  assert.throws(()=>f.db.raw.exec("UPDATE hrm_closeout_files SET disposition_state='pending_review' WHERE id='proof'"),/hrm_closeout_evidence_held/);
  assert.throws(()=>f.db.raw.exec("UPDATE hrm_closeout_files SET object_deleted_at='2026-10-19' WHERE id='proof'"),/hrm_closeout_evidence_held/);
  assert.throws(()=>f.db.raw.exec("UPDATE hrm_closeout_files SET legal_hold=0 WHERE id='proof'"),/hrm_closeout_evidence_held/);
  f.db.raw.prepare("UPDATE hrm_legal_holds SET state='released',released_by='TEST-reviewer',released_at=?,release_reason='TEST independent release',actor_id='TEST-reviewer',version=version+1 WHERE id='TEST-hold'").run(f.time);
  assert.equal(f.db.raw.prepare("SELECT legal_hold FROM hrm_closeout_files WHERE id='proof'").get()?.legal_hold,0);assert.equal(f.db.raw.prepare("SELECT object_deleted_at FROM hrm_closeout_files WHERE id='proof'").get()?.object_deleted_at,null);
 }finally{f.close()}
});

test("automatic invalidation attributes the transition to the system and preserves the source actor separately",()=>{
 const f=fixture();try{
  f.dossier();f.link();f.approve();f.db.raw.prepare("INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id) VALUES(?,'TEST imported source','TEST-source',NULL)").run(f.caseId);
  const event=f.db.raw.prepare("SELECT actor_id,detail_json FROM hrm_closeout_events WHERE event_type='invalidated' AND dossier_id='dossier'").get()!;
  assert.equal(event.actor_id,"system:hrm-closeout-source");assert.equal(JSON.parse(String(event.detail_json)).source_actor_id,null);assert.equal(f.row().actor_id,"system:hrm-closeout-source");assert.equal(f.row().reviewed_by,"TEST-reviewer");
 }finally{f.close()}
});
