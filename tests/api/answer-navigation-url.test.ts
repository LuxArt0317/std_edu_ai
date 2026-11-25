import assert from 'node:assert/strict';
import test from 'node:test';
import {answerLinksSupported} from '../../server/answerVerificationModel.js';
import {navigationUrlKey} from '../../server/answerNavigationUrl.js';
test('encoded and readable local destinations compare equally without dropping selectors',()=>{
 assert.equal(navigationUrlKey('/行政單位/'),navigationUrlKey('https://stu.best/%E8%A1%8C%E6%94%BF%E5%96%AE%E4%BD%8D/'));
 for(const candidate of ['https://evil.example/行政單位/','//evil.example/行政單位/','/行政單位/?user=other','/行政單位/#other','/行政單位','/行政%2F單位/'])assert.notEqual(navigationUrlKey(candidate),navigationUrlKey('/行政單位/'));
});

test('answer link verifier accepts only supplied equivalent destinations',()=>{
 const evidence=[{id:'public-page:directory',url:'/%E8%A1%8C%E6%94%BF%E5%96%AE%E4%BD%8D/',content:'Verified directory'}];
 assert.equal(answerLinksSupported('[Office directory](/行政單位/)',evidence),true);
 assert.equal(answerLinksSupported('[Office directory](https://stu.best/行政單位/)',evidence),true);
 assert.equal(answerLinksSupported('[Office directory](https://evil.example/行政單位/)',evidence),false);
 assert.equal(answerLinksSupported('[Office directory](/行政單位/?student=other)',evidence),false);
});
