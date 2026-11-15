import assert from 'node:assert/strict';
import {test} from 'node:test';
import affairsData from '../../api/affairs-data.ts';
import affairsManage from '../../api/affairs-manage.ts';
import {readChargePaymentHistory} from '../../server/chargePaymentHistory.js';
import {chargePaymentHistoryAdminScope} from '../../server/chargePaymentContract.js';

const origin = 'https://xiftudmvxphxcjtmfmib.supabase.co';
const user = '7c390000-0000-4000-8000-000000000001';
const student = '7c390000-0000-4000-8000-000000000002';
const charge = '7c390000-0000-4000-8000-000000000003';
const payment = '7c390000-0000-4000-8000-000000000004';
const reversal = '7c390000-0000-4000-8000-000000000005';
const requestId = '7c390000-0000-4000-8000-000000000006';
const other = '7c390000-0000-4000-8000-000000000007';
const reverseRequestId = '7c390000-0000-4000-8000-000000000008';
const token = 'test-caller-token-not-a-real-token-0000000';
const scope = 'fee-payment-history';
const paidOn = '2026-09-29';
const recordKind = 'record_charge_payment';
const reverseKind = 'reverse_charge_payment';
const paymentRow = {id:payment, chargeId:charge, chargeLabel:'Tuition instalment', chargeCategory:'Tuition', entryKind:'payment',
  paidOn, amount:'40.25', currency:'TWD', sourceMode:'local_recorded', reversesPaymentId:null};
const reversalRow = {...paymentRow,id:reversal,entryKind:'reversal',paidOn:'2026-10-01',reversesPaymentId:payment};
const recordInput = {request_id:requestId, student_id:student, charge_id:charge, paid_on:paidOn, amount:'40.25', currency:'TWD'};
const reverseInput = {request_id:reverseRequestId, student_id:student, charge_id:charge, paid_on:reversalRow.paidOn, payment_id:payment};
const {chargeLabel: _label, chargeCategory: _category, ...paymentEntry} = paymentRow;
const savedReceipt = {...paymentEntry,studentId:student,amountPaid:'50.25',legacyAmountPaid:'10.00'};
const reverseReceipt = {...savedReceipt,id:reversal,entryKind:'reversal',paidOn:reversalRow.paidOn,reversesPaymentId:payment,amountPaid:'10.00'};
const history = (rows:unknown[] = [],total = rows.length) => ({userId:user,studentRecordFound:true,rows,total,hasUndatedPaidAmount:true});
const adminHistory=(rows:unknown[] = [],total=rows.length)=>({studentId:student,chargeId:charge,rows,total,hasUndatedPaidAmount:true});
const adminQuery={scope:chargePaymentHistoryAdminScope,student_id:student,charge_id:charge};
type Query = Record<string,string|string[]|undefined>;

async function invoke(handler = affairsData,{method = 'GET',query,body,bearer = token}:{method?:string;query?:Query;body?:unknown;bearer?:string} = {}) {
  const result:{code:number;body:unknown;headers:Map<string,string>}={code:0,body:null,headers:new Map()};
  const response = {
    setHeader(name:string,value:string){result.headers.set(name,value);},
    status(code:number){result.code=code;return response;},
    json(value:unknown){result.body=value;},
  };
  await handler({method,query,body,headers:{authorization:bearer?'Bearer '+bearer:undefined}},response);
  assert.equal(result.headers.get('Cache-Control'),'no-store, max-age=0');
  assert.equal(result.headers.get('X-Content-Type-Options'),'nosniff');
  return result;
}

async function simulate(run:(calls:{rpc:string;body:unknown}[])=>Promise<void>,reply:(request:{rpc:string;body:unknown})=>Response,google=true) {
  const oldFetch = globalThis.fetch;
  const envKeys = ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'] as const;
  const oldEnv = envKeys.map(key=>process.env[key]);
  process.env.VITE_SUPABASE_URL=origin;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY='fixture-publishable-key';
  const calls:{rpc:string;body:unknown}[]=[];
  let unexpected:unknown;
  globalThis.fetch=async (input,init)=>{
    try {
      const url=new URL(String(input));
      const headers=new Headers(init?.headers);
      assert.equal(url.origin,origin);
      assert.equal(headers.get('authorization'),'Bearer '+token);
      assert.equal(headers.get('apikey'),'fixture-publishable-key');
      assert.ok(init?.signal instanceof AbortSignal);
      if(url.pathname==='/auth/v1/user') return Response.json({id:user,identities:[{provider:google?'google':'email'}]});
      assert.equal(init?.method,'POST');
      assert.equal(init.redirect,'error');
      const rpc=url.pathname.replace(/^\/rest\/v1\/rpc\//u,'');
      const request={rpc,body:JSON.parse(String(init.body))};
      calls.push(request);
      return reply(request);
    } catch (error) {unexpected=error;throw error;}
  };
  try {await run(calls);if(unexpected)throw unexpected;}
  finally {
    globalThis.fetch=oldFetch;
    envKeys.forEach((key,index)=>{const value=oldEnv[index];if(value===undefined)delete process.env[key];else process.env[key]=value;});
  }
}

test('the GET endpoint keeps inclusive Taipei dates and a selected charge bound to the verified caller', async()=>{
  const filtered = history([reversalRow,paymentRow]);
  await simulate(async calls=>{
    const found=await invoke(affairsData,{query:{scope,from:paidOn,through:reversalRow.paidOn,charge_id:charge}});
    assert.equal(found.code,200);
    assert.deepEqual(found.body,filtered);
    assert.deepEqual(calls,[{rpc:'affairs_read_charge_payment_history',body:{p_from:paidOn,p_through:reversalRow.paidOn,p_charge_id:charge,p_offset:0,p_limit:25}}]);
  },()=>Response.json(filtered));
});

test('safe defaults, later page count, and an unlinked student use the existing distinct response states', async()=>{
  const noStudent={...history(),studentRecordFound:false,hasUndatedPaidAmount:false};
  await simulate(async calls=>{
    const empty=await invoke(affairsData,{query:{scope}});
    assert.equal(empty.code,200);
    assert.deepEqual(empty.body,noStudent);
    const page=await invoke(affairsData,{query:{scope,page:'201'}});
    assert.equal(page.code,200);
    assert.deepEqual(page.body,history([],27));
    assert.deepEqual(calls.map(({body})=>body),[
      {p_from:null,p_through:null,p_charge_id:null,p_offset:0,p_limit:25},
      {p_from:null,p_through:null,p_charge_id:null,p_offset:5000,p_limit:25},
    ]);
  },({body})=>Response.json((body as {p_offset:number}).p_offset?history([],27):noStudent));
});

test('duplicate, malformed, mixed-route and caller-changing query parameters fail before the ledger read',async()=>{
  await simulate(async calls=>{
    const queries:Query[]=[{scope,user_id:other},{scope,student_id:other},{scope,limit:'10000'},{scope,resource:'conversations'},
      {scope,resource:'announcement-email-delivery'},{scope:[scope,'permanent-courses']},{scope:[scope,scope]},
      {scope:scope+'-admin'},{scope,from:['2026-09-01','2026-10-01']},{scope,from:'2026-02-29'},
      {scope,from:'2026-10-01',through:'2026-09-30'},{scope,charge_id:'not-a-uuid'},{scope,charge_id:[charge,other]},
      {scope,page:'0'},{scope,page:'202'},{scope,page:['1','2']},{scope,page:'01'}];
    for(const query of queries) assert.equal((await invoke(affairsData,{query})).code,400,JSON.stringify(query));
    assert.equal((await invoke(affairsData,{query:{scope},method:'POST'})).code,405);
    assert.equal((await invoke(affairsData,{query:{scope},bearer:''})).code,401);
    assert.deepEqual(calls,[]);
  },()=>assert.fail('No ledger RPC is authorized'));
  await simulate(async calls=>{
    assert.equal((await invoke(affairsData,{query:{scope}})).code,401);
    assert.deepEqual(calls,[]);
  },()=>assert.fail('Email-only session cannot read the ledger'),false);
});

test('untrusted mismatches or partial native results cannot leak a ledger response',async()=>{
  const valid=history([reversalRow,paymentRow]);
  const failures:unknown[]=[{...valid,userId:other},{...valid,total:3},{...valid,studentRecordFound:false},{...valid,studentId:student},
    history([paymentRow,reversalRow]),history([paymentRow,paymentRow]),history([{...paymentRow,userId:other}]),
    history([{...paymentRow,chargeId:other}]),history([{...paymentRow,paidOn:'2026-08-01'}]),history([{...paymentRow,amount:40.25}]),
    history([{...paymentRow,sourceMode:'verified'}]),history([{...paymentRow,chargeCategory:{private:true}}]),
    history([{...reversalRow,amount:'41.25'},paymentRow]),history([{...paymentRow,reversesPaymentId:reversal}])];
  let index=0;
  await simulate(async()=>{
    for(;index<failures.length;index++) {
      const result=await invoke(affairsData,{query:{scope,from:paidOn,through:reversalRow.paidOn,charge_id:charge}});
      assert.equal(result.code,503,`invalid response ${index}`);
      assert.deepEqual(result.body,{error:'The payment history response could not be verified.'});
    }
    const unreadable=await invoke(affairsData,{query:{scope}});
    assert.equal(unreadable.code,503);
  },()=>index===failures.length?new Response(' '.repeat(65537)):Response.json(failures[index]));
});

test('the administrator endpoint forwards exact operations and verifies returned IDs and decimal receipts',async()=>{
  const create={kind:recordKind,payload:recordInput}, reverse={kind:reverseKind,payload:reverseInput};
  const bodies=[create,create,reverse,reverse];
  let index=0;
  await simulate(async calls=>{
    for(;index<bodies.length;index++) {
      const result=await invoke(affairsManage,{method:'POST',body:bodies[index]});
      assert.equal(result.code,200);
      assert.deepEqual(result.body,index<2?savedReceipt:reverseReceipt);
    }
    assert.deepEqual(calls,bodies.map(({kind,payload})=>({rpc:'affairs_change_charge_payment',body:{p_kind:kind,p_payload:payload}})));
  },()=>Response.json(index<2?savedReceipt:reverseReceipt));
});

test('manager input admits only exact dates, UUIDs and positive decimal strings',async()=>{
  const invalid=[{kind:recordKind,payload:{...recordInput,amount:5}},{kind:recordKind,payload:{...recordInput,amount:'0.00'}},
    {kind:recordKind,payload:{...recordInput,amount:'01.20'}},{kind:recordKind,payload:{...recordInput,amount:'1.125'}},
    {kind:recordKind,payload:{...recordInput,currency:'USD'}},{kind:recordKind,payload:{...recordInput,paid_on:'2100-01-01'}},
    {kind:recordKind,payload:{...recordInput,paid_on:'2026-06-31'}},{kind:recordKind,payload:{...recordInput,student_id:'foreign'}},
    {kind:recordKind,payload:{...recordInput,processor_token:'untrusted'}},{kind:recordKind,payload:recordInput,token:'untrusted'},
    {kind:reverseKind,payload:{...reverseInput,payment_id:undefined}},{kind:reverseKind,payload:{...reverseInput,amount:'1.00'}},
    {kind:'delete_charge_payment',payload:reverseInput}];
  await simulate(async calls=>{
    for(const body of invalid) assert.equal((await invoke(affairsManage,{method:'POST',body})).code,400,JSON.stringify(body));
    assert.equal((await invoke(affairsManage,{method:'POST',body:{kind:recordKind,payload:recordInput},bearer:''})).code,401);
    assert.deepEqual(calls,[]);
  },()=>assert.fail('Malformed manager input must not reach the ledger'));
});

test('the shared transport preserves denial and conflicts and withholds an invalid receipt',async()=>{
  const body={kind:recordKind,payload:recordInput};
  let code=403;
  await simulate(async()=>{
    for(const status of [403,404,409,503]) {
      code=status;
      const result=await invoke(affairsManage,{method:'POST',body});
      assert.equal(result.code,status);
      assert.doesNotMatch(JSON.stringify(result.body),/private details/u);
    }
    code=200;
    assert.equal((await invoke(affairsManage,{method:'POST',body})).code,503);
  },()=>code===200?Response.json({...savedReceipt,studentId:other,amount:'99.25'}):Response.json({message:'private details'},{status:code}));
});

test('the shared own reader rejects an expired deadline before issuing a request',async()=>{
  await simulate(async calls=>{
    await assert.rejects(readChargePaymentHistory({user:{id:user},url:origin,token,key:'fixture-publishable-key',requestDeadline:Date.now()-1}),
      {status:503});
    assert.deepEqual(calls,[]);
  },()=>assert.fail('The deadline is already expired'));
});

test('the staff GET binds the exact student and charge and permits an out-of-window reversal flag',async()=>{
  const selected=adminHistory([{...paymentRow,canReverse:false}],26);
  await simulate(async calls=>{
    const result=await invoke(affairsData,{query:{...adminQuery,from:paidOn,through:paidOn,page:'2'}});
    assert.equal(result.code,200);
    assert.deepEqual(result.body,selected);
    assert.deepEqual(calls,[{rpc:'affairs_read_charge_payment_history_admin',body:{
      p_student_id:student,p_charge_id:charge,p_from:paidOn,p_through:paidOn,p_offset:25,p_limit:25,
    }}]);
  },()=>Response.json(selected));
});

test('staff payment history rejects missing, malformed, duplicate and alternate scope selectors',async()=>{
  await simulate(async calls=>{
    for (const query of [{...adminQuery,student_id:undefined},{...adminQuery,charge_id:undefined},{...adminQuery,user_id:user},
      {...adminQuery,student_id:[student,other]},{...adminQuery,charge_id:[charge,other]},{...adminQuery,page:'202'},
      {...adminQuery,from:'2026-10-02',through:'2026-10-01'},{...adminQuery,scope:[scope,chargePaymentHistoryAdminScope]},
      {...adminQuery,scope:[chargePaymentHistoryAdminScope,chargePaymentHistoryAdminScope]},{...adminQuery,resource:'conversations'}]) {
      assert.equal((await invoke(affairsData,{query})).code,400,JSON.stringify(query));
    }
    assert.equal((await invoke(affairsData,{query:adminQuery,method:'POST'})).code,405);
    assert.equal((await invoke(affairsData,{query:adminQuery,bearer:''})).code,401);
    assert.deepEqual(calls,[]);
  },()=>assert.fail('Malformed or anonymous requests must stop before staff readback'));
});

test('staff payment history keeps verified database denial and unavailable charge responses private',async()=>{
  let status=403;
  await simulate(async calls=>{
    for(status of [403,404,503]) {
      const result=await invoke(affairsData,{query:adminQuery});
      assert.equal(result.code,status);
      assert.doesNotMatch(JSON.stringify(result.body),/private details/u);
    }
    assert.deepEqual(calls.map(({rpc})=>rpc),Array(3).fill('affairs_read_charge_payment_history_admin'));
  },()=>Response.json({message:'private details'},{status}));
});

test('staff receipt selection rejects foreign identities and conflicting reversal flags',async()=>{
  const original={...paymentRow,canReverse:false};
  const correction={...reversalRow,canReverse:false};
  const valid=adminHistory([correction,original]);
  const responses:unknown[]=[valid,adminHistory([{...paymentRow,canReverse:true}]),{...valid,studentId:other},
    {...valid,chargeId:other},{...valid,userId:user},{...valid,total:4},adminHistory([{...original,chargeId:other}]),
    adminHistory([{...correction,canReverse:true},original]),adminHistory([correction,{...original,canReverse:true}]),
    adminHistory([paymentRow]),adminHistory([{...original,canReverse:'false'}]),adminHistory([{...original,requestId}])];
  let index=0;
  await simulate(async()=>{
    for(;index<responses.length;index++){
      const result=await invoke(affairsData,{query:adminQuery});
      if(index<2){assert.equal(result.code,200);assert.deepEqual(result.body,responses[index]);}
      else {
        assert.equal(result.code,503,`invalid staff response ${index}`);
        assert.deepEqual(result.body,{error:'The selected payment history response could not be verified.'});
      }
    }
  },()=>Response.json(responses[index]));
});
