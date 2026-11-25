import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {buildAccountCases} from './account-cases.mjs';
import {buildServiceCases,serviceCapabilities} from './service-cases.mjs';
import {buildAccountFixture,fixtureForCase,EVAL_USER_ID,EVAL_OTHER_USER_ID,evalId} from './fixtures.mjs';
import {planNativeFixture,verifyNativeFixtureReadback} from './live-fixtures.mjs';
import {mapHousingRecords} from '../../server/housingRecords.js';
import {readHousingApplicationEvidence,unavailableHousingApplicationEvidence} from '../../server/accountHousingApplicationEvidence.js';
import {formatHousingApplicationAnswer,housingApplicationGuide} from '../../server/housingApplicationAnswer.js';
import {housingApplicationLookupContext} from '../../server/housingApplicationEvidenceIntent.js';
import {gradeCase} from './grading.mjs';

const path='/school-affairs/services/26-1',bedPath='/school-affairs/services/34-1',feePath='/school-affairs/services/39-1';
const options={userId:EVAL_USER_ID,studentId:evalId(10),otherUserId:EVAL_OTHER_USER_ID,domains:['housing']};
const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'SYNTHETIC',token:'SYNTHETIC',user:{id:EVAL_USER_ID}};
const pick=(row,names)=>Object.fromEntries(names.map(name=>[name,row[name]]));
const snake=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/[A-Z]/gu,c=>'_'+c.toLowerCase()),value]));
const bank=()=>buildAccountCases().filter(row=>row.domain==='housingApplications');
const caseBy=id=>{const row=bank().find(row=>row.id==='account:'+id);assert.ok(row,id);return row;};
const binding=snapshot=>({housing:{periods:snapshot.housing.periods.map(row=>({...row,id:evalId(8102)}))}});
async function planned(testCase){const snapshot=fixtureForCase(testCase);return planNativeFixture(snapshot,{...options,shared:binding(snapshot)});}
const ranged=rows=>Response.json(rows,{headers:{'content-range':rows.length?'0-'+(rows.length-1)+'/'+rows.length:'*/0'}});
async function rendered(testCase){
  const plan=await planned(testCase),calls=[],context=housingApplicationLookupContext(testCase.question,testCase.route,testCase.history||[]);
  assert.ok(context.selection&&!context.selection.reason,testCase.question);
  if(testCase.id==='account:housing-receipt-term-prefix')assert.deepEqual(context.selection.term,{academicYear:115,semester:1});
  const result=await readHousingApplicationEvidence(account,{term:context.selection.term},{fetchImpl:async(input,init)=>{
    const url=new URL(String(input));calls.push(url.href);
    assert.equal(url.origin,account.url);assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
    assert.equal(new Headers(init.headers).get('Authorization'),'Bearer SYNTHETIC');
    const columns=url.searchParams.get('select').split(',');
    if(url.pathname==='/rest/v1/affairs_housing_applications'){
      assert.equal(url.searchParams.get('user_id'),'eq.'+EVAL_USER_ID);
      assert.deepEqual(columns,['id','user_id','period_id','receipt_number','submitted_at','version']);
      return ranged(plan.rows.affairs_housing_applications.filter(row=>row.user_id===EVAL_USER_ID).map(row=>pick(row,columns)));
    }
    assert.equal(url.pathname,'/rest/v1/affairs_housing_periods');
    assert.deepEqual(columns,['id','academic_year','semester','source_mode','version']);
    const ids=url.searchParams.get('id').slice(4,-1).split(',');
    assert.deepEqual(ids,[evalId(8102)]);
    return ranged(plan.expected.housing.periods.map(snake).filter(row=>ids.includes(row.id)).map(row=>pick(row,columns)));
  }});
  assert.notEqual(result.readState,'unavailable');
  assert.doesNotMatch(result.evidence.content,/fullName|full_name|Evaluation Student|health_notes|Synthetic evaluation residence|EVAL-115-001/u);
  const formatted=formatHousingApplicationAnswer(result.evidence,testCase.question);
  const envelope={statusCode:200,execution:'deterministic',fixtureKey:testCase.fixtureKey,
    events:[{kind:'account-read:housingApplications:1',status:'running'},{kind:'account-read:housingApplications:1',status:'complete'}],
    body:{status:'answered',...formatted,citations:[{chunkId:result.evidence.id,url:result.evidence.url,provenance:'local_demo'}],verification:{status:'verified',attempts:1}}};
  return {testCase,envelope,result,calls,plan};
}
function passes(item){const result=gradeCase(item.testCase,item.envelope);assert.equal(result.passed,true,item.testCase.id+': '+JSON.stringify(result.failures));assert.equal(result.execution,'deterministic');}
function fails(item,part){const result=gradeCase(item.testCase,item.envelope);assert.equal(result.passed,false);if(part)assert.ok(result.failures.some(row=>row.id.startsWith(part)),JSON.stringify(result.failures));}

test('receipt bank requires its independent source while 34-1 remains bed-only and no IDs are duplicated',()=>{
  const all=buildAccountCases();assert.equal(new Set(all.map(row=>row.id)).size,all.length);assert.equal(bank().length,9);
  assert.deepEqual(serviceCapabilities['26-1'].tools,['housingApplications']);assert.deepEqual(serviceCapabilities['34-1'].tools,['housing']);
  const service=buildServiceCases().filter(row=>row.serviceId==='26-1');assert.equal(service.length,4);
  for(const row of [caseBy('housing-receipt'),...service.filter(row=>['record','empty'].includes(row.mode))]){
    assert.deepEqual(row.expected.requiredTools,['housingApplications']);assert.deepEqual(row.expected.allowedTools,['housingApplications']);
    assert.equal(row.expected.requireToolExecution,true);assert.deepEqual(row.expected.requiredLinks,[path]);
  }
  assert.equal(caseBy('housing-receipt').route,path);
  for(const row of service.filter(row=>['navigation','action-boundary'].includes(row.mode)))assert.deepEqual(row.expected.allowedTools,[]);
});

test('receipt fixtures reuse existing exact private SQL fields and preserve a bed when applications are empty',async()=>{
  const fixture=fixtureForCase('housingApplications'),empty=fixtureForCase('empty:housingApplications');
  assert.deepEqual(fixture,buildAccountFixture());assert.deepEqual(empty.housing.applications,[]);
  assert.deepEqual(empty.housing.assignments,fixture.housing.assignments);assert.deepEqual(empty.housing.periods,fixture.housing.periods);
  const plan=await planned(caseBy('housing-receipt'));
  assert.deepEqual(Object.keys(plan.rows).sort(),['affairs_housing_applications','affairs_housing_assignments']);
  assert.equal(plan.rows.affairs_housing_applications[0].receipt_number,'HOUSING-EVAL-001');
  assert.equal(plan.rows.affairs_housing_applications[0].submitted_at,'2026-11-01T02:00:00Z');
  assert.equal(plan.rows.affairs_housing_applications[0].period_id,evalId(8102));
  const actual={housing:mapHousingRecords(plan.expected.housing.periods.map(snake),plan.rows.affairs_housing_applications,plan.rows.affairs_housing_assignments)};
  assert.equal(verifyNativeFixtureReadback(actual,plan),true);
  const altered=structuredClone(actual);altered.housing.applications[0].receiptNumber='WRONG';assert.throws(()=>verifyNativeFixtureReadback(altered,plan));
  for(const shared of [{},{housing:{periods:[]}},{housing:{periods:fixture.housing.periods.map(row=>({...row,id:evalId(8102),agreementText:'Changed published agreement'}))}}])
    await assert.rejects(planNativeFixture(fixture,{...options,shared}),error=>error.code==='fixture-unsupported');
});

test('actual adapter domain selection binds receipt-only cases to housing without a course or scholarship query',async()=>{
  const source=await readFile(new URL('./live-fixtures.mjs',import.meta.url),'utf8');
  const functionText=source.slice(source.indexOf('async function readNativeBindings('),source.indexOf('\nfunction recordsToInsert('));
  assert.ok(functionText.startsWith('async function readNativeBindings('));
  const fixture=fixtureForCase('housingApplications'),queries=[];
  const sql=(strings,...values)=>{if(typeof strings==='string')return strings;queries.push({text:strings.join('?'),values});return binding(fixture).housing.periods.map(snake);};
  const context=vm.createContext({state:{sql,users:[{id:EVAL_USER_ID,studentId:evalId(10)},{id:EVAL_OTHER_USER_ID}]},
    PRIVATE_NATIVE_DOMAINS:[],CONDITIONAL_NATIVE_DOMAINS:['courses','scholarship','housing'],periodTables:{housing:'affairs_housing_periods'},
    query:async fn=>fn(),timestamp:value=>value,fail:()=>assert.fail('Unexpected fixture rejection'),mapHousingRecords,planNativeFixture});
  const readBindings=vm.runInContext('('+functionText+')',context);
  const plan=await readBindings(fixture,caseBy('housing-receipt'));
  assert.deepEqual([...plan.domains],['housing']);assert.equal(queries.length,1);
  assert.equal(queries[0].values[0],'public.affairs_housing_periods');assert.match(queries[0].text,/published=true/u);
  assert.equal(plan.rows.affairs_housing_applications[0].user_id,EVAL_USER_ID);
});

test('actual own receipt reader and formatter satisfy independently authored receipt, term, time and empty criteria',async()=>{
  for(const id of ['housing-receipt','housing-receipt-metadata','housing-receipt-term-prefix','empty-housingApplications']){
    const item=await rendered(caseBy(id));passes(item);
    assert.equal(item.calls.length,id.startsWith('empty')?1:2);
    if(id.startsWith('empty')){assert.equal(item.result.readState,'empty');assert.equal(item.plan.rows.affairs_housing_assignments.length,1);}
  }
  for(const testCase of buildServiceCases().filter(row=>row.serviceId==='26-1'&&['record','empty'].includes(row.mode)))passes(await rendered(testCase));
});

test('receipt oracles reject wrong values, field swaps, unrelated records, form leaks and invented writes',async()=>{
  const original=await rendered(caseBy('housing-receipt-metadata'));
  for(const [before,after]of [['HOUSING-EVAL-001','E-305-2'],['Academic year: 115','Academic year: 114'],['Semester: 1','Semester: 2'],['2026-11-01T02:00:00Z','2026-11-02T02:00:00Z']]){
    const changed=structuredClone(original);changed.envelope.body.answer=changed.envelope.body.answer.replace(before,after);fails(changed,'fact.');
  }
  const detached=structuredClone(original);detached.envelope.body.answer=detached.envelope.body.answer.replace('  Submitted at:','- Receipt: OTHER-RECEIPT\n  Submitted at:');fails(detached,'fact.');
  const leaked=structuredClone(original);leaked.envelope.body.views[0].rows.push(['Synthetic evaluation residence']);fails(leaked,'text.forbidden.');
  const action=structuredClone(original);action.envelope.body.proposedAction={type:'submit'};fails(action);
});

test('citations cannot replace observed receipt reads or allow hidden extra readers/public searches',async()=>{
  const original=await rendered(caseBy('housing-receipt'));
  for(const events of [[],[{kind:'account-read:housing:1',status:'complete'}],
    [...original.envelope.events,{kind:'account-read:profile:1',status:'error'}],
    [...original.envelope.events,{kind:'knowledge',status:'complete'}]]){
    const changed=structuredClone(original);changed.envelope.events=events;fails(changed,'tool');
  }
  const wrongLink=structuredClone(original);wrongLink.envelope.body.answer=wrongLink.envelope.body.answer.replaceAll(path,bedPath);
  wrongLink.envelope.body.views=[];wrongLink.envelope.body.citations[0].url=bedPath;fails(wrongLink,'links.required.');
});

test('compound goldens require all independent sources, while exclusion and foreign questions permit no receipt read',async()=>{
  for(const id of ['housing-receipt-and-bed','housing-bed-and-receipt','housing-receipt-and-balance']){
    const testCase=caseBy(id),item=await rendered(testCase),fees=id.endsWith('balance'),tool=fees?'charges':'housing',url=fees?feePath:bedPath;
    item.envelope.body.answer+='\n\n'+(fees?'Remaining tuition balance: 23000.':'Recorded beds: E-305-2.')+'\n[Open records]('+url+')';
    item.envelope.events.push({kind:'account-read:'+tool+':1',status:'complete'});item.envelope.body.citations.push({chunkId:'account:'+tool,url});passes(item);
    const missing=structuredClone(item);missing.envelope.body.answer=missing.envelope.body.answer.split('\n\n').slice(0,-1).join('\n\n');fails(missing,'fact.');
    const wrong=structuredClone(item);wrong.envelope.body.answer=wrong.envelope.body.answer.replace(fees?'23000':'E-305-2',fees?'99':'OTHER-BED');fails(wrong,'fact.');
  }
  const excluded=caseBy('housing-receipt-excluded');
  const item={testCase:excluded,envelope:{statusCode:200,execution:'deterministic',fixtureKey:excluded.fixtureKey,events:[{kind:'account-read:housing:1',status:'complete'}],
    body:{status:'answered',answer:'Local demo recorded beds: E-305-2. [Open bed]('+bedPath+')',citations:[{chunkId:'account:housing',url:bedPath}],verification:{status:'verified',attempts:1}}}};passes(item);
  const excess=structuredClone(item);excess.envelope.events.push({kind:'account-read:housingApplications:1',status:'complete'});fails(excess,'tools.allowed.');
  const foreign=caseBy('housing-receipt-foreign'),guide=housingApplicationGuide(foreign.question,housingApplicationLookupContext(foreign.question,foreign.route),true);
  const denied={testCase:foreign,envelope:{statusCode:200,execution:'deterministic',fixtureKey:foreign.fixtureKey,events:[],body:guide}};passes(denied);
  const leaking=structuredClone(denied);leaking.envelope.body.answer+=' Their receipt is HOUSING-EVAL-001.';fails(leaking,'text.forbidden.');
});


test('successful empty receipt is distinct from unreadable data or a substituted positive bed result',async()=>{
  for(const testCase of [caseBy('empty-housingApplications'),buildServiceCases().find(row=>row.id==='service:26-1:empty')]){
    const original=await rendered(testCase);passes(original);
    const failed=structuredClone(original),unavailable=unavailableHousingApplicationEvidence('read_failed');
    Object.assign(failed.envelope.body,formatHousingApplicationAnswer(unavailable.evidence,testCase.question));
    fails(failed,'answer.limitation.specific');
    const denied=structuredClone(original);denied.envelope.events=[{kind:'account-read:housingApplications:1',status:'error'}];fails(denied,'tool');
    const bed=structuredClone(original);bed.envelope.body.answer='Local demo recorded beds: E-305-2.';fails(bed,'answer.limitation');
    const invented=structuredClone(original);invented.envelope.body.answer+=' Receipt: HOUSING-EVAL-001.';fails(invented,'text.forbidden.');
  }
});

test('receipt and bed citations must retain their own exact source destinations even when both links are present',async()=>{
  const item=await rendered(caseBy('housing-receipt-and-bed'));
  item.envelope.body.answer+='\n\nRecorded beds: E-305-2. [Open beds]('+bedPath+')';
  item.envelope.events.push({kind:'account-read:housing:1',status:'complete'});
  item.envelope.body.citations.push({chunkId:'account:housing',url:bedPath});passes(item);
  const swapped=structuredClone(item);[swapped.envelope.body.citations[0].url,swapped.envelope.body.citations[1].url]=[bedPath,path];
  fails(swapped,'source.binding.');
});

test('correct prose cannot conceal contradictory or ambiguous receipt fields in visible cards',async()=>{
  for(const testCase of [caseBy('housing-receipt-metadata'),buildServiceCases().find(row=>row.id==='service:26-1:record')]){
    const original=await rendered(testCase);passes(original);
    for(const view of [
      {columns:['Receipt','Academic year','Semester'],rows:[['HOUSING-EVAL-001','114','1']]},
      {columns:['Semester','Receipt','Academic year'],rows:[['2','HOUSING-EVAL-001','115']]},
      {columns:['Receipt','Submitted at'],rows:[['HOUSING-EVAL-001','2026-11-02T02:00:00Z']]},
      {columns:['Receipt','Academic year','Academic year'],rows:[['HOUSING-EVAL-001','115','114']]},
      {columns:['Receipt','Academic year'],rows:[['HOUSING-EVAL-002','115']]},
    ]){
      const changed=structuredClone(original);changed.envelope.body.views=[view];fails(changed,'views.recordFacts');
    }
    const absent=structuredClone(original);delete absent.envelope.body.views;passes(absent);
    const extra=structuredClone(original);extra.envelope.body.views=[{columns:['Receipt','Academic year','Display label'],rows:[['HOUSING-EVAL-001','115','Saved receipt']]}];passes(extra);
    const other=structuredClone(original);other.envelope.body.views.push({columns:['Student','Academic year'],rows:[['Unrelated public entry','114']]});passes(other);
  }
});

test('receipt approval caveats never cancel an affirmative approval or empty-record claim in another clause or card',async()=>{
  const original=await rendered(caseBy('housing-receipt-metadata'));
  const caveats=[
    'The saved receipt does not prove official approval.',
    'I cannot determine whether it was officially approved.',
    'I cannot verify whether your housing application was approved.',
    'This is not proof that there are no housing applications in your account.',
    'I cannot infer that no housing applications exist.',
  ];
  for(const caveat of caveats){const changed=structuredClone(original);changed.envelope.body.answer+='\n'+caveat;passes(changed);}
  for(const claim of [
    'Your housing application has been officially approved.',
    'Your housing application was accepted by the university.',
    'This receipt confirms official approval.',
    'There are no housing applications in your account.',
    'You have zero saved housing application records.',
    'Your housing application list is empty.',
  ])for(const caveat of ['',...caveats.slice(0,2)]){
    const changed=structuredClone(original);changed.envelope.body.answer+='\n'+caveat+'\n'+claim;fails(changed,'evidence.boundary.');
    const card=structuredClone(original);card.envelope.body.views[0].summary=caveat+' '+claim;fails(card,'evidence.boundary.');
  }
  const approvedCard=structuredClone(original);approvedCard.envelope.body.views.push({columns:['Receipt','Official approval'],rows:[['HOUSING-EVAL-001','Confirmed']]});fails(approvedCard,'evidence.boundary.');
  const noteCard=structuredClone(original);noteCard.envelope.body.views[0].note='Your housing application has been officially approved.';fails(noteCard,'evidence.boundary.');
  const absentNote=structuredClone(original);absentNote.envelope.body.views[0].note='There are no housing applications in your account.';fails(absentNote,'evidence.boundary.');
  const negatedNote=structuredClone(original);negatedNote.envelope.body.views[0].note='The saved receipt does not prove official approval.';passes(negatedNote);
  const negatedCard=structuredClone(original);negatedCard.envelope.body.views[0].summary='Official approval: not confirmed.';passes(negatedCard);
});
