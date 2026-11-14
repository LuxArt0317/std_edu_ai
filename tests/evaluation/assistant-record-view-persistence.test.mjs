import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sanitizeAssistantMessages} from '../../src/services/assistantConversation.ts';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';

test('browser and server persistence keep the same eight record columns and literal values',()=>{
  const cols=['Academic year','Semester','Bed number','Dormitory','Bunk','Accommodation fee','Deposit','Subsidy amount','Outside the view limit'];
  const cells=['115','1','A-101','Test Hall','upper','8500.25','0','Not recorded','Dropped'];
  const view={id:'housing',title:'Housing sample',url:'/school-affairs/services/34-1',columns:cols,rows:[cells],total:1,checkedAt:'2026-11-15T12:00:00Z',note:'Sample data'};
  const answer='Your checked dormitory assignment.';
  const input=[{id:'u',role:'user',content:'Where is my bed?'},
    {id:'a',role:'assistant',content:answer,result:{status:'answered',answer,views:[view]}}];
  const client=sanitizeAssistantMessages(input);
  const stored=sanitizeStoredConversation(client);
  assert.equal(client.length,2);
  const expected={...view,columns:cols.slice(0,8),rows:[cells.slice(0,8)]};
  assert.deepEqual(client[1].result?.views,[expected]);
  assert.deepEqual(stored[1].result?.views,[expected]);
  assert.deepEqual(sanitizeAssistantMessages(stored)[1].result?.views,[expected]);
});
