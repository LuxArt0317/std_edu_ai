import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {feeRemissionLivePlanManifest as manifest,buildFeeRemissionFixturePlan,feeRemissionFixtureSqlReadContract,
  feeRemissionFixtureReadContract,assertFeeRemissionFixtureIdentities,assertFeeRemissionFixtureRows,
  verifyFeeRemissionFixtureReadback,reconcileFeeRemissionFixturePlans,assertFeeRemissionFixtureCleanup} from './fee-remission-live-plan.mjs';

// Transport-free orchestration. Importing this module grants no provider access,
// mutation authority or lease. The authorized adapter owns bounded SQL/HTTP,
// protected-owner preservation, fresh Google identities and durable receipts.
const fee='affairs_fee_remission',charges='affairs_charges',roles=['A','B'];
const copy=value=>structuredClone(value);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>object(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const codes=new Set(['invalid_dependencies','invalid_plan','invalid_recovery','busy','closed','recovery_required','not_ready','lease_unavailable',
  'identity_mismatch','read_failed','state_mismatch','journal_failed','transaction_failed','native_readback_failed','cleanup_failed','invalid_clock']);
const fail=code=>{throw Object.assign(new Error('Fee remission lifecycle '+code+'.'),{name:'FeeRemissionLifecycleError',code});};
const requireValue=(value,code)=>{if(!value)fail(code);};
function checked(plan){
  try{feeRemissionFixtureSqlReadContract(plan);return buildFeeRemissionFixturePlan({runId:plan.runId,owners:plan.owners,students:plan.students,fixtureKey:plan.fixtureKey});}
  catch{fail('invalid_plan');}
}
function sameBinding(a,b){return a.runId===b.runId&&isDeepStrictEqual(a.owners,b.owners)&&isDeepStrictEqual(a.students,b.students);}
function digest(plan){
  // Actual reads must first equal the independent canonical plan. Hash only this
  // validated semantic state; never normalize arbitrary private text or arrays.
  return createHash('sha256').update(JSON.stringify(plan.rows)).digest('hex');
}
/** Exact union of owned predicates and globally reserved old/new row IDs. */
export function feeRemissionLifecycleReadContracts(plans){
  requireValue(Array.isArray(plans)&&plans.length>0&&plans.length<=3,'invalid_plan');
  const safe=plans.map(checked);requireValue(safe.every(plan=>sameBinding(plan,safe[0])),'invalid_plan');
  requireValue(new Set(safe.map(plan=>plan.fixtureKey)).size===safe.length,'invalid_plan');
  const result=copy(feeRemissionFixtureSqlReadContract(safe[0]));
  for(const plan of safe.slice(1))for(const [index,source]of feeRemissionFixtureSqlReadContract(plan).entries()){
    const target=result[index];requireValue(source.table===target.table&&isDeepStrictEqual(source.columns,target.columns),'invalid_plan');
    for(const [position,predicate]of source.anyOf.entries()){
      requireValue(target.anyOf[position].column===predicate.column,'invalid_plan');
      target.anyOf[position].values=[...new Set([...target.anyOf[position].values,...predicate.values])].sort();
    }
  }
  for(const item of result)for(const predicate of item.anyOf)predicate.values.sort();
  return freeze(result);
}

/**
 * Required injected functions (no credentials are accepted here):
 * assertLease(binding) -> true; readIdentities(binding) -> {identities,students};
 * readRows({runId,contracts}) -> exact four canonical table arrays;
 * transaction(async tx => ...) where tx exposes only readRows/deleteRows/insertRows;
 * readNative({runId,role,view,contract}) -> actual caller-scoped native response;
 * writeJournal({runId,phase,previousFamily,nextFamily,knownFamilies,recordIds}) -> true;
 * readCleanupProof({runId,contracts}) -> exact two-owner and union-reserved zero proof.
 *
 * The transaction transport must use one bounded physical transaction, rollback
 * callback failure and not return until callback/commit settles. SQL/HTTP timeouts
 * belong to that transport; this helper never races an unresolved write or retries.
 */
export function createFeeRemissionFixtureLifecycle(dependencies){
  const names=['assertLease','readIdentities','readRows','transaction','readNative','writeJournal','readCleanupProof'];
  requireValue(exact(dependencies,names)||exact(dependencies,[...names,'clock']),'invalid_dependencies');
  requireValue(names.every(name=>typeof dependencies[name]==='function')&&(dependencies.clock===undefined||typeof dependencies.clock==='function'),'invalid_dependencies');
  const deps=Object.freeze(Object.fromEntries(names.map(name=>[name,dependencies[name]]))),clock=dependencies.clock??Date.now;
  let current=null,pending=null,known=[],phase='idle',busy=false;
  const binding=plan=>freeze({runId:plan.runId,projectRef:manifest.projectRef,ownerIds:roles.map(role=>plan.owners[role].id),studentIds:roles.map(role=>plan.students[role].id)});
  const request=()=>freeze({runId:known[0].runId,contracts:feeRemissionLifecycleReadContracts(known)});
  const status=()=>freeze({phase,busy,currentFamily:current?.fixtureKey??null,pendingFamily:pending?.fixtureKey??null,
    knownFamilies:known.map(plan=>plan.fixtureKey),digest:phase==='ready'&&current?digest(current):null});
  async function invoke(fn,args,code){try{return await fn(args);}catch{fail(code);}}
  async function lease(plan){requireValue(await invoke(deps.assertLease,binding(plan),'lease_unavailable')===true,'lease_unavailable');}
  async function guard(plan){
    await lease(plan);const proof=await invoke(deps.readIdentities,binding(plan),'identity_mismatch');
    try{assertFeeRemissionFixtureIdentities(plan,proof);}catch{fail('identity_mismatch');}await lease(plan);
  }
  async function journal(state){
    const value=freeze({runId:known[0].runId,phase:state,previousFamily:current?.fixtureKey??null,nextFamily:pending?.fixtureKey??null,
      knownFamilies:known.map(plan=>plan.fixtureKey),recordIds:[...new Set(known.flatMap(plan=>plan.recordIds))].sort()});
    requireValue(await invoke(deps.writeJournal,value,'journal_failed')===true,'journal_failed');
  }
  async function observe(read=deps.readRows){return invoke(read,request(),'read_failed');}
  function exactRows(plan,rows){try{assertFeeRemissionFixtureRows(plan,rows);}catch{fail('state_mismatch');}}
  function absent(rows){try{requireValue(reconcileFeeRemissionFixturePlans({next:known[0],actual:rows}).state==='empty','state_mismatch');}catch{fail('state_mismatch');}}
  function now(){let value;try{value=clock();}catch{fail('invalid_clock');}requireValue(Number.isSafeInteger(value)&&value>=0,'invalid_clock');return value;}
  async function native(plan){
    for(const role of roles)for(const view of ['feeRemission','charges']){
      await lease(plan);const contract=feeRemissionFixtureReadContract(plan,{role,view}),start=now();
      const actual=await invoke(deps.readNative,freeze({runId:plan.runId,role,view,contract}),'native_readback_failed'),end=now();
      if(end<start||end-start>12000)fail('native_readback_failed');
      try{
        verifyFeeRemissionFixtureReadback(plan,view==='charges'?{role,view,readStartedAt:start,readFinishedAt:end}:{role,view},actual);
      }catch{fail('native_readback_failed');}
      await lease(plan);
    }
  }
  async function transact(plan,work){
    let calls=0,completed=false;
    await invoke(deps.transaction,async tx=>{
      requireValue(++calls===1&&exact(tx,['readRows','deleteRows','insertRows'])&&Object.values(tx).every(fn=>typeof fn==='function'),'transaction_failed');
      const safe=Object.freeze({readRows:tx.readRows,deleteRows:tx.deleteRows,insertRows:tx.insertRows});
      await lease(plan);await work(safe);await lease(plan);completed=true;
    },'transaction_failed');
    requireValue(calls===1&&completed,'transaction_failed');
  }
  async function run(work){
    if(busy)fail('busy');if(phase==='closed')fail('closed');busy=true;
    try{return await work();}catch(error){if(known.length)phase='recovery-required';
      if(error?.name==='FeeRemissionLifecycleError'&&codes.has(error.code))throw error;fail('state_mismatch');}
    finally{busy=false;}
  }
  async function verify(){
    requireValue(phase==='ready'&&current&&!pending,'not_ready');await guard(current);
    exactRows(current,await observe());await native(current);exactRows(current,await observe());await guard(current);
    return freeze({verified:true,fixtureKey:current.fixtureKey,digest:digest(current),nativeReads:4});
  }
  return Object.freeze({status,
    /** Restore only a previously durable exact-plan journal. Does not adopt rows,
     * verify a lease or authorize mutation; cleanup is the only next operation. */
    restore(value){
      if(busy)fail('busy');requireValue(phase==='idle'&&!known.length,'invalid_recovery');
      requireValue(exact(value,['previous','next','knownPlans'])&&Array.isArray(value.knownPlans),'invalid_recovery');
      const plans=value.knownPlans.map(checked);feeRemissionLifecycleReadContracts(plans);
      const before=value.previous===null?null:checked(value.previous),after=value.next===null?null:checked(value.next);
      requireValue((before||after)&&[before,after].filter(Boolean).every(plan=>plans.some(knownPlan=>isDeepStrictEqual(plan,knownPlan))),'invalid_recovery');
      known=plans;current=before;pending=after;phase='recovery-required';return status();
    },
    transition(plan){return run(async()=>{
      requireValue(phase==='idle'||phase==='ready','recovery_required');plan=checked(plan);
      if(known.length)requireValue(sameBinding(plan,known[0]),'invalid_plan');
      if(current&&isDeepStrictEqual(plan,current))return verify();
      if(!known.some(item=>item.fixtureKey===plan.fixtureKey))known.push(plan);
      pending=plan;phase='transition-pending';await guard(plan);await journal('transition-intent');await guard(plan);
      const before=await observe();if(current)exactRows(current,before);else absent(before);
      await transact(plan,async tx=>{
        const start=await observe(tx.readRows);if(current)exactRows(current,start);else absent(start);
        if(current){const targets=reconcileFeeRemissionFixturePlans({previous:current,next:pending,actual:start}).deleteTargets;
          await lease(plan);await invoke(tx.deleteRows,freeze({runId:plan.runId,targets}),'transaction_failed');}
        absent(await observe(tx.readRows));
        for(const table of [fee,charges]){await lease(plan);await invoke(tx.insertRows,freeze({runId:plan.runId,table,rows:copy(plan.rows[table])}),'transaction_failed');}
        exactRows(plan,await observe(tx.readRows));
      });
      await guard(plan);exactRows(plan,await observe());await native(plan);exactRows(plan,await observe());await guard(plan);
      await journal('ready');current=plan;pending=null;phase='ready';
      return freeze({verified:true,fixtureKey:plan.fixtureKey,digest:digest(plan),nativeReads:4});
    });},
    verifyUnchanged(){return run(verify);},
    cleanup(){return run(async()=>{
      if(!known.length){phase='closed';return freeze({cleaned:true,nativeReads:0});}
      const plan=pending??current??known[0];phase='cleanup-pending';await guard(plan);await journal('cleanup-intent');await guard(plan);
      const reconcile=rows=>{try{return reconcileFeeRemissionFixturePlans({previous:current,next:pending,actual:rows});}catch{fail('state_mismatch');}};
      const before=reconcile(await observe());
      await transact(plan,async tx=>{
        const inside=reconcile(await observe(tx.readRows));requireValue(isDeepStrictEqual(inside,before),'state_mismatch');
        if(inside.deleteTargets.length){await lease(plan);await invoke(tx.deleteRows,freeze({runId:plan.runId,targets:inside.deleteTargets}),'transaction_failed');}
        absent(await observe(tx.readRows));
      });
      // Destructive cleanup intentionally needs no caller tokens: scoped native
      // readback was mandatory before/after each case. Exact SQL union emptiness
      // and identity/lease/zero proofs remain mandatory after deletion.
      await guard(plan);absent(await observe());
      const proof=await invoke(deps.readCleanupProof,request(),'cleanup_failed');
      for(const old of known)try{assertFeeRemissionFixtureCleanup(old,proof);}catch{fail('cleanup_failed');}
      await guard(plan);await journal('cleaned');current=null;pending=null;phase='closed';
      return freeze({cleaned:true,nativeReads:0});
    });},
  });
}
