import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {setTimeout as delay} from 'node:timers/promises';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {discoverClientDispatchSurfaces} from '../evaluation/client-dispatch-inventory.mjs';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';

const site=new URL(process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5299');
assert.ok(site.protocol==='http:'&&['127.0.0.1','localhost'].includes(site.hostname)&&site.pathname==='/'&&site.origin===site.href.slice(0,-1));
const provider='https://xiftudmvxphxcjtmfmib.supabase.co';
const key='synthetic-club-browser-key';
const attendance={id:'4491ca34-bed2-46e3-9d94-308da319b0c7',title:'Local Robotics Workshop',club_name:'Local Robotics Club',
  starts_at:'2026-11-13T10:10:00Z',location:'Fixture Lab 31',academic_year:115,term:1,recorded_at:'2026-11-14T08:22:00Z'};
const student='a34567bc-d890-421d-bfe7-2c12afb8ee7b';
const charge={id:'1345fd21-3752-4a0f-b591-78ffb93fad4b',student_id:student,label:'Local Fixture Tuition',category:'tuition',amount_due:28000,
  amount_paid:5000,currency:'TWD',source_mode:'verified',due_on:'2027-01-04',occurrence_on:'2026-11-13',contact_unit:null,contact_extension:null,payment_unit:null};
const ownRows=owner=>({userId:owner,view:'my-attendance',page:1,eligible:false,hasMore:false,rows:owner===affairsTestUser.id?[attendance]:[]});
const other={...affairsTestUser,id:'eab7f63d-5c39-4a92-8352-0ca156d5b112',email:'student2.qa@gmail.com',
  identities:affairsTestUser.identities.map(identity=>({...identity,user_id:'eab7f63d-5c39-4a92-8352-0ca156d5b112'}))};
const cases=(await discoverClientDispatchSurfaces()).questions.filter(row=>row.domain==='club-activity-attendance');
assert.equal(cases.length,5);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const originalFetch=globalThis.fetch;
try{
  for(const testCase of cases){
    const user=testCase.mode==='empty'?other:affairsTestUser;
    const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      return url.origin===site.origin&&!url.pathname.startsWith('/api/')?route.continue():route.abort('blockedbyclient');
    });
    await mockAffairsAuth(context,{user});
    const reads=[],requested=[],saved=new Map(),restoreRequests=[],errors=[];
    globalThis.fetch=async(input,init)=>{
      const target=new URL(input),headers=new Headers(init.headers);
      assert.equal(target.origin,provider);assert.equal(init.redirect,'error');assert.equal(headers.get('apikey'),key);
      assert.equal(JSON.parse(Buffer.from(headers.get('authorization').split('.')[1],'base64url')).sub,user.id);
      if(target.pathname==='/rest/v1/rpc/affairs_read_club_student'){
        assert.equal(init.method,'POST');assert.deepEqual(JSON.parse(init.body),{p_view:'my-attendance',p_search:'',p_page:1});
        reads.push('attendance');
        return testCase.mode==='read-failure'?new Response(null,{status:503}):Response.json(ownRows(user.id));
      }
      assert.equal(init.method,'GET');
      if(target.pathname==='/rest/v1/affairs_students'){
        assert.equal(target.searchParams.get('user_id'),'eq.'+user.id);
        reads.push('student');return Response.json([{id:student,user_id:user.id}]);
      }
      assert.equal(target.pathname,'/rest/v1/affairs_charges');assert.equal(target.searchParams.get('student_id'),'eq.'+student);
      reads.push('tuition');return Response.json([charge]);
    };
    const handler=createAffairsAssistantHandler({verifyToken:async token=>{
      assert.equal(JSON.parse(Buffer.from(token.split('.')[1],'base64url')).sub,user.id);assert.match(token,/\.qa-only-signature$/u);
      return {user:{id:user.id},token,key,url:provider};
    },loadSnapshot:()=>assert.fail('Unexpected full account query'),answerAccount:()=>assert.fail('Unexpected model call'),publicResearch:()=>assert.fail('Unexpected public search')});
    let reply;
    await context.route('**/api/**',async route=>{
      try{
        const request=route.request(),url=new URL(request.url());
        assert.equal(url.origin,site.origin);
        const authorization=request.headers().authorization;
        assert.match(authorization??'',/^Bearer /u);
        if(url.pathname==='/api/affairs-data'){
          assert.equal(request.method(),'GET');assert.equal(url.searchParams.get('scope'),'club-student');
          assert.equal(url.searchParams.get('view'),'my-attendance');assert.equal(url.searchParams.get('page'),'1');
          return route.fulfill({json:ownRows(user.id)});
        }
        if(url.pathname==='/api/affairs-conversations'){
          if(request.method()==='GET'){
            const id=url.searchParams.get('id');
            if(id){assert.ok(saved.has(id));restoreRequests.push(id);}
            return route.fulfill({json:id?saved.get(id):{conversations:[...saved.values()].map(({messages:_messages,...entry})=>entry)}});
          }
          assert.equal(request.method(),'POST');
          const {id,title,messages,version}=request.postDataJSON();
          assert.equal(version,saved.get(id)?.version??0);
          const entry={id,title,messages,version:version+1,updated_at:new Date().toISOString()};
          saved.set(id,entry);return route.fulfill({json:entry});
        }
        assert.equal(url.pathname,'/api/affairs-assistant');assert.equal(request.method(),'POST');
        const body=request.postDataJSON();
        assert.deepEqual(body,{question:testCase.question,route:testCase.route,history:[],images:[],stream:true});
        requested.push(body);
        let status,output='';
        const sink={setHeader(){},status(code){status=code;return sink;},write(chunk){output+=chunk;},end(){},json(value){assert.fail(JSON.stringify(value));}};
        await handler({method:'POST',headers:{authorization},body},sink);
        assert.equal(status,200);
        const packet=output.split('\n\n').find(value=>value.startsWith('event: result\n'));
        assert.ok(packet);reply=JSON.parse(packet.slice('event: result\ndata: '.length));
        return route.fulfill({contentType:'text/event-stream',body:output});
      }catch(error){errors.push(error);return route.abort();}
    });
    const page=await context.newPage();page.setDefaultTimeout(12000);
    await page.goto(site.origin+testCase.route,{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
    const dialog=page.getByRole('dialog');
    await dialog.getByPlaceholder('Ask a school question…').fill(testCase.question);
    await dialog.getByRole('button',{name:'Send',exact:true}).click();
    const expected=testCase.mode==='foreign'?/saved for your own account/u:testCase.mode==='empty'?/No saved attendance entries were returned on page 1/u
      :testCase.mode==='read-failure'?/could not verify this answer/u:/Local Robotics Workshop/u;
    await dialog.getByText(expected).first().waitFor();
    if(testCase.mode==='multipart')await dialog.getByText('NT$23,000',{exact:true}).first().waitFor();
    if(testCase.mode!=='foreign'){
      const activity=dialog.locator('details').last();
      await activity.locator('summary').click();
      await activity.getByText('Checked club activity attendance',{exact:true}).first().waitFor();
      if(testCase.mode==='multipart')await activity.getByText('Checked saved tuition balance',{exact:true}).waitFor();
    }
    const until=Date.now()+5_000;
    while(!saved.size&&!errors.length&&Date.now()<until)await delay(60);
    assert.equal(requested.length,1);assert.deepEqual(errors,[]);
    assert.deepEqual([...reads].sort(),testCase.mode==='foreign'?[]:testCase.mode==='read-failure'?['attendance','attendance']
      :testCase.mode==='multipart'?['attendance','student','tuition']:['attendance']);
    assert.equal(reply.proposedAction,undefined);
    assert.equal(saved.size,1,'One conversation autosave is required for '+testCase.id);
    const stored=saved.values().next().value.messages.at(-1);
    assert.equal(stored.role,'assistant');assert.equal(stored.content,reply.answer);
    assert.deepEqual(stored.result.verification,reply.verification&&{status:reply.verification.status,attempts:reply.verification.attempts});
    if(testCase.mode==='multipart'){
      const [{id,title}]=saved.values();
      await dialog.getByText('Conversation saved to your private account.',{exact:true}).waitFor();
      await page.evaluate(()=>sessionStorage.clear());
      await page.reload({waitUntil:'domcontentloaded'});
      await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
      const conversations=dialog.getByRole('combobox',{name:'Conversations'});
      await conversations.getByRole('option',{name:title,exact:true}).waitFor({state:'attached'});
      await conversations.selectOption(id);
      await dialog.getByText('NT$23,000',{exact:true}).first().waitFor();
      await dialog.locator('details').last().locator('summary').click();
      await dialog.locator('details').last().getByText('Checked saved tuition balance',{exact:true}).waitFor();
      assert.deepEqual(restoreRequests,[id]);assert.equal(requested.length,1);
    }
    await context.close();
  }
  console.log(JSON.stringify({status:'passed',renderedCases:cases.length,actualLangGraphAndSse:true,autosaveObserved:true,restoredActivity:true,
    controlledTransport:true,liveAcceptance:false}));
}finally{globalThis.fetch=originalFetch;await browser.close();}
