import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';

// Synthetic component only: all external destinations and every API are blocked.
process.umask(0o077);
const origin=process.env.STUDENT_LOAN_QA_ORIGIN||'http://127.0.0.1:5185';
assert.equal(origin,'http://127.0.0.1:5185','Use the separately owned local QA server only.');
const directory='artifacts/student-loan-workspace',owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',stamp='2030-01-01T00:00:00Z';
const record={id:'20000000-0000-4000-8000-000000000001',userId:owner,sourceMode:'local_demo',version:1,createdAt:stamp,updatedAt:stamp,currentTermLabel:'合成學年 一學期',currentApplicationState:'not_applied',currentApplicationText:null,progressText:null,historyCount:0,historyText:null};
const source=JSON.parse(await readFile('artifacts/source-student-loan/index.json','utf8'));
const controls=JSON.parse(await readFile('artifacts/source-student-loan/controls.json','utf8'));
const actions=JSON.parse(await readFile('artifacts/source-student-loan/action-geometry.json','utf8'));
const modal=JSON.parse(await readFile('artifacts/source-student-loan/modal-geometry.json','utf8'));
const brand=JSON.parse(await readFile('artifacts/source-student-loan/brand-geometry.json','utf8'));
assert.deepEqual(source.viewport,{devicePixelRatio:2,height:1399,width:1533});
const response=await fetch(origin+'/src/main.tsx',{signal:AbortSignal.timeout(10000)});assert.equal(response.status,200);
const served=await response.text();
function optimized(file){const match=served.match(new RegExp('"(/node_modules/\\.vite/deps/'+file.replaceAll('.','\\.')+'\\?v=[a-f0-9]+)"'));assert.ok(match,'Served shared React import '+file);return match[1];}
const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic student loan QA</title></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/@vite/client');
const {default:React}=await import(${JSON.stringify(optimized('react.js'))});const {createRoot}=(await import(${JSON.stringify(optimized('react-dom_client.js'))})).default;const {MemoryRouter}=await import(${JSON.stringify(optimized('react-router.js'))});
await import('/src/index.css');const {StudentLoan}=await import('/src/features/public/affairs/StudentLoan.tsx');
function Fixture(){const [state,setState]=React.useState(window.loanInitial);window.loanUpdate=patch=>setState(prior=>({...prior,...patch}));return React.createElement(StudentLoan,{...state,onReload:()=>{window.loanReloads=(window.loanReloads||0)+1;},onLogout:()=>{window.loanLogouts=(window.loanLogouts||0)+1;},onInformation:()=>{window.loanInformation=(window.loanInformation||0)+1;},onNavigate:(view,options)=>{window.loanNavigation.push({view,options});setState(prior=>({...prior,view}));}});}
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(Fixture)));
</script></body></html>`;
let browser,page;const errors=[],blocked=[],geometry={},contrast=[],checks=[];
const near=(actual,expected,label,tolerance=.65)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} vs source ${expected}`);
async function settle(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function focused(selector){await page.waitForFunction(value=>document.querySelector(value)===document.activeElement,selector);}
async function update(patch){await page.evaluate(value=>window.loanUpdate(value),patch);await settle();}
async function measure(selector){return page.locator(selector).evaluateAll(nodes=>nodes.map(node=>{const s=getComputedStyle(node);return {rect:node.getBoundingClientRect().toJSON(),font:s.font,color:s.color,background:s.backgroundColor,border:s.border,padding:s.padding,margin:s.margin,shadow:s.boxShadow};}));}
async function compare(selector,expected,label=selector){const actual=(await measure(selector))[0];assert.ok(actual,label);geometry[label]=actual;for(const key of ['x','y','width','height'])near(actual.rect[key],expected.rect[key],label+' '+key);return actual;}
async function contain(label){await settle();const result=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(result.scroll<=result.width,label+' '+JSON.stringify(result));const dialog=page.locator('.student-loan-dialog');if(await dialog.count()){const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=result.width,label+' modal containment');}checks.push(label);}
async function accessibility(label){
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze(),unexpected=[];
  for(const item of result.violations.filter(item=>['serious','critical'].includes(item.impact)))for(const node of item.nodes){
    const finding={label,id:item.id,target:node.target};
    if(item.id==='color-contrast'){
      const styles=await page.locator(node.target[0]).evaluate(element=>{
        const color=getComputedStyle(element).color,background=getComputedStyle(element).backgroundColor;
        const allowed=[
          ['.student-loan-brand>span','rgb(255, 255, 255)','.student-loan-brand','rgb(124, 124, 124)'],
          ['.student-loan-menu','rgb(255, 255, 255)','.student-loan-nav','rgb(67, 142, 185)'],
          ['.student-loan-breadcrumb a','rgb(76, 143, 189)','.student-loan-breadcrumb','rgb(245, 245, 245)'],
          ['.student-loan-heading small','rgb(153, 153, 153)','.student-loan-main','rgb(255, 255, 255)'],
          ['.student-loan-actions>a,.student-loan-actions>button','rgb(128, 144, 154)',null,'rgb(255, 255, 255)'],
          ['.student-loan-footer','rgb(71, 143, 202)','.student-loan','rgb(239, 239, 240)'],
          ['.student-loan-ok','rgb(255, 255, 255)',null,'rgb(66, 139, 202)'],
        ].some(([selector,foreground,parent,back])=>element.matches(selector)&&color===foreground&&getComputedStyle(parent?element.closest(parent):element).backgroundColor===back);
        return {color,background,allowed};
      });
      if(!styles.allowed)unexpected.push({...finding,...styles});
      else contrast.push({...finding,...styles,sourceNote:'Scoped legacy source palette; this run reports contrast and makes no WCAG-conformance claim.'});
    }else unexpected.push(finding);
  }
  assert.deepEqual(unexpected,[],label+' serious/critical non-contrast findings');
}
try{
  await mkdir(directory,{recursive:true,mode:0o700});
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const context=await browser.newContext({viewport:{width:1533,height:1399},locale:'zh-TW',timezoneId:'Asia/Taipei',reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addInitScript(value=>{window.loanInitial=value;window.loanNavigation=[];},{userId:owner,view:'index',data:{status:'loaded',record},copyrightYear:2030});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin||url.pathname.startsWith('/api/')){blocked.push(url.origin+url.pathname);return route.abort();}if(url.pathname==='/__student-loan-qa')return route.fulfill({contentType:'text/html',body:html});return route.continue();});
  page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));page.setDefaultTimeout(10000);
  await page.goto(origin+'/__student-loan-qa',{waitUntil:'networkidle',timeout:30000});await page.locator('.student-loan-actions').waitFor();await page.evaluate(()=>document.fonts.ready);await settle();
  await compare('.student-loan-shell',{rect:{x:206.5,y:0,width:1120,height:262.796875}});
  await compare('.student-loan-brand',{rect:{x:206.5,y:0,width:1120,height:34}});
  await compare('.student-loan-brand-first',brand.ancestors[0]);await compare('.student-loan-brand img',brand.logo);
  await compare('.student-loan-nav',source.metrics.find(row=>row.className==='navbar navbar-default'));
  await compare('.student-loan-breadcrumb',{rect:{x:206.5,y:79,width:1120,height:31}});
  for(const index of [1,2])await compare(`.student-loan-breadcrumb li:nth-child(${index}) a`,brand.breadcrumb[index].link);
  await compare('.student-loan-main',source.metrics.find(row=>row.className==='page-content'));
  await compare('.student-loan-heading',source.metrics.find(row=>row.className==='page-header'));
  await compare('.student-loan-heading h1',source.metrics.find(row=>row.tag==='H4'));
  for(const [selector,index] of [['.student-loan-action-row',3],['.student-loan-action-column',2],['.student-loan-actions',1]])await compare(selector,actions[index]);
  const buttons=await measure('.student-loan-actions>*'),expected=controls.elements.filter(row=>row.className==='btn btn-white btn-default');assert.equal(buttons.length,4);
  geometry.buttons=buttons;for(const [index,button]of buttons.entries())for(const key of ['x','y','width','height'])near(button.rect[key],expected[index].rect[key],'action'+index+' '+key);
  await compare('.student-loan-footer',controls.elements.find(row=>row.className==='footer-content hidden-sm hidden-xs'));
  await contain('1533 index');await accessibility('1533 index');await page.mouse.move(0,0);await page.screenshot({path:directory+'/index-1533.jpg',type:'jpeg',quality:55});
  await page.getByRole('link',{name:'1.查詢當期就學貸款進度',exact:true}).click();await page.getByRole('dialog').waitFor();await settle();
  await compare('.student-loan-dialog',modal.find(row=>row.className==='modal-content'));
  assert.equal(await page.locator('.student-loan-overlay').evaluate(node=>getComputedStyle(node).backgroundColor),'rgba(0, 0, 0, 0.5)');
  await compare('.student-loan-dialog-footer',modal.find(row=>row.className==='modal-footer'));
  const ok=await compare('.student-loan-ok',modal.find(row=>row.className==='btn btn-primary'));
  assert.equal(ok.border,'5px solid rgb(66, 139, 202)');assert.equal(ok.font,modal[0].font);assert.equal((await measure('.student-loan-dialog'))[0].shadow,'none');
  assert.equal(await page.locator('.student-loan-notice').textContent(),'本學期合成學年 一學期，尚未申請就學貸款。');
  await contain('1533 modal');await accessibility('1533 modal');await page.screenshot({path:directory+'/modal-1533.jpg',type:'jpeg',quality:55});
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});await focused('.student-loan-actions>a:first-child');
  const doc=page.getByRole('link',{name:'2.列印當期就學貸款資料',exact:true});assert.equal(await doc.getAttribute('target'),'_blank');assert.match(await doc.getAttribute('href'),/^\/school-affairs\/services\/21-1\/document$/);
  await doc.click();await page.getByRole('dialog').waitFor();assert.deepEqual(await page.evaluate(()=>window.loanNavigation.at(-1)),{view:'document',options:{newTab:true}});assert.equal(context.pages().length,1,'Controlled callback only; no PDF or official page opened');await page.getByRole('button',{name:'OK',exact:true}).click();
  await page.getByRole('button',{name:'3.就學貸款資訊專區',exact:true}).click();assert.equal(await page.evaluate(()=>window.loanInformation),1);
  await update({view:'history',data:{status:'loaded',record:{...record,historyText:''}}});assert.equal(await page.locator('.student-loan-notice').textContent(),'');
  await update({data:{status:'loaded',record:{...record,historyCount:null,historyText:null}}});assert.equal(await page.locator('.student-loan-notice').textContent(),'目前無法提供歷史申請記錄。');
  await update({data:{status:'loaded',record:{...record,historyCount:2,historyText:'PRIVATE SYNTHETIC LITERAL <script>no()</script>'}}});assert.equal(await page.locator('.student-loan-notice script,table,iframe,a[download]').count(),0);
  await update({userId:other});assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE SYNTHETIC|尚未申請|目前沒有歷史/);assert.equal(await page.locator('.student-loan-notice').textContent(),'目前無法確認站內就學貸款紀錄。');
  await update({userId:owner,view:'index',data:{status:'unavailable'}});await page.getByRole('button',{name:'重新載入',exact:true}).click();assert.equal(await page.evaluate(()=>window.loanReloads),1);
  await update({data:{status:'loading'}});assert.match(await page.getByRole('status').innerText(),/載入/);await update({data:{status:'loaded',record},error:'PRIVATE provider exception'});assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE provider/);assert.ok(await page.getByRole('alert').count());
  await update({error:null,data:{status:'loaded',record:{...record,currentApplicationState:'unknown',historyCount:null}}});assert.match(await page.getByRole('status').innerText(),/無法確認當期/);
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});await update({view:'index',data:{status:'loaded',record}});await contain(width+' index');
    await page.getByRole('button',{name:'Index',exact:true}).click();assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['Index','登出']);await page.keyboard.press('Escape');await focused('.student-loan-menu');
    await page.getByRole('link',{name:'4.歷年申請記錄(0)',exact:true}).click();await page.getByRole('dialog').waitFor();await contain(width+' modal');assert.equal(await page.locator('.student-loan-notice').textContent(),'目前沒有歷史申請記錄');
    await page.getByRole('button',{name:'OK',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});await focused('.student-loan-actions>a:last-child');
    await accessibility(width+' index');if(width===390)await page.screenshot({path:directory+'/index-390.jpg',type:'jpeg',quality:55});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  await Promise.all(['failure.json','failure.jpg'].map(name=>unlink(directory+'/'+name).catch(error=>{if(error.code!=='ENOENT')throw error;})));
  await writeFile(directory+'/result.json',JSON.stringify({status:'passed',syntheticOnly:true,geometry,checks,sourcePaletteContrastFindings:contrast,seriousCriticalNonContrastFindings:0,privacyAndLiteralStates:true,modalEscapeAndFocus:true,newTabCallbackOnly:true,apiCalls:0,externalRequests:0},null,2)+'\n',{mode:0o600});
  console.log('StudentLoan synthetic UI PASS: source1533 frame/actions/modal,390/320 containment, literal/unknown/privacy states, local callbacks, keyboard focus and no serious non-contrast accessibility findings.');
}catch(error){await writeFile(directory+'/failure.json',JSON.stringify({error:String(error),errors,blocked,geometry},null,2)+'\n',{mode:0o600}).catch(()=>{});await page?.screenshot({path:directory+'/failure.jpg',type:'jpeg',quality:45}).catch(()=>{});throw error;}finally{await browser?.close();}
