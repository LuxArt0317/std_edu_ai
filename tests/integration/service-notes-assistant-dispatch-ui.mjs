import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {affairsTestUser as user,mockAffairsAuth} from './helpers/affairs-auth.mjs';

// Local rendering and actual browser dispatch only. Every Auth/data/assistant
// response is synthetic; this is not model, backend, RLS or deployment proof.
const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5299',base=new URL(origin);
assert.ok(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)&&base.pathname==='/'
  &&!base.username&&!base.password&&!base.search&&!base.hash,'Only a localhost preview is allowed.');
const services=[
  ['27-1','learning support'],['30-1','emergency injury'],['30-2','equipment borrowing'],
  ['31-1','international student work'],['31-2','rental'],['32-1','campus service'],['35-1','student insurance'],
];
const path='/school-affairs/services/27-1',servicePath=key=>'/school-affairs/services/'+key;
const privateSentinel='PAGE-ONLY-SERVICE-NOTE-83174';
const savedNote=key=>privateSentinel+'-'+key;
const insuranceKey='35-1';
const snapshot={checkedAt:'2026-11-15T00:00:00Z',officialUniversityData:false,
  profile:{userId:user.id,email:user.email,displayName:'QA Student',role:'student'},student:null,
  courses:[],charges:[],assignments:[],announcements:[],tasks:[],requests:[],dtm:{sourceMode:'personal',courses:[],notices:[]},
  serviceRecords:services.map(([key],index)=>({id:'36000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),serviceKey:key,
    recordType:'note',title:'PAGE-ONLY-NOTE-'+key,notes:savedNote(key),status:key===insuranceKey?'filed':'draft',startsOn:null,endsOn:null,
    leaveCategory:null,periods:null,updatedAt:'2026-11-15T00:00:00Z',reviewStatus:null}))};
const steps={serviceRecords:{kind:'account-read:serviceRecords:1',label:'Checked selected local notes',detail:'Only the caller-owned note collection.',status:'complete'},
  charges:{kind:'account-read:charges:1',label:'Checked saved fee balance',detail:'Checked the saved local fee ledger.',status:'complete'},
  courses:{kind:'account-read:courses:1',label:'Checked saved class timetable',detail:'Checked the saved class schedule.',status:'complete'},
  profile:{kind:'account-read:profile:1',label:'Checked saved profile',detail:'Checked the requested account field.',status:'complete'}};
const noteCase=([key,label])=>({question:'Show my saved '+label+' notes.',answer:'The selected local '+label+' note says: Bring the reminder card.',tools:['serviceRecords'],link:servicePath(key)});
const scenarios=[
  ...services.map(noteCase),
  {question:'Show my saved learning support notes and my tuition balance.',answer:'Your local note says bring the reminder card. The saved fee balance is 23000.',tools:['serviceRecords','charges']},
  {question:'Show my tuition balance. Also show my saved learning support notes.',answer:'The saved fee balance is 23000. Your local note says bring the reminder card.',tools:['charges','serviceRecords']},
  {question:'Have I confirmed my student basic information? Also show my saved learning support notes.',answer:'Your information confirmation and selected local note were checked.',tools:['profile','serviceRecords']},
  {question:'Show my saved learning support notes. Have I confirmed my student basic information?',answer:'The selected local note and your information confirmation were checked.',tools:['serviceRecords','profile']},
  {question:'Show my student insurance notes and my rental notes.',answer:'Your two separate local note collections were checked.',tools:['serviceRecords']},
  {question:'Show my tuition balance and do not show my saved learning support notes.',answer:'The saved fee balance is 23000.',tools:['charges']},
  {question:'Do not show my saved learning support notes. Show my tuition balance.',answer:'The saved fee balance is 23000.',tools:['charges']},
  {question:'Show Alice’s student insurance notes.',answer:'I cannot read another student’s private notes.'},
  {question:'Show the rental notes of my mother.',answer:'I cannot read another student’s private notes.'},
  {question:'Are my student insurance benefits officially approved?',answer:'Local notes do not establish official insurance approval.'},
  {question:'Has my international student work permit been approved?',answer:'A local note does not establish official work permit approval.'},
  {question:'Where can I find the student insurance service?',answer:'Open the student insurance service.',link:servicePath('35-1')},
  {question:'What is my next class?',answer:'Your next saved class is QA Databases at 13:10 in R301.',tools:['courses']},
];
let checks=0,nativeReadbacks=0;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
async function verifyNote(page,key){
  const table=page.getByRole('region',{name:'Saved service records',exact:true});
  const title='PAGE-ONLY-NOTE-'+key;
  const row=table.getByRole('row').filter({has:page.getByRole('rowheader',{name:title,exact:true})});
  const expected=key===insuranceKey?'自行標記已送出 · Marked filed':'草稿 · Draft';
  await row.getByRole('cell',{name:expected,exact:true}).waitFor();
  assert.equal(await table.getByRole('rowheader').count(),1,'A service page must only show that service’s rows.');
  const edit=row.getByRole('button',{name:'編輯 · Edit',exact:true});
  await edit.focus();await page.keyboard.press('Enter');
  const notes=page.getByRole('textbox',{name:'備註 · Notes',exact:true});
  await notes.waitFor();
  assert.equal(await notes.inputValue(),savedNote(key));
  assert.equal(await page.getByRole('textbox',{name:'標題 · Title',exact:true}).inputValue(),title);
  await page.getByRole('button',{name:'取消 · Cancel',exact:true}).click();
  await notes.waitFor({state:'detached'});
  nativeReadbacks++;
}
async function session(signedIn,entry=path,viewport={width:1280,height:800}){
  const context=await browser.newContext({viewport,serviceWorkers:'block'});
  const calls=[],pageReads=[],blocked=[],errors=[];let expected=null,failOnce=false;
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
        assert.ok(signedIn);assert.equal(req.method(),'GET');assert.equal(url.search,'');
        assert.match(req.headers().authorization??'',/^Bearer /u);pageReads.push(url.pathname);return route.fulfill({json:snapshot});
      }
      if(url.pathname==='/api/affairs-conversations'){
        assert.ok(signedIn);assert.match(req.headers().authorization??'',/^Bearer /u);
        if(req.method()==='GET')return route.fulfill({json:{conversations:[]}});
        assert.equal(req.method(),'POST');const saved=req.postDataJSON();assert.ok(!JSON.stringify(saved).includes(privateSentinel));
        return route.fulfill({json:{id:saved.id,title:saved.title,messages:saved.messages,version:saved.version+1,updated_at:new Date().toISOString()}});
      }
      assert.ok(expected);assert.equal(url.pathname,signedIn?'/api/affairs-assistant':'/api/research-assistant');assert.equal(req.method(),'POST');
      const body=req.postDataJSON();assert.equal(body.question,expected.question);assert.equal(body.route,signedIn?entry:'/school-affairs/login?next='+encodeURIComponent(entry));
      assert.equal(body.stream,true);assert.deepEqual(body.images,[]);assert.ok(Array.isArray(body.history));
      assert.ok(!JSON.stringify(body).includes(privateSentinel));assert.ok(!JSON.stringify(body).includes('PAGE-ONLY-NOTE-'));
      if(signedIn)assert.match(req.headers().authorization??'',/^Bearer /u);else assert.equal(req.headers().authorization,undefined);
      calls.push({question:body.question,history:body.history,path:url.pathname});
      if(failOnce){failOnce=false;return route.fulfill({status:503,json:{error:'Synthetic note lookup unavailable. Please retry.'}});}
      const activity=(expected.tools??[]).map(tool=>steps[tool]);
      const answer=expected.answer+(expected.link?' [Open service]('+expected.link+')':'');
      const result={answer,status:expected.status??'answered',citations:(expected.tools??[]).map(tool=>({chunkId:'account:'+tool,title:steps[tool].label,
        url:tool==='courses'?'/school-affairs/records/subjects':tool==='charges'?'/school-affairs/services/39-1':expected.link??entry,
        claim:expected.answer,sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:null})),suggestedQuestions:[],
        grounding:{source:activity.length?'account':'directory',webSearched:false},activity,...(activity.length?{verification:{status:'verified',attempts:1}}:{})};
      return route.fulfill({contentType:'text/event-stream',body:activity.map(step=>'event: progress\ndata: '+JSON.stringify(step)+'\n\n').join('')
        +'event: result\ndata: '+JSON.stringify(result)+'\n\n'});
    }catch(error){errors.push(error);await route.abort('failed').catch(()=>{});}
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error));
  await page.goto(origin+entry,{waitUntil:'domcontentloaded'});
  const service=services.find(([key])=>entry===servicePath(key));
  if(signedIn&&service)await verifyNote(page,service[0]);
  if(!signedIn){await page.waitForURL(url=>url.pathname==='/school-affairs/login');assert.equal(new URL(page.url()).searchParams.get('next'),entry);}
  if(entry!=='/campus-assistant')await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  const panel=page.getByRole('dialog');await panel.getByRole('heading',{name:'校園助理 · Assistant'}).waitFor();
  async function ask(value,{fresh=true,fail=false}={}){
    if(fresh&&calls.length)await panel.getByRole('button',{name:'New chat'}).click();
    expected=value;failOnce=fail;const before=calls.length,reads=pageReads.length;
    await panel.getByPlaceholder('Ask a school question…').fill(value.question);await panel.getByRole('button',{name:'Send',exact:true}).click();
    await panel.getByText(fail?'Synthetic note lookup unavailable. Please retry.':value.answer+(value.link?' Open service':''),{exact:true}).waitFor();
    assert.equal(calls.length,before+1,'Exactly one full-question graph request.');assert.equal(pageReads.length,reads,'Chat never invokes a dedicated native read or mutation.');
    if(value.link&&!fail)assert.equal(await panel.getByRole('link',{name:'Open service'}).getAttribute('href'),value.link);
    if(value.tools?.length&&!fail){const details=panel.locator('details').last();await details.locator('summary').focus();await page.keyboard.press('Enter');
      for(const tool of value.tools)await details.getByText(steps[tool].label,{exact:true}).waitFor();assert.equal(await details.locator('li').count(),value.tools.length);}
    assert.equal(await panel.getByText(privateSentinel,{exact:false}).count(),0);if(errors.length)throw errors[0];checks++;
  }
  return {context,page,ask,calls,pageReads,errors,blocked};
}
try{
  const own=await session(true);for(const item of scenarios)await own.ask(item);
  await own.ask(noteCase(services[0]));await own.ask({question:'What about its status?',answer:'The selected local note is marked draft; this is not official approval.',tools:['serviceRecords']},{fresh:false});
  assert.ok(own.calls.at(-1).history.some(item=>item.role==='user'&&item.content===noteCase(services[0]).question));
  await own.ask({question:'When is my tuition payment due?',answer:'The saved fee due date is 30 November.',tools:['charges']});
  await own.ask({question:'When is it?',answer:'That saved fee is due on 30 November.',tools:['charges']},{fresh:false});
  assert.ok(own.calls.at(-1).history.some(item=>item.role==='user'&&item.content==='When is my tuition payment due?'));
  const retry={question:'Check my saved learning support notes.',answer:'The retry found the selected local note.',tools:['serviceRecords']};
  await own.ask(retry,{fail:true});await own.ask(retry,{fresh:false});
  const before=own.calls.length,error=await own.page.evaluate(async()=>{
    const {askSchoolAffairsAssistant}=await import('/src/services/schoolAffairsAssistant.ts');
    try{await askSchoolAffairsAssistant('16000000-0000-4000-8000-000000000099','Show my saved learning support notes.',[],undefined,[],location.pathname);return null;}
    catch(reason){return reason.message;}});
  assert.match(error??'',/account changed/iu);assert.equal(own.calls.length,before);checks++;
  assert.deepEqual(own.errors,[]);assert.deepEqual(own.blocked,[]);await own.context.close();
  for(const service of services.slice(1)){
    const view=await session(true,servicePath(service[0]));await view.ask(noteCase(service));assert.deepEqual(view.errors,[]);assert.deepEqual(view.blocked,[]);await view.context.close();
  }
  const other=await session(true,'/campus-assistant');await other.ask(noteCase(services[0]));assert.deepEqual(other.errors,[]);assert.deepEqual(other.blocked,[]);await other.context.close();
  const insurance=services.find(([key])=>key===insuranceKey),insurancePath=servicePath(insuranceKey);
  const phone=await session(true,insurancePath,{width:390,height:740});
  await phone.ask(noteCase(insurance));assert.deepEqual(phone.errors,[]);assert.deepEqual(phone.blocked,[]);await phone.context.close();
  const insuranceGuest=await session(false,insurancePath,{width:390,height:740});
  await insuranceGuest.ask({question:noteCase(insurance).question,answer:'Sign in to read your saved student insurance notes.',status:'handoff',
    link:'/school-affairs/login?next='+encodeURIComponent(insurancePath)});
  assert.deepEqual(insuranceGuest.pageReads,[]);
  assert.equal(await insuranceGuest.page.getByRole('region',{name:'Saved service records'}).count(),0);
  assert.deepEqual(insuranceGuest.errors,[]);assert.deepEqual(insuranceGuest.blocked,[]);await insuranceGuest.context.close();
  const guest=await session(false);await guest.ask({question:'Show my saved learning support notes.',answer:'Sign in to read your private local notes.',status:'handoff',link:'/school-affairs/login?next='+encodeURIComponent(path)});
  await guest.ask({question:'Show Alice’s student insurance notes.',answer:'I cannot read another student’s private notes.'});
  await guest.ask({question:'Where can I find the student insurance service?',answer:'Open the student insurance service.',link:servicePath('35-1')});
  assert.deepEqual(guest.errors,[]);assert.deepEqual(guest.blocked,[]);await guest.context.close();
  console.log(JSON.stringify({status:'passed',checks,scope:'local Chromium with synthetic Auth and mocked HTTP',
    servicePages:services.length,nativeReadbacks,guestInsuranceReturn:true,fullQuestionsAndHistoryRetained:true,guestNoBearer:true,
    noDedicatedChatReadsOrWrites:true,liveBackendAcceptance:false}));
}finally{await browser.close();}
