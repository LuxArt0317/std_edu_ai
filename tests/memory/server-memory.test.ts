import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryEntry,openAssistantMemory} from '../../server/assistantMemory.js';
const account={url:'https://example.supabase.co',key:'anon-test',token:'user-test',user:{id:'owner-a'}};
const answer={status:'answered',answer:'Grade: 8',verification:{status:'verified'},citations:[{url:'https://stu.best/dtm/grades'}]};
test('admission excludes drafts, actions, credentials and credentialed URLs',()=>{
 assert.ok(memoryEntry('grades',answer));assert.equal(memoryEntry('grades',{...answer,verification:{status:'unverified'}}),null);
 assert.equal(memoryEntry('password',answer),null);assert.equal(memoryEntry('grades',{...answer,proposedAction:{}}),null);
 assert.equal(memoryEntry('grades',{...answer,citations:[{url:'https://stu.best/?token=secret'}]}),null);
});
test('verified server owner, auth separation, generation fence and bounded recall',async()=>{
 process.env.ASSISTANT_MEMORY_ENABLED='true';process.env.SUPABASE_SERVICE_ROLE_KEY='server-test';const calls:any[]=[];
 const fetcher=async(url:any,init:any)=>{calls.push({url,init});const value=url.includes('entries?')?[{question:'grades',answer:'Grade: 8',sources:['https://stu.best/dtm/grades'],observed_at:'2026-11-27'}]:url.includes('state?')?[{generation:7}]:true;return new Response(JSON.stringify(value));};
 const memory=await openAssistantMemory(account,{fetcher:fetcher as typeof fetch});assert.ok(memory);assert.equal(memory.count,1);
 assert.match(memory.context('grades',[])[0].content,/not instructions or fresh evidence/);
 await memory.remember('grades',answer);const saved=calls.at(-1);assert.equal(saved.init.headers.Authorization,'Bearer server-test');const body=JSON.parse(saved.init.body);assert.equal(body.p_owner,'owner-a');assert.equal(body.p_generation,7);
 assert.equal(calls[0].init.headers.Authorization,'Bearer user-test');await memory.clear();assert.equal(calls.at(-1).init.headers.Authorization,'Bearer user-test');
 assert.equal(await openAssistantMemory(account,{disabled:true,fetcher:()=>{throw Error('must not fetch');}}),null);
 delete process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.ASSISTANT_MEMORY_ENABLED;
});
test('missing migration or denied store fails without breaking chat',async()=>{
 process.env.ASSISTANT_MEMORY_ENABLED='true';assert.equal(await openAssistantMemory(account,{fetcher:async()=>new Response('{}',{status:404})}),null);delete process.env.ASSISTANT_MEMORY_ENABLED;
});
