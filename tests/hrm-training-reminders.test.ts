import test from "node:test";
import assert from "node:assert/strict";
import { HrmError } from "../src/lib/hrm/fields";
import { parseTrainingReminderOffsets } from "../src/lib/hrm/training-reminders";

test("training reminder offsets require explicit, unique bounded integers and keep deadline order",()=>{
  assert.deepEqual(parseTrainingReminderOffsets("0, 7, -1, 1"),[7,1,0,-1]);
  assert.deepEqual(parseTrainingReminderOffsets("-365, 365"),[365,-365]);
  for(const invalid of ["","7,,1","01,0","1.5,0","1,1","366","-366",Array.from({length:13},(_,index)=>String(index)).join(",")]){
    assert.throws(()=>parseTrainingReminderOffsets(invalid),(error:unknown)=>error instanceof HrmError&&error.message==="training_reminder_offsets_invalid"&&error.status===400,invalid);
  }
});
