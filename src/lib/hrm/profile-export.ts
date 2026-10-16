import type { WorkspaceUser } from "../workspace/roles";
import { HrmError } from "./fields";
import { audit, guard, id, localDate, now, own, personFor, requirePermission } from "./service";

const ROW_LIMIT=5000;
const BYTE_LIMIT=5*1024*1024;

interface ExportRow { [key:string]:unknown }
interface JsonExportRow extends ExportRow {data:unknown}
interface RecordRow extends JsonExportRow {id:string}
interface HistoryRow extends JsonExportRow {record_id:string}
interface ChangeRow extends JsonExportRow {record_id:string}
interface FileRow extends ExportRow {record_id:string|null}
export interface HrmProfileExportResult {body:string;contentBytes:number;personId:string}
function parseData<T extends JsonExportRow>(row:T):Omit<T,"data">&{data:unknown}{
 let data:unknown;try{data=JSON.parse(String(row.data))}catch{throw new HrmError("profile_export_invalid_record",409)}
 const metadata={...row};delete metadata.data;return {...metadata,data} as Omit<T,"data">&{data:unknown};
}

/** A bounded, self-only snapshot. File bytes and other HRM modules stay on their existing routes. */
export async function exportOwnHrmProfile(db:D1Database,user:WorkspaceUser):Promise<HrmProfileExportResult>{
 requirePermission(user,"hrm.profile.self");
 if(user.hrmEnabled!==true)throw new HrmError("hrm_closed",503);
 const person=await personFor(db,user);
 if(!own(person,user))throw new HrmError("not_found",404);
 let batch:D1Result<unknown>[];
 try{batch=await db.batch([
  guard(db,"EXISTS(SELECT 1 FROM hrm_people p JOIN hrm_employments e ON e.person_id=p.id WHERE p.id=? AND p.user_id=? AND p.version=? AND e.id=? AND e.version=? AND e.status!='ended' AND (e.ended_on IS NULL OR e.ended_on>?))",[person.id,user.id,person.profile_version,person.employment_id,person.version,localDate()]),
  db.prepare(`SELECT legal_entity,work_email,work_phone,department,job_title,location,status,started_on,ended_on,created_at,updated_at,version,
      CASE WHEN id=? THEN 1 ELSE 0 END AS is_current
    FROM hrm_employments WHERE person_id=? ORDER BY started_on,created_at LIMIT ?`).bind(person.employment_id,person.id,ROW_LIMIT+1),
  db.prepare(`SELECT id,kind,data,state,effective_from,effective_to,version,verified_at,created_at,updated_at
    FROM hrm_records WHERE person_id=? ORDER BY kind,created_at,id LIMIT ?`).bind(person.id,ROW_LIMIT+1),
  db.prepare(`SELECT h.record_id,r.kind,h.version,h.data,h.state,h.effective_from,h.effective_to,h.created_at
    FROM hrm_record_history h JOIN hrm_records r ON r.id=h.record_id
    WHERE r.person_id=? ORDER BY r.kind,h.created_at,h.version LIMIT ?`).bind(person.id,ROW_LIMIT+1),
  db.prepare(`SELECT record_id,kind,expected_version,data,effective_from,effective_to,state,version,created_at,updated_at
    FROM hrm_change_requests WHERE person_id=? ORDER BY created_at,kind LIMIT ?`).bind(person.id,ROW_LIMIT+1),
  db.prepare(`SELECT record_id,kind AS file_kind,original_name,mime_type,size_bytes,checksum,state,expires_on,created_at,
      CASE WHEN object_deleted_at IS NULL THEN 1 ELSE 0 END AS object_available
    FROM hrm_files WHERE person_id=? AND kind IN ('avatar','identity','dependent','bank','tax','personal')
    ORDER BY created_at,kind,original_name LIMIT ?`).bind(person.id,ROW_LIMIT+1),
  db.prepare("DELETE FROM hrm_write_guards"),
 ])}catch(error){if(error instanceof Error&&/CHECK constraint failed/.test(error.message))throw new HrmError("conflict",409);throw error}
 const employmentPeriods=batch[1]?.results as ExportRow[]??[],records=batch[2]?.results as RecordRow[]??[],recordHistory=batch[3]?.results as HistoryRow[]??[],changeRequests=batch[4]?.results as ChangeRow[]??[],files=batch[5]?.results as FileRow[]??[];
 for(const collection of [employmentPeriods,records,recordHistory,changeRequests,files])if(collection.length>ROW_LIMIT)throw new HrmError("profile_export_too_large",413);
 const recordIds=[...new Set([...records.map(row=>row.id),...recordHistory.map(row=>row.record_id),...changeRequests.map(row=>row.record_id),...files.flatMap(row=>row.record_id?[row.record_id]:[])])];
 const recordRefs=new Map(recordIds.map((recordId,index)=>[recordId,`record-${index+1}`]));
 const recordData=records.map(row=>{const {id:recordId,...value}=row;return {...parseData(value),record_ref:recordRefs.get(recordId)}});
 const historyData=recordHistory.map(row=>{const {record_id:recordId,...value}=row;return {...parseData(value),record_ref:recordRefs.get(recordId)}});
 const changeData=changeRequests.map(row=>{const {record_id:recordId,...value}=row;return {...parseData(value),record_ref:recordRefs.get(recordId)}});
 const fileData=files.map(row=>{const {record_id:recordId,...value}=row;return {...value,record_ref:recordId?recordRefs.get(recordId)??null:null,object_available:Boolean(value.object_available)}});
 const createdAt=now();
 const bundle={
  schema_version:1,
  export_scope:"self_profile_snapshot",
  exported_at:createdAt,
  included:["profile_identity","employment_periods","structured_profile_records","record_revision_history","profile_change_requests","profile_file_metadata"],
  excluded:["file_contents","internal_review_notes","reviewer_identity","legal_documents","coi","onboarding","attendance","leave","payroll","hr_requests","assets","benefits","training","other_people","audit_log"],
  profile:{employee_code:person.employee_code,legal_name:person.legal_name,preferred_name:person.preferred_name},
  employment_periods:employmentPeriods,
  records:recordData,
  record_history:historyData,
  change_requests:changeData,
  profile_files:fileData,
 };
 const body=JSON.stringify(bundle,null,2),contentBytes=new TextEncoder().encode(body).byteLength;
 if(contentBytes>BYTE_LIMIT)throw new HrmError("profile_export_too_large",413);
 const exportId=id("profile_export");
 await audit(db,user,"employee_profile_exported",person.id,exportId,{scope:"self_profile_snapshot",employment_period_count:employmentPeriods.length,record_count:recordData.length,history_count:historyData.length,change_request_count:changeData.length,file_metadata_count:files.length,content_bytes:contentBytes});
 return {body,contentBytes,personId:person.id};
}
