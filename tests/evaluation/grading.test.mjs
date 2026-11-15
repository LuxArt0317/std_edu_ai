import assert from 'node:assert/strict';
import {test} from 'node:test';
import {gradeCase,extractAnswerLinks} from './grading.mjs';

const record={id:'fees.balance',domain:'charges',mode:'record',fixtureKey:'charges',language:'en',
  expected:{behavior:'answer',requiredText:['QA tuition'],forbiddenText:['999999','other-account-marker'],requiredLinks:['/school-affairs/services/39-1'],requiredTools:['charges'],provenance:'sample',
    facts:[{label:'remaining',labels:['balance','餘額'],kind:'number',values:[23000],forbiddenValues:[999999]}]},capability:{level:'native',limitation:'Local sample data.'}};
function response(answer='Your sample QA tuition balance remaining is NT$23,000.',extra={}){
  return {statusCode:200,execution:'live-model',sourceRevision:'revision-a',fixtureKey:'charges',elapsedMs:120,
    body:{status:'answered',answer,citations:[{chunkId:'account:charges',url:'/school-affairs/services/39-1'}],verification:{status:'verified',attempts:1},...extra}};
}
const failure=(result,id)=>assert.ok(result.failures.some(item=>item.id===id),JSON.stringify(result));

test('independent amount, provenance, local link and selected evidence pass',()=>{
  const result=gradeCase(record,response());assert.equal(result.passed,true,JSON.stringify(result));
  assert.deepEqual(result.toolEvidence,{attempted:[],observed:[],claimed:['charges'],terminalStates:{}});
});
test('a reported third check needs matching observed activity and the same read scope',()=>{
  const envelope=response(undefined,{verification:{status:'verified',attempts:3}});
  failure(gradeCase(record,envelope),'answer.verification.deeperObserved');
  envelope.events=[
    {kind:'verification-deeper-review',status:'complete'},
    {kind:'verification-3',status:'complete'},
  ];
  assert.equal(gradeCase(record,envelope).passed,true);
  envelope.events.push({kind:'account-read:charges:3',status:'complete'});
  failure(gradeCase(record,envelope),'answer.verification.deeperObserved');
});
test('self-reported verified and the right substring cannot hide a contradiction',()=>{
  const result=gradeCase(record,response('Your sample QA tuition balance is NT$23,000. Your remaining balance is 999999.'));
  assert.equal(result.passed,false);failure(result,'text.forbidden.0');failure(result,'fact.0');
});
test('abstaining when known records exist is a failure',()=>{
  const result=gradeCase(record,response('I cannot verify the answer.',{status:'abstained',verification:{status:'unverified',attempts:2}}));
  failure(result,'answer.behavior');failure(result,'answer.verification');
});
test('unavailable cannot pass an invented answer or an undeclared refusal oracle',()=>{
  const testCase={...record,mode:'empty',expected:{behavior:'unavailable',limitation:true}};
  failure(gradeCase(testCase,response('You have a grade of100 and all fees are paid.')),'answer.limitation');
  assert.equal(gradeCase(testCase,response('There are no saved records in this local collection.')).passed,true);
  assert.equal(gradeCase(testCase,response('目前沒有儲存資料。')).passed,true);
  failure(gradeCase({...testCase,expected:{behavior:'unavailable'}},response('Records are unavailable.')),'oracle.limitation');
  failure(gradeCase({...testCase,expected:{behavior:'unavailable',limitation:'no saved fee records'}},response('There are no saved course records.')),'answer.limitation.specific');
});
test('record case without an independent fact oracle fails even if verifier says yes',()=>{
  const testCase={...record,expected:{...record.expected,facts:[]}};
  failure(gradeCase(testCase,response()),'oracle.independent');
});
test('numeric token checks distinguish 8 from 80 and one-letter grades from prose',()=>{
  const testCase={...record,expected:{behavior:'answer',requiredText:['8','P'],facts:[{label:'grade',kind:'text',values:['P']}]}};
  const result=gradeCase(testCase,response('Sample completed80 hours. Grade Pending.'));
  failure(result,'text.required.0');failure(result,'text.required.1');failure(result,'fact.0');
  assert.equal(gradeCase(testCase,response('Sample completed8 hours. Grade P.')).passed,false,'An attached8 must not match numeric8');
  assert.equal(gradeCase(testCase,response('Sample completed 8 hours. Grade P.')).passed,true);
});
test('correct value attached to an unrelated label does not satisfy a fact',()=>{
  failure(gradeCase(record,response('Your sample QA tuition balance is unknown.\nAnother student has NT$23,000.')),'fact.0');
});
test('a negated correct value fails rather than receiving substring credit',()=>{
  failure(gradeCase(record,response('Your sample QA tuition balance is not NT$23,000.')),'fact.0');
});
test('Chinese label aliases, full-width numbers and alternatives work without English prose',()=>{
  const testCase={...record,expected:{behavior:'answer',provenance:'sample',facts:[{label:'餘額',kind:'number',values:[23000]},{label:'狀態',kind:'text',values:[{anyOf:['審核中','in review','in_review']}]}]}};
  assert.equal(gradeCase(testCase,response('範例資料：餘額ＮＴ＄２３，０００。狀態：審核中。')).passed,true);
  assert.equal(gradeCase(testCase,response('範例資料：餘額23,000元。狀態：審核中。')).passed,true);
});
test('exclusive numeric fact rejects extra amounts while nonexclusive arithmetic supports operands',()=>{
  const expected={...record.expected,facts:[{label:'balance',kind:'number',values:[23000],exclusive:true}]};
  failure(gradeCase({...record,expected},response('Sample QA tuition balance 23,000 or 24,000.')),'fact.0');
  expected.facts[0].allowedNumbers=[28000,5000];
  assert.equal(gradeCase({...record,expected},response('Sample QA tuition balance: 28,000 minus 5,000 equals 23,000.')).passed,true);
});
test('expected set checks both recall and explicit distractor exclusion',()=>{
  const testCase={...record,expected:{behavior:'answer',exactLists:[{label:'unfinished',expected:['Lab Alpha','Lab Beta'],forbidden:['Completed Gamma','Foreign Delta']}]}};
  assert.equal(gradeCase(testCase,response('Unfinished: Lab Alpha and Lab Beta.')).passed,true);
  failure(gradeCase(testCase,response('Unfinished: Lab Alpha, Lab Beta and Completed Gamma.')),'list.0.exclude.0');
  failure(gradeCase(testCase,response('Unfinished: Lab Alpha.')),'list.0.include.1');
});
test('fixture identity and transport error cannot masquerade as semantic passes',()=>{
  failure(gradeCase(record,{...response(),fixtureKey:'someone-else'}),'fixture.identity');
  failure(gradeCase(record,{...response(),statusCode:503}),'transport.status');
});
test('public and anonymous outcomes never receive private-answer credit',()=>{
  const testCase={id:'private.denial',domain:'privacy',mode:'action-boundary',expected:{behavior:'denial',statusCode:401,forbiddenAccountMarkers:['other-account-marker']}};
  const result=gradeCase(testCase,{statusCode:401,body:{error:'Sign in required'},execution:'live-model'});
  assert.equal(result.passed,true,JSON.stringify(result));
  failure(gradeCase(record,response('other-account-marker and sample QA tuition balance23,000')),'text.forbidden.1');
});
test('foreign account values cannot hide in rich cards while prose looks correct',()=>{
  failure(gradeCase(record,response(undefined,{views:[{url:'/dtm',rows:[['other-account-marker']]}]})),'text.forbidden.1');
});
test('unsafe links and missing required destination fail',()=>{
  const result=gradeCase(record,response('Sample QA tuition balance23,000. [bad](javascript:alert(1))',{citations:[]}));
  failure(result,'links.safe');failure(result,'links.required.0');
  assert.deepEqual(extractAnswerLinks({answer:'[open](/dtm)',citations:[{url:'/dtm'}],views:[{url:'/school-affairs'}]}),['/dtm','/school-affairs']);
});
test('evidence selection is distinguished from observed tool completion',()=>{
  const testCase={...record,expected:{...record.expected,requireToolExecution:true}};
  failure(gradeCase(testCase,response()),'tool.charges');
  assert.equal(gradeCase(testCase,{...response(),toolCalls:[{name:'charges',status:'complete'}]}).passed,true);
  failure(gradeCase(testCase,{...response(),toolCalls:[{name:'charges',status:'running'}]}),'tool.charges');
});
test('streamed projection completion counts as observed evidence but running and forged kinds do not',()=>{
  const testCase={...record,expected:{...record.expected,requireToolExecution:true}};
  for(const attempt of [1,2]){
    const result=gradeCase(testCase,{...response(),events:[{kind:`account-read:charges:${attempt}`,status:'complete'}]});
    assert.equal(result.passed,true);assert.deepEqual(result.toolEvidence.observed,['charges']);
  }
  for(const event of [{kind:'account-read:charges:1',status:'running'},{kind:'account-read:charges:3',status:'complete'},{kind:'account-read:charges:1-extra',status:'complete'}])failure(gradeCase(testCase,{...response(),events:[event]}),'tool.charges');
});
test('read requests cannot smuggle actions',()=>{
  failure(gradeCase(record,response(undefined,{proposedAction:{kind:'create_task',payload:{title:'Unexpected'}}})),'action.none');
});
test('proposals must have the exact action payload and wait for confirmation',()=>{
  const testCase={id:'action.task',domain:'tasks',mode:'action-boundary',expected:{behavior:'proposal',action:{kind:'create_task',payload:{title:'Read lab instructions'}}}};
  const envelope={statusCode:200,execution:'live-model',body:{status:'answered',answer:'Review and confirm this task.',proposedAction:{kind:'create_task',requestId:'10000000-0000-4000-8000-000000000001',payload:{title:'Read lab instructions'}}},stateBefore:{tasks:0},stateAfterProposal:{tasks:0}};
  assert.equal(gradeCase(testCase,envelope).passed,true);
  failure(gradeCase(testCase,{...envelope,stateAfterProposal:{tasks:1}}),'action.noPrematureWrite');
  const changed=structuredClone(envelope);changed.body.proposedAction.payload.user_id='other';
  failure(gradeCase(testCase,changed),'action.payload');
});
test('confirmed mutation requires an independent backend readback',()=>{
  const testCase={id:'action.saved',domain:'tasks',mode:'action-boundary',expected:{behavior:'answer',confirmedState:{completed:true}}};
  const envelope={statusCode:200,execution:'live-model',body:{status:'answered',answer:'Saved.'}};
  failure(gradeCase(testCase,envelope),'action.readback');
  assert.equal(gradeCase(testCase,{...envelope,stateAfterConfirmation:{completed:true}}).passed,true);
});
test('timing and visible completed tool activity are declared independently',()=>{
  const testCase={...record,expected:{...record.expected,maxElapsedMs:55000,requiredEvents:['verification-1']}};
  failure(gradeCase(testCase,response()),'event.verification-1');
  assert.equal(gradeCase(testCase,{...response(),events:[{kind:'verification-1',status:'complete'}]}).passed,true);
  failure(gradeCase(testCase,{...response(),elapsedMs:60000}),'performance.deadline');
});
