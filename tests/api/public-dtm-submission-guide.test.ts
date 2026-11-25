import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {publicDtmSubmissionGuide,isPublicDtmSubmissionProcedureQuestion} from '../../server/publicDtmSubmissionGuide.js';
import {dtmSubmissionMaxBytes} from '../../server/dtmSubmissions.js';

test('public file submission procedure matches mounted editor and preserves unknown activity',async()=>{
 const answer=publicDtmSubmissionGuide('How do I submit my midterm answers?')!;
 assert.match(answer.answer,/\/dtm\/assignments/u);
 assert.match(answer.answer,/Save changes/u);
 assert.match(answer.answer,new RegExp(String(dtmSubmissionMaxBytes/(1024*1024))+' MiB','u'));
 assert.match(answer.answer,/Which course and midterm activity/u);
 assert.equal(answer.proposedAction,undefined);
 const editor=await readFile('src/features/public/dtm/DtmSubmissionEditor.tsx','utf8');
 assert.ok(editor.includes('儲存更改'));
 assert.ok(editor.includes('最多附件：1'));
});

test('procedure intent does not consume private status, deadlines or requested actions',()=>{
 for(const q of ['Did I submit my midterm answers?','How do I submit my midterm for me?','How do I upload another student assignment?','How do I submit a late assignment?','When did I submit my assignment?','What is my submission status?','How do I delete my assignment?','How do I submit my scholarship answers?','How do I submit my leave answers?'])assert.equal(isPublicDtmSubmissionProcedureQuestion(q),false,q);
 assert.equal(isPublicDtmSubmissionProcedureQuestion('作業怎麼繳交？'),true);
 assert.match(publicDtmSubmissionGuide('作業怎麼繳交？')!.answer,/儲存更改/u);
});
