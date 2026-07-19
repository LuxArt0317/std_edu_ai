import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { lessonMarkdownToHtml, normalizeLessonHtml } from "../../src/platform/richLessonContent.ts";

const source = (path: string) => readFile(path, "utf8");

test("flattened model Markdown is converted into Tiptap-compatible blocks", () => {
  const markdown = "## System Safari: Map a Service ### Map the system 1. **People and purpose** — Who uses it? 2. **Inputs** — What enters? ### Reflect *What would you improve?*";
  const html = lessonMarkdownToHtml(markdown);

  assert.match(html, /^<h2>System Safari: Map a Service<\/h2>/);
  assert.match(html, /<h3>Map the system<\/h3><ol>/);
  assert.match(html, /<strong>People and purpose<\/strong>/);
  assert.match(html, /<h3>Reflect <em>What would you improve\?<\/em><\/h3>/);
  assert.doesNotMatch(html, /(^|>)#{2,3}\s/);
  assert.doesNotMatch(html, /(^|>)\d+[.)]\s/);
});

test("lesson normalization is applied at proposal and repository boundaries", async () => {
  const [portal, repository, api] = await Promise.all([
    source("src/platform/UnifiedPortal.tsx"),
    source("src/platform/platformRepository.ts"),
    source("api/school-assistant.ts"),
  ]);

  assert.match(portal, /create_material_page" \|\| proposed\.type === "update_material_page"[\s\S]*normalizeLessonHtml\(proposed\.content\)/);
  assert.match(repository, /content_html: normalizeLessonHtml\(input\.content\)/g);
  assert.match(api, /content MUST be Tiptap-compatible semantic HTML, never Markdown/);
  assert.match(api, /Never invent a media URL or licensing claim/);
  assert.match(api, /Instructor perspective/);
});

test("a stale material target replans the same goal instead of terminating it", async () => {
  const portal = await source("src/platform/UnifiedPortal.tsx");
  const branch = portal.slice(
    portal.indexOf('} else if (action.type === "create_material_page")'),
    portal.indexOf('action.type !== "create_material"', portal.indexOf('} else if (action.type === "create_material_page")')),
  );

  assert.match(branch, /await onDataChanged\(\)/);
  assert.match(branch, /Re-resolve the intended material by its module and title/);
  assert.match(branch, /await advanceAgent\(replanning, threadId, refreshedData\)/);
  assert.doesNotMatch(branch, /stopAsImpossible/);
  assert.match(portal, /data\.materialPages[\s\S]*\.map\(\(item\) => item\.position\)[\s\S]*\) \+ 1/);
});

test("long rich-lesson goals retain the 32-action client safety ceiling", async () => {
  const [loop, api] = await Promise.all([
    source("src/platform/schoolAgentLoop.ts"),
    source("api/school-assistant.ts"),
  ]);
  assert.match(loop, /SCHOOL_AGENT_MAX_STEPS = 32/);
  assert.match(api, /Math\.min\(32, Number\(raw\.maxSteps\)\)/);
});

test("conversation management and compact accessible attachments are present", async () => {
  const [portal, repository, styles] = await Promise.all([
    source("src/platform/UnifiedPortal.tsx"),
    source("src/platform/platformRepository.ts"),
    source("src/platform/platform.css"),
  ]);

  assert.match(portal, /aria-label="Rename conversation"/);
  assert.match(portal, /aria-label="Delete conversation"/);
  assert.match(portal, /aria-label={`Open attachment \$\{attachment\.name\}`}/);
  assert.match(portal, /<img src={input\.dataUrl} alt=""\/>/);
  assert.match(repository, /storage\.from\("nexus-attachments"\)\.remove/);
  assert.match(repository, /from\("chat_threads"\)\.delete\(\)/);
  assert.match(styles, /\.nexus-composer-attachments > span img/);
  assert.doesNotMatch(portal, />\+ Attach<\/button>/);
});

test("empty normalized lessons still yield a valid Tiptap paragraph", () => {
  assert.equal(normalizeLessonHtml("  "), "<p></p>");
});
