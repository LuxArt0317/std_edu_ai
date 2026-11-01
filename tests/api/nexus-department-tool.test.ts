import assert from "node:assert/strict";
import test from "node:test";
import { readContractSource } from '../../scripts/contract-source.mjs';

const api = readContractSource("api/school-assistant.ts", "utf8");
const portal = readContractSource("src/features/school/UnifiedPortal.tsx", "utf8");
const types = readContractSource("src/features/school/types.ts", "utf8");

test("Nexus can create a department and continue with refreshed context", () => {
  for (const source of [api, portal, types]) assert.match(source, /create_department/);
  assert.match(api, /departmentActionRoles/);
  assert.match(api, /code: \{ type: "string" \}/);
  assert.match(portal, /createdId = await createDepartment/);
  assert.match(portal, /const refreshedData = await onDataChanged\(\)/);
  assert.match(portal, /advanceAgent\(progressed, threadId, refreshedData \?\? data\)/);
  assert.match(portal, /Created academic department/);
});

test("department creation remains unavailable to faculty and students", () => {
  assert.match(api, /departmentActionRoles = new Set\(\["owner", "admin", "dean", "registrar"\]\)/);
  assert.doesNotMatch(api, /departmentActionRoles = new Set\([^)]*faculty/);
  assert.doesNotMatch(api, /departmentActionRoles = new Set\([^)]*student/);
});

test("Nexus exposes governed create, update, and delete tools across core workspaces", () => {
  const expected = [
    "create_department", "create_program", "create_academic_term", "create_subject",
    "create_section", "enroll_student", "update_department", "update_program",
    "update_academic_term", "update_subject", "update_section", "update_module",
    "delete_module", "update_material", "delete_material", "update_material_page",
    "delete_material_page", "delete_assessment", "update_announcement",
    "delete_announcement", "update_attendance", "delete_attendance",
    "update_schedule_event", "delete_schedule_event",
    "create_support_request", "create_communication_request",
    "request_attendance_correction", "decide_attendance_correction",
    "create_initiative", "transition_initiative",
  ];
  for (const action of expected) {
    assert.match(api, new RegExp(`"${action}"`), `API catalog missing ${action}`);
    assert.match(types, new RegExp(`\\| "${action}"`), `action type missing ${action}`);
    assert.match(portal, new RegExp(`action\\.type === "${action}"`), `executor missing ${action}`);
  }
});

test("Nexus service tools use real governed repositories and actor context", () => {
  assert.match(portal, /await createCommunicationRequest/);
  assert.match(portal, /await createStudentSupportRequest/);
  assert.match(portal, /studentProfileId: actorId/);
  assert.match(portal, /await decideAttendanceCorrection/);
  assert.match(portal, /await createInstitutionalInitiative/);
  assert.match(portal, /await transitionInstitutionalInitiative/);
  assert.match(api, /base\.add\("create_communication_request"\)/);
  assert.match(api, /if \(role === "student"\) base\.add\("request_attendance_correction"\)/);
  assert.match(api, /leadershipActionRoles/);
});
