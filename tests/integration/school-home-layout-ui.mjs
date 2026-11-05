import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const base = process.env.STU_BASE_URL || process.env.PUBLIC_SITE_ORIGIN || "http://127.0.0.1:5173";
const target = new URL(base);
const origin = target.origin;
assert.ok((target.protocol === "http:" && ["localhost", "127.0.0.1"].includes(target.hostname)) || origin === "https://stu.best", "Use a local preview or the client production site");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const widths = [1984, 1440, 1400, 1399, 1280, 1024, 768, 767, 640, 480, 390, 320];
const results = [];
const output = "artifacts/site-mirror/home-layout";
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("iframe").count(), 0);
    const frame = page;
    const state = await frame.locator(".elementor-element-93788b9").evaluate((grid) => {
      const doc = grid.ownerDocument;
      const cards = [...grid.children];
      const failures = [];
      for (const [index, card] of cards.entries()) {
        const cardRect = card.getBoundingClientRect();
        for (const selector of [".elementor-image-box-title", ".elementor-image-box-description"]) {
          const element = card.querySelector(selector);
          if (!element) { failures.push(`${index}: missing ${selector}`); continue; }
          const rect = element.getBoundingClientRect();
          if (rect.left < cardRect.left - 1 || rect.right > cardRect.right + 1 || element.scrollWidth > element.clientWidth + 1)
            failures.push(`${index}: ${selector} crosses card bounds`);
        }
      }
      return {
        count: cards.length,
        columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        pageWidth: doc.documentElement.clientWidth,
        pageScrollWidth: doc.documentElement.scrollWidth,
        failures,
      };
    });
    const expectedColumns = width < 480 ? 1 : width < 768 ? 2 : width < 1400 ? 5 : 10;
    assert.equal(state.count, 10, `${width}: audience entries`);
    assert.equal(state.columns, expectedColumns, `${width}: grid columns`);
    assert.deepEqual(state.failures, [], `${width}: text overlap`);
    assert.ok(state.pageScrollWidth <= state.pageWidth + 1, `${width}: horizontal page overflow`);
    if ([1984, 1440, 390].includes(width))
      await frame.locator(".elementor-element-93788b9").screenshot({ path: `${output}/entrances-${width}.png` });
    results.push({ width, columns: state.columns, entries: state.count, horizontalOverflow: false });
  }
  assert.deepEqual(pageErrors, []);
  await writeFile(`${output}/${origin === "https://stu.best" ? "production" : "local"}.json`, JSON.stringify({ origin, results, pageErrors }, null, 2));
  console.log(JSON.stringify({ origin, viewportStates: results.length, checkedEntranceCards: results.reduce((count, item) => count + item.entries, 0), pageErrors }));
} finally {
  await browser.close();
}
