import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const root=process.cwd();
for(const file of [".env",".env.local",".dev.vars"])if(existsSync(join(root,file)))throw new Error("Refusing HRM integration in a checkout with "+file+"; use a credential-free isolated clone.");
const probe=createServer();
await new Promise((done,reject)=>{probe.once("error",reject);probe.listen(0,"127.0.0.1",done)});
const address=probe.address();
if(!address||typeof address==="string")throw new Error("Could not allocate an isolated local test port.");
const port=address.port;
await new Promise(done=>probe.close(done));
const devVarsPath=join(root,".dev.vars");
const persist=await mkdtemp(join(tmpdir(),"runlumi-integration-"));
const base="http://127.0.0.1:"+port;
const env={...process.env,LUMI_PERSIST_TO:persist,CRM_BASE_URL:base,HRM_LIVE_ENABLED:"true",WRANGLER_SEND_METRICS:"false"};
let worker=null;let localVars=false;let log="";
try{
 const migration=spawnSync(resolve(root,"node_modules/.bin/wrangler"),["d1","migrations","apply","lumi-jobs","--local","--persist-to",persist],{cwd:root,env,encoding:"utf8",stdio:"inherit"});
 if(migration.status!==0)throw new Error("Local isolated D1 migration failed; integration tests did not start.");
 await writeFile(devVarsPath,"HRM_LIVE_ENABLED=true\n",{flag:"wx",mode:0o600});localVars=true;
 worker=spawn(process.execPath,["./node_modules/astro/astro.js","dev","--host","127.0.0.1","--port",String(port)],{cwd:root,env,stdio:["ignore","pipe","pipe"]});
 worker.stdout.setEncoding("utf8");worker.stderr.setEncoding("utf8");
 worker.stdout.on("data",chunk=>{log+=chunk;if(log.length>16000)log=log.slice(-12000)});
 worker.stderr.on("data",chunk=>{log+=chunk;if(log.length>16000)log=log.slice(-12000)});
 let ready=false;const end=Date.now()+90000;
 while(Date.now()<end){
  if(worker.exitCode!==null)throw new Error("Local Worker exited before becoming ready.\n"+log);
  try{const response=await fetch(base+"/jobs");if(response.status<500){ready=true;break}}catch{}
  await new Promise(done=>setTimeout(done,350));
 }
 if(!ready)throw new Error("Local Worker did not become ready within 90 seconds.\n"+log);
 const suites=["tests/integration/hrm.integration.test.mjs","tests/integration/crm.integration.test.mjs","tests/integration/workspace.integration.test.mjs","tests/integration/directory.integration.test.mjs","tests/integration/api.integration.test.mjs","tests/integration/dashboard.integration.test.mjs","tests/integration/files.integration.test.mjs"];
 const result=spawnSync(process.execPath,["--test","--test-concurrency=1",...suites],{cwd:root,env,stdio:"inherit"});
 if(result.status!==0)process.exitCode=result.status??1;
}catch(error){console.error(error);process.exitCode=1}
finally{
 if(worker){worker.kill("SIGTERM");await new Promise(done=>{if(worker.exitCode!==null)return done();const timeout=setTimeout(()=>{worker.kill("SIGKILL");done()},5000);worker.once("exit",()=>{clearTimeout(timeout);done()})})}
 await rm(persist,{recursive:true,force:true});if(localVars)await unlink(devVarsPath).catch(()=>{});
}
