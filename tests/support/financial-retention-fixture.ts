import { createHash } from "node:crypto";
import { closeoutFixture } from "./hrm-closeout-fixture.ts";
import { sqliteD1 } from "./d1-sqlite.ts";
import { makeUser } from "../../src/lib/workspace/roles.ts";
import { closeoutDossierControlTarget, closeoutFileControlTarget, type CloseoutDossier } from "../../src/lib/hrm/closeout-dossiers.ts";
import { publishFinancialControl, stageFinancialControl, stageFinancialFilePayload } from "../../src/lib/hrm/financial-control.ts";
import { actOnFinancialRetentionPolicy, createFinancialRetentionPolicy } from "../../src/lib/hrm/financial-retention-policies.ts";

export async function financialRetentionFixture(){
 const f=closeoutFixture(),content=sqliteD1("content");
 const actor=(id:string,admin=false)=>({...makeUser({id,name:id,email:id+"@example.test"},admin,["hrm_admin"]),hrmEnabled:true});
 const author=actor("TEST-author"),reviewer=actor("TEST-reviewer"),executor=actor("TEST-system",true);
 for(const user of [author,reviewer,executor]){
  content.raw.prepare("INSERT INTO users(id,email,name,role) VALUES(?,?,?,?)").run(user.id,user.email,user.name,user.admin?50:30);
  if(!user.admin){
   f.db.raw.prepare("INSERT INTO workspace_members(user_id,enabled,granted_by,created_at,updated_at) VALUES(?,1,'TEST-owner',?,?)").run(user.id,f.time,f.time);
   f.db.raw.prepare("INSERT INTO workspace_roles(user_id,role,granted_by,granted_at) VALUES(?,'hrm_admin','TEST-owner',?)").run(user.id,f.time);
  }
 }
 f.db.raw.prepare("UPDATE hrm_settings SET enabled=1,legal_entity='TEST entity',purpose='TEST only',retention_policy='TEST only',policy_reference='TEST only',reviewed_by='TEST-owner',reviewed_at=? WHERE id=1").run(f.time);
 type Entry={bytes:Uint8Array;metadata:Record<string,string>};
 const objects=new Map<string,Entry>();objects.set("hrm/legal/TEST-closeout-source.docx",{bytes:f.sourceBytes,metadata:{sha256:f.sourceHash}});
 const describe=(key:string,item:Entry)=>({key,size:item.bytes.byteLength,etag:createHash("sha256").update(item.bytes).digest("hex"),customMetadata:{...item.metadata}});
 const bucket={
  async head(key:string){const item=objects.get(key);return item?describe(key,item):null},
  async get(key:string){const item=objects.get(key);return item?{...describe(key,item),body:new Response(item.bytes).body}:null},
  async put(key:string,value:string|ArrayBuffer,options:R2PutOptions={}){
   const old=objects.get(key),condition=options.onlyIf;
   if(condition instanceof Headers){if(condition.get("if-none-match")==="*"&&old)return null}
   else if(condition?.etagMatches!==undefined&&(!old||condition.etagMatches!==describe(key,old).etag))return null;
   const item={bytes:typeof value==="string"?new TextEncoder().encode(value):new Uint8Array(value.slice(0)),metadata:{...options.customMetadata}};objects.set(key,item);return describe(key,item);
  },
  async delete(key:string){objects.delete(key)},
 } as unknown as R2Bucket;
 const file=()=>f.db.raw.prepare("SELECT * FROM hrm_closeout_files WHERE id='proof'").get()!;
 const fileTarget=closeoutFileControlTarget({id:"proof",case_id:f.caseId,checksum:f.hash,size_bytes:f.evidenceBytes.byteLength},{person_id:"person",employment_id:"person-employment"});
 await stageFinancialFilePayload(bucket,fileTarget,"a".repeat(64),author.id,f.evidenceBytes.slice().buffer as ArrayBuffer,async()=>{});await publishFinancialControl(bucket,fileTarget,"a".repeat(64));
 const policyId=await createFinancialRetentionPolicy(f.db,content,bucket,author,"TEST-policy-fixture-create",{policyKey:"TEST-DISPOSITION",titleEn:"TEST rule",titleVi:"TEST quy tắc",purpose:"TEST synthetic only",sourceVersionId:"source-version",effectiveFrom:"2020-01-01",effectiveUntil:"2030-12-31",fileDays:1,fileAnchor:"employment_ended",fileBasis:"TEST one-day synthetic eligibility; no legal period",dossierDays:1,dossierAnchor:"employment_ended",dossierBasis:"TEST synthetic rule"});
 await actOnFinancialRetentionPolicy(f.db,content,bucket,reviewer,"TEST-policy-fixture-review",{policyId,version:1,action:"approve",reason:"TEST independent source review"});
 await actOnFinancialRetentionPolicy(f.db,content,bucket,reviewer,"TEST-policy-fixture-activate",{policyId,version:2,action:"activate",reason:"TEST independent activation"});
 async function dossier(dossierId="TEST-disposition-dossier"){
  f.dossier(dossierId);f.link("proof",dossierId);
  const row=await f.db.prepare("SELECT * FROM hrm_closeout_dossiers WHERE id=?").bind(dossierId).first<CloseoutDossier>();
  const target=await closeoutDossierControlTarget(row!);await stageFinancialControl(bucket,target,"b".repeat(64),author.id);await publishFinancialControl(bucket,target,"b".repeat(64));return row!;
 }
 return {...f,content,author,reviewer,executor,bucket,objects,policyId,file,fileTarget,dossier,close(){f.close();content.raw.close()}};
}
