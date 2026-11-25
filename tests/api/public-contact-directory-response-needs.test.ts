import assert from 'node:assert/strict';
import test from 'node:test';
import {publicContactDirectoryContext,publicContactDirectoryResponseNeeds} from '../../server/publicContactDirectoryEvidence.js';
const question='Where can I find school office contact details and extensions?';
test('native catalog coverage uses source-present named contacts and purpose without numeric answer leakage',()=>{
 const context=publicContactDirectoryContext(question)!;
 const notes=publicContactDirectoryResponseNeeds(question,[context.evidence]);
 assert.equal(notes.length,3);
 assert.match(notes[0],/native contact\/extension catalog/u);
 assert.match(notes[1],/feedback-specific/u);
 assert.match(notes[2],/international-office contact page/u);
 assert.doesNotMatch(notes.join('\n'),/2007|1610|2242|course@|oica@/u);
 assert.ok(notes.every(note=>note.length<=650));
});
test('unknown or unavailable contact fields cannot trigger source-specific guidance',()=>{
 const context=publicContactDirectoryContext(question)!;
 const metadata=JSON.parse(context.evidence.content);
 metadata.contacts=metadata.contacts.map((row:any)=>({...row,extensions:[]}));
 assert.equal(publicContactDirectoryResponseNeeds(question,[{...context.evidence,content:JSON.stringify(metadata)}]).length,1);
 assert.deepEqual(publicContactDirectoryResponseNeeds(question,[{...context.evidence,urls:[],url:'/elsewhere'}]),[]);
 assert.deepEqual(publicContactDirectoryResponseNeeds('What is my email?',[context.evidence]),[]);
 assert.deepEqual(publicContactDirectoryResponseNeeds(question,[{...context.evidence,id:'arbitrary'}]),[]);
});
