import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceSnapshot,schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';
import {earlyGraduationPath,earlyGraduationScope,validEarlyGraduationAction} from '../../server/earlyGraduationContract.js';

const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5184';
assert.ok(['http://127.0.0.1:5184','https://stu.best'].includes(origin));
async function verifyRevision(){
  if(origin!=='https://stu.best')return;
  const revision=process.env.EXPECTED_RELEASE_REVISION;
  assert.match(revision??'',/^[0-9a-f]{40}$/u);
  const response=await fetch(origin+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  assert.equal((await response.json()).revision,revision);
}
const candidate={user_id:affairsTestUser.id,academic_year:115,semester:1,study_track:'Bachelor',department:'Test Department',
  student_number:'TEST-101',graduation_year:115,graduation_semester:1,eligibility:'eligible',version:1};
const window={academic_year:115,semester:1,opens_at:'2026-11-01T00:00:00Z',closes_at:'2026-11-30T00:00:00Z',version:1};
const {eligibility,...identity}=candidate;
const state=(target,opened,records=[])=>({userId:target,academicYear:115,semester:1,state:opened?'open':'unconfigured',
  window:opened?window:null,candidate:opened&&target?candidate:null,records});
const writes=[],errors=[];
let opened=false,row;
await verifyRevision();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  const student=await browser.newContext({viewport:{width:1280,height:850},serviceWorkers:'block'});
  await mockAffairsAuth(student);
  await student.route('**/api/**',async route=>{
    try{
      const req=route.request(),url=new URL(req.url());
      if(url.pathname==='/api/affairs-data'&&url.searchParams.get('scope')===earlyGraduationScope){
        assert.match(req.headers().authorization,/^Bearer /u);
        if(url.searchParams.has('answer')){
          assert.equal(url.searchParams.get('answer'),'en');
          return route.fulfill({json:{status:'answered',answer:'Early graduation status: '+row.status,citations:[],
            suggestedQuestions:[],grounding:{source:'account',webSearched:false}}});
        }
        return route.fulfill({json:state(affairsTestUser.id,opened,row?[row]:[])});
      }
      if(url.pathname==='/api/affairs-action'){
        const action=req.postDataJSON();
        assert.ok(validEarlyGraduationAction(action.kind,action.payload));
        writes.push(action);
        if(action.kind==='submit_early_graduation'){
          assert.equal(action.payload.candidate_version,1);
          row={...identity,status:'submitted',applied_at:'2026-11-14T00:00:00Z'};
          if(writes.length===1)return route.fulfill({status:503,json:{error:'Lost response'}});
          assert.deepEqual(writes[0],writes[1]);
        }else{
          assert.equal(action.kind,'cancel_early_graduation');
          assert.equal(action.payload.expected_version,row.version);
          row={...row,version:row.version+1,status:'cancelled'};
        }
        return route.fulfill({json:row});
      }
      if(url.pathname==='/api/affairs-conversations'&&req.method()==='POST'){
        const message=req.postDataJSON();
        return route.fulfill({json:{id:message.id,title:message.title,messages:message.messages,version:1,updated_at:new Date().toISOString()}});
      }
      return route.fulfill({json:schoolServiceReadFixture(url.href,req.method(),affairsTestUser,origin)});
    }catch(error){errors.push(String(error));return route.abort();}
  });
  const page=await student.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/school-affairs/menu/aca/all');
  await page.getByRole('link',{name:'提前畢業申請',exact:true}).click();
  await page.waitForURL(origin+earlyGraduationPath);
  await page.getByText('目前非申請時間！',{exact:true}).waitFor();
  assert.equal(await page.getByRole('columnheader').count(),9);
  assert.equal(await page.getByText('無申請紀錄',{exact:true}).isVisible(),true);
  assert.equal(Math.round((await page.locator('.early-graduation-frame').boundingBox()).width),1060);
  for(const width of [768,390,320]){
    await page.setViewportSize({width,height:800});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflow at '+width);
  }
  await page.setViewportSize({width:1280,height:850});
  opened=true;
  await page.reload();
  const apply=page.getByRole('button',{name:'我已詳閱注意事項，進入申請',exact:true});
  await apply.click();
  const dialog=page.getByRole('dialog');
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  assert.equal(writes.length,0);
  await apply.click();
  await dialog.getByText(/Test Department/).waitFor();
  await dialog.getByRole('button',{name:'送出申請',exact:true}).click();
  await dialog.getByRole('alert').filter({hasText:'尚未確認是否儲存成功'}).waitFor();
  await dialog.getByRole('button',{name:'重試儲存',exact:true}).click();
  await page.getByRole('cell',{name:'待審查',exact:true}).waitFor();
  await page.reload();
  await page.getByRole('cell',{name:'TEST-101',exact:true}).waitFor();
  await page.getByRole('button',{name:'我要取消',exact:true}).click();
  await dialog.getByRole('button',{name:'取消申請',exact:true}).click();
  await page.getByRole('cell',{name:'已取消',exact:true}).waitFor();
  assert.equal(writes.length,3);
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill('What is my early graduation status?');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('Early graduation status: cancelled',{exact:true}).first().waitFor();

  const manager={...affairsTestUser,id:randomUUID(),email:'reviewer@example.invalid'};
  const adminSnapshot=schoolServiceSnapshot(manager);
  adminSnapshot.profile.role='admin';
  adminSnapshot.admin={profiles:[{user_id:affairsTestUser.id,email:affairsTestUser.email,display_name:'QA Student'}],
    students:[],sections:[],enrollments:[],dtmCourses:[],charges:[],assignments:[],requests:[]};
  const admin=await browser.newContext({serviceWorkers:'block'});
  await mockAffairsAuth(admin,{user:manager});
  let configured=false,edited=false,reviewed=false;
  await admin.route('**/api/**',route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname==='/api/affairs-conversations')return route.fulfill({json:{conversations:[]}});
    if(url.pathname==='/api/affairs-data'&&url.searchParams.get('scope')===earlyGraduationScope+'-admin'){
      const target=url.searchParams.get('user_id');
      const selected=target?{...state(target,true,[{...row,status:reviewed?'approved':'submitted',version:reviewed?2:1}]),
        candidate:edited?{...candidate,version:2}:candidate}:state(null,configured);
      return route.fulfill({json:selected});
    }
    if(url.pathname==='/api/affairs-manage'){
      const {kind,payload}=req.postDataJSON();
      assert.ok(validEarlyGraduationAction(kind,payload));
      if(kind==='set_graduation_window'){
        configured=true;
        return route.fulfill({json:{...window,opens_at:payload.opens_at,closes_at:payload.closes_at}});
      }
      if(kind==='set_graduation_candidate'){
        assert.equal(payload.user_id,affairsTestUser.id);
        edited=true;
        return route.fulfill({json:{...candidate,version:2}});
      }
      assert.equal(kind,'review_early_graduation');
      assert.equal(payload.decision,'approved');
      reviewed=true;
      return route.fulfill({json:{...row,status:'approved',version:2}});
    }
    return route.fulfill({json:adminSnapshot});
  });
  const adminPage=await admin.newPage();
  adminPage.on('pageerror',error=>errors.push(error.message));
  adminPage.on('console',message=>{if(message.type()==='error'&&message.text().includes('[STU_NEXUS_RENDER_FAILURE]'))errors.push(message.text());});
  await adminPage.goto(origin+'/school-affairs/admin/records');
  const panel=adminPage.getByRole('region',{name:'Early graduation management'});
  await panel.getByRole('button',{name:'Manage early graduation',exact:true}).click();
  await panel.getByLabel('Academic year',{exact:true}).fill('115');
  await panel.locator('select[name=semester]').selectOption('1');
  await panel.getByRole('button',{name:'Load early graduation',exact:true}).click();
  await panel.getByLabel('Opens at (Taipei)',{exact:true}).fill('2026-11-01T08:00');
  await panel.getByLabel('Closes at (Taipei)',{exact:true}).fill('2026-11-30T08:00');
  await panel.getByRole('button',{name:'Save early graduation window',exact:true}).click();
  await panel.getByText('Application window · open',{exact:true}).waitFor();
  await panel.locator('select[name=student]').selectOption(affairsTestUser.id);
  await panel.getByRole('button',{name:'Load early graduation',exact:true}).click();
  await panel.getByRole('button',{name:'Save candidate',exact:true}).click();
  await panel.locator('select[name=decision]').selectOption('approved');
  await panel.getByRole('button',{name:'Save early graduation review',exact:true}).click();
  await panel.getByText('Application · 站內通過',{exact:true}).waitFor();
  assert.ok(configured&&edited&&reviewed);
  const guest=await browser.newContext();
  await mockAffairsAuth(guest,{signedIn:false});
  const gate=await guest.newPage();
  await gate.goto(origin+earlyGraduationPath);
  await gate.waitForURL('**/school-affairs/login?next=*');
  assert.equal(new URL(gate.url()).searchParams.get('next'),earlyGraduationPath);
  assert.deepEqual(errors,[]);
  await verifyRevision();
  console.log('Early graduation browser passed: catalog, closed and open periods, responsive history, Escape, retry, cancellation, assistant, management and sign-in return.');
}finally{await browser.close();}
