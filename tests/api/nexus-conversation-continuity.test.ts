import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const portal = fs.readFileSync("src/platform/UnifiedPortal.tsx", "utf8");
const styles = fs.readFileSync("src/platform/platform.css", "utf8");

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
  assert.match(portal, /viewport\.scrollHeight - viewport\.scrollTop - viewport\.clientHeight < 96/);
});

test("goal activity is a collapsed assistant reply inside the compact popup", () => {
  assert.match(portal, /"idle" \| "thinking" \| "executing" \| "refreshing" \| "waiting" \| "complete" \| "blocked"/);
  for (const label of ["Thinking", "Working", "Waiting for you", "Goal complete", "Stopped"])
    assert.match(portal, new RegExp(`"${label}"`));
  assert.match(portal, /<details className=\{`chat-agent-run/);
  assert.match(portal, /<article className="assistant agent-progress-reply"/);
  assert.match(portal, /\{agentRun\.step\} done · \{agentRun\.remainingWork\.length\} remaining/);
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
