import assert from 'node:assert/strict';
import {test} from 'node:test';
import handler from '../../server/assistantConversations.js';
import {newConversationId} from '../../src/services/assistantConversationId.js';

const steps=[...Array.from({length:38},(_,index)=>({kind:`account-read:record${index}:2`,label:`Checked record ${index}`,detail:'Read the owned record; checked its source.',status:'complete' as const})),
  {kind:'verification-deeper-review',label:'Taking a closer look',detail:'Used the same evidence.',status:'complete' as const},
  {kind:'verification-3',label:'Answer checked against evidence',detail:'The answer passed the evidence checks.',status:'complete' as const}];
const messages=()=>[{id:'u',role:'user' as const,content:'What is in my records?'},
  {id:'a',role:'assistant' as const,content:'Your checked answer.',phase:'complete' as const,activity:steps,
    result:{answer:'Your checked answer.',status:'answered' as const,citations:[],suggestedQuestions:[],activity:steps,verification:{status:'verified' as const,attempts:3}}}];

test('authenticated persistence sends all normal activity steps and rejects oversized UTF-8 before RPC',async()=>{
  const savedFetch=globalThis.fetch,urlKey=process.env.VITE_SUPABASE_URL,publicKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  process.env.VITE_SUPABASE_URL='https://xiftudmvxphxcjtmfmib.supabase.co';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='fixture';
  const owner='10000000-0000-4000-8000-000000000099',id=newConversationId();
  let writes=0,stored:any;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.pathname==='/auth/v1/user')return Response.json({id:owner,identities:[{provider:'google'}]});
    assert.equal(((init?.headers??{}) as Record<string,string>).Authorization,'Bearer '+'x'.repeat(40));
    if(url.pathname.endsWith('/rpc/affairs_save_conversation_v2')){writes++;stored=JSON.parse(String(init?.body)).p_messages;return Response.json({id,version:1});}
    assert.ok(url.pathname.endsWith('/rpc/affairs_read_conversations_v2'));
    assert.equal(init?.method,'POST');assert.deepEqual(JSON.parse(String(init?.body)),{p_id:id});return Response.json({id,messages:stored,version:1});
  };
  const call=async(method:string,body?:unknown)=>{let status=200,value:any;const res={status(code:number){status=code;return res;},json(result:unknown){value=result;},setHeader(){}};await handler({method,body,query:{id},headers:{authorization:'Bearer '+'x'.repeat(40)}},res);return{status,value};};
  try{
    assert.equal((await call('POST',{id,title:'Records',version:0,messages:messages()})).status,200);
    const read=await call('GET');assert.equal(read.status,200);assert.deepEqual(read.value.messages[1].activity,steps);
    assert.deepEqual(read.value.messages[1].result.verification,{status:'verified',attempts:3});
    assert.equal((await call('POST',{id,title:'Records',version:1,messages:[{id:'u',role:'user',content:'課'.repeat(65000)}]})).status,400);
    assert.equal(writes,1);
  }finally{globalThis.fetch=savedFetch;if(urlKey===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=urlKey;if(publicKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=publicKey;}
});

test('conversation titles are safe for PostgreSQL and invalid or stripped-empty titles never reach the RPC',async()=>{
  const savedFetch=globalThis.fetch,urlKey=process.env.VITE_SUPABASE_URL,publicKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  process.env.VITE_SUPABASE_URL='https://xiftudmvxphxcjtmfmib.supabase.co';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='fixture';
  const owner='10000000-0000-4000-8000-000000000099',id='20000000-0000-4000-8000-000000000099';
  const writes:Array<{p_title:string;p_expected_version:number}>=[];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.pathname==='/auth/v1/user')return Response.json({id:owner,identities:[{provider:'google'}]});
    assert.ok(url.pathname.endsWith('/rpc/affairs_save_conversation_v2'));
    writes.push(JSON.parse(String(init?.body)));return Response.json({id,version:3});
  };
  const call=async(title:unknown)=>{let status=200;const res={status(code:number){status=code;return res;},json(){},setHeader(){}};await handler({method:'POST',body:{id,title,version:2,messages:messages()},headers:{authorization:'Bearer '+'x'.repeat(40)}},res);return status;};
  try{
    assert.equal(await call('\u0000Account \ud83d'),200);
    assert.equal(writes[0].p_title,'Account \uFFFD');assert.equal(writes[0].p_expected_version,2);
    assert.equal(await call('課程🙂'),200);assert.equal(writes[1].p_title,'課程🙂');
    for(const title of ['\u0000',' \u0000 ',123,'x'.repeat(101)])assert.equal(await call(title),400);
    assert.equal(writes.length,2);
  }finally{globalThis.fetch=savedFetch;if(urlKey===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=urlKey;if(publicKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=publicKey;}
});
