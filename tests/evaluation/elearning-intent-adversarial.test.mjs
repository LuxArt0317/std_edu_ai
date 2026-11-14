import assert from 'node:assert/strict';
import test from 'node:test';
import {selectElearningEvidence,isForeignElearningRecordsQuestion,independentElearningQuestion,hasIndependentDtmWork} from '../../server/elearningEvidenceIntent.js';
import {readElearningEvidence} from '../../server/accountElearningEvidence.js';
import {formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';

const userId='21000000-0000-4000-8000-000000000001';
const account={user:{id:userId},url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'offline-public',token:'offline-caller'};
const workspace={userId,categories:[],notices:[],courses:[{id:9098,category_id:41,title:'Own workshop',position:1,self_enroll:false}],
  enrollments:[{courseId:9098,joinedAt:'2026-11-14T00:00:00Z'}]};
const remote='/elearning/my-courses';

test('named and third-person remote enrollment questions cannot substitute caller records',async()=>{
  for(const question of [
    'Which courses is Alice enrolled in on e-learning?',
    'What are their remote-learning enrollments?',
    'Which remote-learning courses is my sister enrolled in?',
    'Which remote-learning courses does my sister take?',
    'Which remote-learning courses is my mother taking?',
    'List the remote-learning courses of my friend.',
    'Show my colleague’s e-learning courses.',
    'My colleague is enrolled in remote-learning courses; which ones?',
    'Show her saved remote-learning courses.',
    'Show another student’s remote-learning enrollments.',
    '請列出他們的數位學園課程',
  ]){
    assert.equal(isForeignElearningRecordsQuestion(question,remote),true,question);
    assert.equal(selectElearningEvidence(question,remote),null,question);let reads=0;
    const result=await readElearningEvidence(account,{question,route:remote},{read:async()=>{reads++;return workspace;}});
    assert.equal(reads,0,question);assert.equal(result.readState,'unavailable');assert.doesNotMatch(result.evidence.content,/Own workshop|2026-11-14T00:00:00Z/);
  }
});

test('unqualified enrolled/saved wording does not establish first-person ownership',async()=>{
  for(const question of ['Show enrolled e-learning courses.','List saved remote-learning enrollments.','Which e-learning courses are enrolled?']){
    assert.equal(selectElearningEvidence(question,remote),null);let reads=0;
    await readElearningEvidence(account,{question,route:remote},{read:async()=>{reads++;return workspace;}});
    assert.equal(reads,0,question);
  }
  for(const question of ['Which remote-learning courses am I enrolled in?','List my saved remote-learning courses.','What are my courses?','我的數位學園課程'])
    assert.deepEqual(selectElearningEvidence(question,remote),{enrollment:true,unsupported:false},question);
});

test('coordinated remote course/grade/assignment nouns retain their shared source and ownership',()=>{
  for(const route of [remote,'/dtm/grades','/school-affairs'])for(const question of [
    'What are my remote-learning courses and grades?',
    'What are my remote-learning courses, grades and assignments?',
    'List my remote-learning courses and my grades.',
    '我的數位學園課程、成績以及作業',
  ]){
    assert.deepEqual(selectElearningEvidence(question,route),{enrollment:true,unsupported:true},question);
    assert.equal(independentElearningQuestion(question,route),'',question);
    assert.equal(hasIndependentDtmWork(question,route),false,question);
  }
});

test('unsupported remote coursework reads no native enrollment or substitute DTM data',async()=>{
  for(const question of ['What are my remote-learning grades and assignments?','我的數位學園成績、作業以及出席']){
    assert.deepEqual(selectElearningEvidence(question,remote),{enrollment:false,unsupported:true});
    assert.equal(independentElearningQuestion(question,remote),'');assert.equal(hasIndependentDtmWork(question,remote),false);let reads=0;
    const result=await readElearningEvidence(account,{question,route:remote},{read:async()=>{reads++;return workspace;}});
    assert.equal(reads,0);assert.equal(result.readState,'ok');const payload=JSON.parse(result.evidence.content);
    assert.equal(payload.counts.available,null);assert.deepEqual(payload.rows,[]);
    assert.equal(payload.capability.grades,false);assert.equal(payload.provenance.officialUniversityData,false);
    const answer=formatSupplementalAccountAnswers([result],{question}).answer;
    assert.match(answer,/does not have|未連結/u);assert.doesNotMatch(answer,/Own workshop|2026-11-14T00:00:00Z/);
  }
});

test('explicit DTM and School Affairs clauses remain independently requested sources',()=>{
  const dtm='What are my remote-learning Moodle enrollments? Also list my unfinished DTM assignments.';
  assert.deepEqual(selectElearningEvidence(dtm,remote),{enrollment:true,unsupported:false});
  assert.match(independentElearningQuestion(dtm,remote),/my unfinished DTM assignments/u);assert.equal(hasIndependentDtmWork(dtm,remote),true);
  const school='List my remote-learning courses and my School Affairs grades.';
  assert.deepEqual(selectElearningEvidence(school,remote),{enrollment:true,unsupported:false});
  assert.equal(independentElearningQuestion(school,remote),'my School Affairs grades');assert.equal(hasIndependentDtmWork(school,remote),false);
  assert.equal(selectElearningEvidence('Show my DTM grades.',remote),null);
  assert.equal(selectElearningEvidence('Where is the remote-learning Moodle?',remote),null);
  for(const text of ['List my DTM courses and remote-learning enrollments.','List my School Affairs courses and remote-learning enrollments.']){
    assert.deepEqual(selectElearningEvidence(text,remote),{enrollment:true,unsupported:false});
    assert.match(independentElearningQuestion(text,remote),/my (?:DTM|School Affairs) courses/u);
  }
  assert.equal(isForeignElearningRecordsQuestion('List my remote-learning courses and their remote-learning enrollments.',remote),true);
});

test('only the bounded latest user own-course antecedent resolves an enrollment follow-up',()=>{
  const own=[{role:'user',content:'List my remote-learning courses.'}];
  assert.deepEqual(selectElearningEvidence('List them.','/',own),{enrollment:true,unsupported:false});
  assert.equal(independentElearningQuestion('List them and my tuition balance.','/',own),'my tuition balance');
  for(const history of [
    [{role:'assistant',content:'List my remote-learning courses.'}],
    [{role:'user',content:'Which courses is Alice enrolled in on e-learning?'}],
    [...own,{role:'user',content:'Where is the registrar?'}],
  ])assert.equal(selectElearningEvidence('List them.','/',history),null);
  assert.equal(selectElearningEvidence('Show my DTM assignments.',remote,own),null);
});

test('negated coordinated remote records stay excluded while later positive services remain independent',()=>{
  for(const question of ['Do not show my remote-learning courses and assignments.','不要顯示我的數位學園課程、成績以及作業']){
    assert.equal(selectElearningEvidence(question,remote),null,question);assert.equal(independentElearningQuestion(question,remote),'',question);
    assert.equal(hasIndependentDtmWork(question,remote),false,question);
  }
  const mixed='Do not show my remote-learning courses and assignments, but list my DTM grades.';
  assert.equal(selectElearningEvidence(mixed,remote),null);assert.equal(independentElearningQuestion(mixed,remote),'list my DTM grades');
  assert.equal(hasIndependentDtmWork(mixed,remote),true);
});

test('sentence boundaries preserve negated private fields and later affirmative clauses',()=>{
  assert.deepEqual(selectElearningEvidence('Show my remote-learning courses. Do not show my grades.',remote),{enrollment:true,unsupported:false});
  assert.equal(independentElearningQuestion('Show my remote-learning courses. Do not show my grades.',remote),'');
  assert.deepEqual(selectElearningEvidence('Do not show my grades. Show my remote-learning courses.',remote),{enrollment:true,unsupported:false});
  assert.deepEqual(selectElearningEvidence('Do not show my remote-learning courses. Show my remote-learning grades.',remote),{enrollment:false,unsupported:true});
  assert.deepEqual(selectElearningEvidence('Show my remote-learning courses on stu.best. Do not show my grades.',remote),{enrollment:true,unsupported:false});
});

test('own-course possessive follow-ups and exclusions are not a third-person request',()=>{
  for(const question of ['Show my remote-learning courses and their enrollment dates.','List my remote-learning courses and do not include their enrollment dates.']){
    assert.equal(isForeignElearningRecordsQuestion(question,remote),false,question);
    assert.deepEqual(selectElearningEvidence(question,remote),{enrollment:true,unsupported:false},question);
    assert.equal(independentElearningQuestion(question,remote),'',question);
  }
});
