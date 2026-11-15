import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildAccountCases} from './account-cases.mjs';
import {academicGradesPreviewActor,academicGradesPreviewCases,academicGradesPreviewMode,academicGradesPreviewRequest,buildAcademicGradesPreviewPlan,
  gradeAcademicGradesPreview,readAcademicGradesPreviewCallers} from './academic-grades-preview.mjs';
import {prepare} from './live-fixtures.mjs';

const identities=['A','B'].map((role,index)=>({id:'38000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),email:role+'@example.invalid'}));
const callers=identities.map((row,index)=>({...row,token:'synthetic-token-'+index}));
const projectOrigin='https://xiftudmvxphxcjtmfmib.supabase.co';

test('operator keeps all 11 frozen questions and separates the zero/null fixture from ordinary records',async()=>{
  const bank=new Map(buildAccountCases().map(row=>[row.id,row]));
  const cases=academicGradesPreviewCases(),plan=buildAcademicGradesPreviewPlan(identities);
  assert.equal(cases.length,11);
  assert.deepEqual(cases,cases.map(row=>bank.get(row.id)));
  assert.deepEqual(cases.filter(row=>academicGradesPreviewActor(row)===1).map(row=>row.id),['account:academic-null-zero']);
  assert.equal(new Set(plan.recordIds).size,plan.recordIds.length);
  assert.equal(Object.keys(plan.rows).length,4);
  assert.ok(Object.values(plan.rows).every(rows=>identities.every(owner=>rows.some(row=>row.user_id===owner.id))));
  const grades=Object.values(plan.rows)[0],totals=Object.values(plan.rows)[1];
  for(const [index,grade,credits] of [[0,'87',18],[1,'0',null]]){
    assert.equal(grades.find(row=>row.user_id===identities[index].id&&row.course_title==='Database Design'&&row.academic_year===115).grade_text,grade);
    assert.equal(totals.find(row=>row.user_id===identities[index].id&&row.summary_kind==='transcript'&&row.academic_year===115).earned_credits,credits);
  }
  assert.throws(()=>academicGradesPreviewRequest({...cases[0],route:'/'}));
  await assert.rejects(prepare({runId:identities[0].id,cases:[],now:new Date().toISOString(),origin:'https://stu.best',
    approvedPreviewOrigin:'https://stu.best',expectedReleaseRevision:'a'.repeat(40),fixtureMode:academicGradesPreviewMode,
    previewReadbackFetch:()=>assert.fail('Invalid input must fail before HTTP or credentials.')}),{code:'fixture-config'});
});

test('each caller reads its own four exact tables and gets empty crossed results from both directions',async()=>{
  const plan=buildAcademicGradesPreviewPlan(identities);
  const found=[];
  let fault='none';
  const dependencies={projectOrigin,publishable:'synthetic-public',readResponse:response=>response.json(),
    fetchImpl:async(target,init)=>{
      assert.equal(target.origin,projectOrigin);
      assert.equal(init.method,'GET');
      assert.equal(init.redirect,'error');
      const caller=callers.find(row=>'Bearer '+row.token===init.headers.Authorization);
      assert.ok(caller);
      const requested=target.searchParams.get('user_id').slice(3),table=target.pathname.slice('/rest/v1/'.length);
      assert.ok(plan.ownerIds.includes(requested));
      assert.equal(target.searchParams.get('order'),'id.asc');
      found.push([caller.id,requested,table].join(':'));
      if(fault==='crossed'||caller.id===requested){
        const rows=plan.rows[table].filter(row=>row.user_id===requested);
        return Response.json(fault==='partial'?rows.slice(1):rows);
      }
      return Response.json([]);
    }};
  const result=await readAcademicGradesPreviewCallers(plan,callers,dependencies);
  assert.match(result.sha256,/^[a-f0-9]{64}$/u);
  assert.equal(result.ownReads,8);
  assert.equal(result.crossedReads,8);
  assert.equal(new Set(found).size,16);
  for(const scenario of ['crossed','partial']){
    fault=scenario;
    await assert.rejects(readAcademicGradesPreviewCallers(plan,callers,dependencies));
  }
  await assert.rejects(readAcademicGradesPreviewCallers(plan,[...callers].reverse(),dependencies));
});

test('protected result requires the independent factual grade, stable readbacks, exact request and an academic-only scope',()=>{
  const testCase=academicGradesPreviewCases()[0],request=academicGradesPreviewRequest(testCase);
  const observed={rows:'a'.repeat(64),callers:{sha256:'b'.repeat(64),ownReads:8,crossedReads:8}};
  const envelope={statusCode:200,fixtureKey:testCase.fixtureKey,execution:'live-model',requestIndex:1,
    requestSha256:request.sha256,correlationId:identities[0].id,
    events:[{kind:'account-read:academicGrades:1',status:'complete'}],
    body:{status:'answered',answer:'Saved local transcript grade. Database Design: 87.',verification:{status:'verified',attempts:1},
      citations:[{url:testCase.route}]}};
  const grade=(result=envelope,after=observed)=>gradeAcademicGradesPreview(testCase,result,{before:observed,after});
  assert.equal(grade().passed,true,JSON.stringify(grade().failedChecks));
  assert.ok(grade({...envelope,body:{...envelope.body,answer:'Saved local transcript grade. Database Design: 84.'}}).failedChecks.includes('fact.0'));
  assert.ok(grade({...envelope,requestSha256:'c'.repeat(64)}).failedChecks.includes('academic-preview.dispatch'));
  assert.ok(grade({...envelope,events:[...envelope.events,{kind:'account-read:charges:1',status:'complete'}]}).failedChecks.includes('academic-preview.scope'));
  assert.ok(grade(envelope,{...observed,rows:'c'.repeat(64)}).failedChecks.includes('academic-preview.source'));
});
