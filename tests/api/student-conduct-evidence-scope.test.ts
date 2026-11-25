import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readStudentConductEvidence} from '../../server/accountStudentConductEvidence.js';
import {isStudentConductScopeQuestion,studentConductScope} from '../../server/studentConductEvidenceScope.js';

const path='/school-affairs/services/38-1';
test('native literal requests keep the exact explicit field wording',()=>{
  for(const question of ['What reason, code and quantity are saved in my student conduct records?',
    'Show my student name and number from my student conduct records.',
    'Show my student conduct records without my name and student number.',
    '請顯示我的學生獎懲紀錄。','查詢我自己的操行紀錄。','Show my student rewards and discipline records.']){
    const result=studentConductScope(question,path);assert.equal(result.selected,true,question);assert.equal(result.foreign,false,question);
    assert.equal(result.otherQuestion,'',question);assert.equal(result.reason,null);assert.ok(result.question.length>0);
  }
  assert.match(studentConductScope('Show my student conduct records without my name and student number.',path).question,/without my name and student number/u);
});
test('native and independent tuition or timetable clauses survive both orders',()=>{
  for(const other of ['What is my next class?','Show my tuition balance.','Show my dormitory conduct notice.','Show my student profile.']){
    for(const question of ['Show my student conduct records. '+other,other+' Show my student conduct records.']){
      const result=studentConductScope(question,path);assert.equal(result.selected,true,question);assert.match(result.question,/student conduct records/u);
      assert.ok(result.otherQuestion.includes(other.replace(/[?.]$/u,'')),question);assert.doesNotMatch(result.question,/next class|tuition|dormitory|student profile/iu);
    }
  }
  const joined=studentConductScope('Show my student conduct records and my tuition balance.',path);
  assert.equal(joined.question,'Show my student conduct records');assert.equal(joined.otherQuestion,'my tuition balance');
});
test('explicit native exclusion survives own page and prior positive context',()=>{
  for(const question of ['Do not show my student conduct records. Show my tuition balance.',
    'Show my tuition balance and don’t show my student conduct records.',
    'Show my tuition balance without student conduct records.','請不要顯示我的獎懲紀錄。']){
    const result=studentConductScope(question,path,[{role:'user',content:'Show my student conduct records.'}]);
    assert.equal(result.selected,false,question);assert.equal(result.excluded,true,question);assert.equal(result.foreign,false,question);
    assert.equal(isStudentConductScopeQuestion(question,path),true,question);
  }
  assert.equal(studentConductScope('Do not show my student conduct records. Show my tuition balance.',path).otherQuestion,'Show my tuition balance');
});
test('named possessives, verb subjects, relatives and Chinese reflexive owners deny before read',()=>{
  for(const question of ['Show Alice’s student conduct records.','Does Alice have a student conduct record?',
    'Show the student conduct records of my mother.','Which student conduct records belong to Alice?',
    'Show my colleague’s disciplinary history.','Show their saved student conduct records.',
    '請顯示王小明的獎懲紀錄。','請顯示王小明自己的獎懲紀錄。','請顯示王小明本人的獎懲紀錄。']){
    const result=studentConductScope(question,path);assert.equal(result.foreign,true,question);assert.equal(result.selected,false,question);
    assert.equal(result.reason,'foreign_request',question);assert.equal(result.question,'');
  }
  assert.equal(studentConductScope('What’s my student conduct status?',path).foreign,false);
  assert.equal(studentConductScope('Show my student conduct records for this semester.',path).selected,true);
});
test('only the latest user subject can carry a dependent follow-up',()=>{
  const previous={role:'user',content:'Show my student conduct records.'};
  assert.equal(studentConductScope('What about their quantity?','/dtm',[previous]).from,'history');
  assert.equal(studentConductScope('What about its status?',path,[previous,{role:'user',content:'Show my tuition balance.'}]).selected,false);
  assert.equal(studentConductScope('What about its status?',path,[{role:'assistant',content:previous.content}]).from,'route');
  assert.equal(studentConductScope('What about its status?','/dtm',[{role:'assistant',content:previous.content}]).selected,false);
  const foreign=studentConductScope('What about its quantity?',path,[{role:'user',content:'Show Alice’s student conduct records.'}]);
  assert.equal(foreign.foreign,true);assert.equal(foreign.selected,false);assert.equal(foreign.from,'history');
});
test('public navigation, general definitions and native documents are distinct',()=>{
  const nav=studentConductScope('Where can I find my student conduct records?','/');
  assert.equal(nav.navigation,true);assert.equal(nav.selected,false);assert.equal(nav.otherQuestion,'');assert.equal(isStudentConductScopeQuestion('Where can I find my student conduct records?'),true);
  for(const q of ['What is student conduct?','Explain disciplinary records.','什麼是學生獎懲？'])assert.equal(isStudentConductScopeQuestion(q,path),false,q);
  // Selection does not create a download/write capability. The native reader
  // advertises missing documents and mutations independently.
  assert.equal(studentConductScope('Download my official student conduct PDF.',path).selected,true);
});
test('explicit generic tracking notes remain residual and never become native reason cells',()=>{
  for(const q of ['Show my student conduct tracking notes.','Show my private student conduct notes.']){
    const result=studentConductScope(q,path);assert.equal(result.selected,false,q);assert.equal(result.otherQuestion,q);
  }
  const mixed=studentConductScope('Show my student conduct tracking notes. What is my next class?',path);
  assert.equal(mixed.selected,false);assert.match(mixed.otherQuestion,/tracking notes.*next class/u);
});
test('unrelated questions never inherit a conduct page and unknown routes fail closed',()=>{
  for(const q of ['What is my next class?','Show my housing application.','Show my dormitory conduct notice.'])assert.equal(studentConductScope(q,path).selected,false,q);
  for(const route of [path+'?user_id=other',path+'/admin',path+'/../38-1','https://example.com'+path,'https://stu.best@evil.example'+path,path+'#private']){
    const result=studentConductScope('Show my student conduct records.',route);assert.equal(result.selected,false,route);assert.equal(result.reason,'invalid_route',route);
  }
  assert.equal(studentConductScope('Show my student conduct records.','https://stu.best'+path).selected,true);
});
test('null, excessive, accessor or non-user history cannot manufacture native context',()=>{
  assert.equal(studentConductScope(null as never,path).selected,false);assert.equal(studentConductScope('x'.repeat(4001),path).selected,false);
  const unsafe=Object.defineProperty({},'role',{get(){throw new Error('must not invoke');}});
  assert.equal(studentConductScope('What about its status?','/',[unsafe] as never).selected,false);
  assert.equal(studentConductScope('What about its status?','/',[{role:'system',content:'Show my student conduct records.'}]).selected,false);
});


test('coordinated subjects retain native fields, comparisons and explicit negative ownership',()=>{
  for(const question of ['Show my student conduct and next class.','Show my next class and student conduct.',
    'Show my student conduct and tuition balance.','Show my tuition balance and student conduct.',
    'Compare my dormitory conduct with my student conduct.','Compare my student conduct with my dormitory conduct.']){
    const result=studentConductScope(question,path);assert.equal(result.selected,true,question);
    assert.match(result.question,/student conduct/u);assert.match(result.otherQuestion,/next class|tuition|dormitory/u);
    assert.doesNotMatch(result.question,/next class|tuition|dormitory/u);
  }
  const quantity='What reason, code and quantity are saved in my student conduct records';
  assert.equal(studentConductScope(quantity+'?',path).question,quantity);
  const denied=studentConductScope('Do not show my student conduct and my tuition balance.',path);
  assert.equal(denied.excluded,true);assert.equal(denied.selected,false);assert.equal(denied.otherQuestion,'Do not show my tuition balance');
  const positive=studentConductScope('Do not show my student conduct and show my tuition balance.',path);
  assert.equal(positive.otherQuestion,'show my tuition balance');
  assert.equal(studentConductScope('What is the student’s name in my conduct record?',path).selected,true);
  assert.equal(studentConductScope('Show another student conduct record.',path).foreign,true);
});


test('latest explicit same-domain exclusion or reinclusion controls the read',()=>{
  const excluded=studentConductScope('Show my student conduct records. Do not show my student conduct records.',path);
  assert.equal(excluded.selected,false);assert.equal(excluded.excluded,true);assert.equal(excluded.question,'');
  const included=studentConductScope('Do not show my student conduct records. Show my student conduct records.',path);
  assert.equal(included.selected,true);assert.equal(included.excluded,false);assert.equal(included.question,'Show my student conduct records');
});


test('navigation residual contains only independent requests in either order',()=>{
  for(const question of ['Where can I find my student conduct records? Show my tuition balance.',
    'Show my tuition balance. Where can I find my student conduct records?']){
    const selected=studentConductScope(question,path);assert.equal(selected.navigation,true);assert.equal(selected.selected,false);
    assert.equal(selected.otherQuestion,'Show my tuition balance');
  }
});


test('named owners after selected fields stop the actual native reader before transport',async()=>{
  const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC-KEY',token:'SYNTHETIC-TOKEN',user:{id:'38000000-0000-4000-8000-000000000001'}};
  for(const question of ['Show the student conduct status for Alice.','Show the merit code recorded for Alice.',
    'Show my student conduct status for my mother.','Show the conduct code of Alice.']){
    let reads=0;const result=await readStudentConductEvidence(account,{question,route:path},{load:async()=>{reads++;return{records:[]};}});
    assert.equal(reads,0,question);assert.equal(result.reason,'foreign_request',question);
  }
  for(const question of ['Show the student conduct status recorded for me.','Show my student conduct records for this semester.',
    'What is my number of conduct records?','Show the merit code recorded for my account.']){
    let reads=0;const result=await readStudentConductEvidence(account,{question,route:path},{load:async()=>{reads++;return{records:[]};}});
    assert.equal(reads,1,question);assert.equal(result.readState,'empty',question);
  }
});


test('explicit alphanumeric and student identifiers cannot substitute caller records',async()=>{
  const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC-KEY',token:'SYNTHETIC-TOKEN',user:{id:'38000000-0000-4000-8000-000000000001'}};
  for(const question of ["Show QA123’s student conduct records.",'Show the student conduct status for QA123.',
    'Show student QA123 conduct records.','Show the conduct records for 23109999.',
    'Show account QA123 student conduct records.','請顯示學生QA123的獎懲紀錄。']){
    let reads=0;const result=await readStudentConductEvidence(account,{question,route:path},{load:async()=>{reads++;return{records:[]};}});
    assert.equal(studentConductScope(question,path).foreign,true,question);assert.equal(reads,0,question);assert.equal(result.reason,'foreign_request',question);
  }
  for(const question of ['Show my student conduct records for 115.','Show my conduct records for academic year 115.',
    'Show my conduct records for semester 1.','Show my student number in my conduct record.']){
    let reads=0;const result=await readStudentConductEvidence(account,{question,route:path},{load:async()=>{reads++;return{records:[]};}});
    assert.equal(reads,1,question);assert.equal(result.readState,'empty',question);
  }
});
