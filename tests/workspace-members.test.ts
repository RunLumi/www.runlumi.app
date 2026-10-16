import test from "node:test";
import assert from "node:assert/strict";
import { membersWithRolesFor } from "../src/lib/workspace/members";
import { sqliteD1 } from "./support/d1-sqlite";

test("targeted Workspace recipient lookup chunks beyond the admin-list cap and rejects disabled members/accounts",async()=>{
  const db=sqliteD1("jobs"),contentDb=sqliteD1("content"),userIds=Array.from({length:205},(_,index)=>`member-${String(index).padStart(3,"0")}`),roles=["employee","hrm_officer","hrm_admin"] as const;
  const addMember=db.raw.prepare("INSERT INTO workspace_members(user_id,enabled,granted_by,created_at,updated_at) VALUES(?,?, 'test-admin','2026-10-17','2026-10-17')"),addRole=db.raw.prepare("INSERT INTO workspace_roles(user_id,role,granted_by,granted_at) VALUES(?,?,'test-admin','2026-10-17')"),addUser=contentDb.raw.prepare("INSERT INTO users(id,email,name,role,disabled) VALUES(?,?,?,30,?)");
  for(let index=0;index<userIds.length;index++){
    const userId=userIds[index],workspaceEnabled=index===11?0:1,accountDisabled=index===10?1:0;
    addMember.run(userId,workspaceEnabled);addRole.run(userId,roles[index%roles.length]);addUser.run(userId,`${userId}@example.test`,userId,accountDisabled);
  }
  const members=await membersWithRolesFor(db,contentDb,userIds,["employee","hrm_officer","hrm_admin"]);
  assert.equal(members.length,203,"all active recipients are resolved across multiple D1/EmDash chunks");
  assert.ok(!members.some(member=>member.user_id===userIds[10]||member.user_id===userIds[11]));
  assert.equal(new Set(members.map(member=>member.user_id)).size,203);
});
