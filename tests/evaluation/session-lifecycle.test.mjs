import {nativeInternshipSetupRequired} from './internship-native-runner.mjs';
import {nativeStudentLeaveSetupRequired} from './student-leave-runner.mjs';
import {isElearningPublishedReadbackCase} from './elearning-catalog-runner.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import vm from 'node:vm';
import {attachFixtureSession,readSupplementalFixtureScopes,reconcileFixtureIdentity,LiveFixtureError,protectedOwnerFingerprintDigest,assertProtectedOwnerUnchanged} from './live-fixtures.mjs';

const project='xiftudmvxphxcjtmfmib',url='https://'+project+'.supabase.co';
const owner='10000000-0000-4000-8000-000000000001',foreign='20000000-0000-4000-8000-000000000002';
const sessionId='30000000-0000-4000-8000-000000000003',runId='40000000-0000-4000-8000-000000000004';
const epoch=Date.parse('2026-11-13T00:00:00Z');
const jwt=claims=>[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify(claims)).toString('base64url'),'SYNTHETIC_SIGNATURE'].join('.');
const session=(now=epoch,n=1,claims={})=>{
  const exp=Math.floor(now/1000)+3600;
  return {access_token:jwt({sub:owner,iss:url+'/auth/v1',role:'authenticated',aud:'authenticated',session_id:sessionId,exp,...claims}),refresh_token:'SYNTHETIC_REFRESH_'+n,token_type:'bearer',expires_at:exp,user:{id:owner}};
};
const secretError=error=>{assert.equal(error.code,'fixture-session');assert.doesNotMatch(error.message,/SYNTHETIC_REFRESH|SYNTHETIC_SIGNATURE|PRIVATE|https?:|10000000|30000000|eyJ/);assert.equal(error.cause,undefined);return true;};
const options=(extra={})=>({url,publishable:'SYNTHETIC_PUBLIC',clock:()=>epoch,fetchImpl:async()=>{throw new Error('Unexpected network');},...extra});

test('a synthetic session renews across multiple hours with exact rotated refresh tokens and no initial request',async()=>{
  let now=epoch;const calls=[];
  const user=attachFixtureSession({id:owner,token:null},session(),options({clock:()=>now,fetchImpl:async(input,init)=>{
    calls.push(JSON.parse(init.body));assert.equal(String(input),url+'/auth/v1/token?grant_type=refresh_token');
    assert.equal(init.method,'POST');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');
    assert.deepEqual(init.headers,{apikey:'SYNTHETIC_PUBLIC','Content-Type':'application/json'});
    return Response.json(session(now,calls.length+1));
  }}));
  const first=user.token;await user.renewSession();assert.equal(calls.length,0);
  for(let hour=1;hour<=3;hour++){
    now+=3590_000;await user.renewSession();assert.notEqual(user.token,first);
    assert.equal(JSON.parse(Buffer.from(user.token.split('.')[1],'base64url')).sub,owner);
    await user.renewSession();assert.equal(calls.length,hour);
  }
  assert.deepEqual(calls,[1,2,3].map(n=>({refresh_token:'SYNTHETIC_REFRESH_'+n})));
  assert.deepEqual(JSON.parse(JSON.stringify(user)),{id:owner});
  assert.throws(()=>{user.id=foreign;},TypeError);assert.throws(()=>{user.token='PRIVATE_REPLACEMENT';},secretError);
  user.clearSession();assert.equal(user.token,null);await assert.rejects(user.renewSession(),secretError);
});

test('concurrent lookups share one refresh and actual scoped reads receive only the renewed caller token',async()=>{
  let now=epoch,refreshes=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  const user=attachFixtureSession({id:owner},session(),options({clock:()=>now,fetchImpl:async()=>{refreshes++;await gate;return Response.json(session(now,2));}}));
  now+=3500_000;const old=user.token,headers=[];
  const read=()=>readSupplementalFixtureScopes(user,['tuition'],{origin:'https://stu.best',fetchImpl:async(input,init)=>{
    assert.equal(String(input),'https://stu.best/api/affairs-data?scope=tuition-documents');headers.push(init.headers.Authorization);return Response.json({periods:[],settlements:[]});
  }});
  const pending=Promise.all([read(),read(),user.renewSession()]);release();await pending;
  assert.equal(refreshes,1);assert.equal(headers.length,2);assert.ok(headers.every(value=>value==='Bearer '+user.token&&value!=='Bearer '+old));
  user.clearSession();
});

test('rejected, malformed and foreign-session refreshes fail closed once without exposing provider errors',async()=>{
  const variants=[
    async()=>{throw new Error('PRIVATE_TOKEN_AND_PASSWORD');},
    ...[401,403,429,500].map(status=>async()=>Response.json({error:'PRIVATE_PROVIDER_BODY'},{status})),
    async()=>Response.json({...session(epoch+3500_000,2),user:{id:foreign}}),
    async()=>Response.json(session(epoch+3500_000,2,{sub:foreign})),
    async()=>Response.json(session(epoch+3500_000,2,{session_id:runId})),
    async()=>Response.json(session(epoch+3500_000,2,{iss:'https://foreign.invalid/auth/v1'})),
    async()=>Response.json(session(epoch+3500_000,2,{role:'service_role'})),
    async()=>Response.json(session(epoch+3500_000,2,{exp:Math.floor((epoch+3500_000)/1000)+120})),
    async()=>Response.json({...session(epoch+3500_000,2),refresh_token:''}),
    async()=>new Response('PRIVATE_NOT_JSON',{headers:{'content-type':'application/json'}}),
    async()=>new Response(new Uint8Array([255,254]),{headers:{'content-type':'application/json'}}),
    async()=>new Response('PRIVATE',{headers:{'content-type':'application/json','content-length':'65537'}}),
    async()=>new Response('x'.repeat(65537),{headers:{'content-type':'application/json'}}),
  ];
  for(const response of variants){
    let now=epoch,calls=0;
    const user=attachFixtureSession({id:owner},session(),options({clock:()=>now,fetchImpl:async()=>{calls++;return response();}}));
    now+=3500_000;await assert.rejects(user.renewSession(),secretError);assert.equal(user.token,null);
    await assert.rejects(user.renewSession(),secretError);assert.equal(calls,1);
    assert.doesNotMatch(JSON.stringify(user),/PRIVATE|REFRESH|access_token|refresh_token|session_id/);
  }
});

test('invalid initial identity or JWT expiry never installs a session or contacts Auth',()=>{
  for(const value of [{...session(),user:{id:foreign}},session(epoch,1,{sub:foreign}),session(epoch,1,{exp:Math.floor(epoch/1000)-1}),{...session(),access_token:'PRIVATE_INVALID_JWT'}]){
    let calls=0;const user={id:owner,token:null};
    assert.throws(()=>attachFixtureSession(user,value,options({fetchImpl:async()=>{calls++;}})),secretError);
    assert.equal(calls,0);assert.equal(user.token,null);assert.equal(user.renewSession,undefined);
  }
});

test('stalled transport and body are bounded and closing an in-flight refresh prevents credential resurrection',async()=>{
  for(const response of [()=>new Promise(()=>{}),()=>Promise.resolve(new Response(new ReadableStream({start(){}}),{headers:{'content-type':'application/json'}}))]){
    let now=epoch,calls=0;
    const user=attachFixtureSession({id:owner},session(),options({clock:()=>now,timeoutMs:10,fetchImpl:async()=>{calls++;return response();}}));
    now+=3500_000;await assert.rejects(user.renewSession(),secretError);assert.equal(calls,1);assert.equal(user.token,null);
  }
  let now=epoch,release,observedSignal;
  const gate=new Promise(resolve=>{release=resolve;});
  const user=attachFixtureSession({id:owner},session(),options({clock:()=>now,fetchImpl:async(_input,init)=>{observedSignal=init.signal;await gate;return Response.json(session(now,2));}}));
  now+=3500_000;const pending=user.renewSession();user.clearSession();release();
  await assert.rejects(pending,secretError);assert.equal(observedSignal.aborted,true);assert.equal(user.token,null);
  await assert.rejects(user.renewSession(),secretError);
});

test('an aborted evaluation does not start refresh and mid-refresh cancellation clears credentials',async()=>{
  let now=epoch,calls=0;const abort=new AbortController();
  const user=attachFixtureSession({id:owner},session(),options({clock:()=>now,signal:abort.signal,fetchImpl:async()=>{calls++;return new Promise(()=>{});}}));
  now+=3500_000;abort.abort();await assert.rejects(user.renewSession(),{code:'fixture-aborted'});assert.equal(calls,0);user.clearSession();
  const activeAbort=new AbortController();now=epoch;
  const active=attachFixtureSession({id:owner},session(),options({clock:()=>now,signal:activeAbort.signal,fetchImpl:async()=>{calls++;return new Promise(()=>{});}}));
  now+=3500_000;const pending=active.renewSession();activeAbort.abort();await assert.rejects(pending,secretError);assert.equal(active.token,null);assert.equal(calls,1);
});

test('a per-call signal cannot override cancellation of the attached evaluation lifecycle',async()=>{
  let now=epoch,calls=0;const run=new AbortController(),caller=new AbortController();
  const user=attachFixtureSession({id:owner},session(),options({clock:()=>now,signal:run.signal,fetchImpl:async()=>{calls++;return Response.json(session(now,2));}}));
  now+=3500_000;run.abort();
  await assert.rejects(user.renewSession({signal:caller.signal}),{code:'fixture-aborted'});assert.equal(calls,0);user.clearSession();
  let release;now=epoch;const activeRun=new AbortController(),gate=new Promise(resolve=>{release=resolve;});
  const active=attachFixtureSession({id:owner},session(),options({clock:()=>now,signal:activeRun.signal,fetchImpl:async()=>{calls++;await gate;return Response.json(session(now,2));}}));
  now+=3500_000;const pending=active.renewSession({signal:caller.signal});activeRun.abort();release();
  await assert.rejects(pending,secretError);assert.equal(calls,1);assert.equal(active.token,null);
});

test('a joining caller can cancel its own pending wait without cancelling or duplicating the shared refresh',async()=>{
  let now=epoch,calls=0,release;const gate=new Promise(resolve=>{release=resolve;});
  const firstCaller=new AbortController(),joiningCaller=new AbortController();
  const user=attachFixtureSession({id:owner},session(),options({clock:()=>now,fetchImpl:async()=>{calls++;await gate;return Response.json(session(now,2));}}));
  now+=3500_000;
  const first=user.renewSession({signal:firstCaller.signal}),joining=user.renewSession({signal:joiningCaller.signal});
  joiningCaller.abort();await assert.rejects(joining,{code:'fixture-aborted'});
  assert.equal(calls,1);release();await first;assert.equal(calls,1);assert.equal(user.token,session(now,2).access_token);
  await user.renewSession();assert.equal(calls,1);user.clearSession();
});

const source=await readFile(new URL('./live-fixtures.mjs',import.meta.url),'utf8');
const section=(start,end)=>{const a=source.indexOf(start),b=end?source.indexOf(end,a):source.length;assert.ok(a>=0&&b>a);return source.slice(a,b).replaceAll('export async function ','async function ').replaceAll('export function ','function ');};

test('actual ledger projection remains secret-free before and after renewal',async()=>{
  let now=epoch;const user=attachFixtureSession({id:owner},session(),options({clock:()=>now,fetchImpl:async()=>Response.json(session(now,2))}));
  const protectedOwnerBefore={id:foreign,auth_hash:'a'.repeat(32),profile_hash:'b'.repeat(32),identities_hash:'c'.repeat(32)};
  const writes=[];const context={state:{protectedOwnerBefore,ledger:'private-ledger',ledgerOwned:true,closed:false,ledgerTempOwned:false,runId,origin:'https://stu.best',startedAt:'2026-11-13',users:[user],identityRequests:[{id:owner,email:'synthetic@example.invalid',runId,state:'created'}],recordIds:new Set()},PROJECT:project,protectedOwnerFingerprintDigest,
    open:async()=>({writeFile:async value=>writes.push(value),sync:async()=>{},close:async()=>{}}),rename:async()=>{},chmod:async()=>{},fail:(code,message)=>{throw new LiveFixtureError(code,message);}};
  const save=vm.runInNewContext(section('async function saveLedger(','async function readSnapshot(')+'\nsaveLedger;',context);
  await save();now+=3500_000;await user.renewSession();await save();
  assert.equal(writes.length,2);assert.deepEqual(JSON.parse(writes[0]),JSON.parse(writes[1]));
  for(const serialized of writes){assert.doesNotMatch(serialized,/SYNTHETIC_|token|session|password|eyJ|auth_hash|profile_hash|identities_hash/);assert.deepEqual(JSON.parse(serialized).fixtureUserIds,[owner]);assert.deepEqual(JSON.parse(serialized).protectedOwner,{version:1,fingerprint:protectedOwnerFingerprintDigest(protectedOwnerBefore)});}
  user.clearSession();
});

test('actual cleanup clears every synthetic session before I/O on success, failure and closed retry',async()=>{
  for(const mode of ['success','delete-failure','identity-mismatch','missing-ledger','closed','connection-failure','ledger-failure']){
    const user=attachFixtureSession({id:owner},session(),options());let released=0,ended=0,deleted=0;
    const sql=strings=>{
      if(!Array.isArray(strings)||!strings.raw)return strings;
      assert.equal(user.token,null,'Credentials must be cleared before the first cleanup query.');
      const query=strings.join('?');
      if(query.includes('raw_user_meta_data'))return Promise.resolve([{id:owner,email:'synthetic@example.invalid',run_id:mode==='identity-mismatch'?foreign:runId}]);
      return Promise.resolve([]);
    };
    sql.release=async()=>{released++;};
    const protectedOwnerBefore={id:foreign,auth_hash:'a'.repeat(32),profile_hash:'b'.repeat(32),identities_hash:'c'.repeat(32)};
    const state={protectedOwnerBefore,protectedOwnerEmail:'protected-admin@example.invalid',runId,users:[user],identityRequests:[{id:owner,email:'synthetic@example.invalid',runId,state:'created'}],ledgerOwned:mode!=='missing-ledger',ledgerTempOwned:false,ledger:'private-ledger',closed:mode==='closed',closing:false,locked:true,sql,
      db:{end:async()=>{ended++;if(mode==='connection-failure')throw new Error('PRIVATE_DB_ERROR');}},admin:{auth:{admin:{deleteUser:async()=>{deleted++;return {error:mode==='delete-failure'?{message:'PRIVATE_AUTH_ERROR'}:null};}}}}};
    const context={state,UUID:/^[a-f0-9-]{36}$/i,PROJECT:project,ownTables:[],reconcileFixtureIdentity,LiveFixtureError,saveLedger:async()=>{},query:async work=>work(),pause:async()=>{},
      checkedProtectedOwnerFingerprint:value=>{protectedOwnerFingerprintDigest(value);return value;},readProtectedOwnerFingerprint:async()=>protectedOwnerBefore,assertProtectedOwnerUnchanged,
      rm:async()=>{if(mode==='ledger-failure')throw new Error('PRIVATE_LEDGER_ERROR');},fail:(code,message)=>{throw new LiveFixtureError(code,message);}};
    const cleanup=vm.runInNewContext(section('export async function cleanup(')+'\ncleanup;',context);
    if(mode==='success')assert.equal((await cleanup()).verified,true);else await assert.rejects(cleanup(),error=>{assert.equal(error.code,'fixture-cleanup');assert.doesNotMatch(error.message,/PRIVATE|SYNTHETIC_REFRESH/);return true;});
    assert.equal(user.token,null);await assert.rejects(user.renewSession(),secretError);
    assert.equal(released,mode==='closed'?0:1);assert.equal(ended,mode==='closed'?0:1);assert.equal(deleted,mode==='delete-failure'?3:['success','connection-failure','ledger-failure'].includes(mode)?1:0);
  }
});

test('actual forCase renews before fixture writes and again after readbacks, never replaying a model request',async()=>{
  let now=epoch,refreshes=0;const calls=[];
  const user=attachFixtureSession({id:owner,studentId:foreign},session(),options({clock:()=>now,fetchImpl:async(input)=>{assert.equal(String(input),url+'/auth/v1/token?grant_type=refresh_token');refreshes++;calls.push('refresh');return Response.json(session(now,refreshes+1));}}));
  now+=3500_000;const binding={},testCase={id:'catalog-only',fixtureRequirement:'published_catalog_binding',expected:{requiredTools:['courseCatalog']}};
  const state={users:[user,{id:foreign,token:'SYNTHETIC_OTHER_TOKEN'}],origin:'https://stu.best',now:'2026-11-13',current:null,catalogBindings:new Map([[testCase.id,binding]]),supplementalTables:new Set()};
  const context={nativeInternshipSetupRequired,nativeStudentLeaveSetupRequired,isElearningPublishedReadbackCase,state,ready:()=>state,fixtureForCase:()=>({}),assertSupported:()=>{},readNativeBindings:async()=>{throw new Error('No private seeding for catalog-only');},planSupplementalFixture:()=>({domains:[]}),
    readSnapshot:async()=>{calls.push('read');return {};},readSupplementalFixtureScopes:async()=>({}),verifySupplementalFixtureReadback:()=>{},SUPPLEMENTAL_TABLES:{},SUPPLEMENTAL_SCOPES:{},
    ownState:x=>x,hash:()=> 'hash',saveLedger:async()=>{calls.push('ledger');now+=3500_000;},verifyPublishedCatalogBinding:async()=>{calls.push('catalog');return 'digest';},
    fail:(code,message)=>{throw new LiveFixtureError(code,message);}};
  const forCase=vm.runInNewContext(section('export async function forCase(','/** Deliberately')+'\nforCase;',context);
  const result=await forCase(testCase);assert.equal(result.token,user.token);assert.equal(refreshes,2);
  assert.deepEqual(calls,['refresh','catalog','read','ledger','refresh']);
  user.clearSession();state.current=null;
  await assert.rejects(forCase(testCase),secretError);assert.equal(calls.length,5,'Closed sessions fail before any fixture operation.');
});
