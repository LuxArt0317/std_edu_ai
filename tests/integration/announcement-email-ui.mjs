import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {announcementEmailPath as path} from '../../server/announcementEmailContract.js';
import {affairsTestUser as student,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';

const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:54629';
if(origin==='https://stu.best'){
  assert.match(process.env.EXPECTED_RELEASE_REVISION??'',/^[0-9a-f]{40}$/);
  const response=await fetch(origin+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  assert.equal((await response.json()).revision,process.env.EXPECTED_RELEASE_REVISION);
}
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
const errors=[],writes=[];
const activation='2099-01-02T00:00:00+08:00';
let preference={userId:student.id,enabled:false,active:false,effectiveAt:null,version:0};
let failRead=false,loseReceipt=true,wrongUser=false;
try{
  await mockAffairsAuth(context);
  await context.route('**/api/**',async route=>{
    try{
      const req=route.request(),url=new URL(req.url());
      if(url.pathname==='/api/affairs-conversations'&&req.method()==='POST'){
        const {id,title,messages}=req.postDataJSON();
        return route.fulfill({json:{id,title,messages,version:1,updated_at:new Date().toISOString()}});
      }
      if(url.searchParams.get('scope')==='announcement-email'){
        assert.match(req.headers().authorization??'',/^Bearer /);
        if(failRead){failRead=false;return route.fulfill({status:503,json:{error:'Unavailable'}});}
        if(url.searchParams.get('answer')==='en')return route.fulfill({json:{status:'answered',answer:'Your preference is saved and pending.',
          citations:[],suggestedQuestions:[],activity:[],grounding:{source:'account',webSearched:false}}});
        return route.fulfill({json:{...preference,deliveryConfigured:false,userId:wrongUser?randomUUID():student.id}});
      }
      if(url.pathname==='/api/affairs-action'){
        const {kind,payload}=req.postDataJSON();
        assert.equal(kind,'save_announcement_email');
        assert.deepEqual(payload,{enabled:true,expected_version:0,request_id:payload.request_id});
        writes.push(payload.request_id);
        const receipt={userId:student.id,enabled:true,effectiveAt:activation,version:1};
        preference={...receipt,active:false};
        if(loseReceipt){loseReceipt=false;return route.fulfill({status:503,json:{error:'Retry'}});}
        return route.fulfill({json:receipt});
      }
      return route.fulfill({json:schoolServiceReadFixture(req.url(),req.method(),student,origin)});
    }catch(error){errors.push(String(error));return route.abort();}
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  failRead=true;
  await page.goto(origin+'/school-affairs/menu/personal/all');
  await page.getByRole('link',{name:'校園公告MAIL接收設定',exact:true}).click();
  await page.waitForURL(origin+path);
  const panel=page.locator('.announcement-email-settings');
  await panel.getByRole('alert').waitFor();
  await panel.getByRole('button',{name:'重試'}).click();
  const field=panel.getByRole('checkbox');
  await field.waitFor();
  assert.equal(await field.isChecked(),false);
  await panel.getByText('公告郵件寄送目前未設定，仍可儲存接收偏好。').waitFor();
  const form=await panel.locator('form').boundingBox(),button=await panel.getByRole('button',{name:'確定'}).boundingBox();
  const header=await panel.getByRole('heading',{name:'校園最新公告個人E-MAIL接收設定'}).boundingBox();
  // Independent-site notice and font can shift the shell; use source-relative geometry.
  assert.ok(Math.abs(button.x-form.x-233.75)<5,JSON.stringify({form,button}));
  assert.ok(Math.abs(button.y-form.y-115)<5,JSON.stringify({form,button}));
  assert.ok(form.y-header.y>70);
  await mkdir('artifacts/announcement-email',{recursive:true});
  await page.screenshot({path:'artifacts/announcement-email/settings-1280.png',animations:'disabled'});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:720});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  }
  await page.setViewportSize({width:1280,height:720});
  await field.check();
  await panel.getByRole('button',{name:'取消'}).click();
  assert.equal(await field.isChecked(),false);assert.deepEqual(writes,[]);
  await field.check();
  const submit=panel.getByRole('button',{name:'確定'});
  await submit.click();
  await panel.getByRole('alert').waitFor();
  await submit.click();
  await panel.getByText(/設定已儲存，將於/u).waitFor();
  assert.equal(writes.length,2);assert.equal(writes[0],writes[1]);
  await page.reload();
  await field.waitFor();
  assert.equal(await field.isChecked(),true);
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill('Is my campus announcement email on?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('Your preference is saved and pending.',{exact:true}).waitFor();
  await page.getByText('Conversation saved to your private account.',{exact:true}).waitFor();
  wrongUser=true;
  await page.reload();
  await panel.getByRole('alert').waitFor();
  assert.equal(await field.count(),0);
  const guest=await browser.newPage({serviceWorkers:'block'});
  await guest.goto(origin+path);
  await guest.waitForURL(url=>url.pathname==='/school-affairs/login');
  assert.equal(new URL(guest.url()).searchParams.get('next'),path);
  assert.deepEqual(errors,[]);
  console.log('Announcement email browser passed layout, mobile, cancel, idempotent retry, persistence, assistant and sign-in.');
}finally{await browser.close();}
