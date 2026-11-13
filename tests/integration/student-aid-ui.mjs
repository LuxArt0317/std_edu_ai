import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {mockAffairsAuth,affairsTestUser} from './helpers/affairs-auth.mjs';
import {mapStudentAidRecords} from '../../server/studentAidRecords.js';

const base=process.env.PUBLIC_SITE_ORIGIN || 'http://127.0.0.1:5173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Synthetic local browser test only.');
const directory='artifacts/student-aid';
const records=[];
const snapshot={checkedAt:'2026-11-12T13:17:24Z',officialUniversityData:false,
  profile:{userId:affairsTestUser.id,email:affairsTestUser.email,displayName:'QA Student',role:'student'},student:null,
  courses:[],charges:[],assignments:[],announcements:[],tasks:[],requests:[],dtm:{sourceMode:'personal',courses:[],notices:[]},
  scholarship:{periods:[],applications:[]},studentAid:{records},housing:{periods:[],applications:[],assignments:[]},
};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const errors=[],writes=[],contrast=[];
async function accessibility(page,label,source=false) {
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
    elements:[...document.querySelectorAll('body *')].filter(element=>{const box=element.getBoundingClientRect();return box.width && box.right>innerWidth+1;})
      .slice(-15).map(element=>({tag:element.tagName,class:element.className,right:element.getBoundingClientRect().right}))}));
  assert.ok(overflow.scroll<=overflow.width,label+' page overflow '+JSON.stringify(overflow));
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  const failures=[];
  for(const violation of axe.violations.filter(item=>['serious','critical'].includes(item.impact)))for(const node of violation.nodes) {
    const inherited=source && violation.id==='color-contrast' && node.target.length===1 && await page.locator(node.target[0]).evaluate(element=>{
      const color=getComputedStyle(element).color;
      const area=element.closest('.student-aid-brand,.student-aid-nav,.student-aid-breadcrumb,.student-aid-heading small,.student-aid-query,.student-aid-query-hint,.student-aid-eligibility h2,.student-aid-footer');
      return Boolean(area && ['rgb(255, 255, 255)','rgb(100, 142, 170)','rgb(153, 153, 153)','rgb(67, 132, 168)','rgb(136, 136, 136)','rgb(128, 166, 187)'].includes(color));
    });
    const finding={page:label,id:violation.id,target:node.target,summary:node.failureSummary};
    if(inherited)contrast.push(finding);else failures.push(finding);
  }
  assert.deepEqual(failures,[],label+' unexpected serious accessibility issues');
}
try {
  await mkdir(directory,{recursive:true});
  const context=await browser.newContext({viewport:{width:1533,height:1399}});
  await mockAffairsAuth(context);
  let failRead=true;
  await context.route('**/api/affairs-data*',route=>failRead
    ?route.fulfill({status:503,json:{error:'Synthetic aid read failure.'}}):route.fulfill({json:snapshot}));
  await context.route('**/api/affairs-action',()=>{throw new Error('Read-only aid page must never call student actions.');});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/school-affairs/services/22-1');
  await page.getByRole('alert').getByText('Synthetic aid read failure.',{exact:false}).waitFor();
  failRead=false;await page.getByRole('button',{name:'重新載入',exact:true}).click();
  await page.getByText('Date/Time：2026/11/12 21:17:24',{exact:true}).waitFor();
  const frame=await page.locator('.student-aid-frame').boundingBox();
  assert.ok(Math.abs(frame.width-1120)<1 && Math.abs(frame.x-206.5)<1,'source centered 1120px frame');
  for(const [selector,height] of [['.student-aid-brand',34],['.student-aid-nav',45],['.student-aid-breadcrumb',31]])
    assert.ok(Math.abs((await page.locator(selector).boundingBox()).height-height)<1,selector+' source height');
  const tableBox=await page.locator('.student-aid-table-wrap table').boundingBox();
  const headerBox=await page.locator('.student-aid-table-wrap thead').boundingBox();
  assert.ok(Math.abs(tableBox.x-227)<=1 && Math.abs(tableBox.width-1079)<=1 && Math.abs(tableBox.y-285.296875)<=1,
    'source table geometry '+JSON.stringify(tableBox));
  assert.ok(Math.abs(headerBox.height-54.140625)<=1,'source header height '+JSON.stringify(headerBox));
  assert.ok(Math.abs(headerBox.x-227)<=0.5 && Math.abs(headerBox.y-285.296875)<=0.5 && Math.abs(headerBox.width-1079)<=0.5,
    'source header placement '+JSON.stringify(headerBox));
  assert.equal(await page.locator('.student-aid-table-wrap th').first().evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(22, 111, 140)');
  assert.deepEqual(await page.locator('.student-aid-table-wrap th').allTextContents(),['申請者','學生中文姓名','身分證字號','科系名稱','手機','申請類型','關係人數量','實際補助金額','學生紀錄鎖住狀態','學校審核狀態','教育部審核狀態','學年','學期','資料操作']);
  assert.equal(await page.locator('.student-aid-table-wrap tbody tr').count(),0);
  await page.locator('.student-aid-query summary').click();
  await page.locator('.student-aid-query h2').waitFor();
  assert.equal(await page.locator('.student-aid-query input,.student-aid-query select,.student-aid-query textarea').count(),0);
  await page.locator('.student-aid-query summary').click();
  assert.equal(await page.locator('.student-aid-main form').count(),0);
  await accessibility(page,'empty desktop',true);
  await page.screenshot({path:directory+'/empty-1533.png',fullPage:true});
  const fixture={id:randomUUID(),user_id:affairsTestUser.id,applicant_label:'SAMPLE-QA',student_name:'合成測試學生',
    masked_identity_number:'******1234',department_name:'示範科系',phone:null,application_kind:'示範住宿助學',relative_count:2,
    subsidy_amount:'0',student_record_locked:false,school_review_status:'人工核對中',ministry_review_status:null,
    academic_year:115,semester:1,source_mode:'local_demo',version:1,updated_at:snapshot.checkedAt};
  records.push(...mapStudentAidRecords([fixture,{...fixture,id:randomUUID(),user_id:'other-user',student_name:'Other private student'}]).records);
  await page.reload();
  await page.getByRole('cell',{name:'合成測試學生',exact:true}).waitFor();
  assert.equal(await page.locator('.student-aid-table-wrap tbody tr').count(),1);
  assert.equal(await page.getByText('Other private student',{exact:true}).count(),0);
  await page.getByRole('cell',{name:'******1234',exact:true}).waitFor();
  await page.getByRole('cell',{name:'0',exact:true}).waitFor();
  assert.equal(await page.locator('.student-aid-main button').count(),0);
  await page.screenshot({path:directory+'/record-1533.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await accessibility(page,'record mobile',true);
  await page.screenshot({path:directory+'/record-390.png',fullPage:true});
  await context.close();

  const owner={...affairsTestUser,id:randomUUID(),email:'luxart0317@gmail.com',user_metadata:{name:'QA aid manager'}};
  const adminContext=await browser.newContext({viewport:{width:1533,height:1000}});
  await mockAffairsAuth(adminContext,{user:owner});
  const profiles=[{user_id:owner.id,email:owner.email,display_name:'QA manager',role:'admin'},
    {user_id:affairsTestUser.id,email:affairsTestUser.email,display_name:'Same Name',role:'student'},
    {user_id:'second-student',email:'second@example.invalid',display_name:'Same Name',role:'student'}];
  const adminSnapshot={...snapshot,profile:{userId:owner.id,email:owner.email,displayName:'QA manager',role:'admin'},studentAid:{records:[]},
    admin:{profiles,students:[],sections:[],enrollments:[],dtmCourses:[],charges:[],assignments:[],requests:[],
      scholarship:{periods:[],applications:[]},studentAid:{records:[]},housing:{periods:[],applications:[],assignments:[]}}};
  await adminContext.route('**/api/affairs-data*',route=>route.fulfill({json:adminSnapshot}));
  let failSave=true;
  await adminContext.route('**/api/affairs-manage',async route=>{
    const action=route.request().postDataJSON();writes.push(action);
    assert.equal(action.kind,'save_student_aid_record');
    if(failSave){failSave=false;return route.fulfill({status:503,json:{error:'Synthetic manager save failure.'}});}
    const values=action.payload;
    const existing=adminSnapshot.admin.studentAid.records.find(row=>row.id===values.id);
    assert.equal(values.expected_version,String(existing?.version ?? 0));
    const mapped=mapStudentAidRecords([{...values,applicant_label:'SAMPLE-QA',student_name:values.student_name || 'QA Student',
      masked_identity_number:values.masked_identity_number || null,department_name:values.department_name || null,phone:values.phone || null,
      relative_count:values.relative_count===''?null:Number(values.relative_count),subsidy_amount:values.subsidy_amount===''?null:Number(values.subsidy_amount),
      student_record_locked:values.student_record_locked===''?null:values.student_record_locked==='true',
      school_review_status:values.school_review_status || null,ministry_review_status:values.ministry_review_status || null,
      academic_year:Number(values.academic_year),semester:Number(values.semester),source_mode:'local_demo',version:(existing?.version ?? 0)+1,
      updated_at:snapshot.checkedAt}]).records[0];
    if(existing)Object.assign(existing,mapped);else adminSnapshot.admin.studentAid.records.push(mapped);
    return route.fulfill({json:{id:values.id,kind:action.kind,version:mapped.version,summary:'Saved synthetic aid record.'}});
  });
  const managerPage=await adminContext.newPage();managerPage.on('pageerror',error=>errors.push(error.message));
  await managerPage.goto(base+'/school-affairs/admin/records');
  await managerPage.getByRole('heading',{name:'School Affairs administration',exact:true}).waitFor();
  const manager=managerPage.locator('.student-aid-manager');
  await manager.getByRole('heading',{name:'Student aid records · 不利處境學生助學紀錄',exact:true}).waitFor();
  await manager.locator('select[name="user_id"]').selectOption(affairsTestUser.id);
  await manager.getByLabel('Academic year · 學年',{exact:true}).fill('115');
  await manager.getByLabel('Semester · 學期',{exact:true}).fill('1');
  await manager.getByLabel('Application type · 申請類型',{exact:true}).fill('Local housing aid');
  await manager.locator('input[name="masked_identity_number"]').fill('A123456789');
  await manager.getByRole('button',{name:'Save aid record',exact:true}).click();
  await manager.getByRole('alert').waitFor();assert.equal(writes.length,0,'raw identity is rejected before submission');
  await manager.locator('input[name="masked_identity_number"]').fill('******1234');
  await manager.getByRole('button',{name:'Save aid record',exact:true}).click();
  await managerPage.getByRole('alert').filter({hasText:'Synthetic manager save failure.'}).waitFor();
  await manager.getByRole('button',{name:'Save aid record',exact:true}).click();
  await manager.getByRole('status').getByText('Local student aid record saved.',{exact:true}).waitFor();
  assert.equal(writes[0].payload.request_id,writes[1].payload.request_id);
  assert.equal(adminSnapshot.admin.studentAid.records[0].subsidyAmount,null);
  await manager.getByRole('button',{name:'Edit aid record',exact:true}).click();
  assert.equal(await manager.locator('select[name="user_id"]').isDisabled(),true);
  await manager.getByLabel('Subsidy amount · 實際補助金額 (TWD)',{exact:true}).fill('0');
  await manager.getByLabel('School review label · 學校審核狀態',{exact:true}).fill('Manually reviewed local label');
  await manager.getByRole('button',{name:'Save aid record',exact:true}).click();
  await manager.getByRole('status').getByText('Local student aid record saved.',{exact:true}).waitFor();
  assert.equal(adminSnapshot.admin.studentAid.records[0].version,2);
  assert.equal(adminSnapshot.admin.studentAid.records[0].subsidyAmount,0);
  await managerPage.setViewportSize({width:390,height:844});
  await accessibility(managerPage,'aid manager mobile');
  await manager.screenshot({path:directory+'/manager-390.png'});
  assert.deepEqual(errors,[]);
  await writeFile(directory+'/result.json',JSON.stringify({status:'passed',emptyAndOwnedRows:true,desktopGeometry:frame,tableGeometry:tableBox,headerGeometry:headerBox,
    sourceInheritedContrast:contrast,readOnlyStudent:true,managerValidationRetryAndEdit:true,noNewSeriousIssues:true},null,2)+'\n');
  console.log('Student aid UI passed: source geometry/columns, empty and caller-only rows, no invented student/query inputs, masked validation, retry receipt, admin edits, mobile layout and no new serious accessibility findings. Source contrast findings recorded.');
} finally {await browser.close();}
