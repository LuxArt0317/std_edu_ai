import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright-core';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import dataHandler from '../../api/affairs-data.ts';
import actionHandler from '../../api/affairs-action.ts';
import managerHandler from '../../api/affairs-manage.ts';
import assistantHandler from '../../api/affairs-assistant.ts';

process.umask(0o077);
const deployment=JSON.parse(await readFile('deployment.json','utf8'));
const env=deploymentEnvironment();
Object.assign(process.env,env);
const origin=process.env.NATIVE_ORIGIN || deployment.vercel.productionUrl;
const local=new URL(origin).hostname==='127.0.0.1';
assert.ok(local || origin===deployment.vercel.productionUrl,'Only the client production URL or loopback may be tested.');
const url=env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
assert.equal(new URL(url).hostname,deployment.supabase.projectRef+'.supabase.co');
const connection=env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
const target=new URL(connection);
assert.ok(target.hostname===`db.${deployment.supabase.projectRef}.supabase.co` || target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.'+deployment.supabase.projectRef));
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
const auth={persistSession:false,autoRefreshToken:false};
const admin=createClient(url,env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY,{auth});
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const users=[],checks=[],ownerRequests=[],runId=randomUUID();
const aidId=randomUUID(),periodId=randomUUID(),assignmentId=randomUUID();
const output=`artifacts/native-student-services/${local?'local':'production'}-${runId}`;
let browser,phase='setup';
const handlers={'/api/affairs-data':dataHandler,'/api/affairs-action':actionHandler,'/api/affairs-manage':managerHandler,'/api/affairs-assistant':assistantHandler};
async function invoke(path,{token,method='GET',body}={}) {
  if(!local) {
    const response=await fetch(origin+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});
    return {status:response.status,body:await response.json()};
  }
  const parsed=new URL(path,origin);const handler=handlers[parsed.pathname];assert.ok(handler);
  const result={status:200,body:undefined};
  const response={status(code){result.status=code;return response;},json(body){result.body=body;},setHeader(){}};
  await handler({method,headers:token?{authorization:'Bearer '+token}:{},query:Object.fromEntries(parsed.searchParams),body},response);
  return result;
}
async function request(path,options={}) {
  const result=await invoke(path,options);assert.equal(result.status,options.status??200,`${phase}: ${path} status ${result.status}`);return result.body;
}
const snapshot=session=>request('/api/affairs-data',{token:session.access_token});
const answer=(session,question,route)=>request('/api/affairs-assistant',{method:'POST',token:session.access_token,body:{question,route}});
async function fixture(number) {
  const email=`native-service-qa-${randomUUID()}@example.invalid`,password=randomBytes(32).toString('base64url')+'Aa1!';
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:`Native Service QA ${number}`}});
  if(created.error||!created.data.user)throw new Error('Synthetic account creation failed.');
  const id=created.data.user.id;users.push(id);
  await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
    values(${id},${id},${sql.json({sub:id,email,email_verified:true})},'google',now(),now(),now())`;
  const signed=await createClient(url,key,{auth}).auth.signInWithPassword({email,password});
  if(signed.error||!signed.data.session)throw new Error('Synthetic account sign-in failed.');
  await snapshot(signed.data.session);return signed.data.session;
}
async function ownerCall(rpc,kind,payload) {
  assert.ok(['public.affairs_manage_student_aid_record','public.affairs_housing_action'].includes(rpc));
  ownerRequests.push(payload.request_id);
  return sql.begin(async tx=>{
    const [owner]=await tx`select p.user_id from public.affairs_profiles p join auth.users u on u.id=p.user_id where p.role='admin' and lower(u.email)=lower(${deployment.supabase.ownerEmail})`;
    assert.ok(owner,'Configured owner profile required');
    await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${owner.user_id},true)`;
    const rows = rpc === 'public.affairs_manage_student_aid_record'
      ? await tx`select public.affairs_manage_student_aid_record(${kind},${tx.json(payload)}) as result`
      : await tx`select public.affairs_housing_action(${kind},${tx.json(payload)}) as result`;
    return rows[0].result;
  });
}
async function pageFor(session,width=1533) {
  const context=await browser.newContext({viewport:{width,height:1000},locale:'zh-TW',reducedMotion:'reduce'});
  await context.addInitScript(({origin,session})=>{
    if(window.top!==window||location.origin!==origin||sessionStorage.getItem('native-qa'))return;
    localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));sessionStorage.setItem('native-qa','1');
  },{origin,session});
  if(local)await context.route('**/api/**',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(!handlers[u.pathname])return route.continue();
    const result=await invoke(u.pathname+u.search,{method:req.method(),token:req.headers().authorization?.slice(7),body:req.postData()?JSON.parse(req.postData()):undefined});
    await route.fulfill({status:result.status,json:result.body});
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  return {context,page,errors};
}
async function capture(page,name,selector) {
  await page.locator(selector).waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.locator(selector).screenshot({path:`${output}/${name}.png`});
}
try {
  await mkdir(output,{recursive:true,mode:0o700});
  const first=await fixture(1),second=await fixture(2);
  phase='anonymous and role guards';
  await request('/api/affairs-data?scope=catalog',{status:401});
  await request('/api/affairs-data?scope=admin',{token:first.access_token,status:403});
  await request('/api/affairs-manage',{method:'POST',token:first.access_token,body:{kind:'save_student_aid_record',payload:{id:aidId}},status:403});
  phase='aid persistence';
  const aid={id:aidId,user_id:first.user.id,request_id:randomUUID(),expected_version:'0',academic_year:'115',semester:'1',application_kind:'Synthetic local aid QA',subsidy_amount:'12500',relative_count:'0',school_review_status:'QA review complete',ministry_review_status:'',student_record_locked:'false',masked_identity_number:'******1234'};
  const saved=await ownerCall('public.affairs_manage_student_aid_record','save_student_aid_record',aid);
  assert.equal(saved.version,1);
  let data=await snapshot(first);assert.equal(data.studentAid.records.find(row=>row.id===aidId).subsidyAmount,12500);
  assert.equal((await snapshot(second)).studentAid.records.some(row=>row.id===aidId),false);
  const aidAnswer=await answer(first,'What is my student aid subsidy amount?','/school-affairs/services/22-1');
  assert.match(aidAnswer.answer,/12,500/);assert.equal(aidAnswer.grounding.source,'account');assert.equal(aidAnswer.grounding.webSearched,false);
  assert.ok(aidAnswer.citations.some(row=>row.url==='/school-affairs/services/22-1'));
  assert.doesNotMatch((await answer(second,'What is my student aid subsidy amount?','/school-affairs/services/22-1')).answer,/12,500/);
  checks.push('aid persistence, account isolation, local grounded answer');
  phase='housing period and assignment';
  const term='QA local housing '+runId.slice(0,8);
  const period={id:periodId,term_label:term,academic_year:'115',semester:'1',opens_at:new Date(Date.now()-3600000).toISOString(),closes_at:new Date(Date.now()+3600000).toISOString(),published:'true',instructions:'Synthetic QA period only',agreement_text:'This is a synthetic local application test. It creates no university application or housing commitment.',expected_version:'0',request_id:randomUUID()};
  assert.equal((await ownerCall('public.affairs_housing_action','save_housing_period',period)).version,1);
  await ownerCall('public.affairs_housing_action','save_housing_assignment',{id:assignmentId,user_id:first.user.id,period_id:periodId,bed_number:'QA-'+runId.slice(0,8),dormitory:'QA Demonstration Residence',bunk:'upper',accommodation_fee:'15000',deposit:'',expected_version:'0',request_id:randomUUID()});
  assert.equal((await snapshot(first)).housing.assignments.find(row=>row.id===assignmentId).accommodationFee,15000);
  assert.equal((await snapshot(second)).housing.assignments.some(row=>row.id===assignmentId),false);
  const bedAnswer=await answer(first,'What is my dormitory bed and housing fee?','/school-affairs/services/34-1');
  assert.match(bedAnswer.answer,/QA Demonstration Residence/);assert.match(bedAnswer.answer,/15000/);assert.equal(bedAnswer.grounding.source,'account');
  checks.push('admin-published housing period, own bed history and grounded answer');
  phase='catalog query';
  const catalog=await request('/api/affairs-data?scope=catalog',{token:first.access_token});
  assert.ok(catalog.rows.length>0);assert.equal(catalog.can_manage,false);
  const course=catalog.rows[0];
  const one=await request('/api/affairs-data?scope=catalog&id='+course.id,{token:first.access_token});
  assert.equal(one.total,1);assert.equal(one.rows[0].id,course.id);
  const none=await request('/api/affairs-data?scope=catalog&keyword='+runId,{token:first.access_token});assert.equal(none.total,0);
  assert.ok(!(await snapshot(first)).courses.some(row=>row.code===course.course_code),'Catalog must not enroll the student.');
  checks.push('catalog search, detail, empty results, enrollment independence');
  browser=await chromium.launch({headless:true,executablePath:env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const {page,context,errors}=await pageFor(first);
  phase='aid browser';
  await page.goto(origin+'/school-affairs/services/22-1');
  await page.getByRole('cell',{name:'12,500',exact:true}).waitFor();
  await page.getByRole('button',{name:'開啟 AI 校園助理',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await capture(page,'student-aid-desktop','.student-aid');
  await page.reload();await page.getByRole('cell',{name:'12,500',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:/申請|新增/}).count(),0,'Read-only source must not invent an Apply control.');
  phase='housing browser submission and receipt';
  await page.goto(origin+'/school-affairs/services/26-1');
  const periodSection=page.locator('.housing-period').filter({has:page.getByRole('heading',{name:term,exact:true})});
  await periodSection.getByRole('button',{name:'住宿申請(舊生)',exact:true}).click();
  await page.getByRole('button',{name:'同意',exact:true}).click();
  await page.getByLabel('姓名',{exact:true}).fill('Synthetic Housing Student');
  await page.getByRole('radio',{name:'男',exact:true}).check();
  await page.getByLabel('系別',{exact:true}).fill('Synthetic Department');
  await page.getByLabel('學號',{exact:true}).fill('QA-STUDENT');
  await page.getByLabel('出生年（民國）',{exact:true}).selectOption('2000');
  await page.getByLabel('出生月',{exact:true}).selectOption('1');
  await page.getByLabel('出生日',{exact:true}).selectOption('2');
  await page.getByLabel('戶籍地址',{exact:true}).fill('Synthetic QA address');
  await page.getByLabel('郵遞區號(戶籍地址)',{exact:true}).fill('000');
  await page.getByLabel(/三、身體狀況/).fill('QA PRIVATE NOTE MUST NOT ENTER CHAT');
  await capture(page,'housing-application-desktop','.housing-workspace');
  await page.getByRole('button',{name:'送出',exact:true}).click();
  await page.getByRole('button',{name:'確認無誤，送出…',exact:true}).click();
  await page.getByRole('button',{name:'列印(請務必列印存查)',exact:true}).waitFor();
  data=await snapshot(first);const application=data.housing.applications.find(row=>row.periodId===periodId);
  assert.ok(application);assert.equal(application.fullName,'Synthetic Housing Student');
  await capture(page,'housing-receipt-desktop','.housing-workspace');
  await page.reload();
  await page.locator('.housing-period').filter({has:page.getByRole('heading',{name:term,exact:true})}).getByRole('button',{name:'列印存查',exact:true}).click();
  await page.getByText(application.receiptNumber,{exact:true}).waitFor();
  assert.equal((await sql`select id from public.affairs_housing_applications where user_id=${first.user.id} and period_id=${periodId}`).length,1);
  const housingAnswer=await answer(first,'Show my housing application receipt','/school-affairs/services/26-1');
  assert.ok(housingAnswer.answer.includes(application.receiptNumber));assert.doesNotMatch(housingAnswer.answer,/PRIVATE NOTE|Synthetic QA address/);
  assert.equal((await snapshot(second)).housing.applications.some(row=>row.id===application.id),false);
  await page.goto(origin+'/school-affairs/services/34-1');await page.getByRole('cell',{name:'QA Demonstration Residence',exact:true}).waitFor();
  await capture(page,'housing-history-desktop','.housing-history');
  checks.push('housing agreement, entry, confirmation, durable receipt/reprint, private data excluded from chat');
  phase='catalog browser';
  await page.goto(origin+'/school-affairs/services/12-4');
  await page.getByRole('link',{name:course.course_name,exact:true}).click();
  await page.getByText('課程資訊',{exact:true}).waitFor();
  await capture(page,'course-detail-desktop','.catalog-detail');
  await page.getByRole('link',{name:'回上頁',exact:true}).click();
  await page.getByRole('link',{name:course.course_code,exact:true}).click();
  await page.getByRole('heading',{name:'樹德科技大學 課程大綱',exact:true}).waitFor();
  assert.equal(await page.locator('.syllabus-weeks tbody tr').count(),18);
  assert.equal(await page.locator('.syllabus-sdgs tbody tr').count(),17);
  await capture(page,'course-syllabus-desktop','.course-syllabus');
  await page.getByRole('link',{name:'回上頁',exact:true}).click();
  await page.getByLabel('課程關鍵字',{exact:true}).fill(runId);
  await page.getByRole('button',{name:'查詢 Search',exact:true}).click();
  await page.getByText('目前沒有符合查詢條件的課程。',{exact:true}).waitFor();
  await page.getByRole('button',{name:'重設',exact:true}).click();
  await page.getByRole('link',{name:course.course_name,exact:true}).waitFor();
  await capture(page,'course-catalog-desktop','.course-catalog');
  for(const width of [768,390,320]) {
    await page.setViewportSize({width,height:900});
    for(const [path,selector] of [['22-1','.student-aid'],['12-4','.course-catalog'],['26-1','.housing-workspace'],['34-1','.housing-history'],['12-4?syllabus='+course.id,'.course-syllabus']]) {
      await page.goto(origin+'/school-affairs/services/'+path);await page.locator(selector).waitFor();
      if(path==='22-1')await page.getByRole('cell',{name:'12,500',exact:true}).waitFor();
      else if(path==='12-4')await page.getByRole('link',{name:course.course_name,exact:true}).waitFor();
      else if(path==='26-1')await page.getByRole('heading',{name:term,exact:true}).waitFor();
      else if(path==='34-1')await page.getByRole('cell',{name:'QA Demonstration Residence',exact:true}).waitFor();
      else await page.getByRole('heading',{name:'樹德科技大學 課程大綱',exact:true}).waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${path} body overflows at${width}`);
      await capture(page,`${path}-${width}`,selector);
    }
  }
  assert.deepEqual(errors,[]);await context.close();
  checks.push('desktop/mobile actual UI, reload, native links, no browser errors');
  console.log(JSON.stringify({origin,checks,screenshots:output}));
} catch(error) {
  process.exitCode=1;console.error(`${phase}: ${error.message}`);
} finally {
  const failures=[];
  const clean=async(label,operation)=>{try{await operation();}catch{failures.push(label);}};
  await clean('Browser cleanup failed',()=>browser?.close());
  for(const id of users.reverse()) {
    await clean('Synthetic user cleanup failed',async()=>{
      const deleted=await admin.auth.admin.deleteUser(id);if(deleted.error)throw deleted.error;
    });
  }
  await clean('Synthetic user cleanup verification failed',async()=>{
    for(const id of users)assert.equal((await sql`select id from auth.users where id=${id}`).length,0);
  });
  if(ownerRequests.length) {
    await clean('Aid operation cleanup failed',()=>sql`delete from private.affairs_student_aid_operations where request_id in ${sql(ownerRequests)}`);
    await clean('Housing operation cleanup failed',()=>sql`delete from private.affairs_housing_operations where request_id in ${sql(ownerRequests)}`);
  }
  await clean('Audit fixture cleanup failed',()=>sql`delete from public.affairs_agent_audit where target_id in ${sql([aidId,periodId,assignmentId])}`);
  await clean('Housing period cleanup failed',()=>sql`delete from public.affairs_housing_periods where id=${periodId}`);
  await clean('Fixture cleanup verification failed',async()=>{
    assert.equal((await sql`select id from public.affairs_housing_periods where id=${periodId}`).length,0);
    assert.equal((await sql`select id from public.affairs_student_aid_records where id=${aidId}`).length,0);
  });
  await clean('Database connection cleanup failed',()=>sql.end());
  if(failures.length){console.error(failures.join('; '));process.exitCode=1;}
  await writeFile(output+'/result.json',JSON.stringify({origin,checks,passed:!process.exitCode,cleanupFailures:failures},null,2));
}
