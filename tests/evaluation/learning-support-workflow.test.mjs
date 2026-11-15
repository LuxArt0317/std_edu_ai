import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import data from '../../api/affairs-data.ts';
import action from '../../api/affairs-action.ts';
import manage from '../../api/affairs-manage.ts';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co',publishable='controlled-publishable';
const stamp='2026-11-15T08:50:00.000001+00:00';
const fixtureUsers=Object.fromEntries(['A','B','manager'].map(role=>[role,{id:randomUUID(),token:'test-'+role+'-'+randomUUID()}]));
const owner=fixtureUsers.A.id,other=fixtureUsers.B.id,id=randomUUID(),idB=randomUUID();
const rows=[{id,ownerId:owner,topic:'Learning goal A',details:'Prepare a reading schedule',status:'submitted',reviewNote:'',version:1,submittedAt:stamp,updatedAt:stamp},
  {id:idB,ownerId:other,topic:'Learning goal B',details:'Discuss weekly group study',status:'submitted',reviewNote:'',version:1,submittedAt:stamp,updatedAt:stamp}];
const student={request_id:randomUUID(),topic:rows[0].topic,details:rows[0].details};
const review={request_id:randomUUID(),id,expected_version:1,status:'in_review',note:'Opened for local review'};
const withdraw={request_id:randomUUID(),id,expected_version:2};
function environment(t){
  const names={VITE_SUPABASE_URL:origin,VITE_SUPABASE_PUBLISHABLE_KEY:publishable},original=Object.entries(names).map(([key])=>[key,process.env[key]]);
  Object.assign(process.env,names);
  t.after(()=>original.forEach(([key,value])=>{if(value===undefined)delete process.env[key];else process.env[key]=value;}));
}

async function invoke(handler,{role='A',query,body,method=body?'POST':'GET'}={}){
  const headers=new Headers(),output={statusCode:200,body:null,headers};
  const response={setHeader(name,value){headers.set(name,value);},status(status){output.statusCode=status;return this;},json(value){output.body=value;}};
  await handler({method,query,body,headers:role?{authorization:'Bearer '+fixtureUsers[role].token}:{}},response);
  return output;
}

test('actual read, student action and manager endpoints keep exact scope, role denial, receipts and excluded outcomes',async t=>{
  environment(t);
  const requests=[];
  let readOverride=null,badReceipt=false;
  t.mock.method(globalThis,'fetch',async(target,init)=>{
    const url=new URL(target),headers=new Headers(init.headers);
    assert.equal(url.origin,origin);
    assert.equal(headers.get('apikey'),publishable);
    const role=Object.keys(fixtureUsers).find(name=>'Bearer '+fixtureUsers[name].token===headers.get('authorization'));
    assert.ok(role);
    const caller=fixtureUsers[role].id;
    if(url.pathname==='/auth/v1/user')return Response.json({id:caller,identities:[{provider:'google'}]});
    assert.equal(init.method,'POST');
    assert.equal(init.redirect,'error');
    const payload=JSON.parse(init.body);requests.push({path:url.pathname,role,payload});
    if(url.pathname==='/rest/v1/rpc/affairs_read_learning_support'){
      if(payload.p_view==='review'&&role!=='manager')return Response.json({error:'Rejected by role'},{status:403});
      const available=payload.p_view==='review'?rows:rows.filter(row=>row.ownerId===caller);
      return Response.json(readOverride??{userId:caller,canReview:role==='manager',view:payload.p_view,page:payload.p_page,total:available.length,
        rows:payload.p_page===1?available:[]});
    }
    assert.equal(url.pathname,'/rest/v1/rpc/affairs_change_learning_support');
    const {p_kind:kind,p_payload:input}=payload;
    if(kind==='review'&&role!=='manager')return Response.json({error:'Rejected by role'},{status:403});
    if(kind==='withdraw'&&role!=='A')return Response.json({error:'Other caller'},{status:404});
    const status=kind==='submit'?'submitted':kind==='withdraw'?'withdrawn':input.status;
    return Response.json({id,requestId:badReceipt?randomUUID():input.request_id,status,
      version:kind==='submit'?1:input.expected_version+1});
  });
  const mine=await invoke(data,{query:{scope:'learning-support'}});
  assert.equal(mine.statusCode,200);
  assert.deepEqual(mine.body.rows,[rows[0]]);
  assert.equal(mine.body.canReview,false);
  assert.match(mine.headers.get('cache-control'),/no-store/u);
  const second=await invoke(data,{role:'B',query:{scope:'learning-support',page:'1'}});
  assert.deepEqual(second.body.rows,[rows[1]]);
  assert.deepEqual((await invoke(data,{query:{scope:'learning-support',page:'2'}})).body.rows,[]);
  assert.equal((await invoke(data,{role:'B',query:{scope:'learning-support-review'}})).statusCode,403);
  assert.deepEqual((await invoke(data,{role:'manager',query:{scope:'learning-support-review'}})).body.rows,rows);
  assert.deepEqual((await invoke(data,{role:'manager',query:{scope:'learning-support'}})).body.rows,[]);
  assert.equal((await invoke(data,{role:null,query:{scope:'learning-support'}})).statusCode,401);
  readOverride={...mine.body,rows:[rows[1]]};
  assert.equal((await invoke(data,{query:{scope:'learning-support'}})).statusCode,503);
  readOverride={...mine.body,rows:[]};
  assert.equal((await invoke(data,{query:{scope:'learning-support'}})).statusCode,503);
  readOverride=null;
  const beforeInvalid=requests.length;
  for(const query of [{scope:['learning-support','learning-support-review']},{scope:'learning-support-unknown'},
    {scope:'learning-support',page:['1','2']},{scope:'learning-support',page:'01'},{scope:'learning-support',page:'1001'},
    {scope:'learning-support',user_id:other},{scope:'learning-support',resource:'conversations'}]){
    assert.equal((await invoke(data,{query})).statusCode,400);
  }

  for(const [handler,kind,payload,extra] of [
    [action,'submit_learning_support',{...student,ownerId:other}],
    [action,'submit_learning_support',{...student,topic:' '}],
    [action,'submit_learning_support',student,{requestId:student.request_id}],
    [action,'review_learning_support',review,{requestId:review.request_id}],
    [manage,'submit_learning_support',student],
    [manage,'review_learning_support',{...review,status:'approved'}],
    [manage,'review_learning_support',{...review,expected_version:'1'}],
    [action,'withdraw_learning_support',{...withdraw,note:'unexpected'}],
  ]){
    assert.equal((await invoke(handler,{body:{kind,payload,...extra}})).statusCode,400);
  }
  assert.equal(requests.length,beforeInvalid);

  const submitted=await invoke(action,{body:{kind:'submit_learning_support',payload:student}});
  assert.deepEqual(submitted.body,{id,requestId:student.request_id,status:'submitted',version:1});
  assert.deepEqual((await invoke(action,{body:{kind:'submit_learning_support',payload:student}})).body,submitted.body);
  assert.equal((await invoke(manage,{role:'B',body:{kind:'review_learning_support',payload:review}})).statusCode,403);
  const reviewed=await invoke(manage,{role:'manager',body:{kind:'review_learning_support',payload:review}});
  assert.deepEqual(reviewed.body,{id,requestId:review.request_id,status:'in_review',version:2});
  assert.equal((await invoke(action,{role:'B',body:{kind:'withdraw_learning_support',payload:withdraw}})).statusCode,404);
  const cancelled=await invoke(action,{body:{kind:'withdraw_learning_support',payload:withdraw}});
  assert.deepEqual(cancelled.body,{id,requestId:withdraw.request_id,status:'withdrawn',version:3});
  badReceipt=true;
  assert.equal((await invoke(action,{body:{kind:'submit_learning_support',payload:student}})).statusCode,503);
  const writes=requests.filter(request=>request.path.endsWith('/affairs_change_learning_support'));
  assert.deepEqual(writes.map(row=>[row.role,row.payload.p_kind]),[
    ['A','submit'],['A','submit'],['B','review'],['manager','review'],['B','withdraw'],['A','withdraw'],['A','submit'],
  ]);
  assert.ok(writes.every(row=>Object.keys(row.payload).sort().join()==='p_kind,p_payload'));
});
