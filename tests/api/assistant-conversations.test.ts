import assert from 'node:assert/strict';import {test} from 'node:test';
import handler from '../../api/affairs-data.ts';
test('conversation API derives owner from verified Google session and strips executable data',async()=>{
  const original=globalThis.fetch,saved={...process.env};
  process.env.VITE_SUPABASE_URL='https://xiftudmvxphxcjtmfmib.supabase.co';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='fixture';
  const owner='10000000-0000-4000-8000-000000000099',id='20000000-0000-4000-8000-000000000099';
  let write:any,read:unknown;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.pathname==='/auth/v1/user')return Response.json({id:owner,identities:[{provider:'google'}]});
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer '+'x'.repeat(40));
    if(url.pathname.endsWith('/rpc/affairs_save_conversation_v2')){write=JSON.parse(String(init?.body));return Response.json({id,version:1});}
    assert.equal(url.pathname,'/rest/v1/rpc/affairs_read_conversations_v2');
    assert.equal(init?.method,'POST');read=JSON.parse(String(init?.body));return Response.json(null);
  };
  const call=async(method:string,body?:unknown,query?:Record<string,string>)=>{let status=200,value:any;const response={status(code:number){status=code;return response;},json(result:unknown){value=result;},setHeader(){}};await handler({method,body,query:{...query,resource:'conversations'},headers:{authorization:'Bearer '+'x'.repeat(40)}},response);return {status,value};};
  try{
    assert.equal((await call('POST',{id,title:'Chat',version:0,messages:[{id:'message',role:'assistant',content:'Hello',result:{status:'answered',answer:'Hello',proposedAction:{kind:'create_task',payload:{title:'no replay'}},citations:[]}}],user_id:'attacker'})).status,200);
    assert.equal(write.p_messages[0].result.proposedAction,undefined);assert.equal(write.p_messages[0].actionExpired,true);assert.equal(write.p_user_id,undefined);
    assert.equal((await call('GET',undefined,{id,user_id:'foreign'})).status,404);assert.deepEqual(read,{p_id:id});
    assert.equal((await call('DELETE')).status,400);assert.equal((await call('POST',{id,title:'Chat',version:-1,messages:[]})).status,400);
  }finally{globalThis.fetch=original;for(const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'])if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
});

test('conversation DELETE acknowledges only the owner-scoped database receipt',async()=>{
  const original=globalThis.fetch;
  const config={VITE_SUPABASE_URL:'https://xiftudmvxphxcjtmfmib.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'fixture'};
  const saved=Object.fromEntries(Object.keys(config).map(key=>[key,process.env[key]]));
  Object.assign(process.env,config);
  const owner='10000000-0000-4000-8000-000000000099';
  const id='20000000-0000-4000-8000-000000000099';
  const alternate='30000000-0000-4000-8000-000000000099';
  const token='x'.repeat(40);
  let rpcCalls=0;
  let receipt:unknown={deleted:true,protection:'conversation-delete-v2'};
  let rpcStatus=200;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.pathname==='/auth/v1/user')return Response.json({id:owner,identities:[{provider:'google'}]});
    assert.equal(url.pathname,'/rest/v1/rpc/affairs_delete_conversation_v2');
    assert.equal(url.search,'');
    assert.equal(init?.method,'POST');
    assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+token);
    assert.deepEqual(JSON.parse(String(init?.body)),{p_id:id});
    rpcCalls++;
    return Response.json(receipt,{status:rpcStatus});
  };
  const request=async (query:Record<string,string>)=>{
    let status=200,payload:unknown;
    const response={status(code:number){status=code;return response;},json(value:unknown){payload=value;},setHeader(){}};
    await handler({method:'DELETE',query:{...query,resource:'conversations'},headers:{authorization:'Bearer '+token},body:{user_id:alternate}},response);
    return {status,payload};
  };
  try{
    const query={id,user_id:alternate};
    assert.deepEqual(await request(query),{status:200,payload:{deleted:true}});
    assert.deepEqual(await request(query),{status:200,payload:{deleted:true}});
    assert.equal((await request({})).status,400);
    assert.equal((await request({id:'invalid'})).status,400);
    assert.equal(rpcCalls,2);
    receipt={deleted:true};
    assert.equal((await request(query)).status,503);
    receipt={deleted:false,protection:'conversation-delete-v2'};
    assert.equal((await request(query)).status,503);
    receipt={error:'Provider request failed'};
    rpcStatus=503;
    assert.equal((await request(query)).status,503);
    rpcStatus=409;
    assert.equal((await request(query)).status,409);
    rpcStatus=429;
    assert.equal((await request(query)).status,429);
    assert.equal(rpcCalls,7);
  }finally{
    globalThis.fetch=original;
    for(const [key,value] of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
