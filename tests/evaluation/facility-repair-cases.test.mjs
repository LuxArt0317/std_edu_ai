import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFacilityRepairCases,facilityRepairFixtureForCase,facilityRepairCaseManifest as m} from './facility-repair-cases.mjs';
import {buildAccountCases} from './account-cases.mjs';
import {gradeCase} from './grading.mjs';
import {readFacilityRepairEvidence} from '../../server/accountFacilityRepairEvidence.js';
import {studyCalendar} from '../../server/affairsSchedule.js';

const bank=buildFacilityRepairCases(),find=suffix=>{const row=bank.find(item=>item.id==='account:facility-repair-'+suffix);assert.ok(row);return row;};
const root='/school-affairs/services/45-1/history',detail=root+'/'+m.reports.primary;
const foreignNote='FOREIGN REPAIR NOTE - condenser';
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC',token:'SYNTHETIC',user:{id:m.owners.A}};
const note='QA lamp inspection recorded';
const report='- A1000001\n  Status: resolved';
const list='Repair record count: 2.\n'+report+'\n- A1000002\n  Status: in_progress';
const next='- QA Timetable Workshop\n  Date: 2026-11-17\n  Time: 09:10\n  Room: QA302';
// Hand-authored acceptable assertions. Neither fixture construction nor these
// independent answers call the runtime formatter or a model to invent goldens.
const answers={
  'detail-status':report,
  'status-not-physical-proof':report+'\nPhysical repair completion: unverified.',
  'latest-note':report+'\n  Latest handling note: '+note+'\nTechnician author: unknown.',
  'latest-blank':'Latest handling note: blank.',
  'no-review-event':'- A1000001\n  Status: submitted\nHandling note: not recorded.',
  'incomplete-event-tail':report+'\nLatest handling note: unknown. The event history is incomplete.',
  'owned-list':list,
  'all-overrides-detail':list,
  'compound-next-class':report+'\n\n'+next,
  'compound-reversed':next+'\n\n'+report,
  'ambiguous-reference':'Please provide the full report ID or choose a report.',
  'exact-not-found':'The requested report was not found; its status is unavailable.',
  'empty-owned-list':'Repair record count: 0. No saved repair records for this account.',
  'read-unavailable':'The repair record query is unavailable. I cannot determine whether records exist.',
  'invalid-status':'The repair record query is unavailable because its returned data failed validation. I cannot determine whether records exist.',
  'read-only-action':report+'\nCancellation: not supported by this reader. I cannot message the technician.',
  'foreign-account':'I cannot access another student’s repair records.',
  'anonymous':'Sign in to access your own repair records.',
};
function envelopeFor(testCase,answer=answers[testCase.id.replace('account:facility-repair-','')]){
  assert.equal(typeof answer,'string');
  const events=testCase.expected.requiredAttemptedTools.flatMap(name=>[{kind:'account-read:'+name+':1',status:'running'},
    {kind:'account-read:'+name+':1',status:testCase.expected.toolTerminalStates[name]?.[0]??'complete'}]);
  const body={status:testCase.expected.behavior==='clarify'?'clarification':testCase.expected.behavior==='denial'?'handoff':'answered',
    answer:(testCase.expected.provenance?'These are saved local stu.best records.\n\n':'')+answer+'\n\n'+testCase.expected.requiredLinks.map(url=>'[Open local record]('+url+')').join('\n'),
    citations:testCase.expected.requiredTools.map(name=>({chunkId:'account:'+name,url:name==='courses'?'/school-affairs/records/subjects':testCase.expected.requiredLinks[0]})),
    verification:{status:'verified',attempts:1}};
  return {statusCode:testCase.expected.expectedStatusCode??200,execution:'deterministic',fixtureKey:testCase.fixtureKey,events,body};
}
function grade(suffix,change){const row=find(suffix),envelope=envelopeFor(row);change?.(envelope);return gradeCase(row,envelope);}
const rejects=(suffix,change,pattern)=>{const result=grade(suffix,change);assert.ok(result.failures.some(item=>pattern.test(item.id)),JSON.stringify(result.failures));return result;};

test('standalone packet has explicit complete definitions, unique IDs and no claimed mounted/live coverage',()=>{
  assert.equal(bank.length,18);assert.equal(new Set(bank.map(item=>item.id)).size,18);assert.deepEqual(Object.keys(answers).sort(),bank.map(item=>item.id.replace('account:facility-repair-','')).sort());
  const liveCases=buildAccountCases().filter(item=>item.domain==='facilityRepairs');
  assert.equal(liveCases.length,15);
  assert.ok(liveCases.every(item=>item.fixtureRequirement==='native_facility_repair'&&!item.fixtureKey.startsWith('offline:')));
  for(const suffix of ['incomplete-event-tail','read-unavailable','invalid-status'])
    assert.ok(!liveCases.some(item=>item.id==='account:facility-repair-'+suffix));
  assert.equal(m.kind,'offline-reference');assert.equal(Object.isFrozen(bank),true);
  for(const row of bank){assert.equal(row.fixtureRequirement,'offline_facility_fixture');assert.equal(row.capability.gap,true);assert.equal(row.expected.noAction,true);
    assert.equal(row.expected.forbidPublicResearch,true);assert.ok(row.nativeExpectation);assert.ok(Object.isFrozen(row.expected));}
  assert.throws(()=>facilityRepairFixtureForCase({...find('detail-status'),fixtureKey:'another'}),/Unknown/u);
  assert.throws(()=>facilityRepairFixtureForCase({id:'missing'}),/Unknown/u);
});

test('actual frozen reader satisfies every declared native state and exact own-query contract with no provider',async()=>{
  for(const row of bank){
    const fixture=facilityRepairFixtureForCase(row),before=structuredClone(fixture),calls=[];
    const result=await readFacilityRepairEvidence(row.fixtureKey==='anonymous'?{}:account,{question:row.question,route:row.route},{read:async(caller,query)=>{
      assert.equal(caller.user.id,m.owners.A);assert.equal(caller.token,'SYNTHETIC');assert.equal(query.view,'mine');assert.equal(Object.hasOwn(query,'answer'),false);
      calls.push({...query});if(fixture.error)throw fixture.error;return query.id?fixture.detail:fixture.list;
    }}),payload=JSON.parse(result.evidence.content),expected=row.nativeExpectation;
    assert.equal(result.readState,expected.readState,row.id);assert.equal(result.reason,expected.reason,row.id);assert.deepEqual(calls,expected.calls,row.id);
    assert.equal(payload.records.length,expected.records,row.id);assert.equal(payload.latestHandlingNote.state,expected.noteState,row.id);
    if(Object.hasOwn(expected,'noteText'))assert.equal(payload.latestHandlingNote.event.text,expected.noteText,row.id);
    if(Object.hasOwn(expected,'noteVersion'))assert.equal(payload.latestHandlingNote.event.version,expected.noteVersion,row.id);
    if(Object.hasOwn(expected,'authorRole'))assert.equal(payload.latestHandlingNote.authorRole,expected.authorRole,row.id);
    for(const secret of [m.owners.A,m.owners.B,foreignNote,'FOREIGN REPAIR BUILDING','PRIVATE CONTACT SENTINEL'])assert.ok(!JSON.stringify(result).includes(secret),row.id+': '+secret);
    assert.deepEqual(fixture,before);assert.ok(Buffer.byteLength(JSON.stringify(result),'utf8')<=16000);
  }
});

test('compound fixtures have independently known next date/time/room and exclude withdrawn enrollment',()=>{
  for(const suffix of ['compound-next-class','compound-reversed']){
    const row=find(suffix),fixture=facilityRepairFixtureForCase(row),calendar=studyCalendar(fixture.courses,fixture.asOf);
    assert.equal(calendar.timeZone,'Asia/Taipei');assert.equal(calendar.day,'2026-11-16');assert.equal(calendar.next.day,'2026-11-17');
    assert.equal(calendar.next.course.title,'QA Timetable Workshop');assert.equal(calendar.next.course.startsAt,'09:10:00');assert.equal(calendar.next.course.room,'QA302');
    assert.deepEqual(row.expected.requiredTools,['facilityRepairs','courses']);assert.equal(row.timeFixture,m.now);
  }
});

test('independent acceptable assertions pass the exact repair tool and field checks offline',()=>{
  for(const row of bank){const result=gradeCase(row,envelopeFor(row));assert.deepEqual(result.failures,[],row.id+': '+JSON.stringify(result.failures));
    assert.equal(result.execution,'deterministic');
  }
});

test('only an affirmed saved repair absence satisfies the domain-specific limitation check',()=>{
  for(const phrase of ['No saved repair records for this account?', 'I cannot claim no saved repair records for this account.', 'Check whether there are no saved repair records.'])
    rejects('empty-owned-list',env=>{env.body.answer=env.body.answer.replace('No saved repair records for this account.',phrase);},/^answer\.limitation$/u);
});

test('correct repair-only answers fail either compound case and conversely next-class-only cannot pass',()=>{
  for(const suffix of ['compound-next-class','compound-reversed']){
    rejects(suffix,env=>{env.body.answer='Saved local stu.best records.\n'+report;},/^fact\.|^links\.required\./u);
    rejects(suffix,env=>{env.body.answer='Saved local stu.best records.\n'+next;},/^fact\./u);
    rejects(suffix,env=>{env.body.answer=env.body.answer.replace('09:10','08:30');},/^fact\./u);
    rejects(suffix,env=>{env.body.answer=env.body.answer.replace('QA302','QA999');},/^fact\./u);
    rejects(suffix,env=>{env.events=env.events.filter(event=>!event.kind.includes(':courses:'));},/^tool\.courses$/u);
  }
});

test('latest note is bound to the requested report, not an older note, original complaint or another account',()=>{
  for(const replacement of ['OLDER REPAIR NOTE - check cable','Original QA lamp complaint',foreignNote])
    rejects('latest-note',env=>{env.body.answer=env.body.answer.replace(note,replacement);},/^fact\.|^text\.forbidden\./u);
  rejects('latest-note',env=>{env.body.answer=env.body.answer.replace('A1000001','Unrelated repair');},/^fact\./u);
  rejects('latest-note',env=>{env.body.answer=env.body.answer.replace('Technician author: unknown.','Technician author: named contractor.');},/^fact\./u);
  rejects('latest-note',env=>{env.body.answer+='\nThe technician wrote this confirmed note.';},/^text\.forbidden\./u);
  rejects('latest-blank',env=>{env.body.answer='Local record: Latest handling note: '+note;},/^fact\.|^text\.forbidden\./u);
});

test('saved resolved status is not accepted as proof of a physical repair or official technician visit',()=>{
  rejects('detail-status',env=>{env.body.answer=env.body.answer.replace('resolved','submitted');},/^fact\./u);
  rejects('status-not-physical-proof',env=>{env.body.answer=env.body.answer.replace('unverified','verified');},/^fact\./u);
  rejects('status-not-physical-proof',env=>{env.body.answer+='\nThe physical repair is complete.';},/^text\.forbidden\./u);
  rejects('status-not-physical-proof',env=>{env.body.answer+='\nTechnician visit confirmed.';},/^text\.forbidden\./u);
});

test('empty rows, exact missing report, invalid status and failed read never become interchangeable success claims',()=>{
  rejects('empty-owned-list',env=>{env.body.answer=env.body.answer.replace('count: 0','count: 2');},/^fact\./u);
  for(const suffix of ['read-unavailable','invalid-status']){
    rejects(suffix,env=>{env.body.answer='The query is unavailable, so no records are saved.';},/^evidence\.boundary\.|^text\.forbidden\./u);
    rejects(suffix,env=>{env.body.answer='The query is unavailable. No saved repair records exist.';},/^text\.forbidden\./u);
    rejects(suffix,env=>{env.events[1].status='complete';},/^tool\.terminal\.|^tools\.terminal\.schema$/u);
  }
  rejects('exact-not-found',env=>{env.body.answer+='\nA1000001 has status resolved.';},/^text\.forbidden\./u);
  rejects('incomplete-event-tail',env=>{env.body.answer=env.body.answer.replace('Latest handling note: unknown.','Latest handling note: '+note+'.');},/^fact\.|^text\.forbidden\./u);
});

test('own exact list rejects wrong status, missing member, contradictory count and foreign values in prose or cards',()=>{
  rejects('owned-list',env=>{env.body.answer=env.body.answer.replace('Status: in_progress','Status: resolved');},/^fact\./u);
  rejects('owned-list',env=>{env.body.answer=env.body.answer.replace('A1000002','Unrelated report');},/^fact\.|^list\./u);
  rejects('owned-list',env=>{env.body.answer+='\nRepair record count: 99.';},/^fact\./u);
  for(const target of ['answer','view','citation'])rejects('owned-list',env=>{
    if(target==='answer')env.body.answer+='\n'+foreignNote;
    if(target==='view')env.body.views=[{title:'Other record',rows:[{note:foreignNote}]}];
    if(target==='citation')env.body.citations.push({chunkId:'account:facilityRepairs',title:foreignNote,url:detail});
  },/^text\.forbidden\./u);
});

test('read-only, foreign and anonymous cases reject writes and private-record disclosure',()=>{
  for(const suffix of ['read-only-action','foreign-account','anonymous']){
    rejects(suffix,env=>{env.body.proposedAction={kind:'cancel_facility_repair',payload:{id:m.reports.primary}};},/^action\.none$/u);
    if(suffix!=='read-only-action')for(const text of [note,foreignNote,'A1000001'])rejects(suffix,env=>{env.body.answer+='\n'+text;},/^text\.forbidden\./u);
  }
  rejects('read-only-action',env=>{env.body.answer+='\nI cancelled the repair and I notified the technician.';},/^text\.forbidden\./u);
  rejects('anonymous',env=>{env.statusCode=200;},/^transport\.status$/u);
  rejects('foreign-account',env=>{env.events=[{kind:'account-read:courses:1',status:'complete'}];},/^tools\.allowed\.attempted$/u);
});

test('registered repair acceptance requires verified unchanged owned records, even when no action is proposed',()=>{
  const row=buildAccountCases().find(item=>item.id==='account:facility-repair-read-only-action');
  const response=envelopeFor(row);
  assert.ok(gradeCase(row,response).failures.some(item=>item.id==='action.ownedRecordsUnchanged'));
  const digest='a'.repeat(64);
  response.stateBefore={ownedRecordsDigest:digest};
  response.stateAfterProposal={ownedRecordsDigest:digest};
  response.fixtureReadback={verified:true,independentGolden:true};
  assert.equal(gradeCase(row,response).passed,true);
  response.stateAfterProposal.ownedRecordsDigest='b'.repeat(64);
  assert.ok(gradeCase(row,response).failures.some(item=>item.id==='action.ownedRecordsUnchanged'));
});

test('public research, tracker substitution and unsafely linked sources cannot satisfy native repair cases',()=>{
  rejects('detail-status',env=>{env.events.push({kind:'knowledge',status:'complete'});},/^tools\.public\.none$/u);
  rejects('detail-status',env=>{env.events=[{kind:'account-read:serviceRecords:1',status:'complete'}];env.body.citations=[{chunkId:'account:serviceRecords',url:detail}];},/^tool\.facilityRepairs$/u);
  rejects('detail-status',env=>{env.body.answer+='\n[External record](https://example.invalid/private)';},/^links\.localOnly$/u);
});

test('an injected foreign native record is rejected rather than silently projecting its note',async()=>{
  const row=find('latest-note'),fixture=facilityRepairFixtureForCase(row);let reads=0;
  const result=await readFacilityRepairEvidence(account,{question:row.question,route:row.route},{read:async()=>{reads++;return fixture.foreignDetail;}});
  assert.equal(reads,1);assert.equal(result.reason,'invalid_records');assert.equal(result.readState,'unavailable');
  assert.deepEqual(JSON.parse(result.evidence.content).records,[]);assert.ok(!JSON.stringify(result).includes(foreignNote));
});
