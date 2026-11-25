import assert from 'node:assert/strict';
import {chmod,mkdtemp,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {readStudentLeaveEvidence} from '../../server/accountStudentLeaveEvidence.js';
import {studentLeaveLookupContext} from '../../server/studentLeaveEvidenceIntent.js';
import {studentLeaveRunnerCases} from './student-leave-runner.mjs';
import {
  buildStudentLeaveFixturePlan,bindStudentLeaveFixtureCase,studentLeaveFixtureManifest,studentLeaveFixtureReadContracts,
  studentLeaveFixtureProbeContracts,leaveFixtureTables,
} from './student-leave-fixture-plan.mjs';
import {createStudentLeaveFixtureLifecycle,studentLeaveJournalBinding} from './student-leave-fixture-lifecycle.mjs';
import {openStudentLeaveFixtureJournal} from './student-leave-fixture-journal.mjs';

const {forms,reviews,audit}=leaveFixtureTables;
const empty=()=>({[forms]:[],[reviews]:[],[audit]:[]});
const clone=value=>structuredClone(value);
const binding={
  runId:'31900000-0000-4000-8000-000000000001',
  owners:{
    A:{id:'31900000-0000-4000-8000-000000000002',email:'leave-a@example.invalid',runMarker:'31900000-0000-4000-8000-000000000001'},
    B:{id:'31900000-0000-4000-8000-000000000003',email:'leave-b@example.invalid',runMarker:'31900000-0000-4000-8000-000000000001'},
  },
  projectRef:'xiftudmvxphxcjtmfmib',origin:'https://stdedu-leave-evaluation-v1-d286.vercel.app',
  sourceRevision:'a'.repeat(40),suiteHash:'b'.repeat(64),
};
const selected=(family,b=binding)=>buildStudentLeaveFixturePlan({binding:b,family});
const caseFor=id=>studentLeaveRunnerCases().find(row=>row.id==='account:student-leave-native-'+id);
const def=()=>({code:'row_state_mismatch'});
const where=(contracts,rows)=>{
  const result=empty();
  for(const {table,columns,anyOf} of contracts){
    result[table]=rows[table].filter(row=>anyOf.some(term=>term.values.includes(row[term.column])))
      .map(row=>Object.fromEntries(columns.map(key=>[key,row[key]])));
  }
  return result;
};
const sorted=rows=>[...rows].sort((left,right)=>left.id.localeCompare(right.id));

async function harness(t){
  const directory=await mkdtemp(join(tmpdir(),'stu-leave-durable-fixture-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const journalBinding=studentLeaveJournalBinding(binding);
  const open=()=>openStudentLeaveFixtureJournal({directory,binding:journalBinding});
  let stored=empty();
  const option={lease:true,release:true,ownerUnchanged:true,google:true,wrongProbe:false,commitUncertain:false,injectBeforeTransaction:null,unexpectedDelete:false};
  const events=[];
  async function build(){
    const local=await open();
    const lifecycle=createStudentLeaveFixtureLifecycle({binding,dependencies:{
      assertLease:async given=>{assert.deepEqual(given,journalBinding);return option.lease;},
      assertCurrentRelease:async given=>{assert.deepEqual(given,journalBinding);events.push('assert-release');return option.release;},
      assertProtectedOwner:async()=>option.ownerUnchanged,
      readIdentities:async()=>Object.values(binding.owners).map(row=>({...row,role:'student',googleIdentity:option.google})),
      readRows:async({contracts})=>where(contracts,stored),
      readProbe:async request=>{
        assert.equal(request.method,'GET');
        assert.equal(request.prefer,'count=exact');
        assert.equal(Object.hasOwn(request,'expected'),false);
        assert.equal(request.query.user_id,'eq.'+request.targetId);
        assert.equal(request.sourceRevision,binding.sourceRevision);
        assert.equal(request.callerId,binding.owners[request.caller].id);
        events.push(['probe',request.caller,request.target,request.table]);
        const result=sorted(stored[request.table].filter(row=>row.user_id===request.targetId
          &&(row.user_id===request.callerId||option.wrongProbe==='leak')))
          .map(row=>Object.fromEntries(request.query.select.split(',').map(key=>[key,row[key]])));
        return {callerId:option.wrongProbe==='owner'?binding.owners.B.id:request.callerId,statusCode:200,
          contentRange:result.length?'0-'+(result.length-1)+'/'+result.length:'*/0',rows:result};
      },
      transaction:async({operation},work)=>{
        events.push(['transaction',operation]);
        option.injectBeforeTransaction?.(stored,operation);
        const previous=clone(stored),working=clone(stored);
        const match=(left,right)=>left.id===right.id&&left.user_id===right.user_id&&JSON.stringify(left)===JSON.stringify(right);
        try{
          await work({
            readRows:async({contracts})=>where(contracts,working),
            insertExactRows:async({table,rows})=>{
              assert.equal((await local.read()).phase,'mutation-intent');
              assert.ok([forms,reviews].includes(table));
              assert.ok(rows.every(row=>Object.values(binding.owners).some(owner=>owner.id===row.user_id)));
              assert.ok(rows.every(row=>working[table].every(existing=>existing.id!==row.id)));
              if(table===forms)assert.ok(rows.every(row=>!row.review_request_id||working[reviews].some(request=>request.id===row.review_request_id&&request.user_id===row.user_id)));
              events.push(['insert',table,rows.map(row=>row.id)]);
              working[table].push(...clone(rows));return clone(rows);
            },
            deleteExactRows:async({table,rows})=>{
              assert.ok(['mutation-intent','cleanup-intent'].includes((await local.read()).phase));
              assert.ok([forms,reviews].includes(table));
              assert.ok(rows.every(row=>working[table].some(actual=>match(actual,row))));
              if(table===reviews)assert.ok(rows.every(row=>!working[forms].some(form=>form.review_request_id===row.id)));
              events.push(['delete',table,rows.map(row=>row.id)]);
              working[table]=working[table].filter(actual=>!rows.some(row=>match(actual,row)));
              return option.unexpectedDelete?rows.slice(1):clone(rows);
            },
          });
        }catch(error){stored=previous;throw error;}
        stored=working;
        if(option.commitUncertain){option.commitUncertain=false;throw new Error('OFFLINE_LOST_COMMIT_RECEIPT');}
        return {committed:true};
      },
      journal:local,
    }});
    return {lifecycle,local};
  }
  return {build,option,events,directory,read:()=>clone(stored),modify:fn=>fn(stored)};
}

test('all 51 canonical cases have explicit distinct fixture and observation obligations',()=>{
  const {cases,mounted,liveAcceptance}=studentLeaveFixtureManifest;
  assert.equal(cases.length,51);
  assert.equal(new Set(cases.map(item=>item.caseId)).size,51);
  const by=Object.groupBy(cases,row=>row.availability);
  assert.deepEqual(Object.fromEntries(Object.entries(by).map(([key,rows])=>[key,rows.length])),{
    leave_state_available:18,request_clock_required:3,companion_fixture_required:5,boundary_setup_available:14,
    failure_injection_required:2,legacy_rebind_required:9,
  });
  assert.equal(mounted,false);assert.equal(liveAcceptance,false);
  const exact=bindStudentLeaveFixtureCase(selected('sibling'),caseFor('exact-sibling'));
  assert.match(exact.route,new RegExp(selected('sibling').rowsByHandle.A.primary+'$','u'));
  assert.match(exact.question,new RegExp(selected('sibling').rowsByHandle.A.sibling+'$','u'));
  assert.equal(exact.plannedRead.recordId,selected('sibling').rowsByHandle.A.sibling);
  assert.deepEqual(exact.expected.requiredLinks,['/school-affairs/services/leave/edit/'+exact.plannedRead.recordId]);
  assert.equal(exact.requestObservationRequired,true);
  assert.equal(exact.liveAcceptance,false);
  assert.throws(()=>bindStudentLeaveFixtureCase(selected('ordinary'),caseFor('read-unavailable')),{code:'invalid_case_binding'});
  assert.throws(()=>bindStudentLeaveFixtureCase(selected('ordinary'),caseFor('review-unavailable')),{code:'invalid_case_binding'});
  assert.throws(()=>bindStudentLeaveFixtureCase(selected('ordinary'),caseFor('companion')),{code:'invalid_case_binding'});
  assert.throws(()=>bindStudentLeaveFixtureCase(selected('ordinary'),{...caseFor('exact-edit'),question:'a changed question'}),{code:'invalid_case_definition'});
});

test('plans declare only disposable app owners, reproduce each target, and guard reserved IDs and references',()=>{
  assert.throws(()=>selected('ordinary',{...binding,origin:'https://stu.best'}),{code:'invalid_binding'});
  assert.throws(()=>selected('ordinary',{...binding,owners:{A:binding.owners.A,B:{...binding.owners.B,runMarker:'different'}}}),{code:'invalid_binding'});
  const a=selected('ordinary'),b=selected('archive'),req=studentLeaveFixtureReadContracts([a,b]);
  assert.equal(req.length,3);
  assert.ok(a.recordIds.every(id=>!b.recordIds.includes(id)));
  const rowScope=req.find(item=>item.table===forms);
  assert.deepEqual(rowScope.anyOf.map(item=>item.column),['user_id','id','review_request_id']);
  assert.deepEqual(rowScope.anyOf[2].values,[...a.rows[reviews],...b.rows[reviews]].map(row=>row.id).sort());
  assert.deepEqual(req.find(item=>item.table===audit).anyOf[1].values,[...a.recordIds,...b.recordIds].sort());
  for(const plan of [a,b,selected('category-count')]){
    const contracts=studentLeaveFixtureProbeContracts(plan);
    assert.equal(contracts.length,8);
    for(const contract of contracts.filter(row=>row.caller!==row.target)){
      assert.equal(contract.query.user_id,'eq.'+contract.targetId);
      assert.notEqual(contract.callerId,contract.targetId);
      assert.match(contract.query.id,/^in\./u);
      assert.deepEqual(contract.expected.rows,[]);
    }
    assert.ok(contracts.filter(row=>row.caller===row.target).every(row=>row.expected.rows.length>0));
  }
});

test('each data-bindable case reaches the real selector and reader with exact synthetic rows',async()=>{
  const dateFields={dates:['startsOn','endsOn'],status:['status'],category:['category'],periods:['periods'],reviewStatus:['reviewStatus','reviewState']};
  const expectedValues={
    ordinary:{startsOn:'2026-11-09',endsOn:'2026-11-10',status:'filed',category:'personal',periods:'週一08:10、週二09:10',reviewStatus:'resolved',reviewState:'saved'},
    archive:{startsOn:'2019-07-30',endsOn:'2019-07-31',status:'draft'},
    today:{periods:'週日08:10'},sibling:{startsOn:'2026-11-11',endsOn:'2026-11-12'},'prior-date':{status:'draft'},
  };
  const dataCases=studentLeaveFixtureManifest.cases.filter(row=>['leave_state_available','request_clock_required'].includes(row.availability));
  assert.equal(dataCases.length,21);
  for(const entry of dataCases){
    const template=caseFor(entry.caseId.slice('account:student-leave-native-'.length));
    const plan=selected(entry.family),bound=bindStudentLeaveFixtureCase(plan,template);
    const lookup=studentLeaveLookupContext(bound.question,bound.route,bound.history,Date.parse(template.nativeLeaveContract.referenceClock));
    assert.equal(lookup.selection?.reason,null,template.id);
    const account={user:{id:binding.owners.A.id},url:'https://'+binding.projectRef+'.supabase.co',token:'OFFLINE_A',key:'OFFLINE_KEY'};
    const result=await readStudentLeaveEvidence(account,{selection:lookup.selection},{fetchImpl:async(url,init)=>{
      assert.equal(init.headers.Authorization,'Bearer OFFLINE_A');
      const target=url.searchParams,table=url.pathname.split('/').at(-1);
      assert.equal(target.get('user_id'),'eq.'+binding.owners.A.id);
      let rows=plan.rows[table].filter(row=>row.user_id===binding.owners.A.id);
      const id=target.get('id');
      if(id?.startsWith('eq.'))rows=rows.filter(row=>row.id===id.slice(3));
      if(id?.startsWith('in.('))rows=rows.filter(row=>id.slice(4,-1).split(',').includes(row.id));
      const and=target.get('and')??'';
      if(and.includes('starts_on.lt.2019-08-01'))rows=rows.filter(row=>row.starts_on<'2019-08-01');
      const first=/ends_on\.gte\.(\d{4}-\d\d-\d\d)/u.exec(and)?.[1],last=/starts_on\.lte\.(\d{4}-\d\d-\d\d)/u.exec(and)?.[1];
      if(first&&last)rows=rows.filter(row=>row.starts_on<=last&&row.ends_on>=first);
      if(and.includes('leave_category.in.(sick)'))rows=rows.filter(row=>row.leave_category==='sick');
      if(and.includes('status.in.(draft)'))rows=rows.filter(row=>row.status==='draft');
      if(table===forms)rows.sort((a,b)=>b.starts_on.localeCompare(a.starts_on)||a.id.localeCompare(b.id));
      const count=rows.length,limit=Number(target.get('limit'));
      const projected=rows.slice(0,limit).map(row=>Object.fromEntries(target.get('select').split(',').map(key=>[key,row[key]])));
      return Response.json(projected,{status:count>limit?206:200,
        headers:{'content-range':count?'0-'+(projected.length-1)+'/'+count:'*/0'}});
    }});
    assert.equal(result.readState,bound.plannedRead.expectedReadState,template.id);
    const payload=JSON.parse(result.evidence.content);
    assert.doesNotMatch(result.evidence.content,/STUDENT_PRIVATE_REASON|FOREIGN PRIVATE SENTINEL|000-000-0000/u);
    if(lookup.selection.countOnly){
      assert.equal(payload.counts.matching,entry.family==='month-count'?17:3,template.id);
      assert.deepEqual(payload.records,[]);
    }else if(result.readState==='empty')assert.equal(payload.counts.matching,0);
    else{
      const fields=bound.plannedRead.selectedFields.flatMap(field=>dateFields[field]);
      const expected=Object.fromEntries(fields.map(key=>[key,expectedValues[entry.family][key]]));
      assert.deepEqual(payload.records,[expected],template.id);
    }
  }
});

test('all 14 boundary and navigation cases exercise the actual authenticated handler without records or model calls',async()=>{
  const cases=studentLeaveFixtureManifest.cases.filter(row=>row.availability==='boundary_setup_available');
  assert.equal(cases.length,14);
  const priorFetch=globalThis.fetch;
  const calls=[];
  const unexpected=async()=>{calls.push('unexpected');throw new Error('No private reader or model should run.');};
  globalThis.fetch=unexpected;
  try{
    for(const entry of cases){
      const template=caseFor(entry.caseId.slice('account:student-leave-native-'.length));
      const bound=bindStudentLeaveFixtureCase(selected(entry.family),template);
      // Independent rate windows make this an endpoint behavior check, not a
      // test of account/request throttling.
      const handler=createAffairsAssistantHandler({verifyToken:async()=>({
        user:{id:binding.owners.A.id},url:'https://'+binding.projectRef+'.supabase.co',token:'OFFLINE_A',key:'OFFLINE_KEY',
      }),loadSnapshot:unexpected});
      const result={statusCode:0,body:null,setHeader(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;}};
      await handler({method:'POST',headers:{authorization:'Bearer OFFLINE_A'},body:{
        question:bound.question,route:bound.route,history:bound.history,
      }},result);
      assert.equal(result.statusCode,200,template.id);
      assert.equal(result.body.status,{denial:'handoff',clarify:'clarification',navigation:'answered'}[template.expected.behavior],template.id);
      assert.equal(result.body.proposedAction,undefined,template.id);
      assert.doesNotMatch(result.body.answer,/FOREIGN PRIVATE SENTINEL|STUDENT_PRIVATE_REASON|OFFLINE_A/u);
      for(const url of bound.expected.requiredLinks)assert.ok(result.body.citations.some(citation=>citation.url===url),template.id+' '+url);
    }
  }finally{globalThis.fetch=priorFetch;}
  assert.deepEqual(calls,[]);
});

test('durably seeds, probes, replaces and cleans only exact owned rows',async t=>{
  const h=await harness(t),{lifecycle,local}=await h.build();
  const plan=selected('ordinary');
  const first=await lifecycle.transition(plan);
  assert.equal(first.ownerAndCrossedReads,8);
  assert.equal(first.liveAcceptance,false);
  assert.equal((await local.read()).phase,'ready');
  assert.deepEqual(h.read(),plan.rows);
  assert.equal((await lifecycle.verifyUnchanged()).rowDigest,first.rowDigest);
  await lifecycle.transition(selected('archive'));
  assert.equal((await local.read()).sequence,6);
  assert.deepEqual(h.read(),selected('archive').rows);
  const clean=await lifecycle.cleanup();
  assert.equal(clean.cleaned,true);assert.equal(clean.liveAcceptance,false);
  assert.deepEqual(h.read(),empty());
  assert.equal((await local.read()).phase,'cleaned');
  const removal=h.events.filter(value=>value[0]==='delete');
  assert.deepEqual(removal.map(value=>value[1]),[forms,reviews,forms,reviews]);
  for(const name of await readdir(h.directory)){
    const text=await readFile(join(h.directory,name),'utf8');
    assert.doesNotMatch(text,/example\.invalid|STUDENT_PRIVATE_REASON|access_token|refresh_token/u);
  }
});

test('uncertain commit reopens only for cleanup, even when Preview becomes unavailable',async t=>{
  const h=await harness(t),first=await h.build(),plan=selected('ordinary');
  h.option.commitUncertain=true;
  await assert.rejects(first.lifecycle.transition(plan),{code:'transaction_uncertain'});
  assert.deepEqual(h.read(),plan.rows);
  assert.equal((await first.local.read()).phase,'mutation-intent');
  h.option.release=false;
  const restarted=await h.build();
  await assert.rejects(restarted.lifecycle.transition(plan),{code:'release_unavailable'});
  const later=await h.build();
  await later.lifecycle.reopenForCleanup();
  assert.equal(later.lifecycle.status().phase,'recovery-required');
  await assert.rejects(later.lifecycle.transition(selected('archive')),{code:'recovery_required'});
  assert.equal((await later.lifecycle.cleanup()).cleaned,true);
  assert.deepEqual(h.read(),empty());
});

test('an inserted lookalike before the transaction compare is never adopted or cleaned',async t=>{
  const h=await harness(t),first=await h.build(),plan=selected('ordinary');
  h.option.injectBeforeTransaction=(stored,operation)=>{
    if(operation==='transition')for(const table of [forms,reviews])stored[table].push(...clone(plan.rows[table]));
  };
  await assert.rejects(first.lifecycle.transition(plan),def());
  assert.equal((await first.local.read()).phase,'transition-intent');
  const recovery=await h.build();
  await recovery.lifecycle.reopenForCleanup();
  await assert.rejects(recovery.lifecycle.cleanup(),def());
  assert.deepEqual(h.read(),plan.rows);
  assert.equal(h.events.some(item=>item[0]==='delete'),false);
});

test('an unexpected foreign form sharing the linked review blocks cleanup before deletion',async t=>{
  const h=await harness(t),{lifecycle,local}=await h.build(),plan=selected('ordinary');
  await lifecycle.transition(plan);
  const linked=plan.rows[forms].find(row=>row.user_id===binding.owners.A.id);
  h.modify(stored=>stored[forms].push({...clone(linked),id:'31900000-0000-4000-8000-000000000009',user_id:'31900000-0000-4000-8000-000000000010'}));
  await assert.rejects(lifecycle.cleanup(),def());
  assert.equal(h.events.some(item=>item[0]==='delete'),false);
  assert.equal((await local.read()).phase,'ready');
  assert.equal(h.read()[forms].length,3);
});

test('exact reviewed state and every row cell are required at CAS cleanup',async t=>{
  const h=await harness(t),{lifecycle}=await h.build(),plan=selected('ordinary');
  await lifecycle.transition(plan);
  h.modify(stored=>{stored[reviews][0].status='in_review';});
  await assert.rejects(lifecycle.cleanup(),def());
  assert.equal(h.events.some(item=>item[0]==='delete'),false);
  h.modify(stored=>Object.assign(stored,clone(plan.rows)));
  h.option.unexpectedDelete=true;
  await assert.rejects(lifecycle.cleanup(),{code:'mutation_readback_mismatch'});
  assert.deepEqual(h.read(),plan.rows);
  h.option.unexpectedDelete=false;
  await lifecycle.cleanup();
  assert.deepEqual(h.read(),empty());
});

test('lease, preview pin, protected-owner and Google identity gates precede lifecycle writes',async t=>{
  for(const [key,code] of [['lease','lease_unavailable'],['release','release_unavailable'],
    ['ownerUnchanged','protected_owner_changed'],['google','identity_mismatch']]){
    const h=await harness(t),{lifecycle,local}=await h.build();
    h.option[key]=false;
    await assert.rejects(lifecycle.transition(selected('ordinary')),{code});
    assert.equal(await local.read(),null);
    assert.deepEqual(h.read(),empty());
    assert.equal(h.events.some(item=>item[0]==='transaction'),false);
  }
});

test('foreign exposure or wrong caller prevents read verification and retains exact recoverable rows',async t=>{
  for(const mode of ['leak','owner']){
    const h=await harness(t),{lifecycle,local}=await h.build(),plan=selected('ordinary');
    h.option.wrongProbe=mode;
    await assert.rejects(lifecycle.transition(plan),{code:'native_readback_mismatch'});
    assert.equal((await local.read()).phase,'mutation-intent');
    assert.deepEqual(h.read(),plan.rows);
    assert.equal((await lifecycle.cleanup()).cleaned,true);
    assert.deepEqual(h.read(),empty());
  }
});

test('bad journal permissions or state bytes block recovery without deleting records',async t=>{
  const h=await harness(t),{lifecycle,local}=await h.build();
  await lifecycle.transition(selected('ordinary'));
  const path=join(h.directory,(await readdir(h.directory)).at(-1));
  await chmod(path,0o644);
  await assert.rejects(local.read(),{code:'unsafe_journal'});
  await chmod(path,0o600);
  const parsed=JSON.parse(await readFile(path,'utf8'));
  await writeFile(path,JSON.stringify({...parsed,previousDigest:'0'.repeat(64)})+'\n');
  await assert.rejects(local.read(),{code:'journal_drift'});
  await assert.rejects(lifecycle.cleanup(),{code:'journal_drift'});
  assert.equal(h.read()[forms].length,2);
});

test('exclusive journal CAS and a busy lifecycle refuse overlapping writers',async t=>{
  const h=await harness(t),first=await h.build(),plan=selected('ordinary');
  const active=first.lifecycle.transition(plan);
  await assert.rejects(first.lifecycle.transition(plan),{code:'busy'});
  await active;
  const second=await h.build();
  await assert.rejects(second.lifecycle.transition(selected('archive')),{code:'journal_drift'});
  const head=await first.local.read();
  assert.equal(head.phase,'ready');
  await first.lifecycle.cleanup();
  assert.deepEqual(h.read(),empty());
});
