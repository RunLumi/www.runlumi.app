import type { WorkspaceUser } from "../workspace/roles";
import { HrmError, date } from "./fields";
import { audit, command, guardBoolean, id, localDate, now, requirePermission } from "./service";

export const HRM_BENEFIT_CATEGORIES=["health","insurance","wellness","family","reimbursement","other"] as const;
export type HrmBenefitCategory=typeof HRM_BENEFIT_CATEGORIES[number];
export type HrmBenefitPlanState="draft"|"active"|"retired";
export type HrmBenefitEnrollmentState="submitted"|"approved"|"declined"|"cancelled";

export interface HrmBenefitPlan {
  id:string;plan_code:string;version_no:number;legal_entity:string;category:HrmBenefitCategory;name:string;description:string;eligibility_text:string;
  effective_from:string;effective_to:string;state:HrmBenefitPlanState;revision:number;created_by:string;created_at:string;reviewed_by:string|null;reviewed_at:string|null;
  updated_by:string;updated_at:string;enrollment_count?:number;
}
export interface HrmBenefitEnrollment {
  id:string;plan_version_id:string;plan_code:string;plan_version_no:number;legal_entity:string;category:HrmBenefitCategory;person_id:string;employment_id:string;
  state:HrmBenefitEnrollmentState;employee_note:string;created_by:string;created_at:string;reviewed_by:string|null;reviewed_at:string|null;review_reason:string;
  revision:number;actor_id:string;updated_at:string;employee_code?:string;display_name?:string;plan_name?:string;
}

const live=(user:WorkspaceUser)=>{if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503)};
const clean=(value:string,max:number,required=true)=>{const result=value.trim();if(result.length>max||(required&&!result))throw new HrmError("invalid_field");return result};
function category(value:string):HrmBenefitCategory{if(!(HRM_BENEFIT_CATEGORIES as readonly string[]).includes(value))throw new HrmError("benefit_category_invalid");return value as HrmBenefitCategory}

async function currentEmployee(db:D1Database,user:WorkspaceUser):Promise<{person_id:string;employment_id:string;legal_entity:string}>{
  const row=await db.prepare(`SELECT p.id AS person_id,e.id AS employment_id,e.legal_entity
    FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id AND e.id=(SELECT e2.id FROM hrm_employments e2 WHERE e2.person_id=p.id ORDER BY CASE WHEN e2.status!='ended' THEN 0 ELSE 1 END,e2.started_on DESC,e2.created_at DESC LIMIT 1)
    JOIN workspace_members m ON m.user_id=p.user_id AND m.enabled=1 JOIN workspace_roles r ON r.user_id=m.user_id AND r.role='employee'
    WHERE p.user_id=? AND e.status IN ('probation','active','notice') AND (e.started_on IS NULL OR e.started_on<=date('now','+7 hours')) AND (e.ended_on IS NULL OR e.ended_on>date('now','+7 hours')) LIMIT 1`)
    .bind(user.id).first<{person_id:string;employment_id:string;legal_entity:string}>();
  if(!row)throw new HrmError("not_found",404);return row;
}

export async function listMyBenefits(db:D1Database,user:WorkspaceUser):Promise<{plans:HrmBenefitPlan[];enrollments:HrmBenefitEnrollment[]}>{
  requirePermission(user,"hrm.benefits.self");live(user);const employee=await currentEmployee(db,user),today=localDate();
  const [plans,enrollments]=await Promise.all([
    db.prepare("SELECT * FROM hrm_benefit_plans WHERE legal_entity=? AND state='active' AND effective_from<=? AND effective_to>=? ORDER BY plan_code,version_no DESC LIMIT 100")
      .bind(employee.legal_entity,today,today).all<HrmBenefitPlan>(),
    db.prepare(`SELECT x.*,p.name AS plan_name FROM hrm_benefit_enrollments x JOIN hrm_benefit_plans p ON p.id=x.plan_version_id
      WHERE x.person_id=? ORDER BY x.created_at DESC,x.id DESC LIMIT 100`).bind(employee.person_id).all<HrmBenefitEnrollment>(),
  ]);
  await audit(db,user,"hrm_benefits_self_listed",employee.person_id,user.id,{plan_count:plans.results.length,enrollment_count:enrollments.results.length});
  return {plans:plans.results,enrollments:enrollments.results};
}

export async function listManagedBenefits(db:D1Database,user:WorkspaceUser):Promise<{plans:HrmBenefitPlan[];enrollments:HrmBenefitEnrollment[]}>{
  requirePermission(user,"hrm.benefits.manage");live(user);
  const [plans,enrollments]=await Promise.all([
    db.prepare(`SELECT p.*,(SELECT COUNT(*) FROM hrm_benefit_enrollments x WHERE x.plan_version_id=p.id AND x.state IN ('submitted','approved')) AS enrollment_count
      FROM hrm_benefit_plans p ORDER BY p.legal_entity,p.plan_code,p.version_no DESC LIMIT 300`).all<HrmBenefitPlan>(),
    db.prepare(`SELECT x.*,p.name AS plan_name,person.employee_code,COALESCE(NULLIF(person.preferred_name,''),person.legal_name) AS display_name
      FROM hrm_benefit_enrollments x JOIN hrm_benefit_plans p ON p.id=x.plan_version_id JOIN hrm_people person ON person.id=x.person_id
      ORDER BY CASE x.state WHEN 'submitted' THEN 0 ELSE 1 END,x.created_at DESC LIMIT 300`).all<HrmBenefitEnrollment>(),
  ]);
  await audit(db,user,"hrm_benefits_management_listed",null,"benefits",{plan_count:plans.results.length,enrollment_count:enrollments.results.length});
  return {plans:plans.results,enrollments:enrollments.results};
}

export async function createBenefitPlan(db:D1Database,user:WorkspaceUser,key:string,input:{planCode:string;legalEntity:string;category:string;name:string;description:string;eligibilityText:string;effectiveFrom:string;effectiveTo:string}):Promise<string>{
  requirePermission(user,"hrm.benefits.manage");live(user);
  const planCode=clean(input.planCode,48).toUpperCase(),legalEntity=clean(input.legalEntity,200),kind=category(input.category),name=clean(input.name,120),description=clean(input.description,2000),eligibilityText=clean(input.eligibilityText,2000),effectiveFrom=date(input.effectiveFrom),effectiveTo=date(input.effectiveTo);
  if(!/^[A-Z0-9][A-Z0-9._-]{1,47}$/.test(planCode))throw new HrmError("benefit_plan_code_invalid");
  if(!effectiveFrom||!effectiveTo||effectiveTo<effectiveFrom)throw new HrmError("benefit_effective_dates_invalid");
  const settings=await db.prepare("SELECT legal_entity FROM hrm_settings WHERE id=1").first<{legal_entity:string|null}>();
  if(!settings?.legal_entity||settings.legal_entity!==legalEntity)throw new HrmError("hrm_entity_unconfigured",409);
  const last=await db.prepare("SELECT COALESCE(MAX(version_no),0) AS version_no FROM hrm_benefit_plans WHERE legal_entity=? AND plan_code=?").bind(legalEntity,planCode).first<{version_no:number}>();
  const versionNo=(last?.version_no??0)+1,planId=id("benefit_plan"),time=now(),payload={planCode,versionNo,legalEntity,category:kind,name,description,eligibilityText,effectiveFrom,effectiveTo};
  return command(db,user,key,"hrm_benefit_plan_create",payload,planId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND legal_entity=?)",[legalEntity]),
    guardBoolean(db,"COALESCE((SELECT MAX(version_no)+1 FROM hrm_benefit_plans WHERE legal_entity=? AND plan_code=?),1)=?",[legalEntity,planCode,versionNo]),
  ],[
    db.prepare(`INSERT INTO hrm_benefit_plans(id,plan_code,version_no,legal_entity,category,name,description,eligibility_text,effective_from,effective_to,state,revision,created_by,created_at,updated_by,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,'draft',1,?,?,?,?)`).bind(planId,planCode,versionNo,legalEntity,kind,name,description,eligibilityText,effectiveFrom,effectiveTo,user.id,time,user.id,time),
    db.prepare("INSERT INTO hrm_benefit_events(id,plan_version_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,'plan_created',?,?,?)").bind(id("benefitev"),planId,JSON.stringify({plan_code:planCode,version_no:versionNo,legal_entity:legalEntity}),user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'hrm_benefit_plan_created',?,?,?)").bind(user.id,planId,JSON.stringify({plan_code:planCode,version_no:versionNo}),time),
  ]);
}

export async function activateBenefitPlan(db:D1Database,user:WorkspaceUser,key:string,planId:string,expectedRevision:number,reason:string):Promise<void>{
  requirePermission(user,"hrm.benefits.approve");live(user);
  const row=await db.prepare("SELECT * FROM hrm_benefit_plans WHERE id=?").bind(planId).first<HrmBenefitPlan>();
  if(!row)throw new HrmError("not_found",404);
  if(row.created_by===user.id)throw new HrmError("benefit_self_review",403);
  if(row.state!=="draft"||row.revision!==expectedRevision)throw new HrmError("conflict",409);
  if(row.effective_to<localDate())throw new HrmError("benefit_plan_expired",409);
  const cleanReason=clean(reason,1000),payload={planId,expectedRevision,reason:cleanReason},time=now();
  const prior=await db.prepare("SELECT id,revision FROM hrm_benefit_plans WHERE legal_entity=? AND plan_code=? AND state='active' LIMIT 1").bind(row.legal_entity,row.plan_code).first<{id:string;revision:number}>();
  const writes:D1PreparedStatement[]=[];
  if(prior){
    writes.push(db.prepare("UPDATE hrm_benefit_plans SET state='retired',revision=revision+1,updated_by=?,updated_at=? WHERE id=? AND state='active' AND revision=?").bind(user.id,time,prior.id,prior.revision));
    writes.push(db.prepare("INSERT INTO hrm_benefit_events(id,plan_version_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,'plan_retired',?,?,?)").bind(id("benefitev"),prior.id,JSON.stringify({replacement_plan_id:planId}),user.id,time));
  }
  writes.push(
    db.prepare("UPDATE hrm_benefit_plans SET state='active',revision=revision+1,reviewed_by=?,reviewed_at=?,updated_by=?,updated_at=? WHERE id=? AND state='draft' AND revision=?").bind(user.id,time,user.id,time,planId,expectedRevision),
    db.prepare("INSERT INTO hrm_benefit_events(id,plan_version_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,'plan_activated',?,?,?)").bind(id("benefitev"),planId,JSON.stringify({reason:cleanReason,previous_plan_id:prior?.id??null}),user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at) VALUES(?,'hrm_benefit_plan_activated',?,?,?)").bind(user.id,planId,JSON.stringify({previous_plan_id:prior?.id??null,reason_recorded:true}),time),
  );
  await command(db,user,key,"hrm_benefit_plan_activate",payload,planId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_benefit_plans WHERE id=? AND state='draft' AND revision=? AND created_by!=? AND effective_to>=?)",[planId,expectedRevision,user.id,localDate()]),
    guardBoolean(db,"NOT EXISTS(SELECT 1 FROM hrm_benefit_plans p JOIN hrm_benefit_enrollments e ON e.plan_version_id=p.id WHERE p.legal_entity=? AND p.plan_code=? AND p.state='active' AND e.state='submitted')",[row.legal_entity,row.plan_code]),
    guardBoolean(db,"?=1 OR EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role='hrm_admin')",[user.admin?1:0,user.id]),
  ],writes);
}

export async function submitBenefitEnrollment(db:D1Database,user:WorkspaceUser,key:string,planId:string,note:string):Promise<string>{
  requirePermission(user,"hrm.benefits.self");live(user);
  const employee=await currentEmployee(db,user),plan=await db.prepare("SELECT * FROM hrm_benefit_plans WHERE id=?").bind(planId).first<HrmBenefitPlan>();
  if(!plan||plan.state!=="active"||plan.legal_entity!==employee.legal_entity)throw new HrmError("not_found",404);
  const today=localDate();if(plan.effective_from>today||plan.effective_to<today)throw new HrmError("benefit_plan_inactive",409);
  const employeeNote=clean(note,1000,false),enrollmentId=id("benefit_enrollment"),time=now(),payload={planId,personId:employee.person_id,employmentId:employee.employment_id,employeeNote};
  return command(db,user,key,"hrm_benefit_enrollment_submit",payload,enrollmentId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_benefit_plans WHERE id=? AND state='active' AND legal_entity=? AND effective_from<=? AND effective_to>=?)",[planId,employee.legal_entity,today,today]),
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id JOIN workspace_members m ON m.user_id=p.user_id AND m.enabled=1 JOIN workspace_roles r ON r.user_id=m.user_id AND r.role='employee' WHERE p.id=? AND p.user_id=? AND e.id=? AND e.status IN ('probation','active','notice') AND e.legal_entity=? AND (e.ended_on IS NULL OR e.ended_on>date('now','+7 hours')))",[employee.person_id,user.id,employee.employment_id,employee.legal_entity]),
    guardBoolean(db,"NOT EXISTS(SELECT 1 FROM hrm_benefit_enrollments WHERE person_id=? AND plan_code=? AND state IN ('submitted','approved'))",[employee.person_id,plan.plan_code]),
  ],[
    db.prepare(`INSERT INTO hrm_benefit_enrollments(id,plan_version_id,plan_code,plan_version_no,legal_entity,category,person_id,employment_id,state,employee_note,created_by,created_at,revision,actor_id,updated_at)
      VALUES(?,?,?,?,?,?,?,?,'submitted',?,?,?,1,?,?)`).bind(enrollmentId,plan.id,plan.plan_code,plan.version_no,plan.legal_entity,plan.category,employee.person_id,employee.employment_id,employeeNote,user.id,time,user.id,time),
    db.prepare("INSERT INTO hrm_benefit_events(id,plan_version_id,enrollment_id,person_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,?,?,'enrollment_submitted',?,?,?)").bind(id("benefitev"),plan.id,enrollmentId,employee.person_id,JSON.stringify({plan_code:plan.plan_code,plan_version_no:plan.version_no}),user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'hrm_benefit_enrollment_submitted',?,?,?,?)").bind(user.id,employee.person_id,enrollmentId,JSON.stringify({plan_code:plan.plan_code,plan_version_no:plan.version_no}),time),
  ]);
}

export async function decideBenefitEnrollment(db:D1Database,user:WorkspaceUser,key:string,enrollmentId:string,expectedRevision:number,decision:string,reason:string):Promise<void>{
  requirePermission(user,"hrm.benefits.approve");live(user);
  if(decision!=="approve"&&decision!=="decline")throw new HrmError("invalid_action",400);
  const row=await db.prepare("SELECT * FROM hrm_benefit_enrollments WHERE id=?").bind(enrollmentId).first<HrmBenefitEnrollment>();
  if(!row)throw new HrmError("not_found",404);
  if(row.created_by===user.id)throw new HrmError("benefit_self_review",403);
  const cleanReason=clean(reason,1000),next=decision==="approve"?"approved":"declined",time=now(),payload={enrollmentId,expectedRevision,decision,reason:cleanReason};
  if(row.state!=="submitted"||row.revision!==expectedRevision)throw new HrmError("conflict",409);
  await command(db,user,key,"hrm_benefit_enrollment_decide",payload,enrollmentId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_benefit_enrollments x WHERE x.id=? AND x.revision=? AND x.state='submitted' AND x.created_by!=?)",[enrollmentId,expectedRevision,user.id]),
    guardBoolean(db,"?=1 OR EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id WHERE m.user_id=? AND m.enabled=1 AND r.role='hrm_admin')",[user.admin?1:0,user.id]),
    ...(next==="approved"?[guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_benefit_enrollments x JOIN hrm_benefit_plans p ON p.id=x.plan_version_id JOIN hrm_employments e ON e.id=x.employment_id WHERE x.id=? AND p.state='active' AND p.effective_from<=? AND p.effective_to>=? AND e.status IN ('probation','active','notice') AND (e.ended_on IS NULL OR e.ended_on>date('now','+7 hours')))",[enrollmentId,localDate(),localDate()])]:[]),
  ],[
    db.prepare("UPDATE hrm_benefit_enrollments SET state=?,reviewed_by=?,reviewed_at=?,review_reason=?,revision=revision+1,actor_id=?,updated_at=? WHERE id=? AND revision=? AND state='submitted'").bind(next,user.id,time,cleanReason,user.id,time,enrollmentId,expectedRevision),
    db.prepare("INSERT INTO hrm_benefit_events(id,plan_version_id,enrollment_id,person_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id("benefitev"),row.plan_version_id,enrollmentId,row.person_id,`enrollment_${next}`,JSON.stringify({reason:cleanReason}),user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,`hrm_benefit_enrollment_${next}`,row.person_id,enrollmentId,JSON.stringify({plan_code:row.plan_code,reason_recorded:true}),time),
  ]);
}

export async function cancelBenefitEnrollment(db:D1Database,user:WorkspaceUser,key:string,enrollmentId:string,expectedRevision:number,reason:string):Promise<void>{
  requirePermission(user,"hrm.benefits.self");live(user);
  const row=await db.prepare(`SELECT x.*,p.user_id AS employee_user_id FROM hrm_benefit_enrollments x JOIN hrm_people p ON p.id=x.person_id WHERE x.id=?`).bind(enrollmentId).first<HrmBenefitEnrollment&{employee_user_id:string|null}>();
  if(!row||row.employee_user_id!==user.id)throw new HrmError("not_found",404);
  if(!["submitted","approved"].includes(row.state)||row.revision!==expectedRevision)throw new HrmError("conflict",409);
  const cleanReason=clean(reason,1000),time=now(),payload={enrollmentId,expectedRevision,reason:cleanReason};
  await command(db,user,key,"hrm_benefit_enrollment_cancel",payload,enrollmentId,[
    guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_benefit_enrollments x JOIN hrm_people p ON p.id=x.person_id JOIN hrm_employments e ON e.id=x.employment_id WHERE x.id=? AND x.revision=? AND x.state IN ('submitted','approved') AND p.user_id=? AND e.status IN ('probation','active','notice') AND (e.ended_on IS NULL OR e.ended_on>date('now','+7 hours')))",[enrollmentId,expectedRevision,user.id]),
  ],[
    db.prepare("UPDATE hrm_benefit_enrollments SET state='cancelled',review_reason=?,revision=revision+1,actor_id=?,updated_at=? WHERE id=? AND revision=? AND state IN ('submitted','approved')").bind(cleanReason,user.id,time,enrollmentId,expectedRevision),
    db.prepare("INSERT INTO hrm_benefit_events(id,plan_version_id,enrollment_id,person_id,event_type,detail_json,actor_id,created_at) VALUES(?,?,?,?,'enrollment_cancelled',?,?,?)").bind(id("benefitev"),row.plan_version_id,enrollmentId,row.person_id,JSON.stringify({reason:cleanReason}),user.id,time),
    db.prepare("INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(?,'hrm_benefit_enrollment_cancelled',?,?,?,?)").bind(user.id,row.person_id,enrollmentId,JSON.stringify({plan_code:row.plan_code,reason_recorded:true}),time),
  ]);
}
