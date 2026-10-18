import test from "node:test";
import assert from "node:assert/strict";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { closeoutFixture } from "./support/hrm-closeout-fixture.ts";
import { RETENTION_CATEGORIES, activateRetentionPolicy, createFileDeletionRequest, createRetentionPolicy, executeFileDeletion, reviewFileDeletion, reviewRetentionPolicy } from "../src/lib/hrm/retention.ts";

async function fixture(){
 const f=closeoutFixture(),originalNow=Date.now;
 const actor=(id:string,admin=false)=>({...makeUser({id,name:id,email:id+"@example.test"},admin,["hrm_admin"]),hrmEnabled:true});
 const requester=actor("TEST-requester"),reviewer=actor("TEST-reviewer"),executor=actor("TEST-executor",true);
 try{
  const policy=await createRetentionPolicy(f.db,requester,"TEST-policy-create",JSON.stringify(RETENTION_CATEGORIES.map(category=>({category,retention_days:1,basis:"TEST synthetic policy; no production duration"}))));
  await reviewRetentionPolicy(f.db,reviewer,"TEST-policy-review",policy,1,true,"TEST independent policy review");
  await activateRetentionPolicy(f.db,executor,"TEST-policy-activate",policy,2);
  // Simulate due eligibility without rewriting the immutable file timestamp.
  Date.now=()=>originalNow()+3*86400000;
  const requestId=await createFileDeletionRequest(f.db,requester,"TEST-delete-request","hrm_legal_files","source-file","TEST due source disposal");
  await reviewFileDeletion(f.db,reviewer,"TEST-delete-review",requestId,1,true,"TEST independent deletion review");
  const objects=new Set(["hrm/legal/TEST-closeout-source.docx"]);let deleteCalls=0;
  const bucket={async delete(key:string){deleteCalls++;objects.delete(key)}} as unknown as R2Bucket;
  const request=()=>f.db.raw.prepare("SELECT * FROM hrm_file_deletion_requests WHERE id=?").get(requestId)!;
  return {...f,actor,requester,reviewer,executor,requestId,request,bucket,objects,deleteCalls:()=>deleteCalls,
   close(){Date.now=originalNow;f.close()}};
 }catch(error){Date.now=originalNow;f.close();throw error}
}

test("a requester or reviewer promoted to System Admin cannot touch R2 on an approved or resumed deletion",async()=>{
 for(const identity of ["requester","reviewer"] as const)for(const state of ["approved","deleting","retryable"]){
  const f=await fixture();try{
   if(state!=="approved")f.db.raw.prepare("UPDATE hrm_file_deletion_requests SET state=?,version=version+1 WHERE id=?").run(state,f.requestId);
   const before={...f.request()},promoted=f.actor(f[identity].id,true);
   await assert.rejects(executeFileDeletion(f.db,f.bucket,promoted,"TEST-delete-execute",f.requestId,Number(before.version)),{message:"retention_executor_must_differ"});
   assert.equal(f.deleteCalls(),0,"independence is enforced before the irreversible R2 call");
   assert.equal(f.objects.size,1);assert.deepEqual({...f.request()},before,"denial cannot reserve, complete or make the request retryable");
   assert.equal(f.db.raw.prepare("SELECT object_deleted_at FROM hrm_legal_files WHERE id='source-file'").get()!.object_deleted_at,null);
   assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM hrm_commands WHERE operation='file_deletion_start'").get()!.n,0);
  }finally{f.close()}
 }
});

test("an independent System Admin still executes due, independently reviewed deletion once",async()=>{
 const f=await fixture();try{
  await executeFileDeletion(f.db,f.bucket,f.executor,"TEST-delete-execute",f.requestId,Number(f.request().version));
  assert.equal(f.deleteCalls(),1);assert.equal(f.objects.size,0);assert.equal(f.request().state,"completed");
  assert.equal(f.request().completed_by,f.executor.id);assert.ok(Number.isFinite(Date.parse(String(f.request().completed_at))));
  assert.ok(f.db.raw.prepare("SELECT object_deleted_at FROM hrm_legal_files WHERE id='source-file'").get()!.object_deleted_at);
  await assert.rejects(executeFileDeletion(f.db,f.bucket,f.executor,"TEST-delete-repeat-key",f.requestId,Number(f.request().version)),{message:"invalid_transition"});
  assert.equal(f.deleteCalls(),1);
 }finally{f.close()}
});
