import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {affairsTestUser,affairsTestSession,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {parseDtmGradeReportData,parseDtmGradeReportOverviewData} from '../../server/dtmGradeReport.js';

// Compiled UI acceptance. Only exact revision-pinned production may supplement localhost.
// Every account/API response remains synthetic, including during production checks.
function target(value,revision){
  const url=new URL(value),production=url.origin==='https://stu.best';
  assert.ok((production||url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))&&url.pathname==='/'&&!url.search&&!url.hash&&!url.username&&!url.password,'Exact production or local origin only');
  if(production)assert.match(revision||'',/^[0-9a-f]{40}$/,'Production requires EXPECTED_RELEASE_REVISION: full lowercase 40-hex SHA');
  return {origin:url,production,expectedRevision:production?revision:null};
}
async function releaseManifest(base,revision,fetcher=globalThis.fetch){
  const response=await fetcher(base+'/release.json',{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200,'Release manifest must return HTTP200');assert.equal(response.redirected,false,'Release redirect forbidden');
  assert.ok(response.body,'Release manifest body required');assert.ok(Number(response.headers.get('content-length')||0)<=4096,'Release manifest exceeds4096bytes');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;assert.ok(size<=4096,'Release manifest exceeds4096bytes');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.ok(data&&typeof data==='object'&&!Array.isArray(data),'Release object required');
  assert.equal(data.version,1);assert.equal(data.revision,revision,'Production revision changed or does not match');assert.equal(data.environment,'production');assert.equal(data.source,'vercel-git');
  assert.ok(typeof data.builtAt==='string'&&Number.isFinite(Date.parse(data.builtAt)),'Release build timestamp required');
  return {version:data.version,revision:data.revision,environment:data.environment,source:data.source,builtAt:data.builtAt};
}
const {origin,production,expectedRevision}=target(process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184',process.env.EXPECTED_RELEASE_REVISION);
const base=origin.origin,uuid=(family,index)=>`${family}0000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
const userA=affairsTestUser,userB={...affairsTestUser,id:uuid('b',2),email:'other.synthetic@example.invalid',user_metadata:{name:'Synthetic B'},identities:[{provider:'google',id:'synthetic-b',user_id:uuid('b',2),identity_data:{email_verified:true}}]};
const users=new Map([userA,userB].map(user=>[user.id,user]));
const courseId=uuid('c',1),legacyId=uuid('d',1),reportId=uuid('e',1);
const cells=()=>({score:null,maximum:null,gradeText:null,rangeText:null,percentageText:null,weightText:null,weightNote:null,rankText:null,feedbackText:null,contributionText:null});
const report={id:reportId,userId:userA.id,courseId,sourceMode:'local_demo',version:1,createdAt:'2026-11-13T00:00:00Z',updatedAt:'2026-11-13T00:00:00Z',items:Array.from({length:7},(_,i)=>({
  ...cells(),id:uuid('f',i+1),label:`Synthetic item ${i+1}`,activityKind:i===0?'assignment':null,score:3,maximum:4,
  weightText:i===0?'0.00 %':i===1?'':null,weightNote:i===0?'(literal note)':null,
  gradeText:i===0?'P':i===1?'':i===2?'0':null,rangeText:i===0?'literal range':null,
  percentageText:i===0?'not numeric':null,rankText:i===0?'3 / 9':null,
  feedbackText:i===0?'<b>literal feedback</b>':i===1?'  spaced feedback  ':null,contributionText:i===0?'pending':null,
})),total:{...cells(),score:99,maximum:100,gradeText:'0',rangeText:'',percentageText:'unconfirmed',weightText:null,rankText:'literal rank',feedbackText:'Explicit saved total',contributionText:'0.00'}};
const legacy={id:legacyId,label:'Synthetic personal tracker',score:82,maximum:100,date:'2026-11-10',feedback:'Legacy tracker remains separate.'};
const courses=(userId,count=47)=>Array.from({length:count},(_,i)=>({id:uuid(userId===userA.id?'c':'a',i+1),userId,title:`Synthetic ${userId===userA.id?'A':'B'} course ${String(i+1).padStart(3,'0')}`,code:`QA${i+1}`,term:i%2?'Historical synthetic term':'Current synthetic term',gradeText:i===0?'0':i===1?'':null}));
const snapshot=userId=>({checkedAt:'2026-11-13T00:00:00Z',officialUniversityData:false,
  profile:{userId,email:users.get(userId).email,displayName:users.get(userId).user_metadata.name,role:'student'},student:null,courses:[],charges:[],assignments:[],announcements:[],tasks:[],requests:[],serviceRecords:[],
  dtm:{sourceMode:'personal',notices:[],courses:courses(userId).map(({id,title,code,term})=>({id,title,code,term,role:'student',sourceMode:'personal',materials:[],meetings:[],grades:userId===userA.id&&id===courseId?[legacy]:[]}))}});
parseDtmGradeReportData({report},userA.id,courseId);
parseDtmGradeReportOverviewData({courses:courses(userA.id),limit:100,nextCursor:null},userA.id);
if(process.argv.includes('--self-test')){
  assert.throws(()=>parseDtmGradeReportData({report},userB.id,courseId));
  assert.equal(report.items[0].gradeText,'P');assert.notEqual(report.items[0].percentageText,'75.00 %');
  assert.equal(parseDtmGradeReportData({report:null},userA.id,courseId).report,null);
  const revision='a'.repeat(40),manifest={version:1,revision,environment:'production',source:'vercel-git',builtAt:'2026-11-13T00:00:00.000Z'};
  assert.equal(target('http://127.0.0.1:5184').production,false);assert.equal(target('https://stu.best',revision).production,true);
  for(const invalid of ['https://example.invalid','https://stu.best.evil.invalid','https://stu.best:444','http://stu.best','https://stu.best/path','https://stu.best?x=1','https://user@stu.best'])assert.throws(()=>target(invalid,revision));
  for(const invalid of [undefined,'','a'.repeat(39),'A'.repeat(40),'g'.repeat(40)])assert.throws(()=>target('https://stu.best',invalid));
  let mockReads=0;
  assert.deepEqual(await releaseManifest('https://stu.best',revision,async(url,options)=>{mockReads++;assert.equal(url,'https://stu.best/release.json');assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.ok(options.signal instanceof AbortSignal);return Response.json(manifest);}),manifest);
  for(const changed of [{revision:'b'.repeat(40)},{environment:'preview'},{source:'unverified'},{version:2},{builtAt:null}])await assert.rejects(()=>releaseManifest('https://stu.best',revision,async()=>Response.json({...manifest,...changed})));
  await assert.rejects(()=>releaseManifest('https://stu.best',revision,async()=>new Response('x'.repeat(4097))));
  await assert.rejects(()=>releaseManifest('https://stu.best',revision,async()=>Response.json(manifest,{status:503})));
  const redirected=Response.json(manifest);Object.defineProperty(redirected,'redirected',{value:true});await assert.rejects(()=>releaseManifest('https://stu.best',revision,async()=>redirected));
  assert.equal(mockReads,1);
  console.log(JSON.stringify({status:'ok',fixtureContracts:4,productionGuardContracts:23,browserConnections:0,networkCalls:0}));
  process.exit(0);
}
const runId=new Date().toISOString().replaceAll(':','-'),directory=resolve('artifacts/dtm-grade-report-ui',runId);
await mkdir(directory,{recursive:true});
const evidence={status:'running',stage:'initialization',origin:base,syntheticOnly:true,expectedReleaseRevision:expectedRevision,release:{before:null,after:null},sourceHashes:{},geometry:[],geometryFailures:[],screenshots:[],checks:[],apiReads:[],mockAuthReads:0,blockedRequests:[],pageErrors:[],entries:[],liveApiCalls:0,liveAuthCalls:0,modelCalls:0};
const source={};
for(const [key,name] of [['report','measurements.json'],['overview','overview-measurements.json']]){
  const bytes=await readFile('artifacts/visual-parity/dtm-grade-report-source/'+name);
  const capture=JSON.parse(bytes);evidence.sourceHashes[key]=createHash('sha256').update(bytes).digest('hex');
  // Keep only geometry/styles: captured private text is never used as fixture data or copied to results.
  source[key]={viewport:capture.viewport,table:capture.table.rect,header:capture.rows[0].cells.map(cell=>({rect:cell.rect,style:cell.style}))};
}
let browser;
let diagnosticPage;
const contexts=[];
function tokenUser(request){const match=/^Bearer ([^.]+)\.([^.]+)\.[^.]+$/.exec(request.headers().authorization||'');assert.ok(match,'Synthetic bearer required');const id=JSON.parse(Buffer.from(match[2],'base64url')).sub;assert.ok(users.has(id),'Known synthetic caller only');return id;}
function exactKeys(params,keys){assert.deepEqual([...params.keys()].sort(),keys.slice().sort(),'Unexpected or repeated query selector');}
async function context({signedIn=true,paged=false}={}){
  const ctx=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block',reducedMotion:'reduce'});contexts.push(ctx);
  ctx.setDefaultTimeout(10000);ctx.setDefaultNavigationTimeout(30000);
  const state={reportMode:'present',overviewFailure:false,holdReport:false,held:[],heldReads:0,paged};
  await ctx.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    const deny=()=>{evidence.blockedRequests.push({method:request.method(),origin:url.origin,path:url.pathname});return route.abort('blockedbyclient');};
    if(url.origin!==base||request.method()!=='GET')return deny();
    if(url.pathname==='/@vite/client'||url.pathname.startsWith('/src/'))return deny();
    if(!url.pathname.startsWith('/api/'))return route.continue();
    try{
      const id=tokenUser(request);
      if(url.pathname==='/api/affairs-conversations'){exactKeys(url.searchParams,[]);return route.fulfill({json:{conversations:[]}});}
      if(url.pathname!=='/api/affairs-data')return deny();
      const scope=url.searchParams.get('scope');
      evidence.apiReads.push({scope:scope||'snapshot',caller:id===userA.id?'A':'B'});
      if(scope===null){exactKeys(url.searchParams,[]);return route.fulfill({json:snapshot(id)});}
      if(scope==='dtm-grade-report'){
        exactKeys(url.searchParams,['scope','course_id']);const selected=url.searchParams.get('course_id');
        assert.ok(courses(id).some(row=>row.id===selected),'Report reads must target caller-owned synthetic course');
        if(state.reportMode==='error')return route.fulfill({status:503,json:{error:'Synthetic read unavailable'}});
        const data=state.reportMode==='absent'||id===userB.id?{report:null}:state.reportMode==='foreign'?{report:{...report,userId:userB.id,items:[{...report.items[0],label:'FOREIGN_SENTINEL'}]}}:{report};
        if(state.holdReport){state.heldReads++;await new Promise(resolveHeld=>state.held.push(resolveHeld));}
        await route.fulfill({json:data}).catch(error=>{if(!/closed|Target|Invalid InterceptionId/i.test(error.message))throw error;});return;
      }
      if(scope==='dtm-grade-report-overview'){
        const after=url.searchParams.get('after_id');exactKeys(url.searchParams,after?['scope','after_id']:['scope']);
        const all=courses(id,state.paged&&id===userA.id?101:47);
        if(after)assert.equal(after,all[99]?.id,'Exact next cursor');
        if(after&&state.overviewFailure)return route.fulfill({status:503,json:{error:'Synthetic second page unavailable'}});
        const rows=after?all.slice(100):all.slice(0,100),nextCursor=!after&&all.length>100?rows.at(-1).id:null;
        return route.fulfill({json:{courses:rows,limit:100,nextCursor}});
      }
      return deny();
    }catch(error){evidence.blockedRequests.push({method:request.method(),path:url.pathname,reason:error.message});return route.abort('blockedbyclient');}
  });
  await mockAffairsAuth(ctx,{signedIn});
  // Tighten the shared fixture helper: no token exchange, REST, sign-in or write endpoint is permitted.
  await ctx.route('https://*.supabase.co/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()==='GET'&&url.pathname==='/auth/v1/user'&&!url.search){evidence.mockAuthReads++;return route.fulfill({json:users.get(tokenUser(request))});}
    evidence.blockedRequests.push({method:request.method(),origin:url.origin,path:url.pathname});return route.abort('blockedbyclient');
  });
  await ctx.addInitScript(()=>{if(window.top===window&&['http:','https:'].includes(location.protocol))localStorage.setItem('stu-dtm-language','zh');});
  await ctx.routeWebSocket('**/*',socket=>{evidence.blockedRequests.push({method:'WEBSOCKET'});socket.close();});
  ctx.on('page',page=>{page.on('pageerror',error=>evidence.pageErrors.push(error.message));page.on('response',response=>{const path=new URL(response.url()).pathname;if(/^\/assets\/index-[\w-]+\.js$/.test(path)&&!evidence.entries.includes(path))evidence.entries.push(path);});});
  return {ctx,state};
}
async function settle(page){await page.evaluate(async()=>{await document.fonts.ready;await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));});}
async function visit(page,path,selector){await page.goto(base+path);await page.locator(selector).waitFor();await settle(page);assert.equal(new URL(page.url()).pathname,path.split('#')[0]);}
async function shot(page,label,width){await page.setViewportSize({width,height:900});await settle(page);const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(bounds.scroll<=bounds.width+1,`${label} document overflow at ${width}`);const path=resolve(directory,`${label}-${width}.png`);await page.screenshot({path,fullPage:true});evidence.screenshots.push({label,width,path,bounds});}
async function geometry(page,key,selector){
  await page.setViewportSize(source[key].viewport);await settle(page);
  const actual=await page.locator(selector).boundingBox(),expected=source[key].table;
  for(const field of ['x','y','width']){evidence.geometry.push({key,field,actual:actual[field],expected:expected[field]});if(Math.abs(actual[field]-expected[field])>1)evidence.geometryFailures.push(`${key} source ${field}: ${actual[field]} expected ${expected[field]}`);}
  const style=await page.locator(selector+' thead th').first().evaluate(node=>{const s=getComputedStyle(node);return {fontSize:s.fontSize,lineHeight:s.lineHeight,padding:s.padding,fontWeight:s.fontWeight};});
  assert.deepEqual(style,{fontSize:'14px',lineHeight:'20px',padding:'8px',fontWeight:'700'});
  if(key==='overview'){
    if(Math.abs(actual.height-expected.height)>1)evidence.geometryFailures.push(`47-row overview height: ${actual.height} expected ${expected.height}`);
    const headers=await page.locator(selector+' thead th').evaluateAll(nodes=>nodes.map(node=>({x:node.getBoundingClientRect().x,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})));
    headers.forEach((row,i)=>{for(const field of ['x','width','height'])if(Math.abs(row[field]-source.overview.header[i].rect[field])>1)evidence.geometryFailures.push(`overview column ${i} ${field}: ${row[field]} expected ${source.overview.header[i].rect[field]}`);});
  }
}
async function switchAccount(page,user){const session=user?affairsTestSession(user):null;await page.evaluate(session=>{if(session)localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));else localStorage.removeItem('stu-school-affairs-auth');const channel=new BroadcastChannel('stu-school-affairs-auth');channel.postMessage({event:session?'SIGNED_IN':'SIGNED_OUT',session});setTimeout(()=>channel.close(),100);},session);}
try{
  if(production){evidence.stage='release before';evidence.release.before=await releaseManifest(base,expectedRevision);}
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const {ctx,state}=await context();const page=await ctx.newPage();diagnosticPage=page;
  evidence.stage='literal report';
  const reportPath='/dtm/course/'+courseId+'/grades';
  await visit(page,reportPath,'.dtm-literal-grade-table');
  assert.deepEqual(await page.locator('.dtm-literal-grade-table thead th').allTextContents(),['評分項目','計算後權量','成績','全距','百分比','排名','回饋','貢獻到課程總分']);
  for(const item of report.items){
    const row=page.locator('#report-item-'+item.id);assert.equal(await row.locator('th').textContent(),item.label);
    assert.deepEqual(await row.locator('td').allTextContents(),[(item.weightText??'-')+(item.weightNote??''),...['gradeText','rangeText','percentageText','rankText','feedbackText','contributionText'].map(key=>item[key]??'-')]);
  }
  assert.deepEqual(await page.locator('.dtm-literal-grade-total td').allTextContents(),['-','0','','unconfirmed','literal rank','Explicit saved total','0.00']);
  assert.equal(await page.locator('.dtm-literal-grade-item img').count(),1);assert.equal(await page.locator('.dtm-literal-grade-table b').count(),0);
  assert.equal(await page.locator('.dtm-literal-grade-table').getByText('82.00',{exact:true}).count(),0);
  await geometry(page,'report','.dtm-literal-grade-table');
  for(const width of [1533,768,390,320]){
    await shot(page,'report',width);
    if(width<=390){const region=page.getByRole('region',{name:'成績報告',exact:true});await region.focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('.dtm-literal-grade-scroll').scrollLeft>0);}
  }
  evidence.checks.push('8 literal columns, explicit total, null/blank/zero, escaped text, responsive report');
  evidence.stage='legacy links and menu';
  await visit(page,reportPath+'#grade-'+legacyId,'.dtm-literal-grade-table');
  const dialog=page.getByRole('dialog',{name:legacy.label,exact:true});await dialog.waitFor();await dialog.getByText(legacy.feedback,{exact:true}).waitFor();
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'課程選單',exact:true}).click();
  for(const name of ['教材','上課紀錄','作業','成績','個人成績紀錄','新增成績'])assert.equal(await page.getByRole('menuitem',{name,exact:true}).count(),1,`Course menu ${name}`);
  await page.getByRole('menuitem',{name:'個人成績紀錄',exact:true}).click();
  const entryList=page.getByRole('dialog',{name:'個人成績紀錄',exact:true});
  await entryList.getByRole('button',{name:legacy.label,exact:true}).click();await entryList.waitFor({state:'hidden'});await dialog.waitFor();await settle(page);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  evidence.checks.push('legacy #grade UUID opens personal entry; course menu remains');
  evidence.stage='contextual overview';
  const contextualPath=reportPath+'/overview';
  const reportReads=evidence.apiReads.filter(read=>read.scope==='dtm-grade-report').length;
  await page.getByRole('navigation',{name:'成績報告檢視',exact:true}).getByRole('link',{name:'綜覽報告',exact:true}).click();
  await page.locator('.dtm-grade-overview-table').waitFor();assert.equal(new URL(page.url()).pathname,contextualPath);
  await page.getByRole('heading',{level:1,name:'Synthetic A course 001: 瀏覽: 綜覽報告',exact:true}).waitFor();
  assert.equal(await page.locator('.dtm-tree-selected > summary').textContent(),'Synthetic A course 001');
  assert.equal(await page.locator('.dtm-grade-navigation a[aria-current=page]').textContent(),'綜覽報告');
  assert.equal(await page.getByRole('navigation',{name:'頁面位置',exact:true}).getByRole('link',{name:'成績管理',exact:true}).count(),0);
  assert.equal(evidence.apiReads.filter(read=>read.scope==='dtm-grade-report').length,reportReads,'Context overview does not load an individual report');
  assert.equal(await page.locator('.dtm-grade-overview-table tbody tr').count(),47,'Context overview still includes all owned courses');
  await geometry(page,'overview','.dtm-grade-overview-table');
  for(const width of [1533,768,390,320])await shot(page,'contextual-overview',width);
  await page.getByRole('navigation',{name:'成績報告檢視',exact:true}).getByRole('link',{name:'用戶報告',exact:true}).click();
  await page.locator('.dtm-literal-grade-table').waitFor();assert.equal(new URL(page.url()).pathname,reportPath);
  await page.getByRole('heading',{level:1,name:'Synthetic A course 001: 瀏覽: 用戶報告',exact:true}).waitFor();
  const priorMissingReads=evidence.apiReads.filter(read=>read.scope==='dtm-grade-report-overview'||read.scope==='dtm-grade-report').length;
  await visit(page,'/dtm/course/'+uuid('c',999)+'/grades/overview','.dtm-center .dtm-card h2');await page.getByRole('heading',{name:'找不到課程或頁面',exact:true}).waitFor();
  assert.equal(await page.locator('.dtm-grade-overview-table,.dtm-literal-grade-table').count(),0);
  assert.equal(evidence.apiReads.filter(read=>read.scope==='dtm-grade-report-overview'||read.scope==='dtm-grade-report').length,priorMissingReads);
  evidence.checks.push('contextual overview retains course header/sidebar/tabs; round trip; unknown course fails closed');
  evidence.stage='overview';
  await visit(page,'/dtm/grades','.dtm-grade-overview-table');
  assert.deepEqual(await page.locator('.dtm-grade-overview-table thead th').allTextContents(),['課程名稱','成績']);
  assert.equal(await page.locator('.dtm-grade-overview-table tbody tr').count(),47);
  assert.deepEqual((await page.locator('.dtm-grade-overview-table tbody tr td:nth-child(2)').allTextContents()).slice(0,3),['0','','-']);
  assert.deepEqual(await page.locator('.dtm-grade-overview-table a').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href'))),courses(userA.id).map(row=>'/dtm/course/'+row.id+'/grades'));
  assert.equal(await page.getByRole('button',{name:'載入更多課程',exact:true}).count(),0);
  await geometry(page,'overview','.dtm-grade-overview-table');
  for(const width of [1533,768,390,320])await shot(page,'overview',width);
  await page.locator('.dtm-grade-overview-table a').first().click();await page.locator('.dtm-literal-grade-table').waitFor();assert.equal(new URL(page.url()).pathname,reportPath);
  evidence.checks.push('47-course 2-column overview; all local links; literal total vs absent/blank');
  evidence.stage='unavailable and retry';
  for(const mode of ['absent','error','foreign']){
    state.reportMode=mode;await visit(page,reportPath,'.dtm-literal-grade-state');await page.getByRole('button',{name:'重新載入成績報告',exact:true}).waitFor();
    assert.equal(await page.locator('.dtm-literal-grade-table,.dtm-literal-grade-total').count(),0);
    assert.equal(await page.getByText('FOREIGN_SENTINEL',{exact:true}).count(),0);
    state.reportMode='present';await page.getByRole('button',{name:'重新載入成績報告',exact:true}).click();await page.locator('.dtm-literal-grade-table').waitFor();
  }
  evidence.checks.push('absent/read error/foreign report fail closed; exact read retry');
  evidence.stage='late report and account reset';
  state.holdReport=true;await page.reload();
  await assertEventually(()=>state.heldReads>0,'Held report request started');
  await switchAccount(page,userB);await page.getByRole('heading',{name:'找不到課程或頁面',exact:true}).waitFor();
  state.holdReport=false;state.held.splice(0).forEach(release=>release());await settle(page);
  assert.equal(await page.locator('.dtm-literal-grade-table').count(),0);assert.equal(await page.getByText(report.items[0].label,{exact:true}).count(),0);
  await visit(page,'/dtm/grades','.dtm-grade-overview-table');assert.ok((await page.locator('.dtm-grade-overview-table a').allTextContents()).every(title=>title.startsWith('Synthetic B')));
  await switchAccount(page,null);await page.getByRole('button',{name:'Continue with Google',exact:true}).waitFor();
  assert.equal(await page.locator('.dtm-grade-overview-table,.dtm-literal-grade-table').count(),0);
  evidence.checks.push('account switch abort/reset ignores late A report; B isolated; signout clears tables');
  evidence.stage='pagination and retry';
  const paged=await context({paged:true});const morePage=await paged.ctx.newPage();diagnosticPage=morePage;
  await visit(morePage,'/dtm/grades','.dtm-grade-overview-table');assert.equal(await morePage.locator('.dtm-grade-overview-table tbody tr').count(),100);
  paged.state.overviewFailure=true;await morePage.getByRole('button',{name:'載入更多課程',exact:true}).click();await morePage.locator('.dtm-grade-overview [role=alert]').waitFor();assert.equal(await morePage.locator('.dtm-grade-overview-table tbody tr').count(),100);
  paged.state.overviewFailure=false;await morePage.getByRole('button',{name:'重試',exact:true}).click();await morePage.waitForFunction(()=>document.querySelectorAll('.dtm-grade-overview-table tbody tr').length===101);assert.equal(await morePage.getByRole('button',{name:'載入更多課程',exact:true}).count(),0);
  evidence.checks.push('100+1 paged rows; failed next page retains rows and same cursor retry');
  const guest=await context({signedIn:false});const guestPage=await guest.ctx.newPage();diagnosticPage=guestPage;
  for(const path of [reportPath,contextualPath,'/dtm/grades']){await guestPage.goto(base+path);await guestPage.getByRole('button',{name:'Continue with Google',exact:true}).waitFor();assert.equal(new URL(guestPage.url()).pathname,'/dtm/login');assert.equal(await guestPage.locator('.dtm-literal-grade-table,.dtm-grade-overview-table').count(),0);}
  evidence.checks.push('report, contextual and global overview routes guest gated');
  assert.deepEqual(evidence.blockedRequests,[]);assert.deepEqual(evidence.pageErrors,[]);assert.ok(evidence.entries.length>0,'Compiled application entry required');assert.deepEqual(evidence.geometryFailures,[],'Source geometry differences require review');
  evidence.status='passed';evidence.stage='complete';
}catch(error){evidence.status='failed';evidence.failure={name:error.name,message:error.message};if(diagnosticPage&&!diagnosticPage.isClosed())await diagnosticPage.screenshot({path:resolve(directory,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{
  await Promise.allSettled(contexts.map(ctx=>ctx.close()));
  if(browser)try{await browser.close();}catch(error){evidence.status='failed';evidence.cleanupFailure={name:error.name,message:error.message};process.exitCode=1;}
  if(production&&evidence.release.before)try{evidence.release.after=await releaseManifest(base,expectedRevision);}catch(error){evidence.status='failed';evidence.stage='release after';evidence.releaseFailure={name:error.name,message:error.message};process.exitCode=1;}
  await writeFile(resolve(directory,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,stage:evidence.stage,checks:evidence.checks.length,screenshots:evidence.screenshots.length,entries:evidence.entries,expectedReleaseRevision:expectedRevision,release:evidence.release,result:resolve(directory,'result.json'),failure:evidence.failure,releaseFailure:evidence.releaseFailure}));
}
async function assertEventually(predicate,label){const deadline=Date.now()+10000;while(!predicate()){assert.ok(Date.now()<deadline,label);await new Promise(done=>setTimeout(done,25));}}
