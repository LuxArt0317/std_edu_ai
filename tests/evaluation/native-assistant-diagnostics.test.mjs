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

test('academic attendance: accept explicit weekly non-availability without weakening verified scope or non-derivation',async()=>{
  const source=await readFile(new URL('../integration/academic-attendance-live.mjs',import.meta.url),'utf8');
  const helper=between(source,'function assertWeeklyAttendanceLimitation(', '\nfunction assistantDiagnostic(');
  const check=between(source,'function checkedAssistantResult','\nconst handlers=');
  const base='/school-affairs/services/14-1';
  // Evaluate isolated assertions only. Never import or execute the live harness.
  const validate=vm.runInNewContext(check+'\n'+helper+"\nresponse=>{checkedAssistantResult('/api/affairs-assistant',{status:200,body:response});assertWeeklyAttendanceLimitation(response);};",
    {assert,URL,origin:'https://synthetic.invalid',assistantMode:'deployed_model',base,console:{log(){}}});
  assert.match(source,/const weekly=await answer\(first,'How many hours was I absent last week\?'\);assertWeeklyAttendanceLimitation\(weekly\)/,
    'The actual-model weekly question must retain the normal verified-answer gate before its semantic assertion.');
  const result=answer=>({status:'answered',answer,verification:{status:'verified'},grounding:{source:'account',webSearched:false},citations:[{url:base+'/detail'}]});
  const exact='I can’t determine how many hours you were absent last week from the available record. This attendance source explicitly does not provide daily, weekly, or monthly absence-hour totals, and its detail rows cannot be converted into hours. The loaded account snapshot is marked as local demonstration data rather than official university data; it contains an explicitly designated current term (academic year 115, semester 1), but no selected weekly statistic.';
  // Text-only wording acceptance supplies a valid detail citation. The actual
  // saved production envelope is checked separately below; it lacked that link.
  for(const answer of [
    exact,
    'Only explicit term-level hour statistics are stored; daily, weekly and monthly hour totals are unavailable. Detail row counts and period labels cannot be converted into hours.',
    'Weekly absence hours are not recorded. I cannot derive hours from detail rows.',
    'This source does not provide weekly absence-hour totals. I can’t infer hours from period labels.',
    'Weekly absence hours are unavailable; the separately recorded term absence total is 0 hours. Detail rows cannot be converted into hours.',
    'Weekly absence hours are unavailable, and the separately recorded term absence total is 0 hours. Detail rows cannot be converted into hours.',
    'The separately recorded semester total is 22.5 hours, while weekly absence hours are unavailable. Detail rows cannot be converted into hours.',
    'Weekly absence hours are unavailable; recorded term absence hours: 0. Detail rows cannot be converted into hours.',
    'Weekly absence hours are unavailable, and 0 hours is the separately recorded semester total. Detail rows cannot be converted into hours.',
    'Weekly absence hours are unavailable, and the separately recorded total for this semester is 0 hours. Detail rows cannot be converted into hours.',
    '站內僅儲存明列的學期時數統計，沒有每日、每週或每月時數加總。不能由明細筆數或節次換算時數。',
  ])assert.doesNotThrow(()=>validate(result(answer)));
  for(const answer of [
    "I don't know.",
    'Not available.',
    'Weekly grades are unavailable. Detail rows cannot be converted into hours.',
    'Weekly absence hours are shown. The phone number is unavailable. Detail rows cannot be converted into hours.',
    'Weekly absence hours are unavailable.',
    'Weekly absence hours are unavailable. I cannot convert currencies.',
    'Your weekly total is 8 hours. Weekly absence hours are unavailable. Detail rows cannot be converted into hours.',
    'Weekly absence hours are unavailable. Detail rows cannot be converted into hours. You were absent 8 hours last week.',
    'Weekly absence hours are unavailable. Detail rows cannot be converted into hours. You had 8 weekly absence hours.',
    'Weekly absence hours are unavailable. Detail rows cannot be converted into hours. Last week, you missed 8 hours.',
    'Weekly absence hours are unavailable. Detail rows cannot be converted into hours. Your weekly total is 8 hours, and your term total is 0 hours.',
    'Weekly absence hours are unavailable. Detail rows cannot be converted into hours. Your term record says you missed 8 hours last week.',
    'Weekly absence hours are unavailable. Detail rows cannot be converted into hours. Your weekly absence total for this term is 8 hours.',
    'Weekly absence hours are unavailable. Detail rows cannot be converted into hours. Your weekly absence hours: 8.',
    'Weekly absence hours are unavailable. Detail rows cannot be converted into hours. Last week your absence hours amounted to 8.',
    'Weekly absence hours are unavailable. Detail rows cannot be converted into hours. Last week your absence hours were 8.',
    'Weekly absence hours are unavailable. Detail rows cannot be converted into hours. Your weekly total is 8 hours is the recorded semester total.',
    '站內沒有每週時數加總。不能由明細筆數換算時數。上週缺課時數：8。',
  ])assert.throws(()=>validate(result(answer)),error=>error instanceof assert.AssertionError,answer);
  for(const mutate of [row=>{row.status='abstained';},row=>{row.verification.status='unverified';},row=>{delete row.verification;},
    row=>{row.grounding.source='public';},row=>{row.grounding.webSearched=true;},row=>{row.citations=[{url:'https://www.stu.edu.tw/'}];},
    row=>{row.citations=[{url:base}];},row=>{row.proposedAction={kind:'create_task'};}]){
    const row=result(exact);mutate(row);
    assert.throws(()=>validate(row),error=>error instanceof assert.AssertionError);
  }
  const linked=result(exact+' View the recorded absence details: '+base+'/detail');linked.citations=[{url:base}];
  assert.doesNotThrow(()=>validate(linked),'The original local detail-link alternative remains supported.');
  const savedProductionEnvelope={
    ...result(exact),verification:{status:'verified',attempts:2},
    grounding:{source:'account',webSearched:false,checkedAt:'2026-11-13T05:48:07.952Z',degraded:false},
    citations:[
      {chunkId:'account-scope',claim:'Retrieved evidence for this answer',title:'Account access and record provenance',sourceName:'My stu.best records',url:'/school-affairs/records',locator:null,effectiveAt:null,reviewedAt:null},
      {chunkId:'account:academicAttendance',claim:'Retrieved evidence for this answer',title:'Native absence statistics, roll-call details and explicitly designated current term; stored term hours are independent of details and local leave requests. No daily/weekly/monthly hour aggregation.',sourceName:'My stu.best records',url:base,locator:null,effectiveAt:null,reviewedAt:null},
    ],
  };
  assert.throws(()=>validate(savedProductionEnvelope),error=>error instanceof assert.AssertionError&&error.message==='The answer must retain the local absence-detail destination.',
    'The exact saved answer/verification/grounding/citation fields still fail their missing detail-link requirement.');
});
