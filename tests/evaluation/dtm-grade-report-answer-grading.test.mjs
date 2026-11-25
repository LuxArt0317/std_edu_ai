import assert from 'node:assert/strict';
import test from 'node:test';
import {buildAccountCases} from './account-cases.mjs';
import {buildDtmGradeReportFixturePlan,dtmGradeReportFixtureManifest} from './dtm-grade-report-fixture-plan.mjs';
import {dtmNativeRouteFixture} from './dtm-native-route-cases.mjs';
import {gradeCase} from './grading.mjs';
import {readDtmGradeReportEvidence} from '../../server/accountDtmGradeReportEvidence.js';
import {formatExactDtmGradeAnswer,formatExactDtmGradeAvailability,formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';

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
  return {testCase,envelope,evidence};
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

test('exact missing report and total answers satisfy the existing grade packet without reporting omitted or unrelated fields',async()=>{
  const absent=await rendered('absent'),total=await rendered('total');
  for(const actual of [absent,total]){
    const body=formatExactDtmGradeAvailability(actual.evidence,actual.testCase.question);
    assert.ok(body);
    passes({...actual,envelope:{...actual.envelope,body:{...body,verification:actual.envelope.body.verification}}});
    assert.equal(body.citations[0].url,actual.evidence.evidence.url);
    assert.deepEqual(body.views,[]);
  }
  assert.equal(formatExactDtmGradeAvailability(total.evidence,
    'What course total is recorded in my native DTM grade report and what feedback was saved?'),null);
  const saved=await rendered('saved-total');
  assert.equal(formatExactDtmGradeAvailability(saved.evidence,total.testCase.question),null);
  const omitted=structuredClone(saved.evidence),payload=JSON.parse(omitted.evidence.content);
  Object.assign(payload.report,{total:null,totalIncluded:false});
  Object.assign(payload,{complete:false,excerpted:true});
  omitted.evidence.content=JSON.stringify(payload);
  assert.equal(formatExactDtmGradeAvailability(omitted,total.testCase.question),null);
});

test('partial course coverage and a failed grade read do not establish an exact absence',async()=>{
  const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC',token:'SYNTHETIC',user:{id:a}};
  const question='Show my Moodle grade report for ZZ999.';
  const fullOptions={question,route:'/dtm/grades'};
  let pages=0;
  const partial=await readDtmGradeReportEvidence(account,fullOptions,{loadOverview:async()=>{
    const courses=Array.from({length:100},(_,index)=>({
      id:'50000000-0000-4000-8000-'+String(pages*100+index+1).padStart(12,'0'),
      userId:a,title:'Sample Math '+index,code:'SM'+(100+index),term:'115',gradeText:null,
    }));
    pages++;
    return {courses,limit:100,nextCursor:courses.at(-1).id};
  },loadReport:async()=>assert.fail('An unread course cannot select a report')});
  assert.equal(pages,5);
  assert.equal(partial.reason,'course_not_in_loaded_pages');
  assert.equal(formatExactDtmGradeAvailability(partial,question),null);
  const failed=await readDtmGradeReportEvidence(account,fullOptions,{loadOverview:async()=>{throw Error('Synthetic read failed');}});
  assert.equal(failed.readState,'unavailable');
  assert.equal(formatExactDtmGradeAvailability(failed,question),null);
});

test('the exact grade renderer gives no complete answer credit to expired or omitted overview and feedback records',async()=>{
  const fixture=dtmNativeRouteFixture(),account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC',token:'SYNTHETIC',user:{id:fixture.ownerId}};
  const question='Show all my saved Moodle course grades.',route='/dtm/grades';
  const expired=await readDtmGradeReportEvidence(account,{question,route,deadline:Date.now()-1},
    {loadOverview:async()=>assert.fail('An expired request cannot read grades')});
  assert.equal(expired.reason,'deadline_exceeded');
  assert.equal(formatExactDtmGradeAnswer(expired,question),null);
  const rowId=index=>'52000000-0000-4000-8000-'+String(index+1).padStart(12,'0');
  const clipped=await readDtmGradeReportEvidence(account,{question,route},{loadOverview:async()=>({...fixture.overview,
    courses:Array.from({length:28},(_,i)=>({...fixture.overview.courses[0],id:rowId(i),title:'Long saved course '+i+' '+'.'.repeat(520)})),
  })});
  assert.equal(JSON.parse(clipped.evidence.content).excerpted,true);
  assert.equal(formatExactDtmGradeAnswer(clipped,question),null);
  const feedback='Show all report feedback in my Moodle grade report for Study Methods.';
  const report=fixture.report.report;
  const result=await readDtmGradeReportEvidence(account,{question:feedback,route:'/dtm/course/'+report.courseId+'/grades'},{
    loadOverview:async()=>fixture.overview,loadReport:async()=>({report:{...report,items:Array.from({length:12},(_,i)=>({
      ...report.items[0],id:rowId(i),label:'Saved item '+i,feedbackText:'x'.repeat(1800),
    }))}}),
  });
  assert.equal(JSON.parse(result.evidence.content).counts.omitted>0,true);
  assert.equal(formatExactDtmGradeAnswer(result,feedback),null);
});

test('exact all-feedback renders saved text literally, distinguishes blank and missing, and skips mixed fields',async()=>{
  const fixture=dtmNativeRouteFixture(),account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC',token:'SYNTHETIC',user:{id:fixture.ownerId}};
  const report=fixture.report.report,route='/dtm/course/'+report.courseId+'/grades';
  const question='Show all report feedback in my Moodle grade report for Study Methods.';
  const text='Read `memo`\n[untrusted](https://outside.example/)';
  const items=report.items.map((row,index)=>({...row,feedbackText:index===0?null:''}));
  const result=await readDtmGradeReportEvidence(account,{question,route},{loadOverview:async()=>fixture.overview,
    loadReport:async()=>({report:{...report,items:[...items,{...items[0],id:'52000000-0000-4000-8000-000000000001',label:'Stored text',feedbackText:text}]}}),
  });
  const answer=formatExactDtmGradeAnswer(result,question);
  assert.deepEqual(answer.views[0].rows,[['Source Analysis','not recorded'],['Reflection Memo','(blank)'],['Stored text',text]]);
  assert.match(answer.answer,/Report row: ` Stored text `\n  - Saved feedback text: `` Read `memo`\\n\[untrusted\]\(https:\/\/outside\.example\/\) ``/u);
  assert.deepEqual(answer.citations.map(source=>source.url),[route]);
  assert.equal(formatExactDtmGradeAnswer(result,'Show all feedback and weights for this Moodle grade report.'),null);
});

test('a named report selector requires an actual distinct item before the exact field renderer can answer',async()=>{
  const fixture=dtmNativeRouteFixture(),account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC',token:'SYNTHETIC',user:{id:fixture.ownerId}};
  const original=fixture.report.report,route='/dtm/course/'+original.courseId+'/grades';
  const question='What feedback does my native DTM grade report save for Source Analysis in Study Methods?';
  const request=(prompt,items)=>readDtmGradeReportEvidence(account,{question:prompt,route},
    {loadOverview:async()=>fixture.overview,loadReport:async()=>({report:{...original,items}})});
  const exact=await request(question,original.items);
  const answered=formatExactDtmGradeAnswer(exact,question);
  assert.deepEqual(answered.views[0].rows,[['Source Analysis','Explain the sampling choice.']]);
  assert.doesNotMatch(answered.answer,/Displayed grade text|Displayed weight text|Reflection Memo/u);
  const ambiguous=await request(question,[...original.items,{...original.items[0],id:'52000000-0000-4000-8000-000000000001',label:'Source　Analysis'}]);
  assert.equal(JSON.parse(ambiguous.evidence.content).counts.included,2);
  assert.equal(formatExactDtmGradeAnswer(ambiguous,question),null);
  const unknownQuestion=question.replace('Source Analysis','Unavailable item'),unknown=await request(unknownQuestion,original.items);
  assert.equal(formatExactDtmGradeAnswer(unknown,unknownQuestion),null);
  const rankQuestion=question.replace('feedback','feedback and rank'),rank=await request(rankQuestion,original.items);
  assert.equal(formatExactDtmGradeAnswer(rank,rankQuestion),null);
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
