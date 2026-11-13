import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture,schoolServiceSnapshot} from './helpers/school-service-route-inventory.mjs';

const base=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5184';
const api=process.env.COURSE_ADJUSTMENT_API_ORIGIN??base;
const production=base==='https://stu.best';
assert.ok(production||base==='http://127.0.0.1:5184');
assert.ok(['https://stu.best','http://127.0.0.1:5201'].includes(api));
const release=async()=>{
  if(!production)return;
  assert.match(process.env.EXPECTED_RELEASE_REVISION??'',/^[0-9a-f]{40}$/u);
  const manifest=await (await fetch(base+'/release.json',{cache:'no-store'})).json();
  assert.equal(manifest.revision,process.env.EXPECTED_RELEASE_REVISION);
};
await release();
const add='/school-affairs/services/6-2',late='/school-affairs/services/6-3';
const data='/api/affairs-data';
const noticePath=data+'?scope=late-add-notice';
const noticeResponse=await fetch(api+noticePath,{signal:AbortSignal.timeout(10000)});
assert.equal(noticeResponse.status,200);
const notice=await noticeResponse.json();
assert.deepEqual([notice.rules_zh.length,notice.selection_notes.length,notice.fee_notes.length],[2,4,3]);
assert.equal((await fetch(api+data+'?scope=course-adjustment&phase=add_drop')).status,401);
assert.equal((await fetch(api+noticePath+'&user_id=test')).status,400);
for(const [question,match] of [['What are the late-add rules?',/available seat/],['Am I eligible for late add?',/Sign in to School Affairs/]]){
  const response=await fetch(api+'/api/research-assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question}),signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200);
  assert.match((await response.json()).answer,match);
}
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const problems=[];
const term={academicYear:115,semester:1};
const snapshot=schoolServiceSnapshot(affairsTestUser);
let state='ineligible',failNext=false,posts=0;
try{
  const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
  await context.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),scope=url.searchParams.get('scope');
    try{
      if(url.pathname+url.search===noticePath){
        assert.equal(request.headers().authorization,undefined);
        if(api===base)return route.continue();
        return route.fulfill({json:notice});
      }
      if(url.pathname===data&&scope==='course-adjustment'){
        assert.match(request.headers().authorization??'',/^Bearer /u);
        assert.equal(url.searchParams.has('user_id'),false);
        if(failNext){failNext=false;return route.fulfill({status:503,json:{error:'Fixture failure'}});}
        const phase=url.searchParams.get('phase');
        const row=state?{user_id:affairsTestUser.id,phase,academic_year:115,semester:1,checked_on:'2026-11-14',version:1,decision:state}:null;
        if(url.searchParams.has('answer'))return route.fulfill({json:{status:'answered',answer:'Fixture eligibility decision: '+state,grounding:{source:'account',webSearched:false},citations:[],activity:[]}});
        return route.fulfill({json:{userId:affairsTestUser.id,term,record:row}});
      }
      if(url.pathname==='/api/affairs-conversations'&&request.method()==='POST'){
        const message=request.postDataJSON();
        return route.fulfill({json:{id:message.id,title:message.title,messages:message.messages,version:1,updated_at:new Date().toISOString()}});
      }
      if(request.method()!=='GET')posts++;
      if(url.pathname===data&&!url.search)return route.fulfill({json:snapshot});
      return route.fulfill({json:schoolServiceReadFixture(url.href,request.method(),affairsTestUser,base)});
    }catch(error){problems.push(String(error));return route.abort();}
  });
  await mockAffairsAuth(context);
  const page=await context.newPage();
  page.on('pageerror',error=>problems.push(error.message));
  await page.goto(base+'/school-affairs/menu/aca/all');
  await page.getByRole('link',{name:'加退選',exact:true}).click();
  await page.waitForURL(base+add);
  await page.getByText('站內紀錄顯示您不具備本階段選課資格。',{exact:false}).waitFor();
  const event=await page.locator('.course-adjustment-event section').boundingBox();
  assert.deepEqual([event.x,event.width],[8,1264]);
  assert.ok(Math.abs(event.y-120.875)<=2,JSON.stringify(event));
  assert.equal(await page.getByRole('link',{name:'校方選課系統'}).count(),0);
  state='eligible';
  await page.reload();
  await page.getByText('站內紀錄顯示您具備本階段選課資格。',{exact:false}).waitFor();
  assert.match(await page.getByRole('link',{name:'校方選課系統'}).getAttribute('href'),/^https:\/\/info\.stu\.edu\.tw\//u);
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill('Am I eligible for add/drop?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('Fixture eligibility decision: eligible').first().waitFor();
  await page.keyboard.press('Escape');
  state=null;
  failNext=true;
  await page.reload();
  await page.getByText('選課資格暫時無法查詢。',{exact:false}).waitFor();
  await page.getByRole('button',{name:'重試'}).click();
  await page.getByText('目前沒有已確認的站內選課資格。',{exact:true}).waitFor();
  await page.getByRole('link',{name:'上一頁',exact:true}).click();
  await page.getByRole('link',{name:'補加選',exact:true}).click();
  await page.waitForURL(base+late);
  await page.getByText(notice.rules_zh[0],{exact:true}).waitFor();
  await page.getByRole('link',{name:'選課注意事項',exact:true}).click();
  await page.waitForURL(base+late+'/notice');
  await page.getByText(notice.selection_notes[0],{exact:true}).waitFor();
  await page.getByRole('link',{name:'收費說明',exact:true}).click();
  await page.waitForURL(base+late+'/fees');
  await page.getByText(notice.fee_notes[0],{exact:true}).waitFor();
  await page.getByRole('link',{name:'上一頁',exact:true}).click();
  for(const width of [1280,768,390,320]){
    await page.setViewportSize({width,height:720});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.getByRole('link',{name:'[補加選階段]',exact:true}).click();
  await page.waitForURL(base+late+'/entry');
  await page.getByText('目前沒有已確認的站內選課資格。',{exact:true}).waitFor();
  const guest=await browser.newContext();
  await mockAffairsAuth(guest,{signedIn:false});
  const gate=await guest.newPage();
  await gate.goto(base+late+'/entry');
  await gate.waitForURL('**/school-affairs/login?next=*');
  assert.equal(new URL(gate.url()).searchParams.get('next'),late+'/entry');
  assert.equal(posts,0);

  const manager={...affairsTestUser,id:randomUUID(),email:'manager@example.invalid'};
  const student={user_id:affairsTestUser.id,display_name:'QA Student',email:affairsTestUser.email};
  const adminSnapshot={...snapshot,profile:{...snapshot.profile,userId:manager.id,email:manager.email,role:'admin'},
    admin:{profiles:[student],students:[],sections:[],enrollments:[],dtmCourses:[],charges:[],assignments:[],requests:[]}};
  const admin=await browser.newContext();
  await mockAffairsAuth(admin,{user:manager});
  let saved=null;
  const writes=[];
  await admin.route('**/api/affairs-data*',async route=>{
    const query=new URL(route.request().url()).searchParams;
    if(query.get('scope')!=='course-adjustment-admin')return route.fulfill({json:adminSnapshot});
    assert.deepEqual(Object.fromEntries(query),{scope:'course-adjustment-admin',phase:'late_add',user_id:student.user_id,year:'115',semester:'2'});
    return route.fulfill({json:{userId:student.user_id,term:{academicYear:115,semester:2},record:saved}});
  });
  await admin.route('**/api/affairs-manage',async route=>{
    const {kind,payload}=route.request().postDataJSON();
    assert.equal(kind,'set_course_adjustment_eligibility');
    const {request_id,expected_version,...fields}=payload;
    assert.match(request_id,/^[0-9a-f-]{36}$/u);
    assert.deepEqual(fields,{user_id:student.user_id,phase:'late_add',academic_year:115,semester:2,decision:'eligible'});
    writes.push(payload);
    if(writes.length===1){
      assert.equal(expected_version,0);
      saved={...fields,version:1,checked_on:'2026-11-14'};
      return route.fulfill({status:503,json:{error:'Synthetic lost response'}});
    }
    if(writes.length===2){
      assert.deepEqual(payload,writes[0]);
      return route.fulfill({json:saved});
    }
    assert.equal(expected_version,1);
    assert.notEqual(request_id,writes[0].request_id);
    saved={...saved,version:2,decision:'ineligible'};
    return route.fulfill({status:409,json:{error:'Synthetic conflict'}});
  });
  const adminPage=await admin.newPage();
  adminPage.on('pageerror',error=>problems.push(error.message));
  await adminPage.goto(base+'/school-affairs/admin/records');
  const editor=adminPage.getByRole('region',{name:'Course adjustment eligibility'});
  await editor.getByRole('button',{name:'Manage eligibility'}).click();
  await editor.getByLabel('Student account').selectOption(student.user_id);
  await editor.getByLabel('Academic year').fill('115');
  await editor.getByLabel('Semester').selectOption('2');
  await editor.getByLabel('Phase').selectOption('late_add');
  await editor.getByRole('button',{name:'Load decision'}).click();
  const decision=editor.getByRole('combobox',{name:'Eligibility decision',exact:true});
  await decision.selectOption('eligible');
  const save=editor.getByRole('button',{name:'Save decision',exact:true});
  await save.click();
  await editor.getByRole('alert').filter({hasText:'The save could not be confirmed.'}).waitFor();
  assert.equal(await decision.isDisabled(),true);
  await editor.getByRole('button',{name:'Retry save'}).click();
  await editor.getByRole('status').filter({hasText:'Saved the local eligibility decision.'}).waitFor();
  await save.click();
  await editor.getByRole('alert').filter({hasText:'This decision changed.'}).waitFor();
  await editor.getByRole('button',{name:'Reload decision'}).click();
  await decision.waitFor();
  assert.equal(await decision.inputValue(),'ineligible');
  assert.equal(writes.length,3);
  assert.deepEqual(problems,[]);
  await release();
  console.log('Course adjustment browser passed: 6-2/6-3 menu, scoped eligibility, missing/eligible/ineligible, retry, live late-add notice, assistant routing, mobile, guest return and manager retry/conflict recovery.');
} finally {await browser.close();}
