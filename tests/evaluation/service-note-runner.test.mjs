import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildServiceNoteCases,serviceNoteCaseManifest} from './service-note-cases.mjs';
import {buildServiceNotePlan,observeServiceNoteRows,readCallerServiceNotes} from './service-note-live-fixture.mjs';
import {gradeLiveServiceNoteCase,serviceNoteRunnerCases,serviceNoteRunnerOracle,serviceNoteSetupRequired,serviceNoteSetupSummary} from './service-note-runner.mjs';
import {evaluationSuite} from './run.mjs';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';

const prefix='account:service-notes-';
const cases=serviceNoteRunnerCases();
const bySuffix=suffix=>cases.find(item=>item.id===prefix+suffix);
const owners=['27000000-0000-4000-8000-000000000003','27000000-0000-4000-8000-000000000004'];
const runId='27000000-0000-4000-8000-000000000005';
const projectRef='xiftudmvxphxcjtmfmib';
const users=owners.map((id,index)=>({id,token:'SYNTHETIC_NOTE_JWT_'+index}));
const identities=owners.map((id,index)=>({id,state:'created',runId,email:'fixture'+index+'@example.invalid'}));
const headers={'content-type':'application/json','content-range':'*/0'};
function statusProof(row,extra={}){
  const digest='0'.repeat(64);
  return {execution:row.executionContract,fixtureKey:row.fixtureKey,statusCode:200,events:[],
    stateBefore:{ownedRecordsDigest:digest},stateAfterProposal:{ownedRecordsDigest:digest},
    fixtureReadback:{projectRef,verified:true,independentGolden:true,serviceNotes:{caseId:row.id,twoOwnersVerified:true,
      method:'caller RLS and persisted notes'}},...extra};
}

test('the main suite preserves every note question and explicitly fences off the unbound cases',async()=>{
  const standalone=buildServiceNoteCases(),summary=serviceNoteSetupSummary(cases);
  assert.equal(cases.length,80);
  assert.equal(summary.liveEligible,61);
  assert.equal(summary.unboundCaseIds.length,19);
  const suite=await evaluationSuite('2026-11-15T02:00:00.000Z');
  assert.deepEqual(suite.cases.filter(row=>row.id.startsWith(prefix)),cases);
  assert.deepEqual(cases.map(row=>[row.id,row.question]),standalone.map(row=>[row.id,row.question]));
  for(const id of summary.unboundCaseIds){
    const row=cases.find(item=>item.id===id);
    assert.equal(serviceNoteSetupRequired(row),true);
    assert.match(row.setupReason,/independent|exact|unbound|verified|read-only/u);
    assert.throws(()=>buildServiceNotePlan(row,owners),/no signed-in fixture/u);
  }
  assert.throws(()=>serviceNoteRunnerOracle({...bySuffix('35-1-own'),question:'Changed'}),/differs/u);
  assert.deepEqual(serviceNoteCaseManifest.assistantMutations,[]);
});

test('real handlers satisfy all mounted note and access cases using only the selected note reads',async()=>{
  const fetch=globalThis.fetch,now=Date.now;let reads=0,unexpectedSnapshots=0,verifiedAccounts=0,index=0,current;
  Date.now=()=>now()+index*3000;
  const unexpected=[];
  globalThis.fetch=async(input,options)=>{
    const url=new URL(input);
    try{
      assert.ok(current.toolPolicy.required.includes('serviceRecords'));
      assert.equal(url.origin,'https://'+projectRef+'.supabase.co');
      assert.equal(url.pathname,'/rest/v1/affairs_service_records');
      assert.equal(url.searchParams.get('user_id'),'eq.'+owners[0]);
      assert.equal(url.searchParams.get('record_type'),'eq.note');
      assert.equal(new Headers(options.headers).get('authorization'),'Bearer '+users[0].token);
      assert.equal(url.searchParams.get('service_key'),current.serviceIds.length===1
        ?'eq.'+current.serviceIds[0]:'in.('+current.serviceIds.join(',')+')');
      const rows=buildServiceNotePlan(current,owners).rows.filter(row=>row.user_id===owners[0]&&current.serviceIds.includes(row.service_key));
      reads++;
      return Response.json(rows,{headers:{...headers,'content-range':rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0'}});
    }catch(error){unexpected.push(error);throw error;}
  };
  const research=createResearchAssistantHandler(),handler=createAffairsAssistantHandler({
    verifyToken:async token=>{
      verifiedAccounts++;assert.equal(token,users[0].token);
      return {url:'https://'+projectRef+'.supabase.co',user:{id:owners[0]},key:'SYNTHETIC_KEY',token};
    },
    loadSnapshot:async()=>{unexpectedSnapshots++;throw new Error('Native note boundary read a snapshot.');},
    publicResearch:async()=>{throw new Error('Native note boundary requested public research.');},
  });
  try{
    const native=cases.filter(row=>row.executionContract==='live-native');
    assert.equal(native.length,61);
    for(const row of native){
      current=row;
      const guest=row.auth==='anonymous';
      const before=reads;
      const response={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;}};
      await (guest?research:handler)({method:'POST',
        headers:{...(guest?{}:{authorization:'Bearer '+users[0].token}),'x-forwarded-for':'192.0.2.'+(++index)},
        body:{question:row.question,route:row.route,history:row.history??[]}},response);
      const envelope=statusProof(row,{body:response.body,statusCode:response.code,...(guest?{fixtureReadback:undefined,stateBefore:undefined,stateAfterProposal:undefined}:{})});
      const result=gradeLiveServiceNoteCase(row,envelope);
      assert.deepEqual(unexpected,[]);
      assert.deepEqual(result.failures,[],row.id+' '+JSON.stringify(result.failures));
      assert.equal(reads-before,row.toolPolicy.required.includes('serviceRecords')?1:0,row.id);
      if(!guest){
        assert.ok(gradeLiveServiceNoteCase(row,{...envelope,fixtureReadback:undefined}).failures.some(check=>check.id==='notes.pairedFixture'));
        const corrupted=structuredClone(envelope);corrupted.body.answer+=' FOREIGN SERVICE NOTE 35-1';
        assert.ok(gradeLiveServiceNoteCase(row,corrupted).failures.some(check=>check.id==='notes.noForeignOrExcluded'));
      }
    }
    assert.equal(verifiedAccounts,60);assert.equal(unexpectedSnapshots,0);
  }finally{globalThis.fetch=fetch;Date.now=now;}
});

test('a readback uses only the exact project, two caller tokens, and never accepts truncated or redirected replies',async()=>{
  const row=bySuffix('35-1-own'),plan=buildServiceNotePlan(row,owners);
  const values=plan.rows.filter(item=>item.user_id===owners[0]);
  await assert.doesNotReject(()=>readCallerServiceNotes(users[0],owners[0],{publishable:'SYNTHETIC_KEY',fetchImpl:async(url,options)=>{
    assert.equal(url.origin,'https://'+projectRef+'.supabase.co');
    assert.equal(url.pathname,'/rest/v1/affairs_service_records');
    assert.equal(url.searchParams.get('user_id'),'eq.'+owners[0]);assert.equal(url.searchParams.get('limit'),'16');
    assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
    assert.equal(options.headers.Authorization,'Bearer '+users[0].token);
    return Response.json(values,{headers:{...headers,'content-range':'0-6/7'}});
  }}).then(rows=>assert.deepEqual(rows,values)));
  for(const response of [Response.json(values,{headers:{...headers,'content-range':'0-6/8'}}),Response.redirect('https://synthetic.invalid'),Response.json([plan.rows.find(item=>item.user_id===owners[1])],{headers:{...headers,'content-range':'0-0/1'}})]){
    await assert.rejects(()=>readCallerServiceNotes(users[0],owners[0],{publishable:'SYNTHETIC_KEY',fetchImpl:async()=>response}),/owner-bound|readback failed/u);
  }
});

test('all four A/B readback paths cross-check both positive ownership and zero foreign rows against SQL',async()=>{
  const row=bySuffix('35-1-empty'),plan=buildServiceNotePlan(row,owners);
  const call=(parts)=>parts.join(' ');
  const sql=async(parts)=>{
    if(!Array.isArray(parts.raw))return undefined;
    const query=call(parts);
    if(query.includes('pg_locks'))return [{held:true}];
    if(query.includes('auth.users'))return identities.map(({id,email})=>({id,email,run_id:runId}));
    assert.match(query,/public.affairs_service_records/u);
    return plan.rows.map(item=>({...item,starts_on:null,ends_on:null,leave_category:null,periods:null,review_request_id:null,contact_phone:null,leave_time_period:null}));
  };
  const calls=[];
  const read=async(user,target)=>{
    calls.push([user.id,target]);
    return user.id===target?plan.rows.filter(row=>row.user_id===target):[];
  };
  const options={sql,plan,identities,runId,users,read,publishable:'SYNTHETIC_KEY'};
  assert.match(await observeServiceNoteRows(options),/^[0-9a-f]{64}$/u);
  assert.deepEqual(calls.toSorted(),[...owners.flatMap(caller=>owners.map(target=>[caller,target]))].toSorted());
  assert.ok(plan.rows.every(row=>!(row.user_id===owners[0]&&row.service_key==='35-1')));
  assert.ok(plan.rows.some(row=>row.user_id===owners[1]&&row.service_key==='35-1'));
  await assert.rejects(()=>observeServiceNoteRows({...options,read:async(user,target)=>user.id===target?read(user,target):[plan.rows[0]]}),/foreign-row denial/u);
  await assert.rejects(()=>observeServiceNoteRows({...options,users:[users[0],users[0]]}),/exact disposable caller/u);
  await assert.rejects(()=>observeServiceNoteRows({...options,identities:identities.map(item=>({...item,runId:owners[0]}))}),/match the current run/u);
});
