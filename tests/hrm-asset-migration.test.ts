import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

test("asset evidence migration preserves existing private files and evidence history", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    const migrations = readdirSync(join(root, "migrations"))
      .filter((file) => /^\d{4}_.+\.sql$/.test(file))
      .sort();
    const assetEvidenceMigration = migrations.find((file) => file.startsWith("0030_hrm_asset_evidence"));
    assert.ok(assetEvidenceMigration, "asset evidence migration exists");
    const offboardingAssetMigration = migrations.find((file) => file.startsWith("0031_hrm_offboarding_asset_links"));
    assert.ok(offboardingAssetMigration, "offboarding asset-link migration exists");
    const assetReminderMigration = migrations.find((file) => file.startsWith("0032_hrm_asset_reminders"));
    assert.ok(assetReminderMigration, "asset reminder migration exists");
    const structuredRetentionMigration = migrations.find((file) => file.startsWith("0033_hrm_structured_retention"));
    assert.ok(structuredRetentionMigration, "structured retention migration exists");
    for (const migration of migrations) {
      if (migration === assetEvidenceMigration) break;
      db.exec(readFileSync(join(root, "migrations", migration), "utf8"));
    }

    const time = "2026-10-16T00:00:00.000Z";
    db.prepare("INSERT INTO hrm_people(id,employee_code,legal_name,actor_id,created_at,updated_at) VALUES(?,?,?,?,?,?)")
      .run("person_test", "TEST-001", "TEST employee", "test_hr", time, time);
    db.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,actor_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
      .run("employment_test", "person_test", "TEST entity", "active", "test_hr", time, time);
    db.prepare(`INSERT INTO hrm_retention_policy_versions(
      id,version_number,rules_json,state,created_by,created_at,actor_id,updated_at
    ) VALUES(?,1,'[]','draft',?,?,?,?)`).run("retention_policy_test", "test_hr", time, "test_hr", time);

    db.prepare(`INSERT INTO hrm_leave_policy_versions(
      id,policy_key,version_number,title_en,title_vi,rules_json,state,created_by,created_at,actor_id,updated_at
    ) VALUES(?,?,?,?,?,?,'draft',?,?,?,?)`).run(
      "leave_policy_test", "TEST", 1, "TEST leave", "TEST phép", JSON.stringify([{ key: "test", evidence_required: 1 }]), "test_hr", time, "test_hr", time,
    );
    db.prepare(`INSERT INTO hrm_leave_policy_assignments(
      id,person_id,employment_id,policy_version_id,effective_from,assigned_by,assigned_at,actor_id,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
      "leave_assignment_test", "person_test", "employment_test", "leave_policy_test", "2026-01-01", "test_hr", time, "test_hr", time, time,
    );
    db.prepare(`INSERT INTO hrm_leave_requests(
      id,person_id,employment_id,assignment_id,policy_version_id,leave_type_key,starts_on,ends_on,portion,requested_minutes,
      calculation_json,state,submitted_by,submitted_at,actor_id,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,'full',480,'{}','pending_approval',?,?,?,?,?)`).run(
      "leave_request_test", "person_test", "employment_test", "leave_assignment_test", "leave_policy_test", "test", "2026-10-20", "2026-10-20", "test_employee", time, "test_employee", time, time,
    );
    db.prepare(`INSERT INTO hrm_service_requests(
      id,person_id,employment_id,request_type,subject,state,sensitivity,created_by,created_at,updated_by,updated_at
    ) VALUES(?,?,?,'profile_support','TEST request','submitted','standard',?,?,?,?)`).run(
      "service_request_test", "person_test", "employment_test", "test_employee", time, "test_employee", time,
    );
    db.prepare(`INSERT INTO hrm_training_courses(
      id,course_code,version_no,legal_entity,category,title,description,evidence_required,state,created_by,created_at,updated_by,updated_at
    ) VALUES(?,'TEST-COURSE',1,'TEST entity','certification','TEST course','TEST migration fixture',1,'draft',?,?,?,?)`).run(
      "training_course_test", "test_hr", time, "test_hr", time,
    );
    db.prepare(`INSERT INTO hrm_training_assignments(
      id,course_version_id,course_code,course_version_no,legal_entity,category,evidence_required,person_id,employment_id,
      state,created_by,created_at,actor_id,updated_at
    ) VALUES(?,?,'TEST-COURSE',1,'TEST entity','certification',1,?,?,'assigned',?,?,?,?)`).run(
      "training_assignment_test", "training_course_test", "person_test", "employment_test", "test_hr", time, "test_hr", time,
    );

    const insertFile = db.prepare(`INSERT INTO hrm_files(
      id,person_id,kind,object_key,original_name,mime_type,size_bytes,checksum,state,uploaded_by,expires_on,legal_hold,
      version,created_at,updated_at,retention_actor_id
    ) VALUES(?,?,?, ?,?,'application/pdf',128,'synthetic-checksum','quarantined','test_employee','2030-01-01',1,4,?,?, 'test_hr')`);
    for (const [id, kind] of [
      ["leave_file_test", "leave_evidence"],
      ["service_file_test", "service_evidence"],
      ["training_file_test", "training_evidence"],
    ] as const) insertFile.run(id, "person_test", kind, `hrm/person_test/${id}`, `${id}.pdf`, time, time);

    db.prepare(`INSERT INTO hrm_file_deletion_requests(
      id,source_table,source_file_id,person_id,category,object_key_snapshot,checksum_snapshot,file_version,
      policy_version_id,policy_version,retention_due_on,state,request_reason,requested_by,requested_at,actor_id,created_at,updated_at
    ) VALUES(?,'hrm_files',?,?,?,?,?,?,?,?,?,'pending_review',?,?,?,?,?,?)`).run(
      "file_deletion_test", "training_file_test", "person_test", "training_evidence", "hrm/person_test/training_file_test",
      "synthetic-checksum", 4, "retention_policy_test", 1, "2030-01-01", "TEST synthetic retention review", "test_hr", time, "test_hr", time, time,
    );

    db.prepare(`INSERT INTO hrm_leave_evidence_links(id,leave_request_id,file_id,person_id,uploaded_by,actor_id,created_at)
      VALUES(?,?,?,?,?,?,?)`).run("leave_link_test", "leave_request_test", "leave_file_test", "person_test", "test_employee", "test_employee", time);
    db.prepare(`INSERT INTO hrm_service_request_attachments(id,request_id,file_id,person_id,uploaded_by,created_at)
      VALUES(?,?,?,?,?,?)`).run("service_link_test", "service_request_test", "service_file_test", "person_test", "test_employee", time);
    db.prepare(`INSERT INTO hrm_training_evidence_links(id,assignment_id,file_id,person_id,uploaded_by,created_at)
      VALUES(?,?,?,?,?,?)`).run("training_link_test", "training_assignment_test", "training_file_test", "person_test", "test_employee", time);
    db.prepare(`INSERT INTO hrm_training_events(id,course_version_id,assignment_id,evidence_id,person_id,event_type,actor_id,created_at)
      VALUES(?,?,?,?,?,'evidence_uploaded','test_employee',?)`).run(
      "training_event_test", "training_course_test", "training_assignment_test", "training_link_test", "person_test", time,
    );

    db.exec(readFileSync(join(root, "migrations", assetEvidenceMigration), "utf8"));

    db.prepare(`INSERT INTO hrm_files(
      id,person_id,kind,object_key,original_name,mime_type,size_bytes,checksum,state,uploaded_by,created_at,updated_at
    ) VALUES(?,'person_test','asset_evidence','hrm/person_test/asset_file_test','TEST asset receipt.pdf','application/pdf',128,'asset-checksum','quarantined','test_hr',?,?)`)
      .run("asset_file_test", time, time);
    db.prepare(`INSERT INTO hrm_file_deletion_requests(
      id,source_table,source_file_id,person_id,category,object_key_snapshot,checksum_snapshot,file_version,
      policy_version_id,policy_version,retention_due_on,state,request_reason,requested_by,requested_at,actor_id,created_at,updated_at
    ) VALUES(?,'hrm_files','asset_file_test','person_test','asset_evidence','hrm/person_test/asset_file_test','asset-checksum',1,
      'retention_policy_test',1,'2030-01-01','pending_review','TEST configured asset-evidence retention','test_hr',?,?,?,?)`)
      .run("asset_deletion_test", time, "test_hr", time, time);

    const preservedFile = db.prepare("SELECT kind,state,legal_hold,version,expires_on,checksum FROM hrm_files WHERE id='training_file_test'").get();
    assert.equal(preservedFile?.kind, "training_evidence"); assert.equal(preservedFile?.state, "quarantined");
    assert.equal(preservedFile?.legal_hold, 1); assert.equal(preservedFile?.version, 4);
    assert.equal(preservedFile?.expires_on, "2030-01-01"); assert.equal(preservedFile?.checksum, "synthetic-checksum");
    const leaveLinks = db.prepare("SELECT id,file_id FROM hrm_leave_evidence_links").all();
    const serviceLinks = db.prepare("SELECT id,file_id FROM hrm_service_request_attachments").all();
    const trainingLinks = db.prepare("SELECT id,file_id FROM hrm_training_evidence_links").all();
    const deletion = db.prepare("SELECT source_file_id,category,policy_version_id,retention_due_on,state FROM hrm_file_deletion_requests WHERE id='file_deletion_test'").get();
    assert.equal(leaveLinks.length, 1); assert.equal(leaveLinks[0]?.id, "leave_link_test"); assert.equal(leaveLinks[0]?.file_id, "leave_file_test");
    assert.equal(serviceLinks.length, 1); assert.equal(serviceLinks[0]?.id, "service_link_test"); assert.equal(serviceLinks[0]?.file_id, "service_file_test");
    assert.equal(trainingLinks.length, 1); assert.equal(trainingLinks[0]?.id, "training_link_test"); assert.equal(trainingLinks[0]?.file_id, "training_file_test");
    assert.equal(db.prepare("SELECT evidence_id FROM hrm_training_events WHERE id='training_event_test'").get()?.evidence_id, "training_link_test");
    assert.equal(deletion?.source_file_id, "training_file_test"); assert.equal(deletion?.category, "training_evidence");
    assert.equal(deletion?.policy_version_id, "retention_policy_test"); assert.equal(deletion?.retention_due_on, "2030-01-01"); assert.equal(deletion?.state, "pending_review");
    assert.equal(db.prepare("SELECT category FROM hrm_file_deletion_requests WHERE id='asset_deletion_test'").get()?.category, "asset_evidence");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(db.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");

    const insertAsset=db.prepare(`INSERT INTO hrm_assets(
      id,asset_tag,asset_type,description,legal_entity,created_by,created_at,updated_by,updated_at
    ) VALUES(?,?, 'computer',?,'TEST entity','test_hr',?,'test_hr',?)`);
    const insertAssignment=db.prepare(`INSERT INTO hrm_asset_assignments(
      id,asset_id,person_id,employment_id,state,issued_condition,offer_reason,offered_by,offered_at,
      accepted_by,accepted_at,actor_id,created_at,updated_at
    ) VALUES(?,?,?,'employment_test','assigned','good','TEST offboarding fixture','test_hr',?,'test_employee',?,'test_hr',?,?)`);
    insertAsset.run("asset_test_one", "TEST-OFF-001", "TEST laptop", time, time);
    insertAssignment.run("assignment_test_one", "asset_test_one", "person_test", time, time, time, time);
    db.prepare(`INSERT INTO hrm_offboarding_cases(
      id,person_id,employment_id,employee_user_id,ended_on,state,actor_id,created_at,updated_at
    ) VALUES('offboarding_test','person_test','employment_test','test_employee','2026-10-01','open','test_hr',?,?)`).run(time, time);
    const assetTask=db.prepare("SELECT id FROM hrm_offboarding_tasks WHERE case_id='offboarding_test' AND task_key='asset_return'").get();
    assert.ok(assetTask?.id);

    db.exec(readFileSync(join(root, "migrations", offboardingAssetMigration), "utf8"));
    const firstLink=db.prepare("SELECT task_id,assignment_id FROM hrm_offboarding_asset_links WHERE assignment_id='assignment_test_one'").get();
    assert.equal(firstLink?.task_id, assetTask.id, "existing open assignments backfill to the matching offboarding asset task");

    insertAsset.run("asset_test_two", "TEST-OFF-002", "TEST badge", time, time);
    insertAssignment.run("assignment_test_two", "asset_test_two", "person_test", time, time, time, time);
    const linked=db.prepare("SELECT assignment_id FROM hrm_offboarding_asset_links WHERE task_id=? ORDER BY assignment_id").all(assetTask.id);
    assert.equal(linked.length,2,"assignments created after an open offboarding case link to its asset task");
    assert.throws(()=>db.prepare("UPDATE hrm_offboarding_asset_links SET created_at='later' WHERE assignment_id='assignment_test_one'").run(),/immutable_offboarding_asset_link/);
    assert.throws(()=>db.prepare("DELETE FROM hrm_offboarding_asset_links WHERE assignment_id='assignment_test_one'").run(),/immutable_offboarding_asset_link/);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(db.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");

    db.exec(readFileSync(join(root, "migrations", assetReminderMigration), "utf8"));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hrm_asset_reminder_policy_versions").get()?.n, 0, "no reminder schedule is seeded");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hrm_asset_reminders").get()?.n, 0, "no employee receives a default reminder");
    const insertPolicy=db.prepare(`INSERT INTO hrm_asset_reminder_policy_versions(
      id,legal_entity,version_number,title_en,title_vi,days_before_due_json,state,created_by,created_at,
      reviewed_by,reviewed_at,review_reason,activated_by,activated_at,version,actor_id,updated_at
    ) VALUES(?,?,?,?,?,?,'active',?,?,?,?,?,?,?,1,?,?)`);
    assert.throws(()=>insertPolicy.run("invalid_fractional_reminder_policy","TEST entity",1,"TEST invalid","TEST invalid","[3.5]","policy_creator",time,"reviewer",time,"TEST reviewed","approver",time,"approver",time),/asset_reminder_policy_offsets_invalid/);
    assert.throws(()=>insertPolicy.run("invalid_duplicate_reminder_policy","TEST entity",1,"TEST invalid","TEST invalid","[3,3]","policy_creator",time,"reviewer",time,"TEST reviewed","approver",time,"approver",time),/asset_reminder_policy_offsets_invalid/);
    insertPolicy.run("asset_reminder_policy_test","TEST entity",1,"TEST reminders","TEST nhắc hạn","[3,0,-2]","policy_creator",time,"policy_reviewer",time,"TEST separately reviewed schedule","policy_approver",time,"policy_approver",time);

    const reminderEmployee="asset_reminder_employee",reminderHr="asset_reminder_hr",otherHr="asset_reminder_other_hr",reminderManager="asset_reminder_manager";
    const insertMember=db.prepare("INSERT INTO workspace_members(user_id,enabled,granted_by,created_at,updated_at) VALUES(?,1,'test_system',?,?)");
    const insertRole=db.prepare("INSERT INTO workspace_roles(user_id,role,granted_by,granted_at) VALUES(?,?,'test_system',?)");
    for(const [userId,role] of [[reminderEmployee,"employee"],[reminderHr,"hrm_admin"],[otherHr,"hrm_officer"],[reminderManager,"people_manager"]]){
      insertMember.run(userId,time,time);insertRole.run(userId,role,time);
    }
    db.prepare("INSERT INTO hrm_people(id,employee_code,user_id,legal_name,actor_id,created_at,updated_at) VALUES('reminder_person_test','TEST-REM-001',?,'TEST reminder employee','test_hr',?,?)")
      .run(reminderEmployee,time,time);
    db.prepare("INSERT INTO hrm_employments(id,person_id,legal_entity,status,actor_id,created_at,updated_at) VALUES('reminder_employment_test','reminder_person_test','TEST entity','active','test_hr',?,?)")
      .run(time,time);
    db.prepare(`INSERT INTO hrm_assets(id,asset_tag,asset_type,description,legal_entity,state,created_by,created_at,updated_by,updated_at)
      VALUES('reminder_asset_test','TEST-REMINDER-001','computer','TEST reminder laptop','TEST entity','assigned','test_hr',?,'test_hr',?)`).run(time,time);
    db.prepare(`INSERT INTO hrm_asset_assignments(
      id,asset_id,person_id,employment_id,state,expected_return_on,issued_condition,offer_reason,offered_by,offered_at,
      accepted_by,accepted_at,actor_id,created_at,updated_at
    ) VALUES('reminder_assignment_test','reminder_asset_test','reminder_person_test','reminder_employment_test','assigned','2026-10-19',
      'good','TEST reminder fixture',?,?,?,?,'test_hr_admin',?,?)`).run(reminderHr,time,reminderEmployee,time,time,time);

    const insertReminder=db.prepare(`INSERT INTO hrm_asset_reminders(
      id,assignment_id,asset_id,person_id,recipient_user_id,policy_version_id,due_on,days_before_due,event_key,state,version,created_by,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,'unread',1,'system:hrm_asset_reminder',?,?)`);
    insertReminder.run("asset_reminder_employee_test","reminder_assignment_test","reminder_asset_test","reminder_person_test",reminderEmployee,
      "asset_reminder_policy_test","2026-10-19",3,"asset:reminder_assignment_test:2026-10-19:3:employee",time,time);
    insertReminder.run("asset_reminder_hr_test","reminder_assignment_test","reminder_asset_test","reminder_person_test",reminderHr,
      "asset_reminder_policy_test","2026-10-19",3,"asset:reminder_assignment_test:2026-10-19:3:hr",time,time);
    assert.throws(()=>insertReminder.run("asset_reminder_wrong_offset_test","reminder_assignment_test","reminder_asset_test","reminder_person_test",reminderEmployee,
      "asset_reminder_policy_test","2026-10-19",2,"asset:reminder_assignment_test:2026-10-19:2:employee",time,time),/asset_reminder_target_invalid/);
    assert.throws(()=>insertReminder.run("asset_reminder_manager_test","reminder_assignment_test","reminder_asset_test","reminder_person_test",reminderManager,
      "asset_reminder_policy_test","2026-10-19",3,"asset:reminder_assignment_test:2026-10-19:3:manager",time,time),/asset_reminder_target_invalid/);
    assert.throws(()=>insertReminder.run("asset_reminder_other_hr_test","reminder_assignment_test","reminder_asset_test","reminder_person_test",otherHr,
      "asset_reminder_policy_test","2026-10-19",3,"asset:reminder_assignment_test:2026-10-19:3:other-hr",time,time),/asset_reminder_target_invalid/);
    db.prepare(`INSERT INTO hrm_asset_reminders(
      id,assignment_id,asset_id,person_id,recipient_user_id,policy_version_id,due_on,days_before_due,event_key,state,version,created_by,created_at,updated_at
    ) VALUES('asset_reminder_duplicate_test','reminder_assignment_test','reminder_asset_test','reminder_person_test',?,'asset_reminder_policy_test',
      '2026-10-19',3,'asset:reminder_assignment_test:2026-10-19:3:employee','unread',1,'system:hrm_asset_reminder',?,?)
      ON CONFLICT(assignment_id,recipient_user_id,due_on,days_before_due) DO NOTHING`).run(reminderEmployee,time,time);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hrm_asset_reminders WHERE assignment_id='reminder_assignment_test'").get()?.n,2,"recipient/assignment/offset retries do not duplicate notifications");
    db.prepare("UPDATE hrm_asset_reminders SET state='read',version=version+1,read_by=?,read_at=?,updated_at=? WHERE id='asset_reminder_employee_test'")
      .run(reminderEmployee,time,time);
    db.prepare(`UPDATE hrm_asset_assignments SET state='return_requested',version=version+1,return_requested_by=?,return_requested_at=?,actor_id=?,updated_at=? WHERE id='reminder_assignment_test'`)
      .run(reminderEmployee,time,reminderEmployee,time);
    db.prepare(`UPDATE hrm_asset_assignments SET state='returned',version=version+1,return_condition='good',returned_by=?,returned_at=?,actor_id=?,updated_at=? WHERE id='reminder_assignment_test'`)
      .run(reminderHr,time,reminderHr,time);
    assert.equal(db.prepare("SELECT state FROM hrm_asset_reminders WHERE id='asset_reminder_employee_test'").get()?.state,"read","assignment closure does not rewrite an already-read reminder");
    const resolvedReminder=db.prepare("SELECT state,read_by,read_at FROM hrm_asset_reminders WHERE id='asset_reminder_hr_test'").get();
    assert.equal(resolvedReminder?.state,"resolved");assert.equal(resolvedReminder?.read_by,"system:hrm_asset_reminder");assert.equal(resolvedReminder?.read_at,time);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hrm_asset_reminder_events WHERE reminder_id IN ('asset_reminder_employee_test','asset_reminder_hr_test')").get()?.n,4,"created, read and automatic resolution history is append-only");
    assert.throws(()=>db.prepare("UPDATE hrm_asset_reminder_events SET detail_json='{}' WHERE reminder_id='asset_reminder_hr_test'").run(),/immutable_history/);
    assert.throws(()=>db.prepare("UPDATE hrm_asset_reminders SET due_on='2026-10-20' WHERE id='asset_reminder_hr_test'").run(),/immutable_asset_reminder/);

    db.exec(readFileSync(join(root,"migrations",structuredRetentionMigration),"utf8"));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hrm_structured_retention_policy_versions").get()?.n,0,"no structured retention policy is seeded");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hrm_structured_disposition_requests").get()?.n,0,"no structured profile record is scheduled for deletion by default");
    const structuredRules=JSON.stringify(["contact","personal","identity","dependent","bank","tax"].map(kind=>({kind,retention_days:kind==="identity"?1:null,retention_anchor:kind==="identity"?"record_created":null,basis:"TEST owner-configured structured record rule"})));
    const insertStructuredPolicy=db.prepare(`INSERT INTO hrm_structured_retention_policy_versions(
      id,legal_entity,version_number,rules_json,state,created_by,created_at,reviewed_by,reviewed_at,review_reason,activated_by,activated_at,version,actor_id,updated_at
    ) VALUES(?,?,1,?,'active','record_policy_creator',?,'record_policy_reviewer',?,'TEST independent review','record_policy_activator',?,2,'record_policy_activator',?)`);
    assert.throws(()=>insertStructuredPolicy.run("invalid_structured_policy","TEST entity",JSON.stringify(["contact","personal","identity","dependent","bank","tax"].map(kind=>({kind,retention_days:kind==="identity"?1:null,retention_anchor:null,basis:"TEST invalid anchor"}))),time,time,time,time),/structured_retention_rules_invalid/);
    assert.throws(()=>insertStructuredPolicy.run("extra_field_structured_policy","TEST entity",JSON.stringify(["contact","personal","identity","dependent","bank","tax"].map(kind=>({kind,retention_days:null,retention_anchor:null,basis:"TEST no defaults",unreviewed_private_value:"TEST secret"}))),time,time,time,time),/structured_retention_rules_invalid/);
    insertStructuredPolicy.run("structured_policy_test","TEST entity",structuredRules,time,time,time,time);
    const structuredRecordData=JSON.stringify({document_type:"CCCD",document_number:"TEST-STRUCTURED-SECRET",issued_by:"TEST issuer"});
    db.prepare(`INSERT INTO hrm_records(id,person_id,kind,data,state,effective_from,version,actor_id,verified_by,verified_at,created_at,updated_at)
      VALUES('structured_record_test','reminder_person_test','identity',?,'verified','2026-01-01',1,'test_hr','test_reviewer',?,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`).run(structuredRecordData,time);
    db.prepare(`INSERT INTO hrm_change_requests(id,person_id,record_id,kind,expected_version,data,state,submitted_by,reviewed_by,review_reason,actor_id,created_at,updated_at)
      VALUES('structured_change_test','reminder_person_test','structured_record_test','identity',1,?,'rejected','test_employee','test_reviewer','TEST-CHANGE-SECRET','test_reviewer',?,?)`)
      .run(JSON.stringify({document_number:"TEST-CHANGE-SECRET"}),time,time);
    const structuredRequestInsert=db.prepare(`INSERT INTO hrm_structured_disposition_requests(
      id,record_id,person_id,record_kind,record_version,policy_version_id,policy_version,retention_due_on,state,request_reason,requested_by,requested_at,version,actor_id,created_at,updated_at
    ) VALUES('structured_disposition_test','structured_record_test','reminder_person_test','identity',1,'structured_policy_test',1,'2026-01-03','pending_review','TEST structured record disposition','record_requester',?,1,'record_requester',?,?)`);
    structuredRequestInsert.run(time,time,time);
    assert.throws(()=>db.prepare("UPDATE hrm_records SET data='{}' WHERE id='structured_record_test'").run(),/structured_disposition_in_progress/);
    assert.throws(()=>db.prepare("DELETE FROM hrm_record_history WHERE record_id='structured_record_test'").run(),/structured_disposition_guard_required/);
    assert.throws(()=>db.prepare(`INSERT INTO hrm_change_requests(id,person_id,record_id,kind,expected_version,data,state,submitted_by,actor_id,created_at,updated_at)
      VALUES('structured_change_blocked','reminder_person_test','structured_record_test','identity',1,'{}','submitted','test_employee','test_employee',?,?)`).run(time,time),/structured_disposition_in_progress/);
    db.prepare("UPDATE hrm_structured_disposition_requests SET state='approved',reviewed_by='record_reviewer',reviewed_at=?,review_reason='TEST separate review',version=version+1,actor_id='record_reviewer',updated_at=? WHERE id='structured_disposition_test'").run(time,time);
    db.prepare("UPDATE hrm_structured_disposition_requests SET state='executing',version=version+1,actor_id='record_executor',updated_at=? WHERE id='structured_disposition_test'").run(time);
    db.prepare("INSERT INTO hrm_structured_disposition_guards(request_id,record_id,valid,actor_id,created_at) VALUES('structured_disposition_test','structured_record_test',1,'record_executor',?)").run(time);
    db.prepare("DELETE FROM hrm_record_history WHERE record_id='structured_record_test'").run();
    db.prepare("UPDATE hrm_change_requests SET data='{}',effective_from=NULL,effective_to=NULL,review_reason='Redacted by structured-record disposition',version=version+1,actor_id='record_executor',updated_at=? WHERE record_id='structured_record_test'").run(time);
    db.prepare("UPDATE hrm_records SET data='{}',state='ended',effective_from=NULL,effective_to=NULL,verified_by=NULL,verified_at=NULL,version=version+1,actor_id='record_executor',updated_at=? WHERE id='structured_record_test' AND version=1").run(time);
    db.prepare("UPDATE hrm_structured_disposition_requests SET state='completed',completed_by='record_executor',completed_at=?,completion_detail='Redacted tombstone retained.',version=version+1,actor_id='record_executor',updated_at=? WHERE id='structured_disposition_test' AND state='executing'").run(time,time);
    db.prepare("DELETE FROM hrm_structured_disposition_guards WHERE request_id='structured_disposition_test'").run();
    const structuredTombstone=db.prepare("SELECT data,state FROM hrm_records WHERE id='structured_record_test'").get();assert.equal(structuredTombstone?.data,"{}");assert.equal(structuredTombstone?.state,"ended");
    const structuredChange=db.prepare("SELECT data,review_reason FROM hrm_change_requests WHERE id='structured_change_test'").get();assert.equal(structuredChange?.data,"{}");assert.equal(structuredChange?.review_reason,"Redacted by structured-record disposition");
    const structuredHistory=db.prepare("SELECT data,state FROM hrm_record_history WHERE record_id='structured_record_test'").all();assert.equal(structuredHistory.length,1,"only the non-sensitive tombstone history remains");assert.equal(structuredHistory[0].data,"{}");assert.equal(structuredHistory[0].state,"ended");
    assert.equal(db.prepare("SELECT state FROM hrm_structured_disposition_requests WHERE id='structured_disposition_test'").get()?.state,"completed");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM hrm_structured_disposition_events WHERE request_id='structured_disposition_test'").get()?.n,4,"the disposition event trail records request, approval, execution and completion");
    assert.throws(()=>db.prepare("UPDATE hrm_records SET data='{}' WHERE id='structured_record_test'").run(),/structured_disposition_in_progress/);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(db.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
  } finally {
    db.close();
  }
});
