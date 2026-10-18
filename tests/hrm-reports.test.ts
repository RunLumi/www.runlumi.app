import test from "node:test";
import assert from "node:assert/strict";
import { reportCsvCell, reportCsvContent, reportStateLabel, type HrmReportSnapshot } from "../src/lib/hrm/reports";
import { reportExpiryDate, reportPeriodForSchedule, reportScheduleIsDue, runHrmReportScheduleSweep } from "../src/lib/hrm/report-snapshots";

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
