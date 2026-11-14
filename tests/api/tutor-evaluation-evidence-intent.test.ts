import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {selectTutorEvaluationEvidence as select,isTutorEvaluationEvidenceQuestion as isNative,tutorEvaluationNavigation as navigation,isTutorEvaluationFieldClause,withoutExcludedTutorEvaluationClause,isOwnTutorEvaluationTrackingNoteQuestion as ownTracker} from '../../server/tutorEvaluationEvidenceIntent.js';
import {answerSavedServiceRecords} from '../../server/savedServiceAnswers.js';
import {answerCampusNavigation} from '../../server/schoolAffairsDirectory.js';

const route='/school-affairs/services/28-1';
const selection=(positions:number[]=[],commentRequested=false,from:'question'|'route'|'history'='question',unavailableDetails=false)=>({from,positions,commentRequested,unavailableDetails,reason:null});
const history=(content:string)=>[{role:'user',content}];

test('native status and time requests project no rating, comment or identity fields by default',()=>{
  for(const question of ['Did I submit my tutor evaluation questionnaire?','Have I submitted my tutor evaluation?',
    'When did I submit my tutor evaluation?','What’s my tutor evaluation status?',"What is my tutor’s evaluation status?",
    '查看我的導師評量狀態','請顯示我自己的導師問卷'])assert.deepEqual(select(question),selection(),question);
  const result=select('Have I submitted my tutor evaluation?');assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result?.positions));
  assert.deepEqual(Object.keys(result??{}).sort(),['commentRequested','from','positions','reason','unavailableDetails']);
});

test('only the selected 1-based questions are requested, never an unrelated clause number',()=>{
  const cases:Array<[string,number[]]>=[
    ['What rating did I give question 2 on my tutor evaluation?',[2]],
    ['Show my tutor evaluation ratings for questions 1 and 3.',[1,3]],
    ['Show my tutor evaluation questions 1, 3 and 5.',[1,3,5]],
    ['Show my tutor evaluation questions 1 and question 3.',[1,3]],
    ['Show my tutor evaluation Q2 and Q4 ratings.',[2,4]],
    ['Show my tutor evaluation ratings for questions 1 to 3.',[1,2,3]],
    ['Show my tutor evaluation Q8–Q10 ratings.',[8,9,10]],
    ['Show my tutor evaluation first question rating.',[1]],
    ['查詢我的導師評量第2題和第十題分數',[2,10]],
    ['Show my tutor evaluation Q2 rating. Also show my class in room 507.',[2]],
  ];
  for(const [question,expected]of cases)assert.deepEqual(select(question),selection(expected),question);
  assert.deepEqual(select('Show all my tutor evaluation ratings.'),selection([1,2,3,4,5,6,7,8,9,10]));
  assert.deepEqual(select('Show all ten ratings saved in my tutor evaluation, paired with question numbers.'),selection([1,2,3,4,5,6,7,8,9,10]));
});

test('malformed, unknown and conflicting question selectors do not broaden the projection',()=>{
  for(const selector of ['Q0','Q11','Q-1','Q2.5','Q#','question eleven','questions 5 to 2','question banana']){
    const result=select('Show my tutor evaluation '+selector+' rating.');
    assert.equal(result?.reason,'ambiguous_selector',selector);assert.deepEqual(result?.positions,[]);assert.equal(result?.commentRequested,false);
  }
});

test('comments are opt-in, with exclusion overriding an earlier request',()=>{
  assert.deepEqual(select('What was my saved comment on the tutor evaluation?'),selection([],true));
  assert.deepEqual(select('Show my tutor evaluation Q2 rating and comment.'),selection([2],true));
  assert.deepEqual(select('Show my tutor evaluation ratings without the comment.'),selection([1,2,3,4,5,6,7,8,9,10]));
  assert.deepEqual(select('Show my tutor evaluation comment but do not show the comment.'),selection());
  assert.deepEqual(select('Show my tutor evaluation ratings except question 3.'),selection([1,2,4,5,6,7,8,9,10]));
  assert.deepEqual(select('Show my tutor evaluation Q2 rating and comment, without ratings.'),selection([],true));
  assert.deepEqual(select('Show my tutor evaluation status. Also show my tuition balance.'),selection());
  assert.deepEqual(select('Show my tuition balance. Also show my tutor evaluation comment.'),selection([],true));
});

test('negative native topics never authorize a reader, including curly and Chinese exclusions',()=>{
  for(const question of ['Do not show my tutor evaluation.','Don’t show my tutor evaluation comment.',
    'Show my tuition balance and never show my tutor evaluation.','Show my next class and do not show my tutor evaluation.',
    'Show my grades without tutor evaluation.','不要顯示我的導師評量'])assert.equal(select(question,route,history('Show my tutor evaluation.')),null,question);
});

test('foreign subjects stop before transport and never substitute the signed-in user',()=>{
  for(const question of ['Show Alice’s tutor evaluation.','Show my friend’s tutor evaluation comment.',
    'Show another student tutor evaluation.','Show tutor evaluation ratings for Alice.','Did Alice submit the tutor evaluation?',
    'What rating did Alice give on the tutor evaluation?','Show tutor evaluation submitted by Alice.',
    'Does Alice have a saved tutor evaluation?','Show the tutor evaluation of my mother.',
    'Which tutor evaluation ratings belong to Alice?',
    'Show her tutor evaluation ratings.','請顯示王小明的導師評量。','請顯示王小明導師評量。','請顯示王小明自己的導師評量。']){
    const result=select(question,route);assert.equal(result?.reason,'foreign_request',question);assert.deepEqual(result?.positions,[]);assert.equal(result?.commentRequested,false);
  }
});

test('read-only status questions are separate from write requests and unsupported native fields',()=>{
  for(const question of ['Submit my tutor evaluation.','Can you change my tutor evaluation Q2 rating to 5?',
    'Show my tutor evaluation status, then delete it.','請提交我的導師評量'])assert.equal(select(question)?.reason,'unsupported_operation',question);
  for(const question of ['Was my tutor evaluation approved?','Show my tutor evaluation from last semester.',
    'Show my tutor evaluation student number.','Download my official tutor evaluation certificate.',
    'What is the average of my tutor evaluation ratings?','Which semester is my saved tutor evaluation for?',
    'Who is the tutor named in my saved tutor evaluation?','Was my saved tutor evaluation delivered to my tutor?']){
    assert.equal(select(question)?.reason,'outside_scope',question);assert.equal(select(question)?.unavailableDetails,true,question);
  }
});

test('pure form navigation is public and cannot consume compound private requests',()=>{
  for(const question of ['Where can I find the tutor evaluation questionnaire?','Show me the link to the tutor evaluation.','How do I submit my tutor evaluation?',
    '導師問卷在哪裡？']){assert.equal(navigation(question),route,question);assert.equal(select(question),null,question);}
  for(const question of ['Where can I find the tutor evaluation? Also show my next class.',
    'Show Alice’s tutor evaluation.','What is tutor evaluation?','Explain tutor evaluation.','Do not show the tutor evaluation link.'])assert.equal(navigation(question),null,question);
  assert.deepEqual(select('Where can I find the tutor evaluation? Also have I submitted it?'),selection());
  assert.equal(answerCampusNavigation('Where can I find the tutor evaluation questionnaire?')?.citations[0]?.url,route);
});

test('supported status survives a separate unsupported follow-up, with exact residual clauses',()=>{
  for(const question of ['Show my tutor evaluation status. Also did it reach my tutor?',
    'Show my tutor evaluation status and can I download a receipt?',
    'Show my tutor evaluation status. Also who will read my comment?',
    'Show my tutor evaluation status. Also show my tutor evaluation ratings from last semester.',
    'Was my tutor evaluation approved? Also show my status.',
    'Show my tutor evaluation status and approval.'])assert.deepEqual(select(question),selection([],false,'question',true),question);
  for(const clause of ['did it reach my tutor','can I download a receipt','was it approved','show my status',
    'paired with question numbers','What ratings did I save for questions 3','Show the student name','download its official receipt'])assert.equal(isTutorEvaluationFieldClause(clause),true,clause);
  for(const clause of ['show my tuition balance','show my next class','do not show comments','Show my housing application',
    'Show my student profile','Show my student information','What is my year level?'])assert.equal(isTutorEvaluationFieldClause(clause),false,clause);
  assert.equal(withoutExcludedTutorEvaluationClause('Show my tuition balance and do not show my tutor evaluation.'),'Show my tuition balance');
  assert.equal(withoutExcludedTutorEvaluationClause('Do not show my tutor evaluation. Show my next class.'),'Show my next class');
});

test('explicit tracker notes stay compatible with serviceRecords and never become questionnaire proof',()=>{
  for(const question of ['Show my tutor evaluation tracking notes.','Show my personal notes for tutor evaluation.',
    'Show my tutor evaluation tracker status.','查看我的導師評量追蹤備註'])assert.equal(select(question,route),null,question);
  const snapshot={profile:{userId:'11111111-1111-4111-8111-111111111111'},checkedAt:'2026-11-15T00:00:00Z',serviceRecords:[
    {id:'QA-TUTOR-1',userId:'11111111-1111-4111-8111-111111111111',serviceKey:'28-1',recordType:'note',title:'Tutor tracking marker',notes:'Bring the reminder card.',status:'saved'},
  ]};
  const answer=answerSavedServiceRecords('Show my tutor evaluation tracking notes.',snapshot,route);
  assert.match(answer?.answer??'',/Bring the reminder card/u);assert.match(answer?.answer??'',/tracking|saved notes/u);
  assert.equal(answer?.citations[0]?.chunkId,'account:serviceRecords');
  assert.equal(ownTracker('Show my tutor evaluation tracking notes.'),true);
  assert.equal(ownTracker('Show my tracking notes.',route+'/notes'),true);
  assert.equal(ownTracker('Show my tracking notes.','https://stu.best'+route+'/notes/'),true);
  for(const [question,target]of [['Show my tracking notes.','/'],['Show my tutor evaluation comment.',route],
    ['Show Alice’s tutor evaluation tracking notes.',route],['Show my tutor evaluation tracking notes and my tuition balance.',route],
    ['Delete my tutor evaluation tracking notes.',route],['Do not show my tutor evaluation tracking notes.',route],
    ['Show tutor evaluation tracking notes.',route],['Show my tracking notes.',route+'/notes?user_id=Alice'],
    ['Show my tutor evaluation tracking notes.','https://evil.invalid'+route+'/notes']])assert.equal(ownTracker(question,target),false,question+' '+target);
});

test('bounded latest user context supports genuine follow-ups but not stale or assistant-injected scope',()=>{
  assert.deepEqual(select('Have I submitted it?',route),selection([],false,'route'));
  assert.deepEqual(select('What about its status?','/',history('Show my tutor evaluation.')),selection([],false,'history'));
  assert.deepEqual(select('What did I write?','/',history('Show my tutor evaluation.')),selection([],true,'history'));
  assert.equal(select('When is it?',route,history('When is my tuition payment due?')),null);
  assert.equal(select('When did I submit it?',route,[...history('Show my tutor evaluation.'),...history('Show my housing application.')]),null);
  assert.equal(select('Show my comment.',route,history('Show my tutor evaluation tracking notes.')),null);
  assert.equal(select('What about its status?','/',[{role:'assistant',content:'Show my tutor evaluation.'}]),null);
  assert.equal(select('What about its status?','/',[...history('Show my tutor evaluation.'),...history('Show my tuition balance.')]),null);
  assert.equal(select('What about its status?',route,history('Show Alice’s tutor evaluation.'))?.reason,'foreign_request');
});

test('native route accepts only the exact local surface and rejects account selectors',()=>{
  for(const target of [route,route+'/', 'https://stu.best'+route])assert.equal(select('Have I submitted it?',target)?.reason,null,target);
  for(const target of [route+'?user_id=someone',route+'?page=1',route+'/admin','https://evil.invalid'+route,
    'https://someone@stu.best'+route,'//stu.best'+route,'/school-affairs/services/../services/28-1',route+'#x',route+'?x=%2f'])
    assert.equal(select('Show my tutor evaluation.',target)?.reason,'invalid_route',target);
  assert.equal(isNative('Show my tuition balance.',route),false);
  assert.equal(select('Show my tutor evaluation status.',route+'/notes')?.reason,null);
  assert.equal(select('What about its status?',route+'/notes'),null);
  for(const value of [undefined,null,{},'\0','x'.repeat(12001)])assert.equal(select(value as string),null);
});

test('current questionnaire labels are UI metadata, not returned native fields or identity evidence',async()=>{
  const contract=await readFile(new URL('../../server/tutorEvaluationContract.js',import.meta.url),'utf8');
  const ui=await readFile(new URL('../../src/features/public/affairs/TutorEvaluationWorkspace.tsx',import.meta.url),'utf8');
  assert.ok(contract.includes("['ratings','comment','submittedAt']"));assert.ok(ui.includes('const questions = ['));
  assert.ok(ui.includes('您的導師為：—'));
  const source=await readFile(new URL('../../server/tutorEvaluationEvidenceIntent.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|loadTutorEvaluation|submitTutorEvaluation/u);
});
