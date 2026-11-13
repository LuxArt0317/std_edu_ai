import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright-core';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import {readNativeHttpResponse} from './helpers/native-http-response.mjs';

// Only generated, disposable accounts and exact record IDs are mutated or removed.
process.umask(0o077);
const deployment=JSON.parse(await readFile('deployment.json','utf8')),env=deploymentEnvironment();Object.assign(process.env,env);
const origin=process.env.NATIVE_ORIGIN||deployment.vercel.productionUrl,local=new URL(origin).hostname==='127.0.0.1';
assert.ok(local||origin===deployment.vercel.productionUrl,'Use the configured production origin or loopback.');
// Local record coverage is deterministic unless explicitly opting into the real model.
const liveModel=process.argv.includes('--live-model');
assert.ok(!local||!liveModel||Boolean(process.env.OPENAI_API_KEY?.trim()),'--live-model requires an already configured local OPENAI_API_KEY; no fixtures were created.');
const assistantMode=local?(liveModel?'local_model':'local_deterministic'):'deployed_model';
const assistantCheck=assistantMode==='local_deterministic'
  ? 'deterministic native answers from fresh real caller-JWT snapshots; model verification not exercised'
  : `${assistantMode}: actual assistant API answers with verified model account evidence`;
const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;
assert.equal(new URL(url).hostname,deployment.supabase.projectRef+'.supabase.co');
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL,target=new URL(connection);
assert.ok(target.hostname===`db.${deployment.supabase.projectRef}.supabase.co`||target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.'+deployment.supabase.projectRef));
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
const auth={persistSession:false,autoRefreshToken:false},admin=createClient(url,env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY,{auth});
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const runId=randomUUID(),users=[],requests=new Set(),ids=Array.from({length:10},()=>randomUUID()),checks=[];
const root='/school-affairs/services/13-1',output=`artifacts/academic-grades/${local?'local':'production'}-${runId}`;
const courseTitle='QA Transcript '+runId.slice(0,8),warningTitle='QA Warning '+runId.slice(0,8),otherTitle='Other private grade '+runId.slice(0,8);
// Production always uses the deployed API. Only local Vite needs these handlers.
const deterministicModules=assistantMode==='local_deterministic'
  ? await Promise.all([import('../../server/affairsWorkspace.js'),import('../../server/affairsAnswer.js')]):null;
async function deterministicAssistant(request,response){
  assert.equal(request.method,'POST','The deterministic bridge supports only the fixture question calls.');
  const {verifyAffairsToken,loadAffairsSnapshot}=deterministicModules[0];
  const {answerPrivateAffairsQuestion}=deterministicModules[1];
  const account=await verifyAffairsToken(request.headers.authorization?.slice(7)||'');
  const fresh=await loadAffairsSnapshot(account,false,{initialize:false,deadline:Date.now()+55000});
  response.json(await answerPrivateAffairsQuestion(request.body.question,fresh,request.body.history||[],request.body.route||'',{draftOnly:true}));
}
function checkedAssistantResult(endpoint,result){
  if(new URL(endpoint,origin).pathname==='/api/affairs-assistant'&&result.status===200){
    assert.equal(result.body?.status,'answered',`${assistantMode}: expected a native account answer, not an abstention.`);
    if(assistantMode==='local_deterministic')assert.equal(result.body.verification,undefined,'Deterministic drafts must not claim model verification.');
    else assert.equal(result.body.verification?.status,'verified',`${assistantMode}: model answers must pass actual account-evidence verification.`);
  }
  return result;
}
const handlers=local?{
  '/api/affairs-data':(await import('../../api/affairs-data.ts')).default,
  '/api/affairs-manage':(await import('../../api/affairs-manage.ts')).default,
  '/api/affairs-assistant':assistantMode==='local_deterministic'?deterministicAssistant:(await import('../../api/affairs-assistant.ts')).default,
}:{};
const tables=['affairs_academic_grade_records','affairs_academic_term_summaries','affairs_academic_rankings','affairs_academic_metadata'];
const kinds=['save_academic_grade_record','save_academic_term_summary','save_academic_ranking','save_academic_metadata'];
let browser,ownerId,ownerBefore,ownerClient,ownerSession,phase='setup',schemaReady=false;
const fingerprint=async id=>(await sql`select u.id,md5((to_jsonb(u)-array['last_sign_in_at','updated_at'])::text) as auth_hash,
  md5(to_jsonb(p)::text) as profile_hash,
  (select md5(coalesce(jsonb_agg(to_jsonb(i)-array['last_sign_in_at','updated_at'] order by i.id),'[]'::jsonb)::text) from auth.identities i where i.user_id=u.id) as identities_hash
  from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
async function authenticateOwner(){
  const file=await stat('.env.owner.local');assert.ok(file.isFile()&&(file.mode&0o077)===0,'Owner credential file must remain private.');
  const credentials=parseEnv(await readFile('.env.owner.local','utf8'));
  assert.ok(credentials.CRM_ADMIN_EMAIL?.toLowerCase()===deployment.supabase.ownerEmail.toLowerCase()&&credentials.CRM_ADMIN_PASSWORD,'Existing owner credentials are required.');
  ownerClient=createClient(url,key,{auth:{...auth,detectSessionInUrl:false},global:{fetch(input,init={}){
    const target=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    assert.ok(target.origin===new URL(url).origin,'Owner authentication must use the exact client project.');
    const timeout=AbortSignal.timeout(15000);return fetch(input,{...init,redirect:'error',signal:init.signal?AbortSignal.any([init.signal,timeout]):timeout});
  }}});
  const signed=await ownerClient.auth.signInWithPassword({email:credentials.CRM_ADMIN_EMAIL,password:credentials.CRM_ADMIN_PASSWORD});
  ownerSession=signed.data.session;assert.ok(!signed.error&&ownerSession,'Existing owner authentication failed.');
  const verified=await ownerClient.auth.getUser(ownerSession.access_token),user=verified.data.user;
  assert.ok(!verified.error&&user?.id===ownerId&&user.email?.toLowerCase()===deployment.supabase.ownerEmail.toLowerCase()
    &&user.email_confirmed_at&&user.identities?.some(identity=>identity.provider==='google'),'Authenticated owner must match the existing verified administrator.');
  // Never load or initialize an owner snapshot; only exact fixture manager writes use this JWT.
}
async function invoke(endpoint,{token,method='GET',body}={}){
  if(token&&token===ownerSession?.access_token)assert.ok(endpoint==='/api/affairs-manage'&&method==='POST','Owner JWT is restricted to fixture manager writes; no owner snapshot or initialization.');
  if(!local){
    const response=await fetch(origin+endpoint,{method,redirect:'error',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});
    return await readNativeHttpResponse(response);
  }
  const parsed=new URL(endpoint,origin),handler=handlers[parsed.pathname];assert.ok(handler);
  const result={status:200,body:undefined},response={status(code){result.status=code;return response;},json(value){result.body=value;},setHeader(){}};
  await handler({method,headers:token?{authorization:'Bearer '+token}:{},query:Object.fromEntries(parsed.searchParams),body},response);return result;
}
async function request(endpoint,options={}){const result=await invoke(endpoint,options);assert.equal(result.status,options.status??200,`${phase}: ${endpoint} status ${result.status}`);return result.body;}
const snapshot=session=>request('/api/affairs-data',{token:session.access_token});
function assistantDiagnostic(question,route,result,session){
  const redactions=[session.access_token,session.refresh_token,ownerSession?.access_token,ownerSession?.refresh_token,
    ownerSession?.user?.id,deployment.supabase.ownerEmail,...Object.values(ownerSession?.user?.user_metadata??{})]
    .filter(value=>typeof value==='string'&&value.length>3);
  return JSON.stringify({assistantMode,question,route,status:result?.status,answer:result?.answer,
    verification:result?.verification,activity:result?.activity,grounding:result?.grounding,citations:result?.citations},(key,value)=>{
    if(/token|password|authorization|secret|email|user_?id|owner_?id/i.test(key))return undefined;
    if(typeof value!=='string')return value;
    let safe=value.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[redacted token]');
    for(const privateValue of redactions)safe=safe.split(privateValue).join('[redacted]');
    return safe;
  },2);
}
const answer=async(session,question,view)=>{
  const result=await request('/api/affairs-assistant',{method:'POST',token:session.access_token,body:{question,route:root+(view?'/'+view:'')}});
  // Only disposable synthetic records; never persist a session or credential.
  await writeFile(output+'/answer-'+String(checks.length)+'-'+(view||'index')+'-'+session.user.id.slice(0,8)+'.json',assistantDiagnostic(question,root+(view?'/'+view:''),result,session));
  checkedAssistantResult('/api/affairs-assistant',{status:200,body:result});
  return result;
};
async function fixture(number){
  const email=`academic-grades-qa-${randomUUID()}@example.invalid`,password=randomBytes(32).toString('base64url')+'Aa1!';
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:`Academic Grades QA ${number}`}});
  if(created.error||!created.data.user)throw new Error('Synthetic account creation failed.');
  const id=created.data.user.id;users.push(id);
  await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
    values(${id},${id},${sql.json({sub:id,email,email_verified:true})},'google',now(),now(),now())`;
  const signed=await createClient(url,key,{auth}).auth.signInWithPassword({email,password});
  if(signed.error||!signed.data.session)throw new Error('Synthetic account sign-in failed.');
  await snapshot(signed.data.session);return signed.data.session;
}
async function save(kind,payload){
  assert.ok(ownerSession&&kinds.includes(kind)&&ids.includes(payload.id)&&users.includes(payload.user_id)&&payload.user_id!==ownerId,'Exact fixture operation required.');requests.add(payload.request_id);
  for(const table of tables){const existing=await sql`select user_id from ${sql('public.'+table)} where id=${payload.id}`;if(existing[0])assert.ok(users.includes(existing[0].user_id),'Refuse a non-fixture target.');}
  const result=await invoke('/api/affairs-manage',{method:'POST',token:ownerSession.access_token,body:{kind,payload}});
  if(result.status!==200)throw Object.assign(new Error('Manager request failed.'),{status:result.status});
  return result.body;
}
async function pageFor(session){
  const context=await browser.newContext({viewport:{width:1533,height:1399},locale:'zh-TW',reducedMotion:'reduce'});
  await context.addInitScript(({origin,session})=>{
    if(window.top!==window||location.origin!==origin||sessionStorage.getItem('academic-grades-qa'))return;
    localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));sessionStorage.setItem('academic-grades-qa','1');
  },{origin,session});
  if(local)await context.route('**/api/**',async route=>{
    const req=route.request(),endpoint=new URL(req.url());if(!handlers[endpoint.pathname])return route.continue();
    const result=await invoke(endpoint.pathname+endpoint.search,{method:req.method(),token:req.headers().authorization?.slice(7),body:req.postData()?JSON.parse(req.postData()):undefined});
    await route.fulfill({status:result.status,json:result.body});
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',error=>errors.push(error.message));return{page,context,errors};
}
async function capture(page,name){await page.evaluate(()=>document.fonts.ready);await page.locator('.academic-grades').screenshot({path:`${output}/${name}.png`});}
async function readyView(page,view){
  if(view==='index')await page.locator('.academic-grade-index-table').waitFor();
  else if(view==='transcript')await page.getByRole('cell',{name:courseTitle,exact:true}).waitFor();
  else if(view==='warning')await page.getByRole('cell',{name:warningTitle,exact:true}).waitFor();
  else if(view==='ranking')await page.getByRole('cell',{name:'2 / 40 (5%)',exact:true}).waitFor();
  else await page.locator('.academic-grades-notice-message').waitFor();
  await page.locator('.academic-grades-main[aria-busy="false"]').waitFor();
  assert.equal(await page.locator('.academic-grades [role="alert"]').count(),0,'The view must finish its account read before capture.');
}
try{
  await mkdir(output,{recursive:true,mode:0o700});
  const [owner]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id
    where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and p.role='admin'
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
  assert.ok(owner,'The configured verified Google/admin identity must already exist; this test does not change it.');ownerId=owner.id;
  for(const table of tables)assert.ok((await sql`select to_regclass(${'public.'+table}) as name`)[0].name,'Apply academic migration before running.');schemaReady=true;
  ownerBefore=await fingerprint(ownerId);await authenticateOwner();
  const first=await fixture(1),second=await fixture(2);
  const common={user_id:first.user.id,expected_version:'0'},term={academic_year:114,semester:2};
  const transcript={...common,...term,id:ids[0],request_id:randomUUID(),record_kind:'transcript',course_title:courseTitle,category_text:'QA-101',module_name:'Synthetic module',required_elective_text:'必修',credits:0,grade_text:'P',row_order:0};
  phase='authorization and records';await request('/api/affairs-data',{status:401});await request('/api/affairs-data?scope=admin',{token:first.access_token,status:403});
  await request('/api/affairs-manage',{method:'POST',token:first.access_token,body:{kind:kinds[0],payload:transcript},status:403});
  await request('/api/affairs-manage',{method:'POST',token:first.access_token,body:{kind:kinds[0],payload:[]},status:400});
  const initial=await save(kinds[0],transcript);assert.equal(initial.version,1);assert.deepEqual(await save(kinds[0],transcript),initial);
  const warning={...common,id:ids[1],request_id:randomUUID(),record_kind:'warning',academic_year:115,semester:1,course_title:warningTitle,course_code:'QA-WARN',credits:3,grade_text:'F',remark_text:'Synthetic warning; not a final grade',row_order:0};
  const operations=[
    [kinds[0],warning],
    [kinds[0],{...transcript,id:ids[2],request_id:randomUUID(),course_title:'QA Withdrawn',credits:2,grade_text:'棄選',row_order:1}],
    [kinds[1],{...common,...term,id:ids[3],request_id:randomUUID(),summary_kind:'transcript',earned_credits:7.5,average_grade_text:'82.50'}],
    [kinds[1],{...common,id:ids[4],request_id:randomUUID(),academic_year:115,semester:1,summary_kind:'warning',attempted_credits:18,passed_credits:12,failed_credits:6}],
    [kinds[2],{...common,...term,id:ids[5],request_id:randomUUID(),department_ranking_text:'2 / 40 (5%)',class_ranking_text:'1 / 20 (5%)'}],
    [kinds[3],{...common,id:ids[6],request_id:randomUUID(),class_label:'QA Class',english_requirement_text:'Synthetic status recorded; no eligibility decision'}],
    [kinds[0],{...transcript,id:ids[7],request_id:randomUUID(),user_id:second.user.id,course_title:otherTitle}],
  ];
  for(const[kind,payload]of operations){const receipt=await save(kind,payload);assert.equal(receipt.version,1);assert.deepEqual(await save(kind,payload),receipt);}
  let data=(await snapshot(first)).academicGrades;assert.ok(data);assert.equal(data.records.length,3);assert.equal(data.termSummaries.length,2);assert.equal(data.rankings.length,1);assert.equal(data.metadata.length,1);
  for(const family of ['records','termSummaries','rankings','metadata'])assert.ok(data[family].every(row=>row.userId===first.user.id&&row.sourceMode==='local_demo'));
  assert.equal(data.records.find(row=>row.id===ids[0]).credits,0);assert.equal(data.records.find(row=>row.id===ids[0]).gradeText,'P');
  const secondData=(await snapshot(second)).academicGrades;assert.equal(secondData.records.length,1);assert.equal(secondData.records[0].userId,second.user.id);
  for(const family of ['termSummaries','rankings','metadata'])assert.equal(secondData[family].length,0);
  await assert.rejects(save(kinds[0],{...transcript,expected_version:'1',request_id:randomUUID(),credits:true}),{status:400});
  await assert.rejects(save(kinds[0],{...transcript,expected_version:'1',request_id:randomUUID(),foreign_field:'rejected'}),{status:400});
  checks.push('actual-JWT manager API writes and exact replay for all four kinds; HTTP 401/403/400, literal P/withdrawal, zero credits, explicit nonderived summaries, own-account reads and strict validation');

  phase='private academic assistant';
  const transcriptAnswer=await answer(first,'Show my academic transcript for academic year 114 semester 2','transcript');
  for(const value of[courseTitle,'QA Withdrawn','P','棄選','7.5','82.50'])assert.ok(transcriptAnswer.answer.includes(value),value);
  assert.ok(!transcriptAnswer.answer.includes(otherTitle)&&!transcriptAnswer.answer.includes(warningTitle));assert.equal(transcriptAnswer.grounding.source,'account');assert.equal(transcriptAnswer.grounding.webSearched,false);assert.ok(transcriptAnswer.citations.some(item=>item.url===root+'/transcript'));
  const warningAnswer=await answer(first,'Show my warning grades for academic year 115 semester 1','warning');
  for(const value of[warningTitle,'QA-WARN','18','12','6'])assert.ok(warningAnswer.answer.includes(value));assert.ok(!warningAnswer.answer.includes(courseTitle));assert.equal(warningAnswer.proposedAction,undefined);
  const rankingAnswer=await answer(first,'Show my semester rankings','ranking');
  // Traditional Chinese parentheses are presentation, not a different ranking.
  const rankingText=rankingAnswer.answer.normalize('NFKC');
  assert.match(rankingText,/(?:department ranking|系排名)[^\n]*?2\s*\/\s*40\s*\(5%\)/i);
  assert.match(rankingText,/(?:class ranking|班排名)[^\n]*?1\s*\/\s*20\s*\(5%\)/i);
  assert.ok(rankingAnswer.citations.some(item=>item.url===root+'/ranking'));
  assert.ok(!(await answer(second,'Show my academic transcript','transcript')).answer.includes(courseTitle));
  const ambiguous=await answer(first,'Show my grades','');assert.match(ambiguous.answer,/specify|which|選擇|指定/i);
  checks.push(assistantCheck+'; private transcript/warning/ranking answers, explicit summaries, local citations, no public search, no cross-account result and generic-grade ambiguity');

  phase='student academic pages';browser=await chromium.launch({headless:true,executablePath:env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const {page,context,errors}=await pageFor(first);await page.goto(origin+root);await page.locator('.academic-grade-index-table').getByRole('link',{name:'歷年成績查詢',exact:true}).click();
  await readyView(page,'transcript');assert.deepEqual(await page.locator('.academic-grade-transcript-table thead th').allTextContents(),['選課時間','科目名稱','類別','模組名稱','必選修','學分數','成績']);await capture(page,'transcript-desktop');
  assert.deepEqual(await page.locator('.academic-grade-transcript-table tbody tr:not(.academic-grade-term-summary) td:nth-child(7)').allTextContents(),['P','棄選']);
  assert.equal(await page.locator('.academic-grade-transcript-table tbody tr:not(.academic-grade-term-summary) td:nth-child(6)').first().innerText(),'0');
  assert.deepEqual(await page.locator('.academic-grade-term-summary .academic-grade-number').allTextContents(),['7.5','82.50']);
  const transcriptText=await page.locator('.academic-grades').innerText();for(const text of['7.5','82.50','QA Class','Synthetic status recorded'])assert.ok(transcriptText.includes(text));
  await page.reload();await page.getByRole('cell',{name:courseTitle,exact:true}).waitFor();
  await page.goto(origin+root+'/warning');await readyView(page,'warning');assert.deepEqual(await page.locator('.academic-grade-warning-table thead th').allTextContents(),['課程代碼','課程名稱','學分數','成績','備註']);assert.deepEqual(await page.locator('.academic-grade-warning-totals .academic-grade-number').allTextContents(),['18','12','6']);await capture(page,'warning-desktop');
  for(const text of['總修習學分數','及格學分數','不及格學分數','18','12','6'])assert.ok((await page.locator('.academic-grades').innerText()).includes(text));
  await page.goto(origin+root+'/ranking');await readyView(page,'ranking');assert.deepEqual(await page.locator('.academic-grade-ranking-table thead th').allTextContents(),['學年','學期','系排名','班排名']);await capture(page,'ranking-desktop');
  for(const width of[390,320])for(const view of['index','transcript','warning','ranking','transfer','cycle','current']){
    await page.setViewportSize({width,height:900});await page.goto(origin+root+(view==='index'?'':'/'+view));await readyView(page,view);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),view+' body must be contained at '+width);await capture(page,view+'-'+width);
  }
  const secondBrowser=await pageFor(second);await secondBrowser.page.goto(origin+root+'/transcript');await secondBrowser.page.getByRole('cell',{name:otherTitle,exact:true}).waitFor();assert.equal(await secondBrowser.page.getByRole('cell',{name:courseTitle,exact:true}).count(),0);
  assert.deepEqual(secondBrowser.errors,[]);await secondBrowser.context.close();assert.deepEqual(errors,[]);await context.close();checks.push('source column counts, index click-through, saved values on reload, explicit totals, desktop/390/320 layouts, empty/closed views and second-account UI');

  phase='revision and immutable ownership';
  const changed={...transcript,request_id:randomUUID(),expected_version:'1',grade_text:'',module_name:'',credits:null};assert.equal((await save(kinds[0],changed)).version,2);
  await assert.rejects(save(kinds[0],{...changed,request_id:randomUUID()}),{status:409});await assert.rejects(save(kinds[0],{...changed,course_title:'Changed reused request'}),{status:409});assert.deepEqual(await save(kinds[0],transcript),initial);
  await assert.rejects(save(kinds[0],{...changed,expected_version:'2',request_id:randomUUID(),user_id:second.user.id}),{status:403});
  data=(await snapshot(first)).academicGrades;const cleared=data.records.find(row=>row.id===ids[0]);assert.equal(cleared.version,2);assert.equal(cleared.credits,null);assert.equal(cleared.gradeText,null);assert.equal(cleared.moduleName,null);
  assert.equal((await sql`select id from public.affairs_agent_audit where user_id=${ownerId} and target_id in ${sql(ids)} and action_kind in ${sql(kinds)}`).length,9);
  assert.equal((await sql`select request_id from private.affairs_academic_grade_operations where user_id=${ownerId} and request_id in ${sql([...requests])}`).length,9);
  assert.deepEqual(await fingerprint(ownerId),ownerBefore,'Existing owner profile and identity must remain unchanged apart from normal sign-in timestamps.');
  checks.push('explicit clearing vs zero, stale/reused conflicts, stable late receipt, immutable owner, nine audits/receipts');
}catch(error){process.exitCode=1;console.error(`${phase}: ${error instanceof assert.AssertionError?error.message:error.name||'Error'}`);}
finally{
  const failures=[],clean=async(label,operation)=>{try{await operation();}catch{failures.push(label);}};
  await clean('Browser cleanup failed',()=>browser?.close());
  if(schemaReady&&ownerId){
    if(requests.size)await clean('Exact operation cleanup failed',()=>sql`delete from private.affairs_academic_grade_operations where user_id=${ownerId} and request_id in ${sql([...requests])} and payload->>'id' in ${sql(ids)}`);
    await clean('Exact audit cleanup failed',()=>sql`delete from public.affairs_agent_audit where user_id=${ownerId} and target_id in ${sql(ids)} and action_kind in ${sql(kinds)}`);
  }
  for(const id of users)await clean('Synthetic user cleanup failed',async()=>{const result=await admin.auth.admin.deleteUser(id);if(result.error)throw new Error('Synthetic deletion failed');});
  await clean('Exact fixture cleanup verification failed',async()=>{
    if(users.length){assert.equal((await sql`select id from auth.users where id in ${sql(users)}`).length,0);assert.equal((await sql`select user_id from auth.identities where user_id in ${sql(users)}`).length,0);assert.equal((await sql`select user_id from public.affairs_profiles where user_id in ${sql(users)}`).length,0);}
    if(schemaReady){for(const table of tables)assert.equal((await sql`select id from ${sql('public.'+table)} where id in ${sql(ids)}`).length,0);
      assert.equal((await sql`select id from public.affairs_agent_audit where target_id in ${sql(ids)}`).length,0);
      if(requests.size)assert.equal((await sql`select request_id from private.affairs_academic_grade_operations where user_id=${ownerId} and request_id in ${sql([...requests])}`).length,0);}
  });
  if(ownerSession)await clean('Owner local session logout failed',async()=>{const result=await ownerClient.auth.signOut({scope:'local'});assert.ok(!result.error);});
  if(ownerBefore)await clean('Owner identity verification failed',async()=>{assert.deepEqual(await fingerprint(ownerId),ownerBefore,'Existing owner must remain unchanged apart from normal sign-in timestamps.');});
  await clean('Database connection cleanup failed',()=>sql.end());if(failures.length){process.exitCode=1;console.error(failures.join('; '));}
  const result={origin,assistantMode,passed:!process.exitCode,checks,cleanupFailures:failures,adminWrites:local?'actual owner JWT through local affairs-manage handler':'actual owner JWT through deployed affairs-manage HTTP API',screenshots:output};await writeFile(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
