import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const origin = process.env.PUBLIC_SITE_ORIGIN || 'http://127.0.0.1:5173';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname) && origin !== 'https://stu.best') throw new Error('Use local preview or the client production site');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const routes = ['/', '/在校學生/', '/latestnews-single/?id=212034'];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/research-assistant', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: 'The registrar contact is in the school directory.', status: 'answered', citations: [], suggestedQuestions: [] }) }));
    for (const route of routes) {
      await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator('[data-stu-boot], .source-mirror').count(), 0, route);
      await page.getByRole('button', { name: '開啟 AI 校園助理' }).click();
      const panel = page.locator('#stu-assistant-panel');
      await panel.waitFor({ state: 'visible' });
      const bounds = await panel.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1, `${route} ${width}: chat panel fits`);
      const assistant = page.frameLocator('iframe.stu-assistant-frame');
      await assistant.getByRole('heading', { name: '校園助理 · Assistant' }).waitFor();
      await assistant.getByPlaceholder('Ask a school question…').fill('Registrar contact?');
      await assistant.getByRole('button', { name: 'Send', exact: true }).click();
      await assistant.getByText('The registrar contact is in the school directory.').waitFor();
      await assistant.getByPlaceholder('Ask a school question…').focus();
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: '開啟 AI 校園助理' }).click();
      await assistant.getByText('The registrar contact is in the school directory.').waitFor();
      await page.getByRole('button', { name: '關閉校園助理' }).click();
      await panel.waitFor({ state: 'hidden' });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(JSON.stringify({ status: 'ok', routes: routes.length, viewports: [1440, 390], chatAnswered: true, escapeCloses: true, pageRemainsDirect: true }));
} finally { await browser.close(); }
