import assert from "node:assert/strict";
import fs from "node:fs";

const path = "docs/research/stu-source-inventory.v1.json";
const inventory = JSON.parse(fs.readFileSync(path, "utf8"));
const expectedDomains = [
  "admissions",
  "enrollment",
  "graduation",
  "academic_rules",
  "programs",
  "administrative_services",
  "student_services",
  "campus_places",
  "faq",
  "forms_policies",
];
const allowedLanguages = new Set(["zh-Hant", "en", "mixed"]);
const allowedTypes = new Set(["website", "pdf", "form", "directory", "map", "policy", "service"]);
const allowedMethods = new Set(["official_navigation", "official_sitemap", "official_directory", "owner_submission", "scheduled_refresh"]);
const ids = new Set();
const identities = new Set();
const counts = Object.fromEntries(expectedDomains.map((domain) => [domain, 0]));

function officialUrl(value, field) {
  assert.equal(typeof value, "string", `${field} must be a URL`);
  const parsed = new URL(value);
  assert.equal(parsed.protocol, "https:", `${field} must use HTTPS`);
  assert.ok(parsed.hostname === "stu.edu.tw" || parsed.hostname.endsWith(".stu.edu.tw"), `${field} must use an official STU host`);
  assert.equal(parsed.hash, "", `${field} must not contain a fragment`);
  return parsed;
}
function identity(value) {
  const parsed = officialUrl(value, "canonical_url");
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

assert.equal(inventory.schemaVersion, 1);
assert.match(inventory.inventoryVersion, /^\d+\.\d+\.\d+$/);
assert.equal(inventory.status, "discovery_candidates_pending_stu_owner_review");
assert.deepEqual(inventory.requiredDomains, expectedDomains);
assert.equal(inventory.autoPublished, 0);
assert.ok(Array.isArray(inventory.limitations) && inventory.limitations.length >= 3);
assert.ok(Array.isArray(inventory.candidates));
assert.equal(inventory.sourceCount, inventory.candidates.length);
assert.equal(inventory.sourceCount, expectedDomains.length * 2);

for (const candidate of inventory.candidates) {
  assert.match(candidate.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(!ids.has(candidate.id), `duplicate candidate id ${candidate.id}`);
  ids.add(candidate.id);
  const canonical = officialUrl(candidate.canonical_url, `${candidate.id}.canonical_url`);
  const canonicalIdentity = identity(candidate.canonical_url);
  assert.ok(!identities.has(canonicalIdentity), `duplicate canonical identity ${canonicalIdentity}`);
  identities.add(canonicalIdentity);
  officialUrl(candidate.discovered_from, `${candidate.id}.discovered_from`);
  const final = officialUrl(candidate.final_url, `${candidate.id}.final_url`);
  assert.equal(final.hostname, canonical.hostname, `${candidate.id} redirected outside its official host`);
  assert.ok(expectedDomains.includes(candidate.inventory_domain), `${candidate.id} has unknown domain`);
  counts[candidate.inventory_domain] += 1;
  assert.ok(allowedLanguages.has(candidate.language), `${candidate.id} has unknown language`);
  assert.ok(allowedTypes.has(candidate.source_type), `${candidate.id} has unknown source type`);
  assert.ok(allowedMethods.has(candidate.discovery_method), `${candidate.id} has unknown discovery method`);
  assert.ok(candidate.title.trim().length >= 2);
  assert.ok(candidate.owning_unit.trim().length >= 2);
  assert.ok(candidate.evidence.trim().length >= 12);
  assert.ok(Number.isInteger(candidate.http_status) && candidate.http_status >= 100 && candidate.http_status <= 599);
  assert.ok(!("publication_status" in candidate), `${candidate.id} must not carry publication state`);
  assert.ok(!("source_id" in candidate), `${candidate.id} must not be linked before review`);
  assert.ok(!("reviewed_by" in candidate), `${candidate.id} must not claim review`);
}

assert.deepEqual(Object.keys(counts), expectedDomains);
assert.ok(Object.values(counts).every((count) => count === 2), "every research domain must have exactly two discovery candidates");

console.log(JSON.stringify({
  status: "ok",
  inventoryVersion: inventory.inventoryVersion,
  candidates: inventory.candidates.length,
  domainsCovered: Object.values(counts).filter(Boolean).length,
  candidatesPerDomain: 2,
  officialHttpsHosts: inventory.candidates.length,
  duplicateCanonicalIdentities: inventory.candidates.length - identities.size,
  autoPublished: inventory.autoPublished,
}));
