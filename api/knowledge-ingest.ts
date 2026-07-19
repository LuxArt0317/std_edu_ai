import { createClient } from "@supabase/supabase-js";
import {
  canonicalizeHttpsUrl,
  inferKnowledgeLanguage,
  sha256,
  type KnowledgeLanguage,
} from "../server/knowledgePipeline.js";
import {
  acquireHttpsSource,
  chunkKnowledgeSections,
  detectAndExtractSource,
} from "../server/knowledgeAcquisition.js";
import { verifySupabaseRequest } from "../server/apiAuth.js";
import {
  classifyProviderFailure,
  estimatedEmbeddingCost,
  retryDelayMs,
  safeTelemetryCode,
} from "../server/ingestionTelemetry.js";

type ApiRequest = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};
type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};
type Domain =
  | "admissions"
  | "enrollment"
  | "graduation"
  | "academic_rules"
  | "programs"
  | "administrative_services"
  | "student_services"
  | "campus_places"
  | "faq"
  | "other";
type IngestRequest = {
  sourceId: string;
  title: string;
  logicalKey: string;
  sourceUrl: string;
  domain: Domain;
  documentType: string;
  language?: KnowledgeLanguage;
  content?: string;
  inputMode: "content" | "url" | "file";
  fileName?: string;
  fileMimeType?: string;
  fileBase64?: string;
  effectiveAt?: string | null;
  sourcePublishedAt?: string | null;
  sourceUpdatedAt?: string | null;
  expiresAt?: string | null;
  reviewDueAt?: string | null;
  audienceScope?: "public" | "institution" | "role" | "class" | "staff";
  audienceRoles?: string[];
  sectionId?: string | null;
  sensitivity?: "public" | "institution" | "restricted";
};

const allowedRoles = new Set(["owner", "admin", "librarian"]);
const domains = new Set<Domain>([
  "admissions",
  "enrollment",
  "graduation",
  "academic_rules",
  "programs",
  "administrative_services",
  "student_services",
  "campus_places",
  "faq",
  "other",
]);
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const config = { maxDuration: 60 };
const MAX_ATTEMPTS = 3;
const MAX_UPLOAD_BYTES = 3_000_000;

function header(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
function decodeBase64(value: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0)
    throw new Error("The uploaded file encoding is invalid.");
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES)
    throw new Error("Uploaded sources must be between 1 byte and 3 MB.");
  return bytes;
}
function parse(body: unknown): IngestRequest | null {
  let candidate = body;
  if (typeof body === "string") {
    try {
      candidate = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    return null;
  const v = candidate as Record<string, unknown>;
  if (typeof v.sourceId !== "string" || !uuid.test(v.sourceId)) return null;
  if (
    typeof v.title !== "string" ||
    v.title.trim().length < 2 ||
    v.title.length > 300
  )
    return null;
  if (
    typeof v.logicalKey !== "string" ||
    v.logicalKey.trim().length < 2 ||
    v.logicalKey.length > 240
  )
    return null;
  if (
    typeof v.sourceUrl !== "string" ||
    typeof v.domain !== "string" ||
    !domains.has(v.domain as Domain)
  )
    return null;
  if (
    typeof v.documentType !== "string" ||
    !v.documentType.trim() ||
    v.documentType.length > 80
  )
    return null;
  const inputMode = v.inputMode ?? "content";
  if (inputMode !== "content" && inputMode !== "url" && inputMode !== "file")
    return null;
  if (
    inputMode === "content" &&
    (typeof v.content !== "string" ||
      v.content.trim().length < 2 ||
      v.content.length > 500_000)
  )
    return null;
  if (
    inputMode === "file" &&
    (typeof v.fileName !== "string" ||
      !v.fileName.trim() ||
      v.fileName.length > 240 ||
      typeof v.fileMimeType !== "string" ||
      typeof v.fileBase64 !== "string" ||
      !v.fileBase64 ||
      v.fileBase64.length > Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 8)
  )
    return null;
  const language = v.language;
  if (
    language !== undefined &&
    language !== "zh-Hant" &&
    language !== "en" &&
    language !== "mixed"
  )
    return null;
  const audienceScope = v.audienceScope ?? "public";
  if (
    !["public", "institution", "role", "class", "staff"].includes(
      String(audienceScope),
    )
  )
    return null;
  const audienceRoles = Array.isArray(v.audienceRoles)
    ? v.audienceRoles
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.slice(0, 80))
    : [];
  const sectionId =
    typeof v.sectionId === "string" && uuid.test(v.sectionId)
      ? v.sectionId
      : null;
  if (audienceScope === "role" && !audienceRoles.length) return null;
  if (audienceScope === "class" && !sectionId) return null;
  const sensitivity =
    v.sensitivity ?? (audienceScope === "public" ? "public" : "institution");
  if (!["public", "institution", "restricted"].includes(String(sensitivity)))
    return null;
  return {
    sourceId: v.sourceId,
    title: v.title.trim(),
    logicalKey: v.logicalKey.trim(),
    sourceUrl: v.sourceUrl,
    domain: v.domain as Domain,
    documentType: v.documentType.trim(),
    language: language as KnowledgeLanguage | undefined,
    content: typeof v.content === "string" ? v.content : undefined,
    inputMode,
    fileName: typeof v.fileName === "string" ? v.fileName.trim() : undefined,
    fileMimeType:
      typeof v.fileMimeType === "string" ? v.fileMimeType : undefined,
    fileBase64: typeof v.fileBase64 === "string" ? v.fileBase64 : undefined,
    effectiveAt: typeof v.effectiveAt === "string" ? v.effectiveAt : null,
    sourcePublishedAt:
      typeof v.sourcePublishedAt === "string" ? v.sourcePublishedAt : null,
    sourceUpdatedAt:
      typeof v.sourceUpdatedAt === "string" ? v.sourceUpdatedAt : null,
    expiresAt: typeof v.expiresAt === "string" ? v.expiresAt : null,
    reviewDueAt: typeof v.reviewDueAt === "string" ? v.reviewDueAt : null,
    audienceScope: audienceScope as IngestRequest["audienceScope"],
    audienceRoles,
    sectionId,
    sensitivity: sensitivity as IngestRequest["sensitivity"],
  };
}

function setHeaders(response: ApiResponse) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

export default async function handler(
  request: ApiRequest,
  response: ApiResponse,
) {
  setHeaders(response);
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }
  const auth = await verifySupabaseRequest(request);
  if (auth.ok === false) {
    response.status(auth.status).json({ error: auth.message });
    return;
  }
  if (!allowedRoles.has(auth.user.role)) {
    response
      .status(403)
      .json({
        error:
          "Knowledge ingestion requires owner, administrator, or librarian review authority.",
      });
    return;
  }
  const input = parse(request.body);
  if (!input) {
    response
      .status(400)
      .json({ error: "A valid governed document payload is required." });
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const publishableKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;
  const authorization = header(request.headers.authorization);
  if (!apiKey || !supabaseUrl || !publishableKey || !authorization) {
    response
      .status(503)
      .json({ error: "Knowledge ingestion is not fully configured." });
    return;
  }

  let sourceUrl: string;
  try {
    sourceUrl = canonicalizeHttpsUrl(input.sourceUrl);
  } catch (error) {
    response
      .status(400)
      .json({
        error: error instanceof Error ? error.message : "Invalid source URL.",
      });
    return;
  }
  const client = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const requestStarted = Date.now();
  let runId = "";
  let documentId = "";
  let submittedForReview = false;
  let failureStage: "fetch" | "parse" | "embedding" = "fetch";
  try {
    const source = await client
      .from("knowledge_sources")
      .select("id,active,canonical_url")
      .eq("id", input.sourceId)
      .single();
    if (source.error || !source.data)
      throw new Error(
        source.error?.message || "The governed source does not exist.",
      );
    if (!source.data.active)
      throw new Error(
        "The governed source is inactive and cannot be ingested.",
      );
    const sourceHost = new URL(
      source.data.canonical_url,
    ).hostname.toLowerCase();
    if (
      input.inputMode === "url" &&
      new URL(sourceUrl).hostname.toLowerCase() !== sourceHost
    )
      throw new Error("The acquired URL must use the governed source host.");

    const runStarted = Date.now();
    const model =
      process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
    const costRate = Math.max(
      0,
      Number(process.env.OPENAI_EMBEDDING_COST_PER_MILLION_TOKENS || 0),
    );
    const rawInputChecksum = await sha256(
      input.inputMode === "content"
        ? input.content || ""
        : input.inputMode === "file"
          ? input.fileBase64 || ""
          : sourceUrl,
    );
    const run = await client
      .from("knowledge_ingestion_runs")
      .insert({
        source_id: input.sourceId,
        requested_by: auth.user.id,
        trigger_type: "manual",
        status: "discovered",
        input_checksum: rawInputChecksum,
        parser_version: "pending",
        chunker_version: "stu-structured-deterministic@1",
        embedding_model: model,
        attempt_count: 0,
        max_attempts: MAX_ATTEMPTS,
        discovered_count: 1,
        cost_rate_usd_per_million: costRate,
        cost_estimation_status: costRate > 0 ? "configured" : "unconfigured",
        last_heartbeat_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (run.error || !run.data)
      throw new Error(run.error?.message || "Could not start ingestion.");
    runId = run.data.id;

    let bytes: Uint8Array;
    let mimeType: string;
    let finalSourceUrl = sourceUrl;
    let fetchMs = 0;
    if (input.inputMode === "url") {
      const fetchStarted = Date.now();
      const acquired = await acquireHttpsSource(sourceUrl);
      fetchMs = Date.now() - fetchStarted;
      if (new URL(acquired.finalUrl).hostname.toLowerCase() !== sourceHost)
        throw new Error("A source redirect left the governed source host.");
      bytes = acquired.bytes;
      mimeType = acquired.mimeType;
      finalSourceUrl = canonicalizeHttpsUrl(acquired.finalUrl);
    } else if (input.inputMode === "file") {
      bytes = decodeBase64(input.fileBase64 || "");
      mimeType = input.fileMimeType || "application/octet-stream";
    } else {
      const content = input.content || "";
      bytes = Buffer.from(content, "utf8");
      mimeType = /<(?:html|body|main|article|h[1-6]|p|table)\b/i.test(content)
        ? "text/html"
        : input.documentType.toLowerCase().includes("markdown")
          ? "text/markdown"
          : "text/plain";
    }
    failureStage = "parse";
    const parseStarted = Date.now();
    const extracted = await detectAndExtractSource(
      bytes,
      mimeType,
      finalSourceUrl,
    );
    const chunks = await chunkKnowledgeSections(extracted.sections);
    const normalizationFinished = Date.now();
    if (!chunks.length)
      throw new Error(
        "No indexable content remained after structured normalization.",
      );
    const normalizedContent = extracted.sections
      .map((section) => section.content)
      .join("\n");
    const contentChecksum = await sha256(normalizedContent);
    const inputTokens = chunks.reduce(
      (sum, chunk) => sum + chunk.tokenCount,
      0,
    );
    const normalizedRun = await client
      .from("knowledge_ingestion_runs")
      .update({
        status: "normalized",
        output_checksum: contentChecksum,
        parser_version: extracted.parserVersion,
        chunker_version: "stu-structured-deterministic@1",
        chunk_count: chunks.length,
        input_token_count: inputTokens,
        last_heartbeat_at: new Date().toISOString(),
      })
      .eq("id", runId);
    if (normalizedRun.error) throw normalizedRun.error;

    const existing = await client
      .from("knowledge_documents")
      .select("id,version,publication_status")
      .eq("source_id", input.sourceId)
      .eq("content_checksum", contentChecksum)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) {
      const deduplicated = await client
        .from("knowledge_ingestion_runs")
        .update({
          status: "deduplicated",
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - runStarted,
        })
        .eq("id", runId);
      if (deduplicated.error) throw deduplicated.error;
      response
        .status(200)
        .json({
          status: "deduplicated",
          documentId: existing.data.id,
          version: existing.data.version,
          publicationStatus: existing.data.publication_status,
          checksum: contentChecksum,
          ingestionRunId: runId,
        });
      return;
    }

    const previous = await client
      .from("knowledge_documents")
      .select("id,version")
      .eq("source_id", input.sourceId)
      .eq("logical_key", input.logicalKey)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previous.error) throw new Error(previous.error.message);
    const language =
      input.language || inferKnowledgeLanguage(normalizedContent);
    const document = await client
      .from("knowledge_documents")
      .insert({
        source_id: input.sourceId,
        logical_key: input.logicalKey,
        title: input.title,
        domain: input.domain,
        document_type: input.documentType,
        language,
        source_url: finalSourceUrl,
        content_checksum: contentChecksum,
        source_published_at: input.sourcePublishedAt,
        source_updated_at: input.sourceUpdatedAt,
        effective_at: input.effectiveAt,
        expires_at: input.expiresAt,
        version: (previous.data?.version ?? 0) + 1,
        supersedes_id: previous.data?.id ?? null,
        extraction_status: "normalized",
        review_status: "awaiting_review",
        publication_status: "draft",
        sensitivity: input.sensitivity,
        audience_scope: input.audienceScope,
        audience_roles: input.audienceRoles,
        section_id: input.sectionId,
        owner_profile_id: auth.user.id,
        review_due_at: input.reviewDueAt,
        normalized_content: normalizedContent,
        metadata: {
          ingestion_run_id: runId,
          input_mode: input.inputMode,
          acquired_file_name: input.fileName || null,
          extracted_title: extracted.title || null,
          extracted_mime_type: extracted.mimeType,
          page_count: extracted.pageCount || null,
          parser_version: extracted.parserVersion,
          chunker_version: "stu-structured-deterministic@1",
        },
      })
      .select("id,version")
      .single();
    if (document.error || !document.data)
      throw new Error(
        document.error?.message || "Could not create document version.",
      );
    documentId = document.data.id;

    failureStage = "embedding";
    let embeddingPayload: unknown;
    let providerUsageTokens = inputTokens;
    let embeddingMs = 0;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const attemptStarted = Date.now();
      const attemptRow = await client
        .from("knowledge_ingestion_attempts")
        .insert({
          run_id: runId,
          attempt_number: attempt,
          state: "running",
          model,
          chunk_count: chunks.length,
          input_token_count: inputTokens,
          fetch_ms: fetchMs,
          normalize_ms: Math.max(0, normalizationFinished - parseStarted),
        })
        .select("id")
        .single();
      if (attemptRow.error || !attemptRow.data)
        throw new Error(
          attemptRow.error?.message || "Could not record ingestion attempt.",
        );
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Math.max(5000, Math.floor(40000 / MAX_ATTEMPTS)),
      );
      let status: number | undefined;
      let providerRequestHash: string | null = null;
      try {
        const embeddingResponse = await fetch(
          "https://api.openai.com/v1/embeddings",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              dimensions: 1536,
              input: chunks.map((chunk) => chunk.content),
            }),
            signal: controller.signal,
          },
        );
        status = embeddingResponse.status;
        const requestId = embeddingResponse.headers.get("x-request-id");
        providerRequestHash = requestId ? await sha256(requestId) : null;
        embeddingPayload = await embeddingResponse.json();
        if (!embeddingResponse.ok) {
          const classified = classifyProviderFailure(status);
          throw Object.assign(
            new Error("Embedding provider rejected the indexing request."),
            classified,
          );
        }
        providerUsageTokens =
          Number(
            (embeddingPayload as { usage?: { total_tokens?: number } }).usage
              ?.total_tokens,
          ) || inputTokens;
        embeddingMs = Date.now() - attemptStarted;
        const completed = await client
          .from("knowledge_ingestion_attempts")
          .update({
            state: "succeeded",
            finished_at: new Date().toISOString(),
            embedding_ms: embeddingMs,
            input_token_count: providerUsageTokens,
            estimated_cost_usd: estimatedEmbeddingCost(
              providerUsageTokens,
              costRate,
            ),
            provider_request_id_hash: providerRequestHash,
          })
          .eq("id", attemptRow.data.id);
        if (completed.error) throw completed.error;
        const runProgress = await client
          .from("knowledge_ingestion_runs")
          .update({
            attempt_count: attempt,
            input_token_count: providerUsageTokens,
            estimated_cost_usd: estimatedEmbeddingCost(
              providerUsageTokens,
              costRate,
            ),
            last_heartbeat_at: new Date().toISOString(),
            next_retry_at: null,
          })
          .eq("id", runId);
        if (runProgress.error) throw runProgress.error;
        break;
      } catch (error) {
        const embedded = error as Error & {
          retryable?: boolean;
          failureClass?: string;
          failureCode?: string;
        };
        const classified = embedded.failureClass
          ? {
              retryable: Boolean(embedded.retryable),
              failureClass: embedded.failureClass,
              failureCode: embedded.failureCode || "PROVIDER_FAILURE",
            }
          : classifyProviderFailure(status, embedded);
        const final = !classified.retryable || attempt === MAX_ATTEMPTS;
        const delay = final ? 0 : retryDelayMs(attempt);
        const attemptFailure = await client
          .from("knowledge_ingestion_attempts")
          .update({
            state: final
              ? classified.retryable
                ? "dead_letter"
                : "permanent_failure"
              : "transient_failure",
            failure_class: classified.failureClass,
            failure_code: safeTelemetryCode(classified.failureCode),
            finished_at: new Date().toISOString(),
            embedding_ms: Date.now() - attemptStarted,
            retry_delay_ms: delay,
            provider_request_id_hash: providerRequestHash,
          })
          .eq("id", attemptRow.data.id);
        if (attemptFailure.error) throw attemptFailure.error;
        const runFailure = await client
          .from("knowledge_ingestion_runs")
          .update({
            attempt_count: attempt,
            last_heartbeat_at: new Date().toISOString(),
            next_retry_at: final
              ? null
              : new Date(Date.now() + delay).toISOString(),
            dead_lettered_at:
              final && classified.retryable ? new Date().toISOString() : null,
          })
          .eq("id", runId);
        if (runFailure.error) throw runFailure.error;
        if (final)
          throw new Error(
            classified.retryable
              ? "Embedding service remained unavailable after bounded retries."
              : "Embedding request was permanently rejected.",
          );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } finally {
        clearTimeout(timeout);
      }
    }
    const vectors = (
      embeddingPayload as {
        data?: Array<{ index?: number; embedding?: number[] }>;
      }
    ).data;
    if (!Array.isArray(vectors) || vectors.length !== chunks.length)
      throw new Error("Embedding provider returned an incomplete index.");
    const chunkRows = chunks.map((chunk, index) => {
      const vector = vectors.find((item) => item.index === index)?.embedding;
      if (!Array.isArray(vector) || vector.length !== 1536)
        throw new Error("Embedding dimensionality does not match the index.");
      return {
        document_id: document.data.id,
        chunk_key: chunk.chunkKey,
        heading_path: chunk.headingPath,
        ordinal: chunk.ordinal,
        content: chunk.content,
        content_checksum: chunk.contentChecksum,
        token_count: chunk.tokenCount,
        language,
        embedding: vector,
        embedding_model: model,
        source_locator: chunk.sourceLocator,
        metadata: { ingestion_run_id: runId },
        effective_at: input.effectiveAt,
        expires_at: input.expiresAt,
        active: false,
      };
    });
    const inserted = await client.from("knowledge_chunks").insert(chunkRows);
    if (inserted.error) throw new Error(inserted.error.message);
    const review = await client
      .from("knowledge_review_events")
      .insert({
        document_id: document.data.id,
        actor_profile_id: auth.user.id,
        action: "submitted",
        reason:
          "Submitted through the governed deterministic ingestion pipeline.",
        before_state: {},
        after_state: {
          review_status: "awaiting_review",
          publication_status: "draft",
          chunk_count: chunks.length,
        },
      });
    if (review.error) throw new Error(review.error.message);
    submittedForReview = true;
    const terminal = await client
      .from("knowledge_ingestion_runs")
      .update({
        status: "awaiting_review",
        published_count: 0,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - runStarted,
        input_token_count: providerUsageTokens,
        estimated_cost_usd: estimatedEmbeddingCost(
          providerUsageTokens,
          costRate,
        ),
        chunk_count: chunks.length,
        next_retry_at: null,
      })
      .eq("id", runId);
    if (terminal.error) throw terminal.error;
    response
      .status(201)
      .json({
        status: "awaiting_review",
        documentId: document.data.id,
        version: document.data.version,
        chunks: chunks.length,
        checksum: contentChecksum,
        ingestionRunId: runId,
      });
  } catch (error) {
    if (documentId && !submittedForReview) {
      await client
        .from("knowledge_chunks")
        .delete()
        .eq("document_id", documentId);
      await client.from("knowledge_documents").delete().eq("id", documentId);
    }
    if (runId)
      await client
        .from("knowledge_ingestion_runs")
        .update({
          status:
            failureStage === "fetch"
              ? "failed_fetch"
              : failureStage === "parse"
                ? "failed_parse"
                : "failed_embedding",
          failed_count: 1,
          error_code: `${failureStage.toUpperCase()}_FAILED`,
          error_message:
            "The governed ingestion attempt did not reach review. Inspect content-free operational telemetry.",
          finished_at: new Date().toISOString(),
          duration_ms: Math.max(0, Date.now() - requestStarted),
        })
        .eq("id", runId);
    response
      .status(502)
      .json({
        error:
          error instanceof Error
            ? error.message
            : "Knowledge ingestion failed.",
      });
  }
}
