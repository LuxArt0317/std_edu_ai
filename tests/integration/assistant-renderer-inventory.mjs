import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {affairsTestUser as user,mockAffairsAuth} from './helpers/affairs-auth.mjs';
import {schoolServiceReadFixture,schoolServiceSnapshot} from './helpers/school-service-route-inventory.mjs';
import {clubStudentScope,isClubStudentView,validClubStudentWorkspace} from '../../server/clubStudentContract.js';
import {clubEquipmentNewPath} from '../../server/clubServicesContract.js';
import {fixtureIds as ids,rendererInventory} from './helpers/assistant-renderer-inventory.mjs';
import {rendererDtmContextProbes,rendererDtmExpectation,rendererDtmRead,rendererDtmSnapshotCourse} from './helpers/assistant-renderer-dtm.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const sourceRevision=git(['rev-parse','HEAD']),workingTreeDirty=Boolean(git(['status','--porcelain']));
const launcherName='開啟 AI 校園助理',dialogName='校園助理 · Assistant';
const fixtureOrigin='https://renderer-fixture.supabase.co';
const roleAccount={state:true,name:'School Affairs account'},roleGuest={state:false,name:'School Affairs sign in'};
const args=process.argv.slice(2);
const {hash,cases}=await rendererInventory();
const family=args.length===2&&args[0]==='--family'?args[1]:null;
const selected=cases.filter(row=>!family||row.families.includes(family));
assert.ok((!args.length||family)&&selected.length,'Use --family followed by a signed-in route family.');
const fileId=randomUUID(),cache=await mkdtemp(join(tmpdir(),'stu100-renderer-'));
const artifact=join(root,'artifacts/assistant-renderer',fileId+'.json');
const viewports={desktop:{width:1280,height:800},phone:{width:390,height:740}};
const contextualPhoneRoutes=new Set(['/school-affairs','/school-affairs/services/leave','/school-affairs/services/40-1/my-attendance?page=2',
  '/school-affairs/services/36-1','/school-affairs/services/27-1','/school-affairs/services/39-1/payment-history',
  '/school-affairs/services/40-1/officer/applications','/dtm','/dtm/course/'+ids.course+'/grades','/elearning','/elearning/course/9408/activity/293395']);
const syntheticDtmReply='The renderer received the exact saved Moodle page context.';
const academyCourse={id:Number(ids.elearningCourse),category_id:Number(ids.elearningCategory),title:'Renderer safety course',self_enroll:false,position:1};
const academyCategory={id:Number(ids.elearningCategory),parent_id:null,title:'Renderer safety category',source_count:1,position:1};
const publicScopes=new Set(['permanent-courses','interdisciplinary-programs','first-selection-notice','late-add-notice',
  'course-substitution','curriculum-maps','curriculum-plans','summer-selection-notice','curriculum-plan']);
const publicPlanQuery='?scope=curriculum-plan&code=115101';
const fixture=(url,parent)=>{
  const scope=url.searchParams.get('scope');
  if(url.pathname!=='/api/affairs-data')return schoolServiceReadFixture(url.href,'GET',user,parent);
  for(const key of new Set(url.searchParams.keys()))assert.equal(url.searchParams.getAll(key).length,1);
  if(!url.search){const data=schoolServiceSnapshot(user);data.dtm.courses.push(rendererDtmSnapshotCourse);return data;}
  const dtm=rendererDtmRead(url,user.id);
  if(dtm)return dtm;
  if(scope==='summer-selection-notice'){
    const year=url.searchParams.get('year');
    assert.match(year??'',/^[1-9][0-9]{2}$/u);
    assert.deepEqual(Object.fromEntries(url.searchParams),{scope,year});
    return {academicYear:Number(year),notice:null};
  }
  if(scope==='course-adjustment'&&url.searchParams.get('phase')==='late_add'){
    assert.deepEqual(Object.fromEntries(url.searchParams),{scope,phase:'late_add'});
    return {userId:user.id,term:{academicYear:115,semester:1},record:null};
  }
  if(scope==='learning-support'){
    assert.deepEqual(Object.fromEntries(url.searchParams),{scope,page:'1'});
    return {userId:user.id,view:'mine',page:1,total:0,rows:[],canReview:false};
  }
  if(scope==='fee-payment-history'){
    const page=url.searchParams.get('page');
    assert.ok(page===null||page==='2');
    assert.deepEqual(Object.fromEntries(url.searchParams),{scope,...(page?{page}:{})});
    return {userId:user.id,studentRecordFound:false,rows:[],total:0,hasUndatedPaidAmount:false};
  }
  if(scope==='elearning-workspace')return {userId:user.id,courses:[academyCourse],categories:[academyCategory],
    notices:[{id:Number(ids.elearningNotice),kind:'page',title:'Renderer fixture notice',local_body:'Synthetic notice.',position:1}],
    enrollments:[{courseId:academyCourse.id,joinedAt:'2026-11-15T02:00:00Z'}]};
  if(scope==='elearning-catalog')return {userId:user.id,total:1,courses:[academyCourse]};
  if(scope==='elearning-course-outline')return {userId:user.id,courseId:academyCourse.id,sections:[{position:1,title:'Renderer lesson',
    activities:[{id:Number(ids.elearningActivity),kind:'url',title:'Renderer video',purpose:'video'}]}]};
  if(scope===clubStudentScope&&isClubStudentView(url.searchParams.get('view'))){
    const view=url.searchParams.get('view'),page=Number(url.searchParams.get('page'));
    const body={userId:user.id,view,page,eligible:false,rows:[],hasMore:false};
    assert.ok(Number.isInteger(page)&&page>=1&&page<=1000&&validClubStudentWorkspace(body,user.id,view,page));
    return body;
  }
  return schoolServiceReadFixture(url.href,'GET',user,parent);
};
const outcomes=[],returnPathChecks=[],accountMenuChecks=[];
let server,browser;

async function wire(context,mode,origin){
  const observed={api:[],security:[],externalBlocked:0,pageErrors:0,authVerified:0,dtmProbe:null,assistantCalls:0,conversationSaves:0};
  const conversations=new Map();
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==origin){observed.externalBlocked++;return route.abort();}
    if(!url.pathname.startsWith('/api/')&&req.method()==='GET')return route.continue();
    const scope=url.searchParams.get('scope')??'unscoped';
    const auth=req.headers().authorization;
    let caller;
    try{if(auth?.startsWith('Bearer '))caller=JSON.parse(Buffer.from(auth.split('.')[1]||'e30','base64url').toString()).sub;}
    catch{/* Malformed authorization continues into the fixture denial. */}
    // Synthetic assistant transport and its matching conversation receipt. No
    // other POST or external request can reach an application or provider.
    if(mode.state&&caller===user.id&&req.method()==='POST'&&!url.search&&observed.dtmProbe){
      const probe=observed.dtmProbe;
      try{
        if(url.pathname==='/api/affairs-assistant'){
          observed.assistantCalls++;
          assert.equal(observed.assistantCalls,1);
          assert.deepEqual(req.postDataJSON(),{question:probe.question,route:probe.route,images:[],history:[],stream:true});
          return route.fulfill({json:{answer:syntheticDtmReply,status:'answered',citations:[],suggestedQuestions:[]}});
        }
        if(url.pathname==='/api/affairs-conversations'){
          observed.conversationSaves++;
          assert.equal(observed.conversationSaves,1);
          const body=req.postDataJSON();
          assert.match(body.id,/^[0-9a-f-]{36}$/u);
          assert.equal(conversations.has(body.id),false);
          assert.equal(body.version,0);
          assert.equal(body.title,probe.question);
          assert.deepEqual(body.messages.map(({role,content})=>({role,content})),
            [{role:'user',content:probe.question},{role:'assistant',content:syntheticDtmReply}]);
          const receipt={...body,version:1,updated_at:'2026-11-16T00:00:00Z'};
          conversations.set(body.id,receipt);
          return route.fulfill({json:receipt});
        }
      }catch{
        observed.security.push('unexpected-dtm-context-payload');
        return route.fulfill({status:400,json:{error:'Synthetic Moodle context assertion failed.'}});
      }
    }
    if(req.method()!=='GET'){observed.security.push('non-read-request');return route.abort();}
    if(!mode.state||(!publicScopes.has(scope)&&caller!==user.id)
      ||!['/api/affairs-data','/api/affairs-conversations'].includes(url.pathname)){
      observed.security.push('unexpected-api-or-caller');return route.fulfill({status:403,json:{error:'Synthetic renderer read denied.'}});
    }
    try{
      if(scope==='curriculum-plan'&&url.pathname==='/api/affairs-data'&&url.search===publicPlanQuery){
        observed.api.push({path:url.pathname,scope,status:204});
        return route.fulfill({status:204});
      }
      const json=url.pathname==='/api/affairs-conversations'&&!url.search?{conversations:[...conversations.values()]}:fixture(url,origin);
      observed.api.push({path:url.pathname,scope,status:200});return route.fulfill({json});
    }catch{
      observed.api.push({path:url.pathname,scope,status:503});return route.fulfill({status:503,json:{error:'No response fixture for this workflow.'}});
    }
  });
  await context.routeWebSocket('**/*',socket=>socket.close());
  await mockAffairsAuth(context,{signedIn:mode.state});
  await context.route('https://*.supabase.co/**',route=>{
    const url=new URL(route.request().url());
    if(url.origin===fixtureOrigin&&route.request().method()==='GET'&&url.pathname==='/auth/v1/user')
      return route.fallback();
    observed.security.push('unexpected-auth-endpoint');
    return route.abort();
  });
  // Verify the response that drives AffairsAuth, without recording a token or body.
  context.on('response',response=>{
    const url=new URL(response.url());
    if(url.origin===fixtureOrigin&&url.pathname==='/auth/v1/user'&&response.status()===200)observed.authVerified++;
  });
  context.on('page',page=>page.on('pageerror',()=>{observed.pageErrors++;}));
  return observed;
}
async function waitMounted(page,selector){
  assert.ok(selector,'workspace-marker-unbound');
  // A cold loopback Vite process compiles the routed workspace lazily. Keyboard
  // actions retain their shorter timeout after the workspace has mounted.
  await page.locator(selector).first().waitFor({state:'visible',timeout:12000});
}
async function settledFocus(page,selector){
  await page.waitForFunction(selector=>Boolean(document.activeElement?.closest(selector)),selector);
}
// Per-observation stage labels deliberately replace exception payloads. No
// console error text, provider data, headers, images or HTML is persisted.
async function checkRoute(page,contextState,row,mode,device,origin){
  contextState.api.length=0;contextState.security.length=0;contextState.pageErrors=0;contextState.externalBlocked=0;contextState.authVerified=0;
  const dtmExpectation=mode.state?rendererDtmExpectation(row.route):null;
  const dtmProbe=mode.state?rendererDtmContextProbes.get(row.route):null;
  contextState.dtmProbe=null;contextState.assistantCalls=0;contextState.conversationSaves=0;
  let stage='navigate',finalPath=null,nativeDataRendered=false,assistantPageContextPassed=false;
  const checks={navigationSucceeded:false,workspaceMounted:false,sessionVerified:false,assistantPresent:false,keyboardUsable:false};
  try{
    const response=await page.goto(origin+row.route,{waitUntil:'domcontentloaded'});
    assert.equal(response?.status(),200);
    stage='expected-route';
    await page.waitForURL(origin+(mode.state?row.final:row.guest));
    finalPath=new URL(page.url()).pathname+new URL(page.url()).search;
    checks.navigationSucceeded=true;
    if(mode.state&&row.notice){
      stage='workspace-notice';
      const notice=page.getByRole('alertdialog',{name:row.notice.title,exact:true});
      await notice.getByText('確定',{exact:true}).press('Enter');
      await page.waitForURL(origin+row.notice.resultingRoute);
      await notice.waitFor({state:'hidden'});
      finalPath=new URL(page.url()).pathname+new URL(page.url()).search;
    }
    stage='workspace-marker';
    if(mode.state)await waitMounted(page,row.selector);
    else await page.getByRole('button',{name:'Continue with Google',exact:true}).waitFor();
    checks.workspaceMounted=true;
    if(dtmExpectation){
      stage='native-dtm-readback';
      const record=page.locator(dtmExpectation.selector);
      await (dtmExpectation.text?record.getByText(dtmExpectation.text,{exact:true}):record).waitFor();
      for(const scope of dtmExpectation.scopes)
        assert.ok(contextState.api.some(read=>read.path==='/api/affairs-data'&&read.scope===scope&&read.status===200));
      assert.ok(contextState.api.every(read=>read.path!=='/api/affairs-data'||read.status===200));
      nativeDataRendered=true;
    }
    stage='launcher';
    const launcher=page.getByRole('button',{name:launcherName,exact:true});
    await launcher.waitFor();
    const accessible=await launcher.evaluate(element=>{
      const {x,y,width,height}=element.getBoundingClientRect();
      return element.tabIndex===0&&!element.disabled&&x>=0&&y>=0&&x+width<=innerWidth+1&&y+height<=innerHeight+1
        &&element.contains(document.elementFromPoint(x+width/2,y+height/2));
    });
    assert.equal(accessible,true);
    checks.assistantPresent=true;
    stage='keyboard-open';
    await launcher.focus();
    await page.keyboard.press('Enter');
    const dialog=page.getByRole('dialog',{name:dialogName,exact:true});
    await dialog.waitFor();
    stage='assistant-identity';
    await dialog.getByRole('link',{name:mode.name,exact:true}).waitFor();
    assert.equal(mode.state?contextState.authVerified>0:contextState.authVerified===0,true);
    checks.sessionVerified=true;
    stage='keyboard-dialog';
    await settledFocus(page,'.public-assistant-surface');
    await page.keyboard.press('Tab');await settledFocus(page,'.public-assistant-surface');
    await page.keyboard.press('Shift+Tab');await settledFocus(page,'.public-assistant-surface');
    if(dtmProbe){
      stage='dtm-assistant-page-context';
      contextState.dtmProbe=dtmProbe;
      await dialog.getByPlaceholder('Ask a school question…').fill(dtmProbe.question);
      await dialog.getByRole('button',{name:'Send',exact:true}).click();
      await dialog.getByText(syntheticDtmReply,{exact:true}).waitFor();
      await dialog.getByText('Conversation saved to your private account.',{exact:true}).waitFor();
      assert.equal(contextState.assistantCalls,1);assert.equal(contextState.conversationSaves,1);
      assistantPageContextPassed=true;
    }
    stage='keyboard-close-and-return';
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});
    await settledFocus(page,'button[aria-label="'+launcherName+'"]');
    checks.keyboardUsable=true;
    stage='request-integrity';
    assert.deepEqual(contextState.security,[]);assert.equal(contextState.pageErrors,0);
    if(row.route==='/school-affairs/admin/records'&&mode.state)assert.ok(
      contextState.api.every(read=>read.path!=='/api/affairs-data'||read.scope==='unscoped'),
      'The student denial view must not request administrator records.');
    stage=null;
  }catch{
    finalPath=new URL(page.url()).origin===origin?new URL(page.url()).pathname+new URL(page.url()).search:null;
  }
  const reads=[...new Map(contextState.api.map(read=>[read.path+':'+read.scope+':'+read.status,read])).values()];
  const workspaceReads=reads.filter(read=>read.path==='/api/affairs-data');
  return {route:row.route,expectedRoute:mode.state?row.final:row.guest,finalPath,families:row.families,evidenceScope:row.evidenceScope,
    auth:mode.state?'synthetic-signed-in':'guest',device,checks,passed:stage===null,failureStage:stage,reads,
    ...(dtmExpectation?{nativeDataRendered}:{}),...(dtmProbe?{assistantPageContextPassed}:{}),
    nativeData:workspaceReads.some(read=>read.status!==200)?'fixture-unavailable':workspaceReads.length?'synthetic-response-sent':'no-observed-read',
    externalRequestsBlocked:contextState.externalBlocked,securityFailures:contextState.security.length,pageErrors:contextState.pageErrors};
}
async function checkAccountMenu(page,origin,route,device){
  let stage='navigate';
  try{
    await page.goto(origin+route);
    await page.waitForURL(origin+route);
    const selector='button[data-campus-assistant-menu]',trigger=page.locator(selector),dialog=page.getByRole('dialog',{name:dialogName,exact:true});
    stage='open-account-menu';
    await trigger.focus();await page.keyboard.press('Enter');
    const action=page.getByRole('menuitem',{name:/^(?:校園助理|Campus assistant)$/u});
    await action.waitFor();await action.focus();await page.keyboard.press('Enter');
    stage='menu-assistant-focus';
    await dialog.waitFor();await settledFocus(page,'.public-assistant-surface');
    stage='close-and-restore-menu-focus';
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await settledFocus(page,selector);
    stage=null;
  }catch{/* Retain only the failure stage. */}
  accountMenuChecks.push({route,device,passed:stage===null,failureStage:stage});
}
async function checkClubReturnTargets(page,origin,path,validQueries,invalidQueries){
  const targets=[
    ...validQueries.map(query=>[path+'?'+query,path+'?'+query]),
    ...invalidQueries.map(query=>[path+'?'+query,'/school-affairs']),
  ];
  for(const [requested,expected] of targets){
    let passed=false;
    try{
      await page.goto(origin+'/school-affairs/login?next='+encodeURIComponent(requested));
      await page.waitForURL(origin+expected);
      await page.locator(expected===path||expected.startsWith(path+'?')?'.student-clubs':'#portal-content').waitFor();
      passed=true;
    }catch{/* Only the synthetic selector and outcome are retained. */}
    returnPathChecks.push({requested,expected,passed});
  }
}
try{
  // Own only a loopback Vite server with no env files, deployment configuration,
  // service-worker access or HTTP proxy. Serve the actual application entrypoint.
  server=await createServer({root,configFile:false,envFile:false,cacheDir:cache,logLevel:'error',
    resolve:{alias:{'@':join(root,'src')}},define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(fixtureOrigin),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('renderer-synthetic-public-key')},
    server:{host:'127.0.0.1',port:0,strictPort:true,hmr:false},plugins:[{name:'renderer-legacy-app-entry',
      configureServer(instance){instance.middlewares.use((req,_res,next)=>{
        if(/^(?:\/ePortal\/(?:index|apMenu)\.asp|\/school-sites\/elearning\.stu\.edu\.tw\/(?:login|course)\/index\.php)(?:\?|$)/u.test(req.url??''))
          req.url='/index.html';
        next();
      });}},react(),tailwindcss()]});
  await server.listen();
  const address=server.httpServer.address();
  assert.ok(address&&typeof address==='object');
  const origin='http://127.0.0.1:'+address.port;
  const executablePath=process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  assert.ok(isAbsolute(executablePath),'CHROME_PATH must be an absolute local path.');
  browser=await chromium.launch({headless:true,executablePath});
  for(const [device,viewport] of Object.entries(viewports)){
    for(const mode of [roleAccount,roleGuest]){
      const context=await browser.newContext({viewport,reducedMotion:'reduce',serviceWorkers:'block'});
      try{
        const observation=await wire(context,mode,origin);
        const openPage=async()=>{
          const page=await context.newPage();page.setDefaultTimeout(3500);page.setDefaultNavigationTimeout(6500);
          return page;
        };
        const page=await openPage();
        for(const row of selected.filter(row=>device==='desktop'||contextualPhoneRoutes.has(row.route))){
          // A fresh tab gives the synthetic question an empty conversation while
          // retaining the same authenticated browser and native page code.
          const probePage=mode.state&&rendererDtmContextProbes.has(row.route)?await openPage():null;
          try{
            const outcome=await checkRoute(probePage??page,observation,row,mode,device,origin);
            outcomes.push(outcome);
            if(!outcome.passed)console.log(JSON.stringify({route:row.route,auth:outcome.auth,device,failureStage:outcome.failureStage,finalPath:outcome.finalPath}));
          }finally{await probePage?.close();}
        }
        if(device==='desktop'&&mode.state&&selected.some(row=>row.families.includes('student-club-attendance')))
          await checkClubReturnTargets(page,origin,'/school-affairs/services/40-1/my-attendance',['page=2','page=1000'],
            ['page=0','page=1001','page=02','page=2&page=3','page=2&user_id=foreign','page=2#unexpected']);
        if(device==='desktop'&&mode.state&&selected.some(row=>row.families.includes('student-club-equipment'))){
          const edit='edit='+ids.course;
          await checkClubReturnTargets(page,origin,clubEquipmentNewPath,[edit],
            ['edit=invalid','edit=','edit=%2Foutside',edit+'&'+edit,edit+'&other=1',edit+'?other=1',edit+'#unexpected']);
        }
        if(mode.state)for(const route of ['/school-affairs','/dtm'].filter(path=>selected.some(row=>row.route===path)))
          await checkAccountMenu(page,origin,route,device);
      }finally{await context.close();}
    }
  }
}finally{
  await browser?.close();
  await server?.close();
  await rm(cache,{recursive:true,force:true});
  await mkdir(join(root,'artifacts/assistant-renderer'),{recursive:true,mode:0o700});
  const expectedComparisons=2*(selected.length+selected.filter(row=>contextualPhoneRoutes.has(row.route)).length);
  const summary={inventoryRoutes:cases.length,selectedRoutes:selected.length,comparisons:outcomes.length,expectedComparisons,
    matrixComplete:outcomes.length===expectedComparisons,
    passed:outcomes.filter(row=>row.passed).length,failures:outcomes.filter(row=>!row.passed).length,
    fixtureUnavailable:outcomes.filter(row=>row.nativeData==='fixture-unavailable').length,
    dtmReadbackChecks:outcomes.filter(row=>row.nativeDataRendered!==undefined).length,
    dtmReadbackPassed:outcomes.filter(row=>row.nativeDataRendered).length,
    dtmContextChecks:outcomes.filter(row=>row.assistantPageContextPassed!==undefined).length,
    dtmContextPassed:outcomes.filter(row=>row.assistantPageContextPassed).length,
    returnPathChecks:returnPathChecks.length,failedReturnPathChecks:returnPathChecks.filter(row=>!row.passed).length,
    accountMenuChecks:accountMenuChecks.length,failedAccountMenuChecks:accountMenuChecks.filter(row=>!row.passed).length};
  await writeFile(artifact,JSON.stringify({version:1,scope:'local Chromium renderer and synthetic authentication only',inventoryHash:hash,sourceRevision,workingTreeDirty,
    modelAcceptance:false,semanticAcceptance:false,liveBackendAcceptance:false,oauthAcceptance:false,summary,outcomes,returnPathChecks,accountMenuChecks},null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({artifact,...summary}));
  if(!summary.matrixComplete||summary.failures||summary.failedReturnPathChecks||summary.failedAccountMenuChecks)process.exitCode=1;
}
