import {
  clientResearchEnvironment,
  researchSession,
} from "../helpers/client-research-session.mjs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { database } from "../e2e/client-fixtures.mjs";

function required(result, message) {
  if (result.error) throw new Error(`${message}: ${result.error.message}`);
  if (!result.data) throw new Error(`${message}: no result`);
  return result.data;
}
const publicSessionToken = createHash("sha256")
  .update("client-rag-" + Date.now())
  .digest("hex");
async function askPublic(question) {
  const response = await fetch(
    `${process.env.RESEARCH_PUBLIC_BASE || "https://stdeduai.vercel.app"}/api/research-assistant`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        consentedResearchUse: false,
        sessionToken: publicSessionToken,
      }),
      signal: AbortSignal.timeout(60000),
    },
  );
  const body = await response.json();
  if (response.status !== 200)
    throw Error("Public assistant HTTP " + response.status);
  return body;
}
async function feedback(token, sessionToken) {
  return fetch(
    `${process.env.RESEARCH_PUBLIC_BASE || "https://stdeduai.vercel.app"}/api/research-feedback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedbackToken: token,
        sessionToken,
        helpful: true,
        resolvedNeed: true,
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
}
async function indexedVector(id) {
  const row = required(
    await owner
      .from("knowledge_chunks")
      .select("embedding")
      .eq("document_id", id)
      .order("ordinal")
      .limit(1)
      .single(),
    "indexed embedding",
  );
  const vector =
    typeof row.embedding === "string"
      ? JSON.parse(row.embedding)
      : row.embedding;
  if (!Array.isArray(vector) || vector.length !== 1536)
    throw Error("Embedding dimension mismatch");
  return vector;
}

Object.assign(process.env, await clientResearchEnvironment());
const session = await researchSession("owner");
const owner = session.db;
const auth = {
  data: { user: session.user, session: session.session },
  error: null,
};
const anon = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const suffix = Date.now().toString(36).toUpperCase();
const now = new Date();
const reviewDue = new Date(now.getTime() + 86_400_000).toISOString();
let sourceId = "",
  firstId = "",
  secondId = "",
  traceQueryId = "",
  cleanupTraceCount = 0;
let workflowError = null;
try {
  const source = required(
    await owner
      .from("knowledge_sources")
      .insert({
        name: `Ingestion verification ${suffix}`,
        source_type: "website",
        canonical_url: `https://www.stu.edu.tw/ingestion/${suffix.toLowerCase()}`,
        official_domain: true,
        authority_level: "primary_official",
        owner_profile_id: auth.data.user.id,
        default_audience_scope: "public",
        default_language: "mixed",
        crawl_policy: "manual",
        robots_reviewed_at: now.toISOString(),
        terms_reviewed_at: now.toISOString(),
        active: true,
      })
      .select("id")
      .single(),
    "create source",
  );
  sourceId = source.id;

  async function createVersion(version, content, supersedesId = null) {
    const response = await fetch(
      `${process.env.RESEARCH_PUBLIC_BASE || "https://stdeduai.vercel.app"}/api/knowledge-ingest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceId,
          title: "Verification policy",
          logicalKey: "verification-policy",
          sourceUrl: `https://www.stu.edu.tw/ingestion/${suffix.toLowerCase()}`,
          domain: "academic_rules",
          documentType: "text",
          language: "mixed",
          audienceScope: "public",
          sensitivity: "public",
          content,
          effectiveAt: now.toISOString(),
          reviewDueAt: reviewDue,
        }),
        signal: AbortSignal.timeout(90000),
      },
    );
    const body = await response.json();
    if (
      response.status !== 201 ||
      body.status !== "awaiting_review" ||
      !body.documentId
    )
      throw Error(
        "Governed API ingestion failed: " +
          response.status +
          " " +
          JSON.stringify(body),
      );
    const row = required(
      await owner
        .from("knowledge_documents")
        .select("id,version,supersedes_id,review_status,publication_status")
        .eq("id", body.documentId)
        .single(),
      "generated version",
    );
    if (
      row.version !== version ||
      row.supersedes_id !== supersedesId ||
      row.review_status !== "awaiting_review" ||
      row.publication_status !== "draft"
    )
      throw Error("Ingestion version/review boundary differs from expected");
    await indexedVector(row.id);
    return row.id;
  }

  firstId = await createVersion(
    1,
    `First verified guidance ${suffix}. 第一版官方指南。`,
  );
  required(
    await owner.rpc("publish_knowledge_document", {
      p_document_id: firstId,
      p_reason: "Reversible production publication verification.",
    }),
    "publish first version",
  );
  const firstQueryVector = await indexedVector(firstId);
  let search = required(
    await anon.rpc("search_public_knowledge", {
      p_query: `First verified guidance ${suffix}`,
      p_embedding: firstQueryVector,
      p_language: "en",
      p_domain: "academic_rules",
      p_limit: 5,
    }),
    "search first version",
  );
  if (!search.some((item) => item.document_id === firstId))
    throw new Error("Hybrid search did not return the eligible first version.");
  const publicAnswer = await askPublic(
    `What does the First verified guidance ${suffix} say?`,
  );
  if (
    publicAnswer.status !== "answered" ||
    !publicAnswer.citations?.length ||
    publicAnswer.citations.some(
      (citation) =>
        citation.url !==
        `https://www.stu.edu.tw/ingestion/${suffix.toLowerCase()}`,
    )
  )
    throw new Error(
      "The public assistant did not return a grounded official citation.",
    );
  if (!/^[0-9a-f]{64}$/.test(publicAnswer.feedback?.token || ""))
    throw new Error(
      "Public answer did not return an opaque feedback capability.",
    );
  // Resolve only this run's opaque capability for exact trace cleanup; do not
  // guess the server's private session-hash salt or select unrelated live traces.
  const sql = await database();
  try {
    const rows =
      await sql`select a.query_id from private.public_ai_feedback_tokens t join public.ai_answers a on a.id=t.answer_id where t.token_hash=${createHash("sha256").update(publicAnswer.feedback.token).digest("hex")}`;
    if (rows.length !== 1) throw Error("Missing exact verification trace");
    traceQueryId = rows[0].query_id;
  } finally {
    await sql.end();
  }
  const wrongSession = await feedback(
    publicAnswer.feedback.token,
    "x".repeat(64),
  );
  if (wrongSession.status !== 400)
    throw Error("Feedback session isolation failed");
  const recorded = await feedback(
    publicAnswer.feedback.token,
    publicSessionToken,
  );
  if (recorded.status !== 201) throw Error("One-use public feedback failed");
  const replay = await feedback(
    publicAnswer.feedback.token,
    publicSessionToken,
  );
  if (replay.status !== 400) throw Error("Feedback replay was accepted");
  const report = required(
    await owner.rpc("public_ai_trace_report", { p_days: 1 }),
    "protected trace report",
  );
  const trace = report.find((item) => item.query_id === traceQueryId);
  if (!trace || trace.retrieval_count < 1 || trace.citation_count < 1)
    throw new Error(
      "The reviewer report did not expose the connected content-free trace.",
    );
  const anonymousReport = await anon.rpc("public_ai_trace_report", {
    p_days: 1,
  });
  if (!anonymousReport.error)
    throw new Error("Anonymous trace report access succeeded.");
  let visible = await anon
    .from("knowledge_documents")
    .select("id")
    .eq("id", firstId)
    .maybeSingle();
  if (visible.error || visible.data?.id !== firstId)
    throw visible.error || new Error("First version was not publicly visible.");

  secondId = await createVersion(
    2,
    `Updated verified guidance ${suffix}. 第二版官方指南。`,
    firstId,
  );
  required(
    await owner.rpc("publish_knowledge_document", {
      p_document_id: secondId,
      p_reason: "Verify atomic supersession with a reviewed update.",
    }),
    "publish second version",
  );
  const versions = required(
    await owner
      .from("knowledge_documents")
      .select("id,publication_status")
      .in("id", [firstId, secondId]),
    "load version states",
  );
  if (
    versions.find((item) => item.id === firstId)?.publication_status !==
      "superseded" ||
    versions.find((item) => item.id === secondId)?.publication_status !==
      "published"
  )
    throw new Error("Atomic supersession state is incorrect.");
  const activeAfterPublish = required(
    await owner
      .from("knowledge_chunks")
      .select("document_id,active")
      .in("document_id", [firstId, secondId])
      .eq("active", true),
    "load active chunks",
  );
  if (
    !activeAfterPublish.length ||
    activeAfterPublish.some((item) => item.document_id !== secondId)
  )
    throw new Error("Mixed chunk versions entered the active index.");

  const expired = await owner
    .from("knowledge_documents")
    .update({ expires_at: new Date(Date.now() - 1_000).toISOString() })
    .eq("id", secondId);
  if (expired.error) throw expired.error;
  const secondQueryVector = await indexedVector(secondId);
  search = required(
    await anon.rpc("search_public_knowledge", {
      p_query: `Updated verified guidance ${suffix}`,
      p_embedding: secondQueryVector,
      p_language: "en",
      p_domain: "academic_rules",
      p_limit: 5,
    }),
    "search expired version",
  );
  if (search.some((item) => item.document_id === secondId))
    throw new Error("Expired content leaked through hybrid search.");
  visible = await anon
    .from("knowledge_documents")
    .select("id")
    .eq("id", secondId)
    .maybeSingle();
  if (visible.error || visible.data)
    throw (
      visible.error || new Error("Expired content remained publicly visible.")
    );
  required(
    await owner.rpc("rollback_knowledge_document", {
      p_document_id: firstId,
      p_reason: "Restore the prior reviewed version after expiry.",
    }),
    "rollback prior version",
  );
  search = required(
    await anon.rpc("search_public_knowledge", {
      p_query: `First verified guidance ${suffix}`,
      p_embedding: firstQueryVector,
      p_language: "en",
      p_domain: "academic_rules",
      p_limit: 5,
    }),
    "search restored version",
  );
  if (
    !search.some((item) => item.document_id === firstId) ||
    search.some((item) => item.document_id === secondId)
  )
    throw new Error(
      "Hybrid search did not atomically restore the prior version.",
    );
  const activeAfterRollback = required(
    await owner
      .from("knowledge_chunks")
      .select("document_id,active")
      .in("document_id", [firstId, secondId])
      .eq("active", true),
    "load rollback chunks",
  );
  if (
    !activeAfterRollback.length ||
    activeAfterRollback.some((item) => item.document_id !== firstId)
  )
    throw new Error("Rollback left a mixed active index.");
} catch (error) {
  workflowError = error;
} finally {
  if (sourceId) {
    const cleanup = await owner.rpc("purge_knowledge_verification_fixture", {
      p_source_id: sourceId,
    });
    cleanupTraceCount = Number(cleanup.data?.public_ai_traces || 0);
    if (
      (cleanup.error ||
        cleanup.data?.purged !== true ||
        cleanupTraceCount < 1) &&
      !workflowError
    )
      workflowError =
        cleanup.error ||
        new Error("Verification fixture trace cleanup failed.");
    if (traceQueryId) {
      const residue = await owner
        .from("ai_queries")
        .select("id")
        .eq("id", traceQueryId);
      if ((residue.error || residue.data.length) && !workflowError)
        workflowError =
          residue.error || new Error("Public AI trace cleanup left residue.");
    }
  }
  await owner.auth.signOut({ scope: "local" });
}
if (workflowError) throw workflowError;
console.log(
  JSON.stringify({
    openAiEmbeddingDimension: 1536,
    serverGeneratedChunks: true,
    hybridKeywordVectorExact: true,
    publicGroundedAnswer: true,
    atomicPrivacySafeTrace: true,
    feedbackCapability: "opaque-expiring-one-use-session-bound",
    feedbackReplay: 0,
    unauthorizedTraceReports: 0,
    connectedReviewerEvidence: true,
    fabricatedCitationIds: 0,
    reviewedPublication: true,
    atomicSupersession: true,
    expiredPublicLeakage: 0,
    hybridExpiredLeakage: 0,
    atomicRollback: true,
    mixedActiveVersions: 0,
    cleanedPublicAiTraces: cleanupTraceCount,
    residualAiTraces: 0,
    reversibleCleanup: true,
  }),
);
