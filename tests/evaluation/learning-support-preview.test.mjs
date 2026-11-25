import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createTrustedPreviewFetch} from './vercel-preview-transport.mjs';
import {assertLearningSupportPreviewSchema,bindLearningSupportPreview,learningSupportPreviewHttp,learningSupportPreviewMode} from './learning-support-preview.mjs';
import {prepare,runLearningSupportPreview} from './live-fixtures.mjs';

const origin='https://stdedu-abcdef123-v1-d286.vercel.app';
const trusted='x-vercel-trusted-oidc-idp-token';
function previewToken(){
  const now=Math.floor(Date.now()/1000);
  return ['synthetic',Buffer.from(JSON.stringify({iss:'https://oidc.vercel.com/v1-d286',aud:'https://vercel.com/v1-d286',
    sub:'owner:v1-d286:project:std_edu_ai:environment:development',owner:'v1-d286',project:'std_edu_ai',environment:'development',
    nbf:now-30,exp:now+60})).toString('base64url'),'signature'].join('.');
}

test('learning support preflight requires every schema and permission finding before fixtures run',async()=>{
  const expected={applied:true,rls:true,caller_tables:true,caller_rpc:true,operator:true};
  for(const predicate of [null,...Object.keys(expected)]){
    const contract={...expected,...(predicate?{[predicate]:false}:{})};
    const preflight=assertLearningSupportPreviewSchema(async([sql])=>{
      assert.match(sql,/schema_migrations where version='20261116100000'/u);
      assert.match(sql,/public\.affairs_change_learning_support\(text,jsonb\)/u);
      assert.match(sql,/has_table_privilege\('authenticated',requests,'SELECT'\)/u);
      return [contract];
    });
    if(predicate)await assert.rejects(preflight,/schema-preflight/u);
    else await preflight;
  }
  await assert.rejects(prepare({runId:randomUUID(),cases:[],now:new Date().toISOString(),origin:'https://stu.best',
    fixtureMode:learningSupportPreviewMode}),error=>error.code==='fixture-config');
  await assert.rejects(runLearningSupportPreview({origin,sourceRevision:'HEAD'}),error=>error.code==='fixture-config');
});

test('the learning support runtime sends only the paired page, assistant and exact native confirmation requests',async()=>{
  const token=previewToken(),A='synthetic.owner.signature',B='synthetic.other.signature',sent=[],submittedId=randomUUID();
  const fetchImpl=async(target,init)=>{
    const url=new URL(target),body=init.body&&JSON.parse(init.body),headers=init.headers;
    sent.push({url:pathOf(url),method:init.method,actor:headers.get('authorization'),body});
    assert.equal(url.origin,origin);
    assert.equal(headers.get(trusted),token);
    assert.equal(init.redirect,'error');
    const correlationId=randomUUID();
    if(url.pathname==='/api/affairs-action'){
      const submit=body.kind==='submit_learning_support';
      return Response.json({id:submit?submittedId:body.payload.id,requestId:body.payload.request_id,
        status:submit?'submitted':'withdrawn',version:submit?1:3});
    }
    return Response.json({status:'answer',activity:[{status:'complete'}]},{headers:{'x-assistant-request-id':correlationId}});
  };
  const pathOf=url=>url.pathname+url.search;
  const readback=createTrustedPreviewFetch({origin,token,fetchImpl});
  const http=learningSupportPreviewHttp({origin,previewToken:token,readback,fetchImpl,readResponse:(response,endpoint,limit,status)=>{
    assert.equal(response.status,status);assert.equal(endpoint.origin,origin);
    assert.ok([4096,48000].includes(limit));
    return response.json();
  }});
  const route='/school-affairs/services/27-1',question='Withdraw my latest learning support request.';
  const runId=randomUUID();
  const fixture=bindLearningSupportPreview(runId,Object.fromEntries(['A','B'].map(side=>[side,{
    id:randomUUID(),email:side.toLowerCase()+'@example.invalid',runMarker:runId,
  }])));
  const command={kind:'withdraw_learning_support',payload:{id:fixture.plan.target.id,request_id:randomUUID(),expected_version:2}};
  await http({mode:'read',callerToken:A});
  await http({mode:'read',callerToken:B});
  const answer=await http({mode:'ask',callerToken:A,question,route});
  assert.match(answer.correlationId,/^[a-f0-9-]{36}$/u);
  await http({mode:'ask',question,route});
  const expected={status:200,body:{id:command.payload.id,requestId:command.payload.request_id,status:'withdrawn',version:3},
    activity:[],correlationId:null};
  assert.deepEqual(await http({mode:'confirm',callerToken:A,command}),expected);
  assert.deepEqual(await http({mode:'confirm',callerToken:A,command}),expected);
  const submit={kind:'submit_learning_support',payload:{request_id:randomUUID(),topic:'QA support topic',details:'QA support request details'}};
  assert.deepEqual(await http({mode:'confirm',callerToken:A,command:submit}),{status:200,
    body:{id:submittedId,requestId:submit.payload.request_id,status:'submitted',version:1},activity:[],correlationId:null});
  await assert.rejects(http({mode:'read'}),/request-scope/u);
  await assert.rejects(http({mode:'confirm',callerToken:A,command:{...command,kind:'submit_learning_support'}}),/invalid learning support submission/u);
  assert.deepEqual(sent.map(({url,method,actor})=>[url,method,actor]),[
    ['/api/affairs-data?scope=learning-support&page=1','GET','Bearer '+A],
    ['/api/affairs-data?scope=learning-support&page=1','GET','Bearer '+B],
    ['/api/affairs-assistant','POST','Bearer '+A],
    ['/api/research-assistant','POST',null],
    ['/api/affairs-action','POST','Bearer '+A],
    ['/api/affairs-action','POST','Bearer '+A],
    ['/api/affairs-action','POST','Bearer '+A],
  ]);
  assert.deepEqual(sent[2].body,{question,route,stream:false,consentedResearchUse:false});
  assert.deepEqual(sent.slice(-3).map(row=>row.body),[command,command,submit]);
});
