import assert from 'node:assert/strict';
import {test} from 'node:test';
import {boundedAssistantActivity,boundedAssistantText,boundedConversationMessages,reconcileAssistantActivity} from '../../src/services/assistantActivityBudget.js';

const step=(index:number)=>({kind:'account-read:tool'+index+':1',label:'Checked record '+index,detail:'Read the signed-in account records for this question.',status:'complete' as const});
const bytes=(value:unknown)=>Buffer.byteLength(JSON.stringify(value),'utf8');

test('forty normal tool and verification steps survive merge and JSON round trip',()=>{
  const initial=Array.from({length:40},(_,index)=>step(index));
  const result=boundedAssistantActivity(initial,[{...step(5),detail:'Refreshed owned evidence.'}]);
  assert.equal(result.length,40);assert.equal(result[0].kind,initial[0].kind);assert.equal(result[5].detail,'Refreshed owned evidence.');
  assert.deepEqual(JSON.parse(JSON.stringify(result)),result);assert.equal(initial[5].detail,'Read the signed-in account records for this question.');
});
test('excess steps have a visible omission entry instead of silent loss',()=>{
  const result=boundedAssistantActivity([],Array.from({length:80},(_,index)=>step(index)));
  assert.equal(result.length,64);assert.equal(result[0].kind,'activity-history-limit');assert.match(result[0].detail,/17 earlier/);
  assert.equal(result.at(-1)?.kind,step(79).kind);assert.equal(result[1].kind,step(17).kind);
});
test('Unicode and escaped activity details stay within the serialized UTF-8 budget',()=>{
  const rows=Array.from({length:64},(_,index)=>({...step(index),label:'已讀取學生紀錄'.repeat(30),detail:('課程🙂\n"\\').repeat(100)}));
  const result=boundedAssistantActivity([],rows);
  assert.equal(result.length,64);assert.ok(bytes(result)<=16000);
  assert.ok(result.some(row=>row.detail.endsWith('…')));assert.ok(result.every(row=>!row.detail.includes('\uFFFD')));
  assert.deepEqual(result.map(row=>row.kind),rows.map(row=>row.kind));
});
test('the activity allowlist rejects malformed entries and drops executable or private fields',()=>{
  const result=boundedAssistantActivity([], [{...step(1),token:'PRIVATE',payload:{write:true}}, {...step(2),kind:'bad/path'}, {...step(3),status:'success'}, null]);
  assert.deepEqual(result,[step(1)]);assert.doesNotMatch(JSON.stringify(result),/PRIVATE|payload/);
  assert.throws(()=>boundedAssistantActivity([],[],{budget:100}),RangeError);
});
test('final snapshot reconciliation preserves40 normal steps and latest same-kind status in canonical order',()=>{
  const final=Array.from({length:40},(_,index)=>step(index));
  const current=[{...step(20),status:'running' as const},...final.slice(0,20),...final.slice(21)];
  const result=reconcileAssistantActivity(current,final);
  assert.deepEqual(result,final);assert.deepEqual(reconcileAssistantActivity(result,final),result);
  assert.equal(current[0].status,'running');
});
test('an80-step incremental trace reconciles a full replay in final order without inventing omission counts',()=>{
  const final=Array.from({length:80},(_,index)=>step(index));
  let current:ReturnType<typeof boundedAssistantActivity>=[];
  for(const row of final)current=boundedAssistantActivity(current,[row]);
  const result=reconcileAssistantActivity(current,final);
  assert.equal(result.length,64);assert.equal(result[0].kind,'activity-history-limit');
  assert.match(result[0].detail,/exact count cannot be recovered/);assert.doesNotMatch(result[0].detail,/\d/);
  assert.deepEqual(result.slice(1),final.slice(17));
  assert.deepEqual(reconcileAssistantActivity(result,final),result);
  assert.deepEqual(reconcileAssistantActivity(JSON.parse(JSON.stringify(result)),final),result);
});
test('initial long final snapshots and already-bounded snapshots are replay-idempotent',()=>{
  const final=Array.from({length:80},(_,index)=>step(index));
  for(const snapshot of [final,boundedAssistantActivity([],final)]){
    const initial=reconcileAssistantActivity([],snapshot);
    assert.deepEqual(reconcileAssistantActivity(initial,snapshot),initial);
    assert.deepEqual(reconcileAssistantActivity(JSON.parse(JSON.stringify(initial)),snapshot),initial);
    assert.equal(initial[1].kind,step(17).kind);assert.equal(initial.at(-1)?.kind,step(79).kind);
  }
});
test('streamed-only observations retain shared anchors and final values win over streamed values',()=>{
  const initial={kind:'outer-account',label:'Signed in',detail:'Checked account access.',status:'complete' as const};
  const middle={kind:'outer-answer',label:'Prepared answer',detail:'Outer handler work.',status:'complete' as const};
  const end={kind:'outer-finish',label:'Finished response',detail:'Completed request.',status:'complete' as const};
  const current=[initial,{...step(0),status:'running' as const},middle,step(1),end];
  const final=[{...step(0),detail:'Final validated records.'},step(1),step(2)];
  const result=reconcileAssistantActivity(current,final);
  assert.deepEqual(result,[initial,final[0],middle,final[1],end,final[2]]);
  assert.deepEqual(reconcileAssistantActivity(result,final),result);
});
test('overflow retains streamed-only observations alongside the canonical final tail',()=>{
  const outer={kind:'outer-account',label:'Account checked',detail:'Account access was checked.',status:'complete' as const};
  const final=Array.from({length:80},(_,index)=>step(index));
  const current=[outer,...final.slice(17)];
  const result=reconcileAssistantActivity(current,final);
  assert.equal(result.length,64);assert.deepEqual(result[1],outer);
  assert.deepEqual(result.slice(2),final.slice(18));
  assert.deepEqual(reconcileAssistantActivity(result,final),result);
});
test('empty snapshots preserve observed work, malformed final rows are ignored, and reserved metadata is rebuilt',()=>{
  const current=[step(1),step(2)];assert.deepEqual(reconcileAssistantActivity(current,[]),current);
  const result=reconcileAssistantActivity(current,[{...step(2),status:'complete',token:'PRIVATE'},{...step(3),kind:'bad/path'},null]);
  assert.deepEqual(result,current);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
  assert.throws(()=>reconcileAssistantActivity(current,[],{budget:10}),RangeError);
  const omitted=boundedAssistantActivity([],Array.from({length:80},(_,index)=>step(index)));
  const rebuilt=reconcileAssistantActivity([],[{...omitted[0],label:'Injected private label'},...omitted.slice(1)]);
  assert.equal(rebuilt[0].label,'Earlier activity omitted');assert.doesNotMatch(JSON.stringify(rebuilt),/Injected/);
});
test('final reconciliation remains bounded and idempotent for long escaped Unicode traces',()=>{
  const final=Array.from({length:80},(_,index)=>({...step(index),detail:'課程🙂\n"\\'.repeat(90)}));
  const current=boundedAssistantActivity([],final,{budget:8192});
  const result=reconcileAssistantActivity(current,final,{budget:8192});
  assert.ok(bytes(result)<=8192);assert.equal(result.length,64);assert.equal(result[1].kind,step(17).kind);
  assert.deepEqual(reconcileAssistantActivity(result,final,{budget:8192}),result);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),result);
});
test('mixed streamed-only and final Unicode rows use a stable replay budget',()=>{
  let seed=731;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const row=(index:number)=>({...step(index),kind:'tool:'+index,detail:(index%3?'result':'課程🙂\\"\n').repeat(30)});
  for(let trial=0;trial<100;trial++){
    const final=Array.from({length:1+Math.floor(random()*100)},(_,index)=>row(index));
    const current=final.filter(()=>random()<.6);
    for(let index=0;index<Math.floor(random()*20);index++)current.splice(Math.floor(random()*(current.length+1)),0,row(200+index));
    const result=reconcileAssistantActivity(current,final,{budget:8192});
    assert.deepEqual(reconcileAssistantActivity(JSON.parse(JSON.stringify(result)),final,{budget:8192}),result,'Replay '+trial);
    assert.ok(bytes(result)<=8192);
    const kinds=result.filter(item=>item.kind!=='activity-history-limit'&&Number(item.kind.split(':')[1])<200).map(item=>Number(item.kind.split(':')[1]));
    assert.deepEqual(kinds,[...kinds].sort((a,b)=>a-b));
  }
});
test('conversation budgeting retains complete latest turns by UTF-8 bytes',()=>{
  const messages=Array.from({length:8},(_,index)=>({id:String(index),role:index%2?'assistant':'user',content:'課'.repeat(600)}));
  const result=boundedConversationMessages(messages,{budget:8000});
  assert.ok(bytes(result)<=8000);assert.equal(result[0].role,'user');assert.equal(result.at(-1)?.id,'7');
  assert.equal(result.length,4);assert.equal(messages.length,8);
});
test('a single oversized latest turn fails visibly rather than truncating its answer or activity',()=>{
  const messages=[{role:'user',content:'Question'},{role:'assistant',content:'課'.repeat(2000)}];
  assert.throws(()=>boundedConversationMessages(messages,{budget:2000}),/latest conversation turn/);
  assert.equal(messages[1].content.length,2000);
});
test('initial field clipping preserves emoji and visibly marks abbreviated fields',()=>{
  const [result]=boundedAssistantActivity([], [{...step(1),label:'x'.repeat(119)+'🙂',detail:'x'.repeat(499)+'🙂'}]);
  assert.ok(result.label.endsWith('…'));assert.ok(result.detail.endsWith('…'));
  assert.ok(!/[\ud800-\udfff]/u.test(result.label+result.detail));
  assert.ok(result.label.length<=120&&result.detail.length<=500);
  assert.equal(boundedAssistantActivity([],[{...step(1),detail:'x'.repeat(700)}])[0].detail.length,500);
  assert.equal(boundedAssistantActivity([],[{...step(1),detail:'x'.repeat(700)}])[0].detail.at(-1),'…');
});
test('incremental unseen kinds after overflow use an honest unknown count and rebuild reserved metadata',()=>{
  const initial=boundedAssistantActivity([],Array.from({length:80},(_,index)=>step(index)));
  const next=boundedAssistantActivity(initial,[step(80)]);
  assert.match(next[0].detail,/exact count cannot be recovered/);assert.equal(next[1].kind,step(18).kind);
  assert.deepEqual(boundedAssistantActivity(next,[step(80)]),next);
  assert.equal(boundedAssistantActivity([],[{kind:'activity-history-limit',label:'Injected',detail:'Injected',status:'complete'}]).length,0);
  const rebuilt=boundedAssistantActivity([],[{...next[0],label:'Injected'}]);
  assert.equal(rebuilt[0].label,'Earlier activity omitted');assert.match(rebuilt[0].detail,/exact count cannot be recovered/);
  const updated=boundedAssistantActivity(initial,[{...step(79),detail:'Updated final state.'}]);
  assert.match(updated[0].detail,/17 earlier/);assert.equal(updated.at(-1)?.detail,'Updated final state.');
});
test('the message-count limit removes only whole old turns',()=>{
  const messages=Array.from({length:25},(_,index)=>({id:String(index),role:index%2?'assistant':'user',content:'small'}));
  const result=boundedConversationMessages(messages);
  assert.equal(result[0].id,'2');assert.equal(result[0].role,'user');assert.equal(result.length,23);
  assert.throws(()=>boundedConversationMessages([{role:'user',content:'Question'},...Array.from({length:25},()=>({role:'assistant',content:'small'}))]),/latest conversation turn/);
});
test('lower byte budgets preserve the omission marker across subsequent merges',()=>{
  const rows=Array.from({length:80},(_,index)=>({...step(index),kind:'tool:'+index,detail:'Long result '.repeat(45)}));
  const initial=boundedAssistantActivity([],rows,{budget:8192});
  assert.match(initial[0].detail,/17 earlier operation entries exceeded the 64-step history limit\.$/);
  const next=boundedAssistantActivity(initial,[{...step(80),kind:'tool:80'}],{budget:8192});
  assert.match(next[0].detail,/exact count cannot be recovered/);
  assert.ok(bytes(next)<=8192);assert.equal(next.length,64);
});
test('conversation storage budgeting includes PostgreSQL JSONB separator spaces',()=>{
  const rows=Array.from({length:24},(_,index)=>({role:index%2?'assistant':'user',activity:Array.from({length:12},()=>({a:'',b:'',c:'',d:''}))}));
  const jsonbBytes=(value:unknown)=>Buffer.byteLength(JSON.stringify(value).replace(/("(?:[^"\\]|\\.)*")|([:,])/g,(_match,quoted,separator)=>quoted??separator+' '),'utf8');
  const result=boundedConversationMessages(rows,{budget:6000});
  assert.ok(jsonbBytes(rows)>6000);assert.ok(bytes(rows)<jsonbBytes(rows));
  assert.ok(jsonbBytes(result)<=6000);assert.ok(result.length<rows.length);assert.equal(result[0].role,'user');
});

test('stored text strips NUL and replaces isolated surrogates without changing valid text or type acceptance',()=>{
  assert.equal(boundedAssistantText('a\u0000\ud800b\udc00🙂',100),'a\uFFFDb\uFFFD🙂');
  assert.equal(boundedAssistantText('課程🙂\n"\\',100),'課程🙂\n"\\');
  assert.equal(boundedAssistantText(123,100),'');
  assert.equal(boundedAssistantText({toString:()=> 'not a string'},100),'');
  assert.equal(boundedAssistantText('text',0),'');
  assert.throws(()=>boundedAssistantText('text',-1),RangeError);
  assert.throws(()=>boundedAssistantText('text',1.5),RangeError);
});

test('stored text truncates at the existing UTF-16 limit without splitting an emoji',()=>{
  assert.equal(boundedAssistantText('x'.repeat(7999)+'🙂',8000),'x'.repeat(7999));
  assert.equal(boundedAssistantText('x'.repeat(7998)+'🙂',8000),'x'.repeat(7998)+'🙂');
  assert.equal(boundedAssistantText('x'.repeat(8001),8000),'x'.repeat(8000));
  assert.equal(boundedAssistantText('🙂',1),'');
  const [activity]=boundedAssistantActivity([],[{...step(1),label:'Read\u0000 record',detail:'NUL\u0000 removed'}]);
  assert.equal(activity.label,'Read record');assert.equal(activity.detail,'NUL removed');
});
