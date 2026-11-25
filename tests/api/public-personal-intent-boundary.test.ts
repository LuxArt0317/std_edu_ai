import assert from 'node:assert/strict';
import test from 'node:test';
import {isPublicClubQuestion} from '../../server/publicClubIntent.js';
import {isPublicCalendarDateQuestion} from '../../server/publicCalendarEvidence.js';
import {publicTuitionAnswer} from '../../server/publicTuitionAnswer.js';

test('an amount still owed is personal, not a published tuition rate',()=>{
  assert.equal(publicTuitionAnswer('How much tuition do I still owe?'),null);
  assert.equal(publicTuitionAnswer('How much is my tuition?'),null);
  assert.ok(publicTuitionAnswer('How much is tuition?'));
});

test('personal event attendance cannot be redirected to public club or calendar research',()=>{
  for(const question of [
    'What club events have I attended? Include the start, where and when recorded.',
    'Which club events has another student attended and when did they start?',
    'When were my club events recorded?',
  ]){
    assert.equal(isPublicClubQuestion(question),false,question);
    assert.equal(isPublicCalendarDateQuestion(question),false,question);
  }
});

test('public club navigation and institution calendar questions remain available',()=>{
  assert.equal(isPublicClubQuestion('Which clubs am I a member of, and which memberships are active?'),false);
  assert.equal(isPublicClubQuestion('Where can I join a club?'),true);
  assert.equal(isPublicClubQuestion('How can I join a club?'),true);
  assert.equal(isPublicClubQuestion('Which club events did I attend? Show page 2.'),false);
  assert.equal(isPublicClubQuestion('Which clubs have I joined?'),false);
  assert.equal(isPublicClubQuestion('Which clubs are available?'),true);
  assert.equal(isPublicCalendarDateQuestion('When does the semester start?'),true);
  assert.equal(isPublicCalendarDateQuestion('What events are scheduled this year?'),true);
});
