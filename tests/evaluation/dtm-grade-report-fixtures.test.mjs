import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildDtmGradeReportFixturePlan,dtmGradeReportFixtureManifest,dtmGradeReportFixtureReadContract} from './dtm-grade-report-fixture-plan.mjs';
import {changeDtmReportFixtureRows,readDtmReportFixtureScopes,removeDtmReportFixtureRows} from './live-fixtures.mjs';
import {fixtureForCase} from './fixtures.mjs';

const runId='20000000-0000-4000-8000-000000000001';
const owners={
  A:{id:'30000000-0000-4000-8000-000000000001',email:'student@example.invalid',runMarker:runId},
  B:{id:'30000000-0000-4000-8000-000000000002',email:'other@example.invalid',runMarker:runId},
};
const courseBindings={
  A:{...dtmGradeReportFixtureManifest.A.course,userId:owners.A.id},
  B:{...dtmGradeReportFixtureManifest.B.course,id:'40000000-0000-4000-8000-000000000001',userId:owners.B.id},
};
const plan=(fixtureKey='dtmGradeReport')=>buildDtmGradeReportFixturePlan({runId,owners,fixtureKey,courseBindings});
const origin='http://127.0.0.1:5191';

function fixtureSql(identities=Object.values(owners),courses=Object.values(courseBindings)){
  const rows=[],writes=[];
  const sql=(parts,...args)=>{
    if(!Array.isArray(parts)||!Object.hasOwn(parts,'raw'))return parts;
    return execute(parts,...args);
  };
  sql.json=report=>structuredClone(report);
  async function execute(parts,...args){
    const command=parts.join(' ');
    if(command.includes('from auth.users'))return identities.filter(owner=>args[0].includes(owner.id));
    if(command.includes('from public.dtm_courses'))return courses.filter(course=>args[0].includes(course.id));
    if(command.startsWith('select')&&command.includes('from public.dtm_grade_reports'))
      return rows.filter(row=>args[0].includes(row.user_id)).slice(0,5).map(({id,user_id,course_id,deleted_at})=>({id,user_id,course_id,deleted_at}));
    if(command.startsWith('insert into public.dtm_grade_reports')){
      writes.push(['insert',args[0].map(row=>row.id)]);
      rows.push(...structuredClone(args[0]));
      return [];
    }
    if(command.startsWith('delete from public.dtm_grade_reports')){
      const index=rows.findIndex(row=>row.id===args[0]&&row.user_id===args[1]&&row.course_id===args[2]);
      assert.ok(index>=0,'Exact owned course, owner and report must all match');
      writes.push(['delete',...args]);
      rows.splice(index,1);
      return [];
    }
    assert.fail('Unexpected fixture query');
  }
  return {sql,rows,writes};
}

test('report transitions remove only exact owned targets and preserve the second account course binding',async()=>{
  const active=plan(),empty=plan('empty:dtmGradeReport'),{sql,rows,writes}=fixtureSql();
  const unrelated={id:'unrelated-report',user_id:'unrelated-owner',course_id:'unrelated-course'};
  rows.push(unrelated);
  await changeDtmReportFixtureRows(sql,active,'insert');
  await changeDtmReportFixtureRows(sql,active,'remove');
  await changeDtmReportFixtureRows(sql,empty,'insert');
  assert.ok(rows.some(row=>row.user_id===owners.B.id));
  assert.ok(!rows.some(row=>row.user_id===owners.A.id));
  await changeDtmReportFixtureRows(sql,empty,'remove');
  assert.deepEqual(rows,[unrelated]);
  assert.deepEqual(writes.filter(([kind])=>kind==='delete').map(([,id])=>id),[...active.recordIds,...empty.recordIds]);
});

test('identity, native course binding and unexpected reports all fail before possibly destructive fixture SQL',async()=>{
  const active=plan();
  const wrongOwner=fixtureSql([{...owners.A,runMarker:'other'},owners.B]);
  await assert.rejects(changeDtmReportFixtureRows(wrongOwner.sql,active,'insert'),/fixture_identity_mismatch/);
  const wrongCourse=fixtureSql(undefined,[{...courseBindings.A,title:'Different course'},courseBindings.B]);
  await assert.rejects(changeDtmReportFixtureRows(wrongCourse.sql,active,'insert'),/course_binding_mismatch/);
  const unknown=fixtureSql();
  unknown.rows.push({id:'different-report',user_id:owners.A.id,course_id:courseBindings.A.id,deleted_at:null});
  await assert.rejects(changeDtmReportFixtureRows(unknown.sql,active,'remove'),/fixture_rows_mismatch/);
  for(const db of [wrongOwner,wrongCourse,unknown])assert.deepEqual(db.writes,[]);
});

test('uncertain commit resolves only exact previous, pending or empty report fixture state',async()=>{
  const previous=plan(),pending=plan('full:dtmGradeReport');
  for(const current of [null,previous,pending]){
    const {sql,rows}=fixtureSql();
    await changeDtmReportFixtureRows(sql,current,'insert');
    await removeDtmReportFixtureRows(sql,{plan:previous,pending});
    assert.deepEqual(rows,[]);
  }
  const mixed=fixtureSql();
  mixed.rows.push(previous.rows.dtm_grade_reports[0],pending.rows.dtm_grade_reports[1]);
  await assert.rejects(removeDtmReportFixtureRows(mixed.sql,{plan:previous,pending}),/ownership could not be reconciled/);
  assert.deepEqual(mixed.writes,[]);
});

test('each live case reads the exact native report as its owner and rejects it with the other JWT',async()=>{
  const active=plan('empty:dtmGradeReport'),users=Object.entries(owners).map(([role,owner])=>({id:owner.id,token:'synthetic-'+role}));
  const calls=[];
  const transport=(cross=()=>Response.json({error:'This course is not available to your account.'},{status:403}))=>async(input,init)=>{
    const url=new URL(input),role=init.headers.Authorization.at(-1),contract=dtmGradeReportFixtureReadContract(active,{role});
    assert.equal(url.origin,origin);
    assert.equal(url.pathname,contract.path);
    assert.equal(init.method,'GET');
    assert.equal(init.redirect,'error');
    assert.equal(url.searchParams.get('scope'),contract.query.scope);
    assert.equal(url.searchParams.size,2);
    const own=url.searchParams.get('course_id')===contract.query.course_id;
    calls.push([role,own]);
    if(own)return Response.json(contract.expected);
    return cross();
  };
  const result=await readDtmReportFixtureScopes(active,users,{origin,fetchImpl:transport()});
  assert.deepEqual(calls,[['A',true],['A',false],['B',true],['B',false]]);
  assert.equal(result[owners.A.id].report,null);
  assert.match(result[owners.B.id].report.items[0].label,/FOREIGN NATIVE DTM REPORT/);
  for(const cross of [()=>Response.json({error:'This grade report is not available to your account.'}),
    ()=>new Response('<h1>Forbidden</h1>',{status:403,headers:{'Content-Type':'text/html'}}),
    ()=>Response.json({error:'Trusted Sources authentication failed.'},{status:403})])
    await assert.rejects(readDtmReportFixtureScopes(active,users,{origin,fetchImpl:transport(cross)}),/fixture-readback/);
  for(const key of dtmGradeReportFixtureManifest.families)assert.ok(fixtureForCase(key).dtm.courses.some(row=>row.id===courseBindings.A.id));
});
