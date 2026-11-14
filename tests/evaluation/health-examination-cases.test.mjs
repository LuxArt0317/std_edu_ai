import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildHealthExaminationCases,buildPlannedHealthExaminationCases,healthExaminationCaseManifest,healthExaminationFixtureForCase,gradeHealthExaminationCase} from './health-examination-cases.mjs';
import {buildServiceCases,serviceCapabilities,serviceNoteFixture} from './service-cases.mjs';
import {buildPlannedFeeRemissionCases} from './fee-remission-cases.mjs';
import {gradeCase} from './grading.mjs';
import {healthExaminationFixtureManifest,healthExaminationFixtureCaseBinding,buildHealthExaminationFixturePlan,healthExaminationFixtureReadContract} from './health-examination-fixture-plan.mjs';
import {formatSupplementalAccountAnswers} from '../../server/supplementalAccountAnswers.js';
import {readHealthExaminationEvidence} from '../../server/accountHealthExaminationEvidence.js';
import {selectHealthExaminationEvidence} from '../../server/healthExaminationEvidenceIntent.js';

const cases=buildHealthExaminationCases(),manifest=healthExaminationCaseManifest,path=manifest.route;
const find=suffix=>cases.find(row=>row.id==='account:health-examinations-'+suffix);
const copy=value=>structuredClone(value);
async function observe(testCase){
  const fixture=healthExaminationFixtureForCase(testCase),observation={readCalls:0,queries:[],storageRequests:[],writeRequests:[],result:null};
  const selected=selectHealthExaminationEvidence(testCase.question,testCase.route,testCase.history||[]);
  if(selected===null)return observation;
  const account=testCase.fixtureKey==='anonymous'?{}:{url:'https://xiftudmvxphxcjtmfmib.supabase.co',key:'OFFLINE_KEY',token:'OFFLINE_TOKEN',user:{id:fixture.owner}};
  observation.result=await readHealthExaminationEvidence(account,{question:testCase.question,route:testCase.route,history:testCase.history||[]},{read:async(caller,query)=>{
    observation.readCalls++;observation.queries.push(copy(query));assert.equal(caller.user.id,fixture.owner);
    assert.deepEqual(Object.keys(query).sort(),['page','scope']);
    if(fixture.error)throw Object.assign(new Error('PRIVATE PROVIDER DETAIL'),fixture.error);
    const rows=copy(fixture.rows).slice((Number(query.page)-1)*25,Number(query.page)*25);
    if(fixture.malformed)rows[0].report_available='false';
    return {userId:fixture.wrongOwner?fixture.foreignOwner:fixture.owner,total:fixture.rows.length,rows};
  }});
  return observation;
}
function response(testCase,answer,{tools=testCase.expected.requiredAttemptedTools,status=testCase.expected.behavior==='clarify'?'clarification':'answered'}={}){
  return {statusCode:testCase.expected.expectedStatusCode??200,fixtureKey:testCase.fixtureKey,execution:'deterministic',events:tools.map(name=>({kind:'account-read:'+name+':1',status:testCase.expected.toolTerminalStates[name][0]})),
    body:{status,answer,citations:testCase.expected.requiredSourceBindings.map(({sourceId,url})=>({chunkId:sourceId,url})),verification:{status:'verified',attempts:1}}};
}
const group=(name,flag=false)=>`- Examination code: ${name}\n  - Report available: ${flag?'true':'false'}`;
const local='These are saved local health-examination metadata. Clinical report content is unavailable. No report was downloaded or opened.';
const link=(page=1)=>`[Open saved health records](${path+(page>1?'?page='+page:'')})`;
const normalAnswer=`${local}\nTotal saved records: 3\nPage: 1\nReturned records: 3\n${[1,2,3].map(n=>group('QA HEALTH A-0'+n)).join('\n')}\n${link()}`;

test('independent packet declares26 stable cases and19 unmounted metadata plans with separate charge dependencies',()=>{
  assert.equal(cases.length,26);assert.equal(new Set(cases.map(row=>row.id)).size,26);
  const planned=buildPlannedHealthExaminationCases();assert.equal(planned.length,19);
  assert.deepEqual(planned.map(row=>row.id).sort(),[...manifest.eligibleCaseIds].sort());
  assert.deepEqual(cases.filter(row=>!manifest.eligibleCaseIds.includes(row.id)).map(row=>row.id).sort(),[...manifest.offlineOnlyCaseIds].sort());
  assert.ok(planned.every(row=>row.capability.gap===true&&row.plannedFixture.mounted===false&&row.plannedFixture.requiresNoStorageProof===true));
  assert.equal(manifest.liveAcceptance,false);
  for(const row of planned){
    assert.equal(row.plannedFixture.requiresAdditionalFixtures.includes('charges'),row.expected.allowedTools.includes('charges'));
    const original=find(row.id.slice('account:health-examinations-'.length));
    assert.ok(healthExaminationFixtureForCase(original).rows.every(record=>record.report_available===false));
  }
  assert.equal(planned.find(row=>row.id.endsWith('-anonymous')).fixtureKey,'anonymous');
});

test('36-1 uses planned native metadata oracles without changing the fee bank or service denominator',()=>{
  const services=buildServiceCases(),health=services.filter(row=>row.serviceId==='36-1');
  assert.equal(health.length,4);assert.equal(services.length,376);assert.equal(serviceCapabilities['36-1'].domain,'healthExaminations');
  assert.throws(()=>serviceNoteFixture('36-1'),/does not use a generic note/);
  assert.ok(health.slice(1).every(row=>row.fixtureRequirement==='native_health_metadata_planned'&&row.capability.gap));
  const fee=buildPlannedFeeRemissionCases();
  for(const [suffix,mode]of [['historical-period','record'],['empty','empty'],['write-boundary','action-boundary']]){
    assert.deepEqual(services.find(row=>row.id===`service:21-3:${mode}`).expected,fee.find(row=>row.id==='account:fee-remission-'+suffix).expected);
  }
});

test('all26 native controls verify exact query, own metadata projection and denied/failure distinctions offline',async()=>{
  const original=globalThis.fetch;let unexpected=0;
  globalThis.fetch=async()=>{unexpected++;throw new Error('No network or Storage is allowed in this test.');};
  try{
    for(const testCase of cases){
      const observation=await observe(testCase);
      const result=gradeHealthExaminationCase(testCase,response(testCase,''),{observation});
      const native=result.checks.filter(row=>row.id.startsWith('health.')&&!['health.noStorageOutput','health.noFileActivity','health.exactPageLinks','health.noClinicalClaims','health.noDownloadClaims'].includes(row.id));
      assert.deepEqual(native.filter(row=>!row.passed),[],testCase.id);
    }
    assert.equal(unexpected,0);
  }finally{globalThis.fetch=original;}
});

test('own metadata answer passes only with literal per-code availability and actual source/tool binding',async()=>{
  const testCase=find('metadata'),observation=await observe(testCase),envelope=response(testCase,normalAnswer);
  assert.equal(gradeHealthExaminationCase(testCase,envelope,{observation}).passed,true);
  for(const mutate of [body=>{body.answer=body.answer.replace('Total saved records: 3','Total saved records: 30');},
    body=>{body.answer=body.answer.replace('Report available: false','Report available: true');},
    body=>{body.answer=body.answer.replace('Report available: false','Report available: false true');},
    body=>{body.answer=body.answer.replace('QA HEALTH A-02','OTHER HEALTH CODE');},
    body=>{body.citations[0].url='/school-affairs/services/35-1';},body=>{body.citations=[];},body=>{body.answer+='\nYour blood results are normal.';},body=>{body.answer+='\nI downloaded your health report.';}]){
    const changed=copy(envelope);mutate(changed.body);assert.equal(gradeHealthExaminationCase(testCase,changed,{observation}).passed,false);
  }
  const noRead=copy(envelope);noRead.events=[];assert.equal(gradeHealthExaminationCase(testCase,noRead,{observation}).passed,false);
});

test('page2 and empty later page have exact links and cannot substitute a zero collection or another page',()=>{
  const second=find('page-two'),later=find('empty-later-page');
  const secondAnswer=`${local}\nTotal saved records: 26\nPage: 2\nReturned records: 1\n${group('QA HEALTH PAGE 26')}\nOther pages remain outside this lookup.\n${link(2)}`;
  assert.equal(gradeCase(second,response(second,secondAnswer)).passed,true);
  const laterAnswer=`${local}\nTotal saved records: 26\nPage: 3\nReturned records: 0\nNo records on the selected page. Other saved records remain; an empty page is not an empty collection.\n${link(3)}`;
  assert.equal(gradeCase(later,response(later,laterAnswer)).passed,true);
  for(const wrong of [laterAnswer.replace('Total saved records: 26','Total saved records: 0'),laterAnswer+'\nYou have no health records.',laterAnswer.replace('?page=3','?page=2')])
    assert.equal(gradeCase(later,response(later,wrong)).passed,false);
  assert.equal(gradeCase(second,response(second,secondAnswer.replace('QA HEALTH PAGE 26','QA HEALTH PAGE 01'))).passed,false);
});

test('availability cannot become clinical interpretation or a downloaded report',()=>{
  const clinical=find('report-unavailable'),document=find('report-available');
  assert.equal(gradeCase(clinical,response(clinical,normalAnswer)).passed,true);
  for(const claim of ['Your blood results are normal.','You are healthy.'])assert.equal(gradeCase(clinical,response(clinical,normalAnswer+'\n'+claim)).passed,false);
  const documentAnswer=normalAnswer.replace(group('QA HEALTH A-01'),group('QA HEALTH A-01',true));
  assert.equal(gradeCase(document,response(document,documentAnswer)).passed,true);
  for(const claim of ['I downloaded your health report.','Download complete.'])assert.equal(gradeCase(document,response(document,documentAnswer+'\n'+claim)).passed,false);
});

test('private identity, foreign rows, signed URLs and file activity fail even when factual prose is correct',()=>{
  const testCase=find('metadata'),base=response(testCase,normalAnswer);
  for(const mutate of [value=>{value.body.views=[{title:'Private identity',rows:[['PRIVATE HEALTH NAME A']]}];},
    value=>{value.body.answer+='\nFOREIGN HEALTH METADATA';},value=>{value.body.download={url:'https://project.invalid/storage/v1/object/sign/affairs-health-reports/x.pdf?token=secret'};},
    value=>{value.body.views=[{url:path+'?token=secret'}];},
    value=>{value.body.views=[{title:'Your blood results are normal.',rows:[['Diagnosis','diabetes']]}];},
    value=>{value.body.views=[{title:'Health results',rows:[['Diagnosis','diabetes']]}];},
    value=>{value.body.views=[{title:'Downloaded health report',rows:[['Result','I downloaded your health report.']]}];},
    value=>{value.body.citations[0].claim='Your blood results are normal.';},value=>{value.events.push({kind:'storage:download-report',status:'complete'});}]){
    const changed=copy(base);mutate(changed);assert.equal(gradeCase(testCase,changed).passed,false);
  }
});

test('native observation is mandatory and cannot hide storage, writes, foreign rows or wrong pages',async()=>{
  const testCase=find('metadata'),observation=await observe(testCase),envelope=response(testCase,normalAnswer);
  assert.equal(gradeHealthExaminationCase(testCase,envelope).passed,false);
  for(const mutate of [value=>{value.storageRequests.push('/storage/v1/object/sign/x');},value=>{value.writeRequests.push('update');},
    value=>{value.readCalls=2;},value=>{value.queries[0].page='2';},value=>{value.queries[0].user_id=manifest.owners.B;},
    value=>{const payload=JSON.parse(value.result.evidence.content);payload.records[0].student_name='PRIVATE HEALTH NAME A';value.result.evidence.content=JSON.stringify(payload);},
    value=>{const payload=JSON.parse(value.result.evidence.content);payload.records[0].reportAvailable=true;value.result.evidence.content=JSON.stringify(payload);}]){
    const changed=copy(observation);mutate(changed);assert.equal(gradeHealthExaminationCase(testCase,envelope,{observation:changed}).passed,false);
  }
});

test('mixed questions require separate tuition facts/tools and cannot infer them from health metadata',()=>{
  const mixed=find('mixed-tuition'),answer=normalAnswer+`\nSeparate sample charge ledger:\n- QA Health Tuition instalment\n  - Remaining: 23,000\n  - Currency: TWD\n[Pending payments](/school-affairs/services/39-1)`;
  const envelope=response(mixed,answer);assert.equal(gradeCase(mixed,envelope).passed,true);
  for(const mutate of [value=>{value.body.answer=value.body.answer.replace('23,000','26');},value=>{value.events=value.events.filter(row=>!row.kind.includes('charges'));},
    value=>{value.body.citations=value.body.citations.filter(row=>row.chunkId!=='account:charges');}]){
    const changed=copy(envelope);mutate(changed);assert.equal(gradeCase(mixed,changed).passed,false);
  }
  const excluded=find('negative-health'),onlyCharges=response(excluded,answer.slice(answer.indexOf('Separate sample')));
  assert.equal(gradeCase(excluded,onlyCharges).passed,true);
  onlyCharges.events.push({kind:'account-read:healthExaminations:1',status:'complete'});
  assert.equal(gradeCase(excluded,onlyCharges).passed,false);
});

test('failed metadata remains unavailable rather than empty; foreign and anonymous do not execute readers',()=>{
  const failed=find('read-unavailable'),answer=`The health metadata lookup failed. Whether any saved records exist is unknown. I cannot infer whether the collection is empty from this failed read.\n${link()}`;
  assert.equal(gradeCase(failed,response(failed,answer)).passed,true);
  assert.equal(gradeCase(failed,response(failed,answer+'\nNo records were returned; you have no records.')).passed,false);
  const foreign=find('foreign-account'),denied=response(foreign,'I can only access your own account. I cannot show another student’s health records.',{status:'handoff'});
  assert.equal(gradeCase(foreign,denied).passed,true);
  denied.events.push({kind:'account-read:healthExaminations:1',status:'complete'});assert.equal(gradeCase(foreign,denied).passed,false);
  const guest=find('anonymous'),guestResponse=response(guest,'Authentication is required.',{status:'handoff'});
  assert.equal(gradeCase(guest,guestResponse).passed,true);guestResponse.statusCode=200;assert.equal(gradeCase(guest,guestResponse).passed,false);
});


test('independent one-table fixture plan matches planned codes/pages and refuses to claim a compound charge fixture',()=>{
  const planned=buildPlannedHealthExaminationCases(),runId='81000000-0000-4000-8000-000000000001';
  const owners={A:{id:manifest.owners.A,email:'health.a@example.invalid',runMarker:runId},B:{id:manifest.owners.B,email:'health.b@example.invalid',runMarker:runId}};
  assert.deepEqual([...healthExaminationFixtureManifest.plannedCaseIds].sort(),planned.map(row=>row.id).sort());
  for(const row of planned){
    const binding=healthExaminationFixtureCaseBinding(row);
    assert.equal(binding.fixtureKey,row.plannedFixture.family);
    assert.deepEqual(binding.requiresAdditionalFixtures,row.plannedFixture.requiresAdditionalFixtures);
    const original=cases.find(item=>item.id===row.id),f=healthExaminationFixtureForCase(original);
    const plan=buildHealthExaminationFixturePlan({runId,owners,fixtureKey:binding.fixtureKey});
    const page=original.nativeExpectation.page,native=healthExaminationFixtureReadContract(plan,{role:'A',page}).expected;
    assert.equal(native.total,f.rows.length);
    const independent=f.rows.slice((page-1)*25,page*25).map(({id:_id,...cells})=>cells);
    assert.deepEqual(native.rows.map(({id:_id,...cells})=>cells),independent);
    assert.deepEqual(Object.keys(plan.rows),['affairs_health_examinations']);
  }
  assert.equal(healthExaminationFixtureManifest.metadataOnlyCaseIds.length,16);
  assert.equal(healthExaminationFixtureManifest.compoundCaseIds.length,3);
});

test('actual formatter agrees with independent native facts and literal privacy boundaries without claiming model verification',async()=>{
  const skipped=['mixed-tuition','mixed-reversed','mixed-health-unavailable','mixed-charges-unavailable','negative-health','foreign-account','anonymous'];
  for(const testCase of cases.filter(row=>!skipped.some(suffix=>row.id==='account:health-examinations-'+suffix))){
    const observation=await observe(testCase),body=formatSupplementalAccountAnswers([observation.result],{question:testCase.question});
    const envelope=response(testCase,'');envelope.body=body;
    // Graph verification and final clarification status are separate live-model
    // contracts. This checks only the native formatter's independent assertions.
    const grade=gradeCase(testCase,envelope),failures=grade.failures.filter(row=>!['answer.verification','answer.behavior'].includes(row.id));
    assert.deepEqual(failures,[],testCase.id);
    if(testCase.expected.evidenceBoundaries?.includes('health_failed_read_not_empty')){
      for(const unsupported of ['No saved health records exist.','No medical examination records were returned.']){
        const changed=copy(envelope);changed.body.answer+='\n'+unsupported;
        assert.ok(gradeCase(testCase,changed).failures.some(row=>row.id==='evidence.boundary.0'),testCase.id+': '+unsupported);
      }
    }
  }
});
