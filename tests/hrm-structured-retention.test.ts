import test from "node:test";
import assert from "node:assert/strict";
import { HrmError, recordKinds } from "../src/lib/hrm/fields.ts";
import { activateStructuredRetentionPolicy, createStructuredDispositionRequest, createStructuredRetentionPolicy, parseStructuredRetentionRules, reviewStructuredRetentionPolicy, structuredRetentionDue, structuredRetentionTemplate, type StructuredRetentionRule } from "../src/lib/hrm/structured-retention.ts";
import { createLegalHold, releaseLegalHold } from "../src/lib/hrm/retention.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { sqliteD1 } from "./support/d1-sqlite.ts";

const rules=()=>recordKinds.map(kind=>({kind,retention_days:kind==="identity"?3:null,retention_anchor:kind==="identity"?"record_created":null,basis:`TEST reviewed basis for ${kind}`}));

test("structured retention starts with every personal-data category unscheduled",()=>{
 const template=JSON.parse(structuredRetentionTemplate()) as {kind:string;retention_days:number|null;retention_anchor:string|null;basis:string}[];
 assert.deepEqual(template.map(row=>row.kind),recordKinds);assert.ok(template.every(row=>row.retention_days===null&&row.retention_anchor===null&&row.basis===""));
});

test("structured retention rules require all six kinds, explicit anchors and owner-reviewed basis",()=>{
 const parsed=parseStructuredRetentionRules(JSON.stringify(rules()));assert.equal(parsed.length,6);assert.equal(parsed.find(row=>row.kind==="identity")?.retention_days,3);
 const invalid=[
  rules().slice(0,5),
  [...rules().slice(0,5),rules()[0]],
  rules().map(row=>row.kind==="identity"?{...row,retention_days:1,retention_anchor:null}:row),
  rules().map(row=>row.kind==="identity"?{...row,retention_days:null,retention_anchor:"record_created"}:row),
  rules().map(row=>row.kind==="identity"?{...row,retention_days:0}:row),
  rules().map(row=>row.kind==="tax"?{...row,basis:" "}:row),
  rules().map(row=>row.kind==="identity"?{...row,unreviewed_private_value:"TEST secret"}:row),
 ];
 for(const value of invalid)assert.throws(()=>parseStructuredRetentionRules(JSON.stringify(value)),error=>error instanceof HrmError&&error.message==="structured_retention_policy_invalid");
});

test("structured retention anchors use Vietnam-local creation dates or explicit effective ends",()=>{
 const created:StructuredRetentionRule={kind:"identity",retention_days:3,retention_anchor:"record_created",basis:"TEST creation anchor"};
 const ended:StructuredRetentionRule={kind:"identity",retention_days:1,retention_anchor:"effective_to",basis:"TEST effective end anchor"};
 assert.equal(structuredRetentionDue({created_at:"2026-10-01T20:00:00.000Z",effective_to:null},created),"2026-10-05");
 assert.equal(structuredRetentionDue({created_at:"2026-10-01T20:00:00.000Z",effective_to:"2026-01-31"},ended),"2026-02-01");
 assert.equal(structuredRetentionDue({created_at:"2026-10-01T20:00:00.000Z",effective_to:null},ended),null);
 assert.throws(()=>structuredRetentionDue({created_at:"not-a-date",effective_to:null},created),error=>error instanceof HrmError&&error.message==="retention_file_date_invalid");
});

test("structured disposition creates a due request only under an independently activated policy",async()=>{
 const db=sqliteD1(),time=new Date().toISOString();
 try{
  db.raw.prepare("UPDATE hrm_settings SET legal_entity='TEST entity',enabled=1,purpose='TEST only',retention_policy='TEST configurable',policy_reference='TEST',reviewed_by='owner',reviewed_at=?,version=version+1 WHERE id=1").run(time);
  db.raw.prepare("INSERT INTO hrm_people(id,employee_code,legal_name,actor_id,created_at,updated_at) VALUES('structured_person_test','TEST-STRUCT-001','TEST employee','hr',?,?)").run(time,time);
  db.raw.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,started_on,actor_id,created_at,updated_at) VALUES('structured_employment_test','structured_person_test','TEST entity','active','2025-01-01','hr',?,?)").run(time,time);
  const rules=JSON.stringify(recordKinds.map(kind=>({kind,retention_days:kind==="identity"?1:null,retention_anchor:kind==="identity"?"record_created":null,basis:"TEST only; not a production retention basis"})));
  const admin={...makeUser({id:"structured_admin",name:"TEST Admin",email:"admin@example.test"},false,["hrm_admin"]),hrmEnabled:true};
  const reviewer={...makeUser({id:"structured_reviewer",name:"TEST HR",email:"hr@example.test"},false,["hrm_officer"]),hrmEnabled:true};
  const system={...makeUser({id:"structured_system",name:"TEST System",email:"system@example.test"},true,[]),hrmEnabled:true};
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_structured_retention_policy_versions").get()?.n,0,"no policy is seeded");
  const policyId=await createStructuredRetentionPolicy(db,admin,"structured_policy_create_0001",rules);
  let policy=db.raw.prepare("SELECT id,version,state,created_by FROM hrm_structured_retention_policy_versions WHERE id=?").get(policyId);
  assert.equal(policy?.state,"draft");
  await assert.rejects(reviewStructuredRetentionPolicy(db,admin,"structured_policy_selfreview_01",policyId,policy.version,true,"TEST self-review"),error=>error instanceof HrmError&&error.message==="self_approval");
  await reviewStructuredRetentionPolicy(db,reviewer,"structured_policy_review_0001",policyId,policy.version,true,"TEST independent review");
  policy=db.raw.prepare("SELECT id,version,state FROM hrm_structured_retention_policy_versions WHERE id=?").get(policyId);
  await activateStructuredRetentionPolicy(db,system,"structured_policy_activate_01",policyId,policy.version);
  const data=JSON.stringify({document_number:"TEST-ONLY"});
  db.raw.prepare("INSERT INTO hrm_records(id,person_id,kind,data,state,effective_from,version,actor_id,verified_by,verified_at,created_at,updated_at) VALUES('structured_record_due_test','structured_person_test','identity',?,'verified','2025-01-01',1,'hr','reviewer',?,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z')").run(data,time);
  const holdId=await createLegalHold(db,admin,"structured_record_hold_create_01",{scope_kind:"person",person_id:"structured_person_test",category:"identity",reason:"TEST synthetic hold"});
  await assert.rejects(createStructuredDispositionRequest(db,admin,"structured_record_hold_block_01","structured_record_due_test","TEST held record"),error=>error instanceof HrmError&&error.message==="legal_hold_active");
  const hold=db.raw.prepare("SELECT version FROM hrm_legal_holds WHERE id=?").get(holdId);
  await releaseLegalHold(db,reviewer,"structured_record_hold_release_01",holdId,hold.version,"TEST separate reviewer releases hold");
  const requestId=await createStructuredDispositionRequest(db,admin,"structured_disposition_request_001","structured_record_due_test","TEST synthetic retention request");
  const request=db.raw.prepare("SELECT state,record_version,retention_due_on FROM hrm_structured_disposition_requests WHERE id=?").get(requestId);
  assert.equal(request?.state,"pending_review");assert.equal(request?.record_version,1);assert.ok(request?.retention_due_on<time.slice(0,10));
 }finally{db.raw.close()}
});
