import assert from 'node:assert/strict';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import confirm from '../../api/affairs-action.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';
import {learningSupportPath} from '../../src/features/public/affairs/studentServices.js';

const owner='71000000-0000-4000-8000-000000000011';
const record='70908e50-0000-4000-8000-000000000011';
const token='test-learning-support-submission-token',key='test-learning-support-submission-key';
const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const topic='Study schedule';
const details='I need help with club activity attendance. Only if possible, please help me plan my reading.';
const prompt='Submit a learning support request titled "'+topic+'" with details "'+details+'"';

async function dispatch(handler:any,body:object,bearer=token){
  const headers=bearer?{authorization:'Bearer '+bearer}:{'x-forwarded-for':'192.0.2.219'};
  const response={statusCode:0,body:null as any,setHeader(){},status(code:number){this.statusCode=code;return this;},json(value:unknown){this.body=value;}};
  await handler({method:'POST',headers,body},response);
  return response;
}

test('27-1 chat drafts match only explicitly supplied fields and the native endpoint verifies the same confirmed nonce',async t=>{
  const priorUrl=process.env.VITE_SUPABASE_URL,priorKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  process.env.VITE_SUPABASE_URL=origin;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
  t.after(()=>{
    if(priorUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=priorUrl;
    if(priorKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=priorKey;
  });
  const unexpected:string[]=[],writes:unknown[]=[];
  let stored='',authorizedToSubmit=false;
  t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init:RequestInit)=>{
    const url=new URL(String(input));
    const headers=new Headers(init.headers);
    assert.equal(url.origin,origin);
    assert.equal(headers.get('authorization'),'Bearer '+token);
    assert.equal(headers.get('apikey'),key);
    if(url.pathname==='/auth/v1/user')return Response.json({id:owner,identities:[{provider:'google'}]});
    if(!authorizedToSubmit||url.pathname!=='/rest/v1/rpc/affairs_change_learning_support'){
      unexpected.push(url.pathname);
      throw new Error('A draft must not call a record or mutation API');
    }
    assert.equal(init.method,'POST');
    const body=String(init.body),mutation=JSON.parse(body);
    writes.push(mutation);
    assert.deepEqual(mutation,{p_kind:'submit',p_payload:{request_id:mutation.p_payload.request_id,topic,details}});
    const receipt={id:record,requestId:mutation.p_payload.request_id,status:'submitted',version:1};
    if(!stored){stored=body;return Response.json({...receipt,version:2});}
    assert.equal(stored,body);
    return Response.json(receipt);
  });
  const unexpectedHandler=(name:string)=>async()=>{unexpected.push(name);throw new Error(name);};
  const ask=createAffairsAssistantHandler({loadSnapshot:unexpectedHandler('snapshot'),answerAccount:unexpectedHandler('model'),
    publicResearch:unexpectedHandler('public research')});
  const zhTopic='讀書計畫',zhDetails='我需要協助安排每週閱讀進度';
  const longTopic='主'.repeat(160),longDetails='文'.repeat(1200);
  const examples=[
    [prompt,'/dtm',topic,details],
    ['請幫我提交學習輔導申請，主題「'+zhTopic+'」，需求「'+zhDetails+'」。',learningSupportPath,zhTopic,zhDetails],
    ['送出我的學習輔導申請，主題「'+longTopic+'」，需求「'+longDetails+'」。',learningSupportPath,longTopic,longDetails],
  ];
  let approved;
  for(const [question,route,expectedTopic,expectedDetails] of examples){
    const result=await dispatch(ask,{question,route,history:[{role:'user',content:'PRIVATE_PRIOR_TURN'}]});
    assert.equal(result.statusCode,200,question);
    const {proposedAction,activity,verification,...reply}=result.body;
    assert.equal(result.body.status,'answered',question);
    assert.deepEqual(verification,{status:'verified',attempts:1});
    assert.equal(proposedAction.kind,'submit_learning_support');
    assert.equal(proposedAction.url,learningSupportPath);
    assert.match(proposedAction.requestId,/^[a-f0-9-]{36}$/u);
    assert.deepEqual(proposedAction.payload,{topic:expectedTopic,details:expectedDetails});
    assert.deepEqual(reply.citations.map((item:{url:string})=>item.url),[learningSupportPath]);
    assert.ok(activity.some((step:{kind:string;status:string})=>step.kind==='action-context:1'&&step.status==='complete'));
    assert.ok(!activity.some((step:{kind:string})=>step.kind.startsWith('account-read:')));
    assert.doesNotMatch(JSON.stringify(result.body),/PRIVATE_PRIOR_TURN|test-learning-support-|71000000-0000-4000-8000-000000000011/u);
    assert.ok(!JSON.stringify({...reply,activity}).includes(expectedDetails));
    if(question===prompt)approved=proposedAction;
  }

  for(const [question,route] of [
    ['Submit a learning support request.',learningSupportPath],
    ['Submit a learning support request for Alex titled "'+topic+'" with details "'+details+'"',learningSupportPath],
    ['Do not '+prompt,learningSupportPath],
    [prompt+' and show my grades.',learningSupportPath],
    ['暫勿提交學習輔導申請，主題「'+zhTopic+'」，需求「'+zhDetails+'」。',learningSupportPath],
    [prompt.replace(details,'Unsupported control \u0085 character'),learningSupportPath],
    [prompt.replace(details,'Unsupported control \u0001 character'),learningSupportPath],
    [prompt,learningSupportPath+'/review'],
    [prompt,learningSupportPath+'?user_id='+owner],
  ]){
    const result=await dispatch(ask,{question,route,history:[{role:'user',content:prompt}]});
    assert.equal(result.statusCode,200,question);
    assert.equal(result.body.status,'clarification',question);
    assert.equal(result.body.proposedAction,undefined);
    assert.deepEqual(result.body.citations.map((item:{url:string})=>item.url),[learningSupportPath]);
    assert.ok(!JSON.stringify(result.body).includes(details));
  }
  const attached=await dispatch(ask,{question:prompt,route:learningSupportPath,
    images:[{name:'request.png',dataUrl:'data:image/png;base64,'+Buffer.alloc(48,1).toString('base64')}]});
  assert.equal(attached.statusCode,400);
  assert.equal(attached.body.proposedAction,undefined);
  const guest=await dispatch(createResearchAssistantHandler(),{question:prompt,route:learningSupportPath},'');
  assert.equal(guest.statusCode,200);
  assert.equal(guest.body.status,'handoff');
  assert.equal(guest.body.proposedAction,undefined);
  assert.deepEqual(guest.body.citations.map((item:{url:string})=>item.url),['/school-affairs/login?next='+encodeURIComponent(learningSupportPath)]);
  assert.ok(!JSON.stringify(guest.body).includes(details));
  assert.deepEqual(writes,[]);
  assert.deepEqual(unexpected,[]);

  assert.ok(approved);
  const command={kind:approved.kind,payload:{request_id:approved.requestId,...approved.payload}};
  authorizedToSubmit=true;
  assert.equal((await dispatch(confirm,command)).statusCode,503);
  const retry=await dispatch(confirm,command);
  assert.equal(retry.statusCode,200);
  assert.deepEqual(retry.body,{id:record,requestId:approved.requestId,status:'submitted',version:1});
  assert.deepEqual(writes,[JSON.parse(stored),JSON.parse(stored)]);
  assert.deepEqual(unexpected,[]);
});
