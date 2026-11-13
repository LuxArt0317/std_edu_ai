import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {mockAffairsAuth,affairsTestUser} from './helpers/affairs-auth.mjs';

const base=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Synthetic local browser fixtures only.');
const directory='artifacts/course-selection',errors=[],contrast=[],geometry={},writes=[];
const checkedAt='2026-11-12T10:00:00Z';
const snapshot={checkedAt,officialUniversityData:false,profile:{userId:affairsTestUser.id,email:affairsTestUser.email,displayName:'Synthetic Student',role:'student'},
  student:{id:'student-one',studentNumber:'LOCAL-QA-01',fullName:'Synthetic Student',yearLevel:1,status:'active',sourceMode:'local_demo',program:null},
  courses:[],charges:[],assignments:[],announcements:[],tasks:[],requests:[],dtm:{sourceMode:'personal',courses:[],notices:[]},
  scholarship:{periods:[],applications:[]},studentAid:{records:[]},housing:{periods:[],applications:[],assignments:[]},creditLoadHistory:{records:[]},courseSelection:{records:[]}};
const fixture=(id,extra={})=>({id,userId:affairsTestUser.id,academicYear:115,semester:1,selectionPhase:'add_drop',termCourseCode:'LOCAL-'+id,courseTitle:'Synthetic course '+id,requiredElectiveText:'選',credits:3,instructorOne:'Synthetic instructor',remarkText:null,rowOrder:0,timetableIncluded:true,meetings:[],sourceMode:'local_demo',version:1,createdAt:checkedAt,updatedAt:checkedAt,...extra});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
async function check(page,label){
  const size=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));assert.ok(size.document<=size.viewport,label+' page overflow '+JSON.stringify(size));
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze(),failures=[];
  for(const violation of result.violations.filter(row=>['serious','critical'].includes(row.impact)))for(const node of violation.nodes){
    const inherited=violation.id==='color-contrast'&&node.target.length===1&&await page.locator(node.target[0]).evaluate(element=>{
      const color=getComputedStyle(element).color,brand=element.closest('.course-selection-brand'),nav=element.closest('.course-selection-nav');
      return Boolean(brand&&color==='rgb(255, 255, 255)'&&getComputedStyle(brand).backgroundColor==='rgb(124, 124, 124)'
        ||nav&&color==='rgb(255, 255, 255)'&&getComputedStyle(nav).backgroundColor==='rgb(67, 142, 185)'
        ||element.closest('.course-selection-breadcrumb')&&color==='rgb(76, 143, 189)'
        ||element.matches('.course-selection-heading small')&&color==='rgb(153, 153, 153)'
        ||element.matches('.course-selection-notes h2,.course-selection-footer,.course-selection-toggle')&&color==='rgb(71, 143, 202)'
        ||element.matches('.course-selection-query')&&color==='rgb(255, 255, 255)'&&getComputedStyle(element).backgroundColor==='rgb(149, 133, 191)'
        ||element.matches('.course-selection-summary h3 span')&&color==='rgb(255, 0, 0)'&&getComputedStyle(element.closest('.course-selection-summary')).backgroundColor==='rgb(217, 237, 247)');
    });
    const finding={page:label,id:violation.id,target:node.target,summary:node.failureSummary};if(inherited)contrast.push(finding);else failures.push(finding);
  }
  assert.deepEqual(failures,[],label+' unexpected serious accessibility findings');
}
const near=(actual,expected,label,tolerance=1)=>assert.ok(Math.abs(actual-expected)<tolerance,`${label}: ${actual} vs ${expected}`);
try{
  await mkdir(directory,{recursive:true});const context=await browser.newContext({viewport:{width:1533,height:1000}});await mockAffairsAuth(context);
  let readMode='error',releaseRead;const pendingRead=new Promise(resolve=>{releaseRead=resolve;});
  await context.route('**/api/affairs-data*',async route=>{
    if(readMode==='loading')await pendingRead;
    return readMode==='error'?route.fulfill({status:503,json:{error:'Synthetic course read failure.'}}):route.fulfill({json:snapshot});
  });
  await context.route('**/api/affairs-action',route=>{writes.push(route.request().postData());return route.fulfill({status:500,json:{error:'Course views must be read-only.'}});});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/school-affairs/services/11-1');await page.getByRole('alert').filter({hasText:'Synthetic course read failure.'}).waitFor();
  await check(page,'error1533');await page.screenshot({path:directory+'/history-error-1533.png',fullPage:true});
  readMode='loading';await page.getByRole('button',{name:'重新載入',exact:true}).click();await page.getByRole('status').filter({hasText:'載入紀錄中'}).waitFor();
  await page.getByRole('button',{name:'查詢條件輸入',exact:true}).click();assert.equal(await page.getByLabel('學年',{exact:true}).isDisabled(),true);readMode='ready';releaseRead();
  await page.getByRole('table',{name:'選課清單，計 0 筆課程資料',exact:true}).waitFor();
  if(await page.getByRole('button',{name:'查詢條件輸入',exact:true}).getAttribute('aria-expanded')==='true')await page.getByRole('button',{name:'查詢條件輸入',exact:true}).click();
  assert.equal(await page.locator('.course-selection-history-table tbody tr').count(),0);
  assert.deepEqual(await page.locator('.course-selection-history-table thead th').allTextContents(),['序號','當期課程代碼','課程名稱','必選修','學分','教師一','備註']);
  for(const selector of ['.course-selection-frame','.course-selection-main','.course-selection-heading','.course-selection-record-heading','.course-selection-summary','.course-selection-table-wrap table'])geometry[selector]=await page.locator(selector).boundingBox();
  near(geometry['.course-selection-frame'].x,206.5,'frame x',.5);near(geometry['.course-selection-table-wrap table'].x,226.5,'table x',.5);near(geometry['.course-selection-table-wrap table'].y,373.8,'table y',1.1);near(geometry['.course-selection-table-wrap table'].width,1080,'table width',.5);
  await check(page,'history-empty1533');await page.screenshot({path:directory+'/history-empty-1533.png',fullPage:true});
  await page.getByRole('button',{name:'查詢條件輸入',exact:true}).click();
  assert.deepEqual(await page.getByLabel('學年',{exact:true}).locator('option').allTextContents(),['請選擇學年','114','115','116']);
  assert.deepEqual(await page.getByLabel('學期',{exact:true}).locator('option').allTextContents(),['請選擇學期','一','二','暑']);
  assert.deepEqual(await page.getByLabel('選課階段',{exact:true}).locator('option').allTextContents(),['請選擇階段','初選','加退選','棄選','暑一']);
  for(const selector of ['.course-selection-criteria','.course-selection-criteria form','.course-selection-term-fields select','.course-selection-phase-field select','.course-selection-query','.course-selection-summary'])geometry['expanded '+selector]=await page.locator(selector).first().boundingBox();
  near(geometry['expanded .course-selection-criteria'].y,201.296875,'criteria y',.5);near(geometry['expanded .course-selection-criteria'].height,226.8984375,'criteria h',.5);
  near(geometry['expanded .course-selection-term-fields select'].y,224.796875,'year y',.5);near(geometry['expanded .course-selection-phase-field select'].y,289.296875,'phase y',.5);near(geometry['expanded .course-selection-query'].y,334.296875,'query y',.5);near(geometry['expanded .course-selection-summary'].y,507.1953125,'expanded summary y',.5);
  await check(page,'history-expanded1533');await page.screenshot({path:directory+'/history-expanded-1533.png',fullPage:true});
  snapshot.courseSelection.records=[fixture('scheduled',{credits:0,remarkText:'Y(W)',meetings:[{weekday:1,period:'1',room:'QA 101'},{weekday:1,period:'2',room:'QA 101'},{weekday:7,period:'D',room:'QA 707'}]}),
    fixture('overlap',{rowOrder:1,meetings:[{weekday:1,period:'1',room:'QA 202'}]}),fixture('unscheduled',{rowOrder:2}),fixture('excluded',{rowOrder:3,timetableIncluded:false,meetings:[{weekday:1,period:'1',room:'QA 303'}]}),
    fixture('initial',{selectionPhase:'initial'}),fixture('summer',{academicYear:112,semester:3,selectionPhase:'summer1'}),
    fixture('other',{userId:'another-account',academicYear:999,courseTitle:'OTHER ACCOUNT PRIVATE COURSE'}),fixture('literal',{rowOrder:4,courseTitle:'<img src=x onerror="window.courseInjected=true">',remarkText:'<script>private()</script>',timetableIncluded:false})];
  await page.reload();await page.getByRole('table',{name:'選課清單，計 5 筆課程資料',exact:true}).waitFor();
  assert.equal(await page.locator('.course-selection-history-table tbody tr').count(),5);assert.equal(await page.getByText('OTHER ACCOUNT PRIVATE COURSE',{exact:true}).count(),0);
  assert.equal(await page.locator('.course-selection-history-table tbody tr').first().locator('td').count(),7);assert.equal(await page.locator('.course-selection-history-table tbody tr').first().locator('td').nth(4).innerText(),'0');
  assert.equal(await page.locator('.course-selection-history-table tbody tr').first().locator('td').nth(6).innerText(),'Y(W)');assert.equal(await page.locator('.course-selection-table-wrap img,.course-selection-table-wrap script').count(),0);assert.equal(await page.evaluate(()=>window.courseInjected),undefined);
  await check(page,'history-records1533');await page.screenshot({path:directory+'/history-records-1533.png',fullPage:true});
  await page.getByRole('button',{name:'查詢條件輸入',exact:true}).click();await page.getByLabel('選課階段',{exact:true}).selectOption('initial');
  assert.equal(await page.locator('.course-selection-summary h3 span').innerText(),'加退選','Draft filters do not rewrite current results.');await page.getByRole('button',{name:'查詢',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'查詢條件輸入',exact:true}).getAttribute('aria-expanded'),'false');assert.equal(await page.locator('.course-selection-summary h3 span').innerText(),'初選');assert.equal(await page.locator('.course-selection-history-table tbody tr').count(),1);
  await page.getByRole('button',{name:'查詢條件輸入',exact:true}).click();assert.equal(await page.getByLabel('學年',{exact:true}).locator('option[value="999"]').count(),0);
  await page.getByLabel('學年',{exact:true}).selectOption('112');await page.getByLabel('學期',{exact:true}).selectOption('3');await page.getByLabel('選課階段',{exact:true}).selectOption('summer1');await page.getByRole('button',{name:'查詢',exact:true}).click();await page.getByRole('cell',{name:'Synthetic course summer',exact:true}).waitFor();
  await page.setViewportSize({width:1280,height:900});await check(page,'history1280');await page.screenshot({path:directory+'/history-records-1280.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await check(page,'history390');await page.screenshot({path:directory+'/history-records-390.png',fullPage:true});
  await page.locator('.course-selection-table-wrap').focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('.course-selection-table-wrap').scrollLeft>0);
  await page.getByRole('button',{name:'查詢條件輸入',exact:true}).click();await check(page,'history-expanded390');await page.screenshot({path:directory+'/history-expanded-390.png',fullPage:true});
  await page.setViewportSize({width:1533,height:1100});await page.getByRole('button',{name:'選課資訊',exact:true}).click();assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['選課記錄查詢','我的課表','選課確認','棄選','即時教學反應']);await page.getByRole('menuitem',{name:'我的課表',exact:true}).click();await page.waitForURL('**/school-affairs/services/11-2');
  await page.locator('.course-selection-timetable tbody tr').last().waitFor();assert.equal(await page.locator('.course-selection-timetable tbody tr').count(),14);
  assert.deepEqual(await page.locator('.course-selection-timetable thead th').allTextContents(),['節次','時間','周一','周二','周三','周四','周五','周六','周日']);
  assert.equal(await page.locator('tr[data-period="1"] [data-weekday="1"] .course-selection-meeting').count(),2);
  assert.match(await page.locator('tr[data-period="D"] [data-weekday="7"]').innerText(),/Synthetic course scheduled/);
  assert.match(await page.locator('.course-selection-unscheduled').innerText(),/Synthetic course unscheduled/);assert.equal(await page.locator('.course-selection-timetable').getByText('Synthetic course excluded',{exact:true}).count(),0);
  assert.equal(await page.locator('.course-selection-main a,.course-selection-main input').count(),0,'No application links or inputs are invented.');
  for(const width of [1533,1280,390]){await page.setViewportSize({width,height:1100});await check(page,'timetable'+width);await page.screenshot({path:directory+'/timetable-records-'+width+'.png',fullPage:true});}
  snapshot.courseSelection.records=[];await page.reload();await page.locator('.course-selection-timetable tbody tr').last().waitFor();assert.equal(await page.locator('.course-selection-meeting,.course-selection-unscheduled').count(),0);await check(page,'timetable-empty390');await page.screenshot({path:directory+'/timetable-empty-390.png',fullPage:true});
  snapshot.courseSelection.records=[fixture('alternate',{academicYear:112,semester:3,selectionPhase:'summer1'})];await page.reload();await page.getByText('Synthetic course alternate',{exact:false}).waitFor();assert.match(await page.locator('.course-selection-summary').innerText(),/112/);assert.equal(await page.locator('.course-selection-summary h3 span').innerText(),'暑一');
  await page.getByRole('button',{name:'抵免學分',exact:true}).click();assert.equal(await page.getByRole('menuitem',{name:'已抵免學分記錄查詢',exact:true}).getAttribute('href'),'/school-affairs/services/7-2/history');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Index',exact:true}).click();assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['Index','Logout']);await page.getByRole('menuitem',{name:'Logout',exact:true}).click();await page.waitForURL('**/school-affairs/signed-out');await page.waitForFunction(()=>localStorage.getItem('stu-school-affairs-auth')===null);
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  await writeFile(directory+'/result.json',JSON.stringify({status:'passed',syntheticOnly:true,geometry,sourceInheritedContrast:contrast,unexpectedSeriousAccessibilityIssues:0,ownerFiltering:true,filters:true,sourceFourteenPeriods:true,multipleMeetingsAndUnscheduled:true,noStudentWrites:true,logout:true},null,2)+'\n');
  console.log('Course selection UI passed: source shell/filter geometry, seven-column history, fourteen-period timetable, query/empty/loading/retry, own-account privacy, literal labels, desktop/mobile, source menus/logout. Source contrast reported; no new serious/critical axe issues.');
}finally{await browser.close();}
