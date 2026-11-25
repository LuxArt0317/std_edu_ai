import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {setTimeout as delay} from 'node:timers/promises';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {discoverClientDispatchSurfaces} from '../evaluation/client-dispatch-inventory.mjs';
import {createProtectedClubAttendanceBrowserTurn,verifyRenderedClubAttendanceBrowserTurn} from '../evaluation/club-attendance-browser-turn.mjs';
import {affairsTestUser,mockAffairsAuth} from './helpers/affairs-auth.mjs';

const site=new URL(process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:5299');
assert.ok(site.protocol==='http:'&&['127.0.0.1','localhost'].includes(site.hostname)&&site.pathname==='/'&&site.origin===site.href.slice(0,-1));
const provider='https://xiftudmvxphxcjtmfmib.supabase.co';
const key='synthetic-club-browser-key';
const observationKey='synthetic-club-chromium-observation-key-not-a-credential';
const preview='https://stdedu-abcd12345-v1-d286.vercel.app',revision='c'.repeat(40);
const attendance={id:'4491ca34-bed2-46e3-9d94-308da319b0c7',title:'Local Robotics Workshop',club_name:'Local Robotics Club',
  starts_at:'2026-11-13T10:10:00Z',location:'Fixture Lab 31',academic_year:115,term:1,recorded_at:'2026-11-14T08:22:00Z'};
const student='a34567bc-d890-421d-bfe7-2c12afb8ee7b';
const charge={id:'1345fd21-3752-4a0f-b591-78ffb93fad4b',student_id:student,label:'Local Fixture Tuition',category:'tuition',amount_due:28000,
  amount_paid:5000,currency:'TWD',source_mode:'verified',due_on:'2027-01-04',occurrence_on:'2026-11-13',contact_unit:null,contact_extension:null,payment_unit:null};
const other={...affairsTestUser,id:'eab7f63d-5c39-4a92-8352-0ca156d5b112',email:'student2.qa@gmail.com',
  identities:affairsTestUser.identities.map(identity=>({...identity,user_id:'eab7f63d-5c39-4a92-8352-0ca156d5b112'}))};
const crossed={...attendance,id:randomUUID(),title:'Crossed Owner Workshop',club_name:'Crossed Owner Club',location:'Crossed Laboratory'};
const crossedStudent=randomUUID(),crossedCharge={...charge,id:randomUUID(),student_id:crossedStudent,label:'Crossed Owner Tuition'};
function independentFixture(ownerId,rows,fee){
  const record=(table,query,rows)=>({ownerId,method:'GET',url:provider+'/rest/v1/'+table+'?'+new URLSearchParams(query),rows});
  return {ownerId,attendance:{userId:ownerId,view:'my-attendance',page:1,eligible:false,hasMore:false,rows},
    tuitionReads:[record('affairs_students',{select:'id,user_id',user_id:'eq.'+ownerId,limit:'1'},[{id:fee.student_id,user_id:ownerId}]),
      record('affairs_charges',{
        select:'id,student_id,label,amount_due,amount_paid,currency,due_on,source_mode,occurrence_on,category,contact_unit,contact_extension,payment_unit',
        student_id:'eq.'+fee.student_id,order:'occurrence_on.desc.nullslast,id.asc',limit:'500',offset:'0',
      },[fee])]};
}
Object.assign(process.env,{VERCEL_ENV:'preview',VERCEL_URL:new URL(preview).host,VERCEL_GIT_COMMIT_SHA:revision,SUPABASE_SERVICE_ROLE_KEY:observationKey});
const cases=(await discoverClientDispatchSurfaces()).questions.filter(row=>row.domain==='club-activity-attendance');
assert.equal(cases.length,5);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const originalFetch=globalThis.fetch;
try{
  for(const testCase of cases){
    const user=testCase.mode==='empty'?other:affairsTestUser;
    const primaryRows=testCase.mode==='multipart'?[attendance,{...attendance,id:randomUUID(),title:'Earlier Workshop',starts_at:'2026-11-12T09:00:00Z'}]:[attendance];
    const readbacks={A:independentFixture(affairsTestUser.id,primaryRows,charge),
      B:independentFixture(other.id,testCase.mode==='empty'?[]:[crossed],crossedCharge)};
    const owner=user===other?readbacks.B:readbacks.A;
    const runId=randomUUID(),turn=createProtectedClubAttendanceBrowserTurn({testCase,key:observationKey,readbacks,
      scope:{origin:preview,sourceRevision:revision,mode:testCase.mode,ownerId:owner.ownerId,runId}});
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
        return testCase.mode==='read-failure'?new Response(null,{status:503}):Response.json(owner.attendance);
      }
      assert.equal(init.method,'GET');
      const evidence=owner.tuitionReads.find(item=>item.url===target.href);
      assert.ok(evidence);
      reads.push(target.pathname.endsWith('/affairs_students')?'student':'tuition');
      return Response.json(evidence.rows);
    };
    const handler=createAffairsAssistantHandler({verifyToken:async token=>{
      assert.equal(JSON.parse(Buffer.from(token.split('.')[1],'base64url')).sub,user.id);assert.match(token,/\.qa-only-signature$/u);
      return {user:{id:user.id,email:user===other?'evaluation.other.'+runId+'@example.invalid':'evaluation.student@example.invalid',
        user_metadata:{assistant_evaluation_run:runId}},token,key,url:provider};
    },loadSnapshot:()=>assert.fail('Unexpected full account query'),answerAccount:()=>assert.fail('Unexpected model call'),publicResearch:()=>assert.fail('Unexpected public search')});
    let reply,expectedDisplay;
    await context.route('**/api/**',async route=>{
      try{
        const request=route.request(),url=new URL(request.url());
        assert.equal(url.origin,site.origin);
        const authorization=request.headers().authorization;
        assert.match(authorization??'',/^Bearer /u);
        if(url.pathname==='/api/affairs-data'){
          assert.equal(request.method(),'GET');assert.equal(url.searchParams.get('scope'),'club-student');
          assert.equal(url.searchParams.get('view'),'my-attendance');assert.equal(url.searchParams.get('page'),'1');
          return route.fulfill({json:owner.attendance});
        }
        if(url.pathname==='/api/affairs-conversations'){
          if(request.method()==='GET'){
            const id=url.searchParams.get('id');
            if(id){assert.ok(saved.has(id));restoreRequests.push(id);turn.receiveRestore(saved.get(id));}
            return route.fulfill({json:id?saved.get(id):{conversations:[...saved.values()].map(({messages:_messages,...entry})=>entry)}});
          }
          assert.equal(request.method(),'POST');
          const payload=request.postDataJSON(),{id,title,messages,version}=payload;
          assert.equal(version,saved.get(id)?.version??0);
          const entry={id,title,messages,version:version+1,updated_at:new Date().toISOString()};
          expectedDisplay=turn.save({payload,requestSequence:1});
          const row={...entry,created_at:entry.updated_at};
          turn.receiveSave(row);
          saved.set(id,entry);return route.fulfill({json:row});
        }
        assert.equal(url.pathname,'/api/affairs-assistant');assert.equal(request.method(),'POST');
        const body=request.postDataJSON();
        assert.deepEqual(body,{question:testCase.question,route:testCase.route,history:[],images:[],stream:true});
        requested.push(body);
        let status,output='',correlationId;
        const sink={setHeader(name,value){if(name==='X-Assistant-Request-Id')correlationId=value;},status(code){status=code;return sink;},
          write(chunk){output+=chunk;},end(){},json(value){assert.fail(JSON.stringify(value));}};
        const probe=turn.request({payload:body,frameUrl:preview+testCase.route,ownerId:owner.ownerId});
        await handler({method:'POST',headers:{authorization,host:new URL(preview).host},body:probe},sink);
        assert.equal(status,200);
        const packet=output.split('\n\n').find(value=>value.startsWith('event: result\n'));
        assert.ok(packet);reply=JSON.parse(packet.slice('event: result\ndata: '.length));
        const approved=turn.receive({bytes:Buffer.from(output),correlationId});
        return route.fulfill({contentType:'text/event-stream',body:approved.body});
      }catch(error){errors.push(error);return route.abort();}
    });
    const page=await context.newPage();page.setDefaultTimeout(12000);
    await page.goto(site.origin+testCase.route,{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
    const dialog=page.getByRole('dialog');
    await dialog.getByPlaceholder('Ask a school question…').fill(testCase.question);
    await dialog.getByRole('button',{name:'Send',exact:true}).click();
    const expected=testCase.mode==='foreign'?/saved for your own account/u:testCase.mode==='empty'?/No saved attendance entries were returned on page 1/u
      :testCase.mode==='read-failure'?/could not verify this answer/u:testCase.mode==='multipart'?/Saved attendance entries on page 1: 2/u:/Local Robotics Workshop/u;
    await dialog.getByText(expected).first().waitFor();
    if(testCase.mode==='multipart')await dialog.getByText('NT$23,000',{exact:true}).first().waitFor();
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
    const [{id,title}]=saved.values();
    await dialog.getByText('Conversation saved to your private account.',{exact:true}).waitFor();
    await verifyRenderedClubAttendanceBrowserTurn({dialog,expected:expectedDisplay});
    await page.evaluate(()=>sessionStorage.clear());
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
    const conversations=dialog.getByRole('combobox',{name:'Conversations'});
    await conversations.getByRole('option',{name:title,exact:true}).waitFor({state:'attached'});
    await conversations.selectOption(id);
    await verifyRenderedClubAttendanceBrowserTurn({dialog,expected:expectedDisplay});
    assert.deepEqual(restoreRequests,[id]);assert.equal(requested.length,1);
    assert.equal(turn.confirmUnchanged(structuredClone(readbacks)).caseId,testCase.id);
    await context.close();
  }
  console.log(JSON.stringify({status:'passed',renderedCases:cases.length,actualLangGraphAndSse:true,observerVerified:true,
    autosaveObserved:true,restoredActivity:true,controlledTransport:true,liveAcceptance:false}));
}finally{globalThis.fetch=originalFetch;await browser.close();}
