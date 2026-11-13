import assert from 'node:assert/strict';
import {mkdir,stat,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

// Local isolated components and synthetic clients only. No auth, database, model or source-school requests.
process.umask(0o077);
const origin=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184';assert.ok(['http://127.0.0.1:5184','http://localhost:5184'].includes(origin));
const output='artifacts/tuition-documents-workspace',owner='10000000-0000-4000-8000-000000000001',manager='10000000-0000-4000-8000-000000000002';
const initial={mode:'student',view:'summer',userId:owner,records:{periods:[],settlements:[],documents:[],documentMetadata:[]},fail:false};
const response=await fetch(origin+'/src/main.tsx');assert.equal(response.status,200);const main=await response.text();
function modulePath(name){const match=main.match(new RegExp('"(/node_modules/\\.vite/deps/'+name.replaceAll('.','\\.')+'\\?v=[a-f0-9]+)"'));assert.ok(match,'Shared served module '+name);return match[1];}
const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic tuition verification</title></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/@vite/client');
const {default:React}=await import(${JSON.stringify(modulePath('react.js'))});const {createRoot}=(await import(${JSON.stringify(modulePath('react-dom_client.js'))})).default;const {MemoryRouter}=await import(${JSON.stringify(modulePath('react-router.js'))});await import('/src/index.css');
const {TuitionDocumentsWorkspace}=await import('/src/features/public/affairs/TuitionDocumentsWorkspace.tsx');const {TuitionDocumentsManager}=await import('/src/features/public/affairs/TuitionDocumentsManager.tsx');
const copy=value=>structuredClone(value);window.calls=[];window.writes=[];
const client={load:async(userId,signal)=>{window.calls.push(userId);if(window.fixture.fail)throw new Error('Synthetic unavailable');signal?.throwIfAborted();const {documentMetadata,...data}=window.fixture.records;return copy(data);},
loadAdmin:async(managerId,userId,signal)=>{window.calls.push(userId);signal?.throwIfAborted();return copy(window.fixture.records);},manage:async(managerId,action)=>{window.writes.push(copy(action));const p=action.payload,date='2026-01-01T00:00:00Z';if(action.kind==='save_tuition_settlement'){const row={id:p.id,userId:p.user_id,periodId:p.id,periodLabel:p.period_label,text:p.statement_text,rowOrder:p.row_order,version:p.expected_version+1,sourceMode:'local_demo',createdAt:date,updatedAt:date};window.fixture.records={periods:[{id:row.id,userId:row.userId,label:row.periodLabel}],settlements:[row],documents:[],documentMetadata:[]};}return {id:p.id,kind:action.kind,version:p.expected_version+1,summary:'Synthetic saved receipt'};}};
function Fixture(){const [state,setState]=React.useState(window.fixture);window.updateTuition=patch=>{window.fixture={...window.fixture,...patch};setState(window.fixture);};const content=state.mode==='manager'?React.createElement(TuitionDocumentsManager,{managerId:${JSON.stringify(manager)},userId:state.userId,client}):React.createElement(TuitionDocumentsWorkspace,{userId:state.userId,view:state.view,onLogout:()=>{window.logoutCalls=(window.logoutCalls||0)+1;},client});return content;}
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(Fixture)));
</script></body></html>`;
let browser,page;const errors=[],unexpected=[],geometry={},checks=[];let imageBytes=0;
async function settled(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function update(patch){await page.evaluate(value=>window.updateTuition(value),patch);await settled();}
async function contained(label){await settled();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' document overflow');}
async function capture(name){const path=output+'/'+name+'.jpg';await page.screenshot({path,type:'jpeg',quality:32});imageBytes+=(await stat(path)).size;assert.ok(imageBytes<200000);}
try{
  await mkdir(output,{recursive:true,mode:0o700});browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const context=await browser.newContext({viewport:{width:2133,height:1200},locale:'zh-TW',reducedMotion:'reduce'});await context.addInitScript(value=>{window.fixture=value;},initial);
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin&&!url.pathname.startsWith('/api/'))return route.continue();unexpected.push(url.origin+url.pathname);return route.abort();});
  await context.route(origin+'/__tuition-workspace-qa',route=>route.fulfill({contentType:'text/html',body:html}));
  page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/__tuition-workspace-qa');await page.locator('.tuition-main[aria-busy="false"]').waitFor();await page.evaluate(()=>document.fonts.ready);await settled();
  for(const view of ['summer','settlement','evening','extended']){
    await update({view});await page.locator('.tuition-main[aria-busy="false"]').waitFor();
    geometry[view]=await page.locator('.tuition-shell,.tuition-brand,.tuition-nav,.tuition-breadcrumb,.tuition-main').evaluateAll(nodes=>nodes.map(node=>({selector:'.'+node.className,rect:node.getBoundingClientRect().toJSON(),font:getComputedStyle(node).font,padding:getComputedStyle(node).padding})));
    const [shell,brand,nav,breadcrumb,content]=geometry[view];assert.equal(shell.rect.width,1120);assert.equal(shell.rect.x,(2133-1120)/2);assert.equal(brand.rect.height,34);assert.equal(nav.rect.height,45);assert.equal(breadcrumb.rect.height,31);assert.equal(content.padding,'8px 20px 24px');await contained(view+'2133');
    if(['summer','evening'].includes(view))assert.equal(await page.locator('.tuition-print-button').isDisabled(),true);
  }checks.push('source-known-1120-shell-34-45-31-and-padding');
  await update({view:'summer'});await page.locator('.tuition-main[aria-busy="false"]').waitFor();await capture('summer-2133');
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});for(const view of ['summer','settlement','evening','extended']){await update({view});await page.locator('.tuition-main[aria-busy="false"]').waitFor();await contained(view+width);}
    await page.getByRole('button',{name:'Index',exact:true}).click();assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['Index','Logout']);await page.keyboard.press('Escape');await page.getByRole('menu').waitFor({state:'hidden'});await contained('menu'+width);
  }checks.push('four-views-390-320-contained-and-menu-escape');
  await page.setViewportSize({width:390,height:844});await update({view:'settlement'});await page.locator('.tuition-main[aria-busy="false"]').waitFor();assert.equal(await page.getByRole('combobox').isDisabled(),true);await capture('settlement-empty-390');
  await page.getByRole('button',{name:/查詢條件輸入/}).click();assert.equal(await page.getByRole('button',{name:/查詢條件輸入/}).getAttribute('aria-expanded'),'false');checks.push('empty-query-and-disclosure');
  await update({mode:'manager'});await page.getByRole('button',{name:'Save tuition settlement'}).waitFor();await page.getByLabel('Period label',{exact:true}).fill('Synthetic saved period');await page.getByRole('button',{name:'Save tuition settlement'}).click();await page.getByText('Local tuition record saved. No file or payment was created.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.writes[0].payload.statement_text),null);
  await page.setViewportSize({width:320,height:844});await contained('manager320');checks.push('manager-null-save-and-320-containment');
  await update({mode:'student',view:'settlement'});await page.locator('.tuition-main[aria-busy="false"]').waitFor();const periodId=await page.evaluate(()=>window.fixture.records.periods[0].id);await page.getByRole('combobox').selectOption(periodId);await page.getByRole('main').getByRole('button',{name:'查詢',exact:true}).click();await page.getByRole('region',{name:'站內結算紀錄'}).waitFor();assert.equal(await page.getByRole('region',{name:'站內結算紀錄'}).innerText(),'—');
  await update({fail:true});await page.getByRole('main').getByRole('button',{name:'查詢',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('region',{name:'站內結算紀錄'}).count(),0);await update({fail:false});await page.getByRole('button',{name:'重新載入',exact:true}).click();await page.getByRole('region',{name:'站內結算紀錄'}).waitFor();checks.push('fresh-query-null-error-and-retry');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  await writeFile(output+'/result.json',JSON.stringify({status:'passed',checks,geometry,imageBytes,apiCalls:0,errors,unexpected,sourceComparison:'Known CSS metrics only: source captures were zoomed 60% with roughly 2133 CSS pixels, not 1280. No full screenshot pixel equivalence or accessibility conformance claimed.'},null,2),{mode:0o600});console.log(JSON.stringify({status:'passed',checks:checks.length,imageBytes,output}));
}finally{await browser?.close();}
