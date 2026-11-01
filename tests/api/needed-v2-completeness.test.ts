import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("needed v2 covers every schema domain and has no unresolved required action", async () => {
  const catalog = await read("docs/product/neededv2.md");
  for (const marker of ["Identity, roles, and accountability","Academic structure and curriculum","Student identity and academic record","Learning management and teaching","Assessments, grades, and attendance","CRM, learner support, admissions, and outreach","Communication, governance, notifications, and AI","Cross-cutting usability"]) assert.match(catalog, new RegExp(marker));
  assert.doesNotMatch(catalog, /^- \[ \]/m, "docs/product/neededv2.md contains an unresolved required action");
  assert.match(catalog, /Immutable/);
  assert.match(catalog, /Archive\/transition/);
});

test("curriculum lifecycle is visible, atomic, authorized, versioned, and audited", async () => {
  const [ui, repository, migration, auditPolicy] = await Promise.all([
    read("src/platform/AcademicOperations.tsx"),
    read("src/platform/platformRepository.ts"),
    read("supabase/migrations/20260718055707_manage_academic_curriculum_lifecycle.sql"),
    read("supabase/migrations/20260718060555_authorize_curriculum_audit_evidence.sql"),
  ]);
  for (const marker of ["Edit curriculum","Duplicate as new version","SUBJECT SEQUENCE","BLOCK TEMPLATES","Prerequisites","Required change reason"]) assert.match(ui, new RegExp(marker));
  assert.match(repository, /export async function updateAcademicCurriculum/);
  assert.match(repository, /update_academic_curriculum/);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /private\.has_role/);
  assert.match(migration, /Approved curriculum content is immutable/);
  assert.match(migration, /delete from public\.curriculum_plan_courses/);
  assert.match(migration, /curriculum_course_prerequisites/);
  assert.match(migration, /curriculum_block_templates/);
  assert.match(migration, /controlled_action_audit/);
  assert.match(migration, /revoke all .* from public, anon/i);
  assert.match(auditPolicy, /actor_id = \(select auth\.uid\(\)\)/);
  assert.match(auditPolicy, /plan\.updated_at >= transaction_timestamp\(\)/);
  assert.match(auditPolicy, /after_state->'plan'->>'status' = plan\.status/);
});
