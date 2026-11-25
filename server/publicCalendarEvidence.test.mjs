import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import source from './data/calendarText.json' with {type:'json'};
import {isPublicCalendarDateQuestion,publicCalendarContext} from './publicCalendarEvidence.js';
import {publicCalendarDatesAnswer} from './publicCalendarDatesAnswer.js';

test('derived calendar rows retain their registered PDF checksum and actual page text',()=>{
 for(const document of source.documents){
  assert.equal(createHash('sha256').update(fs.readFileSync('public'+document.url)).digest('hex'),document.checksum);
  for(const row of document.events){
   const page=document.pages.find(page=>row.locator.startsWith(page.locator+':event:'));
   assert.ok(page?.text.includes(row.event),row.locator);
   assert.equal(new Date(row.date+'T00:00:00Z').toISOString().slice(0,10),row.date);
  }
 }
});
test('static calendar retrieval excludes personal records, live changes and unsupported years',()=>{
 for(const question of ['When is my next class today?','When can I graduate? Am I eligible?','What are the latest semester date changes?'])assert.equal(isPublicCalendarDateQuestion(question),false,question);
 assert.equal(publicCalendarContext('What are the semester dates for academic year 199?'),null);
});
test('dense date fallback uses source rows and keeps personal queries separate',()=>{
 const question='What semester dates and exam periods are published?';
 const context=publicCalendarContext(question),answer=publicCalendarDatesAnswer(question);
 const events=JSON.parse(context.evidence.content).events;
 for(const event of events){assert.ok(answer.answer.includes(event.date));assert.ok(answer.answer.includes(event.event));}
 assert.ok(answer.answer.includes(context.evidence.url));
 assert.equal(publicCalendarDatesAnswer('What are my semester dates and exam periods?'),null);
});
