import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {affairsTestUser, mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';

const base = process.env.PUBLIC_SITE_ORIGIN ?? 'http://127.0.0.1:5184';
const live = base === 'https://stu.best';
assert.ok(live || base === 'http://127.0.0.1:5184');
if (live) {
  const revision = process.env.EXPECTED_RELEASE_REVISION;
  assert.match(revision ?? '', /^[a-f0-9]{40}$/);
  const response = await fetch(base+'/release.json',{redirect:'error',signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200);
  const release = await response.json();
  assert.equal(release.revision,revision);
  assert.equal(release.environment,'production');
}
const root = '/school-affairs/services/23-1';
const fixture = 'Synthetic conference';
const report = 'Synthetic report text';
const output = 'artifacts/exchange-grant-ui/'+(live?'production':'local')+'-'+Date.now();
await mkdir(output,{recursive:true});
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
let stored = null;
let firstAction;
let posts = 0;
let foreign = false;
const errors = [];
const blocked = [];

async function context(signedIn) {
  const ctx = await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  ctx.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  await ctx.route('**/*',async route=>{
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === base && request.method() === 'GET') {
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/affairs-data' && url.search === '?scope=exchange-grant') {
        assert.ok(signedIn);
        return route.fulfill({json:{userId:foreign?'77777777-7777-4777-8777-777777777777':affairsTestUser.id,records:stored?[stored]:[]}});
      }
      return route.fulfill({json:schoolServiceReadFixture(url.href,'GET',affairsTestUser,base)});
    }
    if (url.origin === base && url.pathname === '/api/affairs-action' && !url.search && request.method() === 'POST') {
      assert.ok(signedIn);
      const action = request.postDataJSON();
      const {kind,payload} = action;
      const {id,expected_version,request_id,...fields} = payload;
      assert.equal(expected_version,stored?.version ?? 0);
      posts++;
      if (posts === 1) {
        firstAction = action;
        return route.fulfill({status:503,json:{error:'Unavailable'}});
      }
      if (posts === 2) assert.deepEqual(action,firstAction);
      assert.match(request_id,/^[a-f0-9-]{36}$/);
      const version = expected_version+1;
      if (kind === 'save_exchange_grant_draft') stored = {id,version,...fields,report_text:null};
      else if (kind === 'save_exchange_grant_report') stored = {...stored,version,report_text:fields.report_text};
      else {
        assert.equal(kind,'delete_exchange_grant_draft');
        stored = null;
      }
      return route.fulfill({json:{id,kind,version}});
    }
    blocked.push([url.origin,url.pathname,request.method()]);
    return route.abort('blockedbyclient');
  });
  await mockAffairsAuth(ctx,{signedIn});
  await ctx.routeWebSocket('**/*',socket=>socket.close());
  return ctx;
}
async function contained(page,width) {
  await page.setViewportSize({width,height:720});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflows at '+width);
}

try {
  const signed = await context(true);
  const page = await signed.newPage();
  await page.goto(base+'/school-affairs/menu/sao/all');
  const menu = page.locator('a[data-program-id="23-1"]');
  assert.equal(await menu.getAttribute('href'),root);
  await menu.click();
  await page.locator('.exchange-grant-index-table').waitFor();
  const table = page.locator('.exchange-grant-index-table');
  assert.deepEqual(await table.locator('th').allTextContents(),['角色','功能項目','功能說明']);
  assert.equal(await table.locator('tbody tr').count(),5);
  assert.deepEqual(await table.locator('tbody a').evaluateAll(links=>links.map(a=>a.getAttribute('href'))),
    ['conference','exchange','reports','receipts'].map(path=>root+'/'+path).concat('/stu-reference/grants/operation-manual.pdf'));
  const pdf = await page.request.get(base+'/stu-reference/grants/operation-manual.pdf');
  assert.equal(pdf.status(),200);
  assert.equal((await pdf.body()).subarray(0,5).toString(),'%PDF-');
  const box = await table.boundingBox();
  for (const [key,value] of Object.entries({x:130,y:185,width:933,height:133})) {
    assert.ok(Math.abs(box[key]-value)<=5,`Index table ${key}: ${box[key]} versus source ${value}`);
  }
  for (const width of [1280,390,320]) {
    await contained(page,width);
    await page.screenshot({path:`${output}/index-${width}.png`});
  }
  await page.setViewportSize({width:1280,height:720});
  await table.getByRole('link',{name:'國際交流申請作業'}).click();
  await page.waitForURL(base+root+'/exchange');
  await page.getByText('申請表暫未開放於此網站').waitFor();
  await page.getByRole('link',{name:'不同意，離開本系統'}).click();
  await table.getByRole('link',{name:'印領清冊列印作業'}).click();
  await page.getByRole('alertdialog').waitFor();
  await page.getByRole('link',{name:'確定',exact:true}).click();
  await page.waitForURL(base+root);
  await page.getByRole('button',{name:'學生功能選項'}).click();
  await page.getByRole('menuitem',{name:'校外研討會參展申請作業'}).click();
  await page.getByRole('main').getByRole('link',{name:'校外研討會參展申請作業',exact:true}).click();
  await page.waitForURL(base+root+'/conference/application');
  for (const [name,value] of Object.entries({
    department:'Synthetic department',activity_category:'Conference',starts_on:'2026-12-02',ends_on:'2026-12-03',
    activity_name:fixture,activity_location:'Synthetic city',topic:'Synthetic subject',region:'Synthetic region',
  })) await page.locator(`[name="${name}"]`).fill(value);
  await page.getByRole('radio',{name:'N-無住宿'}).check();
  await page.getByRole('button',{name:'儲存草稿'}).click();
  await page.getByRole('button',{name:'重試原操作'}).click();
  await page.getByText('已儲存草稿。').waitFor();
  assert.equal(stored.activity_name,fixture);
  await page.reload();
  await page.getByRole('button',{name:'檢視 '+fixture}).click();
  assert.equal(await page.getByLabel('活動名稱').inputValue(),fixture);
  await page.getByRole('button',{name:'學生功能選項'}).click();
  await page.getByRole('menuitem',{name:'心得報告填寫作業'}).click();
  await page.getByRole('button',{name:'檢視 '+fixture}).click();
  await page.getByLabel('心得報告',{exact:true}).fill(report);
  await page.getByRole('button',{name:'存檔',exact:true}).click();
  await page.getByText('已儲存心得報告。').waitFor();
  await page.reload();
  await page.getByRole('button',{name:'檢視 '+fixture}).click();
  assert.equal(await page.getByLabel('心得報告',{exact:true}).inputValue(),report);
  for (const width of [1280,390,320]) {
    await contained(page,width);
    await page.screenshot({path:`${output}/report-${width}.png`});
  }
  foreign = true;
  await page.reload();
  await page.getByRole('alert').getByText('暫時無法載入紀錄。').waitFor();
  assert.equal(await page.getByText(fixture,{exact:true}).count(),0);
  foreign = false;
  await page.goto(base+root+'/conference/application');
  await page.getByRole('button',{name:'檢視 '+fixture}).click();
  await page.getByRole('button',{name:'刪除',exact:true}).click();
  await page.getByRole('button',{name:'確認刪除'}).click();
  await page.getByText('已刪除草稿。').waitFor();
  assert.equal(stored,null);
  assert.equal(posts,4);

  const guest = await context(false);
  const guestPage = await guest.newPage();
  await guestPage.goto(base+root+'/reports');
  await guestPage.waitForURL(url=>url.pathname==='/school-affairs/login');
  assert.equal(await guestPage.locator('.exchange-grant').count(),0);
  assert.deepEqual(blocked,[]);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'passed',output,box,checks:['four routes and local manual','draft retry and reload','report persistence and deletion','guest and foreign account','three viewport widths']}));
} finally {
  await browser.close();
}
