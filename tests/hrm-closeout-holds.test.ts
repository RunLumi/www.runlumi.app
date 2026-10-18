import test from "node:test";
import assert from "node:assert/strict";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { closeoutFixture } from "./support/hrm-closeout-fixture.ts";
import { sqliteD1 } from "./support/d1-sqlite.ts";
import { createLegalHold, releaseLegalHold } from "../src/lib/hrm/retention.ts";
import { placeCloseoutFileHold, releaseCloseoutFileHold } from "../src/lib/hrm/closeout-holds.ts";

function fixture(){
 const f=closeoutFixture(),content=sqliteD1("content");
 const user=(id:string,roles:["hrm_admin"]|["hrm_officer"]=["hrm_admin"])=>({...makeUser({id,name:id,email:id+"@example.test"},false,roles),hrmEnabled:true});
 const author=user("TEST-author"),reviewer=user("TEST-reviewer"),officer=user("TEST-officer",["hrm_officer"]);
 for(const actor of [author,reviewer,officer]){
  content.raw.prepare("INSERT INTO users(id,email,name) VALUES(?,?,?)").run(actor.id,actor.email,actor.name);
  f.db.raw.prepare("INSERT INTO workspace_members(user_id,granted_by,created_at,updated_at) VALUES(?,'TEST-owner',?,?)").run(actor.id,f.time,f.time);
  f.db.raw.prepare("INSERT INTO workspace_roles(user_id,role,granted_by,granted_at) VALUES(?,?,'TEST-owner',?)").run(actor.id,[...actor.roles][0],f.time);
 }
 f.db.raw.prepare("UPDATE hrm_settings SET enabled=1,legal_entity='TEST entity',purpose='TEST only',retention_policy='TEST only',policy_reference='TEST only',reviewed_by='TEST-owner',reviewed_at=? WHERE id=1").run(f.time);
 const file=()=>f.db.raw.prepare("SELECT * FROM hrm_closeout_files WHERE id='proof'").get()!;
 const hold=(id:string)=>f.db.raw.prepare("SELECT * FROM hrm_closeout_file_holds WHERE id=?").get(id)!;
 const place=(key="TEST-hold-place-key",who=author,caseId=f.caseId)=>placeCloseoutFileHold(f.db,content,who,key,{caseId,fileId:"proof",version:Number(file().version),reason:"TEST matter reference; preserve evidence"});
 const release=(id:string,key="TEST-hold-release-key",who=reviewer)=>releaseCloseoutFileHold(f.db,content,who,key,{caseId:f.caseId,holdId:id,version:Number(hold(id).version),reason:"TEST independent matter closure"});
 return {...f,content,author,reviewer,officer,seedFile:f.file,file,hold,place,release,close(){f.close();content.raw.close()}};
}

test("file hold is private, versioned, audited, independently released and retry-safe after case completion",async()=>{
 const f=fixture();try{
  f.dossier();f.link();f.approve();f.apply();const revision=f.source();
  const version=Number(f.file().version),input={caseId:f.caseId,fileId:"proof",version,reason:"TEST matter reference; preserve evidence"};
  const id=await placeCloseoutFileHold(f.db,f.content,f.author,"TEST-hold-place-key",input);
  assert.equal(await placeCloseoutFileHold(f.db,f.content,f.author,"TEST-hold-place-key",input),id);
  assert.equal(f.file().legal_hold,1);assert.equal(f.hold(id).placed_by,f.author.id);assert.match(String(f.hold(id).placed_at),/Z$/);
  await assert.rejects(f.release(id,"TEST-self-release-key",f.author),{message:"self_approval"});
  const releaseInput={caseId:f.caseId,holdId:id,version:1,reason:"TEST independent matter closure"};
  await releaseCloseoutFileHold(f.db,f.content,f.reviewer,"TEST-hold-release-key",releaseInput);
  await releaseCloseoutFileHold(f.db,f.content,f.reviewer,"TEST-hold-release-key",releaseInput);
  assert.equal(f.hold(id).state,"released");assert.equal(f.hold(id).released_by,f.reviewer.id);assert.equal(f.file().legal_hold,0);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM hrm_lifecycle_events WHERE target_id=?").get(id)!.n,2);
  assert.equal(f.row().state,"applied");assert.equal(f.source(),revision,"preservation alone is not a monetary source change");
  assert.equal(f.db.raw.prepare("SELECT state FROM hrm_offboarding_cases WHERE id=?").get(f.caseId)!.state,"completed");
  assert.equal(f.db.raw.prepare("SELECT enabled FROM workspace_members WHERE user_id='employee'").get()!.enabled,0);
 }finally{f.close()}
});

test("overlapping person and file holds survive either release order",async()=>{
 for(const first of ["person","file"]){const f=fixture();try{
  const person=await createLegalHold(f.db,f.author,"TEST-person-hold-key",{scope_kind:"person",person_id:"person",category:"*",reason:"TEST person matter"});
  const file=await f.place();
  const releasePerson=()=>releaseLegalHold(f.db,f.reviewer,"TEST-person-release-key",person,1,"TEST independently release person matter");
  if(first==="person"){await releasePerson();assert.equal(f.file().legal_hold,1);await f.release(file)}
  else{await f.release(file);assert.equal(f.file().legal_hold,1);await releasePerson()}
  assert.equal(f.file().legal_hold,0);
 }finally{f.close()}}
});

test("active file hold cannot be bypassed by clearing a flag, deletion, disposition or history edits",async()=>{
 const f=fixture();try{
  const id=await f.place();
  for(const sql of ["UPDATE hrm_closeout_files SET legal_hold=0 WHERE id='proof'","UPDATE hrm_closeout_files SET object_deleted_at='TEST-deleted' WHERE id='proof'","UPDATE hrm_closeout_files SET disposition_state='deleting' WHERE id='proof'"]){assert.throws(()=>f.db.raw.exec(sql),/hrm_closeout_evidence_held/)}
  for(const sql of ["UPDATE hrm_closeout_file_holds SET reason='rewritten'", "DELETE FROM hrm_closeout_file_holds"]){assert.throws(()=>f.db.raw.exec(sql),/immutable_history/)}
  assert.throws(()=>f.db.raw.prepare("UPDATE hrm_closeout_file_holds SET state='released',released_by='TEST-author',released_at=?,release_reason='TEST invalid self release',version=2 WHERE id=?").run(f.time,id),/CHECK constraint/);
  await f.release(id);assert.throws(()=>f.db.raw.prepare("UPDATE hrm_closeout_file_holds SET state='active',version=3 WHERE id=?").run(id),/immutable_history/);
 }finally{f.close()}
});

test("wrong case, stale revision, duplicate hold, unavailable file and malformed reason fail closed",async()=>{
 const f=fixture();try{
  await assert.rejects(f.place("TEST-wrong-case-key",f.author,f.otherCase),{message:"not_found"});
  const input={caseId:f.caseId,fileId:"proof",version:0,reason:"TEST reason"};
  await assert.rejects(placeCloseoutFileHold(f.db,f.content,f.author,"TEST-bad-version-key",input),{message:"closeout_invalid"});
  await assert.rejects(placeCloseoutFileHold(f.db,f.content,f.author,"TEST-bad-reason-key",{...input,version:1,reason:"\n\t"}),{message:"reason_required"});
  await assert.rejects(placeCloseoutFileHold(f.db,f.content,f.author,"TEST-stale-version-key",{...input,version:99}),{message:"conflict"});
  await f.place();await assert.rejects(f.place("TEST-duplicate-hold-key"),{message:"conflict"});
  await assert.rejects(placeCloseoutFileHold(f.db,f.content,f.author,"TEST-hold-place-key",{...input,version:1,reason:"TEST changed reason"}),{message:"request_key_conflict"});
 }finally{f.close()}
 for(const state of ["deleting","completed"]){const f=fixture();try{
  f.db.raw.prepare("UPDATE hrm_closeout_files SET disposition_state=? WHERE id='proof'").run(state);
  await assert.rejects(f.place(),{message:"closeout_hold_unavailable"});
  assert.throws(()=>f.db.raw.prepare("INSERT INTO hrm_closeout_file_holds(id,case_id,file_id,reason,placed_by,placed_at) VALUES('TEST-direct',?,'proof','TEST reason','TEST-author',?)").run(f.caseId,f.time),/closeout_hold_unavailable/);
 }finally{f.close()}}
});

test("officer-only, disabled EmDash, removed membership, revoked role, closed gate and subject cannot place or release a financial hold",async()=>{
 for(const mode of ["officer","disabled","membership","role","gate","subject","mapped_subject"]){const f=fixture();try{
  const id=await f.place();let actor=f.reviewer;
  if(mode==="officer")actor=f.officer;
  if(mode==="disabled")f.content.raw.prepare("UPDATE users SET disabled=1 WHERE id=?").run(actor.id);
  if(mode==="membership")f.db.raw.prepare("UPDATE workspace_members SET enabled=0 WHERE user_id=?").run(actor.id);
  if(mode==="role")f.db.raw.prepare("DELETE FROM workspace_roles WHERE user_id=?").run(actor.id);
  if(mode==="gate")f.db.raw.exec("UPDATE hrm_settings SET enabled=0");
  if(mode==="subject"){
   actor={...makeUser({id:"employee",name:"TEST rehired subject",email:"subject@example.test"},false,["hrm_admin"]),hrmEnabled:true};
   f.content.raw.prepare("INSERT INTO users(id,email,name) VALUES('employee','subject@example.test','TEST rehired subject')").run();
   f.db.raw.exec("UPDATE workspace_members SET enabled=1 WHERE user_id='employee'");
   f.db.raw.prepare("INSERT INTO workspace_roles(user_id,role,granted_by,granted_at) VALUES('employee','hrm_admin','TEST-owner',?)").run(f.time);
   f.db.raw.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,started_on,actor_id,created_at,updated_at) VALUES('TEST-rehire','person','TEST entity','active','2026-02-01','TEST-owner',?,?)").run(f.time,f.time);
  }
  if(mode==="mapped_subject"){
   f.db.raw.prepare("UPDATE hrm_people SET user_id=?,version=version+1 WHERE id='person'").run(actor.id);
   f.db.raw.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,started_on,actor_id,created_at,updated_at) VALUES('TEST-relinked-rehire','person','TEST entity','active','2026-02-01','TEST-owner',?,?)").run(f.time,f.time);
  }
  await assert.rejects(f.release(id,"TEST-denied-release-key",actor));assert.equal(f.hold(id).state,"active");assert.equal(f.file().legal_hold,1);
  f.seedFile("new-proof");
  await assert.rejects(placeCloseoutFileHold(f.db,f.content,actor,"TEST-denied-place-key",{caseId:f.caseId,fileId:"new-proof",version:1,reason:"TEST reason"}));
 }finally{f.close()}}
});

test("late EmDash revocation and admin demotion are re-resolved after file inspection",async()=>{
 for(const mode of ["disabled","demoted"]){const f=fixture();try{
  if(mode==="demoted"){
   f.content.raw.prepare("UPDATE users SET role=50 WHERE id=?").run(f.author.id);
   f.db.raw.prepare("DELETE FROM workspace_roles WHERE user_id=?").run(f.author.id);
  }
  let changed=false;
  const db={...f.db,prepare(sql:string){
   const statement=f.db.prepare(sql);
   if(!sql.includes("SELECT f.version,f.object_deleted_at"))return statement;
   return {...statement,bind(...args:unknown[]){const bound=statement.bind(...args);return {...bound,async first<T>(){
    const row=await bound.first<T>();if(!changed){changed=true;f.content.raw.prepare(mode==="disabled"?"UPDATE users SET disabled=1 WHERE id=?":"UPDATE users SET role=30 WHERE id=?").run(f.author.id)}return row;
   }}}};
  }} as D1Database;
  await assert.rejects(placeCloseoutFileHold(db,f.content,f.author,"TEST-late-revoke-key",{caseId:f.caseId,fileId:"proof",version:1,reason:"TEST matter"}),{message:"report_account_unavailable"});
  assert.equal(changed,true);assert.equal(f.file().legal_hold,0);assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM hrm_closeout_file_holds").get()!.n,0);
 }finally{f.close()}}
});

test("a concurrent D1 role removal or disposal reservation wins before the mutation batch",async()=>{
 for(const mode of ["role","deleting"]){const f=fixture();try{
  const db={...f.db,async batch(statements:D1PreparedStatement[]){
   if(mode==="role")f.db.raw.prepare("DELETE FROM workspace_roles WHERE user_id=?").run(f.author.id);
   else f.db.raw.exec("UPDATE hrm_closeout_files SET disposition_state='deleting' WHERE id='proof'");
   return f.db.batch(statements);
  }} as D1Database;
  await assert.rejects(placeCloseoutFileHold(db,f.content,f.author,"TEST-batch-race-key",{caseId:f.caseId,fileId:"proof",version:1,reason:"TEST matter"}),{message:"conflict"});
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM hrm_closeout_file_holds").get()!.n,0);assert.equal(f.file().legal_hold,0);
 }finally{f.close()}}
});
