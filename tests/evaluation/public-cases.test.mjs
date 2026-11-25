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

test('institutional cases require factual content and an exact dated snapshot citation',()=>{
  const cases=buildPublicCases({publicPages:captures,tools:[]}).filter(row=>row.domain==='public-institution');
  assert.equal(cases.length,2);
  for(const row of cases){
    const source=row.expected.requiredSourceBindings[0];
    const answer=row.language==='en'
      ?'The school was approved to establish and recruit students in 1997. Its mission emphasizes the balance of theory and practice.'
      :'樹德科技大學的校訓是「學術、知性、快樂、希望」。';
    const graded=envelope(row,answer+'\n\nSource snapshot: '+row.source.capturedOn+'.');
    graded.body.citations=[{chunkId:source.sourceId,url:source.url}];
    assert.deepEqual(gradeCase(row,graded).failures,[],row.id);
    const removedFacts={...graded,body:{...graded.body,answer:'[Open school page]('+source.url+')\nSource snapshot: '+row.source.capturedOn}};
    assert.ok(gradeCase(row,removedFacts).failures.some(item=>item.id==='text.required.0'));
    const wrongCitation={...graded,body:{...graded.body,citations:[{chunkId:'other-source',url:source.url}]}};
    assert.ok(gradeCase(row,wrongCitation).failures.some(item=>item.id==='source.binding.0'));
  }
});

test('Student Leave form directions select only the application page through both assistant entry points',async()=>{
  const [{createResearchAssistantHandler},{createAffairsAssistantHandler}]=await Promise.all([
    import('../../server/researchAssistantHandler.js'),import('../../api/affairs-assistant.ts'),
  ]);
  const row=buildPublicCases({publicPages:[],tools:[]}).find(item=>item.id==='public-service-leave');
  const historyPath='/school-affairs/services/leave/history';
  const queries=[row.question,'Where is the student leave form?','Where do I submit a student leave request?',
    'Where can I open the student leave form from this page?'];
  let companionChecks=0;
  const account=createAffairsAssistantHandler({
    verifyToken:async token=>{
      assert.equal(token,'OFFLINE-LEAVE-NAVIGATION-CALLER');
      return {user:{id:'12000000-0000-4000-8000-000000000001'},url:'https://example.invalid'};
    },
    loadSnapshot:async()=>assert.fail('Navigation must not read the account snapshot'),
    publicResearch:async()=>assert.fail('Navigation must not dispatch research'),
    answerAccount:async({question,leavePlan,supplementalReaders})=>{
      assert.equal(question,'show my tuition balance');
      assert.equal(leavePlan.selection,null);
      assert.deepEqual(Object.keys(supplementalReaders),[]);
      companionChecks++;
      return {status:'handoff',answer:'The separate fee balance is unavailable.',citations:[]};
    },
  });
  const guest=createResearchAssistantHandler();
  async function ask(handle,question,route,authenticated,address){
    let code,body;
    const response={setHeader(){},status(value){code=value;return response;},json(value){body=value;}};
    await handle({method:'POST',headers:{'x-forwarded-for':address,...(authenticated?{authorization:'Bearer OFFLINE-LEAVE-NAVIGATION-CALLER'}:{})},
      body:{question,route,history:[]}},response);
    assert.equal(code,200,question);
    return body;
  }
  const originalFetch=globalThis.fetch,network=[];
  let address=20;
  globalThis.fetch=async(input,init)=>{
    network.push({remote:new URL(String(input)).origin,method:init?.method});
    throw new Error('Unexpected network call in local leave navigation test');
  };
  try{
    for(const handle of [guest,account]){
      const authenticated=handle===account;
      const request=(question,route='/')=>ask(handle,question,route,authenticated,'192.0.2.'+(address++));
      for(const question of queries){
        const body=await request(question,question===row.question?'/':historyPath);
        assert.deepEqual(body.citations.map(item=>item.url),[row.expected.requiredLinks[0]],question);
        const observed={...envelope(row,body.answer),body,events:[]};
        assert.deepEqual(gradeCase(row,observed).failures,[],JSON.stringify({question,answer:body.answer}));
        if(question===row.question){
          const misdirected={...observed,body:{...body,citations:[...body.citations,{url:historyPath}]}};
          assert.ok(gradeCase(row,misdirected).failures.some(item=>item.id==='links.forbidden.0'));
        }
      }
      const history=await request('Where can I find my leave history?');
      assert.ok(history.citations.some(item=>item.url===historyPath));
      const write=await request('Submit my student leave request.',historyPath);
      assert.equal(write.proposedAction,undefined);
      assert.equal(write.status,'clarification');
      assert.ok(!write.citations.length);
    }
    const mixed=await ask(guest,'Where is the student leave form? Also show my tuition balance.', '/',false,'192.0.2.'+(address++));
    assert.equal(mixed.status,'handoff');
    assert.deepEqual(mixed.citations.map(item=>item.url),[
      '/school-affairs/services/leave','/school-affairs/login?next=%2Fschool-affairs%2Fservices%2F39-1',
    ]);
    const signedInMixed=await ask(account,'Where is the student leave form? Also show my tuition balance.', '/',true,'192.0.2.'+(address++));
    assert.match(signedInMixed.answer,/fee balance is unavailable/);
    assert.deepEqual(signedInMixed.citations.map(item=>item.url),['/school-affairs/services/leave']);
    assert.equal(companionChecks,1);
    assert.deepEqual(network,[]);
  }finally{globalThis.fetch=originalFetch;}
});
