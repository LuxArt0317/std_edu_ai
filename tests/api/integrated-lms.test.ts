import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("integrated LMS schema protects content, submissions, attendance, progress, and private files", async () => {
  const sql = await source(
    "supabase/migrations/20260717145445_integrated_lms.sql",
  );
  for (const table of [
    "learning_modules",
    "learning_materials",
    "learning_progress",
    "assignment_submissions",
    "attendance_sessions",
    "attendance_records",
  ]) {
    assert.match(
      sql,
      new RegExp(
        `alter table public\\.${table} enable row level security`,
        "i",
      ),
    );
  }
  assert.match(sql, /'lms-files'.*false/s);
  assert.match(sql, /can_access_lms_object/);
  assert.match(sql, /grant select, insert, update, delete/i);
});

test("LMS hardening enforces enrollment and maximum scores", async () => {
  const sql = await source(
    "supabase/migrations/20260717150431_harden_lms_workflows.sql",
  );
  assert.match(sql, /score cannot exceed the assessment maximum/i);
  assert.match(sql, /learner is not enrolled/i);
  assert.match(sql, /attendance can be recorded only for an enrolled learner/i);
  assert.match(sql, /learning progress requires an active enrollment/i);
});

test("teacher and student LMS surfaces cover the complete course lifecycle", async () => {
  const ui = await source("src/features/school/LmsWorkspace.tsx");
  for (const label of [
    "New module",
    "Add material",
    "New assessment",
    "Grade work",
    "Take attendance",
    "Announcement",
    "Submit assignment",
    "Mark complete",
  ]) {
    assert.match(ui, new RegExp(label, "i"));
  }
});

test("quiz and exam creation is atomic and keeps answer keys protected", async () => {
  const sql = await source(
    "supabase/migrations/20260717150826_transactional_assessment_builder.sql",
  );
  assert.match(sql, /security invoker/i);
  assert.match(sql, /assessment_answer_keys/i);
  assert.match(sql, /revoke all.*from public, anon/is);
  assert.match(sql, /quiz or exam requires at least one question/i);
});

test("rich content supports protected multi-page lessons and managed images", async () => {
  const sql = await source(
    "supabase/migrations/20260717155812_rich_content_pages_and_media.sql",
  );
  const editor = await source("src/features/school/RichTextEditor.tsx");
  const lms = await source("src/features/school/LmsWorkspace.tsx");
  assert.match(sql, /create table public\.learning_material_pages/i);
  assert.match(sql, /learning_material_pages_read/i);
  assert.match(sql, /private\.can_manage_section/i);
  assert.match(sql, /'learning-media'.*true/s);
  assert.match(sql, /image\/jpeg.*image\/png.*image\/webp.*image\/gif/s);
  assert.match(editor, /@tiptap\/extension-image/);
  assert.match(editor, /onImageUpload/);
  assert.match(lms, /Add page/);
  assert.match(lms, /Page \{activePage \+ 1\} of/);
});
