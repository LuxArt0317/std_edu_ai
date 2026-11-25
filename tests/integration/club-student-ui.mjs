import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { affairsTestUser as user,mockAffairsAuth } from './helpers/affairs-auth.mjs';
import { clubStudentMenu,clubStudentScope } from '../../server/clubStudentContract.js';
import { clubPath } from '../../server/clubServicesContract.js';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {discoverClientDispatchSurfaces} from '../evaluation/client-dispatch-inventory.mjs';

const origin=process.env.PUBLIC_SITE_ORIGIN??'http://127.0.0.1:54635';
async function pin(){
  if(origin!=='https://stu.best')return;
  assert.match(process.env.EXPECTED_RELEASE_REVISION??'',/^[a-f0-9]{40}$/u);
  const response=await fetch(origin+'/release.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  assert.equal((await response.json()).revision,process.env.EXPECTED_RELEASE_REVISION);
}
await pin();
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
  const context=await browser.newContext({viewport:{width:1280,height:820},serviceWorkers:'block'});
  await mockAffairsAuth(context);
  const club={id:'bc198d1b-b888-441f-8150-cbc7395a3c80',name:'QA Robotics'};
  const id='c929fde5-7740-4ba4-b1f4-6c102111bd0e';
  const period={academic_year:115,term:1};
  const activity={id,title:'QA Campus Workshop',club_name:club.name,location:'QA Campus Lab',starts_at:'2026-11-13T02:00:00Z',
    ends_at:'2026-11-13T03:00:00Z',category:'lecture',description:'QA course materials'};
  const submitted={id,name:'QA New Club',description:'A QA proposal for a new local club.',status:'submitted',version:1,
    review_note:'',club_id:null,student_name:null,updated_at:'2026-11-13T02:00:00Z'};
  let application=null,allowManager=false,membershipReaderUnavailable=false;
  const writes=[],assistantReads=[],saved=new Map();
  const membershipCases=(await discoverClientDispatchSurfaces()).questions.filter(row=>row.domain==='club-student');
  const [compound,foreign,outage]=['multipart','foreign','read-failure'].map(mode=>membershipCases.find(row=>row.mode===mode));
  assert.ok(compound&&foreign&&outage);
  const membershipRpc='/rest/v1/rpc/affairs_read_club_student';
  const membership={...club,...period,active:true,role_label:'QA Member'};
  const provider='https://xiftudmvxphxcjtmfmib.supabase.co';
  const handler=createAffairsAssistantHandler({verifyToken:async token=>({user:{id:user.id},url:provider,token,key:'test-club-membership-key'}),
    loadSnapshot:()=>assert.fail('An unrequested account snapshot was loaded.'),answerAccount:()=>assert.fail('An unrequested model call was made.'),
    publicResearch:()=>assert.fail('Private records triggered public research.')});
  const [sectionId,courseId,termId]=['76d11d30-c3a4-49c1-a464-c0737c09a806','4b507708-20de-4f4e-9877-793af271aaac','f71e0666-dbff-4b11-9ca2-1086930489cd'];
  const enrolled={id,student_id:club.id,section_id:sectionId,status:'enrolled',source_mode:'verified',student:{id:club.id,user_id:user.id},
    section:{id:sectionId,course_id:courseId,term_id:termId,weekday:1,starts_at:'09:00:00',ends_at:'10:00:00',room:'QA Lab',
      course:{id:courseId,code:'QA115',title:'Applied Robotics'},term:{id:termId,label:'Saved semester',starts_on:'2020-01-01',ends_on:'2100-01-01'}}};

  await context.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.searchParams.get('scope')===clubStudentScope){
      assert.match(request.headers().authorization??'',/^Bearer /u);
      const view=url.searchParams.get('view'),filter=url.searchParams.get('q'),page=Number(url.searchParams.get('page'));
      if(view==='foundation/review'&&!allowManager)return route.fulfill({status:403,json:{error:'此帳戶無法查看。'}});
      const rows=view==='directory'?(filter==='No matches'?[]:[{...club,name:filter===submitted.name?filter:club.name,location:'QA Club Room',advisor:'QA Advisor'}]):
        view==='activity-search'?[activity]:view==='my-attendance'?[{...activity,...period,recorded_at:activity.starts_at}]:
        view==='my-memberships'?[{...club,...period,active:true,role_label:'QA Member'}]:
        view==='foundation/review'?application?.status==='submitted'?[{...application,student_name:'QA Student'}]:[]:
        application?[application]:[];
      return route.fulfill({json:{userId:user.id,view,page,eligible:view==='foundation',hasMore:false,rows}});
    }
    if(url.searchParams.get('scope')==='student-clubs'){
      return route.fulfill({json:{userId:user.id,view:'activities',manager:false,today:'2026-11-14',student:null,clubs:[],equipment:[],rows:[]}});
    }
    if(url.pathname==='/api/affairs-action'||url.pathname==='/api/affairs-manage'){
      const {kind,payload}=request.postDataJSON();
      writes.push({kind,key:payload.request_id});
      assert.match(payload.request_id,/^[a-f0-9-]{36}$/u);
      if(kind==='submit_club_foundation'){
        assert.equal(payload.name,submitted.name);
        assert.equal(payload.description,submitted.description);
        if(writes.length===1)return route.fulfill({status:503,json:{error:'請重試。'}});
        if(writes.length===2)assert.equal(writes[0].key,writes[1].key);
        application={...submitted};
      }else if(kind==='withdraw_club_foundation'){
        assert.equal(payload.id,id);
        assert.equal(payload.expected_version,1);
        application={...application,status:'withdrawn',version:2};
      }else{
        assert.equal(url.pathname,'/api/affairs-manage');
        assert.equal(kind,'review_club_foundation');
        assert.equal(payload.status,'approved');
        application={...application,status:'approved',version:2,club_id:club.id};
      }
      return route.fulfill({json:{id:application.id,status:application.status,version:application.version}});
    }
    if(url.pathname==='/api/affairs-assistant'){
      assert.equal(request.method(),'POST');
      const body=request.postDataJSON();
      assert.ok([compound,foreign,outage].some(testCase=>body.question===testCase.question&&body.route===testCase.route));
      const authorization=request.headers().authorization;assert.match(authorization??'',/^Bearer /u);
      const original=globalThis.fetch;
      globalThis.fetch=async(input,options)=>{
        const target=new URL(input);
        assert.equal(target.origin,provider);assert.equal(new Headers(options.headers).get('authorization'),authorization);
        assistantReads.push(target.pathname);
        if(target.pathname===membershipRpc){
          assert.deepEqual(JSON.parse(options.body),{p_view:'my-memberships',p_search:'',p_page:1});
          if(membershipReaderUnavailable)return new Response(null,{status:503});
          return Response.json({userId:user.id,view:'my-memberships',page:1,eligible:false,hasMore:false,rows:[membership]});
        }
        if(target.pathname.endsWith('/affairs_students')){
          assert.equal(target.searchParams.get('user_id'),'eq.'+user.id);
          return Response.json([enrolled.student]);
        }
        assert.equal(target.pathname,'/rest/v1/affairs_enrollments');
        assert.equal(target.searchParams.get('student_id'),'eq.'+club.id);
        return Response.json([enrolled],{headers:{'content-range':'0-0/1'}});
      };
      let stream='',status=0;
      const response={status(value){status=value;return this;},setHeader(){},write(chunk){stream+=chunk;},end(){}};
      try{await handler({method:'POST',headers:{authorization},body},response);}
      finally{globalThis.fetch=original;}
      assert.equal(status,200);
      return route.fulfill({contentType:'text/event-stream',body:stream});
    }
    if(url.pathname==='/api/affairs-conversations'){
      if(request.method()==='GET'){
        const requested=url.searchParams.get('id');
        return route.fulfill({json:requested?saved.get(requested):{conversations:[...saved.values()].map(({messages,...header})=>header)}});
      }
      const {id,title,messages,version}=request.postDataJSON(),now=new Date().toISOString();
      const row={id,title,messages,version:version+1,created_at:saved.get(id)?.created_at??now,updated_at:now};
      saved.set(id,row);return route.fulfill({json:row});
    }
    throw new Error('Unexpected QA call '+url.pathname);
  });
  const page=await context.newPage();
  page.setDefaultTimeout(9500);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+clubPath);
  for(const [path,label,title] of clubStudentMenu){
    await page.getByRole('button',{name:'學生',exact:true}).click();
    await page.getByRole('menuitem',{name:label,exact:true}).click();
    await page.waitForURL(url=>url.pathname===clubPath+'/'+path);
    await page.getByRole('heading',{name:new RegExp(path==='activities'?'學生社團活動清單':title)}).waitFor();
    if(path==='directory'){
      await page.getByRole('cell',{name:club.name}).waitFor();
      await page.getByRole('searchbox',{name:'社團名稱'}).fill('No matches');
      await page.getByRole('button',{name:'查詢',exact:true}).click();
      await page.getByText('查無資料',{exact:true}).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('q'),'No matches');
      await page.getByRole('button',{name:'清除',exact:true}).click();
      await page.getByRole('cell',{name:club.name}).waitFor();
    }
    if(path==='activity-search'||path==='my-attendance')await page.getByRole('cell',{name:activity.title}).waitFor();
    if(path==='my-memberships')await page.getByRole('cell',{name:'QA Member'}).waitFor();
  }
  async function fillProposal() {
    await page.getByRole('textbox',{name:'社團名稱',exact:true}).fill(submitted.name);
    await page.getByRole('textbox',{name:'成立宗旨',exact:true}).fill(submitted.description);
    await page.getByRole('button',{name:'送出申請',exact:true}).click();
  }
  await fillProposal();
  await page.getByRole('alert').getByText('請重試。').waitFor();
  await page.getByRole('button',{name:'送出申請',exact:true}).click();
  await page.getByRole('cell',{name:'待審核',exact:true}).waitFor();
  await page.reload();
  await page.getByRole('cell',{name:'待審核',exact:true}).waitFor();
  await page.getByRole('button',{name:'撤回',exact:true}).click();
  await page.getByRole('button',{name:'確認撤回',exact:true}).click();
  await page.getByRole('cell',{name:'已撤回',exact:true}).waitFor();
  await fillProposal();
  await page.getByRole('cell',{name:'待審核',exact:true}).waitFor();

  await page.goto(origin+clubPath+'/foundation/review');
  await page.getByRole('alert').getByText('此帳戶無法查看。').waitFor();
  allowManager=true;
  await page.reload();
  await page.getByRole('cell',{name:'QA Student',exact:true}).waitFor();
  await page.getByRole('button',{name:'審核',exact:true}).click();
  await page.getByRole('button',{name:'確認送出',exact:true}).click();
  await page.getByText('查無資料',{exact:true}).waitFor();
  await page.goto(origin+clubPath+'/foundation');
  await page.getByRole('link',{name:'查看社團',exact:true}).click();
  await page.getByRole('cell',{name:submitted.name}).waitFor();

  await page.goto(origin+compound.route);
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await page.getByPlaceholder('Ask a school question…').fill(compound.question);
  await page.getByRole('button',{name:'Send',exact:true}).click();
  const assistant=page.getByRole('dialog');
  await assistant.getByText(/QA Robotics · QA Member · Club status: Active/u).waitFor();
  await assistant.getByText(/QA115 · Applied Robotics/u).waitFor();
  await assistant.getByText('Conversation saved to your private account.',{exact:true}).waitFor();
  assert.equal(saved.size,1);
  const [savedReply]=saved.values(),entry=savedReply.messages.at(-1);
  assert.equal(entry.result.verification.status,'verified');
  assert.deepEqual(entry.activity.filter(step=>step.kind.startsWith('account-read:')).map(step=>step.kind).sort(),
    ['account-read:clubMemberships:1','account-read:courses:1']);
  assert.deepEqual(assistantReads.sort(),['/rest/v1/affairs_enrollments','/rest/v1/affairs_students','/rest/v1/rpc/affairs_read_club_student']);
  await page.evaluate(()=>sessionStorage.clear());
  await page.reload();
  await page.getByRole('button',{name:'開啟 AI 校園助理'}).click();
  await assistant.getByRole('combobox',{name:'Conversations'}).selectOption(savedReply.id);
  await assistant.getByText(/QA115 · Applied Robotics/u).waitFor();
  await assistant.getByText(/QA Robotics · QA Member · Club status: Active/u).waitFor();

  assert.equal(await assistant.getByRole('link',{name:'My club memberships'}).first().getAttribute('href'),clubPath+'/my-memberships');

  async function sendAndSave(testCase,answer){
    const next=page.waitForResponse(response=>response.url()===origin+'/api/affairs-conversations'
      &&response.request().method()==='POST'&&response.ok());
    await assistant.getByPlaceholder('Ask a school question…').fill(testCase.question);
    await assistant.getByRole('button',{name:'Send',exact:true}).click();
    const last=assistant.getByRole('article').last();
    await last.getByText(answer).waitFor();
    const {messages}=await (await next).json();
    return messages.at(-1);
  }

  await assistant.getByRole('button',{name:'New chat',exact:true}).click();
  assistantReads.length=0;
  const refused=await sendAndSave(foreign,'I can’t access another student’s club records.');
  assert.deepEqual(assistantReads,[]);
  assert.equal(refused.result.status,'handoff');
  assert.deepEqual(refused.result.citations,[]);

  membershipReaderUnavailable=true;
  const failed=await sendAndSave(outage,'I couldn’t verify your saved club memberships.');
  assert.deepEqual(assistantReads,[membershipRpc,membershipRpc]);
  assert.deepEqual(failed.result.verification,{status:'unverified',attempts:2});
  assert.deepEqual(failed.result.citations,[]);
  assert.ok(!failed.result.views?.length);
  assert.deepEqual(failed.activity.filter(step=>step.kind.startsWith('account-read:')).map(step=>[step.kind,step.status]),
    [['account-read:clubMemberships:1','unavailable'],['account-read:clubMemberships:2','unavailable']]);
  assert.doesNotMatch(failed.content,/no club memberships|QA Robotics/u);
  const failureActivity=assistant.getByRole('article').last().locator('details:has(> summary span:text-is("Activity"))');
  await failureActivity.locator('summary').click();
  assert.equal(await failureActivity.getByText('The selected record source could not be read.',{exact:true}).count(),2);

  membershipReaderUnavailable=false;
  assistantReads.length=0;
  const recovered=await sendAndSave(outage,/QA Robotics · QA Member · Club status: Active/u);
  assert.deepEqual(assistantReads,[membershipRpc]);
  assert.deepEqual(recovered.result.verification,{status:'verified',attempts:1});

  await page.keyboard.press('Escape');
  await page.setViewportSize({width:320,height:700});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  await pin();
  console.log('Six student menu routes, real navigation, lookup, assistant denial/outage/recovery, submit retry, withdrawal, manager approval and mobile width passed.');
}finally{await browser.close();}
