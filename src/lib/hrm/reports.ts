import type { WorkspaceUser } from "../workspace/roles";
import { HrmError } from "./fields";
import { audit, localDate, now, requirePermission } from "./service";

export interface HrmReportRow {key:string;count:number}
export interface HrmReportGroup {key:string;title_en:string;title_vi:string;rows:HrmReportRow[]}
export interface HrmReportSnapshot {legal_entity:string;generated_at:string;groups:HrmReportGroup[]}
export type HrmReportLanguage="en"|"vi";

const statusLabels:Record<HrmReportLanguage,Record<string,string>>={
  en:{active:"Active",probation:"Probation",notice:"Notice",ended:"Ended",not_started:"Not started",in_progress:"In progress",submitted:"Submitted",verified:"Verified",completed:"Completed",blocked:"Blocked",waived:"Waived",pending_approval:"Pending approval",approved:"Approved",rejected:"Rejected",withdrawn:"Withdrawn",cancellation_requested:"Cancellation requested",cancelled:"Cancelled",cancellation_rejected:"Cancellation rejected",triaged:"Triaged",answered:"Answered",resolved:"Resolved",reopened:"Reopened",available:"Available",offered:"Awaiting receipt",assigned:"Assigned",return_requested:"Return requested",inspection:"Inspection",retired:"Retired",lost:"Reported lost",declined:"Declined",overdue:"Overdue"},
  vi:{active:"Đang làm",probation:"Thử việc",notice:"Báo trước",ended:"Đã kết thúc",not_started:"Chưa bắt đầu",in_progress:"Đang làm",submitted:"Chờ duyệt",verified:"Đã xác minh",completed:"Hoàn tất",blocked:"Đang chặn",waived:"Được miễn",pending_approval:"Chờ duyệt",approved:"Đã duyệt",rejected:"Từ chối",withdrawn:"Đã rút",cancellation_requested:"Chờ hủy",cancelled:"Đã hủy",cancellation_rejected:"Không cho hủy",triaged:"Đã phân loại",answered:"Đã trả lời",resolved:"Đã xử lý",reopened:"Mở lại",available:"Sẵn sàng",offered:"Chờ nhận",assigned:"Đang giao",return_requested:"Chờ trả",inspection:"Chờ kiểm tra",retired:"Đã thanh lý",lost:"Báo mất",declined:"Không duyệt",overdue:"Quá hạn"},
};

export function reportStateLabel(key:string,lang:HrmReportLanguage):string{return statusLabels[lang][key]??(lang==="vi"?"Khác":"Other")}
export function reportCsvCell(value:string):string{
  const safe=/^\s*[=+\-@]/u.test(value)?`'${value}`:value;
  return `"${safe.replace(/"/g,'""')}"`;
}
export function reportCsvContent(report:HrmReportSnapshot,lang:HrmReportLanguage):string{
  const vi=lang==="vi",rows:(string|number)[][]=[
    [vi?"Pháp nhân":"Legal entity",report.legal_entity],
    [vi?"Tạo lúc":"Generated at",report.generated_at],
    [],
    [vi?"Nhóm":"Category",vi?"Trạng thái":"Status",vi?"Số lượng":"Count"],
    ...report.groups.flatMap(group=>group.rows.map(row=>[vi?group.title_vi:group.title_en,reportStateLabel(row.key,lang),row.count])),
  ];
  return `\uFEFF${rows.map(row=>row.map(value=>typeof value==="number"?String(value):reportCsvCell(value)).join(",")).join("\r\n")}\r\n`;
}

const live=(user:WorkspaceUser)=>{if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503)};
async function grouped(db:D1Database,sql:string,entity:string|null):Promise<HrmReportRow[]>{
  return (await db.prepare(sql).bind(entity).all<HrmReportRow>()).results;
}

export async function hrmReportSnapshot(db:D1Database,user:WorkspaceUser):Promise<HrmReportSnapshot>{
  requirePermission(user,"hrm.reports.read");live(user);
  const settings=await db.prepare("SELECT legal_entity FROM hrm_settings WHERE id=1").first<{legal_entity:string|null}>();
  if(!settings?.legal_entity)throw new HrmError("hrm_entity_unconfigured",409);
  const entity=settings.legal_entity,today=localDate(),asOf=now();
  const [headcount,onboarding,leave,services,assets,benefits,training,overdueTraining]=await Promise.all([
    grouped(db,`SELECT e.status AS key,COUNT(*) AS count FROM hrm_employments e WHERE e.legal_entity=? AND e.id=(SELECT e2.id FROM hrm_employments e2 WHERE e2.person_id=e.person_id ORDER BY CASE WHEN e2.status!='ended' THEN 0 ELSE 1 END,e2.started_on DESC,e2.created_at DESC LIMIT 1) GROUP BY e.status ORDER BY e.status`,entity),
    grouped(db,`SELECT t.state AS key,COUNT(*) AS count FROM hrm_onboarding_tasks t JOIN hrm_onboarding_plans p ON p.id=t.plan_id JOIN hrm_employments e ON e.id=p.employment_id WHERE e.legal_entity=? GROUP BY t.state ORDER BY t.state`,entity),
    grouped(db,`SELECT r.state AS key,COUNT(*) AS count FROM hrm_leave_requests r JOIN hrm_employments e ON e.id=r.employment_id WHERE e.legal_entity=? GROUP BY r.state ORDER BY r.state`,entity),
    grouped(db,`SELECT r.state AS key,COUNT(*) AS count FROM hrm_service_requests r JOIN hrm_employments e ON e.id=r.employment_id WHERE e.legal_entity=? GROUP BY r.state ORDER BY r.state`,entity),
    grouped(db,"SELECT state AS key,COUNT(*) AS count FROM hrm_assets WHERE legal_entity=? GROUP BY state ORDER BY state",entity),
    grouped(db,"SELECT state AS key,COUNT(*) AS count FROM hrm_benefit_enrollments WHERE legal_entity=? GROUP BY state ORDER BY state",entity),
    grouped(db,"SELECT state AS key,COUNT(*) AS count FROM hrm_training_assignments WHERE legal_entity=? GROUP BY state ORDER BY state",entity),
    db.prepare("SELECT COUNT(*) AS count FROM hrm_training_assignments WHERE legal_entity=? AND ((due_on IS NOT NULL AND due_on<? AND state IN ('assigned','submitted')) OR (renew_by IS NOT NULL AND renew_by<? AND state='approved'))").bind(entity,today,today).first<{count:number}>(),
  ]);
  const groups:HrmReportGroup[]=[
    {key:"headcount",title_en:"Current employment",title_vi:"Tình trạng làm việc",rows:headcount},
    {key:"onboarding",title_en:"Onboarding tasks",title_vi:"Công việc onboarding",rows:onboarding},
    {key:"leave",title_en:"Leave requests",title_vi:"Đơn nghỉ phép",rows:leave},
    {key:"services",title_en:"HR service requests",title_vi:"Yêu cầu dịch vụ HR",rows:services},
    {key:"assets",title_en:"Asset custody",title_vi:"Bàn giao tài sản",rows:assets},
    {key:"benefits",title_en:"Benefit enrollments",title_vi:"Đăng ký phúc lợi",rows:benefits},
    {key:"training",title_en:"Training and certificates",title_vi:"Đào tạo và chứng chỉ",rows:training},
    {key:"overdue_training",title_en:"Overdue training/certification items",title_vi:"Mục đào tạo/chứng chỉ quá hạn",rows:[{key:"overdue",count:overdueTraining?.count??0}]},
  ];
  await audit(db,user,"hrm_report_snapshot_read",null,"reports",{legal_entity:entity,group_count:groups.length});
  return {legal_entity:entity,generated_at:asOf,groups};
}

export async function exportHrmReportCsv(db:D1Database,user:WorkspaceUser,lang:HrmReportLanguage):Promise<string>{
  requirePermission(user,"hrm.reports.export");live(user);
  const report=await hrmReportSnapshot(db,user);
  await audit(db,user,"hrm_report_export",null,"reports",{legal_entity:report.legal_entity,group_count:report.groups.length});
  return reportCsvContent(report,lang);
}
