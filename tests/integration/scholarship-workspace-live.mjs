import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {chmod,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import postgres from 'postgres';
import {deploymentEnvironment} from '../../scripts/deployment-env.mjs';

// Run only after the intended client release is Ready. Every mutable ID is generated here.
process.umask(0o077);
const {vercel,supabase}=JSON.parse(await readFile('deployment.json','utf8'));
const env=deploymentEnvironment();
const origin=vercel.productionUrl;
const url=env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
function configuredUrl(value,label) {
  try {return new URL(value);} catch {throw new Error(label+' is unavailable or invalid.');}
}
assert.equal(configuredUrl(url,'Client Supabase URL').hostname,supabase.projectRef+'.supabase.co');
const connection=env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
const target=configuredUrl(connection,'Client database connection');
assert.ok(target.hostname===`db.${supabase.projectRef}.supabase.co` ||
  target.hostname.endsWith('.pooler.supabase.com') && target.username.endsWith('.'+supabase.projectRef),
  'Only the exact client database may be used.');
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
const serviceKey=env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
assert.ok(key && serviceKey,'Configured client authentication is required.');
const auth={persistSession:false,autoRefreshToken:false};
const admin=createClient(url,serviceKey,{auth});
const sql=postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const route='/school-affairs/services/9-1';
const runId=randomUUID();
const periodId=randomUUID();
const term='Synthetic local scholarship QA '+runId.slice(0,8);
const output='artifacts/scholarship/live/'+runId;
const fixtureUsers=[];
const checks=[];
const sourceContrast=[];
let browser;
let periodCreated=false;
let phase='fixture setup';
let failure;

async function request(path,{token,method='GET',body,status=200}={}) {
  const response=await fetch(origin+path,{method,signal:AbortSignal.timeout(45000),
    headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
  });
  assert.equal(response.status,status,`${path} returned an unexpected status during ${phase}.`);
  return response.json();
}
const snapshot=session=>request('/api/affairs-data',{token:session.access_token});
const action=(session,kind,payload,status=200)=>request('/api/affairs-action',{
  method:'POST',token:session.access_token,body:{kind,payload:{request_id:randomUUID(),...payload}},status,
});
const answer=(session,question)=>request('/api/affairs-assistant',{
  method:'POST',token:session.access_token,body:{question,route},
});

async function createFixture(number) {
  const email='scholarship-live-qa-'+randomUUID()+'@example.invalid';
  const password=randomBytes(32).toString('base64url')+'Aa1!';
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Scholarship Live QA '+number}});
  if(created.error || !created.data.user)throw new Error('Synthetic account creation failed.');
  const id=created.data.user.id;
  fixtureUsers.push(id);
  await sql`insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
    values(${id},${id},${sql.json({sub:id,email,email_verified:true})},'google',now(),now(),now())`;
  const client=createClient(url,key,{auth});
  const signed=await client.auth.signInWithPassword({email,password});
  if(signed.error || !signed.data.session)throw new Error('Synthetic account sign-in failed.');
  assert.ok(signed.data.session.user.identities.some(identity=>identity.provider==='google'));
  return signed.data.session;
}

async function createPage(session,width=1440) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.addInitScript(({origin,session})=>{
    if(window.top!==window || location.origin!==origin || localStorage.getItem('scholarship-live-qa-seeded'))return;
    localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));
    localStorage.setItem('scholarship-live-qa-seeded','1');
  },{origin,session});
  const page=await context.newPage();
  page.setDefaultTimeout(30000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.name));
  await page.goto(origin+route);
  await page.getByRole('heading',{name:'境外學生獎助學金申請',exact:true}).waitFor();
  return {page,context,errors};
}

async function screenshot(locator,name) {
  const path=output+'/'+name+'.png';
  await locator.screenshot({path});
  await chmod(path,0o600);
}

async function checkAccessibility(page) {
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  const unexpected=[];
  for(const violation of result.violations.filter(item=>['serious','critical'].includes(item.impact))) {
    for(const node of violation.nodes) {
      const selector=node.target.every(item=>typeof item==='string')?node.target.join(' '):'';
      const inherited=violation.id==='color-contrast' && selector && await page.locator(selector).evaluate(element=>{
        const style=getComputedStyle(element);
        if(element.matches('.scholarship-navbar > a'))return style.color==='rgb(255, 255, 255)' &&
          getComputedStyle(element.parentElement).backgroundColor==='rgb(67, 142, 185)';
        return element.matches('.scholarship-notice summary') && style.color==='rgb(38, 121, 181)' &&
          style.backgroundColor==='rgb(247, 247, 247)';
      }).catch(()=>false);
      if(inherited)sourceContrast.push({id:violation.id,selector});
      else unexpected.push({id:violation.id,target:node.target});
    }
  }
  assert.deepEqual(unexpected,[],'Unexpected serious/critical accessibility findings.');
}

try {
  await mkdir(output,{recursive:true,mode:0o700});
  const first=await createFixture(1);
  const second=await createFixture(2);
  for(const session of [first,second]) {
    const data=await snapshot(session);
    assert.equal(data.profile.userId,session.user.id);
    assert.deepEqual(data.scholarship.applications,[]);
  }
  await sql`insert into public.affairs_scholarship_periods(id,term_label,opens_at,closes_at,published,instructions)
    values(${periodId},${term},now()-interval '1 hour',now()+interval '1 hour',true,
      'Temporary synthetic QA period. No university application or financial award is involved.')`;
  periodCreated=true;
  browser=await chromium.launch({headless:true,executablePath:env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const firstBrowser=await createPage(first);
  const {page}=firstBrowser;
  const section=page.locator('.scholarship-period').filter({has:page.getByRole('heading',{name:term+' 獎助學金申請',exact:true})});
  const history=page.getByRole('row').filter({has:page.getByRole('cell',{name:term,exact:true})});
  const confirm=async label=>{
    await section.getByRole('button',{name:label,exact:true}).click();
    const dialog=page.getByRole('dialog');
    await dialog.getByRole('button',{name:'確認',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
  };

  phase='student apply and persistence';
  await confirm('申請獎助學金');
  await history.getByRole('cell',{name:'待審核',exact:true}).waitFor();
  let data=await snapshot(first);
  const application=data.scholarship.applications.find(item=>item.periodId===periodId);
  assert.ok(application);assert.equal(application.userId,first.user.id);assert.equal(application.status,'pending');
  await page.reload();
  await history.getByRole('cell',{name:'待審核',exact:true}).waitFor();
  assert.equal((await sql`select id from public.affairs_scholarship_applications where user_id=${first.user.id} and period_id=${periodId}`).length,1);
  checks.push('browser apply persists after reload');

  phase='grounded assistant';
  const pending=await answer(first,'What is my scholarship application status?');
  assert.ok(pending.answer.includes(term));assert.match(pending.answer,/pending review/);
  assert.equal(pending.grounding.source,'account');assert.equal(pending.grounding.webSearched,false);
  assert.ok(pending.citations.some(citation=>citation.url===route));
  assert.equal(pending.proposedAction,undefined);
  await page.locator('.scholarship-navbar > button').click();
  await page.getByRole('menuitem',{name:'校園助理',exact:true}).click();
  const chat=page.getByRole('dialog',{name:/Assistant/});
  await chat.getByRole('textbox',{name:'Your question'}).fill('What is my scholarship application status?');
  await chat.getByRole('button',{name:'Send',exact:true}).click();
  await chat.getByRole('link',{name:'My scholarship applications',exact:true}).waitFor();
  assert.equal(await chat.getByRole('link',{name:'My scholarship applications',exact:true}).getAttribute('href'),route);
  assert.match(await chat.getByRole('log',{name:'Assistant conversation'}).innerText(),/pending review/);
  await page.keyboard.press('Escape');
  checks.push('API and browser assistant return the saved status and scholarship link');

  phase='cancellation and reapplication';
  await confirm('取消申請');
  await history.getByRole('cell',{name:'已取消申請',exact:true}).waitFor();
  await page.reload();
  await history.getByRole('cell',{name:'已取消申請',exact:true}).waitFor();
  await screenshot(page.locator('.scholarship-table-wrap'),'cancelled-history');
  await confirm('申請獎助學金');
  await history.getByRole('cell',{name:'待審核',exact:true}).waitFor();
  data=await snapshot(first);
  assert.equal(data.scholarship.applications.length,1);
  assert.equal(data.scholarship.applications[0].id,application.id);
  assert.equal(data.scholarship.applications[0].status,'pending');
  checks.push('cancel/reapply reuses one retained application and survives reload');

  phase='other account isolation';
  const secondBrowser=await createPage(second);
  await secondBrowser.page.getByRole('cell',{name:'尚無申請紀錄',exact:true}).waitFor();
  const ownSecond=await snapshot(second);
  assert.deepEqual(ownSecond.scholarship.applications,[]);
  const outside=await fetch(url+'/rest/v1/affairs_scholarship_applications?select=id&id=eq.'+application.id,{
    headers:{apikey:key,Authorization:'Bearer '+second.access_token},signal:AbortSignal.timeout(15000),
  });
  assert.equal(outside.status,200);assert.deepEqual(await outside.json(),[]);
  await action(second,'cancel_scholarship',{period_id:periodId,expected_version:'0'},403);
  assert.deepEqual(secondBrowser.errors,[]);
  await secondBrowser.context.close();
  checks.push('second account cannot read or cancel the first application');

  phase='closed period guard';
  await sql`update public.affairs_scholarship_periods set closes_at=now()-interval '1 second',version=version+1,updated_at=now() where id=${periodId}`;
  await page.reload();
  await section.getByText('本學期申請已截止。',{exact:true}).waitFor();
  assert.equal(await section.getByRole('button').count(),0);
  const pendingVersion=data.scholarship.applications[0].version;
  await action(first,'cancel_scholarship',{period_id:periodId,expected_version:String(pendingVersion)},409);
  assert.equal((await snapshot(first)).scholarship.applications[0].status,'pending');
  checks.push('closed window blocks UI and server cancellation');

  phase='reviewed record guard';
  await sql.begin(async tx=>{
    await tx`update public.affairs_scholarship_periods set closes_at=now()+interval '1 hour',version=version+1,updated_at=now() where id=${periodId}`;
    await tx`update public.affairs_scholarship_applications set status='approved',award_amount=12500,required_hours=20.5,
      actual_hours=5.25,review_note='Synthetic QA review',reviewed_at=now(),version=version+1,updated_at=now()
      where id=${application.id} and user_id=${first.user.id} and period_id=${periodId}`;
  });
  await page.reload();
  await history.getByRole('cell',{name:/審核通過/}).waitFor();
  await history.getByRole('cell',{name:'NT$12,500',exact:true}).waitFor();
  await history.getByRole('cell',{name:'20.5',exact:true}).waitFor();
  await history.getByRole('cell',{name:'5.25',exact:true}).waitFor();
  assert.equal(await section.getByRole('button').count(),0);
  const reviewed=(await snapshot(first)).scholarship.applications[0];
  assert.equal(reviewed.status,'approved');
  for(const kind of ['apply_scholarship','cancel_scholarship'])
    await action(first,kind,{period_id:periodId,expected_version:String(reviewed.version)},409);
  const reviewedAnswer=await answer(first,'What is my scholarship award amount and service hours?');
  assert.match(reviewedAnswer.answer,/approved.*12500.*20\.5.*5\.25/);
  assert.ok(reviewedAnswer.answer.includes(term));
  assert.ok(reviewedAnswer.citations.some(citation=>citation.url===route));
  await screenshot(page.locator('.scholarship-table-wrap'),'reviewed-history');
  checks.push('reviewed amounts/hours persist and student changes remain blocked in an open period');

  phase='responsive accessibility';
  await checkAccessibility(page);
  await page.setViewportSize({width:390,height:850});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await checkAccessibility(page);
  await screenshot(section,'mobile-synthetic-period');
  assert.deepEqual(firstBrowser.errors,[]);
  checks.push('desktop/phone geometry, no page errors, no newly introduced serious accessibility findings');
  phase='anonymous denial';
  await request('/api/affairs-data',{status:401});
  checks.push('anonymous account data denied');
} catch(error) {
  // SQL/provider errors can carry request details. Report the phase without dumping raw errors or credentials.
  failure={phase,name:error instanceof Error?error.name:'Error',
    message:error?.code==='ERR_ASSERTION'?String(error.message).slice(0,500):'The check could not complete. Inspect this phase using authorized local tooling.'};
} finally {
  phase='fixture cleanup';
  try {await browser?.close();} catch {failure??={phase,message:'Browser cleanup failed.'};}
  const cleanupErrors=[];
  try {
    if(fixtureUsers.length) {
      await sql.begin(async tx=>{
        await tx`delete from private.affairs_scholarship_operations where user_id in ${tx(fixtureUsers)}`;
        await tx`delete from public.affairs_agent_audit where user_id in ${tx(fixtureUsers)}`;
        await tx`delete from public.affairs_scholarship_applications where user_id in ${tx(fixtureUsers)} and period_id=${periodId}`;
      });
    }
    if(periodCreated) {
      await sql`delete from public.affairs_scholarship_periods where id=${periodId}
        and not exists(select 1 from public.affairs_scholarship_applications where period_id=${periodId})`;
      if((await sql`select id from public.affairs_scholarship_periods where id=${periodId}`).length)
        cleanupErrors.push('Synthetic period retained because an unexpected application references it.');
    }
  } catch {cleanupErrors.push('Synthetic scholarship row cleanup did not complete.');}
  for(const id of fixtureUsers) {
    try {
      await sql`delete from auth.identities where user_id=${id} and provider_id=${id} and provider='google'`;
      const deleted=await admin.auth.admin.deleteUser(id);
      if(deleted.error)cleanupErrors.push('Synthetic account deletion was rejected: '+id);
      const [remaining]=await sql`select exists(select 1 from auth.users where id=${id}) as present`;
      if(remaining.present)cleanupErrors.push('Synthetic account still exists: '+id);
    } catch {cleanupErrors.push('A synthetic account could not be removed: '+id);}
  }
  try {
    if(fixtureUsers.length) {
      const [remaining]=await sql`select
        (select count(*) from private.affairs_scholarship_operations where user_id in ${sql(fixtureUsers)})::int as receipts,
        (select count(*) from public.affairs_agent_audit where user_id in ${sql(fixtureUsers)})::int as audits,
        (select count(*) from public.affairs_scholarship_applications where user_id in ${sql(fixtureUsers)})::int as applications`;
      if(remaining.receipts || remaining.audits || remaining.applications)cleanupErrors.push('Synthetic scholarship records remain.');
    }
  } catch {cleanupErrors.push('Cleanup verification could not complete.');}
  await sql.end({timeout:5});
  const report={status:failure || cleanupErrors.length?'failed':'passed',checks,sourceInheritedContrast:sourceContrast,
    ...(failure?{failure}:{}),cleanup:{complete:cleanupErrors.length===0,errors:cleanupErrors},
    ...(cleanupErrors.length?{fixtureUserIds:fixtureUsers,fixturePeriodId:periodId}:{}),screenshots:output};
  await writeFile(output+'/result.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(report));
  if(failure || cleanupErrors.length)process.exitCode=1;
}
