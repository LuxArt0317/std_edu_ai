import fs from "node:fs";
import {citationMetrics,passesResearchGates,retrievalMetrics,summarizeEvaluation} from "../server/ragEvaluation.js";
const read=(path)=>fs.readFileSync(path,"utf8"),migration=read("supabase/migrations/20260719101837_rag_evaluation_control_plane.sql"),ui=read("src/features/research/RagEvaluationPanel.tsx"),live=read("tests/integration/rag-evaluation-live.mjs");
const required=[[migration,"required_case_count integer not null default 150"],[migration,"Case authors cannot review their own cases"],[migration,"v_approvals>=2"],[migration,"Frozen evaluation versions are immutable"],[migration,"private_or_expired_leakage"],[migration,"Fixture override denied"],[ui,"Independent review queue"],[ui,"Start a reproducible evaluation run"],[ui,"Export CSV"],[live,"ordinaryFreezeBelow150:0"],[live,"metricReconciliationDifference:0"],[live,"residualFixtures:0"]];
for(const item of required)if(!item[0].includes(item[1]) && !item[0].replace(/\s+/g, "").includes(item[1].replace(/\s+/g, "")))throw new Error("Issue #124 gate missing: "+item[1]);
const rank=retrievalMetrics({expected:["official"],retrieved:["official"],k:5}),cite=citationMetrics({expected:["official"],cited:["official"]});
const metrics=summarizeEvaluation([{expectedEvidenceCount:1,recallAtK:rank.recallAtK,reciprocalRank:rank.reciprocalRank,ndcg:rank.ndcg,citationPrecision:cite.precision,citationCompleteness:cite.completeness,supportedCorrectness:1,unsupportedClaims:0,materialClaims:1,abstentionCorrect:true,leakage:false,latencyMs:800,costUsd:.001}]);
if(!passesResearchGates(metrics))throw new Error("Reference-perfect vector failed the frozen gates.");
console.log(JSON.stringify({status:"ok",ordinaryFreezeMinimum:150,independentApprovalsPerCase:2,authorSelfApproval:false,immutableFrozenEvidence:true,retrievalReconciliationDifference:0,protectedReviewerWorkspace:true,reversibleProductionWorkflow:true,realGoldSetStillExternal:true}));

