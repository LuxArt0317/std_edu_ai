import assert from 'node:assert/strict';
import {test} from 'node:test';
import publicHandler from '../../api/research-assistant.ts';
import {readAssistantReply} from '../../src/services/assistantStreamReader.js';

test('directory lookup streams observed work before the final sourced answer', async()=>{
  const saved={openai:process.env.OPENAI_API_KEY,url:process.env.VITE_SUPABASE_URL,key:process.env.VITE_SUPABASE_PUBLISHABLE_KEY};
  delete process.env.OPENAI_API_KEY;
  process.env.VITE_SUPABASE_URL='https://test.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY='test-publishable';
  const chunks:string[]=[],headers:Record<string,string>={};
  let ended=false;
  const response={status(_code:number){return response},json(_payload:unknown){throw Error('Unexpected JSON fallback')},setHeader(name:string,value:string){headers[name]=value},write(chunk:string){chunks.push(chunk)},end(){ended=true}};
  try {
    await publicHandler({method:'POST',body:{question:'How do I sign in to Moodle?',stream:true},headers:{'x-forwarded-for':'stream-directory-test'}},response);
    assert.equal(headers['Content-Type'],'text/event-stream; charset=utf-8');
    assert.equal(ended,true);
    const frames=chunks.join('').trim().split('\n\n').map(frame=>({event:frame.match(/^event: (.+)$/m)?.[1],data:JSON.parse(frame.match(/^data: (.+)$/m)?.[1]||'null')}));
    assert.ok(frames.length>=2);
    assert.ok(frames.slice(0,-1).every(frame=>frame.event==='progress'));
    assert.equal(frames.at(-1)?.event,'result');
    assert.ok(frames.slice(0,-1).some(frame=>frame.data.kind==='directory'&&frame.data.status==='complete'));
    assert.ok(frames.slice(0,-1).every(frame=>typeof frame.data.label==='string'&&typeof frame.data.detail==='string'));
    assert.equal(frames.at(-1)?.data.status,'answered');
    assert.ok(frames.at(-1)?.data.answer.length>20);
  } finally {
    for (const [name,value] of Object.entries(saved)) if(value===undefined) delete process.env[name]; else process.env[name]=value;
  }
});

test('browser stream reader handles split SSE frames and does not invent an answer',async()=>{
  const encoder=new TextEncoder();
  const parts=['event: progress\r\ndata: {"kind":"web","label":"Searching school sources","detail":"Checking pages","status":"running"}\r','\n\r\nevent: result\ndata: {"answer":"Verified answer","status":"answered"}\n\n'];
  const body=new ReadableStream<Uint8Array>({start(controller){for(const part of parts)controller.enqueue(encoder.encode(part));controller.close()}});
  const progress:unknown[]=[];
  const result=await readAssistantReply(new Response(body,{headers:{'content-type':'text/event-stream'}}),step=>progress.push(step));
  assert.equal(progress.length,1);
  assert.deepEqual(result,{answer:'Verified answer',status:'answered'});
  await assert.rejects(readAssistantReply(new Response('event: progress\ndata: {"kind":"web","label":"Searching","detail":"Waiting","status":"running"}\n\n',{headers:{'content-type':'text/event-stream'}})),/ended before an answer/);
});
