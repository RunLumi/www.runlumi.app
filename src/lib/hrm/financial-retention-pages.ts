import type { WorkspaceUser } from "../workspace/roles";
import { HrmError } from "./fields";
import { localDate, settings } from "./service";
import { readFinancialControl, type FinancialControlTarget } from "./financial-control";
import { closeoutDossierControlTarget, closeoutFileControlTarget, type CloseoutDossier, type CloseoutFile } from "./closeout-dossiers";
import type { FinancialDispositionRequest } from "./financial-disposition";
import { listFinancialRetentionPolicies, type FinancialRetentionPolicy } from "./financial-retention-policies";

export async function financialRetentionPanel(db: D1Database, content: D1Database, bucket: R2Bucket, user: WorkspaceUser, url: URL) {
  // Do not even load financial policy/source metadata for a general HR reviewer.
  if (!user.can("hrm.payroll.approve") || !user.can("hrm.offboarding.manage")) return null;
  const afterText = url.searchParams.get("financial_after") ?? "", search = (url.searchParams.get("financial_source") ?? "").trim();
  let after: { policyKey: string; revision: number } | undefined;
  if (afterText) {
    const match = /^([A-Z][A-Z0-9_-]{1,79}):([1-9][0-9]{0,8})$/.exec(afterText);
    if (!match) throw new HrmError("invalid_field", 400);
    after = { policyKey: match[1], revision: Number(match[2]) };
  }
  if (search.length > 100 || /[\u0000-\u001f\u007f]/u.test(search)) throw new HrmError("invalid_field", 400);
  const [page, config] = await Promise.all([listFinancialRetentionPolicies(db, content, user, after), settings(db)]);
  const pattern = `%${search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const sources = (await db.prepare(`SELECT v.id,v.version_number,v.source_checksum,f.id AS file_id,t.title_en,t.title_vi
    FROM hrm_legal_template_versions v JOIN hrm_legal_templates t ON t.id=v.template_id JOIN hrm_legal_files f ON f.id=v.source_file_id
    WHERE v.legal_entity=? AND t.document_type='policy' AND v.state IN ('reviewed','active','retired')
    AND v.reviewed_by IS NOT NULL AND v.reviewed_by!=v.created_by AND f.kind='docx_source' AND f.template_id=v.template_id
    AND f.state='reviewed' AND f.reviewed_by IS NOT NULL AND f.reviewed_by!=f.uploaded_by AND f.checksum=v.source_checksum AND f.object_deleted_at IS NULL
    AND (t.document_key LIKE ? ESCAPE '\\' OR t.title_en LIKE ? ESCAPE '\\' OR t.title_vi LIKE ? ESCAPE '\\')
    AND NOT EXISTS(SELECT 1 FROM hrm_file_deletion_requests r WHERE r.source_table='hrm_legal_files' AND r.source_file_id=f.id AND r.state IN ('pending_review','approved','deleting','retryable','completed'))
    ORDER BY t.document_key,v.version_number DESC LIMIT 51`).bind(config.legal_entity, pattern, pattern, pattern)
    .all<{ id: string; version_number: number; source_checksum: string; file_id: string; title_en: string; title_vi: string }>()).results;
  const reference=(name:string)=>{const value=url.searchParams.get(name)??"";if(value&&!/^[A-Za-z0-9_-]{1,120}$/.test(value))throw new HrmError("invalid_field",400);return value};
  const caseId=reference("financial_case"),caseAfter=reference("financial_cases_after"),targetAfter=(url.searchParams.get("financial_targets_after")??""),requestAfter=reference("financial_requests_after");
  if(targetAfter&&!/^(file|dossier):[A-Za-z0-9_-]{1,120}$/.test(targetAfter))throw new HrmError("invalid_field",400);
  const showRecords=user.hrmEnabled===true&&config.enabled===1;
  if(caseId&&!showRecords)throw new HrmError("hrm_closed",503);
  const caseSearch=(url.searchParams.get("financial_person")??"").trim();if(caseSearch.length>100||/[\u0000-\u001f\u007f]/u.test(caseSearch))throw new HrmError("invalid_field",400);
  const casePattern=`%${caseSearch.replaceAll("\\","\\\\").replaceAll("%","\\%").replaceAll("_","\\_")}%`;
  const cases=showRecords?(await db.prepare(`SELECT c.id,p.employee_code,p.legal_name,c.ended_on,c.state FROM hrm_offboarding_cases c JOIN hrm_people p ON p.id=c.person_id
   JOIN hrm_employments e ON e.id=c.employment_id WHERE e.legal_entity=? AND c.id>? AND c.employee_user_id IS NOT ? AND p.user_id IS NOT ?
   AND (p.employee_code LIKE ? ESCAPE '\\' OR p.legal_name LIKE ? ESCAPE '\\') ORDER BY c.id LIMIT 51`).bind(config.legal_entity,caseAfter,user.id,user.id,casePattern,casePattern)
   .all<{id:string;employee_code:string;legal_name:string;ended_on:string;state:string}>()).results:[];
  const selected=caseId?await db.prepare(`SELECT c.id,c.person_id,c.employment_id,p.employee_code,p.legal_name,c.employee_user_id,p.user_id AS person_user_id
   FROM hrm_offboarding_cases c JOIN hrm_people p ON p.id=c.person_id JOIN hrm_employments e ON e.id=c.employment_id WHERE c.id=? AND e.legal_entity=?`).bind(caseId,config.legal_entity)
   .first<{id:string;person_id:string;employment_id:string;employee_code:string;legal_name:string;employee_user_id:string|null;person_user_id:string|null}>():null;
  if(caseId&&(!selected||selected.employee_user_id===user.id||selected.person_user_id===user.id))throw new HrmError("not_found",404);
  const policySearch=(url.searchParams.get("financial_policy")??"").trim().toUpperCase();
  if(policySearch.length>80||/[\u0000-\u001f\u007f]/u.test(policySearch))throw new HrmError("invalid_field",400);
  const policyPattern=`%${policySearch.replaceAll("\\","\\\\").replaceAll("%","\\%").replaceAll("_","\\_")}%`;
  const activePolicies=selected?(await db.prepare("SELECT * FROM hrm_financial_retention_policy_versions WHERE legal_entity=? AND state='active' AND effective_from<=? AND effective_until>=? AND policy_key LIKE ? ESCAPE '\\' ORDER BY policy_key LIMIT 51").bind(config.legal_entity,localDate(),localDate(),policyPattern).all<FinancialRetentionPolicy>()).results:[];
  const targetRows=selected?(await db.prepare(`SELECT 'file' AS kind,id FROM hrm_closeout_files WHERE case_id=? AND 'file:'||id>? UNION ALL
   SELECT 'dossier' AS kind,id FROM hrm_closeout_dossiers WHERE case_id=? AND 'dossier:'||id>? ORDER BY kind,id LIMIT 51`).bind(caseId,targetAfter,caseId,targetAfter).all<{kind:"file"|"dossier";id:string}>()).results:[];
  const targets=await Promise.all(targetRows.slice(0,50).map(async item=>{
   const row=item.kind==="file"?await db.prepare("SELECT * FROM hrm_closeout_files WHERE id=?").bind(item.id).first<CloseoutFile>():await db.prepare("SELECT * FROM hrm_closeout_dossiers WHERE id=?").bind(item.id).first<CloseoutDossier>();
   if(!row)throw new HrmError("not_found",404);
   const target=item.kind==="file"?closeoutFileControlTarget(row as CloseoutFile,selected!):await closeoutDossierControlTarget(row as CloseoutDossier);
   let control:string="unavailable";try{control=(await readFinancialControl(bucket,target)).value.phase}catch{/* Missing controls never imply available data. */}
   const queued=await db.prepare("SELECT 1 FROM hrm_financial_disposition_requests WHERE case_id=? AND COALESCE(file_id,dossier_id)=? AND target_kind=? AND state IN ('pending_review','approved','deleting','retryable','completed')").bind(caseId,row.id,item.kind).first();
   return {id:row.id,kind:item.kind,version:row.version,state:row.state,control,eligible:control==="live"&&!queued&&(item.kind==="file"?(row as CloseoutFile).object_deleted_at===null&&["none","rejected","blocked"].includes((row as CloseoutFile).disposition_state)&&(row as CloseoutFile).state!=="quarantined":(row as CloseoutDossier).payload_disposition_state==="none")};
  }));
  const requestRows=selected?(await db.prepare("SELECT * FROM hrm_financial_disposition_requests WHERE case_id=? AND id>? ORDER BY id LIMIT 51").bind(caseId,requestAfter).all<FinancialDispositionRequest>()).results:[];
  const requests=await Promise.all(requestRows.slice(0,50).map(async row=>{
   const target:FinancialControlTarget={kind:row.target_kind,id:(row.file_id??row.dossier_id)!,caseId:row.case_id,personId:selected!.person_id,employmentId:selected!.employment_id,checksum:row.control_checksum,sizeBytes:row.target_size_bytes};
   let control:string="unavailable";try{control=(await readFinancialControl(bucket,target)).value.phase}catch{/* An older restored row cannot override current controls. */}
   return {...row,control};
  }));
  const ids = [...new Set([...requests.flatMap(row=>[row.requested_by,row.reviewed_by,row.started_by,row.completed_by]),...page.items.flatMap(row => [row.created_by, row.reviewed_by, row.activated_by])].filter((id): id is string => !!id))];
  const actors = ids.length ? (await content.prepare("SELECT id,name FROM users WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).all<{ id: string; name: string | null }>()).results : [];
  return { policies: page.items, next: page.next, sourceVersions: sources.slice(0, 50), sourcesHaveMore: sources.length > 50,
    cases:cases.slice(0,50),caseSearch,policySearch,selected,activePolicies:activePolicies.slice(0,50),policiesHaveMore:activePolicies.length>50,
    nextCase:cases.length>50?cases[49].id:null,targets,nextTarget:targetRows.length>50?`${targetRows[49].kind}:${targetRows[49].id}`:null,
    requests,nextRequest:requestRows.length>50?requestRows[49].id:null,
    sourceSearch: search, legalEntity: config.legal_entity, actorLabels: Object.fromEntries(actors.map(row => [row.id, row.name])) };
}
export type FinancialRetentionPanel = Awaited<ReturnType<typeof financialRetentionPanel>>;
