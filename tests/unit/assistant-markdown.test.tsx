import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantMarkdown } from "../../src/features/school/portal/AssistantMarkdown";
test("Assistant formats readable lists and emphasis without executing raw HTML or loading model images", () => {
  const output = renderToStaticMarkup(
    <AssistantMarkdown>
      {
        "## Next steps\n\n- **Read** the lesson.\n- Ask your teacher.\n\n<script>alert(1)</script>\n\n![tracking](https://example.com/pixel)\n\n[unsafe](javascript:alert(1)) [source](https://example.com/guide)"
      }
    </AssistantMarkdown>,
  );
  assert.match(output, /<h3>Next steps<\/h3>/);
  assert.match(output, /<ul>/);
  assert.match(output, /<strong>Read<\/strong>/);
  assert.doesNotMatch(output, /<script|<img|javascript:/);
  assert.match(output, /href="https:\/\/example.com\/guide"/);
  assert.match(output, /rel="noopener noreferrer"/);
});
