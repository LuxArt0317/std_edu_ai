import assert from "node:assert/strict";
import { test } from "node:test";
import { readContractSourceAsync } from '../../scripts/contract-source.mjs';

const source = (path: string) => readContractSourceAsync(path, "utf8");

test("staff use one Courses workspace with an exact published student preview", async () => {
  const [portal, lms, academics] = await Promise.all([
    source("src/features/school/UnifiedPortal.tsx"),
    source("src/features/school/LmsWorkspace.tsx"),
    source("src/features/school/AcademicOperations.tsx"),
  ]);
  assert.match(portal, /teaching: \{ label: "Courses"/);
  assert.match(portal, /learning: \{ label: "Courses"/);
  assert.doesNotMatch(portal, /"teaching",\s*"learning"/);
  assert.match(portal, /view === "learning" && teachingRoles\.has\(effectiveRole\)\s*\? "teaching"/);
  assert.match(lms, /\["preview", "Student view"\]/);
  assert.match(lms, /mode="preview"/);
  assert.match(lms, /EXACT PUBLISHED VIEW/);
  assert.match(lms, /There is no separate copy or synchronization step/);
  assert.match(academics, />Open course</);
  assert.doesNotMatch(academics, />Open learning</);
  assert.doesNotMatch(academics, />Open teaching</);
});

test("publication state is explicit, actionable, and filters the student preview", async () => {
  const lms = await source("src/features/school/LmsWorkspace.tsx");
  assert.match(lms, /Draft material · hidden from students/);
  assert.match(lms, /Published material, but its module is still draft/);
  assert.match(lms, /Visible to students now/);
  assert.match(lms, /Publish for students/);
  assert.match(lms, /defaultChecked \/> Publish module to students immediately/);
  assert.match(lms, /defaultChecked=\{material \? material\.status === "published" : true\}/);
  assert.match(lms, /!publishedView \|\| item\.status === "published"/);
  assert.match(lms, /Module saved as a draft and hidden from students/);
  assert.match(lms, /Learning material published to students/);
});

test("database publication policy qualifies material and module states independently", async () => {
  const policy = await source(
    "supabase/migrations/20260719020016_enforce_learning_material_publication_visibility.sql",
  );
  assert.match(policy, /learning_materials\.status = 'published'/);
  assert.match(policy, /module\.status = 'published'/);
  assert.match(policy, /module\.unlocks_at is null or module\.unlocks_at <= now\(\)/);
  assert.match(policy, /private\.can_manage_section\(module\.section_id\)/);
  assert.doesNotMatch(policy, /\(status = 'published' and module\.status/);
});
