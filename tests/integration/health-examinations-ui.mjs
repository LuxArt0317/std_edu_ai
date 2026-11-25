import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { healthCardUrl, healthExaminationPath, healthExaminationScope, healthReportBucket, healthExaminationGuide } from '../../server/healthExaminationContract.js';
import { affairsTestUser as user, mockAffairsAuth } from './helpers/affairs-auth.mjs';

const origin = process.env.PUBLIC_SITE_ORIGIN ?? 'http://127.0.0.1:54635';
const release = process.env.EXPECTED_RELEASE_REVISION;
const storage = 'https://xiftudmvxphxcjtmfmib.supabase.co';
async function pin() {
  if (origin !== 'https://stu.best') return;
  assert.match(release ?? '', /^[0-9a-f]{40}$/u);
  const result = await fetch(origin + '/release.json', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  assert.equal((await result.json()).revision, release);
}
await pin();
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===new URL(origin).origin&&!url.pathname.startsWith('/api/')
    ?route.continue():route.abort('blockedbyclient');});
  await mockAffairsAuth(context);
  const id = '10000000-0000-4000-8000-000000000001';
  const other = '10000000-0000-4000-8000-000000000002';
  const row = { id, examination_code: 'QA examination', student_number: 'TEST-01', student_name: 'QA Student', class_label: 'QA Class', report_available: true };
  let initialFailure = true, storageFailure = true;
  await context.route('**/storage/v1/object/sign/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    assert.equal(pathname, '/storage/v1/object/sign/' + healthReportBucket + '/' + user.id + '/' + id + '.pdf');
    assert.equal(request.method(), 'GET');
    assert.equal(request.headers().authorization, undefined);
    await route.fulfill(storageFailure ? { status: 404, json: { message: 'Not found' } } :
      { status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n% synthetic QA\n%%EOF\n' });
    storageFailure = false;
  });
  await context.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.searchParams.get('scope') === healthExaminationScope) {
      assert.equal(request.method(), 'GET');
      assert.match(request.headers().authorization ?? '', /^Bearer /u);
      if (url.searchParams.has('report')) {
        assert.equal(url.searchParams.get('report'), id);
        return route.fulfill({ json: {
          url: storage + '/storage/v1/object/sign/' + healthReportBucket + '/' + user.id + '/' + id + '.pdf?token=' + 'a'.repeat(48),
        } });
      }
      if (initialFailure) {
        initialFailure = false;
        return route.fulfill({ status: 503, json: { error: 'Retry' } });
      }
      const rows = url.searchParams.get('page') === '2'
        ? [{ ...row, id: other, examination_code: 'QA withheld examination', report_available: false }]
        : [row];
      return route.fulfill({ json: { userId: user.id, total: 26, rows } });
    }
    if (url.pathname === '/api/affairs-conversations') {
      if (request.method() === 'GET') return route.fulfill({ json: { conversations: [] } });
      const { id, title, messages, version } = request.postDataJSON();
      return route.fulfill({ json: { id, title, messages, version: version + 1, updated_at: new Date().toISOString() } });
    }
    if (url.pathname === '/api/affairs-assistant') {
      assert.equal(request.method(), 'POST');
      assert.match(request.headers().authorization ?? '', /^Bearer /u);
      const question='Where can I view my health examination report?';
      assert.equal(request.postDataJSON().question, question);
      assert.equal(request.postDataJSON().route, healthExaminationPath);
      // Only the guide response is mocked here. Actual server classification
      // belongs to the API tests; this suite verifies the rendered local link.
      return route.fulfill({ json: healthExaminationGuide(question, true) });
    }
    throw new Error('Unexpected QA call: ' + url.pathname);
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + healthExaminationPath);
  await page.getByRole('alert').getByRole('button', { name: '重試' }).click();
  const table = page.getByRole('table');
  await table.getByText('QA examination', { exact: true }).waitFor();
  assert.equal(await table.getByRole('columnheader').count(), 5);
  const box = await table.boundingBox();
  assert.ok(Math.abs(box.x - 238) < 4 && Math.abs(box.y - 300) < 5 && Math.abs(box.width - 804) < 5, JSON.stringify(box));
  assert.equal(await page.getByRole('link', { name: '學生健康資料卡' }).getAttribute('href'), healthCardUrl);
  const report = page.getByRole('button', { name: '下載健檢報告' });
  await report.click();
  await page.getByRole('alert').getByText('無法下載健檢報告，請重試。').waitFor();
  const saved = page.waitForEvent('download');
  await report.click();
  const file = await saved;
  assert.equal(file.suggestedFilename(), 'health-examination-report.pdf');
  assert.equal(await file.failure(), null);
  await page.getByRole('link', { name: '下一頁' }).click();
  await table.getByText('QA withheld examination', { exact: true }).waitFor();
  assert.equal(await report.count(), 0);
  await page.getByRole('link', { name: '上一頁' }).click();
  await report.waitFor();
  if (process.env.HEALTH_EXAMINATIONS_SCREENSHOT) await page.screenshot({ path: process.env.HEALTH_EXAMINATIONS_SCREENSHOT });
  await page.getByRole('button', { name: '開啟 AI 校園助理' }).click();
  await page.getByPlaceholder('Ask a school question…').fill('Where can I view my health examination report?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const assistant = page.getByRole('dialog');
  await assistant.getByText(/extension 2108/).waitFor();
  assert.equal(await assistant.getByText(/QA Student|TEST-01/).count(), 0);
  assert.equal(await assistant.getByRole('link', { name: 'Open health examination records', exact: true }).first().getAttribute('href'), healthExaminationPath);
  await page.keyboard.press('Escape');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 750 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await page.locator('.health-examination-table').evaluate(node => node.scrollWidth > node.clientWidth));
  }
  const guest = await browser.newContext({ serviceWorkers: 'block' });
  await guest.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===new URL(origin).origin&&!url.pathname.startsWith('/api/')
    ?route.continue():route.abort('blockedbyclient');});
  await mockAffairsAuth(guest, { signedIn: false });
  const login = await guest.newPage();
  await login.goto(origin + healthExaminationPath);
  await login.waitForURL(url => url.pathname === '/school-affairs/login');
  assert.equal(new URL(login.url()).searchParams.get('next'), healthExaminationPath);
  assert.deepEqual(errors, []);
  await pin();
  console.log('Health examination layout, retry, private file download, pagination, assistant link, mobile widths, and sign-in return passed.');
} finally {
  await browser.close();
}
