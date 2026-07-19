import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VALID_STATUSES = new Set(["pending", "in_progress", "verified", "external"]);
const EXPECTED_ISSUES = new Set(Array.from({ length: 12 }, (_, index) => 105 + index));

function readStdin() {
  try {
    const raw = readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function inspectEvidence(manifest) {
  const errors = [];
  const actionable = [];
  const external = [];
  const seen = new Set();

  if (!manifest || manifest.parentIssue !== 104 || !Array.isArray(manifest.workPackages)) {
    return { errors: ["Manifest must identify parent Issue #104 and contain workPackages."], actionable, external, complete: false };
  }

  for (const workPackage of manifest.workPackages) {
    if (!Number.isInteger(workPackage.issue) || !EXPECTED_ISSUES.has(workPackage.issue)) {
      errors.push(`Unexpected or missing child issue number: ${String(workPackage.issue)}`);
      continue;
    }
    if (seen.has(workPackage.issue)) errors.push(`Duplicate child issue #${workPackage.issue}.`);
    seen.add(workPackage.issue);
    if (!workPackage.key || !workPackage.title || !Array.isArray(workPackage.measures) || !workPackage.measures.length) {
      errors.push(`Issue #${workPackage.issue} requires a key, title, and measurable gates.`);
      continue;
    }
    if (workPackage.issueState === "closed" && workPackage.measures.some((measure) => measure.status !== "verified")) {
      errors.push(`Issue #${workPackage.issue} cannot be closed while evidence gates remain unverified.`);
    }
    for (const measure of workPackage.measures) {
      const label = `#${workPackage.issue} ${measure.id || "unnamed measure"}`;
      if (!measure.id || !measure.description || !measure.metric || !measure.target) {
        errors.push(`${label} is missing description, metric, or target.`);
        continue;
      }
      if (!VALID_STATUSES.has(measure.status)) {
        errors.push(`${label} has invalid status ${String(measure.status)}.`);
        continue;
      }
      if (measure.status === "verified") {
        if (!measure.verifiedAt || !Array.isArray(measure.evidence) || !measure.evidence.length) {
          errors.push(`${label} is marked verified without timestamped evidence.`);
        }
      } else if (measure.status === "external") {
        if (!measure.externalOwner || !measure.externalDependency) {
          errors.push(`${label} is external without an owner and dependency.`);
        }
        external.push(label);
      } else {
        actionable.push(label);
      }
    }
  }

  for (const issue of EXPECTED_ISSUES) if (!seen.has(issue)) errors.push(`Child issue #${issue} is absent from the evidence ledger.`);
  const complete = errors.length === 0 && actionable.length === 0 && external.length === 0 && manifest.workPackages.every((item) => item.issueState === "closed");
  return { errors, actionable, external, complete };
}

export function hookResponse(mode, report) {
  if (report.complete) return null;
  const lines = [...report.errors, ...report.actionable, ...report.external].slice(0, 12);
  const remaining = report.errors.length + report.actionable.length + report.external.length;
  const summary = lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
  const suffix = remaining > lines.length ? `\n…and ${remaining - lines.length} more gates in agent/research-104-evidence.json.` : "";

  if (mode === "session") {
    return {
      continue: true,
      systemMessage: `Issue #104 remains active with ${remaining} unresolved evidence gates. Continue the next actionable child issue and validate it before updating the ledger:\n${summary}${suffix}`,
    };
  }

  if (report.actionable.length || report.errors.length) {
    return {
      continue: false,
      stopReason: "Issue #104 has actionable or invalid completion evidence.",
      systemMessage: `Do not claim completion or stop the implementation. Repair the ledger errors and continue the next actionable child issue:\n${summary}${suffix}`,
    };
  }

  return {
    continue: true,
    stopReason: "Issue #104 awaits external evidence that Codex cannot fabricate.",
    systemMessage: `All locally actionable work is complete, but external evidence remains. Report these dependencies explicitly without claiming Issue #104 complete:\n${summary}${suffix}`,
  };
}

function run() {
  const mode = process.argv[2] || "stop";
  const event = readStdin();
  const root = resolve(event.cwd || process.cwd());
  try {
    const manifest = JSON.parse(readFileSync(resolve(root, "agent/research-104-evidence.json"), "utf8"));
    const response = hookResponse(mode, inspectEvidence(manifest));
    if (response) process.stdout.write(JSON.stringify(response));
  } catch (error) {
    process.stdout.write(JSON.stringify({
      continue: mode === "session",
      stopReason: "Issue #104 evidence ledger is missing or malformed.",
      systemMessage: `Do not claim completion. Restore agent/research-104-evidence.json and continue Issue #104. ${error instanceof Error ? error.message : "Unknown error"}`,
    }));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) run();
