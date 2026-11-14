import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmod,link,lstat,mkdir,mkdtemp,readFile,readdir,rename,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {createTranscriptDurableJournal,readTranscriptDurableJournal} from './transcript-durable-journal.mjs';
import {createTranscriptLiveTransport} from './transcript-live-transport.mjs';
import {createTranscriptConversationSave} from './transcript-conversation-save.mjs';

const binding={runId:'17000000-0000-4000-8000-000000000001',ownerId:'17000000-0000-4000-8000-000000000002',
  conversationId:'17000000-0000-4000-8000-000000000003',sourceRevision:'a'.repeat(40),suiteHash:'b'.repeat(64)};
const correlationId='17000000-0000-4000-8000-000000000004';
const ids=['account:reproduction-record-overview','account:reproduction-current-courses-year','account:reproduction-remaining-balance','account:reproduction-interview-help'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const assistant=(turn=1,index=turn*3-2)=>({operation:'assistant',requestIndex:index,requestHash:hash('assistant'+turn),sourceRevision:binding.sourceRevision,turnId:'turn-'+turn,caseId:ids[turn-1]});
const save=(turn=1,index=turn*3)=>({operation:'conversation_save',requestIndex:index,requestHash:hash('save'+turn),sourceRevision:binding.sourceRevision,
  ownerId:binding.ownerId,conversationId:binding.conversationId,title:'Reported school assistant transcript',expectedVersion:turn,messageDigest:hash('messages'+turn)});
const saveReceipt=p=>Object.fromEntries(Object.entries(p).filter(([key])=>!['operation','requestIndex'].includes(key)));
const receipt=p=>({operation:'assistant',turnId:p.turnId,caseId:p.caseId,receipt:{operation:'assistant',requestIndex:p.requestIndex,requestHash:p.requestHash,sourceRevision:p.sourceRevision,
  statusCode:200,body:{answer:'PRIVATE USER RESPONSE',nested:{private:'PRIVATE NOTE'}},events:[{kind:'records',detail:'PRIVATE EVENT'}],correlationId,
  disposition:'received',deploymentVerified:true,persistenceVerified:false,modelAcceptance:false}});
async function local(t){const root=await mkdtemp(join(tmpdir(),'stu-transcript-journal-test-'));t.after(()=>rm(root,{recursive:true,force:true}));const directory=join(root,'private');return {root,directory,path:join(directory,'transcript-journal-'+binding.runId+'.json')};}

test('four turns persist exact private metadata atomically and expose no raw transcript or token',async t=>{
  const env=await local(t),journal=await createTranscriptDurableJournal({...env,binding});
  assert.equal((await lstat(env.directory)).mode&0o777,0o700);assert.equal((await lstat(env.path)).mode&0o777,0o600);
  let oldInode=(await lstat(env.path)).ino;
  for(let turn=1;turn<=4;turn++){
    const a=assistant(turn),s=save(turn);await journal.pending(a);
    const pending=await readTranscriptDurableJournal({...env,binding});assert.equal(pending.entries.at(-1).received,null);
    assert.deepEqual(pending.entries.at(-1).pending,a);assert.notEqual((await lstat(env.path)).ino,oldInode);oldInode=(await lstat(env.path)).ino;
    await journal.received(receipt(a));await journal.pending(s);await journal.received(saveReceipt(s));
  }
  const stored=await journal.read();assert.equal(stored.revision,16);assert.equal(stored.entries.length,8);assert.equal(stored.terminal,null);
  assert.equal(stored.entries[0].received.correlationId,correlationId);assert.match(stored.entries[0].received.responseHash,/^[a-f0-9]{64}$/u);
  const raw=await readFile(env.path,'utf8');assert.doesNotMatch(raw,/PRIVATE USER|PRIVATE NOTE|PRIVATE EVENT|Bearer|access_token|refresh_token/u);
  assert.deepEqual(await readdir(env.directory),['transcript-journal-'+binding.runId+'.json']);
  stored.entries.length=0;assert.equal((await journal.read()).entries.length,8);
  journal.close();assert.equal(journal.status().closed,true);assert.equal(journal.status().replayAllowed,false);
  assert.equal((await readTranscriptDurableJournal({...env,binding})).entries.length,8);
  await assert.rejects(createTranscriptDurableJournal({...env,binding}),{code:'existing_journal'});
});

test('existing save helper and actual injected transport await durable pending before POST and exact readback before received',async t=>{
  const env=await local(t),journal=await createTranscriptDurableJournal({...env,binding});
  const origin='https://std-edu-ai-journal-v1-d286.vercel.app';let conversation=null,posts=0;
  const transport=createTranscriptLiveTransport({origin,approvedPreviewOrigin:origin,expectedRevision:binding.sourceRevision,fetchImpl:async(input,init)=>{
    const url=new URL(input);
    if(url.pathname==='/release.json')return Response.json({version:1,source:'vercel-git',environment:'preview',revision:binding.sourceRevision,builtAt:'2026-11-15T01:00:00.000Z'});
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer SYNTHETIC_CALLER_TOKEN');assert.equal(url.pathname,'/api/affairs-conversations');
    if(init.method==='GET')return conversation?Response.json(conversation):Response.json({error:'not found'},{status:404});
    const durable=await readTranscriptDurableJournal({...env,binding});assert.equal(durable.entries.at(-1).received,null);assert.equal(durable.entries.at(-1).pending.operation,'conversation_save');
    posts++;const body=JSON.parse(init.body);conversation={...body,version:body.version+1};return Response.json(conversation);
  }});
  const writer=createTranscriptConversationSave({transport,ownerId:binding.ownerId,conversationId:binding.conversationId,title:'Reported school assistant transcript',journal});
  await transport.pin();const answer='Private exact answer';await writer.append({token:'SYNTHETIC_CALLER_TOKEN',user:{id:'turn-1:user',role:'user',content:'Private question'},
    assistant:{id:'turn-1:assistant',role:'assistant',phase:'complete',content:answer,result:{status:'answered',answer,citations:[]}}});
  const state=await journal.read();assert.equal(posts,1);assert.equal(state.entries.length,1);assert.equal(state.entries[0].received.expectedVersion,1);
  assert.doesNotMatch(await readFile(env.path,'utf8'),/SYNTHETIC_CALLER_TOKEN|Private exact|Private question/u);await transport.finish();journal.close();
});

test('pending request and terminal uncertainty survive reopening but never authorize another dispatch',async t=>{
  const env=await local(t),journal=await createTranscriptDurableJournal({...env,binding});
  await journal.pending(assistant());await journal.received(receipt(assistant()));await journal.pending(save());await journal.received(saveReceipt(save()));
  await journal.pending(assistant(2));await journal.terminal({phase:'eval_abort',code:'failed',disposition:'uncertain'});
  const state=await readTranscriptDurableJournal({...env,binding});assert.equal(state.entries.length,3);assert.equal(state.entries.at(-1).received,null);
  assert.equal(state.terminal.requestHash,assistant(2).requestHash);assert.equal(state.terminal.disposition,'uncertain');
  await assert.rejects(journal.pending(save(2)),{code:'invalid_state'});journal.close();
  await assert.rejects(createTranscriptDurableJournal({...env,binding}),{code:'existing_journal'});
  assert.deepEqual((await readTranscriptDurableJournal({...env,binding})).entries,state.entries);
});

test('assistant receipt binds exact request, revision, correlation and response independently of mutable caller objects',async t=>{
  const env=await local(t),journal=await createTranscriptDurableJournal({...env,binding}),p=assistant();await journal.pending(p);
  const result=receipt(p),operation=journal.received(result);result.receipt.body.answer='caller changed it';await operation;
  const state=await journal.read(),other=await local(t),second=await createTranscriptDurableJournal({...other,binding});await second.pending(p);await second.received(receipt(p));
  assert.equal(state.entries[0].received.responseHash,(await second.read()).entries[0].received.responseHash);journal.close();second.close();
});

test('wrong owners, selectors, duplicate requests, changed receipts and raw extra fields fail closed',async t=>{
  for(const change of [p=>{p.sourceRevision='c'.repeat(40);},p=>{p.caseId=ids[1];},p=>{p.requestIndex=0;},p=>{p.token='SECRET';}]){
    const env=await local(t),journal=await createTranscriptDurableJournal({...env,binding}),p=assistant();change(p);
    assert.throws(()=>journal.pending(p),{code:'invalid_commitment'});assert.equal((await journal.read()).entries.length,0);journal.close();
  }
  for(const change of [p=>{p.ownerId=correlationId;},p=>{p.conversationId=correlationId;},p=>{p.title+='\nsecret';}]){
    const env=await local(t),journal=await createTranscriptDurableJournal({...env,binding}),p=save();change(p);assert.throws(()=>journal.pending(p),{code:'invalid_commitment'});journal.close();
  }
  for(const change of [r=>{r.receipt.requestHash='d'.repeat(64);},r=>{r.receipt.sourceRevision='d'.repeat(40);},r=>{r.receipt.correlationId=null;},
    r=>{r.receipt.deploymentVerified=false;},r=>{r.receipt.token='SECRET';},r=>{r.turnId='turn-2';}]){
    const env=await local(t),journal=await createTranscriptDurableJournal({...env,binding});await journal.pending(assistant());const r=receipt(assistant());change(r);
    await assert.rejects(journal.received(r));assert.equal((await readTranscriptDurableJournal({...env,binding})).entries[0].received,null);journal.close();
  }
  const env=await local(t),journal=await createTranscriptDurableJournal({...env,binding});await journal.pending(assistant());await journal.received(receipt(assistant()));
  await assert.rejects(journal.pending({...assistant(),requestIndex:3}),{code:'journal_drift'});journal.close();
});

test('unknown error messages become fixed codes and terminal metadata cannot carry secrets',async t=>{
  const env=await local(t),journal=await createTranscriptDurableJournal({...env,binding});await journal.pending(assistant());
  await journal.terminal({phase:'eval_abort',code:'SECRET user@example.invalid https://private.invalid',disposition:'uncertain'});
  const state=await journal.read();assert.equal(state.terminal.code,'unclassified_failure');assert.doesNotMatch(await readFile(env.path,'utf8'),/SECRET|example.invalid|private.invalid/u);journal.close();
  const other=await local(t),another=await createTranscriptDurableJournal({...other,binding});await assert.rejects(another.terminal({phase:'eval_abort',code:'failed',disposition:'not_sent',message:'SECRET'}),{code:'invalid_data'});another.close();
});

test('immutable binding and pre-dispatch or post-receipt terminal states preserve exact completed history',async t=>{
  for(const complete of [false,true]){
    const env=await local(t),mutable=structuredClone(binding),journal=await createTranscriptDurableJournal({...env,binding:mutable});
    mutable.ownerId=correlationId;assert.deepEqual(journal.binding,binding);assert.equal(Object.isFrozen(journal.binding),true);
    assert.throws(()=>{journal.binding.ownerId=correlationId;},TypeError);
    if(complete){await journal.pending(save());await journal.received(saveReceipt(save()));}
    await journal.terminal({phase:'eval_abort',code:'cancelled',disposition:'not_sent'});
    const state=await readTranscriptDurableJournal({...env,binding});assert.equal(state.terminal.requestHash,null);
    assert.equal(state.entries.length,complete?1:0);if(complete)assert.deepEqual(state.entries[0].received,saveReceipt(save()));journal.close();
  }
});

test('accessors, array subclasses and oversized payloads never execute or enter the journal',async t=>{
  const env=await local(t),journal=await createTranscriptDurableJournal({...env,binding});let reads=0;
  const getter=Object.defineProperty({},'operation',{enumerable:true,get(){reads++;return 'assistant';}});assert.throws(()=>journal.pending(getter),{code:'invalid_data'});
  await journal.pending(assistant());const bad=receipt(assistant());Object.defineProperty(bad.receipt.events,'0',{enumerable:true,get(){reads++;return {};}});
  assert.throws(()=>journal.received(bad),{code:'invalid_data'});assert.equal(reads,0);
  const large=receipt(assistant());large.receipt.body.answer='x'.repeat(2_100_001);assert.throws(()=>journal.received(large),{code:'invalid_data'});
  class Events extends Array{}const subclass=receipt(assistant());subclass.receipt.events=new Events();assert.throws(()=>journal.received(subclass),{code:'invalid_data'});
  assert.equal((await journal.read()).entries[0].received,null);journal.close();
});

test('unsafe directories, symlink/hardlink files and foreign binding are rejected without overwriting',async t=>{
  const env=await local(t);await mkdir(env.directory,{mode:0o755});await assert.rejects(createTranscriptDurableJournal({...env,binding}),{code:'unsafe_path'});
  await chmod(env.directory,0o700);const journal=await createTranscriptDurableJournal({...env,binding});journal.close();
  await assert.rejects(readTranscriptDurableJournal({...env,binding:{...binding,ownerId:correlationId}}),{code:'journal_drift'});
  const original=await readFile(env.path);await rename(env.path,env.path+'.actual');await symlink(env.path+'.actual',env.path);await assert.rejects(readTranscriptDurableJournal({...env,binding}));
  assert.deepEqual(await readFile(env.path+'.actual'),original);await rm(env.path);await rename(env.path+'.actual',env.path);await link(env.path,env.path+'.link');
  await assert.rejects(readTranscriptDurableJournal({...env,binding}),{code:'unsafe_path'});
  const linked=join(env.root,'linked');await symlink(env.directory,linked);await assert.rejects(createTranscriptDurableJournal({directory:linked,binding}),{code:'unsafe_path'});
});

test('concurrent creator and transition cannot overwrite, and file drift prevents any replacement',async t=>{
  const env=await local(t),created=await Promise.allSettled([createTranscriptDurableJournal({...env,binding}),createTranscriptDurableJournal({...env,binding})]);
  assert.equal(created.filter(row=>row.status==='fulfilled').length,1);const journal=created.find(row=>row.status==='fulfilled').value;
  const first=journal.pending(assistant());await assert.rejects(journal.pending(save()),{code:'invalid_state'});await first;
  const before=await readFile(env.path);await writeFile(env.path,JSON.stringify({forged:true}),{mode:0o600});await assert.rejects(journal.received(receipt(assistant())),{code:'journal_drift'});
  assert.equal(await readFile(env.path,'utf8'),JSON.stringify({forged:true}));assert.ok(before.length>0);journal.close();
});

test('interrupted temporary artifacts are retained and never treated as a resumable request',async t=>{
  const env=await local(t),journal=await createTranscriptDurableJournal({...env,binding});await journal.pending(save());journal.close();
  await writeFile(join(env.directory,'.interrupted.tmp'),'incomplete metadata',{mode:0o600});
  const state=await readTranscriptDurableJournal({...env,binding});assert.equal(state.entries[0].received,null);
  await assert.rejects(createTranscriptDurableJournal({...env,binding}),{code:'existing_journal'});assert.equal(await readFile(join(env.directory,'.interrupted.tmp'),'utf8'),'incomplete metadata');
});
