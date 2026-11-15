import assert from 'node:assert/strict';
import {test} from 'node:test';
import {selectHousingBedEvidence as select,housingBedLookupContext as context,housingBedNavigation as nav,isHousingBedScopeQuestion as scope} from '../../server/housingBedEvidenceIntent.js';
const path='/school-affairs/services/34-1';
const defaults=['academicYear','semester','bedNumber','dormitory','bunk'];
test('bounded companion lists retain every positive source and last explicit exclusions',()=>{
  for(const q of [
    'Show my dormitory bed. What is my next class? How much is my remaining balance in school?',
    'How much is my remaining balance in school? What is my next class? Show my dormitory bed.',
    'Show my dormitory bed, my tuition balance, and my next class.',
  ]){
    const x=context(q,path);assert.equal(x.companionOnly,true,q);assert.equal(x.companion,null,q);
    assert.deepEqual(x.companions,['next_class','fee_balance'],q);assert.deepEqual(x.excludedCompanions,[],q);
    assert.doesNotMatch(x.otherQuestion,/,\./u,q);
  }
  for(const q of ['Show my dormitory bed. Do not show my tuition balance.','Do not read my tuition balance. Show my dormitory bed.']){
    const x=context(q,path);assert.equal(x.companionOnly,true,q);assert.deepEqual(x.companions,[],q);assert.deepEqual(x.excludedCompanions,['fee_balance'],q);
  }
  const x=context('Show my dormitory bed. Show my tuition balance. Do not show my tuition balance. What is my next class?',path);
  assert.deepEqual(x.companions,['next_class']);assert.deepEqual(x.excludedCompanions,['fee_balance']);
  const y=context('Show my dormitory bed. Do not show my next class. Show my next class. Do not show my tuition balance.',path);
  assert.deepEqual(y.companions,['next_class']);assert.deepEqual(y.excludedCompanions,['fee_balance']);
  const unknown=context('Show my dormitory bed. Show my tuition balance. Show my assignment deadlines.',path);
  assert.equal(unknown.companionOnly,false);assert.match(unknown.otherQuestion,/assignment deadlines/u);
});
test('localized, tell-me and coordinated nor exclusions never become positive companion scopes',()=>{
  for(const q of ['顯示我的住宿床位。不要顯示我的學費餘額。','Show my dormitory bed. Don’t tell me my tuition balance.',
    'Show my dormitory bed. Do not show my next class, nor my tuition balance.']){
    const x=context(q,path);assert.equal(x.companionOnly,true,q);assert.deepEqual(x.companions,[],q);
    assert.ok(x.excludedCompanions.includes('fee_balance'),q);
  }
  const x=context('Show my dormitory bed. Do not show my next class, nor my tuition balance.',path);
  assert.deepEqual(x.excludedCompanions,['next_class','fee_balance']);
});
test('a bounded foreign fee or timetable clause never substitutes the caller’s independent records',()=>{
  for(const q of ['Show my dormitory bed and tuition balance for Alice.','Show tuition balance for Alice. Show my dormitory bed.',
    'Show my dormitory bed. Show QA123’s tuition balance.','Show my dormitory bed and tuition balance for my mother.',
    'Show my dormitory bed and my friend’s tuition balance.']){
    const x=context(q,path);assert.equal(x.companionOnly,true,q);assert.deepEqual(x.companions,[],q);assert.deepEqual(x.foreignCompanions,['fee_balance'],q);
    assert.equal(x.selection?.reason,null,q);
  }
  const own=context('Show my dormitory bed. Show my tuition balance. Show Alice’s tuition balance.',path);
  assert.deepEqual(own.companions,['fee_balance']);assert.deepEqual(own.foreignCompanions,['fee_balance']);
  const excludedForeign=context('Show my dormitory bed and my tuition balance. Do not show Alice’s tuition balance.',path);
  assert.deepEqual(excludedForeign.companions,['fee_balance']);assert.deepEqual(excludedForeign.excludedCompanions,[]);assert.deepEqual(excludedForeign.foreignCompanions,[]);
  for(const self of ['me','myself']){
    const x=context('Show my dormitory bed and tuition balance for '+self+'.',path);
    assert.equal(x.companionOnly,true);assert.deepEqual(x.companions,['fee_balance']);assert.deepEqual(x.foreignCompanions,[]);
  }
});
test('native bed headings and own questions select metadata without application PII or implicit money',()=>{
  for(const question of ['Which dormitory beds are saved for me?','Show all my dormitory bed assignments.','What’s my dormitory bed number?',
    '請列出我的住宿床位編號、學年、學期、宿舍名稱與上下舖。','請顯示我自己的住宿床位。','住宿床位查詢','Show my saved bed and its academic year and semester.']){
    const value=select(question,path);assert.equal(value?.reason,null,question);assert.deepEqual(value?.fields,defaults,question);
  }
  const costs=select('What are my saved accommodation fees, deposits and subsidies?',path);
  assert.deepEqual(costs?.fields,[...defaults,'accommodationFee','deposit','subsidyAmount']);
  assert.deepEqual(select('Show my bed records and all saved fields.',path)?.fields,[...defaults,'accommodationFee','deposit','subsidyAmount']);
  assert.deepEqual(select('Show my dormitory bed and fees. Do not include the deposit.',path)?.fields,[...defaults,'accommodationFee','subsidyAmount']);
});
test('named, relational, alphanumeric and Chinese owners stop before read',()=>{
  for(const question of ["Show Alice's dormitory bed assignment.",'Show QA123’s dormitory bed.','Does Alice have a dormitory bed?',
    'Show my housing bed for the student QA123.','Show my housing bed for the student Alice.',
    'Show the dormitory bed assigned to Alice.','Show the dormitory bed recorded for student QA123.','Show student 23101314 bed records.',
    'Show the dormitory bed of my mother.','Show my colleague’s housing bed.','Show their saved dormitory beds.',
    '請顯示王小明的住宿床位。','請顯示王小明自己的住宿床位。','請顯示王小明本人的住宿床位。']){
    const value=select(question,path);assert.equal(value?.reason,'foreign_request',question);assert.deepEqual(value?.fields,[],question);
  }
  for(const question of ['Show my dormitory bed for academic year 115 semester 1.','Which dormitory bed is saved for me?'])assert.equal(select(question,path)?.reason,null,question);
});
test('negation controls the latest mention while independent residual remains intact',()=>{
  for(const question of ['Do not read my dormitory bed assignments.','Don’t show my dormitory beds.','Show my dormitory beds. Do not show my dormitory beds.']){
    assert.equal(select(question,path),null,question);assert.equal(context(question,path).excluded,true,question);assert.equal(context(question,path).otherQuestion,'',question);assert.equal(scope(question,path),true);
  }
  assert.equal(select('Do not read my dormitory bed. Show my dormitory bed.',path)?.reason,null);
  const x=context('Show my tuition balance. Do not read my dormitory bed assignments.',path);
  assert.equal(x.selection,null);assert.equal(x.excluded,true);assert.equal(x.otherQuestion,'Show my tuition balance');assert.equal(x.companion,'fee_balance');
  const y=context('Show my dormitory bed. Do not show my tuition balance.',path);
  assert.equal(y.selection?.reason,null);assert.equal(y.otherQuestion,'Do not show my tuition balance');assert.equal(y.companion,null);
});
test('34-1 does not substitute application receipts, windows or dormitory conduct',()=>{
  for(const route of [path,'/school-affairs/services/26-1','/school-affairs/services/34-2','/'])for(const q of ['Show my housing application.','Print my housing receipt.','What is the housing application window?','Show my dormitory conduct records.']){
    assert.equal(select(q,route),null,q);assert.equal(scope(q,route),false,q);
  }
  for(const other of ['my housing application','my dormitory conduct records']){
    const result=context('Show my dormitory bed and '+other+'.',path);assert.equal(result.selection?.reason,null);assert.equal(result.otherQuestion,other);
  }
});
test('generic housing records use exact 34-1 context and enforce the owner boundary',()=>{
  for(const question of ['What housing records are saved?','My saved accommodation history.','我的住宿紀錄有哪些？']){
    assert.equal(select(question,path)?.from,'route');
    assert.deepEqual(select(question,path)?.fields,defaults);
    assert.equal(select(question,'/school-affairs/services/34-2'),null);
  }
  assert.equal(select('What housing records are saved for Alice?',path)?.reason,'foreign_request');
  assert.equal(select('What housing records are saved?',path+'?owner_id=Alice')?.reason,'invalid_route');
  assert.equal(context('What housing records are saved? Do not infer any if none are stored.',path).otherQuestion,'');
  const compound=context('What housing records are saved? When is my next class?',path);
  assert.equal(compound.selection?.from,'route');
  assert.equal(compound.companion,'next_class');
});
test('term selectors stay literal, validate conflicts and never invent current residency',()=>{
  for(const [question,term] of [
    ['Show my dormitory bed for academic year 115 semester 1.',{academicYear:115,semester:1}],
    ['For academic year 115 semester 1, show my dormitory bed.',{academicYear:115,semester:1}],
    ['請顯示我的住宿床位115學年度第2學期。',{academicYear:115,semester:2}],
    ['Show my dormitory bed for term 114-2.',{academicYear:114,semester:2}],
    ['Show my dormitory bed for semester 2.',{academicYear:null,semester:2}],
  ] as const){assert.deepEqual(select(question,path)?.term,term,question);assert.equal(select(question,path)?.reason,null,question);}
  for(const q of ['Show my dormitory bed for academic year 0 semester 1.','Show my dormitory bed for academic year 301 semester 1.',
    'Show my dormitory bed for semester 3.','Show my dormitory bed for academic year banana.','Show my dormitory bed for term 115-1 and term 114-2.']){
    assert.equal(select(q,path)?.reason,'ambiguous_selector',q);assert.deepEqual(select(q,path)?.fields,[],q);
  }
  assert.deepEqual(select('Does my newest saved dormitory bed prove that I live there right now?',path)?.unsupported,['current_residence']);
  assert.ok(select('Do my saved accommodation fee and deposit prove that I have paid?',path)?.unsupported.includes('payment_confirmation'));
  assert.ok(select('Show my dormitory bed tenancy dates.',path)?.unsupported.includes('tenancy_dates'));
});
test('latest actual user context controls field followups, stale and foreign contexts are not replaced by route',()=>{
  const history=[{role:'user',content:'Show my dormitory bed.'},{role:'user',content:'Show my tuition balance.'}];
  assert.equal(select('What is its status?',path,history),null);
  assert.equal(select('How much is still due?',path,history),null);
  const own=[{role:'user',content:'Show my dormitory bed for academic year 115 semester 1.'}];
  assert.equal(select('What is the deposit?',path,own)?.from,'history');assert.deepEqual(select('What is the deposit?',path,own)?.term,{academicYear:115,semester:1});
  assert.ok(select('What is the deposit?',path,own)?.fields.includes('deposit'));
  assert.equal(select('What is its status?',path,[{role:'user',content:'Show Alice’s dormitory bed.'}])?.reason,'foreign_request');
  assert.equal(select('What is the deposit?','/',[{role:'assistant',content:'Show my dormitory bed.'}]),null);
  assert.equal(select('What is the deposit?','/school-affairs/services/26-1'),null);
  assert.equal(select('What is the deposit?',path)?.from,'route');
});
test('next class and balance companions retain both directions without widening housing fields',()=>{
  for(const other of ['What is my next class?','Show my next School Affairs class, date, start time and room.','my next class']){
    for(const q of ['Show my saved dormitory bed. '+other,other+'; Show my saved dormitory bed.']){
      const x=context(q,path);assert.equal(x.companion,'next_class',q);assert.deepEqual(x.selection?.fields,defaults,q);assert.match(x.otherQuestion,/next/iu);assert.doesNotMatch(x.question,/next|room/iu);
    }
  }
  for(const q of ['Show my saved dormitory bed and my tuition balance.','Show my tuition balance. Also show my saved dormitory bed.']){
    const x=context(q,path);assert.equal(x.companion,'fee_balance',q);assert.deepEqual(x.selection?.fields,defaults,q);assert.doesNotMatch(x.question,/tuition/iu);
  }
  for(const other of ['my grades','my current courses','my assignments','my year level','my next class and my tuition balance']){
    const x=context('Show my dormitory bed and '+other+'.',path);assert.equal(x.companion,null,other);assert.equal(x.selection?.reason,null);assert.equal(x.otherQuestion,other.replace(' and my ','. my '));
  }
});
test('navigation is public and never swallows requested records or other domains',()=>{
  for(const q of ['Where can I find my dormitory bed history?','Give me the link to my dormitory bed records.','哪裡可以查詢我的住宿床位？']){assert.equal(nav(q),true,q);assert.equal(select(q,path),null,q);}
  const x=context('Where can I find my dormitory bed history? Show my tuition balance.',path);
  assert.equal(x.navigation,true);assert.equal(x.otherQuestion,'Show my tuition balance');assert.equal(nav('Where can I find my dormitory bed history? Show my tuition balance.'),false);
  assert.equal(nav('Where is my assigned dormitory bed?'),false);
  assert.equal(nav('Where can I find Alice’s dormitory bed?'),false);
  assert.equal(select('Move me to bed QA-Z-999 and confirm that the university changed my room.',path)?.reason,'unsupported_operation');
  assert.equal(select('Show my housing bed and change it to QA-Z-999.',path)?.reason,'unsupported_operation');
});
test('route integrity and malformed input cannot create authorized selection',()=>{
  for(const route of [path+'?owner_id=foreign',path+'?term=115-1',path+'/../34-1','https://evil.invalid'+path,'//evil.invalid'+path,path+'%2f'])assert.equal(select('Show my dormitory bed.',route)?.reason,'invalid_route',route);
  assert.equal(select(null,path),null);assert.equal(select('x'.repeat(12001),path),null);
  let accesses=0;const history=[{get role(){accesses++;return 'user';},get content(){accesses++;return 'Show my dormitory bed.';}}];
  assert.equal(select('What is the deposit?','/',history),null);assert.equal(accesses,0);
});
test('school balance variants stay independent even when the bed clause names a foreign owner',()=>{
  for(const route of ['/',path,'/school-affairs/services/26-1'])for(const [first,second] of [
    ['How much is my remaining balance in school?','Also show my dormitory bed.'],
    ['Show my dormitory bed.','How much is my remaining balance in school?'],
    ['Show Alice’s dormitory bed','and my fee balance.'],
    ['Show my fee balance','and Alice’s dormitory bed.'],
  ]){
    const q=first+' '+second,result=context(q,route);assert.equal(result.companion,'fee_balance',q);
    assert.doesNotMatch(result.question,/fee balance|remaining balance/iu,q);
    if(q.includes('Alice')){assert.equal(result.selection?.reason,'foreign_request',q);assert.match(result.otherQuestion,/my fee balance/iu,q);}
    else assert.equal(result.selection?.reason,null,q);
  }
  for(const route of ['/',path,'/school-affairs/services/26-1']){
    assert.equal(context('Open accommodation bed records.',route).navigation,true);assert.equal(select('Open accommodation bed records.',route),null);
  }
});
test('coordinated exclusions retain scope and companion nouns do not need a repeated possessive',()=>{
  const excluded=select('Show my dormitory bed. Do not show my fees and my deposit.',path);
  assert.deepEqual(excluded?.fields,defaults);
  assert.deepEqual(select('Show my dormitory bed. Do not show my fees and my deposit, then show my deposit.',path)?.fields,[...defaults,'deposit']);
  for(const [part,expected] of [['tuition balance','fee_balance'],['next class','next_class']] as const){
    const x=context('Show my housing bed and '+part+'.',path);assert.equal(x.companion,expected);assert.equal(x.otherQuestion,part);assert.equal(x.question,'Show my housing bed');
    const y=context('Show '+part+' and my housing bed.',path);assert.equal(y.companion,expected);assert.equal(y.question,'my housing bed');
  }
  for(const other of ['my tuition balance','my next class']){
    const x=context('Show my dormitory conduct. Do not show my housing fees and '+other+'.',path);
    assert.equal(x.selection,null);assert.equal(x.excluded,true);assert.equal(x.companion,null);assert.equal(x.otherQuestion,'Show my dormitory conduct. Do not show '+other);
    const y=context('Do not show my housing fees. Show '+other+'.',path);assert.equal(y.companion,other.includes('tuition')?'fee_balance':'next_class');
  }
});

test('common Taiwanese bed wording and relative terms retain owner boundaries',()=>{
  for(const q of ['我的宿舍床號是多少？','請問我的床號？','可以看我的宿舍床位嗎？']){
    const result=context(q,'/');
    assert.equal(result.selection?.reason,null,q);assert.equal(result.foreign,false,q);
  }
  const absolute=context('我的115學年度第1學期住宿床位','/');
  assert.equal(absolute.selection?.reason,null);assert.deepEqual(absolute.selection?.term,{academicYear:115,semester:1});
  for(const q of ['請顯示我本學期的住宿床位。','本學期我的住宿床位是什麼？','我上學期的宿舍床位',
    'What is my dormitory bed this semester?','Show my bed records for this semester.','What is my dormitory bed in academic year 115 this semester?']){
    const result=context(q,'/');
    assert.equal(result.selection?.reason,'ambiguous_selector',q);assert.equal(result.foreign,false,q);assert.deepEqual(result.selection?.fields,[],q);
  }
  for(const q of ['王小明的宿舍床號是什麼？','請顯示王小明本學期的住宿床位。','王小明的115學年度第1學期住宿床位','我和王小明的宿舍床位']){
    assert.equal(context(q,'/').selection?.reason,'foreign_request',q);
  }
  assert.equal(context('請問宿舍床位查詢在哪裡？','/').navigation,true);
  assert.equal(context('我的宿舍床位是哪個？','/').navigation,false);
  assert.deepEqual(context('我目前的住宿床位','/').selection?.unsupported,['current_residence']);
});
