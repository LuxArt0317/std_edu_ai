import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import vm from 'node:vm';
import {LiveFixtureError,readProtectedOwnerFingerprint,assertProtectedOwnerUnchanged,protectedOwnerFingerprintDigest,reconcileFixtureIdentity} from './live-fixtures.mjs';

const protectedId='90000000-0000-4000-8000-000000000001',fixtureId='90000000-0000-4000-8000-000000000002';
const runId='90000000-0000-4000-8000-000000000003',ownerEmail='protected-admin@example.invalid';
const fingerprint=()=>({id:protectedId,auth_hash:'a'.repeat(32),profile_hash:'b'.repeat(32),identities_hash:'c'.repeat(32)});
const safeError=error=>{
  assert.equal(error.code,'fixture-protected-owner');
  assert.doesNotMatch(error.message,/SECRET|@|90000000|aaaaaaaa|bbbbbbbb|cccccccc/);return true;
};
const source=await readFile(new URL('./live-fixtures.mjs',import.meta.url),'utf8');
const section=(start,end)=>{
  const a=source.indexOf(start),b=end?source.indexOf(end,a):source.length;
  assert.ok(a>=0&&b>a);return source.slice(a,b).replaceAll('export async function ','async function ').replaceAll('export function ','function ');
};

test('protected owner query returns bounded hashes for the exact confirmed Google administrator only',async()=>{
  const row=fingerprint();let calls=0;
  const result=await readProtectedOwnerFingerprint(async(strings,...values)=>{
    calls++;const query=strings.join('?');
    assert.deepEqual(values,[ownerEmail]);
    assert.match(query,/lower\(u\.email\)=lower\(\?\)/);
    assert.match(query,/email_confirmed_at is not null and p\.role='admin'/);
    assert.match(query,/g\.user_id=u\.id and g\.provider='google'/);
    assert.match(query,/limit 2\s*$/);
    assert.match(query,/order by i\.id/);
    assert.equal((query.match(/array\['last_sign_in_at','updated_at'\]/g)||[]).length,2);
    assert.match(query,/md5\(to_jsonb\(p\)::text\)/);
    assert.doesNotMatch(query,/\b(?:insert|update|delete|set_config)\b/i);
    return [row];
  },ownerEmail);
  assert.equal(calls,1);assert.deepEqual(result,row);assert.notEqual(result,row);assert.ok(Object.isFrozen(result));
  row.profile_hash='d'.repeat(32);assert.equal(result.profile_hash,'b'.repeat(32));
});

test('missing, ambiguous, malformed or sensitive owner projections fail closed without forwarding raw data',async()=>{
  for(const rows of [[],[fingerprint(),fingerprint()],null,[{...fingerprint(),id:'SECRET'}],[{...fingerprint(),auth_hash:'SECRET'}],
    [{...fingerprint(),profile_hash:null}],[{...fingerprint(),email:'SECRET@example.invalid'}]])
    await assert.rejects(readProtectedOwnerFingerprint(async()=>rows,ownerEmail),safeError);
  await assert.rejects(readProtectedOwnerFingerprint(async()=>{throw new Error('SECRET_DATABASE_PASSWORD');},ownerEmail),safeError);
  let calls=0;
  for(const email of [undefined,'','invalid','a@b@c.invalid','x'.repeat(255)+'@example.invalid'])
    await assert.rejects(readProtectedOwnerFingerprint(async()=>{calls++;return [fingerprint()];},email),safeError);
  assert.equal(calls,0);
});

test('each identity or profile change fails comparison; ledger digest contains no raw identity or hashes',()=>{
  const before=fingerprint();assert.equal(assertProtectedOwnerUnchanged(before,{...before}),true);
  for(const key of Object.keys(before))assert.throws(()=>assertProtectedOwnerUnchanged(before,{...before,[key]:key==='id'?fixtureId:'d'.repeat(32)}),safeError);
  assert.throws(()=>assertProtectedOwnerUnchanged(null,before),safeError);
  const digest=protectedOwnerFingerprintDigest(before);
  assert.match(digest,/^[a-f0-9]{64}$/);assert.equal(digest,protectedOwnerFingerprintDigest({...before}));
  assert.notEqual(digest,protectedOwnerFingerprintDigest({...before,profile_hash:'d'.repeat(32)}));
  assert.doesNotMatch(digest,/90000000|aaaaaaaa|bbbbbbbb|cccccccc/);
});

function cleanupRig({changed=false,readFails=false,deleteFails=false,missingBaseline=false,asOwner=false,pendingOwner=false}={}){
  const events=[],id=asOwner?protectedId:fixtureId;
  const request={email:'synthetic@example.invalid',runId,state:pendingOwner?'uncertain':'created',...(pendingOwner?{}:{id})};
  const users=pendingOwner?[]:[{id,token:'SESSION_SECRET'}];
  const sql=(strings,...values)=>{
    if(!Array.isArray(strings)||!strings.raw)return strings;
    assert.ok(users.every(user=>user.token===null));
    const text=strings.join('?');
    if(text.includes('as auth_hash')){
      events.push('owner-read');assert.deepEqual(values,[ownerEmail]);
      if(readFails)throw new Error('SECRET_OWNER_READ');
      return Promise.resolve([{...fingerprint(),...(changed?{profile_hash:'d'.repeat(32)}:{})}]);
    }
    if(text.includes('raw_user_meta_data'))return Promise.resolve([{id:pendingOwner?protectedId:id,email:request.email,run_id:runId}]);
    if(text.includes('pg_advisory_unlock'))events.push('unlock');
    else events.push('fixture-read');
    return Promise.resolve([]);
  };
  sql.release=async()=>events.push('release');
  const state={runId,users,identityRequests:[request],ledgerOwned:true,ledger:'private-ledger',ledgerTempOwned:false,closed:false,locked:true,sql,
    protectedOwnerEmail:ownerEmail,protectedOwnerBefore:missingBaseline?undefined:fingerprint(),
    db:{end:async()=>events.push('end')},admin:{auth:{admin:{deleteUser:async()=>{events.push('delete');if(deleteFails)throw new Error('SECRET_DELETE');return {error:null};}}}}};
  const context={state,UUID:/^[a-f0-9-]{36}$/i,PROJECT:'synthetic',ownTables:[],reconcileFixtureIdentity,LiveFixtureError,
    readProtectedOwnerFingerprint,assertProtectedOwnerUnchanged,protectedOwnerFingerprintDigest,
    query:async work=>work(),saveLedger:async()=>events.push('ledger'),rm:async()=>events.push('remove-ledger'),fail:(code,message)=>{throw new LiveFixtureError(code,message);}};
  const cleanup=vm.runInNewContext(section('function checkedProtectedOwnerFingerprint(','/** Read only the exact configured')+section('export async function cleanup(')+'\ncleanup;',context);
  return {cleanup,events,state};
}

test('successful cleanup verifies owner after fixture removal and before unlock/ledger deletion',async()=>{
  const rig=cleanupRig(),result=await rig.cleanup();assert.equal(result.verified,true);assert.equal(result.protectedOwnerUnchanged,true);
  const index=event=>rig.events.indexOf(event);
  assert.ok(index('delete')<index('owner-read'));assert.ok(index('owner-read')<index('unlock'));
  assert.ok(index('unlock')<index('release'));assert.ok(index('release')<index('end'));assert.ok(index('end')<index('remove-ledger'));
});

test('owner comparison still runs after deletion failure; any comparison failure retains ledger and closes connection',async()=>{
  for(const options of [{deleteFails:true},{changed:true},{readFails:true},{deleteFails:true,changed:true}]){
    const rig=cleanupRig(options);
    await assert.rejects(rig.cleanup(),error=>{
      assert.equal(error.code,options.changed||options.readFails?'fixture-protected-owner':'fixture-cleanup');
      assert.doesNotMatch(error.message,/SECRET|@|90000000/);return true;
    });
    assert.ok(rig.events.includes('owner-read'));assert.ok(rig.events.indexOf('owner-read')<rig.events.indexOf('unlock'));
    assert.ok(rig.events.includes('end'));assert.ok(!rig.events.includes('remove-ledger'));assert.equal(rig.state.closed,true);
    assert.ok(rig.state.users.every(user=>user.token===null));
  }
});

test('missing baseline or a protected identity in known/pending fixture reconciliation never authorizes deletion',async()=>{
  for(const options of [{missingBaseline:true},{asOwner:true},{pendingOwner:true}]){
    const rig=cleanupRig(options);await assert.rejects(rig.cleanup(),safeError);
    assert.ok(!rig.events.includes('delete'));assert.ok(!rig.events.includes('remove-ledger'));assert.ok(rig.events.includes('end'));
    assert.equal(rig.events.includes('owner-read'),!options.missingBaseline);
  }
});
