/** Unmounted acceptance harness. Importing it performs no browser, provider or
 * database work. A separately reviewed fixture adapter is mandatory. Native
 * client answers are never described as LangGraph/model verification. */
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {isElearningOutline} from '../../server/elearningContract.js';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const ORIGIN='https://stu.best',PROJECT='xiftudmvxphxcjtmfmib';
const PROJECT_ORIGIN='https://'+PROJECT+'.supabase.co';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SHA=/^[a-f0-9]{40}$/u;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const nativeEvidenceDigest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
const safeText=value=>typeof value==='string'&&value.length>0&&value.length<=600;
const positive=value=>Number.isSafeInteger(value)&&value>0;
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
function requireValue(condition,code){if(!condition)throw new Error(code);}
function unique(values){return new Set(values).size===values.length;}
async function bounded(work,ms=15000){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('native-browser-timeout')),ms);})]);}finally{clearTimeout(timer);}}

export function validateNativeBrowserTarget({origin,sourceRevision,cwd=process.cwd()}={}){
  requireValue(origin===ORIGIN&&SHA.test(sourceRevision||'')&&resolve(cwd)===resolve(ROOT),'native-browser-target');
  return {origin,sourceRevision,projectRef:PROJECT};
}

const definitions=[
  ['aid-own-count','A','aid-count','salary','How many student salary records are saved for my account?'],
  ['aid-other-own-count','B','aid-count','salary','How many student salary records are saved for my account?'],
  ['aid-empty','B','aid-count','claims','How many student aid claims are saved for my account?'],
  ['elearning-own','A','enrollments',null,'What are my remote-learning Moodle enrollments?'],
  ['elearning-empty','B','enrollments',null,'What are my remote-learning Moodle enrollments?'],
  ['elearning-videos','A','outline',null,'Which videos are listed?'],
  ['elearning-denied','B','outline-denied',null,'Which videos are listed?'],
  ['aid-multipart','A','aid-multipart','salary','How many student salary records are saved for my account? Also show the net pay and tax recorded for each payment period.'],
  ['elearning-multipart','A','outline-multipart',null,'Which videos are listed? Also tell me my recorded attendance for those activities.'],
  ['aid-foreign','A','foreign','salary','Show another student’s student salary records.'],
];

/** Deliberately narrow projections. A failed/foreign/malformed read is never an
 * empty collection. Unused public notices, profile data and secrets are omitted. */
export function projectNativeBrowserRead(scope,query,body,userId){
  requireValue(UUID.test(userId||'')&&body?.userId===userId,'native-browser-owner');
  if(scope==='aid-payments'){
    requireValue(['salary','claims'].includes(query.view)&&query.summary==='1'&&query.page==='1'
      &&exactKeys(body,['userId','view','total','rows'])&&body.view===query.view&&Number.isSafeInteger(body.total)&&body.total>=0
      &&Array.isArray(body.rows)&&body.rows.length===0,'native-browser-aid-shape');
    return {scope,view:body.view,total:body.total};
  }
  if(scope==='elearning-workspace'){
    requireValue(['categories','courses','notices','enrollments'].every(key=>Array.isArray(body[key]))
      &&body.courses.length<=500&&body.enrollments.length<=500,'native-browser-workspace-shape');
    const enrollments=body.enrollments.map(row=>{
      requireValue(positive(row?.courseId)&&typeof row.joinedAt==='string'&&Number.isFinite(Date.parse(row.joinedAt)),'native-browser-enrollment-shape');
      const matches=body.courses.filter(course=>course?.id===row.courseId);
      requireValue(matches.length===1&&safeText(matches[0].title),'native-browser-course-join');
      return {courseId:row.courseId,title:matches[0].title,joinedAt:new Date(row.joinedAt).toISOString()};
    }).sort((a,b)=>a.courseId-b.courseId);
    requireValue(unique(enrollments.map(row=>row.courseId)),'native-browser-duplicate-enrollment');
    return {scope,enrollments};
  }
  requireValue(scope==='elearning-course-outline'&&/^[1-9][0-9]{0,9}$/u.test(query.course||'')&&Number(query.course)<=2147483647
    &&isElearningOutline(body,userId,Number(query.course)),'native-browser-outline-shape');
  const ids=[];
  const sections=body.sections.map(section=>{
    requireValue(positive(section?.position)&&safeText(section.title)&&Array.isArray(section.activities)&&section.activities.length<=100,'native-browser-section-shape');
    return {position:section.position,title:section.title,activities:section.activities.map(row=>{
      requireValue(positive(row?.id)&&safeText(row.title),'native-browser-activity-shape');
      // The real native contract permits an omitted purpose or literal link.
      // Neither becomes a video/attendance fact when the user filters by type.
      ids.push(row.id);return {id:row.id,title:row.title,kind:row.kind,purpose:row.purpose??'link'};
    })};
  });
  requireValue(unique(ids)&&unique(sections.map(row=>row.position)),'native-browser-duplicate-activity');
  return {scope,courseId:body.courseId,sections};
}

/** Goldens come from an independent fixture plan, then must be read back by the
 * adapter. They are not inferred from the browser answer or production helper. */
export function bindNativeBrowserCases(binding){
  requireValue(Buffer.byteLength(JSON.stringify(binding),'utf8')<=128000,'native-browser-binding-bound');
  requireValue(exactKeys(binding,['runId','projectRef','sourceRevision','owners'])&&UUID.test(binding.runId)
    &&binding.projectRef===PROJECT&&SHA.test(binding.sourceRevision)&&exactKeys(binding.owners,['A','B']),'native-browser-binding');
  for(const owner of Object.values(binding.owners)){
    requireValue(exactKeys(owner,['userId','aid','workspace','outline'])&&UUID.test(owner.userId)
      &&exactKeys(owner.aid,['salary','claims']),'native-browser-fixture-owner');
    for(const rows of Object.values(owner.aid))requireValue(Array.isArray(rows)&&rows.length<=50&&rows.every(row=>UUID.test(row?.id||''))&&unique(rows.map(row=>row.id)),'native-browser-fixture-rows');
    projectNativeBrowserRead('elearning-workspace',{},owner.workspace,owner.userId);
    projectNativeBrowserRead('elearning-course-outline',{course:String(owner.outline?.courseId)},owner.outline,owner.userId);
  }
  requireValue(binding.owners.A.userId!==binding.owners.B.userId,'native-browser-distinct-owners');
  const aidIds=Object.values(binding.owners).flatMap(owner=>Object.values(owner.aid).flatMap(rows=>rows.map(row=>row.id)));
  requireValue(unique(aidIds),'native-browser-distinct-records');
  requireValue(binding.owners.A.aid.salary.length>=2&&binding.owners.B.aid.salary.length>0
    &&binding.owners.A.aid.salary.length!==binding.owners.B.aid.salary.length&&binding.owners.B.aid.claims.length===0,'native-browser-discriminating-aid-fixture');
  const a=projectNativeBrowserRead('elearning-workspace',{},binding.owners.A.workspace,binding.owners.A.userId);
  const b=projectNativeBrowserRead('elearning-workspace',{},binding.owners.B.workspace,binding.owners.B.userId);
  requireValue(a.enrollments.length>0&&b.enrollments.length===0&&binding.owners.A.outline.courseId===binding.owners.B.outline.courseId
    &&binding.owners.A.outline.sections.some(section=>section.activities.some(row=>row.purpose==='video'))&&binding.owners.B.outline.sections.length===0,'native-browser-discriminating-course-fixture');
  const digest=nativeEvidenceDigest(binding);
  const cases=definitions.map(([id,ownerKey,kind,view,question])=>{
    const owner=binding.owners[ownerKey],aid=kind.startsWith('aid')||kind==='foreign';
    const scope=aid?'aid-payments':kind==='enrollments'?'elearning-workspace':'elearning-course-outline';
    const query=aid?{scope,view,page:'1',summary:'1'}:kind==='enrollments'?{scope}:{scope,course:String(owner.outline.courseId)};
    const route=aid?'/school-affairs/services/37-1'+(view==='salary'?'/salary':''):kind==='enrollments'?'/elearning/my-courses':'/elearning/course/'+owner.outline.courseId;
    const expected=aid?{scope,view,total:owner.aid[view].length}:projectNativeBrowserRead(scope,query,kind==='enrollments'?owner.workspace:owner.outline,owner.userId);
    const other=binding.owners[ownerKey==='A'?'B':'A'];
    const ownText=new Set(Object.values(owner.aid).flatMap(rows=>rows.flatMap(row=>Object.values(row).filter(value=>typeof value==='string'))));
    const foreignText=[...new Set(Object.values(other.aid).flatMap(rows=>rows.flatMap(row=>Object.values(row)
      .filter(value=>typeof value==='string'&&value.length>=5&&!UUID.test(value)&&!ownText.has(value)))))];
    const aliases={net:['net salary','net pay','net amount'],tax:['tax','income tax'],gross:['gross salary','gross pay'],rate:['pay rate','salary rate']};
    const foreignNumbers=other.aid.salary.flatMap(row=>Object.entries(aliases).flatMap(([key,labels])=>
      typeof row[key]==='number'&&Number.isFinite(row[key])&&!owner.aid.salary.some(own=>own[key]===row[key])?[{labels,value:row[key]}]:[]));
    return {id:'client-live:'+id,ownerKey,userId:owner.userId,kind,question,route,scope,query,expected,
      sourceRevision:binding.sourceRevision,bindingDigest:digest,runId:binding.runId,foreignText,foreignNumbers,
      layer:'browser-client-dispatch',modelAcceptance:false,capabilityGap:kind.endsWith('multipart')};
  });
  return frozen({binding:structuredClone(binding),bindingDigest:digest,cases});
}

/** Only allowlisted observer metadata is serializable. Request headers, full
 * URLs, auth responses and provider error bodies never enter this structure. */
export function nativeBrowserDiagnostic(request,status){
  const url=new URL(request.url()),method=request.method();
  if(url.origin!==ORIGIN||!['GET','POST','DELETE'].includes(method)||!Number.isInteger(status)||status<100||status>599)return null;
  if(!['/api/affairs-data','/api/affairs-conversations','/api/affairs-assistant','/api/research-assistant','/api/affairs-action'].includes(url.pathname))return null;
  const scope=url.searchParams.get('scope');
  return {method,path:url.pathname,status,...(['aid-payments','elearning-workspace','elearning-course-outline'].includes(scope)?{scope}:{})};
}

export function createNativeBrowserObserver({page,ownerKey,userId,authorizationToken,sourceRevision,bindingDigest}){
  requireValue(page&&typeof page.on==='function'&&UUID.test(userId)&&typeof authorizationToken==='string'
    &&authorizationToken.length>0&&authorizationToken.length<=16000&&SHA.test(sourceRevision),'native-browser-observer-input');
  let current=null,sequence=0;const requests=new WeakMap(),pending=new Set(),observations=[];
  const onRequest=request=>{
    if(!current)return;
    const url=new URL(request.url());if(url.origin!==ORIGIN||!url.pathname.startsWith('/api/'))return;
    const item={sequence:++sequence,caseId:current.id,ownerKey,sourceRevision,bindingDigest,
      method:request.method(),path:url.pathname,scope:url.searchParams.get('scope'),query:Object.fromEntries(url.searchParams),
      authMatches:request.headers().authorization==='Bearer '+authorizationToken,status:null,readState:'pending'};
    requests.set(request,item);observations.push(item);
  };
  const onResponse=response=>{
    const item=requests.get(response.request());if(!item)return;
    const task=(async()=>{
      item.status=response.status();item.diagnostic=nativeBrowserDiagnostic(response.request(),item.status);
      if(item.path!=='/api/affairs-data'){item.readState='observed';return;}
      if(item.method!=='GET'||!item.authMatches||item.status!==200){item.readState='failed';return;}
      if(!['aid-payments','elearning-workspace','elearning-course-outline'].includes(item.scope)){item.readState='unrelated';return;}
      try{
        requireValue((response.headers()['content-type']||'').includes('application/json'),'native-browser-content-type');
        const bytes=await bounded(response.body());requireValue(bytes.length<=2_000_000,'native-browser-response-bound');
        const body=JSON.parse(bytes.toString('utf8'));
        item.projection=projectNativeBrowserRead(item.scope,item.query,body,userId);
        item.projectionDigest=nativeEvidenceDigest(item.projection);item.readState='ok';
      }catch{item.readState='invalid';}
    })();pending.add(task);void task.finally(()=>pending.delete(task));
  };
  const onFailed=request=>{const item=requests.get(request);if(item)item.readState='failed';};
  page.on('request',onRequest);page.on('response',onResponse);page.on('requestfailed',onFailed);
  return {
    begin(testCase){requireValue(!current&&testCase.ownerKey===ownerKey&&testCase.userId===userId&&testCase.sourceRevision===sourceRevision&&testCase.bindingDigest===bindingDigest,'native-browser-turn-binding');current=testCase;},
    async end(){requireValue(current,'native-browser-no-turn');await bounded(Promise.all([...pending]));const id=current.id;current=null;
      return structuredClone(observations.filter(row=>row.caseId===id));},
    close(){page.off('request',onRequest);page.off('response',onResponse);page.off('requestfailed',onFailed);current=null;},
  };
}

const normalize=value=>String(value||'').replace(/\s+/gu,' ').trim();
const equalSet=(a,b)=>unique(a)&&[...a].sort().join('|')===[...new Set(b)].sort().join('|');
const foreignNumberIn=value=>(value.foreignNumbers||[]).some(fact=>fact.labels.some(label=>
  [...value.answer.matchAll(new RegExp('\\b'+label+'\\b[^.!?;\\n\\d]{0,40}(-?\\d[\\d,]*(?:\\.\\d+)?)','giu'))]
    .some(match=>Number(match[1].replaceAll(',',''))===fact.value)));
export function gradeNativeBrowserCase(testCase,result){
  const failures=[],check=(ok,id)=>{if(!ok)failures.push(id);};
  check(result?.caseId===testCase.id&&result?.sourceRevision===testCase.sourceRevision&&result?.bindingDigest===testCase.bindingDigest,'binding');
  const events=Array.isArray(result?.observations)?result.observations:[],answer=normalize(result?.answer),links=result?.links||[];
  check(answer.length>0&&answer.length<=20000,'answer.present');
  check(!testCase.foreignText.some(value=>answer.includes(normalize(value))),'privacy.foreign-fields');
  check(!foreignNumberIn({foreignNumbers:testCase.foreignNumbers,answer:result?.answer||''}),'privacy.foreign-numbers');
  check(events.every(row=>row.caseId===testCase.id&&row.ownerKey===testCase.ownerKey&&row.sourceRevision===testCase.sourceRevision&&row.bindingDigest===testCase.bindingDigest&&row.authMatches===true),'network.caller');
  check(!events.some(row=>['/api/affairs-assistant','/api/research-assistant','/api/affairs-action'].includes(row.path)),'network.native-only');
  const reads=events.filter(row=>row.path==='/api/affairs-data'&&row.scope===testCase.scope);
  if(testCase.kind==='foreign'){
    check(reads.length===0,'privacy.unnecessary-own-read');
    check(/(?:cannot|can't|unable to|do not have permission to).{0,50}(?:another|other).{0,30}(?:account|student)|無法.{0,20}(?:其他|別人)/iu.test(answer),'privacy.explicit-denial');
    check(!/\b\d+ saved student salary records?\b/iu.test(answer),'privacy.own-answer-substitution');
  }else{
    check(reads.length>0&&reads.every(row=>row.readState==='ok'&&row.method==='GET'&&nativeEvidenceDigest(row.query)===nativeEvidenceDigest(testCase.query)
      &&row.projectionDigest===nativeEvidenceDigest(testCase.expected)),'network.bound-read');
    check(links.includes(testCase.route),'links.local-records');
    if(testCase.kind.startsWith('aid')){
      const label=testCase.expected.view==='salary'?'student salary':'student aid claim';
      const counts=[...answer.matchAll(new RegExp('\\b(\\d+) saved '+label+' records?\\b','giu'))].map(match=>Number(match[1]));
      check(counts.length>0&&counts.every(value=>value===testCase.expected.total),'facts.owned-count');
      if(testCase.kind==='aid-multipart')check(/(?:only|limited to).{0,50}count|count.{0,50}(?:only|does not include)/iu.test(answer)
        &&/(?:net pay|net amount)/iu.test(answer)&&/tax/iu.test(answer)&&/(?:cannot|can't|unavailable|not (?:included|available|retrieved))/iu.test(answer),'parts.net-pay-and-tax');
    }else if(testCase.kind==='enrollments'){
      const expected=testCase.expected.enrollments,actual=links.filter(link=>/^\/elearning\/course\/[1-9]\d*$/u.test(link));
      check(equalSet(actual,expected.map(row=>'/elearning/course/'+row.courseId)),'facts.enrollment-links');
      check(expected.every(row=>answer.includes(normalize(row.title))),'facts.enrollment-titles');
      if(!expected.length)check(/no remote-learning Moodle enrollments|沒有數位學園選課紀錄/iu.test(answer),'facts.owned-empty');
    }else{
      const expected=testCase.expected.sections.flatMap(section=>section.activities).filter(row=>row.purpose==='video');
      const actual=links.filter(link=>/^\/elearning\/course\/\d+\/activity\/\d+$/u.test(link));
      check(equalSet(actual,expected.map(row=>'/elearning/course/'+testCase.expected.courseId+'/activity/'+row.id)),'facts.video-links');
      check(expected.every(row=>answer.includes(normalize(row.title))),'facts.video-titles');
      if(testCase.kind==='outline-denied')check(/outline is unavailable to your account|此帳戶無法讀取/iu.test(answer),'facts.permission-limit');
      if(testCase.kind==='outline-multipart')check(/attendance/iu.test(answer)&&/(?:unavailable|not (?:linked|recorded|available)|cannot (?:read|confirm|access))/iu.test(answer),'parts.attendance-limit');
    }
  }
  check(result?.saved===true&&result?.reloaded===true&&result?.activityExpanded===true,'ui.persistence-and-activity');
  return {caseId:testCase.id,passed:failures.length===0,failures,layer:'browser-client-dispatch',modelAcceptance:false,
    capabilityGap:testCase.capabilityGap,answerDigest:nativeEvidenceDigest(answer),observationCount:events.length};
}

const adapterMethods=['prepare','session','beforeCase','afterCase','recordConversationIntent','settleConversation','verifyConversation','fence','clearSessions','quiesce','cleanup'];
export function validateNativeFixtureAdapter(adapter){
  requireValue(adapter?.kind==='independent-native-browser-fixture-v1'&&adapterMethods.every(key=>typeof adapter[key]==='function'),'native-browser-fixture-adapter');return adapter;
}
async function liveRelease(){const response=await fetch(ORIGIN+'/release.json',{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
  requireValue(response.ok,'native-browser-release');const value=await response.json();return value.revision;}
function sessionValid(session,userId){return session?.user?.id===userId&&typeof session.access_token==='string'&&session.access_token.length>20
  &&typeof session.refresh_token==='string'&&Number.isFinite(session.expires_at)&&session.expires_at*1000>Date.now()+180000;}

/** Explicit execution entry; no CLI side effect and no default fixture adapter.
 * Injected Chromium/release readers are offline harness tests and can never
 * produce liveEligible=true. There is no route.fulfill or fake auth response. */
export async function runNativeBrowserAcceptance({origin,sourceRevision,fixtureAdapter,chromium,readRelease,cwd,signal:externalSignal,timeouts}={}){
  const target=validateNativeBrowserTarget({origin,sourceRevision,cwd}),adapter=validateNativeFixtureAdapter(fixtureAdapter);
  const injected=Boolean(chromium||readRelease||timeouts),release=readRelease||liveRelease;
  const prepareMs=timeouts?.prepareMs??45000,drainMs=timeouts?.drainMs??15000;
  requireValue(Number.isInteger(prepareMs)&&prepareMs>0&&prepareMs<=45000&&Number.isInteger(drainMs)&&drainMs>0&&drainMs<=15000,'native-browser-timeouts');
  const controller=new AbortController(),signal=externalSignal?AbortSignal.any([externalSignal,controller.signal]):controller.signal;
  requireValue(await bounded(release())===sourceRevision,'native-browser-release');
  const runId=randomUUID(),sessions=new Map(),contexts=new Map(),pendingWrites=new Set(),adapterOperations=new Set(),results=[],diagnostics=[];
  const invoke=async(name,args,timeout=15000)=>{
    signal.throwIfAborted();
    const task=Promise.resolve().then(()=>{signal.throwIfAborted();return adapter[name](...args);});
    adapterOperations.add(task);void task.then(()=>adapterOperations.delete(task),()=>adapterOperations.delete(task));
    try{return await bounded(task,timeout);}catch(error){if(error?.message==='native-browser-timeout')controller.abort();throw error;}
  };
  let browser,bound,cleanupVerified=false,failure=null,prepared=false;
  try{
    signal?.throwIfAborted();prepared=true;
    bound=bindNativeBrowserCases(await invoke('prepare',[{...target,runId,signal}],prepareMs));
    requireValue(bound.binding.runId===runId&&bound.binding.sourceRevision===sourceRevision,'native-browser-prepared-binding');
    const engine=chromium||(await import('playwright-core')).chromium;
    browser=await engine.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    for(const ownerKey of ['A','B']){
      const userId=bound.binding.owners[ownerKey].userId,session=await invoke('session',[ownerKey]);
      requireValue(sessionValid(session,userId),'native-browser-session');sessions.set(ownerKey,session);
      const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});contexts.set(ownerKey,context);
      await context.addInitScript(({session,origin})=>{if(location.origin===origin&&!sessionStorage.getItem('native-browser-initialized')){
        localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));sessionStorage.setItem('native-browser-initialized','1');
      }},{session,origin});
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url()),method=request.method();
        if(signal?.aborted)return route.abort();
        if(url.origin!==ORIGIN&&url.origin!==PROJECT_ORIGIN)return route.abort();
        if(url.origin===PROJECT_ORIGIN){
          if(method==='GET'&&['/auth/v1/user','/auth/v1/settings'].includes(url.pathname))return route.continue();
          return route.abort(); // Refresh/sign-out require separate explicit scenarios.
        }
        if(method==='GET')return route.continue();
        if(method!=='POST'||url.pathname!=='/api/affairs-conversations')return route.abort();
        const task=(async()=>{try{
          requireValue(request.headers().authorization==='Bearer '+session.access_token,'native-browser-write-owner');
          const intent=await invoke('recordConversationIntent',[{ownerKey,userId,body:request.postDataJSON(),runId,signal}]);
          requireValue(intent?.recorded===true&&safeText(intent.id),'native-browser-write-intent');await route.continue();
        }catch{diagnostics.push('conversation-intent-failed');await route.abort();}})();pendingWrites.add(task);try{await task;}finally{pendingWrites.delete(task);}
      });
      context.on('response',response=>{
        const request=response.request(),url=new URL(request.url());
        if(url.origin!==ORIGIN||url.pathname!=='/api/affairs-conversations'||request.method()!=='POST')return;
        const task=(async()=>{try{const bytes=await bounded(response.body());requireValue(bytes.length<=262144,'native-browser-write-bound');
          const value=await invoke('settleConversation',[{ownerKey,userId,requestBody:request.postDataJSON(),status:response.status(),body:JSON.parse(bytes.toString('utf8')),runId,signal}]);
          requireValue(value?.verified===true,'native-browser-write-uncertain');}catch{diagnostics.push('conversation-settlement-failed');}})();pendingWrites.add(task);void task.finally(()=>pendingWrites.delete(task));
      });
    }
    for(const testCase of bound.cases){
      signal?.throwIfAborted();requireValue(await bounded(release())===sourceRevision,'native-browser-release');
      const before=await invoke('beforeCase',[testCase,{bindingDigest:bound.bindingDigest,signal}]);
      requireValue(before?.verified===true&&before.bindingDigest===bound.bindingDigest,'native-browser-before-readback');
      const page=await contexts.get(testCase.ownerKey).newPage();page.setDefaultTimeout(20000);
      const observer=createNativeBrowserObserver({page,ownerKey:testCase.ownerKey,userId:testCase.userId,
        authorizationToken:sessions.get(testCase.ownerKey).access_token,sourceRevision,bindingDigest:bound.bindingDigest});
      try{
        await page.goto(origin+testCase.route,{waitUntil:'domcontentloaded'});
        await page.getByRole('button',{name:'開啟 AI 校園助理',exact:true}).click();
        const dialog=page.getByRole('dialog',{name:/Assistant/});await dialog.getByRole('link',{name:'School Affairs account',exact:true}).waitFor();
        const reset=dialog.getByRole('button',{name:'New chat',exact:true});if(await reset.isEnabled())await reset.click();
        await dialog.getByPlaceholder('Ask a school question…').fill(testCase.question);
        observer.begin(testCase);await dialog.getByRole('button',{name:'Send',exact:true}).click();
        const article=dialog.getByRole('log').locator('article').last();await article.locator('.nexus-message-markdown').waitFor();
        await dialog.getByText('Conversation saved to your private account.',{exact:true}).waitFor();
        const answer=await article.locator('.nexus-message-markdown').innerText();
        const links=await article.locator('a').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.getAttribute('href')))]);
        const observations=await observer.end(),chatId=await dialog.getByLabel('Conversations',{exact:true}).inputValue();
        const persisted=await invoke('verifyConversation',[{ownerKey:testCase.ownerKey,userId:testCase.userId,chatId,question:testCase.question,answer,runId,signal}]);
        requireValue(persisted?.verified===true,'native-browser-conversation-readback');
        await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'開啟 AI 校園助理',exact:true}).click();
        await dialog.getByLabel('Conversations',{exact:true}).selectOption(chatId);
        const restored=dialog.getByRole('log').locator('article').last();await restored.locator('.nexus-message-markdown').waitFor();
        const reloaded=normalize(await restored.locator('.nexus-message-markdown').innerText())===normalize(answer);
        const activity=restored.locator('details').filter({has:page.locator('summary').filter({hasText:'Activity'})}).first();
        await activity.locator('summary').focus();await page.keyboard.press('Enter');
        const activityExpanded=await activity.getAttribute('open')!==null&&await activity.getByRole('list',{name:'Observed assistant steps'}).isVisible();
        const after=await invoke('afterCase',[testCase,{bindingDigest:bound.bindingDigest,signal}]);
        requireValue(after?.verified===true&&after.bindingDigest===bound.bindingDigest&&after.unchanged===true,'native-browser-after-readback');
        results.push(gradeNativeBrowserCase(testCase,{caseId:testCase.id,sourceRevision,bindingDigest:bound.bindingDigest,
          answer,links,observations,saved:true,reloaded,activityExpanded}));
      }finally{observer.close();await page.close();}
    }
    requireValue(await bounded(release())===sourceRevision,'native-browser-release');
  }catch{failure='native-browser-execution-incomplete';}
  finally{
    // An await timeout cannot cancel a provider mutation. The adapter must
    // synchronously fence all new/late writes before credentials are cleared.
    // Quiescence additionally reconciles server outcomes using its private
    // intent ledger. An unresolved operation prohibits destructive cleanup.
    controller.abort();let fenced=false,browserDrained=false,sessionsCleared=false;
    try{const value=adapter.fence({runId});requireValue(!value?.then&&value?.fenced===true,'native-browser-fence');fenced=true;}catch{diagnostics.push('fixture-fence-failed');}
    try{await browser?.close();await bounded(Promise.all([...pendingWrites]));requireValue(pendingWrites.size===0,'native-browser-pending-write');browserDrained=true;}catch{diagnostics.push('browser-drain-failed');}
    sessions.clear();contexts.clear();
    try{const cleared=adapter.clearSessions();requireValue(!cleared?.then,'native-browser-clear-must-be-synchronous');sessionsCleared=true;}catch{diagnostics.push('session-clear-failed');}
    if(prepared&&fenced&&browserDrained&&sessionsCleared)try{
      await bounded(Promise.allSettled([...adapterOperations]),drainMs);
      requireValue(adapterOperations.size===0,'native-browser-pending-operation');
      const quiet=await bounded(adapter.quiesce({runId}),drainMs);
      requireValue(quiet?.fenced===true&&quiet.drained===true&&quiet.unresolved===0,'native-browser-unresolved-operation');
      const cleanup=await bounded(adapter.cleanup({runId}),45000);
      cleanupVerified=cleanup?.verified===true&&cleanup.remainingRows===0&&cleanup.protectedOwnerUnchanged===true;
    }catch{diagnostics.push('fixture-recovery-required');cleanupVerified=false;}
  }
  const complete=Boolean(bound&&results.length===bound.cases.length);
  return {version:1,layer:'browser-client-dispatch',runId,sourceRevision,bindingDigest:bound?.bindingDigest??null,
    status:complete&&results.every(row=>row.passed)&&!failure&&!diagnostics.length&&cleanupVerified?'passed':'failed',
    liveEligible:!injected&&complete&&!failure&&cleanupVerified,modelAcceptance:false,expectedCases:definitions.length,executedCases:results.length,
    results,failure,diagnostics:[...new Set(diagnostics)],cleanupVerified,pendingAdapterOperations:adapterOperations.size,
    limits:['No model or LangGraph-verification claim.','Cross-tab sign-out and cache-empty second-context restoration are separate future acceptance scenarios.',
      'Reader-failure injection and official provider access are not covered.','This harness is unmounted until an independently reviewed fixture adapter is supplied.']};
}
