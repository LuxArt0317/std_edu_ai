import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantRequestBudgetMs,assistantRequestDeadline} from '../../server/assistantRequestBudget.js';

test('request budget defaults safely and rejects malformed or unbounded settings',()=>{
 for(const value of [undefined,'','NaN','Infinity','-1','0','4999','115001','9007199254740992','1e5','115000ms'])assert.equal(assistantRequestBudgetMs({ASSISTANT_REQUEST_BUDGET_MS:value}),55000);
 assert.equal(assistantRequestBudgetMs({ASSISTANT_REQUEST_BUDGET_MS:'115000'}),115000);
 assert.equal(assistantRequestBudgetMs({ASSISTANT_REQUEST_BUDGET_MS:'5000'}),5000);
});
test('nested work cannot extend the parent deadline',()=>{
 const env={ASSISTANT_REQUEST_BUDGET_MS:'115000'};
 assert.equal(assistantRequestDeadline(1000,51000,env),51000);
 assert.equal(assistantRequestDeadline(1000,200000,env),116000);
 assert.equal(assistantRequestDeadline(1000,Infinity,{}),56000);
});
