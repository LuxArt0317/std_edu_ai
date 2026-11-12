import { acquireHttpsSource, detectAndExtractSource } from './knowledgeAcquisition.js';
import { safeWebSource } from './schoolWebSearch.js';

/** Independently read the cited pages. Search-produced URLs are not claim evidence. */
export async function readVerificationSources(citations, deadline) {
  const unique = [...new Map(citations.map(item => [item.url, item])).values()].slice(0, 4);
  const results = await Promise.allSettled(unique.map(async citation => {
    const url = safeWebSource(citation.url);
    if (!url || deadline - Date.now() < 1500) throw new Error('No public source');
    const acquired = await acquireHttpsSource(url, { timeoutMs: Math.min(5000, deadline - Date.now()) });
    const extracted = await detectAndExtractSource(acquired.bytes, acquired.mimeType, acquired.finalUrl);
    const content = extracted.sections.map(section => section.content).join('\n').slice(0, 16000);
    if (!content.trim()) throw new Error('Source has no readable content');
    return { id: citation.chunkId, content, url: citation.url, title: citation.title };
  }));
  return results.filter(result => result.status === 'fulfilled').map(result => result.value);
}
