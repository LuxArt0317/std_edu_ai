import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("Stitch outputs are validated instead of accepted as complete",()=>{
  const evidence=readFileSync("STITCH_UI_EVIDENCE.md","utf8");
  assert.match(evidence,/generated HTML—not only the screenshots/i);
  assert.match(evidence,/Missing or ambiguous in Stitch/);
  assert.match(evidence,/never remove controls to match Stitch/i);
});

test("teacher and student lessons expose explicit workflow actions",()=>{
  const source=readFileSync("src/platform/LmsWorkspace.tsx","utf8");
  for(const marker of ["Open lesson","Student lesson preview","Edit lesson","Course outline","aria-current","Next lesson","Wide reading view"]) assert.match(source,new RegExp(marker));
});

test("completed Stitch hooks remain removed while the active research guard is scoped",()=>{
  assert.equal(existsSync(".codex/hooks.json"),true);
  assert.equal(existsSync(".codex/hooks/stitch_all_pages_guard.mjs"),false);
  const hooks=readFileSync(".codex/hooks.json","utf8");
  assert.match(hooks,/Issue #104 research-completion epic/);
  assert.doesNotMatch(hooks,/stitch_all_pages_guard/);
});

test("the Stitch redesign is scoped away from the public landing page",()=>{
  const evidence=readFileSync("STITCH_UI_EVIDENCE.md","utf8");
  const publicLanding=readFileSync("src/App.tsx","utf8");
  assert.match(evidence,/public `\/` landing page.*excluded/i);
  assert.doesNotMatch(publicLanding,/stitch_ui|lms-material-open|people-manage-account/i);
});
