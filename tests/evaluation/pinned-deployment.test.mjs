import assert from 'node:assert/strict';
import test from 'node:test';
import {createPinnedDeploymentVerifier,PinnedDeploymentError} from './pinned-deployment.mjs';
import {releaseManifest} from '../../scripts/write-release-manifest.mjs';

const revision='1'.repeat(40),origin='https://stu-evaluation-abc-v1-d286.vercel.app';
const options={origin,approvedPreviewOrigin:origin,expectedRevision:revision,timeoutMs:100};
const original=releaseManifest({VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_SHA:revision},new Date('2026-11-14T12:00:00.000Z'));
const error=code=>value=>value instanceof PinnedDeploymentError&&value.code===code&&value.message==='Pinned deployment check failed: '+code+'.';
const respond=value=>Response.json(value);

test('pins actual build-manifest schema once and pairs every request with before/after/final exact checks',async()=>{
  const requests=[];
  const gate=createPinnedDeploymentVerifier({...options,fetchImpl:async(url,init)=>{requests.push({url,init});return respond(original);}});
  assert.equal(gate.status().status,'uninitialized');assert.equal(requests.length,0);
  const first=await gate.pin();assert.equal(first.deploymentId,null);assert.equal(first.identityKind,'release-manifest');
  assert.deepEqual(first.manifest,original);assert.ok(Object.isFrozen(first.manifest));
  await gate.pin();assert.equal(requests.length,1);
  for(let n=1;n<=2;n++){const ticket=await gate.beforeRequest();assert.equal(ticket.requestIndex,n);assert.equal(gate.status().pendingRequest,n);await gate.afterRequest(ticket);}
  const done=await gate.finish();assert.equal(done.checked,6);assert.equal(done.completed,2);assert.equal(gate.status().status,'finished');
  for(const {url,init} of requests){
    assert.equal(url,origin+'/release.json');assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');
    assert.deepEqual(init.headers,{Accept:'application/json'});assert.ok(init.signal instanceof AbortSignal);
  }
});

test('only an exact explicitly approved project preview or production origin may be read',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;return respond(original);};
  for(const target of ['http://stu.best','http://127.0.0.1:5173','https://stu.best/','https://stu.best/path','https://user:pass@stu.best',
    'https://stu.best:443','https://other.vercel.app','https://abc-v1-d286.vercel.app.evil.test',origin+'?token=private',origin+'#x'])
    assert.throws(()=>createPinnedDeploymentVerifier({...options,origin:target,approvedPreviewOrigin:target,fetchImpl}),error('invalid_target'));
  assert.throws(()=>createPinnedDeploymentVerifier({...options,approvedPreviewOrigin:undefined,fetchImpl}),error('invalid_target'));
  assert.throws(()=>createPinnedDeploymentVerifier({...options,expectedRevision:'HEAD',fetchImpl}),error('invalid_revision'));assert.equal(calls,0);
  const production=createPinnedDeploymentVerifier({origin:'https://stu.best',expectedRevision:revision,fetchImpl:async()=>respond({...original,environment:'production'})});
  await production.pin();assert.equal(production.status().manifest.environment,'production');
});

test('wrong, untrusted, extended or environment-mismatched manifest never becomes a pin',async()=>{
  for(const value of [null,[],{...original,extra:'value'},{...original,deploymentId:'dpl_forged'},{...original,source:'unverified'},
    {...original,revision:null},{...original,environment:'production'},{...original,builtAt:'2026-11-14T12:00:00Z'},{...original,builtAt:'2026-02-30T00:00:00.000Z'}]){
    const gate=createPinnedDeploymentVerifier({...options,fetchImpl:async()=>respond(value)});await assert.rejects(gate.pin(),error('invalid_manifest'));
    assert.equal(gate.status().manifest,null);assert.equal(gate.status().status,'failed');
  }
  const wrong=createPinnedDeploymentVerifier({...options,fetchImpl:async()=>respond({...original,revision:'2'.repeat(40)})});
  await assert.rejects(wrong.pin(),error('revision_mismatch'));await assert.rejects(wrong.beforeRequest(),error('invalid_transition'));
});

test('protection, redirects, wrong response origin and malformed bodies fail before any application operation',async()=>{
  const responses=[new Response('protected',{status:401}),new Response('login',{status:302,headers:{location:'https://vercel.com/login'}}),
    new Response('<html>SSO</html>',{headers:{'content-type':'text/html'}}),new Response('{', {headers:{'content-type':'application/json'}}),
    new Response(' '.repeat(4097),{headers:{'content-type':'application/json'}}),
    new Response(new Uint8Array([0xff]),{headers:{'content-type':'application/json'}})];
  const changedUrl=respond(original);Object.defineProperty(changedUrl,'url',{value:'https://different.invalid/release.json'});responses.push(changedUrl);
  const redirected=respond(original);Object.defineProperty(redirected,'redirected',{value:true});responses.push(redirected);
  for(const response of responses){
    let operationCalls=0;const gate=createPinnedDeploymentVerifier({...options,fetchImpl:async()=>response});
    await assert.rejects(async()=>{await gate.pin();await gate.beforeRequest();operationCalls++;},PinnedDeploymentError);
    assert.equal(operationCalls,0);assert.equal(gate.status().status,'failed');
  }
});

test('before-request revision or build drift stops the request rather than merely failing a final report',async()=>{
  for(const changed of [{...original,revision:'2'.repeat(40)},{...original,builtAt:'2026-11-14T12:01:00.000Z'}]){
    let reads=0,operations=0;const gate=createPinnedDeploymentVerifier({...options,fetchImpl:async()=>respond(reads++===0?original:changed)});
    await gate.pin();await assert.rejects(async()=>{await gate.beforeRequest();operations++;},PinnedDeploymentError);
    assert.equal(operations,0);assert.equal(gate.status().issued,0);assert.equal(gate.status().status,'failed');
  }
});

test('fixture rechecks validate the original manifest without crediting an assistant request',async()=>{
  let reads=0;const gate=createPinnedDeploymentVerifier({...options,fetchImpl:async()=>{reads++;return respond(original);}});
  await gate.pin();await gate.assertCurrent();await gate.assertCurrent();
  assert.equal(reads,3);assert.equal(gate.status().rechecked,2);assert.equal(gate.status().issued,0);assert.equal(gate.status().completed,0);
  await gate.finish();assert.equal(gate.status().checked,4);assert.equal(gate.status().status,'finished');
  let changed=false;const drift=createPinnedDeploymentVerifier({...options,fetchImpl:async()=>respond(changed?{...original,builtAt:'2026-11-14T12:01:00.000Z'}:original)});
  await drift.pin();changed=true;await assert.rejects(drift.assertCurrent(),error('deployment_changed'));
  assert.equal(drift.status().rechecked,0);assert.equal(drift.status().issued,0);
});

test('fixture rechecks cannot skip initial pinning or overlap a pending assistant ticket',async()=>{
  const fresh=()=>createPinnedDeploymentVerifier({...options,fetchImpl:async()=>respond(original)});
  const unpinned=fresh();await assert.rejects(unpinned.assertCurrent(),error('invalid_transition'));
  const pending=fresh();await pending.pin();await pending.beforeRequest();await assert.rejects(pending.assertCurrent(),error('invalid_transition'));
  assert.equal(pending.status().rechecked,0);assert.equal(pending.status().completed,0);
});

test('post-request and final checks detect remote alias drift while keeping initial identity unchanged',async()=>{
  for(const at of [2,3]){
    let reads=0;const gate=createPinnedDeploymentVerifier({...options,fetchImpl:async()=>respond(reads++===at?{...original,builtAt:'2026-11-14T12:01:00.000Z'}:original)});
    await gate.pin();const ticket=await gate.beforeRequest();
    if(at===2)await assert.rejects(gate.afterRequest(ticket),error('deployment_changed'));
    else{await gate.afterRequest(ticket);await assert.rejects(gate.finish(),error('deployment_changed'));}
    assert.deepEqual(gate.status().manifest,original);assert.equal(gate.status().status,'failed');
    await assert.rejects(gate.beforeRequest(),error('invalid_transition'));
  }
});

test('forged, missing, reused and overlapping request tickets cannot make an incomplete run finish',async()=>{
  const factory=()=>createPinnedDeploymentVerifier({...options,fetchImpl:async()=>respond(original)});
  const unpinned=factory();await assert.rejects(unpinned.beforeRequest(),error('invalid_transition'));
  for(const operation of [async(gate,ticket)=>gate.afterRequest({...ticket}),async gate=>gate.finish(),async gate=>gate.beforeRequest()]){
    const gate=factory();await gate.pin();const ticket=await gate.beforeRequest();await assert.rejects(operation(gate,ticket),error('invalid_transition'));
    assert.equal(gate.status().completed,0);assert.equal(gate.status().status,'failed');
  }
  const reuse=factory();await reuse.pin();const ticket=await reuse.beforeRequest();await reuse.afterRequest(ticket);await assert.rejects(reuse.afterRequest(ticket),error('invalid_transition'));
});

test('fetch and body timeouts are bounded even when injected operations ignore cancellation',async()=>{
  for(const fetchImpl of [()=>new Promise(()=>{}),async()=>new Response(new ReadableStream({start(){}}),{headers:{'content-type':'application/json'}})]){
    const gate=createPinnedDeploymentVerifier({...options,timeoutMs:15,fetchImpl});const start=Date.now();
    await assert.rejects(gate.pin(),error('deadline'));assert.ok(Date.now()-start<1000);assert.equal(gate.status().status,'failed');
  }
});

test('overlapping asynchronous checks poison both operations rather than returning a successful pin',async()=>{
  let release;const gate=createPinnedDeploymentVerifier({...options,fetchImpl:()=>new Promise(resolve=>{release=resolve;})});
  const first=gate.pin();await assert.rejects(gate.pin(),error('invalid_transition'));
  release(respond(original));await assert.rejects(first,error('invalid_transition'));
  assert.equal(gate.status().manifest,null);assert.equal(gate.status().status,'failed');
});

test('external abort remains authoritative and provider errors cannot enter diagnostics',async()=>{
  const controller=new AbortController();let calls=0;
  const gate=createPinnedDeploymentVerifier({...options,signal:controller.signal,fetchImpl:()=>{calls++;return new Promise(()=>{});}});
  const pending=gate.pin();controller.abort();await assert.rejects(pending,error('aborted'));assert.equal(calls,1);
  const never=createPinnedDeploymentVerifier({...options,signal:controller.signal,fetchImpl:()=>{calls++;return respond(original);}});
  await assert.rejects(never.pin(),error('aborted'));assert.equal(calls,1);
  const malicious=createPinnedDeploymentVerifier({...options,fetchImpl:async()=>{throw Error('private@example.invalid SECRET /account/pointer');}});
  await assert.rejects(malicious.pin(),error('unavailable'));assert.doesNotMatch(JSON.stringify(malicious.status()),/private@|SECRET|pointer/u);
  const forgedError=new PinnedDeploymentError('unavailable');forgedError.code='SECRET';forgedError.message='private@example.invalid';
  const forged=createPinnedDeploymentVerifier({...options,fetchImpl:async()=>{throw forgedError;}});
  await assert.rejects(forged.pin(),error('unavailable'));assert.doesNotMatch(JSON.stringify(forged.status()),/private@|SECRET/u);
});
