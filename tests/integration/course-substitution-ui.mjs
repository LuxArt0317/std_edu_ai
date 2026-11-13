import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mockAffairsAuth,affairsTestUser} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';

const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5184';
const api=process.env.SUBSTITUTION_API_ORIGIN??origin;
const root='/school-affairs/services/12-8';
assert.ok(['http://127.0.0.1:5184','https://stu.best'].includes(origin));
assert.ok(['http://127.0.0.1:5200','https://stu.best'].includes(api));
if (origin==='https://stu.best') {
  const manifest=await (await fetch(origin+'/release.json',{cache:'no-store'})).json();
  assert.match(process.env.EXPECTED_RELEASE_REVISION??'',/^[0-9a-f]{40}$/);
  assert.equal(manifest.revision,process.env.EXPECTED_RELEASE_REVISION);
}
const resultPath=year=>'/api/affairs-data?'+new URLSearchParams({scope:'course-substitution',year,track:'1',department:'01'});
const failures=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
let failNext=false;
async function pageFor(signedIn){
  const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  await context.route(/^https?:\/\//,async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===origin && req.method()==='POST' && url.pathname==='/api/research-assistant'){
      assert.equal(req.headers().authorization,undefined);
      assert.equal(req.postDataJSON().route,root+'/results/110/1/01');
      assert.equal(req.postDataJSON().question,'What replaces IMU07302?');
      if(origin===api)return route.continue();
      const result=await context.request.post(api+url.pathname,{data:req.postDataJSON()});
      return route.fulfill({response:result});
    }
    if(url.origin===origin && req.method()==='POST' && url.pathname==='/api/affairs-conversations'){
      const message=req.postDataJSON();
      return route.fulfill({json:{id:message.id,title:message.title,messages:message.messages,version:1,updated_at:new Date().toISOString()}});
    }
    if(url.origin!==origin||req.method()!=='GET'){
      failures.push(req.method()+' '+url.origin+url.pathname);
      return route.abort();
    }
    if(url.pathname==='/api/affairs-data'&&url.searchParams.get('scope')?.startsWith('course-substitution')){
      assert.equal(req.headers().authorization,undefined);
      if(failNext&&url.searchParams.get('scope')==='course-substitution'){
        failNext=false;
        return route.fulfill({status:502,json:{error:'Temporary error'}});
      }
      if(origin===api)return route.continue();
      return route.fulfill({response:await context.request.get(api+url.pathname+url.search)});
    }
    if(url.pathname.startsWith('/api/'))return route.fulfill({json:schoolServiceReadFixture(url.href,req.method(),affairsTestUser,origin)});
    return route.continue();
  });
  await mockAffairsAuth(context,{signedIn});
  const page=await context.newPage();
  page.on('pageerror',error=>failures.push(error.message));
  return page;
}
try {
  const page=await pageFor(true);
  await page.goto(origin+'/school-affairs/menu/aca/all');
  await page.locator('a[data-program-id="12-8"]').click();
  await page.waitForURL(origin+root);
  await page.getByRole('heading',{name:'替代科目查詢'}).waitFor();
  const shell=await page.locator('.course-substitution > main').boundingBox();
  const grid=await page.locator('.substitution-table').boundingBox();
  assert.deepEqual([shell.x,shell.y,shell.width],[159,12,962]);
  assert.ok(Math.abs(grid.x-207)<2&&Math.abs(grid.y-349)<15&&Math.abs(grid.width-866)<2,JSON.stringify(grid));
  await page.getByLabel('屆別').selectOption('110');
  await page.getByLabel('學制').selectOption({label:'四技日間部'});
  await page.getByLabel('開課單位').fill('資管');
  await page.getByRole('button',{name:'資管系 01',exact:true}).click();
  failNext=true;
  await page.getByRole('button',{name:'查詢',exact:true}).click();
  await page.waitForURL(origin+root+'/results/110/1/01');
  await page.getByRole('alert').getByRole('button',{name:'重試'}).click();
  await page.locator('#course-IMU07302').waitFor();
  assert.equal(await page.locator('.substitution-old-course').count(),16);
  await page.getByRole('button',{name:'替代科目明細 IMU07302'}).click();
  await page.locator('#course-IMU07302-details').getByText('IMU07201',{exact:true}).waitFor();
  await page.getByRole('button',{name:'開啟所有替代科目明細'}).click();
  await page.locator('#course-IMU08002-details').getByText('無替代科目資料！',{exact:true}).waitFor();
  await page.locator('#course-IMU07402-details').getByText('未列出替代科目明細。',{exact:true}).waitFor();
  await page.getByRole('button',{name:'關閉所有替代科目明細'}).click();
  await page.locator('#course-IMU07302-details').waitFor({state:'hidden'});
  await page.goto(origin+root+'/results/110/1/01#course-IMU07302');
  await page.locator('#course-IMU07302-details').getByText('IMU07201',{exact:true}).waitFor();
  for(const width of [1280,768,390,320]){
    await page.setViewportSize({width,height:720});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}px`);
  }
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill('What replaces IMU07302?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  const assistant=page.getByRole('dialog',{name:/校園助理/});
  await assistant.getByText('IMU07201',{exact:false}).first().waitFor();
  await assistant.locator('summary').filter({hasText:'Activity'}).click();
  await assistant.getByText('Checked the course substitution records',{exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await page.getByLabel('屆別').selectOption('115');
  await page.getByRole('button',{name:'查詢',exact:true}).click();
  await page.waitForURL(origin+root+'/results/115/1/01');
  await page.getByText('查無資料，請重新選擇屆別、學制及開課單位！').waitFor();
  await page.getByRole('link',{name:'個人備註'}).click();
  await page.locator('.student-service').waitFor();
  const guest=await pageFor(false);
  await guest.goto(origin+root+'/results/110/1/01#course-IMU07302');
  await guest.waitForURL(url=>url.pathname==='/school-affairs/login');
  assert.equal(new URL(guest.url()).searchParams.get('next'),root+'/results/110/1/01#course-IMU07302');
  for(const [year,count] of [['110',16],['113',3],['115',0]]){
    const r=await fetch(api+resultPath(year),{signal:AbortSignal.timeout(17000)});
    assert.equal(r.status,200);
    const result=await r.json();
    assert.equal(result.courses.length,count);
    assert.equal(result.department.code,'01');
    console.log(JSON.stringify({year,count,source:result.source}));
  }
  assert.deepEqual(failures,[]);
  console.log('Course substitution menu, source layout, filters, retry, detail groups, deep link, mobile and guest return passed.');
} finally {await browser.close();}
