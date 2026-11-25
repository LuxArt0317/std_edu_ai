import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {learningSupportQuestion} from '../../server/learningSupportAssistantIntent.js';
import {gradeCase} from './grading.mjs';

const db='https://xiftudmvxphxcjtmfmib.supabase.co',route='/school-affairs/services/27-1';
const a=randomUUID(),b=randomUUID(),date='2026-11-15T01:23:00+00:00';
const row={id:randomUUID(),ownerId:a,topic:'OMIT PRIVATE TOPIC',details:'OMIT PRIVATE DETAILS',status:'reviewed',reviewNote:'OMIT REVIEW NOTE',
  version:3,submittedAt:date,updatedAt:date};
const account={user:{id:a},url:db,key:'SYNTHETIC-KEY',token:'SYNTHETIC-TOKEN'};
async function send(handler,question,options={}){
  const response={code:0,body:null,setHeader(){},status(code){this.code=code;return this;},json(value){this.body=value;}};
  await handler({method:'POST',headers:options.guest?{}:{authorization:'Bearer '+account.token},body:{question,route,...options}},response);
  return response;
}

test('the actual assistant checks caller-specific local review status and counts, excludes request text, and retries missing evidence',async t=>{
  const reviewedFixture={userId:a,canReview:false,view:'mine',page:1,total:1,rows:[row]};
  let verifiedFixture=reviewedFixture,outage=0,reads=0;
  const unexpected=[];
  t.mock.method(globalThis,'fetch',async(url,init)=>{
    if(String(url)!==db+'/rest/v1/rpc/affairs_read_learning_support'){unexpected.push(String(url));throw new Error('Unexpected transport');}
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+account.token);
    assert.equal(init.method,'POST');
    assert.deepEqual(JSON.parse(init.body),{p_view:'mine',p_page:1});
    reads++;
    if(outage-->0)return Response.json({error:'Synthetic outage'},{status:503});
    return Response.json(verifiedFixture);
  });
  const ask=createAffairsAssistantHandler({verifyToken:async token=>{assert.equal(token,account.token);return account;},
    loadSnapshot:async()=>assert.fail('No full workspace'),publicResearch:async()=>assert.fail('No public research'),
    answerAccount:async()=>assert.fail('No model')});
  const question='What is my learning support application status?';
  const aStatus=await send(ask,question,{route:'/'});
  assert.equal(aStatus.code,200);
  assert.deepEqual(aStatus.body.verification,{status:'verified',attempts:1});
  assert.deepEqual(aStatus.body.citations.map(item=>[item.chunkId,item.url]),[['account:learningSupport',route]]);
  assert.match(aStatus.body.answer,/Site review complete · 2026-11-15 09:23 \(Taipei\)/u);
  assert.doesNotMatch(JSON.stringify(aStatus.body),/OMIT|SYNTHETIC-KEY|SYNTHETIC-TOKEN|officially approved|eligibility|funds paid/u);
  assert.equal(aStatus.body.proposedAction,undefined);
  const outcome=gradeCase({id:'learning-support:latest-review',mode:'record',expected:{behavior:'answer',
    facts:[{label:'Most recently updated request',kind:'text',values:['Site review complete']}],
    requiredTools:['learningSupport'],requiredAttemptedTools:['learningSupport'],allowedTools:['learningSupport'],
    requireToolExecution:true,requiredLinks:[route],requiredSourceBindings:[{sourceId:'account:learningSupport',url:route}],
    noAction:true,forbidPublicResearch:true,localLinksOnly:true}},
  {statusCode:aStatus.code,body:aStatus.body,events:aStatus.body.activity,execution:'deterministic'});
  assert.deepEqual(outcome.failures.map(item=>item.id),[]);
  const chinese=await send(ask,'我的學習輔導申請進度是什麼？');
  assert.equal(chinese.body.verification.status,'verified');assert.match(chinese.body.answer,/站內審查完成/u);

  verifiedFixture={...reviewedFixture,total:0,rows:[]};
  const empty=await send(ask,'How many learning support requests do I have?');
  assert.match(empty.body.answer,/Saved learning support requests: 0/u);
  assert.deepEqual(empty.body.verification,{status:'verified',attempts:1});
  verifiedFixture=reviewedFixture;
  outage=1;
  const retry=await send(ask,'Show my application status.');
  assert.deepEqual(retry.body.verification,{status:'verified',attempts:2});
  assert.deepEqual(retry.body.activity.filter(item=>item.kind.startsWith('account-read:')).map(item=>item.status),['unavailable','complete']);

  verifiedFixture={...reviewedFixture,rows:[{...row,ownerId:b}]};
  const denied=await send(ask,question);
  assert.equal(denied.body.verification.status,'unverified');
  assert.doesNotMatch(JSON.stringify(denied.body),/Site review complete|You have no saved|OMIT/u);
  const before=reads;
  const guest=await send(createResearchAssistantHandler(),question,{guest:true});
  assert.equal(guest.body.status,'handoff');
  assert.equal(guest.body.citations[0].url,'/school-affairs/login?next='+encodeURIComponent(route));
  assert.equal(reads,before);
  assert.deepEqual(unexpected,[]);
});

test('tracking notes, award decisions, other persons and mixed questions retain their separate intent policies',()=>{
  for(const text of ['Show my learning support tracking notes.','Was my learning support application officially approved?',
    'Show my friend’s learning support application status.','Show my learning support application status and my next class.',
    'Show my application status and my tuition.'])assert.equal(learningSupportQuestion(text,route),null,text);
  assert.equal(learningSupportQuestion('Show my application status.','/school-affairs/services/27-1/notes'),null);
  assert.equal(learningSupportQuestion('Show my application status.','/school-affairs/services/27-1/review'),null);
});
