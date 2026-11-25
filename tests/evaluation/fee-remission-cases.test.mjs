import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFeeRemissionCases,buildPlannedFeeRemissionCases,feeRemissionFixtureForCase,feeRemissionCaseManifest as m,
  feeRemissionFixturePlan,gradeFeeRemissionCase} from './fee-remission-cases.mjs';
import {readFeeRemissionEvidence} from '../../server/accountFeeRemissionEvidence.js';
import {gradeCase} from './grading.mjs';
import {buildAccountCases} from './account-cases.mjs';
import {buildServiceCases,serviceCapabilities,serviceNoteFixture} from './service-cases.mjs';
import {fixtureForCase} from './fixtures.mjs';
import {feeRemissionLivePlanManifest} from './fee-remission-live-plan.mjs';
import {nativePageLookupContext} from '../../server/accountSupplementalLookup.js';
import {selectFeeRemissionEvidence} from '../../server/feeRemissionEvidenceIntent.js';

const bank=buildFeeRemissionCases(),find=id=>{const row=bank.find(item=>item.id==='account:fee-remission-'+id);assert.ok(row,id);return row;};
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC',token:'SYNTHETIC',user:{id:m.owners.A}};
const historical='- QA Historical Support\n  Academic year: 114\n  Semester: 2\n  Amount: 001,000\n  Check status: Reviewed locally';
const zero='- QA Zero Support\n  Academic year: 115\n  Semester: 1\n  Amount: 0\n  Check status: Awaiting local review';
const tuition='- QA Tuition instalment\n  Remaining: 23,000\n  Currency: TWD';
// These assertions are hand authored from the fixture contract, never from the
// runtime formatter, helper output or an LLM. They are offline examples only.
const answers={
  'all-history':'Remission record count: 5.\nQA Historical Support; QA Zero Support; QA Null Support; QA Blank Support; QA Text Period Support.',
  'historical-period':historical,
  'zero-amount':zero,
  'null-not-zero':'- QA Null Support\n  Amount: null\n  Check status: not recorded',
  'blank-not-null':'- QA Blank Support\n  Academic year: 001\n  Semester: 01\n  Amount: blank\n  Check status: empty string',
  'leading-zero-period':'- QA Text Period Support\n  Academic year: 0115\n  Semester: 01\n  Amount: 0.00\n  Check status: unclassified literal',
  'exact-period-absent':'Matching remission records: 0. No matching saved remission records. The requested amount is not available in these local records.',
  'current-term-not-designated':'The current term has not been designated. Which academic year and semester should I check?',
  'student-number-explicit':'| Record | Student number |\n|---|---|\n| QA Zero Support | PRIVATE STUDENT NUMBER A |',
  'student-number-not-requested':'- QA Zero Support\n  Amount: 0',
  'payout-not-proved':historical+'\n\nOfficial payout: unknown. Payment is not verified. These saved cells cannot verify a bank transfer.',
  'eligibility-not-proved':historical+'\n\nOfficial eligibility: not verified.',
  'document-not-created':'An official certificate is unavailable through this reader.',
  'write-boundary':'I cannot change the remission amount and cannot submit it to the university.',
  'mixed-tuition':zero+'\n\n'+tuition,
  'mixed-reversed':tuition+'\n\n'+zero,
  'mixed-remission-unavailable':tuition+'\n\nYour remission history is unavailable. I cannot determine its amount.',
  'mixed-charges-unavailable':zero+'\n\nYour tuition balance is unavailable. I cannot determine it from the remission amount.',
  'policy-separate-from-record':zero+'\n\nSeparately, the synthetic published guidance says: Policy contact: QA Funding Office. It does not establish your eligibility.',
  'empty':'Remission record count: 0. No saved remission records. Remission details are not available in this local history.',
  'read-unavailable':'Your remission history is unavailable because the query failed. I cannot determine whether records exist.',
  'missing-collection':'Your remission history is unavailable because the query returned no valid collection. I cannot determine whether records exist.',
  'wrong-owner-response':'Your remission history is unavailable. I cannot access another account’s response.',
  'malformed-amount':'Your remission history is unavailable because the read failed validation.',
  'bounded-omission':'This is a partial result: some records and notes were omitted. I cannot provide the omitted records in this answer.',
  'foreign-account':'I cannot access another student’s fee remission records. I can only check your signed-in account.',
  'anonymous':'Sign in to view your own fee remission history.',
};
function envelope(row){
  const answer=answers[row.id.replace('account:fee-remission-','')];assert.equal(typeof answer,'string',row.id);
  const expected=row.expected,events=expected.requiredAttemptedTools.flatMap(name=>[
    {kind:'account-read:'+name+':1',status:'running'},{kind:'account-read:'+name+':1',status:expected.toolTerminalStates[name][0]}]);
  const citations=expected.requiredTools.map(name=>({chunkId:'account:'+name,url:name==='feeRemission'?m.route:'/school-affairs/services/39-1'}));
  if(expected.publicSource)citations.push({chunkId:m.policyFixture.sourceId,url:m.policyFixture.url,provenance:m.policyFixture.provenance});
  return {statusCode:expected.expectedStatusCode??200,execution:'deterministic',fixtureKey:row.fixtureKey,events,
    body:{status:expected.behavior==='clarify'?'clarification':expected.behavior==='denial'?'handoff':'answered',
      answer:(expected.provenance?'Saved local stu.best records.\n\n':'')+answer+'\n\n'+expected.requiredLinks.map(url=>'[Open local information]('+url+')').join('\n'),
      citations,verification:{status:'verified',attempts:1}}};
}
function reject(id,change,pattern){const row=find(id),value=envelope(row);change(value);const result=gradeFeeRemissionCase(row,value);
  assert.equal(result.passed,false,id);assert.ok(result.failures.some(item=>pattern.test(item.id)),JSON.stringify(result.failures));}

test('exact-period absence can acknowledge other saved terms without denying the entire history',()=>{
  const row=find('exact-period-absent'),reply=envelope(row);
  reply.body.answer='Matching remission records: 0. No matching saved remission records were returned for the exact selected period. Other saved periods remain separate. Saved local stu.best history. [Open records]('+m.route+')';
  assert.equal(gradeFeeRemissionCase(row,reply).passed,true);
  reply.body.answer=reply.body.answer.replace('No matching saved remission records were returned for the exact selected period.','The selected period exists.');
  assert.ok(gradeFeeRemissionCase(row,reply).failures.some(item=>item.id==='answer.limitation'));
});

test('native routing keeps fee field and period continuations scoped across the whole live packet',()=>{
  for(const {question,route,id} of buildPlannedFeeRemissionCases()){
    const context=nativePageLookupContext(question,route);
    const mixed=id.endsWith('-mixed-tuition')||id.endsWith('-mixed-reversed');
    assert.deepEqual(context.tools,['feeRemission'],id);
    assert.equal(context.readerOnly,!mixed,id);
    assert.equal(context.feeAndBalance,mixed,id);
    assert.equal(selectFeeRemissionEvidence(question,route).operation,id.endsWith('-write-boundary'),id);
  }
  assert.equal(nativePageLookupContext('Show my fee remission amount and my grades for academic year 115 semester 1.',m.route).otherQuestion,'my grades for academic year 115 semester 1');
  assert.equal(nativePageLookupContext('Show my fee remission and contact the registrar.',m.route).readerOnly,false);
  assert.equal(nativePageLookupContext('Show my fee remission and submit it to the university.',m.route).readerOnly,true);
});

test('packet is complete, independent, immutable and explicitly not mounted/live accepted',()=>{
  assert.equal(bank.length,27);assert.equal(new Set(bank.map(row=>row.id)).size,27);
  assert.deepEqual(Object.keys(answers).sort(),bank.map(row=>row.id.replace('account:fee-remission-','')).sort());
  assert.equal(m.kind,'offline-reference');assert.equal(m.mounted,false);assert.equal(m.liveAcceptance,false);
  assert.equal(feeRemissionFixturePlan.status,'offline-only-not-provisioned');assert.equal(feeRemissionFixturePlan.acceptance.cleanupVerified,true);
  for(const row of bank){assert.ok(Object.isFrozen(row));assert.ok(Object.isFrozen(row.expected));assert.equal(row.capability.gap,true);
    assert.equal(row.fixtureRequirement,'offline_fee_remission_fixture');assert.equal(row.expected.noAction,true);assert.equal(row.route,m.route);}
  assert.throws(()=>feeRemissionFixtureForCase({...find('zero-amount'),fixtureKey:'changed'}),/Unknown/u);
  assert.throws(()=>gradeFeeRemissionCase({id:'missing'}),/Unknown/u);
});

test('shared-bank fee-remission criteria remain explicitly planned until the live adapter supports their exact native families',()=>{
  const current=buildAccountCases(),planned=buildPlannedFeeRemissionCases(),expanded=buildAccountCases({includePlannedFeeRemission:true});
  assert.equal(planned.length,20);assert.equal(expanded.length,current.length+20);
  assert.deepEqual(current.filter(row=>row.domain==='feeRemission'),[]);
  assert.deepEqual(planned.map(row=>row.id).sort(),[...feeRemissionLivePlanManifest.eligibleCaseIds].sort());
  for(const row of planned){assert.equal(row.capability.gap,true);assert.equal(row.plannedFixture.mounted,false);
    assert.equal(row.fixtureRequirement,'native_fee_remission_planned');assert.equal(row.fixtureKey,'planned:'+row.plannedFixture.family);
    assert.throws(()=>fixtureForCase(row),/Unknown evaluation fixture/u);
    if(row.plannedFixture.auth!=='anonymous')assert.equal(row.expected.requireUnchangedOwnedRecords,true);
  }
  assert.throws(()=>buildAccountCases({includePlannedFeeRemission:'yes'}),/explicit/u);
  const service=buildServiceCases().filter(row=>row.serviceId==='21-3');assert.equal(service.length,4);
  assert.equal(serviceCapabilities['21-3'].domain,'feeRemission');assert.equal(serviceCapabilities['21-3'].level,'partial');
  assert.throws(()=>serviceNoteFixture('21-3'),/generic note/u);
  assert.equal(service[0].mode,'navigation');assert.equal(service[0].fixtureKey,'directory');
  for(const row of service.slice(1)){assert.equal(row.fixtureRequirement,'native_fee_remission_planned');assert.equal(row.capability.gap,true);
    assert.ok(!row.expected.allowedTools.includes('serviceRecords'));assert.throws(()=>fixtureForCase(row),/Unknown evaluation fixture/u);}
});

test('raw fixtures preserve null, blank, literal zero, formatting, period identity and foreign distractors',()=>{
  const fixture=feeRemissionFixtureForCase(find('all-history')),rows=fixture.response.records;
  assert.equal(rows[0].amount_text,' 001,000 ');assert.equal(rows[1].amount_text,'0');assert.equal(rows[2].amount_text,null);
  assert.equal(rows[3].amount_text,'');assert.equal(rows[4].amount_text,'0.00');assert.equal(rows[3].academic_year_text,'001');
  assert.equal(rows[4].academic_year_text,'0115');assert.equal(rows[4].semester_text,'01');
  assert.notEqual(fixture.foreignResponse.userId,fixture.response.userId);assert.equal(fixture.foreignResponse.records[0].academic_year_text,rows[1].academic_year_text);
  assert.equal(fixture.charges[0].amountDue-fixture.charges[0].amountPaid,23000);
  assert.ok(Object.isFrozen(rows));assert.ok(Object.isFrozen(rows[0]));
});

test('hand-authored acceptable answers pass independent semantic, tool and source checks offline',()=>{
  for(const row of bank){const result=gradeFeeRemissionCase(row,envelope(row));
    assert.deepEqual(result.failures,[],row.id+': '+JSON.stringify(result.failures));assert.equal(result.liveAcceptance,false);}
});

test('native helper independently satisfies caller scope, exact period, projection and read states with synthetic transport',async()=>{
  for(const row of bank){
    const fixture=feeRemissionFixtureForCase(row),before=structuredClone(fixture),calls=[];
    const result=await readFeeRemissionEvidence(row.fixtureKey==='anonymous'?{}:account,{question:row.question,route:row.route},{load:async(...args)=>{
      assert.equal(args.length,1,'No selected-user/admin override may reach the loader');
      assert.equal(args[0].user.id,m.owners.A);assert.equal(args[0].token,'SYNTHETIC');
      assert.deepEqual(Object.keys(args[0]).sort(),['key','requestDeadline','token','url','user']);calls.push(args[0]);
      if(fixture.error)throw fixture.error;return fixture.response;
    }}),payload=JSON.parse(result.evidence.content),expected=row.nativeExpectation;
    assert.equal(result.readState,expected.readState,row.id);assert.equal(calls.length,expected.calls,row.id);
    if(Object.hasOwn(expected,'reason'))assert.equal(result.reason,expected.reason,row.id);
    assert.equal(result.evidence.id,m.sourceId);assert.equal(result.evidence.url,m.route);assert.deepEqual(result.evidence.urls,[m.route]);
    assert.deepEqual(payload.provenance,{source:'saved_local',officialUniversityData:false,synchronized:false});
    assert.deepEqual(payload.capability,{literalHistory:true,payment:false,eligibility:false,document:false,write:false});
    assert.ok(Buffer.byteLength(JSON.stringify(result),'utf8')<=m.evidenceByteLimit,row.id);
    for(const value of [m.owners.A,m.owners.B,'FOREIGN REMISSION CATEGORY','FOREIGN REMISSION NOTE','FOREIGN STUDENT NUMBER'])
      assert.ok(!JSON.stringify(result).includes(value),row.id+': leaked '+value);
    if(!expected.studentNumber)assert.ok(!JSON.stringify(result).includes('PRIVATE STUDENT NUMBER A'),row.id);
    for(const record of payload.records){assert.deepEqual(Object.keys(record).sort(),[...m.cellFields,...(expected.studentNumber?['student_number']:[])].sort());
      const raw=fixture.response.records.find(source=>source.category_text===record.category_text);assert.ok(raw,row.id);
      for(const key of Object.keys(record))assert.equal(record[key],raw[key],row.id+': '+key);}
    if(expected.bounded){assert.equal(payload.counts.available,30);assert.equal(payload.counts.matching,30);
      assert.ok(payload.counts.included>0&&payload.counts.included<30);assert.equal(payload.counts.omitted,30-payload.counts.included);
      assert.equal(payload.records.length,payload.counts.included);assert.equal(payload.complete,false);
      assert.ok(!result.evidence.content.includes('OMITTED TAIL PRIVATE SENTINEL'));
    }else assert.deepEqual(payload.records.map(record=>record.category_text),expected.recordCategories,row.id);
    if(expected.periodsOnly){assert.equal(payload.counts,null);assert.deepEqual(payload.periodChoices,fixture.response.records.map(record=>({academic_year_text:record.academic_year_text,semester_text:record.semester_text})));}
    assert.deepEqual(fixture,before,row.id+' mutated the independent fixture');
  }
});

test('literal answers reject numeric coercion, wrong period and swapped null/blank/zero fields',()=>{
  for(const replacement of ['0.00','+0','0e0','null','blank'])reject('zero-amount',value=>{value.body.answer=value.body.answer.replace('Amount: 0','Amount: '+replacement);},/^fact\./u);
  reject('leading-zero-period',value=>{value.body.answer=value.body.answer.replace('0115','115');},/^fact\./u);
  reject('leading-zero-period',value=>{value.body.answer=value.body.answer.replace('Amount: 0.00','Amount: 0');},/^fact\./u);
  reject('blank-not-null',value=>{value.body.answer=value.body.answer.replace('Amount: blank','Amount: null');},/^fact\.|^text\.forbidden/u);
  reject('null-not-zero',value=>{value.body.answer=value.body.answer.replace('Amount: null','Amount: 0');},/^fact\.|^text\.forbidden/u);
  reject('historical-period',value=>{value.body.answer=value.body.answer.replace('114','115');},/^fact\./u);
  reject('zero-amount',value=>{value.body.answer=value.body.answer.replace('Amount: 0','Amount: not 0');},/^fact\./u);
  for(const invented of ['0 USD','0 TWD','NT$0','0 dollars','0 元'])reject('zero-amount',value=>{
    value.body.answer=value.body.answer.replace('Amount: 0','Amount: '+invented);
  },/^native\.literal-amount-currency$/u);
});

test('literal remission amounts cannot infer currency, while a separate tuition charge retains its recorded TWD',()=>{
  const row=find('zero-amount');
  for(const replacement of ['0 USD','USD 0','NT$0','$0','0 dollars','0 元','0 TWD']){
    const value=envelope(row);value.body.answer=value.body.answer.replace('Amount: 0','Amount: '+replacement);
    for(const grade of [gradeFeeRemissionCase,gradeCase])assert.ok(grade(row,value).failures.some(item=>/^fact\./u.test(item.id)),replacement);
  }
  for(const extra of ['\n  Currency: USD','\n  Currency code: TWD','\n  幣別: 新台幣'])reject('zero-amount',value=>{
    value.body.answer=value.body.answer.replace('  Amount: 0','  Amount: 0'+extra);},/^fact\./u);
  const table=envelope(row);table.body.answer='Saved local records.\n| Record | Academic year | Semester | Amount | Check status | Currency |\n|---|---|---|---|---|---|\n|QA Zero Support|115|1|0|Awaiting local review|USD|';
  assert.ok(gradeFeeRemissionCase(row,table).failures.some(item=>/^fact\./u.test(item.id)));
  for(const id of ['mixed-tuition','mixed-reversed'])assert.equal(gradeCase(find(id),envelope(find(id))).passed,true);
  const unknown=envelope(row);unknown.body.answer=unknown.body.answer.replace('  Amount: 0','  Amount: 0\n  Currency: not recorded');
  assert.equal(gradeCase(row,unknown).passed,true);
  const student=find('student-number-explicit'),natural=envelope(student);natural.body.answer='Saved local records.\n- QA Zero Support\n  Student number: PRIVATE STUDENT NUMBER A';
  assert.equal(gradeCase(student,natural).passed,true,'A requested Student number field is not a foreign-owner header');
});

test('shared grader now enforces every standalone tool and source contract without a private wrapper',()=>{
  for(const row of bank)assert.deepEqual(gradeCase(row,envelope(row)).failures,[],row.id);
  const row=find('policy-separate-from-record'),value=envelope(row);value.body.citations=value.body.citations.filter(c=>c.chunkId!==m.policyFixture.sourceId);
  assert.ok(gradeCase(row,value).failures.some(item=>/^source\.binding/u.test(item.id)));
});

test('multipart questions fail if either collection is omitted, inferred or read from the wrong tool',()=>{
  for(const id of ['mixed-tuition','mixed-reversed']){
    reject(id,value=>{value.body.answer=value.body.answer.replace(tuition,'');},/^fact\./u);
    reject(id,value=>{value.body.answer=value.body.answer.replace(zero,'');},/^fact\./u);
    reject(id,value=>{value.events=value.events.filter(event=>!event.kind.includes(':charges:'));},/^native\./u);
    reject(id,value=>{value.events=value.events.filter(event=>!event.kind.includes(':feeRemission:'));},/^native\./u);
    reject(id,value=>{value.body.answer=value.body.answer.replace('23,000','22,000');},/^fact\./u);
    reject(id,value=>{value.body.answer=value.body.answer.replace('Currency: TWD','Currency: USD');},/^fact\./u);
  }
  reject('mixed-remission-unavailable',value=>{value.body.answer+='\nRemission amount: 0.';},/^text\.forbidden/u);
  reject('mixed-charges-unavailable',value=>{value.body.answer+='\nTuition balance: 0.';},/^text\.forbidden/u);
});

test('the exact local source and independently provenanced public guidance are required',()=>{
  reject('zero-amount',value=>{value.body.citations[0].chunkId='account:serviceRecords';},/^native\./u);
  reject('zero-amount',value=>{value.body.citations[0].url='/school-affairs/services/21-1';},/^native\.citation/u);
  reject('zero-amount',value=>{value.body.answer=value.body.answer.replace(m.route,'https://www.stu.edu.tw/');value.body.citations=[];},/^links\.|^native\.citation/u);
  reject('policy-separate-from-record',value=>{value.body.citations=value.body.citations.filter(c=>c.chunkId!==m.policyFixture.sourceId);},/^policy\.provenance/u);
  reject('policy-separate-from-record',value=>{value.body.citations.find(c=>c.chunkId===m.policyFixture.sourceId).provenance='saved_local';},/^policy\.provenance/u);
  reject('policy-separate-from-record',value=>{value.body.answer+='\nMy record says to contact QA Funding Office.';},/^text\.forbidden/u);
});

test('guest, foreign-account and hidden-output leaks fail; sensitive student number is explicit only',()=>{
  reject('anonymous',value=>{value.statusCode=200;},/^transport\.status/u);
  for(const id of ['foreign-account','anonymous','zero-amount'])for(const location of ['answer','views','citations'])
    reject(id,value=>{if(location==='answer')value.body.answer+='\nFOREIGN REMISSION NOTE';
      else if(location==='views')value.body.views=[{title:'Hidden account',rows:[{notes:'FOREIGN REMISSION NOTE'}]}];
      else value.body.citations.push({title:'FOREIGN REMISSION NOTE',url:m.route});},/^text\.forbidden/u);
  reject('student-number-not-requested',value=>{value.body.answer+='\nPRIVATE STUDENT NUMBER A';},/^text\.forbidden/u);
  reject('foreign-account',value=>{value.events.push({kind:'account-read:feeRemission:1',status:'complete'});},/^native\./u);
});

test('native execution cannot be faked by a citation, planner list, running-only event or unrelated read',()=>{
  reject('zero-amount',value=>{value.events=[];value.body.selectedTools=['feeRemission'];},/^native\./u);
  reject('zero-amount',value=>{value.events=value.events.filter(event=>event.status==='running');},/^native\./u);
  reject('zero-amount',value=>{value.events.push({kind:'account-read:profile:1',status:'complete'});},/^native\./u);
  reject('zero-amount',value=>{value.toolCalls=[{name:'profile',status:'complete',attempt:1}];},/^native\./u);
  reject('zero-amount',value=>{value.body.activity={kind:'account-read:profile:1',status:'complete'};},/^native\./u);
  reject('zero-amount',value=>{value.events.push({kind:'web-search',status:'complete'});},/^native\.no-public/u);
  for(const id of ['read-unavailable','missing-collection','wrong-owner-response','malformed-amount']){
    reject(id,value=>{value.events[1].status='complete';},/^native\.terminal/u);
    reject(id,value=>{value.body.answer+='\nNo saved remission records.';},/^text\.forbidden/u);
  }
});

test('official payout, eligibility, generated files and writes are never inferred from saved literal cells',()=>{
  reject('payout-not-proved',value=>{value.body.answer+='\nPayout confirmed.';},/^text\.forbidden/u);
  reject('payout-not-proved',value=>{value.body.answer+='\nYour tuition is fully paid.';},/^evidence\.boundary/u);
  reject('eligibility-not-proved',value=>{value.body.answer+='\nYou are officially eligible.';},/^text\.forbidden/u);
  reject('document-not-created',value=>{value.body.answer+='\nCertificate created.';},/^text\.forbidden/u);
  reject('write-boundary',value=>{value.body.proposedAction={kind:'save_fee_remission',payload:{amount_text:'9000'}};},/^action\.none/u);
  reject('bounded-omission',value=>{value.body.answer+='\nAll 30 records are shown.';},/^text\.forbidden/u);
  reject('current-term-not-designated',value=>{value.body.answer='Your current remission is QA Zero Support, amount 0.';},/^text\.required|^text\.forbidden/u);
});
