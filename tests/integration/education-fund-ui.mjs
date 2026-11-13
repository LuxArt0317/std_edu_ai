// Synthetic local UI only: no real auth, API, model, database or university requests.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {affairsTestUser, mockAffairsAuth} from './helpers/affairs-auth.mjs';

const origin = new URL(process.env.PUBLIC_SITE_ORIGIN || 'http://127.0.0.1:5176');
assert.ok(origin.protocol === 'http:' && ['localhost','127.0.0.1'].includes(origin.hostname)
  && origin.pathname === '/' && !origin.username && !origin.password && !origin.search && !origin.hash,
'This synthetic suite requires a plain local HTTP origin.');
const base = origin.origin;
const directory = resolve('artifacts/education-fund-ui');
const source = JSON.parse(await readFile('artifacts/visual-parity/education-fund-source/details.json','utf8'));
assert.ok(Array.isArray(source) && source.length === 66, 'Use the saved, complete source measurement capture.');
const snapshot = {checkedAt:'2026-11-13T00:00:00Z',officialUniversityData:false,
  profile:{userId:affairsTestUser.id,email:affairsTestUser.email,displayName:'QA Student',role:'student'},
  student:null,courses:[],charges:[],assignments:[],announcements:[],tasks:[],requests:[],serviceRecords:[],
  dtm:{sourceMode:'personal',courses:[],notices:[]}};
const evidence = {syntheticOnly:true,sourceViewport:{width:1527,height:1399},geometry:[],screenshots:[],
  aliases:[],menuNavigation:[],apiReads:[],blockedRequests:[],pageErrors:[],status:'running'};
await mkdir(directory,{recursive:true});
const browser = await chromium.launch({headless:true,
  executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});

async function context(signedIn) {
  const ctx = await browser.newContext({viewport:{width:1527,height:1399},reducedMotion:'reduce',serviceWorkers:'block'});
  // Registered first so the synthetic provider helper can fulfil its own auth responses.
  await ctx.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base || request.method() !== 'GET') {
      evidence.blockedRequests.push({method:request.method(),origin:url.origin,path:url.pathname});
      return route.abort('blockedbyclient');
    }
    if (url.pathname.startsWith('/api/')) {
      if (url.search === '' && ['/api/affairs-data','/api/affairs-conversations'].includes(url.pathname)) {
        evidence.apiReads.push(url.pathname);
        return route.fulfill({json:url.pathname === '/api/affairs-data' ? snapshot : {conversations:[]}});
      }
      evidence.blockedRequests.push({method:request.method(),origin:url.origin,path:url.pathname});
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await mockAffairsAuth(ctx,{signedIn});
  await ctx.routeWebSocket('**/*', socket => socket.close());
  ctx.on('page',page => page.on('pageerror',error => evidence.pageErrors.push(error.message)));
  return ctx;
}
async function settle(page) {
  await page.evaluate(async () => {await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));});
}
async function screenshot(page,width) {
  await page.setViewportSize({width,height:1399}); await settle(page);
  const bounds = await page.evaluate(() => ({viewport:innerWidth,scroll:document.documentElement.scrollWidth,
    elements:[...document.querySelectorAll('.education-fund-shell,.education-fund-instructions,.education-fund-footer')].map(element => {
      const rect = element.getBoundingClientRect(); return {left:rect.left,right:rect.right};
    })}));
  const path = `${directory}/education-fund-${width}.png`;
  await page.screenshot({path,fullPage:true});
  evidence.screenshots.push({width,path,bounds});
  assert.ok(bounds.scroll <= width + 1, `Document overflow at ${width}: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.elements.every(rect => rect.left >= 0 && rect.right <= width + 1), `Content overflow at ${width}`);
}
async function geometry(page,selector,index,sourceIndex,fields=['x','y','width','height']) {
  const actual = await page.locator(selector).nth(index).boundingBox(), expected = source[sourceIndex].rect;
  assert.ok(actual, `Missing source element ${selector}`);
  const delta = Object.fromEntries(fields.map(key => [key,actual[key]-expected[key]]));
  evidence.geometry.push({selector,index,sourceIndex,actual,expected,delta});
}

try {
  const signedIn = await context(true), page = await signedIn.newPage();
  await page.goto(base+'/school-affairs/services/21-2');
  await page.locator('.education-fund').waitFor(); await settle(page);
  assert.equal(new URL(page.url()).pathname,'/school-affairs/services/21-2');
  assert.equal(await page.locator('.education-fund').getAttribute('data-observed-on'),'2026-11-13');
  assert.equal(await page.locator('.education-fund-instructions h3').count(),6);
  assert.deepEqual(await page.locator('.education-fund-instructions ol').evaluateAll(elements => elements.map(el => el.children.length)),[2,13,2]);
  assert.equal(await page.locator('.education-fund form,.education-fund input,.education-fund select,.education-fund button').count(),0);
  assert.equal(await page.locator('.student-service-body,.portal-content').count(),0,'Canonical destination has its own instruction page.');
  assert.equal(await page.locator('.education-fund-footer > p').first().textContent(),'stu.best | 07-6158000#2401');
  assert.equal(await page.locator('.education-fund-footer time').count(),0,'Capture date is metadata, not an added source control.');
  assert.deepEqual(await page.locator('.education-fund-footer a').evaluateAll(elements => elements.map(el => el.getAttribute('href'))),
    ['/school-affairs/signed-out','/school-affairs/services/21-2','/school-affairs','/','/student-sso']);
  assert.ok(await page.locator('.education-fund-logo img').evaluate(img => img.complete && img.naturalWidth > 0));
  for (const [selector,index,sourceIndex] of [
    ['.education-fund-shell',0,1],['.education-fund-header',0,2],['.education-fund-banner',0,3],
    ['.education-fund-heading',0,6],['.education-fund-logo img',0,8],['.education-fund-breakline',0,11],
    ['.education-fund-container',0,13],['.education-fund-content',0,14],['.education-fund-instructions',0,16],
    ['.education-fund-instructions h2',0,17],['.education-fund-instructions h3',0,18],
    ['.education-fund-instructions ol',0,20],['.education-fund-instructions h3',1,23],
    ['.education-fund-instructions h3',2,26],['.education-fund-instructions ol',1,28],
    ['.education-fund-instructions h3',3,42],['.education-fund-instructions h3',4,44],
    ['.education-fund-instructions ol',2,46],['.education-fund-instructions h3',5,49],
    ['.education-fund-period p',0,54],['.education-fund-footer nav',0,57],
  ]) await geometry(page,selector,index,sourceIndex);
  for (const width of [1527,390,320]) await screenshot(page,width);
  // Collect all render evidence before comparing so a mismatch retains useful diagnostics.
  for (const row of evidence.geometry) for (const [key,delta] of Object.entries(row.delta)) {
    assert.ok(Math.abs(delta)<1, `${row.selector}[${row.index}] ${key} differs from source by ${delta}px`);
  }
  assert.equal(evidence.apiReads.filter(path => path === '/api/affairs-data').length,0,'The static Education Fund route must not load account records.');

  await page.setViewportSize({width:1527,height:1000});
  for (const [menu,label,target,selector] of [
    ['sao/input','學產助學金申請','/school-affairs/services/21-2','.education-fund'],
    ['sao/input','請假填單','/school-affairs/services/leave','.student-leave'],
    ['sao/query','學生請假紀錄查詢','/school-affairs/services/leave/history','.student-leave'],
    ['rdd/input','實習紀錄輸入','/school-affairs/services/internship','.student-internship'],
  ]) {
    await page.goto(base+'/school-affairs/menu/'+menu);
    const link=page.getByRole('link',{name:label,exact:true}); await link.waitFor();
    assert.equal(await link.getAttribute('href'),target); await link.click();
    await page.waitForURL(url => url.pathname===target); await page.locator(selector).waitFor();
    evidence.menuNavigation.push({menu,label,target});
  }
  for (const [id,target,selector] of [
    ['20-1','/school-affairs/services/leave','.student-leave'],
    ['33-1','/school-affairs/services/leave/history','.student-leave'],
    ['53-1','/school-affairs/services/internship','.student-internship'],
  ]) {
    await page.goto(base+'/school-affairs/menu/sao/all'); await page.locator('#portal-program-search').waitFor();
    await page.goto(base+'/school-affairs/services/'+id+'?qa=preserve%20space&other=1#section');
    await page.waitForURL(url => url.pathname===target);
    assert.equal(new URL(page.url()).search,'?qa=preserve%20space&other=1');
    assert.equal(new URL(page.url()).hash,'#section'); await page.locator(selector).waitFor();
    if (id==='20-1') await page.getByLabel('開始請假日期',{exact:true}).waitFor();
    if (id==='33-1') await page.getByRole('heading',{name:/學生請假填表功能/}).waitFor();
    await page.goBack(); await page.waitForURL(url => url.pathname==='/school-affairs/menu/sao/all');
    evidence.aliases.push({id,target,queryAndHashPreserved:true,historyReplaced:true});
  }
  for (const route of ['21-2/unobserved','20-1/unobserved','999-999']) {
    await page.goto(base+'/school-affairs/services/'+route);
    await page.getByRole('heading',{name:'找不到服務 · Service not found',exact:true}).waitFor();
    assert.equal(new URL(page.url()).pathname,'/school-affairs/services/'+route);
    assert.equal(await page.locator('.education-fund,.student-leave,.student-internship').count(),0);
  }
  await signedIn.close();
  const guest = await context(false), guestPage = await guest.newPage();
  for (const route of ['21-2','20-1','33-1','53-1']) {
    await guestPage.goto(base+'/school-affairs/services/'+route);
    await guestPage.getByRole('button',{name:'Continue with Google',exact:true}).waitFor();
    assert.equal(new URL(guestPage.url()).pathname,'/school-affairs/login');
    assert.equal(new URL(guestPage.url()).searchParams.get('next'),'/school-affairs/services/'+route);
    assert.equal(await guestPage.locator('.education-fund,.student-leave,.student-internship').count(),0);
  }
  await guest.close();
  assert.deepEqual(evidence.pageErrors,[]); assert.deepEqual(evidence.blockedRequests,[]);
  evidence.status='passed';
  console.log('Education Fund UI passed: source geometry, 1527/390/320 containment, exact mount, menu navigation, numeric aliases and Google login gating. Synthetic local reads only; zero live API/model/provider calls.');
} catch(error) {
  evidence.status='failed'; evidence.error=error instanceof Error ? error.message : 'UI verification failed';
  throw error;
} finally {
  await browser.close();
  await writeFile(directory+'/result.json',JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
}
