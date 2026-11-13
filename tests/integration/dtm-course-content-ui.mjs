import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {affairsTestUser,affairsTestSession,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {parseDtmCourseContentData,parseDtmCourseContentAssignmentData} from '../../server/dtmCourseContent.js';

// Deliberately separate from the historical course UI harness. Never calls live APIs.
// Production permits only the pinned public shell/assets; account traffic stays mocked.
function target(value,revision){
  const origin=new URL(value),production=origin.origin==='https://stu.best';
  assert.ok((production||origin.protocol==='http:'&&['127.0.0.1','localhost'].includes(origin.hostname))&&origin.pathname==='/'&&!origin.search&&!origin.hash&&!origin.username&&!origin.password,'Exact production or local origin only');
  if(production)assert.match(revision||'',/^[0-9a-f]{40}$/,'Production requires EXPECTED_RELEASE_REVISION: full lowercase 40-hex SHA');
  return {origin,production,expectedRevision:production?revision:null};
}
async function publicText(url,limit,fetcher=globalThis.fetch){
  const signal=AbortSignal.timeout(10000);
  const bounded=task=>new Promise((resolveTask,reject)=>{
    signal.throwIfAborted();const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void Promise.resolve().then(()=>{signal.throwIfAborted();return task();}).then(value=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else resolveTask(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
  const response=await bounded(()=>fetcher(url,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',signal}));
  let reader;
  try{
    assert.equal(response.status,200,'Public release guard requires HTTP200');assert.equal(response.redirected,false,'Public release redirect forbidden');
    assert.ok(response.body,'Public release body required');assert.ok(Number(response.headers.get('content-length')||0)<=limit,'Public release body exceeds byte bound');
    reader=response.body.getReader();const decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text='';
    for(;;){const {done,value}=await bounded(()=>reader.read());if(done)break;size+=value.byteLength;assert.ok(size<=limit,'Public release body exceeds byte bound');text+=decoder.decode(value,{stream:true});}
    return text+decoder.decode();
  }finally{if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}else void response.body?.cancel().catch(()=>{});}
}
async function releaseManifest(base,revision,fetcher){
  const value=JSON.parse(await publicText(base+'/release.json',4096,fetcher));
  assert.ok(value&&typeof value==='object'&&!Array.isArray(value),'Release object required');
  assert.equal(value.version,1);assert.equal(value.revision,revision,'Production revision changed or does not match');assert.equal(value.environment,'production');assert.equal(value.source,'vercel-git');
  assert.ok(typeof value.builtAt==='string'&&Number.isFinite(Date.parse(value.builtAt)),'Release build timestamp required');
  return {version:value.version,revision:value.revision,environment:value.environment,source:value.source,builtAt:value.builtAt};
}
async function compiledEntry(base,fetcher){
  const html=await publicText(base+'/dtm',262144,fetcher);
  assert.ok(!html.includes('/@vite/client')&&!html.includes('src="/src/'),'Compiled public shell required');
  const entries=[...html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["'](\/assets\/index-[\w-]+\.js)["'][^>]*>/g)].map(match=>match[1]);
  assert.equal(entries.length,1,'Exactly one compiled module entry required');return entries[0];
}
const {origin,production,expectedRevision}=target(process.env.PUBLIC_SITE_ORIGIN||'http://127.0.0.1:5184',process.env.EXPECTED_RELEASE_REVISION);
const base=origin.origin,uuid=(family,n)=>`${family}0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const userA=affairsTestUser,userB={...affairsTestUser,id:uuid('b',2),email:'other.synthetic@example.invalid',user_metadata:{name:'Synthetic B'},identities:[{provider:'google',id:'synthetic-b',user_id:uuid('b',2),identity_data:{email_verified:true}}]};
const users=new Map([userA,userB].map(user=>[user.id,user]));
const courseFor=userId=>({id:userId===userA.id?uuid('c',1):uuid('c',2),userId,title:userId===userA.id?'Synthetic ordered course':'Synthetic B course',code:'SYN-CONTENT',term:'Synthetic term'});
const course=courseFor(userA.id),stamp='2026-11-13T00:00:00Z';
const assignment=(n,userId=userA.id)=>({kind:'assignment',id:uuid(userId===userA.id?'a':'b',n),title:`Synthetic ${userId===userA.id?'A':'B'} activity ${n}`,details:n===3?'Literal <b>private-free</b> instructions.':'',dueAt:n===3?null:`2030-01-${String(28-(n%20)).padStart(2,'0')}T08:00:00Z`});
const material=n=>({kind:'material',id:uuid('d',n),title:`Synthetic material ${n}`,materialKind:'page',summary:`Local material ${n} detail.`,position:8-n,sourceMode:'personal',sourceUrl:null});
const activities=()=>[...Array.from({length:7},(_,i)=>assignment(i+1)),...Array.from({length:7},(_,i)=>material(i+1))];
const references=[...[3,1,5,4,2].map(n=>({kind:'assignment',id:uuid('a',n),section:'assignments'})),{kind:'assignment',id:uuid('a',7),section:'quizzes'},
  {kind:'assignment',id:uuid('a',999),section:'quizzes'},...Array.from({length:7},(_,i)=>({kind:'material',id:uuid('d',7-i),section:'materials'}))];
const content={id:uuid('e',1),userId:userA.id,courseId:course.id,sourceMode:'local_demo',version:2,createdAt:stamp,updatedAt:stamp,references};
const key=row=>row.kind+':'+row.id;
function pageData(userId,state,cursor){
  const inventory=userId===userB.id?[assignment(1,userB.id)]:state.mode==='empty'?[]:state.paged?[...Array.from({length:99},(_,i)=>assignment(i+1)),material(1),material(2)]:activities();
  const all=inventory.filter(row=>!(state.deleted||[]).includes(key(row)));
  const saved=userId===userB.id||['defaults','empty'].includes(state.mode)?null:content;
  const offset=cursor?all.findIndex(row=>key(row)===key(cursor))+1:0;assert.ok(!cursor||offset>0,'Exact known fixture cursor');
  const rows=all.slice(offset,offset+100),more=offset+rows.length<all.length,last=rows.at(-1);
  const data={course:courseFor(userId),content:saved,activities:rows,total:all.length,limit:100,nextCursor:more?{kind:last.kind,id:last.id}:null,
    revision:createHash('sha256').update(JSON.stringify({course:courseFor(userId),saved,all})).digest('hex'),unavailableReferenceCount:saved?saved.references.filter(ref=>!all.some(row=>key(row)===key(ref))).length:0};
  if(state.mode==='foreign')data.course={...data.course,userId:userB.id,title:'FOREIGN_SENTINEL'};
  if(cursor&&state.mode==='revision-change')data.revision='f'.repeat(64);
  if(cursor&&state.mode==='total-change')data.total++;
  if(cursor&&state.mode==='duplicate')data.activities=[all[0]];
  return data;
}
const snapshot=userId=>({checkedAt:stamp,officialUniversityData:false,profile:{userId,email:users.get(userId).email,displayName:users.get(userId).user_metadata.name,role:'student'},student:null,
  courses:[],charges:[],assignments:[],announcements:[],tasks:[],requests:[],serviceRecords:[],
  dtm:{sourceMode:'personal',notices:[],courses:[{...courseFor(userId),role:'student',sourceMode:'personal',materials:[],meetings:[],grades:[]}]}});
function assignmentData(userId,id){const activity=activities().find(row=>row.kind==='assignment'&&row.id===id);assert.ok(userId===userA.id&&activity,'Only own known assignment');return {assignment:{id,userId,courseId:course.id,title:activity.title,details:activity.details,dueAt:activity.dueAt,status:'open',submittedAt:null,sourceMode:'personal',meetingId:null,origin:'manual'}};}
if(process.argv.includes('--self-test')){
  const state={mode:'saved',paged:false};const first=pageData(userA.id,state);parseDtmCourseContentData(first,userA.id,course.id);assert.equal(first.unavailableReferenceCount,1);
  assert.throws(()=>parseDtmCourseContentData(first,userB.id,course.id));assert.throws(()=>parseDtmCourseContentData({...first,course:{...first.course,id:uuid('c',99)}},userA.id,course.id));
  const empty=pageData(userA.id,{mode:'empty',paged:false});assert.equal(parseDtmCourseContentData(empty,userA.id,course.id).content,null);
  const paged=pageData(userA.id,{mode:'saved',paged:true});assert.equal(paged.activities.length,100);assert.equal(paged.nextCursor.kind,'material');const second=pageData(userA.id,{mode:'saved',paged:true},paged.nextCursor);parseDtmCourseContentData(second,userA.id,course.id,paged.nextCursor);assert.equal(second.activities.length,1);assert.equal(second.revision,paged.revision);
  parseDtmCourseContentAssignmentData(assignmentData(userA.id,uuid('a',7)),userA.id,course.id,uuid('a',7));
  const revision='a'.repeat(40),manifest={version:1,revision,environment:'production',source:'vercel-git',builtAt:'2026-11-13T00:00:00.000Z'};
  let guardContracts=0;
  for(const local of ['http://127.0.0.1:5184','http://localhost:5176']){assert.equal(target(local).production,false);guardContracts++;}
  assert.equal(target('https://stu.best',revision).production,true);guardContracts++;
  for(const invalid of ['https://example.invalid','https://stu.best.evil.invalid','https://stu.best:444','http://stu.best','https://stu.best/path','https://stu.best?x=1','https://stu.best#x','https://user@stu.best']){assert.throws(()=>target(invalid,revision));guardContracts++;}
  for(const invalid of [undefined,'','a'.repeat(39),'A'.repeat(40),'g'.repeat(40)]){assert.throws(()=>target('https://stu.best',invalid));guardContracts++;}
  const checkRequest=(url,options,path)=>{assert.equal(url,'https://stu.best'+path);assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.ok(options.signal instanceof AbortSignal);assert.equal(options.headers,undefined);};
  assert.deepEqual(await releaseManifest('https://stu.best',revision,async(url,options)=>{checkRequest(url,options,'/release.json');return Response.json(manifest);}),manifest);guardContracts++;
  for(const changed of [{revision:'b'.repeat(40)},{environment:'preview'},{source:'unverified'},{version:2},{builtAt:null}]){await assert.rejects(()=>releaseManifest('https://stu.best',revision,async()=>Response.json({...manifest,...changed})));guardContracts++;}
  for(const response of [new Response('x'.repeat(4097)),Response.json(manifest,{status:503}),new Response(new Uint8Array([0xff]))]){await assert.rejects(()=>releaseManifest('https://stu.best',revision,async()=>response));guardContracts++;}
  const redirected=Response.json(manifest);Object.defineProperty(redirected,'redirected',{value:true});await assert.rejects(()=>releaseManifest('https://stu.best',revision,async()=>redirected));guardContracts++;
  const entry='/assets/index-synthetic.js',shell='<script type="module" crossorigin src="'+entry+'"></script>';
  assert.equal(await compiledEntry('https://stu.best',async(url,options)=>{checkRequest(url,options,'/dtm');return new Response(shell);}),entry);guardContracts++;
  for(const html of ['',shell+shell,shell+'<script src="/@vite/client"></script>','<script type="module" src="https://other.invalid/assets/index-x.js"></script>']){await assert.rejects(()=>compiledEntry('https://stu.best',async()=>new Response(html)));guardContracts++;}
  const afterEntry=await compiledEntry('https://stu.best',async()=>new Response(shell.replace('synthetic','changed')));assert.throws(()=>assert.equal(afterEntry,entry));guardContracts++;
  console.log(JSON.stringify({status:'ok',fixtureContracts:7,productionGuardContracts:guardContracts,browserConnections:0,networkCalls:0}));process.exit(0);
}
const directory=resolve('artifacts/dtm-course-content-ui',new Date().toISOString().replaceAll(':','-'));await mkdir(directory,{recursive:true});
const evidence={status:'running',stage:'initialization',origin:base,syntheticOnly:true,expectedReleaseRevision:expectedRevision,release:{before:null,after:null},compiledEntry:{before:null,after:null},sourceHash:createHash('sha256').update(await readFile('artifacts/visual-parity/dtm-course-reference-content.jpg')).digest('hex'),
  sourceBoundary:'Captured three-section read view only. No quiz engine, source editing controls or private source rows copied.',checks:[],geometry:[],screenshots:[],apiReads:[],blockedRequests:[],pageErrors:[],entries:[],liveApiCalls:0,liveAuthCalls:0,modelCalls:0,managerBrowserVerified:false};
const contexts=[];let browser,diagnosticPage;
function caller(request){const token=request.headers().authorization?.replace(/^Bearer /,'');assert.ok(token,'Synthetic bearer required');const id=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).sub;assert.ok(users.has(id));return id;}
function keys(params,names){assert.deepEqual([...params.keys()].sort(),names.slice().sort(),'Strict scope query');}
async function fixture({paged=false}={}){
  const ctx=await browser.newContext({viewport:{width:1533,height:900},serviceWorkers:'block',reducedMotion:'reduce'});contexts.push(ctx);ctx.setDefaultTimeout(12000);ctx.setDefaultNavigationTimeout(30000);
  const state={mode:'saved',paged,hold:false,held:[],heldReads:0,failLater:false,deleted:[]};
  await ctx.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());const deny=reason=>{evidence.blockedRequests.push({method:request.method(),origin:url.origin,path:url.pathname,...(reason?{reason}:{})});return route.abort('blockedbyclient');};
    if(url.origin!==base||request.method()!=='GET')return deny();
    if(url.pathname==='/@vite/client'||url.pathname.startsWith('/src/'))return deny('Compiled preview required');
    if(!url.pathname.startsWith('/api/'))return route.continue();
    try{
      const userId=caller(request);if(url.pathname==='/api/affairs-conversations'){keys(url.searchParams,[]);return route.fulfill({json:{conversations:[]}});}
      if(url.pathname!=='/api/affairs-data')return deny('Unknown API');
      const scope=url.searchParams.get('scope');evidence.apiReads.push({scope:scope||'snapshot',caller:userId===userA.id?'A':'B',cursor:url.searchParams.get('after_id')});
      if(scope===null){keys(url.searchParams,[]);return route.fulfill({json:snapshot(userId)});}
      if(scope==='dtm-course-content'){
        const afterId=url.searchParams.get('after_id'),afterKind=url.searchParams.get('after_kind');keys(url.searchParams,afterId?['scope','course_id','after_kind','after_id']:['scope','course_id']);assert.equal(url.searchParams.get('course_id'),courseFor(userId).id);assert.equal(Boolean(afterId),Boolean(afterKind));
        if(state.mode==='error'||afterId&&state.failLater)return route.fulfill({status:503,json:{error:'Synthetic unavailable'}});
        const body=pageData(userId,state,afterId?{kind:afterKind,id:afterId}:undefined);
        if(state.hold){state.heldReads++;await new Promise(done=>state.held.push(done));}
        await route.fulfill({json:body}).catch(error=>{if(!/closed|Target|Invalid InterceptionId/i.test(error.message))throw error;});return;
      }
      if(scope==='dtm-course-content-assignment'){
        keys(url.searchParams,['scope','course_id','assignment_id']);assert.equal(url.searchParams.get('course_id'),courseFor(userId).id);
        return route.fulfill({json:assignmentData(userId,url.searchParams.get('assignment_id'))});
      }
      if(scope==='dtm-submission'){
        keys(url.searchParams,['scope','assignment_id']);const id=url.searchParams.get('assignment_id'),row=assignmentData(userId,id).assignment;
        return route.fulfill({json:{assignmentId:id,userId,courseId:course.id,dueAt:row.dueAt,maxBytes:10485760,submission:null,files:[],reviews:[]}});
      }
      return deny('Unknown API scope');
    }catch(error){return deny(error.message);}
  });
  await mockAffairsAuth(ctx);
  await ctx.route('https://*.supabase.co/**',route=>{const request=route.request(),url=new URL(request.url());if(request.method()==='GET'&&url.pathname==='/auth/v1/user'&&!url.search)return route.fulfill({json:users.get(caller(request))});evidence.blockedRequests.push({method:request.method(),origin:url.origin,path:url.pathname});return route.abort('blockedbyclient');});
  await ctx.addInitScript(()=>{if(window.top===window&&['http:','https:'].includes(location.protocol))localStorage.setItem('stu-dtm-language','zh');});
  await ctx.routeWebSocket('**/*',socket=>{evidence.blockedRequests.push({method:'WEBSOCKET'});socket.close();});
  ctx.on('page',page=>{page.on('pageerror',error=>evidence.pageErrors.push(error.message));page.on('response',response=>{const path=new URL(response.url()).pathname;if(/^\/assets\/index-[\w-]+\.js$/.test(path)&&!evidence.entries.includes(path))evidence.entries.push(path);});});
  return {ctx,state};
}
async function settle(page){await page.evaluate(async()=>{await document.fonts.ready;await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));});}
async function loaded(page,path){await page.goto(base+path);await page.locator('.dtm-course-section').first().waitFor();await settle(page);}
const sectionTitles=['作業區','測驗區','教材區'];
async function sectionOrder(page,index){return page.locator('.dtm-course-section').nth(index).locator('.dtm-course-activity').evaluateAll(nodes=>nodes.map(node=>node.id));}
async function assertSaved(page){
  assert.deepEqual(await page.locator('.dtm-course-section > h3').allTextContents(),sectionTitles);
  assert.deepEqual(await sectionOrder(page,0),[3,1,5,4,2,6].map(n=>'assignment-'+uuid('a',n)));
  assert.deepEqual(await sectionOrder(page,1),['assignment-'+uuid('a',7)]);
  assert.equal(await page.locator('#assignment-'+uuid('a',7)+' img').getAttribute('src'),'/dtm-theme/assign.svg','Placement in quizzes does not invent a quiz entity');
  assert.deepEqual(await sectionOrder(page,2),[7,6,5,4,3,2,1].map(n=>'material-'+uuid('d',n)));
  assert.equal(await page.locator('#assignment-'+uuid('a',999)).count(),0);assert.equal(await page.locator('.dtm-course-activity').count(),14);
  assert.equal(await page.locator('.dtm-course-content input,.dtm-course-content select,.dtm-course-content textarea').count(),0);
}
async function retry(page){const alert=page.getByRole('alert');await alert.waitFor();assert.equal(await page.locator('.dtm-course-activity').count(),0,'Failed/incomplete inventory is never rendered');await page.getByRole('button',{name:/重新載入|重試/}).click();}
async function shot(page,width){await page.setViewportSize({width,height:900});await settle(page);const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(bounds.scroll<=bounds.width+1,'No document overflow at '+width);const path=resolve(directory,'course-'+width+'.png');await page.screenshot({path,fullPage:true});evidence.screenshots.push({width,path,bounds});}
async function changeUser(page,user){const session=user?affairsTestSession(user):null;await page.evaluate(session=>{if(session)localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));else localStorage.removeItem('stu-school-affairs-auth');const channel=new BroadcastChannel('stu-school-affairs-auth');channel.postMessage({event:session?'SIGNED_IN':'SIGNED_OUT',session});setTimeout(()=>channel.close(),100);},session);}
async function until(predicate){const deadline=Date.now()+12000;while(!predicate()){assert.ok(Date.now()<deadline,'Bounded fixture wait');await new Promise(done=>setTimeout(done,25));}}
try{
  evidence.stage='public release guard';if(production)evidence.release.before=await releaseManifest(base,expectedRevision);
  evidence.compiledEntry.before=await compiledEntry(base);
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const {ctx,state}=await fixture(),page=await ctx.newPage();diagnosticPage=page;const path='/dtm/course/'+course.id;
  evidence.stage='saved placement';await loaded(page,path);await assertSaved(page);
  assert.equal(await page.locator('.dtm-course-content b').count(),0,'Material/instruction content remains text');
  for(const [selector,expected] of [['.dtm-left',{x:20,y:166,width:344.53}],['.dtm-center',{x:402.83,y:166,width:1110.17}]]){const actual=await page.locator(selector).boundingBox();evidence.geometry.push({selector,actual,expected});for(const field of ['x','y','width'])assert.ok(Math.abs(actual[field]-expected[field])<=1,selector+' source '+field);}
  for(const width of [1533,768,390,320])await shot(page,width);
  await page.reload();await page.locator('.dtm-course-section').first().waitFor();await assertSaved(page);
  evidence.checks.push('saved within-section order survives reload; missing ID omitted; unplaced activity appended exactly once; source shell and mobile containment');
  state.deleted=['assignment:'+uuid('a',3)];await page.reload();await page.locator('.dtm-course-section').first().waitFor();assert.deepEqual(await sectionOrder(page,0),[1,5,4,2,6].map(n=>'assignment-'+uuid('a',n)));assert.equal(await page.locator('#assignment-'+uuid('a',3)).count(),0);assert.equal(await page.locator('.dtm-course-activity').count(),13);
  assert.equal(pageData(userA.id,state).unavailableReferenceCount,2);state.deleted=[];
  evidence.checks.push('refresh after synthetic activity deletion omits stale placement without hiding remaining records');
  evidence.stage='activity navigation';await page.locator('#material-'+uuid('d',7)+' button').click();const materialDialog=page.getByRole('dialog',{name:material(7).title,exact:true});await materialDialog.getByText(material(7).summary,{exact:true}).waitFor();await settle(page);await page.keyboard.press('Escape');await materialDialog.waitFor({state:'hidden'});
  await page.locator('#assignment-'+uuid('a',7)+' button').click();await page.waitForURL(base+path+'/assignment/'+uuid('a',7));await page.getByRole('table',{name:'作業繳交狀態',exact:true}).waitFor();
  assert.ok(evidence.apiReads.some(row=>row.scope==='dtm-course-content-assignment'));assert.ok(evidence.apiReads.some(row=>row.scope==='dtm-submission'));assert.equal(snapshot(userA.id).assignments.length,0);
  evidence.checks.push('assignment in quiz section uses exact assignment lookup and existing submission view; material opens local detail');
  evidence.stage='defaults and failures';state.mode='defaults';await loaded(page,path);assert.deepEqual(await sectionOrder(page,0),[7,6,5,4,2,1,3].map(n=>'assignment-'+uuid('a',n)));assert.deepEqual(await sectionOrder(page,1),[]);assert.deepEqual(await sectionOrder(page,2),[7,6,5,4,3,2,1].map(n=>'material-'+uuid('d',n)));
  for(const mode of ['error','foreign']){state.mode=mode;await page.goto(base+path);await page.getByRole('alert').waitFor();assert.equal(await page.getByText('FOREIGN_SENTINEL',{exact:true}).count(),0);state.mode='saved';await retry(page);await page.locator('.dtm-course-section').first().waitFor();await assertSaved(page);}
  state.mode='empty';await loaded(page,path);assert.deepEqual(await page.locator('.dtm-course-section > h3').allTextContents(),sectionTitles);assert.equal(await page.locator('.dtm-course-activity').count(),0);
  evidence.checks.push('successful null/default/empty distinguished from unavailable/foreign responses; retry restores saved placement');
  evidence.stage='account reset';state.mode='saved';state.hold=true;await page.goto(base+path);await until(()=>state.heldReads>0);await changeUser(page,userB);await page.getByRole('heading',{name:'找不到課程或頁面',exact:true}).waitFor();state.hold=false;state.held.splice(0).forEach(done=>done());await settle(page);assert.equal(await page.locator('.dtm-course-activity').count(),0);
  await loaded(page,'/dtm/course/'+courseFor(userB.id).id);assert.deepEqual(await sectionOrder(page,0),['assignment-'+uuid('b',1)]);assert.equal(await page.getByText(assignment(1).title,{exact:true}).count(),0);await changeUser(page,null);await page.getByRole('button',{name:'Continue with Google',exact:true}).waitFor();assert.equal(await page.locator('.dtm-course-content').count(),0);
  evidence.checks.push('account switch aborts pending inventory, ignores late A page and clears data on signout');
  evidence.stage='consistent paging';const paged=await fixture({paged:true}),many=await paged.ctx.newPage();diagnosticPage=many;
  for(const mode of ['revision-change','total-change','duplicate']){paged.state.mode=mode;await many.goto(base+path);await many.getByRole('alert').waitFor();assert.equal(await many.locator('.dtm-course-activity').count(),0);paged.state.mode='saved';await retry(many);await many.locator('.dtm-course-section').first().waitFor();assert.equal(await many.locator('.dtm-course-activity').count(),101);}
  paged.state.failLater=true;await many.reload();await many.getByRole('alert').waitFor();assert.equal(await many.locator('.dtm-course-activity').count(),0);paged.state.failLater=false;await retry(many);await many.locator('.dtm-course-section').first().waitFor();assert.equal(await many.locator('.dtm-course-activity').count(),101);
  evidence.checks.push('100+1 inventory assembles before display; revision/total/duplicate/failed second-page responses fail closed and retry');
  assert.deepEqual(evidence.blockedRequests,[]);assert.deepEqual(evidence.pageErrors,[]);assert.deepEqual(evidence.entries,[evidence.compiledEntry.before],'Browser must load only the pinned compiled entry');evidence.status='passed';evidence.stage='complete';
}catch(error){evidence.status='failed';evidence.failure={name:error.name,message:error.message};if(diagnosticPage&&!diagnosticPage.isClosed())await diagnosticPage.screenshot({path:resolve(directory,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{
  await Promise.allSettled(contexts.map(ctx=>ctx.close()));await browser?.close().catch(error=>{evidence.status='failed';evidence.cleanupFailure={name:error.name};process.exitCode=1;});
  if(evidence.compiledEntry.before)try{
    if(production)evidence.release.after=await releaseManifest(base,expectedRevision);
    evidence.compiledEntry.after=await compiledEntry(base);
    assert.equal(evidence.compiledEntry.after,evidence.compiledEntry.before,'Compiled entry changed during acceptance');
    if(production)assert.deepEqual(evidence.release.after,evidence.release.before,'Release manifest changed during acceptance');
  }catch(error){evidence.status='failed';evidence.releaseGuardFailure={name:error.name,message:error.message};process.exitCode=1;}
  await writeFile(resolve(directory,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,stage:evidence.stage,checks:evidence.checks.length,entries:evidence.entries,expectedReleaseRevision:expectedRevision,result:resolve(directory,'result.json'),failure:evidence.failure,releaseGuardFailure:evidence.releaseGuardFailure}));
}
