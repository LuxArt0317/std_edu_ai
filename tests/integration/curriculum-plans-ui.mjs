import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';
import {curriculumPrograms,curriculumProgramPath,curriculumTable} from '../../src/features/public/affairs/curriculumPlans.js';

const origin=process.env.PUBLIC_SITE_ORIGIN ?? 'http://127.0.0.1:5184';
const live=origin==='https://stu.best';
assert.ok(live || origin==='http://127.0.0.1:5184');
if(live) {
  const revision=process.env.EXPECTED_RELEASE_REVISION;
  assert.match(revision ?? '',/^[a-f0-9]{40}$/);
  const response=await fetch(origin+'/release.json',{redirect:'error',signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200);
  assert.equal((await response.json()).revision,revision);
}
const root='/school-affairs/services/12-5';
const viewer=origin+'/api/affairs-data?scope=curriculum-plan&code=115101';
const failures=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});

async function open(signedIn) {
  const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  context.on('page',page=>page.on('pageerror',error=>failures.push(error.message)));
  await context.route(/^https?:\/\//,async route=>{
    const request=route.request(),url=new URL(request.url());
    if (url.origin===origin && request.method()==='GET') {
      if (!url.pathname.startsWith('/api/') || (live&&url.href===viewer)) return route.continue();
      if (url.href===viewer) return route.fulfill({body:'%PDF-1.4\n%%EOF',contentType:'application/pdf'});
      const data=schoolServiceReadFixture(url.href,'GET',affairsTestUser,origin);
      if (url.pathname==='/api/affairs-data' && !url.search) data.serviceRecords=[{
        id:'curriculum-note',serviceKey:'12-5',recordType:'note',title:'Synthetic curriculum note',notes:'',
        status:'draft',startsOn:null,endsOn:null,updatedAt:'2026-11-13T08:00:00Z',reviewStatus:null,
      }];
      return route.fulfill({json:data});
    }
    failures.push(request.method()+' '+url.origin+url.pathname);
    return route.abort();
  });
  await mockAffairsAuth(context,{signedIn});
  await context.routeWebSocket('**/*',socket=>socket.close());
  return context.newPage();
}

try {
  const page=await open(true);
  await page.goto(origin+'/school-affairs/menu/aca/all');
  const link=page.locator('a[data-program-id="12-5"]');
  assert.equal(await link.getAttribute('href'),root);
  await link.click();
  await page.waitForURL(origin+root);
  const table=page.getByRole('table');
  await table.waitFor();
  const shell=await page.locator('.curriculum-plans > main').boundingBox();
  assert.deepEqual({x:shell.x,y:shell.y,width:shell.width},{x:159,y:36,width:962});
  const matrix=await table.boundingBox();
  assert.equal(matrix.x,184);
  assert.equal(matrix.width,912);
  assert.ok(Math.abs(matrix.y-190.9)<2);
  assert.ok(Math.abs(matrix.height-1261)<5,`Expected source table height, got ${matrix.height}`);
  for (const {code,label} of curriculumPrograms) {
    const nav=page.getByRole('navigation',{name:'學制'});
    await nav.getByRole('link',{name:label,exact:true}).click();
    for (const archive of [false,true]) {
      await page.waitForURL(origin+curriculumProgramPath(code,archive));
      const expected=curriculumTable(code,archive);
      await table.getByRole('caption').filter({hasText:label}).waitFor({state:'attached'});
      await table.locator('thead th:nth-child(2)').filter({hasText:new RegExp('^'+(archive?'105':'115')+'$')}).waitFor();
      assert.equal(await table.getByRole('columnheader').nth(1).innerText(),archive?'105':'115');
      assert.equal(await table.getByRole('row').count(),expected.rows.length);
      assert.equal(await table.locator('tbody a').count(),expected.rows.flat().filter(cell=>typeof cell!=='string').length);
      if(!archive) await page.getByRole('link',{name:'瀏覽十年以前的課程規劃'}).click();
    }
    await page.getByRole('link',{name:'返回近期課程規劃'}).click();
    await page.waitForURL(origin+curriculumProgramPath(code));
  }
  await page.getByRole('link',{name:'四技日間部',exact:true}).click();
  const pdfLoaded=page.waitForResponse(viewer);
  await page.getByRole('link',{name:'資管115',exact:true}).click();
  await page.waitForURL(origin+root+'/plan/115101');
  const response=await pdfLoaded;
  assert.equal(response.status(),200);
  assert.match(response.headers()['content-type'],/^application\/pdf/);
  assert.equal(await page.locator('iframe[title="資管115 課程規劃 PDF"]').getAttribute('src'),new URL(viewer).pathname+new URL(viewer).search);
  assert.equal(await page.getByRole('link',{name:'開啟校方 PDF'}).getAttribute('href'),
    'https://info.stu.edu.tw/ACA/teacher/QryCoursedept/DownLoadFileori.asp?Sec=115101');
  for(const width of [768,390,320]) {
    await page.setViewportSize({width,height:720});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Preview overflow at '+width);
    await page.getByRole('link',{name:'返回課程規劃表'}).click();
    await table.waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Table overflow at '+width);
    if(width!==320) await page.getByRole('link',{name:'資管115',exact:true}).click();
  }
  await page.getByRole('link',{name:'個人備註'}).click();
  await page.getByText('Synthetic curriculum note',{exact:true}).waitFor();
  await page.goto(origin+root+'/plan/invalid');
  await page.getByText('查無課程規劃資料。',{exact:false}).waitFor();
  assert.equal(await page.locator('iframe').count(),0);
  const guest=await open(false);
  for(const path of [root,root+'/program/6/archive',root+'/plan/115101']) {
    await guest.goto(origin+path);
    await guest.waitForURL(url=>url.pathname==='/school-affairs/login');
    assert.equal(new URL(guest.url()).searchParams.get('next'),path);
  }
  assert.deepEqual(failures,[]);
  console.log(JSON.stringify({status:'passed',tables:24,viewports:[1280,768,390,320],documentBytes:live?'university PDF':'fixture',notesPreserved:true,guestRoutes:3,shell,matrix}));
} finally {
  await browser.close();
}
