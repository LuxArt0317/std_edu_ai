import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceSnapshot,schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';
import {withdrawalPath,withdrawalChange,withdrawalWindowChange} from '../../server/courseWithdrawalContract.js';

const base=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5184';
const production=base==='https://stu.best';
assert.ok(production||base==='http://127.0.0.1:5184');
async function verifyRevision(){
  if(!production)return;
  const revision=process.env.EXPECTED_RELEASE_REVISION;
  assert.match(revision??'',/^[0-9a-f]{40}$/u);
  const manifest=await (await fetch(base+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)})).json();
  assert.equal(manifest.revision,revision);
}
await verifyRevision();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const term={academicYear:115,semester:1};
const window={opensAt:'2026-11-13T02:00:00Z',closesAt:'2026-11-16T02:00:00Z',version:1};
const course={id:randomUUID(),term_course_code:'QA-101',course_title:'Synthetic course',required_elective_text:'選',
  credits:3,instructor_one:null,remark_text:null,version:1};
const marked={...course,id:randomUUID(),term_course_code:'QA-102',course_title:'Unavailable course',remark_text:'A'};
const writes=[],errors=[];
let state='open';
try{
  const student=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
  await mockAffairsAuth(student);
  await student.route('**/api/**',async route=>{
    try{
      const request=route.request(),url=new URL(request.url());
      if(url.pathname==='/api/affairs-data'&&url.searchParams.get('scope')==='course-withdrawal'){
        assert.match(request.headers().authorization,/^Bearer /u);
        if(url.searchParams.get('answer')==='records'){
          assert.deepEqual(Object.fromEntries(url.searchParams),{scope:'course-withdrawal',answer:'records',lang:'en'});
          return route.fulfill({json:{status:'answered',answer:'Synthetic saved withdrawal: '+course.remark_text,
            citations:[],suggestedQuestions:[],grounding:{source:'account',webSearched:false}}});
        }
        assert.deepEqual(Object.fromEntries(url.searchParams),{scope:'course-withdrawal'});
        return route.fulfill({json:{userId:affairsTestUser.id,...term,state,window:state==='unconfigured'?null:window,courses:[course,marked]}});
      }
      if(url.pathname==='/api/affairs-action'){
        const {kind,payload}=request.postDataJSON();
        assert.equal(kind,withdrawalChange);
        assert.equal(payload.course_id,course.id);
        assert.match(payload.request_id,/^[0-9a-f-]{36}$/u);
        writes.push(payload);
        if(writes.length===1){
          assert.equal(payload.expected_version,1);
          assert.equal(payload.operation,'withdraw');
          course.remark_text='Y(W)';course.version=2;
          return route.fulfill({status:503,json:{error:'Lost response'}});
        }
        if(writes.length===2)assert.deepEqual(payload,writes[0]);
        if(writes.length===3){
          assert.equal(payload.expected_version,2);
          assert.equal(payload.operation,'restore');
          course.remark_text=null;course.version=3;
        }
        if(writes.length===4){
          state='closed';
          return route.fulfill({status:409,json:{error:'Window closed'}});
        }
        return route.fulfill({json:{userId:affairsTestUser.id,requestId:payload.request_id,courseId:course.id,version:course.version,remark:course.remark_text}});
      }
      if(url.pathname==='/api/affairs-conversations'&&request.method()==='POST'){
        const message=request.postDataJSON();
        return route.fulfill({json:{id:message.id,title:message.title,messages:message.messages,version:1,updated_at:new Date().toISOString()}});
      }
      return route.fulfill({json:schoolServiceReadFixture(url.href,request.method(),affairsTestUser,base)});
    }catch(error){errors.push(String(error));return route.abort();}
  });
  const page=await student.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/school-affairs/menu/aca/all');
  await page.getByRole('link',{name:'棄選',exact:true}).click();
  await page.waitForURL(base+withdrawalPath);
  const withdraw=page.getByRole('button',{name:'棄選 Synthetic course',exact:true});
  const restore=page.getByRole('button',{name:'還原 Synthetic course',exact:true});
  await withdraw.click();
  await page.keyboard.press('Escape');
  await withdraw.evaluate(element=>new Promise((resolve,reject)=>{
    const deadline=Date.now()+2000;
    function check(){
      if(document.activeElement===element)return resolve();
      if(Date.now()>deadline)return reject(new Error('Withdrawal trigger focus was not restored.'));
      requestAnimationFrame(check);
    }
    check();
  }));
  assert.equal(writes.length,0);
  await withdraw.click();
  await page.getByRole('button',{name:'確認棄選課程'}).click();
  await page.getByRole('alert').filter({hasText:'尚未確認是否儲存成功'}).waitFor();
  await page.getByRole('button',{name:'重試儲存'}).click();
  await restore.waitFor();
  await page.getByText('Y（已棄選）',{exact:true}).waitFor();
  await page.reload();
  await restore.waitFor();
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill('Which courses have I withdrawn?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('Synthetic saved withdrawal: Y(W)').first().waitFor();
  await page.keyboard.press('Escape');
  await restore.click();
  await page.getByRole('button',{name:'確認還原課程'}).click();
  await withdraw.waitFor();
  await withdraw.click();
  await page.getByRole('button',{name:'確認棄選課程'}).click();
  await page.getByText('站內棄選期間已結束。',{exact:true}).waitFor();
  assert.equal(await withdraw.count(),0);
  assert.equal(writes.length,4);
  for(const width of [1280,768,390,320]){
    await page.setViewportSize({width,height:750});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Unexpected page overflow at '+width);
  }
  state='unconfigured';
  await page.reload();
  await page.getByText('目前尚未設定站內棄選期間。',{exact:true}).waitFor();
  assert.equal(await withdraw.count(),0);

  const guest=await browser.newContext();
  await mockAffairsAuth(guest,{signedIn:false});
  const gate=await guest.newPage();
  await gate.goto(base+withdrawalPath);
  await gate.waitForURL('**/school-affairs/login?next=*');
  assert.equal(new URL(gate.url()).searchParams.get('next'),withdrawalPath);
  if(production){
    const response=await fetch(base+'/api/research-assistant',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({question:'Which courses have I withdrawn?'}),signal:AbortSignal.timeout(10000)});
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.status,'handoff');
    assert.match(result.answer,/Sign in to School Affairs/);
  }

  const manager={...affairsTestUser,id:randomUUID(),email:'manager@example.invalid'};
  const adminSnapshot=schoolServiceSnapshot(manager);
  adminSnapshot.profile.role='admin';
  adminSnapshot.admin={profiles:[],students:[],sections:[],enrollments:[],dtmCourses:[],charges:[],assignments:[],requests:[]};
  const admin=await browser.newContext({serviceWorkers:'block'});
  await mockAffairsAuth(admin,{user:manager});
  await admin.route('**/api/affairs-data*',route=>{
    const query=new URL(route.request().url()).searchParams;
    if(query.get('scope')!=='course-withdrawal-admin')return route.fulfill({json:adminSnapshot});
    return route.fulfill({json:{userId:manager.id,academicYear:Number(query.get('year')),semester:Number(query.get('semester')),
      state:'unconfigured',window:null,courses:[]}});
  });
  const saves=[];
  await admin.route('**/api/affairs-manage',async route=>{
    const {kind,payload}=route.request().postDataJSON();
    assert.equal(kind,withdrawalWindowChange);
    assert.equal(payload.expected_version,0);
    assert.equal(payload.opens_at,'2026-11-13T02:00:00.000Z');
    assert.equal(payload.closes_at,'2026-11-16T02:00:00.000Z');
    saves.push(payload);
    if(saves.length===1)return route.fulfill({status:503,json:{error:'Lost response'}});
    assert.deepEqual(saves[0],saves[1]);
    return route.fulfill({json:{userId:manager.id,requestId:payload.request_id,academicYear:payload.academic_year,
      semester:payload.semester,window:{opensAt:payload.opens_at,closesAt:payload.closes_at,version:1}}});
  });
  const managerPage=await admin.newPage();
  managerPage.on('pageerror',error=>errors.push(error.message));
  await managerPage.goto(base+'/school-affairs/admin/records');
  const editor=managerPage.getByRole('region',{name:'Course withdrawal window'});
  await editor.getByRole('button',{name:'Manage withdrawal window'}).click();
  await editor.getByLabel('Opens at (Taipei)',{exact:true}).fill('2026-11-13T10:00');
  await editor.getByLabel('Closes at (Taipei)',{exact:true}).fill('2026-11-16T10:00');
  await editor.getByRole('button',{name:'Save withdrawal window'}).click();
  await editor.getByRole('alert').filter({hasText:'The save could not be confirmed.'}).waitFor();
  await editor.getByRole('button',{name:'Retry window save'}).click();
  await editor.getByRole('status').filter({hasText:'Saved the stu.best withdrawal window.'}).waitFor();
  assert.equal(saves.length,2);
  assert.deepEqual(errors,[]);
  await verifyRevision();
  console.log('Withdrawal browser passed: catalog, confirmation/cancel, withdrawal, restore, reload, retry, closed window, assistant, guest return, manager and responsive layouts.');
}finally{await browser.close();}
