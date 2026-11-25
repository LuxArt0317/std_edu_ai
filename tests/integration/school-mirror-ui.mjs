import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const origin = process.env.PUBLIC_SITE_ORIGIN || 'http://127.0.0.1:5173';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Local-only UI verification');
const contactDirectory=JSON.parse(await readFile('server/data/publicContactDirectory.json','utf8'));
const isNative=item=>decodeURIComponent(item.route).replace(/\/$/u,'')==='/分機表';
const pages = JSON.parse(await readFile('src/features/public/mirror/pages.json', 'utf8'));
const nativePages=pages.filter(isNative);
assert.equal(nativePages.length,1,'Native contact directory remains registered');
for (const item of pages.filter(item=>!isNative(item))) {
  const response = await fetch(origin + item.route);
  const html = await response.text();
  assert.equal(response.status, 200, `${item.route}: HTTP ${response.status}`);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  assert.match(html, /<body\b[^>]*>/i, item.route);
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="[^"]*script-src 'self'[^"]*frame-src 'self'/i, item.route);
  assert.doesNotMatch(html, /stu-direct-notice|stu-account-status|src="\/account-status"|校園網站介面預覽（非官方）/, item.route);
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
    assert.equal(await page.locator('.stu-direct-notice, .stu-account-status, iframe[src="/account-status"]').count(), 0);
    assert.equal(await page.locator('.source-mirror iframe').count(), 0);
    assert.equal(await page.locator('[data-stu-boot]').count(), 0);
    assert.ok((await page.locator('body').innerText()).length > 100);
    for (const viewportWidth of (width === 1440 ? [3020, 2048, 1440, 768] : [390, 320])) {
      await page.setViewportSize({ width: viewportWidth, height: 900 });
      const hero = await page.evaluate(() => {
        const carousel = document.querySelector('.elementor-element-4b004d9 .elementor-slides-wrapper');
        const active = carousel?.querySelector('.swiper-slide-active');
        const slides = [...(carousel?.querySelectorAll('.swiper-slide') || [])];
        const rect = active?.getBoundingClientRect();
        const header = document.querySelector('.elementor-element-dd1b967')?.getBoundingClientRect();
        const navigation = document.querySelector('.elementor-element-5268723')?.getBoundingClientRect();
        return {
          pageWidth: document.documentElement.scrollWidth,
          carouselWidth: carousel?.getBoundingClientRect().width,
          activeX: rect?.x,
          activeWidth: rect?.width,
          headerX: header?.x,
          headerWidth: header?.width,
          navigationCenter: navigation && navigation.x + navigation.width / 2,
          visibleSlides: slides.filter(slide => getComputedStyle(slide).display !== 'none').length,
        };
      });
      assert.ok(hero.pageWidth <= viewportWidth + 1, `${viewportWidth}: no horizontal page overflow`);
      assert.ok(Math.abs(hero.headerX) <= 1 && Math.abs(hero.headerWidth - viewportWidth) <= 1, `${viewportWidth}: header fills viewport`);
      assert.ok(Math.abs(hero.navigationCenter - viewportWidth / 2) <= 1, `${viewportWidth}: navigation centered`);
      assert.ok(Math.abs(hero.activeX) <= 1, `${viewportWidth}: hero begins at viewport edge`);
      assert.ok(Math.abs(hero.activeWidth - hero.carouselWidth) <= 1, `${viewportWidth}: hero fills carousel`);
      assert.equal(hero.visibleSlides, 1, `${viewportWidth}: only one hero slide visible`);
    }
    await page.setViewportSize({ width, height: 900 });
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
    // This registered route is rendered by the native SPA, not copied HTML.
    await page.goto(origin+contactDirectory.path,{waitUntil:'domcontentloaded'});
    await page.locator('#contact-query').waitFor({state:'visible'});
    assert.equal(await page.locator('h1').textContent(),contactDirectory.title);
    const rows=page.locator('.public-contact-table-region tbody tr');
    assert.equal(await rows.count(),contactDirectory.records.length);
    for(const [index,record] of contactDirectory.records.entries()){
      const row=rows.nth(index);
      assert.equal(await row.locator('th').textContent(),record.name);
      assert.ok((await row.innerText()).includes(record.phone));
      for(const extension of record.extensions)assert.ok((await row.innerText()).includes(extension));
      assert.equal(await row.locator('details a').getAttribute('href'),record.source.url);
    }
    const selected=contactDirectory.records.find(row=>row.extensions.length);
    assert.ok(selected,'Search must exercise a published extension');
    await page.locator('#contact-query').fill(selected.extensions[0]);
    const matches=contactDirectory.records.filter(row=>[row.name,row.phone,...row.extensions,row.email||'',row.address||''].some(value=>value.toLowerCase().includes(selected.extensions[0].toLowerCase())));
    await page.waitForFunction(count=>document.querySelectorAll('.public-contact-table-region tbody tr').length===count,matches.length);
    await page.locator('#contact-query').fill('unmatched-contact-fixture-919191');
    await page.locator('.public-contact-empty').waitFor({state:'visible'});
    await page.getByRole('button',{name:'清除',exact:true}).click();
    await page.waitForFunction(count=>document.querySelectorAll('.public-contact-table-region tbody tr').length===count,contactDirectory.records.length);
    assert.equal(await page.locator('iframe.stu-assistant-frame').count(),0,'Native page uses its own assistant component');
    assert.ok(await page.getByRole('button',{name:/Open campus assistant|開啟 AI 校園助理/}).count(),'Native assistant remains available');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Native phonebook avoids horizontal page overflow');
    assert.deepEqual(errors, []);
    await context.close();
  }
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const page = await noScript.newPage();
  await page.goto(origin + '/%E5%9C%A8%E6%A0%A1%E5%AD%B8%E7%94%9F/', { waitUntil: 'domcontentloaded' });
  assert.ok((await page.locator('body').innerText()).length > 100);
  await noScript.close();
} finally { await browser.close(); }
console.log(JSON.stringify({ status: 'ok', directPages: pages.length-nativePages.length, nativeContactPages:nativePages.length, audienceCards: 10, widths: [1440, 390], noJavaScript: true }));
