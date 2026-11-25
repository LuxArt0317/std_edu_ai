import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {studentProfilePath as path} from '../../server/studentProfileContract.js';
import {verifyEmptyStudentProfile} from '../evaluation/student-profile-browser-preview.mjs';
import {affairsTestUser as student,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture,schoolServiceSnapshot} from './helpers/school-service-route-inventory.mjs';
import {studentProfileDetails as details} from './helpers/student-profile-fixture.mjs';

const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5184';
if(origin==='https://stu.best'){
  assert.match(process.env.EXPECTED_RELEASE_REVISION??'',/^[0-9a-f]{40}$/);
  const response=await fetch(origin+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  assert.equal((await response.json()).revision,process.env.EXPECTED_RELEASE_REVISION);
}
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const errors=[],requests=[];
let record={...details,user_id:student.id,version:1,confirmed_at:null,updated_mobile:null};
let sentReceipt=null,wrongUser=false;
async function session(user,isManager=false){
  const context=await browser.newContext({viewport:{width:1280,height:820},serviceWorkers:'block'});
  await mockAffairsAuth(context,{user});
  await context.route('**/api/**',async route=>{
    try{
      const req=route.request(),url=new URL(req.url()),scope=url.searchParams.get('scope');
      if(url.pathname==='/api/affairs-conversations'&&req.method()==='POST'){
        const {id,title,messages}=req.postDataJSON();
        return route.fulfill({json:{id,title,messages,version:1,updated_at:new Date().toISOString()}});
      }
      if(scope==='student-profile'){
        assert.match(req.headers().authorization??'',/^Bearer /);
        const view=isManager?{scope,view:'manage',user_id:student.id}:{scope,view:'mine'};
        const answer=url.searchParams.get('answer');
        assert.deepEqual(Object.fromEntries(url.searchParams),answer?{...view,answer:'en'}:view);
        if(answer)return route.fulfill({json:{status:'answered',answer:'Your current student information has been confirmed.',
          citations:[],suggestedQuestions:[],activity:[],grounding:{source:'account',webSearched:false}}});
        return route.fulfill({json:{userId:wrongUser?randomUUID():student.id,record}});
      }
      if(url.pathname==='/api/affairs-action'){
        assert.equal(isManager,false);
        const {kind,payload}=req.postDataJSON();
        assert.equal(kind,'confirm_student_profile');
        assert.deepEqual(payload,{updated_mobile:'0912345678',confirmed:true,expected_version:1,request_id:payload.request_id});
        requests.push(payload.request_id);
        if(!sentReceipt){
          sentReceipt={userId:student.id,version:2,confirmedAt:'2026-11-14T10:01:00Z'};
          record={...record,version:2,confirmed_at:sentReceipt.confirmedAt,updated_mobile:payload.updated_mobile};
          return route.fulfill({status:503,json:{error:'Temporary failure'}});
        }
        return route.fulfill({json:sentReceipt});
      }
      if(url.pathname==='/api/affairs-manage'){
        assert.equal(isManager,true);
        const {kind,payload}=req.postDataJSON();
        assert.equal(kind,'save_student_profile');
        assert.equal(payload.user_id,student.id);
        assert.equal(payload.expected_version,2);
        assert.deepEqual(payload.record,{...details,name_en:'Updated student name'});
        record={...record,...payload.record,version:3,confirmed_at:null};
        return route.fulfill({json:{userId:student.id,version:3,confirmedAt:null}});
      }
      if(isManager&&url.pathname==='/api/affairs-data'){
        const snapshot=schoolServiceSnapshot(user);
        snapshot.profile.role='admin';
        snapshot.admin={profiles:[{user_id:student.id,email:student.email,display_name:'QA Student',role:'student'}],
          students:[],sections:[],enrollments:[],dtmCourses:[],charges:[],assignments:[],requests:[]};
        return route.fulfill({json:snapshot});
      }
      return route.fulfill({json:schoolServiceReadFixture(req.url(),req.method(),user,origin)});
    }catch(error){errors.push(String(error));return route.abort();}
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  return page;
}
try{
  const page=await session(student);
  await page.goto(origin+'/school-affairs/menu/aca/all');
  await page.getByRole('link',{name:'學生基本資料確認',exact:true}).click();
  await page.waitForURL(origin+path);
  const main=page.locator('.student-profile');
  const form=main.getByRole('table',{name:'學生基本資料確認'});
  await form.getByText('••••••6789').waitFor();
  assert.equal(await form.locator('tbody tr').count(),11);
  assert.equal(await form.locator('input:enabled').count(),1);
  const frame=await main.locator('.student-profile-frame').boundingBox(),box=await form.boundingBox();
  assert.deepEqual([frame.x,frame.y,frame.width],[159,12,962]);
  for(const [actual,expected] of [[box.x,229.6],[box.y,104],[box.width,820.8],[box.height,221.16]]){
    assert.ok(Math.abs(actual-expected)<5,JSON.stringify(box));
  }
  await mkdir('artifacts/student-profile',{recursive:true});
  await page.screenshot({path:'artifacts/student-profile/form-1280.png',animations:'disabled'});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:720});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  }
  await page.setViewportSize({width:1280,height:820});
  const mobile=form.getByRole('textbox',{name:/更新行動電話/u});
  await mobile.fill('bad');
  const prepare=main.getByRole('button',{name:'確認後送出'});
  assert.equal(await prepare.isDisabled(),true);
  await mobile.fill('0912345678');
  await prepare.click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(requests.length,0);
  await prepare.click();
  const confirm=page.getByRole('button',{name:'確認送出',exact:true});
  await confirm.click();
  await page.getByRole('alert').filter({hasText:'無法確認儲存結果，請重試。'}).waitFor();
  await confirm.click();
  await main.getByText('已確認基本資料。').waitFor();
  assert.equal(requests.length,2);
  assert.equal(requests[0],requests[1]);
  await page.reload();
  await main.getByText('已確認基本資料。').waitFor();
  assert.equal(await mobile.inputValue(),'0912345678');
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill('Have I confirmed my student profile?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('Your current student information has been confirmed.',{exact:true}).waitFor();
  await page.getByText('Conversation saved to your private account.',{exact:true}).waitFor();
  wrongUser=true;
  await page.reload();
  await main.getByRole('alert').waitFor();
  assert.equal(await main.getByText(details.registered_address).count(),0);
  wrongUser=false;
  const manager=await session({...student,id:randomUUID(),email:'profile-manager@example.invalid'},true);
  await manager.goto(origin+'/school-affairs/admin/records');
  await manager.getByRole('button',{name:'學生基本資料管理'}).click();
  await manager.getByLabel('學生帳戶').selectOption(student.id);
  await manager.getByLabel('英文姓名').fill('Updated student name');
  await manager.getByRole('button',{name:'儲存學生基本資料'}).click();
  await manager.getByRole('status').filter({hasText:'基本資料已儲存，等待學生確認。'}).waitFor();
  await page.reload();
  await form.getByText('Updated student name').waitFor();
  assert.equal(await main.getByText('已確認基本資料。').count(),0);
  record=null;
  await page.reload();
  await verifyEmptyStudentProfile(main);
  assert.equal(await main.getByRole('table',{name:'學生基本資料確認'}).count(),0);
  const guest=await browser.newPage({serviceWorkers:'block'});
  await guest.goto(origin+path);
  await guest.waitForURL(url=>url.pathname==='/school-affairs/login');
  assert.equal(new URL(guest.url()).searchParams.get('next'),path);
  assert.deepEqual(errors,[]);
  console.log('Student profile browser passed menu, form geometry, mobile, retry, assistant, manager, empty state and guest checks.');
}finally{await browser.close();}
