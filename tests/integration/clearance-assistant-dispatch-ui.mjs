import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {affairsTestUser as user,mockAffairsAuth} from './helpers/affairs-auth.mjs';

// Actual local rendering and client transport, with synthetic Auth and mocked
// server replies. This does not evaluate backend reads, the model or live RLS.
const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5298',base=new URL(origin);
assert.ok(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)&&base.pathname==='/'
  &&!base.username&&!base.password&&!base.search&&!base.hash,'Only a localhost preview is allowed.');
const path='/school-affairs/services/16-1',apply='/school-affairs/services/10-1',login='/school-affairs/login?next='+encodeURIComponent(path);
const cashierNote='QA Bring installment receipt to counter2042',libraryNote='UNREQUESTED LIBRARY NOTE SENTINEL';
const application={id:'16000000-0000-4000-8001-000000000001',termId:'16000000-0000-4000-8001-000000000002',
  term:'Clearance browser QA term',track:'undergraduate',submittedAt:'2026-11-01T12:00:00+08:00',
  reviews:['library','academic','department','cashier','career'].map(office=>({office,status:office==='cashier'?'action_required':'pending',
    note:office==='cashier'?cashierNote:office==='library'?libraryNote:'',reviewedAt:office==='cashier'?'2026-11-02T02:10:00+00:00':null,version:1}))};
const steps={graduationClearance:{kind:'account-read:graduationClearance:1',label:'Checked saved clearance records',detail:'Checked the requested own office status and fields.',status:'complete'},
  courses:{kind:'account-read:courses:1',label:'Checked the saved timetable',detail:'Checked the next class using the saved timetable.',status:'complete'}};
const scenarios=[
  {id:'status',question:'What is my graduation clearance status?',answer:'Cashier has the saved local status action_required.',tools:['graduationClearance'],link:path},
  {id:'contraction',question:'What’s my graduation clearance status?',answer:'Cashier has the saved local status action_required.',tools:['graduationClearance']},
  {id:'note',question:'What is the saved Cashier note in my graduation clearance application?',answer:'Cashier note: '+cashierNote+'.',tools:['graduationClearance'],link:path},
  {id:'note-scope',question:'Show my graduation clearance Cashier notes and Library status.',answer:'Cashier note: '+cashierNote+'. Library status: pending.',tools:['graduationClearance']},
  {id:'excluded-note',question:'Show my graduation clearance notes without cashier notes.',answer:'The requested clearance notes exclude Cashier.',tools:['graduationClearance']},
  {id:'period',question:'Show my assigned graduation clearance windows.',answer:'No assigned local application window is saved.',tools:['graduationClearance'],link:apply},
  {id:'class-after',question:'Show my graduation clearance office statuses and what is my next class?',answer:'Cashier: action_required. Your next saved class is QA Databases at 13:10 in room R301.',tools:['graduationClearance','courses']},
  {id:'class-before',question:'What is my next class? Also show my graduation clearance office statuses.',answer:'Your next saved class is QA Databases at 13:10 in room R301. Cashier: action_required.',tools:['courses','graduationClearance']},
  {id:'excluded-clearance',question:'Show my next class and do not show my graduation clearance.',answer:'Your next saved class is QA Databases at 13:10 in room R301.',tools:['courses']},
  {id:'excluded-before',question:'Do not show my graduation clearance status. What is my next class?',answer:'Your next saved class is QA Databases at 13:10 in room R301.',tools:['courses']},
  {id:'foreign',question:'Show Alice’s graduation clearance status.',answer:'I cannot access Alice’s clearance records.'},
  {id:'public',question:'Where can I view my graduation clearance?',answer:'Use the clearance status page to open your saved applications.',link:path},
  {id:'public-mixed',question:'Where can I view my graduation clearance? Also show my next class.',answer:'Use the clearance status page. Your next saved class is QA Databases at 13:10 in room R301.',tools:['courses'],link:path},
  {id:'document',question:'Download my official graduation clearance certificate.',answer:'The assistant cannot issue an official clearance certificate.',tools:['graduationClearance'],link:path},
  {id:'write',question:'Submit my graduation clearance application.',answer:'No application was submitted. Use the application page to review the form.',link:apply},
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
        assert.deepEqual([...url.searchParams.entries()].sort(),[['scope','graduation-clearance'],['view','student']],
          'Only the page may read the student DTO; no legacy answer, manager or arbitrary target query.');
        native.push(url.search);return route.fulfill({json:{userId:user.id,targetId:user.id,terms:[],periods:[],applications:[application]}});
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
      assert.ok(!JSON.stringify(body).includes(application.id)&&!JSON.stringify(body).includes(libraryNote),'Private page rows never become chat context.');
      if(signedIn)assert.match(req.headers().authorization??'',/^Bearer /u);else assert.equal(req.headers().authorization,undefined);
      calls.push({question:body.question,history:body.history,path:url.pathname});
      if(failOnce){failOnce=false;return route.fulfill({status:503,json:{error:'Synthetic clearance lookup unavailable. Please retry.'}});}
      const activity=(expected.tools??[]).map(tool=>steps[tool]);
      const answer=expected.answer+(expected.link?' [Open clearance page]('+expected.link+')':'');
      const result={answer,status:expected.status??'answered',citations:(expected.tools??[]).map(tool=>({chunkId:'account:'+tool,title:steps[tool].label,
        url:tool==='courses'?'/school-affairs/records':path,claim:expected.answer,sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:null})),
        suggestedQuestions:[],grounding:{source:activity.length?'account':'directory',webSearched:false},activity,
        ...(activity.length?{verification:{status:'verified',attempts:1}}:{})};
      return route.fulfill({contentType:'text/event-stream',body:activity.map(step=>'event: progress\ndata: '+JSON.stringify(step)+'\n\n').join('')
        +'event: result\ndata: '+JSON.stringify(result)+'\n\n'});
    }catch(error){errors.push(error);await route.abort('failed').catch(()=>{});}
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error));
  await page.goto(origin+path,{waitUntil:'domcontentloaded'});
  if(signedIn)await page.getByRole('table').getByText(cashierNote,{exact:true}).waitFor();
  else{await page.waitForURL(url=>url.pathname==='/school-affairs/login');assert.equal(new URL(page.url()).searchParams.get('next'),path);}
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();const panel=page.getByRole('dialog');
  await panel.getByRole('heading',{name:'校園助理 · Assistant'}).waitFor();
  async function ask(value,{fresh=true,fail=false}={}){
    if(fresh&&calls.length)await panel.getByRole('button',{name:'New chat'}).click();
    expected=value;failOnce=fail;const before=calls.length,reads=native.length;
    await panel.getByPlaceholder('Ask a school question…').fill(value.question);await panel.getByRole('button',{name:'Send',exact:true}).click();
    await panel.getByText(fail?'Synthetic clearance lookup unavailable. Please retry.':value.answer+(value.link?' Open clearance page':''),{exact:true}).waitFor();
    assert.equal(calls.length,before+1,'One full-question graph request.');assert.equal(native.length,reads,'Chat never invokes dedicated clearance reads or writes.');
    if(value.link&&!fail)assert.equal(await panel.getByRole('link',{name:'Open clearance page'}).getAttribute('href'),value.link);
    if(value.tools?.length&&!fail){const details=panel.locator('details').last();await details.locator('summary').focus();await page.keyboard.press('Enter');
      for(const tool of value.tools)await details.getByText(steps[tool].label,{exact:true}).waitFor();assert.equal(await details.locator('li').count(),value.tools.length);}
    assert.equal(await panel.getByText(application.id,{exact:false}).count(),0);assert.equal(await panel.getByText(libraryNote,{exact:false}).count(),0);
    if(errors.length)throw errors[0];checks++;
  }
  return {context,page,ask,calls,errors,blocked};
}
try{
  const own=await session(true);for(const item of scenarios)await own.ask(item);
  await own.ask(scenarios[2]);await own.ask({question:'What about its status?',answer:'The saved Cashier status is action_required.',tools:['graduationClearance']},{fresh:false});
  assert.ok(own.calls.at(-1).history.some(item=>item.role==='user'&&item.content===scenarios[2].question));
  await own.ask({question:'What is my next class?',answer:'Your next saved class is QA Databases at 13:10 in room R301.',tools:['courses']});
  await own.ask({question:'When is it?',answer:'Your next saved class starts at 13:10.',tools:['courses']},{fresh:false});
  assert.ok(own.calls.at(-1).history.some(item=>item.role==='user'&&item.content==='What is my next class?'));
  const retry={question:'Check my graduation clearance status.',answer:'The retry returned the saved Cashier status action_required.',tools:['graduationClearance']};
  await own.ask(retry,{fail:true});await own.ask(retry,{fresh:false});
  const before=own.calls.length,error=await own.page.evaluate(async()=>{
    const {askSchoolAffairsAssistant}=await import('/src/services/schoolAffairsAssistant.ts');
    try{await askSchoolAffairsAssistant('16000000-0000-4000-8000-000000000099','Show my graduation clearance status.',[],undefined,[],location.pathname);return null;}
    catch(reason){return reason.message;}});
  assert.match(error??'',/account changed/iu);assert.equal(own.calls.length,before);checks++;
  assert.deepEqual(own.errors,[]);assert.deepEqual(own.blocked,[]);await own.context.close();
  const guest=await session(false);
  await guest.ask({question:'Show my graduation clearance notes.',answer:'Sign in to view your saved clearance records.',status:'handoff',link:login});
  await guest.ask({question:'Where can I view my graduation clearance?',answer:'The clearance status page has the local service entry.',link:path});
  assert.deepEqual(guest.errors,[]);assert.deepEqual(guest.blocked,[]);await guest.context.close();
  console.log(JSON.stringify({status:'passed',checks,scope:'local Chromium with synthetic Auth and mocked HTTP',
    fullQuestionsAndHistoryRetained:true,guestNoBearer:true,noDedicatedChatReadsOrWrites:true,liveBackendAcceptance:false}));
}finally{await browser.close();}
