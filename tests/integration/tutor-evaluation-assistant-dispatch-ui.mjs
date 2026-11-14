import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {affairsTestUser as user,mockAffairsAuth} from './helpers/affairs-auth.mjs';

// Actual local rendering and client transport, with synthetic Auth and mocked
// server replies. This does not evaluate backend reads, the model or live RLS.
const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5299',base=new URL(origin);
assert.ok(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)&&base.pathname==='/'
  &&!base.username&&!base.password&&!base.search&&!base.hash,'Only a localhost preview is allowed.');
const path='/school-affairs/services/28-1',login='/school-affairs/login?next='+encodeURIComponent(path);
const pageOnlyComment='PAGE-ONLY-TUTOR-COMMENT-2718';
const evaluation={userId:user.id,student:null,evaluation:{ratings:[5,4,3,2,1,5,4,3,2,1],comment:pageOnlyComment,submittedAt:'2026-11-15T00:00:00+00:00'}};
const steps={tutorEvaluation:{kind:'account-read:tutorEvaluation:1',label:'Checked saved tutor evaluation',detail:'Only requested questionnaire fields.',status:'complete'},
  charges:{kind:'account-read:charges:1',label:'Checked saved fee balance',detail:'Checked the saved local fee ledger.',status:'complete'},
  courses:{kind:'account-read:courses:1',label:'Checked saved class timetable',detail:'Checked the saved course schedule.',status:'complete'},
  serviceRecords:{kind:'account-read:serviceRecords:1',label:'Checked private tracking notes',detail:'Local notes are separate from questionnaire submission.',status:'complete'}};
const scenarios=[
  {id:'status',question:'Did I submit my tutor evaluation questionnaire?',answer:'A tutor evaluation is saved in your local account.',tools:['tutorEvaluation'],link:path},
  {id:'time',question:'When did I submit my tutor evaluation?',answer:'The saved submission time is 15 November 2026 at 08:00 in Taipei.',tools:['tutorEvaluation']},
  {id:'ratings',question:'What ratings did I save for questions 3 and 8 in my tutor evaluation?',answer:'Question 3: 3. Question 8: 3.',tools:['tutorEvaluation']},
  {id:'comment',question:'What was my saved comment on the tutor evaluation?',answer:'Your selected comment says: The tutor check-in was useful.',tools:['tutorEvaluation']},
  {id:'no-comment',question:'Show my tutor evaluation ratings without the comment.',answer:'The requested ten saved ratings are shown without the comment.',tools:['tutorEvaluation']},
  {id:'tracking',question:'Show my tutor evaluation tracking notes.',answer:'Your local tracker says: Bring the reminder card. This is not questionnaire submission proof.',tools:['serviceRecords']},
  {id:'fee-after',question:'Show my tutor evaluation status and my tuition balance.',answer:'A tutor evaluation is saved. The saved tuition balance is 23000.',tools:['tutorEvaluation','charges']},
  {id:'fee-before',question:'Show my tuition balance. Also show my tutor evaluation status.',answer:'The saved tuition balance is 23000. A tutor evaluation is saved.',tools:['charges','tutorEvaluation']},
  {id:'excluded',question:'Show my tuition balance and do not show my tutor evaluation.',answer:'The saved tuition balance is 23000.',tools:['charges']},
  {id:'excluded-before',question:'Do not show my tutor evaluation. Show my tuition balance.',answer:'The saved tuition balance is 23000.',tools:['charges']},
  {id:'irrelevant',question:'What is my next class?',answer:'Your next saved class is QA Databases at 13:10 in R301.',tools:['courses']},
  {id:'foreign',question:'Does Alice have a saved tutor evaluation?',answer:'I cannot read another student’s tutor evaluation.'},
  {id:'foreign-relative',question:'Show the tutor evaluation of my mother.',answer:'I cannot read another student’s tutor evaluation.'},
  {id:'foreign-ratings',question:'Which tutor evaluation ratings belong to Alice?',answer:'I cannot read another student’s tutor evaluation.'},
  {id:'permission',question:'Who can read my tutor evaluation comment?',answer:'The saved questionnaire does not establish who receives or reads the comment.'},
  {id:'delivery',question:'Show my tutor evaluation status and did it reach my tutor?',answer:'A tutor evaluation is saved locally. Delivery to your tutor is not established.',tools:['tutorEvaluation']},
  {id:'public',question:'Where can I find the tutor evaluation questionnaire?',answer:'Open the tutor evaluation form on stu.best.',link:path},
  {id:'write',question:'Submit my tutor evaluation.',answer:'No questionnaire was submitted. Review the form before submitting it yourself.',link:path},
];
let checks=0;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
async function session(signedIn,entry=path){
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
        assert.deepEqual([...url.searchParams.entries()].sort(),[['scope','tutor-evaluation']],
          'Only the page may read the tutor DTO; no answer, write or arbitrary owner query.');
        native.push(url.search);return route.fulfill({json:evaluation});
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
      assert.ok(!JSON.stringify(body).includes(pageOnlyComment),'Private page rows never become chat context.');
      if(signedIn)assert.match(req.headers().authorization??'',/^Bearer /u);else assert.equal(req.headers().authorization,undefined);
      calls.push({question:body.question,history:body.history,path:url.pathname});
      if(failOnce){failOnce=false;return route.fulfill({status:503,json:{error:'Synthetic tutor lookup unavailable. Please retry.'}});}
      const activity=(expected.tools??[]).map(tool=>steps[tool]);
      const answer=expected.answer+(expected.link?' [Open tutor form]('+expected.link+')':'');
      const result={answer,status:expected.status??'answered',citations:(expected.tools??[]).map(tool=>({chunkId:'account:'+tool,title:steps[tool].label,
        url:tool==='courses'?'/school-affairs/records/subjects':tool==='charges'?'/school-affairs/services/39-1':path,claim:expected.answer,sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:null})),
        suggestedQuestions:[],grounding:{source:activity.length?'account':'directory',webSearched:false},activity,
        ...(activity.length?{verification:{status:'verified',attempts:1}}:{})};
      return route.fulfill({contentType:'text/event-stream',body:activity.map(step=>'event: progress\ndata: '+JSON.stringify(step)+'\n\n').join('')
        +'event: result\ndata: '+JSON.stringify(result)+'\n\n'});
    }catch(error){errors.push(error);await route.abort('failed').catch(()=>{});}
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error));
  await page.goto(origin+entry,{waitUntil:'domcontentloaded'});
  if(signedIn){if(entry===path)await page.getByRole('status').getByText('已儲存至 stu.best。',{exact:true}).waitFor();}
  else{await page.waitForURL(url=>url.pathname==='/school-affairs/login');assert.equal(new URL(page.url()).searchParams.get('next'),path);}
  if(entry!=='/campus-assistant')await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();const panel=page.getByRole('dialog');
  await panel.getByRole('heading',{name:'校園助理 · Assistant'}).waitFor();
  async function ask(value,{fresh=true,fail=false}={}){
    if(fresh&&calls.length)await panel.getByRole('button',{name:'New chat'}).click();
    expected=value;failOnce=fail;const before=calls.length,reads=native.length;
    await panel.getByPlaceholder('Ask a school question…').fill(value.question);await panel.getByRole('button',{name:'Send',exact:true}).click();
    await panel.getByText(fail?'Synthetic tutor lookup unavailable. Please retry.':value.answer+(value.link?' Open tutor form':''),{exact:true}).waitFor();
    assert.equal(calls.length,before+1,'One full-question graph request.');assert.equal(native.length,reads,'Chat never invokes dedicated tutor reads or writes.');
    if(value.link&&!fail)assert.equal(await panel.getByRole('link',{name:'Open tutor form'}).getAttribute('href'),value.link);
    if(value.tools?.length&&!fail){const details=panel.locator('details').last();await details.locator('summary').focus();await page.keyboard.press('Enter');
      for(const tool of value.tools)await details.getByText(steps[tool].label,{exact:true}).waitFor();assert.equal(await details.locator('li').count(),value.tools.length);}
    assert.equal(await panel.getByText(pageOnlyComment,{exact:false}).count(),0);
    if(errors.length)throw errors[0];checks++;
  }
  return {context,page,ask,calls,errors,blocked};
}
try{
  const own=await session(true);for(const item of scenarios)await own.ask(item);
  await own.ask(scenarios[3]);await own.ask({question:'What about its status?',answer:'The tutor evaluation is saved locally.',tools:['tutorEvaluation']},{fresh:false});
  assert.ok(own.calls.at(-1).history.some(item=>item.role==='user'&&item.content===scenarios[3].question));
  await own.ask({question:'When is my tuition payment due?',answer:'Your saved fee due date is 30 November.',tools:['charges']});
  await own.ask({question:'When is it?',answer:'The saved fee due date is 30 November.',tools:['charges']},{fresh:false});
  assert.ok(own.calls.at(-1).history.some(item=>item.role==='user'&&item.content==='When is my tuition payment due?'));
  const retry={question:'Check my tutor evaluation status.',answer:'The retry found a saved questionnaire.',tools:['tutorEvaluation']};
  await own.ask(retry,{fail:true});await own.ask(retry,{fresh:false});
  const before=own.calls.length,error=await own.page.evaluate(async()=>{
    const {askSchoolAffairsAssistant}=await import('/src/services/schoolAffairsAssistant.ts');
    try{await askSchoolAffairsAssistant('16000000-0000-4000-8000-000000000099','Show my tutor evaluation status.',[],undefined,[],location.pathname);return null;}
    catch(reason){return reason.message;}});
  assert.match(error??'',/account changed/iu);assert.equal(own.calls.length,before);checks++;
  assert.deepEqual(own.errors,[]);assert.deepEqual(own.blocked,[]);await own.context.close();
  const otherPage=await session(true,'/campus-assistant');await otherPage.ask(scenarios[0]);assert.deepEqual(otherPage.errors,[]);assert.deepEqual(otherPage.blocked,[]);await otherPage.context.close();
  const guest=await session(false);
  await guest.ask({question:'Show my tutor evaluation comment.',answer:'Sign in to view your saved tutor evaluation.',status:'handoff',link:login});
  await guest.ask({question:'Where can I find the tutor evaluation questionnaire?',answer:'The tutor evaluation form is available after sign-in.',link:path});
  assert.deepEqual(guest.errors,[]);assert.deepEqual(guest.blocked,[]);await guest.context.close();
  console.log(JSON.stringify({status:'passed',checks,scope:'local Chromium with synthetic Auth and mocked HTTP',
    fullQuestionsAndHistoryRetained:true,guestNoBearer:true,noDedicatedChatReadsOrWrites:true,liveBackendAcceptance:false}));
}finally{await browser.close();}
