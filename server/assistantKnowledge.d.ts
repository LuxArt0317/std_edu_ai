export type KnowledgeEvidence = {
  chunk_id: string;
  document_id: string;
  source_id: string;
  document_title: string;
  document_domain: string;
  document_language: string;
  source_name: string;
  source_url: string;
  source_locator: string | null;
  reviewed_at: string | null;
  effective_at: string | null;
  content: string;
  keyword_score: number;
  vector_score: number;
  exact_score: number;
  fused_score: number;
  authority_level: string;
  document_version: number;
  content_checksum: string;
};
export function searchAssistantKnowledge(
  question: string,
  options?: { authorization?: string },
): Promise<{ evidence: KnowledgeEvidence[]; degraded: boolean }>;
export function knowledgeCitations(
  evidence: KnowledgeEvidence[],
): {
  chunkId: string;
  title: string;
  sourceName: string;
  url: string;
  locator: string | null;
  reviewedAt: string | null;
  effectiveAt: string | null;
}[];

export function expandKnowledgeQuery(question: string): string;
