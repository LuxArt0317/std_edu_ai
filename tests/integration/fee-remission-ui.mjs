import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {affairsTestUser, mockAffairsAuth} from './helpers/affairs-auth.mjs';

const base = process.env.PUBLIC_SITE_ORIGIN || 'http://127.0.0.1:5184';
const live = base === 'https://stu.best';
assert.ok(live || base === 'http://127.0.0.1:5184');
async function verifyRelease() {
  if (!live) return;
  const revision = process.env.EXPECTED_RELEASE_REVISION;
  assert.match(revision ?? '', /^[0-9a-f]{40}$/);
  const response = await fetch(`${base}/release.json`, {redirect:'error', signal:AbortSignal.timeout(10000)});
  assert.equal(response.status, 200);
  const manifest = await response.json();
  assert.equal(manifest.revision, revision);
  assert.equal(manifest.environment, 'production');
}
await verifyRelease();
const path = '/school-affairs/services/21-3';
const source = JSON.parse(await readFile('artifacts/visual-parity/fee-remission/source.json','utf8'));
const output = `artifacts/fee-remission-ui/${live ? 'live' : 'local'}-${Date.now()}`;
await mkdir(output,{recursive:true});
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const userId = affairsTestUser.id;
const record = {id:'55555555-5555-4555-8555-555555555555',version:1,row_order:0,
  academic_year_text:'001',semester_text:'',student_number:null,category_text:'測試',amount_text:'0',check_status_text:null,notes_text:' 原文 '};
const snapshot = {profile:{userId,email:affairsTestUser.email,displayName:'QA Student',role:'student'},
  student:null,courses:[],charges:[],assignments:[],announcements:[],tasks:[],requests:[],serviceRecords:[],
  dtm:{sourceMode:'personal',courses:[],notices:[]}};
const result = {checks:[],geometry:[],screenshots:[],unexpected:[],errors:[],historyReads:0};
let mode = 'empty';
const manager = {...affairsTestUser,id:'11111111-1111-4111-8111-111111111111'};
const adminData = {profiles:[{user_id:userId,email:affairsTestUser.email,display_name:'QA Student',role:'student'}],
  students:[{id:record.id,user_id:userId,student_number:'QA-1',full_name:'QA Student'}],sections:[],enrollments:[],dtmCourses:[],charges:[],assignments:[],requests:[]};
let managed = [];
let firstAttempt;
let adminCalls = 0;

async function context(signedIn, asAdmin = false) {
  const ctx = await browser.newContext({viewport:source.viewport, serviceWorkers:'block'});
  await ctx.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (asAdmin && url.origin === base && url.pathname === '/api/affairs-manage' && !url.search && request.method() === 'POST') {
      const action = request.postDataJSON();
      assert.equal(action.payload.user_id,userId);
      adminCalls++;
      if (!firstAttempt) {
        firstAttempt = action;
        return route.fulfill({status:503,json:{error:'Unavailable'}});
      }
      if (adminCalls === 2) assert.deepEqual(action,firstAttempt,'Retry must keep the original request ID and payload.');
      const {id,expected_version,request_id:_request,user_id:_user,...cells} = action.payload;
      assert.equal(expected_version,managed[0]?.version ?? 0);
      if (action.kind === 'save_fee_remission') managed = [{id,version:expected_version+1,...cells}];
      else {
        assert.equal(action.kind,'delete_fee_remission');
        assert.equal(id,managed[0].id);
        managed = [];
      }
      return route.fulfill({json:{id,kind:action.kind,version:expected_version+1}});
    }
    if (url.origin === base && request.method() === 'GET') {
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname === '/api/affairs-data') {
        if (asAdmin) {
          const profile = {...snapshot.profile,userId:manager.id,role:'admin'};
          if (url.search === '') return route.fulfill({json:{...snapshot,profile}});
          if (url.search === '?scope=admin') return route.fulfill({json:{...snapshot,profile,admin:adminData}});
          if (url.search === '?scope=fee-remission-admin&user_id='+userId) return route.fulfill({json:{userId,records:managed}});
        }
        if (url.search === '') return route.fulfill({json:snapshot});
        if (url.search === '?scope=fee-remission') {
          result.historyReads++;
          if (mode === 'failure') return route.fulfill({status:503,json:{error:'Unavailable'}});
          return route.fulfill({json:{userId:mode === 'foreign'?'77777777-7777-4777-8777-777777777777':userId,
            records:mode === 'empty'?[]:[record]}});
        }
      }
      if (url.pathname === '/api/affairs-conversations' && !url.search) return route.fulfill({json:{conversations:[]}});
    }
    result.unexpected.push({path:url.pathname,origin:url.origin,method:request.method()});
    return route.abort('blockedbyclient');
  });
  await mockAffairsAuth(ctx,{signedIn,user:asAdmin?manager:affairsTestUser});
  await ctx.routeWebSocket('**/*', socket => socket.close());
  ctx.on('page', page => page.on('pageerror', error => result.errors.push(error.message)));
  return ctx;
}
try {
  const signedIn = await context(true), page = await signedIn.newPage();
  await page.goto(base+'/school-affairs/menu/sao/all');
  const link = page.locator('a[data-program-id="21-3"]');
  assert.equal(await link.getAttribute('href'), path);
  await link.click();
  await page.getByText('目前尚無申請紀錄',{exact:true}).waitFor();
  assert.equal(new URL(page.url()).pathname,path);
  assert.equal(await page.locator('.fee-remission ol li').count(),5);
  assert.equal(await page.locator('.fee-remission form,.fee-remission input,.fee-remission button').count(),0);
  assert.deepEqual(await page.locator('.fee-remission th').allTextContents(),['學年','學期','學號','類別','金額','檢核狀態','備註說明']);
  assert.equal(await page.getByRole('link',{name:'休退學退費標準表'}).getAttribute('href'),'/school-sites/www.acc.stu.edu.tw/');
  await page.evaluate(() => document.fonts.ready);
  const sourceTables = source.elements.filter(row => row.tag === 'TABLE');
  for (const [selector, expected] of [['.fee-remission-notice',sourceTables[0]],['.fee-remission-results table',sourceTables[1]]]) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box);
    result.geometry.push({selector, expected:{x:expected.x,y:expected.y,width:expected.width,height:expected.height}, actual:box});
    for (const key of ['x','y','width','height']) assert.ok(Math.abs(box[key]-expected[key]) <= 3, `${selector} ${key}`);
  }
  for (const width of [1280,390,320]) {
    await page.setViewportSize({width,height:720});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path:`${output}/${width}.png`,fullPage:true});
    result.screenshots.push(width);
  }
  result.checks.push('catalog-link-source-layout-and-responsive-empty-history');
  for (const failure of ['failure','foreign']) {
    mode = failure;
    await page.reload();
    await page.getByText('暫時無法確認申請紀錄。',{exact:true}).waitFor();
    assert.equal(await page.getByText('目前尚無申請紀錄',{exact:true}).count(),0);
    assert.equal(await page.locator('.fee-remission tbody td').count(),1);
  }
  mode = 'record';
  await page.getByRole('button',{name:'重試',exact:true}).click();
  await page.locator('.fee-remission tbody td').nth(4).filter({hasText:'0'}).waitFor();
  assert.deepEqual(await page.locator('.fee-remission tbody td').allTextContents(),['001','','','測試','0','',' 原文 ']);
  await page.goto(base+path+'/notes');
  await page.getByRole('button',{name:/New record/}).waitFor();
  result.checks.push('failed-and-foreign-history-retry-and-existing-notes');
  const guest = await (await context(false)).newPage();
  const before = result.historyReads;
  await guest.goto(base+path);
  await guest.waitForURL(/\/school-affairs\/login/);
  assert.equal(await guest.locator('.fee-remission').count(),0);
  assert.equal(result.historyReads,before);
  result.checks.push('guest-gate');
  const admin = await (await context(true,true)).newPage();
  await admin.goto(base+'/school-affairs/admin/records');
  await admin.getByRole('button',{name:'Manage tuition-reduction history'}).click();
  const editor = admin.getByRole('region',{name:'學雜費減免紀錄管理'});
  await editor.locator('input[name="amount_text"]').fill('0');
  await editor.locator('input[name="semester_text-null"]').uncheck();
  await editor.getByRole('button',{name:'儲存減免紀錄'}).click();
  await editor.getByRole('button',{name:'重試原操作'}).waitFor();
  assert.equal(await admin.locator('.affairs-manager-student select').isEnabled(),false);
  await editor.getByRole('button',{name:'重試原操作'}).click();
  await editor.getByRole('button',{name:'編輯第 1 筆'}).click();
  assert.equal(await editor.locator('input[name="amount_text"]').inputValue(),'0');
  assert.equal(managed[0].semester_text,'');
  assert.equal(managed[0].academic_year_text,null);
  await editor.locator('input[name="amount_text"]').fill(' 001,000 ');
  await editor.getByRole('button',{name:'儲存減免紀錄'}).click();
  await editor.getByRole('button',{name:'編輯第 1 筆'}).click();
  assert.equal(managed[0].amount_text,' 001,000 ');
  await editor.getByRole('button',{name:'刪除這筆紀錄'}).click();
  await editor.getByRole('button',{name:'確認刪除'}).click();
  await editor.getByText('已刪除減免紀錄。',{exact:true}).waitFor();
  assert.deepEqual(managed,[]);
  assert.equal(adminCalls,4);
  result.checks.push('selected-student-manager-create-retry-edit-and-delete');
  assert.deepEqual(result.unexpected,[]);
  assert.deepEqual(result.errors,[]);
  await verifyRelease();
  result.status = 'passed';
} finally {
  await browser.close();
  await writeFile(`${output}/result.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify({output,...result}));
}
