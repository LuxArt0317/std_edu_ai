import {
  clientResearchEnvironment,
  researchSession,
} from "../helpers/client-research-session.mjs";
import { createClient } from "@supabase/supabase-js";

function required(result, message) {
  if (result.error) throw new Error(`${message}: ${result.error.message}`);
  if (result.data === null || result.data === undefined)
    throw new Error(`${message}: no result`);
  return result.data;
}
Object.assign(process.env, await clientResearchEnvironment());
const session = await researchSession("owner");
const owner = session.db;
const auth = {
  data: { user: session.user, session: session.session },
  error: null,
};
const participant = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const suffix = Date.now().toString(36).toUpperCase();
const base = process.env.RESEARCH_BASE_URL || "https://stdeduai.vercel.app";
let studyId = "",
  versionId = "",
  taskId = "",
  questionnaireId = "";
let participantIds = [];
async function api(path, init = {}) {
  const response = await fetch(`${base}/api/research-session${path}`, init);
  const body = await response.json().catch(() => ({ error: "invalid JSON" }));
  return {
    response,
    body,
    cookie: (response.headers.get("set-cookie") || "").split(";")[0],
  };
}
try {
  studyId = required(
    await owner
      .from("research_studies")
      .insert({
        code: `STUDY-${suffix}`,
        title: "Synthetic research runner validation",
        purpose: "Validate infrastructure without recording human outcomes.",
        owner_profile_id: auth.data.user.id,
        status: "recruiting",
        retention_days: 30,
      })
      .select("id")
      .single(),
    "study",
  ).id;
  versionId = required(
    await owner
      .from("research_study_versions")
      .insert({
        study_id: studyId,
        version: 1,
        protocol: { synthetic: true },
        consent_text_zh: "我同意使用合成測試資料。",
        consent_text_en: "I consent to synthetic verification data.",
        analysis_plan: { outcomes: "none" },
        frozen_at: new Date().toISOString(),
        frozen_by: auth.data.user.id,
      })
      .select("id")
      .single(),
    "version",
  ).id;
  taskId = required(
    await owner
      .from("research_tasks")
      .insert({
        study_version_id: versionId,
        task_key: "find-office",
        domain: "campus_places",
        variant_a: "Use the current website to find the test office.",
        variant_b: "Use the enhanced platform to find the test office.",
        gold_answer: { synthetic_only: true },
        max_seconds: 120,
        ordinal: 0,
      })
      .select("id")
      .single(),
    "task",
  ).id;
  questionnaireId = required(
    await owner
      .from("research_questionnaires")
      .insert({
        study_version_id: versionId,
        instrument: "SUS",
        language: "en",
        version: "synthetic-1",
        scoring_spec: { formula: "standard" },
      })
      .select("id")
      .single(),
    "questionnaire",
  ).id;
  const items = required(
    await owner
      .from("research_questionnaire_items")
      .insert(
        Array.from({ length: 10 }, (_, index) => ({
          questionnaire_id: questionnaireId,
          item_key: `sus-${index + 1}`,
          ordinal: index + 1,
          prompt: `Synthetic SUS item ${index + 1}`,
          response_type: "likert5",
          reverse_scored: (index + 1) % 2 === 0,
          construct: "usability",
        })),
      )
      .select("id,ordinal"),
    "items",
  );
  const publicResponse = await api(`?study=STUDY-${suffix}&language=en`);
  const publicStudy = publicResponse.body;
  if (
    !publicResponse.response.ok ||
    publicStudy.taskCount !== 1 ||
    publicStudy.version !== 1 ||
    !publicStudy.consentText
  )
    throw new Error(
      `Frozen public study contract mismatch: ${publicResponse.response.status} ${JSON.stringify(publicStudy)}`,
    );
  const begins = [];
  for (let index = 0; index < 2; index++) {
    const result = await api("", {
      method: "POST",
      headers: { "content-type": "application/json", "x-stu-research": "1" },
      body: JSON.stringify({
        action: "start",
        studyCode: `STUDY-${suffix}`,
        studyVersionId: versionId,
        populationRole: "student",
        familiarityLevel: "new",
        consent: true,
      }),
    });
    if (
      result.response.status !== 201 ||
      !result.cookie.includes("stu_research_token=")
    )
      throw new Error(
        `API begin ${index} failed: ${JSON.stringify(result.body)}`,
      );
    begins.push({
      ...result.body,
      cookie: result.cookie,
      token: decodeURIComponent(result.cookie.split("=")[1]),
    });
  }
  if (
    begins
      .map((item) => item.sequence)
      .sort()
      .join(",") !== "AB,BA"
  )
    throw new Error("Counterbalancing difference exceeded one.");
  const rows = required(
    await owner
      .from("research_participants")
      .select("id,participant_code")
      .eq("study_id", studyId),
    "participant rows",
  );
  participantIds = rows.map((row) => row.id);
  const directTokens = await participant
    .from("research_participant_tokens")
    .select("token_hash");
  if (!directTokens.error)
    throw new Error(
      "Anonymous token hash table access unexpectedly succeeded.",
    );
  const call = async (begin, action) =>
    api("", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-stu-research": "1",
        cookie: begin.cookie,
      },
      body: JSON.stringify(action),
    });
  const resumedResult = await api("?language=en", {
    headers: { cookie: begins[0].cookie },
  });
  const resumed = resumedResult.body;
  if (
    !resumedResult.response.ok ||
    JSON.stringify(resumed).includes("synthetic_only") ||
    resumed.tasks.length !== 1 ||
    resumed.questionnaires[0].items.length !== 10
  )
    throw new Error("Session leaked gold answer or missed protocol entities.");
  for (const [condition, metrics] of [
    [
      "enhanced_platform",
      {
        success: "complete",
        durationMs: 1500,
        navigationSteps: 2,
        wrongPageVisits: 0,
        reformulations: 1,
        backtracks: 0,
        assistanceRequests: 0,
        sourceIdentificationCorrect: true,
        seqScore: 6,
      },
    ],
    [
      "current_site",
      {
        success: "complete",
        durationMs: 2200,
        navigationSteps: 4,
        wrongPageVisits: 1,
        reformulations: 0,
        backtracks: 1,
        assistanceRequests: 0,
        sourceIdentificationCorrect: true,
        seqScore: 4,
      },
    ],
  ]) {
    const result = await call(begins[0], {
      action: "attempt",
      taskId,
      condition,
      metrics,
    });
    if (!result.response.ok)
      throw new Error(`attempt API failed: ${JSON.stringify(result.body)}`);
  }
  for (const item of items)
    for (const condition of ["current_site", "enhanced_platform"]) {
      const result = await call(begins[0], {
        action: "response",
        itemId: item.id,
        condition,
        numericValue: item.ordinal % 2 === 1 ? 5 : 1,
        textValue: null,
      });
      if (!result.response.ok)
        throw new Error(`response API failed: ${JSON.stringify(result.body)}`);
    }
  const sessionId = begins[0].sessionId;
  const score = required(
    await owner.rpc("research_sus_score", {
      p_session_id: sessionId,
      p_condition: "enhanced_platform",
    }),
    "SUS score",
  );
  if (Number(score) !== 100)
    throw new Error(`Expected standard SUS 100, received ${score}`);
  const completion = await call(begins[0], { action: "complete" });
  const completedResult = await api("?language=en", {
    headers: { cookie: begins[0].cookie },
  });
  if (
    !completion.response.ok ||
    completedResult.body.sessionStatus !== "completed"
  )
    throw new Error("Complete session state was not persisted.");
  const exported = required(
    await owner.rpc("research_anonymized_export", { p_study_id: studyId }),
    "anonymized export",
  );
  const serialized = JSON.stringify(exported);
  for (const forbidden of [
    "contact_ciphertext",
    "profile_id",
    "token_hash",
    "ip_hash",
    begins[0].token,
    sessionId,
  ])
    if (serialized.includes(forbidden))
      throw new Error(`Export leaked forbidden value ${forbidden}`);
  const withdrawn = await call(begins[0], {
    action: "withdraw",
    deleteNow: false,
  });
  if (!withdrawn.response.ok) throw new Error("API withdrawal failed.");
  const blocked = await call(begins[0], {
    action: "attempt",
    taskId,
    condition: "current_site",
    metrics: { success: "complete", durationMs: 1 },
  });
  if (blocked.response.ok)
    throw new Error("Withdrawn token still accepted writes.");
  const deleted = await call(begins[1], {
    action: "withdraw",
    deleteNow: true,
  });
  if (!deleted.response.ok)
    throw new Error(
      `API immediate deletion failed: ${JSON.stringify(deleted.body)}`,
    );
  console.log(
    JSON.stringify({
      publicFrozenProtocol: true,
      goldAnswerLeakage: 0,
      tokenHashLeakage: 0,
      counterbalance: { AB: 1, BA: 1, difference: 0 },
      objectiveAttempts: 2,
      susStandardScore: Number(score),
      completionValidated: true,
      anonymizedExportSessions: exported.sessions.length,
      forbiddenExportFields: 0,
      withdrawalBlocksWrites: true,
      immediateDeletion: true,
      syntheticOnly: true,
    }),
  );
} finally {
  if (participantIds.length) {
    await owner
      .from("research_sessions")
      .delete()
      .in("participant_id", participantIds);
    await owner.from("research_participants").delete().in("id", participantIds);
  }
  if (versionId)
    await owner.from("research_study_versions").delete().eq("id", versionId);
  if (studyId) await owner.from("research_studies").delete().eq("id", studyId);
  await owner.auth.signOut({ scope: "local" });
}
