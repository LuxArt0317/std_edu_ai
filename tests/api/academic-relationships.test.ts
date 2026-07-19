import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const ui = fs.readFileSync("src/platform/AcademicOperations.tsx", "utf8");
const repository = fs.readFileSync("src/platform/platformRepository.ts", "utf8");
const schemaMap = fs.readFileSync("docs/PLATFORM_SCHEMA_MAP.md", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20260718052529_connect_students_to_academic_programs.sql",
  "utf8",
);
const studentFunction = fs.readFileSync(
  "supabase/functions/manage-student-account/index.ts",
  "utf8",
);

test("the platform schema map covers every production data domain", () => {
  for (const table of [
    "profiles", "students", "departments", "academic_programs", "curriculum_plans",
    "curriculum_plan_courses", "curriculum_course_prerequisites", "curriculum_block_templates",
    "courses", "academic_terms", "course_sections", "section_enrollments", "schedule_events",
    "learning_modules", "learning_materials", "learning_material_pages", "learning_progress",
    "assessments", "assessment_questions", "assessment_options", "assessment_attempts",
    "assignment_submissions", "attendance_sessions", "attendance_records", "grade_items", "grades",
    "cases", "crm_tasks", "student_signals", "interactions", "admission_leads", "campaigns",
    "chat_threads", "communication_requests", "notifications", "institutional_initiatives",
  ]) assert.match(schemaMap, new RegExp(`\\b${table}\\b`), `schema map missing ${table}`);
  assert.match(schemaMap, /Department → Program → Curriculum plan → Curriculum subject mapping → Subject → Class section/);
});

test("students have an authoritative program foreign key with safe compatibility backfill", () => {
  assert.match(migration, /add column program_id uuid references public\.academic_programs\(id\) on delete restrict/);
  assert.match(migration, /create index students_program_id_idx/);
  assert.match(migration, /select p\.program_id from public\.profiles/);
  assert.match(migration, /upper\(trim\(ap\.name\)\) like/);
  assert.match(migration, /students_sync_program_identity/);
  assert.match(migration, /revoke all on function public\.sync_student_program_identity/);
  assert.match(repository, /programId: student\.program_id \?\? null/);
  assert.match(studentFunction, /program_id: academicProgram\.id/);
});

test("Academic Office exposes connected program pathways and recovery actions", () => {
  for (const marker of [
    "PROGRAM-CENTERED ACADEMIC MAP", "Open pathway", "Curriculum versions", "View subjects",
    "View classes", "Programs without curriculum", "Students without program ID",
    "Ask Nexus to create", "Open roster", "Not placed in a curriculum",
  ]) assert.match(ui, new RegExp(marker), `connected workflow missing ${marker}`);
  assert.match(ui, /data\.curricula\.filter\(\(item\) => item\.programId === selectedProgram\.id\)/);
  assert.match(ui, /item\.departmentId===selectedProgram\.departmentId&&\(item\.programId === selectedProgram\.id\|\|item\.programId===null\)/);
  assert.match(ui, /data\.students\.filter\(\(item\) => item\.programId === selectedProgram\.id\)/);
  assert.match(ui, /value=\{studentProgramId\}/);
});
