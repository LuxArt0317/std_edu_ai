import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const api=fs.readFileSync("api/school-assistant.ts","utf8");
const portal=fs.readFileSync("src/platform/UnifiedPortal.tsx","utf8");
const client=fs.readFileSync("src/platform/platformAi.ts","utf8");
const loop=fs.readFileSync("src/platform/schoolAgentLoop.ts","utf8");

test("Nexus plans and continues until remaining work is empty",()=>{
  assert.match(api,/Maintain a concise end-to-end plan and remainingWork/);
  assert.match(api,/A successful action is only one step/);
  assert.match(api,/Set complete only when every requested outcome is proven satisfied/);
  assert.match(api,/agent\.status === "complete" && agent\.remainingWork\.length/);
  assert.match(portal,/await advanceAgent\(progressed, threadId, refreshedData \?\? data\)/);
  assert.match(loop,/SCHOOL_AGENT_MAX_STEPS = 32/);
});

test("Nexus uses broad platform context before asking a user",()=>{
  for(const field of ["curricula","enrollments","materialPages","gradeItems","grades","attendanceSessions","communications","supportRequests"]){
    assert.match(api,new RegExp(`"${field}"`));
    assert.match(client,new RegExp(`${field}: context\\.data\\.${field}`));
  }
  assert.match(api,/Never ask for information that is already present or can be safely inferred/);
});

test("a genuine clarification pauses and resumes the same run",()=>{
  assert.match(api,/"needs_input"/);
  assert.match(api,/provide one focused clarification object/);
  assert.match(portal,/agentRun\?\.status === "awaiting_input"/);
  assert.match(portal,/ONE DECISION NEEDED/);
  assert.match(portal,/answerClarification/);
  assert.match(portal,/continuing the existing goal/);
  assert.match(portal,/User clarification:/);
});
