import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path: string) => readFile(path, "utf8");

test("lesson studio supports wide multi-page inline image and video authoring", async () => {
  const [editor, lms, css, repository, migration] = await Promise.all([
    source("src/platform/RichTextEditor.tsx"), source("src/platform/LmsWorkspace.tsx"),
    source("src/platform/platform.css"), source("src/platform/platformRepository.ts"),
    source("supabase/migrations/20260718234504_immersive_lms_integrity_controls.sql"),
  ]);
  assert.match(editor, /multiple/);
  assert.match(editor, /videoEmbed/);
  assert.match(editor, /youtube-nocookie\.com/);
  assert.match(editor, /Upload video/);
  assert.match(lms, /lms-immersive-studio/);
  assert.match(lms, /Wide reading view/);
  assert.match(lms, /onVideoUpload/);
  assert.match(css, /\.lms-content-video-embed/);
  assert.match(css, /\.lms-learning-layout\.reader-focus/);
  assert.match(repository, /262_144_000/);
  assert.match(migration, /video\/mp4/);
});

test("lesson authoring keeps resources inline and privileged learning uses the live LMS", async () => {
  const [editor, lms, portal, css] = await Promise.all([
    source("src/platform/RichTextEditor.tsx"), source("src/platform/LmsWorkspace.tsx"),
    source("src/platform/UnifiedPortal.tsx"), source("src/platform/platform.css"),
  ]);
  assert.match(editor, /fileAttachment/);
  assert.match(editor, /data-lms-file-path/);
  assert.match(editor, /Attach files/);
  assert.match(lms, /onFileUpload/);
  assert.doesNotMatch(lms, />\s*HTTPS link\s*</);
  assert.doesNotMatch(lms, />\s*Upload file\s*</);
  assert.doesNotMatch(lms, /Open learning resource/);
  assert.match(portal, /mode=\{effectiveRole === "student" \? "student" : "review"\}/);
  assert.doesNotMatch(portal, /function LearningView/);
  assert.match(css, /\.lms-file-attachment/);
  assert.match(css, /\.lms-page-builder > header button[\s\S]*width: auto !important/);
});

test("assessment integrity is teacher controlled, disclosed, and append-only", async () => {
  const [migration, lms, portal, repository] = await Promise.all([
    source("supabase/migrations/20260718234504_immersive_lms_integrity_controls.sql"),
    source("src/platform/LmsWorkspace.tsx"), source("src/platform/UnifiedPortal.tsx"),
    source("src/platform/platformRepository.ts"),
  ]);
  for (const field of ["review_mode", "require_fullscreen", "monitor_focus", "detect_extended_display", "require_camera", "detect_multiple_cameras", "prevent_copy_paste"]) assert.match(migration, new RegExp(field));
  assert.match(migration, /assessment_integrity_student_insert/);
  assert.doesNotMatch(migration, /grant\s+(?:update|delete)[^;]*assessment_integrity_events/i);
  assert.match(migration, /read_assessment_review/);
  assert.match(lms, /Assessment integrity/);
  assert.match(lms, /not automatic misconduct findings/);
  assert.match(portal, /Assessment requirements/);
  assert.match(portal, /getUserMedia/);
  assert.match(portal, /visibilitychange/);
  assert.match(portal, /fullscreenchange/);
  assert.match(lms, /Integrity log/);
  assert.match(repository, /recordAssessmentIntegrityEvent/);
});

test("students can configure and export a branded class schedule PNG", async () => {
  const [portal, css] = await Promise.all([source("src/platform/UnifiedPortal.tsx"), source("src/platform/platform.css")]);
  assert.match(portal, /downloadSchedulePng/);
  assert.match(portal, /STUDENT SCHEDULE STUDIO/);
  assert.match(portal, /stu-logo-2\.png/);
  assert.match(portal, /canvas\.toBlob/);
  assert.match(portal, /Include rooms/);
  assert.match(portal, /Include upcoming deadlines/);
  assert.match(css, /\.schedule-poster/);
});
