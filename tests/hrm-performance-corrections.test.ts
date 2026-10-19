import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./support/d1-sqlite.ts";
import { digest } from "../src/lib/hrm/service.ts";
import { exportOwnHrmProfile } from "../src/lib/hrm/profile-export.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { actOnPerformanceReview, createPerformanceReview, getPerformanceReview } from "../src/lib/hrm/performance.ts";
import { createPerformanceCorrection } from "../src/lib/hrm/performance-corrections.ts";

async function fixture(close=false){
 const db=sqliteD1(),content=sqliteD1("content"),time=new Date().toISOString();
 const actor=(id:string,roles:Parameters<typeof makeUser>[2])=>({...makeUser({id,name:id,email:id+"@example.test"},false,roles),hrmEnabled:true});
 const hr=actor("corr_hr",["hrm_officer"]),employee=actor("corr_employee",["employee","hrm_admin"]),reviewer=actor("corr_reviewer",["people_manager"]),other=actor("corr_other",["people_manager"]),approver=actor("corr_approver",["hrm_admin"]),outsider=actor("corr_outsider",["employee"]);
 for(const user of [hr,employee,reviewer,other,approver,outsider]){
  db.raw.prepare("INSERT INTO workspace_members(user_id,granted_by,created_at,updated_at) VALUES(?,'test-owner',?,?)").run(user.id,time,time);
  for(const role of user.roles)db.raw.prepare("INSERT INTO workspace_roles(user_id,role,granted_by,granted_at) VALUES(?,?,'test-owner',?)").run(user.id,role,time);
  content.raw.prepare("INSERT INTO users(id,email,name) VALUES(?,?,?)").run(user.id,user.email,user.name);
 }
 db.raw.prepare("UPDATE hrm_settings SET enabled=1,legal_entity='TEST entity',purpose='TEST only',retention_policy='TEST only',policy_reference='TEST only',reviewed_by='test-owner',reviewed_at=? WHERE id=1").run(time);
 db.raw.prepare("INSERT INTO hrm_people(id,employee_code,user_id,legal_name,actor_id,created_at,updated_at) VALUES('corr_person','TEST-CORR',?,'TEST Employee',?,?,?)").run(employee.id,hr.id,time,time);
 db.raw.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,started_on,actor_id,created_at,updated_at) VALUES('corr_employment','corr_person','TEST entity','active','2026-01-01',?,?,?)").run(hr.id,time,time);
 const root=await createPerformanceReview(db,content,hr,"correction_root_create",{personId:"corr_person",cycleCode:"TEST-ROOT",title:"TEST original review",periodStart:"2026-01-01",periodEnd:"2026-03-31",dueOn:"2026-04-15",reviewerId:reviewer.id,objectives:"TEST original objectives",evidenceInstructions:"TEST dated source facts"});
 const row=(id:string)=>db.raw.prepare("SELECT * FROM hrm_performance_reviews WHERE id=?").get(id)!;
 await actOnPerformanceReview(db,content,employee,"correction_root_self",{action:"submit_self",reviewId:root,revision:1,assessment:"TEST original employee words",evidence:"TEST original employee evidence"});
 await actOnPerformanceReview(db,content,reviewer,"correction_root_assess",{action:"assess",reviewId:root,revision:2,assessment:"TEST original published assessment",evidence:"TEST original staff evidence",developmentPlan:"TEST original plan"});
 await actOnPerformanceReview(db,content,approver,"correction_root_publish",{action:"publish",reviewId:root,revision:3,reason:"TEST independent publication"});
 if(close){await actOnPerformanceReview(db,content,employee,"correction_root_respond",{action:"respond",reviewId:root,revision:4,acknowledged:true,feedback:"TEST original disagreement"});await actOnPerformanceReview(db,content,approver,"correction_root_close",{action:"close",reviewId:root,revision:5,reason:"TEST independent close"})}
 const input=(code:string,mode="carry_forward")=>({sourceId:root,sourceRevision:Number(row(root).revision),cycleCode:code,title:"TEST linked correction",periodStart:"2026-01-01",periodEnd:"2026-03-31",dueOn:"2026-04-30",reviewerId:other.id,objectives:"TEST corrected objectives",evidenceInstructions:"TEST corrected evidence requirements",reason:"TEST employee-visible correction reason",selfMode:mode});
 const assess=async(id:string,key="correction_child_assess")=>actOnPerformanceReview(db,content,other,key,{action:"assess",reviewId:id,revision:Number(row(id).revision),assessment:"TEST revised private assessment",evidence:"TEST revised evidence",developmentPlan:"TEST revised development plan"});
 const publish=(id:string,sourceRevision:number,key="correction_child_publish")=>actOnPerformanceReview(db,content,approver,key,{action:"publish",reviewId:id,revision:Number(row(id).revision),reason:"TEST reviewed the current source",sourceRevision,sourceReviewed:true});
 return {db,content,hr,employee,reviewer,other,approver,outsider,root,row,input,assess,publish,close:()=>{db.raw.close();content.raw.close()}};
}

test("historical correction carries authentic context without restoring access or forging a receipt",async()=>{
 const f=await fixture(true);try{
  const original={...f.row(f.root)},origin=f.db.raw.prepare("SELECT id,created_at FROM hrm_performance_events WHERE review_id=? AND event_type='submit_self'").get(f.root)!;
  f.db.raw.prepare("UPDATE hrm_employments SET status='ended',ended_on='2026-04-01',version=version+1 WHERE id='corr_employment'").run();f.db.raw.prepare("UPDATE workspace_members SET enabled=0 WHERE user_id=?").run(f.employee.id);f.content.raw.prepare("UPDATE users SET disabled=1 WHERE id=?").run(f.employee.id);
  const input={...f.input("TEST-HISTORICAL"),periodStart:"2026-01-02",periodEnd:"2026-03-30"};
  const child=await createPerformanceCorrection(f.db,f.content,f.hr,"correction_historical_create",input);assert.equal(await createPerformanceCorrection(f.db,f.content,f.hr,"correction_historical_create",input),child);
  const link=f.db.raw.prepare("SELECT * FROM hrm_performance_corrections WHERE replacement_review_id=?").get(child)!;assert.equal(link.self_origin_event_id,origin.id);assert.equal(link.source_revision_at_creation,6);assert.equal(link.attempt_no,1);assert.equal(f.row(child).self_assessment,original.self_assessment);assert.equal(f.row(child).state,"self_submitted");assert.equal(f.row(child).period_start,"2026-01-02");
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_performance_events WHERE review_id=? AND event_type='submit_self'").get(child)?.n,0,"HR never fabricates a new employee submission");
  await f.assess(child);await f.publish(child,6);
  assert.equal(await createPerformanceCorrection(f.db,f.content,f.hr,"correction_historical_create",input),child,"a completed creation retry remains idempotent after publication");
  assert.deepEqual({...f.row(f.root)},original,"old assessment, disagreement and receipt remain byte-for-byte unchanged");assert.equal(f.row(child).acknowledged_at,null);assert.equal(f.row(child).employee_feedback,"");
  assert.equal(f.db.raw.prepare("SELECT enabled FROM workspace_members WHERE user_id=?").get(f.employee.id)?.enabled,0);assert.equal(f.content.raw.prepare("SELECT disabled FROM users WHERE id=?").get(f.employee.id)?.disabled,1);
  const lineage=(await getPerformanceReview(f.db,f.approver,child)).lineage;assert.equal(lineage.correction?.self_submitted_at,origin.created_at);assert.equal(lineage.correction?.self_origin_objectives,"TEST original objectives");assert.equal(lineage.current?.id,child);
  await assert.rejects(actOnPerformanceReview(f.db,f.content,f.approver,"correction_premature_close",{action:"close",reviewId:child,revision:Number(f.row(child).revision),reason:"TEST no forged receipt"}),{message:"invalid_transition"});
  assert.throws(()=>f.db.raw.prepare("UPDATE hrm_performance_corrections SET reason='rewrite' WHERE id=?").run(link.id),/immutable_history/);assert.throws(()=>f.db.raw.prepare("DELETE FROM hrm_performance_correction_publications WHERE correction_id=?").run(link.id),/immutable_history/);
 }finally{f.close()}
});

test("concurrent correction creation has one winner, no orphan, and cancelled attempts permit an idempotent retry",async()=>{
 const f=await fixture(true);try{
  const inputs=[f.input("TEST-RACE-A","new_submission"),f.input("TEST-RACE-B","new_submission")],keys=["correction_create_race_a","correction_create_race_b"];
  const results=await Promise.allSettled(inputs.map((input,i)=>createPerformanceCorrection(f.db,f.content,f.hr,keys[i],input)));assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  const winner=results.find(r=>r.status==="fulfilled");assert.ok(winner&&winner.status==="fulfilled");const failed=results.findIndex(r=>r.status==="rejected");assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_performance_reviews").get()?.n,2,"failed batch leaves no unlinked review");
  await actOnPerformanceReview(f.db,f.content,f.hr,"correction_cancel_attempt",{action:"cancel",reviewId:winner.value,revision:1,reason:"TEST cancel an unpublished proposal"});
  const retried=await createPerformanceCorrection(f.db,f.content,f.hr,keys[failed],inputs[failed]);assert.equal(f.row(retried).state,"open");assert.equal(f.db.raw.prepare("SELECT attempt_no FROM hrm_performance_corrections WHERE replacement_review_id=?").get(retried)?.attempt_no,2);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_performance_corrections").get()?.n,2);assert.equal((await getPerformanceReview(f.db,f.employee,f.root)).lineage.current?.id,f.root,"an unpublished/cancelled correction never supersedes the source");
  await assert.rejects(createPerformanceCorrection(f.db,f.content,f.hr,"correction_missing_mode",{...f.input("TEST-MODE"),selfMode:""}),{message:"performance_correction_self_mode_required"});
 }finally{f.close()}
});

test("publication rechecks current source feedback and old receipts remain idempotent after supersession",async()=>{
 const f=await fixture();try{
  const child=await createPerformanceCorrection(f.db,f.content,f.hr,"correction_feedback_create",f.input("TEST-FEEDBACK"));await f.assess(child);
  const response={action:"respond" as const,reviewId:f.root,revision:4,acknowledged:true,feedback:"TEST employee adds a disagreement during correction preparation"};await actOnPerformanceReview(f.db,f.content,f.employee,"correction_source_response",response);
  await assert.rejects(f.publish(child,4),{message:"performance_correction_conflict"});assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_performance_correction_publications").get()?.n,0,"stale approval leaves no basis record");
  const detail=await getPerformanceReview(f.db,f.approver,child);assert.equal(detail.lineage.correction?.source_context?.revision,5);assert.equal(detail.lineage.correction?.source_context?.employee_feedback,response.feedback);
  await assert.rejects(actOnPerformanceReview(f.db,f.content,f.approver,"correction_missing_source_check",{action:"publish",reviewId:child,revision:2,reason:"TEST omitted source review",sourceRevision:5}),{message:"performance_correction_source_review_required"});
  await f.publish(child,5);const original={...f.row(f.root)};
  await actOnPerformanceReview(f.db,f.content,f.employee,"correction_source_response",response);assert.deepEqual({...f.row(f.root)},original);
  await assert.rejects(actOnPerformanceReview(f.db,f.content,f.approver,"correction_old_close",{action:"close",reviewId:f.root,revision:5,reason:"TEST old version cannot be closed after replacement"}),{message:"performance_review_superseded"});
  assert.equal((await getPerformanceReview(f.db,f.employee,f.root)).lineage.superseded,true);assert.equal(f.row(child).employee_feedback,"");assert.equal(f.row(child).acknowledged_at,null);
 }finally{f.close()}
});

test("publication and source acknowledgement race admits one winner and no stale approval",async()=>{
 const f=await fixture();try{
  const child=await createPerformanceCorrection(f.db,f.content,f.hr,"correction_receipt_race_create",f.input("TEST-RECEIPT-RACE"));await f.assess(child);
  const results=await Promise.allSettled([f.publish(child,4),actOnPerformanceReview(f.db,f.content,f.employee,"correction_receipt_race_response",{action:"respond",reviewId:f.root,revision:4,acknowledged:true,feedback:"TEST race feedback"})]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  if(results[0].status==="rejected"){assert.equal(f.row(f.root).state,"responded");assert.equal(f.row(child).state,"assessed");await f.publish(child,5,"correction_publish_after_feedback")}
  else{assert.equal(f.row(f.root).state,"published");assert.equal(f.row(f.root).acknowledged_at,null)}
  const basis=f.db.raw.prepare("SELECT source_revision FROM hrm_performance_correction_publications").get();assert.equal(basis?.source_revision,f.row(f.root).revision);assert.equal(f.row(child).state,"published");
 }finally{f.close()}
});

test("lineage links never grant source access, and subject identity changes fail closed",async()=>{
 const f=await fixture(true);try{
  await assert.rejects(createPerformanceCorrection(f.db,f.content,f.employee,"correction_subject_before_create",f.input("TEST-SELF-FIRST")),{message:"performance_self_review"});
  const child=await createPerformanceCorrection(f.db,f.content,f.hr,"correction_scoped_create",f.input("TEST-SCOPE"));await f.assess(child);
  const assigned=await getPerformanceReview(f.db,f.other,child);assert.equal(assigned.lineage.correction?.source,null);assert.equal(assigned.lineage.correction?.root,null);assert.equal(assigned.lineage.correction?.source_context,null);assert.equal(assigned.lineage.correction?.source_publication_checksum,null);
  await assert.rejects(getPerformanceReview(f.db,f.other,f.root),{message:"not_found"});await assert.rejects(getPerformanceReview(f.db,f.outsider,child),{message:"not_found"});
  const subject=await getPerformanceReview(f.db,f.employee,child);assert.equal(subject.review.assessment,"");assert.equal(subject.lineage.correction?.source_context,null);
  await assert.rejects(createPerformanceCorrection(f.db,f.content,f.employee,"correction_subject_create",f.input("TEST-SELF")),{message:"performance_correction_conflict"});
  f.db.raw.prepare("UPDATE hrm_people SET user_id=?,version=version+1 WHERE id='corr_person'").run(f.outsider.id);
  const originalSubject=await getPerformanceReview(f.db,f.employee,child);assert.equal(originalSubject.review.assessment,"");assert.equal(originalSubject.lineage.identity_aligned,false);assert.equal(originalSubject.lineage.correction?.source_context,null);await assert.rejects(getPerformanceReview(f.db,f.outsider,child),{message:"not_found"});
  await assert.rejects(f.publish(child,6),{message:"performance_correction_source_invalid"});
 }finally{f.close()}
});

test("new employee facts replace the carried origin for later generations and export uses private local references",async()=>{
 const f=await fixture(true);try{
  const input={...f.input("TEST-NEW-FACTS","new_submission"),periodStart:"2026-01-02",periodEnd:"2026-03-30"};
  const child=await createPerformanceCorrection(f.db,f.content,f.hr,"correction_new_facts_create",input);assert.equal(f.row(child).state,"open");assert.equal(f.row(child).self_assessment,"");
  await actOnPerformanceReview(f.db,f.content,f.employee,"correction_new_self",{action:"submit_self",reviewId:child,revision:1,assessment:"TEST newly submitted employee facts",evidence:"TEST new source evidence"});
  const actualSubmission=f.db.raw.prepare("SELECT id,created_at FROM hrm_performance_events WHERE review_id=? AND event_type='submit_self'").get(child)!;
  await f.assess(child);await f.publish(child,6);
  assert.equal(f.row(child).revision,4,"a fresh employee submission has its own revision before publication");
  const next=await createPerformanceCorrection(f.db,f.content,f.hr,"correction_new_origin_carry",{...f.input("TEST-NEXT-GENERATION"),sourceId:child,sourceRevision:Number(f.row(child).revision)});
  assert.equal(f.row(next).self_assessment,"TEST newly submitted employee facts");assert.equal(f.db.raw.prepare("SELECT self_origin_event_id FROM hrm_performance_corrections WHERE replacement_review_id=?").get(next)?.self_origin_event_id,actualSubmission.id);
  await assert.rejects(createPerformanceCorrection(f.db,f.content,f.hr,"correction_obsolete_source",f.input("TEST-OBSOLETE")),{message:"performance_review_superseded"});
  const bundle=JSON.parse((await exportOwnHrmProfile(f.db,f.employee)).body);assert.equal(bundle.schema_version,11);
  const root=bundle.performance_reviews.find((row:{cycle_code:string})=>row.cycle_code==="TEST-ROOT"),fresh=bundle.performance_reviews.find((row:{cycle_code:string})=>row.cycle_code==="TEST-NEW-FACTS"),carried=bundle.performance_reviews.find((row:{cycle_code:string})=>row.cycle_code==="TEST-NEXT-GENERATION");
  assert.equal(fresh.correction.source_ref,root.review_ref);assert.equal(fresh.self_submission.kind,"employee_submission");assert.equal(carried.correction.source_ref,fresh.review_ref);assert.equal(carried.self_submission.origin_ref,fresh.review_ref);assert.equal(carried.self_submission.submitted_at,actualSubmission.created_at);assert.equal(carried.self_submission.period_start,"2026-01-02");assert.equal(root.superseded,true);
  assert.ok(!JSON.stringify(bundle.performance_reviews).includes(f.root));assert.ok(!JSON.stringify(bundle.performance_reviews).includes(f.other.id));
 }finally{f.close()}
});

test("self export ignores large unpublished staff drafts and rejects excessive visible content",async()=>{
 const f=await fixture();try{
  const time=new Date().toISOString(),privateText="TEST-PRIVATE-BULK-DRAFT-"+"ấ".repeat(3800);
  const insert=f.db.raw.prepare(`INSERT INTO hrm_performance_reviews(id,person_id,employment_id,legal_entity,cycle_code,title,period_start,period_end,due_on,reviewer_user_id,objectives,evidence_instructions,state,self_assessment,self_evidence,assessment,assessment_evidence,development_plan,assessed_by,assessed_at,created_by,created_at,actor_id,updated_at) VALUES(?,'corr_person','corr_employment','TEST entity',?,'TEST bulk private draft','2026-01-01','2026-03-31','2026-04-30',?,'TEST objective','TEST evidence','assessed','TEST employee facts','TEST employee evidence',?,?,?,?,?,?,?,?,?)`);
  f.db.raw.exec("BEGIN");for(let i=0;i<1500;i++)insert.run(`private_bulk_${i}`,`TEST-PRIVATE-${i}`,f.reviewer.id,privateText,privateText,privateText,f.reviewer.id,time,f.hr.id,time,f.reviewer.id,time);f.db.raw.exec("COMMIT");
  const result=await exportOwnHrmProfile(f.db,f.employee);assert.ok(result.contentBytes<5*1024*1024);assert.ok(!result.body.includes("TEST-PRIVATE-BULK-DRAFT-"));assert.equal(JSON.parse(result.body).performance_reviews.length,1501,"private drafts do not consume the visible-content budget");
  const visible=f.db.raw.prepare(`INSERT INTO hrm_performance_reviews(id,person_id,employment_id,legal_entity,cycle_code,title,period_start,period_end,due_on,reviewer_user_id,objectives,evidence_instructions,created_by,created_at,actor_id,updated_at) VALUES(?,'corr_person','corr_employment','TEST entity',?,'TEST bulk visible text','2026-01-01','2026-03-31','2026-04-30',?,?,?,?,?,?,?)`);
  f.db.raw.exec("BEGIN");for(let i=0;i<300;i++)visible.run(`visible_bulk_${i}`,`TEST-VISIBLE-${i}`,f.reviewer.id,"ộ".repeat(4000),"ế".repeat(2000),f.hr.id,time,f.hr.id,time);f.db.raw.exec("COMMIT");
  await assert.rejects(exportOwnHrmProfile(f.db,f.employee),{message:"profile_export_too_large",status:413});
 }finally{f.close()}
});

test("D1 guards require a publication basis and prevent new receipts on an archived publication",async()=>{
 const f=await fixture();try{
  const child=await createPerformanceCorrection(f.db,f.content,f.hr,"correction_db_guards_create",f.input("TEST-DB-GUARDS"));await f.assess(child);
  const time=new Date().toISOString();
  assert.throws(()=>f.db.raw.prepare("UPDATE hrm_performance_reviews SET state='published',published_by=?,published_at=?,revision=revision+1,actor_id=?,updated_at=? WHERE id=?").run(f.approver.id,time,f.approver.id,time,child),/hrm_performance_correction_conflict/,"a direct write cannot bypass source review");
  await f.publish(child,4);const original={...f.row(f.root)};
  assert.throws(()=>f.db.raw.prepare("UPDATE hrm_performance_reviews SET state='responded',employee_feedback='TEST stale receipt',acknowledged_at=?,revision=revision+1,actor_id=?,updated_at=? WHERE id=?").run(time,f.employee.id,time,f.root),/hrm_performance_review_superseded/);
  await assert.rejects(actOnPerformanceReview(f.db,f.content,f.employee,"correction_archived_receipt",{action:"respond",reviewId:f.root,revision:4,acknowledged:true,feedback:"TEST obsolete response"}),{message:"performance_review_superseded"});
  assert.deepEqual({...f.row(f.root)},original);assert.equal(f.row(f.root).acknowledged_at,null,"publication never invents an employee receipt on the old version");
 }finally{f.close()}
});

test("correction attempt ordering is enforced by D1, not only the application counter",async()=>{
 const f=await fixture();try{
  const candidate=await createPerformanceReview(f.db,f.content,f.hr,"correction_sequence_candidate",{personId:"corr_person",cycleCode:"TEST-SEQUENCE",title:"TEST source ordering",periodStart:"2026-01-01",periodEnd:"2026-03-31",dueOn:"2026-04-30",reviewerId:f.other.id,objectives:"TEST ordering",evidenceInstructions:"TEST source facts"});
  const row=f.row(candidate),publication=f.db.raw.prepare("SELECT id,snapshot_json FROM hrm_performance_events WHERE review_id=? AND event_type='publish'").get(f.root)!;
  const insert=f.db.raw.prepare("INSERT INTO hrm_performance_corrections(id,root_review_id,source_review_id,replacement_review_id,attempt_no,source_revision_at_creation,employment_revision,source_publication_event_id,source_publication_checksum,subject_user_id,self_mode,self_origin_event_id,reason,created_by,created_at) VALUES(?,?,?,?,?,4,1,?,?,?,'new_submission',NULL,'TEST explicit source',?,?)");
  const checksum=await digest(String(publication.snapshot_json));
  assert.throws(()=>insert.run("sequence_gap",f.root,f.root,candidate,2,publication.id,checksum,f.employee.id,f.hr.id,String(row.created_at)),/hrm_performance_correction_conflict/);
  assert.doesNotThrow(()=>insert.run("sequence_valid",f.root,f.root,candidate,1,publication.id,checksum,f.employee.id,f.hr.id,String(row.created_at)),"the same otherwise-valid link succeeds with the correct next attempt");
 }finally{f.close()}
});
