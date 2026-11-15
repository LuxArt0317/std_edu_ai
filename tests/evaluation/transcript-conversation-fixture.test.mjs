import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createTranscriptConversationFixture as create} from './transcript-conversation-fixture.mjs';
import {newConversationId} from '../../src/services/assistantConversationId.js';

const id=n=>'f1000000-0000-4000-8000-'+String(n).padStart(12,'0');
const runId=id(1),ownerId=id(2),otherId=id(3),conversationId=newConversationId();
const owners=[{id:ownerId,email:'assistant-eval-a@example.invalid'},{id:otherId,email:'assistant-eval-b@example.invalid'}];
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
function saveEntry(version=1,{received=true}={}){
  const messages=Array.from({length:version},(_,i)=>[{id:`turn-${i+1}:user`,role:'user',content:'Synthetic question '+(i+1)},
    {id:`turn-${i+1}:assistant`,role:'assistant',content:'Synthetic answer '+(i+1),phase:'complete',result:{answer:'Synthetic answer '+(i+1)}}]).flat();
  const pending={ownerId,conversationId,title:'Disposable four-turn transcript',expectedVersion:version,messageDigest:hash(messages),operation:'conversation_save',requestIndex:version*3,requestHash:String(version).repeat(64),sourceRevision:'a'.repeat(40)};
  const {operation:_operation,requestIndex:_requestIndex,...receipt}=pending;
  return {entry:{pending,received:received?receipt:null},row:{id:conversationId,user_id:ownerId,title:pending.title,messages,version,created_at:'2026-11-15 00:00:00+00',updated_at:`2026-11-15 00:0${version}:00+00`}};
}
function harness(){
  const document={version:1,binding:{runId,ownerId,conversationId,sourceRevision:'a'.repeat(40),suiteHash:'b'.repeat(64)},revision:0,entries:[],terminal:null};
  const state={rows:[],actions:[],identities:owners.map(owner=>({...owner,run_marker:runId,role:'student',google:true})),locked:true,lease:true,failPersist:false,failCommit:false,casDrift:false,extraAfterDelete:false};
  const calls=[],ledger=[];let transaction=null,journalRead=()=>structuredClone(document);
  const sql={unsafe:async(text,params=[])=>{
    calls.push({text,params:structuredClone(params)});
    if(text==='begin'){assert.equal(transaction,null);transaction=structuredClone(state.rows);return [];}
    if(text==='rollback'){if(transaction)state.rows=transaction;transaction=null;return [];}
    if(text==='commit'){transaction=null;if(state.failCommit){state.failCommit=false;throw Error('PRIVATE_DATABASE_CONNECTION');}return [];}
    if(text.startsWith('set local'))return [];
    if(text.includes('from pg_locks'))return state.locked?[{held:1}]:[];
    if(text.includes('from auth.users')){assert.deepEqual(params,[[ownerId,otherId]]);return structuredClone(state.identities);}
    if(text.startsWith('select pg_advisory_xact_lock')){assert.ok([ownerId,otherId].includes(params[0]));assert.ok(transaction);return [];}
    if(text.includes('from private.affairs_assistant_operations'))return structuredClone(state.actions);
    if(text.startsWith('select id,user_id,title,messages')){assert.deepEqual(params,[[ownerId,otherId],conversationId]);assert.match(text,/user_id=any\(\$1::uuid\[\]\) or id=\$2::uuid/u);return structuredClone(state.rows.filter(row=>[ownerId,otherId].includes(row.user_id)||row.id===conversationId).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,3));}
    if(text.startsWith('delete from public.affairs_conversations')){
      assert.ok(transaction);assert.match(text,/messages is not distinct from \$4::jsonb.*version=\$5::integer.*created_at=\$6::timestamptz.*updated_at=\$7::timestamptz/u);
      if(state.casDrift)state.rows[0].title='Unexpected concurrent title';
      const found=state.rows.find(row=>row.id===params[0]&&row.user_id===params[1]&&row.title===params[2]&&hash(row.messages)===hash(JSON.parse(params[3]))&&row.version===params[4]&&row.created_at===params[5]&&row.updated_at===params[6]);
      if(!found)return [];state.rows=state.rows.filter(row=>row!==found);
      if(state.extraAfterDelete)state.rows.push({...found,id:id(20)});
      return [{id:found.id,user_id:found.user_id}];
    }
    assert.fail('Unexpected SQL: '+text);
  }};
  const fixture=create({runId,owners:structuredClone(owners),conversationId,journal:{read:async()=>journalRead()},sql,
    assertLease:async()=>state.lease,persist:async value=>{if(state.failPersist)throw Error('PRIVATE_LEDGER');ledger.push(structuredClone(value));}});
  return {fixture,state,document,calls,ledger,setRead:fn=>{journalRead=fn;},install(version=1,options){const {entry,row}=saveEntry(version,options);document.entries.push(entry);document.revision++;state.rows=[row];return row;}};
}
const error=(promise,code)=>assert.rejects(promise,e=>e.code===code&&!/PRIVATE_|password|token/iu.test(e.message));
const deletes=h=>h.calls.filter(call=>call.text.startsWith('delete '));

test('reserve is durable before SQL, uses both owner/global reserved union, and yields credential-free exact readback',async()=>{
  const h=harness();await h.fixture.reserve();assert.equal(h.ledger[0].phase,'reserved');assert.equal(deletes(h).length,0);
  assert.deepEqual(await h.fixture.readback(),{version:0,messageDigest:null});
  for(let version=1;version<=4;version++){
    const row=h.install(version);assert.deepEqual(await h.fixture.readback(),{version,messageDigest:hash(row.messages)});
  }
  assert.equal(h.ledger.at(-1).saves.length,4);assert.doesNotMatch(JSON.stringify(h.fixture.recovery()),/Synthetic answer|Synthetic question|access_token|OFFLINE_/u);
  assert.ok(h.calls.every(call=>!/(?:insert|update)\s+(?:into\s+)?(?:auth\.|public\.)/iu.test(call.text)));
});

test('exact committed row cleanup compares all columns, deletes before Auth cleanup, and rechecks zero without identities',async()=>{
  const h=harness();await h.fixture.reserve();h.install();await h.fixture.readback();
  assert.deepEqual(await h.fixture.cleanup(),{verified:true,conversationRows:0});assert.equal(deletes(h).length,1);assert.deepEqual(h.state.rows,[]);
  assert.deepEqual(h.ledger.slice(-2).map(row=>row.phase),['deleting','deleted']);assert.ok(h.ledger.at(-2).deletion.rowDigest);
  h.state.identities=[];assert.deepEqual(await h.fixture.verifyAbsent(),{verified:true,conversationRows:0});
  assert.equal(h.calls.filter(call=>call.text.startsWith('select pg_advisory_xact_lock')).length,2);
  await error(h.fixture.readback(),'invalid_state');
});

test('a never-saved conversation has exact zero cleanup while a proved save missing from SQL is drift',async()=>{
  const empty=harness();await empty.fixture.reserve();await empty.fixture.cleanup();assert.equal(deletes(empty).length,0);await empty.fixture.verifyAbsent();
  const changed=harness();await changed.fixture.reserve();changed.install();changed.state.rows=[];
  await error(changed.fixture.cleanup(),'reconciliation_required');assert.equal(deletes(changed).length,0);
});

test('pending latest save may reconcile its exact committed row, but old/absent pending outcomes never authorize cleanup',async()=>{
  const committed=harness();await committed.fixture.reserve();committed.install(1,{received:false});await committed.fixture.cleanup();assert.equal(deletes(committed).length,1);
  for(const old of [false,true]){
    const h=harness();await h.fixture.reserve();if(old)h.install();
    const {entry}=saveEntry(old?2:1,{received:false});h.document.entries.push(entry);h.document.revision++;
    h.document.terminal={phase:'save',code:'timeout',disposition:'received',requestHash:entry.pending.requestHash};
    await error(h.fixture.cleanup(),'reconciliation_required');assert.equal(deletes(h).length,0);
  }
});

test('foreign reserved-ID ownership, unexpected own/B conversations, and private action receipts refuse deletion',async()=>{
  for(const make of [row=>[{...row,user_id:id(90)}],row=>[row,{...row,id:id(20)}],row=>[row,{...row,id:id(21),user_id:otherId}]]){
    const h=harness();await h.fixture.reserve();const row=h.install();h.state.rows=make(row);await error(h.fixture.cleanup(),'unexpected_conversations');assert.equal(deletes(h).length,0);
  }
  const h=harness();await h.fixture.reserve();h.install();h.state.actions=[{user_id:ownerId,request_id:id(30)}];await error(h.fixture.cleanup(),'unexpected_actions');assert.equal(deletes(h).length,0);
  const collision=harness();collision.state.rows=[saveEntry().row];await error(collision.fixture.reserve(),'conversation_exists');assert.equal(deletes(collision).length,0);
});

test('message/title/version and previously observed timestamp drift fail exact readback and cleanup',async()=>{
  for(const mutate of [row=>{row.title='Wrong';},row=>{row.messages[1].content='Wrong';},row=>{row.version=2;},row=>{row.updated_at='2026-11-15 02:00:00+00';},row=>{row.created_at='2026-11-15 00:00:01+00';}]){
    const h=harness();await h.fixture.reserve();h.install();await h.fixture.readback();mutate(h.state.rows[0]);await error(h.fixture.cleanup(),'reconciliation_required');assert.equal(deletes(h).length,0);
  }
});

test('exact two run-owned Google student identities and active physical lease are mandatory',async()=>{
  for(const mutate of [s=>{s.locked=false;},s=>{s.lease=false;},s=>{s.identities[0].run_marker=id(99);},s=>{s.identities[1].role='admin';},s=>{s.identities[1].google=false;},s=>{s.identities[0].email='real@example.com';}]){
    const h=harness();await h.fixture.reserve();h.install();mutate(h.state);await assert.rejects(h.fixture.cleanup(),e=>['lease_lost','identity_mismatch'].includes(e.code));assert.equal(deletes(h).length,0);
  }
});

test('malformed/changed journal binding, sequence and received commitments fail closed without raw private diagnostics',async()=>{
  for(const mutate of [d=>{d.binding.ownerId=otherId;},d=>{d.binding.conversationId=id(77);},d=>{d.binding.sourceRevision='c'.repeat(40);},d=>{d.entries[0].pending.expectedVersion=2;},d=>{d.entries[0].received.messageDigest='e'.repeat(64);},d=>{d.entries.push(structuredClone(d.entries[0]));}]){
    const h=harness();await h.fixture.reserve();h.install();mutate(h.document);await assert.rejects(h.fixture.cleanup(),e=>['journal_invalid','journal_changed'].includes(e.code));assert.equal(deletes(h).length,0);
  }
  const h=harness();let access=0;h.setRead(()=>Object.defineProperty({},'binding',{get(){access++;return {};}}));await error(h.fixture.reserve(),'journal_invalid');assert.equal(access,0);assert.equal(h.calls.length,0);
});

test('journal changes during read/cleanup cannot be mistaken for settled original state',async()=>{
  const h=harness();await h.fixture.reserve();h.install();let reads=0;
  h.setRead(()=>{if(++reads===2)h.document.revision++;return structuredClone(h.document);});await error(h.fixture.cleanup(),'journal_changed');assert.equal(deletes(h).length,0);
});

test('failed durable deletion intent stops before mutation and CAS mismatch rolls back atomically',async()=>{
  const h=harness();await h.fixture.reserve();h.install();h.state.failPersist=true;await error(h.fixture.cleanup(),'ledger_failed');assert.equal(deletes(h).length,0);assert.equal(h.state.rows.length,1);
  const drift=harness();await drift.fixture.reserve();drift.install();drift.state.casDrift=true;await error(drift.fixture.cleanup(),'delete_mismatch');assert.equal(drift.state.rows.length,1);assert.equal(drift.calls.at(-1).text,'rollback');
  const extra=harness();await extra.fixture.reserve();extra.install();extra.state.extraAfterDelete=true;await error(extra.fixture.cleanup(),'unexpected_conversations');assert.equal(extra.state.rows.length,1);assert.equal(extra.state.rows[0].id,conversationId);
});

test('uncertain committed delete retains intent, permits exact zero reconciliation, but never accepts a replacement row',async()=>{
  const h=harness();await h.fixture.reserve();h.install();h.state.failCommit=true;await error(h.fixture.cleanup(),'query_failed');assert.deepEqual(h.state.rows,[]);assert.equal(h.fixture.recovery().phase,'deleting');
  await h.fixture.cleanup();assert.equal(deletes(h).length,1);await h.fixture.verifyAbsent();
  const replacement=harness();await replacement.fixture.reserve();replacement.install();replacement.state.failCommit=true;await error(replacement.fixture.cleanup(),'query_failed');replacement.state.rows=[{...saveEntry().row,updated_at:'2026-11-15 03:00:00+00'}];await error(replacement.fixture.cleanup(),'reconciliation_required');assert.equal(deletes(replacement).length,1);
});

test('post-Auth proof still reads global reserved ID and both owners, rejects recreation and later journal work',async()=>{
  for(const change of [h=>{h.state.rows=[{...saveEntry().row,user_id:id(90)}];},h=>{h.document.revision++;}]){
    const h=harness();await h.fixture.reserve();h.install();await h.fixture.cleanup();h.state.identities=[];change(h);await assert.rejects(h.fixture.verifyAbsent());
  }
});

const source=await readFile(new URL('./live-fixtures.mjs',import.meta.url),'utf8');
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b).replaceAll('export async function ','async function ').replaceAll('export function ','function ');}
test('actual adapter binding returns only own ID and controlled readback, preserving caller-free cleanup metadata',async()=>{
  const seen=[],state={prepared:true,users:[{id:ownerId},{id:otherId}],runId,applicationFetch:()=>{},locked:true,ledgerOwned:true,
    identityRequests:owners.map(row=>({id:row.id,email:row.email,runId,state:'created'})),sql:{},protectedOwnerBefore:{},protectedOwnerEmail:'protected@example.invalid'};
  const context={state,Object,UUID:/^[0-9a-f-]{36}$/u,ready:()=>state,fail:(code)=>{throw Object.assign(Error(code),{code});},saveLedger:async()=>seen.push('ledger'),
    readProtectedOwnerFingerprint:async()=>({}),assertProtectedOwnerUnchanged:()=>{},createTranscriptConversationFixture:args=>{seen.push(args);return {reserve:async()=>{},readback:async()=>({version:1,messageDigest:'f'.repeat(64)})};}};
  vm.createContext(context);const api=vm.runInContext(section('export function transcriptFixtureIdentity(','export async function cleanup(')+'\n({transcriptFixtureIdentity,reserveTranscriptConversation});',context);
  assert.equal(JSON.stringify(api.transcriptFixtureIdentity()),JSON.stringify({ownerId}));
  const result=await api.reserveTranscriptConversation({conversationId,journal:{read:()=>{}}});assert.deepEqual(Object.keys(result),['ownerId','conversationId','readback']);assert.equal(result.ownerId,ownerId);
  assert.deepEqual(await result.readback(),{version:1,messageDigest:'f'.repeat(64)});assert.equal(seen[0].owners.length,2);
  await seen[0].persist({version:1,conversationId});assert.equal(state.transcriptConversationRecovery.conversationId,conversationId);assert.equal(seen.at(-1),'ledger');
  await assert.rejects(api.reserveTranscriptConversation({conversationId,journal:{}}),{code:'fixture-state'});
});

test('actual cleanup calls exact conversation deletion before Auth and zero proof after, retaining token erasure and protected owner check',async()=>{
  const body=source.slice(source.indexOf('export async function cleanup()'));
  assert.ok(body.indexOf('user.token=null')<body.indexOf('await s.transcriptConversation.cleanup()'));
  assert.ok(body.indexOf('await s.transcriptConversation.cleanup()')<body.indexOf('s.admin.auth.admin.deleteUser(user.id)'));
  assert.ok(body.indexOf('s.admin.auth.admin.deleteUser(user.id)')<body.indexOf('await s.transcriptConversation.verifyAbsent()'));
  assert.ok(body.indexOf('await s.transcriptConversation.verifyAbsent()')<body.indexOf('verified=true'));
  assert.match(body,/assertProtectedOwnerUnchanged\(s.protectedOwnerBefore/u);
});

test('actual cleanup control flow blocks Auth deletion on conversation drift and proves zero after successful deletion',async()=>{
  for(const refuse of [false,true]){
    const trace=[],requests=owners.map(owner=>({...owner,runId,state:'created'}));
    const users=owners.map(owner=>({id:owner.id,token:'SYNTHETIC_SESSION'}));
    const protectedOwner={id:id(80)},state={users,runId,identityRequests:requests,ledgerOwned:true,locked:true,protectedOwnerBefore:protectedOwner,protectedOwnerEmail:'protected@example.invalid',recordIds:new Set(),
      admin:{auth:{admin:{deleteUser:async userId=>{trace.push('auth:'+userId);return {};}}}},
      transcriptConversation:{cleanup:async()=>{assert.ok(users.every(user=>user.token===null));trace.push('conversation-delete');if(refuse)throw Object.assign(Error('safe drift'),{code:'reconciliation_required'});},verifyAbsent:async()=>{trace.push('conversation-zero');return {verified:true,conversationRows:0};}}};
    const sql=async(strings,...values)=>{
      if(!strings?.raw)return strings;
      const text=strings.join('?');
      if(text.includes('raw_user_meta_data')){const request=requests.find(row=>row.email===values[0]);return [{id:request.id,email:request.email,run_id:runId}];}
      if(text.includes('pg_advisory_unlock'))trace.push('unlock');
      return [];
    };sql.release=async()=>trace.push('release');state.sql=sql;state.db={end:async()=>trace.push('end')};
    class LiveFixtureError extends Error {constructor(code,message){super(message);this.code=code;}}
    const context={state,Set,UUID:/^[a-f0-9-]{36}$/u,PROJECT:'xiftudmvxphxcjtmfmib',ownTables:[],LiveFixtureError,query:work=>work(),
      fail:(code,message)=>{throw new LiveFixtureError(code,message);},checkedProtectedOwnerFingerprint:()=>{},
      assertProtectedOwnerUnchanged:()=>trace.push('protected-owner'),readProtectedOwnerFingerprint:async()=>protectedOwner,
      reconcileFixtureIdentity:(request,rows)=>{assert.equal(rows[0].run_id,runId);assert.equal(rows[0].id,request.id);return {userId:request.id,unresolved:false};},
      saveLedger:async()=>trace.push('ledger'),rm:async()=>trace.push('ledger-removed')};
    vm.createContext(context);const cleanup=vm.runInContext(source.slice(source.indexOf('export async function cleanup()')).replace('export async function ','async function ')+'\ncleanup;',context);
    if(refuse){await assert.rejects(cleanup());assert.equal(trace.some(step=>step.startsWith('auth:')),false);assert.equal(trace.includes('conversation-zero'),false);assert.equal(trace.includes('ledger-removed'),false);}
    else{const out=await cleanup();assert.equal(out.conversationCleanup.conversationRows,0);assert.ok(trace.indexOf('conversation-delete')<trace.indexOf('auth:'+otherId));assert.ok(trace.indexOf('auth:'+ownerId)<trace.indexOf('conversation-zero'));assert.equal(trace.includes('ledger-removed'),true);}
    assert.ok(users.every(user=>user.token===null));assert.equal(trace.includes('protected-owner'),true);assert.equal(trace.includes('unlock'),true);
  }
});
