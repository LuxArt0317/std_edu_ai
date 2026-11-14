import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {affairsTestUser as user, mockAffairsAuth} from './helpers/affairs-auth.mjs';

// Local Chromium transport/render checks, not a model, OAuth, RLS or live-data
// acceptance suite. Every API and provider request is intercepted below.
const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5296';
const parsed=new URL(origin);
assert.ok(parsed.protocol==='http:'&&['127.0.0.1','localhost'].includes(parsed.hostname)
  &&parsed.pathname==='/'&&!parsed.search&&!parsed.hash&&!parsed.username&&!parsed.password,'This mock suite is localhost-only.');
const healthPath='/school-affairs/services/36-1';
const returnPath='/school-affairs/login?next='+encodeURIComponent(healthPath);
const nativeRow={id:'50000000-0000-4000-8000-000000000001',examination_code:'HEALTH-UI-01',
  student_number:'PRIVATE-STUDENT-NUMBER',student_name:'PRIVATE STUDENT NAME',class_label:'PRIVATE CLASS',report_available:false};
const step={kind:'account-read:healthExaminations:1',label:'Checking health examination metadata',
  detail:'Read saved examination codes and report availability.',status:'complete'};
const citation={chunkId:'account:healthExaminations',url:healthPath,title:'Saved health examination metadata',
  claim:'HEALTH-UI-01 has no available report.',sourceName:'School Affairs',locator:null,effectiveAt:null,reviewedAt:null};
const questions=[
  {id:'metadata',question:'Show my health examination records.',answer:'HEALTH-UI-01: report available: no. [Open saved metadata]('+healthPath+')',activity:true},
  {id:'modern',question:'Show my health records.',answer:'Saved health metadata is available on this account.',activity:true},
  {id:'balance-after',question:'Show my health examination records. Also show my tuition balance.',answer:'HEALTH-UI-01: report available: no. Your separately saved tuition balance is NT$23,000.',activity:true},
  {id:'balance-before',question:'Show my tuition balance. Also show my health examination records.',answer:'Your separately saved tuition balance is NT$23,000. HEALTH-UI-01: report available: no.',activity:true},
  {id:'next-class',question:'What is my next class? Also show my health examination records.',answer:'Your next saved class is Database Design at 10:10. HEALTH-UI-01: report available: no.',activity:true},
  {id:'excluded-health',question:'Show my tuition balance. Never show my health examination reports.',answer:'Your saved tuition balance is NT$23,000.',activity:false},
  {id:'foreign',question:'Is the health report available for Alice?',answer:'I can only read the signed-in account. I cannot access Alice’s health records.',activity:false},
  {id:'page',question:'On page 2, show my health records.',answer:'Page 2 is empty; the saved total is 2. This does not mean your whole history is empty.',activity:true},
  {id:'public-guide',question:'Where can I view my health examination report?',answer:'[Open health examination records]('+healthPath+'). This is a navigation link, not a record lookup.',activity:false},
  {id:'public-card',question:'Where can I find the student health card?',answer:'The university student health card is a separate university service.',activity:false},
  {id:'guide-mixed',question:'Where can I view my health examination report? Also show my tuition balance.',answer:'[Open health examination records]('+healthPath+'). Your separate tuition balance is NT$23,000.',activity:false},
];
const browser=await chromium.launch({headless:true,
  executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const allErrors=[];
let checks=0;

async function setup(signedIn){
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
  const calls=[],nativeCalls=[],blocked=[],routeErrors=[];
  let expected=null,failOnce=false;
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===parsed.origin&&!url.pathname.startsWith('/api/'))return route.continue();
    blocked.push(url.origin+url.pathname);
    return route.abort('blockedbyclient');
  });
  const authCalls=await mockAffairsAuth(context,{signedIn});
  await context.route('**/api/**',async route=>{
    try{
      const request=route.request(),url=new URL(request.url());
      assert.equal(url.origin,parsed.origin);
      if(url.pathname==='/api/affairs-conversations'){
        assert.ok(signedIn);
        assert.match(request.headers().authorization??'',/^Bearer /u);
        if(request.method()==='GET')return route.fulfill({json:{conversations:[]}});
        assert.equal(request.method(),'POST');
        const value=request.postDataJSON();
        return route.fulfill({json:{id:value.id,title:value.title,messages:value.messages,
          version:value.version+1,updated_at:new Date().toISOString()}});
      }
      if(url.pathname==='/api/affairs-data'){
        assert.ok(signedIn);
        assert.equal(request.method(),'GET');
        assert.equal(url.searchParams.get('scope'),'health-examinations');
        assert.deepEqual([...url.searchParams.keys()].sort(),['page','scope']);
        assert.equal(url.searchParams.has('report'),false,'No private report authorization in assistant checks.');
        nativeCalls.push(url.search);
        return route.fulfill({json:{userId:user.id,total:1,rows:[nativeRow]}});
      }
      assert.ok(expected,'An assistant request must match an independently selected UI scenario.');
      assert.equal(url.pathname,signedIn?'/api/affairs-assistant':'/api/research-assistant');
      assert.equal(request.method(),'POST');
      const body=request.postDataJSON();
      assert.equal(body.question,expected.question,'The complete multipart question survives dispatch.');
      assert.equal(body.route,signedIn?healthPath:returnPath);
      assert.equal(body.stream,true);
      assert.deepEqual(body.images,[]);
      assert.ok(Array.isArray(body.history));
      assert.doesNotMatch(JSON.stringify(body),/PRIVATE-STUDENT-NUMBER|PRIVATE STUDENT NAME|PRIVATE CLASS/u);
      if(signedIn)assert.match(request.headers().authorization??'',/^Bearer /u);
      else assert.equal(request.headers().authorization,undefined,'Guest requests carry no School Affairs token.');
      calls.push({id:expected.id,path:url.pathname,question:body.question,history:body.history});
      if(failOnce){failOnce=false;return route.fulfill({status:503,json:{error:'Synthetic metadata service unavailable. Please try again.'}});}
      const activity=expected.activity?[step]:[];
      const result={answer:expected.answer,status:expected.status??'answered',citations:expected.activity?[citation]:[],
        suggestedQuestions:[],activity,grounding:{source:expected.activity?'account':'directory',webSearched:false},
        ...(expected.activity?{verification:{status:'verified',attempts:1}}:{})};
      const progress=expected.activity?'event: progress\ndata: '+JSON.stringify(step)+'\n\n':'';
      return route.fulfill({contentType:'text/event-stream',body:progress+'event: result\ndata: '+JSON.stringify(result)+'\n\n'});
    }catch(error){routeErrors.push(error);await route.abort('failed').catch(()=>{});}
  });
  const page=await context.newPage();
  page.on('pageerror',error=>allErrors.push(error.message));
  page.setDefaultTimeout(12000);
  await page.goto(origin+healthPath,{waitUntil:'domcontentloaded'});
  if(signedIn)await page.getByRole('table').getByText('HEALTH-UI-01',{exact:true}).waitFor();
  else{
    await page.waitForURL(url=>url.pathname==='/school-affairs/login');
    assert.equal(new URL(page.url()).searchParams.get('next'),healthPath);
  }
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  const panel=page.getByRole('dialog');
  await panel.getByRole('heading',{name:'校園助理 · Assistant'}).waitFor();
  const field=panel.getByPlaceholder('Ask a school question…'),send=panel.getByRole('button',{name:'Send',exact:true});
  async function ask(value,{fresh=true,failure=false}={}){
    if(fresh&&calls.length)await panel.getByRole('button',{name:'New chat'}).click();
    expected=value;failOnce=failure;
    const before=calls.length,reads=nativeCalls.length;
    await field.fill(value.question);await send.click();
    await panel.getByText(failure?'Synthetic metadata service unavailable. Please try again.':value.answer.replace(/\[([^\]]+)\]\([^)]*\)/gu,'$1'),{exact:true}).waitFor();
    assert.equal(calls.length,before+1,'Exactly one assistant transport, not an earlier direct guide.');
    assert.equal(nativeCalls.length,reads,'Asking chat does not directly read health rows or issue a report.');
    assert.equal(await send.isEnabled(),false,'An empty composer stays disabled after completion.');
    if(value.activity&&!failure){
      const detail=panel.locator('details').last();
      await detail.locator('summary').focus();await page.keyboard.press('Enter');
      await detail.getByText(step.label,{exact:true}).waitFor();
      assert.equal(await detail.locator('li').count(),1);
    }
    assert.equal(await panel.getByText(/PRIVATE-STUDENT-NUMBER|PRIVATE STUDENT NAME|PRIVATE CLASS/u).count(),0);
    if(routeErrors.length)throw routeErrors[0];
    checks++;
  }
  return {context,page,panel,calls,authCalls,blocked,routeErrors,ask};
}

try{
  const own=await setup(true);
  for(const question of questions)await own.ask(question);
  await own.ask(questions[0]);
  await own.ask({id:'followup',question:'Are they available?',answer:'The saved report availability remains no.',activity:true},{fresh:false});
  assert.ok(own.calls.at(-1).history.some(item=>item.role==='user'&&item.content===questions[0].question),'Follow-up history is retained.');
  const retry={id:'retry',question:'Check my saved health records.',answer:'The retry returned saved metadata successfully.',activity:true};
  await own.ask(retry,{failure:true});await own.ask(retry,{fresh:false});
  // Execute the actual browser module’s account-change guard without making a
  // provider request. The stale expected user must never reach the endpoint.
  const before=own.calls.length;
  const switched=await own.page.evaluate(async()=>{
    const {askSchoolAffairsAssistant}=await import('/src/services/schoolAffairsAssistant.ts');
    try{await askSchoolAffairsAssistant('50000000-0000-4000-8000-000000000099','Show my health records.',[],undefined,[],location.pathname);return null;}
    catch(error){return error.message;}
  });
  assert.match(switched??'',/account changed/iu);assert.equal(own.calls.length,before);checks++;
  assert.deepEqual(own.blocked,[]);assert.deepEqual(own.routeErrors,[]);
  await own.context.close();

  const guest=await setup(false);
  for(const question of ['Show my health records.','Where can I view my health examination report?']){
    await guest.ask({id:'guest',question,answer:'[Sign in to view health examination records]('+returnPath+')',status:'handoff',activity:false});
    assert.equal(await guest.panel.getByRole('link',{name:'Sign in to view health examination records'}).getAttribute('href'),returnPath);
  }
  assert.deepEqual(guest.blocked,[]);assert.deepEqual(guest.routeErrors,[]);
  await guest.context.close();
  assert.deepEqual(allErrors,[]);
  console.log(JSON.stringify({status:'passed',checks,scope:'local Chromium with synthetic Auth and mocked HTTP responses',
    fullQuestionsRetained:true,accountGuard:true,guestNoBearer:true,privateFilesRequested:false,liveBackendAcceptance:false}));
}finally{await browser.close();}
