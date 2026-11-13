import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';

const base=process.env.PUBLIC_SITE_ORIGIN ?? 'http://127.0.0.1:5184';
const live=base==='https://stu.best';
assert.ok(live || base==='http://127.0.0.1:5184');
if (live) {
  const revision=process.env.EXPECTED_RELEASE_REVISION;
  assert.match(revision ?? '',/^[a-f0-9]{40}$/);
  const response=await fetch(base+'/release.json',{redirect:'error',signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200);
  const manifest=await response.json();
  assert.equal(manifest.revision,revision);
  assert.equal(manifest.environment,'production');
}
const ta='/school-affairs/services/25-1';
const survey='/school-affairs/services/28-1';
const menu='/school-affairs/menu/sao/all';
const output='artifacts/tutor-evaluation-ui/'+(live?'production':'local')+'-'+Date.now();
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const errors=[],blocked=[];
const userId=affairsTestUser.id;
const student={number:'QA-11',name:'Synthetic Student',department:'Synthetic Department',year:4};
const submittedAt='2026-11-13T14:00:00Z';
let saved=null, firstRequest, foreign=false, posts=0;
async function context(signedIn) {
  const ctx=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  ctx.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  await ctx.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if (url.origin===base && request.method()==='GET') {
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (url.pathname==='/api/affairs-data' && url.search==='?scope=tutor-evaluation') {
        assert.ok(signedIn);
        return route.fulfill({json:{userId:foreign?'77777777-7777-4777-8777-777777777777':userId,student,evaluation:saved}});
      }
      return route.fulfill({json:schoolServiceReadFixture(url.href,'GET',affairsTestUser,base)});
    }
    if (url.origin===base && url.pathname==='/api/affairs-action' && !url.search && request.method()==='POST') {
      assert.ok(signedIn);
      const action=request.postDataJSON();
      assert.equal(action.kind,'submit_tutor_evaluation');
      assert.deepEqual(Object.keys(action.payload).sort(),['comment','ratings','request_id']);
      assert.deepEqual(action.payload.ratings,[5,4,3,2,1,5,4,3,2,1]);
      if (++posts===1) {
        firstRequest=action;
        return route.fulfill({status:503,json:{error:'Retry'}});
      }
      assert.deepEqual(action,firstRequest);
      assert.equal(posts,2);
      saved={ratings:action.payload.ratings,comment:action.payload.comment,submittedAt};
      return route.fulfill({json:{userId,requestId:action.payload.request_id,submittedAt}});
    }
    blocked.push([url.origin,url.pathname,request.method()]);
    return route.abort('blockedbyclient');
  });
  await mockAffairsAuth(ctx,{signedIn});
  await ctx.routeWebSocket('**/*',socket=>socket.close());
  return ctx;
}
async function screenshot(page,view,width) {
  await page.setViewportSize({width,height:720});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),view+' overflowed at '+width);
  await page.screenshot({path:`${output}/${view}-${width}.png`,fullPage:true});
}

try {
  const ctx=await context(true);
  const page=await ctx.newPage();
  for (const id of ['25-1','25-2']) {
    await page.goto(base+menu);
    await page.locator(`a[data-program-id="${id}"]`).click();
    await page.locator('.ta-index table').waitFor();
    assert.equal(new URL(page.url()).pathname,'/school-affairs/services/'+id);
  }
  const box=await page.locator('.ta-index table').boundingBox();
  for (const [key,value] of Object.entries({x:130,y:180,width:933,height:86})) {
    assert.ok(Math.abs(box[key]-value)<=2,`TA table ${key} ${box[key]} expected ${value}`);
  }
  for (const width of [1280,390,320]) await screenshot(page,'ta',width);
  await page.getByRole('button',{name:'學生',exact:true}).click();
  await page.getByRole('menuitem',{name:'撰寫/維護學習單'}).click();
  await page.waitForURL(base+ta+'/report');
  await page.getByRole('alertdialog').getByRole('button',{name:'確定'}).click();
  await page.waitForURL(base+ta);
  await page.getByRole('link',{name:'教學助理自我評表'}).click();
  await page.waitForURL(base+ta+'/evaluation');
  await page.getByText('無問卷記錄，期待下次您的協助與配合。').waitFor();
  for (const width of [1280,390,320]) await screenshot(page,'ta-evaluation',width);
  await page.getByRole('link',{name:'教學助理(TA)管理系統'}).click();
  await page.waitForURL(base+ta);

  for (const id of ['25-1','25-2','28-1']) {
    await page.goto(base+'/school-affairs/services/'+id+'/notes');
    await page.locator('.student-service').waitFor();
    assert.equal(await page.getByText('找不到服務 · Service not found').count(),0);
  }

  await page.goto(base+menu);
  await page.locator('a[data-program-id="28-1"]').click();
  await page.waitForURL(base+survey);
  await page.getByText('Synthetic Student',{exact:true}).waitFor();
  assert.equal(await page.getByRole('radiogroup').count(),10);
  assert.equal(await page.getByRole('radio').count(),50);
  await page.getByRole('button',{name:'完成'}).click();
  assert.equal(posts,0);
  for (let i=0;i<10;i++) await page.getByRole('radiogroup').nth(i).getByRole('radio',{name:String(5-i%5),exact:true}).check();
  await page.getByRole('textbox',{name:/對於我的導師/}).fill('Synthetic feedback');
  for (const width of [1280,768,390,320]) await screenshot(page,'tutor',width);
  await page.getByRole('button',{name:'完成'}).click();
  await page.getByRole('button',{name:'重試',exact:true}).click();
  await page.getByText('已儲存至 stu.best。').waitFor();
  await page.reload();
  await page.getByText('已儲存至 stu.best。').waitFor();
  assert.equal(await page.getByRole('radio',{checked:true}).count(),10);
  assert.equal(await page.getByRole('textbox',{name:/對於我的導師/}).inputValue(),'Synthetic feedback');
  assert.equal(await page.getByRole('button',{name:'完成'}).count(),0);
  foreign=true;
  await page.reload();
  await page.getByRole('alert').getByText('暫時無法載入問卷。').waitFor();
  assert.equal(await page.getByText('Synthetic Student',{exact:true}).count(),0);
  assert.equal(await page.getByRole('textbox',{name:/對於我的導師/}).inputValue(),'');
  const guest=await context(false);
  const guestPage=await guest.newPage();
  for (const path of [ta+'/evaluation',survey]) {
    await guestPage.goto(base+path);
    await guestPage.waitForURL(url=>url.pathname==='/school-affairs/login');
    assert.equal(new URL(guestPage.url()).searchParams.get('next'),path);
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(blocked,[]);
  console.log(JSON.stringify({status:'passed',output,box,checks:['both TA catalog links','TA report return and questionnaire event','ten required answers','retry and reload','guest and foreign-account denial','three viewport widths']}));
} finally {
  await browser.close();
}
