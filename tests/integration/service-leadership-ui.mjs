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
const root='/school-affairs/services/42-1';
const catalog='/school-affairs/menu/sao/all';
const views=[
  ['preselection','服務實作單位預選','mtnSelectUnit.asp'],
  ['confirmation','服務實作單位確認','qrySelectUnit.asp'],
  ['lectures','服務講堂課程查詢','qryAllLecture.asp'],
  ['assignments','作業繳交及成績查詢','qryOffClass.asp'],
];
const output='artifacts/service-leadership-ui/'+(live?'production':'local')+'-'+Date.now();
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const errors=[], blocked=[];
async function context(signedIn) {
  const ctx=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  ctx.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  await ctx.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if (url.origin===base && request.method()==='GET') {
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const data=schoolServiceReadFixture(url.href,'GET',affairsTestUser,base);
      if (url.pathname==='/api/affairs-data' && !url.search) data.serviceRecords=[{
        id:'leadership-note',serviceKey:'42-1',recordType:'note',title:'Synthetic leadership note',
        notes:'Fixture',status:'draft',startsOn:null,endsOn:null,updatedAt:'2026-11-13T08:00:00Z',reviewStatus:null,
      }];
      return route.fulfill({json:data});
    }
    blocked.push([url.origin,url.pathname,request.method()]);
    return route.abort('blockedbyclient');
  });
  await mockAffairsAuth(ctx,{signedIn});
  await ctx.routeWebSocket('**/*',socket=>socket.close());
  return ctx;
}

try {
  const page=await (await context(true)).newPage();
  await page.goto(base+catalog);
  const entry=page.locator('a[data-program-id="42-1"]');
  assert.equal(await entry.getAttribute('href'),root);
  await entry.click();
  await page.getByRole('heading',{name:'功能說明'}).waitFor();
  const frame=await page.locator('.service-leadership-frame').boundingBox();
  for (const [key,value] of Object.entries({x:159,y:12,width:962,height:774}))
    assert.ok(Math.abs(frame[key]-value)<=2,`Leadership frame ${key} ${frame[key]} expected ${value}`);
  const main=await page.locator('.service-leadership-content main').boundingBox();
  for (const [key,value] of Object.entries({x:339,y:130,width:613}))
    assert.ok(Math.abs(main[key]-value)<=2,`Leadership main ${key} ${main[key]} expected ${value}`);
  for (const width of [1280,768,390,320]) {
    await page.setViewportSize({width,height:720});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`${output}/index-${width}.png`,fullPage:true});
  }
  const nav=page.getByRole('navigation',{name:'服務講堂課程'});
  await page.getByRole('button',{name:'收合選單'}).click();
  assert.equal(await nav.count(),0);
  await page.getByRole('button',{name:'展開選單'}).click();
  assert.equal(await nav.count(),1);
  for (const [path,heading,source] of views) {
    await page.getByRole('main').getByRole('link',{name:heading,exact:true}).click();
    await page.waitForURL(base+root+'/'+path);
    await page.getByRole('heading',{name:heading,exact:true,level:1}).waitFor();
    assert.equal(await nav.locator('a[aria-current="page"]').getAttribute('href'),root+'/'+path);
    const external=page.getByRole('link',{name:/開啟校方/});
    assert.equal(await external.getAttribute('href'),'https://info.stu.edu.tw/SAO/LSD/student/'+source);
    assert.equal(await external.getAttribute('target'),'_blank');
    await nav.getByRole('link',{name:'首頁',exact:true}).click();
    await page.waitForURL(base+root);
  }
  await page.getByRole('link',{name:'個人備註',exact:true}).click();
  await page.waitForURL(base+root+'/notes');
  await page.getByText('Synthetic leadership note',{exact:true}).waitFor();
  await page.goto(base+'/school-affairs/records/subjects');
  await page.getByRole('heading',{name:'我的修課紀錄'}).waitFor();
  await page.getByRole('row').filter({hasText:'SAMPLE-101'}).waitFor();
  assert.equal(new URL(page.url()).pathname,'/school-affairs/records/subjects');
  const guest=await (await context(false)).newPage();
  await guest.goto(base+root+'/lectures');
  await guest.waitForURL(url=>url.pathname==='/school-affairs/login');
  assert.equal(new URL(guest.url()).searchParams.get('next'),root+'/lectures');
  assert.deepEqual(errors,[]);
  assert.deepEqual(blocked,[]);
  console.log(JSON.stringify({status:'passed',output,frame,main,views:4,widths:4,notesPreserved:true,subjectDestination:true,guestGuarded:true}));
} finally {
  await browser.close();
}
