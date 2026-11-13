import assert from 'node:assert/strict';
import test from 'node:test';
import dataHandler from '../../api/affairs-data.ts';
import manageHandler from '../../api/affairs-manage.ts';

const origin = 'https://xiftudmvxphxcjtmfmib.supabase.co';
const caller = '11111111-1111-4111-8111-111111111111';
const student = '22222222-2222-4222-8222-222222222222';
const token = 'test-fee-remission-token'.repeat(2);
const action = {kind:'save_fee_remission',payload:{
  id:'33333333-3333-4333-8333-333333333333',request_id:'44444444-4444-4444-8444-444444444444',
  user_id:student,expected_version:0,row_order:0,academic_year_text:'001',semester_text:'',student_number:null,
  category_text:'本機測試',amount_text:'0',check_status_text:null,notes_text:' 原文 ',
}};

test('fee remission handler separates personal and manager scope and rejects foreign or malformed data', async t => {
  t.mock.method(globalThis,'fetch',async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, origin);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer '+token);
    if (url.pathname === '/auth/v1/user') return Response.json({id:caller,identities:[{provider:'google'}]});
    const body = JSON.parse(String(init?.body));
    if (url.pathname === '/rest/v1/rpc/affairs_manage_fee_remission') {
      assert.deepEqual(body,{p_kind:action.kind,p_payload:action.payload});
      return Response.json({id:action.payload.id,kind:action.kind,version:1});
    }
    assert.equal(url.pathname,'/rest/v1/rpc/affairs_read_fee_remission');
    assert.deepEqual(body, expectedRead);
    return Response.json({userId:responseOwner,records:[]});
  });
  const env = process.env;
  const oldUrl = env.VITE_SUPABASE_URL, oldKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  env.VITE_SUPABASE_URL = origin;
  env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-key';
  let expectedRead: {p_user_id?:string} = {}, responseOwner = caller;
  async function invoke(query:Record<string,string|string[]|undefined>|undefined, body?:unknown) {
    let status = 0, value:unknown;
    const headers:Record<string,string> = {};
    const res = {status(code:number) {status=code;return res;},json(result:unknown){value=result;},setHeader(k:string,v:string){headers[k]=v;}};
    const req = {method:body?'POST':'GET',headers:{authorization:'Bearer '+token},query,body};
    await (body?manageHandler:dataHandler)(req,res);
    assert.match(headers['Cache-Control'],/no-store/);
    return {status,value};
  }
  try {
    assert.deepEqual(await invoke({scope:'fee-remission'}),{status:200,value:{userId:caller,records:[]}});
    for (const query of [{scope:'fee-remission',user_id:student},{scope:'fee-remission-admin',user_id:[student]},
      {scope:['fee-remission'],resource:'conversations'},{scope:'fee-remission-unknown'}]) {
      assert.equal((await invoke(query)).status,400);
    }
    responseOwner = student;
    assert.equal((await invoke({scope:'fee-remission'})).status,503);
    expectedRead = {p_user_id:student};
    assert.equal((await invoke({scope:'fee-remission-admin',user_id:student})).status,200);
    assert.equal((await invoke(undefined,action)).status,200);
    assert.equal((await invoke(undefined,{...action,extra:true})).status,400);
    assert.equal((await invoke(undefined,{...action,payload:{...action.payload,amount_text:0}})).status,400);
  } finally {
    if (oldUrl === undefined) delete env.VITE_SUPABASE_URL; else env.VITE_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete env.VITE_SUPABASE_PUBLISHABLE_KEY; else env.VITE_SUPABASE_PUBLISHABLE_KEY = oldKey;
  }
});
