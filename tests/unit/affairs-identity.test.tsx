import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  openAffairsPreview,
  closeAffairsPreview,
  hasAffairsPreview,
} from "../../src/features/public/affairs/previewSession.ts";
test("preview access expires, clears on logout, survives reload and handles blocked storage without becoming authentication", () => {
  const values = new Map();
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  );
  try {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => values.get(k) || null,
        setItem: (k: string, v: string) => values.set(k, v),
        removeItem: (k: string) => values.delete(k),
      },
    });
    closeAffairsPreview();
    assert.equal(hasAffairsPreview(), false);
    openAffairsPreview();
    assert.equal(hasAffairsPreview(), true);
    values.set("stu-affairs-preview-v1", String(Date.now() - 1));
    assert.equal(hasAffairsPreview(), false);
    values.set("stu-affairs-preview-v1", String(Date.now() + 86400000));
    assert.equal(hasAffairsPreview(), false);
    openAffairsPreview();
    closeAffairsPreview();
    assert.equal(hasAffairsPreview(), false);
    assert.equal(values.size, 0);
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get() {
        throw Error("blocked");
      },
    });
    openAffairsPreview();
    assert.equal(hasAffairsPreview(), true);
    closeAffairsPreview();
    assert.equal(hasAffairsPreview(), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
    else delete (globalThis as any).sessionStorage;
  }
});
test("public chat cannot import Nexus auth while knowledge QA explicitly requires it", () => {
  const service = readFileSync("src/services/researchAssistant.ts", "utf8");
  const publicPart = service.slice(
    service.indexOf("export async function askCampusAssistant"),
    service.indexOf("export async function askKnowledgeAnswer"),
  );
  assert.doesNotMatch(
    publicPart,
    /getSession|school-assistant|Authorization|utils\/supabase/,
  );
  assert.match(publicPart, /research-assistant/);
  const manager = service.slice(
    service.indexOf("export async function askKnowledgeAnswer"),
  );
  assert.match(manager, /knowledge-manager/);
  assert.match(manager, /getSession/);
  const publicUi = readFileSync(
    "src/features/public/PublicAssistant.tsx",
    "utf8",
  );
  assert.doesNotMatch(publicUi, /onAuthStateChange|utils\/supabase/);
  assert.match(publicUi, /school-affairs\/login/);
});
