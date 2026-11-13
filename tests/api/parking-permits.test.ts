import assert from 'node:assert/strict';
import test from 'node:test';
import {answerCampusNavigation} from '../../server/schoolAffairsDirectory.js';
import {schoolServiceEntries} from '../../src/features/public/affairs/studentServices.js';
import {parkingInstructionsPath,parkingPermitPath} from '../../src/features/public/affairs/parkingPermits.js';

test('the General Affairs parking entry and assistant point to the right pages',()=>{
  assert.equal(schoolServiceEntries.find(entry=>entry.title==='汽機車證申請')?.localUrl,parkingPermitPath);
  for (const [question,path] of [
    ['Where can I apply for a parking permit?',parkingPermitPath],
    ['汽機車證申請在哪裡？',parkingPermitPath],
    ['Where are the parking permit instructions?',parkingInstructionsPath],
    ['哪裡可以查看停車證申請須知？',parkingInstructionsPath],
  ]) {
    const answer=answerCampusNavigation(question);
    assert.equal(answer?.citations[0].url,path,question);
    assert.equal(answer?.grounding.webSearched,false);
  }
  assert.equal(answerCampusNavigation('What is the status of my parking permit?'),null);
});
