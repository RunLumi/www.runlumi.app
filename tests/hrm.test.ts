import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeUser, ROLE_PERMISSIONS } from "../src/lib/workspace/roles.ts";
import { canReadRecord, own, type Person } from "../src/lib/hrm/service.ts";
import { modules, visibleLinks, visibleModules } from "../src/lib/workspace/nav.ts";
import { HrmError, readRecord, readableFileType } from "../src/lib/hrm/fields.ts";
import { isDocxPackage, readLegalForm } from "../src/lib/hrm/legal-files.ts";
import { validateOnboardingConfig } from "../src/lib/hrm/onboarding.ts";
import { localDateTimeToUtc, parseCalendarSchedule, parseLeaveRules } from "../src/lib/hrm/time-leave.ts";
import { parseAttendanceCsv } from "../src/lib/hrm/time-import.ts";
import { RETENTION_CATEGORIES, retentionCategoryForHrm } from "../src/lib/hrm/retention.ts";
import { calculatePayrollTotals, formatPayrollMoney, parseMinorAmount, parsePayrollComponents, renderPayrollSlipHtml } from "../src/lib/hrm/payroll.ts";
import { parseAssetReminderOffsets } from "../src/lib/hrm/asset-reminders.ts";
import { reportCsvContent, reportMonthRange, type HrmReportSnapshot } from "../src/lib/hrm/reports.ts";
const person=(user_id:string|null):Person=>({id:"person_test",employment_id:"employment_test",profile_version:1,employee_code:"E-001",user_id,legal_name:"Test Employee",preferred_name:"Test",work_email:"work@example.test",work_phone:"",department:"Ops",job_title:"Operator",legal_entity:"Test entity",location:"HCMC",manager_user_id:"manager",status:"active",started_on:"2026-01-01",ended_on:null,version:1,actor_id:"hr",created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z"});
const user=(id:string,granted:Parameters<typeof makeUser>[2])=>makeUser({id,name:id,email:id+"@example.test"},false,granted);
test("HRM grants are separate from ATS, CRM and user administration",()=>{
 assert.deepEqual(ROLE_PERMISSIONS.employee,["workspace.access","hrm.access","hrm.profile.self","hrm.legal.self","hrm.coi.self","hrm.onboarding.self","hrm.onboarding.tasks","hrm.time.self","hrm.leave.self","hrm.payroll.self","hrm.payroll.dispute","hrm.services.self","hrm.notifications.read","hrm.assets.self","hrm.benefits.self","hrm.training.self","hrm.performance.self"]);
 const employee=user("employee",["employee"]);assert.equal(employee.can("hrm.legal.manage"),false);assert.equal(employee.can("hrm.onboarding.manage"),false);assert.equal(employee.can("hrm.time.self"),true);assert.equal(employee.can("hrm.time.manage"),false);assert.equal(employee.can("hrm.leave.self"),true);assert.equal(employee.can("hrm.leave.review"),false);
 for(const role of ["hr","finance","sales_manager","partner"] as const)assert.equal(user(role,[role]).can("hrm.access"),false);
 const hrm=user("hrm",["hrm_admin"]);assert.equal(hrm.can("users.manage"),false);assert.equal(hrm.can("hiring.access"),false);assert.equal(hrm.can("crm.access"),false);assert.equal(hrm.can("hrm.legal.activate"),true);assert.equal(hrm.can("hrm.coi.review"),true);assert.equal(hrm.can("hrm.onboarding.manage"),true);assert.equal(hrm.can("hrm.retention.manage"),true);assert.equal(hrm.can("hrm.legalhold.manage"),true);assert.equal(hrm.can("hrm.time.configure"),true);assert.equal(hrm.can("hrm.leave.configure"),true);
 assert.equal(hrm.can("hrm.payroll.approve"),true);assert.equal(hrm.can("hrm.payroll.publish"),true);assert.equal(hrm.can("hrm.payroll.payment.confirm"),true);
 assert.equal(hrm.can("hrm.services.manage"),true);assert.equal(hrm.can("hrm.notifications.read"),true);assert.equal(hrm.can("hrm.assets.manage"),true);assert.equal(hrm.can("hrm.benefits.manage"),true);assert.equal(hrm.can("hrm.benefits.approve"),true);assert.equal(hrm.can("hrm.training.manage"),true);assert.equal(hrm.can("hrm.training.approve"),true);assert.equal(hrm.can("hrm.reports.read"),true);assert.equal(hrm.can("hrm.reports.export"),true);
 const payroll=user("payroll",["payroll_officer"]);assert.equal(payroll.can("hrm.payroll.prepare"),true);assert.equal(payroll.can("hrm.payroll.read"),true);assert.equal(payroll.can("hrm.payroll.approve"),false);assert.equal(payroll.can("hrm.payroll.publish"),false);assert.equal(payroll.can("hrm.identity.read"),false);assert.equal(payroll.can("hrm.bank.read"),false);assert.equal(payroll.can("hrm.services.manage"),false);assert.equal(payroll.can("hrm.notifications.read"),true);assert.equal(payroll.can("users.manage"),false);
 assert.equal(employee.can("hrm.payroll.self"),true);assert.equal(employee.can("hrm.payroll.prepare"),false);assert.equal(employee.can("hrm.payroll.approve"),false);assert.equal(employee.can("hrm.assets.self"),true);assert.equal(employee.can("hrm.assets.manage"),false);assert.equal(employee.can("hrm.benefits.self"),true);assert.equal(employee.can("hrm.benefits.manage"),false);assert.equal(employee.can("hrm.benefits.approve"),false);assert.equal(employee.can("hrm.training.self"),true);assert.equal(employee.can("hrm.training.manage"),false);assert.equal(employee.can("hrm.training.approve"),false);
 const manager=user("manager",["people_manager"]);assert.equal(manager.can("hrm.approval.delegate"),true);assert.equal(employee.can("hrm.approval.delegate"),false);
 const hrmAdmin=user("hrm-admin",["hrm_admin"]);assert.equal(hrmAdmin.can("hrm.approval.delegate"),false);assert.equal(hrmAdmin.can("hrm.reports.manage"),true);
 const officer=user("officer",["hrm_officer"]);assert.equal(officer.can("hrm.legal.manage"),true);assert.equal(officer.can("hrm.legal.activate"),false);assert.equal(officer.can("hrm.coi.review"),true);assert.equal(officer.can("hrm.retention.review"),true);assert.equal(officer.can("hrm.retention.manage"),false);assert.equal(officer.can("hrm.approval.delegate"),false);assert.equal(officer.can("hrm.assets.manage"),true);assert.equal(officer.can("hrm.benefits.manage"),true);assert.equal(officer.can("hrm.benefits.approve"),false);assert.equal(officer.can("hrm.training.manage"),true);assert.equal(officer.can("hrm.training.approve"),false);assert.equal(officer.can("hrm.reports.read"),true);assert.equal(officer.can("hrm.reports.export"),false);assert.equal(officer.can("hrm.reports.manage"),false);assert.equal(officer.can("users.manage"),false);
 assert.equal(user("manager",["people_manager"]).can("hrm.assets.manage"),false);assert.equal(user("manager",["people_manager"]).can("hrm.benefits.manage"),false);assert.equal(user("manager",["people_manager"]).can("hrm.training.self"),false);assert.equal(user("manager",["people_manager"]).can("hrm.reports.read"),false);assert.equal(user("manager",["people_manager"]).can("hrm.reports.export"),false);
 assert.equal(makeUser({id:"system",name:"System",email:"system@example.test"},true,[]).can("hrm.configure"),true);assert.equal(makeUser({id:"system",name:"System",email:"system@example.test"},true,[]).can("hrm.reports.export"),true);assert.equal(makeUser({id:"system",name:"System",email:"system@example.test"},true,[]).can("hrm.reports.manage"),true);
 const migration=readFileSync(new URL("../migrations/0014_hrm_records.sql",import.meta.url),"utf8");
 for(const role of ["employee","people_manager","hrm_officer","hrm_admin","hr","sales_manager","sales_executive","partner","finance","fulfillment"])assert.ok(migration.includes("'" + role + "'"));
 const payrollMigration=readFileSync(new URL("../migrations/0024_hrm_payroll.sql",import.meta.url),"utf8");assert.ok(payrollMigration.includes("'payroll_officer'"));
});
test("managers cannot read identity, dependent, contact, banking or tax data for their reports",()=>{
 const manager=user("manager",["people_manager"]);const other=person("employee-b");assert.equal(own(other,manager),false);
 for(const kind of ["contact","personal","identity","dependent","bank","tax"] as const)assert.equal(canReadRecord(other,manager,kind),false,kind);
 const employee=user("employee-a",["employee"]);assert.equal(canReadRecord(person("employee-a"),employee,"bank"),true);
 const officer=user("officer",["hrm_officer"]);assert.equal(canReadRecord(other,officer,"identity"),true);assert.equal(canReadRecord(other,officer,"bank"),false);assert.equal(canReadRecord(other,officer,"tax"),false);
});
test("the production kill switch hides employee navigation but leaves available HRM configuration screens for admins",()=>{
 const ordinary=makeUser({id:"employee",name:"Employee",email:"e@example.test"},false,["employee"]);ordinary.hrmEnabled=false;assert.equal(visibleModules(ordinary).some(m=>m.key==="hrm"),false);
 const admin=makeUser({id:"hrm",name:"HRM",email:"h@example.test"},false,["hrm_admin"]);admin.hrmEnabled=false;const module=modules.find(m=>m.key==="hrm")!;assert.deepEqual(visibleLinks(admin,module).map(l=>l.key),["job-descriptions","onboarding-manage","payroll","legal-documents","report-governance","retention","settings"]);
});
test("profile validators reject malformed values and external states without evidence",()=>{
 assert.throws(()=>readRecord(new FormData(),"contact"),HrmError);
 const invalidDate=new FormData();invalidDate.set("birth_date","2026-02-31");assert.throws(()=>readRecord(invalidDate,"personal"),HrmError);
 const invalidEmail=new FormData();invalidEmail.set("email","not-an-email");assert.throws(()=>readRecord(invalidEmail,"contact"),HrmError);
 const dependent=new FormData();dependent.set("name","Child");dependent.set("relationship","child");dependent.set("registration_state","registered");assert.throws(()=>readRecord(dependent,"dependent"),HrmError);
 const tax=new FormData();tax.set("participation_state","registered");assert.throws(()=>readRecord(tax,"tax"),HrmError);
 const bank=new FormData();bank.set("bank","TEST");bank.set("account_number","123");bank.set("account_name","TEST USER");bank.set("currency","USD");assert.equal(readRecord(bank,"bank").currency,"USD");bank.set("currency","US");assert.throws(()=>readRecord(bank,"bank"),HrmError);
});
test("private file MIME is derived from file signatures",()=>{
 assert.equal(readableFileType(new Uint8Array([37,80,68,70,45,49,46,55])),"application/pdf");
 assert.equal(readableFileType(new Uint8Array([137,80,78,71,13,10,26,10])),"image/png");
 assert.equal(readableFileType(new Uint8Array([255,216,255,0])),"image/jpeg");
 assert.equal(readableFileType(new TextEncoder().encode("<svg onload=alert(1)>")),null);
});
test("DOCX source validation requires a bounded OOXML ZIP directory",()=>{
 const sample=readFileSync(new URL("./fixtures/hrm/test-policy.docx",import.meta.url));
 assert.equal(isDocxPackage(new Uint8Array(sample)),true);
 assert.equal(isDocxPackage(new TextEncoder().encode("PK\\x03\\x04 [Content_Types].xml word/document.xml")),false);
});
test("legal multipart uploads are capped even when the body is chunked",async()=>{
 const request=new Request("https://runlumi.test/api/hrm/legal/files/upload",{method:"POST",headers:{"content-type":"multipart/form-data; boundary=test"},body:new Uint8Array(65)});
 await assert.rejects(readLegalForm(request,64),error=>error instanceof HrmError&&error.status===413);
});
test("onboarding templates reject unsafe owners, unknown prerequisites and dependency cycles",()=>{
 const base={title_en:"TEST task",title_vi:"TEST todo",instructions_en:"",instructions_vi:"",milestone:"Before day one",assignee_kind:"employee",verifier_kind:"hrm_officer",due_offset_days:-2,required:true,allow_waive:false,dependencies:[],evidence_type:"text",action_key:"profile"};
 const valid=validateOnboardingConfig(JSON.stringify({employment_statuses:["preboarding","active"]}),JSON.stringify([{...base,key:"profile"},{...base,key:"verify_profile",assignee_kind:"hrm_officer",verifier_kind:"none",evidence_type:"none",dependencies:["profile"]}]));assert.equal(valid.tasks.length,2);
 assert.throws(()=>validateOnboardingConfig("{}",JSON.stringify([{...base,key:"a",dependencies:["missing"]}])),HrmError);
 assert.throws(()=>validateOnboardingConfig("{}",JSON.stringify([{...base,key:"aa",dependencies:["bb"]},{...base,key:"bb",dependencies:["aa"]}])),error=>error instanceof HrmError&&error.message==="onboarding_dependency_cycle");
 assert.throws(()=>validateOnboardingConfig("{}",JSON.stringify([{...base,key:"pdf",verifier_kind:"none",evidence_type:"pdf"}])),error=>error instanceof HrmError&&error.message==="onboarding_pdf_needs_reviewer");
});
test("calendar schedule parsing requires seven explicit weekdays, valid local shifts and a reviewed OT basis",()=>{
 const schedule={weekdays:Array.from({length:7},(_,index)=>({weekday:index+1,shifts:index===0?[{key:"night",start:"22:00",end:"06:00",break_minutes:30,remote_allowed:false}]:[]})),holidays:["2026-12-25"],overtime:{enabled:true,requires_approval:true,basis:"TEST synthetic owner-reviewed basis"}};
 const parsed=parseCalendarSchedule(JSON.stringify(schedule));assert.equal(parsed.weekdays.length,7);assert.equal(parsed.weekdays[0].shifts[0].end,"06:00");assert.equal(parsed.holidays[0],"2026-12-25");
 assert.throws(()=>parseCalendarSchedule(JSON.stringify({...schedule,weekdays:schedule.weekdays.slice(1)})),error=>error instanceof HrmError&&error.message==="calendar_invalid");
 assert.throws(()=>parseCalendarSchedule(JSON.stringify({...schedule,overtime:{...schedule.overtime,basis:" "}})),error=>error instanceof HrmError&&error.message==="calendar_invalid");
 assert.throws(()=>parseCalendarSchedule(JSON.stringify({...schedule,weekdays:schedule.weekdays.map(day=>({...day,shifts:day.weekday===1?[{...schedule.weekdays[0].shifts[0],break_minutes:600}]:day.shifts}))})),error=>error instanceof HrmError&&error.message==="calendar_invalid");
});
test("leave policies are explicit, versionable, and do not assume allowances",()=>{
 const rules=[{key:"annual",title_en:"Annual leave",title_vi:"Phép năm",paid:true,annual_grant_minutes:0,monthly_accrual_minutes:0,prorate_on_start:false,carryover_limit_minutes:0,max_negative_minutes:0,evidence_required:false,exclude_holidays:true,basis:"TEST no grant without owner-approved values"}];
 assert.deepEqual(parseLeaveRules(JSON.stringify(rules)),rules);
 assert.throws(()=>parseLeaveRules(JSON.stringify([...rules,...rules])),error=>error instanceof HrmError&&error.message==="leave_policy_invalid");
 assert.throws(()=>parseLeaveRules(JSON.stringify([{...rules[0],annual_grant_minutes:-1}])),error=>error instanceof HrmError&&error.message==="leave_policy_invalid");
});
test("local attendance timestamps resolve to one UTC instant and reject DST gaps or overlaps",()=>{
 assert.equal(localDateTimeToUtc("2026-10-15T09:00","Asia/Ho_Chi_Minh"),"2026-10-15T02:00:00.000Z");
 assert.throws(()=>localDateTimeToUtc("2024-03-10T02:30","America/New_York"),error=>error instanceof HrmError&&error.message==="invalid_time");
 assert.throws(()=>localDateTimeToUtc("2024-11-03T01:30","America/New_York"),error=>error instanceof HrmError&&error.message==="invalid_time");
});
test("attendance CSV parsing is strict UTF-8, exact-header, RFC-quoted, and capped at 100 rows",()=>{
 const encode=(value:string)=>new TextEncoder().encode(value).buffer as ArrayBuffer;
 const headers="employee_code,work_date,shift_key,check_in_local,check_out_local,break_minutes";
 const parsed=parseAttendanceCsv(encode(`\uFEFF${headers}\r\n\"E-001\",2026-10-15,day,2026-10-15T09:00,2026-10-15T18:00,60\r\n`));
 assert.equal(parsed.length,1);assert.equal(parsed[0].employee_code,"E-001");assert.equal(parsed[0].break_minutes,"60");
 assert.throws(()=>parseAttendanceCsv(encode("employee_code,work_date,shift_key,check_in_local,check_out_local,break_minutes\nE-001,2026-10-15,day,2026-10-15T09:00,2026-10-15T18:00,60,extra")),error=>error instanceof HrmError&&error.message==="time_import_columns");
 assert.throws(()=>parseAttendanceCsv(encode(`${headers}\n\"E-001,2026-10-15,day,2026-10-15T09:00,2026-10-15T18:00,60`)),error=>error instanceof HrmError&&error.message==="time_import_csv");
 const row="E-001,2026-10-15,day,2026-10-15T09:00,2026-10-15T18:00,60";
 assert.equal(parseAttendanceCsv(encode(`${headers}\n${Array.from({length:100},()=>row).join("\n")}`)).length,100);
 assert.throws(()=>parseAttendanceCsv(encode(`${headers}\n${Array.from({length:101},()=>row).join("\n")}`)),error=>error instanceof HrmError&&error.message==="time_import_rows");
 assert.throws(()=>parseAttendanceCsv(new Uint8Array([0xc3]).buffer),error=>error instanceof HrmError&&error.message==="time_import_encoding");
 assert.throws(()=>parseAttendanceCsv(new Uint8Array(512*1024+1).buffer),error=>error instanceof HrmError&&error.status===413);
});
test("leave, HR service, training and asset PDFs have separate configurable retention categories",()=>{
 assert.equal(retentionCategoryForHrm("leave_evidence"),"leave_evidence");
 assert.equal(retentionCategoryForHrm("service_evidence"),"service_evidence");
 assert.equal(retentionCategoryForHrm("training_evidence"),"training_evidence");
 assert.equal(retentionCategoryForHrm("asset_evidence"),"asset_evidence");
 assert.ok((RETENTION_CATEGORIES as readonly string[]).includes("leave_evidence"));
 assert.ok((RETENTION_CATEGORIES as readonly string[]).includes("service_evidence"));
 assert.ok((RETENTION_CATEGORIES as readonly string[]).includes("training_evidence"));
 assert.ok((RETENTION_CATEGORIES as readonly string[]).includes("asset_evidence"));
});
test("asset reminder offsets require explicit unique bounded integer days",()=>{
 assert.deepEqual(parseAssetReminderOffsets("30,7,1,0,-1"),[30,7,1,0,-1]);
 assert.throws(()=>parseAssetReminderOffsets(""),error=>error instanceof HrmError&&error.message==="asset_reminder_days_invalid");
 assert.throws(()=>parseAssetReminderOffsets("7,7"),error=>error instanceof HrmError&&error.message==="asset_reminder_days_invalid");
 assert.throws(()=>parseAssetReminderOffsets("1.5"),error=>error instanceof HrmError&&error.message==="asset_reminder_days_invalid");
 assert.throws(()=>parseAssetReminderOffsets("366"),error=>error instanceof HrmError&&error.message==="asset_reminder_days_invalid");
});
test("HRM report months use Vietnam calendar boundaries and reject invalid months",()=>{
 assert.deepEqual(reportMonthRange("2026-01"),{period:"2026-01",startDate:"2026-01-01",nextDate:"2026-02-01",startUtc:"2025-12-31T17:00:00.000Z",endUtc:"2026-01-31T17:00:00.000Z"});
 assert.deepEqual(reportMonthRange("2026-12"),{period:"2026-12",startDate:"2026-12-01",nextDate:"2027-01-01",startUtc:"2026-11-30T17:00:00.000Z",endUtc:"2026-12-31T17:00:00.000Z"});
 for(const period of ["2026-00","2026-13","26-01","2026-1"])assert.throws(()=>reportMonthRange(period),error=>error instanceof HrmError&&error.message==="report_period_invalid");
});
test("HRM aggregate CSV preserves report filters and neutralizes formula-like values",()=>{
 const report:HrmReportSnapshot={legal_entity:"=TEST entity",generated_at:"2026-10-16T00:00:00.000Z",period:"2026-10",department:"+Operations",departments:["+Operations"],groups:[{key:"movement",title_en:"Movement",title_vi:"Biến động",rows:[{key:"started",count:2}]}]};
 const en=reportCsvContent(report,"en"),vi=reportCsvContent(report,"vi");
 assert.ok(en.includes("\"Legal entity\",\"'=TEST entity\""));assert.ok(en.includes("\"Report period\",\"2026-10\""));assert.ok(en.includes("\"Current department\",\"'+Operations\""));assert.ok(en.includes("\"Movement\",\"Started\",2"));
 assert.ok(vi.includes("\"Kỳ báo cáo\",\"2026-10\""));assert.ok(vi.includes("\"Phòng ban hiện tại\",\"'+Operations\""));
});
test("payroll policy accepts only explicit component definitions and no executable formula fields",()=>{
 const components=[{code:"base",title_en:"Base pay",title_vi:"Lương cơ bản",direction:"earning",required:true,source_kind:"employment_record"},{code:"deduction",title_en:"Deduction",title_vi:"Khấu trừ",direction:"deduction",required:false,source_kind:"manual_evidence"}];
 assert.deepEqual(parsePayrollComponents(JSON.stringify(components)),components);
 assert.throws(()=>parsePayrollComponents(JSON.stringify([{...components[0],formula:"amount * 0.1"}])),error=>error instanceof HrmError&&error.message==="payroll_components_invalid");
 assert.throws(()=>parsePayrollComponents(JSON.stringify([{...components[0],required:false}])),error=>error instanceof HrmError&&error.message==="payroll_required_earning_missing");
 assert.throws(()=>parsePayrollComponents(JSON.stringify([components[0],components[0]])),error=>error instanceof HrmError&&error.message==="payroll_components_invalid");
});
test("payroll arithmetic stays in exact integer minor units and blocks unknown, unsafe or negative results",()=>{
 assert.equal(parseMinorAmount("9007199254740991"),Number.MAX_SAFE_INTEGER);
 assert.throws(()=>parseMinorAmount("9007199254740992"),error=>error instanceof HrmError&&error.message==="payroll_amount_invalid");
 assert.throws(()=>parseMinorAmount("12.5"),error=>error instanceof HrmError&&error.message==="payroll_amount_invalid");
 assert.deepEqual(calculatePayrollTotals([{direction:"earning",amount_minor:9007199254740000},{direction:"earning",amount_minor:50},{direction:"deduction",amount_minor:25}]),{gross_minor:9007199254740050,deductions_minor:25,net_minor:9007199254740025});
 assert.throws(()=>calculatePayrollTotals([{direction:"earning",amount_minor:50},{direction:"deduction",amount_minor:51}]),error=>error instanceof HrmError&&error.message==="payroll_totals_invalid");
 assert.equal(formatPayrollMoney(123456,"USD",2),"USD 1,234.56");
 assert.equal(formatPayrollMoney(123456,"VND",0),"VND 123,456");
});
test("downloaded payslip HTML escapes snapshot text and preserves issue/payment distinction",()=>{
 const html=renderPayrollSlipHtml(JSON.stringify({policy:{title_en:"<img src=x onerror=alert(1)>",legal_entity:"TEST & Co",currency:"USD",minor_unit_scale:2},period_key:"2026-10",starts_on:"2026-10-01",ends_on:"2026-10-31",employee_code:"E-1",display_name:"<script>alert(1)</script>",correction_of_payslip_id:null,lines:[{title_en:"<b>base</b>",direction:"earning",amount_minor:12345,source_reference:"internal"}],gross_minor:12345,deductions_minor:0,net_minor:12345}));
 assert.ok(!html.includes("<script>alert(1)</script>"));assert.ok(!html.includes("<img src=x"));assert.ok(html.includes("USD 123.45"));assert.ok(html.includes("does not confirm payment"));
});
