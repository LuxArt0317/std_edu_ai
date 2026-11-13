import assert from 'node:assert/strict';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from 'playwright-core';

// Synthetic component clients only. The caller owns and stops the dedicated Vite5185 process.
process.umask(0o077);
const origin=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5185';
assert.equal(origin,'http://127.0.0.1:5185','Only the dedicated local conduct QA server is permitted.');
const output='artifacts/student-conduct-workspace',owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const geometryToleranceCssPx=0.75;
const source=JSON.parse(await readFile('artifacts/source-conduct/metrics.json','utf8'));
const form=JSON.parse(await readFile('artifacts/source-conduct/form-metrics.json','utf8'));
const table=JSON.parse(await readFile('artifacts/source-conduct/table-metrics.json','utf8'));
const response=await fetch(origin+'/src/main.tsx',{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(10000)});
assert.equal(response.status,200);const main=await response.text();
function modulePath(name){const match=main.match(new RegExp('"(/node_modules/\\.vite/deps/'+name.replaceAll('.','\\.')+'\\?v=[a-f0-9]+)"'));assert.ok(match,'Served shared module '+name);return match[1];}
const row={id:'20000000-0000-4000-8000-000000000001',userId:owner,sourceMode:'local_demo',version:1,createdAt:'2030-01-01T00:00:00Z',updatedAt:'2030-01-01T00:00:00Z',rowOrder:0,
  occurredOnText:null,studentNumber:'SYNTHETIC-ROW',studentName:'Synthetic Row',academicYearText:'001',semesterText:'',yearLevelText:null,
  reasonText:'Synthetic literal reason '+('長文字'.repeat(18)),conductCode:'LOCAL',conductName:'Synthetic local record',quantityText:'0',voidStatusText:''};
const initial={userId:owner,identity:{userId:owner,studentNumber:'SYNTHETIC',studentName:'合成學生'},identityLoading:false,identityError:null,records:{records:[]},fail:false,mountKey:0};
const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic conduct verification</title></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/@vite/client');
const {default:React}=await import(${JSON.stringify(modulePath('react.js'))});const {createRoot}=(await import(${JSON.stringify(modulePath('react-dom_client.js'))})).default;const {MemoryRouter}=await import(${JSON.stringify(modulePath('react-router.js'))});await import('/src/index.css');
const {StudentConductWorkspace}=await import('/src/features/public/affairs/StudentConductWorkspace.tsx');
window.calls=[];window.identityReloads=0;const client={load:async(userId,signal)=>{window.calls.push(userId);await new Promise(resolve=>setTimeout(resolve,20));signal?.throwIfAborted();if(window.fixture.fail)throw new Error('PRIVATE SYNTHETIC PROVIDER FAILURE');return structuredClone(window.fixture.records);}};
function Fixture(){const [state,setState]=React.useState(window.fixture);window.updateConduct=patch=>{window.fixture={...window.fixture,...patch};setState(window.fixture);};return React.createElement(StudentConductWorkspace,{key:state.mountKey,userId:state.userId,identity:state.identity,identityLoading:state.identityLoading,identityError:state.identityError,client,onReloadIdentity:()=>{window.identityReloads++;window.updateConduct({identityLoading:false,identityError:null,identity:{userId:state.userId,studentNumber:'SYNTHETIC',studentName:'合成學生'}});}});}
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(Fixture)));
</script></body></html>`;
const comparisons=[
  ['shell','.student-conduct-shell',source.elements.find(node=>node.id==='doc')],
  ['banner','.student-conduct-banner',form.find(node=>node.className==='banner')],
  ['heading','.student-conduct-heading',form.find(node=>node.className==='pghead')],
  ['title','.student-conduct-heading>h1',form.find(node=>node.tag==='H2')],
  ['container','.student-conduct-container',table.ancestors.find(node=>node.id==='container')],
  ['content','.student-conduct-content',source.elements.find(node=>node.id==='content')],
  ['query','.student-conduct-query',form.find(node=>node.id==='idata')],
  ['form','.student-conduct-form',form.find(node=>node.id==='form1')],
  ['identity','.student-conduct-identity',form.find(node=>node.tag==='P')],
  ['studentNumber','.student-conduct-number',form.find(node=>node.id==='stuCode')],
  ['studentName','.student-conduct-name',form.find(node=>node.id==='stuCname')],
  ['confirm','.student-conduct-confirm',form.find(node=>node.className==='confirm')],
  ['download','.student-conduct-download',source.elements.find(node=>node.id==='btnReport')],
  ['separator','.student-conduct-form>hr',form.find(node=>node.tag==='HR')],
  ['instructions','.student-conduct-instructions',form.find(node=>node.id==='pgmsg')],
  ['data','.student-conduct-data',table.ancestors.find(node=>node.id==='vdata')],
  ['table','.student-conduct-table',table.ancestors.find(node=>node.tag==='TABLE')],
];
let browser,page,imageBytes=0;const errors=[],unexpected=[],checks=[],geometry=[],discrepancies=[],a11y=[];
async function settled(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function update(patch){await page.evaluate(value=>window.updateConduct(value),patch);await settled();}
async function ready(){await page.locator('.student-conduct-content[aria-busy="false"]').waitFor();await settled();}
async function contained(label){await settled();const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width+1,label+' document overflow: '+JSON.stringify(size));}
async function capture(name){const path=output+'/'+name+'.jpg';await page.screenshot({path,type:'jpeg',quality:30});imageBytes+=(await stat(path)).size;assert.ok(imageBytes<250000,'Synthetic image budget');}
async function accessibility(label){
  await page.addScriptTag({content:await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'),'utf8')});
  const violations=await page.evaluate(async()=>{const result=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return result.violations.filter(value=>['serious','critical'].includes(value.impact)).map(value=>({id:value.id,nodes:value.nodes.map(node=>({target:node.target,summary:node.failureSummary}))}));});
  for(const violation of violations){for(const node of violation.nodes){const inherited=violation.id==='color-contrast'&&node.target.every(selector=>selector==='.student-conduct-back-top > a');a11y.push({label,id:violation.id,...node,sourceInherited:inherited});if(!inherited)discrepancies.push({type:'accessibility',label,id:violation.id,...node});}}
}
try{
  await mkdir(output,{recursive:true,mode:0o700});browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:2,locale:'zh-TW',reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addInitScript(value=>{window.fixture=value;},initial);
  await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(request.method()==='GET'&&url.origin===origin&&!url.pathname.startsWith('/api/'))return route.continue();unexpected.push(request.method()+' '+url.origin+url.pathname);return route.abort();});
  await context.route(origin+'/__conduct-workspace-qa',route=>route.fulfill({contentType:'text/html',body:html}));
  page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/__conduct-workspace-qa');await ready();await page.evaluate(()=>document.fonts.ready);await settled();
  for(const [name,selector,evidence] of comparisons){assert.ok(evidence,'Captured source '+name);const actual=await page.locator(selector).evaluate(node=>{const style=getComputedStyle(node);return {rect:node.getBoundingClientRect().toJSON(),font:style.font,padding:style.padding,background:style.backgroundColor,color:style.color};});
    const deltas=Object.fromEntries(['x','y','width','height'].map(key=>[key,actual.rect[key]-evidence.rect[key]]));geometry.push({name,actual,expected:evidence.rect,deltas});for(const [key,delta] of Object.entries(deltas))if(Math.abs(delta)>geometryToleranceCssPx)discrepancies.push({type:'geometry',name,axis:key,actual:actual.rect[key],expected:evidence.rect[key],delta});
  }
  const headers=await page.locator('thead th').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,rect:node.getBoundingClientRect().toJSON(),font:getComputedStyle(node).font,background:getComputedStyle(node).backgroundColor})));
  assert.deepEqual(headers.map(node=>node.text),table.headers.map(node=>node.text));assert.equal(headers.length,12);
  for(let index=0;index<headers.length;index++){const actual=headers[index],expected=table.headers[index];assert.equal(actual.background,'rgb(85, 85, 85)');for(const key of ['x','y','width','height'])if(Math.abs(actual.rect[key]-expected.rect[key])>geometryToleranceCssPx)discrepancies.push({type:'header-geometry',index,axis:key,actual:actual.rect[key],expected:expected.rect[key],delta:actual.rect[key]-expected.rect[key]});}
  geometry.push({name:'headers',actual:headers});assert.equal(await page.locator('tbody tr').count(),0);assert.equal(await page.getByRole('textbox',{name:'學號',exact:true}).getAttribute('readonly'),'');
  assert.equal(await page.getByRole('textbox',{name:'姓名',exact:true}).getAttribute('readonly'),'');assert.equal(await page.locator('.student-conduct-download').isDisabled(),true);
  await contained('desktop1280');await capture('empty-1280');await accessibility('empty1280');checks.push('desktop-source-geometry-compared-12-exact-headers-readonly-identity-disabled-download');
  await update({records:{records:[row]},mountKey:1});await ready();assert.equal(await page.locator('tbody tr').count(),1);const cells=await page.locator('tbody td').allTextContents();assert.equal(cells.length,12);assert.equal(cells[0],'—');assert.equal(cells[4],'');assert.equal(cells[9],'0');assert.equal(await page.locator('.student-conduct-view').isDisabled(),true);
  assert.equal(await page.locator('a[download],iframe,object,input[type="file"]').count(),0);checks.push('literal-null-blank-zero-rows-and-unverified-detail-disabled');
  for(const width of [390,320]){await page.setViewportSize({width,height:844});await contained('rows'+width);const scroll=page.getByRole('region',{name:'獎懲紀錄表，可水平捲動'});await scroll.focus();assert.equal(await scroll.evaluate(node=>node===document.activeElement),true);
    assert.ok(await scroll.evaluate(node=>node.scrollWidth>node.clientWidth));await page.keyboard.press('ArrowRight');await settled();assert.ok(await scroll.evaluate(node=>node.scrollLeft>0));await contained('scrolled'+width);if(width===390)await capture('rows-390');await accessibility('rows'+width);}
  checks.push('390-and320-document-containment-horizontal-table-and-keyboard-scroll');
  await update({identity:null,identityLoading:true});assert.match(await page.getByRole('status').innerText(),/載入/);assert.equal(await page.locator('tbody tr').count(),0);
  await update({identityLoading:false,identityError:'Synthetic identity load failed'});await page.getByRole('alert').waitFor();const before=await page.evaluate(()=>window.calls.length);await page.getByRole('button',{name:'重新載入',exact:true}).click();await ready();assert.equal(await page.evaluate(()=>window.identityReloads),1);assert.equal(await page.evaluate(()=>window.calls.length),before+1);assert.equal(await page.locator('tbody tr').count(),1);checks.push('identity-loading-error-retry-reloads-both-independent-sources');
  await update({fail:true,mountKey:2});await ready();await page.getByRole('alert').waitFor();assert.equal(await page.locator('tbody tr').count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE SYNTHETIC PROVIDER FAILURE/);
  await update({fail:false});await page.getByRole('button',{name:'重新載入',exact:true}).click();await ready();assert.equal(await page.locator('tbody tr').count(),1);checks.push('record-error-sanitized-and-recoverable');
  await update({records:{records:[{...row,userId:other,reasonText:'FOREIGN PRIVATE ROW'}]},mountKey:3});await ready();await page.getByRole('alert').waitFor();assert.equal(await page.locator('tbody tr').count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/FOREIGN PRIVATE ROW|目前沒有獎懲紀錄/);checks.push('foreign-response-fails-closed-without-false-empty');
  await update({records:{records:[]},mountKey:4});await ready();await contained('empty320');await capture('empty-320');assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
}catch(error){errors.push(error instanceof Error?error.message:String(error));process.exitCode=1;}
finally{
  await browser?.close();const status=errors.length?'failed':discrepancies.length?'discrepancies':'passed';if(status!=='passed')process.exitCode=1;
  await writeFile(output+'/result.json',JSON.stringify({status,checks,geometryToleranceCssPx,viewport:{width:1280,height:720,deviceScaleFactor:2},geometry,discrepancies,a11y,imageBytes,apiCalls:0,unexpected,errors,
    limitations:['Source nonempty rows, sorting, issued certificates and detail contents were not observed.','Six inert sort indicators approximate the missing source bg.gif asset.','The local footer identifies stu.best and is deliberately excluded from official-footer equivalence.','Source-preserved top-link contrast is reported separately.']},null,2),{mode:0o600});
  console.log(JSON.stringify({status,checks:checks.length,discrepancies:discrepancies.length,imageBytes,output,browserClosed:true}));
}
