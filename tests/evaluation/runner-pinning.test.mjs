import assert from 'node:assert/strict';
import test from 'node:test';
import {main,options,createLiveRequestPacer,assessRun} from './run.mjs';

const revision='a'.repeat(40),preview='https://stu-evaluation-abc-v1-d286.vercel.app';
const baseManifest={version:1,revision,source:'vercel-git',environment:'production',builtAt:'2026-11-14T12:00:00.000Z'};
const answer={status:'answered',answer:'Tuition balance: 23000.',verification:{status:'verified',attempts:1}};
const identity={sourceRevision:revision,workingTreeHash:'b'.repeat(64),dirty:false};
const caseFor=n=>({id:'pin:'+n,domain:'fees',route:'/school-affairs/services/39-1',routeFamily:'affairs',mode:'record',fixtureKey:'fees',
  capability:{level:'native',gap:false},expected:{behavior:'answer',facts:[{label:'Tuition balance',kind:'number',values:[23000]}],requiredTools:[]}});
const inventory={hash:'c'.repeat(64),services:[],tools:[],publicPages:[],routeFamilies:[{id:'affairs',routes:['/school-affairs/services/39-1'],auth:'signed-in'}]};

function rig({count=2,origin='https://stu.best',manifestAt,post,prepare,afterCase,cleanup,identities}={}){
  const events=[],saved=[],cases=Array.from({length:count},(_,n)=>caseFor(n+1));let reads=0,posts=0,identifications=0;
  const manifest={...baseManifest,environment:origin===preview?'preview':'production'};
  const adapter={
    async prepare(context){events.push('prepare');assert.equal(context.origin,origin);assert.equal(context.expectedReleaseRevision,revision);
      assert.equal(context.approvedPreviewOrigin,origin===preview?preview:undefined);await prepare?.(context);},
    async forCase(row){events.push('fixture:'+row.id);return {token:'OFFLINE_ONLY_TOKEN'};},
    async afterCase(row,envelope){events.push('readback:'+row.id);await afterCase?.(row,envelope);},
    async cleanup(){events.push('cleanup');return cleanup?cleanup():{verified:true};},
  };
  const dependencies={
    sourceIdentity:async()=>structuredClone(identities?.[identifications++]||identity),
    evaluationSuite:async()=>({cases:structuredClone(cases),inventory:structuredClone(inventory),suiteHash:'d'.repeat(64)}),
    loadFixtureAdapter:async()=>{events.push('load-adapter');return adapter;},
    saveReport:async(_path,report)=>{saved.push(structuredClone(report));},log:()=>{},
    pace:async(start,signal,beforeStart)=>{signal.throwIfAborted();await beforeStart();signal.throwIfAborted();return start(0);},
    fetchImpl:async(input,init)=>{
      const url=new URL(input);assert.equal(url.origin,origin);assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');
      if(url.pathname==='/release.json'){
        reads++;events.push('release:'+reads);assert.equal(init.method,'GET');assert.deepEqual(init.headers,{Accept:'application/json'});
        const value=manifestAt?manifestAt(reads,manifest):manifest;
        return value instanceof Response?value:Response.json(value);
      }
      posts++;events.push('post:'+posts);assert.equal(url.pathname,'/api/affairs-assistant');assert.equal(init.method,'POST');
      assert.equal(init.headers.Authorization,'Bearer OFFLINE_ONLY_TOKEN');
      return post?post(posts,init):Response.json(answer);
    },
  };
  async function run(extra=[]){
    const previous=process.exitCode;
    try{return await main(['--mode','live','--origin',origin,'--fixture-module','tests/evaluation/live-fixtures.mjs',
      ...(origin===preview?['--approved-preview-origin',preview]:[]),...extra],dependencies);}
    finally{process.exitCode=previous;}
  }
  return {events,saved,run,dependencies,cases,get reads(){return reads;},get posts(){return posts;}};
}

test('exact release is pinned before fixture import, around every response and after cleanup',async()=>{
  const env=rig(),report=await env.run();
  assert.deepEqual(env.events,['release:1','load-adapter','prepare','release:2','fixture:pin:1','release:3','post:1','release:4','readback:pin:1',
    'release:5','fixture:pin:2','release:6','post:2','release:7','readback:pin:2','cleanup','release:8']);
  assert.equal(report.deploymentPin.status,'finished');assert.equal(report.deploymentPin.checked,8);assert.equal(report.deploymentPin.rechecked,2);
  assert.equal(report.deploymentPin.deploymentId,null);assert.equal(report.deploymentPin.identityKind,'release-manifest');
  assert.deepEqual(report.results.map(row=>row.response.deploymentCheck),[1,2].map(requestIndex=>({requestIndex,sourceRevision:revision,verified:true})));
  assert.ok(report.results.every(row=>row.passed&&row.executed));assert.equal(report.cleanup.complete,true);
  assert.equal(report.injectedDependencies,true);assert.equal(report.assessment.releaseReady,false);
  assert.ok(report.assessment.integrity.failures.some(row=>row.id==='run.injectedDependencies'));
  assert.doesNotMatch(JSON.stringify(env.saved),/OFFLINE_ONLY_TOKEN|Bearer/u);
});

test('wrong revision, protection, redirects and untrusted manifest stop before fixture or POST',async()=>{
  for(const manifestAt of [()=>({...baseManifest,revision:'b'.repeat(40)}),()=>new Response('Protected',{status:401}),
    ()=>new Response('redirect',{status:302,headers:{location:'https://vercel.com/login'}}),()=>({...baseManifest,extra:'untrusted'})]){
    const env=rig({manifestAt});await assert.rejects(env.run(),/Pinned deployment check failed/u);
    assert.deepEqual(env.events,['release:1']);assert.equal(env.posts,0);
    const report=env.saved.at(-1);assert.equal(report.results.length,0);assert.equal(report.deploymentPin.status,'failed');
    assert.equal(report.assessment.releaseReady,false);assert.equal(report.cleanup.complete,true);
  }
});

test('dirty source is stopped before even the release request',async()=>{
  const env=rig({identities:[{...identity,dirty:true},identity]});await assert.rejects(env.run(),/clean, exact source revision/u);
  assert.deepEqual(env.events,[]);assert.equal(env.saved.at(-1).results.length,0);
});

test('explicit approved Preview is passed unchanged to the fixture adapter; no bare Preview or loopback bypass',async()=>{
  const env=rig({origin:preview,count:1}),report=await env.run();assert.equal(report.deploymentPin.origin,preview);
  assert.equal(report.deploymentPin.manifest.environment,'preview');
  for(const origin of [preview,'http://127.0.0.1:5173','https://stu.best/path','https://elsewhere.invalid']){
    const denied=rig();await assert.rejects(denied.run(['--origin',origin]),/exact Preview origin/u);assert.deepEqual(denied.events,[]);
  }
  assert.throws(()=>options(['--mode','live','--origin',preview,'--approved-preview-origin','https://different-v1-d286.vercel.app']),/must equal/u);
  assert.throws(()=>options(['--mode','draft','--origin',preview,'--approved-preview-origin',preview]),/live target/u);
  assert.throws(()=>options(['--mode','live','--approved-preview-origin','https://stu.best']),/live target/u);
  const wrongProject=rig();await assert.rejects(wrongProject.run(['--origin','https://other.vercel.app','--approved-preview-origin','https://other.vercel.app']),/invalid_target/u);
  assert.deepEqual(wrongProject.events,[]);
});

test('pre-request drift stops before POST, marks an unexecuted case and still cleans fixtures',async()=>{
  const env=rig({manifestAt:(n,value)=>n===3?{...value,revision:'b'.repeat(40)}:value}),report=await env.run();
  assert.equal(env.posts,0);assert.equal(report.results.length,1);assert.equal(report.results[0].executed,false);
  assert.equal(report.results[0].response.deploymentIntegrityFailed,true);assert.equal(report.results[0].response.sourceRevision,'unknown');
  assert.equal(report.cleanup.complete,true);assert.equal(report.deploymentPin.failure,'revision_mismatch');
  assert.equal(env.events.filter(row=>row.startsWith('fixture:')).length,1);
});

test('post-response drift preserves exact body/events and stops later requests without replay',async()=>{
  const progress={kind:'account:charges',status:'complete'},response={...answer,answer:'Tuition balance: 23000. Original response retained.'};
  const env=rig({manifestAt:(n,value)=>n===4?{...value,builtAt:'2026-11-14T13:00:00.000Z'}:value,
    post:()=>new Response('event: progress\ndata: '+JSON.stringify(progress)+'\n\nevent: result\ndata: '+JSON.stringify(response)+'\n\n',{headers:{'content-type':'text/event-stream'}})});
  const report=await env.run(),row=report.results[0];assert.equal(env.posts,1);assert.equal(report.results.length,1);
  assert.deepEqual(row.response.body,response);assert.deepEqual(row.response.events,[progress]);assert.equal(row.response.statusCode,200);
  assert.equal(row.response.sourceRevision,'unknown');assert.equal(row.response.deploymentCheck.verified,false);
  assert.equal(row.passed,false);assert.equal(row.failureKind,'infrastructure');assert.equal(report.cleanup.complete,true);
  assert.equal(report.deploymentPin.failure,'deployment_changed');assert.match(report.deploymentFailure,/deployment_changed/u);
});

test('HTTP errors are original results, paired and never automatically retried',async()=>{
  const response={error:'Fixture endpoint unavailable'},env=rig({count:1,post:()=>Response.json(response,{status:503})});
  const report=await env.run();assert.equal(env.posts,1);assert.equal(report.results[0].response.statusCode,503);
  assert.deepEqual(report.results[0].response.body,response);assert.equal(report.results[0].failureKind,'infrastructure');
  assert.equal(report.results[0].response.deploymentCheck.verified,true);assert.equal(report.deploymentPin.status,'finished');
});

test('final drift after cleanup rejects run acceptance without rewriting verified response facts',async()=>{
  const env=rig({manifestAt:(n,value)=>n===8?{...value,builtAt:'2026-11-14T13:00:00.000Z'}:value}),report=await env.run();
  assert.equal(env.posts,2);assert.deepEqual(env.events.slice(-2),['cleanup','release:8']);
  assert.ok(report.results.every(row=>row.passed&&row.response.deploymentCheck.verified));
  assert.equal(report.deploymentPin.status,'failed');assert.equal(report.assessment.releaseReady,false);
  assert.ok(report.assessment.integrity.failures.some(row=>row.id==='run.deploymentPinUnverified'));
});

test('drift between cases is checked before the next owned fixture transition, not just before POST',async()=>{
  const env=rig({manifestAt:(n,value)=>n===5?{...value,revision:'b'.repeat(40)}:value}),report=await env.run();
  assert.equal(env.posts,1);assert.equal(report.results.length,2);
  assert.equal(env.events.filter(row=>row.startsWith('fixture:')).length,1);
  assert.equal(report.results[0].passed,true);assert.equal(report.results[1].executed,false);
  assert.equal(report.results[1].response.deploymentIntegrityFailed,true);assert.equal(report.cleanup.complete,true);
});

test('fixture readback failure preserves received answer and stops further cases; final release check still runs',async()=>{
  const env=rig({afterCase:()=>{throw new Error('Exact owned readback differs');}}),report=await env.run();
  assert.equal(env.posts,1);assert.deepEqual(report.results[0].response.body,answer);assert.equal(report.results[0].response.statusCode,200);
  assert.equal(report.results[0].response.fixtureIntegrityFailed,true);assert.equal(report.results[0].passed,false);
  assert.equal(report.deploymentPin.status,'finished');assert.equal(report.cleanup.complete,true);
});

test('failed preparation still cleans up and checks final release; failed cleanup cannot become acceptance',async()=>{
  const setup=rig({prepare:()=>{throw Error('Fixture preparation failed');}});await assert.rejects(setup.run(),/preparation failed/u);
  assert.deepEqual(setup.events,['release:1','load-adapter','prepare','cleanup','release:2']);assert.equal(setup.posts,0);
  const cleanup=rig({count:1,cleanup:()=>{throw Error('Cleanup unverified');}}),report=await cleanup.run();
  assert.equal(report.cleanup.complete,false);assert.equal(report.deploymentPin.status,'finished');
  assert.ok(report.assessment.integrity.failures.some(row=>row.id==='run.cleanupUnverified'));
});

test('local revision/working-tree drift is independent from a stable remote release',async()=>{
  const env=rig({count:1,identities:[identity,{...identity,workingTreeHash:'e'.repeat(64)}]}),report=await env.run();
  assert.equal(report.deploymentPin.status,'finished');assert.equal(report.sourceUnchanged,false);
  assert.ok(report.assessment.integrity.failures.some(row=>row.id==='run.sourceChanged'));
});

test('assessment rejects missing or reused response tickets even beside a finished aggregate pin',async()=>{
  const env=rig(),report=await env.run();
  for(const mutate of [row=>{delete row.results[0].response.deploymentCheck;},row=>{row.results[1].response.deploymentCheck.requestIndex=1;}]){
    const changed=structuredClone(report);mutate(changed);
    const assessment=assessRun(changed,{cases:env.cases,inventory,requestedSuite:'full',sourceRevision:revision});
    assert.ok(assessment.integrity.failures.some(row=>row.id==='run.responsePinUnverified'));
  }
  const noFixtureChecks=structuredClone(report);noFixtureChecks.deploymentPin.rechecked=0;noFixtureChecks.deploymentPin.checked=6;
  const assessment=assessRun(noFixtureChecks,{cases:env.cases,inventory,requestedSuite:'full',sourceRevision:revision});
  assert.ok(assessment.integrity.failures.some(row=>row.id==='run.deploymentPinUnverified'));
});

test('slow preflight is awaited after pacing and does not shorten actual POST intervals',async()=>{
  let now=0;const starts=[],events=[];
  const pace=createLiveRequestPacer(5500,{now:()=>now,sleep:async ms=>{events.push('wait');now+=ms;}});
  await pace(()=>{events.push('post');starts.push(now);},undefined,async()=>{events.push('check');now+=8000;});
  await pace(()=>{events.push('post');starts.push(now);},undefined,async()=>{events.push('check');now+=1;});
  assert.deepEqual(events,['check','post','wait','check','post']);assert.deepEqual(starts,[8000,13501]);
  await assert.rejects(pace(()=>{throw Error('POST must not start');},undefined,async()=>{throw Error('Pinned preflight failed');}),/Pinned preflight failed/u);
});
