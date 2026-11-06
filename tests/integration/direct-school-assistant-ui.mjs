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
    for (const [index,route] of routes.entries()) {
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
      await assistant.getByText('The registrar contact is in the school directory.').last().waitFor();
      assert.equal(await assistant.getByText('The registrar contact is in the school directory.').count(),index+1,'the tab conversation survives direct-page navigation');
      await assistant.getByPlaceholder('Ask a school question…').focus();
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: '開啟 AI 校園助理' }).click();
      await assistant.getByText('The registrar contact is in the school directory.').last().waitFor();
      await page.getByRole('button', { name: '關閉校園助理' }).click();
      await panel.waitFor({ state: 'hidden' });
    }
    // Signing in from the embedded assistant must replace the top-level page.
    // An OAuth flow inside its iframe leaves Google blocked and the button busy.
    await page.getByRole('button', { name: '開啟 AI 校園助理' }).click();
    await page.frameLocator('iframe.stu-assistant-frame').getByRole('link', { name: 'School Affairs sign in' }).click();
    await page.waitForURL('**/school-affairs/login');
    assert.equal(page.url(), origin + '/school-affairs/login');
    await page.getByRole('button', { name: 'Continue with Google' }).waitFor();
    assert.equal(await page.locator('iframe.stu-assistant-frame').count(), 0, 'sign-in must leave the assistant frame');
    if (width === 1440) {
      // Existing tabs may already have the login page trapped in the old frame.
      await page.goto(origin + '/');
      await page.getByRole('button', { name: '開啟 AI 校園助理' }).click();
      await page.frameLocator('iframe.stu-assistant-frame').getByRole('heading', { name: '校園助理 · Assistant' }).waitFor();
      await page.locator('iframe.stu-assistant-frame').evaluate(frame => { frame.src = '/school-affairs/login'; });
      await page.frameLocator('iframe.stu-assistant-frame').getByRole('button', { name: 'Continue with Google' }).click();
      await page.waitForURL('**/school-affairs/login');
      await page.getByRole('button', { name: 'Continue with Google' }).waitFor();
      assert.equal(await page.locator('iframe.stu-assistant-frame').count(), 0, 'old framed login must recover into the full page');
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(JSON.stringify({ status: 'ok', routes: routes.length, viewports: [1440, 390], chatAnswered: true, escapeCloses: true, signInLeavesFrame: true, framedLoginRecovers: true, pageRemainsDirect: true }));
} finally { await browser.close(); }
