import {isDeepStrictEqual} from 'node:util';
import {
  assertLeaveFixture,freezeLeaveFixture,leaveFixtureExact,leaveFixtureDigest,leaveFixtureRoles,leaveFixtureTables,
  buildStudentLeaveFixturePlan,checkedStudentLeaveFixtureBinding,checkedStudentLeaveFixturePlan,
  checkedStudentLeaveFixtureRows,assertStudentLeaveFixtureRows,assertStudentLeaveFixtureEmpty,
  studentLeaveFixtureReadContracts,studentLeaveFixtureProbeContracts,verifyStudentLeaveFixtureProbe,
  StudentLeaveFixtureError,
} from './student-leave-fixture-plan.mjs';

const {forms,reviews,audit}=leaveFixtureTables;
const clone=value=>structuredClone(value);
const sortedFamily=plans=>plans.map(plan=>plan.family).sort();
const reservedIds=plans=>[...new Set(plans.flatMap(plan=>plan.recordIds))].sort();
const phaseSet=['transition-intent','mutation-intent','ready','cleanup-intent','cleaned'];
const exactFns=(value,names)=>leaveFixtureExact(value,names)&&names.every(name=>typeof value[name]==='function');

export function studentLeaveJournalBinding(input){
  const {owners,...binding}=checkedStudentLeaveFixtureBinding(input);
  return freezeLeaveFixture({...binding,ownerIds:leaveFixtureRoles.map(role=>owners[role].id)});
}

function assertIdentities(binding,rows){
  const expected=leaveFixtureRoles.map(role=>({...binding.owners[role],role:'student',googleIdentity:true}));
  assertLeaveFixture(Array.isArray(rows)&&rows.length===2&&rows.every(row=>leaveFixtureExact(row,['id','email','runMarker','role','googleIdentity']))
    &&expected.every(row=>rows.filter(actual=>isDeepStrictEqual(row,actual)).length===1),'identity_mismatch');
}
function maybePlan(family,plans){
  return family===null?null:plans.find(plan=>plan.family===family);
}
function checkedHead(binding,head){
  if(head===null)return {known:[],previous:null,next:null};
  assertLeaveFixture(leaveFixtureExact(head,['version','binding','sequence','previousDigest','phase','previous','next','knownFamilies','reservedRecordIds'])
    &&head.version===1&&phaseSet.includes(head.phase)&&Number.isInteger(head.sequence)&&head.sequence>=1&&head.sequence<=256
    &&isDeepStrictEqual(head.binding,studentLeaveJournalBinding(binding))
    &&Array.isArray(head.knownFamilies)&&head.knownFamilies.length&&new Set(head.knownFamilies).size===head.knownFamilies.length,'journal_drift');
  const known=head.knownFamilies.map(family=>buildStudentLeaveFixturePlan({binding,family}));
  assertLeaveFixture(isDeepStrictEqual(sortedFamily(known),head.knownFamilies)&&isDeepStrictEqual(reservedIds(known),head.reservedRecordIds),'journal_drift');
  const previous=maybePlan(head.previous,known),next=maybePlan(head.next,known);
  assertLeaveFixture(previous!==undefined&&next!==undefined
    &&(['transition-intent','mutation-intent','ready'].includes(head.phase)?next:head.phase==='cleaned'?!previous&&!next:true),'journal_drift');
  return {known,previous,next};
}

function matchedPlan(rows,candidates){
  const actual=checkedStudentLeaveFixtureRows(rows);
  if(Object.values(actual).every(table=>!table.length))return null;
  const matches=candidates.filter(Boolean).filter(plan=>isDeepStrictEqual(actual,plan.rows));
  assertLeaveFixture(matches.length===1,'row_state_mismatch');
  return matches[0];
}

/** Transport-free workflow. Lease, manifest and owner proofs are provided by
 * the authorized runner. A transaction MUST use one serialized connection
 * and compare full expected rows at each destructive statement. */
export function createStudentLeaveFixtureLifecycle({binding,dependencies}={}){
  binding=checkedStudentLeaveFixtureBinding(binding);
  const names=['assertLease','assertCurrentRelease','assertProtectedOwner','readIdentities','readRows','readProbe','transaction','journal'];
  assertLeaveFixture(leaveFixtureExact(dependencies,names)&&names.slice(0,-1).every(key=>typeof dependencies[key]==='function')
    &&exactFns(dependencies.journal,['read','compareAndSet']),'invalid_dependencies');
  const deps=Object.freeze({...dependencies,journal:Object.freeze({...dependencies.journal})});
  const journalBinding=studentLeaveJournalBinding(binding);
  let head=null,phase='idle',busy=false;
  const status=()=>freezeLeaveFixture({phase,busy,sequence:head?.sequence??0,currentFamily:head?.phase==='ready'?head.next:null,
    pendingFamily:['transition-intent','mutation-intent'].includes(head?.phase)?head.next:null,
    knownFamilies:[...(head?.knownFamilies??[])],requestObservationsMounted:false,liveAcceptance:false});
  const call=async(fn,arg,error)=>{
    try{return await fn(arg);}catch(problem){
      if(problem instanceof StudentLeaveFixtureError)throw problem;
      throw new StudentLeaveFixtureError(error);
    }
  };
  const lease=async()=>{
    assertLeaveFixture(await call(deps.assertLease,journalBinding,'lease_unavailable')===true,'lease_unavailable');
  };
  async function guard({requireRelease}){
    await lease();
    if(requireRelease)assertLeaveFixture(await call(deps.assertCurrentRelease,journalBinding,'release_unavailable')===true,'release_unavailable');
    assertLeaveFixture(await call(deps.assertProtectedOwner,journalBinding,'protected_owner_changed')===true,'protected_owner_changed');
    const identities=await call(deps.readIdentities,journalBinding,'identity_mismatch');
    assertIdentities(binding,identities);
    await lease();
  }
  async function verifyHead(){
    const actual=await call(deps.journal.read,undefined,'journal_failed');
    checkedHead(binding,actual);
    assertLeaveFixture(isDeepStrictEqual(actual,head),'journal_drift');
  }
  async function writeJournal(state,previous,next,known){
    const value=freezeLeaveFixture({
      version:1,binding:journalBinding,sequence:(head?.sequence??0)+1,previousDigest:head?leaveFixtureDigest(head):null,
      phase:state,previous:previous?.family??null,next:next?.family??null,knownFamilies:sortedFamily(known),reservedRecordIds:reservedIds(known),
    });
    checkedHead(binding,value);
    let saved=false;
    try{saved=await deps.journal.compareAndSet(head,value);}catch{throw new StudentLeaveFixtureError('journal_failed');}
    assertLeaveFixture(saved===true,'journal_failed');
    head=value;
    await verifyHead();
  }
  const request=known=>freezeLeaveFixture({...journalBinding,contracts:studentLeaveFixtureReadContracts(known)});
  const rows=(req,read=deps.readRows)=>call(read,req,'read_failed');
  async function probes(plan){
    const contracts=studentLeaveFixtureProbeContracts(plan);
    for(const {expected,...contract} of contracts){
      await lease();
      const actual=await call(deps.readProbe,freezeLeaveFixture(contract),'native_readback_failed');
      verifyStudentLeaveFixtureProbe(expected,actual);
      await lease();
    }
    return contracts.length;
  }
  async function transact(operation,req,work){
    let calls=0,completed=false;
    const callback=async tx=>{
      assertLeaveFixture(++calls===1&&exactFns(tx,['readRows','insertExactRows','deleteExactRows']),'transaction_failed');
      await lease();
      await work(Object.freeze({...tx}));
      await lease();
      completed=true;
    };
    let result;
    try{result=await deps.transaction({...req,operation},callback);}
    catch(problem){
      if(problem instanceof StudentLeaveFixtureError)throw problem;
      throw new StudentLeaveFixtureError('transaction_uncertain');
    }
    assertLeaveFixture(calls===1&&completed&&result?.committed===true,'transaction_uncertain');
  }
  function compareMutation(table,actual,expected){
    const all={ [forms]:[],[reviews]:[],[audit]:[],[table]:actual };
    assertLeaveFixture(isDeepStrictEqual(checkedStudentLeaveFixtureRows(all)[table],expected),'mutation_readback_mismatch');
  }
  async function mutateRows(tx,req,plan,{insert}){
    const tables=insert?[reviews,forms]:[forms,reviews];
    for(const table of tables){
      const selected=plan.rows[table];
      if(!selected.length)continue;
      await lease();
      const fn=insert?tx.insertExactRows:tx.deleteExactRows;
      const actual=await call(fn,freezeLeaveFixture({runId:binding.runId,table,rows:clone(selected),contracts:req.contracts}),
        'mutation_readback_mismatch');
      compareMutation(table,actual,selected);
    }
  }
  async function verifyRows(plan,req){
    assertStudentLeaveFixtureRows(plan,await rows(req));
    const readbacks=await probes(plan);
    assertStudentLeaveFixtureRows(plan,await rows(req));
    return readbacks;
  }
  async function guarded(work){
    assertLeaveFixture(!busy,'busy');
    assertLeaveFixture(phase!=='closed','closed');
    busy=true;
    try{return await work();}catch(error){
      phase='recovery-required';
      if(error instanceof StudentLeaveFixtureError)throw error;
      throw new StudentLeaveFixtureError('state_mismatch');
    }finally{busy=false;}
  }
  function proof(plan,reads){
    return freezeLeaveFixture({fixtureVerified:true,family:plan.family,rowDigest:leaveFixtureDigest(plan.rows),ownerAndCrossedReads:reads,
      modelRequests:0,requestObservationsMounted:false,liveAcceptance:false});
  }
  function cleanupCandidates(){
    const {known,previous,next}=checkedHead(binding,head);
    if(head.phase==='ready')return {known,before:next,after:null};
    if(head.phase==='transition-intent')return {known,before:previous,after:null};
    return {known,before:previous,after:next};
  }
  async function verifyReady(){
    assertLeaveFixture(phase==='ready'&&head?.phase==='ready','not_ready');
    await guard({requireRelease:true});await verifyHead();
    const {known,next}=checkedHead(binding,head);
    const readbacks=await verifyRows(next,request(known));
    await guard({requireRelease:true});await verifyHead();
    return proof(next,readbacks);
  }

  return Object.freeze({
    status,
    /** A reopened journal can only reconcile and clean. No model request or
     * fixture transition can be restored after an uncertain write. */
    reopenForCleanup(){
      return guarded(async()=>{
        assertLeaveFixture(phase==='idle'&&head===null,'invalid_recovery');
        await guard({requireRelease:false});
        const current=await call(deps.journal.read,undefined,'journal_failed');
        checkedHead(binding,current);
        assertLeaveFixture(current&&current.phase!=='cleaned','invalid_recovery');
        head=freezeLeaveFixture(clone(current));phase='recovery-required';
        return status();
      });
    },
    transition(raw){
      return guarded(async()=>{
        assertLeaveFixture(['idle','ready'].includes(phase),'recovery_required');
        const next=checkedStudentLeaveFixturePlan(raw);
        assertLeaveFixture(isDeepStrictEqual(next.binding,binding),'invalid_plan');
        if(phase==='ready'&&head?.phase==='ready'&&next.family===head.next)return verifyReady();
        await guard({requireRelease:true});await verifyHead();
        const previous=cleanupCandidatesWhenReady();
        const known=[...checkedHead(binding,head).known];
        if(!known.some(plan=>plan.family===next.family))known.push(next);
        const req=request(known);
        const compare=observed=>previous?assertStudentLeaveFixtureRows(previous,observed):assertStudentLeaveFixtureEmpty(observed);
        compare(await rows(req));
        await writeJournal('transition-intent',previous,next,known);
        await guard({requireRelease:true});
        await transact('transition',req,async tx=>{
          compare(await rows(req,tx.readRows));
          await writeJournal('mutation-intent',previous,next,known);
          if(previous)await mutateRows(tx,req,previous,{insert:false});
          assertStudentLeaveFixtureEmpty(await rows(req,tx.readRows));
          await mutateRows(tx,req,next,{insert:true});
          assertStudentLeaveFixtureRows(next,await rows(req,tx.readRows));
        });
        await guard({requireRelease:true});
        const readbacks=await verifyRows(next,req);
        await guard({requireRelease:true});
        await writeJournal('ready',previous,next,known);
        phase='ready';
        return proof(next,readbacks);
      });
    },
    verifyUnchanged:()=>guarded(verifyReady),
    cleanup(){
      return guarded(async()=>{
        await verifyHead();
        if(head===null){phase='closed';return freezeLeaveFixture({cleaned:true,scope:'no_fixture_intent',modelRequests:0,liveAcceptance:false});}
        assertLeaveFixture(head.phase!=='cleaned','closed');
        await guard({requireRelease:false});
        const {known,before,after}=cleanupCandidates();
        const req=request(known);
        const candidates=[before,after].filter(Boolean);
        const started=matchedPlan(await rows(req),candidates);
        await writeJournal('cleanup-intent',before,after,known);
        await guard({requireRelease:false});
        await transact('cleanup',req,async tx=>{
          const present=matchedPlan(await rows(req,tx.readRows),candidates);
          assertLeaveFixture(present?.family===started?.family,'row_state_mismatch');
          if(present)await mutateRows(tx,req,present,{insert:false});
          assertStudentLeaveFixtureEmpty(await rows(req,tx.readRows));
        });
        await guard({requireRelease:false});
        assertStudentLeaveFixtureEmpty(await rows(req));
        await guard({requireRelease:false});
        await writeJournal('cleaned',null,null,known);
        phase='closed';
        return freezeLeaveFixture({cleaned:true,scope:'both_owners_reserved_ids_and_review_references',modelRequests:0,liveAcceptance:false});
      });
    },
  });
  function cleanupCandidatesWhenReady(){return head===null?null:checkedHead(binding,head).next;}
}
