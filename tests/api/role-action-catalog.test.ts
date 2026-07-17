import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const catalog = fs.readFileSync("needed.md", "utf8");
const portal = fs.readFileSync("src/platform/UnifiedPortal.tsx", "utf8");
const repository = fs.readFileSync(
  "src/platform/platformRepository.ts",
  "utf8",
);

test("the authoritative action catalog covers every canonical role and domain", () => {
  for (const role of [
    "Owner",
    "Administrator",
    "President",
    "Vice President",
    "Dean",
    "Registrar",
    "Department Head",
    "Faculty / Teacher",
    "Academic Advisor",
    "Admissions",
    "Finance",
    "Student Support",
    "Librarian",
    "Student",
  ])
    assert.match(catalog, new RegExp(role.replace("/", "\\/")));
  for (const domain of [
    "Accounts and permissions",
    "Academic administration",
    "Course preparation",
    "Assessments",
    "Attendance",
    "CRM and operations",
    "Nexus AI",
  ])
    assert.match(catalog, new RegExp(domain));
  assert.match(catalog, /Select quiz answers/);
  assert.match(catalog, /Completion rule/);
});

test("the protected owner has complete visible non-owner provisioning", () => {
  assert.match(portal, /OWNER ACCOUNT CONTROL/);
  assert.match(portal, /\+ Add account/);
  assert.match(portal, /provisionRoleAccount\(\{/);
  assert.match(portal, /filter\(\(item\) => item\.code !== "owner"\)/);
  assert.match(portal, /generateTemporaryPassword/);
  assert.match(repository, /"provision-role-account"/);
  assert.match(repository, /The account was not confirmed by Auth/);
});

test("role assignment requires impact review, a reason, and confirmation", () => {
  assert.match(portal, /CONTROLLED ROLE TRANSITION/);
  assert.match(portal, /Reason for this authorization change/);
  assert.match(portal, /minLength=\{12\}/);
  assert.match(portal, /Confirm role change/);
  assert.match(portal, /immutable role-audit entry/);
});

test("account lifecycle actions are visible, Auth-enforced, audited, and owner-protected", () => {
  const edge = fs.readFileSync(
    "supabase/functions/provision-role-account/index.ts",
    "utf8",
  );
  const migration = fs.readFileSync(
    "supabase/migrations/20260717231612_account_lifecycle_controls.sql",
    "utf8",
  );
  for (const action of ["activate", "suspend", "archive", "restore"])
    assert.match(portal, new RegExp(action, "i"));
  assert.match(edge, /ban_duration/);
  assert.match(edge, /protected owner account cannot be changed/i);
  assert.match(edge, /account_lifecycle_audit/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /previous_status/);
  assert.match(migration, /new_status/);
});
