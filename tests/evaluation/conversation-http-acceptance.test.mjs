import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {conversationFixture,validateConversationTarget,conversationResponseMatches,conversationExpectedVersion,
  reconcileConversationWrite,reconcileConversationIdentity,allowedConversationBrowserRequest,assertConversationRecoveryClear,assertConversationDeleteIsolation,conversationResponseDiagnostic,openVerifiedConversationAssistant,boundedConversationDiagnostic} from '../integration/assistant-conversation-http-live.mjs';

const id='32475426-b5e7-4ce6-863f-91e2e7d20929',userId='c0d6abf1-ad94-43da-b7de-995d3ccbe320';
const root=fileURLToPath(new URL('../../',import.meta.url)),origin='https://stu.best',revision='a'.repeat(40);
const project='https://xiftudmvxphxcjtmfmib.supabase.co';

test('conversation target requires exact production revision and checkout before clients',()=>{
  assert.deepEqual(validateConversationTarget({origin,revision,cwd:root}),{origin,revision});
  for(const wrong of ['http://stu.best','https://stu.best/','https://stu.best:443','https://stu.best@evil.invalid','http://localhost:5184'])
    assert.throws(()=>validateConversationTarget({origin:wrong,revision,cwd:root}));
  for(const value of ['',undefined,'short','A'.repeat(40)])assert.throws(()=>validateConversationTarget({origin,revision:value,cwd:root}));
  assert.throws(()=>validateConversationTarget({origin,revision,cwd:'/tmp'}));
});
test('long synthetic turn explicitly is not model verification and preserves40 distinct observable steps',()=>{
  const fixture=conversationFixture(id),message=fixture.messages[1];
  assert.equal(message.content.length,8000);assert.ok(Buffer.byteLength(message.content)>20000);
  assert.equal(message.content,message.result.answer);assert.ok(message.content.endsWith('END-RECORD!'));
  assert.equal(message.activity.length,40);assert.equal(new Set(message.activity.map(row=>row.kind)).size,40);
  assert.equal(message.result.verification.status,'unverified');assert.equal(message.result.verification.attempts,0);
  assert.ok(message.activity.every(row=>Object.keys(row).sort().join()===['detail','kind','label','status'].join()));
  assert.equal(fixture.messages.some(row=>row.images||row.result?.proposedAction),false);
});
test('response matching uses deep JSONB equality and exact independent version',()=>{
  const payload=conversationFixture(id),expectedMessages=[{id:'answer',role:'assistant',content:'same'}];
  const operation={userId,payload,expectedMessages,expectedVersion:1};
  const response={status:200,body:{id,title:payload.title,version:1,messages:[{content:'same',role:'assistant',id:'answer'}]}};
  assert.ok(conversationResponseMatches(operation,response));
  for(const body of [{...response.body,version:2},{...response.body,title:'changed'},{...response.body,messages:[]},{...response.body,id:userId}])
    assert.equal(conversationResponseMatches(operation,{status:200,body}),false);
  assert.equal(conversationResponseMatches(operation,{...response,status:503}),false);
});
test('idempotent expected version is proven from caller-scoped pre-write state, never blanket plus/minus one',()=>{
  const payload=conversationFixture(id),messages=payload.messages;
  const before={user_id:userId,title:payload.title,messages,version:7};
  assert.equal(conversationExpectedVersion(userId,payload,messages,before),7);
  for(const changed of [null,{...before,user_id:id},{...before,title:'other'},{...before,messages:[]}])
    assert.equal(conversationExpectedVersion(userId,payload,messages,changed),1);
});
test('uncertain write recovery requires exact owner,body,title and independently expected version',()=>{
  const payload=conversationFixture(id),operation={userId,payload,expectedMessages:payload.messages,expectedVersion:1};
  const row={id,user_id:userId,title:payload.title,messages:payload.messages,version:1};
  assert.equal(reconcileConversationWrite(operation,[row]),true);
  for(const rows of [[],[row,row],[{...row,user_id:id}],[{...row,title:'other'}],[{...row,version:2}],[{...row,messages:[]}]])
    assert.throws(()=>reconcileConversationWrite(operation,rows));
});
test('uncertain Auth recovery cannot adopt foreign owner,marker,email or ID',()=>{
  const request={email:'synthetic@example.invalid',runId:'run',id:null},row={id,email:request.email,run:'run'};
  assert.equal(reconcileConversationIdentity(request,[row],'run',userId),id);
  for(const rows of [[],[row,row],[{...row,id:userId}],[{...row,run:'another'}],[{...row,email:'foreign@example.invalid'}],[{...row,id:'bad'}]])
    assert.throws(()=>reconcileConversationIdentity(request,rows,'run',userId));
  assert.throws(()=>reconcileConversationIdentity({...request,id:userId},[row],'run',userId));
});
test('browser network guard allows exact persistence/read and local-scope logout only',()=>{
  for(const [method,path] of [['GET','/api/affairs-conversations'],['GET','/api/affairs-conversations?id='+id],['GET','/api/affairs-data'],['POST','/api/affairs-conversations'],['GET','/dtm']])
    assert.equal(allowedConversationBrowserRequest(method,origin+path,project),true);
  assert.equal(allowedConversationBrowserRequest('POST',project+'/auth/v1/logout?scope=local',project),true);
  assert.equal(allowedConversationBrowserRequest('POST',project+'/auth/v1/token?grant_type=refresh_token',project),true);
  for(const [method,url] of [['POST',origin+'/api/affairs-assistant'],['POST',origin+'/api/research-assistant'],['POST',origin+'/api/affairs-action'],['DELETE',origin+'/api/affairs-conversations?id='+id],['POST',origin+'/api/affairs-conversations?arbitrary=1'],['GET','https://dtm.stu.edu.tw/'],['POST',project+'/auth/v1/logout?scope=global'],['POST',project+'/auth/v1/admin/users'],['POST',project+'/auth/v1/token?grant_type=password']])
    assert.equal(allowedConversationBrowserRequest(method,url,project),false);
});
test('live harness has no handler invocation, mocked model, public secret report or import-time main',async()=>{
  const source=await readFile(new URL('../integration/assistant-conversation-http-live.mjs',import.meta.url),'utf8');
  assert.ok(source.indexOf('await manifest();')<source.indexOf('const env=deploymentEnvironment()'));
  assert.doesNotMatch(source,/route\.fulfill|actionHandler|dataHandler|process\.env\.[A-Z_]*SERVICE_ROLE_KEY/);
  assert.match(source,/modelAcceptance:false/);assert.match(source,/if\(process\.argv\[1\].*await main\(\)/);
  assert.match(source,/await sql\?\.release\(\)/);
  assert.match(source,/await ledger\(\);return op/);
});
test('cross-suite unresolved recovery ledgers block new mutations and unreadable folders fail closed',async()=>{
  const directories=['conversation-http','assistant-evaluation'];
  for(const file of [`active-fixtures-${id}.json`,`active-fixtures-${id}.json.tmp`]){
    const inspected=[];await assert.rejects(assertConversationRecoveryClear(directories,{list:async directory=>{inspected.push(directory);return directory==='assistant-evaluation'?[file]:[];}}));
    assert.deepEqual(inspected,directories);
  }
  await assertConversationRecoveryClear(directories,{list:async()=>['report-'+id+'.json']});
  await assertConversationRecoveryClear(directories,{list:async()=>{throw Object.assign(new Error(),{code:'ENOENT'});}});
  await assert.rejects(assertConversationRecoveryClear(directories,{list:async()=>{throw Object.assign(new Error(),{code:'EACCES'});}}));
});
test('cross-account DELETE preserves the actual GET projection regardless of POST-only metadata',async()=>{
  const post={id,title:'Saved',messages:[{id:'m',role:'user',content:'Synthetic'}],version:1,updated_at:'2026-11-13T00:00:00Z',created_at:'2026-11-12T00:00:00Z'};
  const {created_at:creation,...get}=post;assert.ok(creation);
  let deleted=false,reads=0;
  await assertConversationDeleteIsolation(async()=>{reads++;return structuredClone(get);},async()=>{deleted=true;});
  assert.equal(reads,2);assert.equal(deleted,true);
  for(const changed of [{...get,version:2},{...get,messages:[]},{...get,title:'Changed'},null]){
    let first=true;await assert.rejects(assertConversationDeleteIsolation(async()=>{if(first){first=false;return get;}return changed;},async()=>{}));
  }
});
test('browser diagnostics expose only fixed endpoint,status and method; never query,identity or response content',()=>{
  assert.deepEqual(conversationResponseDiagnostic('GET',origin+'/api/affairs-conversations?id=private&token=secret',200,project),{method:'GET',path:'/api/affairs-conversations',status:200});
  assert.deepEqual(conversationResponseDiagnostic('POST',project+'/auth/v1/token?refresh_token=secret',503,project),{method:'POST',path:'/auth/v1/token',status:503});
  for(const url of [origin+'/api/affairs-conversations/'+id,origin+'/api/unknown',origin+'/private-student-name','https://evil.invalid/api/affairs-conversations','invalid'])
    assert.equal(conversationResponseDiagnostic('GET',url,200,project),null);
  for(const status of [0,99,600,'200',NaN])assert.equal(conversationResponseDiagnostic('GET',origin+'/dtm',status,project),null);
  assert.equal(conversationResponseDiagnostic('SECRET',origin+'/dtm',200,project),null);
});
test('launcher opens after verified account UI, so anonymous auth remount cannot close the sheet',async()=>{
  let ready=false;const events=[];
  const page={locator:selector=>{assert.equal(selector,'[data-campus-assistant-menu]');return {waitFor:async options=>{assert.deepEqual(options,{state:'visible'});ready=true;events.push('account');}};},
    getByRole:(role,options)=>{assert.equal(role,'button');assert.deepEqual(options,{name:'開啟 AI 校園助理',exact:true});return {click:async()=>{assert.equal(ready,true);events.push('open');}};}};
  await openVerifiedConversationAssistant(page);assert.deepEqual(events,['account','open']);
  await assert.rejects(openVerifiedConversationAssistant({...page,locator:()=>({waitFor:async()=>{throw new Error('No verified session');}})}),/No verified session/);
});
test('a stalled browser diagnostic cannot delay fixture cleanup indefinitely',async()=>{
  assert.equal(await boundedConversationDiagnostic(Promise.resolve('safe'),20),'safe');
  await assert.rejects(boundedConversationDiagnostic(new Promise(()=>{}),1),/timed out/);
});
