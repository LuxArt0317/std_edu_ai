import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {affairsTestUser as user,mockAffairsAuth} from './helpers/affairs-auth.mjs';

// Actual local rendering and client transport, with synthetic Auth and mocked
// server replies. This does not evaluate backend reads, the model or live RLS.
const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5303',base=new URL(origin);
assert.ok(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)&&base.pathname==='/'
  &&!base.username&&!base.password&&!base.search&&!base.hash,'Only a localhost preview is allowed.');
const path='/school-affairs/services/38-1',login='/school-affairs/login?next='+encodeURIComponent(path);
const pageOnlyComment='PAGE-ONLY-CONDUCT-REASON-2718';
const snapshot={checkedAt:'2026-11-15T00:00:00Z',officialUniversityData:false,
  profile:{userId:user.id,email:user.email,displayName:'QA Student',role:'student'},student:{studentNumber:'PAGE-ONLY-IDENTITY-NUMBER',fullName:'PAGE-ONLY-IDENTITY-NAME'},
  courses:[],charges:[],assignments:[],announcements:[],tasks:[],requests:[],serviceRecords:[],
  dtm:{sourceMode:'personal',courses:[],notices:[]}};
const evaluation={records:[{id:'38000000-0000-4000-8000-000000000001',userId:user.id,sourceMode:'local_demo',version:1,
  createdAt:'2026-11-15T00:00:00Z',updatedAt:'2026-11-15T00:00:00Z',rowOrder:1,
  occurredOnText:'115/11/15',studentNumber:'PAGE-ONLY-NUMBER',studentName:'PAGE-ONLY-NAME',academicYearText:'115',semesterText:'1',yearLevelText:'2',
  reasonText:pageOnlyComment,conductCode:'M-0',conductName:'Saved local label',quantityText:'0',voidStatusText:''}]};
const steps={profile:{kind:'account-read:profile:1',label:'Checked saved account profile',detail:'Only explicitly requested account confirmation.',status:'complete'},studentConduct:{kind:'account-read:studentConduct:1',label:'Checked saved student conduct',detail:'Only requested caller-owned literal fields.',status:'complete'},
  charges:{kind:'account-read:charges:1',label:'Checked saved fee balance',detail:'Checked the saved local fee ledger.',status:'complete'},
  courses:{kind:'account-read:courses:1',label:'Checked saved class timetable',detail:'Checked the saved course schedule.',status:'complete'},
  dormitoryConduct:{kind:'account-read:dormitoryConduct:1',label:'Checked separate dormitory notice',detail:'A separate caller-owned notice.',status:'complete'},
  serviceRecords:{kind:'account-read:serviceRecords:1',label:'Checked private tracking notes',detail:'Local notes are separate from native conduct rows.',status:'complete'}};
const scenarios=[
  {id:'native',question:'What reason, code and quantity are saved in my student conduct records?',answer:'The selected local conduct row records Returned equipment, code M-0, and literal quantity 0.',tools:['studentConduct'],link:path},
  {id:'identity',question:'Show my student name and number in the conduct records.',answer:'The explicitly requested saved student name and number are QA Student and QA-381.',tools:['studentConduct']},
  {id:'no-identity',question:'Show my student conduct records without my name and student number.',answer:'The saved local conduct fields are shown without student identity.',tools:['studentConduct']},
  {id:'translated',question:'請顯示我的學生獎懲紀錄。',answer:'站內已儲存一筆獎懲紀錄，數量欄為文字 0。',tools:['studentConduct']},
  {id:'fee-after',question:'Show my student conduct records and my tuition balance.',answer:'One local conduct row is saved. The saved tuition balance is 23000.',tools:['studentConduct','charges']},
  {id:'fee-before',question:'Show my tuition balance. Also show my student conduct records.',answer:'The saved tuition balance is 23000. One local conduct row is saved.',tools:['charges','studentConduct']},
  {id:'profile-before',question:'Have I confirmed my student basic information? Also show my student conduct records.',answer:'Your account confirmation and local student conduct records were checked together.',tools:['profile','studentConduct']},
  {id:'profile-after',question:'Show my student conduct records. Have I confirmed my student basic information?',answer:'Your local student conduct records and account confirmation were checked together.',tools:['studentConduct','profile']},
  {id:'class-after',question:'Show my student conduct records. What is my next class?',answer:'One local conduct row is saved. Your next saved class is QA Databases at 13:10 in R301.',tools:['studentConduct','courses']},
  {id:'class-before',question:'What is my next class? Also show my student conduct records.',answer:'Your next saved class is QA Databases at 13:10 in R301. One local conduct row is saved.',tools:['courses','studentConduct']},
  {id:'dorm-after',question:'Show my student conduct and my dormitory conduct.',answer:'The student conduct row and separate dormitory notice were checked.',tools:['studentConduct','dormitoryConduct']},
  {id:'dorm-before',question:'Compare my dormitory conduct with my student conduct.',answer:'The separate dormitory notice and student conduct row were checked.',tools:['dormitoryConduct','studentConduct']},
  {id:'excluded',question:'Show my tuition balance and do not show my student conduct records.',answer:'The saved tuition balance is 23000.',tools:['charges']},
  {id:'excluded-before',question:'Do not show my student conduct records. Show my tuition balance.',answer:'The saved tuition balance is 23000.',tools:['charges']},
  {id:'later-exclusion',question:'Show my student conduct records. Do not show my student conduct records.',answer:'No conduct records were read.'},
  {id:'foreign',question:'Does Alice have a student conduct record?',answer:'I cannot read another student’s conduct records.'},
  {id:'foreign-relative',question:'Show the student conduct records of my mother.',answer:'I cannot read another student’s conduct records.'},
  {id:'public',question:'Where can I find the student conduct records page?',answer:'Open the student conduct page on stu.best.',link:path},
  {id:'public-mixed',question:'Where can I find my student conduct records? Show my tuition balance.',answer:'Open the student conduct page. The saved tuition balance is 23000.',tools:['charges'],link:path},
  {id:'write',question:'Delete my student conduct records.',answer:'No conduct records were deleted. This assistant reader has no mutation capability.',link:path},
];
let checks=0;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
async function session(signedIn,entry=path){
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
  const calls=[],native=[],blocked=[],errors=[];let expected=null,failOnce=false,lastRendered='';
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
        assert.ok(url.search===''||url.search==='?scope=student-conduct','Only page snapshot and native conduct reads are allowed.');
        native.push(url.search);return route.fulfill({json:url.search?evaluation:snapshot});
      }
      if(url.pathname==='/api/affairs-conversations'){
        assert.ok(signedIn);assert.match(req.headers().authorization??'',/^Bearer /u);
        if(req.method()==='GET')return route.fulfill({json:{conversations:[]}});
        assert.equal(req.method(),'POST');const saved=req.postDataJSON();
        return route.fulfill({json:{id:saved.id,title:saved.title,messages:saved.messages,version:saved.version+1,updated_at:new Date().toISOString()}});
      }
      assert.ok(expected);assert.equal(url.pathname,signedIn?'/api/affairs-assistant':'/api/research-assistant');assert.equal(req.method(),'POST');
      const body=req.postDataJSON();assert.equal(body.question,expected.question);assert.equal(body.route,signedIn?entry:login);
      assert.equal(body.stream,true);assert.deepEqual(body.images,[]);assert.ok(Array.isArray(body.history));
      assert.ok(!/PAGE-ONLY-/u.test(JSON.stringify(body)),'Private page rows and identity never become chat context.');
      if(signedIn)assert.match(req.headers().authorization??'',/^Bearer /u);else assert.equal(req.headers().authorization,undefined);
      calls.push({question:body.question,history:body.history,path:url.pathname});
      if(failOnce){failOnce=false;return route.fulfill({status:503,json:{error:'Synthetic conduct lookup unavailable. Please retry.'}});}
      const activity=(expected.tools??[]).map(tool=>steps[tool]);
      const answer=expected.answer+(expected.link?' [Open conduct page]('+expected.link+')':'');
      const result={answer,status:expected.status??'answered',citations:(expected.tools??[]).map(tool=>({chunkId:'account:'+tool,title:steps[tool].label,
        url:tool==='courses'?'/school-affairs/records/subjects':tool==='charges'?'/school-affairs/services/39-1':tool==='dormitoryConduct'?'/school-affairs/services/34-2':path,claim:expected.answer,sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:null})),
        suggestedQuestions:[],grounding:{source:activity.length?'account':'directory',webSearched:false},activity,
        ...(activity.length?{verification:{status:'verified',attempts:1}}:{})};
      return route.fulfill({contentType:'text/event-stream',body:activity.map(step=>'event: progress\ndata: '+JSON.stringify(step)+'\n\n').join('')
        +'event: result\ndata: '+JSON.stringify(result)+'\n\n'});
    }catch(error){errors.push(error);await route.abort('failed').catch(()=>{});}
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error));
  await page.goto(origin+entry,{waitUntil:'domcontentloaded'});
  if(signedIn){if(entry===path)await page.getByRole('cell',{name:pageOnlyComment,exact:true}).waitFor();}
  else{await page.waitForURL(url=>url.pathname==='/school-affairs/login');assert.equal(new URL(page.url()).searchParams.get('next'),path);}
  if(entry!=='/campus-assistant')await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();const panel=page.getByRole('dialog');
  await panel.getByRole('heading',{name:'校園助理 · Assistant'}).waitFor();
  async function ask(value,{fresh=true,fail=false}={}){
    if(fresh&&calls.length){await panel.getByRole('button',{name:'New chat'}).click();if(lastRendered)await panel.getByText(lastRendered,{exact:true}).waitFor({state:'hidden'});}
    expected=value;failOnce=fail;const before=calls.length,reads=native.length;
    await panel.getByPlaceholder('Ask a school question…').fill(value.question);await panel.getByRole('button',{name:'Send',exact:true}).click();
    lastRendered=fail?'Synthetic conduct lookup unavailable. Please retry.':value.answer+(value.link?' Open conduct page':'');
    await panel.getByText(lastRendered,{exact:true}).waitFor();
    assert.equal(calls.length,before+1,'One full-question graph request.');assert.equal(native.length,reads,'Chat never invokes dedicated conduct reads or writes.');
    if(value.link&&!fail)assert.equal(await panel.getByText(lastRendered,{exact:true}).getByRole('link',{name:'Open conduct page'}).getAttribute('href'),value.link);
    if(value.tools?.length&&!fail){const details=panel.locator('details').last();await details.locator('summary').focus();await page.keyboard.press('Enter');
      for(const tool of value.tools)await details.getByText(steps[tool].label,{exact:true}).waitFor();assert.equal(await details.locator('li').count(),value.tools.length);}
    assert.equal(await panel.getByText(pageOnlyComment,{exact:false}).count(),0);
    if(errors.length)throw errors[0];checks++;
  }
  return {context,page,ask,calls,errors,blocked};
}
try{
  // Each independent batch stays below the product's twenty-chat tab limit.
  for(let start=0;start<scenarios.length;start+=10){
    const group=await session(true);for(const item of scenarios.slice(start,start+10))await group.ask(item);
    assert.deepEqual(group.errors,[]);assert.deepEqual(group.blocked,[]);await group.context.close();
  }
  const own=await session(true);
  await own.ask(scenarios[0]);await own.ask({question:'What about their quantity?',answer:'The saved quantity is the literal text 0.',tools:['studentConduct']},{fresh:false});
  assert.ok(own.calls.at(-1).history.some(item=>item.role==='user'&&item.content===scenarios[0].question));
  await own.ask({question:'When is my tuition payment due?',answer:'Your saved fee due date is 30 November.',tools:['charges']});
  await own.ask({question:'When is it?',answer:'The saved fee due date is 30 November.',tools:['charges']},{fresh:false});
  assert.ok(own.calls.at(-1).history.some(item=>item.role==='user'&&item.content==='When is my tuition payment due?'));
  const retry={question:'Check my student conduct records.',answer:'The retry found one saved local conduct row.',tools:['studentConduct']};
  await own.ask(retry,{fail:true});await own.ask(retry,{fresh:false});
  const before=own.calls.length,error=await own.page.evaluate(async()=>{
    const {askSchoolAffairsAssistant}=await import('/src/services/schoolAffairsAssistant.ts');
    try{await askSchoolAffairsAssistant('16000000-0000-4000-8000-000000000099','Show my student conduct records.',[],undefined,[],location.pathname);return null;}
    catch(reason){return reason.message;}});
  assert.match(error??'',/account changed/iu);assert.equal(own.calls.length,before);checks++;
  assert.deepEqual(own.errors,[]);assert.deepEqual(own.blocked,[]);await own.context.close();
  const otherPage=await session(true,'/campus-assistant');await otherPage.ask(scenarios[0]);assert.deepEqual(otherPage.errors,[]);assert.deepEqual(otherPage.blocked,[]);await otherPage.context.close();
  const guest=await session(false);
  await guest.ask({question:'Show my student conduct records.',answer:'Sign in to view your saved student conduct records.',status:'handoff',link:login});
  await guest.ask({question:'Where can I find the student conduct records page?',answer:'The student conduct page is available after sign-in.',link:path});
  assert.deepEqual(guest.errors,[]);assert.deepEqual(guest.blocked,[]);await guest.context.close();
  console.log(JSON.stringify({status:'passed',checks,scope:'local Chromium with synthetic Auth and mocked HTTP',
    fullQuestionsAndHistoryRetained:true,guestNoBearer:true,noDedicatedChatReadsOrWrites:true,liveBackendAcceptance:false}));
}finally{await browser.close();}
