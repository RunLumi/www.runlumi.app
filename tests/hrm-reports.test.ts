import test from "node:test";
import assert from "node:assert/strict";
import { reportCsvCell, reportCsvContent, reportStateLabel, type HrmReportSnapshot } from "../src/lib/hrm/reports";
import { reportExpiryDate, reportPeriodForSchedule, reportScheduleIsDue } from "../src/lib/hrm/report-snapshots";

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
