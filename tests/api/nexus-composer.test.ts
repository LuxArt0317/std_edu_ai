import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const portal = fs.readFileSync("src/platform/UnifiedPortal.tsx", "utf8");

test("Nexus Enter submits through the form and Shift+Enter remains multiline", () => {
  assert.match(portal, /event\.key !== "Enter"/);
  assert.match(portal, /event\.shiftKey/);
  assert.match(portal, /event\.nativeEvent\.isComposing/);
  assert.match(portal, /event\.preventDefault\(\)/);
  assert.match(portal, /event\.currentTarget\.form\?\.requestSubmit\(\)/);
  assert.match(portal, /Enter to send · Shift\+Enter for a new line/);
});
