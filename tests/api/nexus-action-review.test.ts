import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const portal = fs.readFileSync("src/platform/UnifiedPortal.tsx", "utf8");
const api = fs.readFileSync("api/school-assistant.ts", "utf8");

test("invalid proposals are replanned before review", () => {
  assert.match(portal, /validateSchoolAiAction\(action, contextData\)/);
  assert.match(portal, /Proposed parameters were invalid and were not shown for review/);
  assert.match(portal, /await advanceAgent\(corrected, activeThread, contextData\)/);
  assert.match(portal, /A quiz or exam requires at least one complete question/);
  assert.match(api, /For create_assessment with assessmentType quiz or exam, include at least one complete question/);
  assert.match(api, /required: \["prompt", "points", "options", "correctOption", "explanation"\]/);
  assert.match(portal, /questions: action\.questions \?\? \[\]/);
});

test("a user can comment on a proposal and retry the same goal", () => {
  assert.match(portal, /Request changes/);
  assert.match(portal, /What should Nexus change\?/);
  assert.match(portal, /User rejected this proposal and requested a revision/);
  assert.match(portal, /await advanceAgent\(resumed, threadId\)/);
  assert.match(portal, /Revise proposal/);
});
