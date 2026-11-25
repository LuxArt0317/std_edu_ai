import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {aidPaymentFixtureManifest,validateAidPaymentFixtureOwners,buildAidPaymentFixturePlan,aidPaymentFixtureReadContract,
  assertAidPaymentFixtureIdentities,assertAidPaymentFixtureRowTargets,assertAidPaymentFixtureEmpty,assertAidPaymentFixtureCleanup,verifyAidPaymentFixtureReadback} from './aid-payment-fixture-plan.mjs';
import {readAidPayments} from '../../server/aidPayments.js';

const runId='10000000-0000-4000-8000-000000000001',a='20000000-0000-4000-8000-000000000001',b='20000000-0000-4000-8000-000000000002';
const owners={A:{id:a,email:'evaluation.student@example.invalid',runMarker:runId},B:{id:b,email:'evaluation.other@example.invalid',runMarker:runId}};
const input=fixtureKey=>({runId,owners:structuredClone(owners),fixtureKey:fixtureKey??'aidPayments'});
const code=expected=>error=>error?.code===expected&&error?.message==='Aid payment fixture '+expected+'.';
const selection=(role='A',view='salary',page=1,summary=false)=>({role,view,page,summary});
const emptyCounts=plan=>Object.fromEntries(Object.values(plan.tables).map(table=>[table,[{userId:a,count:0},{userId:b,count:0}]]));
const rowTargets=plan=>Object.fromEntries(Object.entries(plan.rows).map(([table,rows])=>[table,rows.map(({id,user_id})=>({id,user_id}))]));

test('independent graph literals preserve salary periods, null, zero and non-derived net plus the separate aid claim',()=>{
  const plan=buildAidPaymentFixturePlan(input()),own=plan.expectedByOwner[a],foreign=plan.expectedByOwner[b];
  assert.equal(own.salary.total,2);assert.deepEqual(own.salary.rows.map(row=>[row.payment_period,row.net,row.tax]),[
    ['2026-09 local period',5400,0],['2026-10 local period',6200,null],
  ]);
  assert.equal(own.salary.rows[0].gross,5800);assert.equal(own.salary.rows[1].gross,null);assert.equal(own.salary.rows[0].bank_last4,'0101');
  assert.equal(own.salary.rows[1].bank_last4,null);assert.equal(own.claims.total,1);
  assert.deepEqual(Object.fromEntries(Object.entries(own.claims.rows[0]).filter(([key])=>key!=='id')),
    {reason:'Library work-study materials',amount:1200,approval_result:null,approval_status:'Waiting for local unit review'});
  assert.equal(foreign.salary.rows[0].payment_period,'FOREIGN AID PERIOD');assert.equal(foreign.salary.rows[0].net,9901);
  assert.equal(foreign.claims.rows[0].reason,'FOREIGN AID CLAIM');assert.equal(foreign.claims.rows[0].amount,8800);
  assert.doesNotMatch(JSON.stringify(own),/FOREIGN/);assert.ok(!Object.hasOwn(own.salary.rows[0],'currency'));assert.ok(!Object.hasOwn(own.claims.rows[0],'paid'));
});

test('positive, graph empty and browser baseline families retain deliberately distinct owner matrices',()=>{
  for(const [family,expected] of [['aidPayments',[1,2,1,1]],['empty:aidPayments',[0,0,1,1]],['browser:aidPayments',[1,2,0,1]]]){
    const plan=buildAidPaymentFixturePlan(input(family));
    assert.deepEqual([plan.expectedByOwner[a].claims.total,plan.expectedByOwner[a].salary.total,plan.expectedByOwner[b].claims.total,plan.expectedByOwner[b].salary.total],expected);
    assert.equal(plan.recordIds.length,expected.reduce((sum,value)=>sum+value,0));
    assert.ok(Object.values(plan.rows).flat().every(row=>[a,b].includes(row.user_id)));
  }
  assert.deepEqual(aidPaymentFixtureManifest.families,['aidPayments','empty:aidPayments','browser:aidPayments']);
});

test('plans are immutable, deterministic per run and cannot collide across owners or runs',()=>{
  const value=input(),before=structuredClone(value),first=buildAidPaymentFixturePlan(value),again=buildAidPaymentFixturePlan(value);
  assert.deepEqual(first,again);assert.deepEqual(value,before);assert.ok(Object.isFrozen(first.rows));assert.ok(Object.isFrozen(first.expectedByOwner[a].salary.rows[0]));
  assert.throws(()=>{first.expectedByOwner[a].salary.rows[0].net=999;},TypeError);
  assert.equal(new Set(first.recordIds).size,first.recordIds.length);assert.ok(first.recordIds.every(id=>![a,b,runId].includes(id)));
  const otherRun='10000000-0000-4000-8000-000000000002',changed=structuredClone(value);changed.runId=otherRun;
  for(const owner of Object.values(changed.owners))owner.runMarker=otherRun;
  const next=buildAidPaymentFixturePlan(changed);assert.ok(next.recordIds.every(id=>!first.recordIds.includes(id)));
});

test('owner receipts reject real addresses, duplicate identities, stale run markers, tokens and accessors before planning',()=>{
  for(const mutate of [value=>{value.owners.A.email='real@example.com';},value=>{value.owners.B.id=a;},value=>{value.owners.B.email=value.owners.A.email;},
    value=>{value.owners.A.runMarker=b;},value=>{value.owners.A.id=value.runId;},value=>{value.owners.A.token='PRIVATE';},value=>{value.owners.C={...value.owners.A};},
    value=>{value.owners.A.id='not-uuid';},value=>{value.owners.A.email='UPPER@example.invalid';}]){
    const value=input();mutate(value);assert.throws(()=>validateAidPaymentFixtureOwners({runId:value.runId,owners:value.owners}),code('invalid_owners'));
  }
  let getterCalls=0;const accessor=input();Object.defineProperty(accessor,'fixtureKey',{get(){getterCalls++;return 'PRIVATE';}});
  assert.throws(()=>buildAidPaymentFixturePlan(accessor),code('invalid_plan'));assert.equal(getterCalls,0);
  assert.throws(()=>buildAidPaymentFixturePlan({...input(),fixtureKey:'production'}),code('invalid_plan'));
});

test('setup and cleanup are ordered plans with durable intent and exact owner plus row targets before any Auth cleanup',()=>{
  const plan=buildAidPaymentFixturePlan(input());
  assert.deepEqual(plan.setup.map(step=>step.kind),['persist-intent','assert-owned-identities','assert-owned-tables-empty','insert-exact-rows','insert-exact-rows','verify-both-caller-readbacks']);
  assert.deepEqual(plan.setup[0].recordIds,plan.recordIds);assert.deepEqual(plan.setup[0].tables,[plan.tables.claims,plan.tables.salary]);
  for(const step of plan.setup.filter(step=>step.kind==='insert-exact-rows'))assert.deepEqual(step.rows,plan.rows[step.table]);
  assert.deepEqual(plan.cleanup.map(step=>step.kind),['assert-owned-identities','assert-exact-owned-row-targets','delete-exact-rows','delete-exact-rows','verify-owned-tables-empty','return-to-existing-auth-cleanup']);
  assert.deepEqual(plan.cleanup.filter(step=>step.kind==='delete-exact-rows').map(step=>step.table),[plan.tables.salary,plan.tables.claims]);
  for(const step of plan.cleanup.filter(step=>step.kind==='delete-exact-rows')){
    assert.deepEqual(step.targets,plan.rows[step.table].map(row=>({id:row.id,userId:row.user_id})));
    assert.ok(step.targets.every(row=>[a,b].includes(row.userId)&&plan.recordIds.includes(row.id)));
  }
  assert.doesNotMatch(JSON.stringify(plan),/access_token|refresh_token|service_role|auth\.users|DELETE FROM|INSERT INTO/);
});

test('native schema constraints and caller RPC projection are independently anchored without a live harness import',async()=>{
  const sql=await readFile(new URL('../../supabase/migrations/20261115050000_student_aid_payments.sql',import.meta.url),'utf8');
  for(const table of ['affairs_aid_payment_claims','affairs_aid_salary_records'])assert.match(sql,new RegExp('create table public\\.'+table+' \\('));
  assert.match(sql,/references auth\.users\(id\) on delete cascade/g);assert.equal((sql.match(/unique\(user_id,position\)/g)||[]).length,2);
  assert.match(sql,/reason text not null check \(length\(btrim\(reason\)\) between 1 and 160\)/);
  assert.match(sql,/amount numeric\(12,2\) check \(amount >= 0 and amount <= 9999999999\.99\)/);
  assert.match(sql,/payment_period text check \(length\(payment_period\) <= 80\)/);assert.match(sql,/bank_last4 text check \(bank_last4 ~ '\^\[0-9\]\{4\}\$'\)/);
  assert.match(sql,/private\.affairs_google_identity\(\)/);assert.equal((sql.match(/where user_id=caller/g)||[]).length,4);
  assert.equal((sql.match(/to_jsonb\(r\)-'user_id'-'position'/g)||[]).length,2);
  assert.match(sql,/revoke all on public\.affairs_aid_payment_claims,public\.affairs_aid_salary_records from public,anon,authenticated/);
  const plan=buildAidPaymentFixturePlan(input());
  for(const row of plan.rows[plan.tables.claims]){assert.ok(row.reason.trim().length>0&&row.reason.length<=160);assert.ok(row.amount===null||row.amount>=0);}
  for(const row of plan.rows[plan.tables.salary]){assert.ok(row.payment_period===null||row.payment_period.length<=80);assert.ok(row.bank_last4===null||/^\d{4}$/.test(row.bank_last4));}
});

test('read contracts use exact caller-only query and RPC shapes, with separate detail and positive count-only semantics',()=>{
  const plan=buildAidPaymentFixturePlan(input());
  for(const role of ['A','B'])for(const view of ['salary','claims'])for(const summary of [false,true]){
    const contract=aidPaymentFixtureReadContract(plan,selection(role,view,1,summary));
    assert.equal(contract.ownerId,owners[role].id);assert.equal(contract.path,'/api/affairs-data');assert.equal(contract.method,'GET');
    assert.deepEqual(contract.query,{scope:'aid-payments',view,page:'1',...(summary?{summary:'1'}:{})});
    assert.deepEqual(contract.rpc,{name:'affairs_read_aid_payments',body:{p_view:view,p_offset:0,p_summary:summary}});
    assert.equal(contract.expected.total,plan.expectedByOwner[owners[role].id][view].total);
    assert.equal(contract.expected.rows.length,summary?0:contract.expected.total);
    assert.ok(contract.expected.rows.every(row=>!Object.hasOwn(row,'user_id')&&!Object.hasOwn(row,'position')));
  }
  const beyond=aidPaymentFixtureReadContract(plan,selection('A','salary',2,false));assert.equal(beyond.expected.total,2);assert.deepEqual(beyond.expected.rows,[]);assert.equal(beyond.rpc.body.p_offset,25);
  for(const options of [{...selection(),ownerId:b},{...selection(),view:'admin'},{...selection(),role:'C'},selection('A','salary',2,true),selection('A','salary',202,false),selection('A','salary',0,false),{...selection(),summary:'1'}])
    assert.throws(()=>aidPaymentFixtureReadContract(plan,options),code('invalid_request'));
});

test('actual native reader sends only own JWT and fixed RPC arguments; independent full readback rejects changed or foreign facts',async()=>{
  const plan=buildAidPaymentFixturePlan(input()),saved=globalThis.fetch;let calls=0;
  try{for(const role of ['A','B'])for(const view of ['claims','salary'])for(const summary of [false,true]){
    const options=selection(role,view,1,summary),contract=aidPaymentFixtureReadContract(plan,options),token='SYNTHETIC-'+role;
    globalThis.fetch=async(url,init)=>{calls++;assert.equal(String(url),'https://xiftudmvxphxcjtmfmib.supabase.co/rest/v1/rpc/affairs_read_aid_payments');
      assert.equal(init.method,'POST');assert.equal(init.redirect,'error');assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+token);
      assert.deepEqual(JSON.parse(init.body),contract.rpc.body);return Response.json(contract.expected);};
    const actual=await readAidPayments({url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC',token,user:{id:owners[role].id}},contract.query);
    assert.equal(verifyAidPaymentFixtureReadback(plan,options,actual),true);
  }}finally{globalThis.fetch=saved;}
  assert.equal(calls,8);
  const expected=aidPaymentFixtureReadContract(plan,selection()).expected;
  for(const mutate of [value=>{value.userId=b;},value=>{value.rows[0].net=6200;},value=>{value.rows[0].tax=null;},value=>{value.total=0;},value=>{value.rows.reverse();},
    value=>{delete value.rows[0].bank_last4;},value=>{value.rows[0].extra='PRIVATE';}]){
    const value=structuredClone(expected);mutate(value);assert.throws(()=>verifyAidPaymentFixtureReadback(plan,selection(),value),code('readback_mismatch'));
  }
});

test('cleanup identity and exact-row proofs fail on foreign, stale, extra and missing records instead of deleting unplanned data',()=>{
  const plan=buildAidPaymentFixturePlan(input()),identities=Object.values(owners),targets=rowTargets(plan),counts=emptyCounts(plan);
  assert.equal(assertAidPaymentFixtureIdentities(plan,[...identities].reverse()),true);assert.equal(assertAidPaymentFixtureRowTargets(plan,targets),true);
  assert.equal(assertAidPaymentFixtureEmpty(plan,counts),true);assert.equal(assertAidPaymentFixtureCleanup(plan,{identities,remainingByTable:counts}),true);
  for(const mutate of [value=>{value[0].runMarker=b;},value=>{value[0].email='different@example.invalid';},value=>{value.push({...value[0]});},value=>{value[0].id='90000000-0000-4000-8000-000000000001';}]){
    const value=structuredClone(identities);mutate(value);assert.throws(()=>assertAidPaymentFixtureIdentities(plan,value),code('fixture_identity_mismatch'));
  }
  for(const mutate of [value=>{value[plan.tables.salary][0].user_id=b;},value=>{value[plan.tables.salary].pop();},value=>{value[plan.tables.claims].push({id:'90000000-0000-4000-8000-000000000001',user_id:a});},
    value=>{value.unrelated=[];},value=>{value[plan.tables.salary][0].secret='PRIVATE';}]){
    const value=structuredClone(targets);mutate(value);assert.throws(()=>assertAidPaymentFixtureRowTargets(plan,value),code('fixture_rows_mismatch'));
  }
  for(const mutate of [value=>{value[plan.tables.salary][0].count=1;},value=>{value[plan.tables.claims][1].count='0';},value=>{value[plan.tables.claims].pop();},value=>{value[plan.tables.salary][0].userId=b;}]){
    const value=structuredClone(counts);mutate(value);assert.throws(()=>assertAidPaymentFixtureCleanup(plan,{identities,remainingByTable:value}),code('fixture_rows_remain'));
  }
});

test('tampered plan manifests cannot authorize readback or cleanup; module remains import-only and secret-free',async()=>{
  const plan=buildAidPaymentFixturePlan(input());
  for(const mutate of [value=>{value.expectedByOwner[a].salary.rows[0].net=999;},value=>{value.rows[value.tables.salary][0].user_id=b;},
    value=>{value.cleanup[2].table='auth.users';},value=>{value.recordIds=[];},value=>{value.owners.A.runMarker=b;}]){
    const changed=structuredClone(plan);mutate(changed);assert.throws(()=>aidPaymentFixtureReadContract(changed,selection()),code('invalid_plan'));
    assert.throws(()=>assertAidPaymentFixtureCleanup(changed,{identities:Object.values(owners),remainingByTable:emptyCounts(plan)}),code('invalid_plan'));
  }
  const source=await readFile(new URL('./aid-payment-fixture-plan.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|process\.env|deploymentEnvironment|createClient|from ['"]postgres|readFile\s*\(/);
});
