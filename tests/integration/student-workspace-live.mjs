import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import postgres from 'postgres';
import { deploymentEnvironment } from '../../scripts/deployment-env.mjs';

const {vercel,supabase} = JSON.parse(await readFile('deployment.json','utf8'));
const env = deploymentEnvironment();
const origin = vercel.productionUrl;
const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
assert.equal(new URL(url).hostname,supabase.projectRef+'.supabase.co');
const connection = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.DATABASE_URL;
const target = new URL(connection);
assert.ok(target.hostname===`db.${supabase.projectRef}.supabase.co` ||
  target.hostname.endsWith('.pooler.supabase.com') && target.username.endsWith('.'+supabase.projectRef));
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
const auth = {persistSession:false,autoRefreshToken:false};
const admin = createClient(url,serviceKey,{auth});
const student = createClient(url,key,{auth});
const sql = postgres(connection,{max:1,ssl:{rejectUnauthorized:true,ca:await readFile('supabase/certs/prod-ca-2021.crt','utf8')}});
const fixtures = [];
let browser;

async function answer(endpoint, question, token, route='/dtm') {
  const result = await fetch(origin+endpoint,{
    method:'POST',signal:AbortSignal.timeout(30000),
    headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
    body:JSON.stringify({question,route}),
  });
  assert.equal(result.status,200,endpoint+' returned '+result.status);
  return result.json();
}

try {
  const email = 'stu-workspace-qa-'+randomUUID()+'@example.invalid';
  const password = randomBytes(32).toString('base64url')+'Aa1!';
  const created = await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Student Workspace QA'}});
  assert.equal(created.error,null);
  const id = created.data.user.id;
  fixtures.push(id);
  // Synthetic linked provider identity for exercising real RLS and API paths.
  // No real Google account or university record is used by this suite.
  await sql`insert into auth.identities (provider_id,user_id,identity_data,provider)
    values (${id},${id},${sql.json({sub:id,email,email_verified:true})},'google')`;
  const signed = await student.auth.signInWithPassword({email,password});
  assert.equal(signed.error,null);
  const session = signed.data.session;
  assert.ok(session.user.identities.some(identity=>identity.provider==='google'));

  browser = await chromium.launch({
    headless:true,executablePath:env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const context = await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await context.addInitScript(({origin,session})=>{
    if (window.top!==window || location.origin!==origin || localStorage.getItem('stu-workspace-qa-seeded')) return;
    localStorage.setItem('stu-school-affairs-auth',JSON.stringify(session));
    localStorage.setItem('stu-workspace-qa-seeded','1');
  },{origin,session});
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const pageErrors = [];
  page.on('pageerror',error=>pageErrors.push(error.name));
  const button = name=>page.getByRole('button',{name,exact:true});
  const save = ()=>button('Save record').click();
  await page.goto(origin+'/dtm/dashboard');
  await page.getByRole('combobox',{name:'Language / 語言'}).selectOption('en');
  await button('Add course').click();
  await page.getByLabel('Course code',{exact:true}).fill('QA115');
  await page.getByLabel('Course name',{exact:true}).fill('QA Systems Design');
  await page.getByLabel('Academic year and semester',{exact:true}).fill('115學年度第1學期');
  await save();
  await page.waitForURL('**/dtm/course/*');
  const coursePath = new URL(page.url()).pathname;
  await page.getByRole('heading',{name:'QA Systems Design',exact:true}).waitFor();
  const courseTab = name=>page.getByRole('navigation',{name:'Course views'}).getByRole('link',{name,exact:true});
  await courseTab('Class meetings').click();
  await button('Add class meeting').click();
  await page.getByLabel('Meeting topic',{exact:true}).fill('Database indexes');
  await page.getByLabel('Meeting date',{exact:true}).fill('2026-10-29');
  await page.getByLabel('Start time (Taipei)',{exact:true}).fill('09:00');
  await page.getByLabel('Attendance',{exact:true}).selectOption('absent');
  await save();
  await page.getByText('Database indexes',{exact:true}).waitFor();

  await courseTab('Assignments').click();
  await button('Add assignment').click();
  await page.getByLabel('Assignment name',{exact:true}).fill('Index design worksheet');
  await page.getByLabel('Meeting where assigned',{exact:true}).selectOption({label:'2026-10-29 · Database indexes'});
  await save();
  await page.getByText('Index design worksheet',{exact:true}).waitFor();
  await page.reload();
  await page.getByText('Index design worksheet',{exact:true}).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  const missed = await answer('/api/affairs-assistant','I missed the last class in QA115. What assignments were given?',session.access_token,coursePath);
  assert.match(missed.answer,/Database indexes.*absent/);
  const assignmentLink = /\]\((\/dtm\/course\/[^)]+#assignment-[^)]+)\)/.exec(missed.answer)?.[1];
  assert.ok(assignmentLink?.startsWith(coursePath+'/assignments#assignment-'));
  assert.equal(missed.grounding.source,'account');
  assert.equal(missed.grounding.webSearched,false);
  await page.goto(origin+assignmentLink);
  await page.locator(':target').getByText('Index design worksheet',{exact:true}).waitFor();
  const pending = await answer('/api/affairs-assistant','What assignments are not yet finished?',session.access_token);
  assert.match(pending.answer,/Unfinished assignments \(1\)/);
  assert.doesNotMatch(pending.answer,/Practice reflection/);

  await courseTab('Grades').click();
  await button('Add grade').click();
  await page.getByLabel('Grade item',{exact:true}).fill('Practice exam');
  await page.getByLabel('Score',{exact:true}).fill('32');
  await page.getByLabel('Maximum points',{exact:true}).fill('40');
  await save();
  await page.getByRole('cell',{name:'80.0%',exact:true}).waitFor();
  const grades = await answer('/api/affairs-assistant','Show my Moodle grades',session.access_token);
  assert.match(grades.answer,/Practice exam.*80\.0%/);

  await page.goto(origin+'/school-affairs/services/leave');
  await button('新增假單 · New leave record').click();
  await page.getByLabel(/Leave title/).fill('Class absence QA');
  await page.getByLabel(/Start date/).fill('2026-10-29');
  await page.getByLabel(/End date/).fill('2026-10-29');
  await page.getByLabel(/Class periods/).fill('2–3');
  await page.getByLabel(/Reason/).fill('Private QA note');
  await button('儲存紀錄 · Save record').click();
  await page.getByRole('rowheader',{name:/Class absence QA/}).waitFor();
  await button('送站內審核 · Request site review').click();
  await page.getByRole('dialog').getByRole('button',{name:'送出 · Send request',exact:true}).click();
  await page.getByText('站內待審 · Awaiting site review',{exact:true}).waitFor();
  await page.goto(origin+'/school-affairs/services/leave/history');
  await page.getByText('站內待審 · Awaiting site review',{exact:true}).waitFor();
  const leave = await answer('/api/affairs-assistant','What is my leave status?',session.access_token,'/school-affairs');
  assert.match(leave.answer,/Class absence QA.*awaiting stu.best review/);
  assert.doesNotMatch(leave.answer,/Private QA note/);
  assert.equal(await page.getByRole('link',{name:/Official service/}).getAttribute('href'),
    'https://infosys.stu.edu.tw/StuLeave/Login/AspLoginStu');
  await page.setViewportSize({width:390,height:850});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const axe = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  assert.deepEqual(axe.violations.filter(item=>['serious','critical'].includes(item.impact)).map(item=>item.id),[]);
  assert.deepEqual(pageErrors,[]);
  const anonymous = await answer('/api/research-assistant','Which assignments are not yet finished?');
  assert.equal(anonymous.status,'handoff');
  assert.doesNotMatch(anonymous.answer,/Index design worksheet/);
  console.log('Live student browser passed: shared account, persisted DTM and leave forms, missed-work links, grades, site review, privacy and mobile accessibility.');
} finally {
  await browser?.close();
  try {
    for (const id of fixtures) {
      const deleted = await admin.auth.admin.deleteUser(id);
      assert.equal(deleted.error,null,'Student workspace QA fixture cleanup failed.');
      const [check] = await sql`select exists(select 1 from auth.users where id=${id}) as present`;
      assert.equal(check.present,false,'Temporary user must be removed.');
    }
  } finally {
    await sql.end({timeout:5});
  }
}
