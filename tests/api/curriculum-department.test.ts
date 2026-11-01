import assert from "node:assert/strict";
import test from "node:test";
import { readContractSource } from '../../scripts/contract-source.mjs';

const portal = readContractSource("src/features/school/UnifiedPortal.tsx", "utf8");

test("curriculum confirmation resolves or requests an active department", () => {
  assert.match(portal, /requestedDepartment\?\.id[\s\S]*activeDepartments\.length === 1/);
  assert.match(portal, /Owning academic department/);
  assert.match(portal, /department\.status === "active"/);
  assert.match(portal, /value=\{curriculumDepartmentId\}/);
  assert.match(portal, /Select the active academic department that will own this curriculum/);
  assert.match(portal, /pendingAction\.type === "create_curriculum"[\s\S]*!curriculumDepartmentId/);
  assert.doesNotMatch(portal, /!action\.departmentId \|\| !action\.curriculum/);
});
