import assert from "node:assert/strict";
import test from "node:test";
import { readContractSource } from '../../scripts/contract-source.mjs';

const portal = readContractSource("src/features/school/UnifiedPortal.tsx", "utf8");
const styles = readContractSource("src/features/school/platform.css", "utf8");

test("Nexus restores the last valid thread and opens at its newest message", () => {
  assert.match(portal, /stu-nexus:last-thread:/);
  assert.match(portal, /new Date\(right\.updatedAt\).*new Date\(left\.updatedAt\)/s);
  assert.match(portal, /data\.threads\.some\(\(thread\) => thread\.id === saved\)/);
  assert.match(portal, /messageViewportRef/);
  assert.match(portal, /viewport\.scrollTop = viewport\.scrollHeight/);
  assert.match(portal, /restoredThreadRef\.current = ""/);
});

test("Nexus follows new messages without stealing an intentional reading position", () => {
  assert.match(portal, /nearLatestMessageRef/);
  assert.match(portal, /if \(!isInitialRestore && !nearLatestMessageRef\.current\) return/);
  assert.match(portal, /viewport\.scrollHeight\s*-\s*viewport\.scrollTop\s*-\s*viewport\.clientHeight\s*<\s*96/);
});

test("goal activity is a collapsed assistant reply inside the compact popup", () => {
  assert.match(portal, /"idle"[\s\S]*"thinking"[\s\S]*"executing"[\s\S]*"refreshing"[\s\S]*"waiting"[\s\S]*"complete"[\s\S]*"blocked"/);
  for (const label of ["Thinking", "Working", "Waiting for you", "Goal complete", "Stopped"])
    assert.match(portal, new RegExp(`"${label}"`));
  assert.match(portal, /<details\s+className=\{`chat-agent-run/);
  assert.match(portal, /<Card\s+className="assistant agent-progress-reply"/);
  assert.match(portal, /\{agentRun\.step\} done ·[\s\S]{0,50}\{agentRun\.remainingWork\.length\}[\s\S]{0,30}remaining/);
  assert.match(portal, /Nexus working/);
  assert.match(portal, /onActivityChange=\{setAssistantActivity\}/);
  assert.match(styles, /\.chat-agent-activity/);
  assert.match(styles, /\.school-ai-fab\.thinking/);
  assert.match(styles, /animation: schoolPulse/);
  assert.match(styles, /\.school-ai-layer \{[\s\S]*right: 18px;[\s\S]*bottom: 18px;/);
  assert.match(styles, /pointer-events: none/);
  assert.doesNotMatch(portal, /school-ai-backdrop/);
  assert.doesNotMatch(styles, /\.school-ai-backdrop/);
});

test("closing the drawer hides it without unmounting the assistant state", () => {
  assert.match(portal, /<SchoolAssistant[\s\S]*open=\{assistantOpen\}/);
  assert.match(portal, /if \(!open\) return null/);
  assert.doesNotMatch(portal, /assistantOpen\s*\?\s*<SchoolAssistant/);
});
