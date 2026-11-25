import assert from 'node:assert/strict';
import test from 'node:test';
import {publicProspectusContext} from '../../server/publicProspectusEvidence.js';
import {publicProspectusResponseNeeds} from '../../server/publicProspectusResponseNeeds.js';
const question='What are the requirements for applying for the IPIAC scholarship?';
test('source-present scholarship roles generate coverage guidance without answer values',()=>{
 const context=publicProspectusContext(question)!;
 const notes=publicProspectusResponseNeeds(question,[context.evidence]);
 assert.equal(notes.length,5);
 const joined=notes.join('\n');
 for(const pattern of [/signature/u,/tier amounts/u,/either\/or/u,/recipient service obligation/u,/semester-specific/u])assert.match(joined,pattern);
 assert.doesNotMatch(joined,/20,000|10,000|3,000|85|75|A2|36 hours/u);
 assert.ok(notes.every(note=>note.length<=650));
});
test('missing sections and missing literal conditions cannot generate completion claims',()=>{
 const context=publicProspectusContext(question)!;
 const data=JSON.parse(context.evidence.content);
 data.excerpt='pdf:page:27 Scholarship Application Form for Foreign Student';
 const notes=publicProspectusResponseNeeds(question,[{...context.evidence,content:JSON.stringify(data)}]);
 assert.deepEqual(notes,[]);
 assert.deepEqual(publicProspectusResponseNeeds('How much is IPIAC tuition?',[context.evidence]),[]);
 assert.deepEqual(publicProspectusResponseNeeds(question,[{...context.evidence,content:'invalid'}]),[]);
 assert.deepEqual(publicProspectusResponseNeeds(question,[{...context.evidence,id:'untrusted'}]),[]);
});
