import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {affairsTestUser as user,mockAffairsAuth} from './helpers/affairs-auth.mjs';

// Actual local browser dispatch/rendering with synthetic Auth and mocked HTTP.
// These checks do not establish live appointment, RLS, OAuth or model accuracy.
const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5297',base=new URL(origin);
assert.ok(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)&&base.pathname==='/'
  &&!base.username&&!base.password&&!base.search&&!base.hash,'Only a localhost preview is allowed.');
const path='/school-affairs/services/29-1/appointments',directory='/school-affairs/services/29-1';
const login='/school-affairs/login?next='+encodeURIComponent(path);
const row={id:'29000000-0000-4000-8001-000000000001',kind:'counseling',status:'requested',preferred_on:'2026-11-20',
  preferred_period:'morning',scheduled_at:null,version:1,updated_at:'2026-11-14T02:00:00+00:00'};
const activity={kind:'account-read:counselingAppointments:1',label:'Checking saved counseling appointment metadata',
  detail:'Checked the caller’s own appointment preferences and saved status.',status:'complete'};
const scenarios=[
  {id:'record',question:'Show my saved counseling appointments.',answer:'Saved local appointment: requested; preferred 2026-11-20, morning. No scheduled timestamp is saved.',read:true},
  {id:'modern',question:'Show my psychological assessment records.',answer:'The metadata reader returned a requested local appointment.',read:true},
  {id:'balance-after',question:'Show my counseling appointments. Also show my tuition balance.',answer:'Your appointment is requested. Your separate saved tuition balance is NT$23,000.',read:true},
  {id:'balance-before',question:'Show my tuition balance. Also show my counseling appointments.',answer:'Your separate saved tuition balance is NT$23,000. Your appointment is requested.',read:true},
  {id:'excluded',question:'Show my tuition balance and never show my counseling appointments.',answer:'Your saved tuition balance is NT$23,000. Counseling was excluded.'},
  {id:'incidental-title',question:'Show my unpaid balance for QA Counseling Tuition instalment and do not show my counseling appointments.',answer:'The saved QA Counseling Tuition instalment balance is NT$23,000.'},
  {id:'foreign',question:'Show counseling appointments booked by Alice.',answer:'I cannot access Alice’s appointment records.'},
  {id:'public',question:'Where can I book a counseling appointment?',answer:'Use the counseling page to find the appointment entry.',link:directory},
  {id:'public-mixed',question:'Where can I book a counseling appointment? Also show my tuition balance.',answer:'Use the counseling page to find the appointment entry. Your separate saved balance is NT$23,000.',link:directory},
  {id:'clinical',question:'Show my counseling appointments and clinical results.',answer:'The saved appointment is requested. Clinical results are not available through the metadata reader.',read:true},
  {id:'cancel',question:'Cancel my counseling appointment.',answer:'I cannot cancel an appointment through this read-only assistant. Open your saved appointments to review it.',link:path},
  {id:'restricted',question:'Show my counseling coordinator queue.',answer:'The assistant cannot read coordinator queues.'},
];
let checks=0;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
async function session(signedIn){
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
  const calls=[],native=[],blocked=[],errors=[];let expected=null,failOnce=false;
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===base.origin&&!url.pathname.startsWith('/api/'))return route.continue();
    blocked.push(url.origin+url.pathname);return route.abort('blockedbyclient');
  });
  await mockAffairsAuth(context,{signedIn});
  await context.route('**/api/**',async route=>{
    try{
      const req=route.request(),url=new URL(req.url());assert.equal(url.origin,base.origin);
      if(url.pathname==='/api/affairs-data'){
        assert.ok(signedIn);assert.equal(req.method(),'GET');assert.match(req.headers().authorization??'',/^Bearer /u);
        assert.deepEqual([...url.searchParams.entries()].sort(),[['scope','counseling-appointments'],['view','mine']]);
        native.push(url.search);return route.fulfill({json:{userId:user.id,available:true,canCoordinate:false,rows:[row]}});
      }
      if(url.pathname==='/api/affairs-conversations'){
        assert.ok(signedIn);assert.match(req.headers().authorization??'',/^Bearer /u);
        if(req.method()==='GET')return route.fulfill({json:{conversations:[]}});
        assert.equal(req.method(),'POST');const saved=req.postDataJSON();
        return route.fulfill({json:{id:saved.id,title:saved.title,messages:saved.messages,version:saved.version+1,updated_at:new Date().toISOString()}});
      }
      assert.ok(expected);assert.equal(url.pathname,signedIn?'/api/affairs-assistant':'/api/research-assistant');assert.equal(req.method(),'POST');
      const body=req.postDataJSON();assert.equal(body.question,expected.question);assert.equal(body.route,signedIn?path:login);
      assert.equal(body.stream,true);assert.deepEqual(body.images,[]);assert.ok(Array.isArray(body.history));
      assert.ok(!JSON.stringify(body).includes(row.id),'The page’s private appointment UUID is not sent to chat.');
      if(signedIn)assert.match(req.headers().authorization??'',/^Bearer /u);else assert.equal(req.headers().authorization,undefined);
      calls.push({question:body.question,history:body.history,path:url.pathname});
      if(failOnce){failOnce=false;return route.fulfill({status:503,json:{error:'Synthetic counseling metadata unavailable. Please retry.'}});}
      const answer=expected.answer+(expected.link?' [Open counseling page]('+expected.link+')':'');
      const result={answer,status:expected.status??'answered',citations:expected.read?[{chunkId:'account:counselingAppointments',title:'Saved appointment metadata',
        url:path,claim:expected.answer,sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:null}]:[],suggestedQuestions:[],
        grounding:{source:expected.read?'account':'directory',webSearched:false},activity:expected.read?[activity]:[],
        ...(expected.read?{verification:{status:'verified',attempts:1}}:{})};
      return route.fulfill({contentType:'text/event-stream',body:(expected.read?'event: progress\ndata: '+JSON.stringify(activity)+'\n\n':'')
        +'event: result\ndata: '+JSON.stringify(result)+'\n\n'});
    }catch(error){errors.push(error);await route.abort('failed').catch(()=>{});}
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error));
  await page.goto(origin+path,{waitUntil:'domcontentloaded'});
  if(signedIn)await page.getByRole('table').getByText(row.preferred_on,{exact:true}).waitFor();
  else{await page.waitForURL(url=>url.pathname==='/school-affairs/login');assert.equal(new URL(page.url()).searchParams.get('next'),path);}
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();const panel=page.getByRole('dialog');
  await panel.getByRole('heading',{name:'校園助理 · Assistant'}).waitFor();
  async function ask(value,{fresh=true,fail=false}={}){
    if(fresh&&calls.length)await panel.getByRole('button',{name:'New chat'}).click();
    expected=value;failOnce=fail;const before=calls.length,reads=native.length;
    await panel.getByPlaceholder('Ask a school question…').fill(value.question);await panel.getByRole('button',{name:'Send',exact:true}).click();
    await panel.getByText(fail?'Synthetic counseling metadata unavailable. Please retry.':value.answer+(value.link?' Open counseling page':''),{exact:true}).waitFor();
    assert.equal(calls.length,before+1,'One full-question common assistant request.');assert.equal(native.length,reads,'Chat never invokes direct mine/queue/access reads or mutations.');
    if(value.link&&!fail)assert.equal(await panel.getByRole('link',{name:'Open counseling page'}).getAttribute('href'),value.link);
    if(value.read&&!fail){const details=panel.locator('details').last();await details.locator('summary').focus();await page.keyboard.press('Enter');
      await details.getByText(activity.label,{exact:true}).waitFor();assert.equal(await details.locator('li').count(),1);}
    assert.equal(await panel.getByText(row.id,{exact:false}).count(),0);if(errors.length)throw errors[0];checks++;
  }
  return {context,page,ask,calls,errors,blocked};
}
try{
  const own=await session(true);for(const item of scenarios)await own.ask(item);
  await own.ask(scenarios[0]);await own.ask({question:'When is it?',answer:'No scheduled timestamp is saved for the requested appointment.',read:true},{fresh:false});
  assert.ok(own.calls.at(-1).history.some(item=>item.role==='user'&&item.content===scenarios[0].question));
  await own.ask({question:'What is my tuition payment due date?',answer:'The saved tuition due date is 2026-12-15.'});
  await own.ask({question:'When is it?',answer:'The saved tuition due date remains 2026-12-15.'},{fresh:false});
  assert.ok(own.calls.at(-1).history.some(item=>item.role==='user'&&item.content==='What is my tuition payment due date?'));
  const retry={question:'Check my counseling appointment status.',answer:'The retry returned a requested saved appointment.',read:true};
  await own.ask(retry,{fail:true});await own.ask(retry,{fresh:false});
  const before=own.calls.length;
  const error=await own.page.evaluate(async()=>{const {askSchoolAffairsAssistant}=await import('/src/services/schoolAffairsAssistant.ts');
    try{await askSchoolAffairsAssistant('29000000-0000-4000-8000-000000000099','Show my counseling appointments.',[],undefined,[],location.pathname);return null;}
    catch(reason){return reason.message;}});
  assert.match(error??'',/account changed/iu);assert.equal(own.calls.length,before);checks++;
  assert.deepEqual(own.errors,[]);assert.deepEqual(own.blocked,[]);await own.context.close();
  const guest=await session(false);
  await guest.ask({question:'Show my counseling appointments.',answer:'Sign in to view saved appointment metadata.',status:'handoff',link:login});
  await guest.ask({question:'Where can I book a counseling appointment?',answer:'The public counseling page has the appointment entry.',link:directory});
  assert.deepEqual(guest.errors,[]);assert.deepEqual(guest.blocked,[]);await guest.context.close();
  console.log(JSON.stringify({status:'passed',checks,scope:'local Chromium with synthetic Auth and mocked HTTP',
    fullQuestionsAndHistoryRetained:true,guestNoBearer:true,noDirectChatReadsOrWrites:true,liveBackendAcceptance:false}));
}finally{await browser.close();}
