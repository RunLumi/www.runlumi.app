import test from "node:test";
import assert from "node:assert/strict";
import { HrmError } from "../src/lib/hrm/fields.ts";
import { exportOwnHrmProfile } from "../src/lib/hrm/profile-export.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { sqliteD1 } from "./support/d1-sqlite.ts";

test("profile export is bounded, self-only, audited, and omits internal IDs/review notes and file bytes",async()=>{
 const db=sqliteD1(),time=new Date().toISOString();
 const employee={...makeUser({id:"profile_export_employee",name:"TEST employee",email:"employee@example.test"},false,["employee"]),hrmEnabled:true};
 const other={...makeUser({id:"profile_export_other",name:"TEST other",email:"other@example.test"},false,["employee"]),hrmEnabled:true};
 try{
  db.raw.prepare("INSERT INTO hrm_people(id,employee_code,user_id,legal_name,preferred_name,actor_id,created_at,updated_at) VALUES('profile_export_person','TEST-EXPORT-001',?,'TEST Export Employee','TEST preferred','hr',?,?)").run(employee.id,time,time);
  db.raw.prepare("INSERT INTO hrm_employments(id,person_id,work_email,work_phone,department,job_title,legal_entity,location,status,started_on,actor_id,created_at,updated_at) VALUES('profile_export_employment','profile_export_person','work@example.test','0900000000','TEST Ops','TEST Analyst','TEST entity','TEST city','active','2026-01-01','hr',?,?)").run(time,time);
  db.raw.prepare("INSERT INTO hrm_records(id,person_id,kind,data,state,version,actor_id,verified_by,verified_at,created_at,updated_at) VALUES('profile_export_record','profile_export_person','identity',?,'verified',1,'hr','reviewer',? ,?,?)").run(JSON.stringify({document_type:"CCCD",document_number:"TEST-OWN-SECRET"}),time,time,time);
  db.raw.prepare("INSERT INTO hrm_change_requests(id,person_id,record_id,kind,expected_version,data,state,submitted_by,reviewed_by,review_reason,actor_id,created_at,updated_at) VALUES('profile_export_change','profile_export_person','profile_export_record','identity',1,'{}','rejected',?,'reviewer','TEST-INTERNAL-REVIEW-NOTE','reviewer',?,?)").run(employee.id,time,time);
  db.raw.prepare("INSERT INTO hrm_files(id,person_id,record_id,kind,object_key,original_name,mime_type,size_bytes,checksum,state,uploaded_by,created_at,updated_at) VALUES('profile_export_file','profile_export_person','profile_export_record','identity','hrm/private/profile_export_file','TEST identity.pdf','application/pdf',1,'TEST-CHECKSUM','reviewed',?,?,?)").run(employee.id,time,time);
  db.raw.prepare("INSERT INTO hrm_people(id,employee_code,user_id,legal_name,actor_id,created_at,updated_at) VALUES('profile_export_other_person','TEST-EXPORT-002',?,'TEST Other Employee','hr',?,?)").run(other.id,time,time);
  db.raw.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,started_on,actor_id,created_at,updated_at) VALUES('profile_export_other_employment','profile_export_other_person','TEST entity','active','2026-01-01','hr',?,?)").run(time,time);
  db.raw.prepare("INSERT INTO hrm_records(id,person_id,kind,data,state,version,actor_id,created_at,updated_at) VALUES('profile_export_other_record','profile_export_other_person','identity',?,'verified',1,'hr',?,?)").run(JSON.stringify({document_number:"TEST-OTHER-SECRET"}),time,time);

  const first=await exportOwnHrmProfile(db,employee);
  assert.equal(first.contentBytes,new TextEncoder().encode(first.body).byteLength);
  const bundle=JSON.parse(first.body) as {schema_version:number;export_scope:string;profile:{employee_code:string};employment_periods:{is_current:number;manager_user_id?:string}[];records:{record_ref:string;kind:string;data:Record<string,string>}[];record_history:{record_ref:string;data:Record<string,string>}[];change_requests:{record_ref:string;data:Record<string,string>;review_reason?:string}[];profile_files:{record_ref:string|null;original_name:string;object_key?:string;object_available:boolean}[];excluded:string[]};
  assert.equal(bundle.schema_version,1);assert.equal(bundle.export_scope,"self_profile_snapshot");assert.equal(bundle.profile.employee_code,"TEST-EXPORT-001");assert.equal(bundle.employment_periods.length,1);assert.equal(bundle.employment_periods[0].is_current,1);assert.ok(!("manager_user_id" in bundle.employment_periods[0]));
  assert.ok(bundle.records.some(row=>row.data.document_number==="TEST-OWN-SECRET"));assert.ok(bundle.record_history.some(row=>row.data.document_number==="TEST-OWN-SECRET"));assert.ok(bundle.change_requests.every(row=>!('review_reason' in row)));
  assert.ok(bundle.profile_files.some(file=>file.original_name==="TEST identity.pdf"&&file.object_available));assert.ok(bundle.profile_files.every(file=>!('object_key' in file)));
  assert.ok(!first.body.includes("TEST-OTHER-SECRET"));assert.ok(!first.body.includes("TEST-INTERNAL-REVIEW-NOTE"));assert.ok(!first.body.includes("hrm/private/profile_export_file"));assert.ok(bundle.excluded.includes("file_contents"));assert.ok(bundle.excluded.includes("payroll"));
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM hrm_audit WHERE actor_id=? AND action='employee_profile_exported' AND person_id='profile_export_person'").get(employee.id)?.n,1);
  const manager={...makeUser({id:"profile_export_manager",name:"TEST manager",email:"manager@example.test"},false,["people_manager"]),hrmEnabled:true};
  await assert.rejects(exportOwnHrmProfile(db,manager),error=>error instanceof HrmError&&error.message==="not_found");
  const closed={...employee,hrmEnabled:false};await assert.rejects(exportOwnHrmProfile(db,closed),error=>error instanceof HrmError&&error.message==="hrm_closed");
  db.raw.prepare("UPDATE hrm_employments SET status='ended',ended_on='2026-10-01',version=version+1,updated_at=? WHERE id='profile_export_employment'").run(time);
  await assert.rejects(exportOwnHrmProfile(db,employee),error=>error instanceof HrmError&&error.message==="not_found");
 }finally{db.raw.close()}
});
