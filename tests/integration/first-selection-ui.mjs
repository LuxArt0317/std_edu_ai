import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mockAffairsAuth,affairsTestUser} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';

const origin=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184';
const api=process.env.FIRST_SELECTION_API_ORIGIN||origin;
assert.ok(['https://stu.best','http://127.0.0.1:5184'].includes(origin));
assert.ok(['https://stu.best','http://127.0.0.1:5201'].includes(api));
const root='/school-affairs/services/6-1';
const noticeUrl='/api/affairs-data?scope=first-selection-notice';
const checkRelease=async()=>{
  if(origin==='https://stu.best'){
    assert.match(process.env.EXPECTED_RELEASE_REVISION??'',/^[0-9a-f]{40}$/u);
    const release=await (await fetch(origin+'/release.json',{cache:'no-store'})).json();
    assert.equal(release.revision,process.env.EXPECTED_RELEASE_REVISION);
  }
};
await checkRelease();
const raw=await fetch(api+noticeUrl,{signal:AbortSignal.timeout(15000)});
assert.equal(raw.status,200);
const notice=await raw.json();
assert.deepEqual(notice.windows.map(row=>[new Date(row.opensAt).toISOString(),new Date(row.closesAt).toISOString()]),[
  ['2026-06-08T02:00:00.000Z','2026-06-18T01:00:00.000Z'],
  ['2026-08-04T02:00:00.000Z','2026-08-10T01:00:00.000Z'],
  ['2026-08-30T02:00:00.000Z','2026-09-03T01:00:00.000Z'],
]);
assert.deepEqual([notice.academicYear,notice.semester,notice.feeNotes.length],[115,1,3]);
for(const [path,method,status] of [[noticeUrl+'&user_id=qa','GET',400],[noticeUrl+'&scope=first-selection-notice','GET',400],[noticeUrl,'POST',405]]){
  assert.equal((await fetch(api+path,{method,signal:AbortSignal.timeout(15000)})).status,status);
}
const question='When is initial course selection?';
for(const [message,path,match,status] of [
  [question,root,/18\/06,?\s+09:00/u,'answered'],
  ['初選的收費規則是什麼？',root+'/fees',/零學分課程/u,'answered'],
  ['What is the initial course selection schedule for 115-2?',root,/no saved first-selection notice/u,'handoff'],
]){
  const response=await fetch(api+'/api/research-assistant',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({question:message,route:path}),signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200);
  const result=await response.json();
  assert.match(result.answer,match);
  assert.equal(result.status,status);
  if(status==='answered')assert.equal(result.citations[0].url,path);
  assert.equal(result.activity[0].kind,'first-selection');
}
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const problems=[];
let failNext=false;
try{
  const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  await context.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    try {
      if(url.pathname==='/api/research-assistant' && request.method()==='POST'){
        assert.equal(request.headers().authorization,undefined);
        assert.equal(request.postDataJSON().question,question);
        assert.equal(request.postDataJSON().route,root);
        if(api===origin)return route.continue();
        return route.fulfill({response:await context.request.post(api+url.pathname,{data:request.postDataJSON()})});
      }
      if(url.pathname==='/api/affairs-conversations' && request.method()==='POST'){
        const message=request.postDataJSON();
        return route.fulfill({json:{id:message.id,title:message.title,messages:message.messages,version:1,updated_at:new Date().toISOString()}});
      }
      if(url.pathname+url.search===noticeUrl){
        assert.equal(request.method(),'GET');
        assert.equal(request.headers().authorization,undefined);
        if(failNext){failNext=false;return route.fulfill({status:503,json:{error:'Fixture unavailable'}});}
        if(api===origin)return route.continue();
        return route.fulfill({response:await context.request.get(api+noticeUrl)});
      }
      return route.fulfill({json:schoolServiceReadFixture(url.href,request.method(),affairsTestUser,origin)});
    }catch(error){problems.push(String(error));return route.abort();}
  });
  await mockAffairsAuth(context);
  const page=await context.newPage();
  page.on('pageerror',error=>problems.push(error.message));
  await page.goto(origin+'/school-affairs/menu/aca/all');
  await page.getByRole('link',{name:'初選',exact:true}).click();
  await page.waitForURL(origin+root);
  await page.getByRole('table').waitFor();
  assert.equal(await page.locator('tbody tr').count(),3);
  const grid=await page.getByRole('table').boundingBox();
  const action=await page.getByRole('link',{name:'進入初選主畫面'}).boundingBox();
  assert.deepEqual([grid.x,grid.width],[26,1228]);
  assert.ok(Math.abs(grid.y-132)<=2 && Math.abs(grid.height-246.5)<=2,JSON.stringify(grid));
  assert.ok(Math.abs(action.y-668.0625)<=5,JSON.stringify(action));
  console.log({schedule:grid,action});
  const header=page.locator('.first-selection h1 img');
  assert.equal(await header.evaluate(img=>img.naturalWidth),368);
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill(question);
  await page.getByRole('button',{name:'Send',exact:true}).click();
  const assistant=page.getByRole('dialog',{name:/校園助理/});
  await assistant.getByText('All three windows in this notice have ended.',{exact:false}).first().waitFor();
  await assistant.locator('summary').filter({hasText:'Activity'}).click();
  await assistant.getByText('Published first-selection notice saved in School Affairs.',{exact:true}).waitFor();
  await page.keyboard.press('Escape');
  for(const width of [768,390,320]){
    await page.setViewportSize({width,height:720});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Schedule overflow at ${width}`);
  }
  await page.getByRole('link',{name:'進入初選主畫面'}).click();
  await page.waitForURL(origin+root+'/fees');
  await page.getByRole('heading',{name:'其他事項'}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1280,height:720});
  const feeAction=await page.getByRole('button',{name:'進入初選系統'}).boundingBox();
  console.log({fees:feeAction});
  assert.deepEqual([feeAction.x,feeAction.width],[36,411]);
  assert.ok(Math.abs(feeAction.y-312.28125)<=18,JSON.stringify(feeAction));
  await page.getByRole('button',{name:'進入初選系統'}).click();
  await page.getByRole('alertdialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('alertdialog').waitFor({state:'hidden'});
  assert.equal(page.url(),origin+root+'/fees');
  await page.getByRole('button',{name:'進入初選系統'}).click();
  await page.getByRole('button',{name:'OK',exact:true}).click();
  await page.waitForURL(origin+'/school-affairs');
  failNext=true;
  await page.goto(origin+root);
  await page.getByRole('alert').filter({hasText:'初選公告暫時無法載入'}).waitFor();
  await page.getByRole('button',{name:'重試'}).click();
  await page.getByRole('table').waitFor();
  await context.close();
  const guest=await browser.newContext();
  await mockAffairsAuth(guest,{signedIn:false});
  const gate=await guest.newPage();
  await gate.goto(origin+root+'/fees');
  await gate.waitForURL('**/school-affairs/login?next=*');
  assert.equal(new URL(gate.url()).searchParams.get('next'),root+'/fees');
  await guest.close();
  assert.deepEqual(problems,[]);
  await checkRelease();
  console.log('First selection menu, Supabase dates and fees, public assistant, retry, mobile containment and guest return passed.');
} finally {await browser.close();}
