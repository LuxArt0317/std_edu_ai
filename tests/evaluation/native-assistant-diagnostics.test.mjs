import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import vm from 'node:vm';

const names=['academic-grades','graduation-review','academic-attendance'];
function between(source,start,end){
  const from=source.indexOf(start),to=source.indexOf(end,from);
  assert.ok(from>=0&&to>from,'Expected isolated harness function boundaries.');
  return source.slice(from,to);
}

for(const name of names)test(name+': persist sanitized synthetic diagnostics before unchanged model assertions',async()=>{
  // Evaluate only the small answer/diagnostic functions, never the executable
  // harness, its imports, environment files, database, authentication or network.
  const source=await readFile(new URL('../integration/'+name+'-live.mjs',import.meta.url),'utf8');
  const check=between(source,'function checkedAssistantResult','\nconst handlers=');
  const answerStart=name==='academic-attendance'?'async function answer(':'const answer=async(';
  const answerEnd=name==='academic-grades'?'\nasync function fixture(':name==='graduation-review'?'\nfunction assertReport(':'\nfunction ownBundle(';
  const diagnostic=between(source,'function assistantDiagnostic(', '\n'+answerStart);
  const answerSource=between(source,answerStart,answerEnd);
  const invoke=between(source,'async function invoke(','\nasync function request(');
  assert.doesNotMatch(invoke,/checkedAssistantResult/,'The transport must not fail before answer diagnostics.');
  assert.equal((source.match(/request\('\/api\/affairs-assistant'/g)||[]).length,1,'Every explicit assistant request goes through answer().');
  assert.match(answerSource,/checkedAssistantResult\('\/api\/affairs-assistant'/);
  assert.match(source,/assert\.equal\(result\.status,options\.status\?\?200/,'HTTP status assertions remain in request().');

  for(const [mode,status,verification,fails] of [
    ['deployed_model','abstained',{status:'unverified',reason:'unsupported_claims'},true],
    ['deployed_model','answered',{status:'unverified'},true],
    ['deployed_model','answered',{status:'verified'},false],
    ['local_deterministic','answered',undefined,false],
    ['local_deterministic','answered',{status:'verified'},true],
  ]){
    const writes=[];
    const result={status,answer:'Synthetic saved answer fixture-token owner-private@example.invalid owner-private-id Owner Private Name',verification,
      activity:[{kind:'verification',title:'Checked fixture record',detail:'owner-private-token',access_token:'hidden-field',userId:'hidden-owner'}],
      grounding:{source:'account',webSearched:false},citations:[{url:'/school-affairs/services/14-1'}],
      rawProviderPayload:{secret:'must not be copied'},refresh_token:'must not be copied'};
    const sandbox={assert,URL,console:{log(){}},origin:'https://synthetic.invalid',assistantMode:mode,
      root:'/school-affairs/services/13-1',path:'/school-affairs/services/13-1/graduation',base:'/school-affairs/services/14-1',
      output:'synthetic-output',answerSequence:0,checks:[],deployment:{supabase:{ownerEmail:'owner-private@example.invalid'}},
      ownerSession:{access_token:'owner-private-token',user:{id:'owner-private-id',user_metadata:{full_name:'Owner Private Name'}}},
      request:async()=>result,mkdir:async()=>{},writeFile:async(path,data)=>{writes.push({path,data});}};
    const answer=vm.runInNewContext(check+'\n'+diagnostic+'\n'+answerSource+'\nanswer;',sandbox);
    const promise=answer({access_token:'fixture-token',user:{id:'synthetic-fixture-id'}},'Synthetic fixture question');
    if(fails)await assert.rejects(promise,error=>error instanceof assert.AssertionError);
    else assert.equal(await promise,result);
    assert.equal(writes.length,1,'The response must already be saved when a semantic assertion fails.');
    const saved=JSON.parse(writes[0].data);
    assert.equal(saved.question,'Synthetic fixture question');assert.equal(saved.status,status);assert.match(saved.answer,/Synthetic saved answer/);
    assert.deepEqual(saved.verification,verification);assert.equal(saved.activity[0].title,'Checked fixture record');
    assert.doesNotMatch(writes[0].data,/fixture-token|owner-private|Owner Private Name|hidden-field|hidden-owner|must not be copied|rawProviderPayload/);
    if(name==='graduation-review')assert.equal(writes[0].path,'synthetic-output/last-assistant.json');
  }
});

test('academic grades: accept grounded choose/which clarification with distinct supported views',async()=>{
  const source=await readFile(new URL('../integration/academic-grades-live.mjs',import.meta.url),'utf8');
  const helper=between(source,'function assertGradeViewClarification(', '\nfunction assistantDiagnostic(');
  const validate=vm.runInNewContext(helper+'\nassertGradeViewClarification;',{assert});
  assert.match(source,/const ambiguous=await answer\(first,'Show my grades',''\);assertGradeViewClarification\(ambiguous\)/,'The live case must use the reviewed clarification assertion after normal verified-answer checks.');
  const result=answer=>({status:'answered',answer,verification:{status:'verified'},grounding:{source:'account',webSearched:false},citations:[{url:'/school-affairs/services/13-1'}]});
  for(const answer of [
    'I can show your saved Academic Services grades, but no grade view was selected in this request, so no rows were returned for display.\n\nPlease choose one: transcript, warning grades, term summaries, semester ranking, or English-requirement display. Current-term, transfer, and cycle grade views are unavailable in these records.',
    'Which grade view would you like: transcript or warning grades?',
    'Please specify the transcript, warning grades, semester ranking or current-term query; these are separate academic views.',
    '請指定歷年成績、預警成績、學期排名或當期成績；這些查詢的資料範圍不同。',
  ])assert.doesNotThrow(()=>validate(result(answer)));
  for(const answer of ["I don't know.",'Please choose a view.','Please choose transcript or transcript.','Choose GPA, current-term grades, or transfer grades.','Transcript and warning grades are available.'])
    assert.throws(()=>validate(result(answer)),error=>error instanceof assert.AssertionError);
  for(const mutate of [row=>{row.status='abstained';},row=>{row.grounding.source='public';},row=>{row.grounding.webSearched=true;},row=>{row.citations=[{url:'https://www.stu.edu.tw/'}];},row=>{row.proposedAction={kind:'create_task'};}]){
    const row=result('Please choose transcript or warning grades.');mutate(row);
    assert.throws(()=>validate(row),error=>error instanceof assert.AssertionError);
  }
});
