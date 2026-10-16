import test from "node:test";
import assert from "node:assert/strict";
import { HrmError } from "../src/lib/hrm/fields";
import { makeUser } from "../src/lib/workspace/roles";
import { activateTrainingReminderPolicy, parseTrainingReminderOffsets } from "../src/lib/hrm/training-reminders";

test("training reminder offsets require explicit, unique bounded integers and keep deadline order",()=>{
  assert.deepEqual(parseTrainingReminderOffsets("0, 7, -1, 1"),[7,1,0,-1]);
  assert.deepEqual(parseTrainingReminderOffsets("-365, 365"),[365,-365]);
  for(const invalid of ["","7,,1","01,0","1.5,0","1,1","366","-366",Array.from({length:13},(_,index)=>String(index)).join(",")]){
    assert.throws(()=>parseTrainingReminderOffsets(invalid),(error:unknown)=>error instanceof HrmError&&error.message==="training_reminder_offsets_invalid"&&error.status===400,invalid);
  }
});

test("training reminder policy activation remains closed until both HRM gates are open",async()=>{
  const user={...makeUser({id:"closed-hrm-admin",name:"HRM Admin",email:"hrm@example.test"},false,["hrm_admin"]),hrmEnabled:false};
  await assert.rejects(
    activateTrainingReminderPolicy({} as D1Database,user,"request-key-0000001","training-reminder-policy-test",1),
    (error:unknown)=>error instanceof HrmError&&error.message==="hrm_closed"&&error.status===503,
  );
});
