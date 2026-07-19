export type KnowledgeLanguage = "zh-Hant" | "en" | "mixed";
export type NormalizedChunk = {
  chunkKey: string;
  headingPath: string[];
  ordinal: number;
  content: string;
  contentChecksum: string;
  tokenCount: number;
  sourceLocator: string;
};
export function normalizeKnowledgeText(input: string): string;
export function sha256(value: string): Promise<string>;
export function chunkKnowledgeText(input: string, options?: {maxCharacters?: number; minCharacters?: number}): Promise<NormalizedChunk[]>;
export function canonicalizeHttpsUrl(value: string): string;
export function inferKnowledgeLanguage(value: string): KnowledgeLanguage;
