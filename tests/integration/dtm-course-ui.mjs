import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { mockAffairsAuth, affairsTestUser } from './helpers/affairs-auth.mjs';

const base=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5173';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local synthetic fixture only');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const course={id:'course-personal-qa',code:'QA-COURSE',title:'Personal learning journal',term:'115學年度第1學期',role:'student',sourceMode:'personal',materials:[{id:'material-qa',title:'Study guide',kind:'page',summary:'A privately saved guide.',position:1,sourceMode:'personal'}],meetings:[],grades:[{id:'grade-qa',label:'Practice assessment',score:82,maximum:100,date:'2026-11-10',feedback:'Review the final section.'}]};
const snapshot={checkedAt:'2026-11-12T00:00:00Z',officialUniversityData:false,profile:{userId:affairsTestUser.id,email:affairsTestUser.email,displayName:'QA Student',role:'student'},student:null,courses:[],charges:[],assignments:[{id:'assignment-qa',title:'Weekly reflection',details:'Use your own study notes.',dueAt:'2026-11-18T15:59:00Z',status:'open',submittedAt:null,sourceMode:'personal',enrollmentId:null,dtmCourseId:course.id,course:course.code,origin:'manual'}],announcements:[],tasks:[],requests:[],dtm:{sourceMode:'personal',courses:[course],notices:[]}};
const writes=[];
try{
  await mkdir('artifacts/dtm',{recursive:true});
  const context=await browser.newContext();
  await mockAffairsAuth(context);
  await context.route('**/api/affairs-data*',route=>route.fulfill({json:snapshot}));
  await context.route('**/api/affairs-action',async route=>{
    assert.match(route.request().headers().authorization||'',/^Bearer /);
    const action=route.request().postDataJSON();writes.push(action);
    const {payload}=action;
    assert.equal(payload.course_id,course.id);
    if(action.kind==='save_dtm_assignment'){
      const row={id:payload.id,title:payload.title,details:payload.details,dueAt:payload.due_at||null,status:payload.status,submittedAt:null,sourceMode:'personal',enrollmentId:null,dtmCourseId:course.id,course:course.code,origin:'manual',meetingId:payload.meeting_id||null};
      snapshot.assignments=snapshot.assignments.filter(item=>item.id!==row.id).concat(row);
    }else if(action.kind==='delete_dtm_assignment')snapshot.assignments=snapshot.assignments.filter(item=>item.id!==payload.id);
    else throw Error('Unexpected fixture mutation '+action.kind);
    await route.fulfill({json:{id:payload.id,kind:action.kind}});
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const width of [1533,768,390,320]){
    await page.setViewportSize({width,height:900});
    await page.goto(base+'/dtm/course/'+course.id);
    await page.getByRole('heading',{name:course.title,exact:true}).waitFor();
    assert.equal(await page.locator('.dtm-course-tabs').count(),0);
    assert.deepEqual(await page.locator('.dtm-course-section > h3').allTextContents(),['作業區','測驗區','教材區']);
    if(width===1533){
      for(const [selector,expected] of [['.dtm-left',[20,166,344.53]],['.dtm-center',[402.83,166,1110.17]]]){
        const box=await page.locator(selector).boundingBox();
        assert.ok([box.x,box.y,box.width].every((value,index)=>Math.abs(value-expected[index])<=1),selector+' source geometry');
      }
      const navigationIcon=page.locator('.dtm-navigation-icon');
      assert.equal(await navigationIcon.textContent(),'\uf0e8');
      assert.match(await navigationIcon.evaluate(node=>getComputedStyle(node).fontFamily),/DTM Navigation Icons/);
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'course overflow at '+width);
    await page.screenshot({path:`artifacts/dtm/course-${width}.png`,fullPage:true});
    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    assert.deepEqual(axe.violations.filter(item=>['critical','serious'].includes(item.impact)).map(item=>({id:item.id,nodes:item.nodes.map(node=>node.target)})),[]);
  }
  await page.getByRole('button',{name:'成員',exact:true}).click();
  await page.getByRole('dialog',{name:'成員',exact:true}).getByText('QA Student',{exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Study guide',exact:true}).click();
  await page.getByRole('dialog',{name:'Study guide'}).getByText('A privately saved guide.').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'課程選單',exact:true}).click();
  await page.getByRole('menuitem',{name:'新增作業',exact:true}).click();
  await page.getByLabel('作業名稱',{exact:true}).fill('A new reflection');
  await page.getByRole('button',{name:'儲存紀錄',exact:true}).click();
  await page.getByRole('button',{name:'A new reflection',exact:true}).click();
  await page.getByRole('dialog',{name:'A new reflection'}).getByRole('button',{name:'編輯',exact:true}).click();
  await page.getByLabel('作業名稱',{exact:true}).fill('Updated reflection');
  await page.getByRole('button',{name:'儲存紀錄',exact:true}).click();
  await page.getByRole('button',{name:'Updated reflection',exact:true}).click();
  await page.getByRole('dialog',{name:'Updated reflection'}).getByRole('button',{name:'刪除',exact:true}).click();
  await page.getByRole('dialog',{name:'刪除紀錄'}).getByRole('button',{name:'刪除',exact:true}).click();
  await page.getByRole('button',{name:'Updated reflection',exact:true}).waitFor({state:'detached'});
  assert.deepEqual(writes.map(action=>action.kind),['save_dtm_assignment','save_dtm_assignment','delete_dtm_assignment']);
  for(const width of [1533,390,320]){
    await page.setViewportSize({width,height:900});
    await page.goto(base+'/dtm/course/'+course.id+'/grades');
    await page.getByRole('heading',{name:'用戶報告 - QA Student',exact:true}).waitFor();
    assert.equal(await page.locator('.dtm-grade-table thead th').count(),8);
    assert.equal(await page.locator('.dtm-grade-item').innerText(),'Practice assessment');
    assert.equal(await page.locator('.dtm-grade-total td').allTextContents().then(values=>values.every(value=>value==='–')),true);
    if(width===1533){
      const box=await page.locator('.dtm-grade-table').boundingBox();assert.ok(Math.abs(box.y-305)<=1,'source grade table offset');
      assert.deepEqual(await page.locator('.dtm-grade-group th,.dtm-grade-item,.dtm-grade-total th').evaluateAll(nodes=>nodes.map(node=>({paddingLeft:getComputedStyle(node).paddingLeft,fontWeight:getComputedStyle(node).fontWeight}))),[{paddingLeft:'24px',fontWeight:'700'},{paddingLeft:'48px',fontWeight:'400'},{paddingLeft:'48px',fontWeight:'700'}]);
      assert.equal(await page.locator('.dtm-grade-total-symbol').textContent(),'Σ');
      assert.equal(await page.locator('.dtm-grade-total-symbol').getAttribute('aria-hidden'),'true');
      assert.equal(await page.locator('.dtm-grade-item img').count(),0,'An arbitrary saved grade must not be labelled as an assignment.');
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'grade overflow at '+width);
    if(width<768){
      await page.getByRole('region',{name:'成績報告',exact:true}).focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(()=>document.querySelector('.dtm-grade-scroll')?.scrollLeft>0);
    }
    await page.screenshot({path:`artifacts/dtm/grades-${width}.png`,fullPage:true});
    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    assert.deepEqual(axe.violations.filter(item=>['critical','serious'].includes(item.impact)).map(item=>item.id),[]);
  }
  await page.getByRole('button',{name:'Practice assessment',exact:true}).click();
  await page.getByRole('dialog',{name:'Practice assessment'}).getByText('Review the final section.').waitFor();
  await page.getByRole('dialog',{name:'Practice assessment'}).getByRole('button',{name:'編輯',exact:true}).click();
  await page.getByRole('heading',{name:'編輯成績',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'ok',sourceGeometry:true,recordDetail:true,assignmentCreateEditDelete:true,gradeReport:true,gradeEditor:true,responsive:true,seriousCriticalAccessibility:0}));
  await context.close();
}finally{await browser.close();}
