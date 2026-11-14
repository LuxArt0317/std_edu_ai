import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture,schoolServiceSnapshot} from './helpers/school-service-route-inventory.mjs';

const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5184';
if(origin==='https://stu.best'){
  assert.match(process.env.EXPECTED_RELEASE_REVISION??'',/^[0-9a-f]{40}$/);
  const response=await fetch(origin+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  assert.equal((await response.json()).revision,process.env.EXPECTED_RELEASE_REVISION);
}
const path='/school-affairs/services/6-5';
const missing='系統找不到對應的學籍資料(學院代碼)，請向教務處反應處理，謝謝。';
const errors=[];
let decision='missing_college',fail=false;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
try{
  await mockAffairsAuth(context);
  await context.route('**/api/**',async route=>{
    try{
      const req=route.request(),url=new URL(req.url()),scope=url.searchParams.get('scope');
      if(url.pathname==='/api/affairs-conversations'&&req.method()==='POST'){
        const {id,title,messages}=req.postDataJSON();
        return route.fulfill({json:{id,title,messages,version:1,updated_at:new Date().toISOString()}});
      }
      if(scope==='course-adjustment'){
        assert.equal(url.searchParams.get('phase'),'summer');
        assert.match(req.headers().authorization??'',/^Bearer /);
        assert.equal(url.searchParams.has('user_id'),false);
        if(fail){fail=false;return route.fulfill({status:503,json:{error:'Temporary failure'}});}
        const year=Number(url.searchParams.get('year'));
        assert.ok([114,115].includes(year));
        if(url.searchParams.has('answer')){
          assert.equal(year,114);
          return route.fulfill({json:{status:'answered',answer:'Saved summer decision for 114.',citations:[],suggestedQuestions:[],
            activity:[],grounding:{source:'account',webSearched:false}}});
        }
        return route.fulfill({json:{userId:affairsTestUser.id,term:{academicYear:year,semester:3},record:decision?
          {user_id:affairsTestUser.id,phase:'summer',academic_year:year,semester:3,decision,checked_on:'2026-11-14',version:1}:null}});
      }
      if(scope==='summer-selection-notice'){
        assert.equal(req.headers().authorization,undefined);
        const year=Number(url.searchParams.get('year'));
        return route.fulfill({json:{academicYear:year,notice:year===114?{academic_year:114,published_on:'2026-05-25',
          source_url:'https://www.stu.edu.tw/latestnews-single/?id=213145',fee_per_unit:1522,minimum_paid_students:12,
          registration_rules_zh:['於期限內完成選課與繳費。'],registration_rules_en:['Register and pay by the deadline.']}:null}});
      }
      if(url.pathname==='/api/affairs-data'&&!url.search){
        const snapshot=schoolServiceSnapshot(affairsTestUser);
        snapshot.courseSelection.records=[{id:'summer-course-114',userId:affairsTestUser.id,academicYear:114,semester:3,
          selectionPhase:'summer1',termCourseCode:'TEST-SUMMER',courseTitle:'Summer course fixture',credits:3,rowOrder:0,
          timetableIncluded:false,meetings:[]}];
        return route.fulfill({json:snapshot});
      }
      return route.fulfill({json:schoolServiceReadFixture(url.href,req.method(),affairsTestUser,origin)});
    }catch(error){errors.push(String(error));return route.abort();}
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/school-affairs/menu/aca/all');
  await page.getByRole('link',{name:'暑期選課',exact:true}).click();
  await page.waitForURL(origin+path);
  await page.getByText(missing,{exact:true}).waitFor();
  const main=page.locator('.summer-selection');
  assert.equal(await main.getByRole('link').count(),0);
  const crest=await main.getByRole('img').boundingBox();
  assert.equal(crest.y,16);
  assert.equal(crest.width,163);
  assert.equal(crest.height,147);
  assert.ok(Math.abs(crest.x-311.171875)<1,JSON.stringify(crest));
  await mkdir('artifacts/summer-selection',{recursive:true});
  await page.screenshot({path:'artifacts/summer-selection/eligibility-1280.png',animations:'disabled'});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:720});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  }
  await page.setViewportSize({width:1280,height:720});
  decision=null;fail=true;
  await page.goto(origin+path+'?year=114');
  await page.getByRole('alert').getByText('暑期選課資格暫時無法查詢。',{exact:false}).waitFor();
  await page.getByRole('button',{name:'重試'}).click();
  await page.getByText('此學年度尚無已確認的暑期選課資格。').waitFor();
  await page.getByRole('link',{name:'114 學年度暑期選課公告'}).click();
  await page.getByText(/NT\$1,522/).waitFor();
  await page.getByLabel('學年度').fill('115');
  await page.getByRole('button',{name:'查詢',exact:true}).click();
  await page.getByText('此學年度尚無已存的暑期選課公告。').waitFor();
  assert.equal(await page.getByText(/NT\$1,522/).count(),0);
  decision='eligible';
  await page.goto(origin+path+'?year=114');
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill('Am I eligible for summer courses?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('Saved summer decision for 114.',{exact:true}).waitFor();
  await page.getByText('Conversation saved to your private account.',{exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('link',{name:'暑期選課紀錄'}).click();
  await page.getByRole('cell',{name:'Summer course fixture'}).waitFor();
  const guestContext=await browser.newContext({serviceWorkers:'block'});
  const guest=await guestContext.newPage();
  await guest.goto(origin+path+'?year=114');
  await guest.waitForURL(url=>url.pathname==='/school-affairs/login');
  assert.equal(new URL(guest.url()).searchParams.get('next'),path+'?year=114');
  const manager={...affairsTestUser,id:randomUUID(),email:'summer-manager@example.invalid'};
  const admin=await browser.newContext({serviceWorkers:'block'});
  await mockAffairsAuth(admin,{user:manager});
  const profile={user_id:affairsTestUser.id,email:affairsTestUser.email,display_name:'QA Student'};
  let saved=null;
  await admin.route('**/api/affairs-data*',async route=>{
    const query=new URL(route.request().url()).searchParams;
    if(query.get('scope')==='course-adjustment-admin'){
      assert.deepEqual(Object.fromEntries(query),{scope:'course-adjustment-admin',phase:'summer',user_id:profile.user_id,year:'114',semester:'3'});
      return route.fulfill({json:{userId:profile.user_id,term:{academicYear:114,semester:3},record:saved}});
    }
    const snapshot=schoolServiceSnapshot(manager);
    snapshot.profile.role='admin';
    return route.fulfill({json:{...snapshot,admin:{profiles:[profile],students:[],sections:[],enrollments:[],dtmCourses:[],charges:[],assignments:[],requests:[]}}});
  });
  await admin.route('**/api/affairs-manage',async route=>{
    const {kind,payload}=route.request().postDataJSON();
    assert.equal(kind,'set_course_adjustment_eligibility');
    const {expected_version,request_id,...fields}=payload;
    assert.equal(expected_version,0);assert.match(request_id,/^[0-9a-f-]{36}$/);
    assert.deepEqual(fields,{user_id:profile.user_id,phase:'summer',academic_year:114,semester:3,decision:'missing_college'});
    saved={...fields,version:1,checked_on:'2026-11-14'};
    return route.fulfill({json:saved});
  });
  const adminPage=await admin.newPage();
  adminPage.on('pageerror',error=>errors.push(error.message));
  await adminPage.goto(origin+'/school-affairs/admin/records');
  const editor=adminPage.getByRole('region',{name:'Course adjustment eligibility'});
  await editor.getByRole('button',{name:'Manage eligibility'}).click();
  await editor.getByLabel('Student account').selectOption(profile.user_id);
  await editor.getByLabel('Academic year').fill('114');
  await editor.getByLabel('Phase').selectOption('summer');
  assert.equal(await editor.getByLabel('Semester').inputValue(),'3');
  await editor.getByRole('button',{name:'Load decision'}).click();
  await editor.getByRole('combobox',{name:'Eligibility decision',exact:true}).selectOption('missing_college');
  await editor.getByRole('button',{name:'Save decision'}).click();
  await editor.getByRole('status').filter({hasText:'Saved the local eligibility decision.'}).waitFor();
  assert.equal(saved.decision,'missing_college');
  assert.deepEqual(errors,[]);
  console.log('Summer selection browser passed: menu, source geometry, responsive layout, retry, year isolation, saved course link and assistant.');
}finally{await browser.close();}
