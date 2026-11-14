import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {buildFeeRemissionFixturePlan,feeRemissionLivePlanManifest as manifest,feeRemissionLiveFamilyForCase,
  assertFeeRemissionFixtureIdentities,feeRemissionFixtureSqlReadContract,feeRemissionFixtureReadContract,
  assertFeeRemissionFixtureRows,verifyFeeRemissionFixtureReadback,reconcileFeeRemissionFixturePlans,assertFeeRemissionFixtureCleanup} from './fee-remission-live-plan.mjs';
import {buildFeeRemissionCases,feeRemissionFixtureForCase} from './fee-remission-cases.mjs';
import {loadFeeRemission} from '../../server/feeRemission.js';
import {loadOwnAffairsCharges} from '../../server/affairsWorkspace.js';

const runId='10000000-0000-4000-8000-000000000001',a='20000000-0000-4000-8000-000000000001',b='20000000-0000-4000-8000-000000000002';
const owners={A:{id:a,email:'fee.a@example.invalid',runMarker:runId},B:{id:b,email:'fee.b@example.invalid',runMarker:runId}};
const students={A:{id:'30000000-0000-4000-8000-000000000001',user_id:a},B:{id:'30000000-0000-4000-8000-000000000002',user_id:b}};
const input=(fixtureKey='feeRemission')=>({runId,owners:structuredClone(owners),students:structuredClone(students),fixtureKey});
const fee='affairs_fee_remission',charges='affairs_charges',operations='private.affairs_fee_remission_operations',audit='affairs_agent_audit';
const error=code=>value=>value?.code===code&&value.message==='Fee remission fixture '+code+'.';
const proof=()=>({identities:Object.values(structuredClone(owners)),students:Object.values(structuredClone(students))});
const blank=()=>Object.fromEntries(manifest.tables.map(table=>[table,[]]));
const zeros=()=>Object.fromEntries(manifest.tables.map(table=>[table,[{userId:a,count:0},{userId:b,count:0}]]));

test('independent literal plan matches the existing case packet and keeps charges separate from remission',()=>{
  const plan=buildFeeRemissionFixturePlan(input()),native=plan.expectedByOwner[a].feeRemission;
  assert.equal(plan.kind,'fee-remission-fixture-plan');assert.equal(manifest.mounted,false);assert.equal(manifest.liveAcceptance,false);
  const source=feeRemissionFixtureForCase(buildFeeRemissionCases().find(row=>row.id==='account:fee-remission-all-history'));
  const literal=row=>Object.fromEntries(['academic_year_text','semester_text','student_number','category_text','amount_text','check_status_text','notes_text','version','row_order'].map(key=>[key,row[key]]));
  assert.deepEqual(native.records.map(literal),source.response.records.map(literal));
  assert.deepEqual(native.records.map(row=>row.amount_text),[' 001,000 ','0',null,'','0.00']);
  assert.deepEqual(native.records.map(row=>[row.academic_year_text,row.semester_text]),[['114','2'],['115','1'],['115','2'],['001','01'],['0115','01']]);
  assert.equal(plan.expectedByOwner[b].feeRemission.records[0].amount_text,'99009');
  assert.equal(plan.expectedByOwner[b].feeRemission.records[0].category_text,'FOREIGN REMISSION CATEGORY');
  const own=plan.expectedByOwner[a].charges.charges[0],other=plan.expectedByOwner[b].charges.charges[0];
  assert.deepEqual([own.label,own.amountDue,own.amountPaid,own.currency],['QA Tuition instalment',28000,5000,'TWD']);
  assert.equal(own.amountDue-own.amountPaid,23000);assert.equal(other.amountDue-other.amountPaid,98908);
  assert.equal(other.label,'FOREIGN TUITION CONTROL');assert.equal(plan.rows[operations].length,0);assert.equal(plan.rows[audit].length,0);
  assert.ok(Object.isFrozen(plan));assert.ok(Object.isFrozen(native.records[0]));assert.throws(()=>{native.records[0].amount_text='100';});
});

test('exact case eligibility does not promote unavailable transport or synthetic policy into live coverage',()=>{
  const cases=buildFeeRemissionCases();assert.equal(cases.length,27);
  const eligible=cases.filter(row=>feeRemissionLiveFamilyForCase(row)!==null);
  assert.equal(eligible.length,20);assert.equal(new Set(eligible.map(row=>row.id)).size,20);
  assert.deepEqual(eligible.map(row=>row.id).sort(),[...manifest.eligibleCaseIds].sort());
  assert.equal(feeRemissionLiveFamilyForCase('account:fee-remission-anonymous'),'feeRemission');
  assert.equal(feeRemissionLiveFamilyForCase('account:fee-remission-empty'),'empty:feeRemission');
  assert.equal(feeRemissionLiveFamilyForCase('account:fee-remission-bounded-omission'),'large:feeRemission');
  for(const id of manifest.offlineOnlyCaseIds)assert.equal(feeRemissionLiveFamilyForCase(id),null);
  assert.throws(()=>feeRemissionLiveFamilyForCase('account:invented'),error('invalid_case'));
});

test('family state and record IDs distinguish complete previous, next and empty plans without rebinding old cases',()=>{
  const plans=manifest.families.map(fixtureKey=>buildFeeRemissionFixturePlan(input(fixtureKey)));
  assert.deepEqual(plans.map(plan=>plan.expectedByOwner[a].feeRemission.records.length),[5,0,30]);
  assert.deepEqual(plans.map(plan=>plan.expectedByOwner[b].feeRemission.records.length),[1,1,1]);
  assert.equal(new Set(plans.flatMap(plan=>plan.recordIds)).size,plans.reduce((sum,plan)=>sum+plan.recordIds.length,0));
  assert.deepEqual(buildFeeRemissionFixturePlan(input()),plans[0]);
  const tail=plans[2].expectedByOwner[a].feeRemission.records.at(-1);assert.equal(tail.notes_text,'OMITTED TAIL PRIVATE SENTINEL');
  assert.equal(plans[2].expectedByOwner[a].feeRemission.records[0].notes_text.length,1900);
  assert.throws(()=>buildFeeRemissionFixturePlan(input('offline:fee-remission:normal')),error('invalid_plan'));
});

test('student bindings and identities must be exactly the two externally verified disposable owners',()=>{
  const plan=buildFeeRemissionFixturePlan(input());assert.equal(assertFeeRemissionFixtureIdentities(plan,proof()),true);
  for(const mutate of [value=>{value.owners.B.id=a;},value=>{value.owners.A.runMarker=b;},value=>{value.owners.A.email='real@example.com';}]){
    const value=input();mutate(value);assert.throws(()=>buildFeeRemissionFixturePlan(value),error('invalid_owners'));}
  for(const mutate of [value=>{value.students.A.user_id=b;},value=>{value.students.A.id=value.students.B.id;},value=>{value.students.A.id=a;},value=>{value.students.A.role='admin';}]){
    const value=input();mutate(value);assert.throws(()=>buildFeeRemissionFixturePlan(value),error('invalid_students'));}
  for(const mutate of [value=>{value.identities.pop();},value=>{value.identities[0].runMarker=b;},value=>{value.students[0].user_id=b;},value=>{value.students.push(value.students[0]);}]){
    const value=proof();mutate(value);assert.throws(()=>assertFeeRemissionFixtureIdentities(plan,value),error('fixture_identity_mismatch'));}
});

test('SQL read predicates cover complete own/tombstone state and globally reserved IDs without deletion authority',()=>{
  const plan=buildFeeRemissionFixturePlan(input()),contracts=feeRemissionFixtureSqlReadContract(plan);
  assert.deepEqual(contracts.map(row=>row.table),manifest.tables);
  assert.equal(contracts[0].includeDeleted,true);assert.deepEqual(contracts[0].columns,manifest.remissionFields);
  assert.deepEqual(contracts[0].anyOf[0],{column:'user_id',values:[a,b]});
  assert.deepEqual(contracts[0].anyOf[1].values,plan.rows[fee].map(row=>row.id));
  assert.deepEqual(contracts[1].anyOf[0],{column:'student_id',values:[students.A.id,students.B.id]});
  assert.deepEqual(contracts[2].anyOf.map(row=>row.column),['actor_id','user_id']);
  assert.deepEqual(contracts[3].anyOf[1],{column:'target_id',values:plan.recordIds});
  assert.equal(plan.setup[0].kind,'persist-intent');
  assert.ok(plan.setup.findIndex(step=>step.kind==='assert-run-lease-identities-students-and-protected-owner')<plan.setup.findIndex(step=>step.kind==='begin-owned-transaction'));
  assert.ok(plan.setup.findIndex(step=>step.kind==='delete-only-exact-reconciled-previous-targets')<plan.setup.findIndex(step=>step.kind==='verify-complete-owned-tables-empty'));
  assert.ok(plan.setup.findIndex(step=>step.kind==='verify-complete-owned-tables-empty')<plan.setup.findIndex(step=>step.kind==='insert-exact-rows'));
  assert.deepEqual(plan.setup.filter(step=>step.kind==='insert-exact-rows').map(step=>step.table),[fee,charges]);
  const deletions=plan.cleanup.find(step=>step.kind==='delete-exact-recorded-targets').targets;
  assert.equal(deletions.length,plan.recordIds.length);assert.ok(deletions.every(row=>row.id&&Boolean(row.userId)!==Boolean(row.studentId)));
  assert.ok(plan.cleanup.findIndex(step=>step.kind==='reconcile-complete-recorded-plans-or-empty')<plan.cleanup.findIndex(step=>step.kind==='delete-exact-recorded-targets'));
  assert.equal(plan.cleanup.at(-1).kind,'return-to-existing-auth-cleanup');
});

test('canonical rows preserve literal cells, accept only exact SQL wire encodings and reject unknown receipts or tombstones',()=>{
  const plan=buildFeeRemissionFixturePlan(input());assert.equal(assertFeeRemissionFixtureRows(plan,plan.rows),true);
  const wire=structuredClone(plan.rows);wire[fee].reverse();wire[charges].reverse();
  for(const row of wire[fee])row.updated_at='2026-11-14T08:00:00+08:00';
  for(const row of wire[charges]){row.amount_due=String(row.amount_due)+'.00';row.amount_paid=String(row.amount_paid)+'.00';}
  assert.equal(assertFeeRemissionFixtureRows(plan,wire),true);
  for(const mutate of [value=>{value[fee][0].amount_text='001,000';},value=>{value[fee][0].updated_at='2026-11-14T00:00:00.001Z';},
    value=>{value[fee][0].deleted_at=manifest.stamp;},value=>{value[fee][0].user_id=b;},value=>{value[fee][0].extra='unplanned';},
    value=>{value[charges][0].amount_due='0x6d60';},value=>{value[charges][0].amount_due=28001;},value=>{value[charges][0].student_id=students.B.id;},
    value=>{value[operations].push({actor_id:a,user_id:a});},value=>{value[audit].push({user_id:a});}]){
    const value=structuredClone(plan.rows);mutate(value);assert.throws(()=>assertFeeRemissionFixtureRows(plan,value),error('fixture_rows_mismatch'));}
});

test('complete previous/next/absence reconciliation refuses partial, mixed or unplanned state',()=>{
  const previous=buildFeeRemissionFixturePlan(input()),next=buildFeeRemissionFixturePlan(input('large:feeRemission'));
  for(const [state,actual]of [['previous',previous.rows],['next',next.rows],['empty',blank()]]){
    const decision=reconcileFeeRemissionFixturePlans({previous,next,actual});assert.equal(decision.state,state);
    assert.equal(decision.deleteTargets.length,state==='empty'?0:(state==='previous'?previous:next).recordIds.length);
  }
  for(const mutate of [value=>{value[fee].pop();},value=>{value[charges]=structuredClone(next.rows[charges]);},value=>{value[charges]=[];},
    value=>{value[fee].push({...value[fee][0],id:'40000000-0000-4000-8000-000000000001'});},value=>{value[fee][0].version=2;}]){
    const value=structuredClone(previous.rows);mutate(value);assert.throws(()=>reconcileFeeRemissionFixturePlans({previous,next,actual:value}),error('fixture_rows_mismatch'));}
  const wrong=input('empty:feeRemission');wrong.owners.A.email='new.identity@example.invalid';
  assert.throws(()=>reconcileFeeRemissionFixturePlans({previous,next:buildFeeRemissionFixturePlan(wrong),actual:blank()}),error('invalid_plan'));
  assert.throws(()=>reconcileFeeRemissionFixturePlans({actual:blank()}),error('invalid_plan'));
});

test('readback checks require exact caller and full projected fields, with fresh charge read timestamp',()=>{
  const plan=buildFeeRemissionFixturePlan(input()),time=Date.parse(manifest.stamp);
  for(const role of ['A','B']){
    const feeContract=feeRemissionFixtureReadContract(plan,{role,view:'feeRemission'});
    assert.deepEqual(feeContract.rpc,{name:'affairs_read_fee_remission',body:{}});assert.deepEqual(feeContract.query,{scope:'fee-remission'});
    assert.equal(verifyFeeRemissionFixtureReadback(plan,{role,view:'feeRemission'},feeContract.expected),true);
    const chargeContract=feeRemissionFixtureReadContract(plan,{role,view:'charges'});
    assert.equal(chargeContract.api,null);assert.equal(chargeContract.reader,'loadOwnAffairsCharges');
    assert.equal(verifyFeeRemissionFixtureReadback(plan,{role,view:'charges',readStartedAt:time,readFinishedAt:time+1000},{checkedAt:manifest.stamp,...chargeContract.expected}),true);
    for(const bad of [{checkedAt:'2026-11-13T23:59:59.999Z',...chargeContract.expected},{checkedAt:manifest.stamp,...chargeContract.expected,extra:'unexpected'}])
      assert.throws(()=>verifyFeeRemissionFixtureReadback(plan,{role,view:'charges',readStartedAt:time,readFinishedAt:time+1000},bad),error('readback_mismatch'));
  }
  assert.throws(()=>verifyFeeRemissionFixtureReadback(plan,{role:'A',view:'feeRemission'},plan.expectedByOwner[b].feeRemission),error('readback_mismatch'));
  assert.throws(()=>feeRemissionFixtureReadContract(plan,{role:'A',view:'feeRemission',userId:b}),error('invalid_request'));
  const mutation=structuredClone(plan);mutation.rows[fee][0].amount_text='999';assert.throws(()=>feeRemissionFixtureReadContract(mutation,{role:'A',view:'feeRemission'}),error('invalid_plan'));
});

test('actual native loaders satisfy the independent request/readback contract with intercepted transport only',async()=>{
  const old=globalThis.fetch,plan=buildFeeRemissionFixturePlan(input());
  try{for(const role of ['A','B']){
    const caller=owners[role].id,account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE',token:'OFFLINE-'+role,user:{id:caller}};
    const feeContract=feeRemissionFixtureReadContract(plan,{role,view:'feeRemission'});let reads=0;
    globalThis.fetch=async(input,init)=>{reads++;assert.equal(String(input),account.url+'/rest/v1/rpc/affairs_read_fee_remission');
      assert.equal(init.method,'POST');assert.equal(init.redirect,'error');assert.deepEqual(JSON.parse(init.body),{});assert.equal(init.headers.Authorization,'Bearer OFFLINE-'+role);
      return Response.json(feeContract.expected);};
    assert.equal(verifyFeeRemissionFixtureReadback(plan,{role,view:'feeRemission'},await loadFeeRemission(account)),true);assert.equal(reads,1);
    const chargeContract=feeRemissionFixtureReadContract(plan,{role,view:'charges'});reads=0;
    globalThis.fetch=async(input,init)=>{const url=new URL(String(input)),expected=chargeContract.native[reads++];assert.ok(expected,'No initializer, broad snapshot, management or extra fetch');
      assert.equal(url.origin,account.url);assert.equal(url.pathname,'/rest/v1/'+expected.table);assert.equal(init.method,'GET');
      assert.equal(init.headers.Authorization,'Bearer OFFLINE-'+role);assert.deepEqual(Object.fromEntries(url.searchParams),Object.fromEntries(Object.entries(expected.query).map(([key,value])=>[key,String(value)])));
      return Response.json(expected.expected);};
    const readStartedAt=Date.now(),actual=await loadOwnAffairsCharges(account),readFinishedAt=Date.now();
    assert.equal(verifyFeeRemissionFixtureReadback(plan,{role,view:'charges',readStartedAt,readFinishedAt},actual),true);assert.equal(reads,2);
  }}finally{globalThis.fetch=old;}
});

test('cleanup requires both exact identities, unchanged student mapping and zero rows for every owned scope',()=>{
  const plan=buildFeeRemissionFixturePlan(input()),complete={...proof(),remainingByTable:zeros(),reservedByTable:{[fee]:0,[charges]:0}};
  assert.equal(assertFeeRemissionFixtureCleanup(plan,complete),true);
  for(const table of manifest.tables)for(const owner of [a,b]){
    const value=structuredClone(complete);value.remainingByTable[table].find(row=>row.userId===owner).count=1;
    assert.throws(()=>assertFeeRemissionFixtureCleanup(plan,value),error('fixture_rows_remain'));
  }
  for(const mutate of [value=>{delete value.remainingByTable[operations];},value=>{value.remainingByTable[fee].pop();},value=>{value.remainingByTable[charges][0].count='0';},
    value=>{value.reservedByTable[fee]=1;},value=>{value.reservedByTable[charges]='0';},value=>{delete value.reservedByTable;}]){
    const value=structuredClone(complete);mutate(value);assert.throws(()=>assertFeeRemissionFixtureCleanup(plan,value),error('fixture_rows_remain'));}
  const wrong=structuredClone(complete);wrong.students[0].id=students.B.id;
  assert.throws(()=>assertFeeRemissionFixtureCleanup(plan,wrong),error('fixture_identity_mismatch'));
});

test('published schema anchors and plan exclusions remain explicit without executing a migration or management action',async()=>{
  const sql=await readFile(new URL('../../supabase/migrations/20261114030000_fee_remission.sql',import.meta.url),'utf8');
  assert.match(sql,/create table public\.affairs_fee_remission/u);assert.match(sql,/create table private\.affairs_fee_remission_operations/u);
  for(const field of manifest.remissionFields)assert.match(sql,new RegExp('\\b'+field+'\\b','u'));
  assert.match(sql,/affairs_read_fee_remission\(p_user_id uuid default null\)/u);
  assert.match(sql,/row_order between 0 and 10000/u);assert.match(sql,/limit 251/u);
  assert.ok(manifest.boundaries.some(text=>text.includes('No management RPC')));
  assert.ok(manifest.boundaries.some(text=>text.includes('Unknown initializer')));
});
