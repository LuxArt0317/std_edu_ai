import assert from 'node:assert/strict';
import test from 'node:test';
import {buildAccountCases} from './account-cases.mjs';
import {buildDtmGradeReportFixturePlan,dtmGradeReportFixtureManifest} from './dtm-grade-report-fixture-plan.mjs';
import {gradeCase} from './grading.mjs';
import {readDtmGradeReportEvidence} from '../../server/accountDtmGradeReportEvidence.js';
import {formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';

// No lifecycle, credentials, provider or network. The actual immutable fixture,
// validated native reader and formatter supply an independent grading contract.
const runId='10000000-0000-4000-8000-000000000001';
const a='20000000-0000-4000-8000-000000000001',b='20000000-0000-4000-8000-000000000002';
const owners={A:{id:a,email:'evaluation.student@example.invalid',runMarker:runId},B:{id:b,email:'evaluation.other@example.invalid',runMarker:runId}};
const courseBindings={A:{...dtmGradeReportFixtureManifest.A.course,userId:a},
  B:{...dtmGradeReportFixtureManifest.B.course,id:'30000000-0000-4000-8000-000000000002',userId:b}};
const bank=buildAccountCases().filter(item=>item.id.startsWith('account:dtm-native-report-'));
const event=tool=>[{kind:'account-read:'+tool+':1',status:'running'},{kind:'account-read:'+tool+':1',status:'complete'}];
async function rendered(suffix){
  const testCase=bank.find(item=>item.id==='account:dtm-native-report-'+suffix);assert.ok(testCase);
  const plan=buildDtmGradeReportFixturePlan({runId,owners,courseBindings,fixtureKey:testCase.fixtureKey});
  const course=courseBindings.A,report=plan.expectedByOwner[a];
  const evidence=await readDtmGradeReportEvidence({url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC',token:'SYNTHETIC',user:{id:a}},
    {question:testCase.question,route:testCase.route},{loadOverview:async()=>({courses:[{id:course.id,userId:a,title:course.title,code:course.code,
      term:course.term,gradeText:report.report?.total?.gradeText??null}],limit:100,nextCursor:null}),loadReport:async()=>report});
  assert.notEqual(evidence.readState,'unavailable');
  const body=formatSupplementalAccountAnswers([evidence],{question:testCase.question});
  const envelope={statusCode:200,execution:'deterministic',fixtureKey:testCase.fixtureKey,events:event('dtmGradeReport'),
    body:{...body,verification:{status:'verified',attempts:1}}};
  return {testCase,envelope};
}
const passes=({testCase,envelope})=>{const result=gradeCase(testCase,envelope);assert.equal(result.passed,true,testCase.id+': '+JSON.stringify(result.failures));};
const failsFacts=({testCase,envelope})=>{const result=gradeCase(testCase,envelope);assert.equal(result.passed,false);assert.ok(result.failures.some(item=>item.id.startsWith('fact.')),JSON.stringify(result.failures));};

test('all five native report cases accept their exact real fixture-reader-formatter output without crediting a model execution',async()=>{
  assert.equal(bank.length,5);
  for(const suffix of ['feedback','absent','total','saved-total','tail']){
    const actual=await rendered(suffix);passes(actual);
    assert.equal(gradeCase(actual.testCase,actual.envelope).execution,'deterministic');
    if(['feedback','saved-total','tail'].includes(suffix))assert.match(actual.envelope.body.answer,/- Report row: [^\n]+\n  - /u);
  }
});

test('feedback and weight remain attached to the named native item and preserve literal values',async()=>{
  for(const suffix of ['feedback','tail']){
    const original=await rendered(suffix),expected=suffix==='feedback'?'0.00 %':'5.00 %';
    const changed=structuredClone(original);changed.envelope.body.answer=changed.envelope.body.answer.replace('` '+expected+' `','` 99.00 % `');failsFacts(changed);
    const other=structuredClone(original);other.envelope.body.answer=other.envelope.body.answer.replace('  - Saved feedback text:', '- Report row: ` Unrelated assessment `\n  - Saved feedback text:');failsFacts(other);
    const sibling=structuredClone(original);sibling.envelope.body.answer=sibling.envelope.body.answer.replaceAll('\n  - ','\n- ');failsFacts(sibling);
  }
});

test('saved total requires both the literal grade and its feedback beneath the total heading',async()=>{
  const original=await rendered('saved-total');
  for(const [from,to] of [['` 73.50 `','` 73.5 `'],['` FULL REPORT TOTAL SENTINEL `','` Different feedback `'],
    ['- Report row: ` Explicitly saved course total `','- Report row: ` Item subtotal `']]){
    const changed=structuredClone(original);assert.ok(changed.envelope.body.answer.includes(from));changed.envelope.body.answer=changed.envelope.body.answer.replace(from,to);failsFacts(changed);
  }
  const wrongRow=structuredClone(original);wrongRow.envelope.body.answer=wrongRow.envelope.body.answer.replace('  - Saved feedback text:','- Report row: ` Unrelated assessment `\n  - Saved feedback text:');failsFacts(wrongRow);
});

test('foreign native content and tracker tool activity cannot receive native report credit',async()=>{
  const original=await rendered('feedback');
  const foreign=structuredClone(original);foreign.envelope.body.answer+='\nFOREIGN NATIVE DTM REPORT: grade text 9; FOREIGN REPORT FEEDBACK.';
  assert.equal(gradeCase(foreign.testCase,foreign.envelope).passed,false);
  for(const events of [event('dtm'),[...event('dtm'),...event('dtmGradeReport')]]){
    const tracker=structuredClone(original);tracker.envelope.events=events;const result=gradeCase(tracker.testCase,tracker.envelope);
    assert.equal(result.passed,false);assert.ok(result.failures.some(item=>/tool|retrieval/u.test(item.id)),JSON.stringify(result.failures));
  }
  const substitution=structuredClone(original);substitution.envelope.body.answer=substitution.envelope.body.answer.replace('Explain the index choice','Revise normalization examples.');
  assert.equal(gradeCase(substitution.testCase,substitution.envelope).passed,false);
});
