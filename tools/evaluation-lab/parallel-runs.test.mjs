import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as tick} from 'node:timers/promises';
import {runParallelCases,createPacedDispatch} from './parallel-runs.mjs';
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}};
test('workers overlap, enforce the cap, and drain every case exactly once',async()=>{
  const gates=Array.from({length:5},deferred),started=[],finished=[];let active=0,peak=0;
  const pending=runParallelCases([0,1,2,3,4],{concurrency:3,run:async id=>{started.push(id);peak=Math.max(peak,++active);await gates[id].promise;finished.push(id);active--}});
  await tick();assert.deepEqual(started,[0,1,2]);assert.equal(peak,3);
  gates[1].resolve();await tick();assert.deepEqual(started,[0,1,2,3]);
  gates.forEach(g=>g.resolve());await pending;
  assert.equal(peak,3);assert.equal(active,0);assert.deepEqual(finished.toSorted(),[0,1,2,3,4]);
});
test('one case failure does not drop another answer or leave the queue undrained',async()=>{
  const completed=[];const result=await runParallelCases(['a','b','c'],{concurrency:2,run:async id=>{if(id==='b')throw Error('save failed');completed.push(id)}});
  assert.deepEqual(completed.toSorted(),['a','c']);assert.equal(result.errors.length,1);assert.equal(result.errors[0].index,1);
});
test('cancellation stops queued cases and waits for in-flight workers to settle',async()=>{
  const controller=new AbortController(),gate=deferred(),started=[];
  const pending=runParallelCases([1,2,3,4],{concurrency:2,signal:controller.signal,run:async id=>{started.push(id);await gate.promise}});
  await tick();controller.abort();gate.resolve();const result=await pending;
  assert.deepEqual(started,[1,2]);assert.equal(result.stopped,true);
});
test('a rate-limit stop preserves other in-flight completion without dispatching queued work',async()=>{
  const gate=deferred(),started=[],saved=[];
  const pending=runParallelCases([1,2,3,4],{concurrency:2,run:async(id,control)=>{started.push(id);await gate.promise;if(id===1)control.stop();saved.push(id)}});
  await tick();gate.resolve();await pending;
  assert.deepEqual(started,[1,2]);assert.deepEqual(saved,[1,2]);
});
test('paced dispatch spaces starts and cancellation wakes waiting slots',async()=>{
  const gate=createPacedDispatch(20),starts=[];
  await Promise.all([1,2,3].map(async()=>{assert.equal(await gate(),true);starts.push(Date.now())}));
  assert.ok(starts[1]-starts[0]>=18);assert.ok(starts[2]-starts[1]>=18);
  const slow=createPacedDispatch(100000),controller=new AbortController();await slow();
  const waiting=slow(controller.signal);await tick();controller.abort();assert.equal(await waiting,false);
});
test('invalid or unbounded concurrency is rejected; an empty batch starts nothing',async()=>{
  await assert.rejects(runParallelCases([1],{concurrency:99,run:async()=>{}}),RangeError);
  let called=false;await runParallelCases([],{run:async()=>{called=true}});assert.equal(called,false);
});
