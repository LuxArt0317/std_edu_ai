import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const origin = process.env.PUBLIC_SITE_ORIGIN || 'http://127.0.0.1:5173';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Local-only UI verification');
const pages = JSON.parse(await readFile('src/features/public/mirror/pages.json', 'utf8'));
for (const item of pages) {
  const response = await fetch(origin + item.route);
  const html = await response.text();
  assert.equal(response.status, 200, `${item.route}: HTTP ${response.status}`);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  assert.match(html, /校園網站介面預覽（非官方）/, item.route);
  assert.doesNotMatch(html, /data-stu-boot|class="source-mirror"/i, item.route);
  assert.match(html, /class="stu-assistant-toggle"/, item.route);
  assert.match(html, /class="stu-assistant-frame"[^>]+src="\/campus-assistant\?embed=1"/, item.route);
  assert.equal([...html.matchAll(/<script\b/gi)].length, 1, `${item.route}: only the local assistant bridge may execute`);
  assert.ok(html.length > 500, item.route);
}
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('iframe.stu-assistant-frame').count(), 1);
    assert.equal(await page.locator('.source-mirror iframe').count(), 0);
    assert.equal(await page.locator('[data-stu-boot]').count(), 0);
    assert.ok((await page.locator('body').innerText()).length > 100);
    assert.deepEqual(await page.locator('.elementor-counter-number').allTextContents(), ['4,601', '128,475', '33,056', '54']);
    for (const href of ['/%E5%9C%A8%E6%A0%A1%E5%AD%B8%E7%94%9F/', '/admissions', '/freshman', '/%E6%95%99%E8%81%B7%E5%93%A1%E5%B7%A5/', '/%E9%80%B2%E4%BF%AE%E4%BA%BA%E5%A3%AB/', '/%E7%95%A2%E6%A5%AD%E6%A0%A1%E5%8F%8B/', '/alumni-association', '/%E6%A0%A1%E5%A4%96%E8%A8%AA%E5%AE%A2/', '/%E5%9C%8B%E9%9A%9B%E5%AD%B8%E7%94%9F/', '/international']) {
      const link = page.locator(`a[href="${href}"]:visible`).last();
      assert.ok(await link.count(), `missing audience card ${href}`);
      await link.click();
      await page.waitForLoadState('domcontentloaded');
      assert.ok((await page.locator('body').innerText()).length > 100, href);
      assert.equal(await page.locator('iframe.stu-assistant-frame').count(), 1, href);
      assert.equal(await page.locator('.source-mirror iframe').count(), 0, href);
      assert.equal(await page.locator('[data-stu-boot]').count(), 0, href);
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const page = await noScript.newPage();
  await page.goto(origin + '/%E5%9C%A8%E6%A0%A1%E5%AD%B8%E7%94%9F/', { waitUntil: 'domcontentloaded' });
  assert.ok((await page.locator('body').innerText()).length > 100);
  await noScript.close();
} finally { await browser.close(); }
console.log(JSON.stringify({ status: 'ok', directPages: pages.length, audienceCards: 10, widths: [1440, 390], noJavaScript: true }));
