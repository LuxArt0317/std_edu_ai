import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';

// An isolated component render. No app mounts, user sessions or API writes.
process.umask(0o077);
const base=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const directory='artifacts/dtm-assignment-detail-ui',source=JSON.parse(await readFile('artifacts/visual-parity/dtm-assignment-layout.json','utf8'));
const mainResponse=await fetch(base+'/src/main.tsx');assert.equal(mainResponse.status,200);const servedMain=await mainResponse.text();
function optimizedModule(file){const match=servedMain.match(new RegExp('"(/node_modules/\\.vite/deps/'+file.replaceAll('.','\\.')+'\\?v=[a-f0-9]+)"'));assert.ok(match,'Live optimized import '+file);return match[1];}
const reactModule=optimizedModule('react.js'),domModule=optimizedModule('react-dom_client.js');
const report={id:'synthetic-assignment',userId:'synthetic-owner',courseId:'synthetic-course',title:'合成作業詳細資料',
  submissionStatusText:'合成繳交狀態',gradingStatusText:'合成評分狀態',gradingAppearance:'ungraded',
  dueAt:'2024-02-29T16:00:00Z',timingText:'合成時間狀態',timingAppearance:'late',modifiedAt:'2024-03-01T01:00:00Z',
  submittedFiles:[{filename:'synthetic-assignment.pdf',href:'/dtm/private-files/synthetic-file'}],excellentWorkText:'',canEditSubmission:true};
const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic assignment detail verification</title>
<style>body{margin:0;background:#ecf0f1}main{margin-top:166px;margin-left:calc(20px + (100vw - 40px)*.25641);width:calc((100vw - 40px)*.74359)}@media(max-width:600px){main{margin:12px;width:calc(100% - 24px)}}</style></head><body><main aria-label="合成作業驗證"><div id="root"></div></main><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/@vite/client');
const {default:React}=await import(${JSON.stringify(reactModule)});const {createRoot}=(await import(${JSON.stringify(domModule)})).default;
await import('/src/index.css');const {DtmAssignmentDetail}=await import('/src/features/public/dtm/DtmAssignmentDetail.tsx');
function Fixture(){const [state,setState]=React.useState(window.initialAssignment);window.updateAssignment=patch=>setState(prior=>({...prior,...patch}));return React.createElement(DtmAssignmentDetail,{...state,onEdit:async id=>{window.editedAssignment=id;},onReload:()=>{window.reloads=(window.reloads||0)+1;}});}
createRoot(document.getElementById('root')).render(React.createElement(Fixture));</script></body></html>`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const geometry={},failures=[],sourceContrast=[],errors=[];let apiRequests=0;
const near=(value,expected,label,tolerance=.1)=>{if(Math.abs(value-expected)>tolerance)failures.push(`${label}: ${value} versus source ${expected}`);};
try{
  await mkdir(directory,{recursive:true,mode:0o700});
  const context=await browser.newContext({viewport:{width:1533,height:900},locale:'zh-TW',timezoneId:'Asia/Taipei'});
  await context.addInitScript(value=>{window.initialAssignment=value;},{userId:'synthetic-owner',courseId:'synthetic-course',report,approvedPrivateFileHrefs:['/dtm/private-files/synthetic-file']});
  await context.route(base+'/__dtm-assignment-detail-qa',route=>route.fulfill({contentType:'text/html',body:html}));
  await context.route('**/api/**',route=>{apiRequests++;return route.abort();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
  await page.goto(base+'/__dtm-assignment-detail-qa');await page.getByRole('table').waitFor();await page.evaluate(()=>document.fonts.ready);
  for(const [local,original] of [['.dtm-assignment-detail','#region-main'],['.dtm-assignment-detail>h2','#region-main h2'],['.dtm-assignment-submission>h3','#region-main h3'],['.dtm-assignment-status-table','#region-main .generaltable'],['.dtm-assignment-action','#region-main .submissionaction'],['.dtm-assignment-action>button','#region-main .singlebutton input']]){
    const actual=await page.locator(local).evaluate(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {x:r.x,y:r.y,width:r.width,height:r.height,fontSize:s.fontSize,lineHeight:s.lineHeight};});
    geometry[local]=actual;const expected=source.items.find(group=>group.selector===original).items[0].rect;
    for(const key of ['x','y','width','height'])near(actual[key],expected[key],local+' '+key);
  }
  assert.equal(geometry['.dtm-assignment-detail>h2'].fontSize,'28px');assert.equal(geometry['.dtm-assignment-detail>h2'].lineHeight,'40px');
  assert.equal(geometry['.dtm-assignment-submission>h3'].fontSize,'24px');assert.equal(geometry['.dtm-assignment-submission>h3'].lineHeight,'40px');
  const panelStyle=await page.locator('.dtm-assignment-detail').evaluate(node=>{const style=getComputedStyle(node);return {shadow:style.boxShadow,margin:style.margin};});
  assert.deepEqual(panelStyle,{shadow:'rgba(0, 0, 0, 0.05) 2px 2px 2px 0px',margin:'0px 0px 20px'});
  const spacer=await page.locator('.dtm-assignment-content-start').evaluate(node=>{const r=node.getBoundingClientRect(),style=getComputedStyle(node);return {x:r.x,y:r.y,width:r.width,height:r.height,display:style.display,margin:style.margin,padding:style.padding};});
  near(spacer.x,413.828125,'content spacer x');near(spacer.y,177,'content spacer y');near(spacer.width,1088.171875,'content spacer width');
  assert.deepEqual({height:spacer.height,display:spacer.display,margin:spacer.margin,padding:spacer.padding},{height:1,display:'block',margin:'0px',padding:'0px'});
  const cells=await page.locator('.dtm-assignment-status-table tr:first-child>*').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {width:r.width,padding:s.padding,fontSize:s.fontSize,lineHeight:s.lineHeight,borderTop:s.borderTop,borderRightWidth:s.borderRightWidth};}));
  near(cells[0].width,326.4453125,'label width');near(cells[1].width,761.7265625,'value width');
  for(const cell of cells){assert.equal(cell.padding,'8px');assert.equal(cell.fontSize,'14px');assert.equal(cell.lineHeight,'20px');assert.equal(cell.borderTop,'1px solid rgb(221, 221, 221)');assert.equal(cell.borderRightWidth,'0px');}
  assert.deepEqual(await page.locator('th').allTextContents(),['繳交狀態','評分狀態','規定繳交時間','剩餘時間','最後修改','提交檔案','優秀作品']);
  assert.equal(await page.locator('a').getAttribute('href'),'/dtm/private-files/synthetic-file');
  assert.equal(await page.locator('.dtm-assignment-files img').evaluate(node=>node.complete&&node.naturalWidth===16),true);
  const icon=await page.locator('.dtm-assignment-files img').evaluate(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {x:r.x,y:r.y,width:r.width,height:r.height,display:s.display,padding:s.padding,margin:s.margin,verticalAlign:s.verticalAlign};});
  near(icon.x,766.2734375,'PDF icon x');near(icon.y,489.5,'PDF icon y',1.5);
  assert.deepEqual({width:icon.width,height:icon.height,display:icon.display,padding:icon.padding,margin:icon.margin,verticalAlign:icon.verticalAlign},{width:22,height:16,display:'inline',padding:'0px 6px 0px 0px',margin:'0px',verticalAlign:'text-bottom'});
  const asset=await context.request.get(base+'/school-assets/6f345b4f0cef28e7086d.png');assert.equal(asset.status(),200);assert.match(asset.headers()['content-type'],/^image\/png/);
  const assetBytes=await asset.body();assert.equal(assetBytes.length,589);assert.deepEqual([...assetBytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(await page.locator('.dtm-assignment-ungraded').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(239, 239, 239)');
  assert.equal(await page.locator('.dtm-assignment-late').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(239, 207, 207)');
  await page.getByRole('button',{name:'修改我已繳交的作業'}).click();assert.equal(await page.evaluate(()=>window.editedAssignment),report.id);
  await page.screenshot({path:directory+'/desktop.png',fullPage:true});
  for(const width of [1533,390,320]){
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No viewport overflow at '+width);
    if(width<600){const scroll=page.getByRole('region',{name:'作業繳交狀態，可左右捲動'});assert.ok(await scroll.evaluate(node=>node.scrollWidth>node.clientWidth));await scroll.focus();await page.keyboard.press('ArrowRight');}
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    for(const violation of result.violations.filter(item=>['serious','critical'].includes(item.impact)))for(const node of violation.nodes){
      const inherited=violation.id==='color-contrast'&&node.target.length===1&&await page.locator(node.target[0]).evaluate(element=>{const style=getComputedStyle(element);return element.matches('.dtm-assignment-action>button')&&style.backgroundColor==='rgb(50, 136, 250)'&&style.color==='rgb(255, 255, 255)';});
      if(inherited)sourceContrast.push({width,id:violation.id,target:node.target});else failures.push(`${width} axe ${violation.id}: ${node.target.join(', ')}`);
    }
    if(width===390)await page.screenshot({path:directory+'/mobile.png',fullPage:true});
  }
  await page.evaluate(()=>window.updateAssignment({report:{...window.initialAssignment.report,submissionStatusText:null,gradingStatusText:null,gradingAppearance:null,dueAt:null,timingText:null,timingAppearance:null,modifiedAt:null,submittedFiles:null,excellentWorkText:null,canEditSubmission:null}}));
  await page.waitForFunction(()=>[...document.querySelectorAll('td')].every(node=>node.textContent==='—'));
  assert.equal(await page.getByRole('button',{name:'修改我已繳交的作業'}).count(),0);
  await page.evaluate(()=>window.updateAssignment({userId:'another-owner'}));await page.getByText('目前沒有可顯示的作業繳交資料。').waitFor();assert.equal(await page.getByRole('table').count(),0);
  assert.ok(await page.locator('.dtm-assignment-detail').evaluate(node=>node.getBoundingClientRect().height<200),'No-report panel stays collapsed');
  await page.evaluate(()=>window.updateAssignment({busy:true}));await page.getByText('載入作業繳交資料中…').waitFor();
  await page.evaluate(()=>window.updateAssignment({busy:false,error:'Synthetic read failure'}));await page.getByRole('button',{name:'重新載入'}).click();assert.equal(await page.evaluate(()=>window.reloads),1);
  assert.equal(apiRequests,0);assert.deepEqual(errors,[]);
  await writeFile(directory+'/result.json',JSON.stringify({passed:failures.length===0,geometry,failures,sourceContrast,apiRequests,errors},null,2)+'\n');
  assert.deepEqual(failures,[]);console.log('Assignment detail isolated render passed: source geometry, seven rows, explicit unknown states, private links, own-account filtering, callback/retry, 1533/390/320 containment; only measured source button contrast accepted. No API calls.');
}catch(error){if(errors.length)console.error('Component page errors:',errors);throw error;}finally{await browser.close();}
