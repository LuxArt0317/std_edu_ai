import assert from 'node:assert/strict';
import test from 'node:test';
import {createFeeRemissionFixtureLifecycle,feeRemissionLifecycleReadContracts} from './fee-remission-fixture-lifecycle.mjs';
import {buildFeeRemissionFixturePlan,feeRemissionFixtureReadContract,feeRemissionLivePlanManifest as manifest} from './fee-remission-live-plan.mjs';

const runId='10000000-0000-4000-8000-000000000001';
const owners={A:{id:'20000000-0000-4000-8000-000000000001',email:'fee.a@example.invalid',runMarker:runId},
  B:{id:'20000000-0000-4000-8000-000000000002',email:'fee.b@example.invalid',runMarker:runId}};
const students={A:{id:'30000000-0000-4000-8000-000000000001',user_id:owners.A.id},B:{id:'30000000-0000-4000-8000-000000000002',user_id:owners.B.id}};
const plans=manifest.families.map(fixtureKey=>buildFeeRemissionFixturePlan({runId,owners,students,fixtureKey}));
const [normal,empty,large]=plans,fee='affairs_fee_remission',charges='affairs_charges';
const blank=()=>Object.fromEntries(manifest.tables.map(table=>[table,[]]));
const clone=value=>structuredClone(value);
const error=code=>value=>value?.code===code&&value.message==='Fee remission lifecycle '+code+'.';

function driver(){
  const s={rows:blank(),events:[],lease:true,identities:{identities:clone(Object.values(owners)),students:clone(Object.values(students))},mode:'normal',nativeTransform:null,
    journalFailure:null,zeroFailure:false,clock:Date.parse('2026-11-14T00:00:00.000Z'),readHook:null,insertHook:null,transactionGate:null};
  const checkRequest=request=>{
    assert.equal(request.runId,runId);assert.equal(Object.isFrozen(request),true);
    assert.deepEqual(request.contracts.map(row=>row.table),manifest.tables);
    assert.deepEqual(request.contracts[0].anyOf[0].values,Object.values(owners).map(row=>row.id));
    assert.equal(request.contracts[0].includeDeleted,true);
  };
  const deps={
    clock:()=>s.clock++,
    assertLease:async binding=>{assert.deepEqual(binding,{runId,projectRef:manifest.projectRef,ownerIds:Object.values(owners).map(row=>row.id),studentIds:Object.values(students).map(row=>row.id)});s.events.push({kind:'lease'});return s.lease;},
    readIdentities:async()=>{s.events.push({kind:'identities'});return clone(s.identities);},
    readRows:async request=>{checkRequest(request);s.events.push({kind:'read',contracts:request.contracts});if(s.readHook)s.readHook(s);return clone(s.rows);},
    writeJournal:async entry=>{s.events.push({kind:'journal',entry});assert.deepEqual(Object.keys(entry).sort(),['runId','phase','previousFamily','nextFamily','knownFamilies','recordIds'].sort());
      if(s.journalFailure===entry.phase)throw new Error('PRIVATE connection token');return true;},
    transaction:async work=>{
      s.events.push({kind:'begin'});if(s.transactionGate)await s.transactionGate;
      const txRows=clone(s.rows);
      try{
        await work({
          readRows:async request=>{checkRequest(request);s.events.push({kind:'tx-read',contracts:request.contracts});return clone(txRows);},
          deleteRows:async request=>{
            assert.equal(request.runId,runId);s.events.push({kind:'delete',targets:request.targets});assert.equal(Object.isFrozen(request.targets),true);
            for(const target of request.targets){assert.ok([fee,charges].includes(target.table));const column=target.table===fee?'user_id':'student_id',expected=target.table===fee?target.userId:target.studentId;
              const found=txRows[target.table].filter(row=>row.id===target.id&&row[column]===expected);assert.equal(found.length,1);
              txRows[target.table]=txRows[target.table].filter(row=>row!==found[0]);}
          },
          insertRows:async request=>{
            assert.equal(request.runId,runId);assert.ok([fee,charges].includes(request.table));assert.equal(Object.isFrozen(request.rows),true);
            s.events.push({kind:'insert',table:request.table,ids:request.rows.map(row=>row.id)});txRows[request.table].push(...clone(request.rows));if(s.insertHook)s.insertHook(s);
          },
        });
        if(s.mode==='before')throw new Error('PRIVATE rollback timeout');
        if(s.mode==='partial'){s.rows[fee]=clone(txRows[fee]);throw new Error('PRIVATE uncertain partial');}
        s.rows=txRows;s.events.push({kind:'commit'});
        if(s.mode==='after')throw new Error('PRIVATE commit response lost');
      }catch(err){s.events.push({kind:'transaction-rejected'});throw err;}
    },
    readNative:async request=>{
      const matching=plans.find(plan=>JSON.stringify(plan.rows)===JSON.stringify(s.rows));assert.ok(matching,'Native reads need a complete known state');
      assert.deepEqual(request.contract,feeRemissionFixtureReadContract(matching,{role:request.role,view:request.view}));
      s.events.push({kind:'native',role:request.role,view:request.view});
      const result=clone(matching.expectedByOwner[owners[request.role].id][request.view]);
      if(request.view==='charges')result.checkedAt=new Date(s.clock).toISOString();
      return s.nativeTransform?s.nativeTransform(result,request):result;
    },
    readCleanupProof:async request=>{
      checkRequest(request);s.events.push({kind:'zero-proof'});
      const proof={...clone(s.identities),remainingByTable:Object.fromEntries(manifest.tables.map(table=>[table,Object.values(owners).map(owner=>({userId:owner.id,
        count:s.rows[table].filter(row=>row.user_id===owner.id||row.actor_id===owner.id||row.student_id===Object.values(students).find(student=>student.user_id===owner.id).id).length}))])),
        reservedByTable:{[fee]:s.rows[fee].length,[charges]:s.rows[charges].length}};
      if(s.zeroFailure)proof.reservedByTable[fee]=1;return proof;
    },
  };
  return {s,deps,make:()=>createFeeRemissionFixtureLifecycle(deps)};
}

test('transition and after-case proof use both native owners and a stable semantic digest without credentials',async()=>{
  const {s,make}=driver(),life=make(),before=await life.transition(normal);
  assert.deepEqual(Object.keys(before),['verified','fixtureKey','digest','nativeReads']);assert.equal(before.nativeReads,4);assert.match(before.digest,/^[a-f0-9]{64}$/u);
  assert.deepEqual(s.events.filter(row=>row.kind==='native').map(({role,view})=>[role,view]),[['A','feeRemission'],['A','charges'],['B','feeRemission'],['B','charges']]);
  assert.deepEqual(await life.verifyUnchanged(),before);assert.equal(life.status().phase,'ready');assert.equal(life.status().digest,before.digest);
  assert.ok(s.events.findIndex(row=>row.kind==='journal'&&row.entry.phase==='transition-intent')<s.events.findIndex(row=>row.kind==='insert'));
  assert.doesNotMatch(JSON.stringify(s.events.filter(row=>row.kind==='journal')),/token|PRIVATE STUDENT|amount_text|password/iu);
  const writes=s.events.filter(row=>['insert','delete'].includes(row.kind)).length;assert.deepEqual(await life.transition(normal),before);
  assert.equal(s.events.filter(row=>['insert','delete'].includes(row.kind)).length,writes);
});

test('transitions retain all old/new globally reserved IDs and replace only exact owner-qualified targets',async()=>{
  const {s,make}=driver(),life=make();await life.transition(normal);const first=life.status().digest;await life.transition(empty);await life.transition(large);
  assert.notEqual(life.status().digest,first);assert.deepEqual(s.rows,clone(large.rows));
  const contracts=s.events.filter(row=>row.kind==='read').at(-1).contracts;
  assert.deepEqual(new Set(contracts[0].anyOf[1].values),new Set(plans.flatMap(plan=>plan.rows[fee].map(row=>row.id))));
  assert.deepEqual(new Set(contracts[1].anyOf[1].values),new Set(plans.flatMap(plan=>plan.rows[charges].map(row=>row.id))));
  for(const item of s.events.filter(row=>row.kind==='delete'))for(const target of item.targets){
    assert.deepEqual(Object.keys(target).sort(),['table','id',target.table===fee?'userId':'studentId'].sort());
    assert.ok(plans.flatMap(plan=>plan.recordIds).includes(target.id));
  }
});

test('cleanup needs no native token and proves exact empty owned plus union-reserved state',async()=>{
  const {s,deps,make}=driver(),life=make();await life.transition(normal);const calls=s.events.filter(row=>row.kind==='native').length;
  deps.readNative=async()=>assert.fail('Captured callback cannot be replaced');s.nativeTransform=()=>assert.fail('No native call after token clearing');
  assert.deepEqual(await life.cleanup(),{cleaned:true,nativeReads:0});assert.deepEqual(s.rows,blank());assert.equal(life.status().phase,'closed');
  assert.equal(s.events.filter(row=>row.kind==='native').length,calls);assert.ok(s.events.some(row=>row.kind==='zero-proof'));
  await assert.rejects(life.transition(normal),error('closed'));
});

test('lease loss or wrong identity stops before any transaction, and cleanup revalidates the same owners',async()=>{
  for(const mutate of [s=>{s.lease=false;},s=>{s.identities.identities[0].runMarker=owners.B.id;},s=>{s.identities.students[0].user_id=owners.B.id;}]){
    const {s,make}=driver(),life=make();mutate(s);await assert.rejects(life.transition(normal));assert.equal(s.events.some(row=>row.kind==='begin'),false);
    await assert.rejects(life.cleanup());assert.equal(s.events.some(row=>row.kind==='delete'),false);assert.equal(life.status().phase,'recovery-required');
  }
});

test('lease loss within the transaction stops the next mutation and cannot produce a ready digest',async()=>{
  const {s,make}=driver(),life=make();s.insertHook=state=>{state.lease=false;};
  await assert.rejects(life.transition(normal),error('transaction_failed'));assert.deepEqual(s.rows,blank());
  assert.equal(s.events.filter(row=>row.kind==='insert').length,1);assert.equal(life.status().digest,null);
  await assert.rejects(life.cleanup(),error('lease_unavailable'));s.lease=true;s.insertHook=null;await life.cleanup();
});

test('equivalent SQL timestamp/decimal encodings preserve the validated digest without changing literal remission cells',async()=>{
  const {deps,make}=driver(),readRows=deps.readRows;
  deps.readRows=async request=>{const rows=await readRows(request);
    for(const row of rows[fee])row.updated_at='2026-11-14T00:00:00+00:00';
    for(const row of rows[charges]){row.amount_due=String(row.amount_due)+'.00';row.amount_paid=String(row.amount_paid)+'.00';}
    return rows;};
  const life=make(),before=await life.transition(normal);assert.deepEqual(await life.verifyUnchanged(),before);await life.cleanup();
});

test('durable intent failure cannot seed or adopt existing rows and is safe to reconcile afterward',async()=>{
  const {s,make}=driver(),life=make();s.journalFailure='transition-intent';await assert.rejects(life.transition(normal),error('journal_failed'));
  assert.equal(s.events.some(row=>row.kind==='begin'),false);assert.deepEqual(s.rows,blank());s.journalFailure=null;await life.cleanup();
  const another=driver();another.s.rows=clone(normal.rows);const fresh=another.make();await assert.rejects(fresh.transition(normal),error('state_mismatch'));
  assert.equal(another.s.events.some(row=>row.kind==='delete'||row.kind==='insert'),false);
});

test('uncertain commit reconciles complete previous, next or empty states without blind retry',async()=>{
  for(const mode of ['before','after']){
    const {s,make}=driver(),life=make();await life.transition(normal);s.mode=mode;
    await assert.rejects(life.transition(empty),error('transaction_failed'));assert.equal(life.status().phase,'recovery-required');
    await assert.rejects(life.transition(large),error('recovery_required'));
    assert.deepEqual(s.rows,clone(mode==='before'?normal.rows:empty.rows));s.mode='normal';await life.cleanup();assert.deepEqual(s.rows,blank());
  }
  const {s,make}=driver(),life=make();s.mode='before';await assert.rejects(life.transition(normal));s.mode='normal';await life.cleanup();assert.deepEqual(s.rows,blank());
});

test('mixed commits, unknown rows, audit/operation receipts and moved reserved IDs refuse destructive cleanup',async()=>{
  const corruptions=[
    s=>{s.rows[fee][0].amount_text='unexpected';},
    s=>{s.rows[fee][0].user_id='90000000-0000-4000-8000-000000000009';},
    s=>{s.rows[fee][0].deleted_at='2026-11-14T01:00:00.000Z';},
    s=>{s.rows[manifest.tables[2]].push({actor_id:owners.A.id});},
    s=>{s.rows[manifest.tables[3]].push({user_id:owners.B.id});},
  ];
  for(const corrupt of corruptions){const {s,make}=driver(),life=make();await life.transition(normal);corrupt(s);const before=clone(s.rows),writes=s.events.filter(row=>row.kind==='delete').length;
    await assert.rejects(life.verifyUnchanged(),error('state_mismatch'));await assert.rejects(life.cleanup(),error('state_mismatch'));
    assert.deepEqual(s.rows,before);assert.equal(s.events.filter(row=>row.kind==='delete').length,writes);
  }
  const {s,make}=driver(),life=make();await life.transition(normal);s.mode='partial';await assert.rejects(life.transition(empty));s.mode='normal';
  await assert.rejects(life.cleanup(),error('state_mismatch'));assert.ok(s.rows[charges].some(row=>normal.recordIds.includes(row.id)));
});

test('all native views must match literal own data, including foreign-control rows and charge timestamps',async()=>{
  const variants=[
    (value,request)=>request.role==='B'&&request.view==='feeRemission'?{...value,userId:owners.A.id}:value,
    (value,request)=>request.view==='charges'?{...value,charges:value.charges.map(row=>({...row,amountPaid:0}))}:value,
    (value,request)=>request.view==='feeRemission'?{...value,records:value.records.map(row=>({...row,amount_text:row.amount_text===null?'0':row.amount_text}))}:value,
    (value,request)=>request.view==='charges'?{...value,checkedAt:'2020-01-01T00:00:00.000Z'}:value,
  ];
  for(const transform of variants){const {s,make}=driver(),life=make();s.nativeTransform=transform;
    await assert.rejects(life.transition(normal),error('native_readback_failed'));assert.equal(life.status().digest,null);s.nativeTransform=null;await life.cleanup();}
});

test('raw state mutation during native reads cannot pass unchanged proof',async()=>{
  const {s,make}=driver(),life=make();await life.transition(normal);
  s.nativeTransform=(value,request)=>{if(request.role==='B'&&request.view==='charges')s.rows[charges][0].amount_paid=6000;return value;};
  await assert.rejects(life.verifyUnchanged(),error('state_mismatch'));assert.equal(life.status().phase,'recovery-required');
});

test('cleanup failure preserves recovery state and journal rather than claiming closed or deleting unknown data',async()=>{
  const {s,make}=driver(),life=make();await life.transition(normal);s.zeroFailure=true;
  await assert.rejects(life.cleanup(),error('cleanup_failed'));assert.equal(life.status().phase,'recovery-required');
  assert.equal(s.events.some(row=>row.kind==='journal'&&row.entry.phase==='cleaned'),false);
  s.zeroFailure=false;await life.cleanup();assert.equal(life.status().phase,'closed');
});

test('a durable recovery plan permits only exact cleanup, with the complete old/new union',async()=>{
  const {s,make}=driver();s.rows=clone(empty.rows);const life=make();
  life.restore({previous:normal,next:empty,knownPlans:[normal,empty]});assert.equal(life.status().phase,'recovery-required');
  await assert.rejects(life.transition(large),error('recovery_required'));await assert.rejects(life.verifyUnchanged(),error('not_ready'));
  await life.cleanup();assert.deepEqual(s.rows,blank());
  const bad=driver().make();assert.throws(()=>bad.restore({previous:normal,next:empty,knownPlans:[normal]}),error('invalid_recovery'));
});

test('overlapping lifecycle calls are refused while one bounded transport operation is pending',async()=>{
  const {s,make}=driver(),life=make();let release;s.transactionGate=new Promise(resolve=>{release=resolve;});
  const pending=life.transition(normal);while(!s.events.some(row=>row.kind==='begin'))await new Promise(resolve=>setTimeout(resolve,0));
  await assert.rejects(life.cleanup(),error('busy'));await assert.rejects(life.verifyUnchanged(),error('busy'));release();await pending;
  assert.equal(life.status().busy,false);await life.cleanup();
});

test('dependency capture, invalid plans and transport errors cannot expose credentials or invent a transaction',async()=>{
  const {deps,make}=driver();assert.throws(()=>createFeeRemissionFixtureLifecycle({...deps,fetch:async()=>{}}),error('invalid_dependencies'));
  const forged=clone(normal);forged.rows[charges][0].amount_due=1;await assert.rejects(make().transition(forged),error('invalid_plan'));
  const incomplete=driver();incomplete.deps.transaction=async()=>true;
  await assert.rejects(incomplete.make().transition(normal),error('transaction_failed'));
  const throwing=driver();throwing.deps.readRows=async()=>{throw new Error('postgres://SECRET:PASSWORD@private');};
  await assert.rejects(throwing.make().transition(normal),value=>error('read_failed')(value)&&!JSON.stringify(value).includes('SECRET'));
});

test('union validation rejects different runs, identities, duplicate families and foreign plan fields',()=>{
  assert.throws(()=>feeRemissionLifecycleReadContracts([]),error('invalid_plan'));
  assert.throws(()=>feeRemissionLifecycleReadContracts([normal,normal]),error('invalid_plan'));
  const otherRun='10000000-0000-4000-8000-000000000002',otherOwners=clone(owners);for(const row of Object.values(otherOwners))row.runMarker=otherRun;
  const other=buildFeeRemissionFixturePlan({runId:otherRun,owners:otherOwners,students,fixtureKey:'feeRemission'});
  assert.throws(()=>feeRemissionLifecycleReadContracts([normal,other]),error('invalid_plan'));
  assert.throws(()=>feeRemissionLifecycleReadContracts([{...normal,token:'SECRET'}]),error('invalid_plan'));
});
