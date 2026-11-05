import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const origin = process.env.PUBLIC_SITE_ORIGIN || 'http://127.0.0.1:5173';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Local-only navigation test');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage();
  await page.route('**/school-assets/*.css', async route => { await new Promise(resolve => setTimeout(resolve, 3000)); await route.continue(); });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  assert.ok((await page.locator('body').innerText()).length > 100);
  await page.locator('a[href="/%E5%9C%A8%E6%A0%A1%E5%AD%B8%E7%94%9F/"]').first().click();
  await page.waitForURL('**/%E5%9C%A8%E6%A0%A1%E5%AD%B8%E7%94%9F/');
  assert.match(await page.locator('body').innerText(), /在校學生/);
  assert.equal(await page.locator('[data-stu-boot]').count(), 0);
  console.log('Direct school navigation works before slow stylesheets finish.');
} finally { await browser.close(); }
