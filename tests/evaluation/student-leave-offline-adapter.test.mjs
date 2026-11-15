import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {readStudentLeaveEvidence} from '../../server/accountStudentLeaveEvidence.js';
import {
  createOfflineStudentLeaveEvaluationAdapter,captureOfflineStudentLeaveEvidence,offlineStudentLeaveRequestDigest,
} from './student-leave-offline-adapter.mjs';
import {leaveFixtureDigest,leaveFixtureTables,studentLeaveFixtureManifest} from './student-leave-fixture-plan.mjs';
import {assertNativeStudentLeaveCaseReady,studentLeaveRunnerCases} from './student-leave-runner.mjs';

const {forms,reviews,audit}=leaveFixtureTables;
const empty=()=>({[forms]:[],[reviews]:[],[audit]:[]});
const templates=studentLeaveRunnerCases();
const caseFor=id=>templates.find(row=>row.id==='account:student-leave-native-'+id);
const families=kind=>studentLeaveFixtureManifest.cases.filter(row=>row.availability===kind);
const testScope=()=>({runId:randomUUID(),owners:{A:randomUUID(),B:randomUUID()}});
const projectRef='xiftudmvxphxcjtmfmib';
const origin='https://stdedu-leave-evaluation-v1-d286.vercel.app';
const forbidden=/OFFLINE_[AB]|example\.invalid|STUDENT_PRIVATE_REASON|FOREIGN PRIVATE SENTINEL|000-000-0000/u;
const clone=value=>structuredClone(value);
const project=(row,columns)=>Object.fromEntries(columns.map(key=>[key,row[key]]));
const exactCount=(rows,count)=>rows.length?'0-'+(rows.length-1)+'/'+count:'*/0';
const originalFetch=globalThis.fetch;
let unexpectedNetworkAttempts=0;
test.before(()=>{globalThis.fetch=async()=>{unexpectedNetworkAttempts++;throw new Error('An offline test attempted network I/O.');};});
test.after(()=>{globalThis.fetch=originalFetch;assert.equal(unexpectedNetworkAttempts,0);});

function harness(options={}){
  const {runId,owners}=testScope();
  const binding={runId,projectRef,origin,sourceRevision:'a'.repeat(40),suiteHash:'b'.repeat(64),owners:Object.fromEntries(
    Object.entries(owners).map(([role,id])=>[role,{id,email:'leave-'+role.toLowerCase()+'@example.invalid',runMarker:runId}]))};
  const calls={execute:0,open:0,abort:0,transition:0,probe:0,cleanup:0,events:[]};
  let stored=empty(),journal=null,active,priorReceipt,priorCorrelation;
  const readWhere=({contracts},rows)=>Object.fromEntries(contracts.map(({table,columns,anyOf})=>[table,rows[table].filter(
    row=>anyOf.some(({column,values})=>values.includes(row[column]))).map(row=>project(row,columns))]));
  const fixtureDependencies={
    assertLease:async()=>options.lease!==false,
    assertCurrentRelease:async()=>options.current!==false,
    assertProtectedOwner:async()=>options.ownerUnchanged!==false,
    readIdentities:async()=>Object.values(binding.owners).map(row=>({...row,role:'student',googleIdentity:true})),
    readRows:async req=>readWhere(req,stored),
    readProbe:async contract=>{
      calls.probe++;
      const rows=stored[contract.table].filter(row=>row.user_id===contract.targetId&&row.user_id===contract.callerId)
        .map(row=>project(row,contract.query.select.split(',')));
      return {callerId:contract.callerId,statusCode:200,contentRange:exactCount(rows,rows.length),rows};
    },
    transaction:async({operation},run)=>{
      assert.ok(['transition','cleanup'].includes(operation));
      calls[operation]++;
      const tx=clone(stored);
      await run({
        readRows:async req=>readWhere(req,tx),
        insertExactRows:async({table,rows})=>{
          assert.ok(rows.every(row=>tx[table].every(existing=>existing.id!==row.id)));
          tx[table].push(...clone(rows));return clone(rows);
        },
        deleteExactRows:async({table,rows})=>{
          const exact=rows.map(row=>tx[table].find(other=>other.id===row.id));
          assert.deepEqual(exact,rows);
          tx[table]=tx[table].filter(row=>!rows.some(other=>other.id===row.id));return exact;
        },
      });
      stored=tx;return {committed:true};
    },
    journal:{
      read:async()=>journal,
      compareAndSet:async(previous,next)=>{assert.deepEqual(previous,journal);journal=next;return true;},
    },
  };
  const impossible=name=>async()=>{active.effects[name]++;throw new Error('Unexpected '+name);};
  const handler=createAffairsAssistantHandler({
    verifyToken:async token=>{
      const role=['A','B'].find(candidate=>token==='OFFLINE_'+candidate);
      assert.ok(role);
      const user={id:owners[role]};
      active.callerId=user.id;
      return {url:'https://'+projectRef+'.supabase.co',key:'OFFLINE_KEY',token,user};
    },
    loadSnapshot:impossible('snapshotLoads'),publicResearch:impossible('publicResearch'),
    readers:{
      leaveRecords:async(account,options)=>{
        const attempt={reads:[],evidence:null};
        active.totals.scopedReaderEntries++;
        active.attempts.push(attempt);
        const result=await readStudentLeaveEvidence(account,options,{fetchImpl:async(url,init)=>{
          active.totals.scopedPostgrestRequests++;
          const table=url.pathname.split('/').at(-1);
          assert.ok([forms,reviews].includes(table));
          const callerId=owners[init.headers.Authorization.slice(-1)];
          const query=url.searchParams;
          let rows=stored[table].filter(row=>row.user_id===callerId&&query.get('user_id')==='eq.'+row.user_id);
          const id=query.get('id');
          if(id?.startsWith('eq.'))rows=rows.filter(row=>row.id===id.slice(3));
          if(id?.startsWith('in.('))rows=rows.filter(row=>id.slice(4,-1).split(',').includes(row.id));
          const and=query.get('and')??'';
          if(and.includes('starts_on.lt.2019-08-01'))rows=rows.filter(row=>row.starts_on<'2019-08-01');
          const first=/ends_on\.gte\.(\d{4}-\d\d-\d\d)/u.exec(and)?.[1],last=/starts_on\.lte\.(\d{4}-\d\d-\d\d)/u.exec(and)?.[1];
          if(first&&last)rows=rows.filter(row=>row.starts_on<=last&&row.ends_on>=first);
          rows.sort((a,b)=>(table===forms?b.starts_on.localeCompare(a.starts_on):0)||a.id.localeCompare(b.id));
          const count=rows.length,limit=Number(query.get('limit'));
          const selected=rows.slice(0,limit).map(row=>project(row,query.get('select').split(',')));
          const statusCode=count>limit?206:200,contentRange=exactCount(selected,count);
          attempt.reads.push({callerId,method:init.method,url:url.href,prefer:init.headers.Prefer,statusCode,contentRange,
            rowsDigest:leaveFixtureDigest(selected)});
          return Response.json(selected,{status:statusCode,headers:{'content-range':contentRange}});
        }});
        attempt.evidence=captureOfflineStudentLeaveEvidence(result);
        return result;
      },
      dtmGradeReport:impossible('companionReads'),
    },
    answerAccount:async request=>{
      active.effects.answerPipelineEntries++;
      const read=request.supplementalReaders.leaveRecords;
      const context={deadline:request.deadline};
      const result=await read(context);
      if(options.retry)await read(context);
      // This controlled program does not run or grade a model. Its actual
      // transport is captured separately and cannot be used for live acceptance.
      return {status:result.readState==='ok'?'answered':'abstained',answer:'Controlled offline reader execution.',citations:[]};
    },
  });
  const adapter=createOfflineStudentLeaveEvaluationAdapter({
    binding,fixtureDependencies,
    openObservation:async scope=>{
      calls.open++;
      assert.equal(active,undefined);
      assert.equal(scope.origin,origin);
      assert.equal(scope.projectRef,projectRef);
      assert.ok(Object.isFrozen(scope));
      assert.equal(scope.ownerId,owners.A);
      active={scope,attempts:[],effects:{snapshotLoads:0,companionReads:0,publicResearch:0,externalActions:0,
        databaseWrites:0,providerCalls:0,answerPipelineEntries:0},totals:{scopedReaderEntries:0,scopedPostgrestRequests:0}};
      return {
        finish:async id=>{
          const observed={complete:true,scope,attempts:active.attempts,effects:active.effects,totals:active.totals,callerId:active.callerId,
            requestDigest:active.requestDigest,correlationId:active.correlationId,responseDigest:active.responseDigest};
          assert.equal(typeof id,'string');
          calls.events.push(clone(observed));active=undefined;
          const supplied=options.observation?.(clone(observed),priorReceipt)??observed;
          priorReceipt=clone(observed);
          return clone(supplied);
        },
        abort:async()=>{calls.abort++;active=undefined;},
      };
    },
    executeRequest:async({ownerId,origin:target,endpoint,request})=>{
      calls.execute++;
      assert.ok(active);
      assert.equal(target,origin);
      assert.equal(endpoint,'/api/affairs-assistant');
      assert.equal(ownerId,owners.A);
      if(options.failRequest)throw new Error('Never surface this transport exception.');
      const submitted=options.rewriteRequest?.(clone(request))??request;
      active.requestDigest=offlineStudentLeaveRequestDigest(target,submitted);
      let correlationId;
      const result={statusCode:0,body:null,setHeader(name,value){if(name==='X-Assistant-Request-Id')correlationId=value;},
        status(code){this.statusCode=code;return this;},json(body){this.body=body;}};
      const sent=options.wrongOwner?'B':'A';
      await handler({method:'POST',headers:{authorization:'Bearer OFFLINE_'+sent},body:submitted},result);
      const {statusCode,body}=result;
      active.correlationId=correlationId;active.responseDigest=leaveFixtureDigest({statusCode,body});
      const reply={statusCode,body,correlationId:options.repeatCorrelation&&priorCorrelation?priorCorrelation:correlationId};
      priorCorrelation=correlationId;
      options.afterExecution?.({stored,reply});
      return reply;
    },
  });
  return {adapter,calls,owners,rows:()=>clone(stored)};
}

for(const [kind,total] of [['leave_state_available',18],['boundary_setup_available',14]]){
  test('binds and independently verifies every '+kind+' case offline',async()=>{
    const {adapter,calls,owners,rows}=harness();
    const cases=families(kind);
    assert.equal(cases.length,total);
    for(const [index,entry] of cases.entries()){
      const item=templates.find(row=>row.id===entry.caseId);
      const proof=await adapter.runCase(item).catch(error=>{throw new Error(entry.caseId+': '+JSON.stringify(calls.events.at(-1)?.effects),{cause:error});});
      assert.equal(proof.caseId,entry.caseId);
      assert.equal(proof.observationVerified,true);
      assert.equal(proof.answerBehaviorEvaluated,false);
      assert.equal(proof.liveAcceptance,false);
      assert.equal(proof.observedReadAttempts,kind==='leave_state_available'?1:0);
      assert.equal(proof.observedDataRequests,kind==='leave_state_available'?(item.nativeLeaveContract.selectedFields.includes('reviewStatus')?2:1):0);
      assert.equal(calls.events[index].callerId,owners.A);
      assert.doesNotMatch(JSON.stringify(proof),forbidden);
      assert.throws(()=>assertNativeStudentLeaveCaseReady(item),{code:'student_leave_fixture_and_observation_unmounted'});
    }
    assert.equal(new Set(calls.events.map(item=>item.correlationId)).size,total);
    assert.equal(new Set(calls.events.map(item=>item.scope.caseNonce)).size,total);
    assert.equal(calls.probe,16*total);
    assert.equal((await adapter.cleanup()).cleaned,true);
    assert.deepEqual(rows(),empty());
  });
}

test('a second scoped read attempt must independently repeat the exact query and projection',async()=>{
  const {adapter,calls}=harness({retry:true});
  const proof=await adapter.runCase(caseFor('exact-edit'));
  assert.equal(proof.observedReadAttempts,2);
  assert.equal(proof.observedDataRequests,4);
  assert.deepEqual(calls.events[0].attempts[0],calls.events[0].attempts[1]);
  await adapter.cleanup();
});

test('all 19 unresolved cases and modified eligible definitions fail before mutation or request',async()=>{
  const {adapter,calls}=harness();
  const rejected=studentLeaveFixtureManifest.cases.filter(row=>!['leave_state_available','boundary_setup_available'].includes(row.availability));
  assert.equal(rejected.length,19);
  for(const row of rejected)await assert.rejects(adapter.runCase(templates.find(item=>item.id===row.caseId)??{id:row.caseId}),{code:'case_unavailable'});
  const exact=caseFor('exact-edit');
  await assert.rejects(adapter.runCase({...exact,expected:{...exact.expected,requiredLinks:[]}}),{code:'invalid_case_definition'});
  assert.deepEqual([calls.transition,calls.execute,calls.open,calls.probe],[0,0,0,0]);
  await adapter.cleanup();
});

test('case work opens only after lease, exact release and protected identity checks',async()=>{
  for(const [key,code] of [['lease','lease_unavailable'],['current','release_unavailable'],['ownerUnchanged','protected_owner_changed']]){
    const {adapter,calls}=harness({[key]:false});
    await assert.rejects(adapter.runCase(caseFor('history')),{code});
    assert.deepEqual([calls.transition,calls.execute,calls.open,calls.probe],[0,0,0,0]);
  }
});

test('wrong caller, altered ingress, response substitution and assistant-only payload cannot certify an observation',async()=>{
  const samples=[
    {wrongOwner:true},
    {rewriteRequest:request=>({...request,question:'Where can I find my leave history?'})},
    {afterExecution:({reply})=>{reply.body.answer='Substituted after transport.';}},
    {observation:receipt=>({correlationId:receipt.correlationId,answer:'verified'})},
    {observation:receipt=>({...receipt,complete:false})},
  ];
  for(const options of samples){
    const {adapter,calls,rows}=harness(options);
    await assert.rejects(adapter.runCase(caseFor('history')),{code:'observation_mismatch'});
    await assert.rejects(adapter.runCase(caseFor('history')),{code:'adapter_unavailable'});
    assert.deepEqual([calls.execute,calls.open,calls.abort],[1,1,0]);
    await adapter.cleanup();
    assert.deepEqual(rows(),empty());
  }
});

test('a closed prior capture and duplicate request correlation both fail',async()=>{
  for(const [options,code,aborts] of [
    [{observation:(actual,prior)=>prior??actual},'observation_mismatch',0],
    [{repeatCorrelation:true},'correlation_mismatch',1],
  ]){
    const {adapter,calls}=harness(options);
    await adapter.runCase(caseFor('dates'));
    await assert.rejects(adapter.runCase(caseFor('dates')),{code});
    assert.equal(calls.abort,aborts);
    await adapter.cleanup();
  }
});

test('wrong read scope, linked review substitution and unobserved retry fail even with correct transport',async()=>{
  for(const change of [
    attempt=>{attempt.reads[0].url+='&select=*';},
    attempt=>{attempt.reads[0].callerId=randomUUID();},
    attempt=>{attempt.reads[0].rowsDigest='1'.repeat(64);},
    attempt=>{attempt.reads.pop();},
    attempt=>{attempt.evidence.dtoDigest='2'.repeat(64);},
  ]){
    const {adapter}=harness({observation:receipt=>{change(receipt.attempts[0]);return receipt;}});
    await assert.rejects(adapter.runCase(caseFor('exact-edit')),{code:'read_observation_mismatch'});
    await adapter.cleanup();
  }
  for(const omit of [attempts=>{attempts[1].reads=[];},attempts=>{attempts.pop();}]){
    const {adapter}=harness({retry:true,observation:receipt=>{omit(receipt.attempts);return receipt;}});
    await assert.rejects(adapter.runCase(caseFor('exact-edit')),{code:'read_observation_mismatch'});
    await adapter.cleanup();
  }
});

test('zero reads plus explicit complete effect coverage are required for boundary cases',async()=>{
  for(const key of ['snapshotLoads','companionReads','publicResearch','externalActions','databaseWrites','providerCalls','answerPipelineEntries']){
    const {adapter}=harness({observation:receipt=>({...receipt,effects:{...receipt.effects,[key]:1}})});
    await assert.rejects(adapter.runCase(caseFor('write')),{code:'unexpected_effect'});
    await adapter.cleanup();
  }
  const {adapter}=harness({observation:receipt=>({...receipt,attempts:[{reads:[],evidence:null}]})});
  await assert.rejects(adapter.runCase(caseFor('explicit-foreign')),{code:'read_observation_mismatch'});
  await adapter.cleanup();
});

test('failed transport aborts capture, and postflight row drift blocks acceptance and unsafe cleanup',async()=>{
  const failed=harness({failRequest:true});
  await assert.rejects(failed.adapter.runCase(caseFor('history')),{code:'request_failed'});
  assert.equal(failed.calls.abort,1);
  await failed.adapter.cleanup();
  const drift=harness({afterExecution:({stored})=>{stored[forms][0].contact_phone='edited outside fixture';}});
  await assert.rejects(drift.adapter.runCase(caseFor('history')),{code:'row_state_mismatch'});
  await assert.rejects(drift.adapter.cleanup(),{code:'row_state_mismatch'});
  assert.equal(drift.calls.cleanup,0);
  assert.ok(drift.rows()[forms].some(row=>row.contact_phone==='edited outside fixture'));
});
