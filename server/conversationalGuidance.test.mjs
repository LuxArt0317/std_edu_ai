import test from 'node:test';
import assert from 'node:assert/strict';
import {publicGuidanceEvidence} from './conversationalGuidance.js';
import {publicPaymentAnswer} from './publicPaymentAnswer.js';
import {answerLinksSupported} from './answerVerificationModel.js';
test('public brief includes its bill lookup as well as its source citation',()=>{
 const reply=publicPaymentAnswer('What are the tuition fee payment options and deadlines?');
 assert.equal(answerLinksSupported(reply.answer,publicGuidanceEvidence(reply)),true);
});
test('a public brief cannot introduce another remote destination',()=>{
 const evidence=publicGuidanceEvidence({answer:'Read [form](/dtm) or [outside](https://unexpected.invalid)',citations:[]});
 assert.equal(answerLinksSupported('[form](https://stu.best/dtm)',evidence),true);
 assert.equal(answerLinksSupported('[outside](https://unexpected.invalid)',evidence),false);
 assert.equal(answerLinksSupported('[other](/school-affairs/services/unknown)',evidence),false);
});
