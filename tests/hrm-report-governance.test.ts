import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./support/d1-sqlite.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { actOnReportPolicy, createReportPolicy, listReportHolds, listReportPolicies, placeReportHold, releaseReportHold, type ReportPolicyInput } from "../src/lib/hrm/report-governance.ts";

function fixture(){
 const db=sqliteD1(),content=sqliteD1("content"),time=new Date().toISOString(),checksum="a".repeat(64);
 const actor=(id:string,roles:Parameters<typeof makeUser>[2])=>({...makeUser({id,name:id,email:id+"@example.test"},false,roles),hrmEnabled:false});
 const author=actor("report_author",["hrm_admin"]),approver=actor("report_approver",["hrm_admin"]),officer=actor("report_officer",["hrm_officer"]),employee=actor("report_employee",["employee"]);
 for(const user of [author,approver,officer,employee]){
  db.raw.prepare("INSERT INTO workspace_members(user_id,granted_by,created_at,updated_at) VALUES(?,'test-owner',?,?)").run(user.id,time,time);
  for(const role of user.roles)db.raw.prepare("INSERT INTO workspace_roles(user_id,role,granted_by,granted_at) VALUES(?,?,'test-owner',?)").run(user.id,role,time);
  content.raw.prepare("INSERT INTO users(id,email,name) VALUES(?,?,?)").run(user.id,user.email,user.name);
 }
 db.raw.prepare("UPDATE hrm_settings SET legal_entity='TEST entity' WHERE id=1").run();
 db.raw.prepare("INSERT INTO hrm_legal_templates(id,document_key,document_type,title_en,title_vi,created_by,updated_by,actor_id,created_at,updated_at) VALUES('report_legal','TEST-REPORT','policy','TEST source','TEST nguồn',?,?,?,?,?)").run(author.id,author.id,author.id,time,time);
 db.raw.prepare(`INSERT INTO hrm_legal_files(id,object_key,kind,template_id,original_name,mime_type,size_bytes,checksum,state,uploaded_by,reviewed_by,reviewed_at,actor_id,created_at,updated_at)
 VALUES('report_docx','hrm/legal/TEST-report.docx','docx_source','report_legal','TEST.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',100,?,'reviewed',?,?,?,?,?,?)`).run(checksum,author.id,approver.id,time,approver.id,time,time);
 db.raw.prepare(`INSERT INTO hrm_legal_template_versions(id,template_id,version_number,source_file_id,source_checksum,language,legal_entity,purpose,audience_json,signing_mode,state,created_by,created_at,reviewed_by,reviewed_at,updated_by,updated_at)
 VALUES('report_source','report_legal',1,'report_docx',?,'bilingual','TEST entity','TEST synthetic policy','[]','paper_scan','reviewed',?,?,?,?,?,?)`).run(checksum,author.id,time,approver.id,time,approver.id,time);
 const input:ReportPolicyInput={classCode:"TEST-OPS",captureKind:"daily",titleEn:"TEST reviewed terms",titleVi:"TEST điều khoản giả lập",purpose:"TEST operations review",jurisdiction:"TEST unapproved jurisdiction",sourceVersionId:"report_source",ownerUserId:officer.id,retentionDays:7,effectiveFrom:"2026-01-01",effectiveUntil:"2030-12-31"};
 const row=(ref:string)=>db.raw.prepare("SELECT * FROM hrm_report_policy_versions WHERE policy_ref=?").get(ref)!;
 const approve=(ref:string,version=1,key="report_policy_approve")=>actOnReportPolicy(db,content,approver,key,{policyRef:ref,version,action:"approve",reason:"TEST independent source review"});
 const activate=(ref:string,key="report_policy_activate")=>actOnReportPolicy(db,content,approver,key,{policyRef:ref,version:2,action:"activate",reason:"TEST synthetic activation"});
 const create=(key="report_policy_create",value=input)=>createReportPolicy(db,content,author,key,value);
 const schedule=(ref:string)=>db.raw.prepare(`INSERT INTO hrm_report_schedules(id,schedule_ref,legal_entity,cadence,retention_days,retention_basis,created_by,created_at,updated_by,updated_at,actor_id) VALUES('report_schedule','TEST-schedule','TEST entity','daily',7,?,?,?,?,?,?)`).run("policy:"+ref,author.id,time,author.id,time,author.id);
 return {db,content,time,checksum,author,approver,officer,employee,input,row,create,approve,activate,schedule,close(){db.raw.close();content.raw.close()}};
}

test("report policies can be prepared while closed, require independent reviewed DOCX, and do not enable HRM",async()=>{
 const f=fixture();try{
  const ref=await f.create();assert.equal(await f.create(),ref);assert.equal(f.row(ref).state,"draft");
  await assert.rejects(actOnReportPolicy(f.db,f.content,f.author,"report_policy_self_review",{policyRef:ref,version:1,action:"approve",reason:"TEST self"}),{message:"report_policy_self_review"});
  await f.approve(ref);await f.activate(ref);await f.activate(ref);assert.equal(f.row(ref).state,"active");assert.equal(f.row(ref).reviewed_by,f.approver.id);assert.equal(f.row(ref).source_checksum,f.checksum);
  assert.equal(f.db.raw.prepare("SELECT enabled FROM hrm_settings").get()?.enabled,0);
  assert.equal((await listReportPolicies(f.db,f.author)).length,1);
  await assert.rejects(listReportPolicies(f.db,f.officer),{message:"forbidden"});
 }finally{f.close()}
});

test("report review rejects missing source and enforces current capability at commit",async()=>{
 const f=fixture();try{
  const missing=await f.create("report_policy_no_source",{...f.input,sourceVersionId:null});await assert.rejects(f.approve(missing));assert.equal(f.row(missing).state,"draft");
  const ref=await f.create();f.db.raw.prepare("DELETE FROM workspace_roles WHERE user_id=?").run(f.approver.id);await assert.rejects(f.approve(ref));assert.equal(f.row(ref).state,"draft");assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_commands WHERE actor_id=?").get(f.approver.id)?.n,0);
  await assert.rejects(createReportPolicy(f.db,f.content,f.employee,"report_policy_bad_actor",f.input),{message:"forbidden"});
 }finally{f.close()}
});

test("report policy owner must remain active and able to read reports at review and activation",async()=>{
 const f=fixture();try{
  const ref=await f.create();f.content.raw.prepare("UPDATE users SET disabled=1 WHERE id=?").run(f.officer.id);await assert.rejects(f.approve(ref),{message:"report_account_unavailable"});
  f.content.raw.prepare("UPDATE users SET disabled=0 WHERE id=?").run(f.officer.id);await f.approve(ref);f.db.raw.prepare("UPDATE workspace_members SET enabled=0 WHERE user_id=?").run(f.officer.id);await assert.rejects(f.activate(ref),{message:"report_account_unavailable"});assert.equal(f.row(ref).state,"reviewed");
 }finally{f.close()}
});

test("report policy rollover pauses bound schedules without silently rebinding or resetting terms",async()=>{
 const f=fixture();try{
  const first=await f.create();await f.approve(first);await f.activate(first);f.schedule(first);
  const second=await f.create("report_policy_second_create",{...f.input,retentionDays:14});await f.approve(second,1,"report_policy_second_review");await f.activate(second,"report_policy_second_activate");
  assert.equal(f.row(first).state,"retired");assert.equal(f.row(second).state,"active");const schedule=f.db.raw.prepare("SELECT * FROM hrm_report_schedules").get()!;assert.equal(schedule.state,"paused");assert.equal(schedule.retention_days,7);
  assert.equal(f.db.raw.prepare("SELECT policy_id FROM hrm_report_schedule_policies").get()?.policy_id,f.row(first).id);
  assert.throws(()=>f.db.raw.prepare("UPDATE hrm_report_schedules SET state='active',version=version+1 WHERE id='report_schedule'").run(),/hrm_report_policy_required/);
 }finally{f.close()}
});

test("concurrent report approvals have one winner and immutable definitions cannot be rewritten",async()=>{
 const f=fixture();try{
  const ref=await f.create();const outcome=await Promise.allSettled([f.approve(ref,1,"report_policy_race_a"),f.approve(ref,1,"report_policy_race_b")]);assert.equal(outcome.filter(r=>r.status==="fulfilled").length,1);assert.equal(f.row(ref).version,2);
  assert.throws(()=>f.db.raw.prepare("UPDATE hrm_report_policy_versions SET retention_days=36500,version=version+1 WHERE policy_ref=?").run(ref),/immutable_history/);
  assert.throws(()=>f.db.raw.prepare("DELETE FROM hrm_report_policy_versions WHERE policy_ref=?").run(ref),/immutable_history/);
 }finally{f.close()}
});

test("report holds support future class scope, hide private reasons, and require independent release",async()=>{
 const f=fixture();try{
  const input={scopeKind:"class" as const,targetRef:"TEST-OPS",departmentMode:"exact" as const,department:null,period:"2026-10",reason:"TEST private investigation reason"};
  const ref=await placeReportHold(f.db,f.content,f.author,"report_hold_class_place",input);assert.equal(await placeReportHold(f.db,f.content,f.author,"report_hold_class_place",input),ref);
  assert.equal((await listReportHolds(f.db,f.author))[0].department,null);await assert.rejects(listReportHolds(f.db,f.officer),{message:"forbidden"});
  await assert.rejects(releaseReportHold(f.db,f.content,f.author,"report_hold_self_release",{holdRef:ref,version:1,reason:"TEST self"}),{message:"report_hold_self_release"});
  await releaseReportHold(f.db,f.content,f.approver,"report_hold_independent_release",{holdRef:ref,version:1,reason:"TEST independently ended hold"});
  await releaseReportHold(f.db,f.content,f.approver,"report_hold_independent_release",{holdRef:ref,version:1,reason:"TEST independently ended hold"});
  const row=f.db.raw.prepare("SELECT * FROM hrm_report_holds").get()!;assert.equal(row.state,"released");assert.equal(row.released_by,f.approver.id);assert.ok(row.released_at);
  assert.throws(()=>f.db.raw.prepare("DELETE FROM hrm_report_holds").run(),/immutable_history/);
 }finally{f.close()}
});

async function storedFixture(){
 const f=fixture(),ref=await f.create("report_manual_policy_create",{...f.input,captureKind:"manual"});await f.approve(ref);await f.activate(ref);
 const insert=(snapshotId:string,department:string|null=null,entity="TEST entity",basis="policy:"+ref)=>{
  const started=new Date().toISOString(),completed=new Date(Date.now()+1).toISOString(),expiry=new Date(Date.parse(completed)+7*3600000+7*86400000).toISOString().slice(0,10);
  f.db.raw.prepare(`INSERT INTO hrm_report_snapshots(id,snapshot_ref,source,legal_entity,period,department,snapshot_json,snapshot_checksum,generated_at,retention_days,retention_basis,expires_on,created_by,created_at,actor_id)
   VALUES(?,?,'manual',?,'2026-10',?,'{"TEST":"synthetic aggregate"}',?,?,7,?,?,?, ?,?)`).run(snapshotId,"TEST-"+snapshotId,entity,department,f.checksum,started,basis,expiry,f.author.id,completed,f.author.id);
 };
 const expire=(snapshotId:string)=>f.db.raw.prepare("UPDATE hrm_report_snapshots SET state='expired',snapshot_json='{}',snapshot_checksum=NULL,expired_at='2031-01-01T00:00:00.000Z' WHERE id=?").run(snapshotId);
 return {...f,ref,insert,expire};
}

test("future scoped and overlapping holds preserve matching snapshots; release never resets expiry or resurrects payload",async()=>{
 const f=await storedFixture();try{
  const classHold=await placeReportHold(f.db,f.content,f.author,"report_future_class_hold",{scopeKind:"class",targetRef:"TEST-OPS",departmentMode:"exact",department:null,period:"2026-10",reason:"TEST preserve entity aggregate only"});
  f.insert("aggregate");f.insert("department","TEST Department");
  await assert.rejects(placeReportHold(f.db,f.content,f.author,"report_exact_wrong_period",{scopeKind:"snapshot",targetRef:"TEST-aggregate",period:"2026-09",departmentMode:"all",reason:"TEST inconsistent exact scope"}),{message:"not_found"});
  await assert.rejects(placeReportHold(f.db,f.content,f.author,"report_exact_wrong_department",{scopeKind:"snapshot",targetRef:"TEST-aggregate",departmentMode:"exact",department:"TEST Department",reason:"TEST inconsistent exact department"}),{message:"not_found"});

  const exactHold=await placeReportHold(f.db,f.content,f.author,"report_exact_hold_place",{scopeKind:"snapshot",targetRef:"TEST-aggregate",departmentMode:"all",reason:"TEST second independent preservation basis"});
  const original=f.db.raw.prepare("SELECT snapshot_json,expires_on,generated_at,created_at FROM hrm_report_snapshots WHERE id='aggregate'").get();
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_report_snapshot_hold_matches WHERE snapshot_id='aggregate'").get()?.n,2);
  assert.throws(()=>f.expire("aggregate"),/hrm_report_snapshot_preserved/);f.expire("department");
  await releaseReportHold(f.db,f.content,f.approver,"report_future_class_release",{holdRef:classHold,version:1,reason:"TEST first matter resolved"});assert.throws(()=>f.expire("aggregate"),/hrm_report_snapshot_preserved/);
  assert.deepEqual(f.db.raw.prepare("SELECT snapshot_json,expires_on,generated_at,created_at FROM hrm_report_snapshots WHERE id='aggregate'").get(),original);
  await releaseReportHold(f.db,f.content,f.approver,"report_exact_hold_release",{holdRef:exactHold,version:1,reason:"TEST second matter resolved"});f.expire("aggregate");
  await assert.rejects(placeReportHold(f.db,f.content,f.author,"report_hold_no_resurrection",{scopeKind:"snapshot",targetRef:"TEST-aggregate",departmentMode:"all",reason:"TEST too late"}),{message:"not_found"});
  assert.throws(()=>f.db.raw.prepare("UPDATE hrm_report_snapshots SET state='active',snapshot_json='{}',expired_at=NULL WHERE id='aggregate'").run());
  await placeReportHold(f.db,f.content,f.author,"report_broad_after_purge",{scopeKind:"entity",departmentMode:"all",reason:"TEST preserve future reports without reviving erased payloads"});
  const {listReportSnapshots}=await import("../src/lib/hrm/report-snapshots.ts");const page=await listReportSnapshots(f.db,{...f.author,hrmEnabled:true});assert.ok(page.snapshots.every(row=>row.hold_active===0),"a broad hold must not advertise held downloads for purged tombstones");

 }finally{f.close()}
});

test("snapshot capture binds immutable reviewed terms and actual clocks, rejecting arbitrary TTL and premature expiry",async()=>{
 const f=await storedFixture();try{
  assert.throws(()=>f.insert("unapproved",null,"TEST entity","TEST arbitrary retention basis"),/hrm_report_policy_required/);
  assert.throws(()=>f.insert("wrongentity",null,"OTHER entity"),/hrm_report_policy_required/);
  f.insert("governed");
  const row=f.db.raw.prepare("SELECT * FROM hrm_report_snapshots WHERE id='governed'").get()!,binding=f.db.raw.prepare("SELECT * FROM hrm_report_snapshot_policies WHERE snapshot_id='governed'").get()!;
  assert.equal(binding.policy_id,f.row(f.ref).id);assert.equal(binding.capture_started_at,row.generated_at);assert.equal(binding.capture_completed_at,row.created_at);assert.equal(binding.scheduled_for,null);
  assert.throws(()=>f.db.raw.prepare("UPDATE hrm_report_snapshots SET state='expired',snapshot_json='{}',snapshot_checksum=NULL,expired_at=? WHERE id='governed'").run(row.created_at),/hrm_report_snapshot_preserved/);
  assert.throws(()=>f.db.raw.prepare("UPDATE hrm_report_snapshot_policies SET capture_started_at='2020-01-01'").run(),/immutable_history/);
  await actOnReportPolicy(f.db,f.content,f.approver,"report_manual_policy_retire",{policyRef:f.ref,version:3,action:"retire",reason:"TEST no new captures"});
  assert.throws(()=>f.insert("afterretire"),/hrm_report_policy_required/);f.expire("governed");assert.equal(f.db.raw.prepare("SELECT state FROM hrm_report_snapshots WHERE id='governed'").get()?.state,"expired","retiring a policy preserves its frozen expiry terms");
 }finally{f.close()}
});

test("capture and hold ordering never revives a purged payload and always protects an existing held payload",async()=>{
 const f=await storedFixture();try{
  f.insert("holdfirst");f.insert("purgefirst");
  await placeReportHold(f.db,f.content,f.author,"report_race_hold_winner",{scopeKind:"snapshot",targetRef:"TEST-holdfirst",departmentMode:"all",reason:"TEST hold arrives before purge"});assert.throws(()=>f.expire("holdfirst"),/hrm_report_snapshot_preserved/);
  f.expire("purgefirst");await assert.rejects(placeReportHold(f.db,f.content,f.author,"report_race_purge_winner",{scopeKind:"snapshot",targetRef:"TEST-purgefirst",departmentMode:"all",reason:"TEST payload already purged"}),{message:"not_found"});
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_report_holds").get()?.n,1);assert.equal(f.db.raw.prepare("SELECT snapshot_json FROM hrm_report_snapshots WHERE id='purgefirst'").get()?.snapshot_json,"{}");
 }finally{f.close()}
});

test("manual capture uses policy terms, rejects free retention and keeps command retries idempotent",async()=>{
 const f=fixture();try{
  const {saveReportSnapshot,readReportSnapshot}=await import("../src/lib/hrm/report-snapshots.ts");
  const policy=await f.create("report_service_manual_create",{...f.input,captureKind:"manual"});await f.approve(policy);await f.activate(policy);
  f.db.raw.prepare("UPDATE hrm_settings SET enabled=1,purpose='TEST',retention_policy='TEST',policy_reference='TEST',reviewed_by=?").run(f.approver.id);
  const author={...f.author,hrmEnabled:true};
  const ref=await saveReportSnapshot(f.db,f.content,author,"report_manual_service_save",{period:"2026-10"},{policyRef:policy});
  assert.equal(await saveReportSnapshot(f.db,f.content,author,"report_manual_service_save",{period:"2026-10"},{policyRef:policy}),ref);
  const snapshot=await readReportSnapshot(f.db,author,ref);assert.equal(snapshot.retention_days,7);assert.equal(snapshot.retention_basis,"policy:"+policy);assert.equal(snapshot.report.generated_at,snapshot.generated_at);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_report_snapshots").get()?.n,1);
  await assert.rejects(saveReportSnapshot(f.db,f.content,author,"report_manual_free_terms",{period:"2026-10"},{policyRef:"TEST-unapproved"}),{message:"not_found"});
 }finally{f.close()}
});

test("scheduler rechecks owner access and pauses an orphaned schedule before creating a snapshot",async()=>{
 const f=fixture();try{
  const {createReportSchedule,runHrmReportScheduleSweep}=await import("../src/lib/hrm/report-snapshots.ts");
  const policy=await f.create();await f.approve(policy);await f.activate(policy);
  f.db.raw.prepare("UPDATE hrm_settings SET enabled=1,purpose='TEST',retention_policy='TEST',policy_reference='TEST',reviewed_by=?").run(f.approver.id);
  await createReportSchedule(f.db,f.content,{...f.author,hrmEnabled:true},"report_service_schedule_create",{cadence:"daily",department:null,policyRef:policy});
  f.content.raw.prepare("UPDATE users SET disabled=1 WHERE id=?").run(f.officer.id);
  const result=await runHrmReportScheduleSweep(f.db,f.content,"true",Date.now());assert.equal(result.created,0);assert.equal(f.db.raw.prepare("SELECT state FROM hrm_report_schedules").get()?.state,"paused");
  const event=f.db.raw.prepare("SELECT detail_json FROM hrm_report_schedule_events WHERE event_type='run_failed'").get()!;assert.equal(event.detail_json,'{"error_code":"report_account_unavailable"}');assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_report_snapshots").get()?.n,0);
 }finally{f.close()}
});

test("scheduled captures retain separate nominal and actual clocks and reject duplicate nominal runs",async()=>{
 const f=fixture();try{
  const {createReportSchedule,runHrmReportScheduleSweep}=await import("../src/lib/hrm/report-snapshots.ts");
  const policy=await f.create();await f.approve(policy);await f.activate(policy);
  f.db.raw.prepare("UPDATE hrm_settings SET enabled=1,purpose='TEST',retention_policy='TEST',policy_reference='TEST',reviewed_by=?").run(f.approver.id);
  await createReportSchedule(f.db,f.content,{...f.author,hrmEnabled:true},"report_delayed_schedule_create",{cadence:"daily",department:null,policyRef:policy});
  const nominal=Date.now()-60000,result=await runHrmReportScheduleSweep(f.db,f.content,"true",nominal);assert.equal(result.created,1);
  const row=f.db.raw.prepare("SELECT * FROM hrm_report_snapshots").get()!,binding=f.db.raw.prepare("SELECT * FROM hrm_report_snapshot_policies").get()!;
  assert.equal(row.scheduled_for,new Date(nominal).toISOString());assert.ok(String(row.generated_at)>String(row.scheduled_for));assert.equal(binding.capture_completed_at,row.created_at);
  assert.equal((await runHrmReportScheduleSweep(f.db,f.content,"true",nominal)).created,0);assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_report_snapshots").get()?.n,1);
 }finally{f.close()}
});

test("expiry excludes held rows before its limit, uses actual processing date, and defers while the gate is closed",async t=>{
 t.mock.timers.enable({apis:["Date"],now:new Date("2026-10-10T01:40:00.000Z")});
 const f=await storedFixture();try{
  const {runHrmReportScheduleSweep}=await import("../src/lib/hrm/report-snapshots.ts");
  for(let index=0;index<1002;index++)f.insert("bulk-"+index,index===1001?"TEST unheld department":null);
  const hold=await placeReportHold(f.db,f.content,f.author,"report_bulk_class_hold",{scopeKind:"class",targetRef:"TEST-OPS",departmentMode:"exact",department:null,reason:"TEST hold earlier rows without starving expiry"});
  t.mock.timers.setTime(new Date("2026-10-19T01:40:00.000Z").getTime());
  const closed=await runHrmReportScheduleSweep(f.db,f.content,"true",Date.parse("2026-10-17T01:40:00.000Z"));assert.equal(closed.skipped,true);assert.equal(closed.expired,0);
  f.db.raw.prepare("UPDATE hrm_settings SET enabled=1,purpose='TEST',retention_policy='TEST',policy_reference='TEST',reviewed_by=?").run(f.approver.id);
  const first=await runHrmReportScheduleSweep(f.db,f.content,"true",Date.parse("2026-10-17T01:40:00.000Z"));assert.equal(first.expired,1,"delayed processing uses October 19, not the nominal last-readable date October 17");
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_report_snapshots WHERE state='active'").get()?.n,1001);
  await releaseReportHold(f.db,f.content,f.approver,"report_bulk_hold_release",{holdRef:hold,version:1,reason:"TEST matter resolved"});
  assert.equal((await runHrmReportScheduleSweep(f.db,f.content,"true",Date.now())).expired,1000);assert.equal((await runHrmReportScheduleSweep(f.db,f.content,"true",Date.now())).expired,1);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_report_snapshots WHERE snapshot_json!='{}'").get()?.n,0);
 }finally{f.close();t.mock.timers.reset()}
});

test("expired held content requires a distinct capability, reason and immutable access audit",async t=>{
 t.mock.timers.enable({apis:["Date"],now:new Date("2026-10-10T01:40:00.000Z")});
 const f=fixture();try{
  const {saveReportSnapshot,readReportSnapshot,exportHeldReportSnapshotCsv}=await import("../src/lib/hrm/report-snapshots.ts");
  const policy=await f.create("report_held_manual_create",{...f.input,captureKind:"manual"});await f.approve(policy);await f.activate(policy);f.db.raw.prepare("UPDATE hrm_settings SET enabled=1,purpose='TEST',retention_policy='TEST',policy_reference='TEST',reviewed_by=?").run(f.approver.id);
  const author={...f.author,hrmEnabled:true},officer={...f.officer,hrmEnabled:true},ref=await saveReportSnapshot(f.db,f.content,author,"report_held_manual_save",{period:"2026-10"},{policyRef:policy});
  const hold=await placeReportHold(f.db,f.content,f.author,"report_held_manual_hold",{scopeKind:"snapshot",targetRef:ref,departmentMode:"all",reason:"TEST private matter"});
  t.mock.timers.setTime(new Date("2026-10-19T01:40:00.000Z").getTime());await assert.rejects(readReportSnapshot(f.db,author,ref),{message:"not_found"});
  await assert.rejects(exportHeldReportSnapshotCsv(f.db,f.content,officer,"report_held_officer_export",ref,"TEST authorized work","en"),{message:"forbidden"});
  await assert.rejects(exportHeldReportSnapshotCsv(f.db,f.content,author,"report_held_no_reason",ref,"","en"),{message:"invalid_field"});
  const csv=await exportHeldReportSnapshotCsv(f.db,f.content,author,"report_held_audited_export",ref,"TEST evidence review","en");assert.ok(csv.includes(ref));assert.ok(csv.includes("2026-10-17"));assert.ok(!csv.includes("TEST private matter"));
  await exportHeldReportSnapshotCsv(f.db,f.content,author,"report_held_audited_export",ref,"TEST evidence review","en");assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_report_held_access").get()?.n,1);
  assert.throws(()=>f.db.raw.prepare("DELETE FROM hrm_report_held_access").run(),/immutable_history/);
  const raceDb:D1Database=Object.create(f.db);raceDb.prepare=(sql:string)=>{
   const statement=f.db.prepare(sql);if(sql.includes("SELECT operation,payload_hash,result_id FROM hrm_commands")){
    const bind=statement.bind.bind(statement);statement.bind=(...values:unknown[])=>{const bound=bind(...values),first=bound.first.bind(bound);bound.first=async<T>(column?:string)=>{const result=await first<T>(column);f.db.raw.prepare("UPDATE workspace_members SET enabled=0 WHERE user_id=?").run(f.author.id);return result};return bound};
   }return statement;
  };
  await assert.rejects(exportHeldReportSnapshotCsv(raceDb,f.content,author,"report_held_audited_export",ref,"TEST evidence review","en"),/CHECK constraint failed/,"a command replay cannot skip a role revocation before disclosure");
  f.db.raw.prepare("UPDATE workspace_members SET enabled=1 WHERE user_id=?").run(f.author.id);

  await releaseReportHold(f.db,f.content,f.approver,"report_held_access_release",{holdRef:hold,version:1,reason:"TEST resolved"});await assert.rejects(exportHeldReportSnapshotCsv(f.db,f.content,author,"report_held_after_release",ref,"TEST no longer held","en"),{message:"not_found"});
 }finally{f.close();t.mock.timers.reset()}
});

test("an ended accountable owner cannot keep a report schedule running through an unchanged Workspace role",async()=>{
 const f=fixture();try{
  const {createReportSchedule,runHrmReportScheduleSweep}=await import("../src/lib/hrm/report-snapshots.ts");
  const policy=await f.create();await f.approve(policy);await f.activate(policy);f.db.raw.prepare("UPDATE hrm_settings SET enabled=1,purpose='TEST',retention_policy='TEST',policy_reference='TEST',reviewed_by=?").run(f.approver.id);
  await createReportSchedule(f.db,f.content,{...f.author,hrmEnabled:true},"report_ended_owner_schedule",{cadence:"daily",department:null,policyRef:policy});
  f.db.raw.prepare("INSERT INTO hrm_people(id,employee_code,user_id,legal_name,actor_id,created_at,updated_at) VALUES('report_owner_person','TEST-REPORT-OWNER',?,'TEST owner',?,?,?)").run(f.officer.id,f.author.id,f.time,f.time);
  f.db.raw.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,started_on,ended_on,actor_id,created_at,updated_at) VALUES('report_owner_employment','report_owner_person','TEST entity','ended','2026-01-01','2026-01-02',?,?,?)").run(f.author.id,f.time,f.time);
  assert.equal((await runHrmReportScheduleSweep(f.db,f.content,"true",Date.now())).created,0);assert.equal(f.db.raw.prepare("SELECT state FROM hrm_report_schedules").get()?.state,"paused");assert.equal(f.db.raw.prepare("SELECT enabled FROM workspace_members WHERE user_id=?").get(f.officer.id)?.enabled,1);
 }finally{f.close()}
});
