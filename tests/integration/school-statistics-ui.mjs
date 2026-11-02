import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright-core";
const base = process.env.STU_BASE_URL || process.env.PUBLIC_SITE_ORIGIN || "http://127.0.0.1:5174";
const target = new URL(base);
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) || target.origin === "https://stu.best");
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const expected = ["4,601", "128,475", "33,056", "54"];
const labels = ["產學合作", "證書輔導", "實習機會", "國際殊榮"];
const directory = "artifacts/site-mirror/statistics";
await fs.mkdir(directory, { recursive: true });
function luminance(color) {
  const values = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
const states = [];
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  for (const width of [2048, 1440, 1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("iframe")?.contentDocument?.documentElement?.dataset.mirrorReady === "true");
    const frame = page.frameLocator(".source-mirror iframe");
    await frame.locator(".mirror-statistics").scrollIntoViewIfNeeded();
    await frame.locator(".mirror-statistics img").evaluateAll(es => Promise.all(es.map(e => e.decode())));
    assert.deepEqual(await frame.locator(".mirror-stat-card .elementor-counter-number").allTextContents(), expected);
    assert.deepEqual(await frame.locator(".mirror-stat-card .elementor-heading-title").allTextContents(), labels);
    const cards = frame.locator(".mirror-stat-card");
    for (let index = 0; index < 4; index++) {
      await cards.nth(index).hover();
      const colors = await cards.nth(index).evaluate(card => {
        const rect = card.getBoundingClientRect();
        const counter = card.querySelector(".elementor-counter-number-wrapper");
        const counterRect = counter.getBoundingClientRect();
        return { background: getComputedStyle(card).backgroundColor, colors: [...card.querySelectorAll(".elementor-heading-title,.elementor-counter-number,.elementor-counter-number-suffix")].map(e => getComputedStyle(e).color), fits: counterRect.right <= rect.right + 1 && counterRect.left >= rect.left - 1, opacity: getComputedStyle(card).opacity };
      });
      assert.equal(colors.opacity, "1");
      assert.ok(colors.fits, `${width}: ${expected[index]} overflows its card`);
      const minimum = Math.min(...colors.colors.map(color => contrast(color, colors.background)));
      assert.ok(minimum >= 4.5, `${width}: ${expected[index]} contrast ${minimum}`);
      states.push({ width, number: expected[index], minimumContrast: minimum });
    }
    const geometry = await frame.locator("html").evaluate(e => ({ width: e.clientWidth, scroll: e.scrollWidth }));
    assert.ok(geometry.scroll <= geometry.width + 1, `${width}: horizontal overflow`);
    await frame.locator(".mirror-statistics").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${directory}/statistics-${width}.png` });
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(`${directory}/${target.hostname === "stu.best" ? "production" : "local"}.json`, JSON.stringify({ base, states, errors }, null, 2));
  console.log(JSON.stringify({ base, viewportStates: 6, cardChecks: states.length, minimumContrast: Math.min(...states.map(s => s.minimumContrast)), sourceValuesPreserved: true, errors }));
} finally { await browser.close(); }
