import {createClient} from "@supabase/supabase-js";
import {canonicalizeHttpsUrl, chunkKnowledgeText, inferKnowledgeLanguage, normalizeKnowledgeText, sha256, type KnowledgeLanguage} from "../src/research/knowledgePipeline.ts";
import {verifySupabaseRequest} from "../server/apiAuth.js";

type ApiRequest = {method?: string; body?: unknown; headers: Record<string, string | string[] | undefined>};
type ApiResponse = {status: (code: number) => ApiResponse; json: (body: unknown) => void; setHeader: (name: string, value: string) => void};
type Domain = "admissions"|"enrollment"|"graduation"|"academic_rules"|"programs"|"administrative_services"|"student_services"|"campus_places"|"faq"|"other";
type IngestRequest = {
  sourceId: string; title: string; logicalKey: string; sourceUrl: string; domain: Domain;
  documentType: string; language?: KnowledgeLanguage; content: string; effectiveAt?: string|null;
  expiresAt?: string|null; reviewDueAt?: string|null; audienceScope?: "public"|"institution"|"role"|"class"|"staff";
  audienceRoles?: string[]; sectionId?: string|null; sensitivity?: "public"|"institution"|"restricted";
};

const allowedRoles = new Set(["owner","admin","librarian"]);
const domains = new Set<Domain>(["admissions","enrollment","graduation","academic_rules","programs","administrative_services","student_services","campus_places","faq","other"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const config = {maxDuration: 60};

function header(value: string|string[]|undefined) { return Array.isArray(value) ? value[0] : value; }
function parse(body: unknown): IngestRequest|null {
  let candidate = body;
  if (typeof body === "string") { try { candidate = JSON.parse(body); } catch { return null; } }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const v = candidate as Record<string, unknown>;
  if (typeof v.sourceId !== "string" || !uuid.test(v.sourceId)) return null;
  if (typeof v.title !== "string" || v.title.trim().length < 2 || v.title.length > 300) return null;
  if (typeof v.logicalKey !== "string" || v.logicalKey.trim().length < 2 || v.logicalKey.length > 240) return null;
  if (typeof v.sourceUrl !== "string" || typeof v.domain !== "string" || !domains.has(v.domain as Domain)) return null;
  if (typeof v.documentType !== "string" || !v.documentType.trim() || v.documentType.length > 80) return null;
  if (typeof v.content !== "string" || v.content.trim().length < 2 || v.content.length > 500_000) return null;
  const language = v.language;
  if (language !== undefined && language !== "zh-Hant" && language !== "en" && language !== "mixed") return null;
  const audienceScope = v.audienceScope ?? "public";
  if (!["public","institution","role","class","staff"].includes(String(audienceScope))) return null;
  const audienceRoles = Array.isArray(v.audienceRoles) ? v.audienceRoles.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 80)) : [];
  const sectionId = typeof v.sectionId === "string" && uuid.test(v.sectionId) ? v.sectionId : null;
  if (audienceScope === "role" && !audienceRoles.length) return null;
  if (audienceScope === "class" && !sectionId) return null;
  const sensitivity = v.sensitivity ?? (audienceScope === "public" ? "public" : "institution");
  if (!["public","institution","restricted"].includes(String(sensitivity))) return null;
  return {
    sourceId: v.sourceId, title: v.title.trim(), logicalKey: v.logicalKey.trim(), sourceUrl: v.sourceUrl,
    domain: v.domain as Domain, documentType: v.documentType.trim(), language: language as KnowledgeLanguage|undefined,
    content: v.content, effectiveAt: typeof v.effectiveAt === "string" ? v.effectiveAt : null,
    expiresAt: typeof v.expiresAt === "string" ? v.expiresAt : null, reviewDueAt: typeof v.reviewDueAt === "string" ? v.reviewDueAt : null,
    audienceScope: audienceScope as IngestRequest["audienceScope"], audienceRoles, sectionId,
    sensitivity: sensitivity as IngestRequest["sensitivity"],
  };
}

function setHeaders(response: ApiResponse) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  setHeaders(response);
  if (request.method !== "POST") { response.setHeader("Allow", "POST"); response.status(405).json({error: "Method not allowed"}); return; }
  const auth = await verifySupabaseRequest(request);
  if (!auth.ok) { response.status(auth.status).json({error: auth.message}); return; }
  if (!allowedRoles.has(auth.user.role)) { response.status(403).json({error: "Knowledge ingestion requires owner, administrator, or librarian review authority."}); return; }
  const input = parse(request.body);
  if (!input) { response.status(400).json({error: "A valid governed document payload is required."}); return; }
  const apiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  const authorization = header(request.headers.authorization);
  if (!apiKey || !supabaseUrl || !publishableKey || !authorization) { response.status(503).json({error: "Knowledge ingestion is not fully configured."}); return; }

  let sourceUrl: string;
  try { sourceUrl = canonicalizeHttpsUrl(input.sourceUrl); }
  catch (error) { response.status(400).json({error: error instanceof Error ? error.message : "Invalid source URL."}); return; }
  const normalizedContent = normalizeKnowledgeText(input.content);
  const chunks = await chunkKnowledgeText(normalizedContent);
  if (!chunks.length) { response.status(400).json({error: "No indexable content remained after normalization."}); return; }
  const contentChecksum = await sha256(normalizedContent);
  const client = createClient(supabaseUrl, publishableKey, {global: {headers: {Authorization: authorization}}, auth: {persistSession: false, autoRefreshToken: false}});
  let runId = "";
  try {
    const source = await client.from("knowledge_sources").select("id,active").eq("id", input.sourceId).single();
    if (source.error || !source.data) throw new Error(source.error?.message || "The governed source does not exist.");
    const existing = await client.from("knowledge_documents").select("id,version,publication_status").eq("source_id", input.sourceId).eq("content_checksum", contentChecksum).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) { response.status(200).json({status: "deduplicated", documentId: existing.data.id, version: existing.data.version, publicationStatus: existing.data.publication_status, checksum: contentChecksum}); return; }

    const run = await client.from("knowledge_ingestion_runs").insert({
      source_id: input.sourceId, requested_by: auth.user.id, trigger_type: "manual", status: "normalized",
      input_checksum: contentChecksum, output_checksum: contentChecksum, parser_version: "stu-normalizer@1",
      chunker_version: "stu-deterministic@1", embedding_model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      attempt_count: 1, discovered_count: 1,
    }).select("id").single();
    if (run.error || !run.data) throw new Error(run.error?.message || "Could not start ingestion."); runId = run.data.id;

    const previous = await client.from("knowledge_documents").select("id,version").eq("source_id", input.sourceId).eq("logical_key", input.logicalKey).order("version", {ascending: false}).limit(1).maybeSingle();
    if (previous.error) throw new Error(previous.error.message);
    const language = input.language || inferKnowledgeLanguage(normalizedContent);
    const document = await client.from("knowledge_documents").insert({
      source_id: input.sourceId, logical_key: input.logicalKey, title: input.title, domain: input.domain,
      document_type: input.documentType, language, source_url: sourceUrl, content_checksum: contentChecksum,
      effective_at: input.effectiveAt, expires_at: input.expiresAt, version: (previous.data?.version ?? 0) + 1,
      supersedes_id: previous.data?.id ?? null, extraction_status: "normalized", review_status: "awaiting_review",
      publication_status: "draft", sensitivity: input.sensitivity, audience_scope: input.audienceScope,
      audience_roles: input.audienceRoles, section_id: input.sectionId, owner_profile_id: auth.user.id,
      review_due_at: input.reviewDueAt, normalized_content: normalizedContent,
      metadata: {ingestion_run_id: runId, parser_version: "stu-normalizer@1", chunker_version: "stu-deterministic@1"},
    }).select("id,version").single();
    if (document.error || !document.data) throw new Error(document.error?.message || "Could not create document version.");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 40_000);
    let embeddingPayload: unknown;
    try {
      const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST", headers: {Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json"},
        body: JSON.stringify({model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small", dimensions: 1536, input: chunks.map((chunk) => chunk.content)}),
        signal: controller.signal,
      });
      embeddingPayload = await embeddingResponse.json();
      if (!embeddingResponse.ok) throw new Error("Embedding provider rejected the indexing request.");
    } finally { clearTimeout(timeout); }
    const vectors = (embeddingPayload as {data?: Array<{index?: number; embedding?: number[]}>}).data;
    if (!Array.isArray(vectors) || vectors.length !== chunks.length) throw new Error("Embedding provider returned an incomplete index.");
    const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
    const chunkRows = chunks.map((chunk, index) => {
      const vector = vectors.find((item) => item.index === index)?.embedding;
      if (!Array.isArray(vector) || vector.length !== 1536) throw new Error("Embedding dimensionality does not match the index.");
      return {document_id: document.data.id, chunk_key: chunk.chunkKey, heading_path: chunk.headingPath, ordinal: chunk.ordinal, content: chunk.content, content_checksum: chunk.contentChecksum, token_count: chunk.tokenCount, language, embedding: vector, embedding_model: model, source_locator: chunk.sourceLocator, metadata: {ingestion_run_id: runId}, effective_at: input.effectiveAt, expires_at: input.expiresAt, active: false};
    });
    const inserted = await client.from("knowledge_chunks").insert(chunkRows);
    if (inserted.error) throw new Error(inserted.error.message);
    const review = await client.from("knowledge_review_events").insert({document_id: document.data.id, actor_profile_id: auth.user.id, action: "submitted", reason: "Submitted through the governed deterministic ingestion pipeline.", before_state: {}, after_state: {review_status: "awaiting_review", publication_status: "draft", chunk_count: chunks.length}});
    if (review.error) throw new Error(review.error.message);
    await client.from("knowledge_ingestion_runs").update({status: "awaiting_review", published_count: 0, finished_at: new Date().toISOString()}).eq("id", runId);
    response.status(201).json({status: "awaiting_review", documentId: document.data.id, version: document.data.version, chunks: chunks.length, checksum: contentChecksum, ingestionRunId: runId});
  } catch (error) {
    if (runId) await client.from("knowledge_ingestion_runs").update({status: "failed_embedding", failed_count: 1, error_code: "INGESTION_FAILED", error_message: error instanceof Error ? error.message.slice(0, 1000) : "Unknown ingestion failure", finished_at: new Date().toISOString()}).eq("id", runId);
    response.status(502).json({error: error instanceof Error ? error.message : "Knowledge ingestion failed."});
  }
}
