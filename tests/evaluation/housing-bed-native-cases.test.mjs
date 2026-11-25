import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {buildHousingBedNativeCases,housingBedNativeManifest as manifest,housingBedNativeFixtureForCase,gradeHousingBedNativeCase} from './housing-bed-native-cases.mjs';
import {buildPublishedNextClassExpectation} from './published-next-class.mjs';
import {buildAccountCases} from './account-cases.mjs';
import {mapHousingRecords} from '../../server/housingRecords.js';
import {readHousingBedEvidence} from '../../server/accountHousingBedEvidence.js';
import {housingBedLookupContext} from '../../server/housingBedEvidenceIntent.js';

const cases=buildHousingBedNativeCases();
const find=suffix=>{const value=cases.find(row=>row.id==='account:housing-bed-native-'+suffix);assert.ok(value,suffix);return value;};
function observation(row){return {sourceRead:structuredClone(row.observationExpectation),writes:[],storage:[],publicResearch:[]};}
function envelope(row,answer){return {statusCode:row.expected.expectedStatusCode??200,execution:'recorded',fixtureKey:row.fixtureKey,
  events:row.observationExpectation.tools.map(tool=>({kind:'account-read:'+tool+':1',status:tool==='housing'&&row.observationExpectation.housing?.state==='unavailable'?'unavailable':'complete'})),
  body:{status:row.auth==='anonymous'?'handoff':'answered',answer,verification:{status:'verified',attempts:1},
    citations:row.expected.requiredLinks.map(url=>({url,title:'Local records',chunkId:url===manifest.route?'account:housing':url.endsWith('subjects')?'account:courses':url.endsWith('39-1')?'account:charges':'local-service'})),views:[]}};}
const grade=(row,answer,seen=observation(row))=>gradeHousingBedNativeCase(row,envelope(row,answer),{observation:seen});
const pass=(row,answer)=>assert.deepEqual(grade(row,answer).failures,[]);
const fail=(row,answer,prefix)=>{const result=grade(row,answer);assert.equal(result.passed,false,answer);if(prefix)assert.ok(result.failures.some(value=>value.id.startsWith(prefix)),JSON.stringify(result.failures));};
const bedAnswer='Saved local_demo housing records.\n- QA-A-305\n  Academic year: 115\n  Semester: 1\n  Dormitory: QA East Hall\n  Bunk: upper\n- QA-B-207\n  Academic year: 114\n  Semester: 2\n  Dormitory: QA West Hall\n  Bunk: not recorded';
const feeAnswer='Saved local_demo housing records.\n- QA-A-305\n  Accommodation fee: 8500.25\n  Deposit: 0\n  Subsidy: not recorded\n- QA-B-207\n  Accommodation fee: not recorded\n  Deposit: 1200.5\n  Subsidy: 500';

test('standalone cases remain unmounted, unique and independent of the shared suite',()=>{
  assert.equal(cases.length,22);assert.equal(new Set(cases.map(row=>row.id)).size,22);
  const shared=new Set(buildAccountCases().map(row=>row.id));assert.ok(cases.every(row=>!shared.has(row.id)));
  assert.equal(manifest.mounted,false);assert.equal(manifest.setupEligible,false);assert.equal(manifest.liveAcceptance,false);
  assert.ok(cases.every(row=>row.capability.gap&&row.capability.mounted===false&&row.fixtureRequirement==='offline_housing_bed'));
  for(const row of cases){assert.equal(row.expected.noAction,true);assert.equal(row.expected.forbidPublicResearch,true);}
  assert.throws(()=>housingBedNativeFixtureForCase({...find('owned-beds'),question:'replacement'}));
  const fixture=housingBedNativeFixtureForCase(find('owned-beds'));fixture.assignments[0].bed_number='changed';
  assert.equal(housingBedNativeFixtureForCase(find('owned-beds')).assignments[0].bed_number,'QA-A-305');
});

test('literal bed fields and exact period FK agree with the native mapper and SQL constraints',()=>{
  const row=find('owned-beds'),fixture=housingBedNativeFixtureForCase(row);
  const mapped=mapHousingRecords(fixture.periods,[],fixture.assignments).assignments.map(value=>Object.fromEntries(manifest.fields.map(key=>[key,value[key]])));
  assert.deepEqual(mapped.map(value=>Object.fromEntries(row.observationExpectation.housing.fields.map(key=>[key,value[key]]))),row.observationExpectation.housing.records);
  assert.ok(fixture.assignments.every(value=>value.user_id===manifest.owners.A&&fixture.periods.some(period=>period.id===value.period_id)));
  assert.ok(fixture.foreignAssignments.every(value=>value.user_id===manifest.owners.B));
  assert.equal(mapped[0].deposit,0);assert.equal(mapped[0].subsidyAmount,null);assert.equal(mapped[1].accommodationFee,null);
  const sql=readFileSync(new URL('../../supabase/migrations/20261112060000_housing_records.sql',import.meta.url),'utf8');
  assert.match(sql,/user_id uuid not null references public\.affairs_profiles\(user_id\)/u);
  assert.match(sql,/period_id uuid not null references public\.affairs_housing_periods\(id\)/u);
  assert.match(sql,/unique\(user_id,period_id\)/u);assert.match(sql,/source_mode='local_demo'/u);
  assert.deepEqual(manifest.proposedReadContract.forbiddenReads,['affairs_housing_applications','private.affairs_housing_operations','affairs_initialize_account','dtm_initialize_account']);
});

test('record-scoped field oracle rejects swapped bed, period, fee and contradictory fields',()=>{
  pass(find('owned-beds'),bedAnswer);pass(find('fees-null-zero'),feeAnswer);
  for(const answer of [bedAnswer.replace('Dormitory: QA East Hall','Dormitory: QA West Hall'),bedAnswer.replace('Academic year: 115','Academic year: 114'),
    bedAnswer.replace('Bunk: upper','Bunk: lower'),bedAnswer+'\n- QA-A-305\n  Bunk: lower'])fail(find('owned-beds'),answer,'fact.');
  for(const answer of [feeAnswer.replace('Deposit: 0','Deposit: 1200.5'),feeAnswer.replace('Subsidy: not recorded','Subsidy: 0'),
    feeAnswer.replace('Accommodation fee: not recorded','Accommodation fee: 0'),feeAnswer.replace('Accommodation fee: 8500.25','Accommodation fee: 8500.25 or 999'),
    feeAnswer.replace('Accommodation fee: 8500.25','Accommodation fee: 8500.25 USD')])fail(find('fees-null-zero'),answer,'fact.');
});

test('empty, failed lookup and missing parent metadata remain independent states',()=>{
  pass(find('empty'),'No bed assignments recorded. No saved local records were found. This is local_demo data.');
  pass(find('read-failure'),'The housing records could not be read. I cannot infer that no records exist.');
  fail(find('read-failure'),'The housing records could not be read, so no records are saved.','evidence.boundary.');
  fail(find('empty'),'No saved bed records exist; you have never lived in a dormitory.');
  const missing=find('period-unavailable');
  pass(missing,'Saved local_demo housing record. Period metadata is unavailable.\n- QA-A-305\n  Dormitory: QA East Hall\n  Academic year: unknown\n  Semester: unknown');
  fail(missing,'Saved local_demo housing record. Period metadata is unavailable.\n- QA-A-305\n  Dormitory: QA East Hall\n  Academic year: 115\n  Semester: 1');
  const observationMismatch=observation(missing);observationMismatch.sourceRead.housing.complete=true;
  assert.equal(grade(missing,'Unknown.',observationMismatch).failures.some(item=>item.id==='housing.observation'),true);
});

test('both mixed-clause orders require separate next-class or charge evidence and both answers',()=>{
  const next=buildPublishedNextClassExpectation({now:manifest.asOf}).next;
  assert.equal(next.title,'Digital Learning Basics');assert.equal(next.date,'2026-11-18');assert.equal(next.startsAt,'13:00:00');
  const answer='Saved local_demo bed QA-A-305; dormitory: QA East Hall.\n- '+next.title+'\n  Date: '+next.date+'\n  Start time: 13:00\n  Room: Sample Room 203';
  for(const suffix of ['next-class','next-class-reversed']){
    const row=find(suffix);pass(row,answer);fail(row,'Saved local_demo bed QA-A-305; dormitory: QA East Hall.','fact.');
    fail(row,answer.replace('2026-11-18','2026-11-17'),'fact.');
    const missing=envelope(row,answer);missing.events=missing.events.filter(event=>!event.kind.includes('courses'));
    assert.equal(gradeHousingBedNativeCase(row,missing,{observation:observation(row)}).passed,false);
  }
  const balance='Saved local_demo bed QA-A-305; dormitory: QA East Hall.\n- QA Tuition Balance\n  Remaining balance: 23000';
  for(const suffix of ['balance','balance-reversed']){pass(find(suffix),balance);fail(find(suffix),balance.replace('23000','0'),'fact.');}
});

test('owner, selected sources, literal data and no-write observations cannot be fabricated by the answer',()=>{
  const row=find('owned-beds');
  for(const change of [seen=>{seen.sourceRead.ownerId=manifest.owners.B;},seen=>{seen.sourceRead.tools.push('assignments');},
    seen=>{seen.sourceRead.housing.records[0].deposit=99;},seen=>{seen.sourceRead.housing.total=999;},
    seen=>{seen.writes.push('submit_housing_application');},seen=>{seen.storage.push('report.pdf');},seen=>{seen.publicResearch.push('school search');}]){
    const seen=observation(row);change(seen);assert.equal(grade(row,bedAnswer,seen).passed,false);
  }
  assert.equal(gradeHousingBedNativeCase(row,envelope(row,bedAnswer)).passed,false);
  const foreign=envelope(row,bedAnswer);foreign.body.views=[{title:'Bed history',rows:[['FOREIGN-H-999']]}];
  assert.equal(gradeHousingBedNativeCase(row,foreign,{observation:observation(row)}).passed,false);
});

test('foreign, explicitly excluded, anonymous and unsupported action cases authorize no housing read',()=>{
  for(const suffix of ['foreign-name','foreign-id','foreign-chinese']){
    const row=find(suffix);pass(row,'I can only access your own signed-in account and cannot access another student’s housing records.');
    fail(row,'I can only access your own signed-in account. Their bed is QA-A-305.');
    const seen=observation(row);seen.sourceRead.tools=['housing'];assert.equal(grade(row,'I cannot access that account.',seen).passed,false);
  }
  pass(find('exclude-all'),'I did not read your housing records.');
  pass(find('exclude-beds-balance'),'I did not read your housing records.\n- QA Tuition Balance\n  Remaining balance: 23000');
  pass(find('stale-followup'),'Your latest question was about tuition.\n- QA Tuition Balance\n  Remaining balance: 23000');
  pass(find('anonymous'),'Sign in to access your account.');
  pass(find('change-bed'),'I cannot change your bed through this read-only assistant.');
  fail(find('change-bed'),'I cannot change your bed. I moved you.');
});

test('local fee and term metadata do not establish payment or current residence',()=>{
  pass(find('payment-proof'),'Saved local_demo record QA-A-305; deposit: 0. This does not confirm payment.');
  fail(find('payment-proof'),'Saved local_demo record QA-A-305; deposit: 0. This does not confirm payment. Payment is complete.','evidence.boundary.');
  pass(find('current-not-inferred'),'These local_demo records do not establish current residence. I cannot verify that you currently live there.');
  fail(find('current-not-inferred'),'The local_demo records do not establish current residence. Your current residence is QA East Hall.');
  for(const assertion of ['You live in QA East Hall now.','You currently reside in QA East Hall.','You are living in QA East Hall.','你目前住在QA East Hall。'])fail(find('current-not-inferred'),'These local_demo records do not establish current residence. I cannot verify that you currently live there. '+assertion,'housing.currentResidence');
  const row=find('current-not-inferred'),out=envelope(row,'These local_demo records do not establish current residence. I cannot verify that you currently live there.');
  out.body.views=[{title:'Housing',columns:['Current residence'],rows:[['QA East Hall']]}];
  assert.ok(gradeHousingBedNativeCase(row,out,{observation:observation(row)}).failures.some(failure=>failure.id==='housing.currentResidence'));
});

test('every read case reaches the real selector and strict reader with independently planned selected fields',async()=>{
  const account={url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN',user:{id:manifest.owners.A}};
  for(const row of cases){
    if(!row.observationExpectation.housing)continue;
    const fixture=housingBedNativeFixtureForCase(row),selection=housingBedLookupContext(row.question,row.route,row.history).selection;
    assert.equal(selection?.reason,null,row.id);assert.deepEqual(selection.fields,row.observationExpectation.housing.fields,row.id);
    const calls=[];
    const result=await readHousingBedEvidence(account,{fields:selection.fields,term:selection.term},{fetchImpl:async(input,init)=>{
      const url=new URL(String(input));calls.push(url);assert.equal(init?.method,'GET');assert.equal(init?.body,undefined);
      if(fixture.transportFailure)return new Response(null,{status:503});
      const isAssignment=url.pathname.endsWith('/affairs_housing_assignments');
      assert.ok(isAssignment||url.pathname.endsWith('/affairs_housing_periods'));
      if(isAssignment)assert.equal(url.searchParams.get('user_id'),'eq.'+manifest.owners.A);
      const keys=url.searchParams.get('select').split(',');
      const rows=(isAssignment?fixture.assignments:fixture.periods.filter(parent=>url.searchParams.get('id').includes(parent.id)))
        .map(value=>Object.fromEntries(keys.map(key=>[key,value[key]])));
      return Response.json(rows,{headers:{'content-range':rows.length?`0-${rows.length-1}/${rows.length}`:'*/0'}});
    }});
    const data=JSON.parse(result.evidence.content),expected=row.observationExpectation.housing;
    assert.deepEqual({ownerId:manifest.owners.A,state:data.readState,total:data.counts.matching,complete:data.complete,fields:data.selection.fields,records:data.records},expected,row.id);
    const columnMap={dormitory:'dormitory',bunk:'bunk',accommodationFee:'accommodation_fee',deposit:'deposit',subsidyAmount:'subsidy_amount'};
    assert.deepEqual(calls[0].searchParams.get('select').split(','),['id','user_id','period_id','bed_number','version',...expected.fields.flatMap(key=>columnMap[key]?[columnMap[key]]:[])],row.id);
  }
});
