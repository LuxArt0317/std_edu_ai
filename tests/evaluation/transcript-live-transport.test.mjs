import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTranscriptLiveTransport,transcriptLiveTransportContract,TranscriptTransportError} from './transcript-live-transport.mjs';

const origin='https://std-edu-ai-fixture-v1-d286.vercel.app',revision='a'.repeat(40),token='SYNTHETIC_ONLY_CALLER_TOKEN';
const id='17000000-0000-4000-8000-000000000001',correlation='17000000-0000-4000-8000-000000000002';
const manifest=()=>({version:1,source:'vercel-git',environment:'preview',revision,builtAt:'2026-11-15T01:00:00.000Z'});
const payload=()=>({id,title:'Synthetic conversation',version:0,messages:[{id:'turn-1:user',role:'user',content:'Exact synthetic question'}]});
const answer=()=>({status:'answered',answer:'A bounded synthetic response.',activity:[]});
function fixture(override,{timeoutMs=1000}={}){
  const seen=[],journals=[];let manifests=0;
  const fetchImpl=async(url,options)=>{
    const parsed=new URL(String(url)),request={url:String(url),path:parsed.pathname,query:parsed.search,options};seen.push(request);
    assert.equal(parsed.origin,origin);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
    if(parsed.pathname==='/release.json'){
      manifests++;assert.equal(new Headers(options.headers).get('authorization'),null);
      const replaced=await override?.({...request,manifests});return replaced??Response.json(manifest());
    }
    assert.equal(new Headers(options.headers).get('authorization'),'Bearer '+token);
    const replaced=await override?.({...request,manifests});if(replaced!==undefined)return replaced;
    if(parsed.pathname==='/api/affairs-assistant')return Response.json(answer(),{headers:{'X-Assistant-Request-Id':correlation}});
    if(parsed.pathname==='/api/affairs-conversations')return Response.json({...payload(),version:1});
    assert.fail('No other target is allowed');
  };
  const bridge=createTranscriptLiveTransport({origin,approvedPreviewOrigin:origin,expectedRevision:revision,fetchImpl,timeoutMs});
  return {bridge,seen,journals,beforeSend:async value=>{journals.push(value);}};
}

test('construction is inert and requires an explicit trusted exact-target transport',()=>{
  assert.equal(transcriptLiveTransportContract.mounted,false);assert.equal(transcriptLiveTransportContract.liveAcceptance,false);
  for(const options of [{},{origin,expectedRevision:revision,fetchImpl:async()=>assert.fail('No request')},
    {origin:'https://foreign.invalid',approvedPreviewOrigin:'https://foreign.invalid',expectedRevision:revision,fetchImpl:async()=>assert.fail('No request')},
    {origin,approvedPreviewOrigin:origin,expectedRevision:'short',fetchImpl:async()=>assert.fail('No request')},
    {origin:origin+'/path',approvedPreviewOrigin:origin+'/path',expectedRevision:revision,fetchImpl:async()=>assert.fail('No request')}]){
    assert.throws(()=>createTranscriptLiveTransport(options),{code:'invalid_configuration'});
  }
  const run=fixture();assert.equal(run.seen.length,0);assert.equal(run.bridge.status().deployment.status,'uninitialized');
});

test('one supplied transport binds manifest, journaled assistant, conversation save/read and final release checks',async()=>{
  const run=fixture();await run.bridge.pin();
  const response=await run.bridge.assistant({token,question:'What are my saved subjects?',history:[],route:'/',beforeSend:run.beforeSend});
  assert.equal(response.disposition,'received');assert.equal(response.correlationId,correlation);assert.equal(response.sourceRevision,revision);
  assert.equal(response.modelAcceptance,false);assert.equal(response.persistenceVerified,false);
  await run.bridge.saveConversation({token,payload:payload(),beforeSend:run.beforeSend});
  const saved=await run.bridge.readConversation({token,id});assert.equal(saved.body.id,id);await run.bridge.finish();
  assert.deepEqual(run.seen.filter(row=>row.path!=='/release.json').map(row=>[row.options.method,row.path,row.query]),[
    ['POST','/api/affairs-assistant',''],['POST','/api/affairs-conversations',''],['GET','/api/affairs-conversations','?id='+id],
  ]);
  const request=JSON.parse(run.seen.find(row=>row.path==='/api/affairs-assistant').options.body);
  assert.deepEqual(request,{consentedResearchUse:false,history:[],question:'What are my saved subjects?',route:'/',stream:true});
  assert.deepEqual(run.journals.map(row=>row.operation),['assistant','conversation_save']);
  assert.ok(run.journals.every(row=>Object.isFrozen(row)&&/^[a-f0-9]{64}$/u.test(row.requestHash)));
  assert.doesNotMatch(JSON.stringify(run.journals)+JSON.stringify(run.bridge.status()),/SYNTHETIC_ONLY|saved subjects|Exact synthetic question/u);
  assert.equal(run.bridge.status().issued,3);assert.equal(run.bridge.status().received,3);assert.equal(run.bridge.status().finished,true);
});

test('a protected or wrong release stops before any journal or authenticated application request',async()=>{
  for(const replaced of [new Response(null,{status:302,headers:{location:'https://vercel.com/login'}}),Response.json({...manifest(),revision:'b'.repeat(40)}),
    Response.json({...manifest(),secret:'extra'}),Response.json({...manifest(),environment:'production'})]){
    const run=fixture(row=>row.path==='/release.json'?replaced:undefined);
    await assert.rejects(run.bridge.pin(),error=>error.code==='deployment_failed'&&error.disposition==='not_sent');
    assert.equal(run.seen.length,1);assert.equal(run.journals.length,0);
    await assert.rejects(run.bridge.assistant({token,question:'Synthetic',beforeSend:run.beforeSend}),{code:'invalid_state'});
  }
});

test('invalid request paths, credentials and callback data are rejected without dispatch or accessor effects',async()=>{
  const run=fixture();await run.bridge.pin();let access=0;
  const getter=Object.defineProperty({},'id',{enumerable:true,get(){access++;return id;}});
  for(const task of [()=>run.bridge.assistant({token,question:'Synthetic'}),()=>run.bridge.assistant({token:'bad\nheader',question:'Synthetic',beforeSend:run.beforeSend}),
    ...['https://foreign.invalid','//foreign.invalid','/a/../secret','/path#fragment','/\\foreign.invalid'].map(route=>()=>run.bridge.assistant({token,question:'Synthetic',route,beforeSend:run.beforeSend})),
    ()=>run.bridge.readConversation({token,id:id+'?other=1'}),()=>run.bridge.saveConversation({token,payload:getter,beforeSend:run.beforeSend})]){
    await assert.rejects(task(),{code:'invalid_request'});
  }
  assert.equal(access,0);assert.equal(run.seen.length,1);
});

test('POST waits for durable intent; rejected or hanging journal cannot send or expose its error text',async()=>{
  for(const pending of [false,true]){
    const run=fixture(undefined,{timeoutMs:10});await run.bridge.pin();
    await assert.rejects(run.bridge.assistant({token,question:'Synthetic',beforeSend:async()=>{
      if(pending)return new Promise(()=>{});throw Error('SECRET-PRIVATE-JOURNAL');
    }}),error=>error.code==='journal_failed'&&error.disposition==='not_sent'&&!JSON.stringify(error).includes('SECRET'));
    assert.equal(run.seen.filter(row=>row.path!=='/release.json').length,0);assert.equal(run.bridge.status().issued,0);
  }
});

test('snapshot is captured before await and concurrent operations never issue a second request',async()=>{
  const run=fixture();await run.bridge.pin();let release;const barrier=new Promise(resolve=>{release=resolve;});
  const value=payload(),first=run.bridge.saveConversation({token,payload:value,beforeSend:async commitment=>{run.journals.push(commitment);await barrier;}});
  value.messages[0].content='MUTATED AFTER INVOCATION';value.version=99;
  await assert.rejects(run.bridge.readConversation({token,id}),{code:'invalid_state'});release();await first;
  const sent=JSON.parse(run.seen.find(row=>row.path==='/api/affairs-conversations').options.body);
  assert.equal(sent.version,0);assert.equal(sent.messages[0].content,'Exact synthetic question');assert.equal(run.bridge.status().issued,1);
});

test('redirect and wrong-origin response are rejected without following or forwarding the caller token',async()=>{
  for(const response of [new Response('{}',{status:302,headers:{location:'https://foreign.invalid/steal','content-type':'application/json'}}),
    Object.defineProperty(Response.json(answer(),{headers:{'X-Assistant-Request-Id':correlation}}),'url',{value:'https://foreign.invalid/api/affairs-assistant'})]){
    const run=fixture(row=>row.path==='/api/affairs-assistant'?response:undefined);await run.bridge.pin();
    await assert.rejects(run.bridge.assistant({token,question:'Synthetic',beforeSend:run.beforeSend}),error=>error.disposition==='uncertain'&&error.requiresReconciliation);
    assert.equal(run.seen.filter(row=>row.path!=='/release.json').length,1);assert.equal(run.bridge.status().stopped,true);
    await assert.rejects(run.bridge.assistant({token,question:'Synthetic',beforeSend:run.beforeSend}),{code:'invalid_state'});
  }
});

test('post-response release drift retains private original response but grants no receipt or retry',async()=>{
  let answered=false;
  const run=fixture(row=>{
    if(row.path==='/api/affairs-assistant')answered=true;
    if(row.path==='/release.json'&&answered)return Response.json({...manifest(),builtAt:'2026-11-15T02:00:00.000Z'});
  });await run.bridge.pin();
  await assert.rejects(run.bridge.assistant({token,question:'Synthetic',beforeSend:run.beforeSend}),error=>{
    assert.equal(error.code,'deployment_failed');assert.equal(error.disposition,'uncertain');assert.equal(error.receivedResponse.body.answer,answer().answer);
    assert.doesNotMatch(JSON.stringify(error),/bounded synthetic|SYNTHETIC_ONLY/u);return true;
  });assert.equal(run.bridge.status().received,0);assert.equal(run.bridge.status().requiresReconciliation,true);
});

test('valid bounded SSE is preserved; missing terminal, excess bytes, absent correlation and wrong conversation ID fail',async()=>{
  const sse='event: progress\ndata: '+JSON.stringify({kind:'account-read:courses:1',status:'complete'})+'\n\nevent: result\ndata: '+JSON.stringify(answer())+'\n\n';
  const positive=fixture(row=>row.path==='/api/affairs-assistant'?new Response(sse,{headers:{'content-type':'text/event-stream','X-Assistant-Request-Id':correlation}}):undefined);
  await positive.bridge.pin();const receipt=await positive.bridge.assistant({token,question:'Synthetic',beforeSend:positive.beforeSend});assert.equal(receipt.events.length,1);assert.equal(receipt.body.answer,answer().answer);
  for(const response of [new Response('event: progress\ndata: {}\n\n',{headers:{'content-type':'text/event-stream','X-Assistant-Request-Id':correlation}}),
    Response.json(answer()),new Response('x'.repeat(2_000_001),{headers:{'content-type':'application/json','X-Assistant-Request-Id':correlation}})]){
    const run=fixture(row=>row.path==='/api/affairs-assistant'?response:undefined);await run.bridge.pin();
    await assert.rejects(run.bridge.assistant({token,question:'Synthetic',beforeSend:run.beforeSend}),{disposition:'uncertain'});
  }
  const wrong=fixture(row=>row.path==='/api/affairs-conversations'?Response.json({...payload(),id:correlation}):undefined);await wrong.bridge.pin();
  await assert.rejects(wrong.bridge.saveConversation({token,payload:payload(),beforeSend:wrong.beforeSend}),{disposition:'uncertain'});
});

test('timeout and cancellation keep uncertainty, never replay, and safely drain an eventually rejected dependency',async()=>{
  let release;
  const run=fixture(row=>row.path==='/api/affairs-assistant'?new Promise((_,reject)=>{release=reject;}):undefined,{timeoutMs:15});await run.bridge.pin();
  await assert.rejects(run.bridge.assistant({token,question:'Synthetic',beforeSend:run.beforeSend}),error=>error instanceof TranscriptTransportError&&error.disposition==='uncertain');
  release(Error('SECRET late transport rejection'));await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(run.bridge.status().issued,1);assert.equal(run.bridge.status().received,0);
  await assert.rejects(run.bridge.finish(),{code:'invalid_state'});
  const controller=new AbortController();controller.abort();let calls=0;
  const cancelled=createTranscriptLiveTransport({origin,approvedPreviewOrigin:origin,expectedRevision:revision,signal:controller.signal,fetchImpl:async()=>{calls++;assert.fail();}});
  await assert.rejects(cancelled.pin(),{code:'cancelled'});assert.equal(calls,0);
  let bodyCancelled=0;
  const stalled=fixture(row=>row.path==='/api/affairs-assistant'?new Response(new ReadableStream({cancel(){bodyCancelled++;}}),
    {headers:{'content-type':'text/event-stream','X-Assistant-Request-Id':correlation}}):undefined,{timeoutMs:15});await stalled.bridge.pin();
  await assert.rejects(stalled.bridge.assistant({token,question:'Synthetic',beforeSend:stalled.beforeSend}),{disposition:'uncertain'});
  assert.equal(bodyCancelled,1);assert.equal(stalled.bridge.status().received,0);
  let resolveLate,lateBodyCancelled=0;
  const late=fixture(row=>row.path==='/api/affairs-assistant'?new Promise(resolve=>{resolveLate=resolve;}):undefined,{timeoutMs:15});await late.bridge.pin();
  await assert.rejects(late.bridge.assistant({token,question:'Synthetic',beforeSend:late.beforeSend}),{disposition:'uncertain'});
  resolveLate(new Response(new ReadableStream({cancel(){lateBodyCancelled++;}}),{headers:{'content-type':'text/event-stream','X-Assistant-Request-Id':correlation}}));
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(lateBodyCancelled,1);assert.equal(late.bridge.status().received,0);
  await assert.rejects(late.bridge.assistant({token,question:'Synthetic',beforeSend:late.beforeSend}),{code:'invalid_state'});
});

test('HTTP rejection remains an actual receipt, never a factual, model or persistence acceptance claim',async()=>{
  const run=fixture(row=>row.path==='/api/affairs-conversations'?Response.json({error:'Synthetic stale-version rejection'},{status:409}):undefined);await run.bridge.pin();
  const result=await run.bridge.saveConversation({token,payload:payload(),beforeSend:run.beforeSend});
  assert.equal(result.statusCode,409);assert.equal(result.disposition,'received');assert.equal(result.persistenceVerified,false);assert.equal(result.modelAcceptance,false);
  assert.equal(result.deploymentVerified,true);assert.equal(run.bridge.status().liveAcceptance,false);
});

test('empty body chunks are bounded and a rejected response cannot be replayed',async()=>{
  let chunks=0,cancelled=0;
  const run=fixture(row=>row.path==='/api/affairs-assistant'?new Response(new ReadableStream({
    pull(controller){chunks++;controller.enqueue(new Uint8Array());},
    cancel(){cancelled++;},
  }),{headers:{'content-type':'application/json','X-Assistant-Request-Id':correlation}}):undefined);
  await run.bridge.pin();
  await assert.rejects(run.bridge.assistant({token,question:'Synthetic',beforeSend:run.beforeSend}),{disposition:'uncertain'});
  assert.ok(chunks<=4098);
  assert.equal(cancelled,1);
  assert.equal(run.bridge.status().received,0);
  await assert.rejects(run.bridge.assistant({token,question:'Synthetic',beforeSend:run.beforeSend}),{code:'invalid_state'});
});
