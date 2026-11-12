import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright-core';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';
import dataHandler from '../../api/affairs-data.ts';
import managerHandler from '../../api/affairs-manage.ts';
import assistantHandler from '../../api/affairs-assistant.ts';

// Real API/database/browser checks for 39-1 and 11-3. Only generated account fixtures may be changed.
// The configured administrator must already exist; this test never changes its auth/profile rows.
process.umask(0o077);
const deployment=JSON.parse(await readFile('deployment.json','utf8'));
const env=deploymentEnvironment();Object.assign(process.env,env);
const origin=process.env.NATIVE_ORIGIN||deployment.vercel.productionUrl;
const local=new URL(origin).hostname==='127.0.0.1';
assert.ok(local||origin===deployment.vercel.productionUrl,'Only the configured production URL or loopback may be tested.');
const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;
assert.equal(new URL(url).hostname,deployment.supabase.projectRef+'.supabase.co');
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL;
const target=new URL(connection);
assert.ok(target.hostname===`db.${deployment.supabase.projectRef}.supabase.co`||target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.'+deployment.supabase.projectRef));
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
const auth={persistSession:false,autoRefreshToken:false};
const admin=createClient(url,env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY,{auth});
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const users=[],students=[],charges=new Set(),checks=[],runId=randomUUID(),historyRequests=new Set();
const historyId=randomUUID(),historyPath='/school-affairs/services/11-3';
const output=`artifacts/pending-fees/${local?'local':'production'}-${runId}`;
const path='/school-affairs/services/39-1';
const label='Synthetic local fee '+runId.slice(0,8);
const contact='QA Finance '+runId.slice(0,8);
const handlers={'/api/affairs-data':dataHandler,'/api/affairs-manage':managerHandler,'/api/affairs-assistant':assistantHandler};
let browser,ownerId,phase='setup';

async function invoke(endpoint,{token,method='GET',body}={}) {
  if(!local) {
    const response=await fetch(origin+endpoint,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});
    return {status:response.status,body:await response.json()};
  }
  const parsed=new URL(endpoint,origin),handler=handlers[parsed.pathname];assert.ok(handler);
  const result={status:200,body:undefined};
  const response={status(code){result.status=code;return response;},json(body){result.body=body;},setHeader(){}};
  await handler({method,headers:token?{authorization:'Bearer '+token}:{},query:Object.fromEntries(parsed.searchParams),body},response);
  return result;
}
async function request(endpoint,options={}) {
  const result=await invoke(endpoint,options);
  assert.equal(result.status,options.status??200,`${phase}: ${endpoint} status ${result.status}`);
  return result.body;
}
const snapshot=session=>request('/api/affairs-data',{token:session.access_token});
const answer=(session,question,route=path)=>request('/api/affairs-assistant',{method:'POST',token:session.access_token,body:{question,route}});
async function fixture(number) {
  const email=`pending-fees-qa-${randomUUID()}@example.invalid`,password=randomBytes(32).toString('base64url')+'Aa1!';
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:`Pending Fees QA ${number}`}});
  if(created.error||!created.data.user)throw new Error('Synthetic account creation failed.');
  const id=created.data.user.id;users.push(id);
  await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
    values(${id},${id},${sql.json({sub:id,email,email_verified:true})},'google',now(),now(),now())`;
  const signed=await createClient(url,key,{auth}).auth.signInWithPassword({email,password});
  if(signed.error||!signed.data.session)throw new Error('Synthetic account sign-in failed.');
  const data=await snapshot(signed.data.session);assert.ok(data.student?.id);students.push(data.student.id);
  return {session:signed.data.session,studentId:data.student.id};
}
async function ownerCall(kind,payload) {
  assert.ok(['save_charge','delete_charge'].includes(kind),'Only charge fixture operations are allowed.');
  return sql.begin(async tx=>{
    if(kind==='save_charge') {
      assert.ok(students.includes(payload.student_id),'Only an exact generated fixture student may be changed.');
      const [student]=await tx`select id from public.affairs_students where id=${payload.student_id} and user_id in ${tx(users)} and source_mode='sample'`;
      assert.ok(student,'Fixture ownership must match.');
    }
    if(payload.id) {
      const [charge]=await tx`select c.id from public.affairs_charges c join public.affairs_students s on s.id=c.student_id
        where c.id=${payload.id} and s.user_id in ${tx(users)} and c.source_mode='sample'`;
      assert.ok(charge,'Only an exact generated fixture charge may be changed.');charges.add(charge.id);
    }
    await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${ownerId},true)`;
    const [saved]=await tx`select public.affairs_manage_record(${kind},${tx.json(payload)}) as result`;
    charges.add(saved.result.id);return saved.result;
  });
}
async function ownerHistoryCall(payload) {
  assert.equal(payload.id,historyId,'Only the exact credit-load history fixture may be changed.');
  assert.ok(users.includes(payload.user_id),'Only generated fixture accounts may own test history.');
  historyRequests.add(payload.request_id);
  return sql.begin(async tx=>{
    const [existing]=await tx`select user_id from public.affairs_credit_load_history where id=${historyId}`;
    if(existing)assert.ok(users.includes(existing.user_id),'Existing history must belong to a generated fixture account.');
    await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${ownerId},true)`;
    const [saved]=await tx`select public.affairs_manage_credit_load_history('save_credit_load_history',${tx.json(payload)}) as result`;
    return saved.result;
  });
}
async function pageFor(session) {
  const context=await browser.newContext({viewport:{width:1533,height:1000},locale:'zh-TW',reducedMotion:'reduce'});
  await context.addInitScript(({origin,session})=>{
    if(window.top!==window||location.origin!==origin||sessionStorage.getItem('pending-fees-qa'))return;
    localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));sessionStorage.setItem('pending-fees-qa','1');
  },{origin,session});
  if(local)await context.route('**/api/**',async route=>{
    const req=route.request(),endpoint=new URL(req.url());
    if(!handlers[endpoint.pathname])return route.continue();
    const result=await invoke(endpoint.pathname+endpoint.search,{method:req.method(),token:req.headers().authorization?.slice(7),body:req.postData()?JSON.parse(req.postData()):undefined});
    await route.fulfill({status:result.status,json:result.body});
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  return {context,page,errors};
}
async function capture(page,name,selector='.pending-fees') {
  await page.evaluate(()=>document.fonts.ready);
  await page.locator(selector).screenshot({path:`${output}/${name}.png`});
}
const normalized=values=>values.map(value=>value.replace(/\s+/g,' ').trim());

try {
  await mkdir(output,{recursive:true,mode:0o700});
  // Read prerequisites before creating any fixtures. No owner identity/profile fallback is permitted.
  const [owner]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id
    where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and p.role='admin'
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
  assert.ok(owner,'Admin checks unavailable: the configured owner must already have a verified Google identity and admin profile.');ownerId=owner.id;
  assert.equal((await sql`select column_name from information_schema.columns where table_schema='public' and table_name='affairs_charges'
    and column_name in ('occurrence_on','category','contact_unit','contact_extension','payment_unit')`).length,5,'Apply the pending-fee migration before running this test.');
  assert.ok((await sql`select to_regclass('public.affairs_credit_load_history') as name`)[0].name,'Apply the credit-load history migration before running this test.');
  const first=await fixture(1),second=await fixture(2);
  phase='authorization and HTTP validation';
  await request('/api/affairs-data',{status:401});
  await request('/api/affairs-data?scope=admin',{token:first.session.access_token,status:403});
  await request('/api/affairs-manage',{method:'POST',token:first.session.access_token,body:{kind:'save_charge',payload:{student_id:first.studentId,label}},status:403});
  await request('/api/affairs-manage',{method:'POST',token:first.session.access_token,body:{kind:'save_charge',payload:[]},status:400});
  checks.push('anonymous read 401, student manager write/admin snapshot 403, invalid HTTP payload 400');

  phase='admin RPC persistence and account isolation';
  const payload={student_id:first.studentId,label,amount_due:'1234.75',amount_paid:'234.25',due_on:'2026-12-31',occurrence_on:'2026-11-12',category:'QA Category',contact_unit:contact,contact_extension:'9876、9877',payment_unit:'QA Cashier'};
  const saved=await ownerCall('save_charge',payload);assert.ok(saved.id);
  let data=await snapshot(first.session),record=data.charges.find(row=>row.id===saved.id);
  assert.ok(record);assert.equal(record.sourceMode,'sample');assert.equal(record.amountDue,1234.75);assert.equal(record.amountPaid,234.25);
  assert.equal(record.dueOn,'2026-12-31');assert.equal(record.occurrenceOn,'2026-11-12');
  assert.equal(record.category,'QA Category');assert.equal(record.contactUnit,contact);assert.equal(record.contactExtension,'9876、9877');assert.equal(record.paymentUnit,'QA Cashier');
  assert.equal((await snapshot(second.session)).charges.some(row=>row.id===saved.id),false);
  await assert.rejects(ownerCall('save_charge',{...payload,id:saved.id,amount_due:'10000000000'}),{code:'22023'});
  await assert.rejects(ownerCall('save_charge',{...payload,id:saved.id,occurrence_on:'2026-02-30'}),{code:'22008'});
  await assert.rejects(ownerCall('save_charge',{...payload,id:saved.id,unrecognized_field:'rejected'}),{code:'22023'});
  assert.equal((await snapshot(first.session)).charges.find(row=>row.id===saved.id).amountDue,1234.75);
  checks.push('audited owner RPC creates own sample charge; metadata persisted; cross-account isolation; invalid money/date/unknown keys rejected without changes');

  phase='grounded assistant';
  const question='What are my pending fees, contact units and extensions, payment units, occurrence dates and due dates?';
  const reply=await answer(first.session,question);
  for(const value of [label,contact,'9876、9877','QA Cashier','NT$1,000.5','2026-11-12','2026-12-31'])assert.ok(reply.answer.includes(value),'Grounded answer must include '+value);
  assert.equal(reply.grounding.source,'account');assert.equal(reply.grounding.webSearched,false);assert.equal(reply.proposedAction,undefined);
  assert.ok(reply.citations.some(row=>row.url===path));
  const otherReply=await answer(second.session,question);assert.ok(!otherReply.answer.includes(label));assert.ok(!otherReply.answer.includes(contact));
  checks.push('personal assistant reports persisted amount/contacts/distinct dates with local 39-1 citation and no cross-account data');

  browser=await chromium.launch({headless:true,executablePath:env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const {page,context,errors}=await pageFor(first.session);
  phase='native browser record and assistant';
  await page.goto(origin+path);
  const row=page.locator('.pending-fees tbody tr').filter({has:page.getByRole('cell',{name:label,exact:true})});
  await row.waitFor();
  assert.equal(await page.locator('.pending-fees thead th').count(),8);
  assert.deepEqual(normalized(await row.locator('td').allTextContents()),['2026/11/12',label,'QA Category','1,000.5',contact,'9876、9877','QA Cashier','未繳Pending Payment']);
  assert.equal(await page.locator('.pending-fees input,.pending-fees form').count(),0,'The source fee list has no payment form.');
  assert.equal(await page.getByRole('button',{name:/pay now|立即繳費|線上繳費|付款/i}).count(),0,'No payment gateway control may be invented.');
  await capture(page,'desktop');
  await page.reload();await row.waitFor();
  await page.getByRole('button',{name:'開啟 AI 校園助理',exact:true}).click();
  const chat=page.getByRole('dialog',{name:/Assistant/});
  await chat.getByRole('textbox',{name:'Your question'}).fill(question);
  await chat.getByRole('button',{name:'Send',exact:true}).click();
  await chat.getByRole('link',{name:'My pending payments',exact:true}).waitFor();
  assert.equal(await chat.getByRole('link',{name:'My pending payments',exact:true}).getAttribute('href'),path);
  assert.ok((await chat.getByRole('log',{name:'Assistant conversation'}).innerText()).includes(contact));
  await page.keyboard.press('Escape');await chat.waitFor({state:'hidden'});
  for(const width of [768,390,320]) {
    await page.setViewportSize({width,height:900});await row.waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Fee page body must be contained at '+width);
    await capture(page,'mobile-'+width);
  }
  const other=await pageFor(second.session);
  await other.page.goto(origin+path);await other.page.locator('.pending-fees-datetime').filter({hasNotText:'—'}).waitFor();
  assert.equal(await other.page.getByRole('cell',{name:label,exact:true}).count(),0);
  assert.deepEqual(other.errors,[]);await other.context.close();
  checks.push('native eight-column desktop/mobile UI, reload, browser assistant, isolated second account and no payment controls');

  phase='admin update and explicit metadata clearing';
  const edited={...payload,id:saved.id,amount_paid:'334.25',category:'Updated QA Category',contact_unit:contact+' Updated',contact_extension:'7777',payment_unit:'Updated QA Cashier'};
  await ownerCall('save_charge',edited);
  data=await snapshot(first.session);record=data.charges.find(item=>item.id===saved.id);
  assert.equal(record.amountPaid,334.25);assert.equal(record.contactUnit,contact+' Updated');
  await page.setViewportSize({width:1533,height:1000});await page.reload();
  await row.getByRole('cell',{name:contact+' Updated',exact:true}).waitFor();
  assert.equal((await row.locator('td').allTextContents())[3],'900.5');
  const cleared={...edited,occurrence_on:null,category:' ',contact_unit:null,contact_extension:'',payment_unit:null};
  await ownerCall('save_charge',cleared);
  record=(await snapshot(first.session)).charges.find(item=>item.id===saved.id);
  for(const key of ['occurrenceOn','category','contactUnit','contactExtension','paymentUnit'])assert.equal(record[key],null);
  assert.equal(record.dueOn,'2026-12-31');
  await page.reload();await row.waitFor();
  assert.deepEqual(normalized(await row.locator('td').allTextContents()),['—',label,'—','900.5','—','—','—','未繳Pending Payment']);
  await capture(page,'cleared-metadata');
  const clearedAnswer=await answer(first.session,question);assert.ok(!clearedAnswer.answer.includes(contact));assert.ok(clearedAnswer.answer.includes('not recorded'));
  checks.push('admin update/clear survive API and browser reload; unknown metadata stays empty and due date remains separate');

  phase='settled sample visibility and audited deletion';
  await ownerCall('save_charge',{...cleared,amount_paid:payload.amount_due});
  record=(await snapshot(first.session)).charges.find(item=>item.id===saved.id);assert.equal(record.amountDue,record.amountPaid);
  await page.reload();await page.locator('.pending-fees-datetime').filter({hasNotText:'—'}).waitFor();
  assert.equal(await row.count(),0,'Zero outstanding balance must be absent from the pending list.');
  assert.ok(!(await answer(first.session,'What are my pending fees?')).answer.includes(label));
  await ownerCall('delete_charge',{id:saved.id});
  assert.equal((await snapshot(first.session)).charges.some(item=>item.id===saved.id),false);
  const audit=await sql`select action_kind from public.affairs_agent_audit where user_id=${ownerId} and target_id=${saved.id}`;
  assert.equal(audit.filter(item=>item.action_kind==='save_charge').length,4);assert.equal(audit.filter(item=>item.action_kind==='delete_charge').length,1);
  checks.push('settled sample is removed from pending UI/answer; deletion persists; four saves and one deletion audited');

  phase='credit-load history persistence and private assistant';
  const processText='QA local review '+runId.slice(0,8);
  const historyPayload={id:historyId,user_id:first.session.user.id,request_id:randomUUID(),expected_version:'0',academic_year:'115',semester:'1',category:'over',requested_credits:'3',process_text:processText,result_text:''};
  await request('/api/affairs-manage',{method:'POST',token:first.session.access_token,body:{kind:'save_credit_load_history',payload:historyPayload},status:403});
  const initialHistory=await ownerHistoryCall(historyPayload);assert.equal(initialHistory.version,1);
  assert.deepEqual(await ownerHistoryCall(historyPayload),initialHistory,'An identical request is idempotent.');
  let historyRecord=(await snapshot(first.session)).creditLoadHistory.records.find(item=>item.id===historyId);
  assert.equal(historyRecord.userId,first.session.user.id);assert.equal(historyRecord.requestedCredits,3);assert.equal(historyRecord.processText,processText);assert.equal(historyRecord.resultText,null);
  assert.equal((await snapshot(second.session)).creditLoadHistory.records.some(item=>item.id===historyId),false);
  const historyQuestion='What is my credit-load application history?';
  const historyAnswer=await answer(first.session,historyQuestion,historyPath);
  assert.ok(historyAnswer.answer.includes(processText));assert.match(historyAnswer.answer,/3 credits/);
  assert.equal(historyAnswer.grounding.source,'account');assert.equal(historyAnswer.grounding.webSearched,false);
  assert.ok(historyAnswer.citations.some(item=>item.url===historyPath));assert.equal(historyAnswer.proposedAction,undefined);
  assert.ok(!(await answer(second.session,historyQuestion,historyPath)).answer.includes(processText));
  await page.goto(origin+historyPath);
  const historyRow=page.locator('.credit-load-history tbody tr');await historyRow.waitFor();
  assert.equal(await page.locator('.credit-load-history thead th').count(),6);
  assert.deepEqual(normalized(await historyRow.locator('td').allTextContents()),['115','1','超修','3',processText,'—']);
  assert.equal(await page.locator('.credit-load-history input,.credit-load-history form').count(),0,'History must not invent an application form.');
  await capture(page,'credit-load-desktop','.credit-load-history');
  await page.reload();await historyRow.getByRole('cell',{name:processText,exact:true}).waitFor();
  phase='credit-load source menu and assistant launcher';
  await page.locator('.credit-load-nav').getByRole('button',{name:'Index',exact:true}).click();
  assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['Index','Logout']);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'開啟 AI 校園助理',exact:true}).click();
  await chat.getByRole('textbox',{name:'Your question'}).fill(historyQuestion);
  phase='credit-load browser assistant citation';
  await chat.getByRole('button',{name:'Send',exact:true}).click();
  await chat.getByRole('link',{name:'My credit-load history',exact:true}).waitFor();
  assert.equal(await chat.getByRole('link',{name:'My credit-load history',exact:true}).getAttribute('href'),historyPath);
  assert.ok((await chat.getByRole('log',{name:'Assistant conversation'}).innerText()).includes(processText));
  await page.keyboard.press('Escape');await chat.waitFor({state:'hidden'});
  phase='credit-load mobile and second-account isolation';
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:900});await historyRow.waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Credit-load history body must be contained at '+width);
    await capture(page,'credit-load-mobile-'+width,'.credit-load-history');
  }
  const otherHistory=await pageFor(second.session);await otherHistory.page.goto(origin+historyPath);
  await otherHistory.page.locator('.credit-load-datetime').filter({hasNotText:'—'}).waitFor();
  assert.equal(await otherHistory.page.locator('.credit-load-history tbody tr').count(),0);
  assert.deepEqual(otherHistory.errors,[]);await otherHistory.context.close();
  checks.push('credit-load history: persisted six fields, own six-column native UI/reload/mobile, browser/API private answer with 11-3 citation, second-account exclusion and student-write 403');

  phase='credit-load history revision, clearing and retry receipts';
  const historyEdit={...historyPayload,request_id:randomUUID(),expected_version:'1',requested_credits:'4.5',process_text:'',result_text:''};
  assert.equal((await ownerHistoryCall(historyEdit)).version,2);
  await assert.rejects(ownerHistoryCall({...historyEdit,request_id:randomUUID(),process_text:'Stale attempt'}),{code:'PT409'});
  await assert.rejects(ownerHistoryCall({...historyEdit,process_text:'Changed receipt payload'}),{code:'PT409'});
  assert.deepEqual(await ownerHistoryCall(historyPayload),initialHistory,'Late retry preserves its original receipt.');
  historyRecord=(await snapshot(first.session)).creditLoadHistory.records.find(item=>item.id===historyId);
  assert.equal(historyRecord.version,2);assert.equal(historyRecord.requestedCredits,4.5);assert.equal(historyRecord.processText,null);assert.equal(historyRecord.resultText,null);
  await page.setViewportSize({width:1533,height:1000});await page.reload();await historyRow.getByRole('cell',{name:'4.5',exact:true}).waitFor();
  assert.deepEqual(normalized(await historyRow.locator('td').allTextContents()),['115','1','超修','4.5','—','—']);
  await capture(page,'credit-load-cleared','.credit-load-history');
  const revisedAnswer=await answer(first.session,historyQuestion,historyPath);assert.match(revisedAnswer.answer,/4\.5 credits/);assert.ok(!revisedAnswer.answer.includes(processText));
  assert.equal((await sql`select id from public.affairs_agent_audit where user_id=${ownerId} and target_id=${historyId} and action_kind='save_credit_load_history'`).length,2);
  assert.equal((await sql`select request_id from private.affairs_credit_load_history_operations where user_id=${ownerId} and request_id in ${sql([...historyRequests])}`).length,2);
  assert.deepEqual(errors,[]);await context.close();
  checks.push('credit-load history: revision/clearing persists, stale or changed retries conflict, late retry stays stable, exactly two successful edit audits/receipts');
} catch(error) {
  process.exitCode=1;
  // No database payloads, session tokens, credentials, or user response bodies are logged.
  console.error(`${phase}: ${error instanceof assert.AssertionError?error.message:error.name||'Error'}`);
} finally {
  const failures=[];
  const clean=async(label,operation)=>{try{await operation();}catch{failures.push(label);}};
  await clean('Browser cleanup failed',()=>browser?.close());
  // Include all charges owned by exact generated IDs, even if a commit succeeded before its response was lost.
  if(users.length)await clean('Fixture charge discovery failed',async()=>{
    const rows=await sql`select c.id from public.affairs_charges c join public.affairs_students s on s.id=c.student_id where s.user_id in ${sql(users)}`;
    for(const row of rows)charges.add(row.id);
  });
  const chargeIds=[...charges];
  if(chargeIds.length&&ownerId)await clean('Exact fixture audit cleanup failed',()=>sql`delete from public.affairs_agent_audit
    where user_id=${ownerId} and target_id in ${sql(chargeIds)} and action_kind in ('save_charge','delete_charge')`);
  if(historyRequests.size&&ownerId) {
    await clean('Exact history receipt cleanup failed',()=>sql`delete from private.affairs_credit_load_history_operations
      where user_id=${ownerId} and request_id in ${sql([...historyRequests])} and payload->>'id'=${historyId}`);
    await clean('Exact history audit cleanup failed',()=>sql`delete from public.affairs_agent_audit
      where user_id=${ownerId} and target_id=${historyId} and action_kind='save_credit_load_history'`);
  }
  for(const id of users)await clean('Synthetic user cleanup failed',async()=>{
    const deleted=await admin.auth.admin.deleteUser(id);if(deleted.error)throw new Error('Synthetic deletion failed');
  });
  await clean('Exact fixture cleanup verification failed',async()=>{
    if(users.length) {
      assert.equal((await sql`select id from auth.users where id in ${sql(users)}`).length,0);
      assert.equal((await sql`select user_id from auth.identities where user_id in ${sql(users)}`).length,0);
      assert.equal((await sql`select user_id from public.affairs_profiles where user_id in ${sql(users)}`).length,0);
      assert.equal((await sql`select id from public.affairs_students where user_id in ${sql(users)}`).length,0);
    }
    if(chargeIds.length) {
      assert.equal((await sql`select id from public.affairs_charges where id in ${sql(chargeIds)}`).length,0);
      assert.equal((await sql`select id from public.affairs_agent_audit where target_id in ${sql(chargeIds)}`).length,0);
    }
    if(historyRequests.size) {
      assert.equal((await sql`select id from public.affairs_credit_load_history where id=${historyId}`).length,0);
      assert.equal((await sql`select id from public.affairs_agent_audit where target_id=${historyId}`).length,0);
      assert.equal((await sql`select request_id from private.affairs_credit_load_history_operations where user_id=${ownerId} and request_id in ${sql([...historyRequests])}`).length,0);
    }
  });
  await clean('Database connection cleanup failed',()=>sql.end());
  if(failures.length){console.error(failures.join('; '));process.exitCode=1;}
  const result={origin,checks,passed:!process.exitCode,cleanupFailures:failures,screenshots:output};
  await writeFile(output+'/result.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}
