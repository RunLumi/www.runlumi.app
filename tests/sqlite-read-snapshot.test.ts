import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { withSqliteReadSnapshot } from "./support/sqlite-read-snapshot.ts";

test("snapshot reader tolerates an independently held writer lock without replaying checks",{timeout:10000},async()=>{
 const directory=mkdtempSync(join(tmpdir(),"runlumi-read-lock-")),file=join(directory,"facts.sqlite");let writer:ReturnType<typeof spawn>|undefined;
 try{
  const seed=new DatabaseSync(file);seed.exec("CREATE TABLE facts(amount INTEGER);INSERT INTO facts VALUES(1)");seed.close();
  const code=`import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1]);db.exec('BEGIN EXCLUSIVE;UPDATE facts SET amount=7');process.on('message',()=>setTimeout(()=>{db.exec('COMMIT');db.close();process.disconnect()},300));process.send('locked');`;
  writer=spawn(process.execPath,["--input-type=module","-e",code,file],{stdio:["ignore","ignore","ignore","ipc"]});
  const exited=once(writer,"exit");assert.deepEqual(await once(writer,"message"),["locked",undefined]);
  const immediate=new DatabaseSync(file,{readOnly:true});immediate.exec("PRAGMA busy_timeout=0");
  try{assert.throws(()=>immediate.prepare("SELECT amount FROM facts").get(),(error:unknown)=>typeof error==="object"&&error!==null&&"errcode" in error&&error.errcode===5)}finally{immediate.close()}
  await new Promise<void>((resolve,reject)=>writer!.send("release",error=>error?reject(error):resolve()));
  let calls=0;const result=await withSqliteReadSnapshot(file,db=>{calls++;return db.prepare("SELECT amount FROM facts").get()});
  assert.equal(result?.amount,7);assert.equal(calls,1,"a successful read callback is never replayed");assert.equal((await exited)[0],0);
 }finally{if(writer?.exitCode===null)writer.kill("SIGTERM");rmSync(directory,{recursive:true,force:true})}
});

test("one read snapshot is consistent and a fresh snapshot still detects source changes",async()=>{
 const directory=mkdtempSync(join(tmpdir(),"runlumi-read-view-")),file=join(directory,"facts.sqlite"),writer=new DatabaseSync(file);
 try{
  writer.exec("PRAGMA journal_mode=WAL;CREATE TABLE first(amount INTEGER);CREATE TABLE second(amount INTEGER);INSERT INTO first VALUES(1);INSERT INTO second VALUES(1)");
  const before=await withSqliteReadSnapshot(file,db=>{
   const first=db.prepare("SELECT amount FROM first").get()?.amount;
   writer.exec("BEGIN;UPDATE first SET amount=2;UPDATE second SET amount=2;COMMIT");
   return [first,db.prepare("SELECT amount FROM second").get()?.amount];
  });
  assert.deepEqual(before,[1,1],"hashes across tables must use one committed view");
  const after=await withSqliteReadSnapshot(file,db=>[db.prepare("SELECT amount FROM first").get()?.amount,db.prepare("SELECT amount FROM second").get()?.amount]);
  assert.deepEqual(after,[2,2]);assert.notDeepEqual(after,before,"the final unchanged check cannot reuse the pre-restore snapshot");
 }finally{writer.close();rmSync(directory,{recursive:true,force:true})}
});

test("reader propagates callback failures and releases the read transaction",async()=>{
 const directory=mkdtempSync(join(tmpdir(),"runlumi-read-error-")),file=join(directory,"facts.sqlite"),writer=new DatabaseSync(file);
 try{
  writer.exec("CREATE TABLE facts(amount INTEGER);INSERT INTO facts VALUES(1)");
  const failure=new Error("TEST manifest failure");await assert.rejects(withSqliteReadSnapshot(file,db=>{db.prepare("SELECT amount FROM facts").get();throw failure}),error=>error===failure);
  assert.doesNotThrow(()=>writer.exec("BEGIN EXCLUSIVE;UPDATE facts SET amount=2;COMMIT"),"failed snapshot reads must release locks");
 }finally{writer.close();rmSync(directory,{recursive:true,force:true})}
});
