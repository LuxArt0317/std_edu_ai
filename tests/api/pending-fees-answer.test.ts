import assert from 'node:assert/strict';
import {test} from 'node:test';
import {answerPendingFees} from '../../server/pendingFeesAnswer.js';
import {answerPrivateAffairsQuestion} from '../../server/affairsAnswer.js';
const first={id:'one',label:'Sample charge',amountDue:100.5,amountPaid:0.25,currency:'TWD',dueOn:'2026-12-31',occurrenceOn:null,contactUnit:'Local fee office',contactExtension:'2300',paymentUnit:'Sample cashier',sourceMode:'sample'};
const snapshot={checkedAt:'2026-11-12T12:00:00Z',profile:{userId:'one'},charges:[first,{...first,id:'paid',label:'Settled',amountDue:10,amountPaid:10}],admin:{charges:[{...first,label:'SECRET_OTHER_ACCOUNT'}]}};
test('pending-fee answers include real saved contact fields, local link, exact cents, and no admin or settled rows',async()=>{
 const result=await answerPrivateAffairsQuestion('Where do I pay my outstanding fees?',snapshot);
 assert.match(result.answer,/Local fee office.*2300.*Sample cashier/);
 assert.match(result.answer,/Total remaining: NT\$100.25/);
 assert.doesNotMatch(result.answer,/SECRET_OTHER_ACCOUNT|Settled/);
 assert.equal((result.citations[0] as {url:string}).url,'/school-affairs/services/39-1');
 assert.match(result.answer,/local demonstration/);
});
test('occurrence dates remain missing, follow-up context is respected, and unrelated subjects do not become fees',()=>{
 const result=answerPendingFees('When is it due?',snapshot,'/school-affairs/services/39-1');
 assert.ok(result);assert.match(result.answer,/occurrence date not recorded; due date 2026-12-31/);
 assert.ok(answerPendingFees('Which contact unit?',snapshot,'',[{role:'user',content:'What are my pending fees?'}]));
 assert.equal(answerPendingFees('What are my subjects?',snapshot,'/school-affairs/services/39-1'),null);
 assert.equal(answerPendingFees('Where is the library?',snapshot),null);
 assert.equal(answerPendingFees('How can I balance my class schedule?',snapshot,'/school-affairs/services/39-1'),null);
 assert.equal(answerPendingFees('Help me balance my courses and assignments',snapshot),null);
 assert.ok(answerPendingFees('What is my course fee balance?',snapshot));
});
test('all-item totals remain complete beyond the displayed summary and separate currencies',()=>{
 const result=answerPendingFees('My unpaid fees', {...snapshot,charges:[...Array.from({length:501},(_,id)=>({...first,id:String(id),amountDue:0.3,amountPaid:0.2})),{...first,currency:'USD',amountDue:5,amountPaid:0}]});
 assert.ok(result);assert.match(result.answer,/Total remaining: NT\$50.1; USD 5/);
 assert.match(result.answer,/20 of 502 records; totals include every item/);
});
test('Chinese empty and contact answers do not invent payment or official records',()=>{
 assert.match(answerPendingFees('我的待繳費用',{...snapshot,charges:[]})?.answer||'',/目前沒有待繳項目/);
 const result=answerPendingFees('我的費用要在哪個單位繳？',snapshot);
 assert.ok(result);assert.match(result.answer,/站內示範/);assert.match(result.answer,/繳費單位 Sample cashier/);
});
