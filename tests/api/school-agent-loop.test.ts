import assert from "node:assert/strict";
import test from "node:test";
import {
actionFingerprint,
addAgentObservation,
runSafetyStop,
startSchoolAgentRun,
} from "../../src/features/school/schoolAgentLoop.ts";
import type { SchoolAiAction } from "../../src/features/school/types.ts";

const action = {
  type: "create_module", title: "Week 1", targetId: null, sectionId: "section-1",
  moduleId: null, materialId: null, destination: null,
} as SchoolAiAction;

test("agent runs retain real observations across multiple goal steps", () => {
  const run = startSchoolAgentRun("Create a module and lesson", 1_000);
  const first = addAgentObservation(run, { step: 1, actionType: "create_module", outcome: "success", summary: "Module saved." }, action);
  const second = addAgentObservation(first, { step: 2, actionType: "create_material", outcome: "success", summary: "Lesson saved." }, { ...action, type: "create_material", moduleId: "module-1" });
  assert.equal(second.step, 2);
  assert.deepEqual(second.observations.map((item) => item.summary), ["Module saved.", "Lesson saved."]);
  assert.equal(runSafetyStop(second, 2_000), "");
});

test("agent runs stop on repeated no-progress actions", () => {
  let run = startSchoolAgentRun("Create a module", 1_000);
  for (let step = 1; step <= 3; step += 1)
    run = addAgentObservation(run, { step, actionType: "create_module", outcome: "error", summary: "No change." }, action);
  assert.match(runSafetyStop(run, 2_000), /repeated the same action/i);
});

test("agent runs stop at the step and runtime bounds", () => {
  const capped = { ...startSchoolAgentRun("Large goal", 1_000), step: 32 };
  assert.match(runSafetyStop(capped, 2_000), /after 32 steps/i);
  assert.match(runSafetyStop(startSchoolAgentRun("Slow goal", 1_000), 1_801_001), /thirty-minute/i);
});

test("proposal fingerprints include semantic action parameters but not review copy", () => {
  const first = { ...action, confirmation: "Review this", questions: [{ prompt: "Q", points: 1, options: ["A", "B"], correctOption: 1, explanation: "A" }] } as SchoolAiAction;
  assert.equal(actionFingerprint(first), actionFingerprint({ ...first, confirmation: "Different wording" }));
  assert.notEqual(actionFingerprint(first), actionFingerprint({ ...first, questions: [{ ...first.questions![0], correctOption: 2 }] }));
});
