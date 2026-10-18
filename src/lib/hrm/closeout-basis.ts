import type { WorkspaceUser } from "../workspace/roles";
import { HrmError } from "./fields";
import { audit, digest, requirePermission } from "./service";

// Technical collection caps fail closed; they never imply a truncated zero.
const ROW_LIMIT=1000,BYTE_LIMIT=5*1024*1024;
type Row=Record<string,unknown>;
export interface CloseoutBasis {
 version:1;
 case:{id:string;person_id:string;employment_id:string;employee_user_id:string|null;ended_on:string};
 identity:{employee_code:string;legal_name:string;user_id:string|null};
 employment:Row;
 source_revision:number;
 records:Row[];profile_changes:Row[];payroll_runs:Row[];payslips:Row[];payments:Row[];disputes:Row[];
 time_entries:Row[];time_adjustments:Row[];leave_requests:Row[];leave_ledger:Row[];
}
export interface CloseoutBasisResult {basis:CloseoutBasis;checksum:string;caseState:string;caseVersion:number;blockers:string[];hasPayroll:boolean}
export function requireCloseout(user:WorkspaceUser):void{
 requirePermission(user,"hrm.offboarding.manage");requirePermission(user,"hrm.payroll.approve");
 if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
}
const employmentScope="(SELECT employment_id FROM hrm_offboarding_cases WHERE id=?)";
const personScope="(SELECT person_id FROM hrm_offboarding_cases WHERE id=?)";
const slipFrom=`FROM hrm_payslips s JOIN hrm_payroll_run_people rp ON rp.id=s.run_person_id WHERE rp.employment_id=${employmentScope}`;
const integer=(value:unknown)=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0;
function object(value:unknown):Row|null{if(!value||typeof value!=="object"||Array.isArray(value))return null;return value as Row}

function validIssued(snapshot:Row):boolean{
 const policy=object(snapshot.policy),lines=snapshot.lines;
 if(snapshot.version!==1||!policy||typeof policy.currency!=="string"||!(/^[A-Z]{3}$/).test(policy.currency)||!Number.isInteger(policy.minor_unit_scale)||Number(policy.minor_unit_scale)<0||Number(policy.minor_unit_scale)>3||!Array.isArray(lines)||lines.length===0||!integer(snapshot.gross_minor)||!integer(snapshot.deductions_minor)||!integer(snapshot.net_minor))return false;
 let gross=0n,deductions=0n;
 for(const value of lines){const line=object(value);if(!line||!integer(line.amount_minor)||!["earning","deduction"].includes(String(line.direction))||line.amount_minor===0&&(typeof line.zero_reason!=="string"||!line.zero_reason.trim()))return false;if(line.direction==="earning")gross+=BigInt(line.amount_minor as number);else deductions+=BigInt(line.amount_minor as number)}
 return gross===BigInt(snapshot.gross_minor as number)&&deductions===BigInt(snapshot.deductions_minor as number)&&gross-deductions===BigInt(snapshot.net_minor as number);
}

/** Every SELECT shares one D1 read transaction. No bank/identity record values,
 * other employees' run snapshots, storage keys or file bytes enter the basis. */
export async function readCloseoutBasis(db:D1Database,user:WorkspaceUser,caseId:string):Promise<CloseoutBasisResult>{
 requireCloseout(user);
 const queries=[
  db.prepare(`SELECT c.id,c.person_id,c.employment_id,c.employee_user_id,c.ended_on,c.state,c.version,
   p.employee_code,p.legal_name,p.user_id,r.revision AS source_revision,
   e.legal_entity,e.status AS employment_status,e.started_on,e.ended_on AS employment_ended_on,e.location,e.department,e.job_title,e.manager_user_id
   FROM hrm_offboarding_cases c JOIN hrm_closeout_sources r ON r.case_id=c.id JOIN hrm_people p ON p.id=c.person_id JOIN hrm_employments e ON e.id=c.employment_id WHERE c.id=?`).bind(caseId),
  db.prepare(`SELECT id,kind,state,version,effective_from,effective_to,verified_by,verified_at FROM hrm_records WHERE person_id=${personScope} AND kind IN ('identity','bank','tax','dependent') ORDER BY id LIMIT ${ROW_LIMIT+1}`).bind(caseId),
  db.prepare(`SELECT id,kind,state,version,record_id FROM hrm_change_requests WHERE person_id=${personScope} AND kind IN ('identity','bank','tax','dependent') ORDER BY id LIMIT ${ROW_LIMIT+1}`).bind(caseId),
  db.prepare(`SELECT rp.id AS run_person_id,rp.employee_code_snapshot,rp.person_id,rp.employment_id,rp.gross_minor,rp.deductions_minor,rp.net_minor,r.id,r.state,r.version,r.input_revision,r.period_id,r.starts_on,r.ends_on,r.policy_version_id,r.adjustment_of_payslip_id,r.snapshot_checksum,
   json_extract(r.snapshot_json,'$.time_snapshot_checksum') AS issued_time_checksum,p.state AS time_state,p.snapshot_checksum AS current_time_checksum,
   policy.legal_entity,policy.currency,policy.minor_unit_scale
   FROM hrm_payroll_run_people rp JOIN hrm_payroll_runs r ON r.id=rp.run_id JOIN hrm_time_periods p ON p.id=r.period_id JOIN hrm_payroll_policy_versions policy ON policy.id=r.policy_version_id
   WHERE rp.employment_id=${employmentScope} ORDER BY r.id LIMIT ${ROW_LIMIT+1}`).bind(caseId),
  db.prepare(`SELECT COUNT(*) AS row_count,COALESCE(SUM(length(CAST(s.snapshot_json AS BLOB))),0) AS snapshot_bytes ${slipFrom}`).bind(caseId),
  db.prepare(`SELECT s.id,s.run_id,s.run_person_id,s.person_id,s.supersedes_payslip_id,s.state,s.snapshot_json,s.snapshot_checksum,s.issued_at ${slipFrom}
   AND (SELECT COALESCE(SUM(length(CAST(s.snapshot_json AS BLOB))),0) ${slipFrom})<=? ORDER BY s.id LIMIT ${ROW_LIMIT+1}`).bind(caseId,caseId,BYTE_LIMIT),
  db.prepare(`SELECT pay.id,pay.payslip_id,pay.amount_minor,pay.paid_on,pay.payment_reference,pay.evidence_reference,pay.confirmed_by,pay.confirmed_at FROM hrm_payroll_payments pay JOIN hrm_payslips s ON s.id=pay.payslip_id JOIN hrm_payroll_run_people rp ON rp.id=s.run_person_id WHERE rp.employment_id=${employmentScope} ORDER BY pay.id LIMIT ${ROW_LIMIT+1}`).bind(caseId),
  db.prepare(`SELECT d.id,d.payslip_id,d.person_id,d.state,d.version FROM hrm_payroll_disputes d JOIN hrm_payslips s ON s.id=d.payslip_id JOIN hrm_payroll_run_people rp ON rp.id=s.run_person_id WHERE rp.employment_id=${employmentScope} ORDER BY d.id LIMIT ${ROW_LIMIT+1}`).bind(caseId),
  db.prepare(`SELECT id,period_id,work_date,shift_key,state,version,planned_minutes,worked_minutes,overtime_minutes,overtime_state FROM hrm_time_entries WHERE employment_id=${employmentScope} ORDER BY id LIMIT ${ROW_LIMIT+1}`).bind(caseId),
  db.prepare(`SELECT a.id,a.entry_id,a.state,a.version FROM hrm_time_adjustments a JOIN hrm_time_entries t ON t.id=a.entry_id WHERE t.employment_id=${employmentScope} ORDER BY a.id LIMIT ${ROW_LIMIT+1}`).bind(caseId),
  db.prepare(`SELECT id,state,version,assignment_id,policy_version_id,leave_type_key,starts_on,ends_on,requested_minutes FROM hrm_leave_requests WHERE employment_id=${employmentScope} ORDER BY id LIMIT ${ROW_LIMIT+1}`).bind(caseId),
  db.prepare(`SELECT id,assignment_id,policy_version_id,leave_type_key,event_kind,minutes,period_key,reference_id,created_at FROM hrm_leave_ledger WHERE employment_id=${employmentScope} ORDER BY id LIMIT ${ROW_LIMIT+1}`).bind(caseId),
 ];
 const results=await db.batch<Row>(queries),collections=results.map(result=>result.results??[]),context=collections[0][0];
 if(!context)throw new HrmError("not_found",404);
 if(!integer(context.source_revision)||Number(context.source_revision)<1)throw new HrmError("closeout_source_invalid",409);
 if(collections.some(rows=>rows.length>ROW_LIMIT)||Number(collections[4][0]?.row_count??0)>ROW_LIMIT||Number(collections[4][0]?.snapshot_bytes??0)>BYTE_LIMIT)throw new HrmError("closeout_source_limit",409);
 const basis:CloseoutBasis={version:1,case:{id:caseId,person_id:String(context.person_id),employment_id:String(context.employment_id),employee_user_id:context.employee_user_id as string|null,ended_on:String(context.ended_on)},identity:{employee_code:String(context.employee_code),legal_name:String(context.legal_name),user_id:context.user_id as string|null},employment:{legal_entity:context.legal_entity,status:context.employment_status,started_on:context.started_on,ended_on:context.employment_ended_on,location:context.location,department:context.department,job_title:context.job_title,manager_user_id:context.manager_user_id},source_revision:Number(context.source_revision),records:collections[1],profile_changes:collections[2],payroll_runs:collections[3],payslips:collections[5],payments:collections[6],disputes:collections[7],time_entries:collections[8],time_adjustments:collections[9],leave_requests:collections[10],leave_ledger:collections[11]};
 const blockers=new Set<string>(),hasPayroll=basis.payroll_runs.length>0;
 if(context.employee_user_id!==context.user_id||context.employment_status!=="ended"||context.employment_ended_on!==context.ended_on)blockers.add("identity_mismatch");
 if(!hasPayroll)blockers.add("no_payroll_recorded");
 if(basis.profile_changes.some(row=>row.state==="submitted"))blockers.add("profile_change_pending");
 if(basis.disputes.some(row=>row.state!=="resolved"))blockers.add("claim_unresolved");
 if(basis.time_adjustments.some(row=>row.state==="pending_approval")||basis.time_entries.some(row=>row.state==="submitted"||row.overtime_state==="pending_approval"))blockers.add("time_review_pending");
 if(basis.leave_requests.some(row=>row.state==="pending_approval"||row.state==="cancellation_requested"))blockers.add("leave_review_pending");
 const liabilityRuns=new Map<unknown,Row>();
 const byId=new Map(basis.payslips.map(s=>[s.id,s])),children=new Map<unknown,Row[]>(),snapshots=new Map<unknown,Row>();
 for(const slip of basis.payslips){
  if(slip.person_id!==basis.case.person_id)blockers.add("identity_mismatch");
  if(slip.supersedes_payslip_id){const siblings=children.get(slip.supersedes_payslip_id)??[];siblings.push(slip);children.set(slip.supersedes_payslip_id,siblings);if(!byId.has(slip.supersedes_payslip_id))blockers.add("correction_chain_invalid")}
  const json=String(slip.snapshot_json);if(await digest(json)!==slip.snapshot_checksum)blockers.add("issued_checksum_invalid");
  let parsed:Row|null=null;try{parsed=object(JSON.parse(json))}catch{/* Unknown source remains a blocker. */}
  if(!parsed){blockers.add("issued_amount_unknown");continue}snapshots.set(slip.id,parsed);if(!validIssued(parsed))blockers.add("issued_snapshot_invalid");
  const policy=object(parsed.policy);if(policy?.legal_entity!==basis.employment.legal_entity)blockers.add("entity_mismatch");
 }
 for(const run of basis.payroll_runs){
  if(run.person_id!==basis.case.person_id||run.employment_id!==basis.case.employment_id)blockers.add("identity_mismatch");
  if(run.legal_entity!==basis.employment.legal_entity)blockers.add("entity_mismatch");
  if(run.state!=="closed")blockers.add("payroll_run_open");
  const roots=basis.payslips.filter(s=>s.run_person_id===run.run_person_id&&s.run_id===run.id);if(roots.length!==1){blockers.add("issued_payslip_missing");continue}
  const issued=snapshots.get(roots[0].id);
  if(!issued||!integer(run.net_minor)||!integer(run.gross_minor)||!integer(run.deductions_minor)||run.net_minor!==issued.net_minor||run.gross_minor!==issued.gross_minor||run.deductions_minor!==issued.deductions_minor)blockers.add("payroll_amounts_unknown");
  if(issued&&(issued.employee_code!==run.employee_code_snapshot||roots[0].supersedes_payslip_id!==run.adjustment_of_payslip_id||issued.correction_of_payslip_id!==run.adjustment_of_payslip_id))blockers.add("correction_chain_invalid");
  let leaf=roots[0];const visited=new Set<unknown>();
  while(children.has(leaf.id)){
   if(visited.has(leaf.id)||children.get(leaf.id)!.length!==1){blockers.add("correction_chain_invalid");break}visited.add(leaf.id);leaf=children.get(leaf.id)![0];
  }
  if(leaf.state!=="published"||visited.has(leaf.id))blockers.add("correction_chain_invalid");
  const liabilityRun=basis.payroll_runs.find(r=>r.id===leaf.run_id);if(!liabilityRun)blockers.add("correction_chain_invalid");else{
   liabilityRuns.set(liabilityRun.id,liabilityRun);
   if(liabilityRun.time_state!=="locked"||!liabilityRun.current_time_checksum||liabilityRun.current_time_checksum!==liabilityRun.issued_time_checksum)blockers.add("time_source_changed");
  }
  const snapshot=snapshots.get(leaf.id),net=snapshot?.net_minor,carry=snapshot?.paid_carryover_minor===undefined?0:snapshot.paid_carryover_minor;
  if(!integer(net)||!integer(carry)){blockers.add("issued_amount_unknown");continue}
  let expectedCarry=0n,parent=leaf.supersedes_payslip_id;const ancestors=new Set<unknown>();
  while(parent){
   if(ancestors.has(parent)||!byId.has(parent)){blockers.add("correction_chain_invalid");break}ancestors.add(parent);
   const ancestor=byId.get(parent)!;
   for(const payment of basis.payments.filter(p=>p.payslip_id===ancestor.id)){if(!integer(payment.amount_minor)||payment.amount_minor===0)blockers.add("payment_invalid");else expectedCarry+=BigInt(payment.amount_minor as number)}
   parent=ancestor.supersedes_payslip_id;
  }
  if(expectedCarry!==BigInt(carry as number))blockers.add("carryover_unreconciled");
  let paid=BigInt(carry as number);for(const payment of basis.payments.filter(p=>p.payslip_id===leaf.id)){if(!integer(payment.amount_minor)||payment.amount_minor===0){blockers.add("payment_invalid");continue}paid+=BigInt(payment.amount_minor as number)}
  if(paid<BigInt(net as number))blockers.add("underpaid");if(paid>BigInt(net as number))blockers.add("overpaid");
 }
 if(hasPayroll&&![...liabilityRuns.values()].some(run=>run.state==="closed"&&String(run.starts_on)<=basis.case.ended_on&&String(run.ends_on)>=basis.case.ended_on))blockers.add("final_period_missing");
 const checksum=await digest(JSON.stringify(basis));await audit(db,user,"closeout_basis_read",basis.case.person_id,caseId,{source_revision:basis.source_revision,blocker_count:blockers.size});
 return {basis,checksum,caseState:String(context.state),caseVersion:Number(context.version),blockers:[...blockers].sort(),hasPayroll};
}
