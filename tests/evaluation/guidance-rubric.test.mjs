import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildGuidanceReviewBinding,validateGuidanceReview,GUIDANCE_CRITERIA,GUIDANCE_RUBRIC_VERSION,GUIDANCE_REASON_CODES} from './guidance-rubric.mjs';

const answer='Choose one example you can explain honestly.\n\nIn [project], I contributed [specific work].\n\nWhat have you built recently, if anything?';
const criterion=(id,proof='spans')=>({id,proof});
const testCase=()=>({id:'account:career-help',question:'What makes me qualified to be a software engineer?',history:[],route:'/school-affairs',mode:'record',language:'en',fixtureKey:'coaching',
  expected:{behavior:'answer',requiredTools:[],guidanceRubric:{version:GUIDANCE_RUBRIC_VERSION,criteria:[
    criterion('requested_parts'),criterion('usable_help'),criterion('next_step'),criterion('honest_separation','whole_answer'),
    criterion('proportionate_clarification','whole_answer'),criterion('missing_data','whole_answer'),criterion('language_relevance','whole_answer'),
  ]}}});
const envelope=()=>({statusCode:200,body:{status:'answered',answer,verification:{status:'verified',attempts:1}},
  events:[{kind:'compose',status:'done'}],execution:'live-model',sourceRevision:'revision-fixture',fixtureKey:'coaching'});
const identity={runId:'run-fixture',finalSuiteHash:'a'.repeat(64),sourceRevision:'revision-fixture'};
const whole=text=>({start:0,end:text.length});
const span=text=>({...whole(text),text});
function setup(overrides={}){
  const context={testCase:testCase(),envelope:envelope(),...overrides};
  context.binding=buildGuidanceReviewBinding({...identity,...context});
  const raw=context.envelope.body.answer;
  context.artifact={binding:structuredClone(context.binding),reviewer:{id:'independent-reviewer',method:'manual'},
    criteria:context.testCase.expected.guidanceRubric.criteria.map(row=>({id:row.id,passed:true,answerSpans:row.proof==='spans'?[span(raw)]:[],
      ...(row.proof==='whole_answer'?{examinedRange:whole(raw)}:{})}))};
  return context;
}
const validate=context=>validateGuidanceReview(context);
const invalid=(context,id)=>{const result=validate(context);assert.equal(result.status,'invalid',JSON.stringify(result));assert.equal(result.passed,false);if(id)assert.equal(result.failures[0].id,id);};

test('seven fixed criteria and an exact manually reviewed answer pass without a production oracle',()=>{
  assert.deepEqual(GUIDANCE_CRITERIA,['requested_parts','usable_help','next_step','honest_separation','proportionate_clarification','missing_data','language_relevance']);
  const context=setup(),result=validate(context);
  assert.equal(result.status,'passed');assert.equal(result.passed,true);assert.equal(result.criteria.length,7);assert.deepEqual(result.failures,[]);
  assert.ok(Object.isFrozen(context.binding));assert.ok(Object.isFrozen(GUIDANCE_CRITERIA));
  const independent=setup({envelope:{...envelope(),body:{status:'answered',answer,verification:{status:'unverified',attempts:2}}}});
  assert.equal(validate(independent).status,'passed','The factual/runtime verdict remains a separate required gate, never this rubric oracle.');
});

test('missing independent review stays pending even when the response claims perfect self-review',()=>{
  const context=setup({envelope:{...envelope(),body:{...envelope().body,independentReview:{passed:true,status:'passed'},helpfulness:100}}});
  for(const artifact of [undefined,null]){
    const result=validate({...context,artifact});assert.equal(result.status,'pending');assert.equal(result.passed,false);
    assert.equal(result.failures[0].id,'guidance.review_missing');
  }
  const noRubric=testCase();delete noRubric.expected.guidanceRubric;
  assert.deepEqual(validate({testCase:noRubric}),{status:'not_required',passed:false,criteria:[],failures:[]});
});

test('one independently failed criterion fails the rubric, including omissions without a quote',()=>{
  const context=setup(),row=context.artifact.criteria[0];
  row.passed=false;row.answerSpans=[];row.examinedRange=whole(answer);row.reasonCode='missing_requested_part';row.note='The response did not address the requested comparison.';
  const result=validate(context);assert.equal(result.status,'failed');assert.equal(result.passed,false);
  assert.deepEqual(result.failures,[{id:'guidance.requested_parts',detail:'missing_requested_part'}]);
  delete row.examinedRange;invalid(context,'guidance.proof');
});

test('a separate evaluator is explicit; self-verification methods and extra artifact fields reject',()=>{
  const context=setup();context.artifact.reviewer.method='separate-evaluator';assert.equal(validate(context).passed,true);
  for(const method of ['production','self','model','answer_evidence_review',null])invalid({...context,artifact:{...context.artifact,reviewer:{id:'reviewer',method}}},'guidance.reviewer');
  for(const id of ['', ' '+('reviewer'), 'reviewer\nsecret', 'x'.repeat(201)])invalid({...context,artifact:{...context.artifact,reviewer:{id,method:'manual'}}},'guidance.reviewer');
  invalid({...context,artifact:{...context.artifact,productionApproved:true}},'guidance.artifact');
});

test('case-defined applicability cannot be dropped, duplicated, invented or changed by the reviewer',()=>{
  for(const change of [rows=>rows.slice(1),rows=>[...rows,rows[0]],rows=>[rows[0],rows[0],...rows.slice(2)],
    rows=>rows.map((row,i)=>i?row:{...row,id:'invented'}),rows=>rows.map((row,i)=>i?row:{...row,passed:'n/a'}),
    rows=>rows.map((row,i)=>i?row:{...row,notApplicable:true})]){
    const context=setup();context.artifact.criteria=change(context.artifact.criteria);invalid(context,'guidance.criteria');
  }
  const context=setup();context.artifact.criteria.reverse();assert.equal(validate(context).passed,true);
  assert.deepEqual(validate(context).criteria.map(row=>row.id),GUIDANCE_CRITERIA,'Returned order is the frozen case contract.');
});

test('malformed case rubrics fail closed before a missing review can become pending',()=>{
  for(const rubric of [null,{}, {version:'new-version',criteria:[criterion('usable_help')]},
    {version:GUIDANCE_RUBRIC_VERSION,criteria:[]},{version:GUIDANCE_RUBRIC_VERSION,criteria:[criterion('unknown')]},
    {version:GUIDANCE_RUBRIC_VERSION,criteria:[criterion('usable_help'),criterion('usable_help')]},
    {version:GUIDANCE_RUBRIC_VERSION,criteria:[criterion('usable_help','automatic')]},
    {version:GUIDANCE_RUBRIC_VERSION,criteria:[{...criterion('usable_help'),optional:true}]}]){
    const current=testCase();current.expected.guidanceRubric=rubric;invalid({testCase:current},'guidance.rubric');
  }
});

test('every declared span is exact raw answer text, not normalized Markdown or a fabricated quote',()=>{
  for(const malformed of [{start:0,end:6,text:'choose'},{start:0,end:6,text:'Choose '},{start:-1,end:6,text:'Choose'},
    {start:0.5,end:6,text:'Choose'},{start:0,end:answer.length+1,text:answer},{start:1,end:0,text:''},
    {start:0,end:6,text:'Choose',source:'model'}]){
    const context=setup();context.artifact.criteria[0].answerSpans=[malformed];invalid(context,'guidance.span');
  }
  const markdown='**Choose** [a project](/dtm).',context=setup({envelope:{...envelope(),body:{answer:markdown}}});
  context.artifact.criteria[0].answerSpans=[{start:2,end:8,text:'Choose'}];assert.equal(validate(context).passed,true);
  context.artifact.criteria[0].answerSpans=[{start:0,end:6,text:'Choose'}];invalid(context,'guidance.span');
});

test('UTF-16 offsets support Chinese and whole emoji but cannot split surrogate pairs',()=>{
  const raw='請先選一個實例 🙂，再說明你的貢獻。',context=setup({envelope:{...envelope(),body:{answer:raw}}}),at=raw.indexOf('🙂');
  context.artifact.criteria[0].answerSpans=[{start:at,end:at+2,text:'🙂'}];assert.equal(validate(context).passed,true);
  context.artifact.criteria[0].answerSpans=[{start:at,end:at+1,text:raw.slice(at,at+1)}];invalid(context,'guidance.span');
  context.artifact.criteria[0].answerSpans=[{start:at+1,end:at+2,text:raw.slice(at+1,at+2)}];invalid(context,'guidance.span');
});

test('absence criteria require whole-answer examination and constructive positives require quoted support',()=>{
  const context=setup();delete context.artifact.criteria[3].examinedRange;invalid(context,'guidance.proof');
  context.artifact.criteria[3].examinedRange={start:0,end:answer.length-1};invalid(context,'guidance.proof');
  context.artifact.criteria[3].examinedRange=whole(answer);context.artifact.criteria[0].answerSpans=[];invalid(context,'guidance.proof');
  context.artifact.criteria[0].answerSpans=[span(answer)];assert.equal(validate(context).passed,true);
});

test('failed reviews need an explicit bounded reason and cannot use an unsupported criterion-met verdict',()=>{
  const context=setup();context.artifact.criteria[0].passed=false;
  for(const reasonCode of [undefined,'criterion_met','secret-user-value']){
    context.artifact.criteria[0].reasonCode=reasonCode;invalid(context,'guidance.criteria');
  }
  context.artifact.criteria[0].reasonCode='other';assert.equal(validate(context).status,'failed');
  context.artifact.criteria[0].note='x'.repeat(2001);invalid(context,'guidance.criteria');
  const contradictory=setup();contradictory.artifact.criteria[0].reasonCode='unsupported_assertion';invalid(contradictory,'guidance.criteria');
  assert.ok(Object.isFrozen(GUIDANCE_REASON_CODES));
});

test('every request, expectation and answer/telemetry change invalidates an old review',()=>{
  const mutations=[ctx=>ctx.testCase.question+='!',ctx=>ctx.testCase.history.push({role:'user',content:'Another request'}),
    ctx=>ctx.testCase.route+='/records',ctx=>ctx.testCase.language='zh-TW',ctx=>ctx.testCase.mode='empty',
    ctx=>ctx.testCase.expected.requiredTools.push('profile'),ctx=>ctx.envelope.body.answer+='\n',
    ctx=>ctx.envelope.body.views=[{title:'Private fact'}],ctx=>ctx.envelope.body.proposedAction={kind:'update_profile'},
    ctx=>ctx.envelope.events.push({kind:'profile',status:'done'}),ctx=>ctx.envelope.events[0].status='failed',
    ctx=>ctx.envelope.statusCode=500,ctx=>ctx.envelope.execution='deterministic',ctx=>ctx.envelope.elapsedMs=65000,
    ctx=>ctx.envelope.fixtureIntegrityFailed=true,ctx=>ctx.envelope.actionReadback={confirmed:true}];
  for(const change of mutations){const context=setup();change(context);invalid(context,'guidance.binding');}
});

test('run, suite, revision, fixture, optional fixture digest and case identities bind exactly',()=>{
  for(const key of ['runId','finalSuiteHash','sourceRevision','caseId','inputHash','responseHash','fixtureKey','rubricVersion']){
    const context=setup();context.artifact.binding[key]+='x';invalid(context,'guidance.binding');
  }
  const context=setup();const revised=buildGuidanceReviewBinding({...identity,...context,fixtureStateHash:'b'.repeat(64)});
  assert.equal(revised.fixtureStateHash,'b'.repeat(64));
  invalid({...context,binding:revised},'guidance.binding');
  context.binding=revised;context.artifact.binding={...revised};assert.equal(validate(context).passed,true);
  context.artifact.binding.fixtureStateHash='c'.repeat(64);invalid(context,'guidance.binding');
  for(const patch of [{runId:''},{finalSuiteHash:'short'},{sourceRevision:''},{fixtureStateHash:'x'}])
    assert.throws(()=>buildGuidanceReviewBinding({...identity,...setup(),...patch}),TypeError);
  const foreign=setup();foreign.envelope.fixtureKey='foreign';invalid(foreign,'guidance.binding');
});

test('object key order is stable but arrays, strings and primitive types retain their meaning',()=>{
  const context=setup(),base=context.binding;
  const same=buildGuidanceReviewBinding({...identity,testCase:{...context.testCase,expected:Object.fromEntries(Object.entries(context.testCase.expected).reverse())},envelope:{...context.envelope,body:Object.fromEntries(Object.entries(context.envelope.body).reverse())}});
  assert.deepEqual(same,base);
  const input={...context.testCase,history:[{role:'user',content:'A'},{role:'assistant',content:'B'}]};
  const first=buildGuidanceReviewBinding({...identity,testCase:input,envelope:context.envelope});input.history.reverse();
  assert.notEqual(first.inputHash,buildGuidanceReviewBinding({...identity,testCase:input,envelope:context.envelope}).inputHash);
  const responses=[0,'0',null,false,'false','',undefined].map(value=>buildGuidanceReviewBinding({...identity,testCase:context.testCase,envelope:{...context.envelope,body:{answer,value}}}).responseHash);
  assert.equal(new Set(responses).size,responses.length);
});

test('JSON binding rejects cycles, accessors and non-JSON state without evaluating getters',()=>{
  const context=setup(),cyclic={};cyclic.self=cyclic;
  for(const value of [NaN,Infinity,1n,new Date(),()=>true,cyclic])
    assert.throws(()=>buildGuidanceReviewBinding({...identity,...context,envelope:{...context.envelope,body:{answer,value}}}),TypeError);
  let read=false;const body={answer};Object.defineProperty(body,'danger',{enumerable:true,get(){read=true;return 'secret';}});
  assert.throws(()=>buildGuidanceReviewBinding({...identity,...context,envelope:{...context.envelope,body}}),TypeError);assert.equal(read,false);
});

test('infrastructure failures and empty answers cannot receive a passed independent assessment',()=>{
  for(const patch of [{statusCode:500},{executed:false},{failureKind:'infrastructure'},{failureKind:'setup'},
    {body:{answer:''}},{body:{answer:' '.repeat(4)}},{body:{answer:'x'.repeat(64001)}}]){
    const context=setup({envelope:{...envelope(),...patch}});invalid(context,'guidance.response');
  }
});

test('validation reports do not echo rejected artifact values or claim reviewer authentication',()=>{
  const context=setup(),secret='sensitive-marker@example.invalid';context.artifact.criteria[0].reasonCode=secret;
  const output=validate(context);assert.doesNotMatch(JSON.stringify(output),/sensitive-marker/);
  assert.equal(Object.hasOwn(output,'authenticatedReviewer'),false);
  assert.equal(Object.hasOwn(output,'releaseReady'),false);
});
