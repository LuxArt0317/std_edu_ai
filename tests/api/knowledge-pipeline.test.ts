import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {canonicalizeHttpsUrl, chunkKnowledgeText, inferKnowledgeLanguage, normalizeKnowledgeText, sha256} from "../../server/knowledgePipeline.js";
import {classifyProviderFailure,estimatedEmbeddingCost,retryDelayMs,safeTelemetryCode} from "../../server/ingestionTelemetry.js";

const endpoint = fs.readFileSync("api/knowledge-ingest.ts", "utf8");
const publication = fs.readFileSync("supabase/migrations/20260719070034_governed_knowledge_publication_rpc.sql", "utf8");
const cleanup = fs.readFileSync("supabase/migrations/20260719070410_knowledge_verification_fixture_cleanup.sql", "utf8");

test("knowledge normalization removes executable markup and remains deterministic", async () => {
  const input = "<style>.bad{}</style><h1>Admissions &amp; 入學</h1><script>steal()</script><p>Official guidance.</p>";
  const normalized = normalizeKnowledgeText(input);
  assert.equal(normalized, "Admissions & 入學\nOfficial guidance.");
  assert.equal(await sha256(normalized), await sha256(normalizeKnowledgeText(input)));
  assert.equal(inferKnowledgeLanguage(normalized), "mixed");
});

test("chunking is deterministic, bounded, ordered, and content addressed", async () => {
  const content = Array.from({length: 80}, (_, index) => `Section ${index + 1}. ${"Verified campus information ".repeat(5)}`).join("\n");
  const first = await chunkKnowledgeText(content, {maxCharacters: 700, minCharacters: 250});
  const second = await chunkKnowledgeText(content, {maxCharacters: 700, minCharacters: 250});
  assert.deepEqual(first, second);
  assert.ok(first.length > 1);
  for (const [index, chunk] of first.entries()) {
    assert.equal(chunk.ordinal, index);
    assert.ok(chunk.content.length <= 12_000);
    assert.match(chunk.chunkKey, /^sha256:[a-f0-9]{24}$/);
    assert.equal(chunk.contentChecksum.length, 64);
    assert.ok(chunk.tokenCount > 0);
  }
});

test("source URL canonicalization strips fragments and tracking without changing identity", () => {
  assert.equal(
    canonicalizeHttpsUrl("https://WWW.STU.EDU.TW/path?utm_source=test&b=2&a=1#section"),
    "https://www.stu.edu.tw/path?a=1&b=2",
  );
  assert.throws(() => canonicalizeHttpsUrl("http://www.stu.edu.tw/path"), /Only HTTPS/);
});

test("ingestion is bounded, role-gated, idempotent, embedded, and review-only", () => {
  for (const marker of [
    "allowedRoles", "500_000", "content_checksum", 'status: "deduplicated"',
    "text-embedding-3-small", "dimensions: 1536", "awaiting_review",
    "knowledge_review_events", "OPENAI_API_KEY",
  ]) assert.match(endpoint, new RegExp(marker));
  assert.doesNotMatch(endpoint, /publication_status:\s*"published"/);
});

test("publication and rollback atomically swap eligible embedded versions", () => {
  for (const marker of [
    "publish_knowledge_document", "rollback_knowledge_document", "for update",
    "Effective and review due dates are required", "Document has no embedded chunks",
    "set active=false", "set active=true", "publication_status='superseded'",
    "knowledge_review_events", "from public, anon",
  ]) assert.match(publication, new RegExp(marker));
});

test("live cleanup is owner-only and structurally restricted to named ingestion fixtures", () => {
  assert.match(cleanup, /private\.has_role\(array\['owner'\]\)/);
  assert.match(cleanup, /name not like 'Ingestion verification %'/);
  assert.match(cleanup, /canonical_url not like 'https:\/\/www\.stu\.edu\.tw\/ingestion\/%'/);
  assert.match(cleanup, /delete from public\.knowledge_review_events/);
  assert.match(cleanup, /revoke all on function public\.purge_knowledge_verification_fixture\(uuid\) from public, anon/);
});

test("ingestion retries are bounded, classified, content-free, and costed",()=>{
  assert.deepEqual(classifyProviderFailure(429),{retryable:true,failureClass:"rate_limit",failureCode:"PROVIDER_RATE_LIMIT"});
  assert.equal(classifyProviderFailure(400).retryable,false);assert.equal(classifyProviderFailure(503).failureClass,"provider_5xx");assert.equal(classifyProviderFailure(undefined,{name:"AbortError"}).failureClass,"timeout");
  assert.equal(retryDelayMs(2,()=>.5),1000);assert.equal(estimatedEmbeddingCost(1000,0.02),0.00002);assert.equal(safeTelemetryCode("bad secret/message"),"BAD_SECRET_MESSAGE");
  const telemetry=fs.readFileSync("supabase/migrations/20260719083702_knowledge_ingestion_operational_telemetry.sql","utf8");
  for(const marker of ["knowledge_ingestion_attempts","Attempt exceeds the configured retry ceiling","Only a transient failure may be retried","dead_letter","durationP50Ms","durationP95Ms","oldestBacklogSeconds","contains no document content, prompts, credentials, or raw provider payloads"])assert.ok(telemetry.includes(marker),`missing telemetry ${marker}`);
  for(const marker of ["MAX_ATTEMPTS=3","classifyProviderFailure","retryDelayMs","provider_request_id_hash","cost_estimation_status","Inspect content-free attempt telemetry"])assert.ok(endpoint.includes(marker),`endpoint missing telemetry ${marker}`);
});
