import test from "node:test";
import assert from "node:assert/strict";
import { reportCsvCell, reportCsvContent, reportStateLabel, type HrmReportSnapshot } from "../src/lib/hrm/reports";
import { reportCaptureTargets, reportExpiryDate, reportPeriodForSchedule, reportScheduleIsDue, runHrmReportScheduleSweep } from "../src/lib/hrm/report-snapshots";

test("HRM aggregate CSV escapes spreadsheet formula cells and preserves CSV quoting",()=>{
  assert.equal(reportCsvCell("=HYPERLINK(\"https://example.test\")"),"\"'=HYPERLINK(\"\"https://example.test\"\")\"");
  assert.equal(reportCsvCell("  +1+1"),"\"'  +1+1\"");
  assert.equal(reportCsvCell("normal, value"),"\"normal, value\"");
});

test("HRM aggregate CSV is localized, contains only counts and neutralizes a formula-shaped entity",()=>{
  const report:HrmReportSnapshot={legal_entity:"=1+1",generated_at:"2026-10-15T00:00:00.000Z",period:"2026-10",department:null,departments:[],groups:[{key:"headcount",title_en:"Current employment",title_vi:"Tình trạng làm việc",rows:[{key:"active",count:2},{key:"unexpected_state",count:1}]}]};
  const csv=reportCsvContent(report,"vi");
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("\"Pháp nhân\",\"'=1+1\""));
  assert.ok(csv.includes("\"Nhóm\",\"Trạng thái\",\"Số lượng\""));
  assert.ok(csv.includes("\"Tình trạng làm việc\",\"Đang làm\",2"));
  assert.ok(csv.includes("\"Tình trạng làm việc\",\"Khác\",1"));
  assert.equal(reportStateLabel("unexpected_state","en"),"Other");
  assert.ok(!csv.includes("Current employment"));
});

test("scheduled report cadence uses Vietnam dates and monthly runs capture the prior complete month",()=>{
  assert.equal(reportScheduleIsDue("daily","2026-10-16"),true);
  assert.equal(reportScheduleIsDue("weekly","2026-10-19"),true,"Monday weekly schedules run");
  assert.equal(reportScheduleIsDue("weekly","2026-10-20"),false,"weekly schedules do not run twice in the week");
  assert.equal(reportScheduleIsDue("monthly","2026-11-01"),true);
  assert.equal(reportScheduleIsDue("monthly","2026-11-02"),false);
  assert.equal(reportPeriodForSchedule("daily","2026-10-16"),"2026-10");
  assert.equal(reportPeriodForSchedule("monthly","2026-11-01"),"2026-10");
  assert.throws(()=>reportPeriodForSchedule("monthly","2026-11-02"),/report_schedule_not_due/);
});

test("report snapshots require explicit bounded retention and expire on Vietnam calendar dates",()=>{
  assert.equal(reportExpiryDate("2026-10-16",90),"2027-01-14");
  assert.throws(()=>reportExpiryDate("2026-10-16",0),/report_retention_invalid/);
  assert.throws(()=>reportExpiryDate("2026-10-16",36501),/report_retention_invalid/);
});

test("report schedule sweep gates destructive work and records an over-cap failure",async()=>{
  const config={enabled:1,legal_entity:"TEST Entity",purpose:"TEST purpose",retention_policy:"TEST policy",policy_reference:"TEST reference",reviewed_by:"TEST reviewer",reviewed_at:"2026-10-17T00:00:00.000Z",version:4};
  let schedules:Array<Record<string,unknown>>=[],batches:unknown[][]=[],queries:string[]=[];
  const db={
    prepare(sql:string){queries.push(sql);return {bind(...values:unknown[]){return {sql,values}},first:async()=>config,all:async()=>({results:schedules}),run:async()=>{throw new Error("unexpected report sweep write")}}},
    batch:async(statements:unknown[])=>{batches.push(statements);return []},
  };
  const scheduledTime=Date.parse("2026-10-18T01:40:00.000Z");

  config.enabled=0;
  assert.deepEqual(await runHrmReportScheduleSweep(db as never,db as never,"true",scheduledTime),{created:0,expired:0,skipped:true});
  assert.equal(queries.length,1,"disabled HRM stops before expiry or schedule queries");
  config.enabled=1;queries.length=0;
  assert.deepEqual(await runHrmReportScheduleSweep(db as never,db as never,undefined,scheduledTime),{created:0,expired:0,skipped:true});
  assert.equal(queries.length,1,"a closed deployment switch stops before expiry or schedule queries");

  schedules=Array.from({length:21},(_,index)=>({id:`schedule-${index}`,schedule_ref:`schedule-ref-${index}`,legal_entity:config.legal_entity,department:`Department ${index}`,cadence:"daily",retention_days:1,retention_basis:"TEST basis",created_by:"TEST actor"}));
  queries.length=0;
  assert.deepEqual(await runHrmReportScheduleSweep(db as never,db as never,"true",scheduledTime),{created:0,expired:0,skipped:true});
  assert.equal(batches.flat().length,21,"every over-cap active schedule receives one deduplicated failure event");
  assert.ok(!queries.some(sql=>sql.includes("UPDATE hrm_report_snapshots")),"an over-cap schedule set stops before expiry deletion");
});

test("capture targets follow Vietnam dates across midnight, month, year and leap boundaries and catch up one missed run",()=>{
  const at=(iso:string)=>Date.parse(iso),old="2020-01-01T00:00:00.000Z";
  // 2026-12-31T17:05Z is 00:05 on 1 January 2027 in Vietnam: the monthly run is due and captures December.
  assert.deepEqual(reportCaptureTargets("monthly","2027-01-01",at("2026-12-31T17:05:00.000Z"),old),[{day:"2027-01-01",scheduledFor:"2026-12-31T17:05:00.000Z"}]);
  assert.equal(reportPeriodForSchedule("monthly","2027-01-01"),"2026-12");
  assert.equal(reportPeriodForSchedule("monthly","2028-03-01"),"2028-02","leap February is the captured month");
  // A monthly run missed on the 1st is caught up once on a later day with its nominal clock on the 1st.
  assert.deepEqual(reportCaptureTargets("monthly","2028-03-03",at("2028-03-02T17:05:00.000Z"),old),[{day:"2028-03-01",scheduledFor:"2028-02-29T17:05:00.000Z"}]);
  assert.deepEqual(reportCaptureTargets("monthly","2028-03-29",at("2028-03-28T17:05:00.000Z"),old),[],"older than 27 days is not reconstructed");
  // Daily: today plus yesterday; weekly: the most recent Monday within six days.
  assert.deepEqual(reportCaptureTargets("daily","2028-02-29",at("2028-02-28T17:05:00.000Z"),old).map(target=>target.day),["2028-02-29","2028-02-28"]);
  assert.deepEqual(reportCaptureTargets("weekly","2026-10-21",at("2026-10-20T17:05:00.000Z"),old).map(target=>target.day),["2026-10-19"]);
  // Nothing before the schedule existed: created at 09:00 Vietnam on 20 October.
  assert.deepEqual(reportCaptureTargets("daily","2026-10-20",at("2026-10-20T03:00:00.000Z"),"2026-10-20T02:00:00.000Z").map(target=>target.day),["2026-10-20"]);
  for(const target of reportCaptureTargets("daily","2028-02-29",at("2028-02-28T17:05:00.000Z"),old))assert.equal(new Date(Date.parse(target.scheduledFor)+7*3600000).toISOString().slice(0,10),target.day,"each nominal clock falls on its Vietnam date");
});
