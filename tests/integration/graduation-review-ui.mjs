import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';

// Isolated production component with synthetic props. No school sessions,
// account provisioning, API writes, or shared production mounts are involved.
process.umask(0o077);
const base=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Local synthetic fixtures only.');
const directory='artifacts/graduation-review-ui',owner='graduation-owner',other='graduation-other',date='2026-11-12T10:00:00Z';
const actual=(id,extra={})=>({id,sequenceText:null,title:'合成課程 '+id,credits:2.5,requiredElectiveText:'測試',yearText:'一',transferText:null,...extra});
const requirement=(id,extra={})=>({id,sequenceText:'R-'+id,title:'合成應修課程 '+id,moduleText:null,credits:3,requiredElectiveText:'測試',yearText:'一',transferText:null,indicator:'attention',matchedCourses:[],...extra});
const category=(id,index)=>({id,label:'測試編程 '+index,requiredElectiveText:index%2?'選':'必',requiredCredits:8,completedCredits:9,matchedCredits:7,excludedCredits:0,status:{text:'儲存狀態 '+index,indicator:index===4?'passed':'attention'},requirements:[requirement(id+'-r1'),requirement(id+'-r2',{credits:0,matchedCourses:[actual('repeated-match')]})],detailSubtotalCredits:2.5});
const report={id:'report-one',userId:owner,reportKind:'academic_services',sourceMode:'local_demo',version:1,createdAt:date,updatedAt:date,reportedAt:date,
  identity:{studentNumber:'QA-GRAD-0001',studentName:'合成測試生',departmentName:'測試學系',yearText:'一',enrollmentStatusText:'站內測試',curriculumCohortText:'測試屆別',doubleMajorText:null,minorText:null},
  educationProgram:{text:'N',indicator:null},foreignLanguageCompletion:{text:'N',indicator:'attention'},englishRequirement:{text:null,indicator:null},graduationReview:{text:'儲存待確認',indicator:'attention',note:'此為合成測試說明，僅用來確認多行文字版面與未知狀態的顯示方式。'},
  languageRequirements:[{id:'language',label:'測試外語課程',status:{text:'儲存外語狀態',indicator:'attention'},requiredCredits:8,matchedCredits:0,missingCredits:null}],
  categories:Array.from({length:6},(_,index)=>category('cat-'+index,index+1)),otherCourses:[actual('repeated-match',{sequenceText:'Z-0',credits:0}),actual('unknown',{sequenceText:'Z-1',credits:null,title:'<script>literal synthetic title</script>'}),...Array.from({length:6},(_,index)=>actual('other-'+index,{sequenceText:'S-'+index}))],
};
const otherReport={...report,id:'report-other',userId:other,identity:{...report.identity,studentName:'OTHER ACCOUNT PRIVATE'},otherCourses:[actual('other-private',{title:'OTHER COURSE PRIVATE'})]};
const snapshot={checkedAt:date,officialUniversityData:false,profile:{userId:owner,email:'graduation@example.invalid',displayName:'合成測試生',role:'student'},student:null,courses:[],charges:[],assignments:[],announcements:[],tasks:[],requests:[],graduationReview:{reports:[otherReport,report]}};
const source=JSON.parse(await readFile('artifacts/visual-parity/academic-graduation-layout.json','utf8'));
const nested=JSON.parse(await readFile('artifacts/visual-parity/academic-graduation-nested-layout.json','utf8'));
const viteHash=JSON.parse(await readFile('node_modules/.vite/deps/_metadata.json','utf8')).browserHash;
const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic graduation review verification</title></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/@vite/client');
const {default:React}=await import('/node_modules/.vite/deps/react.js?v=${viteHash}');const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js?v=${viteHash}')).default;
const {MemoryRouter,useNavigate,useLocation}=await import('/node_modules/.vite/deps/react-router.js?v=${viteHash}');await import('/src/index.css');await import('/src/features/public/affairs/portal.css');const {GraduationReview}=await import('/src/features/public/affairs/GraduationReview.tsx');const h=React.createElement;
function Fixture(){const [state,setState]=React.useState(window.initialGraduationState),navigate=useNavigate(),location=useLocation();window.setGraduationState=patch=>setState(prior=>({...prior,...patch}));window.graduationLocation=location.pathname;
return h(GraduationReview,{snapshot:state.snapshot,busy:state.busy,error:state.error,onReload:()=>{window.reloadCount=(window.reloadCount||0)+1;setState(prior=>({...prior,busy:true,error:''}));},onLogout:()=>{window.logoutCount=(window.logoutCount||0)+1;navigate('/signed-out');}});}
createRoot(document.getElementById('root')).render(h(MemoryRouter,{initialEntries:['/school-affairs/services/13-1/graduation']},h(Fixture)));
</script></body></html>`;
const geometry={},geometryFailures=[],errors=[],sourceContrast=[],unexpectedAxe=[];let apiCalls=0,page;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const near=(actual,expected,label,tolerance=1.5)=>{if(Math.abs(actual-expected)>=tolerance)geometryFailures.push(`${label}: ${actual} vs source ${expected}`);};
const metric=id=>{const value=source.nodes.find(node=>node.id===id);assert.ok(value,'Missing source metric '+id);return value.rect;};
const button=name=>page.getByRole('button',{name,exact:true});
async function update(patch){await page.evaluate(value=>window.setGraduationState(value),patch);await page.evaluate(()=>new Promise(requestAnimationFrame));}
async function shot(name){await page.screenshot({path:`${directory}/${name}.png`,fullPage:true});}
async function inspect(selector){return page.locator(selector).evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return {x:r.x,y:r.y,width:r.width,height:r.height,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,padding:s.padding,color:s.color,background:s.backgroundColor,borderColor:s.borderColor,borderWidth:s.borderWidth,textAlign:s.textAlign,fontFamily:s.fontFamily};}));}
async function check(label){
  await page.evaluate(()=>Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  const size=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));assert.ok(size.document<=size.viewport,label+' page overflow '+JSON.stringify(size));
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  for(const violation of result.violations.filter(row=>['serious','critical'].includes(row.impact)))for(const node of violation.nodes){
    const inherited=violation.id==='color-contrast'&&node.target.length===1&&await page.locator(node.target[0]).evaluate(element=>{
      const style=getComputedStyle(element),brand=element.closest('.academic-grades-brand');
      return Boolean(brand&&style.color==='rgb(255, 255, 255)'&&getComputedStyle(brand).backgroundColor==='rgb(124, 124, 124)'
        ||element.matches('.graduation-review-identity th')&&style.color==='rgb(255, 255, 255)'&&style.backgroundColor==='rgb(119, 119, 119)'
        ||element.matches('.graduation-review-requirements th')&&style.color==='rgb(255, 255, 255)'&&style.backgroundColor==='rgb(46, 139, 87)'
        ||element.matches('.academic-grades-datetime')&&style.color==='rgb(145, 150, 159)'
        ||element.matches('.graduation-review-subtotal td:nth-child(2)')&&style.color==='rgb(220, 53, 69)'&&style.backgroundColor==='rgb(226, 227, 229)'&&style.fontWeight==='700');
    });
    (inherited?sourceContrast:unexpectedAxe).push({page:label,id:violation.id,target:node.target,summary:node.failureSummary});
  }
}
async function desktopGeometry(){
  const selectors=['.academic-grades-shell','.academic-grades-nav','.academic-grades-main','.graduation-review-heading','.graduation-review-heading h1','.graduation-review-graduate','.graduation-review-data-row','.graduation-review-identity','.graduation-review-language','.graduation-review-categories','.graduation-review-other'];
  for(const selector of selectors)geometry[selector]=(await inspect(selector))[0];
  const heading=source.nodes.find(node=>node.tag==='H2').rect;
  for(const dimension of ['x','y','width','height'])near(geometry['.graduation-review-heading h1'][dimension],heading[dimension],'heading '+dimension);
  const data=metric('dataDiv');for(const dimension of ['x','y','width'])near(geometry['.graduation-review-data-row'][dimension],data[dimension],'data row '+dimension);
  for(const [selector,id] of [['.graduation-review-identity','dataTable'],['.graduation-review-language','engTable'],['.graduation-review-categories','kindTable']]){const expected=metric(id);for(const dimension of ['x','y','width'])near(geometry[selector][dimension],expected[dimension],selector+' '+dimension,.6);}
  near(geometry['.graduation-review-identity'].y,metric('dataTable').y,'identity y');
  for(const [selector,id] of [['.graduation-review-language','engTable'],['.graduation-review-categories','kindTable']]){
    const expected=source.nodes.filter(node=>node.tag==='TH'&&Math.abs(node.rect.y-metric(id).y)<2),headers=await inspect(selector+' thead th');geometry[selector+' headers']=headers;assert.equal(headers.length,expected.length);
    for(const [index,cell] of headers.entries())for(const dimension of ['x','width','height'])near(cell[dimension],expected[index].rect[dimension],selector+' header '+index+' '+dimension);
  }
  for(const [selector,background,border] of [['.graduation-review-language','rgb(0, 128, 128)','rgb(0, 103, 103)'],['.graduation-review-categories','rgb(0, 128, 128)','rgb(0, 103, 103)']])for(const [index,cell] of (await inspect(selector+' thead th')).entries()){
    assert.equal(cell.fontSize,'13px');assert.equal(cell.lineHeight,'19.5px');assert.equal(cell.fontWeight,'700');assert.equal(cell.padding,'10px');assert.equal(cell.background,background);assert.equal(cell.borderColor,border);assert.equal(cell.color,'rgb(255, 255, 255)');near(cell.height,41,selector+' header '+index+' height');
  }
  const label=(await inspect('.graduation-review-identity th'))[0];assert.equal(label.background,'rgb(119, 119, 119)');assert.equal(label.borderColor,'rgb(99, 99, 99)');assert.equal(label.fontWeight,'400');assert.equal(label.padding,'10px');
  for(const row of await page.locator('.graduation-review-table>thead+tbody').evaluateAll(nodes=>nodes.map(node=>({width:getComputedStyle(node).borderTopWidth,color:getComputedStyle(node).borderTopColor}))))assert.deepEqual(row,{width:'2px',color:'rgb(33, 37, 41)'});
  near(geometry['.graduation-review-graduate'].width,22.75,'graduate icon width');near(geometry['.graduation-review-graduate'].height,26,'graduate icon height');assert.equal(geometry['.graduation-review-graduate'].fontWeight,'900');assert.match(geometry['.graduation-review-graduate'].fontFamily,/Graduation Source Icons/);
}
try{
  await mkdir(directory,{recursive:true,mode:0o700});const context=await browser.newContext({viewport:{width:1533,height:1399},locale:'zh-TW',timezoneId:'Asia/Taipei'});
  await context.addInitScript(state=>{window.initialGraduationState=state;},{snapshot,busy:false,error:''});
  await context.route(base+'/__graduation-qa',route=>route.fulfill({contentType:'text/html',body:html}));await context.route('**/api/**',route=>{apiCalls++;return route.abort();});
  page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/__graduation-qa');await page.locator('.graduation-review-identity').waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.getByText('OTHER ACCOUNT PRIVATE',{exact:true}).count(),0);assert.equal(await page.getByText('OTHER COURSE PRIVATE',{exact:true}).count(),0);
  assert.equal(await page.locator('.graduation-review-requirements').count(),0);assert.deepEqual(await page.locator('.graduation-review-language tbody td').allTextContents(),['測試外語課程','儲存外語狀態','8','0','—']);
  assert.deepEqual(await page.locator('.graduation-review-categories thead th').allTextContents().then(cells=>cells.slice(0,7)),['編程名稱','必選修','應修學分','已修學分','符合學分','不計入此類學分','通過']);
  assert.deepEqual(await page.locator('.graduation-review-category').first().locator('td').allTextContents().then(cells=>cells.slice(2,6)),['8','9','7','0']);
  assert.equal(await page.locator('.graduation-review-identity tbody tr').nth(4).locator('td').first().getByRole('img').count(),0,'N alone must not imply an attention icon.');
  assert.equal(await page.locator('.graduation-review-identity tbody tr').nth(4).locator('td').nth(1).getByRole('img',{name:'注意指示'}).count(),1);
  assert.deepEqual(await page.locator('.graduation-review-other tbody tr td:nth-child(3)').allTextContents(),['0','—','2.5','2.5','2.5','2.5','2.5','2.5']);assert.equal(await page.getByText('<script>literal synthetic title</script>',{exact:true}).count(),1);
  assert.equal(await page.locator('.graduation-review-main input,.graduation-review-main select,.graduation-review-main textarea').count(),0);
  await desktopGeometry();await check('collapsed1533');await shot('collapsed-1533');
  await button('展開測試編程 1 選資料明細').click();assert.equal(await page.locator('.graduation-review-requirements').count(),1);assert.equal(await page.locator('.graduation-review-detail-row:not([hidden])').count(),1);assert.equal(await button('收合測試編程 1 選資料明細').getAttribute('aria-expanded'),'true');
  assert.deepEqual(await page.locator('.graduation-review-requirements thead th').allTextContents(),['#','應修習課程','模組','學分','必選修','年級','扺免']);assert.equal(await page.locator('.graduation-review-subtotal td:nth-child(2)').textContent(),'2.5');
  const localNested=(await inspect('.graduation-review-requirements'))[0],sourceNested=nested.tables[0].table.rect;
  near(localNested.x,sourceNested.x,'nested x',.6);near(localNested.y,sourceNested.y,'nested y',.6);near(localNested.width,sourceNested.width,'nested width',.6);geometry.nested=localNested;
  for(const [index,cell] of (await inspect('.graduation-review-requirements thead th')).entries()){
    const expected=nested.tables[0].heads[index].style;assert.equal(cell.background,expected.background);assert.equal(cell.padding,expected.padding);assert.equal(cell.color,expected.color);assert.equal(cell.fontSize,'13px');assert.equal(cell.lineHeight,'19.5px');assert.equal(cell.borderColor,'rgb(40, 120, 75)');assert.equal(cell.textAlign,expected.textAlign);
  }
  await button('展開全部資料明細').click();assert.equal(await page.locator('.graduation-review-requirements').count(),6);assert.equal(await page.locator('.graduation-review-matched').count(),6);assert.equal(await page.locator('.graduation-review-matched td:nth-child(2),.graduation-review-other td:nth-child(2)').filter({hasText:'合成課程 repeated-match'}).count(),7,'Repeated matches remain in each requirement and the other-course list.');await check('expanded1533');await shot('expanded-1533');
  await button('收合全部資料明細').click();assert.equal(await page.locator('.graduation-review-requirements').count(),0);
  await button('展開全部資料明細').click();await update({snapshot:{...snapshot,graduationReview:{reports:[{...report,id:'report-replaced'},otherReport]}}});assert.equal(await page.locator('.graduation-review-requirements').count(),0,'A replacement report starts collapsed.');
  await button('展開全部資料明細').click();await update({snapshot:{...snapshot,profile:{...snapshot.profile,userId:other}}});assert.equal(await page.locator('.graduation-review-requirements').count(),0,'Switching accounts clears disclosure state.');assert.equal(await page.getByText('OTHER ACCOUNT PRIVATE',{exact:true}).count(),1);assert.equal(await page.getByText('合成測試生',{exact:true}).count(),0);
  await update({snapshot});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});await check('collapsed'+width);
    for(const wrap of await page.locator('.graduation-review-scroll').all()){
      assert.ok(await wrap.evaluate(node=>node.scrollWidth>node.clientWidth),'Wide table scroll is contained.');await wrap.focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(element=>element.scrollLeft>0,await wrap.elementHandle());assert.equal(await wrap.evaluate(node=>node.matches(':focus-visible')),true);await page.keyboard.press('Tab');assert.equal(await wrap.evaluate(node=>node===document.activeElement),false);await wrap.evaluate(node=>{node.scrollLeft=0;});
    }
    await button('展開全部資料明細').click();await check('expanded'+width);await page.locator('.graduation-review-scroll').evaluateAll(nodes=>nodes.forEach(node=>{node.scrollLeft=0;}));await shot('expanded-'+width);await button('收合全部資料明細').click();
    await button('學生成績').focus();await page.keyboard.press('Enter');await page.getByRole('menuitem',{name:'歷年成績查詢',exact:true}).waitFor();assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['當學期成績查詢','歷年成績查詢','預警成績查詢','學期排名查詢','抵免課程學分查詢','循環式課程梯次成績查詢','成績功能選項']);
    for(const link of await page.getByRole('menuitem').all())assert.ok((await link.getAttribute('href')).startsWith('/school-affairs/services/13-1'));
    await check('menu'+width);await page.keyboard.press('Escape');await page.getByRole('menu').waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.textContent==='學生成績');
  }
  await update({snapshot:{...snapshot,graduationReview:{reports:[otherReport]}}});await page.getByRole('status').filter({hasText:'目前沒有站內畢業學分檢核紀錄。'}).waitFor();assert.equal(await page.locator('.graduation-review-table').count(),0);assert.equal(await page.getByText('OTHER ACCOUNT PRIVATE',{exact:true}).count(),0);await check('empty320');
  await update({error:'Synthetic graduation read failure'});await page.getByRole('alert').waitFor();await check('error320');await button('重新載入').click();await page.getByRole('status').filter({hasText:'載入畢業檢核資料中'}).waitFor();assert.equal(await page.evaluate(()=>window.reloadCount),1);assert.equal(await page.locator('main').getAttribute('aria-busy'),'true');await check('loading320');
  await update({busy:false,error:'',snapshot:{...snapshot,graduationReview:{reports:[{...report,reportedAt:null,categories:[{...report.categories[0],requirements:[],detailSubtotalCredits:0}],otherCourses:[]}]}}});assert.match(await page.locator('.graduation-review-heading>p').innerText(),/—$/);assert.equal(await page.locator('.academic-grades-datetime').textContent(),'Date/Time : —');await button('展開全部資料明細').click();assert.equal(await page.locator('.graduation-review-subtotal td:nth-child(2)').textContent(),'0');
  await button('Index').click();assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['Index','Logout']);await page.getByRole('menuitem',{name:'Logout',exact:true}).click();assert.equal(await page.evaluate(()=>window.logoutCount),1);await page.waitForFunction(()=>window.graduationLocation==='/signed-out');
  assert.equal(apiCalls,0,'Read-only report must not call an API.');assert.deepEqual(errors,[]);assert.deepEqual(geometryFailures,[]);assert.equal(unexpectedAxe.length,0,'Unexpected serious/critical accessibility findings; see failure.json.');
  await writeFile(directory+'/result.json',JSON.stringify({status:'passed',syntheticOnly:true,isolatedComponent:true,geometry,sourceInheritedContrast:sourceContrast,unexpectedSeriousCriticalAccessibilityIssues:0,ownAccountFiltering:true,explicitStatusesAndIndependentCredits:true,localDisclosureReset:true,keyboardMenusAndScroll:true,emptyErrorLoading:true,apiCalls},null,2)+'\n',{mode:0o600});
  console.log('Graduation UI passed: source geometry/styles, three widths, own-account reports, literal status/null/zero, repeated matches, disclosures/reset, keyboard menus/scroll, loading/error/retry/logout; zero new serious/critical axe. Artifacts: '+directory);
}catch(error){await writeFile(directory+'/failure.json',JSON.stringify({error:String(error),errors,geometry,geometryFailures,sourceInheritedContrast:sourceContrast,unexpectedAxe},null,2)+'\n',{mode:0o600}).catch(()=>{});if(page)await shot('failure').catch(()=>{});throw error;}finally{await browser.close();}
