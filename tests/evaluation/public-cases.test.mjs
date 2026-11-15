import assert from 'node:assert/strict';
import {test} from 'node:test';
import captures from '../../src/features/public/mirror/pages.json' with {type:'json'};
import {buildPublicCases} from './public-cases.mjs';
import {gradeCase} from './grading.mjs';
import {answerDirectoryQuestion} from '../../server/schoolAffairsDirectory.js';

const cases=buildPublicCases({publicPages:captures,tools:[]}).filter(row=>row.domain==='public-page-context');
const envelope=(testCase,answer)=>({statusCode:200,execution:'deterministic',fixtureKey:testCase.fixtureKey,sourceRevision:'synthetic-public-bank-review',body:{status:'answered',answer,citations:[],activity:[],verification:{status:'verified',attempts:1}}});

test('School Affairs directory case grading checks the actual controls, facilities and destinations',()=>{
  const menuCases=buildPublicCases({publicPages:[],tools:[]}).filter(row=>row.id.startsWith('public-affairs-'));
  assert.equal(menuCases.length,3);
  for(const row of menuCases){
    const body=answerDirectoryQuestion(row.question,row.route);
    assert.ok(body);
    assert.equal(gradeCase(row,{...envelope(row,body.answer),body}).passed,true,row.route);
    assert.equal(gradeCase(row,envelope(row,'[Open this page]('+row.route+')')).passed,false);
  }
});

test('the custom menu response points to browser-local favorites without inventing entries',()=>{
  const row=buildPublicCases({publicPages:[],tools:[]}).find(item=>item.id==='public-custom-menu-browser-only');
  const body=answerDirectoryQuestion(row.question,row.route);
  assert.equal(gradeCase(row,{...envelope(row,body.answer),body}).passed,true);
  assert.deepEqual(body.citations.map(citation=>citation.url),[row.route]);
  assert.equal(gradeCase(row,envelope(row,'Here are your saved links. [Custom menu]('+row.route+')')).passed,false);
});

test('all public pages have a concrete nonempty title oracle or a specific missing-title oracle',()=>{
  assert.equal(cases.length,395);
  for(const row of cases) {
    assert.ok(row.expected.requiredText.every(value=>typeof value==='string'&&value.trim()),row.route);
    assert.equal(row.expected.provenance,'snapshot');
    if(row.source.titleAvailability==='missing') {
      assert.equal(row.expected.behavior,'unavailable');assert.ok(row.expected.limitation.anyOf.length);
      assert.equal(row.capability.gap,true);assert.equal(row.capability.level,'partial');
    } else {
      assert.equal(row.expected.behavior,'answer');assert.equal(row.expected.limitation,undefined);
    }
  }
  assert.equal(cases.filter(row=>row.source.titleAvailability==='missing').length,15);
});

test('generic prose, a date and a link do not pass a missing-title capture case',()=>{
  const row=cases.find(item=>item.source.titleAvailability==='missing');
  const result=gradeCase(row,envelope(row,`This is a saved public page. [Open](${row.route})\nSource snapshot: ${row.source.capturedOn}`));
  assert.equal(result.passed,false);assert.ok(result.failures.some(check=>check.id==='answer.limitation.specific'));
});

test('an unrelated limitation does not substitute for the missing page title',()=>{
  const row=cases.find(item=>item.source.titleAvailability==='missing');
  const result=gradeCase(row,envelope(row,`The office opening time is unavailable. [Open](${row.route})\nSource snapshot: ${row.source.capturedOn}`));
  assert.equal(result.passed,false);assert.ok(result.failures.some(check=>check.id==='answer.limitation.specific'));
});

test('a specific honest missing-title disclosure passes behavior while retaining the product gap',()=>{
  const row=cases.find(item=>item.source.titleAvailability==='missing');
  const result=gradeCase(row,envelope(row,`No page title is available in the saved metadata. The saved text is unavailable. [Open](${row.route})\nSource snapshot: ${row.source.capturedOn}`));
  assert.equal(result.passed,true,JSON.stringify(result.failures));
  assert.equal(result.capability.gap,true);assert.equal(result.capability.level,'partial');
});

test('recorded titles cannot be replaced with an unnecessary missing-title answer',()=>{
  const row=cases.find(item=>item.source.titleAvailability==='recorded');
  const result=gradeCase(row,envelope(row,`No page title is available. [Open](${row.route})\nSource snapshot: ${row.source.capturedOn}`));
  assert.equal(result.passed,false);assert.ok(result.failures.some(check=>check.id==='text.required.0'));
});

test('an unchecked metadata draft cannot pass the public-page verification expectation',()=>{
  const row=cases.find(item=>item.source.titleAvailability==='missing');
  const response=envelope(row,`No page title is available in the saved metadata. [Open](${row.route})\nSource snapshot: ${row.source.capturedOn}`);
  delete response.body.verification;
  const result=gradeCase(row,response);
  assert.equal(result.passed,false);assert.ok(result.failures.some(check=>check.id==='answer.verification.expected'));
});
