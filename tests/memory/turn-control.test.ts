import test from 'node:test';
import assert from 'node:assert/strict';
import {enqueueAssistantTurn,meaningfulAssistantUpdate} from '../../src/services/assistantTurnControl.ts';
test('queue remains FIFO, bounded and does not mutate pending items',()=>{
 const first={id:'a',text:'first',images:[]},second={id:'b',text:'second',images:[]};const initial=[first];
 const next=enqueueAssistantTurn(initial,second);assert.deepEqual(next.map(x=>x.id),['a','b']);assert.deepEqual(initial,[first]);
 assert.throws(()=>enqueueAssistantTurn(Array(10).fill(first),second),/queue is full/);
});
test('updates follow relevant events, not routine calls or elapsed time',()=>{
 const step={kind:'api-read',label:'read',detail:'done',status:'complete' as const};assert.equal(meaningfulAssistantUpdate(step),false);
 assert.equal(meaningfulAssistantUpdate({...step,kind:'clarification-request'}),true);
 assert.equal(meaningfulAssistantUpdate({...step,kind:'api-answer-check',status:'unavailable'}),true);
 assert.equal(meaningfulAssistantUpdate({...step,kind:'api-answer-check'}),false);
});
