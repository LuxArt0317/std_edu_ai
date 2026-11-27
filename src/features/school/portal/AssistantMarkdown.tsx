import remarkGfm from "remark-gfm";
import {normalizeAssistantTables} from "../../../services/assistantMarkdownTables.js";
import Markdown from "react-markdown";

function safeAssistantLink(value: string) {
  try {
    const url = new URL(value, "https://school.invalid");
    return ["https:", "http:", "mailto:"].includes(url.protocol) ? value : "";
  } catch {
    return "";
  }
}

/** Treat model text as Markdown, never executable HTML or remote image requests. */
export function AssistantMarkdown({ children }: { children: string }) {
  return (
    <div className="nexus-message-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        allowedElements={[
          "p",
          "br",
          "strong",
          "em",
          "ul",
          "ol",
          "li",
          "blockquote",
          "pre",
          "code",
          "a",
          "h1",
          "h2",
          "h3",
          "h4",
          "hr","table","thead","tbody","tr","th","td",
        ]}
        urlTransform={safeAssistantLink}
        components={{
          table:({children})=><div className="assistant-markdown-table" role="region" aria-label="Answer table" tabIndex={0}><table>{children}</table></div>,
          h1: ({ children }) => <h3>{children}</h3>,
          h2: ({ children }) => <h3>{children}</h3>,
          h4: ({ children }) => <h3>{children}</h3>,
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
        }}
      >
        {normalizeAssistantTables(children)}
      </Markdown>
    </div>
  );
}
