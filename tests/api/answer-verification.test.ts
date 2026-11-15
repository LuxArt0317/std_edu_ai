import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runAnswerVerification} from '../../server/answerVerification.js';
import {reviewMatchesEvidence,answerLinksSupported,validEvidence,verifyEvidenceAnswer,repairEvidenceAnswer} from '../../server/answerVerificationModel.js';
import {accountEvidence,planAccountLookup,publicTopics} from '../../server/answerVerificationAccount.js';

const draft={status:'answered',answer:'The unpaid balance is NT$900.',citations:[],proposedAction:{kind:'create_task',label:'Review fees',payload:{title:'Review fees'}}};
const evidence=[{id:'fees',content:'Tuition 1000, paid 400, balance 600.',url:'/school-affairs/records'}];

test('missing correction evidence is distinguished from a provider failure without approving a draft',async()=>{
 const result=await runAnswerVerification({question:'What is the policy?',initialAnswer:draft,loadEvidence:async()=>[],verify:verifyEvidenceAnswer,repair:repairEvidenceAnswer});
 assert.equal(result.verification.reason,'evidence_unavailable');assert.equal(result.verification.attempts,2);
 assert.equal(result.status,'abstained');assert.deepEqual(result.citations,[]);assert.equal(result.proposedAction,undefined);
 const rejected=await runAnswerVerification({question:'What is the policy?',initialAnswer:draft,loadEvidence:async()=>evidence,verify:async()=>({ok:false}),repair:async()=>{throw Object.assign(new Error('Invented correction link'),{code:'CORRECTION_UNSUPPORTED'});}});
 assert.equal(rejected.verification.reason,'unsupported_claims');assert.equal(rejected.status,'abstained');
 const outage=await runAnswerVerification({question:'What is the policy?',initialAnswer:draft,loadEvidence:async()=>evidence,verify:async()=>({ok:false}),repair:async()=>{throw new Error('Provider unavailable');}});
 assert.equal(outage.verification.reason,'repair_unavailable');assert.equal(outage.status,'abstained');
});

test('LangGraph rejects a wrong draft, reloads records, corrects, and verifies a second time',async()=>{
  const order:string[]=[],steps:any[]=[];
  const result=await runAnswerVerification({question:'What do I owe?',initialAnswer:draft,
    loadEvidence:async({attempt})=>{order.push('read:'+attempt);return evidence;},
    verify:async({candidate})=>{order.push('verify');return {ok:candidate.answer==='NT$600 remains.'};},
    repair:async({candidate})=>{order.push('correct');return {...candidate,answer:'NT$600 remains.'};},
    onProgress:step=>steps.push(step),
  });
  assert.deepEqual(order,['read:1','verify','read:2','correct','verify']);
  assert.equal(result.answer,'NT$600 remains.');
  assert.deepEqual(result.verification,{status:'verified',attempts:2});
  assert.deepEqual(result.proposedAction,draft.proposedAction); // Only proposed, never executed.
  assert.ok(steps.some(step=>step.kind==='verification-retry'));
  assert.deepEqual(result.activity?.map(step=>step.kind),['verification-1','verification-retry','verification-2']);
});

test('a second unsupported draft is withheld together with its proposed action',async()=>{
  let reads=0,repairs=0;
  const result=await runAnswerVerification({question:'What do I owe?',initialAnswer:draft,
    loadEvidence:async()=>{reads++;return evidence;},verify:async()=>({ok:false}),repair:async()=>{repairs++;return draft;},
  });
  assert.equal(reads,2);assert.equal(repairs,1);
  assert.equal(result.status,'abstained');assert.equal(result.verification.status,'unverified');
  assert.match(result.answer,/could not verify/);assert.doesNotMatch(result.answer,/900/);
  assert.equal(result.proposedAction,undefined);assert.deepEqual(result.citations,[]);
});

test('a meaningful read-only rejection can trigger a deeper revision without another retrieval',async()=>{
  const steps:string[]=[];
  const initialAnswer={status:'answered',answer:'Incorrect balance',citations:[]};
  const result=await runAnswerVerification({question:'What do I owe?',initialAnswer,allowDeeperReview:true,
    loadEvidence:async({attempt})=>{steps.push('read:'+attempt);return evidence;},
    repair:async({attempt,candidate,feedback,evidence:current})=>{
      steps.push('repair:'+attempt);
      assert.equal(current,evidence);
      assert.deepEqual(feedback,['Subtract the saved amount paid.']);
      return {...candidate,answer:attempt===3?'NT$600 remains.':'Incorrect revision'};
    },
    verify:async({attempt,candidate})=>{
      steps.push('verify:'+attempt);
      return {ok:candidate.answer==='NT$600 remains.',reason:'unsupported_claims',feedback:['Subtract the saved amount paid.']};
    },
  });
  assert.deepEqual(steps,['read:1','verify:1','read:2','repair:2','verify:2','repair:3','verify:3']);
  assert.deepEqual(result.verification,{status:'verified',attempts:3});
  assert.equal(result.answer,'NT$600 remains.');
  assert.ok(result.activity?.some(step=>step.kind==='verification-deeper-review'));
});

test('lack of evidence, time, actionable feedback or safe read scope prevents a deeper review',async()=>{
  for(const discriminator of ['unavailable','deadline','action','no-feedback','no-evidence','three-failures']){
    const attempts:number[]=[];
    const initialAnswer={...draft,proposedAction:discriminator==='action'?draft.proposedAction:undefined};
    const result=await runAnswerVerification({question:'What do I owe?',initialAnswer,allowDeeperReview:true,
      deadline:Date.now()+(discriminator==='deadline'?10_000:45_000),
      loadEvidence:async()=>discriminator==='no-evidence'?[]:evidence,repair:async()=>initialAnswer,
      verify:async({attempt})=>{
        attempts.push(attempt);
        return {ok:false,reason:discriminator==='unavailable'?'evidence_unavailable':'unsupported_claims',
          feedback:discriminator==='no-feedback'?[]:['Match the saved charge only.']};
      },
    });
    assert.deepEqual(attempts,discriminator==='three-failures'?[1,2,3]:[1,2],discriminator);
    assert.equal(result.status,'abstained');
    assert.equal(result.proposedAction,undefined);
    assert.doesNotMatch(result.answer,/NT\$900/);
  }
});

test('a failed deeper revision is reported separately from checks that ran',async()=>{
  const initialAnswer={status:'answered',answer:'Bad fee amount',citations:[]};
  const result=await runAnswerVerification({question:'Fees?',initialAnswer,allowDeeperReview:true,
    loadEvidence:async()=>evidence,
    verify:async()=>({ok:false,reason:'unsupported_claims',feedback:['Check the paid amount.']}),
    repair:async({attempt})=>{if(attempt===3)throw new Error('No revised draft');return initialAnswer;},
  });
  assert.deepEqual(result.verification,{status:'unverified',attempts:2,reason:'repair_unavailable'});
  assert.ok(result.activity?.some(step=>step.kind==='verification-preparation-3'));
  assert.ok(result.activity?.every(step=>step.kind!=='verification-3'));
});

test('supported answers finish without a correction or duplicate read',async()=>{
  let reads=0;
  const result=await runAnswerVerification({question:'Fees?',initialAnswer:draft,loadEvidence:async()=>{reads++;return evidence;},verify:async()=>({ok:true}),repair:async()=>{throw new Error('must not repair');}});
  assert.equal(reads,1);assert.equal(result.verification.attempts,1);
});

test('expired budget and hung readers never release the draft',async()=>{
  const result=await runAnswerVerification({question:'Fees?',initialAnswer:draft,deadline:Date.now()+510,
    loadEvidence:async()=>new Promise(()=>{}),verify:async()=>({ok:true}),repair:async()=>draft});
  assert.equal(result.verification.status,'unverified');assert.equal(result.proposedAction,undefined);
});

test('unavailable verifier fails closed; broken progress callbacks do not affect validity',async()=>{
  const result=await runAnswerVerification({question:'Fees?',initialAnswer:draft,loadEvidence:async()=>evidence,
    verify:async()=>{throw new Error('provider down');},repair:async()=>draft,onProgress:()=>{throw new Error('closed stream');}});
  assert.equal(result.verification.status,'unverified');assert.equal(result.verification.attempts,2);
});

test('verbatim evidence quotes and every material claim must pass independently',()=>{
  const good={supported:true,answersQuestion:true,claims:[{claim:'600 remains',supported:true,evidenceId:'fees',quote:'balance 600'}]};
  assert.equal(reviewMatchesEvidence(good,evidence),true);
  assert.equal(reviewMatchesEvidence({...good,answersQuestion:false},evidence),false);
  assert.equal(reviewMatchesEvidence({...good,claims:[{...good.claims[0],quote:'balance 900'}]},evidence),false);
  assert.equal(reviewMatchesEvidence({...good,claims:[{...good.claims[0],evidenceId:'another-account'}]},evidence),false);
  assert.equal(reviewMatchesEvidence({...good,claims:[]},evidence),false);
  assert.equal(reviewMatchesEvidence({...good,claims:[...good.claims,{...good.claims[0],supported:false}]},evidence),false);
  assert.equal(validEvidence([...evidence,...evidence]),false);
});

test('image-derived approval needs an actual attached image; links require an exact supplied source',()=>{
  const review={supported:true,answersQuestion:true,claims:[{claim:'image claim',supported:true,evidenceId:'attached-image',quote:''}]};
  assert.equal(reviewMatchesEvidence(review,[],false),false);
  assert.equal(reviewMatchesEvidence(review,[],true),true);
  assert.equal(answerLinksSupported('[Records](/school-affairs/records)',evidence),true);
  assert.equal(answerLinksSupported('[Pay](https://evil.test/pay?token=secret)',evidence),false);
  assert.equal(answerLinksSupported('Visit https://evil.test/pay',evidence),false);
});

test('JSON evidence accepts formatting-only spaces but rejects changed field values or invented joins',()=>{
 const sources=[{id:'fees',content:JSON.stringify({amountDue:28000,amountPaid:5000,label:'Sample tuition',currency:'TWD'})}];
 const review=(quote:string)=>({supported:true,answersQuestion:true,claims:[{claim:'23000 remains',supported:true,evidenceId:'fees',quote}]});
 assert.equal(reviewMatchesEvidence(review('"amountDue": 28000, "amountPaid": 5000'),sources),true);
 assert.equal(reviewMatchesEvidence(review('Sample tuition'),sources),true);
 assert.equal(reviewMatchesEvidence(review('"amountDue": 999999, "amountPaid": 5000'),sources),false);
 assert.equal(reviewMatchesEvidence(review('"amountDue": 28000, "currency": "TWD"'),sources),false);
 assert.equal(reviewMatchesEvidence(review('"label": "Sampletuition"'),sources),false);
 assert.equal(reviewMatchesEvidence(review('"amountDue":28000..."amountPaid":5000'),sources),false);
 const wrapped=[{id:'fees',content:JSON.stringify({content:'Cross-department courses may be taken.\nWhether they count depends on "graduation rules".',separate:'Another paragraph.'})}];
 assert.equal(reviewMatchesEvidence(review('Whether they count depends on "graduation rules".'),wrapped),true);
 assert.equal(reviewMatchesEvidence(review('taken.\nWhether they count'),wrapped),true);
 assert.equal(reviewMatchesEvidence(review('graduation rules. Another paragraph.'),wrapped),false);
 const multiple={supported:true,answersQuestion:true,claims:[{claim:'23000 remains',supported:true,evidenceId:'fees',quotes:['"amountDue":28000','"amountPaid":5000']}]};
 assert.equal(reviewMatchesEvidence(multiple,sources),true);
 assert.equal(reviewMatchesEvidence({...multiple,claims:[{...multiple.claims[0],quotes:['"amountDue":999999','"amountPaid":5000']}]},sources),false);
 assert.equal(reviewMatchesEvidence({...multiple,claims:[{...multiple.claims[0],quotes:[]}]},sources),false);
});

test('structured evidence pointers resolve only existing own fields and still require independent approval',()=>{
 const sources=[{id:'fees',content:JSON.stringify({records:[{amountDue:28000,amountPaid:5000}],empty:[],nullable:null,'with/slash':{'~key':'exact'}})}];
 const claim={claim:'23000 remains',supported:true,evidenceId:'fees',quotes:[],jsonPaths:['/records/0/amountDue','/records/0/amountPaid']};
 const review=(change:Record<string,unknown>={})=>({supported:true,answersQuestion:true,claims:[{...claim,...change}]});
 assert.equal(reviewMatchesEvidence(review(),sources),true);
 for(const jsonPaths of [[],[''],['/records/1/amountDue'],['/records/00/amountDue'],['/records/length'],['/constructor'],['/records/0/toString'],['/with~2slash'],Array(9).fill('/empty')])assert.equal(reviewMatchesEvidence(review({jsonPaths}),sources),false,JSON.stringify(jsonPaths));
 assert.equal(reviewMatchesEvidence(review({jsonPaths:['/empty','/nullable','/with~1slash/~0key']}),sources),true);
 assert.equal(reviewMatchesEvidence(review({supported:false}),sources),false);
 assert.equal(reviewMatchesEvidence(review({evidenceId:'another-account'}),sources),false);
 assert.equal(reviewMatchesEvidence(review({quotes:['amountDue:999999']}),sources),false);
 assert.equal(reviewMatchesEvidence(review(),[{id:'fees',content:'Plain text without structured records'}]),false);
});

test('private projection excludes admin records, health, contact and another user even when a snapshot includes them',()=>{
  const snapshot={checkedAt:'2026-11-12T01:00:00Z',profile:{userId:'mine',role:'student',email:'mine@example.test'},
    admin:{secret:'not-for-this-tool'},studentAid:{records:[{userId:'mine',subsidyAmount:500,phone:'private-phone',maskedIdentityNumber:'private-id'},{userId:'someone-else',subsidyAmount:999}]},
    housing:{applications:[{userId:'mine',receiptNumber:'receipt',healthNotes:'private-health',address:'private-address'}]},
  };
  const sources=accountEvidence(snapshot,['studentAid','housing']);
  const text=JSON.stringify(sources);
  assert.match(text,/receipt/);assert.match(text,/500/);
  for(const secret of ['not-for-this-tool','private-phone','private-id','someone-else','999','private-health','private-address','mine@example.test'])assert.ok(!text.includes(secret),secret);
  assert.ok(!sources.some(source=>source.id==='account:profile'));
});

test('oversized collections explicitly report omitted rows and do not imply a complete history',()=>{
  const rows=Array.from({length:500},(_,i)=>({title:'assignment-'+i,details:'x'.repeat(1000)}));
  const source=accountEvidence({assignments:rows},['assignments']).find(item=>item.id==='account:assignments')!;
  const data=JSON.parse(source.content);
  assert.equal(data.excerpted,true);assert.equal(data.availableRows,500);assert.ok(data.includedRows<500);
  assert.ok(source.content.length<26000);
});

test('Moodle lookups include separately stored assignments and calendar evidence uses Taipei dates',()=>{
 const snapshot={checkedAt:'2026-11-12T17:00:00Z',dtm:{courses:[{id:'personal',title:'Personal course'}]},assignments:[{id:'work',dtmCourseId:'personal',title:'Reflection',status:'open'}],courses:[
  {id:'friday',code:'F1',title:'Friday class',status:'enrolled',weekday:5,startsAt:'08:00',endsAt:'09:00',termStartsOn:'2026-09-01',termEndsOn:'2027-01-01'},
  {id:'thursday',code:'T1',title:'Thursday class',status:'enrolled',weekday:4,startsAt:'08:00',endsAt:'09:00',termStartsOn:'2026-09-01',termEndsOn:'2027-01-01'},
 ]};
 const dtm=accountEvidence(snapshot,['dtm']);assert.ok(dtm.some(item=>item.id==='account:assignments'&&item.content.includes('Reflection')));
 assert.ok(accountEvidence(snapshot,['assignments']).some(item=>item.id==='account:dtm'));
 const course=accountEvidence(snapshot,['courses']).find(item=>item.id==='account:courses')!;
 const calendar=JSON.parse(course.content).calendar.records;
 assert.equal(calendar.day,'2026-11-13');assert.equal(calendar.timeZone,'Asia/Taipei');
 assert.deepEqual(calendar.today.map((row:any)=>row.id),['friday']);assert.equal(calendar.next.course.id,'friday');
});

test('missing provider configuration cannot silently mark a factual draft verified',async()=>{
  const old=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
  try {await assert.rejects(()=>verifyEvidenceAnswer({question:'Fees?',candidate:draft,evidence,deadline:Date.now()+10000}));}
  finally {if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});

test('planner validates capability names and falls back to own-record tools only',async()=>{
  const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY='test';
  globalThis.fetch=async()=>new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({tools:['arbitrary_sql'],publicTopics:['https://evil.test']})}]}]}));
  try {
    const plan=await planAccountLookup('My balance and school rules',[],'',Date.now()+10000);
    assert.equal(plan.degraded,true);assert.ok(!plan.tools.includes('arbitrary_sql'));assert.deepEqual(plan.publicTopics,[]);
    assert.ok(Object.values(publicTopics).every(query=>query.startsWith('Shu-Te University')));
  } finally {globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});
