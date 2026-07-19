import assert from "node:assert/strict";
import fs from "node:fs";

const matrix = JSON.parse(fs.readFileSync("docs/research/claims-evidence.json", "utf8"));
assert.equal(matrix.schemaVersion, 1);
assert.match(matrix.protocolVersion, /^\d+\.\d+\.\d+$/);
assert.equal(matrix.protocolStatus, "draft_pending_external_review");
assert.ok(Array.isArray(matrix.claims) && matrix.claims.length >= 15);

const ids = new Set();
for (const claim of matrix.claims) {
  for (const field of ["id", "kind", "statement", "metric", "artifact", "owner", "rule"]) {
    assert.equal(typeof claim[field], "string", `${claim.id ?? "unknown"} missing ${field}`);
    assert.ok(claim[field].trim().length >= (field === "id" ? 4 : 5), `${claim.id} has an incomplete ${field}`);
  }
  assert.ok(!ids.has(claim.id), `duplicate claim ${claim.id}`);
  ids.add(claim.id);
}
for (const id of ["OBJ-1","OBJ-2","OBJ-3","OBJ-4","OBJ-5","RAG-1","NAV-1","UX-1","UX-2","OPS-1","FAC-1","INST-1","SCOPE-1","FUT-1"]) {
  assert.ok(ids.has(id), `required research claim ${id} is unmapped`);
}

const protocol = fs.readFileSync("docs/research/PROTOCOL.md", "utf8");
const analysis = fs.readFileSync("docs/research/ANALYSIS_PLAN.md", "utf8");
const dependencies = fs.readFileSync("docs/research/GOVERNANCE_DEPENDENCIES.md", "utf8");
for (const marker of ["RQ1", "RQ5", "counterbalanced within-subject crossover", "Inclusion:", "Exclusion:", "Protocol freeze", "Draft — pending advisor/institutional review"]) assert.match(protocol, new RegExp(marker, "i"));
for (const marker of ["Missing data", "effect sizes", "confidence intervals", "SUS", "zero reconciliation differences"]) assert.match(analysis, new RegExp(marker, "i"));
for (const marker of ["ethics/institutional review", "Consent text", "Power analysis", "Pending"]) assert.match(dependencies, new RegExp(marker, "i"));

console.log(JSON.stringify({status: "ok", mappedClaims: matrix.claims.length, protocolVersion: matrix.protocolVersion, protocolStatus: matrix.protocolStatus, externalGovernanceExplicit: true}));
