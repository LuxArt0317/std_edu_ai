import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,stat,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright-core';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';

// Prepared acceptance test: run only with the root's serialized client DB lease.
// Both modes use real disposable accounts and real data. Production never imports
// working-tree handlers. No model calls, document records, files, or downloads.
process.umask(0o077);
const deployment=JSON.parse(await readFile('deployment.json','utf8'));
const origin=process.env.NATIVE_ORIGIN;
assert.ok(['http://127.0.0.1:5184','http://localhost:5184','https://stu.best'].includes(origin),
  'Explicit NATIVE_ORIGIN=http://127.0.0.1:5184 or https://stu.best is required before creating fixtures.');
assert.equal(deployment.vercel.productionUrl,'https://stu.best');
assert.equal(deployment.supabase.projectRef,'xiftudmvxphxcjtmfmib');
assert.equal(process.argv.length,2,'This test accepts no flags and never invokes a model.');
const local=new URL(origin).hostname!=='stu.best',mode=local?'local_handlers':'deployed_http';
const env=deploymentEnvironment();Object.assign(process.env,env);
const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;
assert.equal(new URL(url).origin,'https://xiftudmvxphxcjtmfmib.supabase.co');
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
let target;try{target=new URL(connection);}catch{throw new Error('The client database connection is unavailable.');}
assert.ok(target.hostname==='db.xiftudmvxphxcjtmfmib.supabase.co'||
  target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.xiftudmvxphxcjtmfmib'),
  'Only the configured client database is allowed.');
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
const auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false};
function projectFetch(input,init={}){
  const destination=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  assert.equal(destination.origin,new URL(url).origin,'Authentication and fixture requests must stay in the client project.');
  const timeout=AbortSignal.timeout(20000);
  return fetch(input,{...init,redirect:'error',signal:init.signal?AbortSignal.any([init.signal,timeout]):timeout});
}
const admin=createClient(url,env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY,{auth,global:{fetch:projectFetch}});
const sql=postgres(connection,{max:1,connect_timeout:15,connection:{statement_timeout:20000},
  ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const handlers=local?{
  '/api/affairs-data':(await import('../../api/affairs-data.ts')).default,
  '/api/affairs-manage':(await import('../../api/affairs-manage.ts')).default,
}:{};
const runId=randomUUID(),ids=[randomUUID(),randomUUID(),randomUUID()],operations=[],checks=[];
const fixtures=[1,2].map(number=>({number,id:null,email:`certificate-live-${randomUUID()}@example.invalid`}));
const output=`artifacts/enrollment-certificate/${local?'local':'production'}-${runId}`;
const ledgerPath=output+'/fixture-ledger.json';
const path='/school-affairs/services/17-1',scope='/api/affairs-data?scope=enrollment-certificate';
const kind='save_enrollment_certificate_assessment',table='affairs_enrollment_certificate_assessments';
let ownerId,ownerBefore,ownerClient,ownerSession,browser,schemaReady=false,phase='preflight',testPassed=false;
let failure=null,modelAttempts=0,documentAttempts=0,documentRecordCount=null;
const fixtureIds=()=>fixtures.flatMap(item=>item.id?[item.id]:[]);
async function ledger(state='active',cleanupFailures=[]){
  const value={runId,origin,mode,state,fixtureAccounts:fixtures,assessmentIds:ids,operations,cleanupFailures};
  // Atomic replacement keeps the previous exact ledger readable if interrupted.
  await writeFile(ledgerPath+'.next',JSON.stringify(value,null,2),{mode:0o600});
  await rename(ledgerPath+'.next',ledgerPath);
}
const fingerprint=async id=>(await sql`select u.id,md5((to_jsonb(u)-array['last_sign_in_at','updated_at'])::text) as auth_hash,
  md5(to_jsonb(p)::text) as profile_hash,
  (select md5(coalesce(jsonb_agg(to_jsonb(i)-array['last_sign_in_at','updated_at'] order by i.id),'[]'::jsonb)::text)
    from auth.identities i where i.user_id=u.id) as identities_hash
  from auth.users u join public.affairs_profiles p on p.user_id=u.id where u.id=${id}`)[0];
async function authenticateOwner(){
  const file=await stat('.env.owner.local');
  assert.ok(file.isFile()&&(file.mode&0o077)===0,'The existing owner credential file must be private.');
  const credentials=parseEnv(await readFile('.env.owner.local','utf8'));
  assert.ok(credentials.CRM_ADMIN_EMAIL?.toLowerCase()===deployment.supabase.ownerEmail.toLowerCase()&&credentials.CRM_ADMIN_PASSWORD,
    'Existing configured owner credentials are required.');
  ownerClient=createClient(url,key,{auth,global:{fetch:projectFetch}});
  const result=await ownerClient.auth.signInWithPassword({email:credentials.CRM_ADMIN_EMAIL,password:credentials.CRM_ADMIN_PASSWORD});
  ownerSession=result.data.session;
  assert.ok(!result.error&&ownerSession,'Existing owner sign-in failed.');
  const verified=await ownerClient.auth.getUser(ownerSession.access_token),user=verified.data.user;
  assert.ok(!verified.error&&user?.id===ownerId&&user.email?.toLowerCase()===deployment.supabase.ownerEmail.toLowerCase()
    &&user.email_confirmed_at&&user.identities?.some(item=>item.provider==='google'),
    'The actual JWT must belong to the existing verified Google administrator.');
}
async function invoke(endpoint,{token,method='GET',body}={}){
  const parsed=new URL(endpoint,origin);
  assert.ok(['/api/affairs-data','/api/affairs-manage'].includes(parsed.pathname),'Only data and manager endpoints are allowed.');
  if(token===ownerSession?.access_token&&token){
    assert.ok(endpoint==='/api/affairs-manage'&&method==='POST'&&body?.kind===kind,
      'Owner JWT is restricted to exact fixture assessment writes; never load or initialize its snapshot.');
    assert.ok(operations.some(item=>item.requestId===body.payload?.request_id&&item.actorId===ownerId&&item.id===body.payload?.id));
  }
  if(!local){
    const response=await fetch(origin+endpoint,{method,redirect:'error',
      headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});
    return {status:response.status,body:await response.json(),cacheControl:response.headers.get('cache-control')};
  }
  const result={status:200,body:undefined,cacheControl:null};
  const response={status(code){result.status=code;return response;},json(value){result.body=value;},
    setHeader(name,value){if(name.toLowerCase()==='cache-control')result.cacheControl=value;}};
  await handlers[parsed.pathname]({method,headers:token?{authorization:'Bearer '+token}:{},
    query:Object.fromEntries(parsed.searchParams),body},response);
  return result;
}
async function request(endpoint,options={}){
  const result=await invoke(endpoint,options);
  assert.equal(result.status,options.status??200,`${phase}: ${endpoint} returned HTTP ${result.status}`);
  assert.match(result.cacheControl||'',/no-store/,'Private API responses must not be cached.');
  return result.body;
}
const read=session=>request(scope,{token:session.access_token});
async function verifyFixture(item){
  assert.ok(item.id&&item.id!==ownerId&&fixtures.includes(item));
  const [row]=await sql`select id,email,raw_user_meta_data->>'certificate_qa_run' as run from auth.users where id=${item.id}`;
  assert.ok(row?.id===item.id&&row.email===item.email&&row.run===runId,'Refuse to mutate a non-fixture account.');
}
async function fixture(item){
  // The exact generated email is already durable before Auth creation. A lost
  // response can be recovered by this email plus the unique run marker only.
  await ledger();
  const password=randomBytes(32).toString('base64url')+'Aa1!';
  const result=await admin.auth.admin.createUser({email:item.email,password,email_confirm:true,
    user_metadata:{full_name:`Certificate QA ${item.number}`,certificate_qa_run:runId}});
  if(result.data.user){item.id=result.data.user.id;await ledger();}
  assert.ok(!result.error&&item.id,'Synthetic account creation failed.');
  await verifyFixture(item);
  await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
    values(${item.id},${item.id},${sql.json({sub:item.id,email:item.email,email_verified:true})},'google',now(),now(),now())`;
  const client=createClient(url,key,{auth,global:{fetch:projectFetch}});
  const signed=await client.auth.signInWithPassword({email:item.email,password});
  assert.ok(!signed.error&&signed.data.session?.user.id===item.id,'Synthetic sign-in failed.');
  // Only disposable callers initialize the existing independent account profile.
  const snapshot=await request('/api/affairs-data',{token:signed.data.session.access_token});
  assert.equal(snapshot.profile.userId,item.id);
  assert.deepEqual(await read(signed.data.session),{assessments:[],documents:[]});
  return signed.data.session;
}
async function save(payload,{session=ownerSession,status=200,envelope={}}={}){
  assert.ok(session&&ids.includes(payload.id)&&fixtureIds().includes(payload.user_id)&&payload.user_id!==ownerId);
  assert.ok(session.user.id===ownerId||fixtureIds().includes(session.user.id));
  const [existing]=await sql`select user_id from public.affairs_enrollment_certificate_assessments where id=${payload.id}`;
  if(existing)assert.ok(fixtureIds().includes(existing.user_id),'Refuse a non-fixture assessment target.');
  if(!operations.some(item=>item.requestId===payload.request_id&&item.actorId===session.user.id)){
    operations.push({requestId:payload.request_id,actorId:session.user.id,id:payload.id,userId:payload.user_id});await ledger();
  }
  return request('/api/affairs-manage',{method:'POST',token:session.access_token,body:{kind,payload,...envelope},status});
}
async function rest(session,query,{method='GET',body,status=200}={}){
  const result=await projectFetch(url+'/rest/v1/'+table+query,{method,
    headers:{apikey:key,Authorization:'Bearer '+session.access_token,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(result.status,status,'Actual caller JWT must enforce the assessment RLS/privilege boundary.');
  return result.json();
}
function assertOwn(data,session,id){
  assert.deepEqual(Object.keys(data).sort(),['assessments','documents']);
  assert.deepEqual(data.documents,[]);assert.equal(data.assessments.length,1);
  assert.equal(data.assessments[0].id,id);assert.equal(data.assessments[0].userId,session.user.id);
  assert.equal(data.assessments[0].sourceMode,'local_demo');return data.assessments[0];
}
async function pageFor(session){
  const context=await browser.newContext({viewport:{width:1533,height:1100},locale:'zh-TW',reducedMotion:'reduce'});
  await context.addInitScript(({origin,session})=>{
    if(window.top!==window||location.origin!==origin||sessionStorage.getItem('certificate-live-qa'))return;
    localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));sessionStorage.setItem('certificate-live-qa','1');
  },{origin,session});
  // A guard against accidental model calls, never a substitute answer.
  await context.route('**/api/affairs-assistant*',route=>{modelAttempts++;return route.abort();});
  if(local)await context.route('**/api/**',async route=>{
    const req=route.request(),destination=new URL(req.url());
    if(!handlers[destination.pathname])return route.fallback();
    const result=await invoke(destination.pathname+destination.search,{method:req.method(),
      token:req.headers().authorization?.slice(7),body:req.postData()?JSON.parse(req.postData()):undefined});
    await route.fulfill({status:result.status,headers:{'Cache-Control':result.cacheControl||'no-store'},json:result.body});
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];
  page.on('pageerror',()=>errors.push('Browser page error'));
  page.on('request',req=>{if(/enrollment-certificate.*(?:download|document)|scope=.*certificate.*document/.test(req.url()))documentAttempts++;});
  page.on('download',()=>{documentAttempts++;});
  return {page,context,errors};
}
async function ready(page){
  await page.locator('.enrollment-certificate-main[aria-busy="false"]').waitFor();
  assert.equal(await page.locator('.enrollment-certificate [role="alert"]').count(),0);
  assert.deepEqual(await page.locator('.enrollment-certificate-table th').allTextContents(),['目前學年度','目前學期','是否有待繳費用','在學證明']);
  assert.equal(await page.locator('.enrollment-certificate-local-document').count(),0);
  assert.equal(await page.locator('.enrollment-certificate-main form, .enrollment-certificate-main input, .enrollment-certificate-main button, .enrollment-certificate a[download]').count(),0);
}
async function capture(page,name){
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('.enrollment-certificate').screenshot({path:`${output}/${name}.png`});
}

try{
  await mkdir(output,{recursive:true,mode:0o700});await ledger();
  const [owner]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id
    where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and p.role='admin'
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
  assert.ok(owner,'The existing verified Google/admin identity is required and is never created or repaired by this test.');ownerId=owner.id;
  assert.equal((await sql`select count(*)::int as count from supabase_migrations.schema_migrations where version='20261112160000'`)[0].count,1,
    'Apply the reviewed certificate migration before acceptance.');
  for(const name of [table,'affairs_enrollment_certificate_documents']){
    const [entry]=await sql`select relrowsecurity from pg_class where oid=to_regclass(${'public.'+name})`;
    assert.equal(entry?.relrowsecurity,true);
  }
  schemaReady=true;ownerBefore=await fingerprint(ownerId);await authenticateOwner();
  phase='temporary callers';const first=await fixture(fixtures[0]),second=await fixture(fixtures[1]);
  phase='assessment API and isolation';
  await request(scope,{status:401});
  await request('/api/affairs-data?scope=enrollment-certificate-admin',{token:first.access_token,status:403});
  await request(scope+'&user_id='+second.user.id,{token:first.access_token,status:400});
  const common={expected_version:0,academic_year:130,semester:1,has_pending_fees:'N',status:'blocked',
    result_text:'QA local blocked assessment; no document issued.',assessed_at:'2026-01-02T03:04:05Z',
    student_number:'LOCAL-CERT-'+runId.slice(0,8),student_name:'Synthetic Certificate Student One',
    department_name:'Local QA Department',year_text:'',class_label:null};
  const blocked={...common,id:ids[0],user_id:first.user.id,request_id:randomUUID()};
  await save(blocked,{session:first,status:403});
  await request('/api/affairs-manage',{method:'POST',body:{kind,payload:blocked},status:401});
  const receipt=await save(blocked);assert.equal(receipt.version,1);assert.deepEqual(await save(blocked),receipt);
  const other={...common,id:ids[1],user_id:second.user.id,request_id:randomUUID(),has_pending_fees:'Y',
    student_number:'LOCAL-OTHER-'+runId.slice(0,8),student_name:'Synthetic Certificate Student Two',result_text:'Other private QA blocked assessment.'};
  assert.equal((await save(other)).version,1);
  let current=assertOwn(await read(first),first,ids[0]);
  assert.equal(current.version,1);assert.equal(current.status,'blocked');assert.equal(current.hasPendingFees,'N');
  assert.equal(current.identity.studentName,common.student_name);assert.equal(current.identity.yearText,'');assert.equal(current.identity.classLabel,null);
  assert.equal(new Date(current.assessedAt).toISOString(),'2026-01-02T03:04:05.000Z');
  assert.equal(assertOwn(await read(second),second,ids[1]).identity.studentName,other.student_name);
  assert.deepEqual(await rest(first,'?select=id,user_id&id=eq.'+ids[1]),[]);
  assert.deepEqual(await rest(second,'?select=id,user_id&id=eq.'+ids[0]),[]);
  const direct=await rest(first,'?select=id,user_id&id=eq.'+ids[0]);assert.deepEqual(direct,[{id:ids[0],user_id:first.user.id}]);
  await rest(first,'?id=eq.'+ids[0],{method:'PATCH',body:{status:'local_eligible'},status:403});
  await save({...blocked,request_id:randomUUID(),expected_version:1,academic_year:0},{status:400});
  await save({...blocked,request_id:randomUUID(),expected_version:1,signed_url:'https://invalid.example/never-stored'},{status:400});
  await save({...blocked,request_id:randomUUID(),expected_version:1},{status:400,envelope:{extra:true}});
  await save({...blocked,request_id:randomUUID(),expected_version:0,id:ids[2]},{status:409});
  await save({...blocked,request_id:randomUUID(),expected_version:1,user_id:second.user.id},{status:403});
  checks.push('Actual admin JWT assessment create and replay; own/cross-account JWT reads, anonymous 401, student 403, invalid input/envelope 400, immutable owner and duplicate-owner 409; N remains explicitly blocked.');

  phase='native certificate UI';
  browser=await chromium.launch({headless:true,executablePath:env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const firstPage=await pageFor(first),secondPage=await pageFor(second),page=firstPage.page;
  await page.goto(origin+'/school-affairs/menu/aca/query');
  await page.locator('[data-program-id="17-1"]').click();await page.waitForURL(origin+path);await ready(page);
  assert.deepEqual(await page.locator('.enrollment-certificate-table tbody td').allTextContents(),['130','1','N',common.result_text]);
  const profile=await page.locator('.enrollment-certificate-profile').innerText();
  for(const text of [common.student_number,common.student_name,common.department_name])assert.ok(profile.includes(text));
  assert.ok(!profile.includes(other.student_name));await capture(page,'blocked-desktop');
  await page.reload();await ready(page);assert.equal(await page.getByRole('cell',{name:common.result_text,exact:true}).count(),1);
  await secondPage.page.goto(origin+path);await ready(secondPage.page);
  assert.equal(await secondPage.page.getByRole('cell',{name:other.result_text,exact:true}).count(),1);
  assert.ok(!(await secondPage.page.locator('.enrollment-certificate').innerText()).includes(common.student_number));
  checks.push('Actual catalog 17-1 navigation and independent account UI, four source columns, saved blocked assessment after reload, no generated document or download control.');

  phase='revision, nulls and unknown state';
  const unknown={...blocked,request_id:randomUUID(),expected_version:1,academic_year:null,semester:null,has_pending_fees:null,
    status:'unknown',result_text:null,assessed_at:null,department_name:null,year_text:null,class_label:''};
  assert.equal((await save(unknown)).version,2);
  await save({...unknown,request_id:randomUUID()},{status:409});
  await save({...unknown,result_text:'Changed request reuse'},{status:409});
  assert.deepEqual(await save(blocked),receipt,'Late retry returns the original receipt without overwriting the current record.');
  current=assertOwn(await read(first),first,ids[0]);
  assert.equal(current.version,2);assert.equal(current.status,'unknown');
  for(const field of ['academicYear','semester','hasPendingFees','resultText','assessedAt'])assert.equal(current[field],null);
  assert.equal(current.identity.departmentName,null);assert.equal(current.identity.yearText,null);assert.equal(current.identity.classLabel,'');
  await page.reload();await ready(page);
  assert.deepEqual(await page.locator('.enrollment-certificate-table tbody td').allTextContents(),['—','—','—','尚未完成站內條件確認']);
  for(const width of [390,320]){
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile document must remain contained.');
    const region=page.getByRole('region',{name:'在學證明條件紀錄，可左右捲動'});await region.focus();
    assert.equal(await region.evaluate(element=>element===document.activeElement),true);
    if(width===390)await capture(page,'unknown-390');
  }
  assert.deepEqual(firstPage.errors,[]);assert.deepEqual(secondPage.errors,[]);
  await firstPage.context.close();await secondPage.context.close();
  assert.equal(modelAttempts,0);assert.equal(documentAttempts,0);
  documentRecordCount=(await sql`select count(*)::int as count from public.affairs_enrollment_certificate_documents where user_id in ${sql(fixtureIds())}`)[0].count;
  assert.equal(documentRecordCount,0);
  assert.equal((await sql`select count(*)::int as count from private.affairs_enrollment_certificate_operations
    where user_id=${ownerId} and request_id in ${sql(operations.map(item=>item.requestId))}`)[0].count,3);
  assert.equal((await sql`select count(*)::int as count from public.affairs_agent_audit
    where user_id=${ownerId} and action_kind=${kind} and target_id in ${sql(ids)}`)[0].count,3);
  assert.deepEqual(await fingerprint(ownerId),ownerBefore);
  checks.push('Explicit null/blank values and unknown state, revision 2, stale/reused-request 409, stable late replay, three exact audits/receipts, mobile 390/320 containment; no documents or model requests.');
  testPassed=true;
}catch(error){
  process.exitCode=1;failure={phase,type:error instanceof assert.AssertionError?'AssertionError':error?.name||'Error'};
  // Never print arbitrary API/SDK errors, request bodies, credentials or sessions.
  console.error(`Certificate acceptance failed during ${phase} (${failure.type}); inspect the exact private fixture ledger.`);
}finally{
  const cleanupFailures=[];
  const clean=async(label,operation)=>{try{await operation();}catch{cleanupFailures.push(label);}};
  await clean('browser-close',()=>browser?.close());
  // Resolve an interrupted Auth creation by its exact pre-recorded email AND run
  // marker. Never enumerate or delete a shared-prefix population.
  for(const item of fixtures)await clean('fixture-identity-recovery-'+item.number,async()=>{
    if(item.id)return;
    const rows=await sql`select id,raw_user_meta_data->>'certificate_qa_run' as run from auth.users where email=${item.email}`;
    assert.ok(rows.length<=1);
    if(rows.length){assert.equal(rows[0].run,runId);item.id=rows[0].id;await ledger();}
  });
  if(schemaReady&&ownerId)await clean('exact-receipts-and-audits',async()=>{
    const owned=fixtureIds();
    for(const row of await sql`select user_id from public.affairs_enrollment_certificate_assessments where id in ${sql(ids)}`)
      assert.ok(owned.includes(row.user_id),'Refuse cleanup of a non-fixture assessment.');
    if(operations.length)await sql`delete from private.affairs_enrollment_certificate_operations
      where user_id in ${sql([ownerId,...owned])} and request_id in ${sql(operations.map(item=>item.requestId))}
        and payload->>'id' in ${sql(ids)} and payload->>'user_id' in ${sql(owned)}`;
    await sql`delete from public.affairs_agent_audit where user_id in ${sql([ownerId,...owned])}
      and target_id in ${sql(ids)} and action_kind=${kind}`;
  });
  for(const item of fixtures)if(item.id)await clean('fixture-account-'+item.number,async()=>{
    await verifyFixture(item);
    for(let attempt=0;attempt<3;attempt++){
      const result=await admin.auth.admin.deleteUser(item.id);
      if(!result.error)return;
      // A successful deletion with a lost response is also a clean outcome.
      if((await sql`select id from auth.users where id=${item.id}`).length===0)return;
    }
    throw new Error('Synthetic account deletion failed.');
  });
  await clean('exact-cleanup-verification',async()=>{
    for(const item of fixtures)assert.equal((await sql`select id from auth.users where email=${item.email}`).length,0);
    const owned=fixtureIds();
    if(owned.length){
      for(const name of ['auth.users','auth.identities','public.affairs_profiles']){
        const column=name==='auth.users'?'id':'user_id';
        assert.equal((await sql`select ${sql(column)} from ${sql(name)} where ${sql(column)} in ${sql(owned)}`).length,0);
      }
      if(schemaReady)for(const name of [table,'affairs_enrollment_certificate_documents'])
        assert.equal((await sql`select id from ${sql('public.'+name)} where user_id in ${sql(owned)}`).length,0);
    }
    if(schemaReady){
      assert.equal((await sql`select id from public.affairs_enrollment_certificate_assessments where id in ${sql(ids)}`).length,0);
      assert.equal((await sql`select id from public.affairs_agent_audit where target_id in ${sql(ids)}`).length,0);
      if(operations.length)assert.equal((await sql`select request_id from private.affairs_enrollment_certificate_operations
        where request_id in ${sql(operations.map(item=>item.requestId))}`).length,0);
    }
  });
  if(ownerSession)await clean('owner-local-signout',async()=>{assert.ok(!(await ownerClient.auth.signOut({scope:'local'})).error);});
  if(ownerBefore)await clean('owner-preservation',async()=>{assert.deepEqual(await fingerprint(ownerId),ownerBefore);});
  await clean('database-close',()=>sql.end({timeout:5}));
  if(cleanupFailures.length)process.exitCode=1;
  const result={origin,mode,passed:testPassed&&!cleanupFailures.length,checks,failure,cleanupFailures,
    fixtureCleanup:cleanupFailures.length?'incomplete':'verified',adminWrites:'actual existing administrator JWT; exact synthetic assessment targets only',
    modelRequestsBlocked:modelAttempts,documentRequests:documentAttempts,fixtureDocumentRowsObserved:documentRecordCount,documentWritesAttempted:0,artifacts:output};
  await ledger(cleanupFailures.length?'cleanup-required':'cleaned',cleanupFailures);
  await writeFile(output+'/result.json',JSON.stringify(result,null,2),{mode:0o600});
  console.log(JSON.stringify(result));
}
