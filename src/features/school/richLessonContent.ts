const blockTags = new Set([
  "H2", "H3", "P", "UL", "OL", "LI", "BLOCKQUOTE", "DIV", "FIGURE",
]);
const allowedTags = new Set([
  ...blockTags, "STRONG", "EM", "A", "IMG", "IFRAME", "VIDEO", "SOURCE", "BR", "HR",
]);

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function inlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

export function lessonMarkdownToHtml(markdown: string) {
  const output: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => {
    if (list) output.push(`</${list}>`);
    list = null;
  };
  const expanded = markdown
    .replaceAll("\r\n", "\n")
    // Models occasionally flatten otherwise valid Markdown into one long line.
    // Recover the block boundaries before converting so no literal heading or
    // list markers reach the Tiptap document.
    .replace(/\s+(#{2,3})\s+/g, "\n$1 ")
    .replace(/\s+(\d+[.)])\s+(?=(?:\*\*)?[A-Z])/g, "\n$1 ")
    .replace(/\s+([-*])\s+(?=[A-Z])/g, "\n$1 ");
  for (const rawLine of expanded.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (/^<\/?[a-z][\s\S]*>$/i.test(line)) {
      closeList();
      output.push(line);
      continue;
    }
    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    if (heading) {
      closeList();
      output.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || ordered) {
      const kind = bullet ? "ul" : "ol";
      if (list !== kind) {
        closeList();
        list = kind;
        output.push(`<${kind}>`);
      }
      output.push(`<li>${inlineMarkdown((bullet ?? ordered)![1])}</li>`);
      continue;
    }
    if (line.startsWith("> ")) {
      closeList();
      output.push(`<blockquote><p>${inlineMarkdown(line.slice(2))}</p></blockquote>`);
      continue;
    }
    closeList();
    output.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  closeList();
  return output.join("");
}

function safeHttps(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function safeVideo(value: string) {
  const href = safeHttps(value);
  if (!href) return "";
  const url = new URL(href);
  if (url.hostname === "www.youtube-nocookie.com" && /^\/embed\/[A-Za-z0-9_-]{6,}$/.test(url.pathname)) return href;
  if (url.hostname === "player.vimeo.com" && /^\/video\/\d+$/.test(url.pathname)) return href;
  if (/\.(mp4|webm|mov)(?:$|\?)/i.test(url.href)) return href;
  return "";
}

function sanitizeDocument(document: Document) {
  const elements = [...document.body.querySelectorAll("*")];
  for (const element of elements) {
    if (["SCRIPT", "STYLE", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON"].includes(element.tagName)) {
      element.remove();
      continue;
    }
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    const originalAttributes = new Map([...element.attributes].map((attribute) => [attribute.name, attribute.value]));
    const original = (name: string) => originalAttributes.get(name) ?? "";
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    if (element instanceof HTMLAnchorElement) {
      const href = safeHttps(original("href")) || (original("href").startsWith("mailto:") ? original("href") : "");
      if (href) {
        element.setAttribute("href", href);
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer");
      }
    }
    if (element instanceof HTMLImageElement) {
      const src = safeHttps(original("src"));
      if (!src) element.remove();
      else {
        element.setAttribute("src", src);
        element.setAttribute("alt", original("alt") || "Lesson illustration");
        element.setAttribute("loading", "lazy");
        element.setAttribute("class", "lms-content-image");
      }
    }
    if (element.tagName === "DIV" && originalAttributes.has("data-lesson-video")) {
      const src = safeVideo(original("data-src"));
      if (!src) element.remove();
      else {
        element.setAttribute("data-lesson-video", "true");
        element.setAttribute("data-src", src);
        element.setAttribute("data-title", original("data-title") || "Lesson video");
        element.setAttribute("class", "lms-content-video-embed");
      }
    }
    if (element instanceof HTMLIFrameElement) {
      const src = safeVideo(original("src"));
      if (!src || !element.closest("[data-lesson-video]")) element.remove();
      else {
        element.setAttribute("src", src);
        element.setAttribute("title", original("title") || "Lesson video");
        element.setAttribute("loading", "lazy");
        element.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      }
    }
    if (element instanceof HTMLVideoElement || element instanceof HTMLSourceElement) {
      const src = safeVideo(original("src"));
      if (!src) element.remove();
      else {
        element.setAttribute("src", src);
        if (element instanceof HTMLVideoElement) {
          element.setAttribute("data-lesson-video", "true");
          element.setAttribute("controls", "true");
          element.setAttribute("playsinline", "true");
          element.setAttribute("preload", "metadata");
          element.setAttribute("class", "lms-content-video");
        }
      }
    }
  }
  return document.body.innerHTML.trim();
}

export function normalizeLessonHtml(input: string) {
  const trimmed = input.trim();
  const converted = /(^|\n)\s*(#{2,3}|[-*]\s|\d+[.)]\s)/m.test(trimmed)
    ? lessonMarkdownToHtml(trimmed)
    : trimmed;
  if (typeof DOMParser === "undefined") return converted || "<p></p>";
  const parsed = new DOMParser().parseFromString(converted || "<p></p>", "text/html");
  return sanitizeDocument(parsed) || "<p></p>";
}
