import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {newCourseOffering} from '../../src/features/public/affairs/courseCatalogModel.js';
import {newCourseSyllabus} from '../../src/features/public/affairs/courseSyllabusModel.js';
import {normalizeCourseOffering} from '../../server/courseCatalog.js';

const origin=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184',target=new URL(origin);
assert.ok(target.protocol==='http:'&&['127.0.0.1','localhost'].includes(target.hostname)&&target.pathname==='/'&&!target.search&&!target.hash&&!target.username&&!target.password,'Synthetic local origin only.');
const path='/school-affairs/services/12-3',output='artifacts/syllabus-search-workspace',unexpected=[],errors=[],checks=[];
const id=index=>'20000000-0000-4000-8000-'+String(index).padStart(12,'0');
const rows=Array.from({length:101},(_,i)=>({id:id(i+1),sequence:i+1,course_code:'LOCAL-'+String(i+1).padStart(4,'0'),course_name:'Synthetic local syllabus '+(i+1),admission_name:'Synthetic program',instructor:'Synthetic instructor',academicYearText:'130',semesterText:'0'}));
let offering={...newCourseOffering(),id:id(1),version:1,published:true,course_code:rows[0].course_code,course_name:rows[0].course_name,instructor:rows[0].instructor,term_code:'T1',term_label:'Synthetic term',department_code:'DEMO',department_name:'Synthetic department',classification_code:'LOCAL',admission_code:'LOCAL',admission_name:'Synthetic program',syllabus:newCourseSyllabus(),syllabus_is_current:null,academic_year_text:null,semester_text:null};
let browser,activePage,phase='setup';
async function contextFor(admin=false){
  const context=await browser.newContext({viewport:{width:1280,height:720},locale:'zh-TW',reducedMotion:'reduce'});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===target.origin&&!url.pathname.startsWith('/api/'))return route.continue();unexpected.push(url.origin+url.pathname);return route.abort();});
  await mockAffairsAuth(context);let failSearch=true,failWrite=true;const reads=[],writes=[];
  await context.route('**/api/affairs-conversations',route=>{assert.equal(route.request().method(),'GET','The host assistant may only load its empty synthetic conversation index.');return route.fulfill({json:{conversations:[]}});});
  await context.route('**/api/affairs-data*',route=>{
    const query=new URL(route.request().url()).searchParams,scope=query.get('scope');reads.push(Object.fromEntries(query));assert.match(route.request().headers().authorization||'',/^Bearer /);
    if(scope==='syllabus-options')return route.fulfill({json:{terms:[{value:'T1',label:'Synthetic term'}],departments:[{value:'DEMO',label:'Synthetic department'}]}});
    if(scope==='syllabus-search'){
      const keyword=query.get('keyword'),page=Number(query.get('page'));assert.equal(query.get('page_size'),'100');assert.equal(query.get('sort'),'sequence');
      if(keyword==='failure'&&failSearch){failSearch=false;return route.fulfill({status:503,json:{error:'Synthetic read failure'}});}
      const total=keyword==='too-broad'?1001:keyword==='empty'?0:rows.length;
      return route.fulfill({json:{scope:query.get('search_scope'),total,rows:total?rows.slice(page*100,(page+1)*100):[],page,pageSize:100,hasMore:(page+1)*100<total,revision:(keyword==='changed'&&page===1?'b':'a').repeat(32),sort:{key:'sequence',direction:'asc'}}});
    }
    if(scope==='syllabus-detail'){
      const {syllabus_is_current:_current,academic_year_text:_year,semester_text:_semester,...detail}=offering;
      return route.fulfill({json:{row:query.get('id')===id(1)?detail:null}});
    }
    if(scope==='catalog')return route.fulfill({json:{rows:[offering],total:1,can_manage:admin,page:0,page_size:100,terms:[{value:'T1',label:'Synthetic term'}]}});
    unexpected.push('api-data:'+scope);return route.abort();
  });
  await context.route('**/api/affairs-manage',route=>{
    assert.equal(admin,true,'Student never mutates.');const action=route.request().postDataJSON();writes.push(action);
    assert.match(action.payload.request_id,/^[0-9a-f-]{36}$/);assert.equal(action.payload.id,offering.id);assert.equal(action.payload.expected_version,offering.version);
    if(action.kind==='syllabus-metadata'){
      assert.deepEqual(Object.keys(action.payload).sort(),['id','request_id','expected_version','syllabus_is_current','academic_year_text','semester_text'].sort());
      if(failWrite){failWrite=false;return route.fulfill({status:503,json:{error:'Synthetic lost response'}});}
      offering={...offering,syllabus_is_current:action.payload.syllabus_is_current,academic_year_text:action.payload.academic_year_text,semester_text:action.payload.semester_text,version:offering.version+1};
      return route.fulfill({json:{id:offering.id,version:offering.version,kind:'save_syllabus_search_metadata',summary:'Saved local metadata'}});
    }
    assert.equal(action.kind,'save_course_offering');offering={...offering,...normalizeCourseOffering(action.payload.record),version:offering.version+1};
    return route.fulfill({json:{id:offering.id,version:offering.version,kind:action.kind}});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));return {context,page,reads,writes};
}
async function contained(page,label){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('main,section,form,fieldset,table,select,input,button,header,footer,div')].map(element=>({tag:element.tagName,class:element.className,right:element.getBoundingClientRect().right,width:element.getBoundingClientRect().width})).filter(item=>item.right>innerWidth+1&&item.width>0).slice(0,12)}));assert.ok(geometry.scroll<=geometry.width,label+' must remain within viewport '+JSON.stringify(geometry));}
try{
  await mkdir(output,{recursive:true});browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const student=await contextFor();const {page,reads}=student;activePage=page;
  phase='actual catalog entry and complete drain';await page.goto(origin+'/school-affairs/menu/aca/query');await page.locator('[data-program-id="12-3"]').click();await page.getByText('請設定條件後查詢。',{exact:true}).waitFor();assert.equal(reads.some(read=>read.scope==='syllabus-search'),false);
  await page.getByLabel('關鍵字',{exact:true}).fill('literal & 字');await page.getByLabel('歷年課程',{exact:true}).check();await page.getByLabel('學年學期',{exact:true}).selectOption('T1');await page.getByLabel('系所',{exact:true}).selectOption('DEMO');await page.getByLabel('程式設計',{exact:true}).check();await page.getByRole('button',{name:'查詢',exact:true}).click();
  await page.getByText('歷史課綱查詢結果計101筆',{exact:true}).waitFor();assert.equal(await page.locator('.syllabus-search-results tbody tr').count(),101);assert.deepEqual(reads.filter(read=>read.scope==='syllabus-search').map(read=>read.page),['0','1']);assert.equal(new URL(page.url()).searchParams.get('keyword'),'literal & 字');assert.equal(await page.getByText('管理本地範例課程',{exact:true}).count(),0);checks.push('portal-entry-complete-drain');
  phase='published detail and back';await page.getByRole('button',{name:rows[0].course_name+'：'+rows[0].course_code+'，開啟課程大綱',exact:true}).click();await page.getByRole('heading',{name:'樹德科技大學 課程大綱',exact:true}).waitFor();assert.equal(await page.locator('.syllabus-weeks tbody tr').count(),18);assert.equal(reads.at(-1).scope,'syllabus-detail');await page.getByRole('link',{name:'回上頁',exact:true}).click();await page.getByText('歷史課綱查詢結果計101筆',{exact:true}).waitFor();assert.equal(await page.getByLabel('關鍵字',{exact:true}).inputValue(),'literal & 字');assert.equal(await page.getByLabel('程式設計',{exact:true}).isChecked(),true);checks.push('local-detail-back-filters');
  phase='retry and complete-only failures';await page.getByLabel('關鍵字',{exact:true}).fill('failure');await page.getByRole('button',{name:'查詢',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('.syllabus-search-detail').count(),0);await page.getByLabel('關鍵字',{exact:true}).fill('not submitted');await page.getByRole('button',{name:'重試',exact:true}).click();await page.getByText('歷史課綱查詢結果計101筆',{exact:true}).waitFor();assert.equal(reads.filter(read=>read.scope==='syllabus-search').at(-1).keyword,'failure');
  for(const keyword of ['too-broad','changed']){await page.getByLabel('關鍵字',{exact:true}).fill(keyword);await page.getByRole('button',{name:'查詢',exact:true}).click();await page.waitForURL(url=>url.searchParams.get('keyword')===keyword);await page.getByRole('alert').filter({hasText:keyword==='too-broad'?'1000':'完整性'}).waitFor();assert.equal(await page.locator('.syllabus-search-detail').count(),0);assert.equal(await page.getByText(/查詢結果計0筆/).count(),0);}checks.push('retry-and-inconsistent-page-withholding');
  phase='mobile complete rendering';await page.getByLabel('關鍵字',{exact:true}).fill('empty');await page.getByRole('button',{name:'查詢',exact:true}).click();await page.getByText('歷史課綱查詢結果計0筆',{exact:true}).waitFor();for(const width of [390,320]){await page.setViewportSize({width,height:844});await contained(page,'syllabus '+width);}checks.push('mobile-search-containment');
  await page.goto(origin+path+'?syllabus='+id(999));await page.getByText('此課程大綱目前無法提供。',{exact:true}).waitFor();assert.equal(await page.locator('.course-syllabus').count(),0);checks.push('unavailable-detail-no-fallback');await student.context.close();
  phase='metadata manager separate receipt';const admin=await contextFor(true);activePage=admin.page;await admin.page.goto(origin+'/school-affairs/services/12-4');await admin.page.getByText('管理本地範例課程',{exact:true}).click();await admin.page.getByLabel('選擇本頁課程',{exact:false}).selectOption(id(1));
  const editor=admin.page.getByRole('region',{name:'課綱查詢設定'});assert.equal(await editor.getByLabel('當期課綱歸屬',{exact:true}).inputValue(),'');await editor.getByLabel('當期課綱歸屬',{exact:true}).selectOption('true');await editor.getByLabel('學年顯示文字未提供',{exact:true}).uncheck();await editor.getByLabel('學年顯示文字',{exact:true}).fill(' 130 ');await editor.getByLabel('學期顯示文字未提供',{exact:true}).uncheck();await editor.getByLabel('學期顯示文字',{exact:true}).fill('0');await editor.getByRole('button',{name:'儲存課綱查詢設定',exact:true}).click();await editor.getByRole('alert').waitFor();await editor.getByRole('button',{name:'儲存課綱查詢設定',exact:true}).click();await admin.page.getByText('本地範例課程已更新。',{exact:true}).waitFor();assert.deepEqual(admin.writes[0],admin.writes[1]);assert.equal(offering.syllabus_is_current,true);assert.equal(offering.academic_year_text,' 130 ');assert.equal(offering.semester_text,'0');checks.push('metadata-versioned-retry-null-literal');
  phase='legacy course edit preserves metadata';await admin.page.getByText('管理本地範例課程',{exact:true}).click();await admin.page.getByLabel('選擇本頁課程',{exact:false}).selectOption(id(1));await admin.page.getByLabel('課程名稱',{exact:true}).fill('Edited synthetic course');await admin.page.getByRole('button',{name:'儲存課程',exact:true}).click();await admin.page.getByRole('link',{name:'Edited synthetic course',exact:true}).waitFor();assert.equal(admin.writes.at(-1).kind,'save_course_offering');assert.equal(admin.writes.at(-1).payload.expected_version,2);assert.equal(offering.version,3);assert.equal(offering.academic_year_text,' 130 ');assert.equal(offering.syllabus_is_current,true);checks.push('legacy-edit-does-not-overwrite-metadata');
  phase='mobile metadata containment';await admin.page.getByText('管理本地範例課程',{exact:true}).click();await admin.page.getByLabel('選擇本頁課程',{exact:false}).selectOption(id(1));await admin.page.setViewportSize({width:320,height:844});await contained(admin.page,'metadata320');checks.push('mobile-metadata-containment');await admin.context.close();
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);await writeFile(output+'/result.json',JSON.stringify({status:'passed',checks,unexpected,errors,scope:'Local synthetic UI/API responses only; no database or real OAuth acceptance.'},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,output}));
}catch(error){console.error('Syllabus workspace UI failed during '+phase);if(activePage&&!activePage.isClosed())console.error(JSON.stringify(await activePage.evaluate(()=>({url:location.href,keyword:document.querySelector('input[aria-label="關鍵字"]')?.value,alerts:[...document.querySelectorAll('[role="alert"]')].map(node=>node.textContent),mobile:matchMedia('(max-width:700px)').matches,layout:['body','.syllabus-search','.syllabus-search-doc','.syllabus-search-content','.syllabus-search-results'].map(selector=>{const element=document.querySelector(selector);return element?{selector,rect:element.getBoundingClientRect().toJSON(),padding:getComputedStyle(element).padding,overflow:getComputedStyle(element).overflow,scroll:element.scrollWidth}:null;})}))));throw error;}finally{await browser?.close();}
