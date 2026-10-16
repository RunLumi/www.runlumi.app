import type { WorkspaceUser } from "../workspace/roles";
import { HrmError } from "./fields";
import { audit, now, requirePermission } from "./service";

export interface HrmReportRow {key:string;count:number}
export interface HrmReportGroup {key:string;title_en:string;title_vi:string;rows:HrmReportRow[]}
export interface HrmReportFilters {period?:string|null;department?:string|null}
export interface HrmReportMonth {period:string;startDate:string;nextDate:string;startUtc:string;endUtc:string}
export interface HrmReportSnapshot {legal_entity:string;generated_at:string;period:string;department:string|null;departments:string[];groups:HrmReportGroup[]}
export type HrmReportLanguage="en"|"vi";

const statusLabels:Record<HrmReportLanguage,Record<string,string>>={
  en:{active:"Active",probation:"Probation",notice:"Notice",ended:"Ended",started:"Started",not_started:"Not started",in_progress:"In progress",submitted:"Submitted",verified:"Verified",completed:"Completed",blocked:"Blocked",waived:"Waived",pending_approval:"Pending approval",approved:"Approved",rejected:"Rejected",withdrawn:"Withdrawn",cancellation_requested:"Cancellation requested",cancelled:"Cancelled",cancellation_rejected:"Cancellation rejected",triaged:"Triaged",answered:"Answered",resolved:"Resolved",reopened:"Reopened",available:"Available",offered:"Awaiting receipt",assigned:"Assigned",return_requested:"Return requested",inspection:"Inspection",retired:"Retired",lost:"Reported lost",declined:"Declined",overdue:"Overdue",none:"No overtime"},
  vi:{active:"Đang làm",probation:"Thử việc",notice:"Báo trước",ended:"Đã kết thúc",started:"Bắt đầu",not_started:"Chưa bắt đầu",in_progress:"Đang làm",submitted:"Chờ duyệt",verified:"Đã xác minh",completed:"Hoàn tất",blocked:"Đang chặn",waived:"Được miễn",pending_approval:"Chờ duyệt",approved:"Đã duyệt",rejected:"Từ chối",withdrawn:"Đã rút",cancellation_requested:"Chờ hủy",cancelled:"Đã hủy",cancellation_rejected:"Không cho hủy",triaged:"Đã phân loại",answered:"Đã trả lời",resolved:"Đã xử lý",reopened:"Mở lại",available:"Sẵn sàng",offered:"Chờ nhận",assigned:"Đang giao",return_requested:"Chờ trả",inspection:"Chờ kiểm tra",retired:"Đã thanh lý",lost:"Báo mất",declined:"Không duyệt",overdue:"Quá hạn",none:"Không có OT"},
};

export function reportStateLabel(key:string,lang:HrmReportLanguage):string{return statusLabels[lang][key]??(lang==="vi"?"Khác":"Other")}
export function reportCsvCell(value:string):string{
  const safe=/^\s*[=+\-@]/u.test(value)?`'${value}`:value;
  return `"${safe.replace(/"/g,'""')}"`;
}
export function reportMonthRange(period:string):HrmReportMonth{
  const match=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if(!match)throw new HrmError("report_period_invalid",400);
  const year=Number(match[1]);if(year<1900||year>2200)throw new HrmError("report_period_invalid",400);
  const startDate=`${period}-01`,nextDate=new Date(Date.UTC(year,Number(match[2]),1)).toISOString().slice(0,10);
  const startUtc=new Date(`${startDate}T00:00:00+07:00`).toISOString(),endUtc=new Date(`${nextDate}T00:00:00+07:00`).toISOString();
  return {period,startDate,nextDate,startUtc,endUtc};
}
export function reportCsvContent(report:HrmReportSnapshot,lang:HrmReportLanguage):string{
  const vi=lang==="vi",rows:(string|number)[][]=[
    [vi?"Pháp nhân":"Legal entity",report.legal_entity],
    [vi?"Kỳ báo cáo":"Report period",report.period],
    [vi?"Phòng ban hiện tại":"Current department",report.department??(vi?"Toàn bộ phòng ban":"All departments")],
    [vi?"Tạo lúc":"Generated at",report.generated_at],
    [],
    [vi?"Nhóm":"Category",vi?"Trạng thái":"Status",vi?"Số lượng":"Count"],
    ...report.groups.flatMap(group=>group.rows.map(row=>[vi?group.title_vi:group.title_en,reportStateLabel(row.key,lang),row.count])),
  ];
  return `\uFEFF${rows.map(row=>row.map(value=>typeof value==="number"?String(value):reportCsvCell(value)).join(",")).join("\r\n")}\r\n`;
}

const live=(user:WorkspaceUser)=>{if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503)};
async function grouped(db:D1Database,sql:string,...bindings:(string|null)[]):Promise<HrmReportRow[]>{
  return (await db.prepare(sql).bind(...bindings).all<HrmReportRow>()).results;
}
const departmentClause=(alias:string,department:string|null)=>department?` AND ${alias}.department=?`:"";
const departmentBindings=(department:string|null):string[]=>department?[department]:[];
const latestEmployment=`e.id=(SELECT e2.id FROM hrm_employments e2 WHERE e2.person_id=e.person_id ORDER BY CASE WHEN e2.status!='ended' THEN 0 ELSE 1 END,e2.started_on DESC,e2.created_at DESC LIMIT 1)`;

export async function buildHrmReportSnapshotForEntity(db:D1Database,entity:string,filters:HrmReportFilters={},generatedAt=now()):Promise<HrmReportSnapshot>{
  if(!entity.trim()||entity.length>100)throw new HrmError("hrm_entity_unconfigured",409);
  const generatedTime=Date.parse(generatedAt);if(!Number.isFinite(generatedTime))throw new HrmError("report_generated_at_invalid",400);
  const today=new Date(generatedTime+7*60*60*1000).toISOString().slice(0,10),period=(filters.period??today.slice(0,7)).trim(),range=reportMonthRange(period),requestedDepartment=(filters.department??"").trim();
  if(requestedDepartment.length>120||/[\u0000-\u001f\u007f]/u.test(requestedDepartment))throw new HrmError("report_department_invalid",400);
  const departments=(await db.prepare(`SELECT DISTINCT e.department AS department FROM hrm_employments e
    WHERE e.legal_entity=? AND ${latestEmployment} AND trim(e.department)!='' ORDER BY e.department`).bind(entity).all<{department:string}>()).results.map(row=>row.department);
  const department=requestedDepartment||null;
  if(department&&!departments.includes(department))throw new HrmError("report_department_invalid",400);
  const dep=departmentClause("e",department),depBindings=departmentBindings(department);
  const [headcount,movement,attendance,overtime,onboarding,leave,services,assets,benefits,training,overdueTraining]=await Promise.all([
    grouped(db,`SELECT e.status AS key,COUNT(*) AS count FROM hrm_employments e WHERE e.legal_entity=? AND ${latestEmployment}${dep} GROUP BY e.status ORDER BY e.status`,entity,...depBindings),
    grouped(db,`SELECT 'started' AS key,COUNT(*) AS count FROM hrm_employments e WHERE e.legal_entity=? AND e.started_on>=? AND e.started_on<?${dep}
      UNION ALL SELECT 'ended' AS key,COUNT(*) AS count FROM hrm_employments e WHERE e.legal_entity=? AND e.ended_on>=? AND e.ended_on<?${dep}`,
      entity,range.startDate,range.nextDate,...depBindings,entity,range.startDate,range.nextDate,...depBindings),
    grouped(db,`SELECT t.state AS key,COUNT(*) AS count FROM hrm_time_entries t JOIN hrm_employments e ON e.id=t.employment_id
      WHERE e.legal_entity=? AND t.work_date>=? AND t.work_date<?${dep} GROUP BY t.state ORDER BY t.state`,entity,range.startDate,range.nextDate,...depBindings),
    grouped(db,`SELECT t.overtime_state AS key,COUNT(*) AS count FROM hrm_time_entries t JOIN hrm_employments e ON e.id=t.employment_id
      WHERE e.legal_entity=? AND t.work_date>=? AND t.work_date<? AND t.overtime_minutes>0${dep} GROUP BY t.overtime_state ORDER BY t.overtime_state`,entity,range.startDate,range.nextDate,...depBindings),
    grouped(db,`SELECT t.state AS key,COUNT(*) AS count FROM hrm_onboarding_tasks t JOIN hrm_onboarding_plans p ON p.id=t.plan_id JOIN hrm_employments e ON e.id=p.employment_id
      WHERE e.legal_entity=? AND p.state!='cancelled' AND t.due_at>=? AND t.due_at<?${dep} GROUP BY t.state ORDER BY t.state`,entity,range.startDate,range.nextDate,...depBindings),
    grouped(db,`SELECT r.state AS key,COUNT(*) AS count FROM hrm_leave_requests r JOIN hrm_employments e ON e.id=r.employment_id
      WHERE e.legal_entity=? AND r.starts_on<? AND r.ends_on>=?${dep} GROUP BY r.state ORDER BY r.state`,entity,range.nextDate,range.startDate,...depBindings),
    grouped(db,`SELECT r.state AS key,COUNT(*) AS count FROM hrm_service_requests r JOIN hrm_employments e ON e.id=r.employment_id
      WHERE e.legal_entity=? AND r.created_at>=? AND r.created_at<?${dep} GROUP BY r.state ORDER BY r.state`,entity,range.startUtc,range.endUtc,...depBindings),
    grouped(db,"SELECT state AS key,COUNT(*) AS count FROM hrm_assets WHERE legal_entity=? GROUP BY state ORDER BY state",entity),
    grouped(db,`SELECT b.state AS key,COUNT(*) AS count FROM hrm_benefit_enrollments b JOIN hrm_employments e ON e.id=b.employment_id
      WHERE b.legal_entity=? AND b.id=(SELECT b2.id FROM hrm_benefit_enrollments b2 WHERE b2.legal_entity=b.legal_entity AND b2.person_id=b.person_id AND b2.plan_code=b.plan_code ORDER BY b2.created_at DESC,b2.id DESC LIMIT 1)${dep}
      GROUP BY b.state ORDER BY b.state`,entity,...depBindings),
    grouped(db,`SELECT t.state AS key,COUNT(*) AS count FROM hrm_training_assignments t JOIN hrm_employments e ON e.id=t.employment_id
      WHERE t.legal_entity=? AND ((t.due_on>=? AND t.due_on<?) OR (t.renew_by>=? AND t.renew_by<?))${dep} GROUP BY t.state ORDER BY t.state`,entity,range.startDate,range.nextDate,range.startDate,range.nextDate,...depBindings),
    db.prepare(`SELECT COUNT(*) AS count FROM hrm_training_assignments t JOIN hrm_employments e ON e.id=t.employment_id
      WHERE t.legal_entity=? AND ((t.due_on IS NOT NULL AND t.due_on<? AND t.state IN ('assigned','submitted')) OR (t.renew_by IS NOT NULL AND t.renew_by<? AND t.state='approved'))${dep}`).bind(entity,today,today,...depBindings).first<{count:number}>(),
  ]);
  const groups:HrmReportGroup[]=[
    {key:"headcount",title_en:"Current employment snapshot",title_vi:"Ảnh chụp tình trạng làm việc hiện tại",rows:headcount},
    {key:"movement",title_en:"Employment changes in selected period",title_vi:"Biến động nhân sự trong kỳ",rows:movement},
    {key:"attendance",title_en:"Attendance entries in selected period",title_vi:"Bản ghi công trong kỳ",rows:attendance},
    {key:"overtime",title_en:"Overtime review in selected period",title_vi:"Rà soát làm thêm trong kỳ",rows:overtime},
    {key:"onboarding",title_en:"Onboarding items due in selected period",title_vi:"Công việc onboarding đến hạn trong kỳ",rows:onboarding},
    {key:"leave",title_en:"Leave requests overlapping selected period",title_vi:"Đơn nghỉ phép giao với kỳ đã chọn",rows:leave},
    {key:"services",title_en:"HR requests opened in selected period",title_vi:"Yêu cầu HR mở trong kỳ",rows:services},
    {key:"assets",title_en:"Company-wide asset custody snapshot",title_vi:"Ảnh chụp tài sản toàn pháp nhân",rows:assets},
    {key:"benefits",title_en:"Latest benefit enrollment per employee and plan",title_vi:"Đăng ký phúc lợi mới nhất theo nhân viên và gói",rows:benefits},
    {key:"training",title_en:"Training and certification deadlines in selected period",title_vi:"Hạn đào tạo và chứng chỉ trong kỳ",rows:training},
    {key:"overdue_training",title_en:"Currently overdue training/certification items",title_vi:"Mục đào tạo/chứng chỉ hiện quá hạn",rows:[{key:"overdue",count:overdueTraining?.count??0}]},
  ];
  return {legal_entity:entity,generated_at:generatedAt,period,department,departments,groups};
}

export async function hrmReportSnapshot(db:D1Database,user:WorkspaceUser,filters:HrmReportFilters={}):Promise<HrmReportSnapshot>{
  requirePermission(user,"hrm.reports.read");live(user);
  const settings=await db.prepare("SELECT legal_entity FROM hrm_settings WHERE id=1").first<{legal_entity:string|null}>();
  if(!settings?.legal_entity)throw new HrmError("hrm_entity_unconfigured",409);
  const report=await buildHrmReportSnapshotForEntity(db,settings.legal_entity,filters);
  await audit(db,user,"hrm_report_snapshot_read",null,"reports",{legal_entity:report.legal_entity,period:report.period,department:report.department??"all",group_count:report.groups.length});
  return report;
}

export async function exportHrmReportCsv(db:D1Database,user:WorkspaceUser,lang:HrmReportLanguage,filters:HrmReportFilters={}):Promise<string>{
  requirePermission(user,"hrm.reports.export");live(user);
  const report=await hrmReportSnapshot(db,user,filters);
  await audit(db,user,"hrm_report_export",null,"reports",{legal_entity:report.legal_entity,period:report.period,department:report.department??"all",group_count:report.groups.length});
  return reportCsvContent(report,lang);
}
