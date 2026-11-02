import { callerRest } from "./assistantContext.js";
import { inferKnowledgeLanguage } from "./knowledgePipeline.js";

export function expandKnowledgeQuery(question) {
  const aliases = [];
  if (/registrar|註冊|教務/.test(question.toLowerCase()))
    aliases.push("registrar 註冊課務組");
  if (/announcement|news|公告|消息/.test(question.toLowerCase()))
    aliases.push("announcement 公告 校園新聞");
  if (/subject|course|課程|科目|課表/.test(question.toLowerCase()))
    aliases.push("course 課程學習");
  if (/scholarship|loan|助學|獎學|貸款/.test(question.toLowerCase()))
    aliases.push("scholarship loan 獎助學金資源");
  return [question, ...aliases].join(" ").slice(0, 2000);
}
export async function searchAssistantKnowledge(question, options = {}) {
  const query = String(question).trim().slice(0, 2000);
  let embedding = null;
  let degraded = false;
  try {
    const result = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
        dimensions: 1536,
        input: query,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    const value = await result.json();
    if (
      !result.ok ||
      !Array.isArray(value.data?.[0]?.embedding) ||
      value.data[0].embedding.length !== 1536
    )
      throw new Error("Embedding unavailable");
    embedding = value.data[0].embedding;
  } catch {
    degraded = true;
  }
  const rows = await callerRest(
    `rpc/${options.authorization ? "search_assistant_knowledge" : "search_public_knowledge"}`,
    options.authorization,
    {
      method: "POST",
      body: JSON.stringify({
        p_query: expandKnowledgeQuery(query),
        p_embedding: embedding,
        p_language: inferKnowledgeLanguage(query),
        p_domain: null,
        p_limit: 8,
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!Array.isArray(rows)) throw new Error("Knowledge results are invalid.");
  const evidence = rows
    .filter(
      (row) =>
        row.exact_score > 0 ||
        row.keyword_score > 0 ||
        row.vector_score >= 0.42,
    )
    .slice(0, 8);
  return { evidence, degraded };
}
export function knowledgeCitations(evidence) {
  return evidence.map((item) => ({
    chunkId: item.chunk_id,
    title: item.document_title,
    sourceName: item.source_name,
    url: item.source_url,
    locator: item.source_locator,
    reviewedAt: item.reviewed_at,
    effectiveAt: item.effective_at,
  }));
}
