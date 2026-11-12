import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isMaskedStudentAidIdentity,studentAidApplicantLabel,studentAidTimestamp} from '../../src/services/studentAid';

test('aid identity display accepts masking and rejects complete or insufficiently masked numbers',()=>{
  for(const value of ['', '******1234','A******789','••••••1234','***'])assert.equal(isMaskedStudentAidIdentity(value),true,value);
  for(const value of ['A123456789','1234','A123456***','***12345','**1234','<b>***1234</b>','一******1234','*'.repeat(25)])
    assert.equal(isMaskedStudentAidIdentity(value),false,value);
});
test('aid labels distinguish duplicate names and timestamps explicitly use Taipei time',()=>{
  assert.notEqual(studentAidApplicantLabel({user_id:'a',display_name:'Alex',email:'a@example.invalid'}),
    studentAidApplicantLabel({user_id:'b',display_name:'Alex',email:'b@example.invalid'}));
  assert.equal(studentAidApplicantLabel({user_id:'stable-id',display_name:'Alex',email:''}),'Alex (stable-id)');
  assert.equal(studentAidTimestamp('2026-11-12T17:30:00Z'),'2026/11/13 01:30:00');
  assert.equal(studentAidTimestamp('invalid'),'—');
});
