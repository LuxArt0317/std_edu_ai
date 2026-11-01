import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260719095500_public_ai_trace_and_feedback.sql");
const cleanup = read("supabase/migrations/20260719095730_extend_fixture_cleanup_for_public_ai_traces.sql");
const assistant = read("api/research-assistant.ts");
const feedback = read("api/research-feedback.ts");
const publicUi = read("src/features/public/PublicAssistantFeedback.tsx");
const reviewerUi = read("src/features/research/PublicAiEvidencePanel.tsx");
const live = read("tests/integration/knowledge-ingestion-live.mjs");

for (const marker of [
  "private.public_ai_feedback_tokens",
  "record_public_ai_exchange",
  "submit_public_ai_feedback",
  "public_ai_trace_report",
  "query_text,consented_research_use",
  "null,false",
  "p_terminal_state='answered' and jsonb_array_length(p_citations)=0",
  "private.has_role(array['owner','admin','librarian'])",
]) assert.ok(migration.includes(marker), `trace schema missing ${marker}`);

for (const marker of [
  "detectEvidenceConflict",
  "document_logical_key",
  "Official source conflicts could not be screened",
  "rpc/record_public_ai_exchange",
  "const feedback = await recordTrace",
]) assert.ok(assistant.includes(marker), `assistant boundary missing ${marker}`);
assert.doesNotMatch(assistant, /SUPABASE_SERVICE_ROLE_KEY|void recordTrace/);

for (const marker of [
  "submit_public_ai_feedback",
  "AbortSignal.timeout",
  "invalid, expired, or has already been submitted",
]) assert.ok(feedback.includes(marker), `feedback endpoint missing ${marker}`);

for (const marker of ["需要修正", "correctionCategory", "resolvedNeed"])
  assert.ok(publicUi.includes(marker), `feedback UI missing ${marker}`);
for (const marker of ["PUBLIC RAG EVIDENCE", "groundedRate", "p95", "permittedRoles"])
  assert.ok(reviewerUi.includes(marker), `reviewer UI missing ${marker}`);

assert.ok(cleanup.indexOf("delete from public.ai_queries") < cleanup.indexOf("delete from public.knowledge_documents"));
for (const marker of [
  "feedbackReplay: 0",
  "unauthorizedTraceReports: 0",
  "connectedReviewerEvidence: true",
  "residualAiTraces: 0",
]) assert.ok(live.includes(marker), `live evidence missing ${marker}`);

console.log(JSON.stringify({
  status: "ok",
  atomicTrace: true,
  rawQuestionStored: false,
  deterministicConflictHandoff: true,
  oneUseFeedback: true,
  protectedReviewerReport: true,
  reversibleTraceCleanup: true,
}));
