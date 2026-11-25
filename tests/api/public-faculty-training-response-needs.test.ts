import assert from 'node:assert/strict';
import test from 'node:test';
import {publicFacultyTrainingContext,publicFacultyTrainingResponseNeeds} from '../../server/publicFacultyTrainingEvidence.js';
const question='What teacher training workshops are available and how can I register?';
test('training guidance uses actual selected entry, example-presence and event-registration scopes',()=>{
 const context=publicFacultyTrainingContext(question)!;
 const notes=publicFacultyTrainingResponseNeeds(question,[context.evidence,...context.additionalEvidence]);
 assert.equal(notes.length,3);
 assert.match(notes[0],/Faculty and Staff entry page/u);
 assert.match(notes[1],/cannot establish that the page has no examples/u);
 assert.match(notes[2],/date, eligibility/u);
 assert.match(notes[2],/published date, time and venue/u);
 assert.match(notes[2],/do not say the notice has no registration link/u);
 assert.match(notes[2],/staff role/u);
 assert.ok(notes.every(note=>note.length<=650));
 assert.doesNotMatch(notes.join('\n'),/2157|234451|Aromatherapy|115年/u);
});
test('missing source roles or foreign/private intent produce no invented coverage',()=>{
 const context=publicFacultyTrainingContext(question)!;
 assert.deepEqual(publicFacultyTrainingResponseNeeds('Am I registered for the teacher workshop?',[context.evidence]),[]);
 assert.deepEqual(publicFacultyTrainingResponseNeeds(question,[{...context.evidence,id:'arbitrary'}]),[]);
 assert.deepEqual(publicFacultyTrainingResponseNeeds(question,[{...context.evidence,content:'{}'}]),[]);
 assert.deepEqual(publicFacultyTrainingResponseNeeds(question,[{...context.evidence,content:'invalid'}]),[]);
});
