const encoder = new TextEncoder();

export function normalizeKnowledgeText(input) {
  return input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(h[1-6]|p|li|tr|section|article|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function estimateTokens(content) {
  const latinWords = content.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
  const cjk = content.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const punctuation = content.match(/[^\sA-Za-z0-9\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  return Math.max(1, Math.ceil(latinWords * 1.3 + cjk * 1.05 + punctuation * 0.25));
}

function splitOversized(value, maxCharacters) {
  if (value.length <= maxCharacters) return [value];
  const parts = [];
  let remaining = value;
  while (remaining.length > maxCharacters) {
    const candidates = [remaining.lastIndexOf("。", maxCharacters), remaining.lastIndexOf(".", maxCharacters), remaining.lastIndexOf("；", maxCharacters), remaining.lastIndexOf(";", maxCharacters), remaining.lastIndexOf(" ", maxCharacters)];
    const best = Math.max(...candidates);
    const at = best >= Math.floor(maxCharacters * 0.55) ? best + 1 : maxCharacters;
    parts.push(remaining.slice(0, at).trim());
    remaining = remaining.slice(at).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

export async function chunkKnowledgeText(input, options = {}) {
  const maxCharacters = Math.min(4_000, Math.max(600, options.maxCharacters ?? 1_600));
  const minCharacters = Math.min(maxCharacters, Math.max(120, options.minCharacters ?? 400));
  const normalized = normalizeKnowledgeText(input);
  if (!normalized) return [];
  const units = normalized.split("\n").flatMap((line) => splitOversized(line, maxCharacters));
  const groups = [];
  let current = "";
  for (const unit of units) {
    if (!current) { current = unit; continue; }
    if (current.length + 1 + unit.length <= maxCharacters) { current += `\n${unit}`; continue; }
    groups.push(current);
    current = unit;
  }
  if (current) groups.push(current);
  if (groups.length > 1 && groups.at(-1).length < minCharacters) {
    const tail = groups.pop();
    const previous = groups.pop();
    if (previous.length + 1 + tail.length <= 12_000) groups.push(`${previous}\n${tail}`);
    else groups.push(previous, tail);
  }
  return Promise.all(groups.map(async (content, ordinal) => {
    const contentChecksum = await sha256(content);
    return {chunkKey: `sha256:${contentChecksum.slice(0, 24)}`, headingPath: [], ordinal, content, contentChecksum, tokenCount: estimateTokens(content), sourceLocator: `text:${ordinal + 1}`};
  }));
}

export function canonicalizeHttpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Only HTTPS sources are accepted.");
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.port === "443") url.port = "";
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"]) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}

export function inferKnowledgeLanguage(value) {
  const cjk = value.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const latin = value.match(/[A-Za-z]/g)?.length ?? 0;
  if (cjk > 0 && latin > 0) return "mixed";
  return cjk > 0 ? "zh-Hant" : "en";
}
