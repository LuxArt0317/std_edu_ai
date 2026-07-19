import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const foundation = fs.readFileSync(
  "supabase/migrations/20260719063425_research_completion_foundation.sql",
  "utf8",
);
const hardening = fs.readFileSync(
  "supabase/migrations/20260719064132_harden_research_data_api_privileges.sql",
  "utf8",
);
const schemaMap = fs.readFileSync("docs/RESEARCH_SYSTEM_SCHEMA.md", "utf8");

const tables = [
  "knowledge_sources", "knowledge_documents", "knowledge_chunks", "knowledge_ingestion_runs",
  "knowledge_review_events", "campus_sites", "campus_buildings", "campus_floors",
  "campus_places", "campus_place_aliases", "campus_nodes", "campus_edges",
  "campus_service_hours", "ai_queries", "ai_answers", "ai_retrieval_results",
  "ai_answer_citations", "ai_feedback", "ai_eval_cases", "ai_eval_runs", "ai_eval_results",
  "research_studies", "research_study_versions", "research_participants",
  "research_consent_records", "research_tasks", "research_sessions",
  "research_task_attempts", "research_questionnaires", "research_questionnaire_items",
  "research_responses", "administrative_inquiry_metrics",
] as const;

test("research completion schema creates and protects every connected entity", () => {
  for (const table of tables) {
    assert.match(foundation, new RegExp(`create table public\\.${table}\\b`));
    assert.match(foundation, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(schemaMap, new RegExp(`\\b${table}\\b`), `schema map missing ${table}`);
  }
});

test("authoritative retrieval preserves provenance, freshness, and citation identity", () => {
  assert.match(foundation, /knowledge_documents[\s\S]*source_id uuid not null references public\.knowledge_sources/);
  assert.match(foundation, /knowledge_chunks[\s\S]*document_id uuid not null references public\.knowledge_documents/);
  assert.match(foundation, /knowledge_chunks[\s\S]*embedding extensions\.vector\(1536\)/);
  assert.match(foundation, /ai_retrieval_results[\s\S]*chunk_id uuid not null references public\.knowledge_chunks/);
  assert.match(foundation, /ai_answer_citations[\s\S]*chunk_id uuid not null references public\.knowledge_chunks/);
  assert.match(foundation, /content_checksum text not null check \(content_checksum ~ '\^\[a-f0-9\]\{64\}\$'\)/);
});

test("campus graph and empirical study records remain relational, not opaque blobs", () => {
  for (const relationship of [
    /campus_buildings[\s\S]*site_id uuid not null references public\.campus_sites/,
    /campus_floors[\s\S]*building_id uuid not null references public\.campus_buildings/,
    /campus_places[\s\S]*floor_id uuid references public\.campus_floors/,
    /campus_edges[\s\S]*from_node_id uuid not null references public\.campus_nodes/,
    /research_study_versions[\s\S]*study_id uuid not null references public\.research_studies/,
    /research_consent_records[\s\S]*participant_id uuid not null references public\.research_participants/,
    /research_task_attempts[\s\S]*session_id uuid not null references public\.research_sessions/,
    /research_responses[\s\S]*item_id uuid not null references public\.research_questionnaire_items/,
  ]) assert.match(foundation, relationship);
  assert.match(foundation, /unique\(study_id, participant_code\)/);
  assert.match(foundation, /contact_ciphertext text/);
});

test("anonymous clients cannot query protected chunks, evaluations, or participant data", () => {
  for (const table of [
    "knowledge_chunks", "ai_eval_cases", "research_participants", "research_responses",
  ]) assert.match(hardening, new RegExp(`public\\.${table}`));
  assert.match(hardening, /from anon/);
  assert.match(hardening, /from public/);
  assert.doesNotMatch(foundation, /grant select[^;]*knowledge_chunks[^;]*to anon/);
});
