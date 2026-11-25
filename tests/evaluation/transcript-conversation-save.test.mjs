import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTranscriptConversationSave,verifyTranscriptConversationRow} from './transcript-conversation-save.mjs';
import {createTranscriptLiveTransport} from './transcript-live-transport.mjs';

const origin='https://std-edu-ai-fixture-v1-d286.vercel.app';
const sourceRevision='a'.repeat(40);
const conversationId='17000000-0000-4000-8000-000000000002',ownerId='17000000-0000-4000-8000-000000000001';
const token='SYNTHETIC_CALLER_TOKEN',title='Reported school assistant transcript';
const sample=index=>{
  const answer='Synthetic answer '+index;
  const activity=[{kind:'verification-'+index,label:'Checked the answer',detail:'The fixture review finished.',status:'complete'}];
  return {token,user:{id:'turn-'+index+':user',role:'user',content:'Synthetic question '+index},
    assistant:{id:'turn-'+index+':assistant',role:'assistant',phase:'complete',content:answer,activity,
      result:{status:'answered',answer,activity,citations:[],verification:{status:'verified',attempts:1}}}};
};

function environment({initial=null,changeReadback=false,failJournal=false,loseWriteReply=false,failReceipt=false}={}){
  const events=[],journal=[];
  let conversation=initial,postCount=0;
  const fetchImpl=async(input,init)=>{
    const url=new URL(input);
    assert.equal(url.origin,origin);
    if(url.pathname==='/release.json')return Response.json({version:1,environment:'preview',source:'vercel-git',revision:sourceRevision,builtAt:'2026-11-15T01:00:00.000Z'});
    assert.equal(url.pathname,'/api/affairs-conversations');
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+token);
    if(init.method==='GET'){
      events.push('read');
      if(!conversation)return Response.json({error:'Conversation not found.'},{status:404});
      return Response.json(changeReadback?{...conversation,version:conversation.version+1}:conversation);
    }
    assert.equal(init.method,'POST');
    events.push('post');postCount++;
    const body=JSON.parse(init.body);
    assert.equal(body.version,conversation?.version??0);
    conversation={...body,version:body.version+1,updated_at:'2026-11-15T01:03:00.000Z'};
    if(loseWriteReply)throw new Error('Synthetic connection lost');
    return Response.json(conversation);
  };
  const transport=createTranscriptLiveTransport({origin,approvedPreviewOrigin:origin,expectedRevision:sourceRevision,fetchImpl});
  const save=createTranscriptConversationSave({transport,ownerId,conversationId,title,journal:{
    async pending(entry){events.push('pending');if(failJournal)throw new Error('Synthetic fsync failure');journal.push({pending:entry});},
    async received(entry){events.push('received');if(failReceipt)throw new Error('Synthetic receipt fsync failure');journal.push({received:entry});},
  }});
  return {save,transport,events,journal,get posts(){return postCount;}};
}

test('all four turns journal before save, then verify exact messages with distinct GET readback',async()=>{
  const env=environment();await env.transport.pin();
  for(let index=1;index<=4;index++){
    const out=await env.save.append(sample(index));
    assert.equal(out.version,index);
    assert.equal(out.messages.length,index*2);
    assert.deepEqual(out.messages.at(-1).result.activity,sample(index).assistant.activity);
    assert.equal(env.journal.at(-1).received.messageDigest,out.messageDigest);
    out.messages[0].content='caller mutation cannot change live state';
  }
  await assert.rejects(env.save.append(sample(5)),{code:'invalid_turn'});
  assert.equal(env.posts,4);
  assert.deepEqual(env.events,['read',...Array.from({length:4},()=>['pending','post','read','received']).flat()]);
  assert.doesNotMatch(JSON.stringify(env.journal),/SYNTHETIC_CALLER_TOKEN|Synthetic answer|Synthetic question/u);
  assert.equal(new Set(env.journal.filter(entry=>entry.pending).map(entry=>entry.pending.requestHash)).size,4);
  await env.transport.finish();
});

test('existing session, uncertain write, changed readback and failed journal fail closed',async()=>{
  for(const [options,posts,error]of [
    [{initial:{id:conversationId,title,version:1,messages:[]}},0,'conversation_already_exists'],
    [{failJournal:true},0,'reconciliation_required'],
    [{loseWriteReply:true},1,'reconciliation_required'],
    [{changeReadback:true},1,'readback_mismatch'],
    [{failReceipt:true},1,'reconciliation_required'],
  ]){
    const env=environment(options);await env.transport.pin();
    await assert.rejects(env.save.append(sample(1)),{code:error});
    assert.equal(env.posts,posts);
    assert.equal(env.save.status().version,0);
    await assert.rejects(env.save.append(sample(1)),{code:'invalid_state'});
    assert.equal(env.posts,posts);
    if(posts)assert.equal(env.journal.filter(row=>row.pending).length,1);
  }
});

test('actions, truncated content and a turn starting at the wrong index never reach the transport',async()=>{
  const env=environment();await env.transport.pin();
  await assert.rejects(env.save.append(sample(2)),{code:'invalid_turn'});
  const invalid=sample(1);invalid.assistant.result.proposedAction={kind:'create_task'};
  await assert.rejects(env.save.append(invalid),{code:'invalid_turn'});
  const tooLong=sample(1);tooLong.assistant.content=tooLong.assistant.result.answer='a'.repeat(8001);
  await assert.rejects(env.save.append(tooLong),{code:'truncated_turn'});
  assert.deepEqual(env.events,[]);
});

test('durable reconciliation verifies owner, exact version and complete messages before recovery',async()=>{
  const env=environment();await env.transport.pin();
  const saved=await env.save.append(sample(1)),{pending}=env.journal[0];
  const exact={id:conversationId,user_id:ownerId,title,version:saved.version,messages:saved.messages};
  assert.equal(verifyTranscriptConversationRow(pending,[exact]),true);
  for(const rows of [[],[exact,exact],[{...exact,user_id:conversationId}],[{...exact,id:ownerId}],
    [{...exact,title:'A different session'}],[{...exact,version:2}],[{...exact,messages:exact.messages.slice(1)}],
    [{...exact,messages:[exact.messages[0],{...exact.messages[1],content:'Changed after save'}]}]]){
    assert.throws(()=>verifyTranscriptConversationRow(pending,rows),{code:'reconciliation_required'});
  }
});
