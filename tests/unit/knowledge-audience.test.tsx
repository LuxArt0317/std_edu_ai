import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { KnowledgeAudienceFields } from "../../src/features/research/KnowledgeAudienceFields";
test("role knowledge has named, serialized role checkboxes with the current selection", () => {
  const html = renderToStaticMarkup(
    <KnowledgeAudienceFields
      initialScope="role"
      initialRoles={["faculty"]}
      sections={[]}
    />,
  );
  assert.match(html, /name="audienceScope"/);
  assert.match(html, /Allowed roles/);
  assert.match(
    html,
    /name="audienceRoles"[^>]*value="faculty"|value="faculty"[^>]*name="audienceRoles"/,
  );
  assert.match(html, /aria-label="faculty"/);
  assert.match(html, /checked/);
});
test("class knowledge requires a real class selector and never requests a typed UUID", () => {
  const html = renderToStaticMarkup(
    <KnowledgeAudienceFields
      initialScope="class"
      initialSection="section-1"
      sections={[{ id: "section-1", label: "IM101 · A" }]}
    />,
  );
  assert.match(html, /name="sectionId"/);
  assert.match(html, /required/);
  assert.match(html, /IM101 · A/);
  assert.doesNotMatch(html, /Allowed roles/);
});
