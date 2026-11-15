import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assistantActivityStatus,assistantActivityTimeline} from '../../src/features/public/assistantActivityTimeline';
import type {AssistantProgress} from '../../src/services/researchAssistant';
import {sanitizeAssistantMessages} from '../../src/services/assistantConversation';
import {sanitizeStoredConversation} from '../../server/assistantConversationData.js';

const step=(kind:string,label:string,status:AssistantProgress['status'],detail=''):AssistantProgress=>({kind,label,detail,status});
const legacyFailure=(ordinal:number)=>step('verification-'+ordinal,'Answer could not be verified','unavailable','The current draft was withheld.');
const specificLookup=step('web-follow-up','Looking for a more specific school source','running','Checking the requested detail on official school pages.');
const stopped=step('verification-stop','Why verification stopped','unavailable','There was no additional usable evidence for another check.');

test('an unfinished draft and a targeted search remain distinct during a retry',()=>{
  const rows=[legacyFailure(1),step('verification-retry','Rechecking and correcting the answer','complete'),specificLookup];
  const display=assistantActivityTimeline(rows);
  assert.deepEqual(display.map(row=>row.label),['Draft did not pass verification','Rechecking and correcting the answer','Looking for a more specific school source']);
  assert.deepEqual(display.map(assistantActivityStatus),['Draft check','Completed','In progress']);
  assert.equal(display[2],specificLookup);
  assert.equal(rows[0].label,'Answer could not be verified');
  assert.equal(display[0].detail,'This draft was withheld after its evidence check.');
});

test('a saved timeline shows one final stop while retaining searches and source links after restoration',()=>{
  const incoming=[
    legacyFailure(1),{...specificLookup,status:'complete' as const},legacyFailure(2),stopped,
    step('answer','Answer could not be verified','unavailable','The unsupported draft was withheld.'),
  ];
  const citation={chunkId:'registrar',claim:'Registrar information',title:'Registrar',sourceName:'Registrar',url:'/在校學生/',
    locator:null,effectiveAt:null,reviewedAt:null};
  const client=sanitizeAssistantMessages([{id:'reply',role:'assistant',content:'The requested detail could not be verified.',phase:'complete',
    activity:incoming,result:{answer:'The requested detail could not be verified.',status:'abstained',citations:[citation],
      suggestedQuestions:[],activity:incoming,verification:{status:'unverified',attempts:2}}}]);
  const stored=sanitizeStoredConversation(client);
  const restored=sanitizeAssistantMessages(JSON.parse(JSON.stringify(stored)),true)[0];
  const display=assistantActivityTimeline(restored.activity??[]);
  assert.deepEqual(display.map(row=>row.kind),['verification-1','web-follow-up','verification-2','verification-stop']);
  assert.equal(assistantActivityStatus(display.at(-1)!), 'Stopped');
  assert.equal(display.at(-1)?.detail,stopped.detail);
  assert.deepEqual(restored.activity,incoming);
  assert.deepEqual(restored.result?.activity,incoming);
  assert.deepEqual(restored.result?.citations,[citation]);
});

test('already specific failure details and later success remain visible at their original step',()=>{
  const reviewed=step('verification-1','Draft did not pass verification','unavailable','Some claims could not be matched to the available evidence.');
  const deeper=step('web-deeper-discovery','Searching for the original notice or policy','complete','Read additional official source contents.');
  const ready=step('answer','Answer ready','complete');
  assert.deepEqual(assistantActivityTimeline([reviewed,deeper,ready]),[reviewed,deeper,ready]);
  const oldFinal=step('answer','Verification incomplete','unavailable');
  assert.deepEqual(assistantActivityTimeline([oldFinal]),[oldFinal]);
  assert.deepEqual(assistantActivityTimeline([stopped,oldFinal]),[stopped]);
});
