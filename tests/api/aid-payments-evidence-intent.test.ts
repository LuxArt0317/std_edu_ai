import assert from 'node:assert/strict';
import {test} from 'node:test';
import {selectAidPaymentsEvidence as select,isForeignAidPaymentsQuestion as foreign,isAidPaymentsEvidenceQuestion as matches,aidPaymentsLookupContext as context,aidPaymentsNavigation as navigation,isAidPaymentsScopeQuestion as scope} from '../../server/aidPaymentsEvidenceIntent.js';
const salary='/school-affairs/services/37-1/salary',claims='/school-affairs/services/37-1';

test('named, alphanumeric, relative and Chinese owners never select caller aid rows',()=>{
  for(const question of ['Show Alice’s student salary records.','Does Alice have salary records?','Show salary records for Alice.',
    'Show my colleague’s financial aid claims.','Show the aid claim records of my mother.','Show QA123’s salary records.',
    'Show student QA123 salary records.','請顯示王小明的工讀薪資。','請顯示王小明自己的薪資。','請顯示學生QA123的工讀薪資。']){
    assert.equal(select(question,salary),null,question);assert.equal(foreign(question,salary),true,question);
  }
  for(const question of ['Show Alice’s saved records.','What is the status for QA123?','請顯示王小明的紀錄。','請顯示QA123的狀態。','Does Alice have saved claims?']){
    assert.equal(select(question,claims),null,question);assert.equal(foreign(question,claims),true,question);
    assert.equal(foreign(question,'/'),false,question);
  }
  for(const question of ['What’s my student salary?','請顯示我的紀錄。','Show my salary records for October.','我的工讀薪資','請顯示我的薪資。']){
    assert.equal(foreign(question,salary),false,question);assert.deepEqual(select(question,salary)?.views,['salary'],question);
  }
});
test('latest user antecedent overrides incidental route and never inherits assistant or stale foreign state',()=>{
  const history=[{role:'user',content:'Show my salary records.'},{role:'user',content:'Show my tuition balance.'}];
  assert.equal(select('What is its status?',salary,history),null);
  assert.equal(select('What is its status?',salary,[{role:'user',content:'Show my student aid claims.'}])?.from,'history');
  assert.deepEqual(select('What is its status?',salary,[{role:'user',content:'Show my student aid claims.'}])?.views,['claims']);
  const foreignHistory=[{role:'user',content:'Show Alice’s salary records.'}];
  assert.equal(select('What is the net?',salary,foreignHistory),null);assert.equal(foreign('What is the net?',salary,foreignHistory),true);
  assert.equal(foreign('What is the net?',salary,[...foreignHistory,{role:'user',content:'Show my student salary.'}]),false);
  assert.equal(select('What is the total?','/',[{role:'assistant',content:'Show my salary records.'}]),null);
});
test('explicit selected pages preserve native view, accept1..201 and ignore unrelated route queries',()=>{
  for(const page of [1,2,201])assert.deepEqual(select('Show my salary records on page '+page+'.',salary)?.pages,{salary:page});
  assert.deepEqual(select('On page 2, show my student salary records.',salary)?.pages,{salary:2});
  assert.deepEqual(select('Show my salary records.',salary+'?page=2')?.pages,{salary:2});
  assert.deepEqual(select('Show my student aid claims.',salary+'?page=2')?.pages,{claims:1});
  assert.deepEqual(select('Show my salary records.','/school-affairs/services/12-3?page=99')?.pages,{salary:1});
  assert.deepEqual(select('Show my salary records page 2 and my student aid claims page 3.',salary)?.pages,{salary:2,claims:3});
  assert.deepEqual(select('Show my student aid claims page 3. Show my salary records page 2.',salary)?.pages,{salary:2,claims:3});
  assert.deepEqual(select('Show my salary records. Show my housing application page 9.',salary)?.pages,{salary:1});
  assert.deepEqual(select('請顯示我的工讀薪資第2頁。',salary)?.pages,{salary:2});
});
test('malformed, duplicate, conflicting or unbound page requests fail before a reader can use them',()=>{
  for(const page of ['0','202','-1','2.5','02','NaN','two','']){
    const result=select('Show my salary records page '+page+'.',salary);assert.equal(result?.reason,'invalid_page',page);assert.deepEqual(result?.pages,{},page);
  }
  for(const route of [salary+'?page=2&page=3',salary+'?page=2&page=2'])assert.equal(select('Show my salary records.',route)?.reason,'ambiguous_page');
  assert.equal(select('Show my salary page 2. Show my salary page 3.',salary)?.reason,'ambiguous_page');
  assert.equal(select('Show my student aid claims and salary records. Page 2.',salary)?.reason,'ambiguous_page');
  assert.equal(select('Show my salary records.',salary+'?page=bad')?.reason,'invalid_page');
});
test('relative pages use only exact current native view URL and enforce both boundaries',()=>{
  assert.deepEqual(select('Show the next page.',salary+'?page=2')?.pages,{salary:3});
  assert.deepEqual(select('Show the previous page.',salary+'?page=2')?.pages,{salary:1});
  assert.deepEqual(select('下一頁',salary+'?page=2')?.pages,{salary:3});
  assert.equal(select('Show the previous page.',salary)?.reason,'invalid_page');
  assert.equal(select('Show the next page.',salary+'?page=201')?.reason,'invalid_page');
  assert.equal(select('Show my salary records on the next page.','/')?.reason,'ambiguous_page');
  assert.equal(select('Show my student aid claims on the next page.',salary+'?page=2')?.reason,'ambiguous_page');
});
test('unrelated, excluded and malformed route requests do not gain aid access',()=>{
  for(const q of ['Show my tuition balance.','Show my scholarship application.','Show my grades.','Do not show my salary records.','Don’t show my salary records.'])assert.equal(matches(q,salary),false,q);
  assert.equal(matches('Show my salary records.',salary+'/../salary'),false);
  assert.equal(matches('Show my salary records.',salary+'?owner_id=foreign'),false);
  assert.deepEqual(select('Show my student aid claims, not my salary records.',salary)?.views,['claims']);
  assert.deepEqual(select('Show my salary without student aid claims.',salary)?.views,['salary']);
});


test('mixed financial and independent clauses retain both sources without private projection widening',()=>{
  for(const other of ['Show my tuition balance.','What is my next class?','Show my courses.','Show my assignments.']){
    for(const question of ['Show my salary records. '+other,other+' Show my salary records.']){
      const result=context(question,salary);assert.deepEqual(result.selection?.views,['salary'],question);
      assert.equal(result.question,'Show my salary records',question);assert.equal(result.otherQuestion,other.replace(/[?.]$/u,''),question);
    }
  }
  const fields=context('Show my student salary records. What is the net and tax?',salary);
  assert.match(fields.question,/net and tax/u);assert.equal(fields.otherQuestion,'');
  assert.equal(context('Show my salary records. Do not show my tuition balance.',salary).otherQuestion,'Do not show my tuition balance');
  const negative=context('Do not show my salary records. Show my tuition balance.',salary);
  assert.equal(negative.excluded,true);assert.equal(negative.question,'');assert.equal(negative.otherQuestion,'Show my tuition balance');
});


test('view negation is latest-mention bound and excluded/unrelated pages cannot migrate to salary',()=>{
  for(const q of ['Show my salary, but skip my salary.','Show my salary records. Do not show my salary records.']){
    assert.equal(select(q,salary),null,q);assert.equal(context(q,salary).excluded,true,q);assert.equal(context(q,salary).question,'');assert.equal(scope(q,salary),true);
  }
  assert.deepEqual(select('Do not show my salary. Show my salary records.',salary)?.views,['salary']);
  for(const q of ['Show my salary records and do not show my student aid claims on page 2.','Show my salary records. Do not show my student aid claims on page 2.',
    'Page 9. Show my housing application. Show my salary records.','Show my housing application. Page 9. Show my salary records.'])assert.deepEqual(select(q,salary)?.pages,{salary:1},q);
  assert.deepEqual(select('Show my salary records on page 1, not page 2.',salary)?.pages,{salary:1});
  for(const q of ['Show my salary records on the current page, not the next page.','Show my salary records, not the next page.','Show my salary records, excluding the next page.'])assert.deepEqual(select(q,salary+'?page=1')?.pages,{salary:1},q);
  assert.deepEqual(select('Page 2. Show my salary records.',salary)?.pages,{salary:2});
  assert.deepEqual(select('Show my salary records. Page 2.',salary)?.pages,{salary:2});
});
test('real translated headings, saved fields and period labels remain own scoped',()=>{
  for(const q of ['獎助金薪資查詢','學生兼任助理薪資','薪資查詢作業','請顯示我的獎助金薪資查詢。',
    'List my student salary payment periods and the saved net pay for each.','What’s my student salary tax?',
    'Show my student salary rate, work units, gross and net for the payment period "QA Archive Z". Keep each saved field independent.']){
    assert.equal(foreign(q,salary),false,q);assert.deepEqual(select(q,salary)?.views,['salary'],q);
  }
  for(const q of ['請顯示王小明的獎助金薪資查詢。','請顯示王小明學生兼任助理薪資。'])assert.equal(foreign(q,salary),true,q);
  assert.deepEqual(select('Show the saved payment periods and net amounts on this page.',salary+'?page=2')?.pages,{salary:2});
  for(const q of ['給付起迄日','給付淨額','我的所得稅'])assert.deepEqual(select(q,salary)?.views,['salary'],q);
  assert.deepEqual(select('請領金額',claims)?.views,['claims']);
  assert.equal(select('What is its status?',salary,[{role:'user',content:'Show my salary and my tuition balance.'}]),null);
  for(const q of ['Show my student salary for Alice.','Show my salary for QA123.'])assert.equal(select(q,salary),null,q);
});
test('public navigation is auth-neutral and never swallows fields, page selectors or independent questions',()=>{
  for(const [question,view] of [['Where can I see my student salary?','salary'],['Where do I check student aid claims?','claims'],
    ['Give me the link for my student salary records.','salary'],['哪裡可以查詢我的工讀薪資？','salary']]){
    assert.equal(navigation(question),view,question);assert.equal(select(question,salary),null,question);assert.equal(scope(question,salary),true,question);
  }
  for(const q of ['Where can I see my student salary status?','Where can I see my student salary on page 2?',
    'Where can I see my student salary? What is the net?','Where can I see my student salary and my tuition balance?',
    'Where can I see Alice’s student salary?','What is student salary?','Show my student salary amount.'])assert.equal(navigation(q),null,q);
  assert.equal(scope('Show my tuition balance.',salary),false);
});


test('student aid applications remain independent from aid-payment claims and salary fields',()=>{
  const q='Show my student salary records and the status of my disadvantaged student aid application and my tuition balance.';
  const result=context(q,salary);assert.deepEqual(result.selection?.views,['salary']);assert.equal(result.question,'Show my student salary records');
  assert.equal(result.otherQuestion,'the status of my disadvantaged student aid application. my tuition balance');
  const reverse=context('Show my disadvantaged student aid application and my tuition balance and my student salary records.',salary);
  assert.equal(reverse.question,'my student salary records');assert.equal(reverse.otherQuestion,'Show my disadvantaged student aid application. my tuition balance');
  assert.equal(select('Show the status of my disadvantaged student aid application.',salary),null);
  const fields=context('Show my salary records and the status of my student aid claims.',salary);
  assert.deepEqual(fields.selection?.views,['claims','salary']);assert.equal(fields.otherQuestion,'');assert.match(fields.question,/status of my student aid claims/u);
});
