import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import housing from './data/housingPolicy.json' with {type:'json'};
import wireless from './data/wirelessGuide.json' with {type:'json'};
import {publicPageForRoute} from './publicPageContext.js';
import {isPublicHousingPolicyQuestion} from './publicHousingPolicyIntent.js';
import {publicHousingContext} from './publicHousingEvidence.js';
import {publicDormWirelessAnswer} from './publicDormWirelessAnswer.js';

test('housing and wireless projections match registered capture checksums',()=>{
 for(const doc of [...housing.documents,...wireless.documents]){
  const page=publicPageForRoute(doc.url);assert.ok(page);assert.equal(doc.checksum,page.checksum);
  assert.equal(createHash('sha256').update(fs.readFileSync('public'+page.file)).digest('hex'),doc.checksum);
 }
});
test('public housing procedures stay separate from private amounts, assignments and other services',()=>{
 for(const q of ['What are the dorm fees and how do I apply?','How and when can I move out of the dorm?'])assert.equal(isPublicHousingPolicyQuestion(q),true,q);
 for(const q of ['How much is my current dorm fee?','What is my housing deposit?','What dorm fees does my friend pay?','我的宿舍費是多少？','How do I report a broken dorm light?','How do I get dorm Wi-Fi for my laptop?'])assert.equal(isPublicHousingPolicyQuestion(q),false,q);
 const context=publicHousingContext('What are the dorm fees and how do I apply?');assert.ok(context.contentAvailable);assert.equal(context.additionalEvidence.length,1);
 assert.equal(publicHousingContext('Show my assigned dorm room and balance'),null);
});
test('dorm wireless guidance preserves registration separation and source-derived networks/contact',()=>{
 const reply=publicDormWirelessAnswer('How do I get dorm Wi-Fi for my laptop?');assert.ok(reply);
 for(const network of wireless.networks)assert.ok(reply.answer.includes(network));
 assert.ok(reply.answer.includes(wireless.email));assert.ok(reply.answer.includes(wireless.extension));
 assert.match(reply.answer,/not a registration page/);
 assert.equal(publicDormWirelessAnswer('What is my dorm network password?'),null);
 assert.equal(publicDormWirelessAnswer('Explain dorm Wi-Fi and my tuition balance'),null);
});
