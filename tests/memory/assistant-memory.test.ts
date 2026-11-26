import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssistantMemory} from '../../src/services/assistantMemory.ts';
class Store{data=new Map<string,string>();getItem(k:string){return this.data.get(k)||null;}setItem(k:string,v:string){this.data.set(k,v);}removeItem(k:string){this.data.delete(k);}}
Object.defineProperty(globalThis,'localStorage',{value:new Store(),configurable:true});
Object.defineProperty(globalThis,'sessionStorage',{value:new Store(),configurable:true});
const result={status:'answered',answer:'Orientation: 8/10',citations:[{url:'http://localhost/dtm/grades'}],verification:{status:'verified',attempts:1}} as any;
test('verified memories survive rolling history and owner isolation',()=>{
 const a=createAssistantMemory('a');a.clear();a.remember('my grades',result);
 assert.equal(createAssistantMemory('a').count(),1);assert.equal(createAssistantMemory('b').count(),0);assert.equal(createAssistantMemory(null).count(),0);
 const history=Array.from({length:30},()=>({role:'user',content:'other question'}));
 const context=a.context('where was that grade?',history);assert.equal(context.length,23);assert.match(context[0].content,/Orientation/);assert.match(context[0].content,/not current evidence/);a.clear();assert.equal(a.count(),0);
});
test('failed checks, secrets and missing sources cannot become memories',()=>{
 const a=createAssistantMemory('c');a.clear();a.remember('grades',{...result,verification:{status:'unverified',attempts:1}});a.remember('password',result);a.remember('grades',{...result,citations:[]});assert.equal(a.count(),0);
});
test('guest memory stays session-only and corrupt storage fails closed',()=>{
 const a=createAssistantMemory(null);a.clear();a.remember('calendar',result);assert.equal(a.count(),1);
 assert.equal((globalThis.localStorage as any).data.has('stu.assistant.memory.v1:guest'),false);a.clear();
 globalThis.localStorage.setItem('stu.assistant.memory.v1:broken','{');assert.equal(createAssistantMemory('broken').count(),0);
});
