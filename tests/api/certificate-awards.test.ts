import assert from 'node:assert/strict';
import test from 'node:test';
import {certificateAwardQuestion} from '../../server/certificateAwardsContract.js';
import {certificateAwardGuide} from '../../server/certificateAwards.js';

test('certificate award queries distinguish navigation from private records',()=>{
  assert.equal(certificateAwardQuestion('How do I apply for a certificate award?'),'guide');
  assert.equal(certificateAwardQuestion('What is my certificate award status?'),'status');
  assert.equal(certificateAwardQuestion('我的證照獎助金審核狀態？'),'status');
  assert.equal(certificateAwardQuestion('How can I get an enrollment certificate?'),null);
  assert.equal(certificateAwardQuestion('write code for a certificate grant'),null);
  assert.match(JSON.stringify(certificateAwardGuide('my certificate award status','status')),/%2Fschool-affairs%2Fservices%2F52-1/u);
});
