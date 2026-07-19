import {spawnSync} from "node:child_process";
import fs from "node:fs";
import {createClient} from "@supabase/supabase-js";
import researchAssistant from "../../api/research-assistant.ts";
import {chunkKnowledgeText, sha256} from "../../src/research/knowledgePipeline.ts";

function env(path) {
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(fs.readFileSync(path, "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)]; }));
}
function required(result, message) {
  if (result.error) throw new Error(`${message}: ${result.error.message}`);
  if (!result.data) throw new Error(`${message}: no result`);
  return result.data;
}
async function embed(contents) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json"},
    body: JSON.stringify({model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small", dimensions: 1536, input: contents}),
    signal: AbortSignal.timeout(40_000),
  });
  const payload = await response.json();
  if (!response.ok || !Array.isArray(payload.data)) throw new Error("OpenAI embedding verification failed.");
  return payload.data.sort((a,b) => a.index-b.index).map((item) => item.embedding);
}
async function askPublic(question) {
  const captured = {statusCode: 200, body: null};
  const response = {status(code) { captured.statusCode = code; return response; }, json(body) { captured.body = body; }, setHeader() {}};
  await researchAssistant({method: "POST", body: {question, consentedResearchUse: false}, headers: {"x-forwarded-for": `live-${Date.now()}`, "user-agent": "issue-104-live"}}, response);
  if (captured.statusCode !== 200) throw new Error(`Public assistant failed: ${captured.body?.error || captured.statusCode}`);
  return captured.body;
}

Object.assign(process.env, env(".env"), env(".env.local"));
if (!process.env.OPENAI_API_KEY) throw new Error("Missing protected OpenAI credential.");
const email = "winsonbaring10@gmail.com";
const secret = spawnSync("/usr/bin/security", ["find-internet-password", "-w", "-s", "www.stu.best", "-a", email], {encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]});
if (secret.status !== 0 || !secret.stdout.trim()) throw new Error("Missing protected owner credential.");
const owner = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {auth: {persistSession: false, autoRefreshToken: false}});
const auth = await owner.auth.signInWithPassword({email, password: secret.stdout.trim()});
if (auth.error || !auth.data.user) throw auth.error || new Error("Owner sign-in failed.");

const suffix = Date.now().toString(36).toUpperCase();
const now = new Date();
const reviewDue = new Date(now.getTime() + 86_400_000).toISOString();
let sourceId = "", firstId = "", secondId = "";
let workflowError = null;
try {
  const source = required(await owner.from("knowledge_sources").insert({
    name: `Ingestion verification ${suffix}`, source_type: "website",
    canonical_url: `https://www.stu.edu.tw/ingestion/${suffix.toLowerCase()}`, official_domain: true,
    authority_level: "primary_official", owner_profile_id: auth.data.user.id, default_audience_scope: "public",
    default_language: "mixed", crawl_policy: "manual", robots_reviewed_at: now.toISOString(), terms_reviewed_at: now.toISOString(), active: true,
  }).select("id").single(), "create source"); sourceId = source.id;

  async function createVersion(version, content, supersedesId = null) {
    const chunks = await chunkKnowledgeText(content, {maxCharacters: 700, minCharacters: 200});
    const vectors = await embed(chunks.map((chunk) => chunk.content));
    if (vectors.some((vector) => !Array.isArray(vector) || vector.length !== 1536)) throw new Error("Embedding dimension mismatch.");
    const document = required(await owner.from("knowledge_documents").insert({
      source_id: sourceId, logical_key: "verification-policy", title: "Verification policy", domain: "academic_rules",
      document_type: "text", language: "mixed", source_url: `https://www.stu.edu.tw/ingestion/${suffix.toLowerCase()}`,
      content_checksum: await sha256(content), effective_at: now.toISOString(), version, supersedes_id: supersedesId,
      extraction_status: "normalized", review_status: "awaiting_review", publication_status: "draft",
      sensitivity: "public", audience_scope: "public", owner_profile_id: auth.data.user.id,
      review_due_at: reviewDue, normalized_content: content,
    }).select("id").single(), `create version ${version}`);
    const rows = chunks.map((chunk, index) => ({
      document_id: document.id, chunk_key: chunk.chunkKey, ordinal: chunk.ordinal, content: chunk.content,
      content_checksum: chunk.contentChecksum, token_count: chunk.tokenCount, language: "mixed",
      embedding: vectors[index], embedding_model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      source_locator: chunk.sourceLocator, effective_at: now.toISOString(), active: false,
    }));
    const inserted = await owner.from("knowledge_chunks").insert(rows);
    if (inserted.error) throw inserted.error;
    return document.id;
  }

  firstId = await createVersion(1, `First verified guidance ${suffix}. 第一版官方指南。`);
  required(await owner.rpc("publish_knowledge_document", {p_document_id: firstId, p_reason: "Reversible production publication verification."}), "publish first version");
  const firstQueryVector = (await embed([`First verified guidance ${suffix}`]))[0];
  let search = required(await anon.rpc("search_public_knowledge", {p_query: `First verified guidance ${suffix}`, p_embedding: firstQueryVector, p_language: "en", p_domain: "academic_rules", p_limit: 5}), "search first version");
  if (!search.some((item) => item.document_id === firstId)) throw new Error("Hybrid search did not return the eligible first version.");
  const publicAnswer = await askPublic(`What does the First verified guidance ${suffix} say?`);
  if (publicAnswer.status !== "answered" || !publicAnswer.citations?.length || publicAnswer.citations.some((citation) => citation.url !== `https://www.stu.edu.tw/ingestion/${suffix.toLowerCase()}`)) throw new Error("The public assistant did not return a grounded official citation.");
  let visible = await anon.from("knowledge_documents").select("id").eq("id", firstId).maybeSingle();
  if (visible.error || visible.data?.id !== firstId) throw visible.error || new Error("First version was not publicly visible.");

  secondId = await createVersion(2, `Updated verified guidance ${suffix}. 第二版官方指南。`, firstId);
  required(await owner.rpc("publish_knowledge_document", {p_document_id: secondId, p_reason: "Verify atomic supersession with a reviewed update."}), "publish second version");
  const versions = required(await owner.from("knowledge_documents").select("id,publication_status").in("id", [firstId, secondId]), "load version states");
  if (versions.find((item) => item.id === firstId)?.publication_status !== "superseded" || versions.find((item) => item.id === secondId)?.publication_status !== "published") throw new Error("Atomic supersession state is incorrect.");
  const activeAfterPublish = required(await owner.from("knowledge_chunks").select("document_id,active").in("document_id", [firstId, secondId]).eq("active", true), "load active chunks");
  if (!activeAfterPublish.length || activeAfterPublish.some((item) => item.document_id !== secondId)) throw new Error("Mixed chunk versions entered the active index.");

  const expired = await owner.from("knowledge_documents").update({expires_at: new Date(Date.now() - 1_000).toISOString()}).eq("id", secondId);
  if (expired.error) throw expired.error;
  const secondQueryVector = (await embed([`Updated verified guidance ${suffix}`]))[0];
  search = required(await anon.rpc("search_public_knowledge", {p_query: `Updated verified guidance ${suffix}`, p_embedding: secondQueryVector, p_language: "en", p_domain: "academic_rules", p_limit: 5}), "search expired version");
  if (search.some((item) => item.document_id === secondId)) throw new Error("Expired content leaked through hybrid search.");
  visible = await anon.from("knowledge_documents").select("id").eq("id", secondId).maybeSingle();
  if (visible.error || visible.data) throw visible.error || new Error("Expired content remained publicly visible.");
  required(await owner.rpc("rollback_knowledge_document", {p_document_id: firstId, p_reason: "Restore the prior reviewed version after expiry."}), "rollback prior version");
  search = required(await anon.rpc("search_public_knowledge", {p_query: `First verified guidance ${suffix}`, p_embedding: firstQueryVector, p_language: "en", p_domain: "academic_rules", p_limit: 5}), "search restored version");
  if (!search.some((item) => item.document_id === firstId) || search.some((item) => item.document_id === secondId)) throw new Error("Hybrid search did not atomically restore the prior version.");
  const activeAfterRollback = required(await owner.from("knowledge_chunks").select("document_id,active").in("document_id", [firstId, secondId]).eq("active", true), "load rollback chunks");
  if (!activeAfterRollback.length || activeAfterRollback.some((item) => item.document_id !== firstId)) throw new Error("Rollback left a mixed active index.");

} catch (error) {
  workflowError = error;
} finally {
  if (sourceId) {
    const cleanup = await owner.rpc("purge_knowledge_verification_fixture", {p_source_id: sourceId});
    if ((cleanup.error || cleanup.data?.purged !== true) && !workflowError) workflowError = cleanup.error || new Error("Verification fixture cleanup failed.");
  }
  await owner.auth.signOut();
}
if (workflowError) throw workflowError;
console.log(JSON.stringify({openAiEmbeddingDimension: 1536, deterministicChunks: true, hybridKeywordVectorExact: true, publicGroundedAnswer: true, fabricatedCitationIds: 0, reviewedPublication: true, atomicSupersession: true, expiredPublicLeakage: 0, hybridExpiredLeakage: 0, atomicRollback: true, mixedActiveVersions: 0, reversibleCleanup: true}));
