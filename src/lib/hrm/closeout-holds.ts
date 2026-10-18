import type { Permission, WorkspaceUser } from "../workspace/roles";
import { HrmError } from "./fields";
import { requireCloseout } from "./closeout-basis";
import { command, digest, guardBoolean, id, now, settings } from "./service";
import { reportAccount, reportAuthority } from "./report-governance";

export interface CloseoutFileHold {
 id:string;case_id:string;file_id:string;state:"active"|"released";reason:string;
 placed_by:string;placed_at:string;released_by:string|null;released_at:string|null;release_reason:string|null;version:number;
}
const reference=(value:string)=>{if(!/^[A-Za-z0-9_-]{1,120}$/.test(value))throw new HrmError("closeout_invalid",400);return value};
const reasonText=(value:string)=>{const reason=value.trim();if(!reason||reason.length>1000||/[\u0000-\u001f\u007f]/u.test(reason))throw new HrmError("reason_required",400);return reason};
const revision=(value:number)=>{if(!Number.isSafeInteger(value)||value<1)throw new HrmError("closeout_invalid",400);return value};
async function actor(db:D1Database,content:D1Database,user:WorkspaceUser,permission:Permission){
 requireCloseout(user);if(!user.can(permission))throw new HrmError("forbidden",403);
 const current=await reportAccount(db,content,user.id,permission);
 if(!current.can("hrm.payroll.approve")||!current.can("hrm.offboarding.manage"))throw new HrmError("closeout_account_unavailable",409);
 return current;
}
async function replay(db:D1Database,user:WorkspaceUser,key:string,operation:string,payload:unknown){
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new HrmError("invalid_request_key",400);
 const existing=await db.prepare("SELECT operation,payload_hash,result_id FROM hrm_commands WHERE actor_id=? AND request_key=?").bind(user.id,key).first<{operation:string;payload_hash:string;result_id:string}>();
 if(!existing)return null;
 if(existing.operation!==operation||existing.payload_hash!==await digest(JSON.stringify(payload)))throw new HrmError("request_key_conflict",409);
 return existing.result_id;
}
async function scope(db:D1Database,user:WorkspaceUser,caseId:string,fileId:string){
 const file=await db.prepare(`SELECT f.version,f.object_deleted_at,f.disposition_state,c.employee_user_id,p.user_id AS current_user_id,e.legal_entity
 FROM hrm_closeout_files f JOIN hrm_offboarding_cases c ON c.id=f.case_id JOIN hrm_people p ON p.id=c.person_id JOIN hrm_employments e ON e.id=c.employment_id
 WHERE f.id=? AND f.case_id=?`).bind(fileId,caseId).first<{version:number;object_deleted_at:string|null;disposition_state:string;employee_user_id:string|null;current_user_id:string|null;legal_entity:string}>();
 if(!file)throw new HrmError("not_found",404);if(file.employee_user_id===user.id||file.current_user_id===user.id)throw new HrmError("self_approval",403);
 if(file.object_deleted_at||["deleting","completed"].includes(file.disposition_state))throw new HrmError("closeout_hold_unavailable",409);
 const config=await settings(db);
 const guards=[guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_settings WHERE id=1 AND enabled=1 AND reviewed_by IS NOT NULL AND legal_entity=? AND version=?)",[file.legal_entity,config.version]),
  guardBoolean(db,`EXISTS(SELECT 1 FROM hrm_closeout_files f JOIN hrm_offboarding_cases c ON c.id=f.case_id JOIN hrm_people p ON p.id=c.person_id JOIN hrm_employments e ON e.id=c.employment_id
   WHERE f.id=? AND f.case_id=? AND f.version=? AND f.object_deleted_at IS NULL AND f.disposition_state NOT IN ('deleting','completed') AND c.employee_user_id IS NOT ? AND p.user_id IS NOT ? AND e.legal_entity=?)`,[fileId,caseId,file.version,user.id,user.id,file.legal_entity])];
 return {file,guards};
}
export async function placeCloseoutFileHold(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,input:{caseId:string;fileId:string;version:number;reason:string}):Promise<string>{
 const payload={caseId:reference(input.caseId),fileId:reference(input.fileId),version:revision(input.version),reason:reasonText(input.reason)};
 let current=await actor(db,content,user,"hrm.legalhold.manage");
 const existing=await replay(db,current,key,"closeout_file_hold_place",payload);if(existing)return existing;
 const {file,guards}=await scope(db,current,payload.caseId,payload.fileId);
 if(file.version!==payload.version)throw new HrmError("conflict",409);
 // Use the re-resolved identity for mutation guards, including a possible admin demotion.
 current=await actor(db,content,user,"hrm.legalhold.manage");
 const holdId=id("closeout_hold"),time=now();
 await command(db,current,key,"closeout_file_hold_place",payload,holdId,[...guards,...reportAuthority(db,current,"hrm.legalhold.manage"),...reportAuthority(db,current,"hrm.payroll.approve"),...reportAuthority(db,current,"hrm.offboarding.manage"),
  guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_closeout_files WHERE id=? AND case_id=? AND version=?)",[payload.fileId,payload.caseId,payload.version]),
  guardBoolean(db,"NOT EXISTS(SELECT 1 FROM hrm_closeout_file_holds WHERE file_id=? AND state='active')",[payload.fileId])],[
  db.prepare("INSERT INTO hrm_closeout_file_holds(id,case_id,file_id,reason,placed_by,placed_at) VALUES(?,?,?,?,?,?)").bind(holdId,payload.caseId,payload.fileId,payload.reason,current.id,time),
 ]);
 return holdId;
}
export async function releaseCloseoutFileHold(db:D1Database,content:D1Database,user:WorkspaceUser,key:string,input:{caseId:string;holdId:string;version:number;reason:string}):Promise<void>{
 const payload={caseId:reference(input.caseId),holdId:reference(input.holdId),version:revision(input.version),reason:reasonText(input.reason)};
 let current=await actor(db,content,user,"hrm.retention.review");
 if(await replay(db,current,key,"closeout_file_hold_release",payload))return;
 const hold=await db.prepare("SELECT * FROM hrm_closeout_file_holds WHERE id=? AND case_id=?").bind(payload.holdId,payload.caseId).first<CloseoutFileHold>();
 if(!hold)throw new HrmError("not_found",404);if(hold.placed_by===user.id)throw new HrmError("self_approval",403);
 if(hold.state!=="active"||hold.version!==payload.version)throw new HrmError("conflict",409);
 const {guards}=await scope(db,current,payload.caseId,hold.file_id);
 current=await actor(db,content,user,"hrm.retention.review");
 const time=now();
 await command(db,current,key,"closeout_file_hold_release",payload,hold.id,[...guards,...reportAuthority(db,current,"hrm.retention.review"),...reportAuthority(db,current,"hrm.payroll.approve"),...reportAuthority(db,current,"hrm.offboarding.manage"),
  guardBoolean(db,"EXISTS(SELECT 1 FROM hrm_closeout_file_holds WHERE id=? AND case_id=? AND version=? AND state='active' AND placed_by!=?)",[hold.id,payload.caseId,payload.version,current.id])],[
  db.prepare("UPDATE hrm_closeout_file_holds SET state='released',released_by=?,released_at=?,release_reason=?,version=version+1 WHERE id=? AND state='active' AND version=?").bind(current.id,time,payload.reason,hold.id,payload.version),
 ]);
}
