import test from "node:test";
import assert from "node:assert/strict";
import type { APIContext } from "astro";
import { POST } from "../src/pages/api/hrm/closeout.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
const base="https://workspace.example.test";
function context(referrer?:string,role:Parameters<typeof makeUser>[2][number]="hrm_admin"){
 const user={...makeUser({id:"TEST-user",name:"TEST User",email:"test@example.test"},false,[role]),hrmEnabled:true};
 const headers:Record<string,string>={origin:base,"content-type":"application/x-www-form-urlencoded","content-length":String(64*1024+1)};if(referrer)headers.referer=referrer;
 const request=new Request(base+"/api/hrm/closeout",{method:"POST",headers,body:"x=1"});
 // There is deliberately no DB/R2 environment: transport rejection must occur
 // before any state or file access, not by stubbing a business operation.
 return {request,url:new URL(request.url),locals:{workspace:user}} as unknown as APIContext;
}
test("oversized bodies return to the exact same-origin EN/VI case with a visible error",async()=>{
 for(const prefix of ["","/vi"]){const response=await POST(context(base+prefix+"/hrm/offboarding/TEST-case?policy=TEST-policy"));assert.equal(response.status,303);assert.equal(response.headers.get("location"),prefix+"/hrm/offboarding/TEST-case?error=request_too_large");assert.equal(response.headers.get("cache-control"),"private, no-store")}
});
test("absent, external and unrelated referrers never become redirect destinations",async()=>{
 for(const referrer of [undefined,"https://external.example.test/hrm/offboarding/TEST-case",base+"/workspace/users"]){const response=await POST(context(referrer));assert.equal(response.status,413);assert.equal(await response.text(),"request_too_large");assert.equal(response.headers.get("location"),null)}
});
test("HR-only staff are denied before body parsing or environment access",async()=>{
 const response=await POST(context(base+"/hrm/offboarding/TEST-case","hrm_officer"));assert.equal(response.status,403);assert.equal(response.headers.get("cache-control"),"private, no-store");
});
