import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {affairsTestUser,affairsTestSession,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {parseDtmCourseResourceData} from '../../server/dtmCourseResource.js';
import {parseDtmCourseContentData,parseDtmCourseContentAssignmentData} from '../../server/dtmCourseContent.js';

// Only public shell/assets may use the exact pinned production origin.
// All account/API responses stay synthetic; writes and external targets are blocked.
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
const users=new Map([userA,userB].map(user=>[user.id,user])),stamp='2026-11-13T00:00:00Z';
const courseFor=userId=>({id:uuid('c',userId===userA.id?1:2),userId,title:userId===userA.id?'Synthetic resource course':'Synthetic B course',code:'SYN-RESOURCE',term:'Synthetic term',sourceMode:'personal'});
const materialFor=userId=>({id:uuid(userId===userA.id?'d':'b',301),userId,courseId:courseFor(userId).id,title:userId===userA.id?'Synthetic resource':'Synthetic B resource',kind:'page',summary:'Literal <b>synthetic</b> summary.',position:301,sourceMode:'personal',sourceUrl:'https://dtm.stu.edu.tw/mod/url/view.php?id=990001',targetUrl:'https://example.com/course-resource?unit=1#details'});
const legacyFor=userId=>({...materialFor(userId),id:uuid(userId===userA.id?'d':'b',2),title:'Saved personal material',position:2,targetUrl:null});
const assignmentFor=userId=>({id:uuid('a',userId===userA.id?1:2),userId,courseId:courseFor(userId).id,title:'Synthetic exact assignment',details:'Independent exact assignment instructions.',dueAt:'2030-01-01T08:00:00Z',status:'open',submittedAt:null,sourceMode:'personal',meetingId:null,origin:'manual'});
const course=courseFor(userA.id),material=materialFor(userA.id),coursePath=id=>'/dtm/course/'+id,resourcePath=(c,m)=>coursePath(c)+'/material/'+m;
function resourceData(userId,mode='present'){
  const data={course:courseFor(userId),material:mode==='missing'?null:materialFor(userId)};
  if(mode==='foreign')data.material={...data.material,userId:userB.id,title:'FOREIGN_RESOURCE_SENTINEL'};
  if(mode==='foreign-course')data.course={...data.course,userId:userB.id};
  if(mode==='mismatched-course')data.material={...data.material,courseId:uuid('c',999)};
  if(mode==='no-target')data.material.targetUrl=null;
  if(mode==='unsafe')data.material.targetUrl='javascript:alert(1)';
  return data;
}
function snapshot(userId){const legacy=legacyFor(userId);return {checkedAt:stamp,officialUniversityData:false,
  profile:{userId,email:users.get(userId).email,displayName:users.get(userId).user_metadata.name,role:'student'},student:null,courses:[],charges:[],assignments:[],announcements:[],tasks:[],requests:[],serviceRecords:[],
  dtm:{sourceMode:'personal',notices:[],courses:[{...courseFor(userId),role:'student',materials:[{id:legacy.id,title:legacy.title,kind:legacy.kind,summary:legacy.summary,position:legacy.position,sourceMode:legacy.sourceMode,sourceUrl:legacy.sourceUrl,targetUrl:legacy.targetUrl}],meetings:[],grades:[]}]}};}
function contentData(userId){const c=courseFor(userId),a=assignmentFor(userId),activities=[{kind:'assignment',id:a.id,title:a.title,details:a.details,dueAt:a.dueAt},...[legacyFor(userId),materialFor(userId)].map(m=>({kind:'material',id:m.id,title:m.title,materialKind:m.kind,summary:m.summary,position:m.position,sourceMode:m.sourceMode,sourceUrl:m.sourceUrl}))];return {course:{id:c.id,userId,title:c.title,code:c.code,term:c.term},content:null,activities,total:3,limit:100,nextCursor:null,revision:createHash('sha256').update(JSON.stringify(activities)).digest('hex'),unavailableReferenceCount:0};}
if(process.argv.includes('--self-test')){
  const data=resourceData(userA.id);assert.deepEqual(parseDtmCourseResourceData(data,userA.id,course.id,material.id),data);
  assert.equal(parseDtmCourseResourceData(resourceData(userA.id,'missing'),userA.id,course.id,material.id).material,null);
  assert.equal(parseDtmCourseResourceData(resourceData(userA.id,'no-target'),userA.id,course.id,material.id).material.targetUrl,null);
  for(const mode of ['foreign','foreign-course','mismatched-course','unsafe'])assert.throws(()=>parseDtmCourseResourceData(resourceData(userA.id,mode),userA.id,course.id,material.id));
  assert.equal(snapshot(userA.id).dtm.courses[0].materials.some(row=>row.id===material.id),false);
  assert.equal(contentData(userA.id).activities.some(row=>row.id===material.id),true);
  assert.deepEqual(parseDtmCourseContentData(contentData(userA.id),userA.id,course.id),contentData(userA.id));
  const assignment=assignmentFor(userA.id);assert.deepEqual(parseDtmCourseContentAssignmentData({assignment},userA.id,course.id,assignment.id),{assignment});
  assert.notEqual(material.targetUrl,material.sourceUrl);assert.ok(!material.targetUrl.includes('stu.edu.tw'));
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
  console.log(JSON.stringify({status:'ok',fixtureContracts:12,productionGuardContracts:guardContracts,browserConnections:0,networkCalls:0}));process.exit(0);
}
const directory=resolve('artifacts/dtm-course-resource-ui',new Date().toISOString().replaceAll(':','-'));await mkdir(directory,{recursive:true});
const sourceBytes=await readFile('artifacts/visual-parity/dtm-url-resource/geometry.json'),source=JSON.parse(sourceBytes);
const evidence={status:'running',stage:'initialization',origin:base,syntheticOnly:true,expectedReleaseRevision:expectedRevision,release:{before:null,after:null},compiledEntry:{before:null,after:null},sourceGeometryHash:createHash('sha256').update(sourceBytes).digest('hex'),
  sourceBoundary:'Only source URL-resource pane geometry is compared; private course titles, identities and destination URLs are not fixture data. Sidebar/footer height depends on different synthetic navigation.',
  checks:[],geometry:[],screenshots:[],apiReads:[],blockedRequests:[],pageErrors:[],entries:[],liveApiCalls:0,liveAuthCalls:0,modelCalls:0,mutations:0};
const contexts=[];let browser,diagnosticPage;
function caller(request){const token=request.headers().authorization?.replace(/^Bearer /,'');assert.ok(token,'Synthetic token required');const id=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).sub;assert.ok(users.has(id),'Known synthetic caller only');return id;}
function keys(params,expected){assert.deepEqual([...params.keys()].sort(),expected.slice().sort(),'Exact selectors without repetitions');}
async function fixture({signedIn=true}={}){
  const ctx=await browser.newContext({viewport:{width:1533,height:1399},serviceWorkers:'block',reducedMotion:'reduce'});contexts.push(ctx);ctx.setDefaultTimeout(12000);ctx.setDefaultNavigationTimeout(30000);
  const state={mode:'present',snapshotMode:'normal',hold:false,held:[],heldReads:0};
  await ctx.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());const deny=reason=>{evidence.blockedRequests.push({method:request.method(),origin:url.origin,path:url.pathname,...(reason?{reason}:{})});return route.abort('blockedbyclient');};
    if(request.method()!=='GET'||url.origin!==base)return deny();
    if(url.pathname==='/@vite/client'||url.pathname.startsWith('/src/'))return deny('Compiled preview required');
    if(!url.pathname.startsWith('/api/'))return route.continue();
    try{
      const userId=caller(request);if(url.pathname==='/api/affairs-conversations'){keys(url.searchParams,[]);return route.fulfill({json:{conversations:[]}});}
      if(url.pathname!=='/api/affairs-data')return deny('Unknown API');
      const scope=url.searchParams.get('scope');evidence.apiReads.push({scope:scope||'snapshot',caller:userId===userA.id?'A':'B'});
      if(scope===null){keys(url.searchParams,[]);if(state.snapshotMode==='error')return route.fulfill({status:503,json:{error:'Synthetic broader snapshot unavailable'}});const data=snapshot(userId);if(state.snapshotMode==='omit-course')data.dtm.courses=[];return route.fulfill({json:data});}
      if(scope==='dtm-course-content'){keys(url.searchParams,['scope','course_id']);assert.equal(url.searchParams.get('course_id'),courseFor(userId).id);return route.fulfill({json:contentData(userId)});}
      if(scope==='dtm-course-content-assignment'){
        keys(url.searchParams,['scope','course_id','assignment_id']);const assignment=assignmentFor(userId);assert.equal(url.searchParams.get('course_id'),assignment.courseId);assert.equal(url.searchParams.get('assignment_id'),assignment.id);return route.fulfill({json:{assignment}});
      }
      if(scope==='dtm-submission'){
        keys(url.searchParams,['scope','assignment_id']);const assignment=assignmentFor(userId);assert.equal(url.searchParams.get('assignment_id'),assignment.id);return route.fulfill({json:{assignmentId:assignment.id,userId,courseId:assignment.courseId,dueAt:assignment.dueAt,maxBytes:10485760,submission:null,files:[],reviews:[]}});
      }
      if(scope==='dtm-course-resource'){
        keys(url.searchParams,['scope','course_id','material_id']);const selected=url.searchParams.get('course_id');
        assert.ok([courseFor(userA.id).id,courseFor(userB.id).id].includes(selected),'Known synthetic course only');
        const id=url.searchParams.get('material_id');assert.ok([userA.id,userB.id].flatMap(owner=>[materialFor(owner).id,legacyFor(owner).id]).includes(id));
        if(selected!==courseFor(userId).id)return route.fulfill({status:403,json:{error:'Synthetic owned-course denial'}});
        assert.ok([materialFor(userId).id,legacyFor(userId).id].includes(id),'Exact own fixture material');
        if(state.mode==='error')return route.fulfill({status:503,json:{error:'Synthetic resource read unavailable'}});
        const body=id===legacyFor(userId).id?{course:courseFor(userId),material:legacyFor(userId)}:resourceData(userId,state.mode);
        if(state.hold){state.heldReads++;await new Promise(done=>state.held.push(done));}
        await route.fulfill({json:body}).catch(error=>{if(!/closed|Target|Invalid InterceptionId/i.test(error.message))throw error;});return;
      }
      return deny('Unknown API scope');
    }catch(error){return deny(error.message);}
  });
  await mockAffairsAuth(ctx,{signedIn});
  await ctx.route('https://*.supabase.co/**',route=>{const request=route.request(),url=new URL(request.url());if(request.method()==='GET'&&url.pathname==='/auth/v1/user'&&!url.search)return route.fulfill({json:users.get(caller(request))});evidence.blockedRequests.push({method:request.method(),origin:url.origin,path:url.pathname});return route.abort('blockedbyclient');});
  await ctx.addInitScript(()=>{if(window.top===window&&['http:','https:'].includes(location.protocol))localStorage.setItem('stu-dtm-language','zh');});
  await ctx.routeWebSocket('**/*',socket=>{evidence.blockedRequests.push({method:'WEBSOCKET'});socket.close();});
  ctx.on('page',page=>{page.on('pageerror',error=>evidence.pageErrors.push(error.message));page.on('response',response=>{const path=new URL(response.url()).pathname;if(/^\/assets\/index-[\w-]+\.js$/.test(path)&&!evidence.entries.includes(path))evidence.entries.push(path);});});
  return {ctx,state};
}
async function settle(page){await page.evaluate(async()=>{await document.fonts.ready;await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));});}
async function resourceLoaded(page,userId=userA.id){await page.locator('.dtm-course-resource').getByRole('heading',{level:2,name:materialFor(userId).title,exact:true}).waitFor();await settle(page);}
async function openResource(page,userId=userA.id){await page.goto(base+resourcePath(courseFor(userId).id,materialFor(userId).id));await resourceLoaded(page,userId);}
async function safeLink(page,userId=userA.id){const row=materialFor(userId),link=page.locator('.dtm-course-resource a');assert.equal(await link.count(),1);assert.equal(await link.getAttribute('href'),row.targetUrl);assert.equal(await link.textContent(),row.targetUrl);assert.equal(await link.getAttribute('target'),'_blank');const rel=(await link.getAttribute('rel')||'').split(/\s+/);assert.ok(rel.includes('noopener')&&rel.includes('noreferrer'));assert.equal(await page.locator('.dtm-course-resource a[href="'+row.sourceUrl+'"]').count(),0);assert.equal(await page.getByRole('dialog').count(),0);}
async function retry(page){await page.getByRole('button',{name:/重試|重新載入.*教材|Retry|Reload.*resource/}).first().click();}
async function until(predicate){const deadline=Date.now()+12000;while(!predicate()){assert.ok(Date.now()<deadline,'Bounded fixture wait');await new Promise(done=>setTimeout(done,25));}}
async function changeUser(page,user){const session=user?affairsTestSession(user):null;await page.evaluate(session=>{if(session)localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));else localStorage.removeItem('stu-school-affairs-auth');const channel=new BroadcastChannel('stu-school-affairs-auth');channel.postMessage({event:session?'SIGNED_IN':'SIGNED_OUT',session});setTimeout(()=>channel.close(),100);},session);}
try{
  if(production)evidence.release.before=await releaseManifest(base,expectedRevision);
  evidence.compiledEntry.before=await compiledEntry(base);
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const {ctx,state}=await fixture(),page=await ctx.newPage();diagnosticPage=page;
  evidence.stage='native keyboard navigation';await page.goto(base+coursePath(course.id));const activity=page.locator('#material-'+material.id+' button');await activity.waitFor();await activity.focus();await page.keyboard.press('Enter');await page.waitForURL(base+resourcePath(course.id,material.id));await resourceLoaded(page);await safeLink(page);
  assert.equal(snapshot(userA.id).dtm.courses[0].materials.some(row=>row.id===material.id),false);assert.ok(evidence.apiReads.some(row=>row.scope==='dtm-course-resource'));
  await page.goBack();await activity.waitFor();await page.goForward();await resourceLoaded(page);const reads=evidence.apiReads.filter(row=>row.scope==='dtm-course-resource').length;await page.reload();await resourceLoaded(page);assert.ok(evidence.apiReads.filter(row=>row.scope==='dtm-course-resource').length>reads);await safeLink(page);
  evidence.checks.push('keyboard activity click opens native owned route beyond generic snapshot; back/forward/reload re-read exact material without modal');
  evidence.stage='source geometry and responsive containment';
  for(const [sourceSelector,localSelector,fields] of [['#region-main','.dtm-center',['x','y','width','height']],['#region-main h2','.dtm-course-resource h2',['x','y','width','height']],['#region-main .urlworkaround','.dtm-course-resource .urlworkaround',['x','y','width','height']],['#block-region-side-pre','.dtm-left',['x','y','width']]]){
    const expected=source.parts.find(part=>part.selector===sourceSelector);assert.ok(expected,'Captured geometry required');const actual=await page.locator(localSelector).boundingBox();assert.ok(actual,localSelector);evidence.geometry.push({sourceSelector,localSelector,expected:Object.fromEntries(fields.map(field=>[field,expected[field]])),actual});for(const field of fields)assert.ok(Math.abs(actual[field]-expected[field])<=1,sourceSelector+' '+field+' expected '+expected[field]+' got '+actual[field]);
  }
  for(const width of [1533,768,390,320]){await page.setViewportSize({width,height:width===1533?1399:900});await settle(page);await safeLink(page);const bounds=await page.evaluate(()=>({width:innerWidth,scroll:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)}));assert.ok(bounds.scroll<=bounds.width+1,'No document overflow at '+width);const path=resolve(directory,'resource-'+width+'.png');await page.screenshot({path,fullPage:true});evidence.screenshots.push({width,path,bounds});}
  evidence.checks.push('source pane/title/link geometry and four viewport containment; literal safe target is separate from source provenance');
  evidence.stage='null, unavailable and malformed boundaries';state.mode='no-target';await openResource(page);assert.equal(await page.locator('.dtm-course-resource a').count(),0);assert.equal(await page.locator('a[href="'+material.sourceUrl+'"]').count(),0);
  state.mode='missing';await page.reload();await page.getByRole('heading',{name:'找不到教材',exact:true}).waitFor();assert.equal(await page.locator('.dtm-course-resource a').count(),0);assert.equal(await page.locator('.dtm-course-resource h2').count(),0);
  for(const mode of ['error','foreign','foreign-course','mismatched-course','unsafe']){state.mode=mode;await page.goto(base+resourcePath(course.id,material.id));await page.getByRole('alert').waitFor();assert.equal(await page.locator('.dtm-course-resource').count(),0);assert.equal(await page.getByText('FOREIGN_RESOURCE_SENTINEL',{exact:true}).count(),0);state.mode='present';await retry(page);await resourceLoaded(page);await safeLink(page);}
  evidence.checks.push('null target never becomes a source URL; missing is unavailable; malformed, foreign and failed responses hide data and recover by explicit retry');
  evidence.stage='preserved personal material controls';await page.goto(base+coursePath(course.id));await page.locator('.dtm-course-section').first().waitFor();await page.getByRole('button',{name:'課程選單',exact:true}).click();await page.getByRole('menuitem',{name:'管理教材',exact:true}).click();const manager=page.getByRole('dialog');await manager.waitFor();const legacy=legacyFor(userA.id);await manager.getByText(legacy.title,{exact:true}).waitFor();await manager.getByRole('button',{name:/編輯|Edit/}).first().click();const editor=page.locator('form.dtm-record-form');await editor.getByLabel('教材名稱',{exact:true}).waitFor();assert.equal(await editor.getByLabel('教材名稱',{exact:true}).inputValue(),legacy.title);assert.equal(await editor.getByLabel('Moodle 教材連結（選填）',{exact:true}).inputValue(),legacy.sourceUrl);await editor.getByLabel('資源網址（選填）',{exact:true}).fill('https://example.com/unsaved');await editor.getByRole('button',{name:'取消',exact:true}).click();
  await page.getByRole('button',{name:'課程選單',exact:true}).click();await page.getByRole('menuitem',{name:'管理教材',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/刪除|Delete/}).first().click();await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();assert.equal(evidence.mutations,0);
  evidence.checks.push('existing personal material editor and delete dialog remain reachable; cancelled drafts perform no API mutation');
  evidence.stage='independent parent-course navigation';
  for(const snapshotMode of ['omit-course','error']){
    state.snapshotMode=snapshotMode;await openResource(page);await safeLink(page);
    await page.locator('.dtm-breadcrumb a[href="'+coursePath(course.id)+'"]').last().click();await page.waitForURL(base+coursePath(course.id));
    await page.locator('.dtm-course-section').first().waitFor();await page.getByRole('heading',{level:1,name:course.title,exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'找不到課程或頁面',exact:true}).count(),0);assert.equal(await page.locator('.dtm-course-menu').count(),0,'No invented management capability from narrow exact course identity');
    await page.reload();await page.locator('.dtm-course-section').first().waitFor();await page.getByRole('heading',{level:1,name:course.title,exact:true}).waitFor();
    assert.equal(await page.locator('.dtm-course-activity').count(),3);
    const assignment=assignmentFor(userA.id),assignmentPath=coursePath(course.id)+'/assignment/'+assignment.id;
    await page.locator('#assignment-'+assignment.id+' button').click();await page.waitForURL(base+assignmentPath);await page.getByRole('table',{name:'作業繳交狀態',exact:true}).waitFor();
    await page.reload();await page.getByRole('table',{name:'作業繳交狀態',exact:true}).waitFor();await page.getByRole('heading',{level:1,name:course.title,exact:true}).waitFor();
    for(const view of ['grades','assignments','meetings']){await page.goto(base+coursePath(course.id)+'/'+view);await page.getByRole('heading',{name:'找不到課程或頁面',exact:true}).waitFor();assert.equal(await page.locator('.dtm-course-menu').count(),0);}
    await page.goto(base+coursePath(course.id));await page.locator('#material-'+material.id+' button').click();await resourceLoaded(page);await safeLink(page);
  }
  state.snapshotMode='normal';evidence.checks.push('omitted-course and failed broader snapshots retain verified parent Back/direct reload, exact assignment navigation/reload and native resource navigation; other missing-course views stay explicitly unavailable without invented management capability');
  evidence.stage='account transitions';state.hold=true;await page.goto(base+resourcePath(course.id,material.id));await until(()=>state.heldReads>0);await changeUser(page,userB);await until(()=>evidence.apiReads.some(row=>row.caller==='B'&&row.scope==='snapshot'));state.hold=false;state.held.splice(0).forEach(done=>done());await settle(page);assert.equal(await page.locator('.dtm-course-resource').count(),0);await openResource(page,userB.id);await safeLink(page,userB.id);assert.equal(await page.getByRole('heading',{level:2,name:material.title,exact:true}).count(),0);await changeUser(page,null);await page.getByRole('button',{name:'Continue with Google',exact:true}).waitFor();assert.equal(await page.locator('.dtm-course-resource').count(),0);
  const guest=await fixture({signedIn:false}),guestPage=await guest.ctx.newPage();await guestPage.goto(base+resourcePath(course.id,material.id));await guestPage.getByRole('button',{name:'Continue with Google',exact:true}).waitFor();assert.equal(await guestPage.locator('.dtm-course-resource').count(),0);
  evidence.checks.push('held old-account response is ignored, own B route stays isolated, signout and guest direct links expose no material');
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
