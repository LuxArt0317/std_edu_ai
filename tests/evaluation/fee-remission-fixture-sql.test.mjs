import test from 'node:test';
import assert from 'node:assert/strict';
import {readRows,deleteRows,insertRows} from './fee-remission-fixture-sql.mjs';
import {buildFeeRemissionFixturePlan,feeRemissionLivePlanManifest as manifest,feeRemissionFixtureSqlReadContract,reconcileFeeRemissionFixturePlans} from './fee-remission-live-plan.mjs';
import {feeRemissionLifecycleReadContracts} from './fee-remission-fixture-lifecycle.mjs';

const runId='10000000-0000-4000-8000-000000000001',a='20000000-0000-4000-8000-000000000001',b='20000000-0000-4000-8000-000000000002';
const owners={A:{id:a,email:'fee.a@example.invalid',runMarker:runId},B:{id:b,email:'fee.b@example.invalid',runMarker:runId}};
const students={A:{id:'30000000-0000-4000-8000-000000000001',user_id:a},B:{id:'30000000-0000-4000-8000-000000000002',user_id:b}};
const plan=family=>buildFeeRemissionFixturePlan({runId,owners,students,fixtureKey:family??'feeRemission'});
const fee='affairs_fee_remission',charges='affairs_charges',ops='private.affairs_fee_remission_operations',audit='affairs_agent_audit';
const blank=()=>Object.fromEntries(manifest.tables.map(table=>[table,[]]));
const error=code=>err=>err?.name==='FeeRemissionFixtureSqlError'&&err.code===code&&err.message==='Fee fixture SQL '+code+'.';

// In-memory query recorder only. It does not connect to PostgreSQL or establish
// actual SQL execution/lease acceptance. Assertions inspect each generated query.
function database(initial=plan().rows){
  const state={rows:structuredClone(initial),identities:Object.values(owners).map(owner=>({...owner,role:'student'})),students:Object.values(structuredClone(students)),calls:[],mutations:0,alter:null};
  const sql={unsafe:async(text,params)=>{
    state.calls.push({text,params:structuredClone(params)});
    if(state.alter){const value=state.alter(text,params);if(value!==undefined)return value;}
    if(text.startsWith('select id,user_id from public.affairs_students'))return state.students.filter(row=>params.includes(row.id));
    if(text.includes(' from auth.users u left join'))return state.identities.filter(row=>params.includes(row.id));
    const table=manifest.tables.find(name=>text.includes((name.startsWith('private.')?name:'public.'+name)+' '));assert.ok(table,text);
    if(text.startsWith('select ')){
      const predicates=[...text.matchAll(/(user_id|student_id|actor_id|id|target_id) in \(([^)]+)\)/gu)].map(match=>({key:match[1],values:[...match[2].matchAll(/\$(\d+)::uuid/gu)].map(value=>params[Number(value[1])-1])}));
      return structuredClone(state.rows[table].filter(row=>predicates.some(predicate=>predicate.values.includes(row[predicate.key])))).slice(0,1001);
    }
    const payload=JSON.parse(params[0]),column=table===fee?'user_id':'student_id';assert.equal(params[1],runId);state.mutations++;
    if(text.startsWith('insert ')){state.rows[table].push(...structuredClone(payload));return payload.map(row=>({id:row.id,[column]:row[column]}));}
    assert.ok(text.startsWith('delete '));const removed=state.rows[table].filter(row=>payload.some(target=>row.id===target.id&&row[column]===target[column]));
    state.rows[table]=state.rows[table].filter(row=>!removed.includes(row));return removed.map(row=>({id:row.id,[column]:row[column]}));
  }};
  return {sql,state};
}

test('all four union reads include owned/tombstone and globally reserved row/audit targets with exact date projection',async()=>{
  const previous=plan(),next=plan('large:feeRemission'),contracts=feeRemissionLifecycleReadContracts([previous,next]);
  const db=database(next.rows),old=previous.rows[fee][0];
  db.state.rows[fee].push({...old,user_id:'40000000-0000-4000-8000-000000000001',deleted_at:'2026-11-15T00:00:00Z'});
  db.state.rows[audit].push({id:'50000000-0000-4000-8000-000000000001',user_id:'40000000-0000-4000-8000-000000000001',action_kind:'unexpected',target_id:old.id,summary:'Unexpected reserved row mutation',created_at:manifest.stamp});
  const rows=await readRows(db.sql,{runId,contracts});assert.deepEqual(Object.keys(rows),manifest.tables);
  assert.ok(rows[fee].some(row=>row.id===old.id&&row.deleted_at));assert.equal(rows[audit].length,1);
  assert.throws(()=>reconcileFeeRemissionFixturePlans({previous,next,actual:rows}));
  const reads=db.state.calls.slice(2);assert.equal(reads.length,4);
  assert.match(reads[0].text,/where \(user_id in .* or id in /u);assert.doesNotMatch(reads[0].text,/deleted_at is null/u);
  assert.match(reads[1].text,/due_on::text as due_on/u);assert.match(reads[1].text,/occurrence_on::text as occurrence_on/u);
  assert.ok(reads[3].params.includes(old.id));assert.deepEqual(new Set(reads[3].params),new Set([a,b,...previous.recordIds,...next.recordIds]));
  for(const query of reads){assert.match(query.text,/limit 1001$/u);assert.ok(query.params.every(value=>!query.text.includes(value)));}
  assert.equal(db.state.mutations,0);
});

test('exact current SQL state preserves literal remission cells and Date timestamps for canonical caller validation',async()=>{
  const current=plan(),db=database();db.state.rows[fee][0].updated_at=new Date(manifest.stamp);
  const rows=await readRows(db.sql,{runId,contracts:feeRemissionFixtureSqlReadContract(current)});
  assert.deepEqual(rows[fee].map(row=>row.amount_text),[' 001,000 ','0',null,'','0.00','99009']);
  assert.ok(rows[fee][0].updated_at instanceof Date);assert.equal(rows[charges][0].due_on,'2026-11-30');
  assert.equal(reconcileFeeRemissionFixturePlans({next:current,actual:rows}).state,'next');
});

test('invalid or incomplete contracts cannot narrow owner coverage, omit tombstones or interpolate identifiers',async()=>{
  const original=feeRemissionFixtureSqlReadContract(plan());
  for(const alter of [value=>{value.pop();},value=>{value[0].table='affairs_fee_remission; delete from auth.users';},value=>{value[0].columns.pop();},
    value=>{value[0].includeDeleted=false;},value=>{value[0].anyOf[0].values=[a];},value=>{value[2].anyOf[1].values=[b];},
    value=>{value[3].anyOf[1].values.pop();},value=>{value[1].anyOf[1].column='id) or true --';},value=>{value[0].anyOf[1].values.push('bad-id');}]){
    const contracts=structuredClone(original);alter(contracts);const db=database();await assert.rejects(readRows(db.sql,{runId,contracts}),error('invalid_request'));assert.equal(db.state.calls.length,0);
  }
  const db=database(),contracts=structuredClone(original);Object.defineProperty(contracts[0],'table',{get(){return assert.fail('Getter must not run');}});
  await assert.rejects(readRows(db.sql,{runId,contracts}),error('invalid_request'));assert.equal(db.state.calls.length,0);
});

test('authoritative run marker, disposable email, student role and exact student bindings precede data reads',async()=>{
  for(const alter of [state=>{state.identities[0].runMarker=b;},state=>{state.identities[0].email='real@example.com';},state=>{state.identities[0].role='admin';},
    state=>{state.identities.pop();},state=>{state.students[0].user_id=b;},state=>{state.students[0].user_id='40000000-0000-4000-8000-000000000001';}]){
    const db=database();alter(db.state);await assert.rejects(readRows(db.sql,{runId,contracts:feeRemissionFixtureSqlReadContract(plan())}),error('identity_mismatch'));
    assert.ok(db.state.calls.every(call=>!call.text.includes(' from public.affairs_fee_remission ')));assert.equal(db.state.mutations,0);
  }
});

test('oversized or malformed reads fail instead of masquerading as complete state',async()=>{
  const requests={runId,contracts:feeRemissionFixtureSqlReadContract(plan())};
  for(const value of [Array.from({length:1001},()=>plan().rows[fee][0]),[{id:'only'}],null]){
    const db=database();db.state.alter=text=>text.includes(' from public.affairs_fee_remission ')?value:undefined;
    await assert.rejects(readRows(db.sql,requests),error('invalid_rows'));assert.equal(db.state.mutations,0);
  }
  const db=database();db.state.alter=text=>text.includes(' from public.affairs_fee_remission ')?Array.from({length:800},()=>({...plan().rows[fee][0],notes_text:'😀'.repeat(2000)})):undefined;
  await assert.rejects(readRows(db.sql,requests),error('read_limit'));
});

test('literal inserts are parameterized, caller/role/run guarded and never upsert or mutate authentication',async()=>{
  const current=plan(),db=database(blank()),feeRows=structuredClone(current.rows[fee]);feeRows[0].notes_text="'; delete from auth.users; --\n[link](https://private.invalid)";
  for(const [table,rows]of [[fee,feeRows],[charges,current.rows[charges]]]){
    const before=structuredClone(rows),result=await insertRows(db.sql,{runId,table,rows});assert.deepEqual(result,{inserted:rows.length});assert.deepEqual(rows,before);
  }
  const inserts=db.state.calls.filter(call=>call.text.startsWith('insert '));assert.equal(inserts.length,2);
  for(const {text,params}of inserts){assert.match(text,/jsonb_populate_recordset\(null::public\.affairs_/u);assert.match(text,/assistant_evaluation_run'=\$2/u);assert.match(text,/p\.role='student'/u);
    assert.doesNotMatch(text,/on conflict|update |insert into auth|begin|commit|rollback|delete from auth|https:\/\/private/u);assert.equal(params[1],runId);}
  assert.equal(JSON.parse(inserts[0].params[0])[0].notes_text,feeRows[0].notes_text);
  assert.match(inserts[1].text,/s\.id=v\.student_id/u);
});

test('deletions use every exact composite target and prove every affected row before return',async()=>{
  const current=plan(),targets=current.cleanup.find(step=>step.kind==='delete-exact-recorded-targets').targets,db=database();
  assert.deepEqual(await deleteRows(db.sql,{runId,targets}),{deleted:targets.length});assert.deepEqual(db.state.rows,blank());
  const deletes=db.state.calls.filter(call=>call.text.startsWith('delete '));assert.equal(deletes.length,2);
  assert.match(deletes[0].text,/r\.id=v\.id and r\.user_id=v\.user_id/u);assert.match(deletes[1].text,/r\.id=v\.id and r\.student_id=v\.student_id/u);
  for(const {text,params}of deletes){assert.match(text,/assistant_evaluation_run'=\$2/u);assert.match(text,/returning r\.id,r\./u);assert.equal(params[1],runId);assert.doesNotMatch(text,/truncate|cascade|delete from auth|commit/u);}
  const wrong=database();wrong.state.alter=text=>text.startsWith('delete ')?[]:undefined;
  await assert.rejects(deleteRows(wrong.sql,{runId,targets}),error('mutation_mismatch'));
});

test('all mutation input is validated before SQL; protected tables, hidden fields, duplicates and invalid cells are rejected',async()=>{
  for(const mutate of [value=>{value.table=ops;},value=>{value.rows[0].source_mode='official';},value=>{value.rows[0].amount_text=0;},
    value=>{value.rows[0].deleted_at=manifest.stamp;},value=>{value.rows[0].version=2;},value=>{value.rows[0].updated_at='2026-11-15T00:00:00Z';},value=>{value.rows.push(value.rows[0]);}]){
    const value={runId,table:fee,rows:structuredClone(plan().rows[fee])};mutate(value);const db=database(blank());await assert.rejects(insertRows(db.sql,value),error('invalid_request'));assert.equal(db.state.calls.length,0);
  }
  for(const target of [{table:ops,id:a,userId:b},{table:fee,id:a},{table:fee,id:a,userId:b,where:'true'}]){
    const db=database();await assert.rejects(deleteRows(db.sql,{runId,targets:[target]}),error('invalid_request'));assert.equal(db.state.calls.length,0);
  }
  const db=database();assert.deepEqual(await deleteRows(db.sql,{runId,targets:[]}),{deleted:0});assert.deepEqual(await insertRows(db.sql,{runId,table:fee,rows:[]}),{inserted:0});assert.equal(db.state.calls.length,0);
});

test('mutation receipt mismatch propagates to the caller transaction for rollback and never retries a write',async()=>{
  const current=plan(),db=database(),before=structuredClone(db.state.rows);let writes=0;
  db.state.alter=text=>{if(text.startsWith('delete ')){writes++;if(writes===2)throw new Error('SECRET_CONNECTION_STRING');}return undefined;};
  const outerTransaction=async callback=>{const saved=structuredClone(db.state.rows);try{return await callback(db.sql);}catch(error){db.state.rows=saved;throw error;}};
  await assert.rejects(outerTransaction(sql=>deleteRows(sql,{runId,targets:current.cleanup.find(step=>step.kind==='delete-exact-recorded-targets').targets})),error('query_failed'));
  assert.deepEqual(db.state.rows,before);assert.equal(writes,2);assert.ok(!db.state.calls.some(call=>/^(?:begin|commit|rollback)/u.test(call.text)));
});

test('captured validated inputs cannot be changed while identity checks are pending',async()=>{
  const db=database(blank()),rows=structuredClone(plan().rows[fee]);let release;const gate=new Promise(resolve=>{release=resolve;});
  const original=db.sql.unsafe;db.sql.unsafe=async(text,params)=>{if(text.includes(' from auth.users '))await gate;return original(text,params);};
  const pending=insertRows(db.sql,{runId,table:fee,rows});rows[0].notes_text='CHANGED_AFTER_VALIDATION';rows[0].user_id=b;release();
  await pending;assert.equal(db.state.rows[fee][0].notes_text,'Historical private note');assert.equal(db.state.rows[fee][0].user_id,a);
});
