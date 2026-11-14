import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildCounselingAppointmentCases,buildPlannedCounselingAppointmentCases,counselingAppointmentCaseManifest,counselingAppointmentFixtureForCase,gradeCounselingAppointmentCase} from './counseling-appointment-cases.mjs';
import {readCounseling} from '../../server/counseling.js';
import {readCounselingEvidence} from '../../server/accountCounselingEvidence.js';
import {selectCounselingEvidence} from '../../server/counselingEvidenceIntent.js';
import {formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';

const cases=buildCounselingAppointmentCases(),manifest=counselingAppointmentCaseManifest,path=manifest.route;
const find=suffix=>cases.find(row=>row.id==='account:counseling-appointments-'+suffix),copy=value=>structuredClone(value);
function independentObservation(testCase){
  const fixture=counselingAppointmentFixtureForCase(testCase),n=testCase.nativeExpectation;
  return {readCalls:n.calls,queries:n.calls?[{scope:'counseling-appointments',view:'mine'}]:[],storageRequests:[],writeRequests:[],
    result:n.selected===false?null:{readState:n.readState,reason:n.reason,evidence:{id:'account:counselingAppointments',url:path,content:JSON.stringify({
      collection:'counselingAppointments',counts:{returned:n.returned,included:n.included,total:n.total,totalLowerBound:n.totalLowerBound,truncationPossible:n.truncationPossible},
      records:n.readState==='unavailable'?[]:fixture.rows.map(row=>({kind:row.kind,status:row.status,preferredOn:row.preferred_on,preferredPeriod:row.preferred_period,scheduledAt:row.scheduled_at})),
    })}}};
}
function response(testCase,answer){return {statusCode:testCase.expected.expectedStatusCode??200,execution:'deterministic',fixtureKey:testCase.fixtureKey,
  events:testCase.toolPolicy.required.map(tool=>({kind:'account-read:'+tool+':1',status:testCase.toolPolicy.failed.includes(tool)?'unavailable':'complete'})),
  body:{status:testCase.expected.behavior==='denial'?'handoff':'answered',answer,citations:testCase.expected.requiredSourceBindings.map(({sourceId,url})=>({chunkId:sourceId,url})),verification:{status:'verified',attempts:1}}};}
const record=row=>`- Preferred date: ${row.preferred_on}\n  - Kind: ${row.kind}\n  - Status: ${row.status}\n  - Preferred period: ${row.preferred_period}\n  - Scheduled time: ${row.scheduled_at??'not scheduled'}`;
function historyAnswer(testCase){return 'These are saved local counseling appointment metadata.\n'+counselingAppointmentFixtureForCase(testCase).rows.map(record).join('\n')+`\n[Open private appointments](${path})`;}

test('28 independent counseling cases stay offline, isolated and metadata-only',()=>{
  assert.equal(cases.length,28);assert.equal(new Set(cases.map(row=>row.id)).size,28);
  assert.deepEqual(cases.map(row=>row.id).sort(),[...manifest.caseIds].sort());
  assert.equal(manifest.mounted,false);assert.equal(manifest.liveAcceptance,false);
  assert.ok(cases.every(row=>row.fixtureRequirement==='offline_counseling_metadata'&&!Object.hasOwn(row.expected,'requiredTools')));
  assert.equal(manifest.view,'mine');assert.equal(manifest.nativeLimit,50);
  for(const row of cases){const f=counselingAppointmentFixtureForCase(row);
    assert.ok(f.rows.filter(item=>['requested','scheduled'].includes(item.status)).length<=1);
    assert.ok(f.rows.every(item=>Object.keys(item).sort().join(',')==='id,kind,preferred_on,preferred_period,scheduled_at,status,updated_at,version'));
  }
});

test('21 planned cases declare exact tool outcomes and dependencies while seven fixture-uncontrollable cases stay offline',()=>{
  const planned=buildPlannedCounselingAppointmentCases();assert.equal(planned.length,21);
  assert.deepEqual(planned.map(row=>row.id).sort(),[...manifest.eligibleCaseIds].sort());
  assert.deepEqual(cases.filter(row=>!manifest.eligibleCaseIds.includes(row.id)).map(row=>row.id).sort(),[...manifest.offlineOnlyCaseIds].sort());
  for(const row of planned){
    const original=cases.find(item=>item.id===row.id),policy=original.toolPolicy;
    assert.equal(row.fixtureRequirement,'native_counseling_appointments_planned');assert.equal(row.plannedFixture.mounted,false);assert.equal(row.capability.gap,true);
    assert.deepEqual(row.expected.requiredAttemptedTools,policy.required);assert.deepEqual(row.expected.allowedTools,policy.allowed);
    assert.deepEqual(row.expected.requiredTools,policy.required.filter(tool=>!policy.failed.includes(tool)));
    assert.deepEqual(row.expected.toolTerminalStates,Object.fromEntries(policy.required.map(tool=>[tool,[policy.failed.includes(tool)?'unavailable':'complete']])));
    assert.equal(row.expected.requireUnchangedOwnedRecords,true);assert.equal(row.plannedFixture.requiresNoStorageProof,true);
    assert.equal(row.plannedFixture.expectedNativeReadCalls,original.nativeExpectation.calls);
    assert.deepEqual(row.plannedFixture.requiresAdditionalFixtures,policy.allowed.includes('charges')?['charges']:[]);
  }
  assert.equal(planned.filter(row=>row.plannedFixture.requiresAdditionalFixtures.includes('charges')).length,3);
  assert.equal(planned.find(row=>row.id.endsWith('-anonymous')).fixtureKey,'anonymous');
  assert.ok(!planned.some(row=>row.id.endsWith('-service-unavailable')),'Global coordinator availability is not controlled by an own-row fixture.');
  const action=planned.find(row=>row.id.endsWith('-write-cancel'));
  assert.equal(action.plannedFixture.expectedNativeReadCalls,0);assert.equal(action.expected.noAction,true);assert.deepEqual(action.expected.requiredTools,[]);
  assert.deepEqual(action.expected.toolTerminalStates,{counselingAppointments:['unavailable']});
});

test('native mine reader posts only the own-view RPC and preserves exact raw DTO offline',async()=>{
  const original=globalThis.fetch,calls=[],testCase=find('history'),fixture=counselingAppointmentFixtureForCase(testCase);
  const dto={userId:fixture.owner,available:fixture.available,canCoordinate:fixture.canCoordinate,rows:fixture.rows};
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),method:options.method,body:JSON.parse(options.body)});return Response.json(dto);};
  try{
    const account={url:'https://offline.invalid',key:'OFFLINE',token:'OFFLINE',user:{id:fixture.owner}};
    assert.deepEqual(await readCounseling(account,{scope:'counseling-appointments',view:'mine'}),dto);
    assert.deepEqual(calls,[{url:'https://offline.invalid/rest/v1/rpc/affairs_read_counseling',method:'POST',body:{p_view:'mine'}}]);
    await assert.rejects(readCounseling(account,{scope:'counseling-appointments',view:'mine',user_id:fixture.foreignOwner}));
    assert.equal(calls.length,1);
    globalThis.fetch=async()=>Response.json({...dto,userId:fixture.foreignOwner});
    await assert.rejects(readCounseling(account,{scope:'counseling-appointments',view:'mine'}));
  }finally{globalThis.fetch=original;}
});

test('all28 independent native controls agree with the isolated evidence helper without network or Storage',async()=>{
  const original=globalThis.fetch;let unexpected=0;const mismatches=[];
  globalThis.fetch=async()=>{unexpected++;throw new Error('Network and Storage are forbidden in this packet.');};
  try{
    for(const testCase of cases){
      const fixture=counselingAppointmentFixtureForCase(testCase),observation={readCalls:0,queries:[],writeRequests:[],storageRequests:[],result:null};
      const account=testCase.fixtureKey==='anonymous'?{}:{url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE',token:'OFFLINE',user:{id:fixture.owner}};
      if(selectCounselingEvidence(testCase.question,testCase.route,testCase.history||[])!==null)
        observation.result=await readCounselingEvidence(account,{question:testCase.question,route:testCase.route,history:testCase.history||[]},{read:async(caller,query)=>{
          observation.readCalls++;observation.queries.push(copy(query));assert.equal(caller.user.id,fixture.owner);
          if(fixture.error)throw Object.assign(new Error('PRIVATE PROVIDER DETAIL'),fixture.error);
          const rows=copy(fixture.rows);if(fixture.malformed)rows[0].status='unrecognized';
          return {userId:fixture.userId,available:fixture.available,canCoordinate:fixture.canCoordinate,rows};
        }});
      const grade=gradeCounselingAppointmentCase(testCase,response(testCase,''),{observation});
      const native=grade.checks.filter(item=>/^counseling\.(?:observation|noWrites|noFiles|readCalls|query|notSelected|readState|counts|records|noPrivateProjection|evidenceBinding)$/u.test(item.id));
      if(native.some(item=>!item.passed))mismatches.push({id:testCase.id,reason:observation.result?.reason??'not_selected',failures:native.filter(item=>!item.passed).map(item=>item.id)});
      const formatterExcluded=['mixed-tuition','mixed-reversed','mixed-counseling-unavailable','mixed-charges-unavailable','negative-counseling','foreign-account','anonymous'];
      if(!formatterExcluded.some(suffix=>testCase.id==='account:counseling-appointments-'+suffix)){
        const body=formatSupplementalAccountAnswers([observation.result],{question:testCase.question}),envelope=response(testCase,'');envelope.body=body;
        const semantic=gradeCounselingAppointmentCase(testCase,envelope,{observation}).failures.filter(item=>!['answer.verification','answer.behavior'].includes(item.id));
        if(semantic.length)mismatches.push({id:testCase.id,formatterFailures:semantic.map(item=>item.id)});
      }
    }
    assert.equal(unexpected,0);assert.deepEqual(mismatches,[]);
  }finally{globalThis.fetch=original;}
});

test('history facts require their own date, state and scheduled-time field',()=>{
  const testCase=find('history'),answer=historyAnswer(testCase),obs=independentObservation(testCase),good=response(testCase,answer);
  assert.equal(gradeCounselingAppointmentCase(testCase,good,{observation:obs}).passed,true);
  for(const mutate of [body=>{body.answer=body.answer.replace('Status: requested','Status: scheduled');},
    body=>{body.answer=body.answer.replace('Status: requested','Status: requested scheduled');},
    body=>{body.answer=body.answer.replace('Scheduled time: not scheduled','Scheduled time: 2026-11-25T09:00:00Z');},
    body=>{body.answer=body.answer.replace('2026-10-22T06:00:00Z','2026-10-22T07:00:00Z');},body=>{body.citations=[];}]){
    const changed=copy(good);mutate(changed.body);assert.equal(gradeCounselingAppointmentCase(testCase,changed,{observation:obs}).passed,false);
  }
});

test('preferred date never establishes a scheduled time and cancelled/closed times stay historical',()=>{
  for(const [suffix,note]of [['requested-date','The preferred date is a request, not confirmed.'],['cancelled-history','The cancelled appointment is historical and not upcoming.'],
    ['closed-history','The closed appointment is historical and not active.']]){
    const testCase=find(suffix),obs=independentObservation(testCase),answer=historyAnswer(testCase)+'\n'+note;
    assert.equal(gradeCounselingAppointmentCase(testCase,response(testCase,answer),{observation:obs}).passed,true,suffix);
    assert.equal(gradeCounselingAppointmentCase(testCase,response(testCase,historyAnswer(testCase)),{observation:obs}).passed,false,suffix);
  }
  const scheduled=find('scheduled-time');assert.equal(gradeCounselingAppointmentCase(scheduled,response(scheduled,historyAnswer(scheduled)),{observation:independentObservation(scheduled)}).passed,true);
});

test('coordinator availability cannot hide own history or enter projected evidence',()=>{
  const testCase=find('service-unavailable'),fixture=counselingAppointmentFixtureForCase(testCase),obs=independentObservation(testCase);
  assert.equal(fixture.available,false);assert.equal(fixture.rows.length,3);
  const envelope=response(testCase,historyAnswer(testCase));assert.equal(gradeCounselingAppointmentCase(testCase,envelope,{observation:obs}).passed,true);
  const leaked=copy(obs),payload=JSON.parse(leaked.result.evidence.content);payload.canCoordinate=false;leaked.result.evidence.content=JSON.stringify(payload);
  assert.equal(gradeCounselingAppointmentCase(testCase,envelope,{observation:leaked}).passed,false);
});

test('exactly50 native rows leave total unknown and do not prove complete history',()=>{
  const testCase=find('capped-history'),obs=independentObservation(testCase);
  const answer=`Saved local appointment lookup.\nReturned records: 50\nThe total is unknown; at least 50 saved records exist.\n[Open private appointments](${path})`;
  assert.equal(gradeCounselingAppointmentCase(testCase,response(testCase,answer),{observation:obs}).passed,true);
  const wrong=copy(obs),payload=JSON.parse(wrong.result.evidence.content);payload.counts.total=50;payload.counts.truncationPossible=false;wrong.result.evidence.content=JSON.stringify(payload);
  assert.equal(gradeCounselingAppointmentCase(testCase,response(testCase,answer),{observation:wrong}).passed,false);
  assert.equal(gradeCounselingAppointmentCase(testCase,response(testCase,answer+' Exactly 50 appointments.'),{observation:obs}).passed,false);
});

test('clinical findings, identity, report links and performed actions fail across visible fields',()=>{
  const testCase=find('history'),obs=independentObservation(testCase),base=response(testCase,historyAnswer(testCase));
  for(const mutate of [body=>{body.views=[{title:'PRIVATE COUNSELING EMAIL'}];},body=>{body.views=[{title:'Diagnosis',rows:[['Diagnosis','depression']]}];},
    body=>{body.answer+='\nI cancelled your appointment.';},body=>{body.citations[0].claim='I downloaded your report.';},
    body=>{body.download={url:'https://offline.invalid/storage/v1/object/sign/private/report.pdf?token=abc'};}]){
    const value=copy(base);mutate(value.body);assert.equal(gradeCounselingAppointmentCase(testCase,value,{observation:obs}).passed,false);
  }
});

test('observation and exact own-view execution are mandatory; queue/Storage/write calls cannot be hidden',()=>{
  const testCase=find('history'),obs=independentObservation(testCase),base=response(testCase,historyAnswer(testCase));
  assert.equal(gradeCounselingAppointmentCase(testCase,base).passed,false);
  for(const mutate of [value=>{value.readCalls=2;},value=>{value.queries[0].view='queue';},value=>{value.storageRequests.push('report');},
    value=>{value.writeRequests.push('cancel');},value=>{const p=JSON.parse(value.result.evidence.content);p.records[0].id='private-id';value.result.evidence.content=JSON.stringify(p);}]){
    const changed=copy(obs);mutate(changed);assert.equal(gradeCounselingAppointmentCase(testCase,base,{observation:changed}).passed,false);
  }
  for(const event of [{kind:'account-read:charges:1',status:'unavailable'},{kind:'account-read:counselingAppointments:9',status:'complete'},
    {kind:'public-search',status:'complete'},{kind:'file.download',status:'complete'}]){const changed=copy(base);changed.events.push(event);assert.equal(gradeCounselingAppointmentCase(testCase,changed,{observation:obs}).passed,false);}
});

test('failed reads cannot masquerade as empty and denied requests contain no native or tool reads',()=>{
  const failed=find('read-unavailable'),obs=independentObservation(failed),answer=`The appointment lookup failed. The saved history is unknown.\n[Open private appointments](${path})`;
  assert.equal(gradeCounselingAppointmentCase(failed,response(failed,answer),{observation:obs}).passed,true);
  assert.equal(gradeCounselingAppointmentCase(failed,response(failed,answer+'\nNo records exist.'),{observation:obs}).passed,false);
  const foreign=find('foreign-account'),denial=response(foreign,'I cannot show another student’s account records.');
  assert.equal(gradeCounselingAppointmentCase(foreign,denial,{observation:independentObservation(foreign)}).passed,true);
  const hidden=copy(denial);hidden.toolCalls=[{name:'counselingAppointments',status:'complete',attempt:1}];
  assert.equal(gradeCounselingAppointmentCase(foreign,hidden,{observation:independentObservation(foreign)}).passed,false);
  denial.events.push({kind:'account-read:counselingAppointments:1',status:'complete'});
  assert.equal(gradeCounselingAppointmentCase(foreign,denial,{observation:independentObservation(foreign)}).passed,false);
  const guest=find('anonymous'),guestReply=response(guest,'Authentication required.');
  assert.equal(gradeCounselingAppointmentCase(guest,guestReply,{observation:independentObservation(guest)}).passed,true);
  guestReply.statusCode=200;assert.equal(gradeCounselingAppointmentCase(guest,guestReply,{observation:independentObservation(guest)}).passed,false);
});

test('compound tuition must use a separate ledger and explicit exclusion prevents counseling reads',()=>{
  const testCase=find('mixed-tuition'),obs=independentObservation(testCase);
  const charge=`Separate sample charge ledger.\n- QA Counseling Tuition instalment\n  - Remaining: 23,000\n  - Currency: TWD\n[Payments](/school-affairs/services/39-1)`;
  const base=response(testCase,historyAnswer(testCase)+'\n'+charge);assert.equal(gradeCounselingAppointmentCase(testCase,base,{observation:obs}).passed,true);
  const wrong=copy(base);wrong.events=wrong.events.filter(event=>!event.kind.includes('charges'));
  assert.equal(gradeCounselingAppointmentCase(testCase,wrong,{observation:obs}).passed,false);
  const negative=find('negative-counseling'),reply=response(negative,charge);
  assert.equal(gradeCounselingAppointmentCase(negative,reply,{observation:independentObservation(negative)}).passed,true);
  reply.events.push({kind:'account-read:counselingAppointments:1',status:'complete'});
  assert.equal(gradeCounselingAppointmentCase(negative,reply,{observation:independentObservation(negative)}).passed,false);
});
