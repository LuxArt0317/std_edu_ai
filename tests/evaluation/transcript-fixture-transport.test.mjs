import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {test} from 'node:test';
import {createTranscriptFixtureApplicationFetch,LiveFixtureError,prepare} from './live-fixtures.mjs';
import {buildTranscriptReplayPlan} from './transcript-replay.mjs';
import {createPinnedDeploymentVerifier} from './pinned-deployment.mjs';

const origin='https://std-edu-ai-replay-v1-d286.vercel.app',revision='a'.repeat(40),runId='17000000-0000-4000-8000-000000000001';
const owner='17000000-0000-4000-8000-000000000003',project='xiftudmvxphxcjtmfmib';
const plan=()=>buildTranscriptReplayPlan({runId,sessionId:'17000000-0000-4000-8000-000000000002',sourceRevision:revision});
const params=()=>({runId,cases:structuredClone(plan().cases),now:plan().now,origin,approvedPreviewOrigin:origin,expectedReleaseRevision:revision});
const manifest=()=>({version:1,source:'vercel-git',environment:'preview',revision,builtAt:'2026-11-15T01:00:00.000Z'});
const fixture=()=>({profile:{userId:owner},student:{id:'17000000-0000-4000-8000-000000000004'},marker:'SYNTHETIC PRIVATE RECORD'});
const source=await readFile(new URL('./live-fixtures.mjs',import.meta.url),'utf8');
const section=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b).replaceAll('export async function ','async function ').replaceAll('export function ','function ');};

test('scoped application hook is inert and permits only exact manifest and owned snapshot GETs',async()=>{
  const seen=[];
  const fetchImpl=async(url,options)=>{seen.push({url,options});return Response.json(url.endsWith('/release.json')?manifest():fixture());};
  const scoped=createTranscriptFixtureApplicationFetch({origin,fetchImpl});assert.equal(seen.length,0);
  const pin=createPinnedDeploymentVerifier({origin,approvedPreviewOrigin:origin,expectedRevision:revision,fetchImpl:scoped});await pin.pin();
  const response=await scoped(origin+'/api/affairs-data',{headers:{Authorization:'Bearer SYNTHETIC_CALLER'}});
  assert.deepEqual(await response.json(),fixture());assert.equal(response.url,origin+'/api/affairs-data');
  assert.deepEqual(seen.map(row=>new URL(row.url).pathname),['/release.json','/api/affairs-data']);
  for(const row of seen){assert.equal(row.options.method,'GET');assert.equal(row.options.redirect,'error');assert.equal(row.options.credentials,'omit');assert.equal(row.options.cache,'no-store');}
  assert.equal(seen[0].options.headers.get('authorization'),null);assert.equal(seen[1].options.headers.get('authorization'),'Bearer SYNTHETIC_CALLER');
});

test('write endpoints, other origins, queries, header credentials and unauthenticated snapshots never dispatch',async()=>{
  let calls=0;const scoped=createTranscriptFixtureApplicationFetch({origin,fetchImpl:async()=>{calls++;assert.fail('No request');}});
  for(const [url,options]of [[origin+'/api/affairs-assistant',{method:'POST'}],[origin+'/api/affairs-conversations',{}],
    ['https://'+project+'.supabase.co/auth/v1/token',{method:'POST',body:'refresh secret'}],['https://foreign.invalid/api/affairs-data',{}],
    [origin+'/api/affairs-data?scope=admin',{}],[origin+'/api/affairs-data#hash',{}],[origin+'/api/affairs-data',{headers:{Authorization:'Bearer token',apikey:'SERVICE_KEY'}}],
    [origin+'/release.json',{headers:{Authorization:'Bearer token'}}],[origin+'/api/affairs-data',{}],[origin+'/api/affairs-data',{method:'HEAD',headers:{Authorization:'Bearer token'}}],
    [origin+'/api/affairs-data',{headers:{Authorization:'Bearer token',Cookie:'PRIVATE_COOKIE'}}]]){
    await assert.rejects(scoped(url,options),{code:'fixture-target'});
  }
  assert.equal(calls,0);
});

test('actual prepare rejects altered, partial, reordered or unrelated packet scope before application or credential access',async()=>{
  let calls=0;const applicationFetch=async()=>{calls++;throw Error('must not run');};
  for(const mutate of [p=>{p.cases.pop();},p=>{p.cases.reverse();},p=>{p.cases[1].question='Show all grades';},p=>{p.cases[1].fixtureKey='native';},
    p=>{p.cases[1].expected.requiredTools.push('academicGrades');},p=>{p.cases[1].route='/dtm';},p=>{p.cases[1].fixtureRequirement='published_catalog_binding';},
    p=>{p.approvedPreviewOrigin=undefined;},p=>{p.fixtureMode='fee-remission-only';}]){
    const value={...params(),applicationFetch};mutate(value);await assert.rejects(prepare(value),{code:'fixture-config'});
  }
  assert.equal(calls,0);
});

function isolatedPreparation({applicationFetch,invalidEnvironment=false}={}){
  let credentials=0,authOptions,dbCalls=0;const seen=[],root='/synthetic';
  const context={URL,Headers,Response,AbortSignal,Buffer,TextDecoder,TextEncoder,setTimeout,clearTimeout,structuredClone,resolve,process:{cwd:()=>root},
    state:undefined,ROOT:root,PROJECT:project,PRIVATE_DIR:'/synthetic/artifacts',UUID:/^[a-f0-9-]{36}$/iu,LiveFixtureError,
    fail:(code,message)=>{throw new LiveFixtureError(code,message);},createTranscriptFixtureApplicationFetch,createPinnedDeploymentVerifier,
    fetch:async(url)=>{seen.push(String(url));return Response.json({});},signals:signal=>signal,
    readFile:async path=>path.endsWith('deployment.json')?JSON.stringify({repository:'LuxArt0317/std_edu_ai',supabase:{projectRef:project},vercel:{productionUrl:'https://stu.best'}}):path.endsWith('.gitignore')?'artifacts/\n':'synthetic certificate',
    deploymentEnvironment:()=>{credentials++;if(invalidEnvironment)throw Error('SYNTHETIC_STOP_AFTER_PIN');return {SUPABASE_URL:'https://'+project+'.supabase.co',DATABASE_URL:'postgres://synthetic@db.'+project+'.supabase.co/postgres',SUPABASE_PUBLISHABLE_KEY:'SYNTHETIC_PUBLIC',SUPABASE_SECRET_KEY:'SYNTHETIC_SERVICE'};},
    mkdir:async()=>{},chmod:async()=>{},createClient:(_url,_key,options)=>{authOptions=options;return {};},
    postgres:()=>({reserve:async()=>{dbCalls++;throw Error('No database opened');}}),query:task=>task(),cleanup:async()=>{},diagnostic:()=>'',
  };
  vm.createContext(context);const code=section('const transcriptFixtureCases=','/** Only release metadata')
    +section('export async function prepare(','function ownState(')+'\n({prepare,getState:()=>state});';
  const api=vm.runInContext(code,context);
  return {api,context,seen,get credentials(){return credentials;},get authOptions(){return authOptions;},get dbCalls(){return dbCalls;},run:()=>api.prepare({...params(),applicationFetch})};
}

test('actual preparation control flow uses injected pin before any credentials or database attempt',async()=>{
  for(const response of [new Response(null,{status:302,headers:{location:'https://vercel.com/login'}}),Response.json({...manifest(),revision:'b'.repeat(40)})]){
    const life=isolatedPreparation({applicationFetch:async()=>response});await assert.rejects(life.run(),{code:'fixture-target'});
    assert.equal(life.credentials,0);assert.equal(life.dbCalls,0);assert.deepEqual(life.seen,[]);
  }
  const app=[];const life=isolatedPreparation({invalidEnvironment:true,applicationFetch:async(url,options)=>{app.push({url,options});return Response.json(manifest());}});
  await assert.rejects(life.run(),/SYNTHETIC_STOP_AFTER_PIN/u);assert.equal(life.credentials,1);assert.equal(life.dbCalls,0);
  assert.equal(app.length,1);assert.equal(new Headers(app[0].options.headers).get('authorization'),null);assert.deepEqual(life.seen,[]);
});

test('captured application hook is not used for synthetic service credentials, Auth clients or session renewal transport',async()=>{
  const app=[];const life=isolatedPreparation({applicationFetch:async(url,options)=>{app.push({url,options});return Response.json(manifest());}});
  await assert.rejects(life.run(),{code:'fixture-prepare'});assert.equal(life.credentials,1);assert.equal(life.dbCalls,1);
  const captured=life.api.getState();assert.equal(typeof captured.applicationFetch,'function');assert.notEqual(captured.applicationFetch,captured.boundedFetch);
  assert.equal(life.authOptions.global.fetch,captured.boundedFetch);
  await life.authOptions.global.fetch('https://'+project+'.supabase.co/auth/v1/user');
  assert.deepEqual(life.seen,['https://'+project+'.supabase.co/auth/v1/user']);assert.equal(app.length,1);
  assert.doesNotMatch(JSON.stringify(app),/SYNTHETIC_SERVICE|refresh_token/u);
  const ledger=section('async function saveLedger(','async function readSnapshot(');assert.doesNotMatch(ledger,/applicationFetch|boundedFetch/u);
});

test('real readSnapshot uses the captured hook for setup and before/after reads and preserves its caller boundary',async()=>{
  const calls=[];let current=fixture(),renewals=0;
  const applicationFetch=createTranscriptFixtureApplicationFetch({origin,fetchImpl:async(url,options)=>{calls.push({url,token:new Headers(options.headers).get('authorization')});return Response.json(current);}});
  const user={id:owner,token:'SYNTHETIC_CALLER',renewSession:async()=>{renewals++;}};
  const context={URL,Buffer,LiveFixtureError,state:{origin,applicationFetch,users:[user]},FOREIGN_MARKER:'FOREIGN PRIVATE SENTINEL',signals:()=>undefined,
    fail:(code,message)=>{throw new LiveFixtureError(code,message);},fetch:async()=>assert.fail('No raw app fetch')};vm.createContext(context);
  const read=vm.runInContext(section('async function readSnapshot(','async function createFixtureUser(')+'\nreadSnapshot;',context);
  for(const _phase of ['setup','before','after'])assert.deepEqual(JSON.parse(JSON.stringify(await read(user))),fixture());
  assert.equal(calls.length,3);assert.equal(renewals,3);assert.ok(calls.every(row=>row.url===origin+'/api/affairs-data'&&row.token==='Bearer SYNTHETIC_CALLER'));
  current={profile:{userId:'17000000-0000-4000-8000-000000000099'}};await assert.rejects(read(user),{code:'fixture-isolation'});
  current={...fixture(),marker:'FOREIGN PRIVATE SENTINEL'};await assert.rejects(read(user),{code:'fixture-isolation'});
});

test('default snapshot and preparation paths retain original raw transport behavior',async()=>{
  let calls=0;const user={id:owner,token:'SYNTHETIC_CALLER'},context={URL,Buffer,LiveFixtureError,state:{origin,users:[user]},FOREIGN_MARKER:'FOREIGN PRIVATE SENTINEL',signals:()=>undefined,
    fail:(code,message)=>{throw new LiveFixtureError(code,message);},fetch:async()=>{calls++;return Response.json(fixture());}};
  vm.createContext(context);const read=vm.runInContext(section('async function readSnapshot(','async function createFixtureUser(')+'\nreadSnapshot;',context);
  assert.deepEqual(JSON.parse(JSON.stringify(await read(user))),fixture());assert.equal(calls,1);
  assert.match(source,/fetchImpl:s\.boundedFetch/u);assert.match(source,/global:\{fetch:s\.boundedFetch\}/u);
});

test('actual per-case entry rejects changed packet scope before any fixture read or mutation',async()=>{
  const context={LiveFixtureError,ready:()=>({applicationFetch:()=>{},current:null}),fail:(code,message)=>{throw new LiveFixtureError(code,message);}};
  vm.createContext(context);
  const forCase=vm.runInContext(section('const transcriptFixtureCases=','/** Only release metadata')
    +section('export async function forCase(','export async function afterCase(')+'\nforCase;',context);
  for(const mutate of [row=>{row.question='Show all grades';},row=>{row.route='/dtm';},row=>{row.fixtureKey='native';},
    row=>{row.expected.requiredTools.push('academicGrades');},row=>{row.fixtureRequirement='published_catalog_binding';},row=>{row.id='account:unrelated';}]){
    const row=structuredClone(plan().cases[1]);mutate(row);
    await assert.rejects(forCase(row),{code:'fixture-config'});
  }
});

test('response redirects, wrong URL, malformed JSON and oversize bodies fail closed',async()=>{
  for(const response of [new Response(null,{status:302}),Object.defineProperty(Response.json(fixture()),'url',{value:'https://foreign.invalid/api/affairs-data'}),
    new Response('<html>sign in</html>',{headers:{'content-type':'text/html'}}),new Response('{invalid',{headers:{'content-type':'application/json'}}),
    Response.json('x'.repeat(4097))]){
    const scoped=createTranscriptFixtureApplicationFetch({origin,fetchImpl:async()=>response});
    await assert.rejects(scoped(origin+'/release.json'),{code:'fixture-readback'});
  }
});

test('deadline/cancellation stop pending fetch and body work; late bodies are cancelled without a retry',async()=>{
  let release,cancelled=0,calls=0;
  const scoped=createTranscriptFixtureApplicationFetch({origin,timeoutMs:10,fetchImpl:async()=>{calls++;return new Promise(resolve=>{release=resolve;});}});
  await assert.rejects(scoped(origin+'/release.json'),error=>error.code==='fixture-readback'&&!error.message.includes('SYNTHETIC'));
  release(new Response(new ReadableStream({cancel(){cancelled++;}}),{headers:{'content-type':'application/json'}}));
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(cancelled,1);assert.equal(calls,1);
  let bodyCancelled=0;const stalled=createTranscriptFixtureApplicationFetch({origin,timeoutMs:10,fetchImpl:async()=>new Response(new ReadableStream({cancel(){bodyCancelled++;}}),{headers:{'content-type':'application/json'}})});
  await assert.rejects(stalled(origin+'/release.json'),{code:'fixture-readback'});assert.equal(bodyCancelled,1);
  const abort=new AbortController();abort.abort();let attempted=0;
  const stopped=createTranscriptFixtureApplicationFetch({origin,signal:abort.signal,fetchImpl:async()=>{attempted++;assert.fail();}});
  await assert.rejects(stopped(origin+'/release.json'),{code:'fixture-readback'});assert.equal(attempted,0);
});

test('empty stream chunks are bounded independently of bytes and cannot indefinitely starve the deadline',async()=>{
  let chunks=0,cancelled=0;
  const scoped=createTranscriptFixtureApplicationFetch({origin,fetchImpl:async()=>new Response(new ReadableStream({
    pull(controller){chunks++;controller.enqueue(new Uint8Array());},cancel(){cancelled++;},
  }),{headers:{'content-type':'application/json'}})});
  await assert.rejects(scoped(origin+'/release.json'),{code:'fixture-readback'});
  assert.ok(chunks<=4098);assert.equal(cancelled,1);
});

test('exact transcript fixture is written once and reread around all four ordered cases',async()=>{
  const packet=plan(),golden={oneOwner:'synthetic',courses:['A','B']},observed=structuredClone(golden);
  const events=[],bind={publishedSampleBinding:true};
  const makeState=()=>({applicationFetch:()=>{},now:packet.now,users:[
    {id:owner,token:'SYNTHETIC_OWNER'},{id:'17000000-0000-4000-8000-000000000099',token:'SYNTHETIC_OTHER'},
  ],supplementalTables:new Set(),sql:{},prepared:true,current:null});
  let state=makeState();
  const context={LiveFixtureError,state,ready:()=>state,PROJECT:project,fixtureForCase:()=>structuredClone(golden),assertSupported:()=>{},
    readNativeBindings:async()=>{events.push('bind');return bind;},recordsToInsert:()=>({}),planSupplementalFixture:()=>({rows:{},domains:[]}),
    persistSnapshot:async()=>{events.push('seed');},readSnapshot:async()=>{events.push('snapshot');return structuredClone(observed);},
    verifyReadback:()=>{},verifyNativeFixtureReadback:()=>{},verifyPublishedSampleFixtureBinding:async()=>{events.push('recheck');return true;},
    readSupplementalFixtureScopes:async()=>({}),verifySupplementalFixtureReadback:()=>{},
    SUPPLEMENTAL_SCOPES:{},SUPPLEMENTAL_TABLES:{},ownState:value=>value,hash:value=>JSON.stringify(value),saveLedger:async()=>{},
    fail:(code,message)=>{throw new LiveFixtureError(code,message);}
  };
  vm.createContext(context);
  const methods=vm.runInContext(section('const transcriptFixtureCases=','/** Only release metadata')
    +section('export async function forCase(','/** Removes only')+'\n({forCase,afterCase});',context);
  await assert.rejects(methods.forCase(packet.cases[1]),{code:'fixture-config'});
  for(const row of packet.cases){
    const caller=await methods.forCase(row);
    assert.equal(caller.token,'SYNTHETIC_OWNER');
    await assert.rejects(methods.forCase(row),{code:'fixture-state'});
    const envelope={statusCode:200};
    await methods.afterCase(row,envelope);
    assert.deepEqual(envelope.stateBefore,envelope.stateAfterProposal);
  }
  await assert.rejects(methods.forCase(packet.cases[0]),{code:'fixture-config'});
  assert.equal(events.filter(item=>item==='bind').length,1);
  assert.equal(events.filter(item=>item==='seed').length,1);
  assert.equal(events.filter(item=>item==='snapshot').length,8);
  assert.equal(events.filter(item=>item==='recheck').length,8);
  state=makeState();context.state=state;
  await methods.forCase(packet.cases[0]);
  await methods.afterCase(packet.cases[0],{statusCode:200});
  observed.courses.push('unexpected');
  await assert.rejects(methods.forCase(packet.cases[1]),{code:'fixture-readback'});
  observed.courses.pop();
  await assert.rejects(methods.forCase(packet.cases[1]),{code:'fixture-state'});
  assert.equal(events.filter(item=>item==='seed').length,2);
  state=makeState();context.state=state;
  await methods.forCase(packet.cases[0]);
  await methods.afterCase(packet.cases[0],{statusCode:503});
  await assert.rejects(methods.forCase(packet.cases[1]),{code:'fixture-state'});
});
