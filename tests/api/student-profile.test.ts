import assert from 'node:assert/strict';
import test from 'node:test';
import {studentProfileQuestion} from '../../server/studentProfileContract.js';

test('Student profile assistant distinguishes status from form instructions',()=>{
  for(const question of ['Have I confirmed my student profile?','Is my student information confirmed?','我的學生基本資料確認了嗎？']){
    assert.equal(studentProfileQuestion(question),'status',question);
  }
  for(const question of ['How can I confirm my student information?','學生基本資料確認在哪裡？','Where can I update my mobile number?']){
    assert.equal(studentProfileQuestion(question),'guide',question);
  }
  for(const question of ['Write code to update my student profile','Have I confirmed another student profile?','What is my current subject?']){
    assert.equal(studentProfileQuestion(question),null,question);
  }
});
