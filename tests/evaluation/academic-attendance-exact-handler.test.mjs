import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAffairsAssistantHandler} from '../../api/affairs-assistant.ts';
import {AffairsWorkspaceError} from '../../server/affairsWorkspace.js';
import {selectExactAcademicAttendance} from '../../server/accountAcademicAttendanceAnswer.js';
import {buildAccountCases} from './account-cases.mjs';
import {fixtureForCase,EVAL_OTHER_USER_ID,evalId} from './fixtures.mjs';
import {gradeCase} from './grading.mjs';

const origin='https://xiftudmvxphxcjtmfmib.supabase.co';
const route='/school-affairs/services/14-1';
const statistics='affairs_academic_attendance_statistics';
const details='affairs_academic_attendance_details';
const metadata='affairs_academic_attendance_metadata';
const token='isolated-attendance-fixture-token';
const current='Show my current academic attendance statistics';
const keyByTable={[statistics]:'statistics',[details]:'details',[metadata]:'metadata'};
const frozen=buildAccountCases().filter(row=>row.domain==='academicAttendance');
const date='2026-11-10';
const orders={[metadata]:'user_id.asc,id.asc', [details]:'academic_year.desc,semester.desc,row_order.asc,id.asc',
  [statistics]:'academic_year.desc,semester.desc,row_order.asc,id.asc'};
function persisted(rows){
  return rows.map(row=>Object.fromEntries(Object.entries(row).map(([field,value])=>[field.replace(/[A-Z]/gu,letter=>'_'+letter.toLowerCase()),value])));
}
async function replay(t,{question,path=route,fixtureKey='academicAttendance',guest=false,edit=()=>{},respond=()=>{}}){
  const snapshot=fixtureForCase(fixtureKey),owner=snapshot.profile.userId,activity=[],calls=[],errors=[];
  edit(snapshot.academicAttendance);
  const cleanFixture=structuredClone(snapshot.academicAttendance);
  const scoped=createAffairsAssistantHandler({
    verifyToken:async value=>{
      assert.equal(value,guest?'':token);
      if(guest)throw new AffairsWorkspaceError('Sign in first.',401);
      return {url:origin,token,key:'isolated-attendance-publishable-key',user:{id:owner}};
    },
    loadSnapshot:async()=>{const error=new Error('Unexpected broad account snapshot.');errors.push(error);throw error;},
    publicResearch:async()=>{const error=new Error('Unexpected public research.');errors.push(error);throw error;},
  });
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    try{
      const url=new URL(String(input)),table=url.pathname.replace('/rest/v1/','');
      assert.equal(url.origin,origin);
      assert.ok(Object.hasOwn(keyByTable,table),'Provider, action and unrelated requests are prohibited.');
      assert.equal(init.method,'GET');
      assert.equal(init.redirect,'error');
      assert.equal(new Headers(init.headers).get('Authorization'),'Bearer '+token);
      assert.equal(new Headers(init.headers).get('Prefer'),'count=exact');
      assert.deepEqual(Object.fromEntries(url.searchParams),{select:'*',user_id:'eq.'+owner,order:orders[table],
        ...(table===metadata?{}:{academic_year:'eq.115',semester:'eq.1'}),
        ...(table===details&&question.includes(date)?{course_date:'eq.'+date}:{}),limit:'100'});
      calls.push(table);
      const result=persisted(snapshot.academicAttendance[keyByTable[table]]);
      return respond(table,result,calls)??Response.json(result,{headers:{'content-range':result.length?`0-${result.length-1}/${result.length}`:'*/0'}});
    }catch(error){errors.push(error);throw error;}
  });
  let body,statusCode=200;
  const response={setHeader(){},status(code){statusCode=code;return this;},json(value){body=value;activity.push(...value?.activity??[]);}};
  await scoped({method:'POST',headers:guest?{}:{authorization:'Bearer '+token},body:{question,route:path}},response);
  assert.deepEqual(errors,[]);
  assert.deepEqual(snapshot.academicAttendance,cleanFixture);
  return {body,statusCode,calls,activity};
}

test('actual 14-1 handler passes six frozen attendance case rubrics without a provider',async t=>{
  assert.equal(frozen.length,6);
  const expectedReads={
    'attendance-stats':[metadata,statistics],'attendance-detail':[metadata,details],'attendance-timestamp':[metadata,details],
    'attendance-weekly-gap':[],'attendance-null-zero':[metadata,statistics],'empty-academicAttendance':[metadata],
  };
  for(const row of frozen)await t.test(row.id,async t=>{
    const observed=await replay(t,{question:row.question,path:row.route,fixtureKey:row.fixtureKey});
    assert.deepEqual(observed.calls,expectedReads[row.id.slice('account:'.length)]);
    const grade=gradeCase(row,{...observed,events:observed.activity,execution:'deterministic',fixtureKey:row.fixtureKey});
    assert.deepEqual(grade.failures,[],observed.body.answer);
    assert.deepEqual(observed.body.verification,{status:'verified',attempts:1});
    assert.equal(observed.body.grounding.source,'account');
    assert.equal(observed.body.grounding.webSearched,false);
    assert.equal(observed.body.proposedAction,undefined);
    assert.ok(observed.activity.some(({kind,status})=>kind==='academic-attendance-evidence-check'&&status==='complete'));
  });
});

test('missing designation, failed reads and successful empty selection remain distinct',async t=>{
  await t.test('explicit null designation retains prior term rows outside the answer',async t=>{
    const observed=await replay(t,{question:'請顯示我本學期的缺曠統計',edit(records){
      records.metadata[0].currentAcademicYear=null;records.metadata[0].currentSemester=null;
    }});
    assert.deepEqual(observed.calls,[metadata]);
    assert.match(observed.body.answer,/尚未設定當學期/u);
    assert.doesNotMatch(observed.body.answer,/Database Design|0 小時/u);
    assert.equal(observed.body.verification.status,'verified');
  });
  await t.test('configured empty term',async t=>{
    const observed=await replay(t,{question:current,edit(records){records.statistics=[];}});
    assert.deepEqual(observed.calls,[metadata,statistics]);
    assert.match(observed.body.answer,/No saved attendance records match/u);
    assert.doesNotMatch(observed.body.answer,/not been explicitly designated|zero absences/u);
  });
  await t.test('transient read recovers within the graph',async t=>{
    const observed=await replay(t,{question:current,respond(_table,_rows,calls){
      if(calls.length===1)return new Response(null,{status:503});
    }});
    assert.deepEqual(observed.calls,[metadata,metadata,statistics]);
    assert.match(observed.body.answer,/Database Design/u);
    assert.deepEqual(observed.body.verification,{status:'verified',attempts:2});
  });
  await t.test('persistent read issue never establishes empty records',async t=>{
    const observed=await replay(t,{question:current,respond(){return new Response(null,{status:503});}});
    assert.deepEqual(observed.calls,[metadata,metadata]);
    assert.equal(observed.body.verification.status,'unverified');
    assert.doesNotMatch(observed.body.answer,/Database Design|No saved attendance records|designated/u);
  });
});

test('owned transport and question bounds reject foreign, cropped or mixed results',async t=>{
  await t.test('crossed owner',async t=>{
    const observed=await replay(t,{question:current,edit(records){records.statistics[0].userId=EVAL_OTHER_USER_ID;}});
    assert.deepEqual(observed.calls,[metadata,statistics]);
    assert.equal(observed.statusCode,503);
    assert.doesNotMatch(JSON.stringify(observed.body),/Database Design|FOREIGN PRIVATE SENTINEL/u);
  });
  await t.test('cropped count is not empty or complete',async t=>{
    const observed=await replay(t,{question:current,respond(table){
      if(table===statistics)return Response.json([],{headers:{'content-range':'*/2'}});
    }});
    assert.deepEqual(observed.calls,[metadata,statistics]);
    assert.equal(observed.statusCode,503);
    assert.ok(!observed.body.verification);
  });
  await t.test('selected date and course do not disclose another selected-term course',async t=>{
    const observed=await replay(t,{question:frozen.find(row=>row.id.endsWith('attendance-timestamp')).question,path:route+'/detail',
      edit(records){records.details.push({...records.details[0],id:evalId(1377),courseTitle:'Other Saved Workshop',rollCalledAt:date+'T21:33:00+08:00'});}});
    assert.deepEqual(observed.calls,[metadata,details]);
    assert.match(observed.body.answer,/10:12/u);
    assert.doesNotMatch(observed.body.answer,/21:33|Other Saved Workshop/u);
  });
  await t.test('a UTC response preserves the precise timestamp and displays the Taipei clock',async t=>{
    const row=frozen.find(row=>row.id.endsWith('attendance-timestamp'));
    const stamp=date+'T02:12:00.012345+00:00';
    const observed=await replay(t,{question:row.question,path:row.route,edit(records){records.details[0].rollCalledAt=stamp;}});
    assert.ok(observed.body.answer.includes(stamp));
    assert.match(observed.body.answer,/10:12:00 Taipei time/u);
    const grade=gradeCase(row,{...observed,events:observed.activity,execution:'deterministic',fixtureKey:row.fixtureKey});
    assert.deepEqual(grade.failures,[],observed.body.answer);
  });
  await t.test('unknown named course does not show other courses',async t=>{
    const observed=await replay(t,{question:'When and which periods was I absent for Missing Workshop?',path:route+'/detail'});
    assert.deepEqual(observed.calls,[metadata,details]);
    assert.match(observed.body.answer,/No saved attendance records match/u);
    assert.doesNotMatch(observed.body.answer,/Database Design/u);
  });
  await t.test('guests do not receive private data',async t=>{
    const observed=await replay(t,{question:current,guest:true});
    assert.deepEqual(observed.calls,[]);
    assert.doesNotMatch(JSON.stringify(observed.body),/Database Design/u);
  });
  assert.equal(selectExactAcademicAttendance(current+' and what is my next Moodle class?',route),null);
  assert.equal(selectExactAcademicAttendance('When and which periods was I absent for Database Design and what is my display name?',route),null);
  assert.equal(selectExactAcademicAttendance('Show me another student’s absence details',route),null);
  assert.equal(selectExactAcademicAttendance(current,'/dtm/meetings'),null);
  assert.equal(selectExactAcademicAttendance(current,route,[{role:'user',content:'Show my academic grades'}]),null);
});
