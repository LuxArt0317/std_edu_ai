import assert from "node:assert/strict";
import test from "node:test";
import { readContractSource } from '../../scripts/contract-source.mjs';

const portal = readContractSource("src/features/school/UnifiedPortal.tsx", "utf8");
const api = readContractSource("api/school-assistant.ts", "utf8");

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
  assert.match(portal, /rejectedProposalRef/);
  assert.match(portal, /actionFingerprint\(action\) === rejectedProposal\.fingerprint/);
  assert.match(portal, /did not change the rejected parameters/);
});

test("assessment choices use the database's one-based answer contract", () => {
  assert.match(api, /one-based correctOption between 1 and the number of options/);
  assert.match(api, /correctOption: \{ type: "integer", minimum: 1, maximum: 12 \}/);
  assert.match(portal, /question\.correctOption < 1\s*\|\|\s*question\.correctOption > question\.options\.length/);
  assert.match(portal, /Execution failed: \$\{failure\}/);
});

test("Nexus has a consistent top-aligned assistant identity", () => {
  assert.match(portal, /function NexusAvatar/);
  assert.match(portal, /chat-sender-name">Nexus/);
  assert.match(portal, /nexus-assistant-avatar/);
});
