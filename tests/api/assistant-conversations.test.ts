import assert from 'node:assert/strict';import {test} from 'node:test';
import handler from '../../api/affairs-data.ts';
test('conversation API derives owner from verified Google session and strips executable data',async()=>{
  const original=globalThis.fetch,saved={...process.env};
  process.env.VITE_SUPABASE_URL='https://xiftudmvxphxcjtmfmib.supabase.co';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='fixture';
  const owner='10000000-0000-4000-8000-000000000099',id='20000000-0000-4000-8000-000000000099';
  let write:any,read:URL|undefined;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.pathname==='/auth/v1/user')return Response.json({id:owner,identities:[{provider:'google'}]});
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer '+'x'.repeat(40));
    if(url.pathname.endsWith('/rpc/affairs_save_conversation')){write=JSON.parse(String(init?.body));return Response.json({id,version:1});}
    read=url;return Response.json([]);
  };
  const call=async(method:string,body?:unknown,query?:Record<string,string>)=>{let status=200,value:any;const response={status(code:number){status=code;return response;},json(result:unknown){value=result;},setHeader(){}};await handler({method,body,query:{...query,resource:'conversations'},headers:{authorization:'Bearer '+'x'.repeat(40)}},response);return {status,value};};
  try{
    assert.equal((await call('POST',{id,title:'Chat',version:0,messages:[{id:'message',role:'assistant',content:'Hello',result:{status:'answered',answer:'Hello',proposedAction:{kind:'create_task',payload:{title:'no replay'}},citations:[]}}],user_id:'attacker'})).status,200);
    assert.equal(write.p_messages[0].result.proposedAction,undefined);assert.equal(write.p_messages[0].actionExpired,true);assert.equal(write.p_user_id,undefined);
    await call('GET',undefined,{id});assert.equal(read!.searchParams.get('user_id'),'eq.'+owner);assert.equal(read!.searchParams.get('id'),'eq.'+id);
    assert.equal((await call('DELETE')).status,400);assert.equal((await call('POST',{id,title:'Chat',version:-1,messages:[]})).status,400);
  }finally{globalThis.fetch=original;for(const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'])if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
});
