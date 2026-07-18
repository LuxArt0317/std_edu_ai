import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const auth = fs.readFileSync("src/crm/authService.ts", "utf8");
const policy = fs.readFileSync("src/crm/authSessionPolicy.ts", "utf8");
const root = fs.readFileSync("src/crm/CRMRoot.tsx", "utf8");
const portal = fs.readFileSync("src/platform/UnifiedPortal.tsx", "utf8");

test("background token events do not replace the active same-user portal session", () => {
  assert.match(auth, /shouldApplyCrmAuthEvent/);
  assert.match(policy, /SIGNED_OUT.*PASSWORD_RECOVERY.*USER_UPDATED/);
  assert.match(policy, /current\.user\.id !== next\.user\.id/);
  assert.match(root, /setSession\(\(existing\) => shouldApplyCrmAuthEvent/);
  assert.doesNotMatch(root, /subscribeToCrmAuth\([\s\S]{0,160}setSession\(current\)/);
});

test("Nexus authorizes actions with the trusted actor role, not owner UI preview", () => {
  assert.match(portal, /<SchoolAssistant[\s\S]{0,220}role=\{currentUser\.role\}/);
  assert.doesNotMatch(portal, /<SchoolAssistant[\s\S]{0,220}role=\{effectiveRole\}/);
  assert.match(portal, /\["owner", "admin", "dean", "registrar", "department_head"\]/);
});
