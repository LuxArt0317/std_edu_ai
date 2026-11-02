import {
  clientResearchEnvironment,
  researchSession,
} from "../helpers/client-research-session.mjs";
import { createClient } from "@supabase/supabase-js";

async function login(role) {
  return (await researchSession(role)).db;
}
Object.assign(process.env, await clientResearchEnvironment());
const options = { auth: { persistSession: false, autoRefreshToken: false } },
  client = () =>
    createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      options,
    );

const [owner, librarian, support, student] = await Promise.all([
    login("owner"),
    login("librarian"),
    login("support"),
    login("student"),
  ]),
  anon = client();
const protectedTables = [
  "knowledge_source_candidates",
  "knowledge_chunks",
  "ai_queries",
  "ai_retrieval_results",
  "ai_answers",
  "ai_answer_citations",
  "ai_feedback",
  "ai_eval_datasets",
  "ai_eval_dataset_versions",
  "ai_eval_cases",
  "ai_eval_case_reviews",
  "ai_eval_runs",
  "ai_eval_results",
  "research_consent_records",
  "research_participant_tokens",
  "research_participants",
  "research_sessions",
  "research_task_attempts",
  "research_responses",
  "research_questionnaires",
  "research_questionnaire_items",
  "research_tasks",
  "research_study_versions",
  "administrative_workload_windows",
  "administrative_inquiry_metrics",
  "research_operational_events",
  "research_operational_alerts",
  "research_slo_definitions",
];
let anonymousExposures = 0,
  studentExposures = 0;
const ownerFailures = [],
  intentionallyOpaque = new Set(["research_participant_tokens"]);
for (const table of protectedTables) {
  const [a, s, o] = await Promise.all([
    anon.from(table).select("*").limit(1),
    student.from(table).select("*").limit(1),
    owner.from(table).select("*").limit(1),
  ]);
  if (!a.error && a.data?.length) anonymousExposures++;
  if (!s.error && s.data?.length) studentExposures++;
  if (o.error && !intentionallyOpaque.has(table))
    ownerFailures.push(`${table}:${o.error.message}`);
  if (!o.error && intentionallyOpaque.has(table))
    ownerFailures.push(`${table}:researchers must not read token hashes`);
}
const librarianEval = await librarian
    .from("ai_eval_datasets")
    .select("id")
    .limit(1),
  librarianKnowledge = await librarian
    .from("knowledge_chunks")
    .select("id")
    .limit(1),
  supportOps = await support
    .from("research_operational_events")
    .select("id")
    .limit(1),
  supportEval = await support.from("ai_eval_datasets").select("id").limit(1);
const nil = "00000000-0000-0000-0000-000000000000";
const publicRpcChecks = [
  await anon.rpc("public_research_study", {
    p_study_code: "NONEXISTENT-RLS-MATRIX",
    p_language: "en",
  }),
  await anon.rpc("get_research_session", {
    p_token: "x".repeat(64),
    p_language: "en",
  }),
];
const protectedRpcNames = [
  "research_sus_score",
  "research_anonymized_export",
  "research_operations_report",
  "knowledge_ingestion_operational_summary",
  "ai_eval_report",
  "administrative_workload_report",
  "upsert_stu_source_candidates",
  "review_stu_source_candidate",
  "stu_source_inventory_report",
];
const protectedRpcArgs = {
  research_sus_score: { p_session_id: nil, p_condition: "enhanced_platform" },
  research_anonymized_export: { p_study_id: nil },
  research_operations_report: {
    p_since: new Date(Date.now() - 3600000).toISOString(),
  },
  knowledge_ingestion_operational_summary: {
    p_since: new Date(Date.now() - 3600000).toISOString(),
  },
  ai_eval_report: { p_run_id: nil },
  administrative_workload_report: {
    p_study_id: nil,
    p_office_code: "RLS-MATRIX",
  },
  upsert_stu_source_candidates: { p_candidates: [] },
  review_stu_source_candidate: {
    p_candidate_id: nil,
    p_decision: "rejected",
    p_reason: "Unauthorized matrix decision.",
  },
  stu_source_inventory_report: {},
};
let anonymousRpcExecutions = 0,
  studentRpcExposures = 0;
for (const name of protectedRpcNames) {
  const [anonymousResult, studentResult] = await Promise.all([
    anon.rpc(name, protectedRpcArgs[name]),
    student.rpc(name, protectedRpcArgs[name]),
  ]);
  if (!anonymousResult.error) anonymousRpcExecutions++;
  if (
    !studentResult.error &&
    ((Array.isArray(studentResult.data) && studentResult.data.length) ||
      (!Array.isArray(studentResult.data) && studentResult.data !== null))
  )
    studentRpcExposures++;
}
await Promise.all([
  owner.auth.signOut({ scope: "local" }),
  librarian.auth.signOut({ scope: "local" }),
  support.auth.signOut({ scope: "local" }),
  student.auth.signOut({ scope: "local" }),
]);
if (
  publicRpcChecks[0].error ||
  !publicRpcChecks[1].error ||
  anonymousExposures ||
  studentExposures ||
  anonymousRpcExecutions ||
  studentRpcExposures ||
  ownerFailures.length ||
  librarianEval.error ||
  librarianKnowledge.error ||
  supportOps.error ||
  (!supportEval.error && supportEval.data?.length)
)
  throw new Error(
    JSON.stringify({
      publicStudyError: publicRpcChecks[0].error?.message,
      invalidTokenAccepted: !publicRpcChecks[1].error,
      anonymousExposures,
      studentExposures,
      anonymousRpcExecutions,
      studentRpcExposures,
      ownerFailures,
      librarianEval: librarianEval.error?.message,
      librarianKnowledge: librarianKnowledge.error?.message,
      supportOps: supportOps.error?.message,
      supportEvalRows: supportEval.data?.length,
    }),
  );
console.log(
  JSON.stringify({
    protectedTables: protectedTables.length,
    protectedRpcs: protectedRpcNames.length,
    publicRpcsChecked: publicRpcChecks.length,
    anonymousExposures,
    studentExposures,
    anonymousRpcExecutions,
    studentRpcExposures,
    ownerFailures: ownerFailures.length,
    librarianKnowledgeAccess: true,
    librarianEvaluationAccess: true,
    supportOperationsAccess: true,
    supportEvaluationExposure: 0,
  }),
);
