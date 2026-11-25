import test from 'node:test';
import assert from 'node:assert/strict';
import {isPublicScholarshipPolicyQuestion as policy} from './publicScholarshipIntent.js';
test('public rules remain public even with a possessive phrase',()=>{
 assert.equal(policy('Can you explain my IPIAC scholarship, including its regulations for different academic years of entry?'),true);
 assert.equal(policy('How is the tuition deduction for scholars calculated?'),true);
 assert.equal(policy('What are the requirements for applying for the IPIAC scholarship?'),true);
 assert.equal(policy('我的新南向專班獎學金申請條件是什麼？'),true);
});
test('personal outcomes are never established from public rules',()=>{
 for(const text of ['What is my approved IPIAC award amount?','Explain my IPIAC scholarship status','我的新南向專班獎學金核准狀態？','如何計算我的新南向專班獎學金金額？','What are my current subjects?'])assert.equal(policy(text),false,text);
});
