import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile } from 'node:fs/promises';
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

async function post(endpoint, body, token) {
  const result = await fetch(origin+endpoint,{
    method:'POST',signal:AbortSignal.timeout(30000),
    headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
    body:JSON.stringify(body),
  });
  assert.equal(result.status,200,endpoint+' returned '+result.status);
  return result.json();
}
const answer = (endpoint, question, token, route='/dtm') => post(endpoint,{question,route},token);

async function createFixture() {
  const email = 'stu-workspace-qa-'+randomUUID()+'@example.invalid';
  const password = randomBytes(32).toString('base64url')+'Aa1!';
  const created = await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Student Workspace QA'}});
  assert.equal(created.error,null);
  const id = created.data.user.id;
  fixtures.push(id);
  // Synthetic linked provider identity for exercising real RLS and API paths.
  // No real Google account or university record is used by this suite.
  await sql`insert into auth.identities (provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
    values (${id},${id},${sql.json({sub:id,email,email_verified:true})},'google',now(),now(),now())`;
  const signed = await student.auth.signInWithPassword({email,password});
  assert.equal(signed.error,null);
  const session = signed.data.session;
  assert.ok(session.user.identities.some(identity=>identity.provider==='google'));
  return session;
}

try {
  const session = await createFixture();
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
  const courseAction = async name=>{
    await button('Course menu').click();
    await page.getByRole('menuitem',{name,exact:true}).click();
  };
  await courseAction('Class meetings');
  await courseAction('Add class meeting');
  await page.getByLabel('Meeting topic',{exact:true}).fill('Database indexes');
  await page.getByLabel('Meeting date',{exact:true}).fill('2026-10-29');
  await page.getByLabel('Start time (Taipei)',{exact:true}).fill('09:00');
  await page.getByRole('combobox',{name:/^Attendance/}).selectOption('absent');
  await save();
  await page.getByText('Database indexes',{exact:true}).waitFor();

  await courseAction('Assignments');
  await courseAction('Add assignment');
  await page.getByLabel('Assignment name',{exact:true}).fill('Index design worksheet');
  await page.getByRole('combobox',{name:/^Meeting where assigned/}).selectOption({label:'2026-10-29 · Database indexes'});
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
  await page.locator('.dtm-user').click();
  await page.getByRole('menuitem',{name:'Campus assistant',exact:true}).click();
  const chat = page.getByRole('dialog',{name:/Assistant/});
  await chat.getByRole('textbox',{name:'Your question'}).fill('What assignments did I miss last class?');
  await chat.getByRole('button',{name:'Send',exact:true}).click();
  const chatLink = chat.getByRole('link',{name:'Index design worksheet',exact:true});
  assert.equal(await chatLink.getAttribute('href'),assignmentLink);
  await page.keyboard.press('Escape');
  const pending = await answer('/api/affairs-assistant','What assignments are not yet finished?',session.access_token);
  assert.match(pending.answer,/Unfinished assignments \(1\)/);
  assert.doesNotMatch(pending.answer,/Practice reflection/);
  await courseAction('Import Moodle calendar');
  await page.getByLabel('Moodle calendar file',{exact:true}).setInputFiles({
    name:'moodle.ics',mimeType:'text/calendar',
    buffer:Buffer.from(['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:qa-import','DTSTART;TZID=Asia/Taipei:20261201T150000',
      'SUMMARY:Imported deadline','END:VEVENT','END:VCALENDAR'].join('\r\n')),
  });
  await page.getByRole('checkbox',{name:/Imported deadline/}).check();
  await button('Import selected deadlines').click();
  await page.getByText('Imported deadline',{exact:true}).waitFor();
  const nextDay = new Date(Date.now()+2*86_400_000).toISOString().slice(0,10);
  await post('/api/affairs-action',{kind:'save_dtm_meeting',payload:{
    id:randomUUID(),course_id:coursePath.split('/').at(-1),meeting_on:nextDay,starts_at:'10:30',title:'Network design workshop',attendance:'unknown',
  }},session.access_token);
  const upcoming = await answer('/api/affairs-assistant','What is my next class?',session.access_token,'/');
  assert.ok(upcoming.answer.includes(nextDay+' 10:30 Taipei'));
  assert.match(upcoming.answer,/Network design workshop/);

  await courseAction('Grades');
  await courseAction('Add grade');
  await page.getByLabel('Grade item',{exact:true}).fill('Practice exam');
  await page.getByLabel('Score',{exact:true}).fill('32');
  await page.getByLabel('Maximum points',{exact:true}).fill('40');
  await save();
  await page.getByRole('cell',{name:'80.00%',exact:true}).waitFor();
  const grades = await answer('/api/affairs-assistant','Show my grades',session.access_token,'/');
  assert.match(grades.answer,/Practice exam.*80\.0%/);
  const evidence = 'artifacts/visual-parity/live-student';
  await mkdir(evidence,{recursive:true,mode:0o700});
  await page.screenshot({path:evidence+'/grade-report.png',fullPage:true});
  await chmod(evidence+'/grade-report.png',0o600);
  await page.goto(origin+coursePath);
  await page.getByRole('heading',{name:'Assignments',exact:true}).waitFor();
  await page.screenshot({path:evidence+'/course-outline.png',fullPage:true});
  await chmod(evidence+'/course-outline.png',0o600);

  await page.goto(origin+'/school-affairs/menu/sao/all');
  await page.getByRole('link',{name:'請假填單',exact:true}).click();
  await page.waitForURL('**/school-affairs/services/leave');
  await page.getByLabel('開始請假日期',{exact:true}).fill('2026-10-29');
  await page.getByLabel('結束請假日期',{exact:true}).fill('2026-10-29');
  await page.getByLabel('請假節次',{exact:true}).fill('2–3');
  await page.getByLabel('請假事由',{exact:true}).fill('Private QA note');
  await page.getByLabel('電話',{exact:true}).fill('020000000');
  await page.getByRole('radio',{name:'心理假',exact:true}).check();
  await page.getByRole('radio',{name:'上午(08-13時)',exact:true}).check();
  await button('送出').click();
  await page.waitForURL('**/school-affairs/services/leave/history');
  await page.getByRole('cell',{name:'心理假',exact:true}).waitFor();
  const editPath = await page.getByRole('link',{name:'編輯',exact:true}).getAttribute('href');
  const leaveId = editPath.split('/').at(-1);
  await page.getByRole('link',{name:'編輯',exact:true}).click();
  await page.getByLabel('電話',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('電話',{exact:true}).inputValue(),'020000000');
  assert.equal(await page.getByRole('radio',{name:'上午(08-13時)',exact:true}).isChecked(),true);
  await page.getByRole('link',{name:'回列表',exact:true}).click();
  await button('送站內審核').click();
  await page.getByRole('dialog').getByRole('button',{name:'送出',exact:true}).click();
  await page.getByText('站內待審',{exact:true}).waitFor();
  await page.goto(origin+'/school-affairs/services/leave/history');
  await page.getByText('站內待審',{exact:true}).waitFor();
  const leave = await answer('/api/affairs-assistant','What is my leave status?',session.access_token,'/school-affairs');
  assert.match(leave.answer,/Mental health leave.*awaiting stu.best review/);
  assert.doesNotMatch(leave.answer,/Private QA note/);
  assert.doesNotMatch(leave.answer,/020000000/);
  const secondSession = await createFixture();
  const secondStudent = createClient(url,key,{auth:{...auth},global:{headers:{Authorization:'Bearer '+secondSession.access_token}}});
  const outsideRead = await secondStudent.from('affairs_service_records').select('contact_phone,leave_time_period').eq('id',leaveId);
  assert.equal(outsideRead.error,null);
  assert.deepEqual(outsideRead.data,[]);
  const outsideDelete = await secondStudent.rpc('affairs_manage_service_record',{p_kind:'delete_service_record',p_payload:{id:leaveId}});
  assert.equal(outsideDelete.error?.code,'42501');
  await button('Index').click();
  assert.equal(await page.getByRole('menuitem',{name:'校方請假系統',exact:true}).getAttribute('href'),
    'https://infosys.stu.edu.tw/StuLeave/Login/AspLoginStu');
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:850});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const axe = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  assert.deepEqual(axe.violations.filter(item=>['serious','critical'].includes(item.impact)).map(item=>item.id),[]);
  await page.goto(origin+'/school-affairs/services/internship');
  await page.getByRole('link',{name:/^Self-assessment form for students/}).click();
  await button('新增紀錄 · New record').click();
  await page.getByLabel(/標題 · Title/).fill('Internship reflection QA');
  await page.getByLabel(/Reflection/).fill('Placement learning notes.');
  await button('儲存紀錄 · Save record').click();
  await page.getByRole('rowheader',{name:'Internship reflection QA',exact:true}).waitFor();
  const internship = await answer('/api/affairs-assistant','Show my internship records',session.access_token,'/school-affairs');
  assert.match(internship.answer,/Internship reflection QA.*draft/);
  assert.doesNotMatch(internship.answer,/Placement learning notes/);
  assert.deepEqual(pageErrors,[]);
  const anonymous = await answer('/api/research-assistant','Which assignments are not yet finished?');
  assert.equal(anonymous.status,'handoff');
  assert.doesNotMatch(anonymous.answer,/Index design worksheet/);
  for (const [question,source] of [
    ['Where can I find the campus Wi-Fi guide?','https://help.ecc.stu.edu.tw/wireless-setting/'],
    ['Where is the registrar?','https://www.aca.stu.edu.tw/%E6%9C%8D%E5%8B%99%E5%B0%8D%E8%B1%A1-services/'],
    ['Where can I file student leave?','https://infosys.stu.edu.tw/StuLeave/Login/AspLoginStu'],
  ]) {
    const publicAnswer = await answer('/api/research-assistant',question);
    assert.equal(publicAnswer.citations[0].url,source);
  }
  console.log('Live student browser passed: shared account, saved DTM and leave forms, calendar import, chat links, grades, site review, privacy and mobile accessibility.');
} finally {
  await browser?.close();
  try {
    for (const id of fixtures) {
      await sql`delete from auth.identities where user_id=${id} and provider_id=${id} and provider='google'`;
      const deleted = await admin.auth.admin.deleteUser(id);
      assert.equal(deleted.error,null,'Student workspace QA fixture cleanup failed.');
      const [check] = await sql`select exists(select 1 from auth.users where id=${id}) as present`;
      assert.equal(check.present,false,'Temporary user must be removed.');
    }
  } finally {
    await sql.end({timeout:5});
  }
}
