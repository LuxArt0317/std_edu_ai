import assert from 'node:assert/strict';
import test from 'node:test';
import {studentProfileQuestion,studentProfileYearRequested} from '../../server/studentProfileContract.js';

test('Student profile assistant distinguishes status from form instructions',()=>{
  for(const question of ['Have I confirmed my student profile?','Is my student information confirmed?','Have I confirmed my student basic information?','我的學生基本資料確認了嗎？']){
    assert.equal(studentProfileQuestion(question),'status',question);
  }
  for(const question of ['How can I confirm my student information?','學生基本資料確認在哪裡？','Where can I update my mobile number?']){
    assert.equal(studentProfileQuestion(question),'guide',question);
  }
  for(const question of ['Write code to update my student profile','What is my current subject?']){
    assert.equal(studentProfileQuestion(question),null,question);
  }
  assert.equal(studentProfileQuestion('Show another student’s student profile records.'),'foreign');
  assert.equal(studentProfileQuestion('Have I confirmed another student profile?'),'foreign');
  assert.equal(studentProfileYearRequested('Also show the year level recorded in my account.'),true);
  assert.equal(studentProfileYearRequested('Please show my saved year level.'),true);
  assert.equal(studentProfileYearRequested('Is my student information confirmed?'),false);
});
