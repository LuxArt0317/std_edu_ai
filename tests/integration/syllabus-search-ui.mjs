import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';

// Unmounted component, synthetic public offering rows only; all nonlocal/API traffic is denied.
const origin=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184';
const url=new URL(origin);assert.ok(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/'&&!url.search&&!url.hash&&!url.username&&!url.password,'Use a local Vite origin only.');
const output='artifacts/syllabus-search-ui',path='/__syllabus-search-ui',errors=[],unexpected=[],geometry={},sourceContrast=[];
const rows=Array.from({length:5},(_,index)=>({id:`synthetic-${index}`,course_code:`DEMO-00${index+1}`,course_name:`合成課程${index+1}`,academicYearText:'130',semesterText:'1',admission_name:'合成學制',instructor:'合成教師'}));
const initial={terms:[{value:'term-a',label:'合成第一學期'},{value:'term-b',label:'合成第二學期'}],departments:[{value:'demo',label:'合成系所'}],result:{scope:'current',total:0,rows:[]},busy:false,error:null};
const hash=JSON.parse(await readFile('node_modules/.vite/deps/_metadata.json','utf8')).browserHash;
const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic syllabus search</title></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/@vite/client');
const {default:React}=await import('/node_modules/.vite/deps/react.js?v=${hash}');const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js?v=${hash}')).default;
await import('/src/index.css');const {SyllabusSearch}=await import('/src/features/public/affairs/SyllabusSearch.tsx');
function Fixture(){const [state,setState]=React.useState(window.syllabusInitial);window.syllabusUpdate=patch=>setState(prior=>({...prior,...patch}));return React.createElement(SyllabusSearch,{...state,onSearch:filters=>{window.syllabusQueries.push(filters);setState(prior=>({...prior,busy:true,error:null}));},onRetry:()=>{window.syllabusRetries++;setState(prior=>({...prior,busy:true,error:null}));},onOpenDetail:row=>window.syllabusDetails.push(row.id)});}
createRoot(document.getElementById('root')).render(React.createElement(Fixture));</script></body></html>`;
const near=(actual,expected,label,tolerance=.7)=>assert.ok(Math.abs(actual-expected)<tolerance,`${label}: ${actual} vs ${expected}`);
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  await context.addInitScript(value=>{window.syllabusInitial=value;window.syllabusQueries=[];window.syllabusDetails=[];window.syllabusRetries=0;},initial);
  await context.route('**/*',async route=>{
    const request=route.request(),target=new URL(request.url());
    if(target.origin!==origin||request.method()!=='GET'||target.pathname.startsWith('/api/')){unexpected.push({origin:target.origin,path:target.pathname,method:request.method()});return route.abort();}
    if(target.pathname===path)return route.fulfill({contentType:'text/html',body:html});
    return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  const update=async value=>{await page.evaluate(patch=>window.syllabusUpdate(patch),value);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
  const containment=async label=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' body overflow');
  const accessibility=async label=>{
    const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze(),failures=[];
    for(const violation of results.violations.filter(item=>['serious','critical'].includes(item.impact)))for(const node of violation.nodes){
      const inherited=violation.id==='color-contrast'&&node.target.length===1&&await page.locator(node.target[0]).evaluate(element=>element.matches('.syllabus-search-results caption>span')&&getComputedStyle(element).color==='rgb(136, 191, 185)'||element.matches('.syllabus-search-actions>button')&&getComputedStyle(element).color==='rgb(233, 233, 233)');
      (inherited?sourceContrast:failures).push({label,id:violation.id,target:node.target});
    }
    assert.deepEqual(failures,[],label+' unexpected serious/critical accessibility defects');
  };
  await page.goto(origin+path);await page.getByText('當期課綱查詢結果計0筆',{exact:true}).waitFor();
  for(const [selector,expected] of [['.syllabus-search-doc',{x:159,y:12,width:962}],['.syllabus-search-header',{x:160,y:8,width:960,height:125}],['.syllabus-search-content',{x:160,y:133,width:960}],['.syllabus-search-title',{x:184,y:135.398,width:912,height:42}],['.syllabus-search-form',{x:422.5,y:215.398,width:435,height:737}],['.syllabus-search-themes',{x:433.375,y:381.609,width:413.25,height:422.844}],['.syllabus-search-results table',{x:229.602,y:1010.453,width:820.797,height:101.63}]]){
    const actual=await page.locator(selector).boundingBox();assert.ok(actual);geometry[selector]=actual;for(const [key,value]of Object.entries(expected))near(actual[key],value,selector+' '+key);
  }
  const themeHeaders=await page.locator('.syllabus-search-themes th').evaluateAll(nodes=>nodes.map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,font:getComputedStyle(node).fontSize,line:getComputedStyle(node).lineHeight,background:getComputedStyle(node).backgroundColor,border:getComputedStyle(node).borderColor})));
  for(let index=0;index<4;index++){near(themeHeaders[index].width,[45.796875,160.3203125,45.796875,160.3359375][index],'theme column '+index);near(themeHeaders[index].height,32.2421875,'theme header height');assert.equal(themeHeaders[index].font,'14.004px');assert.equal(themeHeaders[index].line,'17.2389px');assert.equal(themeHeaders[index].background,'rgb(85, 85, 85)');assert.equal(themeHeaders[index].border,'rgb(70, 62, 65)');}
  geometry.themeHeaders=themeHeaders;assert.equal(await page.locator('.syllabus-search-brand img').evaluate(node=>node.getBoundingClientRect().width),45);assert.equal(await page.locator('.syllabus-search-results caption>span').evaluate(node=>getComputedStyle(node).fontWeight),'400');
  assert.equal(await page.locator('.syllabus-search').evaluate(node=>getComputedStyle(node).fontSize),'12px');assert.equal(await page.getByRole('checkbox').count(),26);
  await containment('desktop');await accessibility('desktop');await mkdir(output,{recursive:true});await page.screenshot({path:output+'/empty-1280.png',fullPage:true});
  await page.getByLabel('關鍵字',{exact:true}).fill('synthetic keyword');await page.getByLabel('歷年課程',{exact:true}).check();await page.getByLabel('學年學期',{exact:true}).selectOption('term-b');await page.getByLabel('系所',{exact:true}).selectOption('demo');await page.getByLabel('服務學習',{exact:true}).check();await page.getByLabel('資訊素養',{exact:true}).check();
  await page.getByRole('button',{name:'查詢',exact:true}).click();await page.getByText('查詢中…',{exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'查詢',exact:true}).isDisabled());
  assert.deepEqual(await page.evaluate(()=>window.syllabusQueries),[{keyword:'synthetic keyword',scope:'historical',term:'term-b',department:'demo',themes:['1','26']}]);
  await update({busy:false,error:'合成查詢失敗'});await page.getByRole('button',{name:'重試'}).click();assert.equal(await page.evaluate(()=>window.syllabusRetries),1);assert.equal(await page.getByLabel('關鍵字',{exact:true}).inputValue(),'synthetic keyword');
  await update({busy:false,error:null,result:{scope:'historical',total:5,rows}});await page.getByText('歷史課綱查詢結果計5筆',{exact:true}).waitFor();assert.equal(await page.locator('.syllabus-search-results tbody tr').count(),5);
  await page.getByRole('button',{name:'課號',exact:true}).click();await page.getByRole('button',{name:'課號',exact:true}).click();assert.deepEqual(await page.locator('.syllabus-search-results tbody tr td:first-child').allTextContents(),['5','4','3','2','1']);assert.equal(await page.getByRole('columnheader',{name:'課號',exact:true}).getAttribute('aria-sort'),'descending');
  await page.screenshot({path:output+'/results-1280.png',fullPage:true});
  await page.getByRole('button',{name:'合成課程1：DEMO-001，開啟課程大綱',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.syllabusDetails),['synthetic-0']);
  await page.getByRole('button',{name:'清除',exact:true}).click();assert.equal(await page.getByLabel('關鍵字',{exact:true}).inputValue(),'');assert.ok(await page.getByLabel('當期課程',{exact:true}).isChecked());await page.getByText('歷史課綱查詢結果計5筆',{exact:true}).waitFor();
  await page.getByRole('button',{name:'收合查詢條件'}).click();assert.equal(await page.getByLabel('關鍵字',{exact:true}).isVisible(),false);await page.getByRole('button',{name:'展開查詢條件'}).click();
  await update({result:{scope:'current',total:12,rows}});await page.getByText('符合條件共 12 筆，但僅載入 5 筆；結果尚未完整，請縮小查詢條件後重新查詢。',{exact:true}).waitFor();
  assert.ok(await page.getByRole('button',{name:'課號',exact:true}).isDisabled());
  await update({result:{scope:'historical',total:1,rows:[{...rows[0],course_name:'長'.repeat(160),instructor:'師'.repeat(160)}]}});
  for(const width of [390,320]){await page.setViewportSize({width,height:900});await containment(String(width));assert.ok((await page.getByLabel('系所',{exact:true}).boundingBox()).width>0);const caption=await page.locator('.syllabus-search-results caption>span').boundingBox();assert.ok(caption.x+caption.width<=width,'mobile caption stays visible');await accessibility(String(width));await page.screenshot({path:output+'/results-'+width+'.png',fullPage:true});}
  await update({result:null});await page.getByText('請設定條件後查詢。',{exact:true}).waitFor();assert.equal(await page.getByText('查無資料',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);await context.close();
  await writeFile(output+'/result.json',JSON.stringify({passed:true,geometry,sourceContrast,checks:9,apiRequests:0,externalRequests:0},null,2));
  console.log('Syllabus search UI: 9 synthetic checks passed; source geometry, all filters, retry, local details, complete-only sorting, explicit coverage, collapse/reset, 320/390px containment; zero API/external requests.');
}catch(error){
  const page=browser?.contexts()[0]?.pages()[0];
  if(page){console.error(await page.locator('.syllabus-search-form,.syllabus-search-field,.syllabus-search-themes,.syllabus-search-note,.syllabus-search-actions,.syllabus-search-results table').evaluateAll(nodes=>nodes.map(node=>({selector:node.className,rect:node.getBoundingClientRect().toJSON()}))));await mkdir(output,{recursive:true});await page.screenshot({path:output+'/diagnostic.png',fullPage:true});}
  throw error;
}finally{await browser?.close();}
