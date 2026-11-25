import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {dtmGradeReportFixtureManifest,buildDtmGradeReportFixturePlan,validateDtmGradeReportFixtureOwners,dtmGradeReportFixtureReadContract,
  assertDtmGradeReportFixtureCourseBindings,assertDtmGradeReportFixtureIdentities,assertDtmGradeReportFixtureRowTargets,
  assertDtmGradeReportFixtureEmpty,assertDtmGradeReportFixtureCleanup,verifyDtmGradeReportFixtureReadback} from './dtm-grade-report-fixture-plan.mjs';
import {loadDtmGradeReport,parseDtmGradeReportData,validateDtmGradeReportContent} from '../../server/dtmGradeReport.js';
import {buildAccountCases} from './account-cases.mjs';
import {EVAL_IDS} from './fixtures.mjs';
import {gradeCase} from './grading.mjs';

const runId='10000000-0000-4000-8000-000000000001',a='20000000-0000-4000-8000-000000000001',b='20000000-0000-4000-8000-000000000002';
const owners={A:{id:a,email:'evaluation.student@example.invalid',runMarker:runId},B:{id:b,email:'evaluation.other@example.invalid',runMarker:runId}};
const courses={A:{id:'10000000-0000-4000-8000-000000000101',userId:a,code:'DTM301',title:'Learning Research',term:'115學年度第1學期',role:'student',sourceMode:'personal'},
  B:{id:'30000000-0000-4000-8000-000000000002',userId:b,code:'FOREIGN-EVAL',title:'FOREIGN PRIVATE SENTINEL',term:'Synthetic private term',role:'student',sourceMode:'personal'}};
const input=(fixtureKey='dtmGradeReport')=>({runId,owners:structuredClone(owners),fixtureKey,courseBindings:structuredClone(courses)});
const errorCode=code=>error=>error?.code===code&&error?.message==='DTM grade report fixture '+code+'.';
const targets=plan=>({[plan.table]:plan.rows[plan.table].map(({id,user_id,course_id,deleted_at})=>({id,user_id,course_id,deleted_at}))});
const counts=plan=>({[plan.table]:[{userId:a,count:0},{userId:b,count:0}]});
const cleanupProof=plan=>({identities:structuredClone(Object.values(owners)),remainingByTable:counts(plan),courseBindings:structuredClone(courses)});
const reportFacts=value=>{const {id:_id,items,...fields}=value.report;return {...fields,items:items.map(({id:_item,...item})=>item)};};

test('independent literal grade report preserves zero, blank, null and absent total without tracker inference',()=>{
  const plan=buildDtmGradeReportFixturePlan(input()),report=plan.expectedByOwner[a].report,other=plan.expectedByOwner[b].report;
  assert.equal(report.sourceMode,'local_demo');assert.equal(report.courseId,EVAL_IDS.dtmCourse);assert.equal(report.total,null);
  assert.deepEqual(Object.fromEntries(Object.entries(report.items[0]).filter(([key])=>key!=='id')),{label:'Native Database Quiz',activityKind:'assignment',
    score:0,maximum:10,gradeText:'0',rangeText:'0–10',percentageText:null,weightText:'0.00 %',weightNote:'',rankText:null,
    feedbackText:'Explain the index choice',contributionText:null});
  assert.equal(other.items[0].label,'FOREIGN NATIVE DTM REPORT');assert.equal(other.items[0].gradeText,'9');assert.equal(other.total.gradeText,'91');
  assert.doesNotMatch(JSON.stringify(report),/FOREIGN|Revise normalization|60|submissionId/);
  assert.notEqual(report.items[0].id,EVAL_IDS.grade);
  for(const row of plan.rows[plan.table])assert.equal(validateDtmGradeReportContent(row.report),null);
});

test('positive report with no total and absent report remain different while second owner stays positive',()=>{
  const positive=buildDtmGradeReportFixturePlan(input()),empty=buildDtmGradeReportFixturePlan(input('empty:dtmGradeReport'));
  assert.equal(positive.rows[positive.table].length,2);assert.equal(empty.rows[empty.table].length,1);
  assert.deepEqual(empty.expectedByOwner[a],{report:null});assert.notDeepEqual(positive.expectedByOwner[a],empty.expectedByOwner[a]);
  assert.deepEqual(reportFacts(positive.expectedByOwner[b]),reportFacts(empty.expectedByOwner[b]));
  for(const plan of [positive,empty])for(const role of ['A','B']){
    const value=plan.expectedByOwner[owners[role].id];
    assert.deepEqual(parseDtmGradeReportData(value,owners[role].id,courses[role].id),value);
  }
});

test('planned facts and native scope agree with the three initial independent bank questions',()=>{
  const bank=buildAccountCases(),cases=['feedback','absent','total'].map(suffix=>bank.find(item=>item.id==='account:dtm-native-report-'+suffix));
  assert.ok(cases.every(Boolean));assert.equal(dtmGradeReportFixtureManifest.A.course.id,EVAL_IDS.dtmCourse);
  for(const item of cases){
    const plan=buildDtmGradeReportFixturePlan(input(item.fixtureKey)),contract=dtmGradeReportFixtureReadContract(plan,{role:'A'});
    assert.equal(contract.localUrl,item.route);assert.deepEqual(item.expected.requiredTools,['dtmGradeReport']);
    const answer=item.id.endsWith('-feedback')?'Saved local_demo report. Native Database Quiz: feedback: Explain the index choice; weight: 0.00 %.':
      item.id.endsWith('-absent')?'No saved native grade report is available for this selected course. This local_demo source does not establish the absence of all Moodle grades.':
      'The local_demo grade report is saved, but its course total is not recorded. Item grades cannot establish a final total.';
    const graded=gradeCase(item,{statusCode:200,execution:'recorded',fixtureKey:item.fixtureKey,
      events:[{kind:'account-read:dtmGradeReport:1',status:'complete'}],body:{status:'answered',answer,
        verification:{status:'verified',attempts:1},citations:[{chunkId:'account:dtmGradeReport',url:contract.localUrl}]}});
    assert.equal(graded.passed,true,JSON.stringify(graded.failures));
  }
});

test('native timestamp wire spellings match only the exact planned instant without normalizing other fields',()=>{
  const plan=buildDtmGradeReportFixturePlan(input()),original=plan.expectedByOwner[a];
  for(const stamp of ['2026-11-14T00:00:00Z','2026-11-14T00:00:00+00:00','2026-11-14T00:00:00.000000+00:00',
    '2026-11-14T08:00:00+08:00','2026-11-13T19:00:00-05:00']){
    const actual=structuredClone(original);actual.report.createdAt=stamp;actual.report.updatedAt=stamp;
    assert.equal(verifyDtmGradeReportFixtureReadback(plan,{role:'A'},actual),true);assert.equal(actual.report.createdAt,stamp);
  }
  for(const stamp of ['2026-11-14T00:00:00.001Z','2026-11-14T00:00:00.000001Z','2026-11-14T00:00:01Z','2026-11-14T00:00:00+08:00',
    '2026-11-14','2026-11-14T24:00:00Z','2026-11-14T00:00:00+16:00','2026-02-30T00:00:00Z',null]){
    const actual=structuredClone(original);actual.report.createdAt=stamp;
    assert.throws(()=>verifyDtmGradeReportFixtureReadback(plan,{role:'A'},actual),errorCode('readback_mismatch'));
  }
  const extra=structuredClone(original);extra.report.updatedAt='2026-11-14T00:00:00+00:00';extra.report.extra='PRIVATE';
  assert.throws(()=>verifyDtmGradeReportFixtureReadback(plan,{role:'A'},extra),errorCode('readback_mismatch'));
  const changed=structuredClone(original);changed.report.updatedAt='2026-11-14T00:00:00+00:00';changed.report.items[0].weightNote=null;
  assert.throws(()=>verifyDtmGradeReportFixtureReadback(plan,{role:'A'},changed),errorCode('readback_mismatch'));
});

test('full report retains twenty ordered items, a tail sentinel and an independently saved non-derived total',()=>{
  const plan=buildDtmGradeReportFixturePlan(input('full:dtmGradeReport')),report=plan.expectedByOwner[a].report;
  assert.equal(report.items.length,20);assert.equal(plan.itemIds.length,21);assert.equal(new Set(plan.itemIds).size,21);
  assert.equal(report.items[0].label,'Native Database Quiz');assert.equal(report.items[18].label,'Native Report Item 19');
  assert.equal(report.items[19].label,'Native Report Tail Assessment');assert.equal(report.items[19].feedbackText,'Explain the tail assessment');
  assert.equal(report.items[19].weightText,'5.00 %');assert.equal(report.total.gradeText,'73.50');assert.equal(report.total.score,73.5);
  assert.equal(report.total.maximum,100);assert.equal(report.total.percentageText,'73.50 %');assert.equal(report.total.feedbackText,'FULL REPORT TOTAL SENTINEL');
  assert.notEqual(report.items.reduce((sum,item)=>sum+item.score,0),report.total.score);
  assert.equal(validateDtmGradeReportContent({items:report.items,total:report.total}),null);
  assert.equal(verifyDtmGradeReportFixtureReadback(plan,{role:'A'},{report}),true);
  for(const mutate of [value=>{value.report.items.pop();},value=>{value.report.items.reverse();},value=>{value.report.total=null;},
    value=>{value.report.total.gradeText='73.5';},value=>{value.report.total.score=25;}]){
    const changed=structuredClone({report});mutate(changed);assert.throws(()=>verifyDtmGradeReportFixtureReadback(plan,{role:'A'},changed),errorCode('readback_mismatch'));
  }
  assert.deepEqual(reportFacts(plan.expectedByOwner[b]),reportFacts(buildDtmGradeReportFixturePlan(input()).expectedByOwner[b]));
});

test('each fixture family has disjoint report and item IDs so uncertain transitions can identify the committed variant',()=>{
  const plans=dtmGradeReportFixtureManifest.families.map(family=>buildDtmGradeReportFixturePlan(input(family)));
  const ids=plans.flatMap(plan=>[...plan.recordIds,...plan.itemIds]);assert.equal(new Set(ids).size,ids.length);
  for(const current of plans)for(const next of plans){
    if(current.fixtureKey===next.fixtureKey)continue;
    assert.throws(()=>assertDtmGradeReportFixtureRowTargets(current,targets(next)),errorCode('fixture_rows_mismatch'));
    assert.throws(()=>verifyDtmGradeReportFixtureReadback(current,{role:'B'},next.expectedByOwner[b]),errorCode('readback_mismatch'));
  }
});

test('planning is immutable and deterministic; report and item IDs cannot collide with their owner or course',()=>{
  const value=input(),before=structuredClone(value),plan=buildDtmGradeReportFixturePlan(value);
  assert.deepEqual(value,before);assert.deepEqual(plan,buildDtmGradeReportFixturePlan(value));
  assert.ok(Object.isFrozen(plan.expectedByOwner[a].report.items[0]));assert.throws(()=>{plan.expectedByOwner[a].report.items[0].gradeText='999';},TypeError);
  const all=[...plan.recordIds,...plan.itemIds];assert.equal(new Set(all).size,4);
  assert.ok(all.every(id=>![runId,a,b,courses.A.id,courses.B.id].includes(id)));
  const next=structuredClone(value);next.runId='10000000-0000-4000-8000-000000000002';for(const owner of Object.values(next.owners))owner.runMarker=next.runId;
  assert.ok(buildDtmGradeReportFixturePlan(next).recordIds.every(id=>!plan.recordIds.includes(id)));
});

test('owner and existing-course prerequisites reject foreign bindings, mutation, tokens and accessors before planning',()=>{
  for(const mutate of [value=>{value.owners.A.email='someone@example.com';},value=>{value.owners.B.id=a;},value=>{value.owners.B.runMarker=b;},
    value=>{value.owners.A.token='PRIVATE';}]){
    const value=input();mutate(value);assert.throws(()=>validateDtmGradeReportFixtureOwners({runId:value.runId,owners:value.owners}),errorCode('invalid_owners'));
  }
  for(const mutate of [value=>{value.courseBindings.A.userId=b;},value=>{value.courseBindings.B.id=courses.A.id;},value=>{value.courseBindings.A.id=EVAL_IDS.historicalDtmCourse;},
    value=>{value.courseBindings.A.sourceMode='sample';},value=>{value.courseBindings.A.title='Database Design';},value=>{value.courseBindings.B.code='DTM301';},
    value=>{value.courseBindings.A.role='teacher';},value=>{value.courseBindings.A.extra='PRIVATE';},value=>{value.courseBindings.A.id=a;}]){
    const value=input();mutate(value);assert.throws(()=>buildDtmGradeReportFixturePlan(value),errorCode('course_binding_mismatch'));
  }
  let calls=0;const value=input();Object.defineProperty(value.courseBindings.A,'title',{get(){calls++;return 'PRIVATE';}});
  assert.throws(()=>buildDtmGradeReportFixturePlan(value),errorCode('course_binding_mismatch'));assert.equal(calls,0);
  assert.throws(()=>buildDtmGradeReportFixturePlan({...input(),fixtureKey:'official-report'}),errorCode('invalid_plan'));
});

test('setup and cleanup only target exact report rows and preserve prerequisite course bindings',()=>{
  const plan=buildDtmGradeReportFixturePlan(input());
  assert.deepEqual(plan.setup.map(step=>step.kind),['persist-intent','assert-owned-identities','assert-existing-course-bindings','assert-owned-report-table-empty','insert-exact-rows','verify-both-caller-readbacks']);
  assert.deepEqual(plan.setup[0],{kind:'persist-intent',tables:['dtm_grade_reports'],recordIds:plan.recordIds});
  assert.deepEqual(plan.cleanup.map(step=>step.kind),['assert-owned-identities','assert-exact-owned-row-targets','delete-exact-rows','verify-owned-report-table-empty','verify-course-bindings-unchanged','return-to-existing-auth-cleanup']);
  assert.deepEqual(plan.cleanup[2].targets,plan.rows[plan.table].map(row=>({id:row.id,userId:row.user_id,courseId:row.course_id})));
  assert.ok([...plan.setup,...plan.cleanup].filter(step=>step.table).every(step=>step.table==='dtm_grade_reports'));
  assert.doesNotMatch(JSON.stringify(plan),/access_token|refresh_token|auth\.users|save_dtm_grade_report|dtm_grade_items|DELETE FROM|INSERT INTO/);
});

test('table lineage, constraints and immutable identity are anchored in the reviewed migration without any live import',async()=>{
  const sql=await readFile(new URL('../../supabase/migrations/20261114000000_dtm_grade_reports.sql',import.meta.url),'utf8');
  assert.match(sql,/create table public\.dtm_grade_reports \(/);assert.match(sql,/references public\.affairs_profiles\(user_id\) on delete cascade/);
  assert.match(sql,/foreign key\(course_id,user_id\) references public\.dtm_courses\(id,user_id\) on delete cascade/);
  assert.match(sql,/source_mode='local_demo'/);assert.match(sql,/unique index dtm_grade_reports_active_course_idx on public\.dtm_grade_reports\(course_id\) where deleted_at is null/);
  assert.match(sql,/version between 1 and 999999999/);assert.match(sql,/check\(private\.dtm_grade_report_content_valid\(report\)\)/);
  assert.match(sql,/new\.user_id<>old\.user_id/);assert.match(sql,/new\.course_id<>old\.course_id/);assert.match(sql,/Deleted grade report IDs cannot be reused/);
  assert.match(sql,/grant select on public\.dtm_grade_reports to authenticated/);
  const plan=buildDtmGradeReportFixturePlan(input());
  for(const row of plan.rows[plan.table])assert.deepEqual(Object.keys(row).sort(),['id','user_id','course_id','report','source_mode','version','created_at','updated_at','deleted_at'].sort());
});

test('read contracts and actual native transport use only the selected caller course with exact literal readback',async()=>{
  const saved=globalThis.fetch;let calls=0;
  try{for(const fixtureKey of ['dtmGradeReport','empty:dtmGradeReport','full:dtmGradeReport'])for(const role of ['A','B']){
    const plan=buildDtmGradeReportFixturePlan(input(fixtureKey)),contract=dtmGradeReportFixtureReadContract(plan,{role}),ownerId=owners[role].id,courseId=courses[role].id;
    assert.deepEqual(contract.query,{scope:'dtm-grade-report',course_id:courseId});assert.equal(contract.ownerId,ownerId);assert.equal(contract.method,'GET');
    globalThis.fetch=async(url,init)=>{
      calls++;const parsed=new URL(url);assert.equal(parsed.origin,'https://xiftudmvxphxcjtmfmib.supabase.co');assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
      assert.equal(new Headers(init.headers).get('authorization'),'Bearer SYNTHETIC-'+role);assert.equal(init.body,undefined);
      assert.equal(parsed.searchParams.get('user_id'),'eq.'+ownerId);assert.equal(parsed.searchParams.get('limit'),'2');
      if(parsed.pathname==='/rest/v1/dtm_courses'){
        assert.deepEqual(Object.fromEntries(parsed.searchParams),{select:'id,user_id',id:'eq.'+courseId,user_id:'eq.'+ownerId,limit:'2'});
        return Response.json([{id:courseId,user_id:ownerId}]);
      }
      assert.equal(parsed.pathname,'/rest/v1/dtm_grade_reports');assert.equal(parsed.searchParams.get('course_id'),'eq.'+courseId);assert.equal(parsed.searchParams.get('deleted_at'),'is.null');
      return Response.json(plan.rows[plan.table].filter(row=>row.user_id===ownerId));
    };
    const actual=await loadDtmGradeReport({url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC',token:'SYNTHETIC-'+role,user:{id:ownerId}},{courseId});
    assert.equal(verifyDtmGradeReportFixtureReadback(plan,{role},actual),true);
  }}finally{globalThis.fetch=saved;}
  assert.equal(calls,12);
  const plan=buildDtmGradeReportFixturePlan(input());
  for(const options of [{role:'C'},{role:'A',user_id:b},{role:'A',courseId:courses.B.id},{role:'A',summary:true}])
    assert.throws(()=>dtmGradeReportFixtureReadContract(plan,options),errorCode('invalid_request'));
});

test('readback refuses foreign, tracker, zero-null, blank-null, calculated total and extra-field substitutions',()=>{
  const plan=buildDtmGradeReportFixturePlan(input()),source=plan.expectedByOwner[a];
  for(const mutate of [value=>{value.report=null;},value=>{value.report.userId=b;},value=>{value.report.courseId=courses.B.id;},value=>{value.report.sourceMode='personal';},
    value=>{value.report.items[0].gradeText=null;},value=>{value.report.items[0].weightNote=null;},value=>{value.report.items[0].score=null;},
    value=>{value.report.items[0].feedbackText='Revise normalization examples.';},value=>{value.report.items[0].weightText='0%';},
    value=>{value.report.total={...value.report.items[0]};},value=>{value.report.items[0].id=EVAL_IDS.grade;},value=>{value.report.extra='PRIVATE';}]){
    const changed=structuredClone(source);mutate(changed);assert.throws(()=>verifyDtmGradeReportFixtureReadback(plan,{role:'A'},changed),errorCode('readback_mismatch'));
  }
});

test('cleanup proofs reject unknown, missing, foreign or tombstoned rows and preserve selected course identities',()=>{
  const plan=buildDtmGradeReportFixturePlan(input()),identity=Object.values(owners),rows=targets(plan);
  assert.equal(assertDtmGradeReportFixtureIdentities(plan,[...identity].reverse()),true);
  assert.equal(assertDtmGradeReportFixtureRowTargets(plan,rows),true);assert.equal(assertDtmGradeReportFixtureEmpty(plan,counts(plan)),true);
  assert.equal(assertDtmGradeReportFixtureCourseBindings(plan,courses),true);assert.equal(assertDtmGradeReportFixtureCleanup(plan,cleanupProof(plan)),true);
  for(const mutate of [value=>{value[0].runMarker=b;},value=>{value[0].id=b;},value=>{value[0].email='other@example.invalid';},value=>{value.pop();}]){
    const changed=structuredClone(identity);mutate(changed);assert.throws(()=>assertDtmGradeReportFixtureIdentities(plan,changed),errorCode('fixture_identity_mismatch'));
  }
  for(const mutate of [value=>{value[plan.table][0].user_id=b;},value=>{value[plan.table][0].course_id=courses.B.id;},value=>{value[plan.table].pop();},
    value=>{value[plan.table].push({id:'90000000-0000-4000-8000-000000000001',user_id:a,course_id:courses.A.id,deleted_at:null});},
    value=>{value[plan.table][0].deleted_at='2026-11-14T01:00:00.000Z';},value=>{value.other=[];}]){
    const changed=structuredClone(rows);mutate(changed);assert.throws(()=>assertDtmGradeReportFixtureRowTargets(plan,changed),errorCode('fixture_rows_mismatch'));
  }
  for(const mutate of [value=>{value.remainingByTable[plan.table][0].count=1;},value=>{value.remainingByTable[plan.table][1].count='0';},
    value=>{value.courseBindings.B.id='90000000-0000-4000-8000-000000000001';},value=>{value.courseBindings.A.title='Changed title';}]){
    const proof=cleanupProof(plan);mutate(proof);assert.throws(()=>assertDtmGradeReportFixtureCleanup(plan,proof));
  }
});

test('tampered plans cannot authorize cleanup and the module remains import-only with no I/O capability',async()=>{
  const plan=buildDtmGradeReportFixturePlan(input());
  for(const mutate of [value=>{value.expectedByOwner[a].report.items[0].gradeText='100';},value=>{value.rows[plan.table][0].user_id=b;},
    value=>{value.cleanup[2].table='dtm_courses';},value=>{value.recordIds=[];},value=>{value.owners.A.runMarker=b;}]){
    const changed=structuredClone(plan);mutate(changed);assert.throws(()=>dtmGradeReportFixtureReadContract(changed,{role:'A'}),errorCode('invalid_plan'));
    assert.throws(()=>assertDtmGradeReportFixtureCleanup(changed,cleanupProof(plan)),errorCode('invalid_plan'));
  }
  const source=await readFile(new URL('./dtm-grade-report-fixture-plan.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|process\.env|deploymentEnvironment|createClient|from ['"]postgres|readFile\s*\(/);
});
