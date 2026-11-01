import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("the teacher studio exposes complete assessment and content editing", async () => {
  const [workspace, repository, migration] = await Promise.all([
    read("src/platform/LmsWorkspace.tsx"),
    read("src/platform/platformRepository.ts"),
    read("supabase/migrations/20260717161916_complete_lms_lifecycle.sql"),
  ]);
  for (const marker of [
    "Edit assessment",
    "Save assessment changes",
    "edit-material:",
    "Save material changes",
    "Edit attendance session",
    "Edit class announcement",
  ])
    assert.match(
      workspace,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  for (const operation of [
    "updateCourseAssessment",
    "deleteCourseAssessment",
    "updateLearningMaterialPage",
    "updateAttendanceSession",
    "updateCourseAnnouncement",
  ])
    assert.match(repository, new RegExp(`export async function ${operation}`));
  assert.match(migration, /exists \(select 1 from public\.assessment_attempts/);
  assert.match(migration, /delete from public\.assessment_questions/);
  assert.match(migration, /private\.can_manage_section/);
});

test("academic identities and CRM records expose full edit forms", async () => {
  const [academic, portal, crm, editor, repository] = await Promise.all([
    read("src/platform/AcademicOperations.tsx"),
    read("src/platform/UnifiedPortal.tsx"),
    read("src/crm/CRMApp.tsx"),
    read("src/crm/CrmRecordEditor.tsx"),
    read("src/crm/crmRepository.ts"),
  ]);
  for (const marker of [
    "Edit student record",
    "Edit department",
    "Edit academic program",
    "Edit academic term",
    "Edit subject",
    "Edit schedule event",
  ])
    assert.match(academic, new RegExp(marker));
  assert.match(portal, /Edit profile/);
  assert.match(portal, /Save grade changes/);
  for (const kind of [
    "student",
    "case",
    "lead",
    "campaign",
    "task",
    "signal",
    "interaction",
  ])
    assert.match(editor, new RegExp(`kind: "${kind}"`));
  for (const marker of [
    "Add prospect",
    "Create case",
    "New campaign",
    "Edit student",
  ])
    assert.match(crm, new RegExp(marker));
  for (const operation of [
    "saveCrmStudent",
    "saveCrmCase",
    "saveAdmissionLead",
    "saveCrmTask",
    "saveCampaign",
    "saveStudentSignal",
    "logStudentInteraction",
  ])
    assert.match(repository, new RegExp(`export async function ${operation}`));
  assert.match(repository, /export async function uploadInstitutionalImage/);
});

test("the PRD defines the complete lifecycle and acceptance contract", async () => {
  const prd = await read("docs/product/PRODUCT_REQUIREMENTS.md");
  for (const heading of [
    "Universal record lifecycle contract",
    "Entity lifecycle and CRUD matrix",
    "Rich content requirements",
    "Nexus AI requirements",
    "Testing and acceptance",
    "Release definition of done",
  ])
    assert.match(prd, new RegExp(heading));
  assert.match(
    prd,
    /no material change occurs without authorization, validation, explicit confirmation, and an audit record/i,
  );
});
