export type ExtractedSection = { headingPath: string[]; content: string; sourceLocator: string }
export const MAX_ACQUISITION_BYTES: number
export const MAX_REDIRECTS: number
export const ACQUISITION_TIMEOUT_MS: number
export function isPublicAddress(address: string): boolean
export function validatePublicHttpsUrl(value: string, resolver?: Function): Promise<{ url: URL; addresses: Array<{ address: string; family: number }> }>
export function createPublicLookup(resolver?: Function): Function
export function acquireHttpsSource(value: string, options?: Record<string, unknown>): Promise<{ bytes: Uint8Array; mimeType: string; finalUrl: string; status: number }>
export function extractHtmlSections(html: string, sourceUrl: string): { title: string; sections: ExtractedSection[] }
export function extractTextSections(text: string, mimeType?: string): { title: string; sections: ExtractedSection[] }
export function extractPdfSections(bytes: Uint8Array): Promise<{ title: string; sections: ExtractedSection[]; pageCount: number }>
export function detectAndExtractSource(bytes: Uint8Array, declaredMimeType: string, sourceUrl?: string): Promise<{ title: string; sections: ExtractedSection[]; mimeType: string; parserVersion: string; pageCount?: number }>
export function chunkKnowledgeSections(sections: ExtractedSection[], options?: { maxCharacters?: number; minCharacters?: number }): Promise<Array<{ chunkKey: string; headingPath: string[]; ordinal: number; content: string; contentChecksum: string; tokenCount: number; sourceLocator: string }>>
