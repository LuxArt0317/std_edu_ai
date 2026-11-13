import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright-core';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';

// Requires a serialized live-test lease, applied migration 140000 and integrated
// native routes/API/evidence. No migration or real-account identity changes.
process.umask(0o077);
assert.ok(process.env.NATIVE_ORIGIN,'Set NATIVE_ORIGIN explicitly; this test never defaults to production.');
const origin=process.env.NATIVE_ORIGIN,parsedOrigin=new URL(origin),local=parsedOrigin.hostname==='127.0.0.1';
const deployment=JSON.parse(await readFile('deployment.json','utf8')),env=deploymentEnvironment();Object.assign(process.env,env);
assert.equal(parsedOrigin.origin,origin,'Use an origin without credentials, path, query or trailing slash.');
assert.ok(local&&parsedOrigin.protocol==='http:'||origin===deployment.vercel.productionUrl,'Use local http://127.0.0.1 or the configured production origin.');
assert.equal(deployment.repository,'LuxArt0317/std_edu_ai');assert.equal(deployment.supabase.projectRef,'xiftudmvxphxcjtmfmib');
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
// Working-tree handlers are imported ONLY for local Vite. Production calls the
// deployed HTTP API and never substitutes a local handler or mocked response.
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
const base='/school-affairs/services/14-1',tables=['affairs_academic_attendance_statistics','affairs_academic_attendance_details','affairs_academic_attendance_metadata'];
const kinds=['save_academic_attendance_statistic','save_academic_attendance_detail','save_academic_attendance_metadata'];
const runId=randomUUID(),ids=Array.from({length:8},()=>randomUUID()),users=[],requests=new Set(),checks=[];
const ownTitle='Synthetic attendance '+runId.slice(0,8),otherTitle='Other-account attendance '+runId.slice(0,8);
let browser,owner,ownerClient,ownerSession,schemaReady=false,phase='preconditions';
const phaseOf=value=>{phase=value;console.log('Attendance live: '+value);};
const fingerprint=async id=>(await sql`select u.id,md5((to_jsonb(u)-array['last_sign_in_at','updated_at'])::text) as auth_hash,md5(to_jsonb(p)::text) as profile_hash,
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
  assert.ok(!verified.error&&user?.id===owner.id&&user.email?.toLowerCase()===deployment.supabase.ownerEmail.toLowerCase()
    &&user.email_confirmed_at&&user.identities?.some(identity=>identity.provider==='google'),'Authenticated owner must match the existing verified administrator.');
  // Never load or initialize an owner snapshot; only exact fixture manager writes use this JWT.
}
async function invoke(endpoint,{token,method='GET',body}={}){
  if(token&&token===ownerSession?.access_token)assert.ok(endpoint==='/api/affairs-manage'&&method==='POST','Owner JWT is restricted to fixture manager writes; no owner snapshot or initialization.');
  if(!local){const response=await fetch(origin+endpoint,{method,redirect:'error',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});return checkedAssistantResult(endpoint,{status:response.status,body:await response.json()});}
  const parsed=new URL(endpoint,origin),handler=handlers[parsed.pathname];assert.ok(handler,'Unknown local bridge endpoint.');
  const result={status:200,body:undefined},response={status(code){result.status=code;return response;},json(value){result.body=value;},setHeader(){}};
  await handler({method,headers:token?{authorization:'Bearer '+token}:{},query:Object.fromEntries(parsed.searchParams),body},response);return checkedAssistantResult(endpoint,result);
}
async function request(endpoint,options={}){const result=await invoke(endpoint,options);assert.equal(result.status,options.status??200,`${phase}: unexpected API status for ${endpoint}`);return result.body;}
const snapshot=session=>request('/api/affairs-data',{token:session.access_token});
async function answer(session,question,route=base){
  const response=await request('/api/affairs-assistant',{token:session.access_token,method:'POST',body:{question,route}});
  assert.equal(response.grounding?.source,'account');assert.equal(response.grounding?.webSearched,false);assert.equal(response.proposedAction,undefined);
  assert.ok(response.citations?.some(item=>item.url===base||item.url===base+'/detail'),'Answer must cite native attendance records.');
  return response;
}
function ownBundle(snapshotValue,userId){
  const value=snapshotValue.academicAttendance;assert.ok(value,'Native attendance must be integrated into the real snapshot.');
  for(const collection of ['statistics','details','metadata']){assert.ok(Array.isArray(value[collection]));assert.ok(value[collection].every(row=>row.userId===userId&&row.sourceMode==='local_demo'),'Every attendance collection is owner scoped.');}
  return value;
}
async function fixture(number){
  const email=`academic-attendance-qa-${randomUUID()}@example.invalid`,password=randomBytes(32).toString('base64url')+'Aa1!';
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:`Synthetic Attendance QA ${number}`}});
  if(created.error||!created.data.user)throw new Error('Synthetic account creation failed.');
  const id=created.data.user.id;users.push(id);
  await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
    values(${id},${id},${sql.json({sub:id,email,email_verified:true})},'google',now(),now(),now())`;
  const signed=await createClient(url,key,{auth}).auth.signInWithPassword({email,password});
  if(signed.error||!signed.data.session)throw new Error('Synthetic account sign-in failed.');
  const initial=ownBundle(await snapshot(signed.data.session),id);for(const key of ['statistics','details','metadata'])assert.deepEqual(initial[key],[],'New accounts must not receive fabricated attendance.');
  return signed.data.session;
}
async function save(kind,payload){
  assert.ok(ownerSession&&kinds.includes(kind)&&ids.includes(payload.id)&&users.includes(payload.user_id)&&payload.user_id!==owner.id,'Only exact generated fixture records may be changed.');requests.add(payload.request_id);
  for(const table of tables){const [existing]=await sql`select user_id from ${sql('public.'+table)} where id=${payload.id}`;if(existing)assert.ok(users.includes(existing.user_id),'Refuse a non-fixture target.');}
  const result=await invoke('/api/affairs-manage',{method:'POST',token:ownerSession.access_token,body:{kind,payload}});
  if(result.status!==200)throw Object.assign(new Error('Manager request failed.'),{status:result.status});
  return result.body;
}
function payloads(userId,start,title){
  const shared={user_id:userId,expected_version:0},term={academic_year:115,semester:1,course_code:'LOCAL-ATTEND-001',course_title:title,row_order:0};
  return [
    {...shared,...term,id:ids[start],request_id:randomUUID(),student_number:'QA-ATTEND',student_name:'Synthetic Attendance Student',total_teaching_hours:54,
      current_teaching_weeks:7.5,current_teaching_hours:22.5,absence_hours:0,unexcused_absence_hours:null},
    {...shared,...term,id:ids[start+1],request_id:randomUUID(),teacher_name:'Synthetic Teacher',absence_type_text:'Literal QA category',course_date:'2026-11-12',period_text:'A–B',roll_called_at:'2026-11-13T08:30:00.123456+08:00'},
    {...shared,id:ids[start+2],request_id:randomUUID(),current_academic_year:115,current_semester:1},
  ];
}
async function pageFor(session){
  const context=await browser.newContext({viewport:{width:1280,height:900},locale:'zh-TW',reducedMotion:'reduce'});
  await context.addInitScript(({origin,session})=>{if(window.top!==window||location.origin!==origin||sessionStorage.getItem('attendance-qa'))return;
    localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));sessionStorage.setItem('attendance-qa','1');},{origin,session});
  if(local)await context.route('**/api/**',async route=>{const req=route.request(),endpoint=new URL(req.url());if(endpoint.origin!==origin||!handlers[endpoint.pathname])return route.continue();
    const result=await invoke(endpoint.pathname+endpoint.search,{method:req.method(),token:req.headers().authorization?.slice(7),body:req.postData()?JSON.parse(req.postData()):undefined});await route.fulfill({status:result.status,json:result.body});});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));return{context,page,errors};
}
async function ready(page){await page.locator('.academic-attendance-main[aria-busy="false"]').waitFor();assert.equal(await page.locator('.academic-attendance [role="alert"]').count(),0);}
try{
  const [administrator]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id
    where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and p.role='admin'
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
  assert.ok(administrator,'Existing verified Google administrator required; no owner identity/profile initialization is permitted.');owner=await fingerprint(administrator.id);
  for(const table of tables)assert.ok((await sql`select to_regclass(${'public.'+table}) as name`)[0].name,'Apply the reviewed attendance migration before this live test.');schemaReady=true;
  for(const table of tables)assert.equal((await sql`select id from ${sql('public.'+table)} where id in ${sql(ids)}`).length,0,'Generated fixture IDs must be unused.');
  await authenticateOwner();
  const first=await fixture(1),second=await fixture(2),mine=payloads(first.user.id,0,ownTitle),theirs=payloads(second.user.id,3,otherTitle);
  phaseOf('authorization and empty account');
  await request('/api/affairs-data',{status:401});await request('/api/affairs-data?scope=admin',{token:first.access_token,status:403});
  await request('/api/affairs-manage',{method:'POST',body:{kind:kinds[0],payload:mine[0]},status:401});
  await request('/api/affairs-manage',{method:'POST',token:first.access_token,body:{kind:kinds[0],payload:mine[0]},status:403});
  await request('/api/affairs-manage',{method:'POST',token:first.access_token,body:{kind:kinds[0],payload:[]},status:400});
  const emptyAnswer=await answer(first,'Show my current academic attendance statistics');assert.match(emptyAnswer.answer,/not.*(?:designated|set)|尚未.*(?:當學期|指定)/i);
  browser=await chromium.launch({headless:true,executablePath:env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const ownPage=await pageFor(first);await ownPage.page.goto(origin+base);await ready(ownPage.page);await ownPage.page.getByText('尚未設定當學期。',{exact:true}).waitFor();
  checks.push('fresh account empty snapshot/UI/answer; 401/403/400 authorization');

  phaseOf('three actual-JWT manager API writes and owner isolation');
  const firstReceipts=[];
  for(let i=0;i<kinds.length;i++){const receipt=await save(kinds[i],mine[i]);assert.equal(receipt.version,1);assert.deepEqual(await save(kinds[i],mine[i]),receipt);firstReceipts.push(receipt);await save(kinds[i],theirs[i]);}
  let firstSnapshot=await snapshot(first),own=ownBundle(firstSnapshot,first.user.id),foreign=ownBundle(await snapshot(second),second.user.id);
  for(const collection of ['statistics','details','metadata']){assert.equal(own[collection].length,1);assert.equal(foreign[collection].length,1);}
  assert.equal(own.statistics[0].absenceHours,0);assert.equal(own.statistics[0].unexcusedAbsenceHours,null);assert.equal(own.statistics[0].currentTeachingWeeks,7.5);
  assert.equal(own.details[0].courseDate,'2026-11-12');assert.equal(own.details[0].absenceTypeText,'Literal QA category');assert.equal(own.details[0].periodText,'A–B');
  assert.match(own.details[0].rollCalledAt,/\.123456(?:[+-]|Z)/,'All microseconds survive persistence.');assert.equal(Date.parse(own.details[0].rollCalledAt),Date.parse(mine[1].roll_called_at));
  assert.ok(!JSON.stringify(own).includes(otherTitle)&&!JSON.stringify(foreign).includes(ownTitle));
  const spoofed=ownBundle(await request('/api/affairs-data?user_id='+second.user.id,{token:first.access_token}),first.user.id);assert.ok(!JSON.stringify(spoofed).includes(otherTitle));
  const student=createClient(url,key,{auth,global:{headers:{Authorization:'Bearer '+first.access_token}}});
  for(let i=0;i<tables.length;i++){
    const read=await student.from(tables[i]).select('id').in('id',[mine[i].id,theirs[i].id]);assert.equal(read.error,null);assert.deepEqual(read.data.map(row=>row.id),[mine[i].id]);
    const write=await student.from(tables[i]).update({version:99}).eq('id',mine[i].id);assert.ok(write.error,'Authenticated students cannot write directly.');
  }
  await assert.rejects(save(kinds[0],{...mine[0],request_id:randomUUID(),expected_version:1,private_identity:'DO-NOT-STORE'}),{status:400});
  await assert.rejects(save(kinds[1],{...mine[1],request_id:randomUUID(),expected_version:1,course_date:'2026-02-29'}),{status:400});
  await assert.rejects(save(kinds[2],{...mine[2],request_id:randomUUID(),expected_version:1,current_semester:null}),{status:400});
  for(const i of [0,2])await assert.rejects(save(kinds[i],{...mine[i],id:ids[6+(i===2?1:0)],request_id:randomUUID()}),{status:409});
  checks.push('actual-JWT manager API writes and exact replay for all three kinds; HTTP 400/409, strict fields/dates/pair, unique statistic/metadata, own/API/RLS isolation, direct-write denial, literal null/zero/date/microseconds');

  phaseOf(assistantMode+' private attendance answers');
  const statistics=await answer(first,'Show my current academic attendance statistics');assert.ok(statistics.answer.includes(ownTitle));assert.ok(!statistics.answer.includes(otherTitle));
  assert.match(statistics.answer,/54/);assert.match(statistics.answer,/22\.5/);assert.match(statistics.answer,/unexcused[^\n]*not recorded|曠課[^\n]*未記錄/i);
  const details=await answer(first,'Show my absence details on 2026-11-12',base+'/detail');assert.ok(details.answer.includes(ownTitle));assert.match(details.answer,/Literal QA category/);assert.match(details.answer,/2026-11-12/);assert.match(details.answer,/A–B/);
  const wrongDate=await answer(first,'Show my absence details on 2026-11-13',base+'/detail');assert.match(wrongDate.answer,/no.*(?:records|entries)|沒有.*紀錄/i);assert.ok(!wrongDate.answer.includes(ownTitle),'Date filters use the course date, not the later roll-call date.');
  const weekly=await answer(first,'How many hours was I absent last week?');assert.match(weekly.answer,/unavailable|not (?:stored|available|recorded)|沒有.*(?:加總|時數)/i);
  assert.match(weekly.answer,/cannot.*(?:converted|infer|derive)|不能.*(?:換算|推算)/i);assert.ok(weekly.answer.includes(base+'/detail')||weekly.citations.some(item=>item.url===base+'/detail'));
  const otherAnswer=await answer(second,'Show my current academic attendance statistics');assert.ok(otherAnswer.answer.includes(otherTitle));assert.ok(!otherAnswer.answer.includes(ownTitle));
  checks.push(assistantCheck+'; own-account evidence/local citations, no public search/write, literal values, course-date filtering and unsupported weekly-hour clarification');

  phaseOf('native statistics and detail pages');
  await ownPage.page.goto(origin+'/school-affairs/menu/aca/query');const link=ownPage.page.locator('[data-program-id="14-1"]');await link.waitFor();assert.equal(await link.getAttribute('href'),base);await link.click();await ready(ownPage.page);
  await ownPage.page.getByRole('cell',{name:ownTitle,exact:true}).waitFor();
  assert.deepEqual(await ownPage.page.locator('.academic-attendance-statistics-table thead th').allTextContents(),['學號','姓名','課號','課程名稱','本學期授課總時數','目前授課總週次','目前授課總時數','目前缺課時數','目前曠課時數']);
  assert.deepEqual(await ownPage.page.locator('.academic-attendance-statistics-table tbody td').allTextContents(),['QA-ATTEND','Synthetic Attendance Student','LOCAL-ATTEND-001',ownTitle,'54','7.5','22.5','0','—']);
  await ownPage.page.locator('.academic-attendance-switch a').click();
  await ownPage.page.locator('.academic-attendance-detail-table').getByRole('cell',{name:ownTitle,exact:true}).waitFor();
  await ready(ownPage.page);assert.equal(new URL(ownPage.page.url()).pathname,base+'/detail');
  assert.deepEqual(await ownPage.page.locator('.academic-attendance-detail-table thead th').allTextContents(),['課號','課程名稱','授課老師','類別','課程日期','節次','點名時間']);
  const cells=await ownPage.page.locator('.academic-attendance-detail-table tbody td').allTextContents();assert.deepEqual(cells.slice(0,6),['LOCAL-ATTEND-001',ownTitle,'Synthetic Teacher','Literal QA category','2026/11/12','A–B']);assert.match(cells[6],/2026\/11\/13.*08:30:00/);
  await ownPage.page.reload();await ready(ownPage.page);await ownPage.page.getByRole('cell',{name:ownTitle,exact:true}).waitFor();
  for(const width of [390,320]){await ownPage.page.setViewportSize({width,height:900});for(const suffix of ['', '/detail']){await ownPage.page.goto(origin+base+suffix);await ready(ownPage.page);await ownPage.page.getByRole('cell',{name:ownTitle,exact:true}).waitFor();assert.ok(await ownPage.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Native attendance page contains its table on mobile.');}}
  const otherPage=await pageFor(second);await otherPage.page.goto(origin+base+'/detail');await ready(otherPage.page);await otherPage.page.getByRole('cell',{name:otherTitle,exact:true}).waitFor();assert.equal(await otherPage.page.getByRole('cell',{name:ownTitle,exact:true}).count(),0);assert.deepEqual(otherPage.errors,[]);await otherPage.context.close();
  checks.push('catalog 14-1 click-through, nine/seven source columns, explicit zero/dash, Taipei display distinct from course date, reload, 390/320 containment and second-account UI');

  phaseOf('clearing, version/replay and exact audits');
  const clearStatistic={...mine[0],request_id:randomUUID(),expected_version:1,absence_hours:null,unexcused_absence_hours:0};
  const clearDetail={...mine[1],request_id:randomUUID(),expected_version:1,teacher_name:'',absence_type_text:null,course_date:null,period_text:'',roll_called_at:null};
  const clearTerm={...mine[2],request_id:randomUUID(),expected_version:1,current_academic_year:null,current_semester:null};
  for(const [i,payload] of [clearStatistic,clearDetail,clearTerm].entries()){
    assert.equal((await save(kinds[i],payload)).version,2);assert.deepEqual(await save(kinds[i],mine[i]),firstReceipts[i]);
    await assert.rejects(save(kinds[i],{...payload,request_id:randomUUID()}),{status:409});
    await assert.rejects(save(kinds[i],{...payload,expected_version:2}),{status:409});
    await assert.rejects(save(kinds[i],{...payload,expected_version:2,request_id:randomUUID(),user_id:second.user.id}),{status:403});
  }
  own=ownBundle(await snapshot(first),first.user.id);assert.equal(own.statistics[0].absenceHours,null);assert.equal(own.statistics[0].unexcusedAbsenceHours,0);
  assert.equal(own.details[0].teacherName,'');assert.equal(own.details[0].periodText,'');for(const field of ['courseDate','rollCalledAt','absenceTypeText'])assert.equal(own.details[0][field],null);
  assert.equal(own.metadata[0].currentAcademicYear,null);assert.equal(own.metadata[0].currentSemester,null);
  await ownPage.page.goto(origin+base);await ready(ownPage.page);await ownPage.page.getByText('尚未設定當學期。',{exact:true}).waitFor();assert.equal(await ownPage.page.locator('.academic-attendance-table tbody tr').count(),0);
  const clearedAnswer=await answer(first,'Show my current academic attendance statistics');assert.match(clearedAnswer.answer,/not.*(?:designated|set)|尚未.*(?:當學期|指定)/i);assert.ok(!clearedAnswer.answer.includes(ownTitle));
  assert.equal((await sql`select id from public.affairs_agent_audit where user_id=${owner.id} and target_id in ${sql(ids)} and action_kind in ${sql(kinds)}`).length,9);
  assert.equal((await sql`select request_id from private.affairs_academic_attendance_operations where user_id=${owner.id} and request_id in ${sql([...requests])} and payload->>'id' in ${sql(ids)}`).length,9);
  assert.deepEqual(ownPage.errors,[]);await ownPage.context.close();assert.deepEqual(await fingerprint(owner.id),owner,'Existing owner profile and identity must remain unchanged apart from normal sign-in timestamps.');
  checks.push('null/zero/blank clearing, explicit current-term removal hides historical UI rows, immutable owners, late retry/stale/reused-ID conflicts and exactly nine audits/receipts');
}catch(error){process.exitCode=1;console.error(`${phase}: ${error instanceof assert.AssertionError?error.message:error.name||'Error'}`);}
finally{
  const failures=[],clean=async(label,operation)=>{try{await operation();}catch{failures.push(label);}};
  await clean('Browser cleanup failed',()=>browser?.close());
  if(schemaReady&&owner){
    if(requests.size)await clean('Exact receipt cleanup failed',()=>sql`delete from private.affairs_academic_attendance_operations where user_id=${owner.id} and request_id in ${sql([...requests])} and payload->>'id' in ${sql(ids)} and kind in ${sql(kinds)}`);
    await clean('Exact audit cleanup failed',()=>sql`delete from public.affairs_agent_audit where user_id=${owner.id} and target_id in ${sql(ids)} and action_kind in ${sql(kinds)}`);
  }
  for(const id of users)await clean('Synthetic account cleanup failed',async()=>{const result=await admin.auth.admin.deleteUser(id);if(result.error)throw new Error('Synthetic deletion failed');});
  await clean('Exact cleanup verification failed',async()=>{
    if(users.length){assert.equal((await sql`select id from auth.users where id in ${sql(users)}`).length,0);assert.equal((await sql`select user_id from auth.identities where user_id in ${sql(users)}`).length,0);assert.equal((await sql`select user_id from public.affairs_profiles where user_id in ${sql(users)}`).length,0);}
    if(schemaReady){for(const table of tables)assert.equal((await sql`select id from ${sql('public.'+table)} where id in ${sql(ids)}`).length,0);
      assert.equal((await sql`select id from public.affairs_agent_audit where target_id in ${sql(ids)}`).length,0);
      if(requests.size&&owner)assert.equal((await sql`select request_id from private.affairs_academic_attendance_operations where user_id=${owner.id} and request_id in ${sql([...requests])}`).length,0);}
  });
  if(ownerSession)await clean('Owner local session logout failed',async()=>{const result=await ownerClient.auth.signOut({scope:'local'});assert.ok(!result.error);});
  if(owner)await clean('Owner identity verification failed',async()=>{assert.deepEqual(await fingerprint(owner.id),owner,'Existing owner must remain unchanged apart from normal sign-in timestamps.');});
  await clean('Database connection cleanup failed',()=>sql.end({timeout:5}));if(failures.length){process.exitCode=1;console.error(failures.join('; '));}
  console.log(JSON.stringify({origin,assistantMode,passed:!process.exitCode,checks,cleanupFailures:failures,adminWrites:local?'actual owner JWT through local affairs-manage handler':'actual owner JWT through deployed affairs-manage HTTP API',artifacts:'none'}));
}
