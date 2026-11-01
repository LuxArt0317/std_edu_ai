import assert from "node:assert/strict";
import test from "node:test";
import { readContractSource } from '../../scripts/contract-source.mjs';

test("bulk curriculum workflow is atomic, RLS-protected, and idempotent", () => {
  const sql = readContractSource("supabase/migrations/20260718054000_agentic_curriculum_workflow.sql", "utf8");
  for (const table of ["curriculum_plans", "curriculum_plan_courses", "curriculum_course_prerequisites", "curriculum_block_templates"])
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(sql, /create_academic_curriculum[\s\S]*security invoker/i);
  assert.doesNotMatch(sql, /create_academic_curriculum[\s\S]*security definer/i);
  assert.match(sql, /idempotency_key text not null unique/);
  assert.match(sql, /Duplicate subject code/);
  assert.match(sql, /Prerequisite .* is not in this curriculum/);
});

test("Nexus exposes a complete curriculum preview and one confirmed transaction", () => {
  const portal = readContractSource("src/features/school/UnifiedPortal.tsx", "utf8");
  const api = readContractSource("api/school-assistant.ts", "utf8");
  assert.match(api, /create_curriculum/);
  assert.match(api, /complete degree curriculum/);
  assert.match(api, /minItems: 8/);
  assert.match(portal, /Review the four-year subject plan/);
  assert.match(portal, /createAcademicCurriculum/);
  assert.match(portal, /subjects, .* prerequisite links, and .* block templates/);
});

test("agent run IDs avoid the WebKit randomUUID pattern failure", () => {
  const loop = readContractSource("src/features/school/schoolAgentLoop.ts", "utf8");
  assert.doesNotMatch(loop, /crypto\?\.randomUUID|crypto\.randomUUID/);
  assert.match(loop, /agent-\$\{now\}/);
});
