import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';

// Local-only component integration: the production components run in Vite, with
// synthetic props and a small receipt-aware save transport. No accounts or DB.
process.umask(0o077);
const base=process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Local synthetic browser fixtures only.');
const directory='artifacts/academic-grades-ui',checkedAt='2026-11-12T10:00:00Z';
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const blank=()=>({records:[],termSummaries:[],rankings:[],metadata:[]});
const common=(id,extra={})=>({id,userId:owner,sourceMode:'local_demo',version:1,createdAt:checkedAt,updatedAt:checkedAt,...extra});
const grade=(id,extra={})=>({...common(id),recordKind:'transcript',academicYear:114,semester:1,courseTitle:'測試課程',courseCode:null,categoryText:null,moduleName:null,requiredElectiveText:null,credits:null,gradeText:null,remarkText:null,rowOrder:0,...extra});
const summary=(id,extra={})=>({...common(id),summaryKind:'transcript',academicYear:114,semester:1,earnedCredits:null,averageGradeText:null,attemptedCredits:null,passedCredits:null,failedCredits:null,...extra});
const records={records:[grade('later',{academicYear:115,courseTitle:'測試乙',credits:3,gradeText:'棄選'}),grade('second',{courseTitle:'測試後',rowOrder:2,credits:null,gradeText:null}),grade('first',{courseTitle:'測試零',rowOrder:1,credits:0,gradeText:'P'}),grade('warning',{recordKind:'warning',academicYear:115,semester:2,courseCode:'QA-W01',courseTitle:'預警零',credits:0,gradeText:'P',remarkText:'原文備註'}),grade('warning-null',{recordKind:'warning',academicYear:115,semester:2,courseCode:'QA-W02',courseTitle:'預警空值',rowOrder:1}),grade('old-warning',{recordKind:'warning',academicYear:114,courseTitle:'OLD WARNING HIDDEN'}),grade('private',{userId:other,academicYear:9999,courseTitle:'OTHER ACCOUNT PRIVATE'})],
  termSummaries:[summary('sum-first',{earnedCredits:0,averageGradeText:'P / 未完成'}),summary('sum-only',{academicYear:113,semester:3,earnedCredits:9.5,averageGradeText:'尚未記錄'}),summary('sum-warning',{summaryKind:'warning',academicYear:115,semester:2,attemptedCredits:0,passedCredits:null,failedCredits:8.5}),summary('private-sum',{userId:other,academicYear:9999,averageGradeText:'OTHER ACCOUNT PRIVATE'})],
  rankings:[{...common('rank-old'),academicYear:114,semester:1,departmentRankingText:null,classRankingText:'0'},{...common('rank-new'),academicYear:115,semester:2,departmentRankingText:'2 / 45（示範）',classRankingText:'尚未公布'},{...common('rank-private',{userId:other}),academicYear:9999,semester:1,departmentRankingText:'OTHER ACCOUNT PRIVATE',classRankingText:null}],
  metadata:[{...common('meta'),classLabel:'甲',englishRequirementText:'測試狀態：待確認'},{...common('meta-private',{userId:other}),classLabel:'OTHER ACCOUNT PRIVATE',englishRequirementText:'OTHER ACCOUNT PRIVATE'}]};
const snapshot={checkedAt,officialUniversityData:false,profile:{userId:owner,email:'academic-one@example.invalid',displayName:'測試生',role:'student'},student:{id:'synthetic-student',studentNumber:'QA-0001',fullName:'測試生',yearLevel:1,status:'active',sourceMode:'local_demo',program:'測試系'},courses:[],charges:[],assignments:[],announcements:[],tasks:[],requests:[],academicGrades:records};
const profiles=[{user_id:owner,display_name:'Synthetic Student',email:'academic-one@example.invalid'},{user_id:other,display_name:'Synthetic Student',email:'academic-two@example.invalid'}];
const errors=[],geometry={},contrast=[],unexpectedAxe=[],writes=[],receipts=new Map();
let managerRecords=blank(),saveMode='success',refreshMode='success',releaseSave,studentWrites=0;
// Use Vite's exact optimized module identities; unversioned router imports would
// create a second context rather than share the components' router instance.
const viteHash=JSON.parse(await readFile('node_modules/.vite/deps/_metadata.json','utf8')).browserHash;
const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic academic grade component verification</title></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
await import('/@vite/client');
const {default:React}=await import('/node_modules/.vite/deps/react.js?v=${viteHash}');const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js?v=${viteHash}')).default;
const {MemoryRouter,useLocation,useNavigate}=await import('/node_modules/.vite/deps/react-router.js?v=${viteHash}');
await import('/src/index.css');await import('/src/features/public/affairs/portal.css');
const {AcademicGrades}=await import('/src/features/public/affairs/AcademicGrades.tsx');const {AcademicGradesManager}=await import('/src/features/public/affairs/AcademicGradesManager.tsx');
const h=React.createElement;
function Fixture(){const [state,setState]=React.useState(window.initialAcademicState);const navigate=useNavigate(),location=useLocation();
 window.setAcademicState=patch=>setState(prior=>({...prior,...patch}));window.navigateAcademic=view=>navigate('/school-affairs/services/13-1'+(view==='index'?'':'/'+view));
 const view=location.pathname.split('/')[4]||'index';
 const onSave=async action=>{setState(prior=>({...prior,busy:true,transportError:''}));try{const result=await window.saveAcademicFixture(action);if(result.records)setState(prior=>({...prior,records:result.records}));if(result.error)setState(prior=>({...prior,transportError:result.error}));return result.ok;}finally{setState(prior=>({...prior,busy:false}));}};
 return state.manager?h('main',{className:'bg-background text-foreground min-h-screen',style:{maxWidth:1060,margin:'0 auto',padding:16}},state.transportError&&h('p',{role:'alert'},state.transportError),h(AcademicGradesManager,{records:state.records,profiles:state.profiles,busy:state.busy,onSave,onRefresh:async()=>{const rows=await window.refreshAcademicFixture();setState(prior=>({...prior,records:rows}));}})):
 h(AcademicGrades,{snapshot:state.snapshot,busy:state.busy,error:state.error,view,onReload:()=>{window.reloadCount=(window.reloadCount||0)+1;setState(prior=>({...prior,busy:true,error:''}));},onLogout:()=>{window.logoutCount=(window.logoutCount||0)+1;}});
}
createRoot(document.getElementById('root')).render(h(MemoryRouter,{initialEntries:['/school-affairs/services/13-1']},h(Fixture)));
</script></body></html>`;
const readLayout=async name=>JSON.parse(await readFile(`artifacts/visual-parity/${name}.json`,'utf8'));
const source={index:await readLayout('academic-grade-index-layout'),transcript:await readLayout('academic-transcript-layout'),warning:await readLayout('academic-warning-layout'),ranking:await readLayout('academic-ranking-layout'),transfer:await readLayout('academic-grade-empty-layout')};
const rect=node=>node.rect||node.style||{x:node.x,y:node.y,width:node.w,height:node.h};
const find=(view,predicate)=>{const found=source[view].nodes.find(predicate);assert.ok(found,`Missing source metric ${view}`);return rect(found);};
const near=(actual,expected,label,tolerance=.6)=>assert.ok(Math.abs(actual-expected)<tolerance,`${label}: ${actual} vs source ${expected}`);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
let page;
async function update(patch){await page.evaluate(p=>window.setAcademicState(p),patch);await page.evaluate(()=>new Promise(requestAnimationFrame));}
async function view(name){await page.evaluate(value=>window.navigateAcademic(value),name);await page.locator(name==='index'?'.academic-grade-index-table':['transfer','cycle','current'].includes(name)?'.academic-grades-notice-message':`.academic-grade-${name}-table`).waitFor();await page.evaluate(()=>document.fonts.ready);}
async function shot(label){await page.screenshot({path:`${directory}/${label}.png`,fullPage:true});}
async function check(label,{manager=false}={}){
  await page.evaluate(()=>Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
  const size=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));assert.ok(size.document<=size.viewport,label+' page overflow '+JSON.stringify(size));
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  for(const violation of result.violations.filter(row=>['serious','critical'].includes(row.impact)))for(const node of violation.nodes){
    const inherited=!manager&&violation.id==='color-contrast'&&node.target.length===1&&await page.locator(node.target[0]).evaluate(element=>{
      const color=getComputedStyle(element).color,brand=element.closest('.academic-grades-brand'),badge=element.closest('.academic-grade-index-badge.ranking');
      return Boolean(brand&&color==='rgb(255, 255, 255)'&&getComputedStyle(brand).backgroundColor==='rgb(124, 124, 124)'
        ||element.matches('.academic-grade-index-table th')&&color==='rgb(255, 255, 255)'&&getComputedStyle(element).backgroundColor==='rgb(13, 152, 186)'
        ||badge&&color==='rgb(255, 255, 255)'&&getComputedStyle(badge).backgroundColor==='rgb(23, 162, 184)'
        ||element.matches('.academic-grades-datetime')&&color==='rgb(145, 150, 159)'
        ||element.matches('.academic-grades-notice-return a')&&color==='rgb(255, 255, 255)'&&getComputedStyle(element).backgroundColor==='rgb(66, 139, 202)');
    });
    (inherited?contrast:unexpectedAxe).push({page:label,id:violation.id,target:node.target,summary:node.failureSummary});
  }
}
async function measure(viewName,width){
  const key=viewName+width,metrics={};
  for(const selector of ['.academic-grades-nav','.academic-grades-main',...(viewName==='transfer'?['.academic-grades-notice-message']:['.academic-grades-heading','.academic-grades-data',viewName==='index'?'.academic-grade-index-table':`.academic-grade-${viewName}-table`])])metrics[selector]=await page.locator(selector).boundingBox();
  geometry[key]=metrics;
  if(source[viewName].viewport.width!==width)return;
  const nav=find(viewName,n=>n.tag==='NAV'||n.selector==='.navbar');for(const dimension of ['x','y','width','height'])near(metrics['.academic-grades-nav'][dimension],nav[dimension],`${key} navbar ${dimension}`);
  const main=find(viewName,n=>n.tag==='MAIN'||n.selector==='main');for(const dimension of ['x','y','width'])near(metrics['.academic-grades-main'][dimension],main[dimension],`${key} main ${dimension}`);
  const tableSelector=viewName==='transfer'?'.academic-grades-notice-message':viewName==='index'?'.academic-grade-index-table':`.academic-grade-${viewName}-table`;
  const target=find(viewName,n=>viewName==='transfer'?n.cls?.startsWith('alert '):n.tag==='TABLE'||n.selector==='#dataTable');
  for(const dimension of ['x','y','width'])near(metrics[tableSelector][dimension],target[dimension],`${key} ${tableSelector} ${dimension}`);
  if(viewName==='index'||viewName==='transfer')near(metrics[tableSelector].height,target.height,`${key} height`);
  if(!['index','transfer'].includes(viewName)){
    const columns=viewName==='transcript'?source[viewName].columns.map(rect):source[viewName].nodes.filter(n=>n.tag==='TH').map(rect);
    const local=await page.locator(tableSelector+' th').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {x:r.x,y:r.y,width:r.width,height:r.height,fontSize:s.fontSize,lineHeight:s.lineHeight,padding:s.padding,background:s.backgroundColor,color:s.color};}));
    geometry[key].headers=local;assert.equal(local.length,columns.length);
    for(let i=0;i<columns.length;i++){for(const d of ['x','y','width','height'])near(local[i][d],columns[i][d],`${key} header${i} ${d}`);assert.equal(local[i].fontSize,'13px');assert.equal(local[i].lineHeight,'19.5px');assert.equal(local[i].padding,'10px');assert.equal(local[i].background,'rgb(1, 84, 106)');assert.equal(local[i].color,'rgb(255, 255, 255)');}
  }
}
const actionTable={save_academic_grade_record:'records',save_academic_term_summary:'termSummaries',save_academic_ranking:'rankings',save_academic_metadata:'metadata'};
const camel=key=>key.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase());
async function saveFixture(action){
  writes.push(structuredClone(action));if(saveMode==='pending')await new Promise(resolve=>{releaseSave=resolve;});
  if(saveMode==='error')return {ok:false,error:'Synthetic transport failure'};
  const body=JSON.stringify(action),p=action.payload,table=actionTable[action.kind];assert.ok(table);assert.ok(/^[\da-f-]{36}$/i.test(p.request_id));
  if(receipts.has(p.request_id)){const receipt=receipts.get(p.request_id);assert.equal(receipt.body,body,'A receipt cannot be reused for a changed payload.');return {ok:true,records:managerRecords};}
  const current=managerRecords[table].find(row=>row.id===p.id);
  if(Number(p.expected_version)!==(current?.version||0))return {ok:false,error:'409: synthetic record changed; refresh to load latest.'};
  if(current)assert.equal(p.user_id,current.userId,'Owner is immutable.');
  const row={...common(p.id),...Object.fromEntries(Object.entries(p).filter(([key])=>!['request_id','expected_version'].includes(key)).map(([key,value])=>[camel(key),value])),version:(current?.version||0)+1};
  managerRecords={...managerRecords,[table]:[...managerRecords[table].filter(item=>item.id!==p.id),row]};receipts.set(p.request_id,{body});
  return saveMode==='lost'?{ok:false,error:'Synthetic response lost after save'}:{ok:true,records:managerRecords};
}
const labels={account:'Academic record account',group:'Academic record group',kind:'Academic record kind',year:'Academic year · 學年',semester:'Semester · 學期',title:'Course title · 科目名稱',credits:'Credits · 學分數',grade:'Grade text · 成績',code:'Course code · 課程代碼',remark:'Remark · 備註'};
const input=name=>page.getByLabel(labels[name]||name,{exact:true});
const button=name=>page.getByRole('button',{name,exact:true});
async function start(group,kind){await input('group').selectOption(group);await input('account').selectOption(owner);if(kind)await input('kind').selectOption(kind);if(group!=='metadata'){await input('year').fill('115');await input('semester').selectOption('1');}}
async function saved(name){await button(name).click();await page.getByRole('status').filter({hasText:'Local academic record saved.'}).waitFor();}
try{
  await mkdir(directory,{recursive:true,mode:0o700});const context=await browser.newContext({viewport:{width:1533,height:1000},locale:'zh-TW',timezoneId:'Asia/Taipei'});
  await context.addInitScript(state=>{window.initialAcademicState=state;},{manager:false,snapshot,busy:false,error:'',records:blank(),profiles});
  await context.route(base+'/__academic-qa',route=>route.fulfill({contentType:'text/html',body:html}));
  await context.route('**/api/**',route=>{studentWrites++;return route.abort();});
  page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  await page.exposeFunction('saveAcademicFixture',saveFixture);await page.exposeFunction('refreshAcademicFixture',()=>{if(refreshMode==='error')throw Error('Synthetic refresh failed');return managerRecords;});
  await page.goto(base+'/__academic-qa');await page.locator('.academic-grade-index-table').waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.academic-grade-index-table a').count(),7);
  for(const width of [1533,1280]){await page.setViewportSize({width,height:1000});await measure('index',width);await check('index'+width);await shot('index-'+width);}
  await page.locator('.academic-grade-index-table').getByRole('link',{name:'歷年成績查詢',exact:true}).click();await page.locator('.academic-grade-transcript-table').waitFor();
  assert.deepEqual(await page.locator('.academic-grade-transcript-table thead th').allTextContents(),['選課時間','科目名稱','類別','模組名稱','必選修','學分數','成績']);
  assert.deepEqual(await page.locator('.academic-grade-transcript-table tbody tr:not(.academic-grade-term-summary) td:nth-child(2)').allTextContents(),['測試零','測試後','測試乙']);
  assert.deepEqual(await page.locator('.academic-grade-transcript-table tbody tr:not(.academic-grade-term-summary) td:nth-child(6)').allTextContents(),['0','—','3']);
  assert.deepEqual(await page.locator('.academic-grade-transcript-table tbody tr:not(.academic-grade-term-summary) td:nth-child(7)').allTextContents(),['P','—','棄選']);
  assert.deepEqual(await page.locator('.academic-grade-term-summary .academic-grade-number').allTextContents(),['9.5','尚未記錄','0','P / 未完成','—','—']);
  assert.match(await page.locator('.academic-grade-summary-term').innerText(),/113學年度暑期/);assert.equal(await page.locator('.withdrawn').count(),1);
  assert.equal(await page.getByText('OTHER ACCOUNT PRIVATE',{exact:false}).count(),0);assert.match(await page.locator('.academic-grade-english').innerText(),/測試狀態：待確認/);
  assert.match(await page.locator('.academic-grades-datetime').innerText(),/2026/);
  for(const width of [1280,1533]){await page.setViewportSize({width,height:1000});await measure('transcript',width);await check('transcript'+width);await shot('transcript-'+width);}
  for(const name of ['warning','ranking']){
    await view(name);await page.setViewportSize({width:1533,height:1000});await measure(name,1533);
    if(name==='warning'){assert.deepEqual(await page.locator('.academic-grade-warning-table tbody td:nth-child(2)').allTextContents(),['預警零','預警空值']);assert.deepEqual(await page.locator('.academic-grade-warning-totals .academic-grade-number').allTextContents(),['0','—','8.5']);assert.equal(await page.getByText('OLD WARNING HIDDEN',{exact:true}).count(),0);}
    else assert.deepEqual(await page.locator('.academic-grade-ranking-table tbody tr').allTextContents(),['115二2 / 45（示範）尚未公布','114一—0']);
    for(const width of [1533,1280]){await page.setViewportSize({width,height:1000});await check(name+width);await shot(name+'-'+width);}
    assert.equal(await page.getByText('OTHER ACCOUNT PRIVATE',{exact:false}).count(),0);
  }
  for(const name of ['transfer','cycle','current']){await view(name);await page.setViewportSize({width:1533,height:1000});if(name==='transfer')await measure(name,1533);await check(name+'1533');await shot(name+'-1533');assert.equal(await page.locator('.academic-grades-main input,.academic-grades-main select,.academic-grades-main textarea').count(),0);}
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    for(const name of ['index','transcript','warning','ranking','transfer','cycle','current']){await view(name);await check(name+width);await shot(name+'-'+width);
      const wrap=page.locator('.academic-grade-table-wrap');if(await wrap.count()){await wrap.focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('.academic-grade-table-wrap').scrollLeft>0);assert.equal(await wrap.evaluate(n=>n.matches(':focus-visible')),true);await page.keyboard.press('Tab');assert.equal(await wrap.evaluate(n=>n===document.activeElement),false);}
    }
    await button('學生成績').focus();await page.keyboard.press('Enter');await page.getByRole('menuitem',{name:'歷年成績查詢',exact:true}).waitFor();assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['當學期成績查詢','歷年成績查詢','預警成績查詢','學期排名查詢','抵免課程學分查詢','循環式課程梯次成績查詢','成績功能選項']);await check('menu'+width);await shot('menu-'+width);await page.keyboard.press('Escape');await page.getByRole('menu').waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.textContent==='學生成績');
  }
  await view('transcript');await update({snapshot:{...snapshot,academicGrades:blank()}});await page.getByRole('status').filter({hasText:'目前沒有站內歷年成績紀錄'}).waitFor();assert.equal(await page.locator('.academic-grade-term-summary').count(),0);await check('empty320');await shot('empty-320');
  await update({error:'Synthetic grade read failure'});await page.getByRole('alert').waitFor();await check('error320');await shot('error-320');await button('重新載入').click();await page.getByRole('status').filter({hasText:'載入成績資料中'}).waitFor();assert.equal(await page.evaluate(()=>window.reloadCount),1);await shot('loading-320');await update({busy:false,error:'',snapshot});
  await button('Index').click();assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['Index','Logout']);await page.getByRole('menuitem',{name:'Logout',exact:true}).click();assert.equal(await page.evaluate(()=>window.logoutCount),1);
  assert.equal(studentWrites,0,'Read-only component must not call any API.');

  await page.setViewportSize({width:1533,height:1100});await update({manager:true,records:managerRecords,snapshot});await page.getByRole('region',{name:'Academic grade record manager'}).waitFor();
  assert.deepEqual(await input('account').locator('option').allTextContents(),['Choose an account','Synthetic Student (academic-one@example.invalid)','Synthetic Student (academic-two@example.invalid)']);
  await start('grade','transcript');await input('title').fill('Synthetic transcript');await input('credits').fill('0');await input('grade').fill('P');
  saveMode='lost';await button('Save academic grade').click();await page.getByRole('alert').filter({hasText:'The record was not saved.'}).waitFor();const first=writes.at(-1);assert.equal(first.payload.credits,0);assert.equal(first.payload.grade_text,'P');assert.equal(first.payload.category_text,null);assert.ok(!('course_code' in first.payload));assert.ok(!('remark_text' in first.payload));
  await shot('manager-retry-1533');saveMode='success';await saved('Save academic grade');assert.deepEqual(writes.at(-1),first);assert.equal(managerRecords.records.length,1);
  await button('Edit academic grade').click();assert.equal(await input('account').isDisabled(),true);assert.equal(await input('kind').isDisabled(),true);assert.equal(await input('group').isDisabled(),true);await input('credits').fill('');await input('grade').fill('0');await saved('Save academic grade');assert.equal(writes.at(-1).payload.credits,null);assert.equal(writes.at(-1).payload.grade_text,'0');assert.equal(writes.at(-1).payload.expected_version,'1');
  await start('grade','warning');await input('title').fill('Synthetic warning');await input('code').fill('QA-WARNING');await input('remark').fill('Withdrawn / 棄選');await input('grade').fill('F');saveMode='error';await button('Save academic grade').click();await page.getByRole('alert').filter({hasText:'The record was not saved.'}).waitFor();const failedRequest=writes.at(-1).payload.request_id;await input('remark').fill('');saveMode='pending';await button('Save academic grade').click();await button('Saving academic record…').waitFor();assert.equal(await input('code').isDisabled(),true);const pendingCount=writes.length;await page.locator('.academic-grades-manager form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(writes.length,pendingCount);saveMode='success';releaseSave();await page.getByRole('status').filter({hasText:'Local academic record saved.'}).waitFor();assert.notEqual(writes.at(-1).payload.request_id,failedRequest);assert.equal(writes.at(-1).payload.remark_text,null);assert.equal(writes.at(-1).payload.credits,null);assert.ok(!('category_text' in writes.at(-1).payload));assert.ok(!('module_name' in writes.at(-1).payload));assert.ok(!('required_elective_text' in writes.at(-1).payload));
  await start('summary','warning');await input('Attempted credits · 總修習學分數').fill('0');await input('Failed credits · 不及格學分數').fill('8.5');await saved('Save academic term summary');assert.equal(writes.at(-1).payload.attempted_credits,0);assert.equal(writes.at(-1).payload.passed_credits,null);assert.equal(writes.at(-1).payload.failed_credits,8.5);assert.ok(!('earned_credits' in writes.at(-1).payload));
  await start('summary','transcript');await input('Earned credits · 實得學分').fill('0');await input('Average grade text · 學期平均').fill('P / 待確認');await saved('Save academic term summary');assert.equal(writes.at(-1).payload.earned_credits,0);assert.equal(writes.at(-1).payload.average_grade_text,'P / 待確認');assert.ok(!('attempted_credits' in writes.at(-1).payload));
  await start('ranking');await input('Department ranking text · 系排名').fill('2 / 45（示範）');await input('Class ranking text · 班排名').fill('0');await saved('Save academic ranking');assert.equal(writes.at(-1).payload.class_ranking_text,'0');await button('Edit academic ranking').click();await input('Department ranking text · 系排名').fill('');await saved('Save academic ranking');assert.equal(writes.at(-1).payload.department_ranking_text,null);
  await start('metadata');await input('Class label · 班級').fill('甲');await input('English requirement text · 英文畢業門檻').fill('待確認');await saved('Save academic metadata');assert.ok(!('academic_year' in writes.at(-1).payload));assert.ok(!('semester' in writes.at(-1).payload));
  await input('account').selectOption(owner);await page.getByRole('status').filter({hasText:'A record already exists for this account'}).waitFor();assert.equal(await button('Save academic metadata').isDisabled(),true);await button('Load latest saved academic record').click();await input('Class label · 班級').fill('0');await input('English requirement text · 英文畢業門檻').fill('');await saved('Save academic metadata');assert.equal(writes.at(-1).payload.class_label,'0');assert.equal(writes.at(-1).payload.english_requirement_text,null);
  await input('group').selectOption('grade');await button('Edit academic grade').first().click();await input('title').fill('Unsaved local edit');const editingId=managerRecords.records[0].id;
  managerRecords={...managerRecords,records:managerRecords.records.map(row=>row.id===editingId?{...row,version:row.version+1,courseTitle:'Concurrent saved edit',credits:0}:row)};
  await button('Save academic grade').click();await page.getByRole('alert').filter({hasText:'409:'}).waitFor();assert.equal(await input('title').inputValue(),'Unsaved local edit');
  refreshMode='error';await button('Refresh academic records').click();await page.getByRole('alert').filter({hasText:'Synthetic refresh failed'}).waitFor();refreshMode='success';await button('Refresh academic records').click();await page.getByRole('status').filter({hasText:'A newer saved version is available'}).waitFor();assert.equal(await input('title').inputValue(),'Unsaved local edit');assert.equal(await button('Save academic grade').isDisabled(),true);await shot('manager-stale-1533');await button('Load latest saved academic record').click();assert.equal(await input('title').inputValue(),'Concurrent saved edit');assert.equal(await input('credits').inputValue(),'0');
  for(const width of [1533,390,320]){await page.setViewportSize({width,height:1100});await check('manager'+width,{manager:true});await shot('manager-'+width);}
  await input('title').fill('Resolved local edit');await saved('Save academic grade');assert.equal(writes.at(-1).payload.expected_version,'3');
  await start('grade','transcript');await input('title').fill('Boundary validation');const beforeInvalid=writes.length;
  for(const value of ['-1','1000','1.001']){await input('credits').fill(value);await button('Save academic grade').click();assert.equal(writes.length,beforeInvalid);assert.equal(await input('credits').evaluate(element=>element.checkValidity()),false);}
  await input('credits').fill('999.99');await saved('Save academic grade');assert.equal(writes.at(-1).payload.credits,999.99);
  await button('Clear academic record form').click();assert.equal(await input('account').inputValue(),'');assert.equal(await input('kind').inputValue(),'');assert.equal(await input('title').inputValue(),'');
  await update({profiles:[]});await page.getByText('No account profiles are available.',{exact:true}).waitFor();assert.equal(await page.locator('.academic-grades-manager form').count(),0);
  assert.deepEqual(errors,[],'Browser runtime errors');assert.equal(unexpectedAxe.length,0,'New serious/critical accessibility failures; see failure.json for exact nodes.');
  await writeFile(directory+'/result.json',JSON.stringify({status:'passed',syntheticOnly:true,isolatedComponents:true,geometry,sourceInheritedContrast:contrast,unexpectedSeriousAccessibilityIssues:0,ownAccountFiltering:true,nullAndZero:true,literalGradesAndRankings:true,explicitIndependentSummaries:true,fourManagerActions:true,stableRetryReceipts:true,staleRefreshPreservesDraft:true,noDatabaseOrAccountChanges:true,studentApiCalls:studentWrites},null,2)+'\n',{mode:0o600});
  console.log('Academic grade UI passed: source geometry, four widths, seven views, own-account/null-zero/literal records, explicit summaries, four manager actions, retry/stale/busy/errors, mobile keyboard and accessibility. Synthetic artifacts: '+directory);
}catch(error){await writeFile(directory+'/failure.json',JSON.stringify({error:String(error),errors,geometry,sourceInheritedContrast:contrast,unexpectedAxe},null,2)+'\n',{mode:0o600}).catch(()=>{});if(page)await shot('failure').catch(()=>{});throw error;}finally{await browser.close();}
