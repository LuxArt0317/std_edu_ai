import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readInput() {
  try {
    const value = readFileSync(0, "utf8").trim();
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function phase48Items(plan) {
  const phase = plan.match(/## Phase 48:[\s\S]*?(?=\n## Phase |$)/)?.[0] ?? "";
  return [...phase.matchAll(/^- \[([ x])\] (.+)$/gm)].map((match) => ({
    complete: match[1] === "x",
    label: match[2].trim(),
  }));
}

const mode = process.argv[2] ?? "stop";
const event = readInput();
const root = resolve(event.cwd || process.cwd());
let plan;
let needed;

try {
  plan = readFileSync(resolve(root, "agent/planning-with-files/task_plan.md"), "utf8");
  needed = readFileSync(resolve(root, "needed.md"), "utf8");
} catch {
  process.stdout.write(JSON.stringify({
    continue: false,
    stopReason: "The needed.md completion contract could not be read.",
    systemMessage: "Do not claim completion. Restore needed.md and agent/planning-with-files/task_plan.md, then continue Issue #48.",
  }));
  process.exit(0);
}

const items = phase48Items(plan);
const remaining = items.filter((item) => !item.complete);
const catalogValid = needed.includes("Status:** Authoritative implementation checklist") && needed.includes("# 17. Implementation evidence ledger");

if (!items.length || !catalogValid) {
  process.stdout.write(JSON.stringify({
    continue: false,
    stopReason: "The Issue #48 completion ledger is missing or invalid.",
    systemMessage: "Do not stop or claim completion. Repair the authoritative needed.md and Phase 48 plan, then resume implementation.",
  }));
  process.exit(0);
}

if (!remaining.length) {
  process.exit(0);
}

const summary = remaining.map((item, index) => `${index + 1}. ${item.label}`).join("\n");
const message = mode === "session"
  ? `Issue #48 is active. Continue implementing needed.md. ${remaining.length} completion gates remain:\n${summary}`
  : `Completion is blocked: Issue #48 still has ${remaining.length} unchecked gates. Continue the implementation autonomously, update evidence as each real workflow ships, and do not send a successful final handoff yet:\n${summary}`;

process.stdout.write(JSON.stringify({
  continue: mode === "session",
  stopReason: mode === "stop" ? "needed.md is not fully implemented" : undefined,
  systemMessage: message,
}));
