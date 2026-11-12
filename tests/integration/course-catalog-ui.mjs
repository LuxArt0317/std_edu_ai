import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {newCourseOffering,courseCatalogColumns} from '../../src/features/public/affairs/courseCatalogModel.js';
import {newCourseSyllabus} from '../../src/features/public/affairs/courseSyllabusModel.js';
import {normalizeCourseOffering} from '../../server/courseCatalog.js';

const base=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'This suite uses local synthetic fixtures only.');
const origin=new URL(base).origin,path='/school-affairs/services/12-4',output='artifacts/course-catalog';
const syllabus={...newCourseSyllabus(),level:'大學部',language:'中文',teaching_mode:'課堂教學',objectives:'Synthetic catalog syllabus learning objectives.',materials:'Synthetic local lecture notes.',references:'Synthetic reference list.',advice:'Prepare the local sample exercises before class.',grading:[{weight:20,methods:['1','2']},{weight:30,methods:['4']},{weight:30,methods:['3']},{weight:20,methods:['15']}],capabilities:[10,5,10,10,15,10,10,5,5,5,5,10],meanings:[11,26],sdgs:[4],weeks:Array.from({length:18},(_,index)=>({date:new Date(Date.UTC(2026,8,7+index*7)).toISOString().slice(0,10),content:`Synthetic week ${index+1} lesson`,notes:'Local fixture'}))};
const one={...newCourseOffering(),id:randomUUID(),version:1,published:true,course_code:'UI-DEMO-101',course_name:'Synthetic catalog course Alpha',english_name:'Synthetic Alpha',term_code:'1151',term_label:'115學年度上學期',department_code:'01',department_name:'資訊管理系',classification_code:'IMU',classification_name:'資訊管理系',admission_code:'1',admission_name:'四技日間部',instructor:'示範教師甲',grade:'一',required:true,credits:3,capacity:60,lecture_hours:3,course_nature:'半',room1:'DEMO-101',program_codes:['PU031'],meetings:[{weekday:1,periods:['1','2']}],syllabus};
const two={...one,id:randomUUID(),course_code:'UI-DEMO-202',course_name:'Synthetic catalog course Beta',department_code:'02',department_name:'企業管理系',instructor:'示範教師乙',credits:2,required:false,syllabus:newCourseSyllabus()};
const rows=[one,two],reads=[],writes=[],errors=[],unexpected=[],geometry={};
let browser,phase='setup';
function close(actual,expected,label,tolerance=2) {assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: expected ${expected}, received ${actual}`);}
async function checkLayout(page,label) {
  const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('main,form,fieldset,select,input,textarea,.catalog-filter-columns,.catalog-filter-columns>div')].map(element=>({tag:element.tagName,class:element.className,width:element.getBoundingClientRect().width,right:element.getBoundingClientRect().right})).filter(row=>row.right>innerWidth+1)}));
  if(layout.scroll>layout.width+1)await page.screenshot({path:output+'/overflow-failure.png',fullPage:true});
  assert.ok(layout.scroll<=layout.width+1,label+' page overflow '+JSON.stringify(layout));
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  assert.deepEqual(axe.violations.filter(row=>['critical','serious'].includes(row.impact)).map(row=>({id:row.id,nodes:row.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})),[],label+' accessibility');
}
async function contextFor(admin=false) {
  const context=await browser.newContext({viewport:{width:1280,height:900},locale:'zh-TW',reducedMotion:'reduce'});
  // All non-local traffic is intercepted or blocked. No real OAuth, API or database write can escape.
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin&&!url.pathname.startsWith('/api/'))return route.continue();
    unexpected.push(url.origin+url.pathname);return route.abort();
  });
  await mockAffairsAuth(context);
  let failRead=!admin,failSave=true,releaseSave;
  await context.route('**/api/affairs-data*',route=>{
    const query=new URL(route.request().url()).searchParams;
    assert.equal(query.get('scope'),'catalog');assert.match(route.request().headers().authorization||'',/^Bearer /);
    reads.push(Object.fromEntries(query));
    if(failRead){failRead=false;return route.fulfill({status:503,json:{error:'Synthetic catalog read failed. Please retry.'}});}
    let found=query.has('id')?rows.filter(row=>row.id===query.get('id')):query.get('keyword')==='no-match'?[]:query.get('keyword')==='filter-check'?[one]:rows;
    if(query.get('sort')==='credits')found=[...found].sort((a,b)=>(a.credits-b.credits)*(query.get('direction')==='desc'?-1:1));
    return route.fulfill({json:{rows:found,total:found.length,can_manage:admin,page:0,page_size:100,terms:[{value:'1151',label:'115學年度上學期'}]}});
  });
  await context.route('**/api/affairs-manage',async route=>{
    assert.equal(admin,true,'Students must never show mutation controls.');
    const action=route.request().postDataJSON();writes.push(action);
    assert.equal(action.kind,'save_course_offering');assert.match(action.payload.request_id,/^[0-9a-f-]{36}$/);
    normalizeCourseOffering(action.payload.record);
    if(failSave){failSave=false;return route.fulfill({status:503,json:{error:'Synthetic save failed. Retry the same form.'}});}
    await new Promise(resolve=>{releaseSave=resolve;});
    const index=rows.findIndex(row=>row.id===action.payload.id);assert.ok(index>=0);
    assert.equal(action.payload.expected_version,rows[index].version);
    rows[index]={...action.payload.record,id:action.payload.id,version:rows[index].version+1};
    return route.fulfill({json:{id:action.payload.id,version:rows[index].version,kind:action.kind}});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  return {context,page,release:()=>{assert.equal(typeof releaseSave,'function');releaseSave();}};
}
try {
  await mkdir(output,{recursive:true});
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const {context,page}=await contextFor();
  phase='catalog read error and source geometry';
  await page.goto(base+path);await page.getByRole('alert').getByText('Synthetic catalog read failed. Please retry.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'重試',exact:true}).click();await page.getByRole('link',{name:one.course_code,exact:true}).waitFor();
  assert.equal(await page.getByText('管理本地範例課程',{exact:true}).count(),0);
  const banner=await page.locator('.catalog-heading>img').boundingBox();
  close(banner.x,55.75,'source banner x');close(banner.y,5,'source banner y');close(banner.width,1168.5,'source banner width');close(banner.height,130,'source banner height');
  const filters=await page.locator('.catalog-filters').boundingBox();close(filters.x,55.75,'source filter x');close(filters.width,1168.5,'source filter width');
  assert.deepEqual(await page.locator('.catalog-table th button').allTextContents(),courseCatalogColumns.map(([,label])=>label));
  geometry.catalog={banner,filters};
  await checkLayout(page,'catalog 1280');await page.screenshot({path:output+'/catalog-1280.png',fullPage:true});

  phase='all filter controls';
  await page.getByLabel('選擇開課單位Department',{exact:true}).selectOption('01');
  await page.getByLabel('課程類別代碼',{exact:true}).fill('IMU');
  await page.getByLabel('開課學制Class Title',{exact:true}).selectOption('1');
  await page.getByLabel('學分數Credit',{exact:true}).selectOption('3');await page.getByLabel('開課年級Grade',{exact:true}).selectOption('一');
  await page.getByLabel('學分學程Program',{exact:true}).selectOption('PU031');
  await page.getByRole('checkbox',{name:'星期一',exact:true}).check();await page.getByRole('checkbox',{name:'1',exact:true}).check();
  for(const [name,value] of [['required','true'],['e_course','false'],['english_taught','true'],['foreign_language','false'],['immersion','false']])await page.locator(`input[type=radio][name=${name}][value=${value}]`).check();
  await page.getByLabel('課程關鍵字',{exact:true}).fill('filter-check');await page.getByLabel('授課教師',{exact:true}).fill('示範教師甲');
  const before=reads.length;await page.getByRole('button',{name:'查詢 Search',exact:true}).click();await page.getByText('計1 筆課程資料',{exact:true}).waitFor();
  assert.ok(reads.length>before);assert.deepEqual(reads.at(-1),{yr:'1151',dep:'01',ref1:'IMU',admissionType:'1',credit:'3',grd:'一',prog:'PU031',required:'true',e_course:'false',english_taught:'true',foreign_language:'false',immersion:'false',keyword:'filter-check',instructor:'示範教師甲',weekdays:'1',periods:'1',scope:'catalog'});
  await page.getByLabel('課程關鍵字',{exact:true}).fill('no-match');await page.getByRole('button',{name:'查詢 Search',exact:true}).click();await page.getByRole('cell',{name:'目前沒有符合查詢條件的課程。',exact:true}).waitFor();
  await page.getByRole('button',{name:'重設',exact:true}).click();await page.getByText('計2 筆課程資料',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('選擇開課單位Department',{exact:true}).inputValue(),'0');assert.equal(await page.getByRole('checkbox',{name:'星期一',exact:true}).isChecked(),false);
  await page.getByRole('button',{name:'學分數',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.catalog-table tbody tr td:nth-child(2)')?.textContent==='UI-DEMO-202');
  assert.equal(reads.at(-1).sort,'credits');assert.equal(reads.at(-1).direction,'asc');

  phase='distinct detail and syllabus routes';
  await page.getByRole('link',{name:one.course_name,exact:true}).click();await page.getByText('課程資訊',{exact:true}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('course'),one.id);assert.equal(await page.locator('.course-syllabus').count(),0);
  await page.getByRole('link',{name:'回上頁',exact:true}).click();await page.getByRole('link',{name:one.course_code,exact:true}).click();
  await page.getByRole('heading',{name:'樹德科技大學 課程大綱',exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('syllabus'),one.id);
  assert.equal(await page.locator('.catalog-detail').count(),0);assert.equal(await page.locator('.syllabus-grading tbody tr').count(),4);
  assert.equal(await page.locator('.syllabus-capabilities thead th').count(),13);assert.equal(await page.locator('.syllabus-meanings input[type=checkbox]').count(),26);
  assert.equal(await page.locator('.syllabus-sdgs input[type=checkbox]').count(),17);assert.equal(await page.locator('.syllabus-weeks tbody tr').count(),18);
  const identity=await page.locator('.syllabus-identity').boundingBox(),objectives=await page.locator('.syllabus-objectives').boundingBox();
  close(identity.x,55.75,'syllabus source x');close(identity.y,67.4,'syllabus source y');close(identity.width,1168.5,'syllabus source width');close(identity.height,136.2,'syllabus source height');close(objectives.y,222.8,'objectives source y');
  assert.equal(await page.locator('.course-syllabus').evaluate(element=>getComputedStyle(element).fontSize),'12px');
  geometry.syllabus={identity,objectives};await checkLayout(page,'syllabus 1280');await page.screenshot({path:output+'/syllabus-1280.png',fullPage:true});
  await page.reload();await page.getByText('Synthetic catalog syllabus learning objectives.',{exact:true}).waitFor();
  for(const destination of [path,path+'?course='+one.id,path+'?syllabus='+one.id]) {
    await page.setViewportSize({width:320,height:900});await page.goto(base+destination);if(destination.includes('syllabus='))await page.getByText('Synthetic catalog syllabus learning objectives.',{exact:true}).waitFor();else if(destination.includes('course='))await page.getByText('課程資訊',{exact:true}).waitFor();else await page.getByRole('link',{name:one.course_code,exact:true}).waitFor();
    await checkLayout(page,'mobile '+destination);await page.screenshot({path:output+'/'+(destination.includes('syllabus')?'syllabus':destination.includes('course=')?'detail':'catalog')+'-320.png',fullPage:true});
  }
  assert.equal(writes.length,0,'Student views never issue a manager mutation.');await context.close();

  phase='admin save error and stable retry';
  const admin=await contextFor(true);await admin.page.goto(base+path);await admin.page.getByText('管理本地範例課程',{exact:true}).click();
  await admin.page.getByLabel('選擇本頁課程',{exact:false}).selectOption(one.id);await admin.page.getByLabel('課程名稱',{exact:true}).fill('Synthetic edited catalog course');
  await admin.page.getByLabel('學分學程代碼（逗號分隔）',{exact:true}).fill('PU031,PU001');
  await admin.page.getByText('課程大綱資料',{exact:true}).click();await admin.page.getByLabel('教學目標 (綱要)',{exact:true}).fill('Updated synthetic syllabus objectives.');
  await admin.page.setViewportSize({width:320,height:900});await checkLayout(admin.page,'admin 320');
  await admin.page.getByRole('button',{name:'儲存課程',exact:true}).click();await admin.page.getByRole('alert').getByText('Synthetic save failed. Retry the same form.',{exact:true}).waitFor();
  await admin.page.getByRole('button',{name:'儲存課程',exact:true}).click();await admin.page.getByRole('button',{name:'儲存中…',exact:true}).waitFor();
  assert.equal(await admin.page.getByRole('button',{name:'儲存中…',exact:true}).isDisabled(),true);assert.equal(writes.length,2);
  assert.equal(writes[0].payload.request_id,writes[1].payload.request_id);assert.equal(writes[1].payload.expected_version,1);
  assert.deepEqual(writes[1].payload.record.program_codes,['PU031','PU001']);assert.equal(writes[1].payload.record.syllabus.objectives,'Updated synthetic syllabus objectives.');
  admin.release();await admin.page.getByRole('link',{name:'Synthetic edited catalog course',exact:true}).waitFor();
  await admin.page.getByRole('link',{name:one.course_code,exact:true}).click();await admin.page.getByText('Updated synthetic syllabus objectives.',{exact:true}).waitFor();
  await admin.page.reload();await admin.page.getByText('Updated synthetic syllabus objectives.',{exact:true}).waitFor();
  await admin.context.close();assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  await writeFile(output+'/ui-result.json',JSON.stringify({passed:true,geometry,readRequests:reads.length,mockedSaveAttempts:writes.length,externalRequests:unexpected.length},null,2));
  console.log('Catalog UI passed: source geometry, every filter control, sorting/reset/empty/error states, distinct info/syllabus routes, 320px layouts, admin error/retry persistence, and zero external requests.');
} catch(error) {console.error(phase+': '+error.message);process.exitCode=1;}
finally {await browser?.close();}
