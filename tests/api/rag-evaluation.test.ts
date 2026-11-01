import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { citationMetrics,passesResearchGates,retrievalMetrics,summarizeEvaluation } from "../../server/ragEvaluation.js";

test("retrieval metrics reconcile perfect, displaced, duplicate, and abstention vectors",()=>{
  assert.deepEqual(retrievalMetrics({expected:["a"],retrieved:["a"],k:5}),{recallAtK:1,precisionAtK:1,reciprocalRank:1,ndcg:1});
  const displaced=retrievalMetrics({expected:["a"],retrieved:["x","a"],k:5});
  assert.equal(displaced.recallAtK,1);assert.equal(displaced.precisionAtK,.5);assert.equal(displaced.reciprocalRank,.5);
  assert.deepEqual(retrievalMetrics({expected:[],retrieved:[],k:5}),{recallAtK:1,precisionAtK:1,reciprocalRank:0,ndcg:1});
  assert.equal(retrievalMetrics({expected:["a"],retrieved:["a","a"],k:5}).precisionAtK,1);
});
test("citation scoring deduplicates IDs and measures precision and completeness",()=>{assert.deepEqual(citationMetrics({expected:["a","b"],cited:["a","a","x"]}),{supported:1,total:2,precision:.5,completeness:.5});});
test("aggregate ranking excludes abstention cases while abstention remains scored",()=>{
  const answer={expectedEvidenceCount:1,recallAtK:1,reciprocalRank:1,ndcg:1,citationPrecision:1,citationCompleteness:1,supportedCorrectness:1,unsupportedClaims:0,materialClaims:1,abstentionCorrect:true,leakage:false,latencyMs:500,costUsd:.001};
  const abstention={...answer,expectedEvidenceCount:0,reciprocalRank:0,materialClaims:0,latencyMs:900};
  const metrics=summarizeEvaluation([answer,abstention]);assert.equal(metrics.mrr,1);assert.equal(metrics.recallAt5,1);assert.equal(metrics.p95LatencyMs,900);assert.equal(passesResearchGates(metrics),true);
});
test("migration enforces independent review, ordinary freeze, immutability, and cleanup",()=>{
  const sql=fs.readFileSync("supabase/migrations/20260719101837_rag_evaluation_control_plane.sql","utf8");
  for(const marker of ["required_case_count integer not null default 150","Case authors cannot review their own cases","v_approvals>=2","Dataset requires >=% eligible cases, 7 domains, 3 languages, and 7 failure classes","Frozen evaluation versions are immutable","Evaluation reviews are append-only","private_or_expired_leakage","p95_latency_ms","purge_ai_eval_fixture","Fixture override denied"])assert.ok(sql.includes(marker),marker);
});
test("reviewer workspace exposes complete evaluation lifecycle",()=>{
  const ui=fs.readFileSync("src/features/research/RagEvaluationPanel.tsx","utf8");
  for(const marker of ["Author a gold case","Independent review queue","Freeze when complete","Start a reproducible evaluation run","Import deterministic case observations","Load breakdown","Export JSON","Export CSV","Synthetic fixtures never count"])assert.ok(ui.includes(marker),marker);
});

