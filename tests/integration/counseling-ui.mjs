import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {counselingPath as path,counselingScope as scope,counselingConsentVersion} from '../../server/counselingContract.js';
import {affairsTestUser as student,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture,schoolServiceSnapshot} from './helpers/school-service-route-inventory.mjs';

const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:54631';
async function checkRevision(){
  if(origin!=='https://stu.best')return;
  const revision=process.env.EXPECTED_RELEASE_REVISION;
  assert.match(revision??'',/^[0-9a-f]{40}$/);
  const response=await fetch(origin+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  assert.equal((await response.json()).revision,revision);
}
await checkRevision();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const coordinator={...student,id:randomUUID(),email:'coordinator@example.invalid'};
const owner={...student,id:randomUUID(),email:'owner@example.invalid'};
const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
const writes=[],errors=[];
let available=false,grants=[],record=null,failFirst=true;
async function pageFor(user,{signedIn=true,width=1280}={}){
  const context=await browser.newContext({viewport:{width,height:820},serviceWorkers:'block'});
  await mockAffairsAuth(context,{signedIn,user});
  await context.route('**/api/**',async route=>{
    try{
      const request=route.request(),url=new URL(request.url()),view=url.searchParams.get('view');
      if(url.searchParams.get('scope')===scope){
        assert.equal(request.method(),'GET');
        assert.match(request.headers().authorization??'',/^Bearer /u);
        if((view==='queue'&&!grants.includes(user.id))||(view==='access'&&user.id!==owner.id))
          return route.fulfill({status:403,json:{error:'Access denied'}});
        const open=record&&['requested','scheduled'].includes(record.status);
        const own=record&&user.id===student.id?[record]:[];
        const queue=open?[{...record,user_id:student.id,contact_email:student.email}]:[];
        return route.fulfill({json:{userId:user.id,available,canCoordinate:grants.includes(user.id),
          rows:view==='queue'?queue:view==='access'?grants:own}});
      }
      if(['/api/affairs-action','/api/affairs-manage'].includes(url.pathname)){
        const {kind,payload}=request.postDataJSON();
        writes.push({kind,payload});
        if(kind==='counseling_access'){
          assert.equal(user.id,owner.id);
          assert.equal(payload.user_id,coordinator.id);
          grants=payload.enabled?[coordinator.id]:[];
          available=payload.enabled;
          return route.fulfill({json:{userId:payload.user_id,enabled:payload.enabled}});
        }
        if(kind==='counseling_request'){
          assert.equal(user.id,student.id);
          assert.equal(payload.consent_version,counselingConsentVersion);
          assert.equal(payload.preferred_on,date);
          record??={id:randomUUID(),kind:payload.kind,preferred_on:date,preferred_period:payload.preferred_period,
            version:1,status:'requested',scheduled_at:null,updated_at:new Date().toISOString()};
          if(failFirst){failFirst=false;return route.fulfill({status:503,json:{error:'Temporary interruption'}});}
        }else if(kind==='counseling_review'){
          assert.equal(user.id,coordinator.id);
          assert.equal(payload.id,record.id);
          assert.equal(payload.expected_version,1);
          assert.equal(payload.scheduled_at,new Date(date+'T09:30:00+08:00').toISOString());
          record={...record,scheduled_at:payload.scheduled_at,status:'scheduled',version:2};
        }else{
          assert.equal(kind,'counseling_cancel');
          assert.equal(user.id,student.id);
          assert.equal(payload.id,record.id);
          assert.equal(payload.expected_version,2);
          record={...record,status:'cancelled',version:3};
        }
        return route.fulfill({json:{id:record.id,version:record.version,status:record.status}});
      }
      if(user.id===owner.id&&url.pathname==='/api/affairs-data'&&(!url.search||url.searchParams.get('scope')==='admin')){
        const snapshot=schoolServiceSnapshot(user);
        snapshot.profile.role='admin';
        return route.fulfill({json:{...snapshot,admin:{profiles:[{user_id:coordinator.id,email:coordinator.email,display_name:'QA Coordinator',role:'student'}],
          students:[],sections:[],enrollments:[],dtmCourses:[],charges:[],assignments:[],requests:[]}}});
      }
      return route.fulfill({json:schoolServiceReadFixture(request.url(),request.method(),user,origin)});
    }catch(error){errors.push(String(error));return route.abort();}
  });
  const page=await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(String(error)));
  return {page,context};
}
async function waitText(page,text){await page.getByText(text,{exact:true}).first().waitFor({timeout:15000});}

try{
  const {page,context}=await pageFor(student);
  await page.goto(origin+'/school-affairs/menu/sao/all');
  const link=page.locator('a[href="'+path+'"]').first();
  await link.click();
  await page.waitForURL(origin+path);
  await page.locator('.counseling-workspace h1').waitFor();
  const frame=await page.locator('.counseling-frame').boundingBox();
  assert.equal(frame.width,962);
  assert.equal(frame.x,159);
  await page.getByRole('link',{name:'預約申請'}).click();
  await page.waitForURL(origin+path+'/consent');
  await page.getByRole('link',{name:'不同意'}).click();
  await page.waitForURL(origin+path);
  assert.equal(writes.length,0);
  await page.goto(origin+path+'/appointments');
  await waitText(page,'前往校方預約服務');
  assert.equal(await page.locator('input[type=date]').count(),0);
  const admin=await pageFor(owner);
  await admin.page.goto(origin+'/school-affairs/admin/records');
  await admin.page.getByRole('button',{name:'Manage coordinators'}).click();
  await admin.page.getByLabel('School Affairs account').selectOption(coordinator.id);
  await admin.page.getByRole('button',{name:'Grant coordinator access'}).click();
  await waitText(admin.page,'1 assigned · Booking enabled');
  await page.reload();
  await waitText(page,'閱讀資料使用說明並預約');
  assert.equal(await page.locator('input[type=date]').count(),0);
  await page.getByRole('link',{name:'閱讀資料使用說明並預約'}).click();
  await page.getByRole('button',{name:'同意',exact:true}).click();
  await page.locator('input[type=date]').fill(date);
  await page.getByRole('button',{name:'送出',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(writes.length,1);
  await page.getByRole('button',{name:'送出',exact:true}).click();
  await page.getByRole('button',{name:'確認',exact:true}).click();
  await waitText(page,'無法處理諮商預約。');
  await page.getByRole('button',{name:'確認',exact:true}).click();
  await waitText(page,'待安排');
  assert.equal(writes[1].payload.request_id,writes[2].payload.request_id);
  await page.reload();
  await waitText(page,'待安排');
  await page.goto(origin+path+'/queue');
  await page.getByRole('alert').filter({hasText:'此帳戶無權使用此功能。'}).waitFor();
  assert.equal(await page.getByText(student.email,{exact:true}).count(),0);
  const staff=await pageFor(coordinator);
  await staff.page.goto(origin+path+'/queue');
  await staff.page.getByRole('button',{name:'處理',exact:true}).click();
  await staff.page.getByLabel('時間（臺北）').fill(date+'T09:30');
  await staff.page.getByRole('button',{name:'儲存時間'}).click();
  await waitText(staff.page,'已安排');
  await page.goto(origin+path+'/appointments');
  await waitText(page,'已安排');
  await page.getByRole('button',{name:'取消預約',exact:true}).click();
  await page.getByRole('button',{name:'確認',exact:true}).click();
  await waitText(page,'已取消');
  await admin.page.getByRole('button',{name:'Revoke coordinator access'}).click();
  await waitText(admin.page,'0 assigned · Booking unavailable');
  await staff.page.reload();
  await staff.page.getByRole('alert').filter({hasText:'此帳戶無權使用此功能。'}).waitFor();
  for(const width of [390,320]){
    await page.setViewportSize({width,height:800});
    for(const suffix of ['', '/consent','/appointments']){
      await page.goto(origin+path+suffix);
      await page.locator('.counseling-workspace').waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,suffix+' @ '+width);
    }
  }
  await context.close();
  const guest=await pageFor(student,{signedIn:false});
  await guest.page.goto(origin+path+'/appointments');
  await guest.page.waitForURL(url=>url.pathname==='/school-affairs/login');
  assert.equal(new URL(guest.page.url()).searchParams.get('next'),path+'/appointments');
  assert.deepEqual(errors,[]);
  await checkRevision();
  console.log('Counseling browser: menu, width, consent, retry, reload, account separation, scheduling, cancellation, revocation and guest return passed.');
}catch(error){
  if(errors.length)console.error(errors);
  throw error;
}finally{await browser.close();}
