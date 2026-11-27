import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildServiceNoteCases,internationalServiceNoteCasePrefix,protectedServiceNoteCasePrefix,serviceNoteCaseManifest} from './service-note-cases.mjs';
import {serviceNoteCompanionPlan} from './service-note-companion-fixture.mjs';
import {sampleEnrollmentManifest} from './published-sample-enrollments.mjs';
import {buildServiceNotePlan,observeServiceNoteRows,readCallerServiceNotes} from './service-note-live-fixture.mjs';
import {gradeLiveServiceNoteCase,serviceNoteRunnerCases,serviceNoteRunnerOracle,serviceNoteSetupRequired,serviceNoteSetupSummary} from './service-note-runner.mjs';
import {evaluationSuite,readReply} from './run.mjs';
import {serviceNoteLookup,serviceNotePageNavigation} from '../../server/serviceNoteIntent.js';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {createResearchAssistantHandler} from '../../server/researchAssistantHandler.js';

const prefix='account:service-notes-';
const cases=serviceNoteRunnerCases();
const bySuffix=suffix=>cases.find(item=>item.id===prefix+suffix);
const owners=['27000000-0000-4000-8000-000000000003','27000000-0000-4000-8000-000000000004'];
const runId='27000000-0000-4000-8000-000000000005';
const projectRef='xiftudmvxphxcjtmfmib';
const users=owners.map((id,index)=>({id,token:'SYNTHETIC_NOTE_JWT_'+index,studentId:'27000000-0000-4000-8000-00000000000'+(index+6)}));
const identities=owners.map((id,index)=>({id,state:'created',runId,email:'fixture'+index+'@example.invalid'}));
const headers={'content-type':'application/json','content-range':'*/0'};
function statusProof(row,extra={}){
  const digest='0'.repeat(64);
  return {execution:row.executionContract,fixtureKey:row.fixtureKey,statusCode:200,events:[],
    stateBefore:{ownedRecordsDigest:digest},stateAfterProposal:{ownedRecordsDigest:digest},
    fixtureReadback:{projectRef,verified:true,independentGolden:true,serviceNotes:{caseId:row.id,twoOwnersVerified:true,
      method:'caller RLS and persisted notes',...(row.serviceNoteCompanion?{companion:{kind:row.serviceNoteCompanion,before:digest,after:digest,validUntil:row.publishedNextClass?.validUntil??null}}:{})}},...extra};
}

test('the main suite preserves every note question and explicitly fences off the unbound cases',async()=>{
  const standalone=buildServiceNoteCases(),summary=serviceNoteSetupSummary(cases);
  assert.equal(cases.length,110);
  assert.equal(summary.liveEligible,109);
  assert.deepEqual(summary.unboundCaseIds.map(id=>id.slice(prefix.length)),['read-unavailable']);
  const suite=await evaluationSuite('2026-11-15T02:00:00.000Z');
  assert.deepEqual(suite.cases.filter(row=>row.id.startsWith(prefix)),cases);
  assert.deepEqual(cases.map(row=>[row.id,row.question]),standalone.map(row=>[row.id,row.question]));
  const protectedPacket=cases.filter(row=>row.id.startsWith(protectedServiceNoteCasePrefix));
  assert.equal(protectedPacket.length,20);
  const internationalPacket=cases.filter(row=>row.id.startsWith(internationalServiceNoteCasePrefix));
  assert.equal(internationalPacket.length,10);
  for(const id of ['30-1','30-2','31-2','35-1','31-1','32-1']){
    const packet=[...protectedPacket,...internationalPacket].filter(row=>row.serviceBoundary.serviceId===id);
    assert.deepEqual(packet.map(row=>row.serviceBoundary.kind),['outcome','outcome','navigation','tracking','submit']);
    assert.deepEqual(packet.slice(0,2).map(row=>row.language),['en','zh-TW']);
    for(const row of packet){
      assert.equal(row.endpoint,'/api/affairs-assistant');
      assert.equal(row.executionContract,'live-native');
      assert.equal(row.expected.noAction,true);
      assert.equal(row.expected.requireUnchangedOwnedRecords,true);
      assert.equal(serviceNoteSetupRequired(row),false);
    }
  }
  for(const id of summary.unboundCaseIds){
    const row=cases.find(item=>item.id===id);
    assert.equal(serviceNoteSetupRequired(row),true);
    assert.match(row.setupReason,/independent|exact|unbound|verified|read-only/u);
    assert.throws(()=>buildServiceNotePlan(row,owners),/no signed-in fixture/u);
  }
  assert.throws(()=>serviceNoteRunnerOracle({...bySuffix('35-1-own'),question:'Changed'}),/differs/u);
  assert.deepEqual(serviceNoteCaseManifest.assistantMutations,[]);
});

function ownedEnrollmentResponses(owner,studentId){
  const id=(kind,index)=>`270${kind}0000-0000-4000-8000-${String(index).padStart(12,'0')}`;
  return sampleEnrollmentManifest.courses.flatMap((course,index)=>{
    if(course.status!=='enrolled')return [];
    const term=sampleEnrollmentManifest.terms.find(row=>row.code===course.termCode);
    const courseId=id(3,index),sectionId=id(4,index),termId=id(5,sampleEnrollmentManifest.terms.indexOf(term));
    return [{id:id(6,index),student_id:studentId,section_id:sectionId,status:course.status,source_mode:'verified',
      student:{id:studentId,user_id:owner},section:{id:sectionId,course_id:courseId,term_id:termId,weekday:course.weekday,
        starts_at:course.startsAt,ends_at:course.endsAt,room:course.room,
        course:{id:courseId,code:course.code,title:course.title},
        term:{id:termId,label:term.label,starts_on:term.startsOn,ends_on:term.endsOn}}}];
  });
}

test('a hosted next-class oracle uses the requested Taipei clock and keeps the exact questions',()=>{
  const now='2026-11-16T03:30:00.000Z';
  const cases=serviceNoteRunnerCases({now});
  for(const row of cases.filter(row=>row.serviceNoteCompanion==='courses')){
    assert.equal(row.publishedNextClass.asOf,now);
    assert.equal(row.publishedNextClass.next.code,'SAMP102');
    assert.equal(row.publishedNextClass.next.date,'2026-11-18');
    assert.throws(()=>serviceNoteRunnerOracle({...row,companionClock:'2026-11-17T03:30:00.000Z'}),/differs/u);
  }
  const outside=serviceNoteSetupSummary(serviceNoteRunnerCases({now:'2027-02-15T02:00:00.000Z'}));
  assert.equal(outside.liveEligible,107);
  assert.equal(outside.unboundCaseIds.length,3);
});

test('real handlers satisfy all mounted note and access cases using only the selected note reads',async()=>{
  const fetch=globalThis.fetch,RealDate=Date;let reads=0,unexpectedSnapshots=0,unexpectedResearch=0,verifiedAccounts=0,index=0,current;
  const now=()=>RealDate.parse(serviceNoteCaseManifest.clock)+index*3000;
  globalThis.Date=class extends RealDate{
    constructor(...args){super(...(args.length?args:[now()]));}
    static now(){return now();}
  };
  let companionCalls=[];
  const unexpected=[];
  globalThis.fetch=async(input,options)=>{
    const url=new URL(input);
    try{
      assert.equal(options.method,'GET');
      assert.equal(url.origin,'https://'+projectRef+'.supabase.co');
      assert.equal(new Headers(options.headers).get('authorization'),'Bearer '+users[0].token);
      if(url.pathname==='/rest/v1/affairs_students'){
        assert.ok(current.serviceNoteCompanion);
        assert.equal(url.searchParams.get('user_id'),'eq.'+owners[0]);
        companionCalls.push('student');
        return Response.json([{id:users[0].studentId,user_id:owners[0]}]);
      }
      if(url.pathname==='/rest/v1/affairs_enrollments'){
        assert.equal(current.serviceNoteCompanion,'courses');
        assert.equal(url.searchParams.get('student_id'),'eq.'+users[0].studentId);
        assert.equal(url.searchParams.get('status'),'eq.enrolled');
        companionCalls.push('courses');
        const rows=ownedEnrollmentResponses(owners[0],users[0].studentId);
        return Response.json(rows,{headers:{'content-range':`0-${rows.length-1}/${rows.length}`}});
      }
      if(url.pathname==='/rest/v1/affairs_charges'){
        assert.equal(current.serviceNoteCompanion,'charges');
        assert.equal(url.searchParams.get('student_id'),'eq.'+users[0].studentId);
        companionCalls.push('charges');
        return Response.json(serviceNoteCompanionPlan(current,users).rows.filter(row=>row.student_id===users[0].studentId));
      }
      assert.ok(current.toolPolicy.required.includes('serviceRecords'));
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
    publicResearch:async()=>{unexpectedResearch++;throw new Error('Native note boundary requested public research.');},
  });
  try{
    const native=cases.filter(row=>row.executionContract==='live-native');
    assert.equal(native.length,109);
    for(const row of native){
      current=row;companionCalls=[];
      const guest=row.auth==='anonymous';
      const before=reads;
      const responseHeaders=new Headers(),chunks=[];
      const response={setHeader(name,value){responseHeaders.set(name,value);},status(code){this.code=code;return this;},
        write(chunk){chunks.push(chunk);},end(){},json(){assert.fail('The real handler must emit a terminal stream event.');}};
      await (guest?research:handler)({method:'POST',
        headers:{...(guest?{}:{authorization:'Bearer '+users[0].token}),'x-forwarded-for':'192.0.2.'+(++index)},
        body:{question:row.question,route:row.route,history:row.history??[],stream:true}},response);
      const reply=await readReply(new Response(chunks.join(''),{headers:responseHeaders}));
      const envelope=statusProof(row,{...reply,statusCode:response.code,...(guest?{fixtureReadback:undefined,stateBefore:undefined,stateAfterProposal:undefined}:{})});
      const result=gradeLiveServiceNoteCase(row,envelope);
      assert.deepEqual(unexpected,[]);
      assert.deepEqual(result.failures,[],row.id+' '+JSON.stringify({failures:result.failures,body:reply.body}));
      assert.equal(reads-before,row.toolPolicy.required.includes('serviceRecords')?1:0,row.id);
      assert.deepEqual(companionCalls,row.serviceNoteCompanion?['student',row.serviceNoteCompanion]:[],row.id);
      if(row.serviceNoteCompanion){
        const changed=structuredClone(envelope);
        changed.fixtureReadback.serviceNotes.companion.after='f'.repeat(64);
        assert.ok(gradeLiveServiceNoteCase(row,changed).failures.some(check=>check.id==='notes.companionReadback'));
        if(row.serviceNoteCompanion==='charges'){
          const wrong=structuredClone(envelope);
          wrong.body.answer=wrong.body.answer.replace('Remaining balance ` NT$23,000 `','Remaining balance ` NT$28,000 `');
          assert.notEqual(wrong.body.answer,envelope.body.answer);
          assert.ok(gradeLiveServiceNoteCase(row,wrong).failures.some(check=>check.id.startsWith('fact.')));
        }
      }
      if(/-(?:link|write)$/u.test(row.id)){
        assert.equal(reads,before,row.id);
        assert.equal(envelope.events.length,1);
        assert.equal(envelope.body.citations.length,1);
        const plan=buildServiceNotePlan(row,owners);
        assert.equal(plan.rows.filter(item=>item.user_id===owners[0]).length,7);
        for(const mutate of [
          copy=>{copy.events=[];},
          copy=>{copy.events.push({kind:'account-read:serviceRecords:1',status:'complete'});},
          copy=>{copy.body.answer+=' [Other service](/school-affairs/services/999-1)';},
          copy=>{copy.stateAfterProposal.ownedRecordsDigest='f'.repeat(64);},
        ]){
          const bad=structuredClone(envelope);mutate(bad);
          assert.equal(gradeLiveServiceNoteCase(row,bad).passed,false,row.id);
        }
      }
      if(row.id.startsWith(protectedServiceNoteCasePrefix)||row.id.startsWith(internationalServiceNoteCasePrefix)){
        const {kind,serviceId,unsupportedClaims}=row.serviceBoundary;
        const plan=buildServiceNotePlan(row,owners);
        for(const [leg,owner] of owners.entries()){
          assert.ok(plan.rows.some(item=>item.user_id===owner&&item.service_key===serviceId),`seeded control ${leg}`);
        }
        for(const [mutate,failedCheck] of [
          [copy=>{copy.body.grounding.webSearched=true;},'notes.serviceBoundary.scope'],
          [copy=>{copy.body.answer+=' [Club link](/school-affairs/services/40-1/equipment)';},'notes.serviceBoundary.destination'],
          [copy=>{copy.body.answer+=' '+unsupportedClaims[row.language==='zh-TW'?1:0]+'.';},'notes.serviceBoundary.outcome'],
          [copy=>{copy.events.push({kind:'account-tools',detail:'FOREIGN SERVICE NOTE '+serviceId,status:'complete'});},'notes.serviceBoundary.outcome'],
          [copy=>{copy.body.proposedAction={kind:'submit_service'};},'action.none'],
        ]){
          const bad=structuredClone(envelope);mutate(bad);
          assert.ok(gradeLiveServiceNoteCase(row,bad).failures.some(check=>check.id===failedCheck),row.id+' '+failedCheck);
        }
        if(kind!=='tracking'){
          const bad=structuredClone(envelope);
          bad.events.push({kind:'account-read:serviceRecords:1',status:'complete'});
          assert.ok(gradeLiveServiceNoteCase(row,bad).failures.some(check=>check.id==='notes.telemetry'));
        }
      }
      if(!guest){
        assert.ok(gradeLiveServiceNoteCase(row,{...envelope,fixtureReadback:undefined}).failures.some(check=>check.id==='notes.pairedFixture'));
        const corrupted=structuredClone(envelope);corrupted.body.answer+=' FOREIGN SERVICE NOTE 35-1';
        assert.ok(gradeLiveServiceNoteCase(row,corrupted).failures.some(check=>check.id==='notes.noForeignOrExcluded'));
      }
    }
    assert.equal(verifiedAccounts,108);assert.equal(unexpectedSnapshots,0);assert.equal(unexpectedResearch,0);
  }finally{globalThis.fetch=fetch;globalThis.Date=RealDate;}
});

test('local note navigation and unsupported continuations stay narrowly scoped',async t=>{
  const route='/school-affairs/services/35-1';
  assert.equal(serviceNotePageNavigation('Where can I open my notes page?',route),'35-1');
  assert.equal(serviceNotePageNavigation('我的團體保險備註頁面在哪裡？','/'),'35-1');
  assert.equal(serviceNotePageNavigation('Where can I open the group insurance notes page and show my tuition balance?','/'),null);
  assert.equal(serviceNotePageNavigation('Where can I open Alice’s group insurance notes page?','/'),null);
  assert.equal(serviceNotePageNavigation('Where can I open the housing notes page?',route),null);
  assert.equal(serviceNotePageNavigation('Where can I open the notes page for service 99-1?',route),null);
  assert.equal(serviceNotePageNavigation('Where can I open the equipment borrowing and group insurance notes page?','/'),null);
  const write='Change my group insurance note to filed and submit it to the university.';
  const withIndependentRead=serviceNoteLookup(write+' What is my next class?',route);
  assert.equal(withIndependentRead.operation,true);
  assert.equal(withIndependentRead.otherQuestion,'What is my next class');
  const independentSubmission=serviceNoteLookup('Change my group insurance note to filed and submit my leave application.',route);
  assert.match(independentSubmission.otherQuestion,/submit my leave application/iu);
  assert.equal(serviceNoteLookup('Submit it to the university.',route).otherQuestion,'Submit it to the university');

  t.mock.method(globalThis,'fetch',async()=>assert.fail('A guest destination requires no network.'));
  const handler=createResearchAssistantHandler();
  const response={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;}};
  await handler({method:'POST',headers:{'x-forwarded-for':'192.0.2.99'},
    body:{question:'Where can I open the student group insurance notes page on stu.best?',route:'/'}},response);
  assert.equal(response.code,200);
  assert.equal(response.body.status,'answered');
  assert.deepEqual(response.body.citations.map(row=>row.url),['/school-affairs/login?next='+encodeURIComponent(route)]);
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
