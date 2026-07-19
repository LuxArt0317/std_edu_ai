import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = (path: string) => readFile(path, "utf8");

test("admissions cards drag between stages through one validated transition path", async () => {
  const app = await source("src/crm/CRMApp.tsx");
  assert.match(app, /draggable/);
  assert.match(app, /onDragStart=\{\(event\) => startLeadDrag/);
  assert.match(app, /onDrop=\{\(event\) => dropLead/);
  assert.match(app, /requestLeadMove\(id, stage\)/);
  assert.match(app, /missingLeadRequirements\(lead, targetStage\)/);
  assert.match(app, /LeadTransitionDialog/);
  assert.match(app, /Only information required for this pipeline stage is requested/);
});

test("stage completion collects contacts, next action, and accountable ownership", async () => {
  const app = await source("src/crm/CRMApp.tsx");
  assert.match(app, /engaged: \["owner", "contact", "nextStep"\]/);
  assert.match(app, /application: \["owner", "email", "phone", "nextStep"\]/);
  assert.match(app, /admitted: \["owner", "email", "phone", "nextStep"\]/);
  assert.match(app, /Assign an accountable owner/);
  assert.match(app, /Add at least one reliable contact method/);
  assert.match(app, /saveAdmissionLead\(id/);
  assert.match(app, /persistLeadStage\(id, stage, probability\)/);
  assert.match(app, /previous state was restored/);
});

test("prospect actions have distinct semantic colors and accessible fallback controls", async () => {
  const [app, css] = await Promise.all([
    source("src/crm/CRMApp.tsx"),
    source("src/crm/crm.css"),
  ]);
  assert.match(app, /pipeline-advance-action/);
  assert.match(app, /pipeline-edit-action/);
  assert.match(app, /pipeline-handoff-action/);
  assert.match(app, /pipeline-archive-action/);
  assert.match(css, /pipeline-edit-action[^}]*#175f91/);
  assert.match(css, /pipeline-handoff-action[^}]*#fff/);
  assert.match(css, /pipeline-archive-action[^}]*#a0443b/);
  assert.match(app, /Advance →/);
});
