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

// Applied-schema checks only. Every mutation is restricted to exact generated fixtures.
process.umask(0o077);
const deployment=JSON.parse(await readFile('deployment.json','utf8')),env=deploymentEnvironment();Object.assign(process.env,env);
const origin=process.env.NATIVE_ORIGIN||deployment.vercel.productionUrl,local=new URL(origin).hostname==='127.0.0.1';
assert.ok(local||origin===deployment.vercel.productionUrl,'Use the configured production origin or loopback.');
const url=env.VITE_SUPABASE_URL||env.NEXT_PUBLIC_SUPABASE_URL||env.SUPABASE_URL;
assert.equal(new URL(url).hostname,deployment.supabase.projectRef+'.supabase.co');
const connection=env.POSTGRES_URL_NON_POOLING||env.POSTGRES_URL||env.DATABASE_URL,target=new URL(connection);
assert.ok(target.hostname===`db.${deployment.supabase.projectRef}.supabase.co`||target.hostname.endsWith('.pooler.supabase.com')&&target.username.endsWith('.'+deployment.supabase.projectRef));
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY;
const auth={persistSession:false,autoRefreshToken:false},admin=createClient(url,env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY,{auth});
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const runId=randomUUID(),users=[],requests=new Set(),recordIds=Array.from({length:6},()=>randomUUID()),checks=[];
const historyPath='/school-affairs/services/11-1',timetablePath='/school-affairs/services/11-2';
const output=`artifacts/course-selection/${local?'local':'production'}-${runId}`;
const title='QA Selection '+runId.slice(0,8),room='QA Room '+runId.slice(0,8),otherTitle='Other private course '+runId.slice(0,8);
const handlers={'/api/affairs-data':dataHandler,'/api/affairs-manage':managerHandler,'/api/affairs-assistant':assistantHandler};
let browser,ownerId,phase='setup',schemaReady=false;
async function invoke(endpoint,{token,method='GET',body}={}) {
  if(!local){
    const response=await fetch(origin+endpoint,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});
    return {status:response.status,body:await response.json()};
  }
  const parsed=new URL(endpoint,origin),handler=handlers[parsed.pathname];assert.ok(handler);
  const result={status:200,body:undefined},response={status(code){result.status=code;return response;},json(body){result.body=body;},setHeader(){}};
  await handler({method,headers:token?{authorization:'Bearer '+token}:{},query:Object.fromEntries(parsed.searchParams),body},response);return result;
}
async function request(endpoint,options={}){const result=await invoke(endpoint,options);assert.equal(result.status,options.status??200,`${phase}: ${endpoint} status ${result.status}`);return result.body;}
const snapshot=session=>request('/api/affairs-data',{token:session.access_token});
const answer=(session,question,route)=>request('/api/affairs-assistant',{method:'POST',token:session.access_token,body:{question,route}});
async function fixture(number){
  const email=`course-selection-qa-${randomUUID()}@example.invalid`,password=randomBytes(32).toString('base64url')+'Aa1!';
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:`Course Selection QA ${number}`}});
  if(created.error||!created.data.user)throw new Error('Synthetic account creation failed.');
  const id=created.data.user.id;users.push(id);
  await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
    values(${id},${id},${sql.json({sub:id,email,email_verified:true})},'google',now(),now(),now())`;
  const signed=await createClient(url,key,{auth}).auth.signInWithPassword({email,password});
  if(signed.error||!signed.data.session)throw new Error('Synthetic account sign-in failed.');
  await snapshot(signed.data.session);return signed.data.session;
}
async function save(payload){
  assert.ok(recordIds.includes(payload.id)&&users.includes(payload.user_id),'Only exact fixture records/accounts may be changed.');requests.add(payload.request_id);
  return sql.begin(async tx=>{
    const [existing]=await tx`select user_id from public.affairs_course_selection_records where id=${payload.id}`;
    if(existing)assert.ok(users.includes(existing.user_id),'Existing records must belong to generated accounts.');
    await tx.unsafe('set local role authenticated');await tx`select set_config('request.jwt.claim.sub',${ownerId},true)`;
    return (await tx`select public.affairs_manage_course_selection('save_course_selection',${tx.json(payload)}) as result`)[0].result;
  });
}
async function pageFor(session){
  const context=await browser.newContext({viewport:{width:1533,height:1000},locale:'zh-TW',reducedMotion:'reduce'});
  await context.addInitScript(({origin,session})=>{
    if(window.top!==window||location.origin!==origin||sessionStorage.getItem('selection-qa'))return;
    localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));sessionStorage.setItem('selection-qa','1');
  },{origin,session});
  if(local)await context.route('**/api/**',async route=>{
    const req=route.request(),endpoint=new URL(req.url());if(!handlers[endpoint.pathname])return route.continue();
    const result=await invoke(endpoint.pathname+endpoint.search,{method:req.method(),token:req.headers().authorization?.slice(7),body:req.postData()?JSON.parse(req.postData()):undefined});
    await route.fulfill({status:result.status,json:result.body});
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',error=>errors.push(error.message));return {page,context,errors};
}
async function capture(page,name){await page.evaluate(()=>document.fonts.ready);await page.locator('.course-selection').screenshot({path:`${output}/${name}.png`});}
async function selectPhase(page,selectionPhase){
  await page.getByRole('button',{name:'查詢條件輸入',exact:true}).click();
  await page.getByLabel('學年',{exact:true}).selectOption('115');await page.getByLabel('學期',{exact:true}).selectOption('1');await page.getByLabel('選課階段',{exact:true}).selectOption(selectionPhase);
  await page.getByRole('button',{name:'查詢',exact:true}).click();
}
try{
  await mkdir(output,{recursive:true,mode:0o700});
  const [owner]=await sql`select u.id from auth.users u join public.affairs_profiles p on p.user_id=u.id
    where lower(u.email)=lower(${deployment.supabase.ownerEmail}) and u.email_confirmed_at is not null and p.role='admin'
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')`;
  assert.ok(owner,'The configured verified Google/admin identity must already exist; the test never creates or changes it.');ownerId=owner.id;
  assert.ok((await sql`select to_regclass('public.affairs_course_selection_records') as name`)[0].name,'Apply migration1000 before running.');schemaReady=true;
  const first=await fixture(1),second=await fixture(2);
  const payload={id:recordIds[0],user_id:first.user.id,request_id:randomUUID(),expected_version:'0',academic_year:115,semester:1,selection_phase:'add_drop',
    term_course_code:'QA-'+runId.slice(0,8),course_title:title,required_elective_text:'必修',credits:3.5,instructor_one:'Synthetic instructor',remark_text:'Y(W)',row_order:0,
    timetable_included:true,meetings:[{weekday:1,period:'午',room},{weekday:7,period:'D',room:'QA Evening Room'}]};
  phase='authorization, persistence and isolation';
  await request('/api/affairs-data',{status:401});await request('/api/affairs-data?scope=admin',{token:first.access_token,status:403});
  await request('/api/affairs-manage',{method:'POST',token:first.access_token,body:{kind:'save_course_selection',payload},status:403});
  await request('/api/affairs-manage',{method:'POST',token:first.access_token,body:{kind:'save_course_selection',payload:[]},status:400});
  const initial=await save(payload);assert.equal(initial.version,1);assert.deepEqual(await save(payload),initial);
  const variations=[
    {id:recordIds[1],course_title:'QA Overlap',term_course_code:'QA-OVERLAP',row_order:1,meetings:[{weekday:1,period:'午',room:'QA Shared Room'}]},
    {id:recordIds[2],course_title:'QA Excluded',term_course_code:'QA-EXCLUDED',row_order:2,timetable_included:false},
    {id:recordIds[3],course_title:'QA Unscheduled',term_course_code:'QA-UNSCHEDULED',row_order:3,meetings:[]},
    {id:recordIds[4],course_title:'QA Initial Phase',selection_phase:'initial',row_order:0},
    {id:recordIds[5],user_id:second.user.id,course_title:otherTitle,term_course_code:'QA-OTHER'},
  ];
  for(const patch of variations)assert.equal((await save({...payload,...patch,request_id:randomUUID()})).version,1);
  let data=await snapshot(first),record=data.courseSelection.records.find(item=>item.id===recordIds[0]);
  assert.equal(data.courseSelection.records.length,5);assert.equal(record.userId,first.user.id);assert.equal(record.sourceMode,'local_demo');assert.deepEqual(record.meetings,payload.meetings);assert.equal(record.timetableIncluded,true);assert.equal(record.remarkText,'Y(W)');
  const other=await snapshot(second);assert.equal(other.courseSelection.records.length,1);assert.equal(other.courseSelection.records[0].id,recordIds[5]);
  await assert.rejects(save({...payload,request_id:randomUUID(),expected_version:'1',meetings:[payload.meetings[0],payload.meetings[0]]}),{code:'22023'});
  await assert.rejects(save({...payload,request_id:randomUUID(),expected_version:'1',unexpected_private_field:'rejected'}),{code:'22023'});
  checks.push('401/403/400 guards, six owner-authored fixture records, exact own/other snapshots, validated slots/unknown keys, stable create receipt');

  phase='private assistant history and timetable';
  const historyQuestion='Show my course-selection history for academic year 115 semester 1 add/drop';
  const timetableQuestion='Show my weekly timetable for academic year 115 semester 1 add/drop';
  const historyAnswer=await answer(first,historyQuestion,historyPath);
  for(const text of [title,'QA Excluded','QA Unscheduled','Y(W)','3.5 credits'])assert.ok(historyAnswer.answer.includes(text));
  assert.ok(!historyAnswer.answer.includes('QA Initial Phase')&&!historyAnswer.answer.includes(otherTitle));assert.equal(historyAnswer.grounding.source,'account');assert.equal(historyAnswer.grounding.webSearched,false);assert.ok(historyAnswer.citations.some(item=>item.url===historyPath));
  const timetableAnswer=await answer(first,timetableQuestion,timetablePath);
  for(const text of [title,room,'12:10~13:00','21:05~21:55','QA Overlap','QA Unscheduled'])assert.ok(timetableAnswer.answer.includes(text));
  assert.ok(!timetableAnswer.answer.includes('QA Excluded')&&!timetableAnswer.answer.includes('QA Initial Phase')&&!timetableAnswer.answer.includes(otherTitle));assert.equal(timetableAnswer.grounding.source,'account');assert.equal(timetableAnswer.proposedAction,undefined);assert.ok(timetableAnswer.citations.some(item=>item.url===timetablePath));
  assert.match((await answer(first,'Show my weekly timetable',timetablePath)).answer,/Please specify/);
  assert.ok(!(await answer(second,historyQuestion,historyPath)).answer.includes(title));
  checks.push('private assistant phase filters, explicit timetable inclusion, rooms/times/unscheduled results, local citations, ambiguity clarification and no cross-account leakage');

  browser=await chromium.launch({headless:true,executablePath:env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const {page,context,errors}=await pageFor(first);
  phase='selection-history browser';await page.goto(origin+historyPath);
  const historyRow=page.locator('.course-selection-history-table tbody tr').filter({has:page.getByRole('cell',{name:title,exact:true})});await historyRow.waitFor();
  assert.equal(await page.locator('.course-selection-history-table thead th').count(),7);assert.equal(await page.locator('.course-selection-history-table tbody tr').count(),4);
  assert.deepEqual(await historyRow.locator('td').allTextContents(),['1',payload.term_course_code,title,'必修','3.5','Synthetic instructor','Y(W)']);
  await capture(page,'history-desktop');await page.reload();await historyRow.waitFor();
  await selectPhase(page,'initial');await page.getByRole('cell',{name:'QA Initial Phase',exact:true}).waitFor();assert.equal(await page.locator('.course-selection-history-table tbody tr').count(),1);
  await selectPhase(page,'add_drop');await historyRow.waitFor();
  await page.getByRole('button',{name:'開啟 AI 校園助理',exact:true}).click();const chat=page.getByRole('dialog',{name:/Assistant/});
  await chat.getByRole('textbox',{name:'Your question'}).fill(historyQuestion);await chat.getByRole('button',{name:'Send',exact:true}).click();await chat.getByRole('link',{name:'Course-selection history',exact:true}).waitFor();
  assert.ok((await chat.getByRole('log',{name:'Assistant conversation'}).innerText()).includes(title));await page.keyboard.press('Escape');await chat.waitFor({state:'hidden'});

  phase='weekly timetable browser';await page.goto(origin+timetablePath);await page.locator('.course-selection-timetable tbody tr[data-period="午"] td[data-weekday="1"]').getByText(title,{exact:false}).waitFor();
  const monday=page.locator('.course-selection-timetable tr[data-period="午"] td[data-weekday="1"]');
  assert.equal(await page.locator('.course-selection-timetable tbody tr').count(),14);assert.equal(await page.locator('.course-selection-timetable thead th').count(),9);assert.equal(await monday.locator('.course-selection-meeting').count(),2);
  assert.ok((await monday.innerText()).includes(room));assert.ok((await page.locator('.course-selection-timetable tr[data-period="D"] td[data-weekday="7"]').innerText()).includes(title));
  assert.ok((await page.locator('.course-selection-unscheduled').innerText()).includes('QA Unscheduled'));assert.ok(!(await page.locator('.course-selection-results').innerText()).includes('QA Excluded'));
  await capture(page,'timetable-desktop');await page.reload();await monday.locator('.course-selection-meeting').first().waitFor();
  await page.getByRole('button',{name:'開啟 AI 校園助理',exact:true}).click();await chat.getByRole('textbox',{name:'Your question'}).fill(timetableQuestion);await chat.getByRole('button',{name:'Send',exact:true}).click();
  await chat.getByRole('link',{name:'My weekly timetable',exact:true}).waitFor();assert.equal(await chat.getByRole('link',{name:'My weekly timetable',exact:true}).getAttribute('href'),timetablePath);
  assert.ok((await chat.getByRole('log',{name:'Assistant conversation'}).innerText()).includes(room));await page.keyboard.press('Escape');await chat.waitFor({state:'hidden'});
  for(const width of [390,320])for(const [route,name]of [[historyPath,'history'],[timetablePath,'timetable']]){
    await page.setViewportSize({width,height:900});await page.goto(origin+route);await page.locator('.course-selection-summary').waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' body must be contained at '+width);await capture(page,name+'-'+width);
  }
  const secondBrowser=await pageFor(second);await secondBrowser.page.goto(origin+historyPath);await secondBrowser.page.getByRole('cell',{name:otherTitle,exact:true}).waitFor();assert.equal(await secondBrowser.page.getByRole('cell',{name:title,exact:true}).count(),0);
  assert.deepEqual(secondBrowser.errors,[]);await secondBrowser.context.close();checks.push('seven-column history, phase queries, fourteen-period timetable, overlapping/unscheduled slots, reload, browser assistant, 390/320px and second-account UI');

  phase='revision, clearing, explicit inclusion and immutable ownership';
  const edited={...payload,request_id:randomUUID(),expected_version:'1',required_elective_text:'',instructor_one:'',remark_text:'',credits:0,meetings:[]};
  assert.equal((await save(edited)).version,2);await assert.rejects(save({...edited,request_id:randomUUID()}),{code:'PT409'});
  await assert.rejects(save({...edited,course_title:'Changed reused request'}),{code:'PT409'});assert.deepEqual(await save(payload),initial);
  record=(await snapshot(first)).courseSelection.records.find(item=>item.id===recordIds[0]);assert.equal(record.version,2);assert.equal(record.credits,0);assert.deepEqual(record.meetings,[]);
  for(const key of ['requiredElectiveText','instructorOne','remarkText'])assert.equal(record[key],null);
  await page.setViewportSize({width:1533,height:1000});await page.goto(origin+historyPath);await historyRow.waitFor();assert.deepEqual(await historyRow.locator('td').allTextContents(),['1',payload.term_course_code,title,'—','0','—','—']);await capture(page,'history-cleared');
  await page.goto(origin+timetablePath);await page.locator('.course-selection-unscheduled').getByText(title,{exact:false}).waitFor();assert.equal(await page.locator('.course-selection-meeting').filter({hasText:title}).count(),0);await capture(page,'timetable-unscheduled');
  assert.equal((await save({...edited,request_id:randomUUID(),expected_version:'2',timetable_included:false})).version,3);
  await assert.rejects(save({...edited,request_id:randomUUID(),expected_version:'3',user_id:second.user.id}),{code:'42501'});
  await page.reload();await page.locator('.course-selection-summary').waitFor();assert.ok(!(await page.locator('.course-selection-results').innerText()).includes(title));
  assert.ok(!(await answer(first,timetableQuestion,timetablePath)).answer.includes(title));assert.ok((await answer(first,historyQuestion,historyPath)).answer.includes(title));
  assert.equal((await sql`select id from public.affairs_agent_audit where user_id=${ownerId} and target_id in ${sql(recordIds)} and action_kind='save_course_selection'`).length,8);
  assert.equal((await sql`select request_id from private.affairs_course_selection_operations where user_id=${ownerId} and request_id in ${sql([...requests])}`).length,8);
  assert.deepEqual(errors,[]);await context.close();checks.push('null clearing/zero credits, included unscheduled then explicit exclusion, immutable owner, stale/reused conflicts, stable late receipt, eight successful audits/receipts');
}catch(error){process.exitCode=1;console.error(`${phase}: ${error instanceof assert.AssertionError?error.message:error.name||'Error'}`);}
finally{
  const failures=[],clean=async(label,operation)=>{try{await operation();}catch{failures.push(label);}};
  await clean('Browser cleanup failed',()=>browser?.close());
  if(schemaReady&&ownerId){
    if(requests.size)await clean('Exact operation cleanup failed',()=>sql`delete from private.affairs_course_selection_operations where user_id=${ownerId} and request_id in ${sql([...requests])} and payload->>'id' in ${sql(recordIds)}`);
    await clean('Exact audit cleanup failed',()=>sql`delete from public.affairs_agent_audit where user_id=${ownerId} and target_id in ${sql(recordIds)} and action_kind='save_course_selection'`);
  }
  for(const id of users)await clean('Synthetic user cleanup failed',async()=>{const result=await admin.auth.admin.deleteUser(id);if(result.error)throw new Error('Synthetic deletion failed');});
  await clean('Exact fixture cleanup verification failed',async()=>{
    if(users.length){
      assert.equal((await sql`select id from auth.users where id in ${sql(users)}`).length,0);assert.equal((await sql`select user_id from auth.identities where user_id in ${sql(users)}`).length,0);
      assert.equal((await sql`select user_id from public.affairs_profiles where user_id in ${sql(users)}`).length,0);assert.equal((await sql`select id from public.affairs_students where user_id in ${sql(users)}`).length,0);
    }
    if(schemaReady){assert.equal((await sql`select id from public.affairs_course_selection_records where id in ${sql(recordIds)}`).length,0);assert.equal((await sql`select id from public.affairs_agent_audit where target_id in ${sql(recordIds)}`).length,0);
      if(requests.size)assert.equal((await sql`select request_id from private.affairs_course_selection_operations where user_id=${ownerId} and request_id in ${sql([...requests])}`).length,0);}
  });
  await clean('Database connection cleanup failed',()=>sql.end());if(failures.length){process.exitCode=1;console.error(failures.join('; '));}
  const result={origin,passed:!process.exitCode,checks,cleanupFailures:failures,screenshots:output};await writeFile(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
