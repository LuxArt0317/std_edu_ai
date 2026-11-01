import assert from "node:assert/strict";
import test from "node:test";
import { readContractSource } from '../../scripts/contract-source.mjs';

const auth = readContractSource("src/features/crm/authService.ts", "utf8");
const policy = readContractSource("src/features/crm/authSessionPolicy.ts", "utf8");
const root = readContractSource("src/features/auth/SchoolAuth.tsx", "utf8");
const portal = readContractSource("src/features/school/UnifiedPortal.tsx", "utf8");

test("background token events do not replace the active same-user portal session", () => {
  assert.match(auth, /shouldApplyCrmAuthEvent/);
  assert.match(policy, /SIGNED_OUT.*PASSWORD_RECOVERY.*USER_UPDATED/);
  assert.match(policy, /current\.user\.id !== next\.user\.id/);
  assert.match(root, /setSession\(\(existing\) =>\s*shouldApplyCrmAuthEvent/);
  assert.doesNotMatch(root, /subscribeToCrmAuth\([\s\S]{0,160}setSession\(current\)/);
});

test("Nexus authorizes actions with the trusted actor role, not owner UI preview", () => {
  assert.match(portal, /<SchoolAssistant[\s\S]{0,220}role=\{currentUser\.role\}/);
  assert.doesNotMatch(portal, /<SchoolAssistant[\s\S]{0,220}role=\{effectiveRole\}/);
  assert.match(portal, /\[\s*"owner",\s*"admin",\s*"dean",\s*"registrar",\s*"department_head",?\s*\]/);
});
