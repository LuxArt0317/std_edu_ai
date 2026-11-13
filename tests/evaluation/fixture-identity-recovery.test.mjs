import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {reconcileFixtureIdentity,LiveFixtureError} from './live-fixtures.mjs';

const runId='10000000-0000-4000-8000-000000000001';
const userId='20000000-0000-4000-8000-000000000001';
const email='evaluation.student@example.invalid';
const request=(state='uncertain')=>({email,runId,state});
const row=()=>({id:userId,email,run_id:runId});

test('a timed-out Auth creation is recovered only by its exact email and run marker',()=>{
  for(const state of ['pending','uncertain','created','rejected']){
    assert.deepEqual(reconcileFixtureIdentity(request(state),[row()]),{userId,unresolved:false});
  }
  assert.deepEqual(reconcileFixtureIdentity({...request(),email:email.toUpperCase()},[row()]),{userId,unresolved:false});
});

test('an absent row does not prove a timed-out Auth create has stopped',()=>{
  for(const state of ['pending','uncertain'])assert.deepEqual(reconcileFixtureIdentity(request(state),[]),{userId:null,unresolved:true});
  for(const state of ['created','rejected'])assert.deepEqual(reconcileFixtureIdentity(request(state),[]),{userId:null,unresolved:false});
});

test('a foreign, pre-existing, duplicate or conflicting identity cannot authorize deletion',()=>{
  const foreignMarker='foreign-private-value';
  const unsafe=[
    [{...row(),run_id:foreignMarker}],
    [{...row(),run_id:null}],
    [{...row(),email:'someone-else@example.invalid'}],
    [{...row(),id:'not-a-uuid'}],
    [row(),row()],
  ];
  for(const rows of unsafe)assert.throws(()=>reconcileFixtureIdentity(request(),rows),error=>{
    assert.ok(error instanceof LiveFixtureError);assert.equal(error.code,'fixture-cleanup');
    assert.doesNotMatch(error.message,/foreign-private-value|someone-else|evaluation\.student|20000000/);return true;
  });
  assert.throws(()=>reconcileFixtureIdentity({...request('created'),id:'30000000-0000-4000-8000-000000000001'},[row()]),/ownership/);
  assert.throws(()=>reconcileFixtureIdentity({...request('created'),id:'invalid'},[]),/reconciliation/);
});

test('creation intent is durable before Auth mutation and unresolved cleanup is never certified',async()=>{
  const source=await readFile(new URL('./live-fixtures.mjs',import.meta.url),'utf8');
  const creation=source.slice(source.indexOf('async function createFixtureUser('),source.indexOf('/** No mutation occurs'));
  assert.ok(creation.indexOf('if(existing.length)')<creation.indexOf('s.identityRequests.push('));
  assert.ok(creation.indexOf('s.identityRequests.push(')<creation.indexOf('await saveLedger()'));
  assert.ok(creation.indexOf('await saveLedger()')<creation.indexOf('auth.admin.createUser('));
  const preparation=source.slice(source.indexOf('export async function prepare('),source.indexOf('function assertSupported('));
  assert.ok(preparation.indexOf('state.locked=true')<preparation.indexOf('await assertNoPendingRecoveryLedgers()'));
  assert.ok(preparation.indexOf('await assertNoPendingRecoveryLedgers()')<preparation.indexOf('await reserveLedger()'));
  assert.ok(preparation.indexOf('await reserveLedger()')<preparation.indexOf('await saveLedger()'));
  assert.ok(preparation.indexOf('await saveLedger()')<preparation.indexOf('await createFixtureUser('));
  const cleanup=source.slice(source.indexOf('export async function cleanup('));
  assert.ok(cleanup.indexOf('reconcileFixtureIdentity(request,rows)')<cleanup.indexOf('auth.admin.deleteUser('));
  assert.ok(cleanup.indexOf('if(unresolvedCreation)fail(')<cleanup.indexOf('verified=true'));
  assert.ok(cleanup.indexOf('verified=true')<cleanup.indexOf('rm(s.ledger'));
  const ledger=source.slice(source.indexOf('async function saveLedger('),source.indexOf('async function readSnapshot('));
  assert.match(ledger,/identityRequests:s\.identityRequests/);assert.doesNotMatch(ledger,/password|access_token|serviceKey/);
});
