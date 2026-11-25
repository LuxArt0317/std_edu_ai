import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceSnapshot,schoolServiceReadFixture} from './helpers/school-service-route-inventory.mjs';
import {clearanceOffices,clearancePaths,validClearanceAction} from '../../server/graduationClearanceContract.js';

const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5184';
assert.ok(['https://stu.best','http://127.0.0.1:5184','http://127.0.0.1:5298'].includes(origin));
async function verifyRevision(){
  if(origin!=='https://stu.best')return;
  const revision=process.env.EXPECTED_RELEASE_REVISION;
  assert.match(revision??'',/^[0-9a-f]{40}$/u);
  const response=await fetch(origin+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  assert.equal((await response.json()).revision,revision);
}
const term={id:randomUUID(),label:'Clearance QA Term'};
const manager={...affairsTestUser,id:randomUUID(),email:'reviewer@example.invalid'};
const empty=(user,target)=>({userId:user.id,targetId:target,terms:[],periods:[],applications:[]});
const snapshot=schoolServiceSnapshot(manager);snapshot.profile.role='admin';
snapshot.admin={profiles:[{user_id:affairsTestUser.id,email:affairsTestUser.email,display_name:'QA Student'}],
  students:[],sections:[],enrollments:[],dtmCourses:[],charges:[],assignments:[],requests:[]};
const candidate={track:'graduate',international:true,version:1};
const period={termId:term.id,term:term.label,opensAt:'2026-11-01T00:00:00Z',closesAt:'2026-11-30T00:00:00Z',version:1,state:'open',candidate};
const application={id:randomUUID(),termId:term.id,term:term.label,track:'graduate',submittedAt:'2026-11-14T00:00:00Z',
  reviews:Object.keys(clearanceOffices).map(office=>({office,status:'pending',note:'',reviewedAt:null,version:1}))};
const studentWrites=[],managerWrites=[],errors=[];
let windowSaved=false,candidateSaved=false,submitted=false;
await verifyRevision();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
async function contextFor(user){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:850}});
  await mockAffairsAuth(context,{user});
  await context.route('**/api/**',async route=>{
    try{
      const req=route.request(),url=new URL(req.url());
      if(url.pathname==='/api/affairs-data'&&url.searchParams.get('scope')==='graduation-clearance'){
        assert.match(req.headers().authorization,/^Bearer /u);
        if(user===manager){
          assert.equal(url.searchParams.get('view'),'manage');
          const selected=url.searchParams.get('term'),target=url.searchParams.get('user_id');
          return route.fulfill({json:{...empty(user,target),terms:[term],periods:selected&&windowSaved?[{...period,candidate:target&&candidateSaved?candidate:null}]:[],
            applications:target&&submitted?[application]:[]}});
        }
        assert.equal(url.searchParams.get('view'),'student');
        assert.equal(url.searchParams.has('answer'),false,'Assistant questions use the verified graph, not the native page reader.');
        return route.fulfill({json:{...empty(user,user.id),periods:candidateSaved?[period]:[],applications:submitted?[application]:[]}});
      }
      if(url.pathname==='/api/affairs-assistant'){
        assert.equal(req.method(),'POST');assert.match(req.headers().authorization,/^Bearer /u);
        const body=req.postDataJSON();assert.equal(body.question,'What is my graduation clearance status?');
        assert.equal(body.route,clearancePaths.status);assert.equal(body.stream,true);
        return route.fulfill({contentType:'text/event-stream',body:'event: result\ndata: '+JSON.stringify({status:'answered',answer:'1/8 offices cleared',
          citations:[],suggestedQuestions:[],grounding:{source:'account',webSearched:false},verification:{status:'verified',attempts:1}})+'\n\n'});
      }
      if(url.pathname==='/api/affairs-action'){
        const action=req.postDataJSON();studentWrites.push(action);assert.ok(validClearanceAction(action.kind,action.payload));
        assert.equal(action.kind,'submit_graduation_clearance');submitted=true;
        if(studentWrites.length===1)return route.fulfill({status:503,json:{error:'Lost response'}});
        assert.deepEqual(studentWrites[0],studentWrites[1]);
        return route.fulfill({json:{id:application.id,termId:term.id}});
      }
      if(url.pathname==='/api/affairs-manage'){
        const action=req.postDataJSON();managerWrites.push(action.kind);assert.ok(validClearanceAction(action.kind,action.payload));
        if(action.kind==='set_clearance_period'){windowSaved=true;return route.fulfill({json:{termId:term.id,version:1}});}
        if(action.kind==='set_clearance_candidate'){
          assert.equal(action.payload.track,'graduate');assert.equal(action.payload.international,true);candidateSaved=true;
          return route.fulfill({json:{termId:term.id,version:1}});
        }
        assert.equal(action.kind,'review_clearance_office');assert.equal(action.payload.office,'library');
        const library=application.reviews.find(item=>item.office==='library');
        Object.assign(library,{status:action.payload.decision,note:action.payload.note,reviewedAt:'2026-11-14T01:00:00Z',version:2});
        return route.fulfill({json:{id:application.id,office:'library',version:2}});
      }
      if(url.pathname==='/api/affairs-conversations'&&req.method()==='POST'){
        const chat=req.postDataJSON();return route.fulfill({json:{id:chat.id,title:chat.title,messages:chat.messages,version:1,updated_at:new Date().toISOString()}});
      }
      if(user===manager&&url.pathname==='/api/affairs-data')return route.fulfill({json:snapshot});
      return route.fulfill({json:schoolServiceReadFixture(url.href,req.method(),user,origin)});
    }catch(error){errors.push(String(error));return route.abort();}
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&message.text().includes('[STU_NEXUS_RENDER_FAILURE]'))errors.push(message.text());});
  return page;
}
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const confirm=page=>button(page.getByRole('dialog'),'確認儲存').click();
try{
  const student=await contextFor(affairsTestUser);
  await student.goto(origin+'/school-affairs/menu/aca/all');
  await student.locator(`a[href="${clearancePaths.apply}"]`).click();
  await student.waitForURL(origin+clearancePaths.apply);
  await student.getByText('目前沒有分配給您的申請期間。',{exact:true}).waitFor();
  const admin=await contextFor(manager);
  await admin.goto(origin+'/school-affairs/admin/records');
  const panel=admin.getByRole('region',{name:'Graduation clearance management'});
  await button(panel,'Manage graduation clearance').click();
  await panel.getByLabel('學期',{exact:true}).selectOption(term.id);
  await panel.getByLabel('開放時間（台北）').fill('2026-11-01T08:00');
  await panel.getByLabel('截止時間（台北）').fill('2026-11-30T08:00');
  await button(panel,'儲存離校申請期間').click();await confirm(admin);
  await panel.getByLabel('學生帳戶',{exact:true}).selectOption(affairsTestUser.id);
  await panel.locator('select[name=track]').selectOption('graduate');
  await panel.getByRole('checkbox',{name:'需境外生審核'}).check();
  await button(panel,'儲存申請資格').click();await confirm(admin);
  await panel.getByRole('status').filter({hasText:'已儲存。'}).waitFor();
  await student.reload();
  const start=button(student,'開始離校申請'),dialog=student.getByRole('dialog');
  await start.click();await dialog.waitFor();await student.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(studentWrites.length,0);
  await start.click();assert.equal(await button(dialog,'確認儲存').isEnabled(),false);
  await dialog.getByRole('checkbox').check();await confirm(student);
  await dialog.getByRole('alert').waitFor();await button(dialog,'重試儲存').click();
  await student.getByRole('link',{name:'查看審核結果',exact:true}).click();
  await student.waitForURL(origin+clearancePaths.status);
  await student.getByRole('rowheader',{name:'指導教授',exact:true}).waitFor();
  assert.equal(await student.getByRole('rowheader').count(),8);
  for(const width of [1280,768,390,320]){
    await student.setViewportSize({width,height:850});
    assert.ok(await student.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflows at '+width);
    if(width===1280||width===390){
      const audit=await new AxeBuilder({page:student}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
      assert.deepEqual(audit.violations.filter(row=>['serious','critical'].includes(row.impact)).map(row=>row.id),[]);
    }
  }
  await admin.reload();await button(panel,'Manage graduation clearance').click();
  await panel.getByLabel('學期',{exact:true}).selectOption(term.id);
  await panel.getByLabel('學生帳戶',{exact:true}).selectOption(affairsTestUser.id);
  await button(panel,'編輯圖書館典閱組審核').click();
  await panel.locator('select[name=decision]').selectOption('cleared');
  await panel.getByLabel('說明',{exact:true}).fill('Library account cleared.');
  await button(panel,'儲存審核結果').click();await confirm(admin);
  await panel.getByText('Library account cleared.',{exact:true}).waitFor();
  assert.deepEqual(managerWrites,['set_clearance_period','set_clearance_candidate','review_clearance_office']);
  await student.reload();await student.getByText('Library account cleared.',{exact:true}).waitFor();
  await student.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await student.getByPlaceholder('Ask a school question…').fill('What is my graduation clearance status?');
  await button(student,'Send').click();await student.getByText('1/8 offices cleared',{exact:true}).first().waitFor();
  const guest=await browser.newContext();await mockAffairsAuth(guest,{signedIn:false});
  const gate=await guest.newPage();
  for(const path of Object.values(clearancePaths)){
    await gate.goto(origin+path);await gate.waitForURL('**/school-affairs/login?next=*');
    assert.equal(new URL(gate.url()).searchParams.get('next'),path);
  }
  assert.deepEqual(errors,[]);await verifyRevision();
  console.log('Graduation clearance browser passed: navigation, acknowledgement, retry, office review, history, assistant, mobile and sign-in return.');
}finally{await browser.close();}
