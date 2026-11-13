import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {mockAffairsAuth,affairsTestUser} from './helpers/affairs-auth.mjs';
import {mapCourseSelection} from '../../server/courseSelection.js';

process.umask(0o077);
const base=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Synthetic local browser fixtures only.');
const output='artifacts/course-selection-manager',errors=[],writes=[],rows=[],receipts=new Map();
const checkedAt='2026-11-12T10:00:00Z',owner={...affairsTestUser,id:randomUUID(),email:'luxart0317@gmail.com',user_metadata:{name:'Synthetic manager'}};
const otherId=randomUUID(),profiles=[{user_id:affairsTestUser.id,display_name:'Same Name',email:affairsTestUser.email},{user_id:otherId,display_name:'Same Name',email:'second@example.invalid'}];
const snapshot={checkedAt,officialUniversityData:false,profile:{userId:owner.id,email:owner.email,displayName:'Synthetic manager',role:'admin'},student:null,
  courses:[],charges:[],assignments:[],announcements:[],tasks:[],requests:[],dtm:{sourceMode:'personal',courses:[],notices:[]},
  scholarship:{periods:[],applications:[]},studentAid:{records:[]},housing:{periods:[],applications:[],assignments:[]},creditLoadHistory:{records:[]},courseSelection:{records:[]},
  admin:{profiles,students:[],sections:[],enrollments:[],dtmCourses:[],charges:[],assignments:[],requests:[],courseSelection:{records:[]}}};
const sync=()=>{snapshot.admin.courseSelection=mapCourseSelection(rows);};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  await mkdir(output,{recursive:true,mode:0o700});
  const context=await browser.newContext({viewport:{width:1533,height:1000}});await mockAffairsAuth(context,{user:owner});
  await context.route('**/api/affairs-data*',route=>route.fulfill({json:snapshot}));
  let loseFirst=true,release;const blocked=new Promise(resolve=>{release=resolve;});
  await context.route('**/api/affairs-manage',async route=>{
    const action=route.request().postDataJSON(),payload=action.payload;writes.push(action);assert.equal(action.kind,'save_course_selection');
    const prior=receipts.get(payload.request_id);
    if(prior){assert.deepEqual(prior.payload,payload);return route.fulfill({json:prior.result});}
    const existing=rows.find(row=>row.id===payload.id);
    if(Number(payload.expected_version)!==(existing?.version||0))return route.fulfill({status:409,json:{error:'Synthetic course-selection version conflict.'}});
    assert.ok(!existing||existing.user_id===payload.user_id,'Existing record ownership is immutable.');
    const next={...payload,required_elective_text:payload.required_elective_text||null,instructor_one:payload.instructor_one||null,remark_text:payload.remark_text||null,
      source_mode:'local_demo',version:(existing?.version||0)+1,created_at:existing?.created_at||checkedAt,updated_at:checkedAt};
    if(existing)Object.assign(existing,next);else rows.push(next);sync();
    const result={id:payload.id,kind:action.kind,version:next.version,summary:'Synthetic local course-selection record saved.'};receipts.set(payload.request_id,{payload,result});
    if(loseFirst){loseFirst=false;await blocked;return route.fulfill({status:503,json:{error:'Synthetic response lost after save.'}});}
    return route.fulfill({json:result});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/school-affairs/admin/records');await page.getByRole('heading',{name:'School Affairs administration',exact:true}).waitFor();
  const manager=page.locator('.course-selection-manager');await manager.waitFor();
  assert.deepEqual(await manager.getByLabel('Course-selection account',{exact:true}).locator('option').allTextContents(),['Choose an account',`Same Name (${affairsTestUser.email})`,'Same Name (second@example.invalid)']);
  await manager.getByLabel('Course-selection account',{exact:true}).selectOption(affairsTestUser.id);
  await manager.getByLabel('Academic year · 學年',{exact:true}).fill('115');await manager.getByLabel('Semester · 學期',{exact:true}).selectOption('1');await manager.getByLabel('Selection phase · 選課階段',{exact:true}).selectOption('add_drop');
  await manager.getByLabel('Term course code · 當學期課號',{exact:true}).fill('QA-101');await manager.getByLabel('Course title · 科目名稱',{exact:true}).fill('Synthetic administrator course');
  await manager.getByLabel('Required/elective label · 必選修',{exact:true}).fill('必修');await manager.getByLabel('Credits · 學分',{exact:true}).fill('3.5');await manager.getByLabel('Instructor one · 任課教師一',{exact:true}).fill('Synthetic instructor');await manager.getByLabel('Remark · 備註',{exact:true}).fill('Y(W)');
  const included=manager.getByLabel('Include in weekly timetable · 顯示於課表',{exact:true});assert.equal(await included.isChecked(),false);await included.check();
  await manager.getByRole('button',{name:'Add meeting slot',exact:true}).click();await manager.getByLabel('Meeting 1 period',{exact:true}).selectOption('午');await manager.getByLabel('Meeting 1 room',{exact:true}).fill('QA Room');
  await manager.getByRole('button',{name:'Add meeting slot',exact:true}).click();await manager.getByLabel('Meeting 2 weekday',{exact:true}).selectOption('7');await manager.getByLabel('Meeting 2 period',{exact:true}).selectOption('D');
  await manager.getByRole('button',{name:'Save course-selection record',exact:true}).click();await manager.getByRole('button',{name:'Saving course-selection record…',exact:true}).waitFor();
  assert.equal(await manager.getByLabel('Course title · 科目名稱',{exact:true}).isDisabled(),true);assert.equal(await manager.getByRole('button',{name:'Clear meeting slots',exact:true}).isDisabled(),true);
  await manager.locator('form').evaluate(form=>form.requestSubmit());assert.equal(writes.length,1);release();
  await page.getByRole('alert').filter({hasText:'Synthetic response lost after save.'}).waitFor();await manager.getByRole('button',{name:'Save course-selection record',exact:true}).click();await manager.getByRole('status').filter({hasText:'Local course-selection record saved.'}).waitFor();
  assert.equal(rows.length,1);assert.equal(writes.length,2);assert.equal(writes[0].payload.request_id,writes[1].payload.request_id);assert.equal(rows[0].timetable_included,true);
  assert.deepEqual(rows[0].meetings,[{weekday:1,period:'午',room:'QA Room'},{weekday:7,period:'D',room:''}]);
  await manager.getByRole('button',{name:'Edit course-selection record',exact:true}).click();assert.equal(await manager.getByLabel('Course-selection account',{exact:true}).isDisabled(),true);
  assert.equal(await manager.getByLabel('Meeting 2 period',{exact:true}).inputValue(),'D');
  for(const name of ['Required/elective label · 必選修','Instructor one · 任課教師一','Remark · 備註'])await manager.getByLabel(name,{exact:true}).fill('');
  await included.uncheck();await manager.getByRole('button',{name:'Clear meeting slots',exact:true}).click();await manager.getByRole('button',{name:'Save course-selection record',exact:true}).click();
  await manager.getByRole('heading',{name:'Add local course-selection record',exact:true}).waitFor();assert.equal(rows[0].version,2);assert.equal(rows[0].timetable_included,false);assert.deepEqual(rows[0].meetings,[]);
  for(const key of ['required_elective_text','instructor_one','remark_text'])assert.equal(rows[0][key],null);
  await manager.getByRole('button',{name:'Edit course-selection record',exact:true}).click();rows[0].version=3;rows[0].course_title='Other administrator revision';sync();
  await manager.getByLabel('Course title · 科目名稱',{exact:true}).fill('Retained unsaved draft');await manager.getByRole('button',{name:'Save course-selection record',exact:true}).click();await page.getByRole('alert').filter({hasText:'Synthetic course-selection version conflict.'}).waitFor();
  await manager.getByRole('button',{name:'Refresh course-selection records',exact:true}).click();await manager.getByRole('button',{name:'Load latest saved version',exact:true}).waitFor();
  assert.equal(await manager.getByLabel('Course title · 科目名稱',{exact:true}).inputValue(),'Retained unsaved draft');assert.equal(await manager.getByRole('button',{name:'Save course-selection record',exact:true}).isDisabled(),true);
  await manager.getByRole('button',{name:'Load latest saved version',exact:true}).click();assert.equal(await manager.getByLabel('Course title · 科目名稱',{exact:true}).inputValue(),'Other administrator revision');
  await manager.getByRole('button',{name:'Save course-selection record',exact:true}).click();await manager.getByRole('heading',{name:'Add local course-selection record',exact:true}).waitFor();assert.equal(rows[0].version,4);assert.equal(writes.at(-1).payload.expected_version,'3');
  await manager.getByRole('button',{name:'Edit course-selection record',exact:true}).click();await manager.getByRole('button',{name:'Add meeting slot',exact:true}).click();await manager.getByRole('button',{name:'Add meeting slot',exact:true}).click();
  const before=writes.length;await manager.getByRole('button',{name:'Save course-selection record',exact:true}).click();await manager.getByRole('alert').filter({hasText:'Each weekday and period may appear only once'}).waitFor();assert.equal(writes.length,before);
  await manager.getByRole('button',{name:'Remove meeting 2',exact:true}).click();
  for(const width of [1533,390,320]){
    await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Admin body overflows at '+width);
    const axe=await new AxeBuilder({page}).include('.course-selection-manager').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    assert.deepEqual(axe.violations.filter(item=>['serious','critical'].includes(item.impact)),[],'Manager serious accessibility findings at '+width);
    await manager.screenshot({path:`${output}/manager-${width}.png`});
  }
  assert.deepEqual(errors,[]);
  await writeFile(output+'/result.json',JSON.stringify({passed:true,syntheticOnly:true,checks:['create/prefill/clear','explicit timetable membership','14-period multiple slots','lost-response idempotency','busy duplicate guard','immutable owner','stale conflict refresh preserves draft','explicit latest-version recovery','duplicate-slot rejection','1533/390/320px contained','zero serious/critical axe findings'],writes:writes.length},null,2));
  console.log('Course-selection manager UI passed: create, edit, clear, explicit timetable slots, stable retry, busy guards, fixed owner, stale refresh recovery, validation, mobile layout and accessibility. Synthetic local fixtures only.');
}finally{await browser.close();}
