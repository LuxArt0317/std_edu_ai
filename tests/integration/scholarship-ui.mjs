import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {mockAffairsAuth,affairsTestUser} from './helpers/affairs-auth.mjs';

const base=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5173';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local synthetic scholarship fixture only');
const path='/school-affairs/services/9-1';
const now=Date.now(),day=86400000;
const iso=offset=>new Date(now+offset*day).toISOString();
const period=(termLabel,open,close)=>({id:randomUUID(),termLabel,opensAt:iso(open),closesAt:iso(close),published:true,instructions:'Synthetic local demonstration period.',sourceMode:'local_demo',version:1});
const open=period('QA open period',-2,2),upcoming=period('QA upcoming period',2,4),closed=period('QA closed period',-4,-2),approved=period('QA approved period',-2,2),rejected=period('QA rejected period',-2,2);
const application=(item,status)=>({id:randomUUID(),periodId:item.id,userId:affairsTestUser.id,status,awardAmount:status==='approved'?15000:null,requiredHours:status==='approved'?20:null,actualHours:status==='approved'?5:null,reviewNote:status==='approved'?'Synthetic approval.':'Synthetic rejection.',submittedAt:iso(-1),reviewedAt:iso(-.5),cancelledAt:null,version:1});
const records={periods:[open,upcoming,closed,approved,rejected],applications:[application(approved,'approved'),application(rejected,'rejected')]};
const snapshot={checkedAt:iso(0),officialUniversityData:false,profile:{userId:affairsTestUser.id,email:affairsTestUser.email,displayName:'QA Student',role:'student'},student:null,courses:[],charges:[],assignments:[],announcements:[],tasks:[],requests:[],dtm:{sourceMode:'personal',courses:[],notices:[]},scholarship:records};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const writes=[],managerWrites=[],errors=[],accessibilityFailures=[],sourceContrastExceptions=[];
const applicationFor=item=>records.applications.find(row=>row.periodId===item.id);
const section=(page,item)=>page.locator('.scholarship-period').filter({has:page.getByRole('heading',{name:item.termLabel+' 獎助學金申請',exact:true})});
const historyRow=(page,item)=>page.locator('.scholarship-table-wrap tbody tr').filter({has:page.getByRole('cell',{name:item.termLabel,exact:true})});
async function accessible(page,label){
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' horizontal overflow');
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  for(const violation of axe.violations.filter(item=>['serious','critical'].includes(item.impact))){
    for(const node of violation.nodes){
      // These two observed source colors are intentionally preserved for source fidelity.
      // New account controls and every other node remain subject to the full contrast rule.
      const sourceColor=violation.id==='color-contrast' && node.target.length===1 && await page.locator(node.target[0]).evaluate(element=>{
        const style=getComputedStyle(element);
        if(element.matches('.scholarship-navbar > a'))return style.color==='rgb(255, 255, 255)'&&getComputedStyle(element.parentElement).backgroundColor==='rgb(67, 142, 185)';
        if(element.matches('.scholarship-notice > summary'))return style.color==='rgb(38, 121, 181)'&&style.backgroundColor==='rgb(247, 247, 247)';
        return false;
      });
      const finding={page:label,id:violation.id,target:node.target,summary:node.failureSummary};
      if(sourceColor)sourceContrastExceptions.push(finding);else accessibilityFailures.push(finding);
    }
  }
}
try{
  await mkdir('artifacts/scholarship',{recursive:true});
  const context=await browser.newContext();
  const authCalls=await mockAffairsAuth(context);
  let failRead=true,failAction=true,holdAction=false,releaseAction;
  await context.route('**/api/affairs-data*',route=>failRead?route.fulfill({status:503,json:{error:'Fixture records unavailable. Retry loading.'}}):route.fulfill({json:snapshot}));
  await context.route('**/api/affairs-action',async route=>{
    assert.match(route.request().headers().authorization||'',/^Bearer /);
    const action=route.request().postDataJSON();writes.push(action);
    assert.ok(['apply_scholarship','cancel_scholarship'].includes(action.kind));
    assert.equal(action.payload.period_id,open.id);
    assert.equal(action.payload.user_id,undefined);
    assert.match(action.payload.request_id,/^[0-9a-f-]{36}$/);
    if(failAction){failAction=false;return route.fulfill({status:503,json:{error:'Fixture application temporarily unavailable. Retry confirmation.'}});}
    if(holdAction){holdAction=false;await new Promise(resolve=>{releaseAction=resolve;});}
    const existing=applicationFor(open);
    assert.equal(action.payload.expected_version,String(existing?.version??0));
    if(existing){existing.status=action.kind==='cancel_scholarship'?'cancelled':'pending';existing.version++;existing.cancelledAt=existing.status==='cancelled'?iso(0):null;}
    else records.applications.unshift({id:randomUUID(),periodId:open.id,userId:affairsTestUser.id,status:'pending',awardAmount:null,requiredHours:null,actualHours:null,reviewNote:'',submittedAt:iso(0),reviewedAt:null,cancelledAt:null,version:1});
    await route.fulfill({json:{id:applicationFor(open).id,kind:action.kind}});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+path);
  await page.getByRole('alert').getByText('Fixture records unavailable. Retry loading.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'申請獎助學金',exact:true}).count(),0);
  failRead=false;
  await page.getByRole('button',{name:'重新載入',exact:true}).click();
  await section(page,open).getByRole('button',{name:'申請獎助學金',exact:true}).waitFor();
  for(const width of [1533,390]){
    await page.setViewportSize({width,height:900});
    const navbar=await page.locator('.scholarship-navbar').boundingBox();
    assert.ok(Math.abs(navbar.height-45)<1,'source navbar height');
    assert.equal(await page.locator('.scholarship-navbar').evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(67, 142, 185)','preserve observed university navbar color');
    if(width===1533){const content=await page.locator('.scholarship-content').boundingBox();assert.ok(Math.abs(content.x-210)<1&&Math.abs(content.width-1082)<5,'source desktop gutter/content geometry');}
    assert.deepEqual(await page.locator('.scholarship-table-wrap th').allTextContents(),['獎助學期','審核情形【說明】','獎助金額','應服務時數','實際服務時數']);
    await section(page,upcoming).getByText('本學期申請尚未開始。',{exact:true}).waitFor();
    await section(page,closed).getByText('本學期申請已截止。',{exact:true}).waitFor();
    for(const item of [upcoming,closed,approved,rejected])assert.equal(await section(page,item).getByRole('button').count(),0,item.termLabel+' must be read-only');
    await historyRow(page,approved).getByRole('cell',{name:'NT$15,000',exact:true}).waitFor();
    assert.equal(await historyRow(page,rejected).getByRole('cell',{name:'—',exact:true}).count(),3);
    await accessible(page,'student '+width);
    await page.screenshot({path:`artifacts/scholarship/student-${width}.png`,fullPage:true});
  }
  const savedRecords=snapshot.scholarship;
  snapshot.scholarship={periods:[],applications:[]};
  await page.reload();await page.getByRole('heading',{name:'目前尚無開放的申請期間',exact:true}).waitFor();
  await page.getByRole('cell',{name:'尚無申請紀錄',exact:true}).waitFor();
  snapshot.scholarship=savedRecords;await page.reload();
  await section(page,open).getByRole('button',{name:'申請獎助學金',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'確認獎助學金申請',exact:true});
  await dialog.getByRole('button',{name:'確認',exact:true}).click();
  await dialog.getByRole('alert').getByText('Fixture application temporarily unavailable. Retry confirmation.',{exact:true}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'確認',exact:true}).isEnabled(),true);
  holdAction=true;
  await dialog.getByRole('button',{name:'確認',exact:true}).click();
  await dialog.getByRole('button',{name:'處理中…',exact:true}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'處理中…',exact:true}).isDisabled(),true);
  assert.equal(await dialog.getByRole('button',{name:'返回',exact:true}).isDisabled(),true);
  assert.equal(writes.length,2);
  assert.equal(writes[0].payload.request_id,writes[1].payload.request_id,'retry preserves the receipt key');
  assert.equal(typeof releaseAction,'function');releaseAction();
  await section(page,open).getByRole('button',{name:'取消申請',exact:true}).waitFor();
  await historyRow(page,open).getByRole('cell',{name:'待審核',exact:true}).waitFor();
  await page.reload();await section(page,open).getByRole('button',{name:'取消申請',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'取消獎助學金申請',exact:true});
  await dialog.getByRole('button',{name:'確認',exact:true}).click();
  await historyRow(page,open).getByRole('cell',{name:'已取消申請',exact:true}).waitFor();
  await section(page,open).getByRole('button',{name:'申請獎助學金',exact:true}).click();
  await page.getByRole('dialog',{name:'確認獎助學金申請',exact:true}).getByRole('button',{name:'確認',exact:true}).click();
  await historyRow(page,open).getByRole('cell',{name:'待審核',exact:true}).waitFor();
  assert.equal(await historyRow(page,open).count(),1,'reapplication keeps one history record');
  assert.deepEqual(writes.map(item=>item.kind),['apply_scholarship','apply_scholarship','cancel_scholarship','apply_scholarship']);
  await page.locator('.scholarship-navbar > button').click();
  assert.equal(await page.getByRole('menuitem',{name:'登出',exact:true}).getAttribute('href'),'/school-affairs/signed-out');
  await page.getByRole('menuitem',{name:'登出',exact:true}).click();
  await page.waitForURL('**/school-affairs/login');
  assert.ok(authCalls.some(call=>call.pathname==='/auth/v1/logout'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('stu-school-affairs-auth')),null);
  await context.close();

  const owner={...affairsTestUser,id:randomUUID(),email:'luxart0317@gmail.com',user_metadata:{name:'QA Scholarship Manager'}};
  const adminContext=await browser.newContext();await mockAffairsAuth(adminContext,{user:owner});
  const adminSnapshot={...snapshot,profile:{userId:owner.id,email:owner.email,displayName:'QA Scholarship Manager',role:'admin'},scholarship:{periods:records.periods,applications:[]},admin:{profiles:[{user_id:owner.id,email:owner.email,display_name:'QA Scholarship Manager',role:'admin',created_at:iso(-1)},{user_id:affairsTestUser.id,email:affairsTestUser.email,display_name:'QA Student',role:'student',created_at:iso(-1)}],students:[],sections:[],enrollments:[],dtmCourses:[],charges:[],assignments:[],requests:[],scholarship:records}};
  await adminContext.route('**/api/affairs-data*',route=>route.fulfill({json:adminSnapshot}));
  let failManage=true;
  await adminContext.route('**/api/affairs-manage',async route=>{
    assert.match(route.request().headers().authorization||'',/^Bearer /);
    const action=route.request().postDataJSON();managerWrites.push(action);
    if(failManage){failManage=false;return route.fulfill({status:503,json:{error:'Fixture manager save failed. Retry the same form.'}});}
    const values=action.payload;
    if(action.kind==='save_scholarship_period')records.periods.push({id:values.id,termLabel:values.term_label,opensAt:values.opens_at,closesAt:values.closes_at,published:values.published==='true',instructions:values.instructions,sourceMode:'local_demo',version:1});
    else if(action.kind==='review_scholarship_application'){
      const row=records.applications.find(item=>item.id===values.id);assert.ok(row);assert.equal(values.expected_version,String(row.version));
      Object.assign(row,{status:values.status,awardAmount:values.status==='approved'?Number(values.award_amount):null,requiredHours:values.status==='approved'?Number(values.required_hours):null,actualHours:values.status==='approved'?Number(values.actual_hours):null,reviewNote:values.review_note,reviewedAt:iso(0),version:row.version+1});
    }else throw Error('Unexpected manager action '+action.kind);
    return route.fulfill({json:{id:values.id,kind:action.kind,summary:'Saved local scholarship record.'}});
  });
  const adminPage=await adminContext.newPage();adminPage.on('pageerror',error=>errors.push(error.message));
  await adminPage.goto(base+'/school-affairs/admin/records');
  await adminPage.getByRole('heading',{name:'School Affairs administration',exact:true}).waitFor();
  await adminPage.getByRole('heading',{name:'Scholarship applications · 獎助學金管理',exact:true}).waitFor();
  for(const width of [1533,390]){await adminPage.setViewportSize({width,height:900});await accessible(adminPage,'manager '+width);await adminPage.screenshot({path:`artifacts/scholarship/manager-${width}.png`,fullPage:true});}
  await adminPage.getByLabel('Scholarship term',{exact:true}).fill('QA published period');
  await adminPage.getByLabel('Opens · Taipei time',{exact:true}).fill('2027-01-02T09:00');
  await adminPage.getByLabel('Closes · Taipei time',{exact:true}).fill('2027-01-01T09:00');
  await adminPage.getByRole('button',{name:'Save period',exact:true}).click();
  await adminPage.getByRole('alert').getByText('Closing time must be after opening time.',{exact:true}).waitFor();
  assert.equal(managerWrites.length,0,'invalid period never reaches the API');
  await adminPage.getByLabel('Closes · Taipei time',{exact:true}).fill('2027-01-03T09:00');
  await adminPage.getByLabel('Instructions',{exact:true}).fill('A published local fixture.');
  await adminPage.getByRole('checkbox',{name:'Published to student accounts',exact:true}).check();
  await adminPage.getByRole('button',{name:'Save period',exact:true}).click();
  await adminPage.getByRole('alert').getByText('Fixture manager save failed. Retry the same form.',{exact:true}).waitFor();
  await adminPage.getByRole('button',{name:'Save period',exact:true}).click();
  await adminPage.locator('.scholarship-manager-list li').filter({hasText:'QA published period'}).getByText('QA published period',{exact:true}).waitFor();
  assert.equal(managerWrites[0].payload.request_id,managerWrites[1].payload.request_id,'manager retries preserve receipt key');
  assert.equal(managerWrites[1].payload.published,'true');
  assert.equal(managerWrites[1].payload.opens_at,'2027-01-02T01:00:00.000Z','Taipei opening time converted to UTC');
  const reviewRow=()=>adminPage.locator('.scholarship-manager-list li').filter({hasText:'QA open period'}).filter({has:adminPage.getByRole('button',{name:'Review application',exact:true})});
  await reviewRow().getByRole('button',{name:'Review application',exact:true}).click();
  await adminPage.getByLabel('Award amount · TWD',{exact:true}).fill('12000');
  await adminPage.getByLabel('Required service hours',{exact:true}).fill('12');
  await adminPage.getByLabel('Actual service hours',{exact:true}).fill('0');
  await adminPage.getByRole('textbox',{name:/^Explanation visible to the applicant/}).fill('Local approval fixture.');
  await adminPage.getByRole('button',{name:'Save review',exact:true}).click();
  await reviewRow().getByText(/審核通過/).waitFor();
  await reviewRow().getByRole('button',{name:'Review application',exact:true}).click();
  await adminPage.getByRole('combobox',{name:/^Review decision/}).selectOption('rejected');
  assert.equal(await adminPage.getByLabel('Award amount · TWD',{exact:true}).count(),0);
  await adminPage.getByRole('textbox',{name:/^Explanation visible to the applicant/}).fill('Local rejection fixture.');
  await adminPage.getByRole('button',{name:'Save review',exact:true}).click();
  await reviewRow().getByText(/審核未通過/).waitFor();
  assert.deepEqual(managerWrites.map(item=>item.kind),['save_scholarship_period','save_scholarship_period','review_scholarship_application','review_scholarship_application']);
  assert.equal(managerWrites.at(-1).payload.award_amount,undefined);
  await adminContext.close();

  const reviewedContext=await browser.newContext({viewport:{width:390,height:900}});await mockAffairsAuth(reviewedContext);
  await reviewedContext.route('**/api/affairs-data*',route=>route.fulfill({json:snapshot}));
  const reviewedPage=await reviewedContext.newPage();reviewedPage.on('pageerror',error=>errors.push(error.message));
  await reviewedPage.goto(base+path);
  await historyRow(reviewedPage,open).getByText('【Local rejection fixture.】',{exact:true}).waitFor();
  assert.equal(await section(reviewedPage,open).getByRole('button').count(),0,'reviewed application cannot be cancelled or resubmitted');
  assert.equal(await historyRow(reviewedPage,open).getByRole('cell',{name:'—',exact:true}).count(),3,'rejection does not invent award or hours');
  await reviewedContext.close();
  assert.deepEqual(errors,[]);
  assert.deepEqual(accessibilityFailures,[]);
  console.log(JSON.stringify({status:'ok',sourceGeometry:true,viewports:[1533,390],periodStates:true,emptyState:true,history:true,applyCancelReapply:true,retryReceipts:true,busyControls:true,publishReview:true,logout:true,newSeriousCriticalAccessibility:0,preservedSourceContrast:sourceContrastExceptions}));
}finally{await browser.close();}
