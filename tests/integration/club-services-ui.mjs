import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { affairsTestUser as user, mockAffairsAuth } from './helpers/affairs-auth.mjs';
import { clubPath, clubScope } from '../../server/clubServicesContract.js';

const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:54635';
async function pin(){
  if(origin!=='https://stu.best')return;
  assert.match(process.env.EXPECTED_RELEASE_REVISION??'',/^[a-f0-9]{40}$/u);
  const response=await fetch(origin+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  assert.equal((await response.json()).revision,process.env.EXPECTED_RELEASE_REVISION);
}
await pin();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
  await mockAffairsAuth(context);
  const club={id:'10000000-0000-4000-8000-000000000001',name:'QA Club'};
  const equipment={id:'10000000-0000-4000-8000-000000000002',label:'QA Microphone',category:'A01'};
  const recordId='10000000-0000-4000-8000-000000000003';
  const student={student_number:'QA0001',student_name:'QA Student'};
  const today='2026-11-14';
  const requests=[];
  const writes=[];
  let failSubmission=true;
  await context.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),view=url.searchParams.get('view');
    if(url.searchParams.get('scope')===clubScope) {
      assert.equal(request.method(),'GET');
      assert.match(request.headers().authorization??'',/^Bearer /u);
      const base={userId:user.id,view,manager:false,today,student:null,clubs:[],equipment:[],rows:[]};
      if(view==='review')return route.fulfill({status:403,json:{error:'此帳戶無法查看這個頁面。'}});
      if(view==='activities'){
        if(url.searchParams.get('month')==='2026-11')base.rows=[{id:recordId,title:'QA Club Workshop',club_name:club.name,category:'lecture',
          starts_at:'2026-11-19T09:00:00+08:00',ends_at:'2026-11-19T11:00:00+08:00',location:'QA Room',description:'QA hands-on session'}];
        return route.fulfill({json:base});
      }
      assert.equal(view,'equipment');
      return route.fulfill({json:{...base,student,clubs:[club],equipment:[equipment],rows:requests}});
    }
    if(url.pathname==='/api/affairs-action') {
      const action=request.postDataJSON();
      writes.push(action);
      assert.equal(request.method(),'POST');
      assert.match(action.payload.request_id,/^[a-f0-9-]{36}$/u);
      const {kind,payload}=action;
      const {id,expected_version,request_id,items,...fields}=payload;
      if(kind==='submit_club_equipment'){
        assert.ok(!('student_number' in payload));
        assert.deepEqual(items,[equipment.id]);
        if(failSubmission){failSubmission=false;return route.fulfill({status:503,json:{error:'請重試。'}});}
        assert.equal(request_id,writes[0].payload.request_id);
        requests.push({...student,...fields,id:recordId,club_name:club.name,collateral:'',status:'submitted',version:1,
          items:[{id:equipment.id,label:equipment.label}],updated_at:'2026-11-14T09:00:00.000Z'});
      } else {
        assert.equal(id,recordId);
        assert.equal(expected_version,requests[0].version);
        if(kind==='edit_club_equipment')Object.assign(requests[0],fields,{version:2});
        else {assert.equal(kind,'cancel_club_equipment');Object.assign(requests[0],{version:3,status:'cancelled'});}
      }
      return route.fulfill({json:{id:recordId,version:requests[0].version,status:requests[0].status}});
    }
    if(url.pathname==='/api/affairs-conversations'){
      if(request.method()==='GET')return route.fulfill({json:{conversations:[]}});
      const {id,title,messages,version}=request.postDataJSON();
      return route.fulfill({json:{id,title,messages,version:version+1,updated_at:new Date().toISOString()}});
    }
    throw new Error('Unexpected QA request: '+url.pathname);
  });
  const page=await context.newPage();
  page.setDefaultTimeout(8000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+clubPath);
  await page.getByRole('heading',{name:'系統功能說明'}).waitFor();
  assert.equal(await page.getByRole('link',{name:'學生社團活動資訊'}).getAttribute('href'),clubPath+'/activities');
  await page.getByRole('link',{name:'學生社團活動資訊'}).click();
  await page.waitForURL(url=>url.pathname===clubPath+'/activities');
  await page.goto(origin+clubPath+'/activities?month=2026-11');
  await page.getByRole('button',{name:'QA Club Workshop'}).click();
  await page.getByRole('dialog').getByText('QA Room').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('link',{name:'下個月'}).click();
  await page.waitForURL(url=>url.searchParams.get('month')==='2026-12');
  await page.getByRole('button',{name:'QA Club Workshop'}).waitFor({state:'detached'});
  await page.goto(origin+clubPath);
  await page.getByRole('link',{name:'器材借用申請填單'}).click();
  await page.getByText('查無資料',{exact:true}).waitFor();
  await page.getByRole('link',{name:'新增'}).click();
  await page.waitForURL(url=>url.pathname===clubPath+'/equipment/new');
  assert.equal(await page.getByLabel('學號',{exact:true}).inputValue(),student.student_number);
  await page.getByLabel('社團名稱').selectOption(club.id);
  await page.getByLabel('電話',{exact:true}).fill('0912000000');
  await page.getByLabel('物品領取日').fill('2026-11-23');
  await page.getByLabel('預計歸還日').fill('2026-11-24');
  await page.getByLabel('器材類別').selectOption('A01');
  await page.getByLabel('借用細項',{exact:true}).selectOption(equipment.id);
  await page.getByLabel('借用目的',{exact:true}).selectOption('meeting');
  if(process.env.CLUB_SERVICES_SCREENSHOT)await page.screenshot({path:process.env.CLUB_SERVICES_SCREENSHOT});
  await page.getByRole('button',{name:'送出',exact:true}).click();
  await page.getByRole('alert').getByText('請重試。').waitFor();
  await page.getByRole('button',{name:'送出',exact:true}).click();
  await page.getByText('待審核',{exact:true}).waitFor();
  await page.getByRole('link',{name:'編輯',exact:true}).click();
  assert.equal(await page.getByLabel('電話',{exact:true}).inputValue(),'0912000000');
  await page.getByLabel('電話',{exact:true}).fill('0912000002');
  await page.getByRole('button',{name:'送出',exact:true}).click();
  await page.getByText('0912000002',{exact:true}).waitFor();
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'確認取消'}).click();
  await page.getByText('已取消',{exact:true}).waitFor();
  assert.equal(writes.length,4);
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill('How do I request club equipment?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  const panel=page.getByRole('dialog');
  await panel.getByText(/Open the borrowing list/).waitFor();
  assert.equal(await panel.getByRole('link',{name:'Club equipment borrowing'}).first().getAttribute('href'),clubPath+'/equipment');
  await page.keyboard.press('Escape');
  for(const width of [390,320]){
    await page.setViewportSize({width,height:750});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.ok(await page.locator('.club-request-table').evaluate(node=>node.scrollWidth>node.clientWidth));
  }
  await page.goto(origin+clubPath+'/equipment/review');
  await page.getByRole('alert').getByText('此帳戶無法查看這個頁面。').waitFor();
  const guest=await browser.newContext({serviceWorkers:'block'});
  await mockAffairsAuth(guest,{signedIn:false});
  const login=await guest.newPage();
  await login.goto(origin+clubPath+'/equipment');
  await login.waitForURL(url=>url.pathname==='/school-affairs/login');
  assert.equal(new URL(login.url()).searchParams.get('next'),clubPath+'/equipment');
  assert.deepEqual(errors,[]);
  await pin();
  console.log('Club index, real route changes, month calendar, request submit/retry/edit/cancel, assistant, access and mobile checks passed.');
} finally {
  await browser.close();
}
