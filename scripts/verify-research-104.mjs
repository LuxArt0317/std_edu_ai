import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectEvidence, hookResponse } from "../.codex/hooks/issue104_completion_guard.mjs";

const manifest = JSON.parse(readFileSync("agent/research-104-evidence.json", "utf8"));
const real = inspectEvidence(manifest);
assert.equal(real.errors.length, 0, real.errors.join("\n"));
assert.equal(real.complete, false, "The real ledger must remain incomplete while Issue #104 work remains.");
assert.equal(manifest.workPackages.length, 12);

const verifiedMeasure = (measure) => ({ ...measure, status: "verified", verifiedAt: "2026-07-19T00:00:00Z", evidence: ["fixture://verified"] });
const completeManifest = {
  ...manifest,
  workPackages: manifest.workPackages.map((workPackage) => ({
    ...workPackage,
    issueState: "closed",
    measures: workPackage.measures.map(verifiedMeasure),
  })),
};
const complete = inspectEvidence(completeManifest);
assert.equal(complete.complete, true, JSON.stringify(complete));
assert.equal(hookResponse("stop", complete), null);

const malformed = inspectEvidence({ parentIssue: 104, workPackages: [] });
assert.ok(malformed.errors.some((error) => error.includes("absent")));
assert.equal(hookResponse("stop", malformed)?.continue, false);

const incomplete = structuredClone(completeManifest);
incomplete.workPackages[0].issueState = "open";
incomplete.workPackages[0].measures[0].status = "pending";
delete incomplete.workPackages[0].measures[0].verifiedAt;
incomplete.workPackages[0].measures[0].evidence = [];
assert.equal(hookResponse("stop", inspectEvidence(incomplete))?.continue, false);

const externalOnly = structuredClone(completeManifest);
externalOnly.workPackages[0].issueState = "open";
externalOnly.workPackages[0].measures[0] = {
  ...externalOnly.workPackages[0].measures[0],
  status: "external",
  externalOwner: "fixture owner",
  externalDependency: "fixture approval",
  evidence: [],
};
delete externalOnly.workPackages[0].measures[0].verifiedAt;
const externalResponse = hookResponse("stop", inspectEvidence(externalOnly));
assert.equal(externalResponse?.continue, true);
assert.match(externalResponse?.systemMessage || "", /external evidence remains/i);

console.log(JSON.stringify({
  status: "ok",
  childIssues: manifest.workPackages.length,
  realActionableGates: real.actionable.length,
  realExternalGates: real.external.length,
  fixtures: ["complete", "malformed", "incomplete", "external-only"],
}));
