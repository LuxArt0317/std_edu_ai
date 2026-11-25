import test from 'node:test';
import assert from 'node:assert/strict';
import {createLabChatTransport} from './chat-transport.mjs';
test('parallel runs keep model selection request scoped', async()=>{
 const seen=[];
 const fetcher=async(path,init)=>{seen.push([path,init.headers.get('X-STU-Evaluation-Model')]);return new Response('{}',{headers:{'X-STU-Evaluation-Model':init.headers.get('X-STU-Evaluation-Model')}})};
 await Promise.all(['gpt-a','gpt-b'].map(model=>createLabChatTransport({model,reasoning:'medium',fetcher}).fetch('/api/affairs-assistant')));
 assert.deepEqual(seen.map(x=>x[1]).sort(),['gpt-a','gpt-b']);
});
test('hosted proxy preserves request body and authorization',async()=>{
 const transport=createLabChatTransport({model:'gpt-a',reasoning:'high',hosted:true,authorization:'Bearer test-only',fetcher:async(path,init)=>{
 assert.equal(path,'/api/affairs-data?resource=evaluation-lab&op=run-public');assert.equal(init.headers.get('Authorization'),'Bearer test-only');assert.equal(init.body,'{"question":"hello"}');return new Response('{}',{headers:{'X-STU-Evaluation-Model':'gpt-a'}});
 }});await transport.fetch('/api/research-assistant',{body:'{"question":"hello"}'});
});
test('unacknowledged model selection fails visibly',async()=>{
 const transport=createLabChatTransport({model:'gpt-a',reasoning:'medium',fetcher:async()=>new Response('{}')});
 await assert.rejects(()=>transport.fetch('/api/research-assistant'),/acknowledge/);
});
