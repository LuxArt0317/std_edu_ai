import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
const base = process.env.STU_BASE_URL || process.env.PUBLIC_SITE_ORIGIN || 'http://127.0.0.1:5173';
const target = new URL(base);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) || target.origin === 'https://stu.best');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const expected = ['4,601', '128,475', '33,056', '54'];
const directory = 'artifacts/site-mirror/statistics';
await fs.mkdir(directory, { recursive: true });
const states = [];
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const width of [2048, 1440, 1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('iframe').count(), 0);
    assert.deepEqual(await page.locator('.elementor-counter-number').allTextContents(), expected);
    const cards = page.locator('.elementor-element-1cd83d3 > .e-con');
    assert.equal(await cards.count(), 4);
    for (let index = 0; index < 4; index++) {
      const result = await cards.nth(index).evaluate(card => {
        const rect = card.getBoundingClientRect();
        const counter = card.querySelector('.elementor-counter-number-wrapper');
        const counterRect = counter.getBoundingClientRect();
        const color = getComputedStyle(counter).color;
        const background = getComputedStyle(card).backgroundColor;
        return { fits: counterRect.right <= rect.right + 1 && counterRect.left >= rect.left - 1, color, background, visible: rect.width > 0 && rect.height > 0 };
      });
      assert.ok(result.visible && result.fits, `${width}: ${expected[index]} must fit its card`);
      assert.equal(result.color, 'rgb(255, 255, 255)');
      assert.notEqual(result.background, 'rgb(255, 255, 255)');
      states.push({ width, number: expected[index], ...result });
    }
    const geometry = await page.locator('html').evaluate(e => ({ width: e.clientWidth, scroll: e.scrollWidth }));
    assert.ok(geometry.scroll <= geometry.width + 1, `${width}: horizontal overflow`);
    await page.screenshot({ path: `${directory}/statistics-${width}.png` });
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(`${directory}/${target.hostname === 'stu.best' ? 'production' : 'local'}.json`, JSON.stringify({ base, states, errors }, null, 2));
  console.log(JSON.stringify({ base, viewportStates: 6, cardChecks: states.length, sourceValuesPreserved: true, errors }));
} finally { await browser.close(); }
