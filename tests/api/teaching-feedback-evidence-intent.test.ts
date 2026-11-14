import assert from 'node:assert/strict';
import {test} from 'node:test';
import {teachingFeedbackLookupContext as context,selectTeachingFeedbackEvidence as select,teachingFeedbackNavigation as navigation,isTeachingFeedbackScopeQuestion} from '../../server/teachingFeedbackEvidenceIntent.js';
import {readTeachingFeedbackEvidence} from '../../server/accountTeachingFeedbackEvidence.js';

test('real 7-5/7-6 names select only their student view and explicit immediate comments',()=>{
  for(const question of ['Show my teaching evaluation status.','Did I complete my course survey?','教學意見問卷調查填答狀態','請顯示我的教學評量紀錄。'])assert.deepEqual(select(question)?.views,['survey'],question);
  for(const question of ['Show my immediate teaching feedback status.','When was my teaching feedback submitted?','請顯示我的即時反應教學意見紀錄。']){
    assert.deepEqual(select(question)?.views,['immediate'],question);assert.equal(select(question)?.commentRequested,false,question);
  }
  assert.equal(select('What did I write in my immediate teaching feedback?')?.commentRequested,true);
  assert.equal(select('Show my saved teaching feedback comment.')?.commentRequested,true);
  assert.equal(select('Show my teaching feedback status without comments.')?.commentRequested,false);
});

test('independent courses/year/fee clauses survive in either order',()=>{
  const study='what courses i have for this semester and what year i am currently at';
  for(const question of ['Show my teaching evaluation status and '+study,study+' and show my teaching evaluation status']){
    const result=context(question);assert.deepEqual(result.selection?.views,['survey']);assert.match(result.otherQuestion,/what courses i have/u);assert.match(result.otherQuestion,/what year i am/u);assert.doesNotMatch(result.question,/what courses|what year/u);
  }
  for(const question of ['Show my teaching feedback status and my tuition balance.','Show my tuition balance and my teaching feedback status.']){
    const result=context(question);assert.deepEqual(result.selection?.views,['immediate']);assert.match(result.otherQuestion,/tuition balance/u);assert.doesNotMatch(result.question,/tuition/u);
  }
  const both=context('Show my teaching evaluation status and my immediate teaching feedback status.');assert.deepEqual(both.selection?.views,['survey','immediate']);
});

test('foreign owners are denied without converting names, IDs or relatives to caller records',()=>{
  for(const question of ["Show Alice's teaching evaluation status.","Show QA123’s teaching feedback comment.",'Does Alice have saved teaching feedback?','Show the teaching evaluation status for Alice.','Show the teaching feedback of my mother.','Show teaching feedback recorded for student QA123.','請顯示王小明的教學評量紀錄。','請顯示王小明即時反應教學意見。']){
    const result=select(question);assert.equal(result?.reason,'foreign_request',question);assert.deepEqual(result?.views,[],question);assert.ok(result?.requestedViews.length,question);
  }
  assert.equal(select('What’s my teaching evaluation status?')?.reason,null);
  assert.equal(select('Show my teaching feedback status for me.')?.reason,null);
});

test('latest exclusions override a view, and later explicit inclusion restores it',()=>{
  const no=context('Show my teaching feedback. Do not show my teaching feedback.');assert.equal(no.selection,null);assert.equal(no.excluded,true);
  const yes=context('Do not show my teaching feedback. Show my teaching feedback status.');assert.deepEqual(yes.selection?.views,['immediate']);
  const residual=context('Do not read my teaching feedback. What is my next class?');assert.equal(residual.selection,null);assert.match(residual.otherQuestion,/next class/u);
  assert.equal(context('Show my tuition balance and never show my teaching evaluation.').selection,null);
});

test('pure form navigation does not read or swallow other parts',()=>{
  assert.equal(navigation('Where can I find the teaching evaluation form?'),'/school-affairs/services/7-5');
  assert.equal(navigation('Where can I see immediate teaching feedback?'),'/school-affairs/services/7-6');
  const mixed=context('Where can I find the teaching evaluation form? Also show my tuition balance.');assert.equal(mixed.selection,null);assert.deepEqual(mixed.navigation,['survey']);assert.match(mixed.otherQuestion,/tuition/u);assert.equal(navigation('Where can I find the teaching evaluation form? Also show my tuition balance.'),null);
  assert.equal(navigation('Where can I find Alice’s teaching evaluation?'),null);assert.equal(select('Where can I find Alice’s teaching evaluation?')?.reason,'foreign_request');
});

test('unsupported anonymous survey answers differ from supported completion, and writes never read',()=>{
  for(const question of ['Show my original teaching survey answers.','Show my saved teaching evaluation ratings.','Show my teaching evaluation comment.']){assert.equal(select(question)?.reason,'outside_scope',question);assert.deepEqual(select(question)?.views,[],question);}
  const mixed=select('Show my teaching evaluation completion and original answers.');assert.deepEqual(mixed?.views,['survey']);assert.equal(mixed?.unavailableDetails,true);
  for(const question of ['Submit my teaching evaluation.','Delete my teaching feedback.','Show my teaching feedback and then cancel it.','I want you to submit my teaching evaluation.','Show my teaching feedback and I want you to delete it.','Please post my teaching feedback.']){assert.equal(select(question)?.reason,'unsupported_operation',question);assert.deepEqual(select(question)?.views,[],question);}
});

test('anonymous-qualified survey response content never becomes a caller metadata read',async()=>{
  const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN',user:{id:'15000000-0000-4000-8000-000000000001'}};
  for(const question of [
    'Show my anonymous teaching evaluation responses.',
    'Show my anonymous course survey answers.',
    'Show the teaching evaluation responses I submitted anonymously.',
    'Show the status of my anonymous teaching evaluation responses.',
    'Show my anonymous teaching evaluation response history.',
    'Show my completed anonymous teaching evaluation responses.',
    '請顯示我的匿名教學評量回覆。',
  ]){
    const selected=select(question,'/school-affairs/services/7-5');
    assert.equal(selected?.reason,'outside_scope',question);assert.deepEqual(selected?.views,[],question);
    assert.deepEqual(selected?.requestedViews,['survey'],question);assert.equal(selected?.unavailableDetails,true,question);
    let reads=0;
    if(selected&&!selected.reason)await readTeachingFeedbackEvidence(account,{views:[...selected.views]},{read:async()=>{reads++;throw Error('Unexpected native read');}});
    assert.equal(reads,0,question);
  }
  const follow=select('Show my anonymous responses.','/',[{role:'user',content:'Show my teaching evaluation completion.'}]);
  assert.equal(follow?.reason,'outside_scope');assert.deepEqual(follow?.views,[]);
});

test('independently requested survey completion survives an unsupported anonymous response part',async()=>{
  const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN',user:{id:'15000000-0000-4000-8000-000000000001'}};
  for(const question of [
    'Show my anonymous teaching evaluation responses. Also show my teaching evaluation completion status.',
    'Show my teaching evaluation completion status. Also show my anonymous teaching evaluation responses.',
    'Show my teaching evaluation completion and anonymous responses.',
  ]){
    const selected=select(question);assert.ok(selected&&!selected.reason,question);assert.deepEqual(selected.views,['survey'],question);
    assert.equal(selected.unavailableDetails,true,question);assert.equal(selected.commentRequested,false,question);let reads=0;
    const result=await readTeachingFeedbackEvidence(account,{views:[...selected.views],commentRequested:selected.commentRequested},{read:async(_caller,query)=>{
      reads++;assert.deepEqual(query,{scope:'teaching-feedback',view:'survey'});
      return {userId:account.user.id,courses:[],surveys:[],feedback:[],terms:[],results:[]};
    }});
    assert.equal(reads,1,question);assert.equal(result.readState,'empty');assert.doesNotMatch(result.evidence.content,/"(?:answers|responses|comment|ratings)"/u);
  }
  assert.equal(select('Show my immediate teaching feedback comment for course "Anonymous Responses".')?.commentRequested,true);
  assert.equal(select('Show my teaching evaluation completion status without anonymous answers.')?.unavailableDetails,false);
});

test('comment projection confines exact course labels and refuses ambiguous filters',()=>{
  assert.deepEqual(select('Show my teaching feedback comment for course code CS101.')?.course,{code:'CS101'});
  assert.deepEqual(select('Show my teaching feedback comment for course title "Database Design".')?.course,{title:'Database Design'});
  assert.deepEqual(select('Show my teaching feedback comment for "Alice’s course".')?.course,{title:'Alice’s course'});
  for(const question of ['Show my teaching feedback comment for Database Design.','Show my teaching feedback comment for course title Database Design.','Show my teaching feedback comment for course "".','Show my teaching feedback comment for course "Database Design.'])assert.ok(['ambiguous_selector','foreign_request'].includes(select(question)?.reason??''),question);
});

test('route and latest-user followups never borrow an older private topic',()=>{
  assert.deepEqual(select('What is its status?','/school-affairs/services/7-6')?.views,['immediate']);
  assert.deepEqual(select('When was it submitted?','/',[{role:'user',content:'Show my teaching feedback status.'}])?.views,['immediate']);
  assert.equal(select('When was it submitted?','/school-affairs/services/7-6',[{role:'user',content:'Show my teaching feedback.'},{role:'user',content:'Show my housing application.'}]),null);
  assert.equal(select('What is its status?','/school-affairs/services/7-6',[{role:'user',content:"Show Alice’s teaching feedback."}])?.reason,'foreign_request');
  assert.equal(select('Show my course feedback.','/dtm'),null);assert.deepEqual(select('Show my course feedback.','/school-affairs/services/7-6')?.views,['immediate']);
  assert.equal(select('Show my Moodle course feedback.','/school-affairs/services/7-6'),null);
  assert.equal(select('Show my DTM teaching feedback.','/school-affairs/services/7-6'),null);
  assert.equal(select('What is its status?','/school-affairs/services/7-6',[{role:'user',content:'Show my teaching feedback. Do not show my teaching feedback.'}]),null);
  assert.equal(select('What is its status?','/school-affairs/services/7-6',[{role:'user',content:'Show my teaching feedback and my tuition balance.'}]),null);
});

test('survey comments cannot authorize a different view’s comment, including after exclusion',()=>{
  const first=select('Show my teaching evaluation comment and my teaching feedback status.');assert.deepEqual(first?.views,['survey','immediate']);assert.equal(first?.commentRequested,false);assert.equal(first?.unavailableDetails,true);
  const reset=select('Show my teaching feedback. Show my saved comment. Do not show my teaching feedback. Show my teaching feedback status.');assert.deepEqual(reset?.views,['immediate']);assert.equal(reset?.commentRequested,false);
});

test('tracking notes and unrelated DTM feedback retain separate dispatch',()=>{
  for(const question of ['Show my teaching evaluation tracking notes.','Show my private teaching feedback notes.','Show my Moodle assignment feedback.','Explain my quiz feedback.','What is teaching feedback?','Explain teaching evaluation.'])assert.equal(select(question),null,question);
  assert.equal(isTeachingFeedbackScopeQuestion('Show my Moodle assignment feedback.','/school-affairs/services/7-6'),false);
});

test('invalid route/foreign origin and unsupported values stop before transport',()=>{
  for(const route of ['https://evil.invalid/school-affairs/services/7-6','/school-affairs/services/7-6?owner=other','/school-affairs/services/7-6/../7-5','/school-affairs/services/7-6%2fnotes'])assert.equal(select('Show my teaching feedback status.',route)?.reason,'invalid_route',route);
  for(const question of [null,{},42,''])assert.equal(select(question),null);
});

test('reviewed natural metadata queries retain their independent view and exact history filter',()=>{
  for(const question of ['For my midterm teaching evaluation, which courses are completed and which are not?','Are there saved teaching evaluations for my courses?'])assert.deepEqual(select(question)?.views,['survey'],question);
  for(const question of ['Show the saved status of my immediate teaching feedback for each course.','Which of my courses are eligible for immediate teaching feedback, and is the list exhaustive?'])assert.deepEqual(select(question)?.views,['immediate'],question);
  assert.equal(select('Show the ratings and anonymous comment I submitted in my teaching evaluation survey.')?.reason,'outside_scope');
  assert.equal(select('請顯示王小明的即時教學意見。')?.reason,'foreign_request');
  assert.equal(select('Show the immediate teaching feedback available to Alice.')?.reason,'foreign_request');
  const follow=select('What comment did I save?','/dtm',[{role:'user',content:'Show my immediate teaching feedback for course code DB701.'}]);
  assert.deepEqual(follow?.views,['immediate']);assert.deepEqual(follow?.course,{code:'DB701'});assert.equal(follow?.commentRequested,true);
  assert.deepEqual(select('Quote my saved immediate teaching feedback comment for course code DB701 as literal text.')?.course,{code:'DB701'});
});

test('prefix and ordinary quoted course filters stay bound, while exclusions clarify without widening',()=>{
  for(const question of ['For course "Database Design", show my immediate teaching feedback comments.','Show my immediate teaching feedback comments for course "Database Design".']){
    assert.deepEqual(select(question)?.course,{title:'Database Design'},question);assert.equal(select(question)?.reason,null,question);
  }
  assert.deepEqual(select('Show my teaching feedback comment for course "Alice\'s course".')?.course,{title:"Alice's course"});
  for(const question of ['Show my immediate teaching feedback comments, excluding course "World History".','Show my immediate teaching feedback comments except for course "World History".','Show my immediate teaching feedback comments not course "World History".','For course Database Design, show my immediate teaching feedback comments.','For Database Design, show my immediate teaching feedback comments.']){
    assert.equal(select(question)?.reason,'ambiguous_selector',question);assert.deepEqual(select(question)?.views,[],question);
  }
});

test('selector-only prefixes bind the current explicit view ahead of incidental route or older history',()=>{
  const immediate='For course "Database Design", show my immediate teaching feedback comments.';
  for(const [route,history]of [
    ['/school-affairs/services/7-5',[]],
    ['/dtm',[{role:'user',content:'Show my teaching survey windows.'}]],
  ] as const){const chosen=select(immediate,route,history);assert.deepEqual(chosen?.views,['immediate']);assert.deepEqual(chosen?.course,{title:'Database Design'});assert.equal(chosen?.from,'question');}
  const survey='For course code DB701, show my teaching evaluation completion.';
  for(const [route,history]of [
    ['/school-affairs/services/7-6',[]],
    ['/dtm',[{role:'user',content:'Show my teaching feedback comments.'}]],
  ] as const){const chosen=select(survey,route,history);assert.deepEqual(chosen?.views,['survey']);assert.deepEqual(chosen?.course,{code:'DB701'});assert.equal(chosen?.commentRequested,false);}
});

test('actual selector-to-reader projection includes only the named comment and never reads excluded/foreign queries',async()=>{
  const uuid=(n:number)=>'15000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'TEST_KEY',token:'TEST_TOKEN',user:{id:uuid(1)}};
  const data={userId:uuid(1),surveys:[],terms:[],results:[],courses:[
    {id:uuid(2),course:'Database Design',code:'DB701',term:'QA term',section:'A'},
    {id:uuid(3),course:'World History',code:'WH702',term:'QA term',section:'B'},
  ],feedback:[
    {id:uuid(4),sectionId:uuid(2),course:'Database Design',code:'DB701',term:'QA term',comment:'REQUESTED QA COMMENT',status:'submitted',submittedAt:'2026-11-01T08:00:00Z',reviewedAt:null},
    {id:uuid(5),sectionId:uuid(3),course:'World History',code:'WH702',term:'QA term',comment:'UNREQUESTED QA COMMENT',status:'submitted',submittedAt:'2026-11-02T08:00:00Z',reviewedAt:null},
  ]};
  for(const question of ['For course "Database Design", show my immediate teaching feedback comments.','Show my immediate teaching feedback comments for course "Database Design".']){
    const selected=select(question,'/school-affairs/services/7-5',[{role:'user',content:'Show my teaching survey windows.'}]);assert.ok(selected&&!selected.reason);let reads=0;
    const result=await readTeachingFeedbackEvidence(account,{views:[...selected.views],commentRequested:selected.commentRequested,...(selected.course?{course:{...selected.course}}:{})},{read:async(_account,query)=>{reads++;assert.equal(query.view,'immediate');return data;}});
    assert.equal(reads,1);assert.equal(result.readState,'ok');assert.match(result.evidence.content,/REQUESTED QA COMMENT/u);assert.doesNotMatch(result.evidence.content,/UNREQUESTED QA COMMENT/u);
  }
  for(const question of ['Show my immediate teaching feedback comments, excluding course "World History".','Show the immediate teaching feedback available to Alice.']){
    let reads=0;const selected=select(question);
    if(selected&&!selected.reason)await readTeachingFeedbackEvidence(account,{views:[...selected.views]},{read:async()=>{reads++;return data;}});
    assert.equal(reads,0,question);
  }
});
